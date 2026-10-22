import { describe, expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import { CLASSIFICATIONS, type Classification } from './classify';
import { overview, summarize, type GameSummary } from './overview';
import { stored } from './fixtures';
import type { GameKey } from './cache';

// White blunders at ply 10 (opening) and makes a mistake at ply 24
// (middlegame); everything else loses nothing.
const cps = [
  ...Array(11).fill(0),
  ...Array(14).fill(-400),
  ...Array(9).fill(-900),
];
const record = stored({ cps });

describe('summarize', () => {
  test('reads the player, the result and the opening from the PGN', () => {
    const replay = parseReplay(
      OPERA_GAME.replace(
        '[Result',
        '[ECOUrl "https://www.chess.com/openings/Philidor-Defense"]\n[Result',
      ),
    );
    const summary = summarize(stored({ replay, cps }), ['Paul Morphy']);
    expect(summary).toMatchObject({
      me: 'w',
      result: 'win',
      opening: 'Philidor Defense',
      white: { name: 'Paul Morphy', rating: '2690' },
      black: { name: 'Duke Karl / Count Isouard', rating: '2400' },
      level: 'balanced',
    });
  });

  test('tells which side is mine whatever the case of the name', () => {
    expect(summarize(record, ['paul MORPHY']).me).toBe('w');
    expect(summarize(record, ['duke karl / count isouard'])).toMatchObject({
      me: 'b',
      result: 'loss',
    });
  });

  test('guesses no side without a matching name', () => {
    for (const names of [[], [''], ['  '], ['someone else']]) {
      expect(summarize(record, names)).toMatchObject({
        me: null,
        result: null,
        accuracy: null,
      });
    }
    const unmatched = summarize(record, []);
    expect(Object.values(unmatched.grades).every((n) => n === 0)).toBe(true);
    expect(unmatched.stages.opening.plies).toBe(0);
  });

  test('counts my grades, accuracy and mistakes by stage, not my opponent’s', () => {
    const white = summarize(record, ['Paul Morphy']);
    expect(white.grades).toMatchObject({
      blunder: 1,
      mistake: 1,
      excellent: 15,
    });
    expect(white.stages).toEqual({
      opening: { plies: 10, mistakes: 1 },
      middlegame: { plies: 6, mistakes: 1 },
      endgame: { plies: 1, mistakes: 0 },
    });
    expect(white.accuracy!).toBeLessThan(95);

    const black = summarize(record, ['Duke Karl / Count Isouard']);
    expect(black.grades.excellent).toBe(16);
    expect(black.stages).toEqual({
      opening: { plies: 10, mistakes: 0 },
      middlegame: { plies: 6, mistakes: 0 },
      endgame: { plies: 0, mistakes: 0 },
    });
    expect(black.accuracy!).toBeGreaterThan(99.9);
  });

  test('matches any of my usernames, one per site', () => {
    expect(summarize(record, ['magnus', 'Paul Morphy']).me).toBe('w');
    expect(summarize(record, ['duke karl / count isouard', 'someone']).me).toBe(
      'b',
    );
  });

  test('a game between two of my accounts has no side', () => {
    expect(
      summarize(record, ['Paul Morphy', 'Duke Karl / Count Isouard']),
    ).toMatchObject({ me: null, result: null });
  });

  test('reads a Lichess or pasted Opening header', () => {
    const replay = parseReplay(
      OPERA_GAME.replace('[Result', '[Opening "Philidor Defense"]\n[Result'),
    );
    expect(summarize(stored({ replay }), ['Paul Morphy']).opening).toBe(
      'Philidor Defense',
    );
  });

  test('a draw or an unfinished game', () => {
    const draw = parseReplay(
      '[White "me"]\n[Black "you"]\n[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2',
    );
    const open = parseReplay(
      '[White "me"]\n[Black "you"]\n[Result "*"]\n\n1. e4 e5 *',
    );
    expect(summarize(stored({ replay: draw }), ['me']).result).toBe('draw');
    expect(summarize(stored({ replay: open }), ['me']).result).toBeNull();
  });
});

const zeroGrades = Object.fromEntries(
  Object.keys(CLASSIFICATIONS).map((g) => [g, 0]),
) as Record<Classification, number>;

let counter = 0;
function game(patch: Partial<GameSummary> = {}): GameSummary {
  counter++;
  return {
    key: `g${counter}` as GameKey,
    analyzedAt: counter,
    level: 'balanced',
    white: { name: 'me', rating: null },
    black: { name: 'you', rating: null },
    me: 'w',
    result: 'win',
    opening: null,
    accuracy: 80,
    grades: zeroGrades,
    stages: {
      opening: { plies: 10, mistakes: 1 },
      middlegame: { plies: 10, mistakes: 2 },
      endgame: { plies: 0, mistakes: 0 },
    },
    ...patch,
  };
}

describe('overview', () => {
  test('aggregates only the games whose side is known', () => {
    const summaries = [
      game({ grades: { ...zeroGrades, best: 3 } }),
      game({ grades: { ...zeroGrades, best: 4, blunder: 1 } }),
      game({
        me: null,
        result: null,
        accuracy: null,
        grades: { ...zeroGrades, best: 100 },
        opening: 'Ghost Opening',
      }),
    ];
    const o = overview(summaries);
    expect(o.games).toBe(2);
    expect(o.gradeTotals).toMatchObject({ best: 7, blunder: 1 });
    expect(o.trend).toHaveLength(2);
    expect(o.openings).toEqual([]);
    expect(o.stages.opening).toEqual({ plies: 20, mistakes: 2, per100: 10 });
    expect(o.stages.middlegame.per100).toBe(20);
    expect(o.stages.endgame.per100).toBeNull();
  });

  test('lists every game recently, newest first, even the ones it does not count', () => {
    const summaries = Array.from({ length: 12 }, (_, i) =>
      game({ me: i === 11 ? null : 'w' }),
    );
    const o = overview(summaries);
    expect(o.recent).toHaveLength(10);
    expect(o.recent[0]).toBe(summaries[11]);
    expect(o.recent.map((g) => g.analyzedAt)).toEqual(
      [...o.recent.map((g) => g.analyzedAt)].sort((a, b) => b - a),
    );
  });

  test('the trend is the last games, oldest first, with an accuracy', () => {
    const summaries = [
      ...Array.from({ length: 25 }, (_, i) => game({ accuracy: 50 + i })),
      game({ accuracy: null }),
    ];
    const o = overview(summaries);
    expect(o.trend).toHaveLength(20);
    expect(o.trend.map((t) => t.accuracy)).toEqual(
      Array.from({ length: 20 }, (_, i) => 55 + i),
    );
    expect(overview(summaries, 3).trend.map((t) => t.accuracy)).toEqual([
      72, 73, 74,
    ]);
  });

  test('ranks the openings that cost the most accuracy first', () => {
    const o = overview([
      game({ opening: 'Sicilian Defense', accuracy: 60, result: 'loss' }),
      game({ opening: 'Sicilian Defense', accuracy: 70, result: 'win' }),
      game({ opening: 'Italian Game', accuracy: 90, result: 'draw' }),
      game({ opening: 'Scotch Game', accuracy: 40, result: 'loss' }),
      game({ opening: null, accuracy: 10 }),
    ]);
    expect(o.openings.map((x) => x.name)).toEqual([
      'Scotch Game',
      'Sicilian Defense',
      'Italian Game',
    ]);
    expect(o.openings[1]).toEqual({
      name: 'Sicilian Defense',
      games: 2,
      wins: 1,
      draws: 0,
      losses: 1,
      accuracy: 65,
    });
  });

  test('counts a Chess.com slug and a Lichess name for one opening together', () => {
    const o = overview([
      game({
        opening: "Queen's Gambit Declined: Orthodox Defense",
        accuracy: 60,
      }),
      game({
        opening: 'Queens Gambit Declined Orthodox Defense',
        accuracy: 80,
      }),
      game({ opening: 'Nimzo-Larsen Attack', accuracy: 90 }),
      game({ opening: 'Nimzo Larsen Attack', accuracy: 90 }),
      game({ opening: 'Réti Opening', accuracy: 95 }),
      game({ opening: 'Reti Opening', accuracy: 95 }),
    ]);
    expect(o.openings.map((x) => [x.name, x.games, x.accuracy])).toEqual([
      ["Queen's Gambit Declined: Orthodox Defense", 2, 70],
      ['Nimzo-Larsen Attack', 2, 90],
      ['Réti Opening', 2, 95],
    ]);
  });

  test('keeps the five worst openings', () => {
    const o = overview(
      Array.from({ length: 8 }, (_, i) =>
        game({ opening: `Opening ${i}`, accuracy: 10 * i }),
      ),
    );
    expect(o.openings.map((x) => x.name)).toEqual([
      'Opening 0',
      'Opening 1',
      'Opening 2',
      'Opening 3',
      'Opening 4',
    ]);
  });

  test('nothing reviewed is an empty overview', () => {
    expect(overview([])).toMatchObject({
      games: 0,
      trend: [],
      openings: [],
      recent: [],
    });
  });
});
