/* Service Worker: macht die Vereinskasse offline nutzbar.
 * Strategie: erst Netz (max. 3 s, damit Updates ankommen), sonst Cache.
 * Bei neuen Dateien CACHE-Version erhöhen. */
const CACHE = 'vereinskasse-v1';
const DATEIEN = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const netz = await Promise.race([
        fetch(req),
        new Promise((_, nein) => setTimeout(() => nein(new Error('Zeitüberschreitung')), 3000)),
      ]);
      if (netz.ok) cache.put(req, netz.clone());
      return netz;
    } catch {
      const treffer = await cache.match(req, { ignoreSearch: true });
      if (treffer) return treffer;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    }
  })());
});
