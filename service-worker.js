// Syca Service Worker v3 - Offline-First Notifications
const SW_VERSION = 'syca-sw-v3';
const CACHE_NAME = 'syca-cache-v3';

// فایل‌هایی که cache می‌شن
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
            // پاک کردن cache های قدیمی
            caches.keys().then(keys => {
                return Promise.all(
                    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
                );
            })
        ])
    );
});

// ============ Fetch (Cache First) ============
self.addEventListener('fetch', (event) => {
    // فقط GET request های همین origin رو cache می‌کنیم
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;
    
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
                // اگه offline ـیم و فایل cache نشده، حداقل index.html رو برگردون
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// ============ Notification System ============

// ذخیره‌ی نوتیف‌های زمان‌بندی شده
async function getScheduledNotifications() {
    try {
        const cache = await caches.open('syca-schedule');
        const response = await cache.match('schedule');
        if (response) {
            return await response.json();
        }
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

// نمایش نوتیف
async function showNotificationFromSW(payload) {
    const options = {
        body: payload.body || '',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: payload.tag || 'syca-' + Date.now(),
        requireInteraction: payload.requireInteraction !== false,
        dir: 'rtl',
        lang: 'fa',
        data: {
            url: payload.url || './',
            type: payload.type || 'general',
            timestamp: Date.now()
        },
        actions: payload.actions || []
    };
    
    if (payload.silent) options.silent = true;
    if (payload.vibrate) options.vibrate = payload.vibrate;
    
    return self.registration.showNotification(payload.title || 'سیکا', options);
}

// ============ پیام‌های از اپ به SW ============
self.addEventListener('message', async (event) => {
    const { type, payload } = event.data || {};
    
    if (type === 'SHOW_NOTIFICATION') {
        await showNotificationFromSW(payload);
    }
    
    if (type === 'SCHEDULE_NOTIFICATION') {
        // ذخیره برای نمایش در آینده
        const list = await getScheduledNotifications();
        list.push({
            id: payload.id || ('sched-' + Date.now()),
            triggerAt: payload.triggerAt,
            payload: payload.notification
        });
        await setScheduledNotifications(list);
        console.log('[SW] Scheduled notification:', payload.notification.title);
    }
    
    if (type === 'CLEAR_SCHEDULE') {
        await setScheduledNotifications([]);
        console.log('[SW] Cleared all schedules');
    }
    
    if (type === 'CHECK_SCHEDULE') {
        await checkAndFireScheduled();
    }
    
    if (type === 'PING') {
        // برای تست
        if (event.source) {
            event.source.postMessage({ type: 'PONG', timestamp: Date.now() });
        }
    }
});

// چک کردن و آتش زدن نوتیف‌های زمان‌بندی شده
async function checkAndFireScheduled() {
    const list = await getScheduledNotifications();
    const now = Date.now();
    const stillPending = [];
    
    for (const item of list) {
        if (item.triggerAt <= now) {
            // وقتشه! نوتیف رو نشون بده
            await showNotificationFromSW(item.payload);
            console.log('[SW] Fired scheduled:', item.payload.title);
        } else {
            stillPending.push(item);
        }
    }
    
    await setScheduledNotifications(stillPending);
}

// ============ Click روی نوتیف ============
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || './';
    const type = event.notification.data?.type || 'general';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // اگه اپ از قبل باز ـه، focus کن
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    // پیام به اپ بفرست که نوتیف کلیک شده
                    client.postMessage({
                        type: 'NOTIFICATION_CLICKED',
                        notifType: type,
                        timestamp: Date.now()
                    });
                    return client.focus();
                }
            }
            // وگرنه باز کن
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// ============ Periodic Background Sync (تجربی) ============
self.addEventListener('periodicsync', async (event) => {
    if (event.tag === 'syca-check-schedule') {
        event.waitUntil(checkAndFireScheduled());
    }
});

// ============ Push (اختیاری - برای آینده) ============
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'سیکا', body: event.data ? event.data.text() : 'یه یادآوری دارم برات' };
    }
    
    event.waitUntil(showNotificationFromSW(data));
});

console.log('[SW] Loaded', SW_VERSION);
