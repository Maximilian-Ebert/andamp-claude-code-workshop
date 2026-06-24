# Functions (Lambda handlers)

AWS Lambda functions live in `application/functions/handlers/`. They are part of the
**pnpm workspace** under `application/` and are TypeScript (ESM) targeting the Node 24 runtime.

## Layout

```
application/              # pnpm workspace root
├── pnpm-workspace.yaml   # shared/*, functions/handlers/*, web-app
├── tsconfig.base.json    # shared compiler options + @lib / @data path aliases
├── shared/
│   ├── lib/              # package @shared/lib  → imported as @lib (server-only)
│   └── data/             # package @shared/data → imported as @data (server-only)
└── functions/
    ├── build.mjs         # bundles every handler with esbuild (JS API)
    └── handlers/
        └── hello/        # package @handlers/hello (one sub-project per handler)
```

`shared/` lives at the workspace root (`application/`) because it is shared across
`functions` **and** `web-app` — see [ADR 0005](../decisions/0005-repo-wide-pnpm-workspace-and-server-only-shared.md).

Handlers import shared code via the **`@lib` / `@data` path aliases** (defined in
`application/tsconfig.base.json`). These are TypeScript path aliases, not npm
packages — see [ADR 0004](../decisions/0004-pnpm-workspace-and-path-aliases-for-functions.md).

```ts
import { greet } from '@lib';
import { regions } from '@data';
```

## Install

```bash
# from the workspace root (application/)
cd application && corepack pnpm install
```

> pnpm is pinned to 11.4.0 via `application/package.json`'s `packageManager` field.

## Type-check

```bash
corepack pnpm run typecheck      # tsc --noEmit across shared + handler packages
```

## Build (bundle handlers)

```bash
corepack pnpm run bundle:functions   # runs node functions/build.mjs
```

This bundles each handler to `functions/handlers/<name>/dist/index.mjs` (esbuild,
ESM, target node24), inlining the shared code resolved through `@lib` / `@data`.

## Add a new handler

1. Create `functions/handlers/<name>/` with:
   - `package.json` — name `@handlers/<name>`, `"type": "module"`, a `typecheck` script.
   - `tsconfig.json` — `{ "extends": "../../../tsconfig.base.json", "include": ["src"] }`.
   - `src/index.ts` — export a `handler`, importing shared code via `@lib` / `@data`.
2. Run `corepack pnpm install` (registers the new workspace package).
3. `corepack pnpm run typecheck` and `corepack pnpm run bundle:functions` —
   `build.mjs` discovers the new handler automatically.

## Gotchas

- **Bundling uses esbuild's JS API** (`build.mjs`), not the esbuild CLI: pnpm's
  postinstall replaces `esbuild/bin/esbuild` with the native binary, which breaks
  the CLI bin-shim under Node.
- **pnpm 11 sandboxes build scripts.** esbuild (and Astro's `sharp`) are approved
  via `allowBuilds` in `pnpm-workspace.yaml`; this is already set, so a fresh
  `corepack pnpm install` builds their native binaries without prompting.
