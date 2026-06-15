// HJ Capital PWA Service Worker v2
// IMPORTANT: JS/CSS use network-first to prevent stale React chunk errors
const CACHE_NAME = 'hj-capital-v2';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately on install (shell only, no JS bundles)
const PRECACHE_ASSETS = [
  '/offline.html',
  '/manifest.json',
];

// Install: precache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Silently fail if offline page not yet available
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — always go to network
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/manus-storage/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/__manus__/')
  ) {
    return;
  }

  // Never cache Vite dev server chunks (version hashes change on rebuild)
  // This prevents stale React copies from causing "multiple React" errors
  if (
    url.pathname.includes('node_modules') ||
    url.search.includes('v=') ||
    url.search.includes('t=')
  ) {
    return; // Let browser handle natively
  }

  // Navigation requests: network-first, fallback to offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || caches.match(OFFLINE_URL)
          )
        )
    );
    return;
  }

  // JS/CSS: NETWORK-FIRST — critical to always get fresh React/Vite bundles
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Images and fonts: cache-first (these don't change)
  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'HJ Capital', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'HJ Capital', {
      body: data.body || '',
      icon: '/manus-storage/hj-icon-192_df7d5e95.png',
      badge: '/manus-storage/hj-icon-72_0ab1a772.png',
      tag: data.tag || 'hj-capital',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: data.requireInteraction || false,
    })
  );
});

// Notification click: open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
