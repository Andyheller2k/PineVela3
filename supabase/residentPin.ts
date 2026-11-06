import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, type VerifiedActor, type SupabaseDatabase } from './db.js';
import { type SupabaseAuth, type AuthRequest, sessionCookies } from './auth.js';
import { primaryOwner, availableResidentRoom, claimResidentRoom, ownedEnrollment } from './enrollment.js';
import { checkPortalPin, hashPortalPin, portalPin } from './portalAccess.js';
import { verifyCredentialAsync } from '../accountSecurity.js';
import { unwrapResidentPassword, wrapResidentPassword, recoverableResidentPassword, recoverResidentPassword } from './residentPinCrypto.js';
import { createResidentAuthIdentity } from './residentAuthProvider.js';
import { notify } from './notifications.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { withPasswordLoginLimit } from './loginAttempts.js';
import {residentPinLoginProof} from './residentPinLogin.js';
import { authRequestContext } from './authProtection.js';

const invalid = () => new ApiError(401, 'Invalid primary email or room PIN. After five failed attempts, wait 15 minutes.', 'invalid_credentials');
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
const password = () => `Pv!9aA-${crypto.randomBytes(48).toString('base64url')}`;

async function residentAllowed(c: PoolClient, owner: string) {
  if ((await c.query(`select 1 from public.registration_bans b join public.account_contexts x on x.id=b.account_context_id
    where coalesce(x.primary_owner_id,x.auth_user_id)=$1 and b.kind='resident_account' and b.until_at>clock_timestamp()`, [owner])).rowCount)
    throw new ApiError(403, 'Resident activation is temporarily restricted for this account.');
}

/** A setup PIN can be guessed before its native context exists. Its five-attempt
 * lock must therefore also live in PostgreSQL, and denials commit before errors. */
async function checkSetupPin(c: PoolClient, record: any, pin: string) {
  if (record.linked_context_id && (await c.query('select 1 from private.portal_access_keys where context_id=$1', [record.linked_context_id])).rowCount)
    return (await checkPortalPin(c, record.linked_context_id, pin)).allowed;
  if (record.locked_until && new Date(record.locked_until).getTime() > Date.now()) return false;
  const valid = await verifyCredentialAsync(pin, record.pin_hash);
  if (!valid) {
    await c.query(`update private.resident_pin_credentials set
      failed_attempts=case when locked_until<=clock_timestamp() then 1 else least(failed_attempts+1,5) end,
      locked_until=case when (case when locked_until<=clock_timestamp() then 0 else failed_attempts end)>=4 then clock_timestamp()+interval '15 minutes' else null end
      where enrollment_id=$1`, [record.id]);
  } else await c.query('update private.resident_pin_credentials set failed_attempts=0,locked_until=null where enrollment_id=$1', [record.id]);
  return valid;
}

/** PostgreSQL can abort a competing claim to break a deadlock. Retry only the
 * rolled-back database transaction once; native Auth provisioning stays outside
 * this retry and all live owner/key/allocation checks run again. */
async function activationWrite<T>(auth:SupabaseAuth,actor:VerifiedActor,work:(c:PoolClient)=>Promise<T>):Promise<T>{
  for(let attempt=0;;attempt++){
    try{return await auth.db.authorizedSystem(actor,['primary'],work);}
    catch(error){
      if((error as {code?:string})?.code!=='40P01')throw error;
      if(attempt>0)throw new ApiError(409,'Room activation is changing in another request. Retry with your current PIN.','resident_activation_conflict');
      await new Promise(resolve=>setTimeout(resolve,25+crypto.randomInt(25)));
    }
  }
}

