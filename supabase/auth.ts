import { installPrimaryEmailReentry } from './primaryEmailReentry.js';
import {accountFeaturesForRequest,requireAccountAccess} from './accountAccess.js';
import crypto from 'node:crypto';
import { managerKeyNeeded,managerBootstrapAllowed,checkManagerKey,managerKeyError } from './managerKeys.js';
import type { Express, Request, Response, RequestHandler } from 'express';
import { installGoogleAuth, googleAccountMissing, googlePrimaryClosed, googleIdentity, googlePublicOrigin, type GoogleSession } from '../googleAuth.js';
import {installGoogleManagerEnrollment} from './googleManagerEnrollment.js';
import { initializeRetainedGooglePrimary,reopenRetainedPrimary,unavailableAccountError } from './googleSignup.js';
import { signupProviderConfig, signupChallenge, requireConfirmationSettings } from '../supabaseSignup.js';
import { ApiError, UUID, uuid, type VerifiedActor, SupabaseDatabase } from './db.js';
import { WorkPool } from '../resourceSecurity.js';
import { checkPortalPin } from './portalAccess.js';
import { maintenanceError } from './platformMaintenance.js';

type Session = GoogleSession & { user?: any };
export type AuthRequest = Request & { actor: VerifiedActor; accessToken: string };
export const roleForKind: Record<string, string> = { primary: 'user', resident: 'student', manager: 'manager', seller: 'merchant', staff: 'staff', officer: 'verification_team', admin: 'admin' };
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
const ACCESS = 'pv_sb_access', REFRESH = 'pv_sb_refresh';
export function readCookie(req: Request, name: string): string {
  const matches = String(req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return '';
  try { return decodeURIComponent(matches[0].slice(name.length + 1)); } catch { return ''; }
}
export function sessionCookies(res: Response, session: Session) {
  if (!session.access_token || !session.refresh_token) throw new ApiError(401, 'Sign-in did not return a complete session.');
  res.set('Cache-Control', 'private, no-store');
  // The access cookie outlives the JWT so expiry can trigger a refresh. Tokens never
  // enter localStorage, responses, application profiles, or the JSON database.
  for (const [name, token] of [[ACCESS, session.access_token], [REFRESH, session.refresh_token]]) {
    res.cookie(name, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60_000 });
  }
}
export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS, cookieOptions); res.clearCookie(REFRESH, cookieOptions);
  res.clearCookie('pv_auth_token', cookieOptions);
}

/** Only the native officer session guard's fixed denial becomes a sign-in error. */
function officerBindingError(error:unknown):never {
  if((error as any)?.code==='42501'&&(error as any)?.message==='Fresh verified officer sign-in required')
    throw new ApiError(401,'Sign out and sign in again with your verified officer email. Earlier sessions cannot enter a newly activated or restored officer portal.','fresh_officer_sign_in_required');
  throw error;
}

/** Claims are identifiers only AFTER Supabase /user has verified the token. */
export function verifiedClaims(token: string, user: any): { authUserId: string; sessionId: string } {
  let claims: any;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { throw new ApiError(401, 'Invalid session.'); }
  if (!UUID.test(user?.id || '') || claims?.sub !== user.id || !UUID.test(claims?.session_id || '') ||
      claims.role !== 'authenticated' || user.is_anonymous || !Number.isFinite(Date.parse(user.email_confirmed_at))) throw new ApiError(401, 'A verified account is required.');
  return { authUserId: user.id, sessionId: claims.session_id };
}

