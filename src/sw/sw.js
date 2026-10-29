// Template for dist/sw.js. The build (precache.ts) fills in the version, a
// hash of the output, and the list of every emitted file.
//
// Updates are safe without skipWaiting or clients.claim. A version installs
// into its own cache, and addAll is all or nothing, so a failed fetch fails the
// install and the old worker keeps serving its complete cache; the browser
// retries on a later visit. A new version only activates once no tab uses the
// old one, so an open page never loses the hashed chunks its HTML points to,
// and only then are older caches deleted. Only same-origin GETs for listed
// files are answered, so the chess.com and Lichess APIs, posts and Range
// requests go straight to the network.
const CACHE = `deeprook-${__VERSION__}`;
const PRECACHE = new Set(__PRECACHE__);

self.addEventListener('install', (event) => {
  // reload: an HTTP-cached index.html from an older deploy would point at chunks
  // this version does not list.
  const requests = [...PRECACHE].map(
    (path) => new Request(new URL(path, self.location), { cache: 'reload' }),
  );
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('deeprook-') && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !PRECACHE.has(url.pathname))
    return;
  // Keyed by path alone: the app routes on the hash, so "/?anything" is still
  // the one shell.
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(url.pathname, { ignoreVary: true }))
      .then((hit) => hit ?? fetch(request)),
  );
});

// A click on a "reviews are ready" notification brings the app forward and has
// the page go to the screen the notification names. The page owns routing, so
// the worker only passes the hash along.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = event.notification.data?.hash ?? '#/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const open = windows[0];
        if (!open)
          return self.clients.openWindow(self.registration.scope + hash);
        open.postMessage({ type: 'open', hash });
        return open.focus();
      }),
  );
});
