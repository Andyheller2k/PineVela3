import type { Request } from 'express';
import { accountData, accountId } from './accountSecurity.js';

// Opt-in, source-server-only development mode. A built server cannot enable this.
export function developmentSignupRuntime(env = process.env, entry = process.argv[1] || '') {
  return env.PINEVELA_DEV_SIGNUP_CODES === 'true' &&
    (!env.NODE_ENV || env.NODE_ENV === 'development') && /(?:^|[/\\])server\.ts$/.test(entry);
}
export function developmentSignupRequest(req: Pick<Request, 'headers' | 'socket' | 'hostname'>) {
  if (!developmentSignupRuntime()) return false;
  const address = req.socket.remoteAddress;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '') &&
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(req.hostname) &&
    !['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip'].some(key => req.headers[key]);
}
export function isDevelopmentSignup(entry: any, users: any[] = []) {
  const queue = [entry]; const seen = new Set<any>();
  while (queue.length) {
    const current = queue.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const data = accountData(current);
    if (data?.emailVerificationProvider === 'development' || current.emailVerificationProvider === 'development') return true;
    const parents = [data?.parentUserId, current.parentUserId, data?.userId, current.userId].filter(Boolean).map(String);
    for (const parent of users) if (parents.includes(accountId(parent)) && !seen.has(parent)) queue.push(parent);
  }
  return false;
}
