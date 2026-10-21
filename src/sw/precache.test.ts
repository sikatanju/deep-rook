import { describe, expect, it } from 'vitest';

import { buildPrecache, renderServiceWorker } from './precache';

const bytes = (text: string) => new TextEncoder().encode(text);

const output = () => [
  { path: 'index.html', bytes: bytes('<html>') },
  { path: '_astro/App.abc123.js', bytes: bytes('app') },
  { path: '_astro/engine.worker-xyz.js', bytes: bytes('engine') },
  { path: 'pieces/wR.svg', bytes: bytes('<svg>') },
  { path: 'manifest.webmanifest', bytes: bytes('{}') },
  { path: 'sw.js', bytes: bytes('old worker') },
  { path: '_headers', bytes: bytes('/sw.js') },
  { path: '.assetsignore', bytes: bytes('') },
];

describe('buildPrecache', () => {
  it('lists every served file as a root-relative URL, the page as "/"', () => {
    expect(buildPrecache(output(), 'template').urls.sort()).toEqual([
      '/',
      '/_astro/App.abc123.js',
      '/_astro/engine.worker-xyz.js',
      '/manifest.webmanifest',
      '/pieces/wR.svg',
    ]);
  });

  it('gives the same version for the same bytes in any order', () => {
    const a = buildPrecache(output(), 'template');
    const b = buildPrecache(output().reverse(), 'template');
    expect(b.version).toBe(a.version);
    expect(b.urls).toEqual(a.urls);
  });

  it('changes the version when one file changes', () => {
    const files = output();
    const before = buildPrecache(files, 'template').version;
    files[1] = { path: '_astro/App.abc123.js', bytes: bytes('app!') };
    expect(buildPrecache(files, 'template').version).not.toBe(before);
  });

  it('changes the version when only the worker template changes', () => {
    expect(buildPrecache(output(), 'template v2').version).not.toBe(
      buildPrecache(output(), 'template').version,
    );
  });

  it('ignores the previous sw.js and config files', () => {
    const files = output();
    const before = buildPrecache(files, 'template').version;
    files[5] = { path: 'sw.js', bytes: bytes('a different old worker') };
    files[6] = { path: '_headers', bytes: bytes('/x') };
    expect(buildPrecache(files, 'template').version).toBe(before);
  });
});

describe('renderServiceWorker', () => {
  it('refuses a template without its placeholders', () => {
    expect(() =>
      renderServiceWorker('const CACHE = 1;', {
        version: 'v',
        urls: ['/'],
        bytes: 0,
      }),
    ).toThrow();
  });
});
