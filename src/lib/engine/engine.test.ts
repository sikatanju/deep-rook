import { expect, test } from 'vitest';

import { OPERA_GAME, fenAt, parseReplay } from '@/lib/chess/replay';
import type { Score } from '@/lib/chess/score';

import { createEngine, toScore, type SearchRequest } from './engine';
import { BLACK, MATE, WHITE } from './board';
import { evaluate } from './evaluate';
import { legalMoves } from './moves';
import { parseFen } from './position';

const engine = createEngine();
const search = (fen: string, depth = 6, history: string[] = []) =>
  engine.search({ fen, history, depth, nodes: 5_000_000, maxMs: 60_000 });

test('toScore flips to White POV and counts mate in the winner moves', () => {
  expect(toScore(50, WHITE)).toEqual({ kind: 'cp', cp: 50 });
  expect(toScore(50, BLACK)).toEqual({ kind: 'cp', cp: -50 });
  expect(toScore(MATE - 1, WHITE)).toEqual({
    kind: 'mate',
    winner: 'w',
    moves: 1,
  });
  expect(toScore(MATE - 3, BLACK)).toEqual({
    kind: 'mate',
    winner: 'b',
    moves: 2,
  });
  expect(toScore(-(MATE - 2), BLACK)).toEqual({
    kind: 'mate',
    winner: 'w',
    moves: 1,
  });
});

