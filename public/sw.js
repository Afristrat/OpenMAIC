/**
 * Qalem — Comprehensive PWA service worker.
 *
 * Handles:
 * - App shell caching (HTML, CSS, JS bundles)
 * - Network-first strategy for API routes
 * - Cache-first strategy for static assets
 * - Offline fallback
 * - Background sync for pending operations (quiz results, review ratings)
 * - Push notifications (preserved from sw-notifications.js)
 */

/* global self, caches, fetch, URL */

const APP_SHELL_CACHE = 'qalem-shell-v1';
const DATA_CACHE = 'qalem-data-v1';
const STATIC_CACHE = 'qalem-static-v1';

/** Pages to pre-cache on install for offline shell */
const SHELL_URLS = [
  '/',
  '/manifest.json',
];

/** Static asset extensions that use cache-first */
const STATIC_EXTENSIONS = [
  '.js', '.css', '.woff', '.woff2', '.ttf', '.eot',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
];

// ────────────────────────── Install ──────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_URLS);
    }).then(() => {
      // Activate immediately, don't wait for old SW to finish
      return self.skipWaiting();
    })
  );
});

// ────────────────────────── Activate ──────────────────────────

self.addEventListener('activate', (event) => {
  const CURRENT_CACHES = [APP_SHELL_CACHE, DATA_CACHE, STATIC_CACHE];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of all open tabs immediately
      return self.clients.claim();
    })
  );
});

// ────────────────────────── Fetch ──────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests (POST, PUT, etc.)
  if (event.request.method !== 'GET') return;

  // API routes → network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }

  // Static assets → cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Next.js build assets (_next/) → cache-first
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Navigation requests (HTML pages) → network-first with shell fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstWithShellFallback(event.request));
    return;
  }

  // Default → network-first
  event.respondWith(networkFirst(event.request, DATA_CACHE));
});

/**
 * Network-first strategy: try network, fall back to cache.
 */
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
    // Return a basic offline JSON for API requests
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You are currently offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Cache-first strategy: serve from cache, fetch and update if not cached.
 */
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
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/**
 * Network-first for navigation with app shell fallback.
 */
async function networkFirstWithShellFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try the exact URL first
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fall back to the cached root shell
    const shell = await caches.match('/');
    if (shell) return shell;
    return new Response('Offline — please reconnect to use Qalem.', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

/**
 * Check if a pathname points to a static asset.
 */
function isStaticAsset(pathname) {
  return STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

// ────────────────────────── Background Sync ──────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'qalem-sync-queue') {
    event.waitUntil(processSyncQueue());
  }
});

/**
 * Process queued operations stored in IndexedDB.
 * Opens the Dexie database directly from the SW context.
 */
async function processSyncQueue() {
  try {
    const dbReq = indexedDB.open('MAIC-Database');
    const db = await new Promise((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result);
      dbReq.onerror = () => reject(dbReq.error);
    });

    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const allReq = store.getAll();
    const items = await new Promise((resolve, reject) => {
      allReq.onsuccess = () => resolve(allReq.result);
      allReq.onerror = () => reject(allReq.error);
    });

    for (const item of items) {
      try {
        let endpoint = '';
        let method = 'POST';

        switch (item.type) {
          case 'quiz_result':
            endpoint = '/api/quiz/results';
            break;
          case 'review_rating':
            endpoint = '/api/review/ratings';
            break;
          case 'stage_sync':
            endpoint = '/api/stages/sync';
            break;
          default:
            continue;
        }

        const response = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });

        if (response.ok) {
          // Remove from queue on success
          const delTx = db.transaction('syncQueue', 'readwrite');
          delTx.objectStore('syncQueue').delete(item.id);
          await new Promise((resolve) => { delTx.oncomplete = resolve; });
        } else if (item.retries < 3) {
          // Increment retry count
          const retryTx = db.transaction('syncQueue', 'readwrite');
          retryTx.objectStore('syncQueue').put({ ...item, retries: item.retries + 1 });
          await new Promise((resolve) => { retryTx.oncomplete = resolve; });
        }
      } catch {
        // Network still down — leave in queue for next sync
      }
    }

    db.close();
  } catch {
    // Database not available — will retry on next sync event
  }
}

// ────────────────────────── Push Notifications ──────────────────────────

self.addEventListener('push', function (event) {
  const fallback = { title: 'Qalem', body: 'Des cartes vous attendent !' };
  let data = fallback;

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    // If JSON parsing fails, use fallback
  }

  const title = data.title || fallback.title;
  const options = {
    body: data.body || fallback.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'review-reminder',
    renotify: true,
    data: {
      url: '/review',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/review';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      // Focus an existing tab if one is open
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
