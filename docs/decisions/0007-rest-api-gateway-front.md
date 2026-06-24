---
status: accepted
date: 2026-06-01
deciders: project team
---

# 7. API Gateway (REST API v1) as the single same-origin front

## Context and Problem Statement

[ADR 0006](0006-localstack-dev-and-function-url-ssr.md) put the SSR Lambda behind a
**Function URL** and used **CloudFront** (real AWS only) to route static→S3 and
SSR→Lambda. Two things have since changed the requirements:

- We will add **server actions** (POST endpoints) and likely **more than one SSR
  endpoint**, so a real router across multiple origins is now mandatory, not optional.
- We want that router to be **emulated locally** so routing is testable — the gap ADR
  0006 accepted for CloudFront.

So we need a single front that routes static + multiple dynamic surfaces and runs in
LocalStack. Users are **not** regionally distributed, so a global CDN's edge is low value.

## Decision Drivers

- Local testability of the routing layer (CloudFront is LocalStack Pro-only).
- One **same-origin** host for SSR + actions (clean cookies/CSRF).
- Keep the static bucket **private**.
- Minimal, stable, AWS-native choices (see [project constraints]).

## Considered Options

- **CloudFront** — not emulated in LocalStack Community; keeps the local blind spot.
- **HTTP API (API Gateway v2)** — cheap, payload v2 (matches the old bridge), but
  **`apigatewayv2` is LocalStack Pro-only** — so it can't be tested locally on Community.
- **REST API (API Gateway v1)** — in LocalStack **Community**, and has a native **S3 proxy
  integration** (serves a private bucket via an IAM role). Payload v1, so the SSR bridge
  changes.

## Decision Outcome

**REST API (API Gateway v1) as the single front, in both LocalStack and real AWS; drop
CloudFront and the Function URL.**

- **Routing:** `/ssr`, `/ssr/{proxy+}`, `/_actions/{proxy+}` → the SSR Lambda
  (proxy integration); `/` and `/{proxy+}` → the **private** S3 bucket via an
  `AwsIntegration` using an API-Gateway IAM role. `binaryMediaTypes: ['*/*']` so
  base64 Lambda/S3 payloads round-trip as bytes.
- **One SSR Lambda** handles both on-demand pages **and** server actions — Astro Actions
  are dispatched by the same server handler (`/_actions/*`), not a separate deployable.
  Split later only for differing runtime needs (same bundle, second function).
- **Bridge moved to payload v1** (`web-app/src/lambda/entry.ts`): `httpMethod` / `path` /
  `multiValueHeaders` / `multiValueQueryStringParameters` instead of the v2 shape. The
  Astro handler is unchanged; only the event↔request shim differs.
- **CloudFront removed.** No regional spread, and a single uniform front (no `isLocal`
  divergence for routing) is worth more than edge caching here. CloudFront can be added
  *in front of* API Gateway later if global caching/edge becomes necessary.

### Consequences

- Good, because the front is now **identical and testable locally** — verified end-to-end
  on LocalStack Community (static via S3 proxy, SSR, `/_actions/*` routing, worker path).
- Good, because the static bucket stays **private** (API Gateway reads it via IAM).
- Good, because SSR + actions share one origin.
- Bad/accepted, because REST API is heavier and slightly costlier per request than HTTP
  API, and we own a v1 event↔request shim — both acceptable, and v1 aligns with the
  project's preference for mature, fully-supported services. (No AWS deprecation of REST
  API is announced; HTTP API is not a feature superset.)
- Constraint: REST API URLs carry a **stage path** (`/prod/…`). Prerendered asset links
  are absolute (`/_astro/*`), so a real deployment needs a **custom domain mapped to the
  stage root** (and/or an Astro `base`) so assets resolve. Tracked as a follow-up.
- Local static upload: `BucketDeployment` (a custom-resource Lambda) runs on real AWS;
  locally the Makefile `aws s3 sync`s `dist/client` into the bucket.

## More Information

Supersedes the **SSR-origin** (Function URL) and **CloudFront** parts of
[ADR 0006](0006-localstack-dev-and-function-url-ssr.md); the rest of 0006 (LocalStack +
`cdklocal`, Astro `@astrojs/node` + bridge) still holds. See
[Current architecture](../architecture/infrastructure.md),
[Local architecture](../architecture/local-emulation.md), and
[the local-development guide](../guides/local-development.md). Still open: the custom-domain
/ stage-root mapping, and the dev/staging/prod account strategy.
