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
  const column = handle.closest('[style], .mx-auto') as HTMLElement;
  handle.focus();
  await user.keyboard('{ArrowRight}');
  expect(column).toHaveStyle({ width: '280px' });
  await user.dblClick(handle);
  expect(column.style.width).toBe('');
});
