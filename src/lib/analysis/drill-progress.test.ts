import 'fake-indexeddb/auto';

import { describe, expect, test } from 'vitest';

import { openIdbStore } from './cache';
import { drillsOf, type Drill } from './drill';
import {
  advance,
  memoryProgress,
  openIdbProgress,
  parseProgress,
  plan,
  type DrillProgress,
  type ProgressStore,
} from './drill-progress';
import { OPERA_SLIPS, stored } from './fixtures';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 25);

describe('advance', () => {
  test('a first-try solve climbs one box at a time, up to the last', () => {
    let progress: DrillProgress | undefined;
    const days: number[] = [];
    for (let i = 0; i < 7; i++) {
      progress = advance(progress, 'd', 'first-try', NOW)!;
      days.push((progress.due - NOW) / DAY);
    }
    expect(days).toEqual([1, 3, 7, 21, 60, 60, 60]);
    expect(progress).toEqual({
      id: 'd',
      box: 5,
      due: NOW + 60 * DAY,
      last: 'first-try',
      at: NOW,
    });
  });

  test('a retry comes back tomorrow, a shown answer at once, whatever the box', () => {
    const high = { id: 'd', box: 4, due: 0, last: 'first-try', at: 0 } as const;
    expect(advance(high, 'd', 'retry', NOW)).toMatchObject({
      box: 1,
      due: NOW + DAY,
      last: 'retry',
    });
    expect(advance(high, 'd', 'shown', NOW)).toMatchObject({
      box: 0,
      due: NOW,
      last: 'shown',
    });
  });

  test('a skip changes nothing', () => {
    expect(advance(undefined, 'd', 'skipped', NOW)).toBeNull();
  });
});

describe('plan', () => {
  // The Opera game's two Black drills: 4... Bxf3, then the cheaper 7... Qe7.
  const [costly, cheap] = drillsOf(stored(OPERA_SLIPS), [
    'Duke Karl / Count Isouard',
  ]) as [Drill, Drill];
  const at = (drill: Drill, box: number, due: number): DrillProgress => ({
    id: drill.id,
    box,
    due,
    last: box === 0 ? 'shown' : 'first-try',
    at: 0,
  });
  const ids = ({ due, later }: ReturnType<typeof plan>) => ({
    due: due.map((d) => d.id),
    later: later.map((d) => d.id),
  });

  test('with nothing answered every drill is due, in queue order', () => {
    expect(ids(plan([costly, cheap], new Map(), NOW))).toEqual({
      due: [costly.id, cheap.id],
      later: [],
    });
  });

  test('answered drills that are due come first, the most missed first', () => {
    const progress = new Map([
      [costly.id, at(costly, 2, NOW - DAY)],
      [cheap.id, at(cheap, 0, NOW)],
    ]);
    expect(ids(plan([costly, cheap], progress, NOW)).due).toEqual([
      cheap.id,
      costly.id,
    ]);
  });

  test('a resting drill waits until its day, soonest first', () => {
    const progress = new Map([
      [costly.id, at(costly, 3, NOW + 7 * DAY)],
      [cheap.id, at(cheap, 1, NOW + DAY)],
    ]);
    expect(ids(plan([costly, cheap], progress, NOW))).toEqual({
      due: [],
      later: [cheap.id, costly.id],
    });
    const oneAnswered = new Map([[cheap.id, at(cheap, 1, NOW + DAY)]]);
    expect(ids(plan([costly, cheap], oneAnswered, NOW))).toEqual({
      due: [costly.id],
      later: [cheap.id],
    });
  });
});

test('parseProgress keeps only well-formed records', () => {
  const good = { id: 'd', box: 2, due: 5, last: 'retry', at: 1 };
  expect(parseProgress(good)).toEqual(good);
  for (const bad of [
    null,
    'd',
    { ...good, id: 3 },
    { ...good, box: 6 },
    { ...good, box: -1 },
    { ...good, box: 1.5 },
    { ...good, due: Number.NaN },
    { ...good, last: 'skipped' },
  ])
    expect(parseProgress(bad)).toBeNull();
});

for (const [name, make] of [
  ['memoryProgress', memoryProgress],
  ['openIdbProgress', () => openIdbProgress()!],
] as const) {
  test(`${name} records answers on top of earlier ones, and clears`, async () => {
    const store: ProgressStore = make();
    await store.clear();
    await store.record('a', 'first-try', NOW);
    await store.record('a', 'first-try', NOW);
    await store.record('b', 'shown', NOW);
    await store.record('c', 'skipped', NOW);
    const byId = new Map((await store.list()).map((p) => [p.id, p]));
    expect([...byId.keys()].sort()).toEqual(['a', 'b']);
    expect(byId.get('a')).toMatchObject({ box: 2, due: NOW + 3 * DAY });
    expect(byId.get('b')).toMatchObject({ box: 0, due: NOW });

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  test(`${name} restores progress, keeping the later answer`, async () => {
    const store: ProgressStore = make();
    await store.clear();
    await store.record('a', 'first-try', NOW + 10);
    const entry = (id: string, box: number, at: number) => ({
      id,
      box,
      due: at,
      last: 'retry' as const,
      at,
    });
    await store.restore([entry('a', 5, NOW), entry('b', 3, NOW)]);
    const list = async () =>
      new Map((await store.list()).map((p) => [p.id, p]));
    expect((await list()).get('a')).toMatchObject({ box: 1 });
    expect((await list()).get('b')).toMatchObject({ box: 3 });
    await store.restore([entry('a', 4, NOW + 20)]);
    expect((await list()).get('a')).toMatchObject({ box: 4 });
  });
}

test('answers given at once all count', async () => {
  const store = openIdbProgress()!;
  await store.clear();
  await Promise.all([
    store.record('a', 'first-try', NOW),
    store.record('a', 'first-try', NOW),
  ]);
  expect(await store.list()).toMatchObject([{ id: 'a', box: 2 }]);
});

test('a database from before drill progress keeps its reviews and gains the store', async () => {
  indexedDB.deleteDatabase('deeprook');
  const review = stored();
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('deeprook', 1);
    open.onupgradeneeded = () =>
      open.result.createObjectStore('analyses', { keyPath: 'key' });
    open.onsuccess = () => {
      const tx = open.result.transaction('analyses', 'readwrite');
      tx.objectStore('analyses').put(review);
      tx.oncomplete = () => {
        open.result.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });

  const progress = openIdbProgress()!;
  await progress.record('a', 'retry', NOW);
  expect(await progress.list()).toMatchObject([{ id: 'a', box: 1 }]);
  expect(await openIdbStore()!.load(review.key)).toEqual(review);
});
