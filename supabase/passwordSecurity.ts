import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor, type SupabaseDatabase } from './db.js';
import { verifiedClaims, type SupabaseAuth, type AuthRequest } from './auth.js';
import { signupProviderConfig } from '../supabaseSignup.js';
import { notify } from './notifications.js';

type Identity = { authUserId: string; sessionId: string };
export function passwordFields(input: unknown, fields: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !fields.includes(k)))
    throw new ApiError(400, 'Only the requested password fields are accepted.');
  return input as Record<string, unknown>;
}
export function recoveryEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
    throw new ApiError(400, 'Enter a valid email address.');
  return value.trim().toLowerCase();
}
export function newEmailPassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 256)
    throw new ApiError(400, 'Use a new password between 8 and 256 characters.');
  return value;
}
export function recoveryChallenge(value: unknown, providerUrl: string) {
  if (typeof value !== 'string' || value.length > 4096) throw new ApiError(400, 'Enter the recovery code or copy the recovery link from your email.');
  const code = value.trim();
  if (/^\d{6,10}$/.test(code)) return { token: code, type: 'recovery' as const };
  let url: URL;
  try { url = new URL(code); } catch { throw new ApiError(400, 'Enter a valid recovery code or link.'); }
  const token = url.searchParams.get('token') || url.searchParams.get('token_hash');
  if (url.origin !== providerUrl || url.pathname !== '/auth/v1/verify' || url.username || url.password || url.hash ||
      url.searchParams.get('type') !== 'recovery' || !/^[a-f0-9]{56,64}$/.test(token || '') ||
      url.searchParams.getAll('type').length !== 1 || url.searchParams.getAll('token').length + url.searchParams.getAll('token_hash').length !== 1)
    throw new ApiError(400, 'Use the recovery link from the configured PineVela email provider.');
  // Submitted URLs are never followed. Signup/invitation tokens are not recovery proof.
  return { token_hash: token!, type: 'recovery' as const };
}

/** Internal helpers accept only identifiers already verified with Supabase /user.
 * Recovery never binds a portal, creates a profile, or bypasses a portal PIN. */
async function eligibleIdentity(client: PoolClient, identity: Identity) {
  const rows = (await client.query(`select c.id,c.kind from auth.sessions s
    join public.profiles p on p.id=s.user_id join public.account_contexts c on c.auth_user_id=p.id
    where s.id=$1 and s.user_id=$2 and (s.not_after is null or s.not_after>clock_timestamp())
      and c.status='active'
      and (c.kind<>'admin' or exists(select 1 from public.admin_memberships m where m.context_id=c.id and m.status='active'))
      and (c.kind<>'resident' or exists(select 1 from public.allocations a where a.resident_context_id=c.id and a.ended_at is null))
      and (c.kind<>'staff' or exists(select 1 from public.staff_assignments a where a.staff_context_id=c.id and a.status='active' and a.ended_at is null))
    order by c.id`, [uuid(identity.sessionId), uuid(identity.authUserId)])).rows;
  if (!rows.length) throw new ApiError(403, 'This verified identity has no available PineVela account.');
  return rows;
}
export async function requirePasswordIdentity(db: SupabaseDatabase, identity: Identity) {
  await db.availableSystem(client => eligibleIdentity(client, identity));
}
export async function ownManagerPasswordIdentity(db: SupabaseDatabase, actor: VerifiedActor, capturedContext?: unknown) {
  if (actor.kind !== 'manager') throw new ApiError(403, 'Use your verified manager account.');
  if (capturedContext !== undefined && capturedContext !== actor.contextId) throw new ApiError(409, 'Your active account changed. Refresh its settings.');
  return db.authorizedSystem(actor, ['manager'], async client => {
    const person = (await client.query(`select u.email,coalesce(u.encrypted_password,'')<>'' as enabled
      from auth.users u where u.id=$1 and u.email_confirmed_at is not null and not u.is_anonymous`, [actor.authUserId])).rows[0];
    if (!person) throw new ApiError(401, 'A verified email identity is required.');
    if (!person.enabled) throw new ApiError(409, 'This identity uses Google sign-in. Use email recovery to set a PineVela email password; your Google password stays unchanged.', 'email_password_missing');
    return recoveryEmail(person.email);
  });
}

/** Record the provider-confirmed outcome; no passwords or Auth rows are written
 * by SQL. All app bindings for this identity, including shared portals, end. */
export async function recordEmailPasswordChange(db: SupabaseDatabase, identity: Identity) {
  return db.availableSystem(async client => {
    const contexts = await eligibleIdentity(client, identity);
    await client.query('delete from private.account_sessions where auth_user_id=$1', [identity.authUserId]);
    await client.query(`insert into private.audit_events(event_type,resource_type,resource_id)
      values('email_password_changed','auth_identity',$1)`, [identity.authUserId]);
    for (const market of [false, true]) {
      const recipients = contexts.filter(c => (c.kind === 'seller') === market).map(c => c.id);
      await notify(client, recipients, { category: market ? 'market_account_security' : 'account_security', title: 'Email password changed',
        message: 'Your verified PineVela email password has changed. Sign in again to continue. Portal access PINs and Google credentials are unchanged.' });
    }
    return { success: true, signInRequired: true };
  });
}

