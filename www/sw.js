// Offline support: serve from cache straight away, refresh the cache in the background.
// Bump VERSION whenever files are added so phones pick up the new list.
const VERSION = 'kg-v3';
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './shared/style.css',
  './shared/sound.js',
  './shared/celebrate.js',
  './shared/win.js',
  './games/trains/index.html',
  './games/trains/yard.js',
  './games/trains/trains.js',
  './games/memory/index.html',
  './games/memory/memory.js',
  './games/balloons/index.html',
  './games/balloons/balloons.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request)
        .then(res => {
          if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
