import { Chess } from 'chess.js';
import { expect, test } from 'vitest';

import { toUci } from './board';
import { MAX_MOVES, generateMoves, legalMoves } from './moves';
import { parseFen, toFen, type Position } from './position';

const buffers = Array.from({ length: 8 }, () => new Int32Array(MAX_MOVES));

/** Leaf count to `depth`. With `verify`, checks incremental state against a recompute at every node. */
function perft(pos: Position, depth: number, verify = false): number {
  if (verify) {
    const r = pos.recompute();
    expect([
      pos.hashLo,
      pos.hashHi,
      pos.mg[0],
      pos.mg[1],
      pos.eg[0],
      pos.eg[1],
      pos.phase,
    ]).toEqual([r.hashLo, r.hashHi, ...r.mg, ...r.eg, r.phase]);
  }
  if (depth === 0) return 1;
  const moves = buffers[depth]!;
  const end = generateMoves(pos, moves, 0, false);
  let nodes = 0;
  for (let i = 0; i < end; i++) {
    if (!pos.make(moves[i]!)) continue;
    nodes += perft(pos, depth - 1, verify);
    pos.unmake();
  }
  return nodes;
}

// Reference counts: https://www.chessprogramming.org/Perft_Results
const SUITE: [string, string, number[]][] = [
  [
    'start',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    [20, 400, 8902, 197281, 4865609],
  ],
  [
    'kiwipete',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    [48, 2039, 97862, 4085603],
  ],
  [
    'pos3',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    [14, 191, 2812, 43238, 674624],
  ],
  [
    'pos4',
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    [6, 264, 9467, 422333],
  ],
  [
    'pos5',
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    [44, 1486, 62379, 2103487],
  ],
  [
    'pos6',
    'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    [46, 2079, 89890, 3894594],
  ],
];

const FULL = Boolean(import.meta.env.PERFT_FULL);
const LIMIT = FULL ? Infinity : 500_000;

for (const [name, fen, counts] of SUITE) {
  test(`perft ${name}`, { timeout: FULL ? 60_000 : undefined }, () => {
    counts.forEach((expected, i) => {
      if (expected > LIMIT) return;
      expect(perft(parseFen(fen), i + 1)).toBe(expected);
    });
  });

  test(`perft ${name}: incremental state matches a recompute at every node`, () => {
    perft(parseFen(fen), 2, true);
  });
}

test('legal moves match chess.js over seeded random playouts', () => {
  let seed = 7;
  const rand = (n: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    return (seed >>> 8) % n;
  };
  for (const [, fen] of SUITE) {
    for (let game = 0; game < 3; game++) {
      const chess = new Chess(fen);
      for (let ply = 0; ply < 40 && !chess.isGameOver(); ply++) {
        const ours = legalMoves(parseFen(chess.fen())).map(toUci).sort();
        const theirs = chess
          .moves({ verbose: true })
          .map((m) => m.lan)
          .sort();
        expect(ours, chess.fen()).toEqual(theirs);
        chess.move(theirs[rand(theirs.length)]!);
      }
    }
  }
});

test('FEN round-trips', () => {
  for (const [, fen] of SUITE) expect(toFen(parseFen(fen))).toBe(fen);
});

test('parseFen rejects malformed input', () => {
  expect(() => parseFen('not a fen')).toThrow(/placement/);
  expect(() => parseFen('8/8/8/8/8/8/8/8 w - - 0 1')).toThrow(/king/);
  expect(() => parseFen('4k3/8/8/8/8/8/8/4K3 x - - 0 1')).toThrow(/side/);
});
