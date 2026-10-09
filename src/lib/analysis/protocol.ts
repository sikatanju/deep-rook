// Wire types between the analyzer and whatever runs searches. Components
// never see these (lint-enforced).
//
// This is also the future-server seam: a remote backend is one more SpawnLane
// that sends the same self-contained Job over the network and calls back with
// the same FromEngine messages. Searches are deterministic, so it would return
// the same answers.

import type { Line } from '@/lib/chess/score';
import type { SearchOutcome, SearchRequest } from '@/lib/engine/engine';

export type Job = SearchRequest & { jobId: number };

export type FromEngine =
  | { kind: 'line'; jobId: number; line: Line }
  | { kind: 'done'; jobId: number; outcome: SearchOutcome }
  | { kind: 'failed'; jobId: number; message: string };

/**
 * One search executor, running at most one job at a time. Cancellation is
 * terminate(): a worker in a synchronous search cannot read a stop message,
 * and SharedArrayBuffer needs COOP/COEP headers a static host does not send.
 */
export type Lane = { post(job: Job): void; terminate(): void };

/**
 * `onCrash` fires asynchronously when the executor dies (load failure, out of
 * memory, an uncaught error). Never throws: a failure to start is a crash too.
 */
export type SpawnLane = (
  onMessage: (message: FromEngine) => void,
  onCrash: () => void,
) => Lane;

/** A module Web Worker per lane; null where Worker does not exist (jsdom). */
export const spawnWorkerLane: SpawnLane | null =
  typeof Worker === 'undefined'
    ? null
    : (onMessage, onCrash) => {
        let worker: Worker;
        try {
          worker = new Worker(
            new URL('../../workers/engine.worker.ts', import.meta.url),
            { type: 'module' },
          );
        } catch {
          // e.g. a Content-Security-Policy without worker-src
          let terminated = false;
          queueMicrotask(() => terminated || onCrash());
          return { post() {}, terminate: () => (terminated = true) };
        }
        // Trust boundary: the worker is our own bundle, built from these types.
        worker.onmessage = (e: MessageEvent) => onMessage(e.data as FromEngine);
        worker.onerror = () => onCrash();
        return {
          post: (job) => worker.postMessage(job),
          terminate: () => worker.terminate(),
        };
      };
