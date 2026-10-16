import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import type { Request, Response } from 'express';

export class ResourceLimitError extends Error {
  constructor(public status = 429, public retryAfter = 60, message = 'Too many requests. Please wait before trying again.') { super(message); }
}

export function resourceFailure(res: Response, error: ResourceLimitError) {
  return res.status(error.status).set({ 'Retry-After': String(error.retryAfter), 'Cache-Control': 'no-store', Connection: 'close' }).json({ error: error.message });
}
export function trustedProxyAddresses(value = process.env.PINEVELA_TRUST_PROXY || ''): false | string[] {
  if (!value.trim()) return false;
  const addresses = value.split(',').map(v => v.trim());
  if (addresses.some(value => { const [ip, bits, extra] = value.split('/'); const version = isIP(ip); return !version || extra !== undefined || (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) === 0 || Number(bits) > (version === 4 ? 32 : 128))); })) {
    throw new Error('PINEVELA_TRUST_PROXY must contain only explicit proxy IP addresses/CIDRs.');
  }
  return addresses;
}

/** Bounded waiting as well as bounded execution; queue pressure cannot grow without limit. */
export class WorkPool {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private maximum: number, private waiting: number) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) {
      if (this.queue.length >= this.waiting) throw new ResourceLimitError(503, 2, 'Server processing is busy. Please try again shortly.');
      await new Promise<void>(resolve => this.queue.push(resolve));
    } else this.active++;
    try { return await work(); }
    finally { const next = this.queue.shift(); if (next) next(); else this.active--; }
  }
}

const workContext = new AsyncLocalStorage<{ count: number; cache: Map<string, any> }>();
export const credentialContext = (work: () => void) => workContext.run({ count: 0, cache: new Map() }, work);
export function credentialWork<T>(key: string, work: () => T): T {
  const context = workContext.getStore();
  if (context?.cache.has(key)) return context.cache.get(key);
  if (context && ++context.count > 16) throw new ResourceLimitError(429, 60, 'This credential operation exceeds the processing limit. Contact an administrator.');
  const result = work();
  context?.cache.set(key, result);
  return result;
}

type Bucket = { key: string; count: number; expiresAt: number };
export type Budget = { scope: string; identity: string; maximum: number; windowMs: number; cost?: number };
/** Raw IPs, supplied names, secrets and tokens are never retained in budget state. */
export class AttemptBudgets {
  private buckets = new Map<string, Bucket>();
  constructor(private now = Date.now, private maximumBuckets = 4000) {}
  reserve(budgets: Budget[]) {
    const now = this.now();
    for (const [key, bucket] of this.buckets) if (bucket.expiresAt <= now) this.buckets.delete(key);
    const slots = budgets.map(budget => {
      const key = crypto.createHash('sha256').update(`${budget.scope}:${budget.identity}`).digest('hex');
      const existing = this.buckets.get(key), cost = budget.cost ?? 1;
      if (!Number.isFinite(cost) || cost < 0 || cost > budget.maximum || (existing && existing.count + cost > budget.maximum)) {
        throw new ResourceLimitError(429, Math.max(1, Math.ceil(((existing?.expiresAt || now + budget.windowMs) - now) / 1000)));
      }
      return { key, cost, existing, windowMs: budget.windowMs };
    });
    if (this.buckets.size + slots.filter(s => !s.existing).length > this.maximumBuckets) throw new ResourceLimitError(503, 60, 'Request capacity is busy. Please try again later.');
    for (const slot of slots) {
      if (slot.existing) slot.existing.count += slot.cost;
      else this.buckets.set(slot.key, { key: slot.key, count: slot.cost, expiresAt: now + slot.windowMs });
    }
  }
}

const ipOf = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown';

/** Public invalidation streams carry no private records, but still consume bounded sockets. */
export class EventConnections {
  private clients = new Map<Response, { ip: string; actor: string; close: () => void }>();
  constructor(private maximum = 128, private perIp = 20, private perActor = 3, private lifetime = 10 * 60000) {}
  add(req: Request, res: Response, actor: string) {
    const ip = ipOf(req), all = [...this.clients.values()];
    if (all.length >= this.maximum || all.filter(c => c.ip === ip).length >= this.perIp || (actor && all.filter(c => c.actor === actor).length >= this.perActor)) throw new ResourceLimitError(429, 30, 'Too many live connections. Close an unused tab and try again.');
    let closed = false;
    const close = () => { if (closed) return; closed = true; clearInterval(heartbeat); clearTimeout(expiry); this.clients.delete(res); res.destroy(); };
    const write = (data: string) => {
      if (closed) return;
      try { if (res.destroyed || res.writableEnded || res.writableLength > 65536 || !res.write(data)) close(); }
      catch { close(); }
    };
    const heartbeat = setInterval(() => write(': ping\n\n'), 25000); heartbeat.unref();
    const expiry = setTimeout(close, this.lifetime); expiry.unref();
    this.clients.set(res, { ip, actor, close });
    req.once('close', close); res.once('close', close); res.once('error', close);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.flushHeaders(); write('data: connected\n\n');
  }
  broadcast(payload: string) {
    for (const [res, client] of this.clients) {
        try { if (res.destroyed || res.writableEnded || res.writableLength > 65536 || !res.write(`data: ${payload}\n\n`)) client.close(); }
      catch { client.close(); }
    }
  }
}
