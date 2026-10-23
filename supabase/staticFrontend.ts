import path from 'node:path';
import express, { type Express, type RequestHandler } from 'express';
import compression from 'compression';

/** Frontend files only. Install after API routes and the private-path boundary,
 * so private JSON and event streams keep their existing delivery policies. */
export const frontendFramingProtection:RequestHandler=(_req,res,next)=>{
  res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");
  res.setHeader('X-Frame-Options','DENY');
  next();
};
export function installStaticFrontend(app: Express, directory = path.resolve('dist-supabase')) {
  app.use(frontendFramingProtection);
  app.use(compression());
  // Exact public install resources only. A missing worker must return 404,
  // never the SPA document; updates must bypass stale intermediary caches.
  for (const [route, file, type] of [
    ['/manifest.webmanifest', 'manifest.webmanifest', 'application/manifest+json'],
    ['/sw.js', 'sw.js', 'application/javascript'],
    ['/icons/pinevela-192.png', 'icons/pinevela-192.png', 'image/png'],
    ['/icons/pinevela-512.png', 'icons/pinevela-512.png', 'image/png'],
    ['/icons/pinevela-maskable-512.png', 'icons/pinevela-maskable-512.png', 'image/png'],
    ['/icons/apple-touch-icon.png', 'icons/apple-touch-icon.png', 'image/png'],
  ]) {
    app.get(route, (_req, res, next) => {
      res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': type });
      if (route === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');
      res.sendFile(path.join(directory, file), error => {
        if (!error) return;
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as {status?:number}).status === 404) res.sendStatus(404);
        else next(error);
      });
    });
  }
  app.use('/assets', express.static(path.join(directory, 'assets'), {
    immutable: true, maxAge: '1y', index: false,
  }));
  app.use(express.static(directory, {
    setHeaders(res, file) {
      if (path.basename(file) === 'index.html') res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(directory, 'index.html'));
  });
}
