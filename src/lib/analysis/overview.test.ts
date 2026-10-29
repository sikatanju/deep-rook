import { describe, expect, test } from 'vitest';

import { loadOpeningBook } from '@/lib/chess/openings';
import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import { CLASSIFICATIONS, type Classification } from './classify';
import {
  TREND_LIMIT,
  filterGames,
  overview,
  sideOf,
  summarize,
  type GameSummary,
} from './overview';
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

  test('Book moves count in no grade, accuracy or stage figure', async () => {
    const book = await loadOpeningBook();
    // White's 2.Nf3 is a blunder to the engine and theory to the table.
    const slip = stored({ cps: [0, 0, 0, -400, ...Array(30).fill(-400)] });
    const plain = summarize(slip, ['Paul Morphy']);
    const booked = summarize(slip, ['Paul Morphy'], book);
    expect(plain.grades.blunder).toBe(1);
    expect(booked.grades.blunder).toBe(0);
    expect(booked.accuracy!).toBeGreaterThan(plain.accuracy!);
    const plies = (s: typeof plain) =>
      Object.values(s.stages).reduce((n, t) => n + t.plies, 0);
    expect(plies(plain) - plies(booked)).toBe(3);
    expect(Object.keys(booked.grades)).not.toContain('book');
  });

  test('tells which side is mine whatever the case of the name', () => {
    expect(summarize(record, ['paul MORPHY']).me).toBe('w');
    expect(summarize(record, ['duke karl / count isouard'])).toMatchObject({
      me: 'b',
      result: 'loss',
    });
  });

  test('a chosen side makes the game mine with no name, and overrides one', () => {
    const replay = parseReplay(OPERA_GAME);
    expect(
      summarize(stored({ replay: { ...replay, mine: 'b' }, cps }), []),
    ).toMatchObject({ me: 'b', result: 'loss' });
    expect(
      summarize(stored({ replay: { ...replay, mine: 'b' }, cps }), [
        'Paul Morphy',
      ]).me,
    ).toBe('b');
    expect(
      summarize(stored({ replay: { ...replay, mine: null }, cps }), [
        'Paul Morphy',
      ]).me,
    ).toBeNull();
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

  test('keeps the graded moves when one position has no line', () => {
    const partial = stored({ cps });
    partial.lines[12] = null;
    const summary = summarize(partial, ['Paul Morphy']);
    const plies = (game: GameSummary) =>
      game.stages.opening.plies +
      game.stages.middlegame.plies +
      game.stages.endgame.plies;
    expect(plies(summary)).toBeGreaterThan(0);
    expect(plies(summary)).toBeLessThan(
      plies(summarize(record, ['Paul Morphy'])),
    );
    expect(summary.accuracy).not.toBeNull();
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

  test('counts my moves by time pressure when the PGN has clocks', () => {
    // A minute each. White drops under ten seconds at 2. Nf3 and blunders 3. Bb5.
    const replay = parseReplay(`[White "me"]
[Black "you"]
[TimeControl "60+0"]

1. e4 {[%clk 0:00:59]} e5 {[%clk 0:00:58]} 2. Nf3 {[%clk 0:00:08]} Nc6 {[%clk 0:00:50]} 3. Bb5 {[%clk 0:00:07]} a6 {[%clk 0:00:49]} 4. Ba4 {[%clk 0:00:06.5]} *`);
    const cps = [0, 0, 0, 0, 0, -900, -900, -900];
    expect(summarize(stored({ replay, cps }), ['me']).clock).toEqual({
      calm: { plies: 2, mistakes: 0 },
      trouble: { plies: 2, mistakes: 1 },
    });
    expect(summarize(record, ['Paul Morphy']).clock).toBeNull();
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

  test('with the opening table, a game is named by its moves before its headers', async () => {
    const book = await loadOpeningBook();
    const opening = (pgn: string) =>
      summarize(stored({ replay: parseReplay(pgn) }), ['me'], book).opening;
    const headed = (header: string, moves: string) =>
      opening(`[White "me"]\n[Black "you"]\n${header}\n\n${moves} *`);
    // The slug says Zukertort, the header says Queen's Pawn, the table names both.
    expect(
      headed(
        '[ECOUrl "https://www.chess.com/openings/Zukertort-Opening-1...d5-2.d4"]',
        '1. Nf3 d5 2. d4',
      ),
    ).toBe("Queen's Pawn Game: Zukertort Variation");
    expect(headed('[Opening "Queen\'s Pawn Game"]', '1. d4 d5 2. Nf3')).toBe(
      "Queen's Pawn Game: Zukertort Variation",
    );
    expect(headed('', '1. e4 c5')).toBe('Sicilian Defense');
    // A position the table never reaches keeps the header's name.
    expect(
      opening(`[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]
[Opening "Endgame study"]

1. a8=Q+ *`),
    ).toBe('Endgame study');
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
    timeClass: 'blitz',
    accuracy: 80,
    grades: zeroGrades,
    stages: {
      opening: { plies: 10, mistakes: 1 },
      middlegame: { plies: 10, mistakes: 2 },
      endgame: { plies: 0, mistakes: 0 },
    },
    clock: null,
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

  test('rates my mistakes in and out of time trouble over the games with clocks', () => {
    const o = overview([
      game({
        clock: {
          calm: { plies: 30, mistakes: 3 },
          trouble: { plies: 10, mistakes: 4 },
        },
      }),
      game({
        clock: {
          calm: { plies: 10, mistakes: 1 },
          trouble: { plies: 0, mistakes: 0 },
        },
      }),
      game(),
      game({
        me: null,
        clock: {
          calm: { plies: 99, mistakes: 99 },
          trouble: { plies: 99, mistakes: 99 },
        },
      }),
    ]);
    expect(o.clock).toEqual({
      games: 2,
      calm: { plies: 40, mistakes: 4, per100: 10 },
      trouble: { plies: 10, mistakes: 4, per100: 40 },
    });
    expect(overview([game()]).clock.trouble.per100).toBeNull();
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
    expect(o.trend).toHaveLength(TREND_LIMIT);
    expect(o.trend.map((t) => t.accuracy)).toEqual(
      Array.from(
        { length: TREND_LIMIT },
        (_, i) => 50 + (25 - TREND_LIMIT) + i,
      ),
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

test('filterGames keeps the speed and the side asked for, and a game with no side fails any side', () => {
  const blitzWhite = game();
  const rapidBlack = game({ timeClass: 'rapid', me: 'b' });
  const unmatched = game({ timeClass: 'rapid', me: null });
  const all = [blitzWhite, rapidBlack, unmatched];
  expect(filterGames(all, { speed: 'all', side: 'all' })).toEqual(all);
  expect(filterGames(all, { speed: 'rapid', side: 'all' })).toEqual([
    rapidBlack,
    unmatched,
  ]);
  expect(filterGames(all, { speed: 'all', side: 'w' })).toEqual([blitzWhite]);
  expect(filterGames(all, { speed: 'rapid', side: 'b' })).toEqual([rapidBlack]);
});

describe('sideOf', () => {
  const headers = { White: 'Paul Morphy', Black: ' Duke Karl ' };

  test('matches either side by any of the names, ignoring case and spaces', () => {
    expect(sideOf(headers, ['  paul MORPHY '])).toBe('w');
    expect(sideOf(headers, ['someone', 'duke karl'])).toBe('b');
  });

  test('is null when no name matches, or when both sides do', () => {
    expect(sideOf(headers, [])).toBeNull();
    expect(sideOf(headers, ['', '   ', 'nobody'])).toBeNull();
    expect(sideOf(headers, ['Paul Morphy', 'Duke Karl'])).toBeNull();
  });

  test('an explicit side beats the names, and null says it is not mine', () => {
    expect(sideOf(headers, ['Paul Morphy'], 'b')).toBe('b');
    expect(sideOf(headers, [], 'w')).toBe('w');
    expect(sideOf(headers, ['Paul Morphy', 'Duke Karl'], 'w')).toBe('w');
    expect(sideOf(headers, ['Paul Morphy'], null)).toBeNull();
  });

  test('no side said still matches by name', () => {
    expect(sideOf(headers, ['Paul Morphy'], undefined)).toBe('w');
  });
});
