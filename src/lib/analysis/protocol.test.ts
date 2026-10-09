import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

test('a Worker constructor that throws reports a crash instead', async () => {
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new Error('blocked by worker-src');
      }
    },
  );
  const { spawnWorkerLane } = await import('./protocol');
  const onCrash = vi.fn();
  const lane = spawnWorkerLane!(() => {}, onCrash);
  lane.post({ jobId: 1, fen: '', history: [], depth: 1, nodes: 1, maxMs: 1 });
  await Promise.resolve();
  expect(onCrash).toHaveBeenCalledOnce();
});
