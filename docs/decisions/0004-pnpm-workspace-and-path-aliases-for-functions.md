---
status: accepted
date: 2026-05-28
deciders: project team
---

# 4. pnpm workspace + `@lib`/`@data` path aliases for functions

> **Update (2026-05-28):** broadened by [ADR 0005](0005-repo-wide-pnpm-workspace-and-server-only-shared.md)
> — the workspace is now repo-wide (includes `web-app`) and `shared/` moved to the
> repo root. The pnpm-workspace + `@lib`/`@data` alias decision still holds.

## Context and Problem Statement

Lambda functions need to share common library and data code, while each handler
stays an independently deployable unit with its own dependencies. How should
`functions/` be structured, and how should handlers reference shared code?

## Decision Drivers

- Per-handler dependency isolation (a handler bundles only what it needs).
- Ergonomic, stable imports for shared code (requested: `@lib` and `@data`).
- Reproducible tooling across machines.
- Modern runtime: Node 24, ESM.

## Considered Options

- **pnpm workspace** with `shared/*` packages and per-handler sub-projects, where
  handlers reference shared code via `@lib` / `@data` **TypeScript path aliases**.
- pnpm workspace where handlers import shared packages by their scoped names
  (e.g. `@shared/lib`) via `workspace:*` dependencies (no path aliases).
- A single package (no workspace), with shared code as plain folders.

## Decision Outcome

Chosen option: **pnpm workspace with `@lib` / `@data` path aliases**, ESM, pnpm
pinned to **11.4.0** via corepack, and esbuild for bundling.

Shared code lives in `shared/lib` (`@shared/lib`) and `shared/data` (`@shared/data`).
Handlers under `handlers/` import it as `@lib` / `@data`, defined as TypeScript
path aliases in `functions/tsconfig.base.json`.

### Consequences

- Good, because each handler is an isolated sub-project and bundles independently.
- Good, because imports read as `@lib` / `@data` exactly as requested.
- Important constraint: `@lib` / `@data` are path aliases, **not** npm packages
  (bare `@lib`/`@data` are invalid package names). They resolve at type-check via
  TypeScript and at build via esbuild reading the tsconfig — so handlers must be
  bundled (by `functions/build.mjs` or, at deploy, by CDK `NodejsFunction`).
- Operational notes:
  - Bundling uses esbuild's **JS API** (`build.mjs`), not the CLI — pnpm's
    postinstall replaces `esbuild/bin/esbuild` with the native binary, breaking
    the CLI bin-shim under Node.
  - pnpm 11 sandboxes dependency build scripts; esbuild is approved via
    `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`.

## Pros and Cons of the Options

### pnpm workspace + path aliases (chosen)

- Good, because isolation per handler plus the exact `@lib` / `@data` imports.
- Bad, because aliases only resolve through TypeScript + a bundler, so a build
  step is mandatory.

### pnpm workspace + scoped package imports (`@shared/lib`)

- Good, because it is the most pnpm-native approach and works at runtime via
  node_modules without a bundler aliasing step.
- Bad, because the import specifier is `@shared/lib`, not the requested `@lib`.
- **Dropped.**

### Single package, no workspace

- Good, because it is the simplest to set up.
- Bad, because no per-handler dependency isolation and no independent deploy unit.
- **Dropped.**

## More Information

Module format ESM and Node 24 were chosen to match the runtime and the rest of
the repo. See the [Functions guide](../guides/functions.md).
