# time-tracking-app — Documentation

Documentation for the `time-tracking-app` monorepo.

## Sections

- **[Guides](guides/)** — how to do things: run dev servers, build, deploy, add a handler.
- **[Architecture](architecture/)** — how the system is structured today.
- **[Decisions](decisions/)** — Architecture Decision Records (ADRs) capturing *why* we made key choices.
- **[TODO / Known issues](TODO.md)** — tracked follow-ups and temporary workarounds.

## Repository layout

| Path | What it is | Tooling |
| --- | --- | --- |
| `docs/` | This documentation | Markdown |
| `application/` | pnpm workspace root — holds `web-app/` (Astro frontend), `functions/` (Lambda handlers), `shared/` (server-only `@lib`/`@data`) | TypeScript (ESM), pnpm |
| `infrastructure/` | AWS CDK app (defines cloud resources) | AWS CDK + TypeScript (npm) |
| `nginx/` | Local-only dev edge config — stageless `*.timetracker.test` hosts ([decisions/0009](decisions/0009-nginx-local-edge.md)) | nginx (Docker Compose) |

> `application/` is one **pnpm workspace** spanning `web-app`, `functions`, and `shared`; `infrastructure` is a separate npm project at the repo root.
>
> Everything is deployed on AWS — see [decisions/0001](decisions/0001-application-stack-astro-on-aws.md).
