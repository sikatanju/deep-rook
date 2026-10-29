import { expect, test } from 'vitest';

import {
  addExtraName,
  MAX_EXTRA_NAMES,
  mergeExtraNames,
  parseExtraNames,
} from './extra-names';

test('a name is trimmed, and a repeat in any case is not added twice', () => {
  expect(addExtraName([], '  Paul Morphy ')).toEqual(['Paul Morphy']);
  expect(addExtraName(['Paul Morphy'], 'paul morphy')).toEqual(['Paul Morphy']);
  expect(addExtraName(['a'], 'b')).toEqual(['a', 'b']);
});

test('a blank name, and one past the cap, are not added', () => {
  expect(addExtraName(['a'], '   ')).toEqual(['a']);
  const full = Array.from({ length: MAX_EXTRA_NAMES }, (_, i) => `n${i}`);
  expect(addExtraName(full, 'one more')).toEqual(full);
});

test('saved names are kept only when they are usable strings', () => {
  expect(parseExtraNames(undefined)).toEqual([]);
  expect(parseExtraNames('Paul')).toEqual([]);
  expect(parseExtraNames([' Paul ', 3, '', 'paul', null, 'Ann'])).toEqual([
    'Paul',
    'Ann',
  ]);
});

test('merging keeps the names here and adds only the new ones', () => {
  expect(mergeExtraNames(['Paul', 'Ann'], ['ann', 'Bob'])).toEqual([
    'Paul',
    'Ann',
    'Bob',
  ]);
});
