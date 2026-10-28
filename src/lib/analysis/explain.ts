// Why a move cost something, as one clause the coach can say after the move:
// a mate it allows or misses, material it drops or fails to win (a fork
// named as one), or a trade into a lost endgame. Read off the engine lines on
// either side of the move with chess.js, so it names only what the search
// already found. Pure. Null when nothing here fits, and the coach falls back
// to the eval.

import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';

import { materialOf, type Ply } from '@/lib/chess/replay';
import { winPercent, type Score, type Variation } from '@/lib/chess/score';
import { stageAt } from '@/lib/chess/stage';

import type { Classification } from './classify';

/** The grades that get a reason: every move that cost something. */
const EXPLAINED = new Set<Classification>([
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]);

const NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};
const COUNT = [
  '',
  'a',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
];

/** Plies of a line read for material, then on while the moves keep capturing. */
const WINDOW = 4;
/** Plies read at most, captures included. */
const LIMIT = 10;
/** Pawns of material one line must drop or win against the other to be named. */
const MATERIAL = 1;
/** The mover's win chance at or below which an endgame reads as lost. */
const LOST = 30;

type Side = 'w' | 'b';

const other = (side: Side): Side => (side === 'w' ? 'b' : 'w');

const worth = (pieces: readonly PieceSymbol[]) =>
  pieces.reduce((sum, p) => sum + VALUE[p], 0);

const byValue = (pieces: readonly PieceSymbol[]) =>
  [...pieces].sort((a, b) => VALUE[b] - VALUE[a]);

/** "a, b and c". */
function join(items: readonly string[]) {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Equal piece counts by kind, biggest first: [['r', 1], ['p', 2]]. */
function tally(pieces: readonly PieceSymbol[]): [PieceSymbol, number][] {
  const counts = new Map<PieceSymbol, number>();
  for (const p of byValue(pieces)) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts];
}

/**
 * "a rook and two pawns". A net knight or bishop is "a piece", the way
 * players count it: after trades along a line, which minor it was is luck.
 */
const some = (pieces: readonly PieceSymbol[]) =>
  join(
    tally(pieces.map((p) => (p === 'b' ? 'n' : p))).map(
      ([p, n]) =>
        `${COUNT[n] ?? n} ${p === 'n' ? 'piece' : NAME[p]}${n > 1 ? 's' : ''}`,
    ),
  );

/** "the king and the rook", "both rooks". */
const the = (pieces: readonly PieceSymbol[]) =>
  join(
    tally(pieces).map(([p, n]) =>
      n === 1
        ? `the ${NAME[p]}`
        : `${n === 2 ? 'both' : `all ${n}`} ${NAME[p]}s`,
    ),
  );

/** `a` and `b` with pieces of equal value traded off, so a knight cancels a bishop. */
function cancel(a: readonly PieceSymbol[], b: readonly PieceSymbol[]) {
  const rest = [...b];
  const left = a.filter((p) => {
    const i = rest.findIndex((q) => VALUE[q] === VALUE[p]);
    if (i < 0) return true;
    rest.splice(i, 1);
    return false;
  });
  return [left, rest] as const;
}

/**
 * What one side comes away with: "a knight", "a rook for a bishop", "the
 * exchange". "material" when the captures do not add up to `net`, as when a
 * pawn promotes along the way.
 */
function spoils(
  gained: readonly PieceSymbol[],
  given: readonly PieceSymbol[],
  net: number,
) {
  const [got, gave] = cancel(gained, given);
  if (got.length === 0 || worth(got) - worth(gave) !== net) return 'material';
  const exchange =
    got.length === 1 &&
    got[0] === 'r' &&
    gave.length === 1 &&
    worth(gave) === 3;
  if (exchange) return 'the exchange';
  return gave.length ? `${some(got)} for ${some(gave)}` : some(got);
}

/** A line played out, with its material from `side`'s view in pawns. */
type Walk = {
  moves: Move[];
  net: number;
  /** `side`'s pieces taken along the line. */
  lost: PieceSymbol[];
  /** The other side's pieces `side` took. */
  won: PieceSymbol[];
};

/** Plays `uci` from `fen` for the window, then on while it keeps capturing. */
function walk(fen: string, uci: readonly string[], side: Side): Walk {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const m of uci.slice(0, LIMIT)) {
    let move: Move;
    try {
      move = chess.move({
        from: m.slice(0, 2),
        to: m.slice(2, 4),
        promotion: m[4],
      });
    } catch {
      break;
    }
    if (moves.length >= WINDOW && !move.captured) {
      chess.undo();
      break;
    }
    moves.push(move);
  }
  const sign = side === 'w' ? 1 : -1;
  const lost: PieceSymbol[] = [];
  const won: PieceSymbol[] = [];
  for (const m of moves)
    if (m.captured) (m.color === side ? won : lost).push(m.captured);
  return {
    moves,
    net: sign * (materialOf(chess.fen()).balance - materialOf(fen).balance),
    lost,
    won,
  };
}