export async function activateResidentPin(auth: SupabaseAuth, actor: VerifiedActor, input: unknown,
  provision: typeof createResidentAuthIdentity = createResidentAuthIdentity) {
  const body = input as { roomKey?: unknown; pin?: unknown };
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['roomKey', 'pin'].includes(key)))
    throw new ApiError(400, 'Enter your room key and room PIN.');
  const pin = portalPin(body.pin), code = typeof body.roomKey === 'string' ? body.roomKey.trim().toUpperCase() : '';
  const reservation = await activationWrite(auth, actor, async c => {
    const owner = await primaryOwner(c, actor);
    await residentAllowed(c, owner.id);
    const current = (await c.query(`select e.*,x.status as context_status,k.pin_hash,k.wrapped_password,k.recovery_password,k.failed_attempts,k.locked_until
      from private.resident_pin_credentials k join private.account_enrollments e on e.id=k.enrollment_id
      left join public.account_contexts x on x.id=e.linked_context_id
      where k.primary_owner_id=$1 and e.primary_owner_id=$1 and e.kind='resident'
        and e.status not in ('cancelled','rejected') order by e.created_at desc limit 1 for update of e`, [owner.id])).rows[0];
    const unallocatedSetup=current&&(!current.context_status||['pending','closed'].includes(current.context_status))
      &&!(await c.query('select 1 from public.allocations where resident_context_id=$1 and ended_at is null limit 1',[current.linked_context_id])).rowCount;
    if(unallocatedSetup){
      // A verified owner may choose a PIN while setting up/moving its own
      // isolated room account. A valid available key is checked first; an
      // active room must use the separate active-room recovery control.
      await availableResidentRoom(c,actor,code);
      if(!await verifyCredentialAsync(pin,current.pin_hash)){
        const nativePassword=recoverResidentPassword(current.recovery_password,current.id,owner.id);
        current.pin_hash=await hashPortalPin(pin);current.wrapped_password=await wrapResidentPassword(nativePassword,pin,current.id,owner.id);
        await c.query('update private.resident_pin_credentials set pin_hash=$2,wrapped_password=$3,failed_attempts=0,locked_until=null where enrollment_id=$1',[current.id,current.pin_hash,current.wrapped_password]);
        if(current.linked_context_id)await c.query('update private.portal_access_keys set pin_hash=$2 where context_id=$1',[current.linked_context_id,current.pin_hash]);
      }
    }else if(current&&!await checkSetupPin(c,current,pin))return{denied:true as const};
    if (current?.status === 'completed' && current.context_status === 'active') {
      const same = await c.query('select 1 from private.room_activation_keys where code=$1 and claimed_by=$2 and room_id=$3 and revoked_at is null', [code, current.linked_context_id, current.room_id]);
      if (!same.rowCount) throw new ApiError(409, 'You already have an active room.');
      return { completed: true as const, accountId: current.linked_context_id, email: owner.email };
    }
    await availableResidentRoom(c, actor, code);
    const conflict = await c.query(`select 1 from public.account_contexts where primary_owner_id=$1 and kind='resident' and status<>'closed' and id is distinct from $2::uuid
      union all select 1 from private.account_enrollments where primary_owner_id=$1 and kind='resident' and status in ('pending_email','pending_review') and id is distinct from $3::uuid`,
    [owner.id, current?.linked_context_id || null, current?.id || null]);
    if (conflict.rowCount) throw new ApiError(409, 'You already have an active or pending resident account. Finish or cancel that enrollment first.');
    if (current) {
      if (current.auth_user_id && !['closed','pending'].includes(current.context_status)) throw new ApiError(409, 'This resident account cannot be reactivated.');
      const nonce = crypto.randomBytes(32).toString('hex');
      if (current.auth_user_id) {
        await c.query("update public.account_contexts set status='pending',updated_at=now() where id=$1", [current.linked_context_id]);
        await c.query("update private.account_enrollments set status='pending_review',expires_at=clock_timestamp()+interval '24 hours',room_id=null,residence_id=null where id=$1", [current.id]);
      } else await c.query("update private.account_enrollments set status='pending_email',token_digest=$2,expires_at=clock_timestamp()+interval '24 hours' where id=$1", [current.id, digest(nonce)]);
      return { id: current.id, email: current.invited_email, ownerEmail: owner.email, needsIdentity: !current.auth_user_id, nonce,
        credential: current.wrapped_password, pinHash: current.pin_hash };
    }
    const id = crypto.randomUUID(), email = `resident-${crypto.randomBytes(16).toString('hex')}@accounts.pinevela.app`, nonce = crypto.randomBytes(32).toString('hex');
    const nativePassword = password(), pinHash = await hashPortalPin(pin), credential = await wrapResidentPassword(nativePassword, pin, id, owner.id);
    await c.query(`insert into private.account_enrollments(id,initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
      values($1,$2,$3,'resident',$4,$5,$6,clock_timestamp()+interval '24 hours')`,
    [id, actor.contextId, owner.id, email, digest(nonce), JSON.stringify({ authentication: 'resident_pin', displayName: owner.display_name, phone: owner.phone || '' })]);
    await c.query('insert into private.resident_pin_credentials(enrollment_id,primary_owner_id,pin_hash,wrapped_password,recovery_password) values($1,$2,$3,$4,$5)', [id, owner.id, pinHash, credential, recoverableResidentPassword(nativePassword,id,owner.id)]);
    return { id, email, ownerEmail: owner.email, needsIdentity: true, nonce, credential, pinHash };
  });
  if ('denied' in reservation) throw invalid();
  if ('completed' in reservation) return { success: true, accountId: reservation.accountId, loginEmail: reservation.email, authentication: 'resident_pin', alreadyActivated: true };
  if (reservation.needsIdentity) {
    const nativePassword = await unwrapResidentPassword(reservation.credential, pin, reservation.id, actor.authUserId);
    try { await provision(reservation.email, nativePassword, reservation.nonce); }
    catch (error) {
      // A timed-out create may have committed. Never adopt by email alone: only
      // the existing private nonce trigger's binding is accepted below.
      const bound = await auth.db.authorizedSystem(actor, ['primary'], async c => {
        const e = await ownedEnrollment(c, actor, reservation.id); return !!e.auth_user_id && !!e.linked_context_id;
      });
      if (!bound) throw error;
    }
  }
  return activationWrite(auth, actor, async c => {
    const owner = await primaryOwner(c, actor), e = await ownedEnrollment(c, actor, reservation.id);
    await residentAllowed(c, owner.id);
    const currentCredential=(await c.query('select pin_hash from private.resident_pin_credentials where enrollment_id=$1 and primary_owner_id=$2 for update',[e.id,owner.id])).rows[0];
    if(!currentCredential||!await verifyCredentialAsync(pin,currentCredential.pin_hash))
      throw new ApiError(409,'Your setup PIN changed in another request. Retry with your current PIN.','resident_setup_changed');
    if (e.status === 'completed') {
      if (!(await c.query('select 1 from private.room_activation_keys where code=$1 and claimed_by=$2 and revoked_at is null', [code, e.linked_context_id])).rowCount)
        throw new ApiError(409, 'You already have an active room.');
      return { success: true, accountId: e.linked_context_id, loginEmail: owner.email, authentication: 'resident_pin', alreadyActivated: true };
    }
    const verified = await c.query(`select 1 from auth.users u join public.profiles p on p.id=u.id join public.account_contexts x on x.auth_user_id=p.id
      where u.id=$1 and lower(u.email)=$2 and u.email_confirmed_at is not null and p.primary_owner_id=$3
        and x.id=$4 and x.kind='resident' and x.primary_owner_id=$3 and x.status='pending'
        and not exists(select 1 from public.account_contexts other where other.auth_user_id=u.id and other.id<>x.id)`,
    [e.auth_user_id, e.invited_email, actor.authUserId, e.linked_context_id]);
    if (!verified.rowCount || e.enrollment_fields?.authentication !== 'resident_pin') throw new ApiError(409, 'Resident identity setup has not completed. Retry with the same PIN.');
    await c.query('insert into private.portal_access_keys(context_id,pin_hash) values($1,$2) on conflict(context_id) do nothing', [e.linked_context_id, currentCredential.pin_hash]);
    await c.query("update private.account_enrollments set status='pending_review',verified_at=coalesce(verified_at,clock_timestamp()) where id=$1", [e.id]);
    const result = await claimResidentRoom(c, actor, e.id, code);
    await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'resident_pin_activated','account_context',$2)", [actor.contextId, e.linked_context_id]);
    return { ...result, loginEmail: owner.email, authentication: 'resident_pin' };
  });
}

