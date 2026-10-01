// Service Worker: cached ausschliesslich die App-Hülle (gleiche Herkunft).
// Keine Daten, keine Supabase-/API-Antworten (Cross-Origin wird nie angefasst).
// Gecacht werden nur erfolgreiche Antworten (Status 200, gleiche Herkunft): eine 404/5xx-Seite überschreibt nie die Hülle.
// VERSION bei jeder Änderung der Hülle erhöhen: beim Aktivieren werden alle älteren Caches gelöscht.
const VERSION = 'tankbuch-huelle-v2';
const HUELLE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

function cachebar(res) {
  return res && res.status === 200 && res.type === 'basic';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(HUELLE.map((u) => fetch(u, { cache: 'reload' })
        .then((res) => (cachebar(res) ? c.put(u, res) : undefined))
        .catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase & Co. nie cachen

  // Seitenaufrufe: Netz zuerst, bei Offline die gecachte Hülle
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (cachebar(res)) {
          const kopie = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', kopie));
        }
        return res;
      }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Gehashte Build-Dateien (/assets/…): Cache zuerst (Inhalt ändert sich nie unter gleichem Namen)
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then((treffer) => treffer || fetch(req).then((res) => {
        if (cachebar(res)) {
          const kopie = res.clone();
          caches.open(VERSION).then((c) => c.put(req, kopie));
        }
        return res;
      })),
    );
    return;
  }

  // Alles andere (Manifest, Icons, nicht gehasht): Netz zuerst, damit Änderungen ankommen; offline aus dem Cache
  event.respondWith(
    fetch(req).then((res) => {
      if (cachebar(res)) {
        const kopie = res.clone();
        caches.open(VERSION).then((c) => c.put(req, kopie));
      }
      return res;
    }).catch(() => caches.match(req)),
  );
});
