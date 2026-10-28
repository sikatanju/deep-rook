import { beforeEach, expect, test } from 'vitest';

import {
  clearStreak,
  current,
  loadStreak,
  mark,
  saveStreak,
} from './drill-streak';

const at = (month: number, day: number, hour = 12) =>
  new Date(2026, month - 1, day, hour).getTime();

beforeEach(() => localStorage.clear());

test('answering on consecutive days grows the run, and a second answer the same day does not', () => {
  let s = mark(null, at(3, 30));
  expect(s).toEqual({ last: '2026-03-30', run: 1 });
  s = mark(s, at(3, 30, 23));
  expect(s.run).toBe(1);
  s = mark(s, at(3, 31, 0));
  s = mark(s, at(4, 1));
  expect(s).toEqual({ last: '2026-04-01', run: 3 });
});

test('a missed day starts the run again', () => {
  const s = mark({ last: '2026-03-30', run: 5 }, at(4, 1));
  expect(s).toEqual({ last: '2026-04-01', run: 1 });
});

test('a run stays alive through the day after it, and no longer', () => {
  const have = { last: '2026-03-30', run: 4 };
  expect(current(have, at(3, 30))).toEqual({ run: 4, today: true });
  expect(current(have, at(3, 31, 23))).toEqual({ run: 4, today: false });
  expect(current(have, at(4, 1))).toEqual({ run: 0, today: false });
  expect(current(null, at(4, 1))).toEqual({ run: 0, today: false });
});

test('the streak survives a reload, and corrupt storage reads as none', () => {
  saveStreak({ last: '2026-03-30', run: 2 });
  expect(loadStreak()).toEqual({ last: '2026-03-30', run: 2 });
  localStorage.setItem('drillStreak', '{"last":"today","run":2}');
  expect(loadStreak()).toBeNull();
  localStorage.setItem('drillStreak', 'nope');
  expect(loadStreak()).toBeNull();
  saveStreak({ last: '2026-03-30', run: 2 });
  clearStreak();
  expect(loadStreak()).toBeNull();
});