export class SupabaseAuth {
  private refreshing = new Map<string, Promise<Session>>();
  private requests = new WorkPool(8, 32);
  constructor(readonly db: SupabaseDatabase) {}
  async provider(route: string, body?: unknown, token?: string, method?: string): Promise<any> {
    const config = signupProviderConfig();
    let response: globalThis.Response;
    try {
      response = await this.requests.run(() => fetch(`${config.url}/auth/v1${route}`, {
        method: method || (body === undefined ? 'GET' : 'POST'),
        headers: { apikey: config.key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store',
      }));
    } catch { throw new ApiError(503, 'Authentication is temporarily unavailable.'); }
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) throw new ApiError(429, 'Too many authentication attempts. Please wait.');
      if (response.status >= 500) throw new ApiError(503, 'Authentication is temporarily unavailable.');
      if (route === '/user' && method === 'PUT') {
        const errors: Record<string, [number, string]> = {
          weak_password: [400, 'Choose a stronger password that meets the email provider requirements.'],
          same_password: [400, 'Choose a password different from your current password.'],
          current_password_required: [403, 'Your current email password is required.'],
          current_password_mismatch: [403, 'The current email password is incorrect.'],
          reauthentication_needed: [409, 'Sign in again before updating your password.'],
          reauthentication_not_valid: [400, 'Your password-change proof expired. Start again.'],
          insufficient_aal: [403, 'Complete the required multi-factor authentication before changing your password.'],
          user_sso_managed: [403, 'Manage this password through your organization’s sign-in provider.'],
        };
        const safe = errors[data?.error_code];
        if (safe) throw new ApiError(safe[0], safe[1]);
        throw new ApiError(response.status === 401 ? 401 : 400, 'The email password update could not be confirmed. Sign in or request a new recovery code before retrying.');
      }
      if (route === '/verify') throw new ApiError(400, 'The email code or link is invalid or expired. Request a new one.');
      if (route === '/recover' && data?.error_code === 'email_address_not_authorized')
        throw new ApiError(503, 'The configured development email service cannot send to this address. PineVela needs a configured SMTP service.');
      throw new ApiError(route.startsWith('/token') || route === '/user' ? 401 : 400, route.startsWith('/token') ? 'Invalid credentials or expired session.' : 'Authentication request could not be verified.');
    }
    return data;
  }
  async bind(session: Session, preferredKind?: string, portalPin?: unknown, retainedGoogleSignup = false, retainedEmailReentry = false): Promise<VerifiedActor> {
    const user = await this.provider('/user', undefined, session.access_token);
    const identity = verifiedClaims(session.access_token, user);
    if (retainedGoogleSignup && googleIdentity(user).id !== identity.authUserId) throw new ApiError(401,'Google identity does not match.');
    const result = await this.db.system(async client => {
      // Sign-in must not recreate a binding while a room/portal is closing.
      // Acquire lifecycle locks before native session and context row locks.
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0))");
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended('account-policies',0))");
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended('platform-maintenance',0))");
      const live = await client.query(`select id from auth.sessions where id = $1 and user_id = $2
        and (not_after is null or not_after > now()) for share`, [identity.sessionId, identity.authUserId]);
      if (!live.rowCount) throw new ApiError(401, 'Your session has ended. Please sign in again.');
      // Only an explicit, provider-verified Google signup may initialize a retained
      // Auth subject. Ordinary login never backfills disposable accounts or roles.
      if (retainedGoogleSignup) {
        if (!(await client.query('select private.platform_available() as available')).rows[0].available) throw maintenanceError();
        await initializeRetainedGooglePrimary(client,identity);
      }
      if(retainedEmailReentry)await reopenRetainedPrimary(client,identity,'verified-email-reentry');
      const contexts = await client.query(`select c.id, c.kind from public.account_contexts c
        join public.profiles p on p.id = c.auth_user_id
        where c.auth_user_id = $1 and c.status = 'active' and ($2::text is null or c.kind = $2)
          and (c.kind <> 'admin' or private.administrator_session_allowed(c.id,$3::uuid) and exists (select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'))
          and (c.kind <> 'resident' or exists (select 1 from public.allocations a where a.resident_context_id = c.id and a.ended_at is null))
          and (c.kind <> 'staff' or exists (select 1 from public.staff_assignments s where s.staff_context_id = c.id and s.status = 'active' and s.ended_at is null))
        order by (c.kind = 'admin') desc, (c.kind <> 'primary') desc for share of c`, [identity.authUserId, preferredKind || null, identity.sessionId]);
      if (!contexts.rowCount) throw await unavailableAccountError(client,identity.authUserId);
      if (!preferredKind && contexts.rows.filter(c => ['resident','seller'].includes(c.kind)).length > 1)
        throw new ApiError(400,'Choose your resident or seller account to sign in.','account_choice_required');
      const context = contexts.rows[0];
      await requireAccountAccess(client,context.id,[],identity.sessionId);
      if (context.kind!=='admin' && !(await client.query('select private.platform_available() as available')).rows[0].available) throw maintenanceError();
      const pin = await checkPortalPin(client,context.id,portalPin);
      if (!pin.allowed) return null;
      await client.query(`insert into private.account_sessions(session_id, auth_user_id, active_context_id,portal_pin_version)
        values ($1,$2,$3,$4) on conflict(session_id) do update set active_context_id = excluded.active_context_id,
        portal_pin_version = excluded.portal_pin_version,updated_at = now()
        where account_sessions.auth_user_id = excluded.auth_user_id`, [identity.sessionId, identity.authUserId, context.id,pin.version]);
      return { ...identity, contextId: context.id, kind: context.kind };
    }).catch(officerBindingError);
    if (!result) throw new ApiError(403,'A valid portal access PIN is required. After five failed attempts, wait 15 minutes.','portal_pin_required');
    return result;
  }
  async authenticate(req: Request, res: Response): Promise<{ actor: VerifiedActor; accessToken: string }> {
    let token = readCookie(req, ACCESS);
    if (!token || token.length > 12000) throw new ApiError(401, 'Please sign in.');
    let user: any;
    try { user = await this.provider('/user', undefined, token); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      let expiry: number;
      try { expiry = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp; } catch { throw error; }
      if (!Number.isFinite(expiry) || expiry * 1000 > Date.now()) throw error;
      const refresh = readCookie(req, REFRESH);
      if (!refresh || refresh.length > 2048) throw error;
      const digest = crypto.createHash('sha256').update(refresh).digest('hex');
      let pending = this.refreshing.get(digest);
      if (!pending) {
        pending = this.provider('/token?grant_type=refresh_token', { refresh_token: refresh });
        this.refreshing.set(digest, pending);
      }
      let session: Session;
      try { session = await pending; } finally { if (this.refreshing.get(digest) === pending) this.refreshing.delete(digest); }
      sessionCookies(res, session); token = session.access_token;
      user = await this.provider('/user', undefined, token);
    }
    const identity = verifiedClaims(token, user);
    const actor = await this.db.system(async client => {
      const binding = await client.query(`select s.active_context_id, c.kind from private.account_sessions s
        join public.account_contexts c on c.id = s.active_context_id and c.auth_user_id = s.auth_user_id
        join auth.sessions live on live.id = s.session_id and live.user_id = s.auth_user_id
        where s.session_id = $1 and s.auth_user_id = $2 and c.status = 'active'
          and (live.not_after is null or live.not_after > now())
          and private.portal_session_allowed(c.id,s.portal_pin_version)
          and (c.kind <> 'admin' or private.administrator_session_allowed(c.id,s.session_id) and exists (select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'))
          and (c.kind <> 'resident' or exists (select 1 from public.allocations a where a.resident_context_id = c.id and a.ended_at is null))
          and (c.kind <> 'staff' or exists (select 1 from public.staff_assignments a where a.staff_context_id = c.id and a.status = 'active' and a.ended_at is null))`, [identity.sessionId, identity.authUserId]);
      if (!binding.rowCount) throw new ApiError(401, 'Your session has ended. Please sign in again.');
      await requireAccountAccess(client,binding.rows[0].active_context_id,[],identity.sessionId);
      return { ...identity, contextId: binding.rows[0].active_context_id, kind: binding.rows[0].kind };
    });
    return { actor, accessToken: token };
  }
  require(kinds?: string[]): RequestHandler {
    return (req, res, next) => {
      this.authenticate(req, res).then(async ({ actor, accessToken }) => {
        if (kinds && !kinds.includes(actor.kind)) throw new ApiError(403, 'This account cannot perform that action.');
        actor.requiredFeatures=accountFeaturesForRequest(req.method,req.path);
        if(actor.requiredFeatures.length)await this.db.authorizedSystem(actor,[actor.kind],async()=>undefined);
        if (actor.kind === 'manager' && managerKeyNeeded(req)) {
          const grant = await this.db.authorizedSystem(actor,['manager'],async client =>
            await managerBootstrapAllowed(client,actor,req.path) ? {allowed:true,version:undefined,locked:false} : checkManagerKey(client,actor,req.get('X-PineVela-Manager-Key')));
          if (!grant.allowed) {
            if (grant.locked) throw new ApiError(429,'Too many manager secret-key attempts. Wait 15 minutes.','manager_key_locked');
            throw managerKeyError();
          }
          (actor as VerifiedActor).managerKeyVersion = grant.version;
        }
        Object.assign(req, { actor, accessToken }); res.set('Cache-Control', 'private, no-store'); next();
      }).catch(next);
    };
  }
  async switchContext(actor: VerifiedActor, id: string, portalPin?: unknown) {
    const result = await this.db.authorizedSystem(actor,[actor.kind],async client => {
      const target = await client.query(`select id,kind from public.account_contexts where id = $1
        and auth_user_id = $2 and status = 'active' for share`,[uuid(id),actor.authUserId]);
      if (!target.rowCount) throw new ApiError(403,'That account is not available to this identity.');
      await requireAccountAccess(client,id,[],actor.sessionId);
      if (target.rows[0].kind!=='admin' && !(await client.query('select private.platform_available() as available')).rows[0].available) throw maintenanceError();
      const pin = await checkPortalPin(client,id,portalPin);
      if (!pin.allowed) return null;
      const result = await client.query(`update private.account_sessions s set active_context_id = c.id, updated_at = now()
        ,portal_pin_version = $4
        from public.account_contexts c, auth.sessions live where s.session_id = $1 and s.auth_user_id = $2
        and live.id = s.session_id and live.user_id = s.auth_user_id and (live.not_after is null or live.not_after > now())
        and c.id = $3 and c.auth_user_id = s.auth_user_id and c.status = 'active'
        and (c.kind <> 'admin' or private.administrator_session_allowed(c.id,s.session_id) and exists (select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'))
        and (c.kind <> 'resident' or exists (select 1 from public.allocations a where a.resident_context_id = c.id and a.ended_at is null))
        and (c.kind <> 'staff' or exists (select 1 from public.staff_assignments a where a.staff_context_id = c.id and a.status = 'active' and a.ended_at is null))
        returning c.id, c.kind`, [actor.sessionId, actor.authUserId, uuid(id),pin.version]);
      if (!result.rowCount) throw new ApiError(403, 'That account is not available to this identity.');
      return { ...actor, contextId: result.rows[0].id, kind: result.rows[0].kind };
    }).catch(officerBindingError);
    if (!result) throw new ApiError(403,'A valid portal access PIN is required. After five failed attempts, wait 15 minutes.','portal_pin_required');
    return result;
  }
  async projection(actor: VerifiedActor) {
    // Invitation fields are private. Read only this already verified officer's
    // completed receipt; all public projection reads retain their RLS role.
    const officer = actor.kind==='officer' ? await this.db.authorizedSystem(actor,['officer'],async client=>
      (await client.query(`select e.enrollment_fields->>'fullName' as full_name,e.enrollment_fields->>'phone' as phone,
        e.enrollment_fields->>'assignedZone' as assigned_zone from private.account_enrollments e
        where e.kind='officer' and e.status='completed' and e.linked_context_id=$1 and e.auth_user_id=$2`,[actor.contextId,actor.authUserId])).rows[0]) : undefined;
    return this.db.readActor(actor, async client => {
      const { rows: [person] } = await client.query('select display_name, email, phone, avatar_path,private.current_account_access() as account_access from public.profiles where id = $1', [actor.authUserId]);
      if (!person) throw new ApiError(401, 'Your profile is no longer available.');
      let seller: { isDigitalMarketOnly?:boolean;storeId?:string | null;merchantSetupCompleted?:boolean;merchantRegistrationFeePaid?:boolean } = {};
      if (actor.kind === 'seller') {
        const store = (await client.query(`select s.id,s.setup_completed_at,exists(select 1 from public.payments p
          where p.store_id = s.id and p.purpose = 'store_activation' and private.payment_grants_access(p.id)) as activation_paid
          from public.stores s join public.account_contexts x on x.id=s.seller_context_id where s.seller_context_id = $1 and s.registration_generation=x.seller_generation`,[actor.contextId])).rows[0];
        seller = { isDigitalMarketOnly:true,storeId:store?.id || null,merchantSetupCompleted:Boolean(store?.setup_completed_at),merchantRegistrationFeePaid:Boolean(store?.activation_paid) };
      }
      const room = actor.kind === 'resident' ? (await client.query(`select a.room_id,r.room_number,b.name as block_name,h.id as residence_id,h.name as residence_name
        from public.allocations a join public.rooms r on r.id = a.room_id join public.floors f on f.id = r.floor_id
        join public.blocks b on b.id = f.block_id join public.residences h on h.id = b.residence_id
        where a.resident_context_id = $1 and a.ended_at is null`,[actor.contextId])).rows[0] : null;
      return { id: actor.contextId, profileId: actor.authUserId, name: officer?.full_name ?? person.display_name, email: person.email,
        phone: officer?.phone ?? person.phone,accountAccess:person.account_access, photo: person.avatar_path, avatar: person.avatar_path,
        photoUrl:person.avatar_path,avatarUrl:person.avatar_path,profilePicture:person.avatar_path,
        role: roleForKind[actor.kind], token: '', isVerified: true,...seller,
        ...(actor.kind === 'officer' ? {officerId:actor.contextId,assignedZone:officer?.assigned_zone ?? null} : {}),
        ...(room ? { roomId:room.room_id,roomNumber:room.room_number,blockName:room.block_name,hostelId:room.residence_id,hostelName:room.residence_name } : {}) };
    });
  }
}

