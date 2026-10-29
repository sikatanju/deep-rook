import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync('src/styles/global.css', 'utf8');

/** Custom property names declared by each palette block, keyed by palette id. */
function palettes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const block = /(:root|\[data-theme='([a-z]+)'\])\s*\{([^}]*)\}/g;
  for (const [, selector, id, body] of css.matchAll(block)) {
    const names = [...body!.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]!);
    // The first :root block is the palette; the later one holds derived values.
    const key = selector === ':root' ? 'pop' : id!;
    if (!out.has(key)) out.set(key, names);
  }
  return out;
}

test('every palette declares the same variables', () => {
  const all = palettes();
  expect([...all.keys()]).toEqual([
    'pop',
    'newsprint',
    'arcade',
    'ivory',
    'chalkboard',
    'graphite',
  ]);
  const pop = all.get('pop')!;
  expect(pop.length).toBeGreaterThan(30);
  for (const [id, names] of all) expect(names, id).toEqual(pop);
});

test('every palette variable is exposed to Tailwind as a colour', () => {
  const pop = palettes().get('pop')!;
  const colours = pop.filter((n) => n !== '--shadow-ink');
  for (const name of colours)
    expect(css).toContain(`--color-${name.slice(2)}: var(${name});`);
});