export {residentPinLoginProof} from './residentPinLogin.js';

/** Recovery rewraps the same random native credential in one SQL transaction.
 * It never resets a primary/seller password, calls an admin password-reset API,
 * or leaves a half-completed external credential rotation. */
export async function resetOwnedResidentPin(auth:SupabaseAuth,actor:VerifiedActor,input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='newPin'))throw new ApiError(400,'Enter a new room PIN.');
  const pin=portalPin((input as any).newPin);
  return auth.db.authorizedSystem(actor,['primary'],async c=>{
    await primaryOwner(c,actor);
    const e=(await c.query(`select e.id,e.auth_user_id,e.linked_context_id from private.account_enrollments e
      join private.resident_pin_credentials k on k.enrollment_id=e.id left join public.account_contexts x on x.id=e.linked_context_id
      left join public.profiles p on p.id=e.auth_user_id left join auth.users u on u.id=p.id
      where e.primary_owner_id=$1 and k.primary_owner_id=$1
        and e.kind='resident' and e.enrollment_fields->>'authentication'='resident_pin'
        and x.primary_owner_id=$1 and p.primary_owner_id=$1 and x.kind='resident' and x.auth_user_id=e.auth_user_id and u.id<>$1
        and u.email_confirmed_at is not null and lower(u.email)=e.invited_email
        and e.status='completed' and x.status='active'
        and exists(select 1 from public.allocations a where a.resident_context_id=x.id and a.ended_at is null)
        and not exists(select 1 from public.account_contexts other where other.auth_user_id=x.auth_user_id and other.id<>x.id)
      order by e.created_at desc limit 1 for update of e`,[actor.authUserId])).rows[0];
    if(!e)throw new ApiError(409,'Activate your resident room before resetting its PIN. Existing email-based resident accounts keep their separate login.');
    if(e.linked_context_id)await c.query('select context_id from private.portal_access_keys where context_id=$1 for update',[e.linked_context_id]);
    const k=(await c.query('select * from private.resident_pin_credentials where enrollment_id=$1 for update',[e.id])).rows[0];
    const nativePassword=recoverResidentPassword(k.recovery_password,e.id,actor.authUserId);
    const wrapped=await wrapResidentPassword(nativePassword,pin,e.id,actor.authUserId),hash=await hashPortalPin(pin);
    await c.query('update private.resident_pin_credentials set wrapped_password=$2,pin_hash=$3,failed_attempts=0,locked_until=null where enrollment_id=$1',[e.id,wrapped,hash]);
    if(e.linked_context_id)await c.query('insert into private.portal_access_keys(context_id,pin_hash) values($1,$2) on conflict(context_id) do update set pin_hash=excluded.pin_hash',[e.linked_context_id,hash]);
    await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'resident_pin_reset','account_enrollment',$2)",[actor.contextId,e.id]);
    await notify(c,[actor.contextId,...(e.linked_context_id?[e.linked_context_id]:[])],{category:'account_security',title:'Room PIN reset',message:'Your resident room PIN was reset from your primary account. Use your primary email and new room PIN to sign in again. Your primary password and other accounts are unchanged.'});
    return {success:true};
  });
}

