// Test support: a stored analysis of a real game with hand-picked evals.

import { OPERA_GAME, parseReplay, type Replay } from '@/lib/chess/replay';
import type { Line } from '@/lib/chess/score';

import { CACHE_VERSION, gameKey, type StoredAnalysis } from './cache';
import type { AnalysisLevel } from './levels';

export const cpLine = (cp: number, depth = 12, pv = ['a2a3']): Line => ({
  score: { kind: 'cp', cp },
  pv,
  depth,
});

/**
 * `cps[i]` is White's centipawns at position i; missing positions read 0.
 * `pvs[i]` is the engine line at position i; missing ones read ['a2a3'], which
 * is illegal in most positions.
 */
export function stored({
  replay = parseReplay(OPERA_GAME),
  level = 'balanced',
  cps = [],
  pvs = {},
  analyzedAt = 1,
}: {
  replay?: Replay;
  level?: AnalysisLevel;
  cps?: readonly number[];
  pvs?: Readonly<Record<number, string[]>>;
  analyzedAt?: number;
} = {}): StoredAnalysis {
  return {
    v: CACHE_VERSION,
    key: gameKey(replay),
    level,
    lines: Array.from({ length: replay.plies.length + 1 }, (_, i) =>
      cpLine(cps[i] ?? 0, 12, pvs[i]),
    ),
    replay,
    analyzedAt,
  };
}

/**
 * The Opera game with two slips by Black. 4...Bxf3 is a blunder (0 to +4, a
 * loss of 31.3487 points) where the engine wanted 4...dxe5; 7...Qe7 is a
 * mistake (+4 to +9, a loss of 15.1414) where it wanted 7...Nc6. White loses
 * nothing.
 */
export const OPERA_SLIPS = {
  cps: [...Array(8).fill(0), ...Array(6).fill(400), ...Array(20).fill(900)],
  pvs: { 7: ['d6e5', 'd1d8', 'e8d8'], 13: ['b8c6'] },
};
