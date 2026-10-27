import { expect, test } from 'vitest';

import { badgeLabel } from './levels';

test('the badge names the depth when time or nodes stop the line', () => {
  expect(badgeLabel('deep', null)).toBe('Deep review');
  expect(badgeLabel('deep', { depth: 16 })).toBe('Deep review');
  expect(badgeLabel('deep', { depth: 11, capped: 'nodes' })).toBe(
    'Deep review, depth 11',
  );
  expect(badgeLabel('balanced', { depth: 3, capped: 'time' })).toBe(
    'Balanced review, depth 3',
  );
});
