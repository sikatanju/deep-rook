import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import type { Line } from '@/lib/chess/score';

import { FLUSH_MS, createAnalyzer } from './analyzer';
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
