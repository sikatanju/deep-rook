import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { stored } from '@/lib/analysis/fixtures';
import { parseReplay } from '@/lib/chess/replay';

import App from './App';

afterEach(() => localStorage.clear());

// A minute each. Me drops under ten seconds at 2. Nf3 and blunders 3. Bb5.
// The first three plies are opening theory, so Book moves go ungraded.
const replay = parseReplay(`[White "Me"]
[Black "You"]
[TimeControl "60+0"]

1. e4 {[%clk 0:00:59]} Nc6 {[%clk 0:00:58]} 2. Nf3 {[%clk 0:00:08]} a6 {[%clk 0:00:50]} 3. Bb5 {[%clk 0:00:07]} e5 {[%clk 0:00:49]} 4. Ba4 {[%clk 0:00:06.5]} *`);
const cps = [0, 0, 0, 0, 0, -900, -900, -900];

// The same, with a calm 3. c3 first: out of the book, 55 seconds on the clock.
const calmReplay = parseReplay(`[White "Me"]
[Black "You"]
[TimeControl "60+0"]

1. e4 {[%clk 0:00:59]} Nc6 {[%clk 0:00:58]} 2. Nf3 {[%clk 0:00:55]} a6 {[%clk 0:00:50]} 3. c3 {[%clk 0:00:08]} e5 {[%clk 0:00:49]} 4. Bb5 {[%clk 0:00:07]} d6 {[%clk 0:00:48]} 5. Ba4 {[%clk 0:00:06.5]} *`);
const calmCps = [0, 0, 0, 0, 0, 0, 0, -900, -900, -900];

async function openOverview(game = { replay, cps }) {
  const store = memoryStore();
  await store.save(stored(game));
  localStorage.setItem('lastUsername', 'me');
  location.hash = '#/overview';
  render(<App store={store} />);
}

test('the Overview rates mistakes with time on the clock and in time trouble', async () => {
  await openOverview({ replay: calmReplay, cps: calmCps });
  const trouble = await screen.findByText('In time trouble');
  expect(trouble.closest('[data-row]')).toHaveTextContent(
    '50.0 per 100 moves, 1 of 2',
  );
  // 1. e4 and 2. Nf3 are Book and go ungraded; 3. c3 is the one calm move.
  expect(document.querySelector('[data-row="calm"]')).toHaveTextContent(
    '0.0 per 100 moves, 0 of 1',
  );
  expect(screen.getByText(/came in time trouble, over/).textContent).toBe(
    '1 of your 1 mistake came in time trouble, over 1 game with clocks.',
  );
});

test('the review shows time per move and says when a move began in time trouble', async () => {
  await openOverview();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: /^Review again/ }),
  );

  expect(
    screen.getByRole('img', { name: /^Time per move\./ }),
  ).toHaveAccessibleName(
    'Time per move. Longest think 2. Nf3, 51s. Moves begun in time trouble: White 2, Black 0.',
  );
  expect(document.querySelectorAll('[data-trouble]')).toHaveLength(2);

  await user.keyboard(
    '{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}',
  );
  const coach = screen.getByRole('region', { name: 'Coach' });
  expect(coach).toHaveTextContent('Bb5 is a blunder');
  expect(coach).toHaveTextContent(
    'Played in time trouble, with 0:08.0 on the clock.',
  );

  await user.keyboard('{ArrowLeft}{ArrowLeft}');
  expect(
    within(screen.getByRole('region', { name: 'Coach' })).queryByText(
      /time trouble/,
    ),
  ).toBeNull();
});