export function installResidentPin(app: Express, auth: SupabaseAuth) {
  const budgets = new AttemptBudgets();
  app.post('/api/auth/resident-activate', auth.require(['primary']), route(async (req, res) => {
    budgets.reserve([{ scope: 'resident-pin-activation', identity: req.actor.authUserId, maximum: 10, windowMs: 15 * 60_000 }]);
    res.json(await activateResidentPin(auth, req.actor, req.body));
  }));
  app.post('/api/auth/resident-pin/reset',auth.require(['primary']),route(async(req,res)=>{
    budgets.reserve([{scope:'resident-pin-reset',identity:req.actor.authUserId,maximum:10,windowMs:15*60_000}]);
    res.json(await resetOwnedResidentPin(auth,req.actor,req.body));
  }));
  app.post('/api/auth/resident-login', route(async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(k => !['email', 'pin'].includes(k)))
      throw new ApiError(400, 'Enter your primary email and room PIN.');
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter your primary email address.');
    const pin = portalPin(req.body.pin);
    const proof = await withPasswordLoginLimit(auth.db, { email, ip: authRequestContext.getStore()?.ip || req.ip }, () => residentPinLoginProof(auth.db, email, pin));
    // The ordinary public-key provider exchange keeps required CAPTCHA checks
    // and native sessions. No primary JWT or custom application JWT is minted.
    const session = await auth.provider('/token?grant_type=password', { email: proof.email, password: proof.password });
    try {
      const actor = await auth.bind(session, 'resident', pin);
      if (actor.authUserId !== proof.authUserId || actor.contextId !== proof.contextId) throw invalid();
      const user = await auth.projection(actor); sessionCookies(res, session); res.json(user);
    } catch (error) { await auth.provider('/logout?scope=local', {}, session.access_token).catch(() => undefined); throw error; }
  }));
}
