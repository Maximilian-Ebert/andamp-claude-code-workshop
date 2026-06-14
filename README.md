# Workshop: time-tracking-app

> **This is a workshop repository.** It exists for teaching and hands-on
> exercises, not as a production system. The code, tickets, and infrastructure
> are illustrative — treat them as a sandbox to experiment in.
>
> ⚠️ **Some bugs and bad practices are intentional.** They are planted by design
> as material for the exercises or as a show case. Don't assume every flaw is an accident, and
> don't "fix" things wholesale — that's part of the work.

A pnpm-workspace monorepo for a time-tracking application, used as the working
example throughout the workshop.

## Layout

| Path | What it is | Tooling |
| --- | --- | --- |
| `application/` | pnpm workspace — `web-app/` (Astro SSR), `functions/` (Lambda), `shared/` (server-only `@lib`/`@data`) | TypeScript (ESM), pnpm |
| `infrastructure/` | AWS CDK app (cloud resources) | AWS CDK + TypeScript (npm) |
| `nginx/` | Local-only dev edge config | nginx (Docker Compose) |
| `docs/` | Guides, architecture, and ADRs | Markdown |
| `.claude/` | Workshop agents, skills, and commands for Claude Code | Markdown |

## Getting started

See **[docs/README.md](docs/README.md)** for the full documentation, and
[docs/guides/](docs/guides/) for how to run the app locally.
