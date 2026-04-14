/* ============================================
   وجدي الدبعي للساعات — Service Worker v1.0
   PWA Offline & Caching Strategy
============================================= */

const APP_VERSION = 'v1.0.0';
const CACHE_NAME = `wajdi-watches-${APP_VERSION}`;
const STATIC_CACHE = `wajdi-static-${APP_VERSION}`;
const DYNAMIC_CACHE = `wajdi-dynamic-${APP_VERSION}`;
const IMAGE_CACHE = `wajdi-images-${APP_VERSION}`;

/* Assets to cache on install */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Cairo:wght@300;400;500;600;700;900&family=Tajawal:wght@200;300;400;500;700;800;900&display=swap'
];

/* ======== INSTALL ======== */
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Cache install error:', err))
  );
});

/* ======== ACTIVATE ======== */
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    Promise.all([
      /* Clean old caches */
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMAGE_CACHE)
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      ),
      self.clients.claim()
    ])
  );
});

/* ======== FETCH STRATEGY ======== */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET and chrome-extension */
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  /* Google Fonts — Cache First */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  /* Images (Unsplash etc.) — Cache First with fallback */
  if (request.destination === 'image' || url.hostname === 'images.unsplash.com') {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  /* HTML pages — Network First (fresh content) */
  if (request.destination === 'document') {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  /* Everything else — Stale While Revalidate */
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

/* ======== CACHE STRATEGIES ======== */

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    /* Offline fallback */
    return caches.match('/index.html');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('', { status: 503 });
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      /* Limit image cache to 50 entries */
      await trimCache(IMAGE_CACHE, 50);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    /* Return placeholder on error */
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
        <rect fill="#1a1a1d" width="300" height="300"/>
        <text fill="#c9a96e" font-family="serif" font-size="60" x="50%" y="52%" text-anchor="middle" dominant-baseline="middle">⌚</text>
      </svg>`,
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length >= maxItems) {
    await cache.delete(keys[0]);
  }
}

/* ======== BACKGROUND SYNC ======== */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-cart') {
    event.waitUntil(syncCart());
  }
});

async function syncCart() {
  console.log('[SW] Background sync: cart');
}

/* ======== PUSH NOTIFICATIONS ======== */
self.addEventListener('push', event => {
  const data = event.data?.json() || {
    title: 'وجدي الدبعي للساعات',
    body: 'عرض جديد ينتظرك! 🎉',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-72.png',
      vibrate: [200, 100, 200],
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'فتح المتجر' },
        { action: 'close', title: 'إغلاق' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        const url = event.notification.data?.url || '/';
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
    );
  }
});

console.log('[SW] Service Worker loaded — وجدي الدبعي للساعات الفاخرة');
