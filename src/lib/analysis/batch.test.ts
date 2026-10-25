import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { parseReplay } from '@/lib/chess/replay';

import { createAnalyzer } from './analyzer';
import { createBatch, type BatchGame } from './batch';
import { gameKey, memoryStore } from './cache';
import type { GameAnalysis } from './game-analysis';
import type { SpawnLane } from './protocol';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Lanes that answer every job 10 ms later; `posted` counts the jobs. */
function engine() {
  const state = { posted: 0 };
  const spawn: SpawnLane = (onMessage) => {
    let dead = false;
    return {
      post(job) {
        state.posted++;
        setTimeout(() => {
          if (dead) return;
          onMessage({
            kind: 'done',
            jobId: job.jobId,
            outcome: {
              line: { score: { kind: 'cp', cp: 0 }, pv: [], depth: 1 },
              reason: 'depth',
              nodes: 1,
              ms: 1,
            },
          });
        }, 10);
      },
      terminate: () => (dead = true),
    };
  };
  return { spawn, state };
}

/** A review on screen whose progress the test sets. */
function screenReview() {
  let snapshot: GameAnalysis | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    set(done: number) {
      snapshot = {
        gameId: 99,
        level: 'fast',
        positions: Array.from({ length: 3 }, (_, i) =>
          i < done
            ? {
                status: 'done',
                line: { score: { kind: 'cp', cp: 0 }, pv: [], depth: 1 },
              }
            : { status: 'queued', line: null },
        ),
        done,
        unavailable: false,
      };
      listeners.forEach((l) => l());
    },
  };
}

const games: BatchGame[] = [
  { id: 'a', label: 'Ann vs Bob', pgn: '1. e4 e5 2. Nf3 Nc6' },
  { id: 'b', label: 'Cy vs Di', pgn: '1. d4 d5 2. c4' },
];
const keyOf = (pgn: string) => gameKey(parseReplay(pgn));

function setup(spawn: SpawnLane | null = engine().spawn) {
  const store = memoryStore();
  const foreground = screenReview();
  const batch = createBatch({
    analyzer: createAnalyzer({ level: 'fast', spawn, store, lanes: 2 }),
    foreground,
  });
  return { store, foreground, batch };
}

const ended = (phase: string) =>
  phase === 'finished' || phase === 'cancelled' || phase === 'unavailable';

async function untilEnded(batch: ReturnType<typeof setup>['batch']) {
  for (let i = 0; i < 500 && !ended(batch.getSnapshot().phase); i++)
    await vi.advanceTimersByTimeAsync(20);
}

const savedKeys = async (store: ReturnType<typeof memoryStore>) =>
  (await store.list()).map((r) => r.key).sort();

test('analyzes each game in turn and saves it', async () => {
  const { store, batch } = setup();
  batch.start(games, 'fast');
  expect(batch.getSnapshot()).toEqual({
    phase: 'running',
    level: 'fast',
    total: 2,
    finished: 0,
    failed: 0,
    current: { id: 'a', label: 'Ann vs Bob', done: 0, positions: 5 },
  });

  await untilEnded(batch);
  expect(batch.getSnapshot()).toEqual({
    phase: 'finished',
    level: 'fast',
    total: 2,
    finished: 2,
    failed: 0,
  });
  expect(await savedKeys(store)).toEqual(games.map((g) => keyOf(g.pgn)).sort());
  expect((await store.list()).every((r) => r.level === 'fast')).toBe(true);
});

test('a game that cannot be read counts as failed and the rest go on', async () => {
  const { store, batch } = setup();
  batch.start([{ id: 'x', label: 'Bad', pgn: '1. e4 e4' }, games[1]!], 'fast');
  await untilEnded(batch);
  expect(batch.getSnapshot()).toMatchObject({
    phase: 'finished',
    finished: 2,
    failed: 1,
  });
  expect(await savedKeys(store)).toEqual([keyOf(games[1]!.pgn)]);
});

test('gives way to the review on screen, then picks the game back up', async () => {
  const { spawn, state } = engine();
  const { store, foreground, batch } = setup(spawn);
  foreground.set(1);
  batch.start(games, 'fast');
  expect(batch.getSnapshot()).toMatchObject({
    phase: 'yielding',
    current: { id: 'a' },
  });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(state.posted).toBe(0);
  expect(await store.list()).toEqual([]);

  foreground.set(3);
  expect(batch.getSnapshot().phase).toBe('running');
  await untilEnded(batch);
  expect(batch.getSnapshot()).toMatchObject({ phase: 'finished', finished: 2 });
  expect(await store.list()).toHaveLength(2);
});

test('the review on screen taking over mid-game parks the batch', async () => {
  const { spawn, state } = engine();
  const { store, foreground, batch } = setup(spawn);
  batch.start(games, 'fast');
  await vi.advanceTimersByTimeAsync(15);
  foreground.set(0);
  expect(batch.getSnapshot().phase).toBe('yielding');
  const posted = state.posted;
  await vi.advanceTimersByTimeAsync(2_000);
  expect(state.posted).toBe(posted);
  expect(await store.list()).toEqual([]);

  foreground.set(3);
  await untilEnded(batch);
  expect(await store.list()).toHaveLength(2);
});

test('cancel keeps the games already saved and drops the rest', async () => {
  const { store, batch } = setup();
  batch.start(games, 'fast');
  const counted = () => {
    const now = batch.getSnapshot();
    return now.phase !== 'idle' && now.finished === 1;
  };
  for (let i = 0; i < 200 && !counted(); i++)
    await vi.advanceTimersByTimeAsync(10);
  batch.cancel();
  expect(batch.getSnapshot()).toMatchObject({
    phase: 'cancelled',
    finished: 1,
  });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(await savedKeys(store)).toEqual([keyOf(games[0]!.pgn)]);
});

test('without an engine the batch says so', async () => {
  const { batch } = setup(null);
  batch.start(games, 'fast');
  await untilEnded(batch);
  expect(batch.getSnapshot()).toMatchObject({
    phase: 'unavailable',
    finished: 0,
  });
});
