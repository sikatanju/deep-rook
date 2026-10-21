// Test support: a stored analysis of a real game with hand-picked evals.

import { OPERA_GAME, parseReplay, type Replay } from '@/lib/chess/replay';
import type { Line } from '@/lib/chess/score';

import { CACHE_VERSION, gameKey, type StoredAnalysis } from './cache';
import type { AnalysisLevel } from './levels';

export const cpLine = (cp: number, depth = 12): Line => ({
  score: { kind: 'cp', cp },
  pv: ['a2a3'],
  depth,
});

/** `cps[i]` is White's centipawns at position i; missing positions read 0. */
export function stored({
  replay = parseReplay(OPERA_GAME),
  level = 'balanced',
  cps = [],
  analyzedAt = 1,
}: {
  replay?: Replay;
  level?: AnalysisLevel;
  cps?: readonly number[];
  analyzedAt?: number;
} = {}): StoredAnalysis {
  return {
    v: CACHE_VERSION,
    key: gameKey(replay),
    level,
    lines: Array.from({ length: replay.plies.length + 1 }, (_, i) =>
      cpLine(cps[i] ?? 0),
    ),
    replay,
    analyzedAt,
  };
}
