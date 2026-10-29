// The palettes of the design system. The colours themselves live in
// styles/global.css (one [data-theme] block each); this table is what the UI
// needs to list them: the id that goes on <html>, a name, and the two colours
// of the switcher disc. The discs are fixed swatches, not tokens, so every
// disc shows its own palette whichever one is active.

export const PALETTES = [
  { id: 'pop', name: 'Pop Quiz', a: '#ffd23f', b: '#ff5fa2' },
  { id: 'newsprint', name: 'Newsprint', a: '#efece4', b: '#ff3b1f' },
  { id: 'arcade', name: 'Arcade Night', a: '#16131f', b: '#c6ff3d' },
  { id: 'ivory', name: 'Ivory Ink', a: '#f1e3bd', b: '#141414' },
  { id: 'chalkboard', name: 'Chalkboard', a: '#1c2724', b: '#f2d35c' },
  { id: 'graphite', name: 'Graphite', a: '#151517', b: '#efe3c8' },
] as const;

export type PaletteId = (typeof PALETTES)[number]['id'];

export const DEFAULT_PALETTE: PaletteId = 'pop';

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}
