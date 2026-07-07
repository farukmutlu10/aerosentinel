const CACHE_NAME = 'aerosentinel-v20';
const ASSET_CACHE = 'caches-v20';
const MAX_CACHE_ENTRIES = 100;

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== ASSET_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

// ─── LRU eviction: remove oldest entries when cache exceeds MAX_CACHE_ENTRIES ──
async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
  }
}

// ─── URL patterns that should never be cached ─────────────────────────────────
function isCacheableUrl(url) {
  if (url.includes('/api/')) return false;
  if (url.startsWith('chrome-extension:')) return false;
  if (url.startsWith('ws:') || url.startsWith('wss:')) return false;
  return true;
}

// ─── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  // Cross-origin requests (analytics beacons, ad scripts, Railway API, fonts…)
  // → don't intercept at all. Intercepting them made the SW the one responsible
  // for producing a Response; when CSP blocked the underlying fetch (e.g. the
  // cloudflareinsights beacon) the handler resolved with undefined and threw
  // "Failed to convert value to 'Response'", leaving the request dead.
  if (!url.startsWith(self.location.origin)) return;

  // API requests → network-only
  if (url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Page navigations → network-first, cache fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Store a copy for offline fallback
          const clone = response.clone();
          caches.open(ASSET_CACHE).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // All other GET requests (JS, CSS, fonts, images, favicon) → stale-while-revalidate
  if (!isCacheableUrl(url)) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.open(ASSET_CACHE).then(async cache => {
      const cachedResponse = await cache.match(e.request);

      // Background revalidation
      const fetchPromise = fetch(e.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          cache.put(e.request, networkResponse.clone());
          trimCache(ASSET_CACHE, MAX_CACHE_ENTRIES);
        }
        return networkResponse;
      // respondWith must always resolve to a Response — resolving with
      // undefined (no cache + failed network) throws a TypeError instead of
      // surfacing a normal network error to the page
      }).catch(() => cachedResponse || Response.error());

      // Return cached immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});

// ─── Push event handler — shows notification when server sends push ──────────
self.addEventListener('push', e => {
  let data = { title: 'AERO-SENTINEL', body: 'New alert', icon: '/alert-icon.png?v=7', tag: 'aero-alert', data: { url: '/alerts' } };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch { /* fallback to defaults */ }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      tag: data.tag,
      data: data.data,
      requireInteraction: false,
      silent: false,
      vibrate: [200, 100, 200, 100, 200],
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

// ─── Notification tıklama handler'ı — navigate to /alerts ─────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const targetUrl = e.notification.data?.url || '/alerts';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Focus first, then navigate — chained properly inside waitUntil
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
