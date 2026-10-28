import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { SessionStrip } from './session-strip';

test('counts each result and reports net rating change and the peak', () => {
  render(
    <SessionStrip
      results={['L', 'W', 'W', 'D', 'L']}
      ratings={[1600, 1612, 1624, 1624, 1610]}
    />,
  );
  expect(
    screen.getByRole('img', { name: '5 games: 2 won, 2 lost, 1 drawn' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Net').nextSibling).toHaveTextContent('+10');
  expect(screen.getByText('Peak').nextSibling).toHaveTextContent('1624');
});

test('every block carries its letter, so colour is never the only signal', () => {
  const { container } = render(<SessionStrip results={['W', 'L', 'D']} />);
  expect(container.textContent).toContain('WLD');
});

test('without ratings it shows totals only', () => {
  render(<SessionStrip results={['W']} />);
  expect(screen.queryByText('Net')).toBeNull();
  expect(screen.queryByText('Peak')).toBeNull();
});

test('a long day shows the latest 15 blocks and still counts the whole day', () => {
  const results = [
    'L' as const,
    ...Array.from({ length: 15 }, () => 'W' as const),
  ];
  const ratings = [2000, ...Array.from({ length: 15 }, () => 1500)];
  render(<SessionStrip results={results} ratings={ratings} />);
  const img = screen.getByRole('img', {
    name: 'Latest 15 of 16 games: 15 won, 0 lost, 0 drawn',
  });
  expect(img).toHaveTextContent('W'.repeat(15));
  expect(img.textContent).not.toContain('L');
  expect(screen.getByText('Won').nextSibling).toHaveTextContent('15');
  expect(screen.getByText('Lost').nextSibling).toHaveTextContent('1');
  expect(screen.getByText('Peak').nextSibling).toHaveTextContent('2000');
  expect(screen.getByText('Net').nextSibling).toHaveTextContent('-500');
});

test('a lone game has a peak but no net change', () => {
  render(<SessionStrip results={['W']} ratings={[1500]} />);
  expect(screen.queryByText('Net')).toBeNull();
  expect(screen.getByText('Peak').nextSibling).toHaveTextContent('1500');
});
