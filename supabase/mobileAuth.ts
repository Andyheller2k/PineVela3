import crypto from 'node:crypto';
import type { Express, Request, RequestHandler, Response } from 'express';
import { ApiError, UUID, type VerifiedActor } from './db.js';
import { clearAuthCookies, readCookie, sessionCookies, type SupabaseAuth } from './auth.js';
import { googlePublicOrigin, type GoogleSession } from '../googleAuth.js';
import { PLATFORM_TERMS, type TermsAcceptance } from '../legalPolicy.js';
import { validateTermsAcceptance } from './legal.js';
import { mobileGooglePage } from './mobileGooglePage.js';

const opaque = /^[A-Za-z0-9_-]{43}$/;
const verifierPattern = /^[A-Za-z0-9._~-]{43,128}$/;
const flowCookie = 'pv_mobile_flow';
const lifetime = 5 * 60_000;
const capacity = 1000;
type Client = 'android' | 'android-debug';
type Flow = {
  challenge: string; state: string; client: Client; mode: 'login' | 'signup'; provider?: 'google';
  expires: number; ticket?: string; browserBound: boolean;
  identity?: { authUserId: string; sessionId: string };
  session?: GoogleSession; codeHash?: string; codeExpires?: number;
  termsAcceptance?: TermsAcceptance;
};
// API-wide so an ordinary dashboard/media read that rotates this exact session
// can refresh the pending handoff too. Static pages never receive this cookie.
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/' });
const random = () => crypto.randomBytes(32).toString('base64url');
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('base64url');
const failure = () => new ApiError(400, 'This Android sign-in has expired. Start again from the app.', 'mobile_auth_expired');

function exactBody(value: unknown, keys: string[]) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function identity(session: GoogleSession) {
  try {
    const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
    if (UUID.test(claims.sub || '') && UUID.test(claims.session_id || ''))
      return { authUserId: String(claims.sub), sessionId: String(claims.session_id) };
  } catch { /* Only already provider-verified, server-issued cookies reach this hook. */ }
  return undefined;
}
const sameIdentity = (a: Flow['identity'], b: Flow['identity']) => !!a && !!b
  && a.authUserId === b.authUserId && a.sessionId === b.sessionId;
function destination(actor: VerifiedActor) {
  return ({ primary: '/user/dashboard', resident: '/student/dashboard', seller: '/digital-market',
    manager: '/manager/dashboard', staff: '/staff/dashboard', officer: '/field-officer', admin: '/admin/dashboard' } as Record<string, string>)[actor.kind];
}

/** Browser credentials stay with the existing verified Auth implementation.
 * This short-lived, process-local handoff exchanges only a one-use code + S256
 * verifier for the same HttpOnly cookies; it introduces no alternate identity,
 * provider token response, CORS exception, persisted session or RLS bypass.
 * A process restart intentionally invalidates unfinished handoffs. */
