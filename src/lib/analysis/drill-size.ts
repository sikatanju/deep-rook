// How many drills one sitting takes: 5, 10 or every one that is due. The
// choice is kept in this browser.

const KEY = 'drillSize';

export const SIZES = [5, 10, 'all'] as const;
export type Size = (typeof SIZES)[number];

const isSize = (value: unknown): value is Size =>
  SIZES.some((size) => size === value);

/** The top of `queue`, in its order, up to `size`. */
export const take = <T>(queue: readonly T[], size: Size): readonly T[] =>
  size === 'all' ? queue : queue.slice(0, size);

export function loadSize(): Size {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return isSize(raw) ? raw : 'all';
  } catch {
    return 'all'; // storage blocked or not JSON
  }
}

export function saveSize(size: Size): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(size));
  } catch {
    // Storage full or blocked: the choice lasts until the page closes.
  }
}
