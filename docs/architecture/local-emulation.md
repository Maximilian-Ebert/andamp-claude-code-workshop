# Local architecture (LocalStack)

How the [current architecture](infrastructure.md) is emulated on your machine. The
*same* CDK stack deploys to LocalStack via `cdklocal` (`-c localstack=true`) — and because
the front is a **REST API** (Community-tier in LocalStack), routing is identical local and
on AWS. Day-to-day workflow lives in
[the local-development guide](../guides/local-development.md); rationale in
[ADR 0006](../decisions/0006-localstack-dev-and-function-url-ssr.md) and
[ADR 0007](../decisions/0007-rest-api-gateway-front.md).

## Topology

```
   ┌──────────────────────────────────────────────┐
   │  You (browser)                               │
   │    develop → http://live.timetracker.test    │
   │    verify  → http://staged.timetracker.test  │
   └───────────────────────┬──────────────────────┘
                           ▼
   ┌──────────────────────────────────────────────┐
   │  nginx edge — :80 (Docker)                   │
   │    live   ──────────────► astro dev (host)   │
   │    staged ──┐             :4321 (HMR)        │
   └─────────────┼────────────────────┬───────────┘
        (staged) ▼         (live) @lib│→ :4566
   ┌──────────────────────────────────┼───────────┐
   │  LocalStack — one container, :4566 (Docker)  │
   │           ┌──────────────────────┐           │
   │           │  API Gateway (REST)  │           │
   │           └──────┬─────────┬─────┘           │
   │                  ▼         ▼                 │
   │         ┌────────────┐ ┌──────────────┐      │
   │         │ SSR Lambda │ │ S3 (private) │      │
   │         └─────┬──────┘ └──────────────┘      │
   │               ▼                              │
   │     ┌────────────┐  ┌────────────────────┐   │
   │     │  DynamoDB  │  │  Secrets Manager   │   │
   │     └────────────┘  │  (JWT signing key) │   │
   │                     └────────────────────┘   │
   │   + SQS → Worker → DynamoDB (async)          │
   │   Lambdas run as nodejs:24 containers        │
   └──────────────────────────────────────────────┘
```

`live` proxies to the **host** `astro dev` server (HMR), whose `@lib` clients target
LocalStack at `:4566`; `staged` proxies to the deployed **API Gateway** stage. The edge maps
both stageless `*.timetracker.test` hosts so the browser uses clean root URLs — see
[ADR 0009](../decisions/0009-nginx-local-edge.md).

## How it maps to AWS

- **One LocalStack container** emulates the whole AWS edge (port 4566): S3, SQS, DynamoDB,
  Lambda, **API Gateway (REST)**, Secrets Manager, CloudFormation, IAM/STS, plus SSM/ECR/Logs
  for CDK bootstrap and logs. A second container, **nginx**, is *not* an emulated AWS service —
  it's a local-only dev edge (see below).
- **Auth is DynamoDB + Secrets Manager** — users are items in a dedicated `UserTable`,
  and the JWT session signing key is a Secrets Manager secret generated on deploy
  ([ADR 0008](../decisions/0008-password-auth-on-dynamodb.md)). Both are LocalStack
  Community, so there is **no auth service to emulate** — no Cognito, no sidecar.
- **An nginx edge** (local-only) fronts everything so the browser uses stageless root URLs:
  `live.timetracker.test` → the host `astro dev` server, `staged.timetracker.test` → the
  deployed API Gateway stage. Real AWS would use a custom domain / CDN instead
  ([ADR 0009](../decisions/0009-nginx-local-edge.md)).
- **Lambdas run as local Docker containers** (`public.ecr.aws/lambda/nodejs:24`), spawned
  by LocalStack through the mounted Docker socket — the real Lambda runtime, locally.
- **`*.localhost.localstack.cloud` hostnames resolve to `127.0.0.1`** — the API Gateway,
  SQS, and S3 endpoints are all loopback. The raw invoke URL carries the stage
  (`http://<id>.execute-api.localhost.localstack.cloud:4566/prod/`); the nginx edge hides the
  stage behind `staged.timetracker.test` (the API id is pinned via LocalStack's `_custom_id_`
  tag so that host is stable across deploys).
- **`@lib` auto-targets LocalStack** when `AWS_ENDPOINT_URL` is set (exported locally,
  injected into Lambdas by LocalStack). Dummy `test`/`test` creds; region `eu-central-1`.

## Deliberate differences from AWS

| | AWS | Local |
| --- | --- | --- |
| Front (API Gateway REST) | yes | **same** — routing is testable locally (Community tier) |
| Edge | custom domain / CDN at the root | **nginx** maps stageless `*.timetracker.test` hosts onto the `/prod` stage ([ADR 0009](../decisions/0009-nginx-local-edge.md)) |
| Static upload to S3 | `BucketDeployment` | Makefile `aws s3 sync` (`make sync-static`) |
| SSR fast loop | — | `astro dev` (:4321, HMR) behind `live.timetracker.test` |
| Worker updates | redeploy | **hot-reload** (fixed name `tta-worker`, watched `dist/`) |
| IAM | enforced | not enforced — validate grants in staging |
| Auth | password in DynamoDB + JWT signing key in Secrets Manager | **same** — no auth service or sidecar; table items + a generated secret ([ADR 0008](../decisions/0008-password-auth-on-dynamodb.md)) |

> HTTP API (API Gateway **v2**) is LocalStack Pro-only; REST API (v1) is Community — the
> reason the front is REST API. See [ADR 0007](../decisions/0007-rest-api-gateway-front.md).
