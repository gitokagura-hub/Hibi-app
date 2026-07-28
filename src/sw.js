// Custom service worker source (used with vite-plugin-pwa's injectManifest
// strategy). Handles Web Push notifications for task reminders, in addition
// to the standard Workbox precaching that `injectManifest` wires up below.

import { precacheAndRoute } from 'workbox-precaching';

// Injected by vite-plugin-pwa at build time with the list of files to precache.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired when a push message arrives from the server (task reminder time reached).
self.addEventListener('push', (event) => {
  let payload = { title: 'Dayliy Brains', body: 'リマインダーの時間です' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // if the payload isn't JSON, fall back to the default text above
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'dayliybrains-reminder',
      data: { url: payload.url || '/' },
    })
  );
});

// Tapping the notification focuses/opens the app instead of just dismissing it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
