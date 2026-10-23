/* sw.js — offline support for Cigs.
   Bump CACHE_VERSION on every release: the new worker precaches the new
   files and deletes the old cache when it activates. */
const CACHE_VERSION = 'cigs-v3';
const SHELL = [
  './',
  './index.html',
  './app.css',
  './stats.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.location.href).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isShell = req.mode === 'navigate' || SHELL_URLS.has(url.origin + url.pathname);
  event.respondWith(isShell ? cacheFirst(req) : networkFirst(req));
});

// App shell: serve from the cache, go to the network only if it is missing.
function cacheFirst(req) {
  const key = req.mode === 'navigate' ? './index.html' : req;
  return caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetchAndCache(req));
}

// Everything else: try the network, fall back to whatever we have.
function networkFirst(req) {
  return fetchAndCache(req).catch(() => caches.match(req, { ignoreSearch: true }));
}

function fetchAndCache(req) {
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
    }
    return res;
  });
}
