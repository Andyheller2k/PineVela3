import crypto from 'node:crypto';
import type { Express, Request, RequestHandler, Response } from 'express';
import { googleIdentity, type GoogleSession } from '../googleAuth.js';
import { PLATFORM_TERMS, type TermsAcceptance } from '../legalPolicy.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { sessionCookies, verifiedClaims, type SupabaseAuth } from './auth.js';
import { ApiError, type VerifiedActor } from './db.js';
import { recordTermsAcceptance, validateTermsAcceptance } from './legal.js';
import { maintenanceError } from './platformMaintenance.js';

const webClientId = '545083067226-n5b90t9d6087bclurtr1n1qf0ck3ot96.apps.googleusercontent.com';
const clientIdPattern = /^\d{6,30}-[A-Za-z0-9_-]{10,150}\.apps\.googleusercontent\.com$/;
const opaque = /^[A-Za-z0-9_-]{43}$/;
const verifierPattern = /^[A-Za-z0-9._~-]{43,128}$/;
const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const lifetime = 5 * 60_000;
const capacity = 1000;
type Flow = {
  challenge: string; nonce: string; serverClientId: string; mode: 'login' | 'signup';
  expires: number; termsAcceptance?: TermsAcceptance;
};
const random = () => crypto.randomBytes(32).toString('base64url');
const digest = (value: string, encoding: 'base64url' | 'hex') => crypto.createHash('sha256').update(value).digest(encoding);
const expired = () => new ApiError(400, 'This Google sign-in has expired. Start again from the app.', 'native_google_expired');
const invalid = () => new ApiError(400, 'Start Google sign-in from the PineVela app.', 'native_google_invalid');
const unavailable = () => new ApiError(503, 'Google sign-in is temporarily unavailable. Please try again.', 'native_google_unavailable');
function exactBody(value: unknown, fields: string[]) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
}
function destination(actor: VerifiedActor, customerService: boolean) {
  if (actor.kind === 'primary' && customerService) return '/customer-service';
  return ({ primary: '/user/dashboard', resident: '/student/dashboard', seller: '/digital-market',
    manager: '/manager/dashboard', staff: '/staff/dashboard', officer: '/field-officer', admin: '/admin/dashboard' } as Record<string, string>)[actor.kind];
}

/** Credential Manager keeps Google's token in Java. Only the server exchanges
 * it with Supabase, binds the live account and issues existing HttpOnly cookies.
 * Neither the Google token, raw nonce nor Supabase tokens are returned to JS.
 * Process restart invalidates unfinished flows; no identity is caller-selected. */
