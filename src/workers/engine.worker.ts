// Thin shell: one engine (and its 8 MiB transposition table) per worker, one
// job at a time. Holds no game state.

import type { FromEngine, Job } from '@/lib/analysis/protocol';
import { createEngine } from '@/lib/engine/engine';

const engine = createEngine();
const post = (message: FromEngine) => self.postMessage(message);

self.onmessage = (e: MessageEvent<Job>) => {
  const { jobId, ...request } = e.data;
  try {
    const outcome = engine.search(request, (line) =>
      post({ kind: 'line', jobId, line }),
    );
    post({ kind: 'done', jobId, outcome });
  } catch (error) {
    post({
      kind: 'failed',
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
