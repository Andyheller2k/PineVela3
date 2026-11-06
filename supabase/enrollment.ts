import crypto from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import { SupabaseAuth, verifiedClaims, type AuthRequest } from './auth.js';
import { signupChallenge, signupProviderConfig, requireConfirmationSettings } from '../supabaseSignup.js';
import { validateManagerWorkEmail } from '../src/lib/validation.js';
import { notify } from './notifications.js';
import { reactivateResident } from './residentReactivation.js';
import {confirmSellerReactivation} from './sellerReactivation.js';
import {confirmManagerReactivation} from './managerReactivation.js';
import { portalPin,hashPortalPin,checkPortalPin } from './portalAccess.js';
import {primaryManagerRegistrationRestricted} from './registrationRestrictions.js';
import { AttemptBudgets } from '../resourceSecurity.js';

const route = (work: (req: AuthRequest, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { work(req as AuthRequest, res).catch(next); };
const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export type EnrollmentInput = { kind: 'resident' | 'manager' | 'seller'; email: string; name: string; phone: string; password: string };
export function enrollmentInput(body: any): EnrollmentInput {
  const kind = body?.kind, name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  if (!['resident','manager','seller'].includes(kind) || !name || name.length > 120 ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || phone.length > 40 ||
      typeof body?.password !== 'string' || body.password.length < 8 || body.password.length > 256)
    throw new ApiError(400, 'Enter the account type, name, email, phone and a password of at least 8 characters.');
  if (kind === 'seller' && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.(edu\.gh|ac\.gh)$/i.test(email))
    throw new ApiError(400, 'Use your Ghanaian university student email for your seller account.');
  if (kind === 'manager') {
    const check = validateManagerWorkEmail(email);
    if (!check.isValid) throw new ApiError(400, check.error!);
  }
  // Ownership, status and role fields in the body have no effect.
  return { kind, email, name, phone, password: body.password };
}
export async function primaryOwner(client: PoolClient, actor: VerifiedActor, readOnly=false) {
  const { rows: [owner] } = await client.query(`select p.id,p.email,p.display_name,p.phone from public.profiles p
    join public.account_contexts c on c.auth_user_id = p.id
    where c.id = $1 and c.auth_user_id = $2 and c.kind = 'primary' and c.status = 'active'
      and p.primary_owner_id is null ${readOnly?'for share':'for update'} of p`, [actor.contextId,actor.authUserId]);
  if (!owner) throw new ApiError(403, 'Start account enrollment from your primary user account.');
  return owner;
}
/** Pure owner-scoped read. Enrollment mutations retain primaryOwner's UPDATE lock. */
export async function readOwnedEnrollments(client:PoolClient,actor:VerifiedActor){
  if(actor.kind!=='primary')throw new ApiError(403,'Start account enrollment from your primary user account.');
  await primaryOwner(client,actor,true);
  return (await client.query(`select e.id,e.kind,e.invited_email as email,e.auth_user_id as signup_id,e.linked_context_id as account_id,
    e.status,e.verified_at,e.expires_at,c.status as account_status,e.enrollment_fields->>'authentication' as authentication,
    exists(select 1 from private.portal_access_keys k where k.context_id=e.linked_context_id) as requires_portal_pin
    from private.account_enrollments e left join public.account_contexts c on c.id=e.linked_context_id
    where e.primary_owner_id=$1 order by e.created_at desc`,[actor.authUserId])).rows;
}
/** Called only in a transaction that has already locked a verified primary actor. */
type SharedIdentity = { authUserId:string; sessionId:string; email:string; existingContextId:string; newPinHash:string; existingPinHash:string };
export async function reserveEnrollment(client: PoolClient, actor: VerifiedActor, input: EnrollmentInput, token: string, shared?: SharedIdentity,googleManager=false) {
  if(googleManager&&(input.kind!=='manager'||shared))throw new ApiError(400,'Google manager enrollment cannot select another account type.');
  const owner = await primaryOwner(client,actor);
  if (input.email === owner.email.toLowerCase()) throw new ApiError(400, 'Use a separate email address for this account.');
  await client.query(`update public.account_contexts c set status = 'closed',updated_at = now()
    from private.account_enrollments e where e.primary_owner_id = $1 and e.status = 'pending_email'
      and e.expires_at <= clock_timestamp() and c.id = e.linked_context_id and c.status = 'pending'`, [owner.id]);
  await client.query(`update private.account_enrollments set status = 'expired'
    where primary_owner_id = $1 and status = 'pending_email' and expires_at <= clock_timestamp()`, [owner.id]);
  const blocked = input.kind === 'manager'
    ? await primaryManagerRegistrationRestricted(client,owner.id)
    : !!(await client.query(`select 1 from public.registration_bans b
    join public.account_contexts c on c.id = b.account_context_id
    where (c.auth_user_id = $1 or c.primary_owner_id = $1) and b.until_at > clock_timestamp()
      and b.kind = $2`, [owner.id,input.kind === 'seller' ? 'seller_account' : 'resident_account'])).rowCount;
  if (blocked) throw new ApiError(403, 'Registration is temporarily restricted for this account.');
  const existing = await client.query(`select 1 from public.account_contexts where primary_owner_id = $1
    and kind = $2 and status <> 'closed' union all select 1 from private.account_enrollments
    where primary_owner_id = $1 and kind = $2 and status in ('pending_email','pending_review')`, [owner.id,input.kind]);
  if (existing.rowCount) throw new ApiError(409, 'This account is already registered or awaiting verification.');
  // Never adopt an existing public identity through email equality or the provider's
  // anti-enumeration signup response. Binding requires the signup trigger or the
  // separate server-verified Google enrollment callback with its private nonce.
  const exists = (await client.query(`select 1 from auth.users u where lower(u.email)=$1
    and (not $2::boolean or exists(select 1 from public.profiles p where p.id=u.id)
      or exists(select 1 from public.account_contexts c where c.auth_user_id=u.id)
      or exists(select 1 from private.account_enrollments e where e.auth_user_id=u.id))`, [input.email,googleManager])).rowCount;
  if (exists && !shared)
    throw new ApiError(409, 'That address cannot be used for a new separate account.');
  if (shared) {
    const valid = await client.query(`select c.id from public.account_contexts c
      join public.profiles p on p.id = c.auth_user_id join auth.users u on u.id = p.id
      join auth.sessions s on s.user_id = u.id
      where c.id = $1 and c.auth_user_id = $2 and c.primary_owner_id = $3 and p.primary_owner_id = $3
        and c.kind = $4 and c.status in ('active','pending') and u.email_confirmed_at is not null
        and lower(u.email) = $5 and s.id = $6 and (s.not_after is null or s.not_after > clock_timestamp())
        and exists(select 1 from private.account_enrollments e where e.linked_context_id = c.id
          and e.verified_at is not null and e.status in ('pending_review','completed')) for share of c,p,s`,
      [shared.existingContextId,shared.authUserId,owner.id,input.kind === 'resident' ? 'seller' : 'resident',input.email,shared.sessionId]);
    if (!['resident','seller'].includes(input.kind) || shared.email !== input.email || !valid.rowCount)
      throw new ApiError(403,'Only your existing verified student identity can be shared between resident and seller portals.');
  }
  const reserved = await client.query(`insert into private.account_enrollments
    (initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
    values ($1,$2,$3,$4,$5,$6,clock_timestamp() + interval '24 hours') returning id`,
    [actor.contextId,owner.id,input.kind,input.email,digest(token),JSON.stringify({ displayName: input.name,phone: input.phone,...(googleManager?{authentication:'google'}:{}) })]);
  const id = reserved.rows[0].id as string;
  if (shared) {
    const context = (await client.query(`insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)
      values ($1,$2,$3,'pending') returning id`,[shared.authUserId,owner.id,input.kind])).rows[0].id;
    await client.query('update private.account_enrollments set auth_user_id = $2,linked_context_id = $3 where id = $1',[id,shared.authUserId,context]);
    await client.query(`insert into private.portal_access_keys(context_id,pin_hash) values ($1,$2)
      on conflict(context_id) do nothing`,[shared.existingContextId,shared.existingPinHash]);
    await client.query('insert into private.portal_access_keys(context_id,pin_hash) values ($1,$2)',[context,shared.newPinHash]);
    await finishEnrollment(client,actor,id,shared);
  }
  return id;
}
export async function ownedEnrollment(client: PoolClient, actor: VerifiedActor, id: string) {
  await primaryOwner(client,actor);
  const { rows: [enrollment] } = await client.query(`select e.*,c.status as context_status from private.account_enrollments e
    left join public.account_contexts c on c.id = e.linked_context_id
    where e.id = $1 and e.primary_owner_id = $2 and e.initiator_context_id = $3 for update of e`,
    [uuid(id),actor.authUserId,actor.contextId]);
  if (!enrollment) throw new ApiError(404, 'Enrollment not found.');
  return enrollment;
}
/** identity must come from verified Supabase /user, never the request body. */
export async function finishEnrollment(client: PoolClient, actor: VerifiedActor, id: string, identity: { authUserId: string; email: string; sessionId: string }) {
  const enrollment = await ownedEnrollment(client,actor,id);
  if (enrollment.auth_user_id !== identity.authUserId || enrollment.invited_email !== identity.email || !enrollment.linked_context_id)
    throw new ApiError(400, 'Email confirmation does not match this enrollment.');
  const confirmed = await client.query(`select u.id from auth.users u join auth.sessions s on s.user_id = u.id
    join public.account_contexts c on c.auth_user_id = u.id
    join public.profiles p on p.id = u.id
    where u.id = $1 and lower(u.email) = $2 and u.email_confirmed_at is not null
      and s.id = $3 and (s.not_after is null or s.not_after > clock_timestamp())
      and c.id = $4 and c.kind = $5 and c.primary_owner_id = $6 and p.primary_owner_id = $6`,
    [identity.authUserId,identity.email,identity.sessionId,enrollment.linked_context_id,enrollment.kind,actor.authUserId]);
  if (!confirmed.rowCount) throw new ApiError(400, 'A live, verified sub-account identity is required.');
  if (['pending_review','completed'].includes(enrollment.status)) return { id: enrollment.id,kind: enrollment.kind,status: enrollment.status };
  if (enrollment.status !== 'pending_email' || new Date(enrollment.expires_at).getTime() <= Date.now() || enrollment.context_status !== 'pending')
    throw new ApiError(409, 'This enrollment is no longer awaiting email verification.');
  await client.query("update private.account_enrollments set status = 'pending_review',verified_at = now() where id = $1", [enrollment.id]);
  await notify(client,[actor.contextId],{ category:'verification',title:'Account Email Verified',
    message: `The email for your ${enrollment.kind} account has been verified. ${enrollment.kind === 'resident' ? 'You can now claim your room using its activation key.' : 'Complete registration before this account can be activated.'}` });
  return { id: enrollment.id,kind: enrollment.kind,status:'pending_review' };
}
export async function claimResidentRoom(client: PoolClient, actor: VerifiedActor, id: string, value: unknown) {
  const enrollment = await ownedEnrollment(client,actor,id);
  if (enrollment.kind !== 'resident' || !enrollment.verified_at || enrollment.status !== 'pending_review' || enrollment.context_status !== 'pending')
    throw new ApiError(409, 'Verify your resident email before activating a room.');
  const key = await availableResidentRoom(client,actor,value);
  const confirmed = await client.query(`select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = $1 and lower(u.email) = $2 and u.email_confirmed_at is not null and p.primary_owner_id = $3`,
    [enrollment.auth_user_id,enrollment.invited_email,actor.authUserId]);
  if (!confirmed.rowCount) throw new ApiError(409, 'The resident identity is no longer verified.');
  await client.query('insert into public.allocations(resident_context_id,room_id,bed_id) values ($1,$2,$3)', [enrollment.linked_context_id,key.room_id,key.bed_id]);
  await client.query('update private.room_activation_keys set claimed_at = now(),claimed_by = $1 where id = $2', [enrollment.linked_context_id,key.id]);
  await client.query("update public.account_contexts set status = 'active',updated_at = now() where id = $1", [enrollment.linked_context_id]);
  await client.query("update private.account_enrollments set status = 'completed',room_id = $2,residence_id = $3 where id = $1", [enrollment.id,key.room_id,key.residence_id]);
  const pinLogin=enrollment.enrollment_fields?.authentication==='resident_pin';
  await notify(client,[actor.contextId],{ category:'success',title:'Resident Room Activated',
    message:`Your room at ${key.residence_name} is activated. ${pinLogin?'Use your primary email and room PIN to sign in to your resident account.':'Sign in separately with your verified resident email to open your room account.'}` });
  // Do not switch the primary user's session into the child's identity.
  return { success:true,accountId:enrollment.linked_context_id,requiresSeparateLogin:true };
}

/** Residence/key/room/bed locks and current allocation checks are shared by
 * reservation and final activation. No browser-supplied room ID is trusted. */
export async function availableResidentRoom(client:PoolClient,actor:VerifiedActor,value:unknown) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!code || code.length > 100) throw new ApiError(400, 'Enter a valid room activation key.');
  // Residence first matches generation/release lock order. Recheck the current
  // key after locking so a concurrent rotation cannot revive the previous code.
  const selected = (await client.query(`select b.residence_id from private.room_activation_keys k
    join public.rooms r on r.id = k.room_id join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
    where k.code = $1 and k.revoked_at is null`,[code])).rows[0];
  if (!selected) throw new ApiError(404,'This room key is not available for activation.');
  await client.query('select id from public.residences where id = $1 for update',[selected.residence_id]);
  const { rows: [key] } = await client.query(`select k.id,k.room_id,k.claimed_at,k.claimed_by,h.id as residence_id,h.name as residence_name,h.status,
    private.residence_has_reviewed_setup(h.id) as eligible
    from private.room_activation_keys k join public.rooms r on r.id = k.room_id
    join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
    join public.residences h on h.id = b.residence_id
    where k.code = $1 and k.revoked_at is null for update of k,r`, [code]);
  if (!key || key.status !== 'approved' || !key.eligible) throw new ApiError(404, 'This room key is not available for activation.');
  if (key.claimed_at || key.claimed_by) throw new ApiError(409, 'This room key has already been used.');
  if ((await client.query('select 1 from public.allocations where ended_at is null and (primary_owner_id = $1 or room_id = $2)', [actor.authUserId,key.room_id])).rowCount)
    throw new ApiError(409, 'You already occupy a room or this room is occupied.');
  const { rows: [bed] } = await client.query('select id from public.beds where room_id = $1 order by bed_number limit 1 for update', [key.room_id]);
  if (!bed) throw new ApiError(409, 'This room has no configured bed. Contact its manager.');
  return {...key,bed_id:bed.id};
}

