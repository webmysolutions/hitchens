/* Service worker: cache-first for static shell and games (weak networks),
   network-only for API. Bump VERSION to invalidate. */
var VERSION = 'mg-v2';
var CORE = [
  './', 'index.html', 'styles.css', 'app.js', 'mg.js',
  'i18n/ru.json', 'i18n/en.json', 'games/catalog.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== VERSION) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.indexOf('/api/') >= 0) return; // network only
  if (url.origin !== location.origin) return;     // let CDN/ads pass through

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});
