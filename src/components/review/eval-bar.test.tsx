// jsdom has no layout, so these tests read the fill's and the label's
// geometry from their inline style.

import { cleanup, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import type { Score } from '@/lib/chess/score';

import { EvalBar } from './eval-bar';

function renderBar(score: Score | null, flipped = false) {
  render(<EvalBar score={score} flipped={flipped} />);
  const meter = screen.getByRole('meter', { name: "White's winning chances" });
  const fill = meter.querySelector<HTMLElement>('[data-fill]')!;
  return { meter, fill };
}

test("a level position fills half from the bottom and labels White's end", () => {
  const { meter, fill } = renderBar({ kind: 'cp', cp: 0 });
  expect(meter).toHaveAttribute('aria-valuenow', '50');
  expect(fill.style.height).toBe('50%');
  expect(fill.style.bottom).toBe('0px');
  expect(fill.style.top).toBe('');
  expect(screen.getByText('0.0').style.bottom).not.toBe('');
});

test('White mating fills the whole bar; Black mating empties it', () => {
  const white = renderBar({ kind: 'mate', winner: 'w', moves: 3 });
  expect(white.meter).toHaveAttribute('aria-valuenow', '100');
  expect(white.fill.style.height).toBe('100%');
  expect(white.meter).toHaveTextContent(/^M3$/);
  cleanup();

  const black = renderBar({ kind: 'mate', winner: 'b', moves: 2 });
  expect(black.meter).toHaveAttribute('aria-valuenow', '0');
  expect(black.fill.style.height).toBe('0%');
  expect(black.meter).toHaveTextContent(/^M2$/);
});

test('mate on the board reads #', () => {
  const { meter } = renderBar({ kind: 'mate', winner: 'b', moves: 0 });
  expect(meter).toHaveTextContent(/^#$/);
});

test('the label sits at the winning side, in pawns without a sign', () => {
  renderBar({ kind: 'cp', cp: 30 });
  const white = screen.getByText('0.3');
  expect(white.style.bottom).not.toBe('');
  expect(white.style.top).toBe('');
  cleanup();

  renderBar({ kind: 'cp', cp: -210 });
  const black = screen.getByText('2.1');
  expect(black.style.top).not.toBe('');
  expect(black.style.bottom).toBe('');
});

test('flipped puts White and its label at the top', () => {
  const { fill } = renderBar({ kind: 'cp', cp: 120 }, true);
  expect(fill.style.top).toBe('0px');
  expect(fill.style.bottom).toBe('');
  const label = screen.getByText('1.2');
  expect(label.style.top).not.toBe('');
  expect(label.style.bottom).toBe('');
});

test('with no score the bar rests level with no label', () => {
  const { meter, fill } = renderBar(null);
  expect(meter).toHaveAttribute('aria-valuenow', '50');
  expect(fill.style.height).toBe('50%');
  expect(meter).toHaveTextContent(/^$/);
});
