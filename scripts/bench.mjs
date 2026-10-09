// pnpm bench: nodes/s and depth reached per analysis level, on the engine
// bundled the way the worker ships it. Vitest's module transform slows hot
// loops about 4x, so the bench never runs under Vitest.
//
// With caps off (BENCH_NODES=N), total nodes is a deterministic signature:
// any search change moves it.
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = `${root}node_modules/.bench`;

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { '@': `${root}src` } },
  build: { ssr: 'scripts/bench-entry.ts', outDir, emptyOutDir: true },
});
await import(pathToFileURL(`${outDir}/bench-entry.js`).href);
