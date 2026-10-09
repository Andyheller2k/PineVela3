import type { Express, Response } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, type VerifiedActor } from './db.js';
import { type AuthRequest, SupabaseAuth } from './auth.js';

/** Only the exact notification recipient receives an invalidation. No record bodies,
 * route parameters, tokens, or other accounts' activity enter the event stream. */
export function installRealtime(app: Express, auth: SupabaseAuth) {
  const streams = new Map<Response, { actor: VerifiedActor; ip: string; close: () => void }>();
  let listener: PoolClient | undefined, starting: Promise<void> | undefined, disposed = false;
  let detachListener: (() => void) | undefined;
  async function start() {
    if (listener) return;
    if (starting) return starting;
    starting = (async () => {
      const client = await auth.db.pool.connect();
      try { await client.query('listen pinevela_notifications'); }
      catch (error) { client.release(true); throw error; }
      listener = client;
      const onNotification = (notice: { channel: string; payload?: string }) => {
        if (notice.channel !== 'pinevela_notifications') return;
        for (const [res, stream] of streams) {
          if (stream.actor.contextId !== notice.payload) continue;
          auth.db.actor(stream.actor, async () => undefined).then(() => {
            if (!streams.has(res)) return;
            if (res.writableLength > 65536 || !res.write(`data: ${JSON.stringify({ entity: 'notifications', timestamp: Date.now() })}\n\n`)) stream.close();
          }).catch(stream.close);
        }
      };
      const onError = () => {
        detachListener?.(); detachListener = undefined;
        listener = undefined; client.release(true);
        for (const stream of streams.values()) stream.close();
      };
      client.on('notification', onNotification); client.once('error', onError);
      detachListener = () => { client.removeListener('notification', onNotification); client.removeListener('error', onError); };
    })().finally(() => { starting = undefined; });
    return starting;
  }
  app.get('/api/sync/events', auth.require(), (req, res, next) => {
    (async () => {
      if (disposed) throw new ApiError(503, 'Live notifications are unavailable.');
      const actor = (req as AuthRequest).actor, ip = req.ip || req.socket.remoteAddress || '';
      const current = [...streams.values()];
      if (streams.size >= 128 || current.filter(s => s.ip === ip).length >= 20 || current.filter(s => s.actor.authUserId === actor.authUserId).length >= 3) throw new ApiError(429, 'Close an unused tab before opening another live connection.');
      await start();
      // Recheck limits after awaiting the connection; concurrent requests cannot
      // exceed the pool/stream budget between the check and stream registration.
      const admitted = [...streams.values()];
      if (disposed || res.destroyed || streams.size >= 128 || admitted.filter(s => s.ip === ip).length >= 20 || admitted.filter(s => s.actor.authUserId === actor.authUserId).length >= 3) throw new ApiError(429, 'Live connection capacity is busy.');
      let closed = false, checking = false;
      const close = () => {
        if (closed) return; closed = true; clearInterval(heartbeat); clearTimeout(expiry); streams.delete(res); res.end();
      };
      const heartbeat = setInterval(() => {
        if (checking || closed) return; checking = true;
        auth.db.actor(actor, async () => undefined).then(() => {
          if (!closed && (res.writableLength > 65536 || !res.write(': ping\n\n'))) close();
        }).catch(close).finally(() => { checking = false; });
      }, 25000); heartbeat.unref();
      const expiry = setTimeout(close, 10 * 60000); expiry.unref();
      streams.set(res, { actor, ip, close });
      res.once('close', close); res.once('error', close);
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
      res.flushHeaders(); res.write('data: connected\n\n');
    })().catch(next);
  });
  return async () => {
    disposed = true;
    for (const stream of streams.values()) stream.close();
    await starting?.catch(() => undefined);
    if (listener) {
      const client = listener;
      await client.query('unlisten *').catch(() => undefined);
      if (listener === client) { detachListener?.(); detachListener = undefined; client.release(); listener = undefined; }
    }
  };
}
