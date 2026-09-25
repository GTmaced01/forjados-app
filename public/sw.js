const SW_VERSION = 'forjados-pwa-v13-maintenance-cleanup';
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;
const APP_SHELL_CACHE = `${SW_VERSION}-shell`;

const APP_SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.png',
  '/logo-forjados.png',
  '/og-forjados-principal-20260831.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
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

async function fetchWithTimeout(request, timeoutMs = 3500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetchWithTimeout(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request) || await caches.match('/');
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
    .catch(() => cached || new Response('', { status: 503, statusText: 'Offline' }));

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


self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      title: 'FORJADOS',
      message: event.data ? event.data.text() : 'Nova notificação do FORJADOS.',
    };
  }

  const title = payload.title || 'FORJADOS';
  const options = {
    body: payload.message || payload.body || 'Você recebeu uma nova notificação.',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    image: payload.image,
    tag: payload.tag || payload.notification_id || 'forjados-notification',
    renotify: true,
    vibrate: [120, 60, 120],
    data: {
      url: payload.url || '/?tab=notifications',
      notificationId: payload.notification_id || null,
      type: payload.type || 'notification',
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir FORJADOS',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || '/?tab=notifications',
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
