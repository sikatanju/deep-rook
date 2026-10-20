import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { AnalysisMeter } from './analysis-meter';

test('reports progress and lights the open phase, striking the finished ones', () => {
  render(<AnalysisMeter done={21} total={34} phase="first-light" />);
  const bar = screen.getByRole('progressbar', { name: 'Analysis progress' });
  expect(bar).toHaveAttribute('aria-valuenow', '21');
  expect(bar).toHaveAttribute('aria-valuemax', '34');
  expect(bar).toHaveAttribute('data-done', 'false');
  expect(screen.getByText('21/34 positions')).toBeInTheDocument();
  expect(screen.getByText('First light')).toHaveAttribute(
    'aria-current',
    'step',
  );
  expect(screen.getByText('Focus')).toHaveClass('line-through');
  expect(screen.getByText('Upgrades')).not.toHaveClass('line-through');
});

test('complete turns the bar done and finishes every phase', () => {
  render(<AnalysisMeter done={34} total={34} phase="done" />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('data-done', 'true');
  expect(screen.getByText('Analysis done')).toBeInTheDocument();
  for (const phase of ['Focus', 'First light', 'Upgrades'])
    expect(screen.getByText(phase)).toHaveClass('line-through');
});

test('with no phase (engine unavailable) none is lit, and the label replaces the count', () => {
  render(<AnalysisMeter done={0} total={34} label="Engine unavailable" />);
  expect(screen.getByText('Engine unavailable')).toBeInTheDocument();
  expect(document.querySelector('[aria-current="step"]')).toBeNull();
});

test('an empty game never divides by zero', () => {
  render(<AnalysisMeter done={0} total={0} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('data-done', 'false');
});
