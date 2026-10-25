// What the player has done with each drill, kept across visits so a missed
// position comes back and a solved one rests. Leitner boxes: a first-try solve
// moves a drill up a box and further out; a solve after a wrong try drops it to
// box 1, due tomorrow; a shown answer drops it to box 0, due at once. A skip
// records nothing.

import type { Drill } from './drill';
import type { Result } from './drill-session';
import { openIdb } from './idb';

/** Days a drill rests in each box before it is due again. */
export const BOX_DAYS = [0, 1, 3, 7, 21, 60] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type Attempt = Exclude<Result, 'skipped'>;

export type DrillProgress = {
  /** The drill's id. */
  id: string;
  /** An index into BOX_DAYS. */
  box: number;
  /** ms since the epoch: not asked again before this. */
  due: number;
  last: Attempt;
  /** When it was last answered, ms since the epoch. */
  at: number;
};

/** The progress after answering a drill; null for a skip, which changes nothing. */
export function advance(
  have: DrillProgress | undefined,
  id: string,
  result: Result,
  now: number,
): DrillProgress | null {
  if (result === 'skipped') return null;
  const box =
    result === 'first-try'
      ? Math.min((have?.box ?? 0) + 1, BOX_DAYS.length - 1)
      : result === 'retry'
        ? 1
        : 0;
  return { id, box, due: now + BOX_DAYS[box]! * DAY_MS, last: result, at: now };
}

export type DrillPlan = {
  /** To drill now: ones answered before that are due, weakest first, then new ones in queue order. */
  due: Drill[];
  /** Resting until later, soonest first. */
  later: Drill[];
};

/** `drills` in queue order (costliest first). */
export function plan(
  drills: readonly Drill[],
  progress: ReadonlyMap<string, DrillProgress>,
  now: number,
): DrillPlan {
  const answered = drills.filter((d) => progress.has(d.id));
  const of = (d: Drill) => progress.get(d.id)!;
  return {
    due: [
      ...answered
        .filter((d) => of(d).due <= now)
        .sort((a, b) => of(a).box - of(b).box || of(a).due - of(b).due),
      ...drills.filter((d) => !progress.has(d.id)),
    ],
    later: answered
      .filter((d) => of(d).due > now)
      .sort((a, b) => of(a).due - of(b).due),
  };
}

export type ProgressStore = {
  list(): Promise<DrillProgress[]>;
  /** Advances one drill's progress; a skip writes nothing. */
  record(id: string, result: Result, now: number): Promise<void>;
  clear(): Promise<void>;
};

const isAttempt = (value: unknown): value is Attempt =>
  value === 'first-try' || value === 'retry' || value === 'shown';

/** The boundary with storage: anything that is not exactly a progress record is absent. */
export function parseProgress(raw: unknown): DrillProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, box, due, last, at } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !isAttempt(last)) return null;
  if (!Number.isInteger(box) || (box as number) < 0) return null;
  if ((box as number) >= BOX_DAYS.length) return null;
  if (!Number.isFinite(due) || !Number.isFinite(at)) return null;
  return { id, box: box as number, due: due as number, last, at: at as number };
}

/** The test double: the same contract with no storage behind it. */
export function memoryProgress(): ProgressStore {
  const entries = new Map<string, DrillProgress>();
  return {
    list: async () => [...entries.values()],
    record: async (id, result, now) => {
      const next = advance(entries.get(id), id, result, now);
      if (next) entries.set(id, next);
    },
    clear: async () => entries.clear(),
  };
}

/** null where there is no IndexedDB (jsdom, some privacy modes). */
export function openIdbProgress(): ProgressStore | null {
  const transact = openIdb();
  if (!transact) return null;
  return {
    list: () =>
      transact<DrillProgress[]>('drills', 'readonly', [], (store, set) => {
        const request = store.getAll();
        request.onsuccess = () =>
          set(
            (request.result as unknown[])
              .map(parseProgress)
              .filter((p) => p !== null),
          );
      }),
    // Read and write in one transaction, so two quick answers both count.
    record: (id, result, now) =>
      transact<void>('drills', 'readwrite', undefined, (store) => {
        const request = store.get(id);
        request.onsuccess = () => {
          const have = parseProgress(request.result) ?? undefined;
          const next = advance(have, id, result, now);
          if (next) store.put(next);
        };
      }),
    clear: () =>
      transact<void>('drills', 'readwrite', undefined, (store) => {
        store.clear();
      }),
  };
}
