// The review on screen, kept in this browser so a refresh reopens it. Only the
// game is kept: its analysis is already in the saved reviews (or is redone),
// and the side line being explored is not worth restoring.

import { isReplay } from '@/lib/analysis/cache';
import { isAnalysisLevel, type AnalysisLevel } from '@/lib/analysis/levels';
import type { Replay } from '@/lib/chess/replay';

const KEY = 'lastReview';
const VERSION = 1;

export type LastReview = {
  replay: Replay;
  source: string;
  orientation: 'w' | 'b';
  level: AnalysisLevel;
};

/** Anything but a current-version record of a whole game is no review, never a throw. */
export function parseLastReview(raw: string | null): LastReview | null {
  try {
    const data: unknown = JSON.parse(raw ?? 'null');
    if (typeof data !== 'object' || data === null) return null;
    const { v, replay, source, orientation, level } = data as Record<
      string,
      unknown
    >;
    if (
      v !== VERSION ||
      !isReplay(replay) ||
      replay.plies.length === 0 ||
      typeof source !== 'string' ||
      (orientation !== 'w' && orientation !== 'b') ||
      !isAnalysisLevel(level)
    )
      return null;
    return { replay, source, orientation, level };
  } catch {
    return null;
  }
}

export function loadLastReview(): LastReview | null {
  try {
    return parseLastReview(localStorage.getItem(KEY));
  } catch {
    return null; // storage blocked
  }
}

export function saveLastReview(review: LastReview): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...review }));
  } catch {
    // Storage full or blocked: the review still works until it is closed.
  }
}

/** Drops the game a refresh would reopen. Settings and usernames stay. */
export function clearLastReview(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: there is nothing to reopen anyway.
  }
}
