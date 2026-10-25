// How long each move took, from the %clk comments Chess.com and Lichess write
// after every move and the TimeControl header. A clock comment is the mover's
// time left after the move, increment included, so a move took the time left
// before it, plus the increment, minus the time left after. A side's first
// move is the exception: neither site adds the increment to it.

import type { Replay } from './replay';

export type TimeControl = { base: number; increment: number };

/** "180+2" or "600"; null for daily games ("1/86400"), "-" and anything else. */
export function parseTimeControl(tag: string | undefined): TimeControl | null {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tag?.trim() ?? '');
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

/** Per ply; null without a time control, and where a clock reading is missing. */
export function moveClocks(replay: Replay): (MoveClock | null)[] {
  const control = parseTimeControl(replay.headers.TimeControl);
  if (!control) return replay.plies.map(() => null);
  const line = troubleLine(control);
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
