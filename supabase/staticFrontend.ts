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
