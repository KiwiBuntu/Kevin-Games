// Offline support: serve from cache straight away, refresh the cache in the background.
// Bump VERSION whenever files are added so phones pick up the new list.
const VERSION = 'kg-v35';
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
  './shared/gate.js',
  './shared/guard.js',
  './grown-ups/index.html',
  './grown-ups/grownups.js',
  './games/trains/index.html',
  './games/trains/yard.js',
  './games/trains/trains.js',
  './games/memory/index.html',
  './games/memory/memory.js',
  './games/balloons/index.html',
  './games/balloons/balloons.js',
  './games/colours/index.html',
  './games/colours/puzzle.js',
  './games/colours/colours.js',
  './games/jigsaw/index.html',
  './games/jigsaw/scenes.js',
  './games/jigsaw/jigsaw.js',
  './games/piano/index.html',
  './games/piano/piano.js',
  './games/piano/sounds/cow.mp3',
  './games/piano/sounds/pig.mp3',
  './games/piano/sounds/sheep.mp3',
  './games/piano/sounds/dog.mp3',
  './games/piano/sounds/duck.mp3',
  './games/piano/sounds/cat.mp3',
  './games/piano/sounds/frog.mp3',
  './games/piano/sounds/mouse.mp3',
  './games/maze/index.html',
  './games/maze/maze.js',
  './games/shapes/index.html',
  './games/shapes/shapes.js',
  './games/dots/index.html',
  './games/dots/dots.js',
  './games/paint/index.html',
  './games/paint/pictures.js',
  './games/paint/paint.js',
  './games/garage/index.html',
  './games/garage/lot.js',
  './games/garage/lot-worker.js',
  './games/garage/garage.js',
  './games/read/index.html',
  './games/read/read.css',
  './games/read/story.js',
  './games/read/defaults.js',
  './games/read/readings.js',
  './games/read/read.js',
  './games/tower/index.html',
  './games/tower/tower.css',
  './games/tower/quiz.js',
  './games/tower/heroes.js',
  './games/tower/tower.js',
  './games/cubes/index.html',
  './games/cubes/levels.js',
  './games/cubes/cubes.js',
  './games/potions/index.html',
  './games/potions/puzzle.js',
  './games/potions/potions.js',
  './games/candy/index.html',
  './games/candy/board.js',
  './games/candy/levels.js',
  './games/candy/candy.js',
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
