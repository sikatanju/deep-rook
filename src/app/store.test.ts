import { afterEach, describe, expect, test } from 'vitest';

import { loadSettings, parseSettings } from './store';

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

test('palette is validated alone and defaults to Pop Quiz', () => {
  expect(parseSettings(null).palette).toBe('pop');
  expect(parseSettings('{"palette":"arcade"}').palette).toBe('arcade');
  expect(parseSettings('{"palette":"hotdog","coordinates":false}')).toEqual({
    ...parseSettings(null),
    coordinates: false,
  });
  expect(parseSettings('{"palette":"toString"}').palette).toBe('pop');
});

describe('loadSettings', () => {
  afterEach(() => localStorage.clear());

  test('the old dark toggle becomes Arcade Night until a palette is saved', () => {
    localStorage.setItem('theme', 'dark');
    expect(loadSettings().palette).toBe('arcade');
    localStorage.setItem('settings', '{"palette":"mint"}');
    expect(loadSettings().palette).toBe('mint');
  });

  test('the old light toggle changes nothing', () => {
    localStorage.setItem('theme', 'light');
    expect(loadSettings().palette).toBe('pop');
  });
});
