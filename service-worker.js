// wind. service worker — offline app shell + smart caching for runtime resources
// Strategy:
//   - HTML (index.html) → network-first (so updates reach users on next visit)
//   - Other shell assets (manifest, icons) → cache-first
//   - Map tiles (CARTO Voyager) → stale-while-revalidate, capped LRU cache
//   - Forecast API (Open-Meteo) → network-first, fallback to cache when offline
//   - Third-party libs (Leaflet, Chart.js, Google Fonts) → cache-first
const CACHE_VERSION = 'v30-2';
const SHELL_CACHE = `wind-shell-${CACHE_VERSION}`;
const TILES_CACHE = `wind-tiles-${CACHE_VERSION}`;
const API_CACHE   = `wind-api-${CACHE_VERSION}`;
const VENDOR_CACHE = `wind-vendor-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, TILES_CACHE, API_CACHE, VENDOR_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Limit cache entries (simple LRU by deletion of first entries)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    for (let i = 0; i < keys.length - maxItems; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// Detect "navigation" requests (loading the HTML page itself)
function isNavigationRequest(req) {
  return req.mode === 'navigate' ||
         (req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // === HTML page navigation — NETWORK-FIRST so updates are picked up immediately ===
  if (url.origin === self.location.origin && isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // === Map tiles (CARTO) — stale-while-revalidate ===
  if (/basemaps\.cartocdn\.com/.test(url.host)) {
    event.respondWith(
      caches.open(TILES_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone());
              trimCache(TILES_CACHE, 200);
            }
            return res;
          })
          .catch(() => null);
        return cached || network;
      })
    );
    return;
  }

  // === Open-Meteo forecast API — network-first, cache fallback ===
  if (/api\.open-meteo\.com/.test(url.host)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(req, clone);
              trimCache(API_CACHE, 30);
            });
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // === Vendor libraries (Leaflet, Chart.js, Google Fonts) — cache-first ===
  if (/cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.host)) {
    event.respondWith(
      caches.open(VENDOR_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        } catch {
          return cached;
        }
      })
    );
    return;
  }

  // === Other same-origin assets (icons, manifest) — cache-first ===
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }
});
