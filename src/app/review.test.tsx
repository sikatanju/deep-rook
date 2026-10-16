import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import App from './App';

async function openOperaGame() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));
  return user;
}

test('review page without a game points back to the games page', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Review' }));
  expect(screen.getByText('No game loaded.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Choose a game' }));
  expect(screen.getByLabelText('PGN')).toBeInTheDocument();
});

test('steps through a game with buttons and keys', async () => {
  const user = await openOperaGame();
  expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const first = screen.getByRole('button', { name: 'First move' });
  expect(first).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Next move' }));
  expect(screen.getByRole('button', { name: 'e4' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  expect(
    document.querySelector('[data-square="e4"] [data-piece="wP"]'),
  ).not.toBeNull();
  expect(document.querySelector('[data-square="e2"] [data-piece]')).toBeNull();

  await user.keyboard('{End}');
  expect(screen.getByRole('button', { name: 'Rd8#' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  expect(screen.getByRole('button', { name: 'Next move' })).toBeDisabled();

  await user.keyboard('{ArrowLeft}');
  expect(screen.getByRole('button', { name: 'Nxb8' })).toHaveAttribute(
    'aria-current',
    'step',
  );

  await user.click(screen.getByRole('button', { name: 'Nf3' }));
  expect(
    document.querySelector('[data-square="f3"] [data-piece="wN"]'),
  ).not.toBeNull();
});

test('flips the board', async () => {
  const user = await openOperaGame();
  const board = screen.getByRole('img', { name: /white at the bottom/ });
  expect(board.firstElementChild).toHaveAttribute('data-square', 'a8');
  await user.keyboard('f');
  expect(
    screen.getByRole('img', { name: /black at the bottom/ }).firstElementChild,
  ).toHaveAttribute('data-square', 'h1');
});

/** The piece in flight, or null when the board snapped instead. */
const flying = () => document.querySelector<HTMLElement>('[data-moving]');

test('a single step slides the piece instead of teleporting it', async () => {
  const user = await openOperaGame();
  expect(flying()).toBeNull();
  expect(
    document.querySelector('[data-square="e2"] [data-piece="wP"]'),
  ).not.toBeNull();

  await user.click(screen.getByRole('button', { name: 'Next move' }));

  // The board is already in the new position...
  expect(
    document.querySelector('[data-square="e4"] [data-piece="wP"]'),
  ).not.toBeNull();
  // ...and the flight from e2 to e4 is drawn over it. The destination piece is
  // the landing place, so the flying piece and the settled piece share a box.
  const fly = flying()!;
  expect(fly).toHaveAttribute('data-moving', 'e2e4');
  expect(fly).toHaveAttribute('data-piece', 'wP');
  // No `data-direction` any more: the offset below is the one source of truth.
  expect(fly.parentElement).toHaveAttribute('data-move-layer');
  // The flying box is one square (12.5% of the board) placed on the cell the
  // piece leaves: e2 is file 4, and its rank sits 6 rows down from the top when
  // White is at the bottom.
  expect(fly.style.width).toBe('12.5%');
  expect(fly.style.left).toBe('50%');
  expect(fly.style.top).toBe('75%');
  // The travel delta, in board fractions: 0 files, 2 ranks up.
  expect(fly.style.getPropertyValue('--mx')).toBe('0');
  expect(fly.style.getPropertyValue('--my')).toBe('-2');
  // Inline longhands, because jsdom applies no cascade and its rects are all 0.
  expect(fly.style.animationName).toBe('piece-move');
  expect(fly.style.animationDuration).toBe('220ms');
  expect(fly.style.animationTimingFunction).toBe('ease-out');
  expect(fly.style.animationFillMode).toBe('both');
  // The keyframes the browser actually gets are a single positive translation:
  // the offset already carries the direction, so nothing here negates it again.
  const css = document.querySelector('style')?.textContent ?? '';
  expect(css).toContain('translate(calc(var(--mx) * 100%)');
  expect(css).not.toContain('calc(var(--mx) * -100%)');
  // A reversed animation on top of an already-swapped offset is exactly the bug
  // that was fixed: the piece flew from the wrong cell to the right one.
  expect(['', 'normal']).toContain(fly.style.animationDirection);
});

test('stepping back slides the piece home again', async () => {
  const user = await openOperaGame();
  await user.click(screen.getByRole('button', { name: 'Next move' }));
  await user.click(screen.getByRole('button', { name: 'Previous move' }));
  const fly = flying()!;
  // `data-moving` names the travel, so a take-back reads e4 -> e2, and the box
  // starts on the cell the piece stands on now: e4.
  expect(fly).toHaveAttribute('data-moving', 'e4e2');
  expect(fly.style.left).toBe('50%');
  expect(fly.style.top).toBe('50%');
  // The offset must point at the destination for a take-back too — down to e2.
  // That is the regression this pins: the flight is driven by from/to alone, so
  // a step back needs no reversal anywhere else.
  expect(fly.style.getPropertyValue('--mx')).toBe('0');
  expect(fly.style.getPropertyValue('--my')).toBe('2');
  // The same single keyframes rule as a forward step: one rule, one source of
  // direction, and no reversed playback on top of it.
  expect(fly.style.animationName).toBe('piece-move');
  const css = document.querySelector('style')?.textContent ?? '';
  expect(css).toContain('translate(calc(var(--mx) * 100%)');
  expect(['', 'normal']).toContain(fly.style.animationDirection);
});

test('a take-back from a knight move flies the knight to its home square', async () => {
  const user = await openOperaGame();
  await user.click(screen.getByRole('button', { name: 'Next move' }));
  await user.click(screen.getByRole('button', { name: 'Next move' }));
  // The move-list buttons are the SAN lines inside the <ol>.
  await user.click(screen.getByRole('button', { name: 'Nf3' }));
  await user.click(screen.getByRole('button', { name: 'Previous move' }));

  // Taking back 2. Nf3: the knight stands on f3 and goes home to g1.
  const fly = flying()!;
  expect(fly).toHaveAttribute('data-moving', 'f3g1');
  expect(fly).toHaveAttribute('data-piece', 'wN');
  // The box starts on f3 — file 6, row 5 of 8 from the top. The offset then
  // points right and down, onto g1, the square the knight is going home TO.
  // Before the fix the rendered motion ran from the opposite cell back to f3,
  // so the piece appeared to fly to the wrong square.
  expect(fly.style.left).toBe('62.5%');
  expect(fly.style.top).toBe('62.5%');
  expect(fly.style.getPropertyValue('--mx')).toBe('1');
  expect(fly.style.getPropertyValue('--my')).toBe('2');
  // The same rule and the same absence of a reversal as any other step: for the
  // knight above, a reversed playback is what sent it to e5 instead of g1.
  expect(fly.style.animationName).toBe('piece-move');
  expect(['', 'normal']).toContain(fly.style.animationDirection);
});

test('a jump snaps: no flight is drawn', async () => {
  const user = await openOperaGame();
  await user.click(screen.getByRole('button', { name: 'Nf3' }));
  expect(flying()).toBeNull();
  expect(
    document.querySelector('[data-square="f3"] [data-piece="wN"]'),
  ).not.toBeNull();
  await user.keyboard('{End}');
  expect(flying()).toBeNull();
  await user.keyboard('{Home}');
  expect(flying()).toBeNull();
});

test('a flipped board flies the mirrored delta', async () => {
  const user = await openOperaGame();
  await user.click(screen.getByRole('button', { name: 'Next move' }));
  expect(flying()!.style.getPropertyValue('--my')).toBe('-2');
  await user.keyboard('f');
  // The same step now reads downward on screen, and the cell below is the
  // destination: e2 is file 2, rank 7 once Black is at the bottom.
  const fly = flying()!;
  expect(fly.style.getPropertyValue('--my')).toBe('2');
  expect(fly.style.left).toBe('37.5%');
  expect(fly.style.top).toBe('12.5%');
});

test('a game set up with Black to move shows each clock on its own player', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByLabelText('PGN'));
  await user.paste(`[White "Alice"]
[Black "Bob"]
[TimeControl "180"]
[SetUp "1"]
[FEN "r2q1rk1/pppp1ppp/8/8/4P3/8/PPP2PPP/R2Q1RK1 b - - 0 20"]

20... d5 {[%clk 0:01:00]} 21. exd5 {[%clk 0:02:00]} 21... Qxd5 {[%clk 0:00:50]} *`);
  await user.click(screen.getByRole('button', { name: 'Load PGN' }));
  const strip = (name: string) =>
    screen.getByText(name).parentElement!.parentElement!;

  await user.click(screen.getByRole('button', { name: 'Next move' }));
  expect(strip('Alice')).toHaveTextContent('3:00');
  expect(strip('Bob')).toHaveTextContent('1:00');

  await user.keyboard('{End}');
  expect(strip('Alice')).toHaveTextContent('2:00');
  expect(strip('Bob')).toHaveTextContent('0:50');
});

test('rejects an invalid PGN without leaving the games page', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('PGN'), '1. e4 e4');
  await user.click(screen.getByRole('button', { name: 'Load PGN' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Chess board/ })).toBeNull();
});

test('board colors can be changed in settings', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Settings' }));
  await user.click(screen.getByLabelText('brown'));
  await user.click(screen.getByRole('link', { name: 'Games' }));
  await user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));
  expect(document.querySelector('[data-square="a8"]')).toHaveStyle({
    background: 'rgb(240, 217, 181)',
  });
});

test('board can be resized with the slider handle and reset', async () => {
  const user = await openOperaGame();
  const handle = screen.getByRole('slider', { name: 'Board size' });
  const column = handle.parentElement!.parentElement!;
  handle.focus();
  await user.keyboard('{ArrowRight}');
  expect(column).toHaveStyle({ width: '280px' });
  await user.dblClick(handle);
  expect(column.style.width).toBe('');
});
