// The palettes of the design system. The colours themselves live in
// styles/global.css (one [data-theme] block each); this table is what the UI
// needs to list them: the id that goes on <html>, a name, and the two colours
// of the switcher disc. The discs are fixed swatches, not tokens, so every
// disc shows its own palette whichever one is active.

export const PALETTES = [
  { id: 'pop', name: 'Pop Quiz', a: '#ffd23f', b: '#ff5fa2' },
  { id: 'mint', name: 'Mint Gambit', a: '#dcf5e7', b: '#ff8a5b' },
  { id: 'blueprint', name: 'Blueprint', a: '#4d7cff', b: '#ffc93c' },
  { id: 'retro', name: 'Retro Sunset', a: '#e8692f', b: '#3fa796' },
  { id: 'bubblegum', name: 'Bubblegum', a: '#ff8ac4', b: '#8ff0c8' },
  { id: 'citrus', name: 'Citrus Blitz', a: '#f2ff66', b: '#ff6b2c' },
  { id: 'newsprint', name: 'Newsprint', a: '#efece4', b: '#ff3b1f' },
  { id: 'arcade', name: 'Arcade Night', a: '#16131f', b: '#c6ff3d' },
  { id: 'lantern', name: 'Lantern', a: '#1c1410', b: '#ffc14d' },
  { id: 'tidepool', name: 'Tidepool', a: '#0b1c22', b: '#5eecff' },
  { id: 'carbon', name: 'Carbon', a: '#141618', b: '#ff8a5b' },
] as const;

export type PaletteId = (typeof PALETTES)[number]['id'];

export const DEFAULT_PALETTE: PaletteId = 'pop';

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}
