import crypto from 'node:crypto';

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RAW_SESSION_FIELDS = ['token', 'merchantToken', 'sessionToken'];

export function sessionLifetimeMs(): number {
  const seconds = process.env.PINEVELA_SESSION_TTL_SECONDS;
  if (seconds === undefined || seconds === '') return 24 * 60 * 60 * 1000;
  const value = Number(seconds);
  if (!Number.isInteger(value) || value < 60 || value * 1000 > SESSION_MAX_AGE_MS) throw new Error('PINEVELA_SESSION_TTL_SECONDS must be an integer from 60 to 604800.');
  return value * 1000;
}

export function createSessionToken(prefix = 'pv'): string {
  return `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
}

export function tokenDigest(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function clearRecordSession(record: any): void {
  for (const target of [record, record?.user]) {
    if (!target || typeof target !== 'object') continue;
    delete target.session;
    for (const key of RAW_SESSION_FIELDS) delete target[key];
  }
}

/** Raw credentials live only in the issuing response/request, never in account records. */
export function setRecordSession(record: any, token: string, now = Date.now(), lifetime = sessionLifetimeMs()): void {
  if (!record || typeof token !== 'string' || !token || !Number.isFinite(now) || !Number.isInteger(lifetime) || lifetime < 1 || lifetime > SESSION_MAX_AGE_MS) throw new Error('Invalid session issuance.');
  clearRecordSession(record);
  const session = { tokenHash: tokenDigest(token), issuedAt: now, expiresAt: now + lifetime };
  record.session = session;
  if (record.user && typeof record.user === 'object') record.user.session = { ...session };
}

export function sessionHashMatches(record: any, token: unknown): boolean {
  if (!record || typeof token !== 'string' || !token || token.length > 512) return false;
  const session = record.session || record.user?.session;
  if (!session || !/^[a-f0-9]{64}$/.test(session.tokenHash)) return false;
  return crypto.timingSafeEqual(Buffer.from(session.tokenHash, 'hex'), Buffer.from(tokenDigest(token), 'hex'));
}

export function sessionMatches(record: any, token: unknown, now = Date.now()): boolean {
  const session = record?.session || record?.user?.session;
  return Boolean(session && Number.isFinite(session.issuedAt) && Number.isFinite(session.expiresAt) &&
    session.issuedAt <= now && session.expiresAt > now && session.expiresAt > session.issuedAt &&
    session.expiresAt - session.issuedAt <= SESSION_MAX_AGE_MS && sessionHashMatches(record, token));
}

/** Do not convert indefinite historical bearer tokens into new valid sessions. */
export function removeRawSessions(value: any, seen = new Set<any>()): boolean {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  let changed = false;
  if (!Array.isArray(value)) for (const key of RAW_SESSION_FIELDS) {
    if (Object.hasOwn(value, key)) { delete value[key]; changed = true; }
  }
  for (const child of Object.values(value)) changed = removeRawSessions(child, seen) || changed;
  return changed;
}

export function revokeMatchingSessions(roots: any[], token: string): number {
  let count = 0;
  const seen = new Set<any>();
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (sessionHashMatches(value, token)) { clearRecordSession(value); count++; }
    Object.values(value).forEach(visit);
  };
  roots.forEach(visit);
  return count;
}

export function requestSessionToken(req: any): string {
  const authorization = req.headers.authorization;
  if (authorization !== undefined) {
    const match = /^Bearer ([^\s]+)$/i.exec(String(authorization));
    return match?.[1] || '';
  }
  const matches = String(req.headers.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith('pv_auth_token='));
  if (matches.length !== 1) return '';
  try { return decodeURIComponent(matches[0].slice('pv_auth_token='.length)); } catch { return ''; }
}

export function cookieSessionRequest(req: any): boolean { return req.headers['x-pinevela-session'] === 'cookie'; }

export function setSessionCookie(res: any, token: string): void {
  res.set('Cache-Control', 'private, no-store');
  res.cookie('pv_auth_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: sessionLifetimeMs() });
}

export function clearSessionCookie(res: any): void {
  res.set('Cache-Control', 'private, no-store');
  res.clearCookie('pv_auth_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
}

/** Cookie-authenticated writes need an explicit same-origin browser signal. */
export function sessionOriginGuard(req: any, res: any, next: any): any {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  let validOrigin = false;
  if (origin) {
    try {
      const url = new URL(String(origin));
      const configured = process.env.PINEVELA_PUBLIC_ORIGIN;
      validOrigin = configured ? url.origin === new URL(configured).origin : url.host === req.get('host') && ['http:', 'https:'].includes(url.protocol);
    } catch { validOrigin = false; }
  }
  const cookieOnly = !req.headers.authorization && String(req.headers.cookie || '').includes('pv_auth_token=');
  if (site === 'cross-site' || origin && !validOrigin || cookieOnly && !validOrigin && site !== 'same-origin') return res.status(403).json({ error: 'A same-origin request is required.' });
  next();
}
