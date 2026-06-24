---
status: accepted
date: 2026-05-29
deciders: project team
---

# 6. LocalStack-based local dev with hybrid Astro hosting (S3 + Lambda Function URL)

> **Update:** the **SSR origin (Function URL)** and **CloudFront** decisions below were
> superseded by [ADR 0007](0007-rest-api-gateway-front.md) — the synchronous front is now
> an API Gateway REST API serving a private S3 bucket + the SSR/actions Lambda. The rest of
> this ADR (LocalStack + `cdklocal`, Astro `@astrojs/node` + bridge) still holds.

## Context and Problem Statement

The runtime topology is now decided: the Astro app is **hybrid** — prerendered
pages and client assets are served from **S3**, while SSR pages and server actions
run on **Lambda**, with **CloudFront** routing by behaviour to the right origin.
`application/functions/` holds **async workers triggered by SQS**, and all server
code reads/writes **S3 and DynamoDB**. This resolves the "web hosting topology" and
"how functions are exposed" open questions in [the architecture overview](../architecture/README.md).

Two things then needed deciding: (1) what sits between CloudFront and the SSR Lambda,
and (2) how to develop against this topology locally with fast feedback.

## Decision Drivers

- High-fidelity local emulation of the real AWS services, on one source of truth.
- Fast auto-reloading inner loop for day-to-day work.
- Minimal dependency/tooling surface and stable, AWS-native choices (see [ADR 0001](0001-application-stack-astro-on-aws.md), [project constraints]).
- Keep the `application/` (pnpm) and `infrastructure/` (npm) domains cleanly separated.

## Considered Options

- **SSR origin:** Lambda **Function URL** vs **API Gateway** (HTTP API / REST API).
- **Astro on Lambda:** official `@astrojs/node` adapter + a thin bridge vs a community AWS adapter.
- **Local emulation:** **LocalStack** (Community) + `cdklocal` vs AWS SAM vs cloud-only dev.
- **CloudFront locally:** LocalStack **Pro** vs a reverse-proxy stand-in vs **excluded locally**.

## Decision Outcome

- **SSR origin = Lambda Function URL.** The only synchronous origin is the Astro
  handler (everything else is async via SQS), so API Gateway's managed-API features
  aren't needed. Function URL is leaner and cheaper; if a synchronous API surface
  emerges later, **HTTP API** is a near-drop-in (same v2 event shape).
- **Astro SSR via official `@astrojs/node` (middleware mode)** + a small in-repo
  Function-URL→Node bridge (`application/web-app/src/lambda/entry.ts`). No
  bleeding-edge community adapter.
