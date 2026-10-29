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

test('extra names are kept as a trimmed list and default to none', () => {
  expect(parseSettings(null).extraNames).toEqual([]);
  expect(
    parseSettings('{"extraNames":[" Paul ","paul",4,"Ann"]}').extraNames,
  ).toEqual(['Paul', 'Ann']);
  expect(parseSettings('{"extraNames":"Paul"}').extraNames).toEqual([]);
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

test('board size is validated alone and defaults to none', () => {
  expect(parseSettings(null).boardSize).toBeNull();
  expect(parseSettings('{"boardSize":640}').boardSize).toBe(640);
  expect(parseSettings('{"boardSize":"640"}').boardSize).toBeNull();
  expect(parseSettings('{"boardSize":50000}').boardSize).toBeNull();
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
    document.cookie = `settings=${encodeURIComponent('{"palette":"mint"}')}; Path=/`;
    expect(loadSettings().palette).toBe('mint');
  });

  test('a light OS, or none, starts on Pop Quiz', () => {
    expect(loadSettings().palette).toBe('pop');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(loadSettings().palette).toBe('pop');
  });

  test('the old dark toggle becomes Arcade Night until a palette is saved', () => {
    localStorage.setItem('theme', 'dark');
    expect(loadSettings().palette).toBe('arcade');
    localStorage.setItem('settings', '{"palette":"mint"}');
    expect(loadSettings().palette).toBe('mint');
  });

  test('a settings cookie wins over local storage', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        palette: 'mint',
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

test('the batch losses-only choice is off by default and a non-boolean falls back to it', () => {
  expect(parseSettings(null).batchLossesOnly).toBe(false);
  expect(parseSettings('{"batchLossesOnly":true}').batchLossesOnly).toBe(true);
  expect(parseSettings('{"batchLossesOnly":1}').batchLossesOnly).toBe(false);
});
