import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, test, vi } from 'vitest';

import {
  Board,
  flightOffset,
  movingPiece,
  squareAt,
} from '@/components/board/board';
import { centreOf, drag } from '@/components/board/drag.testing';
import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function renderBoard(play?: Parameters<typeof Board>[0]['play']) {
  return render(
    <Board
      fen={START}
      flipped={false}
      theme="palette"
      coordinates
      lastMove={{ from: 'e2', to: 'e4' }}
      arrow="g1f3"
      grade="best"
      play={play}
    />,
  );
}

test('a piece set loads its own files, and the default stays Kiwen Suwi', () => {
  const { container } = renderBoard();
  expect(container.querySelector('[data-piece="wK"]')).toHaveAttribute(
    'src',
    '/pieces/kiwen/wK.svg',
  );
  const rhos = render(
    <Board
      fen={START}
      flipped={false}
      theme="palette"
      coordinates
      pieceSet="rhosgfx"
    />,
  );
  expect(rhos.container.querySelector('[data-piece="wK"]')).toHaveAttribute(
    'src',
    '/pieces/rhosgfx/wK.svg',
  );
  const paper = render(
    <Board
      fen={START}
      flipped={false}
      theme="palette"
      coordinates
      pieceSet="papercut"
    />,
  );
  expect(paper.container.querySelector('[data-piece="wK"]')).toHaveAttribute(
    'src',
    '/pieces/papercut/wK.svg',
  );
});

test('without play the board is a picture of div squares, as the review page draws it', () => {
  const { container } = renderBoard();
  const board = screen.getByRole('img', {
    name: 'Chess board, white at the bottom',
  });
  expect(within(board).queryAllByRole('button')).toEqual([]);
  const squares = container.querySelectorAll('[data-square]');
  expect(squares).toHaveLength(64);
  expect([...squares].every((s) => s.tagName === 'DIV')).toBe(true);
  expect(
    container.querySelector('[data-square="e4"] [data-grade="best"]'),
  ).not.toBeNull();
  expect(container.querySelector('[data-arrow="g1f3"]')).not.toBeNull();
  expect(container.querySelector('[data-target]')).toBeNull();
});

test('in play mode every square is a button named by square and piece', async () => {
  const onSquare = vi.fn();
  const user = userEvent.setup();
  const { container } = renderBoard({ selected: null, targets: [], onSquare });

  const board = screen.getByRole('group', {
    name: 'Chess board, white at the bottom',
  });
  const squares = within(board).getAllByRole('button');
  expect(squares).toHaveLength(64);
  expect(squares.every((s) => s.tabIndex === -1)).toBe(true);
  expect(container.querySelectorAll('[data-square]')).toHaveLength(64);

  await user.click(screen.getByRole('button', { name: 'g1, white knight' }));
  await user.click(screen.getByRole('button', { name: 'e5' }));
  expect(onSquare.mock.calls).toEqual([['g1'], ['e5']]);
  expect(
    screen.getByRole('button', { name: 'e8, black king' }),
  ).toBeInTheDocument();

  // The review layers stay.
  expect(container.querySelector('[data-arrow="g1f3"]')).not.toBeNull();
  expect(
    container.querySelector('[data-square="e4"] [data-grade="best"]'),
  ).not.toBeNull();
});

