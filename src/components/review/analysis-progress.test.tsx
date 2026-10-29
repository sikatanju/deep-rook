import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { PositionAnalysis } from '@/lib/analysis/game-analysis';
import { cpLine } from '@/lib/analysis/fixtures';

import { AnalysisProgress } from './analysis-progress';

const done: PositionAnalysis = { status: 'done', line: cpLine(0) };
const blank: PositionAnalysis = { status: 'queued', line: null };

const doc = (
  settled: number,
  total: number,
  level: 'fast' | 'balanced' = 'fast',
  unavailable = false,
) => ({
  level,
  unavailable,
  positions: Array.from({ length: total }, (_, i) =>
    i < settled ? done : blank,
  ),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

test('a progress bar shows the positions done out of the total', () => {
  render(<AnalysisProgress analysis={doc(12, 68)} />);
  const bar = screen.getByRole('progressbar');
  expect(bar).toHaveAttribute('aria-valuenow', '18');
  expect(bar).toHaveAttribute(
    'aria-valuetext',
    'Analyzing: 12 of 68 positions',
  );
  expect(screen.getByText('12/68 positions')).toBeInTheDocument();
});

test('the estimate waits for a few positions, then is labelled approximate', () => {
  const { rerender } = render(<AnalysisProgress analysis={doc(1, 60)} />);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByText(/left/)).toBeNull();
  rerender(<AnalysisProgress analysis={doc(11, 60)} />);
  act(() => vi.advanceTimersByTime(4000));
  // 10 positions in 4 s leaves 49 at 0.4 s each.
  expect(screen.getByText(/Approx\. 20 s left/)).toBeInTheDocument();
});

test('it announces politely, a few times, and says so when it is done', () => {
  const { rerender } = render(<AnalysisProgress analysis={doc(10, 40)} />);
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Analysis 25% done.');
  rerender(<AnalysisProgress analysis={doc(11, 40)} />);
  expect(screen.getByRole('status')).toHaveTextContent('Analysis 25% done.');
  rerender(<AnalysisProgress analysis={doc(40, 40)} />);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Analysis complete.');
});

test('a finished analysis shows nothing and announces nothing', () => {
  render(<AnalysisProgress analysis={doc(40, 40)} />);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

test('both passes fill one bar: the first look is the first half', () => {
  const lined: PositionAnalysis = { status: 'queued', line: cpLine(0) };
  const { rerender } = render(
    <AnalysisProgress
      analysis={{
        level: 'balanced',
        unavailable: false,
        positions: [lined, lined, blank, blank],
      }}
    />,
  );
  expect(screen.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '25',
  );
  expect(screen.getByText('First look')).toBeInTheDocument();
  rerender(
    <AnalysisProgress
      analysis={{
        level: 'balanced',
        unavailable: false,
        positions: [done, lined, lined, lined],
      }}
    />,
  );
  expect(screen.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '63',
  );
  expect(screen.getByText('Deepening')).toBeInTheDocument();
});

test('with no engine there is no bar to wait on', () => {
  render(<AnalysisProgress analysis={doc(0, 10, 'fast', true)} />);
  expect(screen.queryByRole('progressbar')).toBeNull();
});
