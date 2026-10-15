import crypto from 'node:crypto';
import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { bodyFields,type SettingsGrant } from './adminSettings.js';
import { checkApprovalKey,deniedApprovalKey,requireApprovalGrant } from './adminGovernance.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { notify,notifyPrimaryOwner } from './notifications.js';

const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
export function officerInvitationDigest(value:unknown) {
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(value))throw new ApiError(400,'Open a valid private officer invitation.');
  return crypto.createHash('sha256').update(value).digest('hex');
}
function field(value:unknown,label:string,max:number,required=true) {
  if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new ApiError(400,`Enter a valid ${label}.`);
  return value.trim();
}
export async function expireOfficerInvitations(c:PoolClient) {
  await c.query(`update private.account_enrollments e set status=case when e.expires_at<=clock_timestamp() then 'expired' else 'cancelled' end
    where e.kind='officer' and e.status='pending_email' and(e.expires_at<=clock_timestamp() or not private.officer_invitation_issuer_valid(e))`);
}
export async function officerInvitationRows(c:PoolClient) {
  await expireOfficerInvitations(c);
  return (await c.query(`select e.id,e.invited_email as email,e.enrollment_fields->>'fullName' as "fullName",
    e.enrollment_fields->>'phone' as phone,e.enrollment_fields->>'assignedZone' as "assignedZone",
    case e.status when 'pending_email' then 'invited' when 'completed' then 'accepted' else e.status end as status,
    e.initiator_context_id as "invitedBy",e.linked_context_id as "officerId",e.created_at as "createdAt",e.expires_at as "expiresAt",
    e.verified_at as "acceptedAt" from private.account_enrollments e where e.kind='officer' order by e.created_at desc,e.id limit 100`)).rows;
}
/** Used only inside an authorized live administrator transaction. */
export async function createOfficerInvitation(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,input:{fullName:string;email:string;phone:string;assignedZone:string}) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  await requireApprovalGrant(c,a,grant);await expireOfficerInvitations(c);
  const subjects=(await c.query('select id from auth.users where lower(email)=$1',[input.email])).rows;
  if(subjects.length>1)throw new ApiError(409,'This mailbox has ambiguous identities. Resolve them before issuing an officer invitation.');
  const subject=subjects[0]?.id||null;
  if(subject&&(await c.query(`select 1 from public.account_contexts where auth_user_id=$1 and kind<>'primary'
      union all select 1 from public.profiles where id=$1 and primary_owner_id is not null`,[subject])).rowCount)
    throw new ApiError(409,'Use a separate verified official email. This identity already has another portal.');
  if((await c.query(`select 1 from private.account_enrollments where lower(invited_email)=$1 and status in('pending_email','pending_review')`,[input.email])).rowCount)
    throw new ApiError(409,'This email already has an unfinished invitation or account enrollment.');
  const invitationToken=crypto.randomBytes(32).toString('base64url');
  const e=(await c.query(`insert into private.account_enrollments(initiator_context_id,kind,invited_email,token_digest,enrollment_fields,
    expires_at,officer_approval_key_version,officer_reserved_subject)
    values($1,'officer',$2,$3,$4,clock_timestamp()+interval'24 hours',$5,$6) returning id,expires_at`,
    [a.contextId,input.email,officerInvitationDigest(invitationToken),JSON.stringify({fullName:input.fullName,phone:input.phone,assignedZone:input.assignedZone}),grant.version,subject])).rows[0];
  return {success:true,invitationId:e.id,invitationToken,...input,expiresAt:e.expires_at,
    message:'Share this private invitation with the intended officer. They must verify their own Google/email identity and accept within 24 hours.'};
}
export async function cancelOfficerInvitation(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");await requireApprovalGrant(c,a,grant);await expireOfficerInvitations(c);
  const e=(await c.query("select status from private.account_enrollments where id=$1 and kind='officer' for update",[id])).rows[0];
  if(!e)throw new ApiError(404,'Officer invitation not found.');
  if(e.status!=='pending_email')throw new ApiError(409,'This invitation was already accepted, cancelled or expired.');
  await c.query("update private.account_enrollments set status='cancelled' where id=$1",[id]);
  return {success:true,message:'Officer invitation cancelled.'};
}
export async function inspectOfficerInvitation(c:PoolClient,a:VerifiedActor,digest:string) {
  if(a.kind!=='primary')throw new ApiError(403,'Sign in with the invited official email in its primary account.');
  const e=(await c.query(`select e.*,(select o.status from public.account_contexts o
      where o.id=e.linked_context_id and o.auth_user_id=e.auth_user_id and o.kind='officer') as officer_status from private.account_enrollments e
    where e.kind='officer' and e.token_digest=$1 and lower(e.invited_email)=(select lower(email) from auth.users where id=$2)
    and(e.officer_reserved_subject is null or e.officer_reserved_subject=$2)
    and private.current_context_id()=$3 and private.invitation_identity_valid($2,e.invited_email)
    and((e.status='pending_email' and e.expires_at>clock_timestamp() and private.officer_invitation_issuer_valid(e)
      and not exists(select 1 from public.account_contexts x where x.auth_user_id=$2 and x.kind<>'primary'))
      or(e.status='completed' and e.auth_user_id=$2 and exists(select 1 from public.account_contexts o
        where o.id=e.linked_context_id and o.auth_user_id=$2 and o.kind='officer')))
    for update of e`,[digest,a.authUserId,a.contextId])).rows[0];
  if(!e)throw new ApiError(403,'This invitation is unavailable for your verified account. Check the invited email, expiration or cancellation.');
  return e;
}
export async function acceptOfficerInvitation(c:PoolClient,a:VerifiedActor,digest:string) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  const e=await inspectOfficerInvitation(c,a,digest);
  if(e.status==='completed')return {success:true,id:e.linked_context_id,alreadyAccepted:true,officerStatus:e.officer_status,
    accessAvailable:e.officer_status==='active',requiresSeparateLogin:e.officer_status==='active'};
  await c.query("select set_config('pinevela.officer_enrollment_id',$1,true),set_config('pinevela.officer_invitation_digest',$2,true)",[e.id,digest]);
  const id=(await c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,'officer','active')returning id",[a.authUserId])).rows[0].id;
  await c.query("update private.account_enrollments set auth_user_id=$2,linked_context_id=$3,status='completed',verified_at=clock_timestamp() where id=$1",[e.id,a.authUserId,id]);
  return {success:true,id,alreadyAccepted:false,officerStatus:'active',accessAvailable:true,requiresSeparateLogin:true,
    message:'Officer invitation accepted. Sign out and sign in again through the main login page to open your assigned inspection workspace.'};
}
export async function changeOfficerStatus(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,status:string) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");await requireApprovalGrant(c,a,grant);
  const e=(await c.query("select id,status from public.account_contexts where id=$1 and kind='officer' for update",[id])).rows[0];
  if(!e)throw new ApiError(404,'Registered officer not found.');
  if(e.status===status)return {success:true,officer:e,alreadyChanged:true};
  const officer=(await c.query('update public.account_contexts set status=$2 where id=$1 returning id,status',[id,status])).rows[0];
  await c.query('delete from private.account_sessions where active_context_id=$1',[id]);
  await c.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values($1,'officer_status_changed','officer',$2,$3)`,[a.contextId,id,JSON.stringify({status})]);
  const admins=(await c.query(`select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    where m.status='active' and x.kind='admin' and x.status='active'`)).rows.map(r=>r.context_id);
  await notify(c,admins,{category:'verification',title:'Verification Officer Status Updated',message:`A registered verification officer is now ${status}.`,sender:a.contextId,link:'verification-officers'});
  await notifyPrimaryOwner(c,id,{category:'verification',title:'Verification Officer Access Updated',message:status==='active'?'Your verification officer portal is active. Sign in again to open your assigned inspections.':`Your verification officer portal is ${status}.`,sender:a.contextId});
  return {success:true,officer,alreadyChanged:false};
}
export class SupabaseOfficerInvitations {
  private budgets=new AttemptBudgets();
  constructor(readonly auth:SupabaseAuth){}
  private async grant(a:VerifiedActor,key:unknown) {
    this.budgets.reserve([{scope:'administrator-approval-key',identity:a.contextId,maximum:30,windowMs:60000}]);
    const grant=await this.auth.db.authorizedSystem(a,['admin'],c=>checkApprovalKey(c,a,key));deniedApprovalKey(grant);return grant;
  }
  async create(a:VerifiedActor,body:any) {
    bodyFields(body,['fullName','email','phone','assignedZone','privateKey']);
    const email=field(body.email,'official email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,'Enter a valid official email.');
    const input={fullName:field(body.fullName,'officer name',120),email,phone:field(body.phone,'contact number',40),assignedZone:field(body.assignedZone,'inspection zone',200)};
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>createOfficerInvitation(c,a,grant,input));
  }
  async cancel(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey']);const target=uuid(id),grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>cancelOfficerInvitation(c,a,grant,target));
  }
  async status(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['status','privateKey']);if(!['active','suspended','inactive'].includes(body.status))throw new ApiError(400,'Choose active, suspended or inactive.');
    const target=uuid(id),grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>changeOfficerStatus(c,a,grant,target,body.status==='inactive'?'closed':body.status));
  }
}
export function installOfficerInvitations(app:Express,auth:SupabaseAuth) {
  const service=new SupabaseOfficerInvitations(auth),budgets=new AttemptBudgets();
  app.get('/api/verification-teams/invitations',auth.require(['admin']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>officerInvitationRows(c)))));
  app.post('/api/verification-teams',auth.require(['admin']),route(async(req,res)=>res.status(201).json(await service.create(req.actor,req.body))));
  app.post('/api/verification-teams/invitations/:id/cancel',auth.require(['admin']),route(async(req,res)=>res.json(await service.cancel(req.actor,req.params.id,req.body))));
  // Integrator removes the older unkeyed PUT handler from inspections.ts.
  app.put('/api/verification-teams/:id/status',auth.require(['admin']),route(async(req,res)=>res.json(await service.status(req.actor,req.params.id,req.body))));
  for(const action of ['inspect','accept'] as const)app.post(`/api/auth/officer-invitation/${action}`,auth.require(['primary']),route(async(req,res)=>{
    bodyFields(req.body,['invitationToken']);const digest=officerInvitationDigest(req.body.invitationToken);
    budgets.reserve([{scope:'officer-invitation',identity:req.actor.contextId,maximum:20,windowMs:60000}]);
    const result=await auth.db.authorizedSystem(req.actor,['primary'],async c=>{
      await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
      if(action==='accept')return acceptOfficerInvitation(c,req.actor,digest);
      const e=await inspectOfficerInvitation(c,req.actor,digest);return {email:e.invited_email,fullName:e.enrollment_fields.fullName,
        phone:e.enrollment_fields.phone,assignedZone:e.enrollment_fields.assignedZone,expiresAt:e.expires_at,alreadyAccepted:e.status==='completed',officerStatus:e.officer_status};
    });res.json(result);
  }));
}
