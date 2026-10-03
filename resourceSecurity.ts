import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import express, { type Request, type Response, type NextFunction } from 'express';

export class ResourceLimitError extends Error {
  constructor(public status = 429, public retryAfter = 60, message = 'Too many requests. Please wait before trying again.') { super(message); }
}

export function resourceFailure(res: Response, error: ResourceLimitError) {
  return res.status(error.status).set({ 'Retry-After': String(error.retryAfter), 'Cache-Control': 'no-store', Connection: 'close' }).json({ error: error.message });
}
export const asyncHandler = (handler: (req: any, res: any, next: NextFunction) => any) =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => handler(req, res, next)).catch(next); };

/** Express 4 does not forward async rejections. Keep overloads and nested middleware arrays. */
export function guardAsyncRoutes(app: any) {
  const wrap = (value: any): any => Array.isArray(value) ? value.map(wrap) : typeof value === 'function' && value.constructor.name === 'AsyncFunction' ? asyncHandler(value) : value;
  for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete', 'all']) {
    const register = app[method].bind(app);
    app[method] = (...args: any[]) => register(...args.map(wrap));
  }
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
  private writing: Promise<void> = Promise.resolve();
  constructor(private now = Date.now, private maximumBuckets = 4000, private file?: string) {}
  async load() {
    if (!this.file) return;
    try {
      const stat = await fs.stat(this.file);
      if (stat.size > 1024 * 1024) throw new Error('Request budget file exceeds its size limit.');
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!Array.isArray(parsed) || parsed.length > this.maximumBuckets || parsed.some(b => !/^[a-f0-9]{64}$/.test(b.key) || !Number.isFinite(b.count) || b.count < 0 || !Number.isFinite(b.expiresAt))) throw new Error('Invalid request budget state.');
      for (const b of parsed) if (b.expiresAt > this.now()) this.buckets.set(b.key, b);
    } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  }
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
  async persist() {
    if (!this.file) return;
    // Callers are admitted through concurrency limits. Writes serialize and atomically replace
    // a small, bounded file, independently of the potentially large application database.
    const snapshot = JSON.stringify([...this.buckets.values()]);
    const file = this.file;
    const write = this.writing.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const tmp = `${file}.${crypto.randomUUID()}.tmp`;
      try { await fs.writeFile(tmp, snapshot, { mode: 0o600, flag: 'wx' }); await fs.rename(tmp, file); }
      finally { await fs.rm(tmp, { force: true }); }
    });
    this.writing = write;
    await write;
  }
}

const ipOf = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown';
const routeOf = (req: Request) => req.path.toLowerCase().replace(/\/+$/, '');
const loginPaths = new Set(['/api/auth/login', '/api/digital-market/login', '/api/verification-teams/login', '/api/auth/verification-team-login']);
const credentialPaths = /(?:login|register|verify-unified|password|residents\/onboard|room-keys\/claim|manager-verifications\/submit|\/staff$|delete-registered-account|delete-room|clear-registered-accounts|\/verification-teams$)/;
const smallBody = (route: string) => loginPaths.has(route) || /(?:password|verify-unified|register-unified)$/.test(route);
export const UPLOAD_ROUTE = '/api/storage/upload-hostel-image';

