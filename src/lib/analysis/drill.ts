// Drills: the user's own mistakes from saved reviews, as positions to solve.
// Pure. A Drill always carries a best move that is legal in its position;
// drillsOf drops any moment the engine line cannot back.

import { uciOf, type Move } from '@/lib/chess/play';
import { fenAt, sanLine } from '@/lib/chess/replay';
import { winPercent, type Line, type Score } from '@/lib/chess/score';

import type { StoredAnalysis } from './cache';
import { classifyMoves } from './classify';
import type { PositionAnalysis } from './game-analysis';
import { sideOf } from './overview';
import { mistakesOf } from './report';

export type DrillGrade = 'mistake' | 'miss' | 'blunder';

export type Drill = {
  /** `${key}:${index}`, stable across sessions. */
  id: string;
  record: StoredAnalysis;
  /** Viewer index AFTER the mistake; the puzzle position is index - 1. */
  index: number;
  /** The position before the move. */
  fen: string;
  /** Side to move, always the user. */
  color: 'w' | 'b';
  moveNumber: number;
  best: { uci: string; san: string };
  played: { uci: string; san: string };
  /** Engine continuation in SAN, best move first, at most 4 plies. */
  line: string[];
  grade: DrillGrade;
  /** Win-chance points lost. */
  loss: number;
  /** The other side's PGN name. */
  opponent: string;
};

const LINE_PLIES = 4;

export function drillsOf(
  record: StoredAnalysis,
  usernames: readonly string[],
): Drill[] {
  const { replay, lines } = record;
  const me = sideOf(replay.headers, usernames);
  if (!me) return [];
  const positions = lines.map((line): PositionAnalysis => ({
    status: 'done',
    line,
  }));
  const grades = classifyMoves(replay, positions);
  const them = me === 'w' ? 'Black' : 'White';
  const opponent = replay.headers[them] ?? them;

  return mistakesOf(replay, positions, grades).flatMap((moment): Drill[] => {
    if (moment.color !== me) return [];
    const fen = fenAt(replay, moment.index - 1);
    const pv = lines[moment.index - 1]!.pv;
    const line = sanLine(fen, pv.slice(0, LINE_PLIES));
    if (line.length === 0) return [];
    const ply = replay.plies[moment.index - 1]!;
    const promotion = /=([QRBN])/.exec(ply.san)?.[1]?.toLowerCase();
    return [
      {
        id: `${record.key}:${moment.index}`,
        record,
        index: moment.index,
        fen,
        color: me,
        moveNumber: moment.moveNumber,
        best: { uci: pv[0]!, san: line[0]! },
        played: { uci: ply.from + ply.to + (promotion ?? ''), san: ply.san },
        line,
        grade: moment.grade as DrillGrade,
        loss: moment.loss,
        opponent,
      },
    ];
  });
}

/** Costliest first; ties go to the newer game, then the earlier move. */
export function drillQueue(
  records: readonly StoredAnalysis[],
  usernames: readonly string[],
): Drill[] {
  return records
    .flatMap((record) => drillsOf(record, usernames))
    .sort(
      (a, b) =>
        b.loss - a.loss ||
        b.record.analyzedAt - a.record.analyzedAt ||
        a.index - b.index,
    );
}

/**
 * A move that gives up less than this, in win-chance points, solves a drill
 * as well as the engine's own: the excellent and good bands.
 */
export const CLOSE_ENOUGH = 5;

/**
 * `close` solves the drill without being the engine's move. `played` is the
 * user's original move, `other` any other move that falls short.
 */
export type Verdict = 'best' | 'close' | 'played' | 'other';

/** Win-chance points the drill's side gives up between the engine's line and `after`. */
function lossTo(drill: Drill, after: Score): number {
  const before = drill.record.lines[drill.index - 1]!;
  const sign = drill.color === 'w' ? 1 : -1;
  return Math.max(0, sign * (winPercent(before.score) - winPercent(after)));
}

/**
 * The verdict the saved lines can give on `move`; null when only a search of
 * the position after it can tell. The second line bounds every other move:
 * none scores better than it, so when it falls short they all do.
 */
export function judge(drill: Drill, move: Move): Verdict | null {
  const uci = uciOf(move);
  if (uci === drill.best.uci) return 'best';
  if (uci === drill.played.uci) return 'played';
  const second = drill.record.lines[drill.index - 1]!.second;
  if (!second) return null;
  const short = lossTo(drill, second.score) >= CLOSE_ENOUGH;
  if (uci === second.pv[0]) return short ? 'other' : 'close';
  return short ? 'other' : null;
}

/** The verdict on a move from the engine's line for the position it leads to. */
export function judgeAfter(
  drill: Drill,
  after: Line,
): { verdict: 'close' | 'other'; loss: number } {
  const loss = lossTo(drill, after.score);
  return { verdict: loss < CLOSE_ENOUGH ? 'close' : 'other', loss };
}
