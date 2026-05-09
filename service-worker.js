// wind. service worker — offline app shell + smart caching for runtime resources
// Strategy:
//   - App shell (HTML, manifest, icons) → cache-first, updated on activate
//   - Map tiles (CARTO Voyager) → stale-while-revalidate, capped LRU cache
//   - Forecast API (Open-Meteo) → network-first, fallback to cache when offline
//   - Third-party libs (Leaflet, Chart.js, Google Fonts) → cache-first
const CACHE_VERSION = 'v30-1';
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

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
          return cached;  // may be undefined if never cached
        }
      })
    );
    return;
  }

  // === Same-origin (app shell) — cache-first with network fallback ===
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).catch(() => caches.match('./index.html')))
    );
    return;
  }
});
