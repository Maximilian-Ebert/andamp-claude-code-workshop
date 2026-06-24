# Local development (LocalStack)

Run the AWS-backed app locally against [LocalStack](https://localstack.cloud): the same
CDK stack that ships to AWS is deployed via `cdklocal`, so local mirrors production. See
[ADR 0006](../decisions/0006-localstack-dev-and-function-url-ssr.md) and
[ADR 0007](../decisions/0007-rest-api-gateway-front.md).

It all runs on your machine in Docker — the `*.localhost.localstack.cloud` hostnames
resolve to `127.0.0.1` and Lambdas run as local containers. Nothing touches real AWS
(creds are dummy `test`/`test`).

## Prerequisites

- **Docker + Docker Compose**, **AWS CLI v2**, and **Node 24** (`nvm use` reads `.nvmrc`;
  nvm is loaded from your profile at `$NVM_DIR`, i.e. `~/.nvm`).
- A free **LocalStack auth token** — sign up at
  [app.localstack.cloud](https://app.localstack.cloud) → **Workspace → Auth Token**.
- A complete **`.env.localstack`** (gitignored, so a fresh clone won't have it — create it).
  The Makefile sources this file into **every** target, so the AWS endpoint, region, and
  cdklocal allowlist all live here — not just the token. The full file:

  ```bash
  # Point the AWS SDK / CLI at LocalStack. Never used against real AWS (creds are dummy).
  AWS_ENDPOINT_URL=http://localhost:4566
  # aws-cdk-local v3 needs the S3-specific endpoint when AWS_ENDPOINT_URL is set, so CDK's
  # virtual-hosted-style asset uploads resolve (plain localhost only works path-style).
  AWS_ENDPOINT_URL_S3=https://s3.localhost.localstack.cloud:4566
  AWS_ACCESS_KEY_ID=test
  AWS_SECRET_ACCESS_KEY=test
  AWS_REGION=eu-central-1
  AWS_DEFAULT_REGION=eu-central-1
  # cdklocal strips all AWS_* vars except AWS_ENDPOINT_URL* and those allowlisted here,
  # then defaults the region to us-east-1. Without this line the stack deploys to us-east-1
  # while the CLI/repoint/astro use eu-central-1 — `make dev` then fails at `repoint` with
  # "Function not found ...:tta-worker". Allowlist the region so the deploy agrees.
  AWS_ENVAR_ALLOWLIST=AWS_REGION,AWS_DEFAULT_REGION
  LOCALSTACK=1
  # Free token from app.localstack.cloud — the image won't boot without it.
  LOCALSTACK_AUTH_TOKEN=<your-token>
  ```
- Install deps: `cd application && corepack pnpm install`.
- Add the edge hostnames to `/etc/hosts` (once): `127.0.0.1 live.timetracker.test staged.timetracker.test`.

Everything is orchestrated by the root `Makefile` (`make help` lists targets).

## The two endpoints

A local **nginx edge** (a compose service, started by `make up`) fronts both with clean,
stageless hostnames. Point them at loopback once in `/etc/hosts`:

```
127.0.0.1 live.timetracker.test staged.timetracker.test
```

| URL | Served by | For |
| --- | --- | --- |
| **http://live.timetracker.test** | the hot-reloading dev server, started by `make dev` | **developing** pages / components / SSR |
| **http://staged.timetracker.test** | the deployed stack (API Gateway → S3 static + SSR Lambda), created by `make deploy` | **verifying** the real deployed shape end-to-end |

Develop against **live**; use **staged** only to check the production-shaped path `live`
can't — the API-Gateway→Node bridge (`src/lambda/entry.ts`), the real Lambda runtime, and
the S3 static routing. Both are served by the local nginx edge, which is what makes them
work as clean root URLs ([ADR 0009](../decisions/0009-nginx-local-edge.md)).

## What auto-reloads

| You changed… | Reflected by | Manual step |
| --- | --- | --- |
| page / component / CSS | **live** instantly (Astro HMR) | `make redeploy` to refresh **staged** |
| server action (`src/actions/**`), middleware (`src/middleware.ts`), `@lib` / `@data` (`shared/*/src`) | **live**, on a ~1.5s dev-server restart (the wrapper) | `make redeploy` to refresh **staged** |
| worker handler (`functions/handlers/**`) | the worker, on save (hot-reload) | none |
| bridge (`entry.ts`) or infra (CDK / env / IAM / new resource) | nothing | `make redeploy` |

Astro's native HMR only reloads the browser for **pages, components, and CSS** — it does
**not** re-evaluate SSR-only modules (actions, middleware, `@lib`/`@data`), so the dev
server keeps the first-loaded copy in memory and edits to them would otherwise serve stale
code until a manual restart. The `dev` script wraps `astro dev` in
`scripts/dev.mjs`, which watches `src/actions/`, `src/middleware.ts`, and `shared/*/src`
and restarts the whole dev server (~1.5s) on a save. The tradeoff: that restart resets
in-flight client HMR state, whereas page/component/CSS edits still use Astro's instant
native HMR untouched. To run the bare server without the wrapper, use `pnpm dev:astro`.

The **worker** is the only hot-reloading Lambda (esbuild watch + LocalStack's `hot-reload`
bucket, wired by `make dev`); the **SSR Lambda** and **static assets** aren't, by design —
`make redeploy` rebuilds, re-syncs static to S3, and redeploys.

Rule of thumb: **`live.timetracker.test` = live editing · `staged.timetracker.test` = last deploy.**

## The feature cycle

Start everything with `make dev` (builds, starts LocalStack, deploys once, repoints the
worker, then runs the `astro dev` wrapper + the worker watch in the foreground; **Ctrl-C**
to stop). Then:

1. **Develop** against **http://live.timetracker.test** — pages/components/CSS hot-reload
   instantly; server actions, middleware, and `@lib`/`@data` reload on a ~1.5s restart. Most
   work stays here.
2. **Worker changes apply live** — trigger and check the result:
   ```bash
   set -a; source .env.localstack; set +a    # point the CLI at LocalStack
   QUEUE=$(aws cloudformation describe-stacks --stack-name ApplicationStack \
     --query "Stacks[0].Outputs[?OutputKey=='QueueUrl'].OutputValue" --output text)
   TABLE=$(aws cloudformation describe-stacks --stack-name ApplicationStack \
     --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text)
   aws sqs send-message --queue-url "$QUEUE" --message-body '{"hello":"world"}'
   aws dynamodb scan --table-name "$TABLE"    # the message should appear
   ```
3. **Verify** at a checkpoint: `make redeploy`, then hit **staged** — e.g.
   `curl http://staged.timetracker.test/ssr` and `curl http://staged.timetracker.test/` (static).
   If it diverges from **live**, the bug is in the bridge/packaging or routing, not your component.

## Commands

| Command | Does |
| --- | --- |
| `make dev` | LocalStack + deploy + `astro dev` wrapper (`scripts/dev.mjs`, :4321) + worker watch |
| `make up` / `make down` | start + bootstrap / stop + clear LocalStack |
| `make deploy` / `make redeploy` | build + deploy (redeploy also refreshes SSR + static) |
| `make endpoints` | print all stack outputs (API URL, Queue, Table, UserTable, Bucket) |
| `make seed` | seed a user into the `UserTable` (`SEED_EMAIL`/`SEED_NAME`/`SEED_PASSWORD` to override) |
| `make repoint` / `make sync-static` | re-point the worker / upload static to S3 (both run in `deploy`) |
| `make destroy` | tear down the stack |

The **`/login`** action authenticates against the `UserTable`, so it needs a user to exist
first — run **`make seed`** after `make deploy` to provision one ([ADR 0008](../decisions/0008-password-auth-on-dynamodb.md)).

## Gotchas

- **REST API, not HTTP API** — HTTP API (apigateway v2) is LocalStack Pro-only; the front
  is a REST API (v1), which is Community. See [ADR 0007](../decisions/0007-rest-api-gateway-front.md).
- **Stage path** — the raw API URL carries `/prod`, so absolute asset links (`/_astro/*`)
  404 when hit directly. The nginx edge (`staged.timetracker.test`) maps the stageless root
  onto `/prod` so they resolve; for a real deployment, use a custom domain at the stage root.
  See [ADR 0009](../decisions/0009-nginx-local-edge.md).
- **`ASTRO_LOCAL_EDGE` toggle** — the Makefile sets this for the build **and** `astro dev` to
  switch on local edge mode in `astro.config.mjs`: bind the dev server to `0.0.0.0` (so nginx
  can reach it), allow the `*.timetracker.test` hosts past Vite's host check, and relax Astro's
  `checkOrigin` (which LocalStack's API Gateway breaks by not preserving the client `Host` —
  CSRF defence falls to the `SameSite=Lax` session cookie). Unset everywhere else, including
  real-AWS builds. See [ADR 0009](../decisions/0009-nginx-local-edge.md).
- **IAM isn't enforced** in LocalStack Community — a missing grant can pass locally but fail
  on AWS. Validate grants in staging.
- **Region is `eu-central-1`** (allowlisted via `AWS_ENVAR_ALLOWLIST`; cdklocal otherwise
  defaults to `us-east-1`). If `make dev` fails at `repoint` with
  `ResourceNotFoundException ... Function not found ...:tta-worker`, the deploy and the
  repoint disagree on region — confirm `AWS_ENVAR_ALLOWLIST` is in `.env.localstack` (see
  Prerequisites) and the changeset ARN region matches `eu-central-1`.
- **Runtime is `nodejs24`** — if your LocalStack image lacks it, lower it for the `isLocal`
  branch in `infrastructure/lib/infrastructure-stack.ts`.
- LocalStack state is ephemeral; `make down` clears it.
- **`ENOTFOUND …s3.localhost.localstack.cloud` on deploy** — this is your router's
  **DNS-rebind protection**, not a repo problem. `*.localhost.localstack.cloud` is a public
  record pointing to `127.0.0.1`, and CDK publishes assets via virtual-hosted-style S3 URLs
  (`AWS_ENDPOINT_URL_S3` in `.env.localstack`); routers that strip DNS answers resolving to
  loopback/private IPs make the name fail to resolve. Confirm with
  `getent hosts localhost.localstack.cloud` (no output = blocked) and compare against public
  DNS: `nslookup localhost.localstack.cloud 1.1.1.1` (returns `127.0.0.1`). Fix on
  systemd-resolved by routing just that domain to a resolver that doesn't strip it — create
  `/etc/systemd/resolved.conf.d/localstack.conf`:
  ```ini
  [Resolve]
  DNS=1.1.1.1
  Domains=~localstack.cloud
  ```
  then `sudo systemctl restart systemd-resolved`. Wildcard-safe (covers the randomly-named
  app buckets too) and leaves all other DNS on the router.
