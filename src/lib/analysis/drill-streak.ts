// Days in a row with at least one drill answered. Only the run is kept, not
// every day, so it stays two strings: the last day practiced and the run that
// ended on it. Days are the player's local calendar days.

const KEY = 'drillStreak';

export type Streak = { last: string; run: number };

/** `ms` as a local YYYY-MM-DD. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local day before `ms`. Steps by calendar day, so a 23 or 25 hour day still counts as one. */
function dayBefore(ms: number): string {
  const d = new Date(ms);
  return dayOf(
    new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime(),
  );
}

/** The streak after practicing at `now`. */
export function mark(have: Streak | null, now: number): Streak {
  const today = dayOf(now);
  if (have?.last === today) return have;
  return {
    last: today,
    run: have?.last === dayBefore(now) ? have.run + 1 : 1,
  };
}

/**
 * The run still alive at `now`, and whether today is already in it. A run
 * that ended yesterday is alive until today ends; older is over.
 */
export function current(
  have: Streak | null,
  now: number,
): { run: number; today: boolean } {
  if (have?.last === dayOf(now)) return { run: have.run, today: true };
  if (have?.last === dayBefore(now)) return { run: have.run, today: false };
  return { run: 0, today: false };
}

function parse(raw: unknown): Streak | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { last, run } = raw as Record<string, unknown>;
  if (typeof last !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(last)) return null;
  if (!Number.isInteger(run) || (run as number) < 1) return null;
  return { last, run: run as number };
}

export function loadStreak(): Streak | null {
  try {
    return parse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return null; // storage blocked or not JSON
  }
}

export function saveStreak(streak: Streak): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(streak));
  } catch {
    // Storage full or blocked: the streak lasts until the page closes.
  }
}

/** Goes with the drill history it counts. */
export function clearStreak(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: there is nothing saved to clear.
  }
}
