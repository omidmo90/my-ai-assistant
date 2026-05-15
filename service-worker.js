// Syca Service Worker v1
const CACHE_NAME = 'syca-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// نصب
self.addEventListener('install', (event) => {
  console.log('[SW] Installing');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => console.error('[SW] Cache failed:', err));
    })
  );
  self.skipWaiting();
});

// فعال‌سازی
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating');
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// fetch: network-first
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone).catch(() => {});
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// پیام از صفحه‌ی اصلی
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: payload.tag || 'syca-notif',
      requireInteraction: true,
      dir: 'rtl',
      lang: 'fa',
      vibrate: [200, 100, 200],
      data: { url: payload.url || './' }
    });
  }
});

// کلیک روی نوتیفیکیشن
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
