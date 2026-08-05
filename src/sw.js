// Custom service worker source (used with vite-plugin-pwa's injectManifest
// strategy). Handles Web Push notifications for task reminders, in addition
// to the standard Workbox precaching that `injectManifest` wires up below.

import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// Bump this string to force every installed device to pick up a new service
// worker on next app open (the byte change is what triggers the update).
// 2026-08-05: recovery release — old SWs were serving a stale broken bundle
// forever, causing a persistent white screen that code reverts couldn't fix.
const SW_VERSION = '2026-08-05-recovery-1';

cleanupOutdatedCaches();

// Injected by vite-plugin-pwa at build time with the list of files to precache.
precacheAndRoute(self.__WB_MANIFEST);

// By default, Workbox's precaching sets up an implicit navigation fallback
// to index.html for any page-navigation request that isn't in the precache
// list — this is what makes a PWA work offline/SPA-style. But it also meant
// that opening /api/reminders/check directly in the browser (a navigation)
// was being redirected to index.html instead of hitting the Worker's API
// route. Explicitly deny the fallback for /api/ paths so those requests go
// straight to the network (and therefore to the Worker).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  })
);

self.addEventListener('install', () => {
  console.log('[sw] installing', SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Recovery: any page currently open (including a white-screened one
      // whose JS never ran) gets force-reloaded so it's served the fresh
      // precache from this new worker. activate runs exactly once per SW
      // version, so this cannot loop.
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map((c) => c.navigate(c.url).catch(() => {})));
    })()
  );
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
