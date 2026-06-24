import { build, context } from 'esbuild';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const handlersDir = join(root, 'handlers');
const watch = process.argv.includes('--watch');

const handlers = readdirSync(handlersDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function options(name) {
  return {
    entryPoints: [join(handlersDir, name, 'src/index.ts')],
    outfile: join(handlersDir, name, 'dist/index.mjs'),
    tsconfig: join(handlersDir, name, 'tsconfig.json'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: true,
    // The AWS SDK v3 ships in the Lambda Node runtime — don't bundle it.
    external: ['@aws-sdk/*'],
  };
}

if (watch) {
  const contexts = await Promise.all(
    handlers.map((name) => context(options(name))),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log(`Watching ${handlers.length} handler(s): ${handlers.join(', ')}`);
} else {
  await Promise.all(handlers.map((name) => build(options(name))));
  console.log(`Bundled ${handlers.length} handler(s): ${handlers.join(', ')}`);
}
