import { expect, test } from 'vitest';

import { parseSettings } from './store';

test('saved settings keep each valid field and default each bad one alone', () => {
  const defaults = parseSettings(null);
  expect(parseSettings('{not json')).toEqual(defaults);
  expect(parseSettings('"a string"')).toEqual(defaults);
  expect(
    parseSettings(
      JSON.stringify({
        analysisLevel: 'deep',
        coordinates: !defaults.coordinates,
        autoplayMs: 99_999,
        boardTheme: 'toString',
      }),
    ),
  ).toEqual({
    ...defaults,
    analysisLevel: 'deep',
    coordinates: !defaults.coordinates,
  });
  expect(parseSettings('{"analysisLevel":"constructor"}').analysisLevel).toBe(
    defaults.analysisLevel,
  );
});
