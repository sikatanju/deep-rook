// Pins the ReportCard's DOM contract: the review page hands it a GameReport
// (or null, before the first analyzer flush) plus a jump callback, and reads
// it back purely through roles and data-* attributes. Every report literal is
// built by hand — report.ts's own functions are throwing stubs at this stage.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { Classification } from '@/lib/analysis/classify';
import type {
  GameReport,
  KeyMoment,
  PlayerReport,
} from '@/lib/analysis/report';

import { ReportCard } from './report-card';

const GRADES: readonly Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

/** All nine grades at zero: the stable shape streaming fills in, never grows. */
function zeroCounts(): Record<Classification, number> {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    miss: 0,
    blunder: 0,
  };
}

/** A player half with nothing graded yet, plus overrides. */
function player(overrides: Partial<PlayerReport> = {}): PlayerReport {
  return {
    accuracy: null,
    gradedPlies: 0,
    counts: zeroCounts(),
    ...overrides,
  };
}

/** A nothing-settled report, plus overrides. */
function report(overrides: Partial<GameReport> = {}): GameReport {
  return {
    white: player(),
    black: player(),
    keyMoments: [],
    settled: 0,
    total: 0,
    ...overrides,
  };
}

test('a null report holds the layout: ellipses, zero counts, no caption', () => {
  render(<ReportCard report={null} onJump={() => {}} />);

  const region = screen.getByRole('region', { name: 'Game report' });
  // Exactly two figures, both ellipses — never "NaN", never a fake 0.
  expect(document.querySelectorAll('[data-accuracy]')).toHaveLength(2);
  expect(document.querySelector('[data-accuracy="w"]')?.textContent).toMatch(
    /^\s*…\s*$/,
  );
  expect(document.querySelector('[data-accuracy="b"]')?.textContent).toMatch(
    /^\s*…\s*$/,
  );
  expect(screen.queryByText(/NaN/)).toBeNull();
  // Nine count cells per color, zeros included: nothing appears later that
  // would shift the card while the engine streams.
  for (const color of ['w', 'b'] as const) {
    for (const grade of GRADES) {
      expect(
        document.querySelector(
          `[data-color="${color}"] [data-grade="${grade}"]`,
        ),
      ).not.toBeNull();
    }
  }
  // No moments to offer and no progress caption.
  expect(within(region).queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryByText(/positions/)).toBeNull();
});

test('accuracy renders to one decimal; null stays an ellipsis', () => {
  render(
    <ReportCard
      report={report({ white: player({ accuracy: 84.2, gradedPlies: 30 }) })}
      onJump={() => {}}
    />,
  );
  expect(document.querySelector('[data-accuracy="w"]')?.textContent).toMatch(
    /^\s*84\.2\s*$/,
  );
  expect(document.querySelector('[data-accuracy="b"]')?.textContent).toMatch(
    /^\s*…\s*$/,
  );
});

test('counts are per color and include zeros', () => {
  render(
    <ReportCard
      report={report({
        black: player({
          counts: { ...zeroCounts(), blunder: 2, brilliant: 1 },
        }),
      })}
      onJump={() => {}}
    />,
  );
  expect(
    document.querySelector('[data-color="b"] [data-grade="blunder"]'),
  ).toHaveAttribute('data-count', '2');
  expect(
    document.querySelector('[data-color="w"] [data-grade="blunder"]'),
  ).toHaveAttribute('data-count', '0');
});

const moment: KeyMoment = {
  index: 31,
  moveNumber: 16,
  color: 'w',
  san: 'Qb8',
  grade: 'blunder',
  loss: 31,
};

test('key moments start collapsed and open from their summary', async () => {
  const user = userEvent.setup();
  render(
    <ReportCard report={report({ keyMoments: [moment] })} onJump={() => {}} />,
  );

  const summary = screen.getByText('Key moments');
  expect(summary.closest('summary')).toHaveTextContent(/Key moments\s*1/);
  const button = screen.getByRole('button', { name: /16\. Qb8/, hidden: true });
  expect(button).not.toBeVisible();

  await user.click(summary);
  expect(button).toBeVisible();
});

test('key moments are list buttons that jump after the move', async () => {
  const onJump = vi.fn();
  const user = userEvent.setup();
  render(
    <ReportCard report={report({ keyMoments: [moment] })} onJump={onJump} />,
  );
  await user.click(screen.getByText('Key moments'));

  // Substring match: the required GradeBadge contributes its own accessible
  // label ("Blunder") to the button's name, so the exact string is not "16. Qb8".
  const button = screen.getByRole('button', { name: /16\. Qb8/ });
  expect(button.closest('ol')).not.toBeNull();
  expect(
    within(button).getByRole('img', { name: 'Blunder' }),
  ).toBeInTheDocument();
  await user.click(button);
  expect(onJump).toHaveBeenCalledWith(31);
});

test('the card carries no progress caption; the progress bar owns that', () => {
  render(
    <ReportCard report={report({ settled: 3, total: 34 })} onJump={() => {}} />,
  );
  expect(screen.queryByText(/positions/)).toBeNull();
});
