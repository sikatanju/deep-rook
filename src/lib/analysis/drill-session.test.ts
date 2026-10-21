import { expect, test } from 'vitest';

import {
  start,
  step,
  summary,
  type Action,
  type Session,
} from './drill-session';

const TOTAL = 3;

function run(...actions: Action[]): Session {
  return actions.reduce((s, a) => step(s, a, TOTAL), start());
}

const best: Action = { type: 'answer', verdict: 'best' };
const played: Action = { type: 'answer', verdict: 'played' };
const other: Action = { type: 'answer', verdict: 'other' };
const show: Action = { type: 'show' };
const skip: Action = { type: 'skip' };
const next: Action = { type: 'next' };

test('a first-try solve records first-try and waits for next', () => {
  const solved = run(best);
  expect(solved).toEqual({
    at: 0,
    phase: 'solved',
    tries: 0,
    results: ['first-try'],
  });
  expect(step(solved, next, TOTAL)).toEqual({
    at: 1,
    phase: 'asking',
    tries: 0,
    results: ['first-try'],
  });
});

test('wrong answers count tries, and a later solve is a retry', () => {
  const wrong = run(played, other);
  expect(wrong).toMatchObject({ at: 0, phase: 'wrong', tries: 2, results: [] });
  expect(step(wrong, best, TOTAL)).toMatchObject({
    phase: 'solved',
    results: ['retry'],
  });
});

test('wrong then show records shown', () => {
  expect(run(other, show)).toMatchObject({
    phase: 'shown',
    results: ['shown'],
  });
  expect(run(show)).toMatchObject({ phase: 'shown', results: ['shown'] });
});

test('skip records skipped and moves straight on, from asking or wrong', () => {
  expect(run(skip)).toEqual({
    at: 1,
    phase: 'asking',
    tries: 0,
    results: ['skipped'],
  });
  expect(run(other, skip)).toEqual({
    at: 1,
    phase: 'asking',
    tries: 0,
    results: ['skipped'],
  });
});

test('actions out of place return the same session', () => {
  const asking = start();
  expect(step(asking, next, TOTAL)).toBe(asking);
  const wrong = run(other);
  expect(step(wrong, next, TOTAL)).toBe(wrong);
  const solved = run(best);
  for (const action of [best, other, show, skip])
    expect(step(solved, action, TOTAL)).toBe(solved);
  const shown = run(show);
  for (const action of [best, show, skip])
    expect(step(shown, action, TOTAL)).toBe(shown);
});

test('a finished session ignores everything', () => {
  const done = run(skip, skip, skip);
  expect(done.at).toBe(TOTAL);
  for (const action of [best, other, show, skip, next])
    expect(step(done, action, TOTAL)).toBe(done);
});

test('summary counts each result', () => {
  const s = run(best, next, other, best, next, show, next);
  expect(summary(s)).toEqual({
    'first-try': 1,
    retry: 1,
    shown: 1,
    skipped: 0,
  });
  expect(summary(start())).toEqual({
    'first-try': 0,
    retry: 0,
    shown: 0,
    skipped: 0,
  });
});
