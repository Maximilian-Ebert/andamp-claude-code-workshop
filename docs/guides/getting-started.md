# Getting started

First-time setup for the monorepo.

## Prerequisites

- **Node.js 24.x** — every workspace targets the Node 24 runtime (see `.nvmrc`; run `nvm use`).
- **Corepack** — ships with Node; runs the repo's pinned pnpm version. No global pnpm install needed.
- **AWS CLI v2** — configured with credentials (`aws configure` or SSO) to deploy infrastructure.
- **Git**.

## Package managers per workspace

`web-app`, `functions`, and `shared` form a **single pnpm workspace** rooted at `application/` (one lockfile). `infrastructure` is a separate npm project at the repo root.

| Workspace(s) | Package manager | Install command |
| --- | --- | --- |
| `application/` (`web-app/`, `functions/`, `shared/`) | pnpm workspace (pinned **11.4.0** via corepack) | `cd application && corepack pnpm install` |
| `infrastructure/` | npm | `cd infrastructure && npm install` |

## First-time setup

```bash
# pnpm workspace (web-app, functions, shared) — lives in application/
cd application && corepack pnpm install && cd -

# Infrastructure (AWS CDK) — separate, npm
cd infrastructure && npm install && cd -
```

> `corepack pnpm` reads the `packageManager` field in `application/package.json` and
> runs exactly pnpm 11.4.0, regardless of any globally installed pnpm.

## Next steps

- Run the web app → [Web app guide](web-app.md)
- Work on Lambda functions → [Functions guide](functions.md)
- Deploy AWS resources → [Infrastructure guide](infrastructure.md)
