/**
 * Service worker for the Quran Reader PWA.
 *
 * Strategy:
 *  - Navigation requests (HTML): network-first, fallback to cache. Keeps
 *    the site fresh but lets users read offline if they've visited a page.
 *  - Hashed build assets (/_astro/*) and icons: cache-first. They're
 *    immutable (content-hashed filenames), so cache forever.
 *  - Audio (cdn.islamic.network): network-only. Too large to cache
 *    eagerly and we don't want to drain user storage.
 *  - Everything else same-origin: stale-while-revalidate.
 *
 * Cache versioning: bump CACHE_VERSION to force all clients to refresh.
 */

const CACHE_VERSION = 'qr-v1';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PRECACHE = `${CACHE_VERSION}-precache`;

// Core shell — cached on install so the app shell loads offline.
const PRECACHE_URLS = [
  '/',
  '/mushaf/',
  '/juz/',
  '/awqat/',
  '/bookmarks/',
  '/search/',
  '/about/',
  '/privacy/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== RUNTIME_CACHE && k !== PRECACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Audio CDN — don't interfere
  if (url.hostname === 'cdn.islamic.network') return;

  // External fonts — default browser cache
  if (url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) return;

  // Only same-origin gets cached
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match('/');
          if (shell) return shell;
          return new Response('غير متصل — لا توجد نسخة محفوظة', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  // Immutable hashed assets: cache-first
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Static assets by extension: cache-first
  if (/\.(png|svg|ico|webp|woff2?|ttf|json|webmanifest|txt)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Everything else same-origin: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    return new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

// Listen for skipWaiting message (e.g. "update available" banner)
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
