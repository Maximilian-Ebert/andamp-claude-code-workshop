---
name: refactor-astro-adapter
description: Replace the @astrojs/node middleware-mode bridge (application/web-app/src/lambda/entry.ts) with a custom Astro adapter built on astro/app's App.render(Request). Use when executing or scoping the SSR-adapter refactor tracked by the TODO in entry.ts.
argument-hint: "[optional: plan | implement]"
---

# Refactor: custom Astro adapter for AWS API Gateway

Goal: stop wrapping `@astrojs/node` (middleware mode) with a hand-written Node-http
shim and instead ship a **custom Astro adapter** whose `serverEntrypoint` drives
`astro/app`'s `App` directly. The adapter speaks web-standard `Request`/`Response`,
which removes the awkward double translation in
`application/web-app/src/lambda/entry.ts`.

This reverses a sub-decision in
[ADR 0006](../../docs/decisions/0006-localstack-dev-and-function-url-ssr.md)
("`@astrojs/node` + in-repo bridge"). **Land a proposed ADR before merging code.**

## Context to read first

- `application/web-app/src/lambda/entry.ts` — the current bridge (`toNodeRequest`,
  `CapturingResponse`, `toResult`) and the `TODO(adapter)` marker.
- `application/web-app/astro.config.mjs` — `adapter: node({ mode: 'middleware' })`,
  `output: 'static'`, the `ASTRO_LOCAL_EDGE` host/CSRF toggles.
- `application/web-app/build-ssr.mjs` — esbuild bundle + the `server/` + sibling
  `client/` packaging the Node adapter's static walk-up needs.
- `infrastructure/component/astro-server.ts` — `handler: 'server/index.handler'`,
  `Code.fromAsset('.../dist/lambda')`, env (`USER_TABLE_NAME`, `BUCKET`,
  `JWT_SECRET_ARN`).
- ADR 0006 and [ADR 0007](../../docs/decisions/0007-rest-api-gateway-front.md)
  (REST API front → why the event shape is API Gateway **v1**,
  `APIGatewayProxyEvent`, with `multiValueHeaders` and base64 bodies).

## Plan mode (default, or `$ARGUMENTS` = `plan`)

Produce a written plan; do not edit code. Cover:

1. **Adapter shape** — a small in-repo integration (e.g. `astro-aws-apigw/`) that
   calls `setAdapter()` with `serverEntrypoint` + `exports: ['handler']`, replacing
   `node({ mode: 'middleware' })` in `astro.config.mjs`.
2. **serverEntrypoint** — `createExports(manifest)` builds `new App(manifest)` and
   returns `handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>`:
   - `event → Request`: reconstruct URL from `path` + `multiValueQueryStringParameters`,
     fold `multiValueHeaders`, decode base64 body.
   - `await app.render(request)` → `Response`.
   - `Response → APIGatewayProxyResult`: status, headers, **`getSetCookie()` →
     `multiValueHeaders` for multiple cookies**, base64 body + `isBase64Encoded`.
3. **Static assets** — confirm whether the SSR Lambda still needs `client/`. Static
   is served by API Gateway → S3 here, so the Node adapter's walk-up may be moot;
   if so, simplify `build-ssr.mjs` to stop copying `client/`.
4. **Build + infra deltas** — new esbuild entry, what `handler`/asset path
   `astro-server.ts` points at, anything in the Makefile.
5. **Verification** — `make redeploy` then exercise `staged.timetracker.test`
   (`/ssr`, an action that sets a session cookie, a static path). The bridge only
   runs on the deployed path, never under `astro dev`.
6. **ADR** — draft `docs/decisions/0010-*` (status: proposed) superseding 0006's
   adapter sub-decision; weigh custom-adapter-API maintenance vs the deleted shim.

Surface the tradeoff honestly: this trades an ~80-line shim against a *stable* public
handler for a smaller adapter against Astro's *less-stable* internal adapter API —
which must be re-validated on every Astro major.

## Implement mode (`$ARGUMENTS` = `implement`)

Only after the ADR is drafted and the plan approved. Then:
build the adapter → swap `astro.config.mjs` → adjust `build-ssr.mjs` /
`astro-server.ts` → delete the dead shim from `entry.ts` (or remove the file if the
serverEntrypoint subsumes it) → `make redeploy` → verify on `staged.timetracker.test`
→ flip the ADR to `accepted`.
