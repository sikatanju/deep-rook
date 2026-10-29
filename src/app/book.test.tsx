import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { memoryProgress } from '@/lib/analysis/drill-progress';
import { stored } from '@/lib/analysis/fixtures';
import {
  positionsFromStored,
  type GameAnalysis,
} from '@/lib/analysis/game-analysis';

// The Opera Game's first five plies are theory. The engine calls White's
// 2.Nf3 a blunder (level, then down 4), and 3...Bg4, the first move out of the
// table, a slip of Black's that it settles as an ordinary grade.
const record = stored({
  cps: [0, 0, 0, -400, -400, -400, -400, ...Array(27).fill(-400)],
  pvs: { 2: ['d2d4'] },
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

test('a theory move is Book in the coach and the move list, not a blunder', async () => {
  const user = await openOperaGame();
  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
  const coach = screen.getByRole('region', { name: 'Coach' });
  await waitFor(() => expect(coach).toHaveTextContent('Nf3 is a book move'));
  expect(
    document.querySelector('[aria-current="step"] [data-grade="book"]'),
  ).not.toBeNull();
  // The sticker is decorative there: the move keeps its plain name.
  expect(screen.getByRole('button', { name: 'Nf3' })).toBeInTheDocument();
  expect(document.querySelector('[data-book="5"]')).not.toBeNull();

  // The first move out of the table is judged again.
  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
  expect(coach).not.toHaveTextContent('book move');
});

test('the report counts no Book move, and Next mistake has none to walk to', async () => {
  const user = await openOperaGame();
  await waitFor(() =>
    expect(
      document.querySelector('[data-grade="blunder"][data-count="0"]'),
    ).not.toBeNull(),
  );
  // The engine's one slip is a Book move, so there is nothing to walk to.
  expect(
    screen.getByRole('button', { name: 'No more mistakes' }),
  ).toBeDisabled();
  await user.keyboard('n');
  expect(document.querySelector('[aria-current="step"]')).toBeNull();
});

test('a mistake in the book is no drill', async () => {
  const store = memoryStore();
  await store.save(record);
  localStorage.setItem('lastUsername', 'paul morphy');
  location.hash = '#/drill';
  render(<App store={store} progress={memoryProgress()} />);
  expect(await screen.findByText('Clean sheet.')).toBeInTheDocument();
});
