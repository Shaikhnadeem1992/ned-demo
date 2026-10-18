// Offline cache so NED opens from the home screen without a connection.
// Bump VERSION whenever app files change so phones pick up the update.
const VERSION = 'ned-v1';
const FILES = ['./', './index.html', './style.css', './manifest.webmanifest',
  './js/app.js', './js/audio.js', './js/brain.js', './js/compact.js', './js/quality.js',
  './js/renderer.js', './js/speech.js', './js/state.js',
  './vendor/three.module.js', './vendor/three.core.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match('./index.html'))));
});
