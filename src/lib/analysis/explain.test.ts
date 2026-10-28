import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';

import type { Ply } from '@/lib/chess/replay';
import type { Score, Variation } from '@/lib/chess/score';

import type { Classification } from './classify';
import { explainMove } from './explain';

const cp = (n: number): Score => ({ kind: 'cp', cp: n });
const mate = (winner: 'w' | 'b', moves: number): Score => ({
  kind: 'mate',
  winner,
  moves,
});

function plyOf(fen: string, san: string): Ply {
  const m = new Chess(fen).move(san);
  return {
    fen: m.after,
    san: m.san,
    from: m.from,
    to: m.to,
    check: /[+#]$/.test(m.san),
    color: m.color,
    moveNumber: Number(fen.split(' ')[5]),
  };
}

/** `san` played from `fen`, between the engine's line before it and after it. */
function explain(
  fen: string,
  san: string,
  before: Variation,
  after: Variation,
  grade: Classification = 'blunder',
) {
  return explainMove(grade, fen, plyOf(fen, san), before, after);
}

describe('material it drops', () => {
  test('the moved piece left where it can be taken', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(
      explain(
        fen,
        'Ba6',
        { score: cp(30), pv: ['g1f3', 'b8c6', 'f1b5', 'a7a6'] },
        { score: cp(-300), pv: ['b7a6', 'g1f3', 'b8c6', 'd2d4'] },
      ),
    ).toBe('hangs the bishop on a6 to bxa6');
  });

  test('another piece left without its defender', () => {
    const fen = '6k1/8/1b6/8/3N4/8/5PPP/3Q2K1 w - - 0 1';
    expect(
      explain(
        fen,
        'Qh5',
        { score: cp(0), pv: ['d1d3', 'g8f8'] },
        { score: cp(-300), pv: ['b6d4'] },
      ),
    ).toBe('leaves the knight on d4 undefended, and Bxd4 wins it');
  });

  test('a capture that loses more than it takes', () => {
    const fen = '6k1/8/4p3/3p4/8/8/8/3R2K1 w - - 0 1';
    expect(
      explain(
        fen,
        'Rxd5',
        { score: cp(0), pv: ['g1f2', 'g8f7'] },
        { score: cp(-400), pv: ['e6d5', 'g1f2'] },
      ),
    ).toBe('allows exd5, which wins a rook for a pawn');
  });

  test('a fork it allows', () => {
    const fen = 'r2qk3/8/8/1N6/8/8/8/6K1 b - - 0 1';
    expect(
      explain(
        fen,
        'Qh4',
        { score: cp(0), pv: ['d8d7', 'g1f2'] },
        { score: cp(500), pv: ['b5c7', 'e8d8', 'c7a8', 'h4e4'] },
      ),
    ).toBe('allows a fork: Nc7+ hits the king and the rook');
  });
});

describe('material it misses', () => {
  test('a fork', () => {
    const fen = 'r3k3/8/8/1N6/7q/8/8/6K1 w - - 0 1';
    expect(
      explain(
        fen,
        'Kf1',
        { score: cp(0), pv: ['b5c7', 'e8d8', 'c7a8', 'h4e4'] },
        { score: cp(-500), pv: ['h4e4'] },
        'miss',
      ),
    ).toBe('misses a fork: Nc7+ wins a rook');
  });

  test('a loose piece', () => {
    const fen = 'k7/8/8/4b3/8/5N2/8/K7 w - - 0 1';
    expect(
      explain(
        fen,
        'Ka2',
        { score: cp(300), pv: ['f3e5', 'a8b7'] },
        { score: cp(0), pv: ['e5d4'] },
      ),
    ).toBe('misses Nxe5, which wins a piece');
  });
});

describe('mate', () => {
  test('a mate it allows', () => {
    const fen = '4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1';
    expect(
      explain(
        fen,
        'Re2',
        { score: cp(0), pv: ['g8f8'] },
        { score: mate('w', 2), pv: ['d1d8', 'e2e8', 'd8e8'] },
      ),
    ).toBe('allows mate in 2, starting with Rd8+');
  });

  test('a mate it misses', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    expect(
      explain(
        fen,
        'h3',
        { score: mate('w', 1), pv: ['d1d8'] },
        { score: cp(500), pv: ['g8f8'] },
      ),
    ).toBe('misses mate in 1 with Rd8#');
  });

  test('says nothing of a mate that was coming anyway', () => {
    const fen = '4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1';
    expect(
      explain(
        fen,
        'Kf8',
        { score: mate('w', 3), pv: ['g8f8'] },
        { score: mate('w', 2), pv: ['d1d8', 'e8d8'] },
      ),
    ).toBeNull();
  });
});

test('a trade into a lost endgame', () => {
  const fen = '3r4/ppp1k3/8/8/8/8/P7/3R2K1 w - - 0 1';
  expect(
    explain(
      fen,
      'Rxd8',
      { score: cp(-100), pv: ['g1f1', 'a7a5'] },
      { score: cp(-400), pv: ['e7d8', 'g1f2'] },
      'mistake',
    ),
  ).toBe('trades into a lost endgame');
});

test('no reason for a move that cost nothing, or one nothing here explains', () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const before = { score: cp(30), pv: ['g1f3', 'b8c6'] };
  expect(
    explain(fen, 'Ba6', before, { score: cp(-300), pv: ['b7a6'] }, 'good'),
  ).toBeNull();
  expect(
    explain(fen, 'a3', before, { score: cp(-60), pv: ['g8f6'] }, 'inaccuracy'),
  ).toBeNull();
});
