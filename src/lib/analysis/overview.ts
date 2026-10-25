// What the saved reviews say about the player across games. Pure: the
// Overview page reads the store, summarizes each record once, and draws the
// aggregate. Only games where the player's side is known are aggregated; a
// pasted PGN with no matching name is listed but never guessed at.

import { moveClocks } from '@/lib/chess/clock';
import { openingOf, type OpeningBook } from '@/lib/chess/openings';
import { fenAt, openingName } from '@/lib/chess/replay';
import { stageAt, STAGES, type Stage } from '@/lib/chess/stage';
import type { Outcome } from '@/lib/chesscom/session';

import type { GameKey, StoredAnalysis } from './cache';
import {
  classifyMoves,
  CLASSIFICATIONS,
  type Classification,
} from './classify';
import type { PositionAnalysis } from './game-analysis';
import type { AnalysisLevel } from './levels';
import { gameReport, MOMENT_GRADES } from './report';

/** Graded moves of mine, and how many of them were mistakes, misses or blunders. */
export type Tally = { mistakes: number; plies: number };

/** Whether the clock said I was in time trouble when the move began. */
export type Pressure = 'calm' | 'trouble';

export type GameSummary = {
  key: GameKey;
  analyzedAt: number;
  level: AnalysisLevel;
  white: { name: string; rating: string | null };
  black: { name: string; rating: string | null };
  /** The side whose PGN name matches a saved username; null unless exactly one does. */
  me: 'w' | 'b' | null;
  /** From my side. null without a known side or a decisive or drawn result. */
  result: Outcome | null;
  opening: string | null;
  /** My estimated accuracy, as the game report computes it. */
  accuracy: number | null;
  /** My grades. */
  grades: Record<Classification, number>;
  /** My graded plies by the stage they were played in, and how many were mistakes. */
  stages: Record<Stage, Tally>;
  /** My graded plies by time pressure; null when none of them has a clock reading. */
  clock: Record<Pressure, Tally> | null;
};

const RESULT_BY_TAG: Record<string, Record<'w' | 'b', Outcome>> = {
  '1-0': { w: 'win', b: 'loss' },
  '0-1': { w: 'loss', b: 'win' },
  '1/2-1/2': { w: 'draw', b: 'draw' },
};

const STAGE_IDS = Object.keys(STAGES) as Stage[];
const GRADES = Object.keys(CLASSIFICATIONS) as Classification[];

/**
 * The side one of `usernames` played, in any case. Null when neither side
 * matches, and when both do: a game between two of my own accounts has no
 * single "me".
 */
export function sideOf(
  headers: Record<string, string>,
  usernames: readonly string[],
): 'w' | 'b' | null {
  const names = new Set(usernames.map((u) => u.trim().toLowerCase()));
  names.delete('');
  const white = names.has(headers.White?.toLowerCase() ?? '');
  const black = names.has(headers.Black?.toLowerCase() ?? '');
  return white === black ? null : white ? 'w' : 'b';
}

/** With a `book`, the opening is named by position; the PGN headers are the fallback. */
export function summarize(
  record: StoredAnalysis,
  usernames: readonly string[],
  book: OpeningBook | null = null,
): GameSummary {
  const { replay } = record;
  const { headers } = replay;
  const positions = record.lines.map((line): PositionAnalysis => ({
    status: 'done',
    line,
  }));
  const grades = classifyMoves(replay, positions);
  const report = gameReport(replay, positions, grades);
  const me = sideOf(headers, usernames);

  const stages = Object.fromEntries(
    STAGE_IDS.map((stage) => [stage, { mistakes: 0, plies: 0 }]),
  ) as Record<Stage, Tally>;
  const clocks = moveClocks(replay);
  let clock: Record<Pressure, Tally> | null = null;
  const count = (tally: Tally, mistake: boolean) => {
    tally.plies++;
    if (mistake) tally.mistakes++;
  };
  replay.plies.forEach((ply, p) => {
    const grade = grades[p];
    if (ply.color !== me || !grade) return;
    const mistake = MOMENT_GRADES.has(grade);
    count(stages[stageAt(fenAt(replay, p), p)], mistake);
    const at = clocks[p];
    if (!at) return;
    clock ??= {
      calm: { mistakes: 0, plies: 0 },
      trouble: { mistakes: 0, plies: 0 },
    };
    count(clock[at.trouble ? 'trouble' : 'calm'], mistake);
  });

  const mine = me && report[me === 'w' ? 'white' : 'black'];
  return {
    key: record.key,
    analyzedAt: record.analyzedAt,
    level: record.level,
    white: { name: headers.White ?? 'White', rating: headers.WhiteElo ?? null },
    black: { name: headers.Black ?? 'Black', rating: headers.BlackElo ?? null },
    me,
    result: me ? (RESULT_BY_TAG[headers.Result ?? '']?.[me] ?? null) : null,
    opening: (book && openingOf(replay, book)?.name) ?? openingName(headers),
    accuracy: mine ? mine.accuracy : null,
    grades: mine
      ? mine.counts
      : (Object.fromEntries(GRADES.map((grade) => [grade, 0])) as Record<
          Classification,
          number
        >),
    stages,
    clock,
  };
}

