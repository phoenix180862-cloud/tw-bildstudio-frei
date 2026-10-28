// TW Bildstudio (kostenlose Fassung) – Service Worker: Netz zuerst (immer neueste Fassung), Zwischenspeicher nur offline.
// Version wird beim Paketbau gesetzt; ändert sie sich, meldet die App „Neue Version – aktualisieren“.
const C = 'tw-bs-frei-20261028-104318';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== C).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/hilfe/videos/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)).catch(() => {}); } return r; }).catch(() => caches.match(e.request)));
});
