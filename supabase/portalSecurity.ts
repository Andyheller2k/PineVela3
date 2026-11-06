import type { Express, RequestHandler } from 'express';
import { ApiError, SupabaseDatabase, type VerifiedActor } from './db.js';
import { SupabaseAuth, type AuthRequest } from './auth.js';
import { checkPortalPin, hashPortalPin, portalPin } from './portalAccess.js';
import { notify, notifyPrimaryOwner } from './notifications.js';
import { unwrapResidentPassword, wrapResidentPassword } from './residentPinCrypto.js';

export function checkPortalSecurityRequest(actor: VerifiedActor, input: unknown, capturedContext?: unknown) {
  if (!['resident', 'seller'].includes(actor.kind)) throw new ApiError(403, 'Use your verified resident or seller portal.');
  if (capturedContext !== undefined && capturedContext !== actor.contextId) throw new ApiError(409, 'Your active account changed. Refresh its settings.');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['currentPin', 'newPin'].includes(key)))
    throw new ApiError(400, 'Only the current and new portal PIN are accepted.');
}

export async function ownPortalSecurity(db: SupabaseDatabase, actor: VerifiedActor) {
  checkPortalSecurityRequest(actor, {});
  return db.authorizedSystem(actor, ['resident', 'seller'], async client => {
    const result = (await client.query(`select exists(select 1 from private.portal_access_keys where context_id=$1) as enabled,
      exists(select 1 from public.account_contexts where auth_user_id=$2 and kind in ('resident','seller') and kind<>$3 and status='active') as shared`,
      [actor.contextId, actor.authUserId, actor.kind])).rows[0];
    const managed=actor.kind==='resident' && Boolean((await client.query(`select 1 from private.resident_pin_credentials k
      join private.account_enrollments e on e.id=k.enrollment_id where e.linked_context_id=$1 and e.auth_user_id=$2`,[actor.contextId,actor.authUserId])).rowCount);
    return { accountKind: actor.kind, portalPinEnabled: result.enabled, sharedEmailIdentity: result.shared, residentPinLogin:managed };
  });
}

/** The target is always the native session's own active portal. */
export async function changeOwnPortalPin(db: SupabaseDatabase, actor: VerifiedActor, input: unknown, capturedContext?: unknown) {
  checkPortalSecurityRequest(actor, input, capturedContext);
  const body = input as { currentPin: unknown; newPin: unknown };
  const currentPin = portalPin(body.currentPin), newPin = portalPin(body.newPin);
  if (currentPin === newPin) throw new ApiError(400, 'Choose a different portal PIN.');
  const allowed = await db.authorizedSystem(actor, ['resident', 'seller'], async client => {
    const key = (await client.query('select version from private.portal_access_keys where context_id=$1 for update', [actor.contextId])).rows[0];
    if (!key) throw new ApiError(409, 'This portal uses its own verified email login and does not have a portal PIN.');
    // Another rotation may have completed while this request waited for the key.
    const binding = (await client.query('select portal_pin_version from private.account_sessions where session_id=$1 and auth_user_id=$2 and active_context_id=$3',
      [actor.sessionId, actor.authUserId, actor.contextId])).rows[0];
    if (!binding || String(binding.portal_pin_version) !== String(key.version)) throw new ApiError(401, 'Your portal session has ended. Sign in again.');
    const checked = await checkPortalPin(client, actor.contextId, currentPin);
    if (!checked.allowed) return false; // Commit guesses/lockout before reporting denial.
    const pinHash=await hashPortalPin(newPin);
    const managed=(await client.query(`select k.enrollment_id,k.primary_owner_id,k.wrapped_password from private.resident_pin_credentials k
      join private.account_enrollments e on e.id=k.enrollment_id where e.linked_context_id=$1 and e.auth_user_id=$2 for update of k`,[actor.contextId,actor.authUserId])).rows[0];
    if(managed){
      const password=await unwrapResidentPassword(managed.wrapped_password,currentPin,managed.enrollment_id,managed.primary_owner_id);
      const wrapped=await wrapResidentPassword(password,newPin,managed.enrollment_id,managed.primary_owner_id);
      await client.query('update private.resident_pin_credentials set wrapped_password=$2,pin_hash=$3,failed_attempts=0,locked_until=null where enrollment_id=$1',[managed.enrollment_id,wrapped,pinHash]);
    }
    await client.query('update private.portal_access_keys set pin_hash=$2 where context_id=$1', [actor.contextId,pinHash]);
    // The existing native trigger advances the version and resets guess counters.
    // Old bindings remain denied; companion bindings and Auth rows survive.
    await client.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'portal_pin_changed','account_context',$1)", [actor.contextId]);
    const label = actor.kind === 'resident' ? 'resident' : 'seller';
    const notice = { category: actor.kind === 'seller' ? 'market_account_security' : 'account_security', title: 'Portal access PIN changed',
      message: `Your ${label} portal access PIN has changed. Sign in again to continue. Your verified email password is unchanged.` };
    await notify(client, [actor.contextId], notice);
    await notifyPrimaryOwner(client, actor.contextId, notice);
    return true;
  });
  if (!allowed) throw new ApiError(403, 'The current portal PIN is invalid or temporarily locked. After five failed attempts, wait 15 minutes.', 'portal_pin_invalid');
  return { success: true, signInRequired: true };
}

const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
export function installPortalSecurity(app: Express, auth: SupabaseAuth) {
  app.post('/api/users/reset-registered-account-password', auth.require(['primary']), (_req, res) => res.status(410).json({
    error: 'Sign in with the verified resident or seller identity to manage its credentials. Primary accounts cannot reset a separate verified email password.',
    code: 'verified_portal_required',
  }));
  app.get('/api/auth/portal-security', auth.require(['resident', 'seller']), route(async (req, res) => {
    if (Object.keys(req.query).length) throw new ApiError(400, 'Account selectors are not accepted.');
    checkPortalSecurityRequest(req.actor, {}, req.headers['x-pinevela-profile-context']);
    res.json(await ownPortalSecurity(auth.db, req.actor));
  }));
  app.post('/api/auth/portal-pin', auth.require(['resident', 'seller']), route(async (req, res) => {
    res.json(await changeOwnPortalPin(auth.db, req.actor, req.body, req.headers['x-pinevela-profile-context']));
  }));
}
