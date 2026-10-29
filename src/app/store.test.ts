import { afterEach, describe, expect, test, vi } from 'vitest';

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

test('sound is on by default and a non-boolean falls back to it', () => {
  expect(parseSettings(null).sound).toBe(true);
  expect(parseSettings('{"sound":false}').sound).toBe(false);
  expect(parseSettings('{"sound":"no"}').sound).toBe(true);
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
  afterEach(() => {
    localStorage.clear();
    document.cookie = 'settings=; Path=/; Max-Age=0';
    vi.unstubAllGlobals();
  });

  const osPrefersDark = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
    }));

  test('a dark OS starts on Arcade Night until a palette is saved', () => {
    osPrefersDark();
    expect(loadSettings().palette).toBe('arcade');
    localStorage.setItem('settings', '{"palette":"pop"}');
    expect(loadSettings().palette).toBe('pop');
    localStorage.clear();
    document.cookie = `settings=${encodeURIComponent('{"palette":"newsprint"}')}; Path=/`;
    expect(loadSettings().palette).toBe('newsprint');
  });

  test('a light OS, or none, starts on Pop Quiz', () => {
    expect(loadSettings().palette).toBe('pop');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(loadSettings().palette).toBe('pop');
  });

  test('the old dark toggle becomes Arcade Night until a palette is saved', () => {
    localStorage.setItem('theme', 'dark');
    expect(loadSettings().palette).toBe('arcade');
    localStorage.setItem('settings', '{"palette":"newsprint"}');
    expect(loadSettings().palette).toBe('newsprint');
  });

  test('a settings cookie wins over local storage', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        palette: 'newsprint',
        boardTheme: 'brown',
        pieceSet: 'kiwen',
      }),
    );
    document.cookie = `settings=${encodeURIComponent(
      JSON.stringify({
        palette: 'arcade',
        boardTheme: 'blue',
        pieceSet: 'papercut',
      }),
    )}; Path=/`;
    expect(loadSettings()).toMatchObject({
      palette: 'arcade',
      boardTheme: 'blue',
      pieceSet: 'papercut',
    });
  });

  test('the old light toggle changes nothing', () => {
    localStorage.setItem('theme', 'light');
    expect(loadSettings().palette).toBe('pop');
  });
});
