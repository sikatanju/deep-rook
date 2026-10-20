import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { CoachBubble } from './coach-bubble';
import { GradeSticker } from './grade-sticker';

test('says what happened: grade, move, eval, the one-liner and the plain sentence', () => {
  render(
    <CoachBubble
      grade="brilliant"
      move="16. Qb8+"
      eval="M1"
      title="Queen sac! The board just gasped."
      actions={<button>Show line</button>}
    >
      Give the queen, mate next move.
    </CoachBubble>,
  );
  const coach = screen.getByRole('region', { name: 'Coach' });
  expect(coach).toHaveTextContent('Brilliant');
  expect(coach).toHaveTextContent('16. Qb8+');
  expect(coach).toHaveTextContent('M1');
  expect(coach).toHaveTextContent('Queen sac! The board just gasped.');
  expect(coach).toHaveTextContent('Give the queen, mate next move.');
  expect(screen.getByRole('button', { name: 'Show line' })).toBeInTheDocument();
});

test('a bare bubble is just the line', () => {
  render(<CoachBubble title="Ready when you are." />);
  expect(screen.getByRole('region', { name: 'Coach' })).toHaveTextContent(
    'Ready when you are.',
  );
});

test('an icon-only sticker still names its grade', () => {
  render(<GradeSticker grade="blunder" iconOnly />);
  expect(screen.getByRole('img', { name: 'Blunder' })).toHaveAttribute(
    'data-grade',
    'blunder',
  );
});
