# TODO / Known issues

Tracked follow-ups and temporary workarounds that should be revisited.

## pnpm version pin is broken locally (workaround in place)

- [ ] Restore a clean `pnpm@11.4.0` and remove the global override.

**Symptom:** every `pnpm …` command in `application/` fails with
`Failed to switch pnpm to v11.4.0 … pnpm CLI is missing at …/.tools/@pnpm+linux-x64/11.4.0/bin`.

**Cause:** `application/package.json` pins `packageManager: pnpm@11.4.0`. pnpm's
auto-version manager tries to switch to that version on every command, but the
downloaded 11.4.0 platform package is corrupt (missing `dist/pnpm.mjs`), so it
never produces a runnable binary. The base standalone (`10.21.0`) works fine.

**Current workaround:** `~/.config/pnpm/rc` contains
`manage-package-manager-versions=false`, so pnpm uses the working `10.21.0` and
ignores the pin. User-global and reversible (delete the line/file to restore).

**Proper fixes (pick one):**
- Re-pin `application/package.json` to `pnpm@10.21.0` to match what's installed,
  then remove the global override; or
- Reinstall a clean `pnpm@11.4.0` (e.g. `corepack` or the standalone installer),
  confirm `pnpm -v` reports `11.4.0` in the repo, then remove the global override.
