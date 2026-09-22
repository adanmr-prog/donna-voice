/* Donna OS — service worker: HTML network-first (cache als fallback), statische shell cache-first, API altijd via netwerk */
var CACHE = 'donna-os-v4.5';  // bump bij elke release (zie /release)
var SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
var NET_TIMEOUT_MS = 3000;  // v4.4: bij trage verbinding na 3 s de gecachte shell tonen; het netwerk werkt op de achtergrond door

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // v4.5: alleen oude Donna-caches opruimen. De Athena-app (athena/) deelt dezelfde origin en dus dezelfde CacheStorage.
    return Promise.all(keys.filter(function (k) { return k.indexOf('donna-os-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isHtml(req, url) {
  return req.mode === 'navigate' || url.pathname.slice(-1) === '/' || url.pathname.slice(-11) === '/index.html';
}

function uitCache(req) {
  return caches.match(req).then(function (hit) { return hit || caches.match('./index.html'); });
}

// Een response die via een redirect binnenkwam mag niet aan een navigatie worden geserveerd (Safari en Chrome weigeren die)
// en hoort ook niet zo in de cache. Herverpakken maakt er een gewone response van.
function zonderRedirect(resp) {
  if (!resp.redirected) return Promise.resolve(resp);
  return resp.blob().then(function (b) { return new Response(b, { status: resp.status, statusText: resp.statusText, headers: resp.headers }); });
}

// v4.4: network-first voor HTML. Voorheen cache-first met een vaste cache-naam, waardoor een geïnstalleerde PWA
// nooit een nieuwe index.html kreeg zolang sw.js zelf niet wijzigde (v3.7 en v4.2 bereikten gebruikers niet).
function netwerkEerst(e) {
  var req = e.request;
  var vanNet = fetch(req.url, { cache: 'no-cache' }).then(function (resp) {
    if (!(resp && resp.ok)) return uitCache(req).then(function (hit) { return hit || resp; });  // serverfout: liever de oude shell dan een foutpagina
    return zonderRedirect(resp).then(function (schoon) {
      var kopie = schoon.clone();
      e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(req, kopie); }));  // waitUntil: iOS mag de SW anders stoppen vóór de put klaar is
      return schoon;
    });
  });
  vanNet.catch(function () {});  // als de timeout al gewonnen heeft en het netwerk daarna faalt, is dat geen onafgehandelde fout
  var naTimeout = new Promise(function (klaar) { setTimeout(klaar, NET_TIMEOUT_MS); })
    .then(function () { return uitCache(req); })
    .then(function (hit) { return hit || vanNet; });  // niets in cache: dan toch op het netwerk wachten
  return Promise.race([vanNet, naTimeout]).catch(function () { return uitCache(req); });  // offline: gecachte shell
}

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;  // API (POST, ander domein) nooit cachen
  if (isHtml(e.request, url)) { e.respondWith(netwerkEerst(e)); return; }
  e.respondWith(  // statische assets: cache-first
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (resp) {
        var kopie = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, kopie); });
        return resp;
      });
    })
  );
});
