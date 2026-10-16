import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import { MoveList } from './move-list';

/** Each row's three grid cells as text: number, White's move, Black's move. */
function rows() {
  return screen
    .getAllByRole('listitem')
    .map((row) => Array.from(row.children, (cell) => cell.textContent));
}

test('numbers rows from move 1 with White first', () => {
  const { plies } = parseReplay(OPERA_GAME);
  render(<MoveList plies={plies} grades={[]} index={0} onSelect={() => {}} />);
  expect(rows().slice(0, 2)).toEqual([
    ['1.', 'e4', 'e5'],
    ['2.', 'Nf3', 'd6'],
  ]);
  expect(rows().at(-1)).toEqual(['17.', 'Rd8#', '']);
});

test('a game set up with Black to move starts in the Black column at its own move number', () => {
  const { plies } = parseReplay(`[SetUp "1"]
[FEN "r2q1rk1/pppp1ppp/8/8/4P3/8/PPP2PPP/R2Q1RK1 b - - 0 20"]

20... d5 21. exd5 Qxd5 *`);
  render(<MoveList plies={plies} grades={[]} index={0} onSelect={() => {}} />);
  expect(rows()).toEqual([
    ['20.', '', 'd5'],
    ['21.', 'exd5', 'Qxd5'],
  ]);
});
