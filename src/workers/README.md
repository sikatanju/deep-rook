# workers

Reserved for the engine Web Worker. Nothing is implemented yet.
Load it from React with `new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })` so Vite bundles it.
