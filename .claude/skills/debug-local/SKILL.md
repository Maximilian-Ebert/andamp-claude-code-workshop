---
name: debug-local
description: Debug a failing local run by reading the right log. Routes a symptom to the process that actually produces it (host dev server vs LocalStack vs nginx edge), drives the reproduce → read → correlate → fix → re-verify loop against `dev.log` and the container logs. Use when the user reports a local error, a 4xx/5xx, a broken action, or asks you to look at the logs.
argument-hint: "[optional: live | last | <symptom, e.g. 'stopwatch 500'>]"
---

# Debug the local app from its logs

Drive the log-based debugging loop. **Starting/stopping the stack and its known infra failure
modes belong to [`run-local`](../run-local/SKILL.md) and the Makefile — this skill assumes the app
is (or should be) running and focuses on _finding the cause from the logs_.** Don't restate
run-local's troubleshooting table; link to it.

## Know which process produces which log

The single most important fact: under `make dev` the **SSR runs in the host `astro dev` process,
not in Lambda.** So page renders, `middleware.ts`, and Astro **actions** (login, the stopwatch
start/pause/resume/stop) log to the host stdout — **not** to CloudWatch/LocalStack. Look in the
right place:

| Symptom surface | Where it logs | How to read |
| --- | --- | --- |
| SSR page render, `middleware.ts`, **actions** (`POST /_actions/*`), request lines (`[200] /dashboard`) | **`dev.log`** (repo root; `make dev` tees `astro dev` here, defined as `DEV_LOG` in the `Makefile`) | `Read` it, or watch live (below) |
| DynamoDB / S3 calls, `*_TABLE_NAME is not set`, AccessDenied, and any **`functions/` Lambda** running inside LocalStack | LocalStack container | `docker compose logs --tail=200 localstack` |
| A specific in-LocalStack Lambda | its CloudWatch group | `aws --endpoint-url=http://localhost:4566 logs tail /aws/lambda/<fn> --follow` |
| Edge routing, 502 at `live.timetracker.test`, host-not-allowed | nginx container | `docker compose logs --tail=100 nginx` |

`dev.log` is **truncated on every `make dev`** (it's `tee`, not `tee -a`) and **persists after
teardown** — so it always holds the _current/last_ run, and you can read it even after `make down`.
It's gitignored via `*.log`.

## The loop

1. **Is it running?** Confirm before trusting the log: `pgrep -af "web-app run dev"` and
   `ss -ltn | grep 4321` (host dev server), `docker compose ps` (localstack + nginx). If it isn't
   up, hand off to [`run-local`](../run-local/SKILL.md) (ask before launching `make dev`). The user
   may have started `make dev` in **their own terminal** — that's fine, it still tees to `dev.log`,
   so you have access without having launched it.

2. **Get a clean repro.** Because `dev.log` truncates at startup, the cause may predate the current
   file. Prefer: note the current end of the log, ask the user to **reproduce the action now**,
   then read what was appended. For a live session, watch instead of re-reading:
   - One-shot "tell me when it errors" → `Bash` with `run_in_background: true` and an `until` loop
     that exits on the signature (see "How to wait" in run-local §4 — never chain `sleep`).
   - Per-occurrence stream → a `Monitor` on `tail -f dev.log` filtered to **both** success and
     failure signatures (`grep -E --line-buffered "\[5[0-9][0-9]\]|\[4[0-9][0-9]\]|Error|Action(Error)?|Unhandled|at "`).
     Silence is not success — include the failure patterns, not just the happy path.

3. **Read the right log** per the table. Match the request line to its handler: an action shows as
   `POST /_actions/<name>` with the status; a thrown `ActionError` and stack trace follow it in
   `dev.log`. A `[500]` with no app trace, or a `*_TABLE_NAME is not set` / AWS SDK error, means the
   failure is in the data layer → pivot to the **localstack** log.

4. **Correlate by timestamp.** `dev.log` lines are `HH:MM:SS`; container logs are ISO/UTC. Line up
   the action's wall-clock time across `dev.log` and `docker compose logs localstack` to see the
   request and the failed AWS call as one story.

5. **Fix, then re-verify from the log** — don't claim success on exit code. Reproduce again and
   confirm the status flipped (e.g. `[500]→[200]` on `POST /_actions/...`) and the trace is gone.
   Infra/bridge/env changes need `make redeploy`; SSR/component/`shared` changes hot-reload.

## Symptom → first look

- **Action fails / button does nothing** (stopwatch, login) → `dev.log`, find `POST /_actions/<name>`
  and the `ActionError`/stack right after it. `UNAUTHORIZED`/`NOT_FOUND` are expected `ActionError`
  codes thrown at the boundary — read the message.
- **`[500]` on a page or action with a `*_TABLE_NAME is not set`** → the host process is missing the
  env var the Makefile injects from stack outputs; the table/output may not be deployed. Confirm the
  output exists (`make endpoints`) and that `make dev` exported it. See the table-name wiring in the
  `Makefile` `dev` target.
- **`[401]`/`[302]` on `/login`, bounce from `/dashboard`** → usually auth, not a bug: wrong creds,
  or LocalStack state was reset so the seeded user is gone. Re-seed (`make seed`); creds are
  `demo@example.com` / `password123`.
- **DynamoDB/S3 errors, AccessDenied, ResourceNotFound** → **localstack** log; cause is usually IaC
  (missing grant/table/region). Region mismatches and edge 502s are in run-local §7 — go there.
- **`live.timetracker.test` 502 but `:4321` serves** → edge problem, not the app. run-local §7.

## Keep this skill honest

If the log paths, the `DEV_LOG` location, or the dev/Lambda split change in the `Makefile`, the
Makefile wins — read it and update this table.