/**
 * The pieces `move` attacks that it could win: the king, and any piece worth
 * more than the attacker or left undefended. Pawns do not count. Two or more
 * make a fork.
 */
function forked(move: Move): PieceSymbol[] {
  const chess = new Chess(move.after);
  const them = other(move.color);
  const attacker = VALUE[move.promotion ?? move.piece];
  const targets: PieceSymbol[] = [];
  for (const row of chess.board())
    for (const sq of row) {
      if (!sq || sq.color !== them || sq.type === 'p') continue;
      if (!chess.attackers(sq.square, move.color).includes(move.to)) continue;
      if (
        sq.type === 'k' ||
        VALUE[sq.type] > attacker ||
        chess.attackers(sq.square, them).length === 0
      )
        targets.push(sq.type);
    }
  return targets.length >= 2 ? byValue(targets) : [];
}

/** Mate for `winner` still to come. */
const mates = (score: Score, winner: Side) =>
  score.kind === 'mate' && score.winner === winner && score.moves > 0;

const mateIn = (score: Score, san: string) => {
  const n = score.kind === 'mate' ? score.moves : 0;
  return `mate in ${n}${n === 1 ? ' with' : ', starting with'} ${san}`;
};

/** The played move's UCI, promotion included. */
const uciOf = (ply: Ply) =>
  ply.from + ply.to + (/=([QRBN])/.exec(ply.san)?.[1]?.toLowerCase() ?? '');

/** The reply that punishes `played`, which lost `played.net` against a better line. */
function dropped(ply: Ply, played: Walk): string | null {
  const punish = played.moves[1];
  if (!punish) return null;
  const [got, gave] = cancel(played.lost, played.won);
  if (
    punish.captured &&
    !punish.isEnPassant() &&
    gave.length === 0 &&
    got.length === 1 &&
    got[0] === punish.captured
  ) {
    const piece = `the ${NAME[punish.captured]} on ${punish.to}`;
    const defended =
      new Chess(ply.fen).attackers(punish.to as Square, ply.color).length > 0;
    if (defended) return `drops ${piece} to ${punish.san}`;
    return punish.to === ply.to
      ? `hangs ${piece} to ${punish.san}`
      : `leaves ${piece} undefended, and ${punish.san} wins it`;
  }
  const fork = forked(punish);
  if (fork.length) return `allows a fork: ${punish.san} hits ${the(fork)}`;
  return `allows ${punish.san}, which wins ${spoils(played.lost, played.won, -played.net)}`;
}

/** The engine's move, which won `ideal.net` that the played move did not. */
function missed(ideal: Walk): string | null {
  const first = ideal.moves[0];
  if (!first) return null;
  const haul = spoils(ideal.won, ideal.lost, ideal.net);
  if (forked(first).length) return `misses a fork: ${first.san} wins ${haul}`;
  return `misses ${first.san}, which wins ${haul}`;
}

/**
 * Why `ply`, played from `fen`, earned `grade`: a clause with the move as its
 * subject, lowercase and unpunctuated, such as "hangs the knight on f6 to
 * Bxf6". `before` is the engine line from `fen`, `after` the line once the
 * move is on the board. Null for the grades that cost nothing and wherever
 * no reason fits.
 */
export function explainMove(
  grade: Classification,
  fen: string,
  ply: Ply,
  before: Variation,
  after: Variation,
): string | null {
  if (!EXPLAINED.has(grade)) return null;
  const side = ply.color;
  const played = walk(fen, [uciOf(ply), ...after.pv], side);
  const ideal = walk(fen, before.pv, side);
  const reply = played.moves[1];
  const best = ideal.moves[0];

  if (
    reply &&
    mates(after.score, other(side)) &&
    !mates(before.score, other(side))
  )
    return `allows ${mateIn(after.score, reply.san)}`;
  if (best && mates(before.score, side) && !mates(after.score, side))
    return `misses ${mateIn(before.score, best.san)}`;

  if (ideal.net - played.net >= MATERIAL) {
    if (played.net <= -MATERIAL && -played.net >= ideal.net)
      return dropped(ply, played);
    if (ideal.net >= MATERIAL) return missed(ideal);
  }

  // A capture taken straight back, leaving few enough pieces for an endgame.
  // Any ply count reads it, since the piece count decides an endgame first.
  const win = (s: Score) =>
    side === 'w' ? winPercent(s) : 100 - winPercent(s);
  if (
    ply.san.includes('x') &&
    reply?.captured &&
    reply.to === ply.to &&
    stageAt(reply.after, 0) === 'endgame' &&
    win(before.score) > LOST &&
    win(after.score) <= LOST
  )
    return 'trades into a lost endgame';
  return null;
}
