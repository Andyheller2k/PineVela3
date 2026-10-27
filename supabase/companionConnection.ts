import { Resolver, lookup } from 'node:dns/promises';
import { isIPv4, type LookupFunction } from 'node:net';
import https from 'node:https';
import { ApiError } from './db.js';

const resolver = new Resolver({ timeout: 700, tries: 1 });
let cached: { address: string; ttl: number }[] = [], expires = 0;
let resolving: Promise<typeof cached> | undefined;
async function addresses() {
  if (cached.length && expires > Date.now()) return cached;
  if (!resolving) resolving = resolveAddresses().then(records => {
    const valid = records.filter(r => isIPv4(r.address)).slice(0, 4);
    if (!valid.length) throw Object.assign(new Error('Provider DNS unavailable'), { code: 'ENOTFOUND' });
    cached = valid;
    expires = Date.now() + Math.max(0, Math.min(60, ...valid.map(r => r.ttl))) * 1000;
    return valid;
  }).finally(() => { resolving = undefined; });
  return resolving;
}
async function resolveAddresses(): Promise<typeof cached> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolver.resolve4('api.groq.com', { ttl: true }).catch(async () => {
        // OS lookup remains necessary on hosts which use NSS or block direct DNS.
        const records = await lookup('api.groq.com', { family: 4, all: true });
        return records.map(r => ({ address: r.address, ttl: 5 }));
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Provider DNS timed out'), { code: 'ETIMEOUT' })), 6000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
/** Only the fixed provider host is resolved. TLS still validates its hostname. */
export const companionAddressLookup: LookupFunction = (hostname, options, callback) => {
  if (hostname !== 'api.groq.com') {
    callback(Object.assign(new Error('Unsupported provider host'), { code: 'ENOTFOUND' }), '', 4);
    return;
  }
  void addresses().then(records => {
    if (options.all) callback(null, records.map(r => ({ address: r.address, family: 4 })));
    else callback(null, records[0].address, 4);
  }, error => callback(error, '', 4));
};
// Bounded keep-alive avoids a fresh DNS/TLS handshake for a tool's second call.
export const companionAgent = new https.Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2, lookup: companionAddressLookup });
export function companionConnectionFailure(error: unknown): ApiError {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'ABORT_ERR' || code === 'ETIMEDOUT' || code === 'ETIMEOUT'
    ? new ApiError(504, 'The AI reply timed out. Your message is kept. Please try again.', 'companion_timeout')
    : new ApiError(503, 'Could not reach the AI service. Your message is kept. Please try again.', 'companion_connection');
}
