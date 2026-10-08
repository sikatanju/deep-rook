import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import App from './App';

afterEach(() => vi.unstubAllGlobals());

test('renders the app shell with the username form', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'DeepRook' })).toBeInTheDocument();
  expect(screen.getByLabelText('Chess.com username')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Find games' })).toBeDisabled();
});

test('lists games for a user and opens one in the review page', async () => {
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body)));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/games/archives'))
        return json({ archives: ['https://x/pub/player/me/games/2025/01'] });
      if (url.includes('/games/2025/01'))
        return json({
          games: [
            {
              url: 'https://www.chess.com/game/live/1',
              pgn: '[White "Me"]\n[Black "Rival"]\n\n1. e4 e5',
              end_time: 1735949652,
              time_control: '180',
              time_class: 'blitz',
              rules: 'chess',
              rated: true,
              white: { username: 'Me', rating: 1500, result: 'win' },
              black: { username: 'Rival', rating: 1490, result: 'resigned' },
            },
          ],
        });
      return json({ username: 'Me', joined: 1 });
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('Chess.com username'), 'Me');
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  const row = await screen.findByRole('button', { name: /Rival/ });
  await user.click(row);
  expect(
    await screen.findByRole('img', { name: /Chess board/ }),
  ).toBeInTheDocument();
  expect(screen.getByText('Rival')).toBeInTheDocument();
});

test('shows a message when the user does not exist', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('Chess.com username'), 'nobody');
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No Chess.com player',
  );
});