export function createMobileAuth(auth: SupabaseAuth) {
  const flows = new Map<string, Flow>(), tickets = new Map<string, string>(), codes = new Map<string, string>();
  function remove(id: string, flow: Flow) {
    if (flow.ticket) tickets.delete(flow.ticket);
    if (flow.codeHash) codes.delete(flow.codeHash);
    flows.delete(id);
    delete flow.session;
  }
  function prune() {
    const now = Date.now();
    for (const [id, flow] of flows) if (flow.expires <= now || flow.codeExpires !== undefined && flow.codeExpires <= now) remove(id, flow);
  }
  function bound(req: Request) {
    prune();
    const id = readCookie(req, flowCookie), flow = opaque.test(id) ? flows.get(id) : undefined;
    return flow?.browserBound && !flow.codeHash ? { id, flow } : undefined;
  }
  // Capture only actual server-issued sessions from existing fresh-login paths.
  // Restoration, refresh, portal switching and merely possessing a browser
  // cookie never establish fresh proof. Later rotations update an already
  // established proof only when the provider session and identity are unchanged.
  const observe: RequestHandler = (req, res, next) => {
    const pending = bound(req);
    if (pending) {
      const route = req.originalUrl.split('?')[0].replace(/\/$/, '');
      const fresh = req.method === 'POST' && [
        '/api/auth/login', '/api/digital-market/login', '/api/auth/verification-team-login',
        '/api/verification-teams/login', '/api/auth/verify-unified', '/api/auth/primary-reentry/verify',
      ].includes(route) || req.method === 'GET' && route === '/api/auth/google/callback';
      res.locals.noteMobileSessionCookies = (session: GoogleSession) => {
        const { id, flow } = pending;
        if (flows.get(id) !== flow || flow.expires <= Date.now() || flow.codeHash || !session.refresh_token) return;
        const verified = identity(session);
        if (!verified || !fresh && !sameIdentity(flow.identity, verified)) return;
        if (fresh) flow.identity = verified;
        flow.session = { access_token: session.access_token, refresh_token: session.refresh_token,
          ...(typeof session.expires_in === 'number' ? { expires_in: session.expires_in } : {}) };
      };
    }
    next();
  };
  const route = (work: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler =>
    (req, res, next) => { Promise.resolve().then(() => work(req, res)).catch(next); };

  function install(app: Express) {
    app.post('/api/auth/mobile/start', route((req, res) => {
      const google = req.body?.provider === 'google';
      const carriesTerms = google && req.body?.mode === 'signup' && Object.hasOwn(req.body, 'termsAcceptance');
      if (!exactBody(req.body, ['challenge', 'state', 'mode', 'client', ...(google ? ['provider'] : []), ...(carriesTerms ? ['termsAcceptance'] : [])])
        || typeof req.body.challenge !== 'string' || typeof req.body.state !== 'string'
        || !opaque.test(req.body.challenge) || !opaque.test(req.body.state)
        || !['login', 'signup'].includes(req.body.mode) || !['android', 'android-debug'].includes(req.body.client))
        throw new ApiError(400, 'Start Android sign-in from the PineVela app.', 'mobile_auth_invalid');
      if (carriesTerms) validateTermsAcceptance(req.body.termsAcceptance);
      const origin = googlePublicOrigin(req);
      prune();
      if (flows.size >= capacity) throw new ApiError(429, 'Android sign-in is busy. Please try again shortly.', 'mobile_auth_busy');
      const id = random(), ticket = random();
      flows.set(id, { challenge: req.body.challenge, state: req.body.state, mode: req.body.mode,
        client: req.body.client, ...(google ? { provider: 'google' as const } : {}),
        ...(carriesTerms ? { termsAcceptance: { accepted: true as const, version: PLATFORM_TERMS.version } } : {}),
        expires: Date.now() + lifetime, ticket, browserBound: false });
      tickets.set(ticket, id);
      res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
      return res.json({ browserUrl: `${origin}/api/auth/mobile/browser?ticket=${ticket}` });
    }));
    app.get('/api/auth/mobile/browser', route((req, res) => {
      prune();
      const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
      const id = opaque.test(ticket) ? tickets.get(ticket) : undefined, flow = id ? flows.get(id) : undefined;
      res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
      if (!id || !flow || flow.ticket !== ticket || flow.browserBound) throw failure();
      // The native-start ticket cannot be used again to replace the bound browser.
      tickets.delete(ticket); delete flow.ticket; flow.browserBound = true;
      const old = bound(req); if (old && old.id !== id) remove(old.id, old.flow);
      res.cookie(flowCookie, id, { ...cookieOptions(), maxAge: Math.max(1, flow.expires - Date.now()) });
      if (flow.provider === 'google' && (flow.mode === 'login' || flow.termsAcceptance))
        return res.redirect(303, '/api/auth/mobile/google');
      return res.redirect(303, `/#/login?mobile=1${flow.mode === 'signup' ? '&mode=register' : ''}${flow.provider === 'google' ? '&native_provider=google' : ''}`);
    }));
    app.get('/api/auth/mobile/google', route((req, res) => {
      const pending = bound(req);
      if (!pending || pending.flow.provider !== 'google' || pending.flow.identity
        || pending.flow.mode === 'signup' && !pending.flow.termsAcceptance) throw failure();
      if (pending.flow.mode === 'signup') validateTermsAcceptance(pending.flow.termsAcceptance);
      const nonce = random();
      res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` });
      return res.type('html').send(mobileGooglePage(nonce, pending.flow.mode, pending.flow.termsAcceptance));
    }));
    app.get('/api/auth/mobile/status', route((req, res) => {
      // There is no CORS allowance. Deny explicit cross-site reads as well so a
      // pending flow cannot become an ambient account or device-presence probe.
      if (req.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'Cross-site request denied.');
      if (req.get('origin')) {
        let allowed = false;
        try { allowed = new URL(req.get('origin')!).origin === googlePublicOrigin(req); } catch { /* deny */ }
        if (!allowed) throw new ApiError(403, 'Cross-site request denied.');
      }
      const pending = bound(req);
      res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
      return res.json(pending ? { active: true, mode: pending.flow.mode, ...(pending.flow.provider ? { provider: pending.flow.provider } : {}), fresh: !!pending.flow.identity && !!pending.flow.session } : { active: false });
    }));
    app.post('/api/auth/mobile/finish', route(async (req, res) => {
      if (!exactBody(req.body, [])) throw new ApiError(400, 'Confirm Android sign-in without account selectors.', 'mobile_auth_invalid');
      const pending = bound(req);
      if (!pending) throw failure();
      const { id, flow } = pending;
      const verified = await auth.authenticate(req, res);
      if (flows.get(id) !== flow || flow.expires <= Date.now() || flow.codeHash) throw failure();
      if (!flow.session || !sameIdentity(flow.identity, verified.actor))
        throw new ApiError(403, 'Sign out and sign in again here before continuing in Android.', 'mobile_auth_fresh_required');
      if (!verified.actor.termsAccepted) throw new ApiError(403, 'Accept the current Terms before continuing in Android.', 'terms_acceptance_required');
      if (!destination(verified.actor)) throw new ApiError(403, 'This account cannot continue in Android.');
      const code = random();
      flow.codeHash = digest(code); flow.codeExpires = Math.min(flow.expires, Date.now() + 60_000);
      codes.set(flow.codeHash, id);
      // Explicitly transfer this freshly issued session. Browser cookies are
      // cleared without revoking the session being handed to Android.
      clearAuthCookies(res); res.clearCookie(flowCookie, cookieOptions());
      res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
      return res.json({ returnUrl: `${flow.client === 'android-debug' ? 'pinevela-debug' : 'pinevela'}://auth/callback?code=${code}&state=${flow.state}` });
    }));
    app.post('/api/auth/mobile/exchange', route(async (req, res) => {
      if (!exactBody(req.body, ['code', 'state', 'verifier']) || typeof req.body.code !== 'string' || typeof req.body.state !== 'string'
        || !opaque.test(req.body.code) || !opaque.test(req.body.state)
        || typeof req.body.verifier !== 'string' || !verifierPattern.test(req.body.verifier)) throw failure();
      prune();
      const hash = digest(req.body.code), id = codes.get(hash), flow = id ? flows.get(id) : undefined;
      if (!id || !flow?.session || !flow.identity || flow.codeHash !== hash || flow.state !== req.body.state
        || !crypto.timingSafeEqual(Buffer.from(digest(req.body.verifier)), Buffer.from(flow.challenge))) throw failure();
      const stored = flow.session, expected = flow.identity;
      // Consume synchronously before provider/database awaits: concurrent requests
      // cannot redeem this code twice. Failed or interrupted exchanges start again.
      remove(id, flow);
      let latest = stored;
      // A provider refresh can issue cookies before the subsequent live binding
      // check finishes. Capture those server-side until *all* checks succeed;
      // a rejected exchange must never install even a refreshed provider cookie.
      const capture = Object.create(res) as Response;
      capture.locals = { noteMobileSessionCookies: (session: GoogleSession) => { latest = session; } };
      capture.set = (() => capture) as Response['set'];
      capture.cookie = (() => capture) as Response['cookie'];
      const proof = Object.create(req) as Request;
      proof.headers = { ...req.headers, cookie: `pv_sb_access=${encodeURIComponent(stored.access_token)}; pv_sb_refresh=${encodeURIComponent(stored.refresh_token)}` };
      {
        const verified = await auth.authenticate(proof, capture);
        if (!sameIdentity(expected, verified.actor)) throw failure();
        if (!verified.actor.termsAccepted) throw new ApiError(403, 'Accept the current Terms before continuing in Android.', 'terms_acceptance_required');
        const redirectTo = destination(verified.actor);
        if (!redirectTo) throw new ApiError(403, 'This account cannot continue in Android.');
        sessionCookies(res, latest);
        return res.json({ ok: true, redirectTo });
      }
    }));
  }
  return { observe, install };
}
