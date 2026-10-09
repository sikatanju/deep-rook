# workers

`engine.worker.ts` is the engine Web Worker: a thin shell around `createEngine` from `@/lib/engine/engine`, one job at a time.
Nothing imports it directly. `@/lib/analysis/protocol` spawns it as a module worker, and the analyzer runs a pool of them.
See `docs/engine-design.md`.
