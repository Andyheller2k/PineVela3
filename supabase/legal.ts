import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { PLATFORM_TERMS } from '../legalPolicy.js';
import { ApiError, type VerifiedActor } from './db.js';
import type { AuthRequest, SupabaseAuth } from './auth.js';

export function validateTermsAcceptance(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Object.hasOwn(value,'accepted') || !Object.hasOwn(value,'version')
    || Object.keys(value).some(key => !['accepted', 'version'].includes(key))
    || (value as any).accepted !== true)
    throw new ApiError(400, 'Read and accept the Terms of service to continue.', 'terms_acceptance_required');
  if ((value as any).version !== PLATFORM_TERMS.version)
    throw new ApiError(409, 'The Terms of service changed. Reload and read the current version before accepting.', 'terms_version_changed');
}

export function termsRequired(): ApiError {
  return new ApiError(403, 'Read and accept the Terms of service to continue.', 'terms_acceptance_required');
}

/** Account access, preferences, support and closure remain available without
 * entering the product. Public routes are unaffected. Paths come from Express,
 * never from a body field or a caller-supplied identity. */
export function termsAccessExempt(method: string, path: string): boolean {
  if (['/api/auth/me', '/api/auth/account-access', '/api/auth/maintenance-notice', '/api/auth/appearance', '/api/legal/status', '/api/legal/accept'].includes(path)) return true;
  if (/^\/api\/support(?:\/|$)/.test(path)) return true;
  return method === 'POST' && ['/api/users/delete-registered-account', '/api/student/delete-room'].includes(path);
}

export async function currentTermsStatus(c: PoolClient, a: VerifiedActor) {
  const row = (await c.query(`select accepted_at from private.legal_acceptances
    where auth_user_id=$1 and purpose='platform_access' and resource_key=''
      and document_key=$2 and document_version=$3 and document_sha256=$4`,
  [a.authUserId, PLATFORM_TERMS.key, PLATFORM_TERMS.version, PLATFORM_TERMS.sha256])).rows[0];
  return { accepted: Boolean(row), acceptedAt: row?.accepted_at ?? null, document: PLATFORM_TERMS };
}

/** Call only in an authorized transaction. No browser-supplied identity,
 * resource, timestamp, source, document hash or document URL is accepted. */
export async function recordTermsAcceptance(c: PoolClient, a: VerifiedActor, value: unknown,
  source: 'email_signup' | 'google_signup' | 'account_gate' | 'merchant_application', resourceKey = '') {
  validateTermsAcceptance(value);
  const purpose = source === 'merchant_application' ? 'merchant_application' : 'platform_access';
  if ((purpose === 'platform_access' && resourceKey !== '') || (purpose === 'merchant_application' && !resourceKey)) throw new Error('Invalid server-selected acceptance resource.');
  await c.query(`insert into private.legal_acceptances(auth_user_id,context_id,session_id,purpose,resource_key,
      document_key,document_version,document_sha256,source)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict(auth_user_id,purpose,resource_key,document_key,document_version) do nothing`,
  [a.authUserId, a.contextId, a.sessionId, purpose, resourceKey, PLATFORM_TERMS.key, PLATFORM_TERMS.version, PLATFORM_TERMS.sha256, source]);
}

export function installLegal(app: Express, auth: SupabaseAuth) {
  const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler =>
    (req, res, next) => { work(req as AuthRequest, res).catch(next); };
  app.get('/api/legal/status', auth.require(), route(async (req, res) => {
    res.json(await auth.db.authorizedRead(req.actor, [req.actor.kind], c => currentTermsStatus(c, req.actor)));
  }));
  app.post('/api/legal/accept', auth.require(), route(async (req, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, 'termsAcceptance'))
      throw new ApiError(400, 'Supply only your Terms acceptance.');
    await auth.db.authorizedSystem(req.actor, [req.actor.kind], c => recordTermsAcceptance(c, req.actor, req.body.termsAcceptance, 'account_gate'));
    res.json(await auth.projection(req.actor));
  }));
}
