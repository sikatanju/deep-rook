// Who searches what next. Pure: the analyzer passes a view of its state and
// executes the returned commands, and re-plans after every change, so a
// missed plan is harmless. Searches are deterministic, so order only affects
// when results appear, never what they are.
//
// Priority:
// 1. Focus: the viewed position at the requested level, on an idle lane
//    (slot 0 first). With no idle lane, preempt slot 0, but only once the
//    focus has stayed put for FOCUS_DWELL_MS, so holding an arrow key does
//    not churn workers.
// 2. First light: every position with no result gets a pass at the lowest
//    level, nearest the focus first, so the whole game shows up in seconds.
// 3. Upgrade: positions below the requested level, nearest the focus first.

import { LEVELS, satisfies, type AnalysisLevel } from './levels';

export const FOCUS_DWELL_MS = 200;

export type PlanInput = {
  level: AnalysisLevel;
  focus: number;
  focusDwelled: boolean;
  /** Per position: the highest level settled, or null. Failed positions pass the top level. */
  settled: readonly (AnalysisLevel | null)[];
  /** Per lane: the position index it is searching, or null when idle. Slot 0 is the focus lane. */
  running: readonly (number | null)[];
};

export type Command = {
  kind: 'start' | 'preempt';
  slot: number;
  index: number;
  level: AnalysisLevel;
};

export function plan({
  level,
  focus,
  focusDwelled,
  settled,
  running,
}: PlanInput): Command[] {
  const busy = new Set(running.filter((i) => i !== null));
  const idle = running.flatMap((index, slot) => (index === null ? [slot] : []));
  const commands: Command[] = [];
  const start = (
    kind: Command['kind'],
    slot: number,
    index: number,
    at: AnalysisLevel,
  ) => {
    commands.push({ kind, slot, index, level: at });
    busy.add(index);
  };

  if (!busy.has(focus) && !satisfies(settled[focus] ?? null, level)) {
    const slot = idle.shift();
    if (slot !== undefined) start('start', slot, focus, level);
    else if (focusDwelled) start('preempt', 0, focus, level);
  }

  const lowest = LEVELS[0]!;
  const order = byDistance(settled.length, focus);
  for (const slot of idle) {
    const fresh = order.find((i) => !busy.has(i) && settled[i] === null);
    if (fresh !== undefined && level !== lowest) {
      start('start', slot, fresh, lowest);
      continue;
    }
    const upgrade = order.find(
      (i) => !busy.has(i) && !satisfies(settled[i] ?? null, level),
    );
    if (upgrade === undefined) break;
    start('start', slot, upgrade, level);
  }
  return commands;
}

/** 0..n-1 by distance from `focus`; on ties the later index wins, since people step forward. */
function byDistance(n: number, focus: number): number[] {
  const out: number[] = [];
  for (let d = 0; out.length < n; d++) {
    if (focus + d < n) out.push(focus + d);
    if (d > 0 && focus - d >= 0) out.push(focus - d);
  }
  return out;
}
