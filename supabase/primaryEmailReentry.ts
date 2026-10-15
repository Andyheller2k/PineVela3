import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError } from './db.js';
import { verifiedClaims, sessionCookies, type SupabaseAuth } from './auth.js';
import { bodyFields } from './adminSettings.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { signupProviderConfig, requireConfirmationSettings } from '../supabaseSignup.js';

export function primaryReentryEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
    throw new ApiError(400, 'Enter your verified primary account email.');
  return value.trim().toLowerCase();
}

/** Never navigate to submitted links or accept recovery/signup/provider tokens. */
export function primaryReentryChallenge(value: unknown, providerUrl: string) {
  if (typeof value !== 'string' || value.length > 4096) throw new ApiError(400, 'Enter your email code or unopened sign-in link.');
  const code = value.trim();
  if (/^\d{6,10}$/.test(code)) return { token: code, type: 'email' as const };
  let link: URL;
  try { link = new URL(code); } catch { throw new ApiError(400, 'Enter a valid email code or sign-in link.'); }
  const token = link.searchParams.get('token') || link.searchParams.get('token_hash'), type = link.searchParams.get('type');
  if (link.origin !== providerUrl || link.pathname !== '/auth/v1/verify' || link.username || link.password || link.hash ||
    !['email', 'magiclink'].includes(type || '') || !/^[a-f0-9]{56,64}$/.test(token || '') ||
    link.searchParams.getAll('type').length !== 1 || link.searchParams.getAll('token').length + link.searchParams.getAll('token_hash').length !== 1)
    throw new ApiError(400, 'Use the sign-in email from PineVela’s configured provider.');
  return { token_hash: token!, type: type as 'email' | 'magiclink' };
}

/** Mailbox is a delivery selector only. It never authorizes re-entry. */
export async function emailReentryAvailable(client: PoolClient, email: string) {
  return Boolean((await client.query(`select 1 from public.account_contexts c join auth.users u on u.id=c.auth_user_id
    join public.profiles p on p.id=u.id where lower(u.email)=$1 and c.kind='primary' and c.status='closed'
      and c.primary_owner_id is null and p.primary_owner_id is null
      and private.primary_reentry_identity_supported(u.id,'verified-email-reentry')
      and not coalesce((private.account_access(c.id)->>'banned')::boolean,true)
      and exists(select 1 from private.primary_wipe_executions e where c.id=any(e.context_ids) and e.state='completed')`, [email])).rowCount);
}

export function installPrimaryEmailReentry(app: Express, auth: SupabaseAuth) {
  const budgets = new AttemptBudgets();
  const route = (work: (req: any, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req, res).catch(next); };
  const reserve = (email: string, verification = false) => budgets.reserve([
    { scope: verification ? 'primary-reentry-verify-email' : 'primary-reentry-send-email', identity: crypto.createHash('sha256').update(email).digest('hex'), maximum: verification ? 10 : 3, windowMs: 15 * 60_000 },
    { scope: 'primary-reentry-global', identity: 'all', maximum: 60, windowMs: 60_000 },
  ]);
  app.post('/api/auth/primary-reentry', route(async (req, res) => {
    bodyFields(req.body, ['email']);
    const email = primaryReentryEmail(req.body.email); reserve(email);
    const available = await auth.db.availableSystem(client => emailReentryAvailable(client, email));
    if (available) {
      requireConfirmationSettings(await auth.provider('/settings'));
      // Existing identities only; an email request cannot create an Auth user.
      await auth.provider('/otp', { email, create_user: false });
    }
    res.status(202).json({ success: true, message: 'If this email has an eligible closed primary account, a sign-in email has been requested. Copy its code or unopened link here.' });
  }));
  app.post('/api/auth/primary-reentry/verify', route(async (req, res) => {
    bodyFields(req.body, ['email', 'code']);
    const email = primaryReentryEmail(req.body.email), proof = primaryReentryChallenge(req.body.code, signupProviderConfig().url);
    reserve(email, true);
    const session = await auth.provider('/verify', 'token' in proof ? { email, ...proof } : proof);
    try {
      const person = await auth.provider('/user', undefined, session.access_token);
      verifiedClaims(session.access_token, person);
      if (String(person.email).toLowerCase() !== email) throw new ApiError(400, 'This confirmation does not match the requested account email.');
      // Explicit email proof may reopen only this subject's saved primary portal.
      // Never pick its admin, resident, seller or staff portal by default.
      const actor = await auth.bind(session, 'primary', undefined, false, true);
      const user = await auth.projection(actor);
      sessionCookies(res, session);
      res.json({ success: true, user });
    } catch (error) {
      await auth.provider('/logout?scope=local', {}, session.access_token).catch(() => undefined);
      throw error;
    }
  }));
}
