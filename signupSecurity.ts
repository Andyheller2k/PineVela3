import crypto from 'node:crypto';
import { hashCredential, hashCredentialAsync, normalizeEmail, verifyCredential, verifyCredentialAsync } from './accountSecurity.js';
import { signupChallenge, SignupError } from './supabaseSignup.js';

export const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
export type PendingSignup = { id: string; name: string; email: string; passwordHash: string; supabaseUserId?: string; providerUrl?: string; mode?: 'supabase' | 'development'; codeHash?: string; expiresAt: number };
type Limit = { key: string; count: number; expiresAt: number; lastAt: number };
export type SignupState = { pending: PendingSignup[]; limits: Limit[] };

export function signupInput(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  const password = body?.password;
  if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' || password.length < 6 || password.length > 1024) {
    throw new SignupError(400, 'Enter your name, a valid email, and a password of at least 6 characters.');
  }
  return { name, email, password };
}

// Stored alongside the private operational database; limits and pending password hashes survive restart.
export class SignupGuard {
  private busy = new Set<string>();
  constructor(public state: SignupState, private persist: () => void, private now = Date.now) { this.cleanup(); }
  cleanup() {
    const now = this.now();
    const pending = this.state.pending.filter(p => p.expiresAt > now);
    const limits = this.state.limits.filter(p => p.expiresAt > now);
    if (pending.length !== this.state.pending.length || limits.length !== this.state.limits.length) {
      this.state.pending = pending; this.state.limits = limits; this.persist();
    }
  }
  async exclusive<T>(email: string, work: () => Promise<T>): Promise<T> {
    if (this.busy.has(email)) throw new SignupError(429, 'A verification request is already in progress. Please wait.');
    this.busy.add(email);
    try { return await work(); } finally { this.busy.delete(email); }
  }
  private limit(scope: string, value: string, max: number, cooldown = 0) {
    this.cleanup();
    const key = crypto.createHash('sha256').update(`${scope}:${value}`).digest('hex');
    let bucket = this.state.limits.find(l => l.key === key);
    const now = this.now();
    if (bucket && (bucket.count >= max || now - bucket.lastAt < cooldown)) throw new SignupError(429, 'Too many verification attempts. Please wait before trying again.');
    if (!bucket) {
      if (this.state.limits.length >= 4000) throw new SignupError(429, 'Email verification is busy. Please try again later.');
      bucket = { key, count: 0, expiresAt: now + SIGNUP_WINDOW_MS, lastAt: 0 };
      this.state.limits.push(bucket);
    }
    bucket.count++; bucket.lastAt = now; this.persist();
  }
  reserveSend(email: string, ip: string) {
    this.limit('send-ip', ip, 10);
    this.limit('send-email', email, 3, 60000);
    if (this.state.pending.length >= 1000 && !this.state.pending.some(p => p.email === email)) throw new SignupError(429, 'Email verification is busy. Please try again later.');
  }
  remember(input: { name: string; email: string; password: string }, supabaseUserId: string, providerUrl: string, passwordHash = hashCredential(input.password)) {
    const pending: PendingSignup = { id: crypto.randomUUID(), name: input.name, email: input.email, passwordHash, supabaseUserId, providerUrl, expiresAt: this.now() + SIGNUP_WINDOW_MS };
    this.state.pending = this.state.pending.filter(p => p.email !== input.email);
    this.state.pending.push(pending); this.persist();
    return pending;
  }
  async rememberAsync(input: { name: string; email: string; password: string }, supabaseUserId: string, providerUrl: string) {
    return this.remember(input, supabaseUserId, providerUrl, await hashCredentialAsync(input.password));
  }
  async rememberDevelopmentAsync(input: { name: string; email: string; password: string }) {
    return this.rememberDevelopment(input, await hashCredentialAsync(input.password));
  }
  rememberDevelopment(input: { name: string; email: string; password: string }, passwordHash?: string) {
    const pending = this.remember(input, '', '', passwordHash);
    delete pending.supabaseUserId; delete pending.providerUrl;
    pending.mode = 'development';
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    pending.codeHash = crypto.createHash('sha256').update(`${pending.id}:${code}`).digest('hex');
    this.persist();
    return { pending, code };
  }
  confirmDevelopment(pending: PendingSignup, code: string) {
    const expected = pending.codeHash;
    const actual = crypto.createHash('sha256').update(`${pending.id}:${code}`).digest('hex');
    if (!expected || expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) throw new SignupError(400, 'Invalid development code.');
  }
  private verificationCandidate(body: any, ip: string) {
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email || email.length > 254) throw new SignupError(400, 'Email and verification code are required.');
    this.limit('verify-ip', ip, 50);
    this.limit('verify-email', email, 5);
    const pending = this.state.pending.find(p => p.email === email);
    if (!pending || typeof body.signupId !== 'string' || pending.id !== body.signupId ||
        typeof body.code !== 'string') {
      throw new SignupError(400, 'Invalid or expired registration. Check your code and registration password.');
    }
    return pending;
  }
  private needsPassword(body: any, pending: PendingSignup) {
    if (pending.mode === 'development') {
      if (!/^\d{6}$/.test(body.code)) throw new SignupError(400, 'Check your development code and registration password.');
      return true;
    }
    return 'token' in signupChallenge(body.code, pending.providerUrl || '');
  }
  verification(body: any, ip: string) {
    const pending = this.verificationCandidate(body, ip);
    if (this.needsPassword(body, pending) && !verifyCredential(body.password, pending.passwordHash)) throw new SignupError(400, 'Confirm the password chosen during registration.');
    return pending;
  }
  async verificationAsync(body: any, ip: string) {
    const pending = this.verificationCandidate(body, ip);
    if (this.needsPassword(body, pending) && !await verifyCredentialAsync(body.password, pending.passwordHash)) throw new SignupError(400, 'Confirm the password chosen during registration.');
    return pending;
  }
  forget(email: string) {
    this.state.pending = this.state.pending.filter(p => p.email !== email); this.persist();
  }
}
