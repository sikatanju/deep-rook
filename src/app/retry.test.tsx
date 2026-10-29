import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { memoryProgress } from '@/lib/analysis/drill-progress';
import { OPERA_SLIPS, stored } from '@/lib/analysis/fixtures';
import {
  positionsFromStored,
  type GameAnalysis,
} from '@/lib/analysis/game-analysis';

// The engine is replaced by a finished analysis: Black's 4...Bxf3 is a blunder
// where the engine wanted 4...dxe5, and 7...Qe7 a mistake (see OPERA_SLIPS).
const record = stored({ ...OPERA_SLIPS, level: 'fast' });
const positions = positionsFromStored(record.lines);

vi.mock('@/hooks/use-game-analysis', async (original) => ({
  ...(await original<typeof import('@/hooks/use-game-analysis')>()),
  useGameAnalysis: (): GameAnalysis => ({
    gameId: 0,
    level: 'fast',
    positions,
    done: positions.length,
    unavailable: false,
  }),
}));

import App from './App';

const BLACK = 'Duke Karl / Count Isouard';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** The Opera game, open on Black's blunder, with the player's name saved. */
async function openOnBlunder(username: string | null = BLACK) {
  if (username) localStorage.setItem('lastUsername', username);
  const progress = memoryProgress();
  const store = memoryStore();
  const user = userEvent.setup();
  render(<App store={store} progress={progress} />);
  await user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));
  await user.click(screen.getByRole('button', { name: 'Review game' }));
  await user.keyboard('n');
  return Object.assign(user, { progress, store });
}

const square = (name: RegExp | string) => screen.getByRole('button', { name });
const retryButton = () => screen.queryByRole('button', { name: 'Retry' });
const onScreen = () =>
  document.querySelector('[aria-current="step"]')?.textContent ?? '';
const coach = () => screen.getByRole('region', { name: 'Coach' });
const arrow = () => document.querySelector('[data-arrow]');

async function play(
  user: ReturnType<typeof userEvent.setup>,
  from: RegExp,
  to: RegExp,
) {
  await user.click(square(from));
  await user.click(square(to));
}

test('Retry is offered on the reviewed player’s own mistakes only', async () => {
  const user = await openOnBlunder();
  expect(onScreen()).toContain('Bxf3');
  expect(retryButton()).not.toBeNull();

  // 7...Qe7 is a mistake too; the move before it was fine.
  await user.keyboard('n');
  expect(onScreen()).toContain('Qe7');
  expect(retryButton()).not.toBeNull();
  await user.keyboard('{ArrowLeft}');
  expect(retryButton()).toBeNull();
});

test('on the opponent’s game there is nothing to retry', async () => {
  const user = await openOnBlunder('Paul Morphy');
  // No mistake of theirs to walk to, so step to the blunder by hand.
  await user.keyboard('{ArrowRight>8/}');
  expect(coach()).toHaveTextContent('4… Bxf3 is a blunder');
  expect(retryButton()).toBeNull();
});

test('retrying hides the answer and finding the best move solves it', async () => {
  const user = await openOnBlunder();
  await user.click(retryButton()!);

  // The bishop is back on g4, and nothing gives the engine's move away.
  expect(square('g4, black bishop')).toBeInTheDocument();
  expect(screen.getByText('Your move.')).toBeInTheDocument();
  expect(arrow()).toBeNull();
  expect(screen.queryByText(/Best was/)).toBeNull();
  expect(screen.queryByText(/Engine line/i)).toBeNull();
  expect(screen.getByRole('button', { name: 'Show answer' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();

  await play(user, /^d6,/, /^e5,/);
  expect(screen.getByText('You found it.')).toBeInTheDocument();
  expect(screen.getByText(/You played Bxf3, which cost 31\.3/)).toBeVisible();
  expect(screen.getByText(/Best was/)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Back to the review' }));
  expect(onScreen()).toContain('Bxf3');
  expect(coach()).toHaveTextContent('4… Bxf3 is a blunder');
  expect(square('f3, black bishop')).toBeInTheDocument();

  // Nothing about a retry is saved.
  expect(await user.progress.list()).toEqual([]);
  expect(await user.store.list()).toEqual([]);
});

test('the played move and a worse one are told apart and allow another try', async () => {
  const user = await openOnBlunder();
  await user.click(retryButton()!);

  await play(user, /^g4,/, /^f3,/);
  expect(screen.getByText('That is the move you played.')).toBeInTheDocument();
  expect(screen.getByText(/Bxf3 gives up 31\.3 points/)).toBeInTheDocument();
  expect(square('g4, black bishop')).toBeInTheDocument();

  // The engine cannot run here, so a move the saved lines cannot judge falls short.
  await play(user, /^g8,/, /^f6/);
  expect(
    await screen.findByText("Not the engine's first choice."),
  ).toBeInTheDocument();
  expect(arrow()).toBeNull();

  await user.type(screen.getByLabelText('Type your move'), 'dxe5{Enter}');
  expect(screen.getByText('You found it.')).toBeInTheDocument();
});

test('Show answer reveals the engine move and Cancel returns to the move', async () => {
  const user = await openOnBlunder();
  await user.click(retryButton()!);
  await user.click(screen.getByRole('button', { name: 'Show answer' }));

  expect(screen.getByText("Here is the engine's move.")).toBeInTheDocument();
  expect(arrow()).toHaveAttribute('data-arrow', 'd6e5');
  expect(screen.getByText(/Best was/)).toHaveTextContent('dxe5');

  await user.click(screen.getByRole('button', { name: 'Back to the review' }));
  expect(onScreen()).toContain('Bxf3');
  expect(retryButton()).not.toBeNull();

  // Cancel is there from the start, and from after a miss.
  await user.click(retryButton()!);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onScreen()).toContain('Bxf3');
  expect(square('f3, black bishop')).toBeInTheDocument();

  await user.click(retryButton()!);
  await play(user, /^g4,/, /^f3,/);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onScreen()).toContain('Bxf3');
  expect(retryButton()).not.toBeNull();
});

test('stepping away ends the retry', async () => {
  const user = await openOnBlunder();
  await user.click(retryButton()!);
  expect(screen.getByText('Your move.')).toBeInTheDocument();
  await user.keyboard('{ArrowLeft}');
  expect(screen.queryByText('Your move.')).toBeNull();
  await user.keyboard('{ArrowRight}{ArrowRight}');
  expect(coach()).toHaveTextContent('4… Bxf3 is a blunder');
});
