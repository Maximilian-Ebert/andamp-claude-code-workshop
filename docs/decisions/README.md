# Decisions (ADRs)

Architecture Decision Records capture the **context** and **reasoning** behind
significant choices, so we (and future contributors) understand *why* the system
is the way it is — not just *what* it is.

We use the [MADR](https://adr.github.io/madr/) format. See [adr-template.md](adr-template.md).

## How to add a decision

1. Copy `adr-template.md` to `NNNN-short-title.md`, using the next free number.
2. Fill in context, options, and the outcome.
3. Set the `status` (`proposed` → `accepted`; later `deprecated` or `superseded by NNNN`).
4. Keep accepted ADRs immutable — to change a decision, write a new ADR that
   supersedes the old one rather than editing history.

## Index

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-application-stack-astro-on-aws.md) | Application stack: Astro on AWS | Accepted |
| [0002](0002-monorepo-single-git-repository.md) | Monorepo in a single git repository | Accepted |
| [0003](0003-typescript-for-aws-cdk.md) | TypeScript for the AWS CDK app | Accepted |
| [0004](0004-pnpm-workspace-and-path-aliases-for-functions.md) | pnpm workspace + `@lib`/`@data` path aliases for functions | Accepted |
| [0005](0005-repo-wide-pnpm-workspace-and-server-only-shared.md) | Repo-wide pnpm workspace + server-only shared code | Accepted |
| [0006](0006-localstack-dev-and-function-url-ssr.md) | LocalStack local dev + hybrid Astro hosting (S3 + Lambda Function URL) | Accepted (SSR-origin/CloudFront parts superseded by 0007) |
| [0007](0007-rest-api-gateway-front.md) | API Gateway (REST API v1) as the single same-origin front | Accepted |
| [0008](0008-password-auth-on-dynamodb.md) | Hand-rolled email + password auth with JWT sessions | Accepted |
| [0009](0009-nginx-local-edge.md) | nginx local edge for stageless dev hostnames | Accepted |
| [0010](0010-cache-control-for-static-assets.md) | Cache-Control for static assets served through API Gateway | Accepted |
