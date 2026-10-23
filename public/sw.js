/* PineVela requires an internet connection. This worker never stores responses,
 * messages, account data or credentials and never intercepts API/media requests. */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin || !['/', '/index.html'].includes(url.pathname)) return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#001d3d"><title>PineVela · Offline</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#001d3d;color:#f8fafc;font:16px/1.6 system-ui,sans-serif}main{max-width:28rem;padding:2rem}h1{color:#ffd60a;font-size:2rem;line-height:1.2}a{display:inline-block;padding:.75rem 1.2rem;border-radius:1rem;background:#ffd60a;color:#001d3d;font-weight:700;text-decoration:none}</style><main><h1>You’re offline</h1><p>PineVela needs an internet connection to keep your account and information up to date. Reconnect, then try again.</p><a href="/#/login">Try again</a></main></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'X-Content-Type-Options': 'nosniff' } },
  )));
});