const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
function noSelectors(req: AuthRequest) {
  if (Object.keys(req.query).length) throw new ApiError(400, 'Account selectors are not accepted.');
}
async function closeProof(auth: SupabaseAuth, session: any) {
  if (session?.access_token) await auth.provider('/logout?scope=local', {}, session.access_token).catch(() => undefined);
}
async function updateVerifiedPassword(auth: SupabaseAuth, proof: any, identity: Identity, password: string, currentPassword?: string) {
  try {
    const updated = await auth.provider('/user', { password, ...(currentPassword === undefined ? {} : { current_password: currentPassword }) }, proof.access_token, 'PUT');
    if (updated?.id !== identity.authUserId) throw new ApiError(503, 'The provider password update could not be confirmed.');
    return await recordEmailPasswordChange(auth.db, identity);
  } catch (error) {
    // An interrupted provider response or database COMMIT may already have taken
    // effect. Never replay a credential write or promise the old password works.
    if (!(error instanceof ApiError) || error.status >= 500)
      throw new ApiError(503, 'Your email password may already have changed. Try signing in with the new password or request a new recovery email before retrying.', 'password_change_unconfirmed');
    throw error;
  }
}
export function installPasswordSecurity(app: Express, auth: SupabaseAuth) {
  app.post('/api/auth/change-password', auth.require(['manager']), route(async (req, res) => {
    noSelectors(req);
    const body = passwordFields(req.body, ['currentPassword', 'newPassword']);
    const next = newEmailPassword(body.newPassword);
    if (typeof body.currentPassword !== 'string' || !body.currentPassword || body.currentPassword.length > 256)
      throw new ApiError(400, 'Enter your current email password.');
    if (next === body.currentPassword) throw new ApiError(400, 'Choose a different password.');
    const email = await ownManagerPasswordIdentity(auth.db, req.actor, req.headers['x-pinevela-profile-context']);
    // Provider settings may ignore current_password unless explicitly enabled.
    // A genuine password sign-in supplies proof independently of that setting.
    let proof: any;
    try {
      try { proof = await auth.provider('/token?grant_type=password', { email, password: body.currentPassword }); }
      catch (error) {
        if (error instanceof ApiError && error.status === 401) throw new ApiError(403, 'The current email password is incorrect.', 'current_password_invalid');
        throw error;
      }
      const person = await auth.provider('/user', undefined, proof.access_token);
      const identity = verifiedClaims(proof.access_token, person);
      if (identity.authUserId !== req.actor.authUserId || recoveryEmail(person.email) !== email)
        throw new ApiError(403, 'Current-password proof does not match your signed-in identity.');
      await ownManagerPasswordIdentity(auth.db, req.actor, req.headers['x-pinevela-profile-context']);
      // Do not hold database locks across a provider mutation: Supabase removes
      // other native sessions as part of its password update transaction.
      return res.json(await updateVerifiedPassword(auth, proof, identity, next, body.currentPassword));
    } finally { await closeProof(auth, proof); }
  }));
  app.post('/api/auth/recover', route(async (req, res) => {
    noSelectors(req);
    const body = passwordFields(req.body, ['email']);
    await auth.provider('/recover', { email: recoveryEmail(body.email) });
    // Supabase deliberately returns the same outcome for an unknown mailbox.
    return res.status(202).json({ success: true });
  }));
  app.post('/api/auth/recover/complete', route(async (req, res) => {
    noSelectors(req);
    const body = passwordFields(req.body, ['email', 'code', 'newPassword']);
    const email = recoveryEmail(body.email), next = newEmailPassword(body.newPassword);
    const challenge = recoveryChallenge(body.code, signupProviderConfig().url);
    let proof: any;
    try {
      proof = await auth.provider('/verify', 'token' in challenge ? { email, ...challenge } : challenge);
      const person = await auth.provider('/user', undefined, proof.access_token);
      const identity = verifiedClaims(proof.access_token, person);
      if (recoveryEmail(person.email) !== email) throw new ApiError(400, 'The recovery proof does not match this email address.');
      await requirePasswordIdentity(auth.db, identity);
      return res.json(await updateVerifiedPassword(auth, proof, identity, next));
    } catch (error) {
      // Recovery has no application-session authority. Its expired proof must
      // not emit an app-session 401 that signs out another browser identity.
      if (error instanceof ApiError && error.status === 401)
        throw new ApiError(400, 'The recovery proof expired. Request a new recovery email.');
      throw error;
    } finally { await closeProof(auth, proof); }
  }));
}
