---
name: run-local
description: Set up and run the time-tracking app locally against LocalStack. Handles both first-time setup (install, bootstrap) and the everyday run/resume dev loop, with preflight checks, verification, and recovery for the known failure modes. Use when the user wants to set up, start, run, or boot the app locally.
argument-hint: [optional: setup | run | reset]
---

# Run the app locally

Orchestrate local development against LocalStack. **The `Makefile` and the two guides are the
source of truth — this skill drives them, it does not restate them:**

- `Makefile` — the canonical commands (`make help` lists every target).
- `docs/guides/getting-started.md` — first-time setup, the two package-manager domains.
- `docs/guides/local-development.md` — the run loop, the two endpoints, what hot-reloads, gotchas.

If a command here ever disagrees with the Makefile, the Makefile wins — read it (`make help`) and
update this skill.

## The two package-manager domains

This repo is deliberately split (ADR 0005). Use the right tool in the right place — the Makefile
already does:

- `application/` (pnpm workspace: `web-app`, `functions/handlers/*`, `shared/*`) → **`corepack pnpm`** (pinned version, one lockfile).
- `infrastructure/` (separate npm island, AWS CDK) → **`npm`**. This is intentional, not an oversight — do **not** run pnpm in `infrastructure/`.

## 1. Preflight (always, before either flow)

Check these before touching anything; stop and report the first one that fails rather than
plowing ahead:

| Check | How | If missing |
| --- | --- | --- |
| Docker running | `docker info >/dev/null 2>&1` | Tell the user to start Docker; LocalStack can't boot without it. |
| Node 24 active | `node -v` (want v24.x; `.nvmrc` says 24) | The Bash shell already loads nvm from the user's profile (`$NVM_DIR`, here `~/.nvm`) — just run `nvm use` (reads `.nvmrc`), then `hash -r` so the new `node` resolves. If v24 isn't installed, `nvm install`. **Don't** hardcode `NVM_DIR` or `source nvm.sh` yourself (a wrong path silently no-ops and you'll run the system Node), and don't install a toolchain beyond `nvm install`. Each tool shell is fresh, so put `nvm use` in the **same** command as any `make`/node step. |
| **GNU Make ≥ 3.82** | `make --version \| head -1` (want 3.82+; 4.x typical on Linux) | **macOS ships GNU Make 3.81 (2006), which silently ignores `.ONESHELL`** — the Makefile relies on it so each recipe runs as one shell. Without it, `cd application` doesn't carry to the next line and `make build`/`up` run `corepack pnpm install` at the repo root → **"no pnpm package.json at root of project"** (and `dev`/`seed`/`sync-static` break the same way). Tell the user to install a newer make: `brew install make`, then run targets as **`gmake up`** / **`gmake dev`** (Homebrew installs it as `gmake` to avoid shadowing the system one). Don't try to work around it by running the recipe lines by hand. |
| LocalStack token | `.env.localstack` exists and sets `LOCALSTACK_AUTH_TOKEN` | Stop — the user must add a free token from app.localstack.cloud. The image won't boot without it. The file is gitignored, so a fresh clone won't have it. |
| `.env.localstack` complete | also sets `AWS_REGION`, `AWS_DEFAULT_REGION` (both `eu-central-1`), **`AWS_ENVAR_ALLOWLIST=AWS_REGION,AWS_DEFAULT_REGION`**, `AWS_ENDPOINT_URL`, `AWS_ENDPOINT_URL_S3` — `grep -E '^AWS_(REGION\|DEFAULT_REGION\|ENVAR_ALLOWLIST\|ENDPOINT_URL)' .env.localstack` | The Makefile sources this into every target. A token-only file looks fine but cdklocal strips the region and deploys to `us-east-1` while repoint/astro use `eu-central-1` → `make dev` dies at `repoint`. Add the missing vars — full template in `local-development.md` Prerequisites. |
| **Edge hostnames in `/etc/hosts`** | **explicitly check both are present** — `grep -E 'live\.timetracker\.test\|staged\.timetracker\.test' /etc/hosts` (expect two lines, or one line listing both) | The nginx edge serves the app at `live.timetracker.test` / `staged.timetracker.test`; without these entries those hosts don't resolve and the app is unreachable by its documented URLs. Tell the user to add `127.0.0.1 live.timetracker.test staged.timetracker.test` to `/etc/hosts` (needs sudo — don't edit it for them). See [ADR 0009](../../../docs/decisions/0009-nginx-local-edge.md). |
| Deps installed | `application/node_modules` and `infrastructure/node_modules` exist | This is first-run → use the **Setup** flow. |

Don't print secrets. Confirm the token is *present*, never echo it.

## 2. Pick the flow

Infer from the argument and the current state — ask only if genuinely ambiguous:

- **`setup`**, or deps/containers absent → **Setup** (§3).
- **`run`** (default), or already set up → **Run** (§4).
- **`reset`**, or state looks corrupt / the user says "it's broken" → **Reset** (§5), then Run.

