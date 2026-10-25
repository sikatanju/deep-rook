// A side line: moves the user plays out of a position of the reviewed game.
// Pure, over chess.js. The game itself is never touched; a Branch is a path
// hanging off it, so leaving the branch is just dropping the value.

import { Chess, type Square } from 'chess.js';

import type { Move } from './play';
import { fenAt, type Ply, type Replay } from './replay';

/**
 * `base` is the game position the line leaves (a viewer index). `plies` is
 * everything played, and `at` how many of them are on the board: stepping
 * back keeps the rest so stepping forward can return to it.
 */
export type Branch = {
  base: number;
  plies: readonly Ply[];
  at: number;
};

/** The FEN on the board: the base position until the first move is applied. */
export function branchFen(replay: Replay, branch: Branch): string {
  return branch.at === 0
    ? fenAt(replay, branch.base)
    : branch.plies[branch.at - 1]!.fen;
}

/** The FEN of every position from the game's start through the board, for the engine's history. */
export function branchFens(replay: Replay, branch: Branch): string[] {
  return [
    ...Array.from({ length: branch.base + 1 }, (_, i) => fenAt(replay, i)),
    ...branch.plies.slice(0, branch.at).map((ply) => ply.fen),
  ];
}

/** The line as it stands on the board, up to `at`. */
export const playedPlies = (branch: Branch): readonly Ply[] =>
  branch.plies.slice(0, branch.at);

function playFrom(fen: string, move: Move): Ply | null {
  try {
    const m = new Chess(fen).move(move);
    return {
      fen: m.after,
      san: m.san,
      from: m.from,
      to: m.to,
      check: m.san.endsWith('+') || m.san.endsWith('#'),
      color: m.color,
      moveNumber: Number(m.before.split(' ')[5]),
    };
  } catch {
    return null;
  }
}

/**
 * Plays `move` on the branch's board, or on game position `index` when there
 * is no branch. A move that repeats the next one already in the line just
 * steps forward and keeps the rest; any other move cuts the rest off. null
 * when the move is not legal.
 */
export function playMove(
  branch: Branch | null,
  replay: Replay,
  index: number,
  move: Move,
): Branch | null {
  const base = branch?.base ?? index;
  const kept = branch ? playedPlies(branch) : [];
  const fen = kept.length ? kept[kept.length - 1]!.fen : fenAt(replay, base);
  const ply = playFrom(fen, move);
  if (!ply) return null;
  if (branch && branch.plies[branch.at]?.san === ply.san)
    return { ...branch, at: branch.at + 1 };
  return { base, plies: [...kept, ply], at: kept.length + 1 };
}

const moveOfUci = (uci: string): Move => ({
  from: uci.slice(0, 2) as Square,
  to: uci.slice(2, 4) as Square,
  promotion: uci[4] as Move['promotion'],
});

/** Plays engine moves in order. Stops before the first one that does not apply; null if none does. */
export function playLine(
  branch: Branch | null,
  replay: Replay,
  index: number,
  line: readonly string[],
): Branch | null {
  let current = branch;
  for (const uci of line) {
    const next = playMove(current, replay, index, moveOfUci(uci));
    if (!next) break;
    current = next;
  }
  return current === branch ? null : current;
}

export function stepTo(branch: Branch, at: number): Branch {
  return { ...branch, at: Math.min(branch.plies.length, Math.max(0, at)) };
}

/** True when `move`, played at game position `index`, is the game's own next move. */
export function isGameMove(replay: Replay, index: number, move: Move): boolean {
  const next = replay.plies[index];
  return (
    next !== undefined && playFrom(fenAt(replay, index), move)?.san === next.san
  );
}
