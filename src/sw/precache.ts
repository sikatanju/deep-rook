import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

/** A file in the build output; `path` is relative to it, '/'-separated. */
export interface BuiltFile {
  path: string;
  bytes: Uint8Array;
}

export interface Precache {
  version: string;
  urls: string[];
  bytes: number;
}

// The worker itself, Cloudflare's config files (never served) and dotfiles.
const SKIP = /^(sw\.js|_headers|_redirects)$|(^|\/)\./;

export function buildPrecache(files: BuiltFile[], template: string): Precache {
  const kept = files
    .filter((file) => !SKIP.test(file.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  // The template is hashed too, so a change to the worker's logic alone still
  // gets a fresh cache.
  const hash = createHash('sha256').update(template);
  for (const { path, bytes } of kept) {
    hash.update(`\0${path}\0${bytes.length}\0`).update(bytes);
  }
  return {
    version: hash.digest('hex').slice(0, 16),
    urls: kept.map(
      ({ path }) => `/${path.replace(/(^|\/)index\.html$/, '$1')}`,
    ),
    bytes: kept.reduce((sum, file) => sum + file.bytes.length, 0),
  };
}

export function renderServiceWorker(template: string, precache: Precache) {
  const values = {
    __VERSION__: JSON.stringify(precache.version),
    __PRECACHE__: JSON.stringify(precache.urls),
  };
  let source = template;
  for (const [placeholder, value] of Object.entries(values)) {
    if (!source.includes(placeholder)) {
      throw new Error(`sw.js template has no ${placeholder}`);
    }
    source = source.replaceAll(placeholder, value);
  }
  return source;
}

// The preview server and the dev server share a port, so a worker installed by
// `astro preview` would keep serving the built shell over `astro dev`. Dev
// answers /sw.js with this one, which unregisters itself and reloads its tabs.
const DEV_KILL_SWITCH = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((tabs) => tabs.forEach((tab) => tab.navigate(tab.url))),
  );
});
`;

export function serviceWorker(): AstroIntegration {
  const templateUrl = new URL('./sw.js', import.meta.url);
  return {
    name: 'deeprook:service-worker',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use('/sw.js', (_req, res) => {
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(DEV_KILL_SWITCH);
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const template = await readFile(templateUrl, 'utf8');
        const entries = await readdir(root, {
          recursive: true,
          withFileTypes: true,
        });
        const files = await Promise.all(
          entries
            .filter((entry) => entry.isFile())
            .map(async (entry) => {
              const absolute = join(entry.parentPath, entry.name);
              return {
                path: relative(root, absolute).split(sep).join('/'),
                bytes: await readFile(absolute),
              };
            }),
        );
        const precache = buildPrecache(files, template);
        await writeFile(
          join(root, 'sw.js'),
          renderServiceWorker(template, precache),
        );
        logger.info(
          `sw.js ${precache.version}: ${precache.urls.length} files, ${Math.round(precache.bytes / 1024)} KiB`,
        );
      },
    },
  };
}
