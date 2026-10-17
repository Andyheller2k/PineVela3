import dotenv from 'dotenv';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { SupabaseDatabase } from './supabase/db.js';
import { createSupabaseApp } from './supabase/app.js';
import { loadOrderPins } from './supabase/orderPins.js';
dotenv.config({ quiet: true });
const db = new SupabaseDatabase();
// Refuse to serve a partially applied or inaccessible schema.
await db.pool.query("select version from private.schema_migrations where version = '20261017133104'").then(result => {
  if (!result.rowCount) throw new Error('Apply all Supabase migrations before starting the server.');
});
const pinKey=loadOrderPins();
if((await db.pool.query('select exists(select 1 from private.market_order_pins where key_id<>$1) as mismatch',[pinKey.keyId])).rows[0].mismatch)
  throw new Error('Restore the matching private delivery PIN key before starting the replacement server.');
const { app } = createSupabaseApp(db);
let vite:ViteDevServer|undefined;
app.use((req,res,next) => {
  let pathname:string;
  try { pathname = path.posix.normalize(decodeURIComponent(req.path)); } catch { return res.sendStatus(400); }
  return /^\/(?:\.security|\.git|data|uploads|\.env|dist-supabase-backend)(?:[/.]|$)/i.test(pathname)
    || /^\/(?:(?:supabase-server|residence-worker|system-wipe-worker)\.mjs|server\.cjs)(?:\.map)?$/i.test(pathname) ? res.sendStatus(404) : next();
});
// A stable loopback development preview can serve the verified frontend build
// without Vite's module transforms competing with API/authentication requests.
// This changes asset serving only; it never changes Auth, RLS or release gates.
if (process.env.NODE_ENV === 'production' || process.env.PINEVELA_MIGRATION_STATIC_PREVIEW === 'true') {
  app.use(express.static(path.resolve('dist-supabase')));
  app.get('*', (_req, res) => res.sendFile(path.resolve('dist-supabase/index.html')));
} else {
  vite = await createViteServer({ server: { middlewareMode: true, watch: { ignored: ['**/.security/**', '**/data/**', '**/uploads/**', '**/docs/**', '**/scripts/**', '**/tests/**', '**/supabase/migrations/**', '**/supabase/.temp/**', '**/dist-supabase/**', '**/dist-supabase-backend/**', '**/SUPABASE_CONTINUATION.md'] }, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.security/**', '**/data/**', '**/uploads/**'] } }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PINEVELA_MIGRATION_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid migration server port.');
const server = app.listen(port, '127.0.0.1', () => console.log(`PineVela available at http://127.0.0.1:${port}`));
let closing=false;
async function close() {
  if(closing)return;closing=true;
  const drained=new Promise<void>(resolve=>server.close(()=>resolve()));
  const deadline=setTimeout(()=>server.closeAllConnections(),45000);deadline.unref();
  try {
    await app.locals.closeSupport?.();
    await app.locals.closeRealtime();
    await vite?.close();
    // Finish accepted HTTP work before ending its database pool. Vite's own
    // websocket/listener must close as well so a restart frees the HMR port.
    await drained;
    await db.close();
  } finally {clearTimeout(deadline);}
}
process.once('SIGTERM', close); process.once('SIGINT', close);
