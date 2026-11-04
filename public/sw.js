/* PineVela requires an internet connection. This worker never stores responses,
 * messages, account data or credentials and never intercepts API/media requests. */
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
