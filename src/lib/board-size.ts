// The review board's width in px, as the resize handle sets it. A saved size is
// a setting; null means the responsive default.

export const MIN_BOARD_SIZE = 280;
export const MAX_BOARD_SIZE = 2200;

export const clampBoardSize = (n: number) =>
  Math.min(MAX_BOARD_SIZE, Math.max(MIN_BOARD_SIZE, n));

/** A saved size, or null for anything that is not a width the handle could set. */
export function parseBoardSize(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_BOARD_SIZE &&
    value <= MAX_BOARD_SIZE
    ? Math.round(value)
    : null;
}
