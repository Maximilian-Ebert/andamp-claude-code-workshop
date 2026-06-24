# time-tracking-app

pnpm-workspace monorepo: `web-app/` (Astro SSR), `functions/` (Lambda), `shared/` (server-only `@lib`/`@data`); `infrastructure/` is a separate AWS CDK app. See [docs/README.md](docs/README.md).

## Coding standards

Apply these when writing or editing code in this repo:

@docs/guides/code-style.md

For anything not covered there, match the conventions of the surrounding file.

## Working agreements

- TypeScript ESM everywhere. Node 24, pnpm in `application/`, npm in `infrastructure/`.
- Formatting and lint are enforced by Prettier + ESLint — don't hand-format against them.
- Reference deeper docs on demand (read when relevant, not always loaded):
  - [docs/guides/](docs/guides/) — how-to guides (run, build, deploy, add a handler)
  - [docs/architecture/](docs/architecture/) — how the system is structured
  - [docs/decisions/](docs/decisions/) — ADRs (the *why* behind key choices)
