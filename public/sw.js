/* Online-only app. No response/message/account cache or background polling.
 * User-authorized Push events display only the bounded, supplied payload. */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Leave every document navigation to the browser, including its native
  // offline screen. Only the public install manifest uses this network handler.
  // Retaining a real fetch handler also supports older install-prompt criteria.
  if (event.request.mode === 'navigate' || event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname !== '/manifest.webmanifest') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});

function notificationDestination(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value, self.location.origin);
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (url.origin !== self.location.origin || url.pathname !== '/device-notification' || url.hash
      || !uuid.test(url.searchParams.get('notice') || '') || !uuid.test(url.searchParams.get('account') || '')
      || !['primary','resident','manager','staff','seller','admin','officer','feedback'].includes(url.searchParams.get('kind'))
      || url.searchParams.size !== 3
      || [...url.searchParams.keys()].some(key => !['notice','account','kind'].includes(key) || url.searchParams.getAll(key).length !== 1)) return null;
    return url.pathname + url.search;
  } catch { return null; }
}
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data; try { data = event.data?.json(); } catch { return; }
    const path = notificationDestination(data?.path);
    if (!data || data.v !== 1 || !path || typeof data.title !== 'string' || typeof data.body !== 'string'
      || data.title.length > 200 || data.body.length > 300 || typeof data.tag !== 'string' || !/^pv:[a-f0-9:-]{73,100}$/i.test(data.tag)) return;
    let image;
    if (typeof data.image === 'string') {
      try { const u = new URL(data.image); if (u.origin === self.location.origin
        && /^\/api\/device-push\/images\/(listing|residence)\/[a-f0-9-]{36}\.jpg$/.test(u.pathname) && !u.search && !u.hash) image = u.href; } catch {}
    }
    const options = {body: data.body, tag: data.tag, icon: '/icons/pinevela-192.png', badge: '/icons/push-badge.png',
      data: {path}, renotify: false, ...(image ? {image} : {})};
    await self.registration.showNotification(data.title, options);
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = notificationDestination(event.notification.data?.path); if (!path) return;
  event.waitUntil((async () => {
    const target = self.location.origin + '/#' + path;
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const existing = windows.find(client => { try { return new URL(client.url).origin === self.location.origin; } catch { return false; } });
    if (existing) { const navigated = await existing.navigate(target); await (navigated || existing).focus(); }
    else await self.clients.openWindow(target);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'pinevela-clear-notifications') return;
  event.waitUntil((async () => { for (const notification of await self.registration.getNotifications()) notification.close(); })());
});
