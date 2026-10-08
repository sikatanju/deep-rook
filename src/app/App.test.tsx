import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import App from './App';

test('renders the app shell', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'DeepRook' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Analyze a game' }),
  ).toBeInTheDocument();
});
