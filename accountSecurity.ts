import crypto from 'node:crypto';
import { credentialWork, WorkPool } from './resourceSecurity.js';

const DIGEST = /^[a-f0-9]{64}$/i;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const normalizeEmail = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

function digestPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

const passwordWorkers = new WorkPool(2, 8);
function deriveAsync(digest: string, salt: string): Promise<string> {
  return passwordWorkers.run(() => new Promise((resolve, reject) => {
    crypto.scrypt(digest, salt, 32, SCRYPT_OPTIONS, (error, derived) => error ? reject(error) : resolve(derived.toString('hex')));
  }));
}
export async function hashCredentialAsync(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex'), digest = digestPassword(password);
  const derived = await credentialWork(`hash:${digest}:${salt}`, () => deriveAsync(digest, salt));
  return `scrypt-sha256$${salt}$${derived}`;
}
export async function verifyCredentialAsync(password: string, stored: unknown): Promise<boolean> {
  if (typeof password !== 'string' || !password || typeof stored !== 'string' || !stored || stored.startsWith('!LOCKED_')) return false;
  if (!stored.startsWith('scrypt-sha256$')) return false;
  const [, salt, expected] = stored.split('$');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !DIGEST.test(expected || '')) return false;
  const digest = digestPassword(password);
  return equal(await credentialWork(`verify-async:${digest}:${stored}`, () => deriveAsync(digest, salt)), expected);
}
