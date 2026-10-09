// The three analysis levels. The single source of truth: the settings radio
// list, persisted-setting validation, the scheduler, and the worker limits
// all derive from this table.
//
// Per position: iterative deepening to `depth`, stopping at whichever of
// `nodes` (deterministic) or `maxMs` (slow-machine safety cap) binds first,
// or early on a proven mate. Key order is rank order; schedule.test.ts asserts
// every limit strictly increases along it.

export const ANALYSIS_LEVELS = {
  fast: {
    label: 'Fast',
    blurb: 'Whole game in seconds. Catches blunders and missed tactics.',
    limits: { depth: 8, nodes: 250_000, maxMs: 1_000 },
  },
  balanced: {
    label: 'Balanced',
    blurb: 'A solid move-by-move review in under a minute.',
    limits: { depth: 12, nodes: 1_500_000, maxMs: 5_000 },
  },
  deep: {
    label: 'Deep',
    blurb: 'Strongest lines. Takes a few minutes and uses every core it gets.',
    limits: { depth: 16, nodes: 10_000_000, maxMs: 20_000 },
  },
} as const;

export type AnalysisLevel = keyof typeof ANALYSIS_LEVELS;

export const DEFAULT_LEVEL: AnalysisLevel = 'balanced';

/** Rank order, derived from key order. */
export const LEVELS = Object.keys(ANALYSIS_LEVELS) as AnalysisLevel[];

export const rank = (level: AnalysisLevel) => LEVELS.indexOf(level);

/** A result settled at `have` is good enough for a request at `want`. */
export const satisfies = (have: AnalysisLevel | null, want: AnalysisLevel) =>
  have !== null && rank(have) >= rank(want);

export function isAnalysisLevel(value: unknown): value is AnalysisLevel {
  return typeof value === 'string' && Object.hasOwn(ANALYSIS_LEVELS, value);
}