export type Rate = Tally & {
  /** Mistakes per 100 of my moves; null before any move. */
  per100: number | null;
};

/**
 * Chess.com slugs drop the colons, apostrophes, hyphens and accents that
 * Lichess names keep, so one opening matches on its letters and digits only.
 */
function openingKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}|'|’/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The Lichess spelling has the most punctuation; a slug has none. */
function punctuation(name: string): number {
  return name.replace(/[A-Za-z0-9 ]/g, '').length;
}

export type OpeningStat = {
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Mean of my accuracy over the games that have one. */
  accuracy: number | null;
};

export type Overview = {
  /** Games the aggregates are built from: those where my side is known. */
  games: number;
  /** Accuracy of my latest games, oldest first. */
  trend: { key: GameKey; analyzedAt: number; accuracy: number }[];
  gradeTotals: Record<Classification, number>;
  stages: Record<Stage, Rate>;
  /** My moves by time pressure, over the games with clock readings. */
  clock: { games: number } & Record<Pressure, Rate>;
  /** The openings I played worst, by mean accuracy, lowest first. */
  openings: OpeningStat[];
  /** My latest reviewed games, newest first, whoever I was in them. */
  recent: GameSummary[];
};

const OPENINGS_SHOWN = 5;
const RECENT_SHOWN = 10;

const rate = (tallies: readonly Tally[]): Rate => {
  const mistakes = tallies.reduce((n, t) => n + t.mistakes, 0);
  const plies = tallies.reduce((n, t) => n + t.plies, 0);
  return { mistakes, plies, per100: plies ? (mistakes * 100) / plies : null };
};

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** `last` bounds the accuracy trend only; the other figures cover every game. */
export function overview(
  summaries: readonly GameSummary[],
  last = 20,
): Overview {
  const newestFirst = [...summaries].sort(
    (a, b) => b.analyzedAt - a.analyzedAt,
  );
  const mine = newestFirst.filter((g) => g.me !== null);

  const trend = mine
    .filter((g) => g.accuracy !== null)
    .slice(0, last)
    .reverse()
    .map((g) => ({
      key: g.key,
      analyzedAt: g.analyzedAt,
      accuracy: g.accuracy!,
    }));

  const gradeTotals = Object.fromEntries(
    GRADES.map((grade) => [
      grade,
      mine.reduce((n, g) => n + g.grades[grade], 0),
    ]),
  ) as Record<Classification, number>;

  const stages = Object.fromEntries(
    STAGE_IDS.map((stage) => [stage, rate(mine.map((g) => g.stages[stage]))]),
  ) as Record<Stage, Rate>;

  const timed = mine.flatMap((g) => (g.clock ? [g.clock] : []));
  const clock = {
    games: timed.length,
    calm: rate(timed.map((c) => c.calm)),
    trouble: rate(timed.map((c) => c.trouble)),
  };

  const byOpening = new Map<string, GameSummary[]>();
  for (const game of mine) {
    if (game.opening) {
      const key = openingKey(game.opening);
      byOpening.set(key, [...(byOpening.get(key) ?? []), game]);
    }
  }
  const openings = [...byOpening.values()]
    .map((games): OpeningStat => {
      const name = games
        .map((g) => g.opening!)
        .reduce((a, b) => (punctuation(b) > punctuation(a) ? b : a));
      const count = (outcome: Outcome) =>
        games.filter((g) => g.result === outcome).length;
      return {
        name,
        games: games.length,
        wins: count('win'),
        draws: count('draw'),
        losses: count('loss'),
        accuracy: mean(
          games.flatMap((g) => (g.accuracy === null ? [] : [g.accuracy])),
        ),
      };
    })
    .sort(
      (a, b) =>
        (a.accuracy ?? Infinity) - (b.accuracy ?? Infinity) ||
        b.games - a.games ||
        a.name.localeCompare(b.name),
    )
    .slice(0, OPENINGS_SHOWN);

  return {
    games: mine.length,
    trend,
    gradeTotals,
    stages,
    clock,
    openings,
    recent: newestFirst.slice(0, RECENT_SHOWN),
  };
}
