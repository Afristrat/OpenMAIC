/**
 * Qalem — Comprehensive PWA service worker.
 *
 * Handles:
 * - A public, credential-free offline shell
 * - Cache-first delivery for explicitly public static assets
 * - Network-only delivery for authenticated API and navigation responses
 * - Local and remote review-reminder notifications
 */

/* global self, caches, fetch, URL */

// Bump all cache namespaces whenever route ownership changes. The root route
// used to host the creation studio, so keeping the v1 shell made installed
// browsers serve that obsolete screen instead of the marketing landing page.
const APP_SHELL_CACHE = 'qalem-shell-v3';
const STATIC_CACHE = 'qalem-static-v3';

/** Pages to pre-cache on install for offline shell */
const SHELL_URLS = ['/', '/manifest.json'];

/** Public paths that can never contain account-specific data. */
const PUBLIC_STATIC_PREFIXES = [
  '/_next/static/',
  '/avatars/',
  '/brand/',
  '/logos/',
  '/plugin-runtime/',
  '/vendor/',
];
const PUBLIC_STATIC_FILES = ['/manifest.json', '/robots.txt', '/favicon.ico'];

// ────────────────────────── Install ──────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => {
        return Promise.all(
          SHELL_URLS.map((url) =>
            cache.add(new Request(url, { cache: 'reload', credentials: 'omit' })),
          ),
        );
      })
      .then(() => {
        // Activate immediately, don't wait for old SW to finish
        return self.skipWaiting();
      }),
  );
});

// ────────────────────────── Activate ──────────────────────────

self.addEventListener('activate', (event) => {
  const CURRENT_CACHES = [APP_SHELL_CACHE, STATIC_CACHE];

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('qalem-') && !CURRENT_CACHES.includes(name))
            .map((name) => caches.delete(name)),
        );
      })
      .then(() => {
        // Take control of all open tabs immediately
        return self.clients.claim();
      }),
  );
});

// ────────────────────────── Fetch ──────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests (POST, PUT, etc.)
  if (event.request.method !== 'GET') return;

  // Authenticated API responses must never enter a shared browser cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnlyWithOfflineResponse(event.request));
    return;
  }

  // Only explicitly public static assets are cacheable.
  if (isPublicStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Never cache navigations: authenticated HTML or RSC data can be private.
  if (event.request.mode === 'navigate') {
    event.respondWith(networkOnlyNavigationWithShellFallback(event.request));
    return;
  }
});

/**
 * Network-only API strategy with a deterministic offline response.
 */
async function networkOnlyWithOfflineResponse(request) {
  try {
    return await fetch(new Request(request, { cache: 'no-store' }));
  } catch {
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You are currently offline' }),
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json',
        },
      },
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
 * Network-only navigation with a credential-free public shell fallback.
 */
async function networkOnlyNavigationWithShellFallback(request) {
  try {
    return await fetch(new Request(request, { cache: 'no-store' }));
  } catch {
    const shell = await caches.match(new Request('/', { credentials: 'omit' }));
    if (shell) return shell;
    return new Response('Offline — please reconnect to use Qalem.', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

/**
 * Check if a pathname is part of Qalem's immutable/public asset surface.
 */
function isPublicStaticAsset(pathname) {
  return (
    PUBLIC_STATIC_FILES.includes(pathname) ||
    PUBLIC_STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function safeNotificationTarget(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/review';
}

self.addEventListener('push', function (event) {
  const fallback = {
    title: 'Qalem',
    body: 'Qalem',
    targetUrl: '/review',
    tag: 'review-reminder',
  };
  let payload = fallback;
  try {
    if (event.data) payload = { ...fallback, ...event.data.json() };
  } catch {
    // A malformed upstream payload must still produce a safe, useful reminder.
  }

  event.waitUntil(
    self.registration.showNotification(
      typeof payload.title === 'string' ? payload.title.slice(0, 120) : fallback.title,
      {
        body: typeof payload.body === 'string' ? payload.body.slice(0, 240) : fallback.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 120) : fallback.tag,
        data: { url: safeNotificationTarget(payload.targetUrl) },
      },
    ),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl = safeNotificationTarget(event.notification.data?.url);
  const absoluteTarget = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      // Focus an existing tab if one is open
      for (const client of clients) {
        if (client.url === absoluteTarget && 'focus' in client) {
          return client.focus();
        }
      }
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
          return client.navigate(absoluteTarget).then(() => client.focus());
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
