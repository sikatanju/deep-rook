import 'fake-indexeddb/auto';

import { expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import {
  CACHE_VERSION,
  gameKey,
  memoryStore,
  openIdbStore,
  parseStored,
  type StoredAnalysis,
} from './cache';
import { stored } from './fixtures';

const replay = parseReplay(OPERA_GAME);

test('the same game has the same key whatever its headers say', () => {
  const pasted = parseReplay('1. e4 e5 2. Nf3 d6 3. d4 Bg4 *');
  const chesscom = parseReplay(
    '[White "Someone"]\n[Black "Else"]\n[ECOUrl "https://www.chess.com/openings/Philidor"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 *',
  );
  expect(gameKey(pasted)).toBe(gameKey(chesscom));
});

test('different games have different keys, even when one is a prefix of the other', () => {
  const keys = new Set([
    gameKey(replay),
    gameKey(parseReplay('1. e4 e5 2. Nf3 d6 3. d4 Bg4 *')),
    gameKey(parseReplay('1. e4 e5 2. Nf3 d6 *')),
    gameKey(parseReplay('1. d4 d5 *')),
  ]);
  expect(keys.size).toBe(4);
});

test('a record that fits the contract is accepted, clock and all', () => {
  const record = stored();
  expect(parseStored(structuredClone(record))).toEqual(record);
});

test('every malformed record is a miss, never a throw', () => {
  const good = stored();
  const mate = { kind: 'mate', winner: 'w', moves: 2 };
  const withLine = (line: unknown): unknown => ({
    ...good,
    lines: [line, ...good.lines.slice(1)],
  });
  const withPly = (patch: object): unknown => ({
    ...good,
    replay: {
      ...good.replay,
      plies: [
        { ...good.replay.plies[0], ...patch },
        ...good.replay.plies.slice(1),
      ],
    },
  });
  const bad: Record<string, unknown> = {
    'not an object': 'nope',
    null: null,
    'an older version': { ...good, v: CACHE_VERSION - 1 },
    'a newer version': { ...good, v: CACHE_VERSION + 1 },
    'an unknown level': { ...good, level: 'turbo' },
    'a prototype-key level': { ...good, level: 'constructor' },
    'no key': { ...good, key: undefined },
    'a missing timestamp': { ...good, analyzedAt: undefined },
    'a non-finite timestamp': { ...good, analyzedAt: Number.NaN },
    'a line too few': { ...good, lines: good.lines.slice(1) },
    'a line too many': { ...good, lines: [...good.lines, good.lines[0]] },
    'lines that are not an array': { ...good, lines: {} },
    'a line that is null': withLine(null),
    'a line with no depth': withLine({ score: { kind: 'cp', cp: 1 }, pv: [] }),
    'a line with a non-numeric cp': withLine({
      score: { kind: 'cp', cp: '1' },
      pv: [],
      depth: 1,
    }),
    'a line with an unknown score kind': withLine({
      score: { kind: 'wdl' },
      pv: [],
      depth: 1,
    }),
    'a mate with no winner': withLine({
      score: { ...mate, winner: 'x' },
      pv: [],
      depth: 1,
    }),
    'a pv of numbers': withLine({
      score: { kind: 'cp', cp: 1 },
      pv: [1],
      depth: 1,
    }),
    'a replay that is a string': { ...good, replay: 'e4' },
    'a replay with no start': { ...good, replay: { ...good.replay, start: 1 } },
    'headers with a non-string value': {
      ...good,
      replay: { ...good.replay, headers: { White: 1 } },
    },
    'a ply with a bad square': withPly({ from: 'z9' }),
    'a ply with a bad color': withPly({ color: 'x' }),
    'a ply with a non-boolean check': withPly({ check: 'yes' }),
    'a ply with a text clock': withPly({ clock: 'fast' }),
  };
  for (const [name, raw] of Object.entries(bad))
    expect(parseStored(raw), name).toBeNull();
});

test('a mate score round-trips', () => {
  const record = stored();
  record.lines[3] = {
    score: { kind: 'mate', winner: 'b', moves: 0 },
    pv: [],
    depth: 4,
  };
  expect(parseStored(structuredClone(record))).toEqual(record);
});

const stores = [
  ['memoryStore', memoryStore],
  ['openIdbStore', () => openIdbStore()!],
] as const;

for (const [name, make] of stores) {
  test(`${name} saves, loads, lists newest first and clears`, async () => {
    const store = make();
    await store.clear();
    const other = parseReplay('1. d4 d5 2. c4 e6 *');
    const older = stored({ analyzedAt: 10 });
    const newer = stored({ replay: other, analyzedAt: 20 });

    expect(await store.load(older.key)).toBeNull();
    await store.save(older);
    await store.save(newer);

    expect(await store.load(older.key)).toEqual(older);
    expect((await store.list()).map((r) => r.key)).toEqual([
      newer.key,
      older.key,
    ]);

    await store.clear();
    expect(await store.list()).toEqual([]);
    expect(await store.load(older.key)).toBeNull();
  });

  test(`${name} never downgrades a record, and upgrades one`, async () => {
    const store = make();
    await store.clear();
    const at = (level: StoredAnalysis['level'], analyzedAt: number) =>
      stored({ level, analyzedAt });

    await store.save(at('balanced', 1));
    await store.save(at('fast', 2));
    expect(await store.load(at('fast', 0).key)).toMatchObject({
      level: 'balanced',
      analyzedAt: 1,
    });

    await store.save(at('deep', 3));
    expect(await store.load(at('fast', 0).key)).toMatchObject({
      level: 'deep',
    });
    expect(await store.list()).toHaveLength(1);
  });
}

test('openIdbStore treats a corrupt record as absent', async () => {
  const store = openIdbStore()!;
  await store.clear();
  const good = stored();
  await store.save(good);
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('deeprook', 1);
    open.onsuccess = () => {
      const tx = open.result.transaction('analyses', 'readwrite');
      tx.objectStore('analyses').put({ ...good, lines: [] });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
  expect(await store.load(good.key)).toBeNull();
  expect(await store.list()).toEqual([]);
});

test('openIdbStore is null where there is no IndexedDB', () => {
  const real = globalThis.indexedDB;
  // @ts-expect-error simulating a browser without IndexedDB
  delete globalThis.indexedDB;
  try {
    expect(openIdbStore()).toBeNull();
  } finally {
    globalThis.indexedDB = real;
  }
});