export function createNativeGoogleAuth(auth: SupabaseAuth) {
  const flows = new Map<string, Flow>();
  const budgets = new AttemptBudgets(() => Date.now());
  function prune() {
    for (const [id, flow] of flows) if (flow.expires <= Date.now()) flows.delete(id);
  }
  const route = (work: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    Promise.resolve().then(() => {
      // Both entry points share the budget. Bodies, tokens, nonces and raw IPs
      // never become budget keys; the existing budget hashes fixed-scope IDs.
      budgets.reserve([
        { scope: 'native-google-ip', identity: req.ip || req.socket.remoteAddress || 'unknown', maximum: 20, windowMs: 60_000 },
        { scope: 'native-google-global', identity: 'all', maximum: 200, windowMs: 60_000 },
      ]);
      return work(req, res);
    }).catch(next);
  };
  function install(app: Express) {
    app.post('/api/auth/mobile/google/native/start', route(async (req, res) => {
      const signup = req.body?.mode === 'signup';
      if (!exactBody(req.body, ['mode', 'client', 'challenge', ...(signup ? ['termsAcceptance'] : [])])
        || !['login', 'signup'].includes(req.body.mode) || !['android', 'android-debug'].includes(req.body.client)
        || typeof req.body.challenge !== 'string' || !opaque.test(req.body.challenge)) throw invalid();
      if (signup) validateTermsAcceptance(req.body.termsAcceptance);
      const serverClientId = process.env.GOOGLE_WEB_CLIENT_ID?.trim() || webClientId;
      if (!clientIdPattern.test(serverClientId)) throw unavailable();
      prune();
      if (flows.size >= capacity) throw new ApiError(429, 'Google sign-in is busy. Please try again shortly.', 'native_google_busy');
      const flowId = random(), flow: Flow = { challenge: req.body.challenge, nonce: random(), serverClientId,
        mode: req.body.mode, expires: Date.now() + lifetime,
        ...(signup ? { termsAcceptance: { accepted: true, version: PLATFORM_TERMS.version } } : {}) };
      // Reserve capacity synchronously before provider/database awaits.
      flows.set(flowId, flow);
      try {
        const settings = await auth.provider('/settings');
        if (settings?.external?.google !== true || signup && settings.disable_signup !== false) throw unavailable();
        if (signup && !await auth.db.system(async c => (await c.query('select private.platform_available() as available')).rows[0].available))
          throw maintenanceError();
        if (flow.expires <= Date.now()) throw expired();
        return res.json({ flowId, nonce: digest(flow.nonce, 'hex'), serverClientId, expiresAt: new Date(flow.expires).toISOString() });
      } catch (error) { flows.delete(flowId); throw error; }
    }));
    app.post('/api/auth/mobile/google/native/complete', route(async (req, res) => {
      if (!exactBody(req.body, ['flowId', 'verifier', 'idToken']) || typeof req.body.flowId !== 'string' || !opaque.test(req.body.flowId)
        || typeof req.body.verifier !== 'string' || !verifierPattern.test(req.body.verifier)
        || typeof req.body.idToken !== 'string' || req.body.idToken.length > 20 * 1024 || !jwtPattern.test(req.body.idToken)) throw invalid();
      prune();
      const flow = flows.get(req.body.flowId);
      if (!flow || !crypto.timingSafeEqual(Buffer.from(digest(req.body.verifier, 'base64url')), Buffer.from(flow.challenge))) throw expired();
      // One attempt only, synchronously consumed before any exchange or DB work.
      flows.delete(req.body.flowId);
      if (flow.mode === 'signup') validateTermsAcceptance(flow.termsAcceptance);
      // These untrusted claims can only reject a wrong audience/nonce. Supabase
      // still verifies Google's signature, issuer, expiry, audience and nonce;
      // no parsed client claim authorizes a user or selects an app account.
      let claims: any;
      try { claims = JSON.parse(Buffer.from(req.body.idToken.split('.')[1], 'base64url').toString()); } catch { throw invalid(); }
      if (claims?.aud !== flow.serverClientId || claims?.nonce !== digest(flow.nonce, 'hex')) throw invalid();
      let session: GoogleSession | undefined;
      try {
        session = await auth.provider('/token?grant_type=id_token', { provider: 'google', id_token: req.body.idToken, nonce: flow.nonce });
        if (!session || typeof session.access_token !== 'string' || !session.access_token || session.access_token.length > 12000
          || typeof session.refresh_token !== 'string' || !session.refresh_token || session.refresh_token.length > 2048)
          throw new ApiError(401, 'Google did not return a complete verified session.', 'native_google_invalid');
        const user = await auth.provider('/user', undefined, session.access_token);
        let identity: ReturnType<typeof googleIdentity>;
        try { identity = googleIdentity(user); } catch { throw new ApiError(401, 'A verified Google account is required.', 'native_google_invalid'); }
        if (verifiedClaims(session.access_token, user).authUserId !== identity.id) throw new ApiError(401, 'Google identity does not match.', 'native_google_invalid');
        const actor = await auth.bind(session, undefined, undefined, flow.mode === 'signup');
        if (actor.authUserId !== identity.id) throw new ApiError(401, 'Google identity does not match.', 'native_google_invalid');
        if (flow.mode === 'signup') await auth.db.authorizedSystem(actor, [actor.kind], c => recordTermsAcceptance(c, actor, flow.termsAcceptance, 'google_signup'));
        // This actual projection rechecks live account availability, maintenance
        // and RLS before cookies are issued, including returning login users.
        const projection = await auth.projection(actor), redirectTo = destination(actor, !!projection.customerService);
        if (!redirectTo) throw new ApiError(403, 'This account cannot continue in Android.');
        sessionCookies(res, session);
        return res.json({ authenticated: true, redirectTo });
      } catch (error) {
        if (typeof session?.access_token === 'string' && session.access_token)
          await auth.provider('/logout?scope=local', {}, session.access_token).catch(() => undefined);
        throw error;
      }
    }));
  }
  return { install };
}