test('finds a back-rank mate in one', () => {
  const out = search('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  expect(out.line.pv[0]).toBe('a1a8');
  expect(out.line.score).toEqual({ kind: 'mate', winner: 'w', moves: 1 });
  expect(out.reason).toBe('mate');
});

test('scores mate from White view when Black is to move', () => {
  const out = search('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1');
  expect(out.line.pv[0]).toBe('a8a1');
  expect(out.line.score).toEqual({ kind: 'mate', winner: 'b', moves: 1 });
});

const opera = parseReplay(OPERA_GAME);

test('Opera Game: Qb8+ is mate in 2', () => {
  const out = search(fenAt(opera, 30));
  expect(out.line.score).toEqual({ kind: 'mate', winner: 'w', moves: 2 });
  expect(out.line.pv.slice(0, 3)).toEqual(['b3b8', 'd7b8', 'd1d8']);
});

test('Opera Game final position is mate on the board', () => {
  const out = search(fenAt(opera, opera.plies.length));
  expect(out).toMatchObject({
    reason: 'terminal',
    line: { score: { kind: 'mate', winner: 'w', moves: 0 }, pv: [] },
  });
});

test('stalemate scores zero', () => {
  expect(search('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').line.score).toEqual({
    kind: 'cp',
    cp: 0,
  });
});

test('takes a hanging queen', () => {
  const out = search('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 4);
  expect(out.line.pv[0]).toBe('d1d5');
  expect(out.line.score.kind === 'cp' && out.line.score.cp).toBeGreaterThan(
    300,
  );
});

test('promotes with UCI suffix', () => {
  expect(search('8/P6k/8/8/8/8/8/K7 w - - 0 1', 4).line.pv[0]).toBe('a7a8q');
});

test('static eval is color-symmetric', () => {
  const pairs = [
    [
      'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 2 3',
    ],
    [
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      'r3k2r/pppbbppp/2n2q1P/1P2p3/3pn3/BN2PNP1/P1PPQPB1/R3K2R b KQkq - 0 1',
    ],
  ];
  for (const [fen, mirrored] of pairs)
    expect(evaluate(parseFen(fen!))).toBe(evaluate(parseFen(mirrored!)));
});

// A queen down, White can only hope to repeat: Nf3 Kh8 Ng1 Kg8 cycles.
const CYCLE = [
  '6k1/8/8/8/8/8/q7/6NK w - - 0 1',
  '6k1/8/8/8/8/5N2/q7/7K b - - 1 1',
  '7k/8/8/8/8/5N2/q7/7K w - - 2 2',
  '7k/8/8/8/8/8/q7/6NK b - - 3 2',
];

test('one earlier occurrence in the game is not a draw', () => {
  const root = '6k1/8/8/8/8/8/q7/6NK w - - 4 3';
  const score = search(root, 4, CYCLE).line.score;
  expect(score.kind === 'cp' && score.cp).toBeLessThan(-500);
});

test('a third occurrence through game history is a draw', () => {
  const root = '6k1/8/8/8/8/8/q7/6NK w - - 8 5';
  const line = search(root, 4, [...CYCLE, ...CYCLE]).line;
  expect(line.score).toEqual({ kind: 'cp', cp: 0 });
  expect(line.pv[0]).toBe('g1f3');
});

test('mate on the 100th halfmove wins instead of drawing', () => {
  const out = search('6k1/5ppp/8/8/8/8/8/R5K1 w - - 99 80');
  expect(out.line.pv[0]).toBe('a1a8');
  expect(out.line.score).toEqual({ kind: 'mate', winner: 'w', moves: 1 });
});

test('same request, same answer', () => {
  const request: SearchRequest = {
    fen: fenAt(opera, 12),
    history: [],
    depth: 7,
    nodes: 200_000,
    maxMs: 60_000,
  };
  const a = createEngine().search(request);
  const b = engine.search(request);
  expect(a.line.second).toBeDefined();
  expect(b.line).toEqual(a.line);
  expect(b.nodes).toBe(a.nodes);
});

test('node cap binds and keeps the last full iteration, second line included', () => {
  const out = engine.search({
    fen: fenAt(opera, 12),
    history: [],
    depth: 30,
    nodes: 50_000,
    maxMs: 60_000,
  });
  expect(out.reason).toBe('nodes');
  expect(out.line.pv.length).toBeGreaterThan(0);
  expect(out.line.second?.pv.length).toBeGreaterThan(0);
  expect(out.nodes).toBe(50_000);
});

/** Higher is better for `mover`: any mate outranks any centipawns, and a nearer mate a farther one. */
function forMover(score: Score, mover: string): number {
  if (score.kind === 'mate')
    return (score.winner === mover ? 1 : -1) * (100_000 - score.moves);
  return mover === 'w' ? score.cp : -score.cp;
}

test.each([
  ['the start', fenAt(opera, 0)],
  // At depth 5 the second search outscores the first here (search instability).
  ['White, with two ways to recapture', fenAt(opera, 8)],
  ['an open middlegame', fenAt(opera, 12)],
  ['Black, a piece down', fenAt(opera, 20)],
  ['Black, facing mate on the second line', fenAt(opera, 29)],
  [
    'Kiwipete',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  ],
])(
  'in %s the second line starts with another move and is no better',
  (_, fen) => {
    const { line } = search(fen, 5);
    const mover = fen.split(' ')[1]!;
    expect(line.second).toBeDefined();
    expect(line.second!.pv[0]).not.toBe(line.pv[0]);
    expect(forMover(line.second!.score, mover)).toBeLessThanOrEqual(
      forMover(line.score, mover),
    );
  },
);

test('a position with one legal move has no second line', () => {
  // After 16. Qb8+ in the Opera Game, Nxb8 is forced.
  const fen = fenAt(opera, 31);
  expect(legalMoves(parseFen(fen))).toHaveLength(1);
  const { line } = search(fen);
  expect(line.pv[0]).toBe('d7b8');
  expect(line.second).toBeUndefined();
});

test("Morphy's 14. Rd1 is an only-move: the next best gives the attack back", () => {
  const { line } = search(fenAt(opera, 26));
  expect(line.pv[0]).toBe('h1d1');
  const best = forMover(line.score, 'w');
  const next = forMover(line.second!.score, 'w');
  expect(best - next).toBeGreaterThanOrEqual(300);
});

test('iterations stream in increasing depth', () => {
  const depths: number[] = [];
  engine.search(
    { fen: fenAt(opera, 8), history: [], depth: 5, nodes: 1e7, maxMs: 60_000 },
    (l) => depths.push(l.depth),
  );
  expect(depths).toEqual([1, 2, 3, 4, 5]);
});