const route = (work: (req: AuthRequest, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
export function installSupabaseAuth(app: Express, auth: SupabaseAuth) {
  app.get('/api/auth/account-access',auth.require(),route(async(req,res)=>{
    res.json(await auth.db.actor(req.actor,async client=>(await client.query('select private.current_account_access() as access')).rows[0].access));
  }));
  const passwordLogin = (kind?: string) => route(async (req, res) => {
    const email = String(req.body?.usernameOrEmail || req.body?.email || (kind === 'seller' ? req.body?.studentEmail : '') || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof req.body?.password !== 'string' || !req.body.password || req.body.password.length > 256) throw new ApiError(400, 'Enter your email address and password.');
    const desired = kind || req.body?.accountKind;
    if (desired && (typeof desired !== 'string' || !Object.hasOwn(roleForKind,desired))) throw new ApiError(400,'Choose a valid account type.');
    const session = await auth.provider('/token?grant_type=password', { email, password: req.body.password });
    try {
      const actor = await auth.bind(session,desired,req.body?.portalPin);
      const user = await auth.projection(actor);
      sessionCookies(res, session);
      return res.json(kind === 'seller' ? { user,token:'',needsSetup:!user.merchantSetupCompleted || !user.merchantRegistrationFeePaid } : kind === 'officer' ? {success:true,user,token:''} : user);
    } catch (error) { await auth.provider('/logout?scope=local',{},session.access_token).catch(() => undefined); throw error; }
  });
  app.post('/api/auth/login', passwordLogin());
  app.post('/api/digital-market/login', passwordLogin('seller'));
  app.post('/api/auth/verification-team-login', passwordLogin('officer'));
  app.post('/api/verification-teams/login', passwordLogin('officer'));
  app.post('/api/auth/google/start',(req,_res,next)=>{
    if (req.body?.mode!=='signup') return next();
    auth.db.system(async c=>(await c.query('select private.platform_available() as available')).rows[0].available)
      .then(available=>available ? next() : next(maintenanceError())).catch(next);
  });
  installGoogleManagerEnrollment(app,auth);
  installGoogleAuth(app, async (identity, mode, session) => {
    try {
      const actor = await auth.bind(session,undefined,undefined,mode==='signup');
      if (actor.authUserId !== identity.id) throw new ApiError(401, 'Google identity does not match.');
      return actor.kind==='admin'?{token:session.access_token,redirectTo:'/admin/dashboard' as const}
        :actor.kind==='officer'?{token:session.access_token,redirectTo:'/field-officer' as const}
        :actor.kind==='manager'?{token:session.access_token,redirectTo:'/manager/dashboard' as const}:session.access_token;
    } catch (error) {
      await auth.provider('/logout?scope=local',{},session.access_token).catch(()=>undefined);
      if(error instanceof ApiError && error.code==='google_profile_missing')googleAccountMissing();
      if(error instanceof ApiError && error.code==='google_primary_closed')googlePrimaryClosed();
      throw error;
    }
  }, (res, _token, session) => { sessionCookies(res, session!); });
  installPrimaryEmailReentry(app,auth);
  app.post('/api/auth/register-unified', route(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!name || name.length > 120 || !email.includes('@') || typeof password !== 'string' || password.length < 8 || password.length > 256) throw new ApiError(400, 'Enter your name, valid email and a password of at least 8 characters.');
    requireConfirmationSettings(await auth.provider('/settings'));
    // Deliberately whitelist metadata: signup cannot supply a role or ownership.
    const data = await auth.provider('/signup', { email, password, data: { name } });
    if (data.access_token || data.session) throw new ApiError(503, 'Email confirmation must be enabled.');
    return res.status(202).json({ signupId: (data.user || data).id, verificationRequired: true });
  }));
  app.post('/api/auth/verify-unified', route(async (req, res) => {
    const config = signupProviderConfig(), email = String(req.body?.email || '').trim().toLowerCase();
    const proof = signupChallenge(req.body?.code, config.url);
    const session = await auth.provider('/verify', 'token' in proof ? { email, ...proof } : proof);
    const person = await auth.provider('/user', undefined, session.access_token);
    if (person.id !== uuid(req.body?.signupId) || String(person.email).toLowerCase() !== email) throw new ApiError(400, 'Confirmation does not match this signup.');
    const actor = await auth.bind(session); sessionCookies(res, session);
    return res.json({ verified: true, user: await auth.projection(actor) });
  }));
  app.get('/api/auth/me', auth.require(), route(async (req, res) => res.json(await auth.projection(req.actor))));
  app.get('/api/auth/contexts', auth.require(), route(async (req, res) => {
    const rows = await auth.db.actor(req.actor, async client => (await client.query('select id, kind, status from public.account_contexts where auth_user_id = $1 order by created_at', [req.actor.authUserId])).rows);
    return res.json(rows.map(c => ({ ...c, role: roleForKind[c.kind] })));
  }));
  app.post('/api/auth/context', auth.require(), route(async (req, res) => res.json(await auth.projection(await auth.switchContext(req.actor, req.body?.contextId,req.body?.portalPin)))));
  app.post('/api/auth/logout', route(async (req, res) => {
    let verified: Awaited<ReturnType<SupabaseAuth['authenticate']>>;
    try { verified = await auth.authenticate(req, res); }
    catch (error) {
      clearAuthCookies(res);
      if (error instanceof ApiError && (error.status === 401||error.code==='account_banned')) return res.json({ success: true });
      throw error;
    }
    // Binding deletion immediately denies access, even if the provider is down.
    await auth.db.system(client => client.query('delete from private.account_sessions where session_id = $1 and auth_user_id = $2', [verified.actor.sessionId, verified.actor.authUserId]));
    clearAuthCookies(res);
    await auth.provider('/logout?scope=local', {}, verified.accessToken).catch(() => undefined);
    return res.json({ success: true });
  }));
  // Cross-origin mutations are denied before parsing credentials or performing writes.
  // Install csrfBoundary ahead of these routes in the app factory.
}
export const csrfBoundary: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (req.get('sec-fetch-site') === 'cross-site') return next(new ApiError(403, 'Cross-site request denied.'));
  if (origin) {
    try { if (new URL(origin).origin !== googlePublicOrigin(req)) return next(new ApiError(403, 'Cross-site request denied.')); }
    catch { return next(new ApiError(403, 'Invalid request origin.')); }
  }
  next();
};
