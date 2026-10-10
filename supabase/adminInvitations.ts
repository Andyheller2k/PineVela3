import crypto from 'node:crypto';
import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { bodyFields,type SettingsGrant } from './adminSettings.js';
import { checkApprovalKey,deniedApprovalKey,requireApprovalGrant } from './adminGovernance.js';
import { AttemptBudgets } from '../resourceSecurity.js';
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
export function administratorInvitationToken(value:unknown) {
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(value))throw new ApiError(400,'Open a valid private administrator invitation.');
  return crypto.createHash('sha256').update(value).digest('hex');
}
export async function expireAdministratorInvitations(c:PoolClient) {
  await c.query(`update private.admin_invitations i set cancelled_at=clock_timestamp()
    where i.accepted_at is null and i.cancelled_at is null and (i.expires_at<=clock_timestamp() or not private.invitation_issuer_valid(i))`);
}
async function founder(c:PoolClient,a:VerifiedActor,grant:SettingsGrant) {
  await requireApprovalGrant(c,a,grant);
  if(!(await c.query("select context_id from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)
    throw new ApiError(403,'Only administrator #1 may invite or cancel an administrator.');
}
export async function createAdministratorInvitation(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,body:any) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");await founder(c,a,grant);await expireAdministratorInvitations(c);
  const subjects=(await c.query('select id from auth.users where lower(email)=$1',[body.email])).rows;
  if(subjects.length>1)throw new ApiError(409,'This mailbox has ambiguous Auth identities. Resolve them before inviting an administrator.');
  const subject=subjects[0]?.id || null;
  if(subject && (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind<>'primary'",[subject])).rowCount)
    throw new ApiError(409,'Use a separate verified administrator email. This identity already has another portal.');
  if((await c.query('select id from private.admin_invitations where invited_email=$1 and accepted_at is null and cancelled_at is null',[body.email])).rowCount)
    throw new ApiError(409,'This email already has an active invitation. Cancel it before issuing a replacement.');
  const slot=(await c.query(`select n from generate_series(2,5) n where not exists(select 1 from public.admin_memberships m where m.slot=n and m.status<>'removed')
    and not exists(select 1 from private.admin_invitations i where i.reserved_slot=n and i.accepted_at is null and i.cancelled_at is null) order by n limit 1`)).rows[0]?.n;
  if(!slot)throw new ApiError(409,'All five administrator slots are occupied or reserved.');
  const invitationToken=crypto.randomBytes(32).toString('base64url');
  const row=(await c.query(`insert into private.admin_invitations(invited_email,invited_name,invited_auth_user_id,reserved_slot,invitation_digest,
    created_by_context_id,issued_approval_key_version,expires_at) values($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '24 hours')
    returning id,reserved_slot,expires_at`,[body.email,body.name,subject,slot,administratorInvitationToken(invitationToken),a.contextId,grant.version])).rows[0];
  return {success:true,invitationId:row.id,invitationToken,email:body.email,slot:row.reserved_slot,expiresAt:row.expires_at,
    message:'Invitation reserved for 24 hours. Share the private link with its intended recipient; the token is shown once.'};
}
export async function cancelAdministratorInvitation(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");await founder(c,a,grant);await expireAdministratorInvitations(c);
  const row=(await c.query('select id,accepted_at,cancelled_at from private.admin_invitations where id=$1 for update',[id])).rows[0];
  if(!row)throw new ApiError(404,'Invitation not found.');
  if(row.accepted_at||row.cancelled_at)throw new ApiError(409,'This invitation was already accepted, cancelled or expired.');
  await c.query('update private.admin_invitations set cancelled_at=clock_timestamp() where id=$1',[id]);
  return {success:true,message:'Invitation cancelled. The reserved slot is available again.'};
}
export async function inspectAdministratorInvitation(c:PoolClient,a:VerifiedActor,digest:string) {
  // The caller is already bound to a real provider-verified primary session.
  if(a.kind!=='primary')throw new ApiError(403,'Sign in with the invited email in its primary account.');
  const row=(await c.query(`select i.* from private.admin_invitations i join auth.users u on u.id=$2
    where i.invitation_digest=$1 and i.accepted_at is null and i.cancelled_at is null and i.expires_at>clock_timestamp()
    and private.invitation_issuer_valid(i) and lower(u.email)=i.invited_email
    and (i.invited_auth_user_id is null or i.invited_auth_user_id=u.id)
    and private.invitation_identity_valid(u.id,i.invited_email) and private.current_context_id()=$3
    and not exists(select 1 from public.account_contexts x where x.auth_user_id=u.id and x.kind<>'primary') for update of i`,[digest,a.authUserId,a.contextId])).rows[0];
  if(!row)throw new ApiError(403,'This invitation is unavailable for your verified account. Check the invited email, expiration or cancellation.');
  return row;
}
export async function acceptAdministratorInvitation(c:PoolClient,a:VerifiedActor,digest:string) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  const i=await inspectAdministratorInvitation(c,a,digest);
  if((await c.query("select context_id from public.admin_memberships where slot=$1 and status<>'removed'",[i.reserved_slot])).rowCount)
    throw new ApiError(409,'The reserved administrator slot is no longer available.');
  await c.query("select set_config('pinevela.admin_invitation_id',$1,true),set_config('pinevela.admin_invitation_digest',$2,true)",[i.id,digest]);
  const context=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[a.authUserId])).rows[0].id;
  await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[context,i.reserved_slot]);
  await c.query('insert into private.admin_secrets(context_id) values($1)',[context]);
  await c.query('update private.admin_invitations set accepted_context_id=$2,accepted_at=clock_timestamp() where id=$1',[i.id,context]);
  return {success:true,id:context,slot:i.reserved_slot,email:i.invited_email,keyEnrollmentRequired:true,
    message:'Invitation accepted. Sign in as an administrator, then enroll your separate approval and settings keys.'};
}
export class SupabaseAdminInvitations {
  private budgets=new AttemptBudgets();
  constructor(readonly auth:SupabaseAuth){}
  private async grant(a:VerifiedActor,key:unknown) {
    this.budgets.reserve([{scope:'administrator-approval-key',identity:a.contextId,maximum:30,windowMs:60000}]);
    const grant=await this.auth.db.authorizedSystem(a,['admin'],c=>checkApprovalKey(c,a,key));deniedApprovalKey(grant);return grant;
  }
  async create(a:VerifiedActor,body:any) {
    bodyFields(body,['name','email','privateKey']);
    if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.email!=='string'||body.email.length>254)
      throw new ApiError(400,'Provide an administrator name and valid email.');
    const email=body.email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,'Provide a valid administrator email.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>createAdministratorInvitation(c,a,grant,{name:body.name.trim(),email}));
  }
  async cancel(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey']);const invitation=uuid(id),grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>cancelAdministratorInvitation(c,a,grant,invitation));
  }
}
export function installAdminInvitations(app:Express,auth:SupabaseAuth) {
  const service=new SupabaseAdminInvitations(auth),budgets=new AttemptBudgets();
  app.post('/api/admin/governance/invitations',auth.require(['admin']),route(async(req,res)=>res.json(await service.create(req.actor,req.body))));
  app.post('/api/admin/governance/invitations/:id/cancel',auth.require(['admin']),route(async(req,res)=>res.json(await service.cancel(req.actor,req.params.id,req.body))));
  for(const action of ['inspect','accept'] as const)app.post(`/api/auth/admin-invitation/${action}`,auth.require(['primary']),route(async(req,res)=>{
    bodyFields(req.body,['invitationToken']);const digest=administratorInvitationToken(req.body.invitationToken);
    budgets.reserve([{scope:'administrator-invitation',identity:req.actor.contextId,maximum:20,windowMs:60000}]);
    const result=await auth.db.authorizedSystem(req.actor,['primary'],async c=>{
      await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
      if(action==='accept')return acceptAdministratorInvitation(c,req.actor,digest);
      const i=await inspectAdministratorInvitation(c,req.actor,digest);return {email:i.invited_email,name:i.invited_name,slot:i.reserved_slot,expiresAt:i.expires_at};
    });res.json(result);
  }));
}
