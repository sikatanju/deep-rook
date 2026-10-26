import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import type { Line } from '@/lib/chess/score';

import { CACHE_LOAD_MS, FLUSH_MS, createAnalyzer } from './analyzer';
import { gameKey, memoryStore, type StoredAnalysis } from './cache';
import { stored } from './fixtures';
import type { FromEngine, Job, SpawnLane } from './protocol';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Lanes the test answers by hand. */
function scripted() {
  const lanes: {
    jobs: Job[];
    send: (m: FromEngine) => void;
    crash: () => void;
    terminated: boolean;
  }[] = [];
  const spawn: SpawnLane = (onMessage, onCrash) => {
    const lane = {
      jobs: [] as Job[],
      send: onMessage,
      crash: onCrash,
      terminated: false,
    };
    lanes.push(lane);
    return {
      post: (job) => lane.jobs.push(job),
      terminate: () => (lane.terminated = true),
    };
  };
  return { lanes, spawn };
}

const line = (depth: number, cp = 10): Line => ({
  score: { kind: 'cp', cp },
  pv: ['e2e4'],
  depth,
});
const done = (job: Job, depth: number): FromEngine => ({
  kind: 'done',
  jobId: job.jobId,
  outcome: { line: line(depth), reason: 'depth', nodes: 1, ms: 1 },
});

const game = { id: 1, replay: parseReplay(OPERA_GAME) };

test('focus is searched first and streams into the document', () => {
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'balanced', spawn, lanes: 2 });
  analyzer.view(game, 5);
  const focusJob = lanes[0]!.jobs[0]!;
  expect(focusJob).toMatchObject({ fen: game.replay.plies[4]!.fen, depth: 12 });

  lanes[0]!.send({ kind: 'line', jobId: focusJob.jobId, line: line(7) });
  vi.advanceTimersByTime(FLUSH_MS);
  expect(analyzer.getSnapshot()!.positions[5]).toEqual({
    status: 'searching',
    line: line(7),
  });

  lanes[0]!.send(done(focusJob, 12));
  vi.advanceTimersByTime(FLUSH_MS);
  expect(analyzer.getSnapshot()!.positions[5]).toEqual({
    status: 'done',
    line: line(12),
  });
});

test('a new game terminates running jobs and ignores their late messages', () => {
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 1 });
  analyzer.view(game, 0);
  const stale = lanes[0]!.jobs[0]!;
  analyzer.view({ ...game, id: 2 }, 0);
  expect(lanes[0]!.terminated).toBe(true);

  lanes[0]!.send(done(stale, 8));
  vi.advanceTimersByTime(FLUSH_MS);
  const snap = analyzer.getSnapshot()!;
  expect(snap.gameId).toBe(2);
  expect(snap.positions[0]!.status).toBe('searching');
  expect(lanes[1]!.jobs[0]!.jobId).not.toBe(stale.jobId);
});

test('raising the level keeps the old line visible while it re-searches', () => {
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 1 });
  analyzer.view(game, 0);
  lanes[0]!.send(done(lanes[0]!.jobs[0]!, 8)); // the lane moves on to position 1
  vi.advanceTimersByTime(200); // the user has been looking at position 0 a while
  analyzer.setLevel('deep');
  vi.advanceTimersByTime(FLUSH_MS);
  expect(analyzer.getSnapshot()!.positions[0]).toEqual({
    status: 'searching',
    line: line(8),
  });
  expect(lanes.at(-1)!.jobs.at(-1)).toMatchObject({ depth: 16 }); // preemption respawned the lane
});

test('lowering the level keeps deeper results as done', () => {
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'deep', spawn, lanes: 1 });
  analyzer.view(game, 0);
  lanes[0]!.send(done(lanes[0]!.jobs[0]!, 16));
  analyzer.setLevel('fast');
  vi.advanceTimersByTime(FLUSH_MS);
  expect(analyzer.getSnapshot()!.positions[0]).toEqual({
    status: 'done',
    line: line(16),
  });
});

test('lines never get shallower', () => {
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'deep', spawn, lanes: 1 });
  analyzer.view(game, 0);
  const job = lanes[0]!.jobs[0]!;
  lanes[0]!.send({ kind: 'line', jobId: job.jobId, line: line(9) });
  lanes[0]!.send({ kind: 'line', jobId: job.jobId, line: line(4) });
  vi.advanceTimersByTime(FLUSH_MS);
  expect(analyzer.getSnapshot()!.positions[0]).toMatchObject({
    line: { depth: 9 },
  });
});

