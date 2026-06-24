---
status: accepted
date: 2026-06-14
deciders: project team
---

# 10. Cache-Control for static assets served through API Gateway

## Context and Problem Statement

Static assets (`index.html`, `/_astro/*`, favicons, `regions.json`) are served
from a private S3 bucket through the API Gateway REST front ([ADR 0007](0007-rest-api-gateway-front.md)).
The S3 integration forwarded only `Content-Type` and `Content-Length` — **no
`Cache-Control`, `ETag`, or `Last-Modified`**. With no cache directives, browsers
fall back to *heuristic caching* and may reuse `index.html` without revalidating.

Because `/_astro/*` filenames are content-hashed and every deploy prunes the old
hashes (`aws s3 sync --delete` locally; CDK `BucketDeployment` prune on AWS), a
heuristically-cached `index.html` can point at a hashed stylesheet that **no longer
exists** → the only CSS file 404s → the page renders unstyled (no theme colours,
square buttons). It reproduced on `staged.timetracker.test` whenever the browser
cache was enabled and cleared only by disabling the cache; `live` (the dev server)
was unaffected because it never serves cacheable responses. The same code path runs
on real AWS, so this was a latent production bug, not a local-only artifact.

## Decision Drivers

- Correctness: a returning visitor must never get HTML that references a pruned asset.
- One mechanism that fixes both the LocalStack (`staged`) and real-AWS paths.
- Cache hashed assets aggressively (they are immutable by construction).
- Minimal moving parts; no new infrastructure.

## Considered Options

- **A. Set `Cache-Control` as a static literal in the API Gateway integration
  responses**, split by route (revalidate vs immutable).
- **B. Pass `Cache-Control` through from S3 object metadata**, set at upload time
  (BucketDeployment `cacheControl` on AWS, `aws s3 sync --cache-control` locally).
- **C. Stop hashing asset names / disable pruning** so stale references still resolve.

## Decision Outcome

Chosen option: **B** — `Cache-Control` is stored as S3 object metadata and **passed
through** by API Gateway, exactly like `Content-Type`/`Content-Length`.

Option A (a static-literal value in the API Gateway integration response) was
implemented first and rejected: **LocalStack's API Gateway rejects the literal** —
it breaks the 200 output mapping (`API_CONFIGURATION_ERROR`, every static route 500s).
Because `staged` runs on LocalStack and exists precisely to mirror prod, a fix that
only works on real AWS is unacceptable. Passthrough works on both.

The metadata is set at upload time, in two tiers, in both environments:

- **`index.html`, favicons, `regions.json` (unhashed)** → `no-cache` — always
  revalidated, so the browser can never serve HTML that references a pruned asset.
- **`/_astro/*` (content-hashed)** → `public, max-age=31536000, immutable` — cached
  forever; a content change yields a new filename.

Implemented as two passes to avoid prune conflicts between the tiers:
`make sync-static` (`infrastructure/.. ` → `Makefile`) for LocalStack, and a pair of
`BucketDeployment`s (`infrastructure/component/static-assets.ts`) for real AWS.

### Consequences

- Good, because the unstyled-after-deploy bug is fixed in both environments by one
  mechanism that LocalStack actually supports.
- Good, because hashed assets are now cached long-term (fewer requests, faster loads).
- Neutral, because `no-cache` HTML is re-fetched each visit; the documents are small
  (~6 KB) and we emit no `ETag`, so revalidation cannot 304 — acceptable for now.
- Bad/accepted, because the policy lives at the upload layer in two places (the
  `sync-static` target and the `BucketDeployment`s) that must stay in step; there is
  no single literal to read it off. Passthrough also means a static object served
  without `Cache-Control` metadata gets none — both upload paths set it on every file.

### Operational note (LocalStack)

Changing the API definition (as this ADR's first attempt did) trips a second
LocalStack limitation: `AWS::ApiGateway::Stage` **updates are not implemented**, so
`cdklocal deploy` can leave the pinned API (`_custom_id_=timetracker`) **stageless**
(every route 404s: *"does not correspond to a deployed API Gateway API"*). Recover
without wiping state via `aws apigateway create-deployment --rest-api-id timetracker
--stage-name prod`, or do a clean `make down && make up && make deploy`.

## Pros and Cons of the Options

### A. Static literal in API Gateway (rejected)

- Good, because it is independent of the upload tool, and routing already
  distinguishes the hashed vs unhashed paths.
- Bad, **decisive**: LocalStack's API Gateway rejects the literal value and 500s
  every static route, so it cannot be verified on `staged` — the environment that
  exists to mirror prod.

### B. Pass through from S3 metadata (chosen)

- Good, because it reuses the proven `Content-Type`/`Content-Length` passthrough that
  already works on both LocalStack and AWS.
- Good, because the object is the single source of truth for its own cache policy.
- Bad, because both upload paths (`sync-static`, `BucketDeployment`) must set the
  metadata and stay in step.

### C. Stop hashing / disable pruning

- Good, because stale references would still resolve.
- Bad, because it discards cache-busting and grows the bucket unbounded; treats the
  symptom, not the cause.

## Follow-up: inlined stylesheets to kill navigation FOUC

Verifying the cache fix surfaced a related, pre-existing rendering bug. Astro builds
static pages (the prerendered home page) and on-demand SSR pages (`prerender = false`)
in **separate passes**, and each pass emitted its own **byte-identical** external CSS
under a different name (`index.*.css` vs `Layout.*.css`). Browser caches key on URL,
so navigating between a static and an SSR page re-downloaded the same stylesheet under
a new URL — a render-blocking cache miss that produced a flash of unstyled content
(missing colours, square buttons) on slow networks and a flicker on every such page
swap. `vite.build.cssCodeSplit = false` did not fix it (Astro manages CSS emission and
splits across the static/SSR boundary regardless).

Resolved by **`build.inlineStylesheets: 'always'`** in `astro.config.mjs`: the single
small global stylesheet is inlined into every page's HTML, so there is no external CSS
request to miss or re-download — styles always arrive with the document. Consequences:
no `/_astro/*.css` objects are produced (so `sync-static` and the `BucketDeployment`
guard the now-optional `_astro/*` immutable pass), and the ~31 KB stylesheet is carried
in each `no-cache` HTML response. Acceptable for this app's small CSS; enabling response
compression (API Gateway `minimumCompressionSize`) would cut the per-response cost and
is worth considering alongside the `ETag` follow-up below.

## More Information

Builds on [ADR 0007](0007-rest-api-gateway-front.md). Implemented in
`infrastructure/component/api-front.ts`, `infrastructure/component/static-assets.ts`,
`application/web-app/astro.config.mjs`, and the `sync-static` target in `Makefile`.
Follow-up worth considering: forward `ETag`/`Last-Modified` so HTML revalidation can
return 304s, and enable API Gateway response compression.