Quick state probe: `docker compose ps` (are containers up?) and
`curl -sf http://localhost:4566/_localstack/health` (is LocalStack live?).

## 3. Setup — first time on this machine

For a clean checkout, in order:

1. **Install deps** — `cd application && corepack pnpm install`, then
   `cd infrastructure && npm install`. (corepack pins the exact pnpm version; no global install.
   Infra is npm — see the two-domains note above.)
2. **Bring the stack up** — `make up`. This builds assets, starts LocalStack, waits for
   health, and bootstraps cdklocal. It is idempotent.

Then continue into the **Run** flow.

## 4. Run — the everyday dev loop

`make dev` is the one command for the normal loop: it builds, starts LocalStack, deploys once,
repoints the worker, then runs `astro dev` (:4321) **and** the worker watch in the foreground —
**Ctrl-C stops both**.

**Don't auto-launch it.** Once Setup is verified complete (or the stack is already set up),
tell the user everything's ready and **always ask** whether they want to run `make dev`
themselves (in their own terminal — Ctrl-C stops both servers) or have you run it for them.
**Ask every time** — even when the user already said "start/run the app." A request to start the
app is not standing permission to skip this question; treat starting the servers as the step that
needs the user's explicit choice. Only start it yourself once they've picked that option.

**If they'll run it themselves, give them the two-endpoint explanation up front** (the same one
from §6) — a self-runner never sees your §6 report, so without this they won't know which URL to
open: **http://live.timetracker.test** (the hot-reload dev server) is where they work, and
**http://staged.timetracker.test** (the deployed stack) is for verifying the production shape
(reflects the last deploy). Both need the `/etc/hosts` entries from §1.

When you do run it, because it's foreground/long-running, **start it in the background**
(`run_in_background: true`, redirect to a log) so the session stays responsive — but **do not
blind-wait on :4321 with a long timeout.** `make dev` runs a long build → deploy → repoint chain
*before* astro ever binds :4321; if any of those steps fails the server never comes up, and
polling :4321 just burns the whole timeout while the real error sits in the log. Instead **watch
`make dev`'s own output for a success or failure marker.**

**How to wait — read this, it avoids a blocked command.** Never write `sleep 25; tail …` (or any
`sleep N` followed by another command) — the harness blocks chained sleeps. Wait on a *condition*
with an `until` loop, or start a watcher with `run_in_background: true`. Concretely:

1. **Launch:** `make dev > /tmp/make-dev.log 2>&1` with `run_in_background: true` (prefix with
   `nvm use 24` in the same command — see §1).
2. **Wait for the deploy/repoint outcome** with one condition loop (this is the allowed shape):
   ```bash
   until grep -qE 'worker repointed|\*\*\* \[|Error 2' /tmp/make-dev.log; do sleep 2; done
   tail -n 30 /tmp/make-dev.log
   ```
   If the match is `*** [` / `Error 2` (or the background task exits non-zero), it's a **hard
   stop** — diagnose (§7) and surface it immediately. Do **not** fall through to the readiness check.
3. **Only after `worker repointed`** (astro is now starting), poll the user-facing
   **`live`** URL with another condition loop, then verify (§6):
   ```bash
   until curl -sf http://live.timetracker.test >/dev/null; do sleep 2; done
   ```
   If this never passes but `curl -sf http://localhost:4321` *does*, the dev server is up
   and the **nginx edge** can't reach it — an edge problem (§7), not a startup failure;
   stop polling and diagnose.

- Editing pages/components/SSR/`shared/**` → reflected on **http://live.timetracker.test** instantly (HMR).
- Worker handler changes → hot-reload live, no restart.
- Bridge (`entry.ts`) or infra (CDK/env/IAM/new resource) changes → **nothing** auto-applies;
  run `make redeploy`.

Develop against **http://live.timetracker.test**. Use **http://staged.timetracker.test** only
to verify the production-shaped path. See the run-loop table in `local-development.md` for the
full hot-reload matrix.

## 5. Reset — when local state is wedged

`make down` stops the containers and clears LocalStack state. LocalStack state is ephemeral by
design. After a reset, re-run **Setup** (the bootstrap step) then **Run**.

## 6. Verify it actually came up

Don't claim success because a command exited 0 — confirm (the nginx edge must be up —
`docker compose ps` should list `nginx`; `make up` starts it — and the `/etc/hosts` entries
from §1 must be present, or the hostnames below won't resolve):