test('stepping around a busy pool preempts slot 0 only after the dwell', () => {
  vi.spyOn(performance, 'now').mockReturnValue(0); // a coarse clock must not stall the dwell
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 1 });
  analyzer.view(game, 0);
  analyzer.view(game, 1);
  analyzer.view(game, 2);
  expect(lanes[0]!.terminated).toBe(false);
  vi.advanceTimersByTime(200);
  expect(lanes[0]!.terminated).toBe(true);
  expect(lanes[1]!.jobs[0]).toMatchObject({ fen: game.replay.plies[1]!.fen });
});

test('jobs carry game history back to the last irreversible move', () => {
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 1 });
  // 1. Nf3 Nf6 2. Ng1 Ng8: the start position repeats.
  analyzer.view({ id: 3, replay: parseReplay('1. Nf3 Nf6 2. Ng1 Ng8 *') }, 4);
  const job = lanes[0]!.jobs[0]!;
  expect(job.history).toHaveLength(4);
  expect(job.history[0]).toBe(parseReplay('1. Nf3 *').start);
});

test('no Worker means the engine is unavailable, not thinking forever', () => {
  const analyzer = createAnalyzer({ level: 'fast', spawn: null });
  analyzer.view(game, 0);
  vi.advanceTimersByTime(FLUSH_MS);
  expect(analyzer.getSnapshot()).toMatchObject({ unavailable: true, done: 0 });
});

test('a worker that never loads makes the engine unavailable after a few tries', () => {
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 1 });
  analyzer.view(game, 0);
  for (let i = 0; i < 10 && lanes.at(-1)!.terminated === false; i++)
    lanes.at(-1)!.crash();
  vi.advanceTimersByTime(FLUSH_MS);
  expect(analyzer.getSnapshot()!.unavailable).toBe(true);
  expect(lanes).toHaveLength(5);
});

test('a position that keeps crashing its worker fails; the rest continue', () => {
  const { lanes, spawn } = scripted();
  const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 1 });
  analyzer.view(game, 0);
  lanes[0]!.send({
    kind: 'line',
    jobId: lanes[0]!.jobs[0]!.jobId,
    line: line(1),
  });
  lanes[0]!.crash();
  expect(lanes[0]!.terminated).toBe(true);
  lanes[1]!.crash();
  vi.advanceTimersByTime(FLUSH_MS);
  const snap = analyzer.getSnapshot()!;
  expect(snap.positions[0]).toEqual({ status: 'failed' });
  expect(snap.unavailable).toBe(false);
  expect(lanes).toHaveLength(3);
  expect(lanes[2]!.jobs[0]).toMatchObject({ fen: game.replay.plies[0]!.fen });
});

