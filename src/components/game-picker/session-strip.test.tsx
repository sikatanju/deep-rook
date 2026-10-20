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

test('a lone game has a peak but no net change', () => {
  render(<SessionStrip results={['W']} ratings={[1500]} />);
  expect(screen.queryByText('Net')).toBeNull();
  expect(screen.getByText('Peak').nextSibling).toHaveTextContent('1500');
});
