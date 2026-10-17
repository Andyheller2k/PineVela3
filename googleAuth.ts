import { validateLoginContinuation } from './publicContinuation.js';
import crypto from 'node:crypto';
import type { Express, Request } from 'express';
import { normalizeEmail } from './accountSecurity.js';
import { signupProviderConfig } from './supabaseSignup.js';

type Mode = 'login' | 'signup';
export type GoogleIdentity = { id: string; email: string; name: string; verifiedAt: string };
export type GoogleSession = { access_token: string; refresh_token: string; expires_in?: number };
class GoogleError extends Error { constructor(public reason: string) { super(reason); } }

/** Supabase can return an exchange/configuration error after Google consent succeeds. */
export function googleCallbackFailure(query: Record<string, unknown>): string | undefined {
  if (!query.error && !query.error_code) return undefined;
  if (query.error_code === 'signup_disabled') return 'signup_disabled';
  if (query.error_code === 'user_banned') return 'blocked';
  if (query.error_code === 'provider_email_needs_verification') return 'email_unverified';
  if (typeof query.error_description === 'string' && query.error_description.startsWith('Unable to exchange external code')) return 'provider_exchange';
  if (query.error === 'access_denied' && !query.error_code) return 'cancelled';
  return 'provider_failed';
}

/** Callback URLs may contain provider authorization codes even inside error descriptions. */
export function googleRequestLogUrl(url: string): string {
  return /^\/api\/auth\/google\/callback\/?(?:\?|$)/i.test(url) ? url.split('?')[0] : url;
}

// This input comes ONLY from Supabase /user after a server-side PKCE exchange.
export function googleIdentity(user: any): GoogleIdentity {
  const google = user?.identities?.find((identity: any) => identity.provider === 'google');
  const email = normalizeEmail(user?.email);
  if (!user?.id || user.is_anonymous || !google || google.identity_data?.email_verified !== true ||
      normalizeEmail(google.identity_data?.email) !== email || !email ||
      !Number.isFinite(Date.parse(user.email_confirmed_at))) throw new GoogleError('failed');
  return { id: String(user.id), email, name: String(google.identity_data?.full_name || google.identity_data?.name || email.split('@')[0]).slice(0, 120), verifiedAt: user.email_confirmed_at };
}

export function googlePublicOrigin(req: Request) {
  const configured = process.env.PINEVELA_PUBLIC_ORIGIN;
  if (configured) {
    const url = new URL(configured);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.protocol !== 'https:') throw new Error('Invalid public origin');
    return url.origin;
  }
  // A production build can also be tested locally. Trust only the actual Host and
  // socket peer here; proxy headers must never enable a loopback callback remotely.
  const host = req.get('host'), peer = req.socket.remoteAddress;
  const url = new URL(`http://${host}`);
  if (!host || url.host !== host.toLowerCase() || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer || '')) throw new Error('Set public origin');
  return url.origin;
}

async function providerRequest(config: ReturnType<typeof signupProviderConfig>, route: string, body?: any, token?: string) {
  const response = await fetch(`${config.url}/auth/v1${route}`, {
    method: body ? 'POST' : 'GET', headers: { apikey: config.key, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store',
  });
  if (!response.ok) throw new GoogleError('failed');
  return response.json();
}

export function installGoogleAuth(app: Express, complete: (identity: GoogleIdentity, mode: Mode, session: GoogleSession) => Promise<string | {token:string;redirectTo:'/admin/dashboard'|'/field-officer'|'/manager/dashboard'|'/customer-service'}>, issueCookie: (res: any, token: string, session?: GoogleSession) => void) {
  const flows = new Map<string, { verifier: string; mode: Mode; origin: string; config: ReturnType<typeof signupProviderConfig>; expires: number; returnTo?: string }>();
  const cookieName = 'pv_google_flow';
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/auth/google/callback' };
  app.post('/api/auth/google/start', async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (!['login', 'signup'].includes(req.body?.mode)) return res.status(400).json({ error: 'Choose Login or Sign Up.' });
    try {
      const origin = googlePublicOrigin(req), config = signupProviderConfig();
      const settings = await providerRequest(config, '/settings');
      if (settings?.external?.google !== true || req.body.mode === 'signup' && settings.disable_signup !== false) throw new Error('Google unavailable');
      for (const [state, flow] of flows) if (flow.expires <= Date.now()) flows.delete(state);
      if (flows.size >= 1000) return res.status(429).json({ error: 'Please wait before trying Google sign-in again.' });
      const state = crypto.randomBytes(32).toString('base64url'), verifier = crypto.randomBytes(48).toString('base64url');
      flows.set(state, { verifier, mode: req.body.mode, origin, config, returnTo: validateLoginContinuation(req.body.returnTo), expires: Date.now() + 5 * 60_000 });
      const url = new URL(`${config.url}/auth/v1/authorize`);
      url.searchParams.set('provider', 'google');
      url.searchParams.set('scopes', 'openid email profile');
      url.searchParams.set('redirect_to', `${origin}/api/auth/google/callback?state=${state}`);
      url.searchParams.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
      url.searchParams.set('code_challenge_method', 's256');
      res.cookie(cookieName, state, { ...cookieOptions, maxAge: 5 * 60_000 });
      return res.json({ url: url.toString() });
    } catch { return res.status(503).json({ error: 'Google sign-in is not available yet. Please use email and password.' }); }
  });
  app.get('/api/auth/google/callback', async (req, res) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookie = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const flow = flows.get(state);
    if (!flow || cookie !== state || flow.expires <= Date.now()) return res.redirect(303, '/#/login?google_error=expired');
    flows.delete(state);
    res.clearCookie(cookieName, cookieOptions);
    try {
      const providerFailure = googleCallbackFailure(req.query);
      if (providerFailure) {
        // Log only a fixed category. Never log provider descriptions, codes, state or tokens.
        console.warn(`[Google Auth] Callback rejected: ${providerFailure}.`);
        throw new GoogleError(providerFailure);
      }
      const code = req.query.code;
      if (typeof code !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(code)) throw new GoogleError('failed');
      const session = await providerRequest(flow.config, '/token?grant_type=pkce', { auth_code: code, code_verifier: flow.verifier });
      if (typeof session.access_token !== 'string' || !session.access_token) throw new GoogleError('failed');
      const identity = googleIdentity(await providerRequest(flow.config, '/user', undefined, session.access_token));
      const completed = await complete(identity, flow.mode, session);
      const token=typeof completed==='string'?completed:completed.token;
      const destination=typeof completed==='object'&&['/admin/dashboard','/field-officer','/manager/dashboard','/customer-service'].includes(completed.redirectTo)?completed.redirectTo:'/user/dashboard';
      issueCookie(res, token, session);
      return res.redirect(303, `${flow.origin}/#${flow.returnTo || destination}`);
    } catch (error) {
      const reason = error instanceof GoogleError ? error.reason : 'failed';
      return res.redirect(303, `${flow.origin}/#/login?${flow.mode === 'signup' ? 'mode=register&' : ''}google_error=${reason}${flow.returnTo ? `&next=${encodeURIComponent(flow.returnTo)}` : ''}`);
    }
  });
}

export function googleAccountBlocked(): never { throw new GoogleError('blocked'); }
export function googleAccountMissing(): never { throw new GoogleError('missing'); }
export function googlePrimaryClosed(): never { throw new GoogleError('primary_closed'); }