describe('saved analyses', () => {
  type Lanes = ReturnType<typeof scripted>['lanes'];

  /** Answers every job the pool posts, `failing` jobs with a failure, until it goes quiet. */
  function drain(lanes: Lanes, failing = 0) {
    const answered = new Set<number>();
    for (let busy = true; busy;) {
      busy = false;
      for (const lane of lanes) {
        const job = lane.jobs.at(-1);
        if (!job || answered.has(job.jobId)) continue;
        answered.add(job.jobId);
        busy = true;
        lane.send(
          answered.size <= failing
            ? { kind: 'failed', jobId: job.jobId, message: 'boom' }
            : done(job, job.depth),
        );
      }
    }
  }

  const settleAll = () => vi.advanceTimersByTimeAsync(FLUSH_MS);
  const jobsPosted = (lanes: Lanes) =>
    lanes.reduce((n, lane) => n + lane.jobs.length, 0);
  const total = game.replay.plies.length + 1;

  test('drop forgets the game, so a search that finishes afterwards is not saved', async () => {
    const store = memoryStore();
    const { lanes, spawn } = scripted();
    const analyzer = createAnalyzer({
      level: 'fast',
      spawn,
      lanes: 2,
      store,
    });
    analyzer.view(game, 0);
    await settleAll();
    analyzer.drop();
    drain(lanes);
    await settleAll();
    expect(analyzer.getSnapshot()).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  test('a game reviewed once reopens complete with no engine work', async () => {
    const store = memoryStore();
    const first = scripted();
    const before = createAnalyzer({
      level: 'balanced',
      spawn: first.spawn,
      lanes: 2,
      store,
    });
    before.view(game, 0);
    await settleAll();
    drain(first.lanes);
    await settleAll();

    // A refresh: a new analyzer, a new game id, the same game.
    const second = scripted();
    const after = createAnalyzer({
      level: 'balanced',
      spawn: second.spawn,
      lanes: 2,
      store,
    });
    after.view({ ...game, id: 2 }, 0);
    await settleAll();

    expect(jobsPosted(second.lanes)).toBe(0);
    expect(after.getSnapshot()).toMatchObject({ gameId: 2, done: total });
    expect(after.getSnapshot()!.positions[5]!.status).toBe('done');
  });

  test('a lower-level hit shows its lines at once and searches each position once, at the new level', async () => {
    const store = memoryStore();
    await store.save(stored({ level: 'fast' }));
    const { lanes, spawn } = scripted();
    const analyzer = createAnalyzer({
      level: 'balanced',
      spawn,
      lanes: 3,
      store,
    });
    analyzer.view(game, 0);
    await settleAll();

    const shown = analyzer.getSnapshot()!;
    expect(shown.done).toBe(0);
    expect(shown.positions.every((p) => p.status !== 'failed' && p.line)).toBe(
      true,
    );

    drain(lanes);
    await settleAll();
    expect(lanes.flatMap((l) => l.jobs).map((j) => j.depth)).toEqual(
      Array(total).fill(12),
    );
    expect(analyzer.getSnapshot()!.done).toBe(total);
    expect((await store.load(gameKey(game.replay)))!.level).toBe('balanced');
  });

  test('a finished game is saved once, and again only when it reaches a higher level', async () => {
    const store = memoryStore();
    const save = vi.spyOn(store, 'save');
    const { lanes, spawn } = scripted();
    const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 2, store });
    analyzer.view(game, 0);
    await settleAll();
    expect(save).not.toHaveBeenCalled();

    drain(lanes);
    await settleAll();
    expect(save).toHaveBeenCalledOnce();
    const record = save.mock.calls[0]![0] as StoredAnalysis;
    expect(record).toMatchObject({ level: 'fast', key: gameKey(game.replay) });
    expect(record.lines).toHaveLength(total);

    analyzer.setLevel('fast');
    analyzer.view(game, 3);
    await settleAll();
    expect(save).toHaveBeenCalledOnce();

    analyzer.setLevel('deep');
    drain(lanes);
    await settleAll();
    expect(save).toHaveBeenCalledTimes(2);
    expect((await store.load(record.key))!.level).toBe('deep');

    analyzer.setLevel('fast');
    await settleAll();
    expect(save).toHaveBeenCalledTimes(2);
  });

  test('a position the engine failed on keeps the game from being saved', async () => {
    const store = memoryStore();
    const save = vi.spyOn(store, 'save');
    const { lanes, spawn } = scripted();
    const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 2, store });
    analyzer.view(game, 0);
    await settleAll();
    drain(lanes, 1);
    await settleAll();

    expect(analyzer.getSnapshot()!.done).toBe(total);
    expect(save).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
  });

  test('a lookup that never answers does not stall the engine', async () => {
    const store = {
      ...memoryStore(),
      load: () => new Promise<never>(() => {}),
    };
    const { lanes, spawn } = scripted();
    const analyzer = createAnalyzer({ level: 'fast', spawn, lanes: 1, store });
    analyzer.view(game, 0);

    await vi.advanceTimersByTimeAsync(CACHE_LOAD_MS - 1);
    expect(jobsPosted(lanes)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(jobsPosted(lanes)).toBe(1);
  });

  test('a hit that arrives after the timeout still fills the document', async () => {
    const store = memoryStore();
    await store.save(stored({ level: 'fast' }));
    const slow = {
      ...store,
      load: (key: Parameters<typeof store.load>[0]) =>
        new Promise<StoredAnalysis | null>((resolve) =>
          setTimeout(() => resolve(store.load(key)), CACHE_LOAD_MS + 500),
        ),
    };
    const { lanes, spawn } = scripted();
    const analyzer = createAnalyzer({
      level: 'fast',
      spawn,
      lanes: 1,
      store: slow,
    });
    analyzer.view(game, 0);

    await vi.advanceTimersByTimeAsync(CACHE_LOAD_MS);
    expect(jobsPosted(lanes)).toBe(1);
    await vi.advanceTimersByTimeAsync(500 + FLUSH_MS);
    expect(analyzer.getSnapshot()).toMatchObject({ done: total });
  });

  test('a lookup that fails, or returns another game, is a miss', async () => {
    const rejecting = {
      ...memoryStore(),
      load: () => Promise.reject(new Error('idb')),
    };
    const wrong = {
      ...memoryStore(),
      load: async () => stored({ replay: parseReplay('1. d4 d5 *') }),
    };
    for (const store of [rejecting, wrong]) {
      const { lanes, spawn } = scripted();
      const analyzer = createAnalyzer({
        level: 'fast',
        spawn,
        lanes: 1,
        store,
      });
      analyzer.view(game, 0);
      await settleAll();
      expect(jobsPosted(lanes)).toBe(1);
      expect(analyzer.getSnapshot()!.done).toBe(0);
    }
  });
});
