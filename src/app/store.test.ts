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

test('piece set is validated alone and defaults to Kiwen Suwi', () => {
  expect(parseSettings(null).pieceSet).toBe('kiwen');
  expect(parseSettings('{"pieceSet":"rhosgfx"}').pieceSet).toBe('rhosgfx');
  expect(parseSettings('{"pieceSet":"papercut"}').pieceSet).toBe('papercut');
  expect(parseSettings('{"pieceSet":"alpha"}').pieceSet).toBe('kiwen');
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
