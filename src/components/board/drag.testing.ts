import { fireEvent, screen } from '@testing-library/react';

/** jsdom lays nothing out, so the board is told to be 800px square at 0,0. */
const SIZE = 800;

/** The centre of a square on the 800px board, white at the bottom or not. */
export function centreOf(square: string, flipped = false) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank - 1 : 8 - rank;
  return { x: (col + 0.5) * (SIZE / 8), y: (row + 0.5) * (SIZE / 8) };
}

/**
 * Drags the piece on `from` with pointer events and lets go at `to`, a square
 * or a point off the board. Returns after the drop, with the pointer released.
 */
export function drag(
  from: string,
  to: string | { x: number; y: number },
  { flipped = false, pointerType = 'mouse' } = {},
) {
  const board = screen.getByRole('group', { name: /Chess board/ });
  board.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: SIZE,
      height: SIZE,
      right: SIZE,
      bottom: SIZE,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  const source = board.querySelector(`[data-square="${from}"]`)!;
  const start = centreOf(from, flipped);
  const end = typeof to === 'string' ? centreOf(to, flipped) : to;
  const at = (p: { x: number; y: number }) => ({
    clientX: p.x,
    clientY: p.y,
    pointerId: 1,
    pointerType,
    button: 0,
  });
  fireEvent.pointerDown(source, at(start));
  fireEvent.pointerMove(board, at({ x: (start.x + end.x) / 2, y: end.y }));
  fireEvent.pointerMove(board, at(end));
  fireEvent.pointerUp(board, at(end));
  return board;
}
