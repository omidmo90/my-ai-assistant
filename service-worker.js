// Syca Service Worker v3.1 - Offline-First with Internal Scheduling
const SW_VERSION = 'syca-sw-v3.1';
const CACHE_NAME = 'syca-cache-v3.1';

const CACHE_FILES = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// ============ نصب ============
self.addEventListener('install', (event) => {
    console.log('[SW] Installing', SW_VERSION);
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CACHE_FILES).catch(err => {
                console.warn('[SW] Cache failed:', err);
            });
        })
    );
});

// ============ فعال‌سازی ============
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating', SW_VERSION);
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(keys => {
                return Promise.all(
                    keys.filter(k => k !== CACHE_NAME && k !== 'syca-schedule').map(k => caches.delete(k))
                );
            })
        ])
    );
});

// ============ Fetch (Cache First) ============
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;
    
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// ============ Schedule Storage ============
async function getScheduledNotifications() {
    try {
        const cache = await caches.open('syca-schedule');
        const response = await cache.match('schedule');
        if (response) return await response.json();
    } catch (e) {
        console.error('[SW] Get schedule error:', e);
    }
    return [];
}

async function setScheduledNotifications(list) {
    try {
        const cache = await caches.open('syca-schedule');
        await cache.put('schedule', new Response(JSON.stringify(list)));
    } catch (e) {
        console.error('[SW] Set schedule error:', e);
    }
}

// ============ نمایش نوتیف ============
async function showNotificationFromSW(payload) {
    const options = {
        body: payload.body || '',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: payload.tag || 'syca-' + Date.now(),
        requireInteraction: payload.requireInteraction !== false,
        dir: 'rtl',
        lang: 'fa',
        vibrate: payload.vibrate || [500, 200, 500, 200, 500, 200, 1000],
        renotify: true,
        silent: false,
        timestamp: Date.now(),
        data: {
            url: payload.url || './',
            type: payload.type || 'general',
            timestamp: Date.now()
        }
    };
    
    return self.registration.showNotification(payload.title || 'سیکا', options);
}

// ============ Heartbeat: چک کردن schedule ============
async function checkAndFireScheduled() {
    const list = await getScheduledNotifications();
    const now = Date.now();
    const stillPending = [];
    let firedCount = 0;
    
    for (const item of list) {
        if (item.triggerAt <= now) {
            await showNotificationFromSW(item.payload);
            console.log('[SW] Fired scheduled:', item.payload.title);
            firedCount++;
        } else {
            stillPending.push(item);
        }
    }
    
    await setScheduledNotifications(stillPending);
    return firedCount;
}

// ============ پیام‌ها ============
self.addEventListener('message', async (event) => {
    const { type, payload } = event.data || {};
    
    if (type === 'SHOW_NOTIFICATION') {
        await showNotificationFromSW(payload);
    }
    
    if (type === 'SCHEDULE_NOTIFICATION') {
        const list = await getScheduledNotifications();
        list.push({
            id: payload.id || ('sched-' + Date.now()),
            triggerAt: payload.triggerAt,
            payload: payload.notification
        });
        await setScheduledNotifications(list);
        console.log('[SW] Scheduled:', payload.notification.title, 'at', new Date(payload.triggerAt).toLocaleString());
    }
    
    if (type === 'CLEAR_SCHEDULE') {
        await setScheduledNotifications([]);
        console.log('[SW] Cleared all schedules');
    }
    
    if (type === 'CHECK_SCHEDULE') {
        const count = await checkAndFireScheduled();
        if (event.source) {
            event.source.postMessage({ type: 'SCHEDULE_CHECKED', firedCount: count });
        }
    }
    
    if (type === 'GET_MISSED') {
        const list = await getScheduledNotifications();
        const now = Date.now();
        const missed = list.filter(item => item.triggerAt <= now);
        if (event.source) {
            event.source.postMessage({ type: 'MISSED_NOTIFICATIONS', missed });
        }
        const future = list.filter(item => item.triggerAt > now);
        await setScheduledNotifications(future);
    }
});

// ============ Click روی نوتیف ============
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || './';
    const type = event.notification.data?.type || 'general';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.postMessage({
                        type: 'NOTIFICATION_CLICKED',
                        notifType: type,
                        timestamp: Date.now()
                    });
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// ============ Periodic Sync ============
self.addEventListener('periodicsync', async (event) => {
    if (event.tag === 'syca-check-schedule') {
        event.waitUntil(checkAndFireScheduled());
    }
});

// ============ Push (برای آینده) ============
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'سیکا', body: event.data ? event.data.text() : '' };
    }
    event.waitUntil(showNotificationFromSW(data));
});

console.log('[SW] Loaded', SW_VERSION);
