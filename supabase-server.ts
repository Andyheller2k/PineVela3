import dotenv from 'dotenv';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { SupabaseDatabase } from './supabase/db.js';
import { createSupabaseApp } from './supabase/app.js';
import { loadOrderPins } from './supabase/orderPins.js';
dotenv.config({ quiet: true });
const db = new SupabaseDatabase();
// Refuse to serve a partially applied or inaccessible schema.
await db.pool.query("select version from private.schema_migrations where version = '20261010000000'").then(result => {
  if (!result.rowCount) throw new Error('Apply all Supabase migrations before starting the replacement server.');
});
const pinKey=loadOrderPins();
if((await db.pool.query('select exists(select 1 from private.market_order_pins where key_id<>$1) as mismatch',[pinKey.keyId])).rows[0].mismatch)
  throw new Error('Restore the matching private delivery PIN key before starting the replacement server.');
const { app } = createSupabaseApp(db);
app.use((req,res,next) => {
  let pathname:string;
  try { pathname = path.posix.normalize(decodeURIComponent(req.path)); } catch { return res.sendStatus(400); }
  return /^\/(?:\.security|\.git|data|uploads|\.env|dist-supabase-backend)(?:[/.]|$)/i.test(pathname)
    || /^\/(?:supabase-server\.mjs|server\.cjs)(?:\.map)?$/i.test(pathname) ? res.sendStatus(404) : next();
});
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('dist-supabase')));
  app.get('*', (_req, res) => res.sendFile(path.resolve('dist-supabase/index.html')));
} else {
  const vite = await createViteServer({ define: { 'import.meta.env.VITE_PERSISTENCE': JSON.stringify('supabase') },server: { middlewareMode: true, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.security/**', '**/data/**', '**/uploads/**'] } }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PINEVELA_MIGRATION_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid migration server port.');
const server = app.listen(port, '127.0.0.1', () => console.log(`Supabase migration backend available at http://127.0.0.1:${port}`));
async function close() { await app.locals.closeRealtime(); server.close(); await db.close(); }
process.once('SIGTERM', close); process.once('SIGINT', close);