export async function createResourceProtection(options: { actor: (req: Request) => string; loginIdentity: (req: Request) => string | string[]; dataDir?: string }) {
  const memory = new AttemptBudgets();
  const durable = new AttemptBudgets(Date.now, 4000, path.join(options.dataDir || process.env.PINEVELA_DATA_DIR || path.join(process.cwd(), 'data'), 'request-limits.json'));
  await durable.load();
  let inFlight = 0, credentialRequests = 0, uploadRequests = 0;
  const ipRequests = new Map<string, number>(), ipCredentials = new Map<string, number>(), actorRequests = new Map<string, number>();
  const small = express.json({ limit: '256kb', inflate: false });
  // Bounded media-bearing JSON is still used by existing avatar/catalog/document forms.
  const medium = express.json({ limit: '4mb', inflate: false });
  const photo = express.json({ limit: '28mb', inflate: false });
  const form = express.urlencoded({ extended: false, limit: '256kb', parameterLimit: 100, inflate: false });
  return {
    beforeBody(req: Request, res: Response, next: NextFunction) {
      try {
        memory.reserve([
          { scope: 'request-ip', identity: ipOf(req), maximum: 900, windowMs: 60000 },
          { scope: 'request-global', identity: 'all', maximum: 3000, windowMs: 60000 }
        ]);
        const route = routeOf(req), credentials = !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && credentialPaths.test(route), upload = route === UPLOAD_ROUTE;
        const ip = ipOf(req), actor = options.actor(req);
        if (inFlight >= 32 || (ipRequests.get(ip) || 0) >= 12 || (actor && (actorRequests.get(actor) || 0) >= 16) || (credentials && (credentialRequests >= 4 || (ipCredentials.get(ip) || 0) >= 2)) || (upload && uploadRequests >= 2)) throw new ResourceLimitError(503, 2, 'Server request capacity is busy. Please try again shortly.');
        inFlight++; if (credentials) credentialRequests++; if (upload) uploadRequests++;
        ipRequests.set(ip, (ipRequests.get(ip) || 0) + 1);
        if (credentials) ipCredentials.set(ip, (ipCredentials.get(ip) || 0) + 1);
        if (actor) actorRequests.set(actor, (actorRequests.get(actor) || 0) + 1);
        let released = false;
        const decrement = (map: Map<string, number>, key: string) => { const remaining = (map.get(key) || 1) - 1; if (remaining) map.set(key, remaining); else map.delete(key); };
        const release = () => {
          if (released) return; released = true;
          inFlight--; if (credentials) credentialRequests--; if (upload) uploadRequests--;
          decrement(ipRequests, ip); if (credentials) decrement(ipCredentials, ip); if (actor) decrement(actorRequests, actor);
        };
        res.once('finish', release); res.once('close', release);
        // SSE has its own long-lived connection budget; release this request slot after headers.
        if (route === '/api/sync/events' && req.method === 'GET') {
          if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) !== 0) return res.status(400).set('Connection', 'close').json({ error: 'Live event streams do not accept request bodies.' });
          release(); return next();
        }
        const deadline = setTimeout(() => { if (!res.headersSent) res.status(408).json({ error: 'Request took too long.' }); else res.destroy(); }, upload ? 45000 : 20000);
        deadline.unref();
        res.once('finish', () => clearTimeout(deadline)); res.once('close', () => clearTimeout(deadline));
        if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') return res.status(415).set('Connection', 'close').json({ error: 'Compressed request bodies are not supported.' });
        credentialContext(next);
      } catch (error) { if (error instanceof ResourceLimitError) return resourceFailure(res, error); next(error); }
    },
    parseBody(req: Request, res: Response, next: NextFunction) {
      const route = routeOf(req);
      const parser = route === UPLOAD_ROUTE ? photo : smallBody(route) ? small : medium;
      const length = Number(req.headers['content-length']);
      const maximum = route === UPLOAD_ROUTE ? 28 * 1024 * 1024 : smallBody(route) ? 256 * 1024 : 4 * 1024 * 1024;
      if (Number.isFinite(length) && length > maximum) return res.status(413).set('Connection', 'close').json({ error: 'Request body exceeds the supported size.' });
      parser(req, res, error => error ? next(error) : form(req, res, next));
    },
    afterBody: asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
      // Bound recursive sanitization/persistence work, including deeply nested small bodies.
      const pending = [{ value: req.body, depth: 0 }]; let nodes = 0;
      while (pending.length) {
        const { value, depth } = pending.pop()!;
        if (++nodes > 10000 || depth > 12) return res.status(400).json({ error: 'Request structure exceeds the supported limit.' });
        if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
      }
      const route = routeOf(req), actor = options.actor(req);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        memory.reserve([
          { scope: 'write-ip', identity: ipOf(req), maximum: 120, windowMs: 60000 },
          { scope: 'write-global', identity: 'all', maximum: 180, windowMs: 60000 },
          ...(actor ? [{ scope: 'write-actor', identity: actor, maximum: 60, windowMs: 60000 }] : [])
        ]);
        const bytes = route === UPLOAD_ROUTE ? 0 : Buffer.byteLength(JSON.stringify(req.body || {}));
        durable.reserve([
          { scope: 'daily-write-ip', identity: ipOf(req), maximum: 2500, windowMs: 86400000 },
          { scope: 'daily-write-global', identity: 'all', maximum: 10000, windowMs: 86400000 },
          { scope: 'daily-write-ip-bytes', identity: ipOf(req), maximum: 50 * 1024 * 1024, windowMs: 86400000, cost: bytes },
          { scope: 'daily-write-global-bytes', identity: 'all', maximum: 500 * 1024 * 1024, windowMs: 86400000, cost: bytes },
          ...(actor ? [
            { scope: 'daily-write-actor', identity: actor, maximum: 1000, windowMs: 86400000 },
            { scope: 'daily-write-actor-bytes', identity: actor, maximum: 25 * 1024 * 1024, windowMs: 86400000, cost: bytes }
          ] : [])
        ]);
        await durable.persist();
      }
      if (loginPaths.has(route) && req.method === 'POST') {
        const identities = [...new Set([options.loginIdentity(req)].flat())];
        durable.reserve([
          { scope: 'login-ip', identity: ipOf(req), maximum: 30, windowMs: 15 * 60000 },
          ...identities.map(identity => ({ scope: 'login-identity', identity, maximum: 20, windowMs: 15 * 60000 }))
        ]);
        memory.reserve([{ scope: 'credential-global', identity: 'all', maximum: 120, windowMs: 60000 }]);
        await durable.persist();
      } else if (credentialPaths.test(route) && req.method !== 'GET') {
        memory.reserve([
          { scope: 'credential-ip', identity: ipOf(req), maximum: 40, windowMs: 15 * 60000 },
          { scope: 'credential-global', identity: 'all', maximum: 120, windowMs: 60000 },
          ...(actor ? [{ scope: 'credential-actor', identity: actor, maximum: 30, windowMs: 15 * 60000 }] : [])
        ]);
      }
      if (actor) memory.reserve([{ scope: 'read-actor', identity: actor, maximum: 900, windowMs: 60000 }]);
      if (route === '/api/room-keys') memory.reserve([
        { scope: 'key-list-ip', identity: ipOf(req), maximum: 60, windowMs: 60000 },
        { scope: 'key-list-global', identity: 'all', maximum: 120, windowMs: 60000 },
        ...(actor ? [{ scope: 'key-list-actor', identity: actor, maximum: 30, windowMs: 60000 }] : [])
      ]);
      next();
    }),
    async reserveUpload(actor: string, ip: string, bytes: number) {
      durable.reserve([
        { scope: 'upload-actor-count', identity: actor, maximum: 100, windowMs: 86400000 },
        { scope: 'upload-ip-count', identity: ip, maximum: 200, windowMs: 86400000 },
        { scope: 'upload-actor-bytes', identity: actor, maximum: 250 * 1024 * 1024, windowMs: 86400000, cost: bytes },
        { scope: 'upload-global-bytes', identity: 'all', maximum: 2 * 1024 * 1024 * 1024, windowMs: 86400000, cost: bytes }
      ]);
      await durable.persist();
    }
  };
}

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
