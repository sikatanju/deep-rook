import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { OPERA_SLIPS, stored } from '@/lib/analysis/fixtures';
import type {
  GameAnalysis,
  PositionAnalysis,
} from '@/lib/analysis/game-analysis';

import { ExportPgn } from './export-pgn';

function analysis(patch: Record<number, PositionAnalysis> = {}): GameAnalysis {
  const record = stored(OPERA_SLIPS);
  const positions = record.lines.map(
    (line, i): PositionAnalysis => patch[i] ?? { status: 'done', line },
  );
  return {
    gameId: 1,
    level: record.level,
    positions,
    done: positions.filter(
      (position) => position.status === 'done' || position.status === 'failed',
    ).length,
    unavailable: false,
  };
}

const record = stored(OPERA_SLIPS);

test('stays disabled while a position failed, even though every position has settled', () => {
  const { rerender } = render(
    <ExportPgn
      replay={record.replay}
      analysis={analysis({ 1: { status: 'failed' } })}
    />,
  );
  const button = screen.getByRole('button', { name: 'Download annotated PGN' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute(
    'title',
    'Download annotated PGN (a position has no eval)',
  );

  rerender(<ExportPgn replay={record.replay} analysis={analysis()} />);
  expect(button).toBeEnabled();
});

test('stays disabled while a position is still searching', () => {
  render(
    <ExportPgn
      replay={record.replay}
      analysis={analysis({ 2: { status: 'searching', line: null } })}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Download annotated PGN' }),
  ).toBeDisabled();
});
