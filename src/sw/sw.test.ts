import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import { renderServiceWorker } from './precache';
import template from './sw.js?raw';

const ORIGIN = 'https://deeprook.test';
const URLS = ['/', '/_astro/App.abc.js', '/_astro/engine.worker-x.js'];

/** The network as the worker sees it: per-path failures, or fully offline. */
function network() {
  const state = { offline: false, missing: new Set<string>() };
  const fetch = vi.fn(async (input: Request | { url: string }) => {
    const { pathname } = new URL(input.url);
    if (state.offline) throw new TypeError('Failed to fetch');
    if (state.missing.has(pathname)) return new Response('', { status: 404 });
    return new Response(`network ${pathname}`);
  });
  return { state, fetch };
}

/** CacheStorage with the spec's all-or-nothing addAll. */
function cacheStorage(fetch: (request: Request) => Promise<Response>) {
  const caches = new Map<string, Map<string, Response>>();
  const cache = (entries: Map<string, Response>) => ({
    async addAll(requests: Request[]) {
      const responses = await Promise.all(requests.map((r) => fetch(r)));
      if (responses.some((r) => !r.ok)) throw new TypeError('bad status');
      requests.forEach((r, i) => entries.set(r.url, responses[i]!));
    },
    async match(path: string) {
      return entries.get(new URL(path, ORIGIN).href)?.clone();
    },
  });
  return {
    caches,
    api: {
      async open(name: string) {
        if (!caches.has(name)) caches.set(name, new Map());
        return cache(caches.get(name)!);
      },
      async keys() {
        return [...caches.keys()];
      },
      async delete(name: string) {
        return caches.delete(name);
      },
    },
  };
}

function startWorker(
  version: string,
  net: ReturnType<typeof network>,
  storage: ReturnType<typeof cacheStorage>,
) {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.set(type, fn),
  };
  runInNewContext(
    renderServiceWorker(template, { version, urls: URLS, bytes: 0 }),
    { self, caches: storage.api, fetch: net.fetch, URL, Request },
  );

  const lifecycle = async (type: 'install' | 'activate') => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)!({
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    await Promise.all(pending);
  };
  const request = (request: unknown) => {
    const respondWith = vi.fn();
    listeners.get('fetch')!({ request, respondWith });
    const response = respondWith.mock.calls[0]?.[0] as
      Promise<Response> | undefined;
    return { intercepted: respondWith.mock.calls.length > 0, response };
  };
  return {
    install: () => lifecycle('install'),
    activate: () => lifecycle('activate'),
    request,
  };
}

const get = (path: string, init?: RequestInit) =>
  new Request(new URL(path, ORIGIN), init);
// Request refuses mode: 'navigate', so a navigation is a plain look-alike.
const navigate = (path: string) => ({
  url: new URL(path, ORIGIN).href,
  method: 'GET',
  mode: 'navigate',
  headers: new Headers({ accept: 'text/html' }),
});

async function installed(version = 'v1') {
  const net = network();
  const storage = cacheStorage(net.fetch);
  const worker = startWorker(version, net, storage);
  await worker.install();
  await worker.activate();
  return { net, storage, worker };
}

describe('install', () => {
  it('stores every listed file in the version cache', async () => {
    const { storage } = await installed('v1');
    expect([...storage.caches.keys()]).toEqual(['deeprook-v1']);
    expect([...storage.caches.get('deeprook-v1')!.keys()].sort()).toEqual(
      URLS.map((path) => `${ORIGIN}${path}`).sort(),
    );
  });

  it('fails when one file fails, leaving nothing cached', async () => {
    const net = network();
    net.state.missing.add('/_astro/engine.worker-x.js');
    const storage = cacheStorage(net.fetch);
    await expect(startWorker('v1', net, storage).install()).rejects.toThrow();
    expect(storage.caches.get('deeprook-v1')?.size ?? 0).toBe(0);
  });

  it('keeps the current version serving when an update fails to install', async () => {
    const { net, storage, worker } = await installed('v1');
    net.state.missing.add('/_astro/App.abc.js');
    await expect(startWorker('v2', net, storage).install()).rejects.toThrow();

    net.state.offline = true;
    const shell = worker.request(navigate('/'));
    expect(await (await shell.response!).text()).toBe('network /');
  });
});

describe('fetch', () => {
  it('serves the shell for a navigation with a query while offline', async () => {
    const { net, worker } = await installed();
    net.state.offline = true;
    const { intercepted, response } = worker.request(navigate('/?utm=home'));
    expect(intercepted).toBe(true);
    expect(await (await response!).text()).toBe('network /');
  });

  it('serves the engine worker bundle from the cache while offline', async () => {
    const { net, worker } = await installed();
    net.state.offline = true;
    const { response } = worker.request(get('/_astro/engine.worker-x.js'));
    expect(await (await response!).text()).toBe(
      'network /_astro/engine.worker-x.js',
    );
  });

  it('leaves game APIs, posts, Range and unlisted paths to the network', async () => {
    const { worker } = await installed();
    const passThrough = [
      get('https://lichess.org/api/games/user/someone'),
      get('https://api.chess.com/pub/player/someone/games/2026/10'),
      get('https://elsewhere.test/_astro/App.abc.js'),
      get('/', { method: 'POST', body: 'x' }),
      get('/_astro/App.abc.js', { headers: { range: 'bytes=0-9' } }),
      get('/not-built.js'),
    ];
    for (const request of passThrough) {
      expect(worker.request(request).intercepted, request.url).toBe(false);
    }
    expect(worker.request(get('/_astro/App.abc.js')).intercepted).toBe(true);
  });
});

describe('activate', () => {
  it('deletes older DeepRook caches and keeps the current and foreign ones', async () => {
    const net = network();
    const storage = cacheStorage(net.fetch);
    storage.caches.set('deeprook-old', new Map());
    storage.caches.set('someone-else', new Map());
    const worker = startWorker('v2', net, storage);
    await worker.install();
    await worker.activate();
    expect([...storage.caches.keys()].sort()).toEqual([
      'deeprook-v2',
      'someone-else',
    ]);
  });
});
