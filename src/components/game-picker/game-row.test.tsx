import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { GameRow } from './game-row';

const row = {
  result: 'loss',
  opponent: 'Rival',
  opponentRating: 1490,
  playedWhite: false,
  timeControl: 'bullet 60',
  myRating: 1500,
  when: 'Oct 20, 01:33 PM',
  dateTime: '2026-10-20T13:33:00.000Z',
} as const;

test('the whole row is a button that reports its pressed state', async () => {
  const onSelect = vi.fn();
  const { rerender } = render(
    <GameRow {...row} selected={false} onSelect={onSelect} />,
  );
  const button = screen.getByRole('button', { name: /Rival/ });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(button);
  expect(onSelect).toHaveBeenCalledOnce();

  rerender(<GameRow {...row} selected onSelect={onSelect} />);
  expect(button).toHaveAttribute('aria-pressed', 'true');
});

test('says the result in words and which side you played', () => {
  render(<GameRow {...row} selected={false} onSelect={() => {}} />);
  expect(screen.getByText('Lost')).toBeInTheDocument();
  expect(screen.getByText(/Black against/)).toBeInTheDocument();
  expect(screen.getByText('(1490)')).toBeInTheDocument();
});
