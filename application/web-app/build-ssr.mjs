import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bundles the Function-URL bridge + the Astro Node server output into a single
// Lambda artifact. Run after `astro build` (it consumes dist/server/entry.mjs).
//
// @astrojs/node resolves the client dir at runtime by walking up from
// import.meta.url to a path segment named "server", with "client" as its sibling.
// In Lambda the asset is unpacked flat to /var/task, so we package a self-contained
// tree — dist/lambda/{server/index.mjs, client/} — and point the handler at
// `server/index.handler` so that walk-up succeeds (/var/task/server → /var/task/client).
const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'dist/lambda');
const serverDir = join(outDir, 'server');

await rm(outDir, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });

await build({
  entryPoints: [join(root, 'src/lambda/entry.ts')],
  outfile: join(serverDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // Native (sharp) + Lambda-runtime-provided (@aws-sdk) deps must stay external.
  external: ['sharp', '@aws-sdk/*'],
  logLevel: 'warning',
});

// Ship the client assets as the sibling "client" dir the adapter expects.
await cp(join(root, 'dist/client'), join(outDir, 'client'), {
  recursive: true,
});

console.log('Bundled SSR Lambda → dist/lambda/server/index.mjs (+ client/)');
