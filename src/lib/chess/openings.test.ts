import { describe, expect, test } from 'vitest';

import { loadOpeningBook, openingOf } from './openings';
import { OPERA_GAME, parseReplay } from './replay';

const book = await loadOpeningBook();
const named = (pgn: string) => openingOf(parseReplay(pgn), book);

describe('openingOf', () => {
  test('names the deepest position of the game the table knows', () => {
    expect(named(OPERA_GAME)).toEqual({ eco: 'C41', name: 'Philidor Defense' });
    expect(
      named(
        '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. h3 h6 7. a3 a5 *',
      ),
    ).toEqual({
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation, Adams Attack',
    });
  });

  test('a transposition gets the name of the position it reaches', () => {
    expect(named('1. Nf3 Nf6 2. c4 e6 3. Nc3 d5 4. d4 Be7 *')).toEqual({
      eco: 'D37',
      name: "Queen's Gambit Declined: Three Knights Variation",
    });
    expect(named('1. Nf3 d5 2. d4 *')).toEqual(named('1. d4 d5 2. Nf3 *'));
  });

  test('no name for a game the table never reaches', () => {
    expect(
      named(`[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]

1. a8=Q+ *`),
    ).toBeNull();
  });
});
