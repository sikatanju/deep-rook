// How long each move took, from the %clk comments Chess.com and Lichess write
// after every move and the TimeControl header. A clock comment is the mover's
// time left after the move, increment included, so a move took the time left
// before it, plus the increment, minus the time left after. A side's first
// move is the exception: neither site adds the increment to it.

import type { Replay } from './replay';

export type TimeControl = {
  base: number;
  increment: number;
  /**
   * Correspondence. `1/86400` is one move in that many seconds, and each move
   * starts with a fresh allotment. Unused time does not carry.
   */
  perMove?: boolean;
};

/**
 * "180+2", "600", or correspondence "1/86400".
 * Null for "-", "0+1", a multi-period control, and anything else.
 */
export function parseTimeControl(tag: string | undefined): TimeControl | null {
  const text = tag?.trim() ?? '';
  const daily = /^1\/(\d+)$/.exec(text);
  if (daily) {
    const base = Number(daily[1]);
    return base > 0 ? { base, increment: 0, perMove: true } : null;
  }
  const m = /^(\d+)(?:\+(\d+))?$/.exec(text);
  const base = Number(m?.[1]);
  return m && base > 0 ? { base, increment: Number(m[2] ?? 0) } : null;
}

/** Time trouble: under this share of the starting time when the move began… */
export const TROUBLE_SHARE = 0.1;
/** …or under this many seconds, whichever is more. */
export const TROUBLE_MIN = 10;

export const troubleLine = ({ base }: TimeControl) =>
  Math.max(TROUBLE_MIN, base * TROUBLE_SHARE);

export type MoveClock = {
  /** Seconds the move took. */
  spent: number;
  /** Seconds the mover had when the move began. */
  before: number;
  /** `before` was under the time-trouble line. */
  trouble: boolean;
};

/**
 * Seconds to show for `color` at viewer index `index`.
 * A live clock is the side's latest reading, or the base before they have moved.
 * A correspondence clock resets every turn, so only the side who just moved
 * shows the reading. The other side shows a full allotment.
 */
export function clockShowing(
  replay: Replay,
  index: number,
  color: 'w' | 'b',
): number | undefined {
  const control = parseTimeControl(replay.headers.TimeControl);
  if (!control) return undefined;
  if (control.perMove) {
    const last = index > 0 ? replay.plies[index - 1] : undefined;
    if (last?.color === color) return last.clock;
    return control.base;
  }
  for (let i = index; i >= 1; i--) {
    const ply = replay.plies[i - 1]!;
    if (ply.color === color) return ply.clock;
  }
  return control.base;
}

/** Per ply; null without a time control, and where a clock reading is missing. */
export function moveClocks(replay: Replay): (MoveClock | null)[] {
  const control = parseTimeControl(replay.headers.TimeControl);
  if (!control) return replay.plies.map(() => null);
  const line = troubleLine(control);
  if (control.perMove) {
    return replay.plies.map(({ clock }) => {
      if (clock === undefined) return null;
      return {
        spent: Math.max(0, control.base - clock),
        before: control.base,
        trouble: control.base < line,
      };
    });
  }
  const left: Record<'w' | 'b', number | null> = {
    w: control.base,
    b: control.base,
  };
  const moved = { w: false, b: false };
  return replay.plies.map(({ color, clock }) => {
    const before = left[color];
    const increment = moved[color] ? control.increment : 0;
    left[color] = clock ?? null;
    moved[color] = true;
    if (before === null || clock === undefined) return null;
    return {
      spent: Math.max(0, before + increment - clock),
      before,
      trouble: before < line,
    };
  });
}

/** "4.2s" under ten seconds, "42s" under a minute, "1:05" from there. */
export function formatSpent(seconds: number): string {
  // Bucketed after rounding, so 59.6 reads "1:00", not "60s".
  if (Math.round(seconds * 10) < 100) return `${seconds.toFixed(1)}s`;
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