test("the engine's second choice is a fainter arrow drawn under the best one", () => {
  const { container } = render(
    <Board
      fen={START}
      flipped={false}
      theme="palette"
      coordinates
      arrow="g1f3"
      second="d2d4"
    />,
  );
  const best = container.querySelector('[data-arrow="g1f3"]')!;
  const next = container.querySelector('[data-arrow="d2d4"]')!;
  const opacity = (el: Element) => Number(el.getAttribute('opacity') ?? 1);
  expect(opacity(next)).toBeLessThan(opacity(best));
  expect(next.compareDocumentPosition(best)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
});

test('play mode marks the selected square and each target', () => {
  const { container } = renderBoard({
    selected: 'g1',
    targets: ['f3', 'h3'],
    onSquare: () => {},
  });
  expect(
    screen.getByRole('button', { name: 'g1, white knight' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    container.querySelector('[data-square="g1"] [data-selected]'),
  ).not.toBeNull();
  const targets = [...container.querySelectorAll('[data-target]')].map((t) =>
    t.closest('[data-square]')!.getAttribute('data-square'),
  );
  expect(targets.sort()).toEqual(['f3', 'h3']);
});

// The review board's motion is derived, not stored: `movingPiece` answers "which
// piece is flying, and which way?" from the ply at `index` and the index the
// viewer came from. A null answer means the board snaps.

test('a single forward step flies the ply that produced the position', () => {
  const replay = parseReplay(OPERA_GAME);
  expect(movingPiece(replay, 1, 0)).toMatchObject({
    from: 'e2',
    to: 'e4',
    code: 'wP',
    key: 1,
  });
  // 7. dxe5 is a capture: identity comes from the from-square, which held White's
  // pawn, while the destination square held Black's.
  expect(movingPiece(replay, 7, 6)).toMatchObject({
    from: 'd4',
    to: 'e5',
    code: 'wP',
  });
  // 19. Nxb5: a white knight takes on b5.
  expect(movingPiece(replay, 19, 18)).toMatchObject({
    from: 'c3',
    to: 'b5',
    code: 'wN',
  });
  // 23. O-O-O: the king is the piece the ply names; the rook is a second mover.
  expect(movingPiece(replay, 23, 22)).toMatchObject({
    from: 'e1',
    to: 'c1',
    code: 'wK',
  });
  // Black's pieces are black.
  expect(movingPiece(replay, 2, 1)!.code).toBe('bP');
});

test('a single backward step flies the same ply the other way', () => {
  const replay = parseReplay(OPERA_GAME);
  // Stepping from index 3 back to 2 unplays ply 3 (2. Nf3): the knight flies
  // f3 -> g1, read from the position after the ply, where it stands on f3.
  expect(movingPiece(replay, 2, 3)).toMatchObject({
    from: 'f3',
    to: 'g1',
    code: 'wN',
    key: 2,
  });
  // Stepping from index 2 back to 1 unplays ply 2 (1...e5).
  expect(movingPiece(replay, 1, 2)).toMatchObject({
    from: 'e5',
    to: 'e7',
    code: 'bP',
    key: 1,
  });
  // Stepping back FROM the start position has no ply to unplay.
  expect(movingPiece(replay, -1, 0)).toBeNull();
  // Stepping back TO the start position unplays ply 1: the pawn flies home.
  expect(movingPiece(replay, 0, 1)).toMatchObject({
    from: 'e4',
    to: 'e2',
    code: 'wP',
    key: 0,
  });
});

test('a jump, the start position and a no-op all snap', () => {
  const replay = parseReplay(OPERA_GAME);
  expect(movingPiece(replay, 12, 4)).toBeNull(); // clicked a far move in the list
  expect(movingPiece(replay, 33, 12)).toBeNull();
  expect(movingPiece(replay, 0, 0)).toBeNull(); // the start position
  expect(movingPiece(replay, 20, 20)).toBeNull(); // re-render, same index (engine flushes)
  expect(movingPiece(replay, 5, 5)).toBeNull();
});

test('identity survives promotion and en passant, where the destination square lies', () => {
  // a8=Q flies the PAWN into a square that then holds a queen.
  const promo = parseReplay('[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+');
  expect(movingPiece(promo, 1, 0)!.code).toBe('wP');

  // En passant: the captured pawn is not on the destination square at all.
  const ep = parseReplay(
    '[FEN "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"]\n\n1. exd6',
  );
  expect(movingPiece(ep, 1, 0)).toMatchObject({
    from: 'e5',
    to: 'd6',
    code: 'wP',
  });
});

// The flight is drawn as a one-square box parked on the cell the piece leaves and
// translated by whole squares. `left`/`top` are CSS percentages of the board and
// `mx`/`my` are squares of travel, both read from the board's own top-left, so a
// flipped board mirrors files and leaves ranks alone. The contract only earns its
// keep if the two ends agree for every ply the review can step over, in both
// directions and both orientations — hence the sweep over the whole game rather
// than a few hand-picked squares.

/** Cell of a square as board fractions of 0..8 from the board's top-left. */
function cellOf(square: string, flipped: boolean) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return flipped ? { x: 7 - file, y: rank } : { x: file, y: 7 - rank };
}

/** A percentage of the board back into board fractions: "12.5%" is cell 1. */
function cellFromPercent(percent: string) {
  return (Number(String(percent).replace('%', '')) / 100) * 8;
}

it('the flight offset lands on the destination square for every ply, both ways', () => {
  const replay = parseReplay(OPERA_GAME);

  type Mismatch = {
    ply: number;
    san: string;
    step: 'forward' | 'back';
    flipped: boolean;
    from: string;
    to: string;
    offset?: { left: string; top: string; mx: number; my: number };
    /** Cell named by `left`/`top`. */
    startCell?: { x: number; y: number };
    /** `startCell` plus `mx`/`my`. */
    landedCell?: { x: number; y: number };
    expectedStartCell?: { x: number; y: number };
    expectedLandedCell?: { x: number; y: number };
    problem: string;
  };

  const mismatches: Mismatch[] = [];
  let checks = 0;

  for (let ply = 1; ply <= replay.plies.length; ply++) {
    const san = replay.plies[ply - 1]!.san;
    for (const step of ['forward', 'back'] as const) {
      // Forward flies the ply at `ply`; back unplays it, so the piece travels
      // from its to-square home. `from`/`to` are the standing and landing
      // squares either way, which is what the offset has to reproduce.
      const moving =
        step === 'forward'
          ? movingPiece(replay, ply, ply - 1)
          : movingPiece(replay, ply - 1, ply);
      for (const flipped of [false, true]) {
        const base = {
          ply,
          san,
          step,
          flipped,
          from: moving?.from ?? '?',
          to: moving?.to ?? '?',
        };
        if (!moving) {
          mismatches.push({ ...base, problem: 'movingPiece returned null' });
          continue;
        }
        checks++;
        const expectedStartCell = cellOf(moving.from, flipped);
        const expectedLandedCell = cellOf(moving.to, flipped);
        const offset = flightOffset(moving, flipped);
        const startCell = {
          x: cellFromPercent(offset.left),
          y: cellFromPercent(offset.top),
        };
        // One square in the direction `mx`/`my` from the cell `left`/`top`
        // names must be exactly the cell of `moving.to`.
        const landedCell = {
          x: startCell.x + Number(offset.mx),
          y: startCell.y + Number(offset.my),
        };
        const problems: string[] = [];
        if (
          !String(offset.left).endsWith('%') ||
          !String(offset.top).endsWith('%')
        )
          problems.push('left/top are not CSS percentages');
        if (
          startCell.x !== expectedStartCell.x ||
          startCell.y !== expectedStartCell.y
        )
          problems.push('left/top do not name moving.from');
        if (
          landedCell.x !== expectedLandedCell.x ||
          landedCell.y !== expectedLandedCell.y
        )
          problems.push('left/top + mx/my do not land on moving.to');
        if (problems.length)
          mismatches.push({
            ...base,
            offset,
            startCell,
            landedCell,
            expectedStartCell,
            expectedLandedCell,
            problem: problems.join('; '),
          });
      }
    }
  }

  // Guard against a vacuous pass: 33 plies x 2 steps x 2 orientations.
  expect(checks).toBe(replay.plies.length * 4);
  // One assertion, so a failure prints every broken ply at once.
  expect(mismatches).toEqual([]);
});

test('squareAt names the square under a point, white or black at the bottom', () => {
  const rect = { left: 10, top: 20, width: 800, height: 800 };
  expect(squareAt(rect, false, 10 + 50, 20 + 50)).toBe('a8');
  expect(squareAt(rect, false, 10 + 750, 20 + 750)).toBe('h1');
  expect(squareAt(rect, true, 10 + 50, 20 + 50)).toBe('h1');
  expect(squareAt(rect, true, 10 + 750, 20 + 750)).toBe('a8');
  expect(squareAt(rect, false, 5, 100)).toBeNull();
  expect(squareAt(rect, false, 810, 100)).toBeNull();
  expect(squareAt({ ...rect, width: 0 }, false, 10, 20)).toBeNull();
});

function draggable(
  over: Partial<NonNullable<Parameters<typeof renderBoard>[0]>> = {},
) {
  const onDragStart = vi.fn(() => true);
  const onDrop = vi.fn();
  const onSquare = vi.fn();
  const play = {
    selected: null,
    targets: [],
    onSquare,
    onDragStart,
    onDrop,
    ...over,
  };
  return { onDragStart, onDrop, onSquare, play };
}

test('dragging a piece shows it following the pointer and dims its square', () => {
  const { onDragStart, play } = draggable();
  const { container } = renderBoard(play);
  const board = screen.getByRole('group', { name: /Chess board/ });
  board.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 800 }) as DOMRect;
  const e2 = centreOf('e2');

  fireEvent.pointerDown(board.querySelector('[data-square="e2"]')!, {
    clientX: e2.x,
    clientY: e2.y,
    pointerId: 1,
    pointerType: 'touch',
  });
  expect(container.querySelector('[data-dragging]')).toBeNull();
  fireEvent.pointerMove(board, { clientX: 450, clientY: 300, pointerId: 1 });

  expect(onDragStart).toHaveBeenCalledWith('e2');
  const ghost = container.querySelector<HTMLElement>('[data-dragging="e2"]')!;
  expect(ghost).toHaveAttribute('data-piece', 'wP');
  // Centred on the pointer: 450 - 50, 300 - 50.
  expect(ghost.style.transform).toBe('translate(400px, 250px)');
  expect(
    container.querySelector('[data-square="e2"] [data-piece]'),
  ).toHaveClass('opacity-30');

  fireEvent.pointerMove(board, { clientX: 460, clientY: 310, pointerId: 1 });
  expect(ghost.style.transform).toBe('translate(410px, 260px)');
  fireEvent.pointerUp(board, { clientX: 460, clientY: 310, pointerId: 1 });
  expect(container.querySelector('[data-dragging]')).toBeNull();
});

