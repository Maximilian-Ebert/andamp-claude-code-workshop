# Web app (Astro)

The web frontend lives in `application/web-app/` and is built with [Astro](https://astro.build)
(minimal template, TypeScript strict). It is part of the **pnpm workspace** under `application/`.

## Install

```bash
# from the workspace root (application/) — installs the whole workspace (incl. web-app)
cd application && corepack pnpm install
```

## Start the dev server

The normal way to run the app is **`make dev`**, then open **http://live.timetracker.test**
(hot-reloading) — see [local development](local-development.md) for the full loop and the
`staged` deploy URL.

To run *just this package* in isolation (no LocalStack, no edge — e.g. pure component work):

```bash
cd application/web-app
corepack pnpm run dev
```

Standalone, Astro binds the dev server directly (it prints the address on start); the edge
hostnames only apply under `make dev`.

## Build & preview

```bash
corepack pnpm run build     # outputs static site to application/web-app/dist/
corepack pnpm run preview   # serves the built dist/ locally to verify a production build
```

## Using shared code

`web-app` can import the workspace's shared packages via the `@lib` / `@data`
aliases (configured in `application/web-app/tsconfig.json`):

```ts
import { regions } from '@data';
import { greet } from '@lib';
```

**`@shared` is server-only** — only import it from server contexts: `.astro`
frontmatter, endpoints (`src/pages/**/*.ts`), and Astro Actions. Never from a
client-hydrated component or a `<script>`; a runtime guard throws if shared code
is ever loaded in the browser. See `src/pages/regions.json.ts` for an example
(a prerendered endpoint that uses `@data` and `@lib`).

## Notes

- Output is a static build by default. Request-time SSR and Astro Actions need an
  Astro **adapter**; these ship on the API-Gateway→Lambda front (e.g. the `login` Action),
  see [ADR 0007](../decisions/0007-rest-api-gateway-front.md). Build-time/prerendered server
  code (frontmatter, `prerender = true` endpoints) works today without an adapter.
- Pages live in `application/web-app/src/pages/`.
