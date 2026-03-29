/**
 * Qalem — Push notification service worker.
 *
 * Handles incoming push events and displays notifications
 * for spaced-repetition review reminders.
 */

/* global self */

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
