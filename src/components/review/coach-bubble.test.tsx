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
  expect(coach).toHaveTextContent('16. Qb8+ is a brilliant');
  expect(coach).toHaveTextContent('M1');
  expect(coach).toHaveTextContent('Queen sac! The board just gasped.');
  expect(coach).toHaveTextContent('Give the queen, mate next move.');
  expect(screen.getByRole('button', { name: 'Show line' })).toBeInTheDocument();
});

test('a played move that was not the engine’s pick names the better one', () => {
  render(
    <CoachBubble
      grade="mistake"
      move="1… e6"
      eval="+0.2"
      best={{ san: 'Nf6' }}
      title="Oops."
    >
      Wobbly.
    </CoachBubble>,
  );
  const coach = screen.getByRole('region', { name: 'Coach' });
  expect(coach).toHaveTextContent('1… e6 is a mistake');
  expect(coach).toHaveTextContent('Best was Nf6');
  expect(coach).not.toHaveTextContent('Next best');
});

test('names the best and the next best move, each with its eval', () => {
  render(
    <CoachBubble
      grade="inaccuracy"
      move="3. Bc4"
      eval="-0.1"
      best={{ san: 'Nf3', eval: '+0.4' }}
      next={{ san: 'd4', eval: '+0.2' }}
      title="Wobbly."
    />,
  );
  const coach = screen.getByRole('region', { name: 'Coach' });
  expect(coach).toHaveTextContent('Best was Nf3 (+0.4)');
  expect(coach).toHaveTextContent('Next best was d4 (+0.2)');
});

test('a best move still shows the next best, and no "Best was"', () => {
  render(
    <CoachBubble
      grade="great"
      move="14. Rd1"
      eval="+4.0"
      next={{ san: 'Bxd7+', eval: '-0.5' }}
      title="Great find."
    />,
  );
  const coach = screen.getByRole('region', { name: 'Coach' });
  expect(coach).toHaveTextContent('Next best was Bxd7+ (-0.5)');
  expect(coach).not.toHaveTextContent('Best was');
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

test('a theory move reads as a book move', () => {
  render(
    <CoachBubble
      grade="book"
      move="1. e4"
      eval="+0.3"
      title="Straight from the opening book."
    />,
  );
  expect(screen.getByRole('region', { name: 'Coach' })).toHaveTextContent(
    '1. e4 is a book move',
  );
});
