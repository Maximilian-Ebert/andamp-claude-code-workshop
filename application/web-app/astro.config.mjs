// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// Hybrid: pages are static (→ S3) by default; routes that opt out with
// `export const prerender = false` are rendered on-demand by the Node adapter,
// which we wrap in a Lambda Function URL handler (see src/lambda/entry.ts).
// Styling is Tailwind v4 + daisyUI via the Vite plugin (no @astrojs/tailwind).
// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: node({ mode: 'middleware' }),
  // Inline the (single, small) global stylesheet into every page. Static pages and
  // SSR pages build in separate passes and otherwise each emit their own byte-
  // identical external CSS (index.*.css vs Layout.*.css); navigating between them
  // re-downloads the same CSS under a new URL → FOUC/flicker on slow networks.
  // Inlining removes the external request entirely. See ADR 0010.
  build: { inlineStylesheets: 'always' },
  // ASTRO_LOCAL_EDGE toggles "local edge mode" (set by the Makefile when running
  // behind the nginx edge), unset everywhere else incl. real-AWS builds:
  //  - bind the dev server to 0.0.0.0 so the nginx container can reach it via
  //    host.docker.internal (live.timetracker.test → :4321);
  //  - relax Astro's host-based origin check, which the LocalStack API Gateway
  //    front breaks by not preserving the client Host (CSRF defence falls to the
  //    SameSite=Lax session cookie).
  server: { host: process.env.ASTRO_LOCAL_EDGE === 'true' },
  security: { checkOrigin: process.env.ASTRO_LOCAL_EDGE !== 'true' },
  vite: {
    plugins: [tailwindcss()],
    // The dev server is reached via the nginx edge hostnames; allow them past
    // Vite's host check (DNS-rebind protection) only in local edge mode.
    server: {
      allowedHosts:
        process.env.ASTRO_LOCAL_EDGE === 'true'
          ? ['live.timetracker.test', 'staged.timetracker.test']
          : [],
    },
    // Keep the AWS SDK (and its @smithy deps) in one chunk. Rollup otherwise
    // splits these mutually-dependent modules across chunks, which triggers
    // circular-reexport warnings and risks a broken execution order.
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) =>
            /node_modules\/(@aws-sdk|@smithy)\//.test(id)
              ? 'aws-sdk'
              : undefined,
        },
      },
    },
  },
});
