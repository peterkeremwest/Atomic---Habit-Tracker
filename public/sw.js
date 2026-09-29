// Atomic service worker ("the receptionist's shelf of photocopies").
// App code is fetched NETWORK-FIRST so a new deploy shows on the first reload (Forge lesson);
// the shelf copy is only used when offline. Fonts and icons are cache-first (they never change per version).
const CACHE = 'atomic-v0.1.5';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/theme.css',
  './js/app.js', './js/state.js', './js/db.js', './js/model.js', './js/ui.js', './js/version.js',
  './js/views/today.js', './js/views/calendar.js', './js/views/review.js', './js/views/habits.js', './js/views/elements.js', './js/views/system.js', './js/views/sheets.js',
  './vendor/fonts/vt323.woff2', './vendor/fonts/courier-prime-400.woff2', './vendor/fonts/courier-prime-700.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-64.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // never touch cross-origin / API calls
  const staticAsset = url.pathname.includes('/vendor/') || url.pathname.includes('/icons/');
  if (staticAsset) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