export function installEnrollment(app: Express, auth: SupabaseAuth) {
  const primary = auth.require(['primary']);
  const roomAttempts = new AttemptBudgets();
  const roomAttempt: RequestHandler = (req,_res,next) => {
    try {
      // All aliases and sessions share the verified Auth identity's budget,
      // including requests arriving from different IPs. No body identity counts.
      roomAttempts.reserve([{scope:'room-activation-account',identity:(req as AuthRequest).actor.authUserId,maximum:10,windowMs:15*60*1000}]);
      next();
    } catch(error) { next(error); }
  };
  app.post('/api/auth/enrollments',primary,route(async (req,res) => {
    const input = enrollmentInput(req.body);
    requireConfirmationSettings(await auth.provider('/settings'));
    const candidate = await auth.db.authorizedSystem(req.actor,['primary'],async client => {
      await primaryOwner(client,req.actor);
      const { rows: [other] } = await client.query(`select c.id,c.auth_user_id from public.account_contexts c
        join public.profiles p on p.id = c.auth_user_id
        where c.primary_owner_id = $1 and p.primary_owner_id = $1 and lower(p.email) = $2
          and c.kind = $3 and c.status in ('active','pending')`,
        [req.actor.authUserId,input.email,input.kind === 'resident' ? 'seller' : input.kind === 'seller' ? 'resident' : 'unavailable']);
      return other;
    });
    let shared: SharedIdentity | undefined;
    if (candidate) {
      const existingPin = portalPin(req.body?.existingPortalPin),newPin = portalPin(req.body?.portalPin);
      if (existingPin === newPin) throw new ApiError(400,'Choose different PINs for the resident and seller portals.');
      const session = await auth.provider('/token?grant_type=password',{ email:input.email,password:input.password });
      try {
        const person = await auth.provider('/user',undefined,session.access_token);
        const identity = verifiedClaims(session.access_token,person);
        if (identity.authUserId !== candidate.auth_user_id || String(person.email).toLowerCase() !== input.email)
          throw new ApiError(403,'The verified login does not match your saved student account.');
        const pin = await auth.db.authorizedSystem(req.actor,['primary'],client => checkPortalPin(client,candidate.id,existingPin));
        if (!pin.allowed) throw new ApiError(403,'The existing portal PIN is invalid or temporarily locked.');
        const [existingPinHash,newPinHash] = await Promise.all([hashPortalPin(existingPin),hashPortalPin(newPin)]);
        shared = { ...identity,email:input.email,existingContextId:candidate.id,existingPinHash,newPinHash };
        const id = await auth.db.authorizedSystem(req.actor,['primary'],client => reserveEnrollment(client,req.actor,input,crypto.randomBytes(32).toString('hex'),shared));
        return res.status(202).json({ enrollmentId:id,signupId:identity.authUserId,verificationRequired:false,sharedIdentity:true,status:'pending_review',requiresSeparatePortalPin:true });
      } finally { await auth.provider('/logout?scope=local',{},session.access_token).catch(() => undefined); }
    }
    const token = crypto.randomBytes(32).toString('hex');
    let id: string;
    try { id = await auth.db.authorizedSystem(req.actor,['primary'],client => reserveEnrollment(client,req.actor,input,token)); }
    catch (error) { if ((error as any)?.code === '23505') throw new ApiError(409, 'This address or account is already awaiting verification.'); throw error; }
    // External email delivery is outside the database transaction. If it fails,
    // the reservation persists and can be cancelled or safely retried; no password
    // or raw nonce is ever saved in PineVela's database or sent to the browser.
    try {
      const data = await auth.provider('/signup',{ email:input.email,password:input.password,data:{ name:input.name,pinevela_enrollment_token:token } });
      if (data.access_token || data.session) throw new ApiError(503,'Email confirmation must be enabled.');
      const result = await auth.db.authorizedSystem(req.actor,['primary'],async client => {
        const record = await ownedEnrollment(client,req.actor,id);
        if (!record.auth_user_id || record.auth_user_id !== (data.user || data).id) throw new ApiError(503,'Signup did not match the reserved account.');
        return { enrollmentId:id,signupId:record.auth_user_id,verificationRequired:true };
      });
      return res.status(202).json(result);
    } catch (error) {
      // Give the initiating user a recovery handle even after a provider timeout.
      if (error instanceof ApiError) return res.status(error.status).json({ error:error.message,enrollmentId:id });
      throw error;
    }
  }));
  app.get('/api/auth/enrollments',primary,route(async (req,res) => {
    const rows = await auth.db.authorizedRead(req.actor,['primary'],client=>readOwnedEnrollments(client,req.actor));
    return res.json(rows);
  }));
  app.post('/api/auth/enrollments/:id/reactivate',primary,route(async (req,res) => {
    const record = await auth.db.authorizedSystem(req.actor,['primary'],client => ownedEnrollment(client,req.actor,req.params.id));
    if(record.kind==='manager')return confirmManagerReactivation(auth,req,res);
    if(record.kind==='seller')return confirmSellerReactivation(auth,req,res);
    if (record.kind !== 'resident' || !record.auth_user_id || !record.verified_at ||
        !((record.status === 'completed' && record.context_status === 'closed') || (record.status === 'pending_review' && record.context_status === 'pending')))
      throw new ApiError(409,'Only a released verified resident account can be reactivated.');
    if (typeof req.body?.password !== 'string' || req.body.password.length < 8 || req.body.password.length > 256)
      throw new ApiError(400,'Enter your resident account password.');
    const session = await auth.provider('/token?grant_type=password',{email:record.invited_email,password:req.body.password});
    try {
      const person = await auth.provider('/user',undefined,session.access_token);
      const identity = verifiedClaims(session.access_token,person);
      const email = String(person.email).toLowerCase();
      if (identity.authUserId !== record.auth_user_id || email !== record.invited_email)
        throw new ApiError(403,'The verified login does not match your saved resident account.');
      const pin = await auth.db.authorizedSystem(req.actor,['primary'],client => checkPortalPin(client,record.linked_context_id,req.body?.portalPin));
      if (!pin.allowed) throw new ApiError(403,'Enter the current resident portal PIN. After five failed attempts, wait 15 minutes.','portal_pin_required');
      const result = await auth.db.authorizedSystem(req.actor,['primary'],client => reactivateResident(client,req.actor,record.id,{...identity,email},pin.version));
      return res.json({...result,verified:true,requiresSeparateLogin:true});
    } finally { await auth.provider('/logout?scope=local',{},session.access_token).catch(() => undefined); }
  }));
  app.post('/api/auth/enrollments/:id/verify',primary,route(async (req,res) => {
    const record = await auth.db.authorizedSystem(req.actor,['primary'],client => ownedEnrollment(client,req.actor,req.params.id));
    if (record.status !== 'pending_email' || !record.auth_user_id || new Date(record.expires_at).getTime() <= Date.now())
      throw new ApiError(409,'This enrollment is not awaiting email verification.');
    let session;
    if (typeof req.body?.code === 'string' && req.body.code.trim()) {
      const proof = signupChallenge(req.body.code,signupProviderConfig().url);
      session = await auth.provider('/verify','token' in proof ? { email:record.invited_email,...proof } : proof);
    } else {
      // Confirmation links may already have been opened in the email client.
      // A real password sign-in proves the confirmed child identity without
      // trying to consume its single-use email token for a second time.
      if (typeof req.body?.password !== 'string' || req.body.password.length < 8 || req.body.password.length > 256)
        throw new ApiError(400,'Enter your email code, or confirm the email link and enter the sub-account password.');
      session = await auth.provider('/token?grant_type=password',{ email:record.invited_email,password:req.body.password });
    }
    try {
      const person = await auth.provider('/user',undefined,session.access_token);
      const verified = verifiedClaims(session.access_token,person);
      // Keep the primary cookie untouched. The child still needs its own sign-in.
      const result = await auth.db.authorizedSystem(req.actor,['primary'],client => finishEnrollment(client,req.actor,record.id,{ ...verified,email:String(person.email).toLowerCase() }));
      return res.json({ ...result,verified:true,requiresSeparateLogin:true });
    } finally { await auth.provider('/logout?scope=local',{},session.access_token).catch(() => undefined); }
  }));
  app.post('/api/auth/enrollments/:id/resend',primary,route(async (req,res) => {
    const record = await auth.db.authorizedSystem(req.actor,['primary'],client => ownedEnrollment(client,req.actor,req.params.id));
    if (record.status !== 'pending_email' || new Date(record.expires_at).getTime() <= Date.now()) throw new ApiError(409,'This enrollment is no longer awaiting confirmation.');
    if (!record.auth_user_id) throw new ApiError(409,'Cancel this incomplete signup and start enrollment again.');
    await auth.provider('/resend',{ type:'signup',email:record.invited_email });
    return res.status(202).json({ success:true });
  }));
  app.delete('/api/auth/enrollments/:id',primary,route(async (req,res) => {
    await auth.db.authorizedSystem(req.actor,['primary'],async client => {
      const record = await ownedEnrollment(client,req.actor,req.params.id);
      if (!['pending_email','pending_review'].includes(record.status) || (record.context_status && record.context_status !== 'pending')) throw new ApiError(409,'An activated account cannot be cancelled as an enrollment.');
      if (record.linked_context_id) {
        // Submitted product applications use their own withdrawal/governance rules.
        const submitted = await client.query(`select 1 from public.verification_cases where applicant_context_id = $1
          union all select 1 from public.seller_applications a join public.account_contexts x on x.id=a.seller_context_id where a.seller_context_id = $1 and a.registration_generation=x.seller_generation`, [record.linked_context_id]);
        if (submitted.rowCount) throw new ApiError(409,'Withdraw the submitted registration through its account workflow.');
        await client.query("update public.account_contexts set status = 'closed',updated_at = now() where id = $1", [record.linked_context_id]);
      }
      await client.query("update private.account_enrollments set status = 'cancelled' where id = $1", [record.id]);
    });
    return res.json({ success:true });
  }));
  app.post(['/api/room-keys/claim','/api/residents/onboard'],primary,roomAttempt,route(async (req,res) => {
    let result;
    try { result = await auth.db.authorizedSystem(req.actor,['primary'],client => claimResidentRoom(client,req.actor,uuid(req.body?.enrollmentId),req.body?.roomKey)); }
    catch (error) { if ((error as any)?.code === '23505') throw new ApiError(409,'This resident or room is already allocated.'); throw error; }
    return res.json(result);
  }));
  app.post('/api/room-keys/verify',primary,roomAttempt,route(async (req,res) => {
    const code = typeof req.body?.roomKey === 'string' ? req.body.roomKey.trim().toUpperCase() : '';
    if (!code || code.length > 100) throw new ApiError(400,'Enter your room activation key.');
    const key = await auth.db.authorizedSystem(req.actor,['primary'],async client => {
      await primaryOwner(client,req.actor);
      return (await client.query(`select k.code,r.room_number,b.name as block_name,f.floor_number,h.id as residence_id,h.name as residence_name
        from private.room_activation_keys k join public.rooms r on r.id = k.room_id
        join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
        join public.residences h on h.id = b.residence_id
        where k.code = $1 and k.revoked_at is null and k.claimed_at is null and k.claimed_by is null and private.residence_has_reviewed_setup(h.id)
          and not exists(select 1 from public.allocations a where a.room_id = r.id and a.ended_at is null)`,[code])).rows[0];
    });
    if (!key) throw new ApiError(404,'This room activation key is unavailable. Check with your manager.');
    return res.json({ valid:true,roomKey:key.code,hostelId:key.residence_id,hostelName:key.residence_name,
      blockName:key.block_name,roomNumber:key.room_number,floor:key.floor_number,status:'Available',isAssigned:false });
  }));
}
