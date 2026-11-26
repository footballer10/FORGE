/* Lock-screen rest alerts (milestone 17). Loaded into the generated service worker via workbox importScripts. */
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.showNotification('Rest over', {
        body: 'Time for your next set.',
        tag: 'forge-rest',
        renotify: true,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      });
      // Forge is open and on screen: its own bell already rang, so take the banner away again.
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (open.some((c) => c.visibilityState === 'visible')) {
        await new Promise((r) => setTimeout(r, 1500));
        const shown = await self.registration.getNotifications({ tag: 'forge-rest' });
        shown.forEach((n) => n.close());
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = open[0];
      if (existing) await existing.focus();
      else await self.clients.openWindow('/');
    })(),
  );
});