- **LocalStack Community + `cdklocal`** deploys the *same* CDK stack locally, gated
  by `-c localstack=true`. Two loops: a **fast loop** (`astro dev` HMR + esbuild
  watch + LocalStack Lambda hot-reload for workers) and an **integration loop**
  (`cdklocal deploy` of the whole slice). The Community tier is still free but is
  **no longer tokenless** — the pinned image requires a free `LOCALSTACK_AUTH_TOKEN`
  to boot (see [Implementation notes](#implementation-notes-validated-2026-06-01)).
- **CloudFront is excluded from the local deploy** (it is LocalStack Pro-only):
  `astro dev` handles routing locally, and real CloudFront behaviour is validated in
  a staging account. The CDK stack only creates the CDN (and the S3 asset upload)
  when `!isLocal`.

### Consequences

- Good, because one CDK definition deploys to both LocalStack and real AWS.
- Good, because the inner loop is sub-second (`astro dev`) and workers hot-reload.
- Good, because the synchronous surface stays minimal (Function URL, no API Gateway).
- Neutral, because the SSR Lambda is exercised only in the integration loop (the
  fast loop is covered by `astro dev`).
- Bad/accepted, because **CloudFront routing and IAM are not validated locally**
  (CloudFront absent in Community; IAM not enforced) — these must be checked in a
  real staging account.
- Constraint: `cdklocal deploy` re-uploads Lambda assets and clobbers the worker
  hot-reload repoint, so the Makefile re-points after every (re)deploy.
- Bad/accepted, because high-fidelity LocalStack emulation turned out to need several
  non-obvious settings (auth token, region allowlist, expanded service set, S3
  virtual-host endpoint, a structure-preserving SSR Lambda package) — all captured
  below and in [the local-development guide](../guides/local-development.md) so the setup is reproducible.

## Pros and Cons of the Options

### Lambda Function URL (chosen) vs API Gateway

- Good, because fewer moving parts, no per-request cost, 15-min timeout, OAC-frontable.
- Bad, because no built-in throttling/authorizers/usage-plans — acceptable since
  there is effectively one synchronous origin.

### `@astrojs/node` + in-repo bridge (chosen) vs community adapter

- Good, because the adapter is official/mature and the bridge is ~80 lines we own.
- Bad, because we maintain the event↔request shim ourselves (covered by tests/invoke).

### LocalStack Community (chosen) vs Pro / SAM / cloud-only

- Good, because free, covers S3/Lambda/SQS/DynamoDB, and `cdklocal` reuses our CDK.
- Bad, because CloudFront needs Pro and IAM isn't enforced — mitigated by staging.
- Bad, because the Community tier now requires a free auth token (it is free but not
  zero-signup), and the deploy needed extra services + cdklocal/SSR-packaging tweaks
  to work — a one-time setup cost, now documented.

## Implementation notes (validated 2026-06-01)

The decision was validated by a full, working bring-up (`make up`/`deploy`,
SSR Function URL renders, SQS→worker→DynamoDB persists). Reaching a green state
required the following adjustments to the original assumptions — all now encoded in
`docker-compose.yml`, `.env.localstack`, the `Makefile`, and the SSR build:

- **Auth token (corrects "tokenless").** `localstack/localstack:2026.05.1` exits on
  startup without `LOCALSTACK_AUTH_TOKEN`. The free tier still costs nothing but needs
  an account + token, supplied via the gitignored `.env.localstack`.
- **Region pinned to `eu-central-1`.** `cdklocal` strips all `AWS_*` env vars except
  `AWS_ENDPOINT_URL*` and those in `AWS_ENVAR_ALLOWLIST`, otherwise defaulting to
  `us-east-1`. We allowlist `AWS_REGION,AWS_DEFAULT_REGION` so the stack, the worker
  repoint, and host-side `astro dev` all agree on one region.
- **Expanded `SERVICES`.** Beyond S3/SQS/Lambda/DynamoDB/CloudFormation/IAM/STS, the
  bring-up needs `ssm` + `ecr` (CDK bootstrap stack) and `logs` (Lambda log groups).
- **S3 endpoint.** `AWS_ENDPOINT_URL_S3=https://s3.localhost.localstack.cloud:4566`
  (cdklocal requires it when `AWS_ENDPOINT_URL` is set, and it must support
  virtual-hosted-style bucket subdomains — plain `localhost` only works path-style).
- **SSR Lambda packaging.** `@astrojs/node` resolves its client dir by walking up from
  `import.meta.url` to a `server/` path segment with a sibling `client/`. A flat esbuild
  bundle deployed to `/var/task` loses that, so the SSR Lambda is packaged as
  `dist/lambda/{server/index.mjs, client/}` with handler `server/index.handler`.
- **Build precedes bootstrap.** `cdklocal bootstrap` synthesizes the app (validating
  `fromAsset` paths), so `make up` builds assets first.

## More Information

Builds on [ADR 0005](0005-repo-wide-pnpm-workspace-and-server-only-shared.md). The
local environment is orchestrated by a root `Makefile`; see
[the local-development guide](../guides/local-development.md). Still open: dev/staging/prod account
strategy, and whether to add a reverse-proxy CloudFront stand-in or LocalStack Pro.