- **live serves** — `curl -sf http://live.timetracker.test >/dev/null` (only after the §4 watch
  shows the deploy + repoint succeeded — don't poll it before that). This is nginx → the `:4321`
  dev server; `curl -sf http://localhost:4321 >/dev/null` checks the server directly if you need
  to isolate nginx from the dev server.
- **The deployed shape responds** — `curl -sf http://staged.timetracker.test/ssr` and
  `curl -sf http://staged.timetracker.test/` (static). Mismatch vs live points at the
  bridge/packaging, not your component.
- Report the live URLs back to the user **and explain what each is for** so a newcomer knows
  which to use — don't just print two links:
  - **http://live.timetracker.test** is nginx → the `astro dev` server with hot-reload. This is
    **where you develop** — edit a page/component/SSR route/`shared/**` and it updates instantly.
    Day-to-day work lives here.
  - **http://staged.timetracker.test** is nginx → the **actually-deployed stack** — API Gateway →
    S3 (static) + Lambda (everything else), the same shape that ships to AWS. Use it to **verify
    the production path** `astro dev` can't reproduce (the API-Gateway→Node bridge, the real
    Lambda runtime, S3 static routing). It only reflects the **last deploy** — run `make redeploy`
    to refresh it.
  - One-liner for the table: **`live.timetracker.test` = live editing · `staged.timetracker.test`
    = last deploy.** Full detail in the "two endpoints" section of `local-development.md`.

## 7. Troubleshoot — known failure modes

Match the symptom; the fixes live in `local-development.md` (don't reinvent them):

- **`ENOTFOUND …s3.localhost.localstack.cloud` on deploy** — router DNS-rebind protection, not a
  repo bug. Confirm with `getent hosts localhost.localstack.cloud` (no output = blocked) vs
  `nslookup localhost.localstack.cloud 1.1.1.1` (returns `127.0.0.1`). Fix per the
  systemd-resolved snippet in the guide's Gotchas section.
- **`make up`/`build` fails with "no pnpm package.json at root of project" (or `cd`-dependent
  recipes misbehave), typically on macOS** — stock macOS make is **GNU Make 3.81**, which ignores
  the `.ONESHELL` the Makefile depends on, so `cd application` doesn't carry to the next recipe
  line and pnpm runs at the repo root. Confirm with `make --version` (see the §1 preflight). Fix:
  `brew install make` and run **`gmake up`** / **`gmake dev`** — not a repo bug.
- **`cdklocal: command not found` (or `not found`) during `make up`/bootstrap** — `cdklocal`
  isn't a global tool; it's the `aws-cdk-local` devDependency in `infrastructure/`. The Makefile
  only installs **application** deps (`corepack pnpm install`); it never runs `npm install` in
  `infrastructure/`, so a fresh clone that jumps straight to `make up` has no
  `infrastructure/node_modules`. Fix: run the Setup step — `cd infrastructure && npm install`
  (see §1 "Deps installed" preflight and §3). Not a missing host install.
- **`pnpm: command not found` / `corepack: command not found` during `make build`/`up`** — the
  Makefile installs application deps with `corepack pnpm install`; Corepack ships with Node 24 but
  its shims may not be active (common on fresh macOS / Homebrew Node). Confirm the right Node is
  active first (`nvm use` — §1), then enable Corepack once: `corepack enable`. Don't `npm install
  -g pnpm` — that bypasses the pinned version (`packageManager` in `application/package.json`) and
  the single lockfile (see the two-domains note). Re-run from `application/`.
- **LocalStack won't boot** — almost always a missing/invalid `LOCALSTACK_AUTH_TOKEN` in
  `.env.localstack`.
- **`live.timetracker.test` 502s (but `:4321` serves)** — the nginx edge can't reach the dev
  server, or the host isn't allowlisted. Check, in order: the `/etc/hosts` entries (§1
  preflight); the `nginx` container is up (`docker compose ps`); the dev server is bound to
  `0.0.0.0`, not just localhost (the `Makefile` sets `ASTRO_LOCAL_EDGE=true` so `astro.config`
  binds all interfaces and allowlists the `*.timetracker.test` hosts — a server started without
  it binds `[::1]` only and Vite blocks the host). Restart `make dev` after fixing. See
  [ADR 0009](../../../docs/decisions/0009-nginx-local-edge.md).
- **`staged.timetracker.test` 404s its assets / `Blocked request … not allowed`** — same
  `ASTRO_LOCAL_EDGE`/edge cause as above; the toggle must be set for the deployed build too
  (it is, in `make build`). Rebuild + redeploy (`make redeploy`).
- **`repoint` fails: `ResourceNotFoundException ... Function not found ...:tta-worker`** —
  region mismatch. cdklocal strips `AWS_*` vars unless they're in `AWS_ENVAR_ALLOWLIST`, so
  without that allowlist the deploy lands in `us-east-1` while the plain-`aws` repoint uses
  `eu-central-1`. Confirm the changeset ARN region in the deploy log vs. the repoint region;
  the fix is `AWS_ENVAR_ALLOWLIST=AWS_REGION,AWS_DEFAULT_REGION` in `.env.localstack` (see the
  preflight `.env.localstack` complete check). After fixing, redeploy so `tta-worker` exists
  in `eu-central-1`.
- **Worker change not reflected** — the worker hot-reloads only under `make dev`; if you ran a
  bare `make deploy`, a later deploy clobbers the repoint — `make redeploy`, or use `make dev`.
- Anything else → read the **Gotchas** section of `local-development.md` before improvising.
