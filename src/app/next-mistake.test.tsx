import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { stored } from '@/lib/analysis/fixtures';
import {
  positionsFromStored,
  type GameAnalysis,
} from '@/lib/analysis/game-analysis';

// The engine is replaced by a finished analysis with hand-picked evals, so the
// grades (and so the mistakes to walk) are known.
//
// White's evals by position: level until 2.Nf3 (ply 2) throws away 150, then
// 4...Bxf3 (ply 7) hands it back with interest, then 11.Bxb5+ (ply 20) loses it
// all again. Plies 2 and 20 are White's slips, ply 7 is Black's.
const record = stored({
  cps: [
    ...Array(3).fill(0),
    ...Array(5).fill(-150),
    ...Array(13).fill(250),
    ...Array(13).fill(-150),
  ],
});
const positions = positionsFromStored(record.lines);

vi.mock('@/hooks/use-game-analysis', async (original) => ({
  ...(await original<typeof import('@/hooks/use-game-analysis')>()),
  useGameAnalysis: (): GameAnalysis => ({
    gameId: 0,
    level: 'balanced',
    positions,
    done: positions.length,
    unavailable: false,
  }),
}));

import App from './App';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function openOperaGame() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));
  await user.click(screen.getByRole('button', { name: 'Review game' }));
  return user;
}

/** The SAN of the move on screen, from the move list's current step. */
const onScreen = () =>
  document.querySelector('[aria-current="step"]')?.textContent ?? '';
const nextButton = () => screen.getByRole('button', { name: /mistake/ });

test('Next mistake and N walk the slips of both sides, and Shift+N walks back', async () => {
  const user = await openOperaGame();
  expect(nextButton()).toHaveTextContent('Next mistake');

  await user.click(nextButton());
  expect(onScreen()).toContain('Nf3');
  await user.keyboard('n');
  expect(onScreen()).toContain('Bxf3');
  await user.keyboard('n');
  expect(onScreen()).toContain('Bxb5+');

  await user.keyboard('N');
  expect(onScreen()).toContain('Bxf3');
  await user.keyboard('N');
  expect(onScreen()).toContain('Nf3');
  // Nothing before the first: the key leaves the board where it is.
  await user.keyboard('N');
  expect(onScreen()).toContain('Nf3');
});

test('with no later mistake the button is disabled and says so', async () => {
  const user = await openOperaGame();
  await user.keyboard('{End}');
  const button = screen.getByRole('button', { name: 'No more mistakes' });
  expect(button).toBeDisabled();

  await user.keyboard('n');
  expect(onScreen()).toContain('Rd8#');
});

test('on your own game only your moves count', async () => {
  localStorage.setItem('lastUsername', 'Paul Morphy');
  const user = await openOperaGame();

  await user.keyboard('n');
  expect(onScreen()).toContain('Nf3');
  // Black's blunder on ply 7 is skipped.
  await user.keyboard('n');
  expect(onScreen()).toContain('Bxb5+');
  expect(
    screen.getByRole('button', { name: 'No more mistakes' }),
  ).toBeDisabled();
});

test('the shortcut list names both keys', async () => {
  const user = await openOperaGame();
  await user.keyboard('?');
  const rows = screen
    .getAllByRole('listitem')
    .map((li) => li.textContent)
    .filter((t) => /mistake/.test(t ?? ''));
  expect(rows).toEqual(['Next mistakeN', 'Previous mistakeShift N']);
});

test('the report card names the opening once the table has loaded', async () => {
  await openOperaGame();
  const card = screen.getByRole('region', { name: 'Game report' });
  await waitFor(() => expect(card).toHaveTextContent('Philidor Defense'));
  expect(card).toHaveTextContent('C41');
});
