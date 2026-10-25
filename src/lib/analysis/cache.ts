// Finished analyses, kept in IndexedDB so reopening a game or refreshing the
// tab never recomputes one. The stored lines are only valid for the engine that
// produced them: bump CACHE_VERSION whenever the engine, its evaluation or the
// Line shape changes, and every old record becomes a miss.
//
// The cache is an optimization, never a dependency. Every failure (no
// IndexedDB, blocked storage, quota, a corrupt record) resolves like a miss.

import { fenAt, type Ply, type Replay } from '@/lib/chess/replay';
import type { Line, Variation } from '@/lib/chess/score';

import { openIdb } from './idb';
import { isAnalysisLevel, rank, type AnalysisLevel } from './levels';

export type GameKey = string & { readonly __brand: 'GameKey' };

export const CACHE_VERSION = 2;

export type StoredAnalysis = {
  v: typeof CACHE_VERSION;
  key: GameKey;
  /** The lowest level every position settled at. */
  level: AnalysisLevel;
  /** `replay.plies.length + 1` entries, one per position. */
  lines: Line[];
  replay: Replay;
  /** ms since the epoch. */
  analyzedAt: number;
};

export type AnalysisStore = {
  load(key: GameKey): Promise<StoredAnalysis | null>;
  /** Never downgrades: a record already at a higher level stays. */
  save(record: StoredAnalysis): Promise<void>;
  /** Newest first. */
  list(): Promise<StoredAnalysis[]>;
  clear(): Promise<void>;
};

/** cyrb53: a fast, well-mixed 53-bit string hash. Not cryptographic; it only names a game. */
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Names a game by its positions, so the same game reached from Chess.com or a
 * pasted PGN, with whatever headers, finds the same record.
 */
export function gameKey(replay: Replay): GameKey {
  const fens = Array.from({ length: replay.plies.length + 1 }, (_, i) =>
    fenAt(replay, i),
  );
  return cyrb53(fens.join('\n')).toString(36) as GameKey;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isColor = (value: unknown) => value === 'w' || value === 'b';
const isSquare = (value: unknown) =>
  typeof value === 'string' && /^[a-h][1-8]$/.test(value);

function isVariation(value: unknown): value is Variation {
  if (!isRecord(value)) return false;
  const { score, pv } = value;
  if (!isRecord(score)) return false;
  if (!Array.isArray(pv) || !pv.every((m) => typeof m === 'string'))
    return false;
  return score.kind === 'cp'
    ? isNumber(score.cp)
    : score.kind === 'mate' && isColor(score.winner) && isNumber(score.moves);
}

function isLine(value: unknown): value is Line {
  if (!isRecord(value)) return false;
  const { depth, second } = value;
  return (
    isVariation(value) &&
    isNumber(depth) &&
    (second === undefined || isVariation(second))
  );
}

function isPly(value: unknown): value is Ply {
  return (
    isRecord(value) &&
    typeof value.fen === 'string' &&
    typeof value.san === 'string' &&
    isSquare(value.from) &&
    isSquare(value.to) &&
    typeof value.check === 'boolean' &&
    isColor(value.color) &&
    isNumber(value.moveNumber) &&
    (value.clock === undefined || isNumber(value.clock))
  );
}

export function isReplay(value: unknown): value is Replay {
  return (
    isRecord(value) &&
    typeof value.start === 'string' &&
    isRecord(value.headers) &&
    Object.values(value.headers).every((h) => typeof h === 'string') &&
    Array.isArray(value.plies) &&
    value.plies.every(isPly)
  );
}

/**
 * The boundary between storage and the analyzer: anything that is not exactly
 * a current-version record is a miss, never a throw.
 */
export function parseStored(raw: unknown): StoredAnalysis | null {
  if (!isRecord(raw) || raw.v !== CACHE_VERSION) return null;
  const { key, level, lines, replay, analyzedAt } = raw;
  if (typeof key !== 'string' || !isAnalysisLevel(level)) return null;
  if (!isNumber(analyzedAt) || !isReplay(replay)) return null;
  if (!Array.isArray(lines) || lines.length !== replay.plies.length + 1)
    return null;
  if (!lines.every(isLine)) return null;
  return {
    v: CACHE_VERSION,
    key: key as GameKey,
    level,
    lines,
    replay,
    analyzedAt,
  };
}

/** A store that says when its records change, so the pages that list them stay current. */
export type WatchedStore = AnalysisStore & {
  /** Called after each save or clear settles. */
  subscribe(listener: () => void): () => void;
};

export function watched(store: AnalysisStore): WatchedStore {
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());
  return {
    load: (key) => store.load(key),
    list: () => store.list(),
    save: (record) => store.save(record).finally(changed),
    clear: () => store.clear().finally(changed),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const newestFirst = (a: StoredAnalysis, b: StoredAnalysis) =>
  b.analyzedAt - a.analyzedAt;

/** The test double: the same contract with no storage behind it. */
export function memoryStore(): AnalysisStore {
  const records = new Map<GameKey, StoredAnalysis>();
  return {
    load: async (key) => records.get(key) ?? null,
    save: async (record) => {
      const have = records.get(record.key);
      if (!have || rank(have.level) <= rank(record.level))
        records.set(record.key, record);
    },
    list: async () => [...records.values()].sort(newestFirst),
    clear: async () => records.clear(),
  };
}

/** null where there is no IndexedDB (jsdom, some privacy modes). */
export function openIdbStore(): AnalysisStore | null {
  const transact = openIdb();
  if (!transact) return null;

  return {
    load: (key) =>
      transact<StoredAnalysis | null>(
        'analyses',
        'readonly',
        null,
        (store, set) => {
          const request = store.get(key);
          request.onsuccess = () => set(parseStored(request.result));
        },
      ),
    save: (record) =>
      transact<void>('analyses', 'readwrite', undefined, (store) => {
        const request = store.get(record.key);
        request.onsuccess = () => {
          const have = parseStored(request.result);
          if (!have || rank(have.level) <= rank(record.level))
            store.put(record);
        };
      }),
    list: () =>
      transact<StoredAnalysis[]>('analyses', 'readonly', [], (store, set) => {
        const request = store.getAll();
        request.onsuccess = () =>
          set(
            (request.result as unknown[])
              .map(parseStored)
              .filter((r) => r !== null)
              .sort(newestFirst),
          );
      }),
    clear: () =>
      transact<void>('analyses', 'readwrite', undefined, (store) => {
        store.clear();
      }),
  };
}
