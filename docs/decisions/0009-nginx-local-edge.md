---
status: accepted
date: 2026-06-13
deciders: project team
---

# 9. nginx local edge for stageless dev hostnames

## Context and Problem Statement

The app is fronted by an API Gateway REST API, invoked locally at
`…execute-api.localhost.localstack.cloud:4566/prod/` — the `prod` **stage** is mandatory and
always in the path. But the built site references assets and nav links as root-absolute
paths (`/_astro/*`, `/login`), which omit `/prod`, so hitting the deployed URL directly
404s every asset. REST API stages can't be removed; the stageless option (HTTP API v2
`$default`) and custom-domain base-path mappings are both **LocalStack Pro** features
([ADR 0007](0007-rest-api-gateway-front.md)), so neither is available on our Community tier.

We wanted the deployed stack to be viewable in a browser locally — to exercise the real
Lambda runtime, the API-Gateway→Node bridge, cookies, and S3 static routing — without
decorating every link with a base prefix or weakening the production build.

## Decision Outcome

**Add an nginx reverse proxy as a local-only compose service** that maps two stageless
`.test` hostnames (added to `/etc/hosts` by each dev) onto the existing backends:

- **`live.timetracker.test`** → the `astro dev` server on `:4321` (HMR), for development.
- **`staged.timetracker.test`** → the deployed API Gateway stack, for verifying the deployed
  shape.

The staged server block proxies to LocalStack's path-based invoke endpoint
(`/restapis/<id>/prod/_user_request_/…`), prepending the `prod` stage so the browser sees a
stageless root. Routing is by path, so the original `Host` passes through. The REST API id
is **pinned** via LocalStack's `_custom_id_` tag (`timetracker`), so the nginx upstream is
static across deploys. No application code changes; root-absolute links resolve unchanged.

A single env toggle, **`ASTRO_LOCAL_EDGE`**, gates "local edge mode" in `astro.config.mjs`.
The Makefile sets it for both the deployed-Lambda build and the `astro dev` invocation;
it is unset everywhere else, including real-AWS builds. It governs three things:

- **Relax `checkOrigin`.** API Gateway doesn't preserve the client `Host` to the Lambda (the
  adapter falls back to its `localhost:4321` default), so Astro's host-based same-origin check
  rejects every form POST — even on the raw execute-api URL. With the toggle off, the check
  stays on; CSRF defence locally falls to the **`SameSite=Lax`** `HttpOnly` session cookie,
  which is not sent on cross-site POSTs.
- **Bind the dev server to `0.0.0.0`** (`server.host`) so the nginx container can reach it via
  `host.docker.internal` (host-gateway); a plain `astro dev` stays on localhost.
- **Allow the edge hostnames** past Vite's host check (`vite.server.allowedHosts`) — DNS-rebind
  protection otherwise rejects the proxied `*.timetracker.test` Host.

## Consequences

- Good, because the deployed stack is now **browsable locally** with working assets, nav,
  and the full login/dashboard/logout flow — no per-link base prefixing, no app changes.
- Good, because the edge is **purely local** (a compose service + Makefile env); the
  production build and CDK stack are untouched, and `checkOrigin` stays on for real AWS.
- Good, because the pinned API id keeps the nginx config **static** — no per-deploy
  re-templating.
- Bad/accepted, because devs must add two `/etc/hosts` entries and nginx binds host port 80.
- Bad/accepted, because local edge mode (the deployed Lambda build **and** the dev server) runs
  with `checkOrigin` off; this is a **local-only** relaxation, mitigated by the `SameSite=Lax`
  cookie. A real-AWS deployment fronted by API
  Gateway would need the host plumbed (e.g. a custom domain / `X-Forwarded-Host` the bridge
  honours) before re-enabling the check there — tracked if/when we deploy to AWS.
- Bad/accepted, because it depends on LocalStack specifics (`_custom_id_`, the
  `_user_request_` invoke path) that don't exist on real AWS — acceptable for a local edge.

## More Information

Builds on [ADR 0007](0007-rest-api-gateway-front.md) (REST API front, and why HTTP API v2 /
custom domains are out on Community) and [ADR 0008](0008-password-auth-on-dynamodb.md) (the
`SameSite=Lax` session cookie now carrying CSRF defence locally). See
[Local development](../guides/local-development.md). Config lives in `nginx/timetracker.conf`,
`docker-compose.yml` (the `nginx` service), `application/web-app/astro.config.mjs` (the
`ASTRO_LOCAL_EDGE` toggle), and the `Makefile` (which sets it for the build and `astro dev`).
