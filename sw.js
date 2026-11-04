// TW Bildstudio (kostenlose Fassung) – Service Worker: Netz zuerst (immer neueste Fassung), Zwischenspeicher nur offline.
// Cache-Stempel wird beim Paketbau gesetzt. Den Hinweis „Neue Version … – jetzt aktualisieren“ zeigt lib/tw-version.js (vergleicht <meta name="tw-version"> der index.html).
const C = 'tw-bs-frei-20261104-093451';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== C).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/hilfe/videos/')) return;
  if (u.searchParams.has('twv')) return; // Versionsprüfung (lib/tw-version.js) nie zwischenspeichern
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)).catch(() => {}); } return r; }).catch(() => caches.match(e.request)));
});
