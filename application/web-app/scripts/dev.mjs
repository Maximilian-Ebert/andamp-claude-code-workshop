// Dev runner: `astro dev` plus an auto-restart watcher for server-only modules.
//
// Astro's dev HMR reloads the browser for pages/components/CSS but does NOT
// re-evaluate SSR-only modules (server actions, middleware, @lib/@data) — the
// module runner keeps the first-loaded copy, so edits there silently serve
// stale code until a manual restart. We watch just those paths and bounce the
// dev server when they change; everything else still gets Astro's native HMR.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch } from 'chokidar';

const webAppDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const astroBin = join(webAppDir, 'node_modules', '.bin', 'astro');

const watchTargets = [
  join(webAppDir, 'src', 'actions'),
  join(webAppDir, 'src', 'middleware.ts'),
  join(webAppDir, '..', 'shared', 'data', 'src'),
  join(webAppDir, '..', 'shared', 'lib', 'src'),
].filter(existsSync);

const watchedExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

let child;
let restartTimer;

function start() {
  child = spawn(astroBin, ['dev'], {
    cwd: webAppDir,
    stdio: 'inherit',
    env: process.env,
    detached: true,
  });
}

function stop() {
  const previous = child;
  child = undefined;
  if (!previous?.pid) return;

  try {
    process.kill(-previous.pid, 'SIGTERM');
  } catch {
    previous.kill('SIGTERM');
  }
}

function scheduleRestart(file) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`\n[dev-watch] server change in ${file} — restarting dev server…`);
    stop();
    start();
  }, 150);
}

const watcher = watch(watchTargets, { ignoreInitial: true });
watcher.on('all', (_event, path) => {
  if (!watchedExtensions.has(extname(path))) return;
  scheduleRestart(path);
});

function shutdown() {
  watcher.close();
  stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
