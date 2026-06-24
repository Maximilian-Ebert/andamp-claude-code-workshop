# Current architecture (AWS runtime)

The runtime topology of the deployed system — how a request flows and where data lives.
For repo/code structure see [the architecture overview](README.md); for the local
emulation see [Local architecture](local-emulation.md); for the *why*, the
[decisions](../decisions/). It is all defined in one CDK stack,
`infrastructure/lib/infrastructure-stack.ts`.

## Request path

A single **API Gateway (REST API)** is the same-origin front. Dynamic routes go to the
SSR Lambda; everything else is read from the private S3 bucket via an IAM-authorized S3
proxy integration.

```
                ┌──────────────────────────┐
                │         Browser          │
                └─────────────┬────────────┘
                              ▼
                ┌──────────────────────────┐
                │    API Gateway (REST)    │
                └──────┬─────────────┬─────┘
       /ssr*,          │             │       /  ·  /{proxy+}
       /_actions/*     ▼             ▼
           ┌──────────────────┐   ┌──────────────────────┐
           │    SSR Lambda    │   │     S3 (private)     │
           │ (pages+actions)  │   │   via IAM S3 proxy   │
           └────────┬─────────┘   └──────────────────────┘
                    ▼
           ┌──────────────────┐
           │     DynamoDB     │
           └──────────────────┘
```

- **Static** (prerendered pages + client JS/CSS): API Gateway reads objects from the
  **private** bucket through an `AwsIntegration` (S3 `GetObject`) assuming an IAM role —
  no public bucket access. `binaryMediaTypes: ['*/*']` so bytes round-trip.
- **SSR + actions** (`/ssr*`, `/_actions/*`): API Gateway proxy-integrates the SSR Lambda
  (payload v1). One handler serves both on-demand pages and Astro server actions, wrapped
  by the API-Gateway→Node bridge (`web-app/src/lambda/entry.ts`). May read DynamoDB / S3.

## Async path

Server code enqueues to the **SQS** work queue; the **worker** Lambda runs per message and
writes to **DynamoDB** (and may use **S3**). Fully decoupled from the request path.

```
              ┌──────────────────┐
              │   Server code    │
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │  SQS WorkQueue   │
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │  Worker Lambda   │
              └──────┬─────┬─────┘
                     ▼     ▼
            ┌────────────┐ ┌──────────────┐
            │  DynamoDB  │ │ S3 (private) │
            └────────────┘ └──────────────┘
```

## Resources (first slice)

| Resource | Notes |
| --- | --- |
| API Gateway (REST) | single front; static paths (`/`, `/_astro/*`, favicons, `/regions.json`) → S3, everything else → SSR Lambda |
| S3 `StaticBucket` | **private**; read by API Gateway's IAM role; worker read/write |
| SSR Lambda | Astro on-demand pages + server actions; Node 24; reads DynamoDB/S3 + `UserTable` (`USER_TABLE_NAME`) + JWT signing key (`JWT_SECRET_ARN`) |
| SQS `WorkQueue` | async work; 60s visibility timeout |
| Worker Lambda | SQS-triggered; Node 24; writes DynamoDB |
| DynamoDB `Table` | `id` partition key, on-demand billing |
| DynamoDB `UserTable` | auth users; `email` partition key, on-demand billing ([ADR 0008](../decisions/0008-password-auth-on-dynamodb.md)) |
| Secrets Manager `AuthSecret` | HS256 JWT signing key, generated on deploy; read by SSR Lambda ([ADR 0008](../decisions/0008-password-auth-on-dynamodb.md)) |

## Conventions

- **Single same-origin front** (REST API), identical in LocalStack and AWS — see
  [ADR 0007](../decisions/0007-rest-api-gateway-front.md). CloudFront was dropped (no
  regional spread); it can be re-added in front of API Gateway if edge caching is needed.
- **Lambdas reach AWS via `@lib`'s client factory** — on AWS it uses the function's IAM
  role and region. Least-privilege grants are set per function in CDK.
- **Stage path caveat:** REST API URLs carry a stage (`/prod/…`); a real deployment needs
  a custom domain mapped to the stage root so absolute asset links resolve.
- **Single, environment-agnostic stack** — account/region come from the deploy context.
