const SW_VERSION = 'forjados-pwa-v5-mobile-app';
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;
const APP_SHELL_CACHE = `${SW_VERSION}-shell`;

const APP_SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/favicon.ico',
  '/logo-forjados.png',
  '/og-image.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isSupabaseRequest(url) {
  return url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in');
}

function shouldIgnore(event, url) {
  if (event.request.method !== 'GET') return true;
  if (!url.protocol.startsWith('http')) return true;
  if (isSupabaseRequest(url)) return true;
  return false;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return caches.match('/offline.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return caches.match('/offline.html');
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (shouldIgnore(event, url)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (url.origin === self.location.origin) {
    if (event.request.destination === 'image') {
      event.respondWith(cacheFirst(event.request));
      return;
    }

    event.respondWith(staleWhileRevalidate(event.request));
  }
});
