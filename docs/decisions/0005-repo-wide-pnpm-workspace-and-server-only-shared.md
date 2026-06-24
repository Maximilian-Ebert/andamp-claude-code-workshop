---
status: accepted
date: 2026-05-28
deciders: project team
---

# 5. Repo-wide pnpm workspace with server-only shared code

## Context and Problem Statement

Astro has server-side capabilities (SSR, endpoints, Actions), so the `web-app`
can reuse the same domain code as the Lambda functions — shared types, the
`regions` data, validation, and pure logic. Originally `shared/` was nested inside
`functions/` as part of a functions-only pnpm workspace
([ADR 0004](0004-pnpm-workspace-and-path-aliases-for-functions.md)).

Once both `functions` **and** `web-app` consume `shared`, it is no longer
functions-specific. How should we structure the repo so both can use it — safely?

## Decision Drivers

- Reuse `shared` across `functions` and `web-app` with consistent resolution.
- Keep the `@lib` / `@data` import ergonomics.
- **Safety:** server-side logic must never leak into the browser bundle.
- Avoid fragile cross-package reach-ins.

## Considered Options

- Single root pnpm workspace: lift `shared/` to the repo root; `web-app` joins the
  workspace (migrates npm → pnpm).
- Lift `shared/` to root but keep `web-app` on npm; wire `@lib`/`@data` aliases in
  both `web-app` and `functions`.
- Leave `shared/` inside `functions/`; have `web-app` alias into `../functions/shared`.

## Decision Outcome

Chosen option: **single root pnpm workspace**.

- `shared/` moved to the repo root (`@shared/lib`, `@shared/data`).
- One root pnpm workspace spans `web-app`, `functions/handlers/*`, and `shared/*`
  (pinned pnpm 11.4.0 via corepack, one lockfile).
- `web-app` migrated npm → pnpm; `@lib` / `@data` aliases are declared in the root
  `tsconfig.base.json` (functions) and in `web-app/tsconfig.json` (Astro/Vite).
- **`shared` is server-only:** each entry has a runtime guard that throws if
  `'window' in globalThis`, so it cannot run in the browser.
- `infrastructure` stays separate on npm for now (smaller blast radius); it can
  join the workspace later if it needs `shared`.

### Consequences

- Good, because resolution is consistent across Node, esbuild, and Astro/Vite, and
  there are no cross-package reach-ins.
- Good, because `web-app` server code (frontmatter, endpoints, Actions) reuses the
  exact same `shared` code as the Lambda handlers.
- Good, because the server-only guard prevents server logic from leaking into the
  client bundle.
- Neutral, because `infrastructure` remains a separate npm project (intentional).
- Constraint: request-time SSR / Astro Actions still need an Astro **adapter** to
  deploy — that remains the open web-hosting decision (a future ADR).

## Pros and Cons of the Options

### Single root pnpm workspace (chosen)

- Good, because native, consistent resolution everywhere; `shared` owns its own deps.
- Bad, because it is the largest change (web-app moves to pnpm; re-verify).

### Lift shared, keep web-app on npm + aliases

- Good, because it keeps the npm/pnpm split.
- Bad, because `shared` can't cleanly own third-party deps (each consumer must
  provide them), and two alias configs drift.

### Leave shared in functions, alias from web-app

- Good, because it is the smallest change.
- Bad, because `web-app` reaches *into* `functions/` — backwards coupling, since
  `shared` would still nominally belong to functions.

## More Information

Builds on [ADR 0004](0004-pnpm-workspace-and-path-aliases-for-functions.md)
(pnpm workspace + `@lib`/`@data` aliases) by broadening the workspace to the whole
repo and relocating `shared/` to the root. Server-only is enforced by a runtime
guard plus convention (import `shared` only from server contexts).

## Update (2026-05-29)

The pnpm workspace was relocated from the repo root into an `application/` folder. The
workspace files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, lockfile)
and its members (`web-app`, `functions`, `shared`) now live under `application/`, while
the npm-based `infrastructure/` island stays at the repo root beside it. This keeps the
two package-manager domains cleanly isolated. The workspace design and server-only
`shared` decision above are unchanged — only the location moved; read "repo root" above
as the workspace root (`application/`).
