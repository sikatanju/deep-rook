import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { Line } from '@/lib/chess/score';

import { FLUSH_MS } from './analyzer';
import { PROBE_DWELL_MS, createProbe } from './probe';
import type { FromEngine, Job, SpawnLane } from './protocol';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

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
const finish = (job: Job, depth: number): FromEngine => ({
  kind: 'done',
  jobId: job.jobId,
  outcome: { line: line(depth), reason: 'depth', nodes: 1, ms: 1 },
});
const a = { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', history: [] };
const b = { fen: '8/8/8/8/8/8/8/1K5k w - - 1 2', history: [a.fen] };

const settle = () => vi.advanceTimersByTime(PROBE_DWELL_MS + FLUSH_MS);

test('searches after a short dwell, at the level limits, and streams', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(b);
  expect(lanes).toHaveLength(0);

  settle();
  expect(lanes[0]!.jobs[0]).toMatchObject({
    fen: b.fen,
    history: b.history,
    depth: 8,
  });
  lanes[0]!.send({
    kind: 'line',
    jobId: lanes[0]!.jobs[0]!.jobId,
    line: line(3),
  });
  vi.advanceTimersByTime(FLUSH_MS);
  expect(probe.getSnapshot()).toMatchObject({
    fen: b.fen,
    line: line(3),
    done: false,
  });

  lanes[0]!.send(finish(lanes[0]!.jobs[0]!, 8));
  vi.advanceTimersByTime(FLUSH_MS);
  const snap = probe.getSnapshot();
  expect(snap).toMatchObject({ line: line(8), done: true });
  expect(snap.settled.get(b.fen)).toEqual(line(8));
});

test('moving on before the dwell ends never starts a search', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(a);
  vi.advanceTimersByTime(PROBE_DWELL_MS - 10);
  probe.look(b);
  settle();
  expect(lanes).toHaveLength(1);
  expect(lanes[0]!.jobs.map((j) => j.fen)).toEqual([b.fen]);
});

test('redirecting terminates the running search and drops its late answer', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(a);
  settle();
  const stale = lanes[0]!.jobs[0]!;
  probe.look(b);
  expect(lanes[0]!.terminated).toBe(true);

  lanes[0]!.send(finish(stale, 8));
  settle();
  expect(probe.getSnapshot()).toMatchObject({ fen: b.fen, line: null });
  expect(probe.getSnapshot().settled.size).toBe(0);
  expect(lanes[1]!.jobs[0]!.fen).toBe(b.fen);
});

test('a finished position is answered from memory when asked again', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(a);
  settle();
  lanes[0]!.send(finish(lanes[0]!.jobs[0]!, 8));
  probe.look(b);
  probe.look(a);
  vi.advanceTimersByTime(FLUSH_MS);
  expect(probe.getSnapshot()).toMatchObject({
    fen: a.fen,
    line: line(8),
    done: true,
  });
  settle();
  expect(
    lanes.flatMap((l) => l.jobs).filter((j) => j.fen === a.fen),
  ).toHaveLength(1);
});

test('looking at the same position again changes nothing', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(a);
  settle();
  probe.look({ ...a });
  settle();
  expect(lanes[0]!.jobs).toHaveLength(1);
  expect(lanes[0]!.terminated).toBe(false);
});

test('null goes idle and cancels', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(a);
  settle();
  probe.look(null);
  vi.advanceTimersByTime(FLUSH_MS);
  expect(lanes[0]!.terminated).toBe(true);
  expect(probe.getSnapshot()).toMatchObject({ fen: null, line: null });
});

test('a new level forgets old lines and searches again', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(a);
  settle();
  lanes[0]!.send(finish(lanes[0]!.jobs[0]!, 8));
  probe.setLevel('balanced');
  settle();
  expect(probe.getSnapshot().settled.size).toBe(0);
  expect(lanes.flatMap((l) => l.jobs).at(-1)).toMatchObject({
    fen: a.fen,
    depth: 12,
  });
});

test('a crashed lane marks the engine unavailable until the next look', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(a);
  settle();
  lanes[0]!.crash();
  vi.advanceTimersByTime(FLUSH_MS);
  expect(probe.getSnapshot().unavailable).toBe(true);
  probe.look(b);
  vi.advanceTimersByTime(FLUSH_MS);
  expect(probe.getSnapshot().unavailable).toBe(false);
});

test('without a worker the probe is unavailable and quiet', () => {
  const probe = createProbe({ level: 'fast', spawn: null });
  probe.look(a);
  settle();
  expect(probe.getSnapshot()).toMatchObject({ unavailable: true, line: null });
});

test('the lane is reused: a second position searched on it still answers', () => {
  const { lanes, spawn } = scripted();
  const probe = createProbe({ level: 'fast', spawn });
  probe.look(a);
  settle();
  lanes[0]!.send(finish(lanes[0]!.jobs[0]!, 8));

  probe.look(b);
  settle();
  expect(lanes).toHaveLength(1);
  lanes[0]!.send(finish(lanes[0]!.jobs[1]!, 9));
  vi.advanceTimersByTime(FLUSH_MS);
  expect(probe.getSnapshot()).toMatchObject({
    fen: b.fen,
    line: line(9),
    done: true,
  });
  expect(probe.getSnapshot().settled.get(b.fen)).toEqual(line(9));
  expect(probe.getSnapshot().settled.get(a.fen)).toEqual(line(8));
});