test('a drop reports the square under the pointer, on a flipped board too', () => {
  const upright = draggable();
  const first = renderBoard(upright.play);
  drag('e2', 'e4');
  expect(upright.onDrop).toHaveBeenCalledWith('e2', 'e4');
  expect(upright.onSquare).not.toHaveBeenCalled();
  first.unmount();

  const turned = draggable();
  render(
    <Board
      fen={START}
      flipped
      theme="palette"
      coordinates
      play={turned.play}
    />,
  );
  drag('e2', 'e4', { flipped: true, pointerType: 'touch' });
  expect(turned.onDrop).toHaveBeenCalledWith('e2', 'e4');
});

test('a drop off the board reports no square, and a refused pick-up never drags', () => {
  const off = draggable();
  const first = renderBoard(off.play);
  drag('g1', { x: 900, y: 400 });
  expect(off.onDrop).toHaveBeenCalledWith('g1', null);
  first.unmount();

  const refused = draggable({ onDragStart: vi.fn(() => false) });
  const { container } = renderBoard(refused.play);
  drag('e7', 'e5');
  expect(refused.onDrop).not.toHaveBeenCalled();
  expect(container.querySelector('[data-dragging]')).toBeNull();
});

test('a press that barely moves is still a click, and a drag does not also click', async () => {
  const { onDrop, onSquare, play } = draggable();
  renderBoard(play);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'g1, white knight' }));
  expect(onSquare.mock.calls).toEqual([['g1']]);
  expect(onDrop).not.toHaveBeenCalled();

  drag('g1', 'h3');
  expect(onDrop).toHaveBeenCalledWith('g1', 'h3');
  // The click the browser sends after the drop is swallowed, not a selection.
  fireEvent.click(screen.getByRole('button', { name: 'g1, white knight' }));
  expect(onSquare).toHaveBeenCalledTimes(1);
  // The next real press clicks again.
  await user.click(screen.getByRole('button', { name: 'g1, white knight' }));
  expect(onSquare).toHaveBeenCalledTimes(2);
});

test('only the primary mouse button picks a piece up', () => {
  const { onDragStart, play } = draggable();
  renderBoard(play);
  const board = screen.getByRole('group', { name: /Chess board/ });
  const e2 = centreOf('e2');
  fireEvent.pointerDown(board.querySelector('[data-square="e2"]')!, {
    clientX: e2.x,
    clientY: e2.y,
    pointerId: 1,
    pointerType: 'mouse',
    button: 2,
  });
  fireEvent.pointerMove(board, { clientX: 400, clientY: 300, pointerId: 1 });
  expect(onDragStart).not.toHaveBeenCalled();
});
