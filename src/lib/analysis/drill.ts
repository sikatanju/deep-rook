// Drills: the user's own mistakes as positions to solve. Pure. A Puzzle is the
// shared shape; a Drill is a Puzzle from a saved review (drillsOf), and retryAt
// builds one from the live review. Each carries a best move legal in its position.

import { uciOf, type Move } from '@/lib/chess/play';
import { fenAt, sanLine, type Ply, type Replay } from '@/lib/chess/replay';
import { winPercent, type Line, type Score } from '@/lib/chess/score';

import type { StoredAnalysis } from './cache';
import { classifyMoves, type Classification } from './classify';
import { explainMove } from './explain';
import { positionsFromStored, type PositionAnalysis } from './game-analysis';
import { sideOf } from './overview';
import type { ProbeInput, ProbeSnapshot } from './probe';
import { mistakesOf, type KeyMoment } from './report';

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

/**
 * What judging a move needs: a Drill, or a mistake met in a review that is
 * not saved as one (a retry). `record` is the game with an engine line per
 * position.
 */
export type Puzzle = Omit<Drill, 'id' | 'record' | 'opponent'> & {
  record: Pick<StoredAnalysis, 'lines' | 'replay'>;
};

const LINE_PLIES = 4;

/**
 * The puzzle before `moment`'s move, or null where the position before it has
 * no line to back an answer. `lines[i]` is the line at position i.
 */
function puzzleAt(
  replay: Replay,
  lines: readonly (Line | null)[],
  moment: KeyMoment,
): Puzzle | null {
  const before = lines[moment.index - 1];
  if (!before) return null;
  const fen = fenAt(replay, moment.index - 1);
  const line = sanLine(fen, before.pv.slice(0, LINE_PLIES));
  if (line.length === 0) return null;
  const ply = replay.plies[moment.index - 1]!;
  const promotion = /=([QRBN])/.exec(ply.san)?.[1]?.toLowerCase();
  return {
    record: { lines: [...lines], replay },
    index: moment.index,
    fen,
    color: moment.color,
    moveNumber: moment.moveNumber,
    best: { uci: before.pv[0]!, san: line[0]! },
    played: { uci: ply.from + ply.to + (promotion ?? ''), san: ply.san },
    line,
    grade: moment.grade as DrillGrade,
    loss: moment.loss,
  };
}

export function drillsOf(
  record: StoredAnalysis,
  usernames: readonly string[],
): Drill[] {
  const { replay, lines } = record;
  const me = sideOf(replay.headers, usernames);
  if (!me) return [];
  const positions = positionsFromStored(lines);
  const grades = classifyMoves(replay, positions);
  const them = me === 'w' ? 'Black' : 'White';
  const opponent = replay.headers[them] ?? them;

  return mistakesOf(replay, positions, grades).flatMap((moment): Drill[] => {
    if (moment.color !== me) return [];
    const puzzle = puzzleAt(replay, lines, moment);
    if (!puzzle) return [];
    return [
      { ...puzzle, id: `${record.key}:${moment.index}`, record, opponent },
    ];
  });
}

/**
 * The puzzle for the mistake, miss or blunder at viewer `index` of a game
 * under review, from the lines settled so far; null for any other move, or
 * while the position before it is still being searched.
 */
export function retryAt(
  replay: Replay,
  positions: readonly PositionAnalysis[],
  grades: readonly (Classification | null)[],
  index: number,
): Puzzle | null {
  const moment = mistakesOf(replay, positions, grades).find(
    (m) => m.index === index,
  );
  if (!moment) return null;
  const lines = positions.map((p) => (p.status === 'done' ? p.line : null));
  return puzzleAt(replay, lines, moment);
}

/** Why the move played in the game cost what it did, as `explainMove` puts it. */
export function drillReason(drill: Puzzle): string | null {
  const { replay, lines } = drill.record;
  const before = lines[drill.index - 1];
  const after = lines[drill.index];
  const ply = replay.plies[drill.index - 1];
  if (!before || !after || !ply) return null;
  return explainMove(drill.grade, drill.fen, ply, before, after);
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
function lossTo(drill: Puzzle, after: Score): number {
  const before = drill.record.lines[drill.index - 1]!;
  const sign = drill.color === 'w' ? 1 : -1;
  return Math.max(0, sign * (winPercent(before.score) - winPercent(after)));
}

/**
 * The verdict the saved lines can give on `move`; null when only a search of
 * the position after it can tell. The second line bounds every other move:
 * none scores better than it, so when it falls short they all do.
 */
export function judge(drill: Puzzle, move: Move): Verdict | null {
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
  drill: Puzzle,
  after: Line,
): { verdict: 'close' | 'other'; loss: number } {
  const loss = lossTo(drill, after.score);
  return { verdict: loss < CLOSE_ENOUGH ? 'close' : 'other', loss };
}

export type Judged = { verdict: Verdict; loss: number | null };

/** A move tried on a puzzle: judged from the saved lines, or waiting on a search of the position it leads to. */
export type Attempt = { ply: Ply } & (
  { judged: Judged } | { input: ProbeInput }
);

/** The search's verdict on `input`; null while it runs. No engine means the move falls short. */
export function searched(
  drill: Puzzle,
  input: ProbeInput,
  probe: ProbeSnapshot,
): Judged | null {
  if (probe.fen !== input.fen) return null;
  if (probe.unavailable) return { verdict: 'other', loss: null };
  if (!probe.done) return null;
  return probe.line
    ? judgeAfter(drill, probe.line)
    : { verdict: 'other', loss: null };
}
