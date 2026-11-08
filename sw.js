/* Keeps the app working offline (handy in the supermarket). Always tries for the latest version first. */
const CACHE = 'team-dexter-hq-v4';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/hub.css', 'css/mod-cleaning.css', 'css/mod-budget.css', 'css/mod-wishlist.css', 'css/mod-calendar.css', 'js/store.js', 'js/hub.js', 'js/mod-cleaning.js', 'js/mod-budget.js', 'js/mod-wishlist.js', 'js/mod-calendar.js', 'js/shim.js', 'js/audio.js', 'js/app.js', 'js/draw.js', 'js/draw2.js', 'js/persist.js',
  'data/prices.json', 'data/recipes.json', 'data/plan.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
