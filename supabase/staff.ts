import crypto from 'node:crypto';
import type { Express,RequestHandler,Response } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import { verifiedClaims,type SupabaseAuth,type AuthRequest } from './auth.js';
import { requireConfirmationSettings,signupChallenge,signupProviderConfig } from '../supabaseSignup.js';
import { notify } from './notifications.js';
import { housingDashboardRows } from './dashboardReads.js';

const route=(work:(req:AuthRequest,res:Response)=>Promise<unknown>):RequestHandler => (req,res,next)=>{work(req as AuthRequest,res).catch(next);};
const digest=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');
function text(value:unknown,label:string,max=200,required=false) {
  if (typeof value!=='string' || value.trim().length>max || (required && !value.trim())) throw new ApiError(400,`Enter a valid ${label}.`);
  return value.trim();
}
function passwordInput(value:unknown) {
  if(typeof value!=='string' || value.length<8 || value.length>256)throw new ApiError(400,'Enter a password of 8–256 characters.');
  return value;
}
function invitationToken(value:unknown) {
  if (typeof value!=='string' || !/^[a-f0-9]{64}$/.test(value)) throw new ApiError(404,'This staff invitation is unavailable.');
  return value;
}
export async function staffManagerResidence(client:PoolClient,actor:VerifiedActor,id:unknown) {
  if (actor.kind!=='manager') throw new ApiError(403,'Only an assigned manager may manage staff.');
  const residenceId=uuid(id);
  await client.query('select id from public.residences where id=$1 for update',[residenceId]);
  const grant=await client.query(`select m.id from public.manager_assignments m join public.account_contexts c on c.id=m.manager_context_id
    where m.residence_id=$1 and m.manager_context_id=$2 and m.ended_at is null and c.status='active' and c.auth_user_id=$3 for share of m,c`,[residenceId,actor.contextId,actor.authUserId]);
  if (!grant.rowCount) throw new ApiError(404,'This residence is not assigned to your manager account.');
  return residenceId;
}
async function blockId(client:PoolClient,residenceId:string,value:unknown) {
  if (value===undefined || value===null || value==='' || value==='All Blocks') return null;
  const name=text(value,'assigned block');
  const {rows}=await client.query('select id from public.blocks where residence_id=$1 and name=$2',[residenceId,name]);
  if (rows.length!==1) throw new ApiError(400,'Choose a saved block from this residence.');
  return rows[0].id as string;
}
export async function reserveStaffInvitation(client:PoolClient,actor:VerifiedActor,body:any,token:string) {
  const residenceId=await staffManagerResidence(client,actor,body?.hostelId);
  if (!(await client.query('select private.residence_has_reviewed_setup($1) as allowed',[residenceId])).rows[0].allowed)
    throw new ApiError(403,'Complete and obtain approval for residence registration before inviting staff.');
  const name=text(body?.name,'staff name',120,true),phone=text(body?.phone,'phone',40,true),email=text(body?.email,'email',254,true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400,'Enter a valid staff email.');
  if (['password','userId','staffId','managerId','createdById'].some(k=>body[k]!==undefined)) throw new ApiError(400,'Staff choose their own password when accepting their invitation.');
  const role=text(body?.role ?? '', 'job role'),shift=text(body?.shift ?? '', 'shift'),block=await blockId(client,residenceId,body?.assignedBlock);
  if ((await client.query('select 1 from auth.users where lower(email)=$1',[email])).rowCount) throw new ApiError(409,'Use an unregistered work email for this separate staff account.');
  // Expired links stay renewable by their assigned manager. A provider identity
  // already reserved for this mailbox must not become an unrecoverable orphan.
  if (Number((await client.query(`select count(*) from private.account_enrollments where initiator_context_id=$1 and kind='staff' and status='pending_email'`,[actor.contextId])).rows[0].count)>=50)
    throw new ApiError(429,'Cancel or complete pending invitations before adding more staff.');
  let id:string;
  try {id=(await client.query(`insert into private.account_enrollments(initiator_context_id,kind,invited_email,token_digest,residence_id,enrollment_fields,expires_at)
    values ($1,'staff',$2,$3,$4,$5,clock_timestamp()+interval '24 hours') returning id`,[actor.contextId,email,digest(invitationToken(token)),residenceId,JSON.stringify({displayName:name,phone,role,shift,assignedBlockId:block})])).rows[0].id;}
  catch(error) {if((error as any)?.code==='23505') throw new ApiError(409,'This email already has an invitation awaiting verification.');throw error;}
  await audit(client,actor,'staff_invited','account_enrollment',id);
  await notify(client,[actor.contextId],{category:'staff',title:'Staff Invitation Created',message:`An invitation for ${name} is awaiting their work email verification. Share the invitation link with this staff member.`});
  return {invitationId:id,name,email,status:'pending_email',invitationToken:token};
}
async function audit(client:PoolClient,actor:Pick<VerifiedActor,'contextId'>,event:string,resource:string,id:string) {
  await client.query('insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values ($1,$2,$3,$4)',[actor.contextId,event,resource,id]);
}
export async function staffInvitation(client:PoolClient,value:unknown,lock=false) {
  const token=invitationToken(value);
  // Residence before invitation matches manager cancellation/rotation order.
  const selected=(await client.query("select residence_id from private.account_enrollments where token_digest=$1 and kind='staff'",[digest(token)])).rows[0];
  if (!selected) throw new ApiError(404,'This staff invitation is unavailable.');
  if(lock) await client.query('select id from public.residences where id=$1 for update',[selected.residence_id]);
  const e=(await client.query(`select e.*,h.name as residence_name from private.account_enrollments e join public.residences h on h.id=e.residence_id
    where e.token_digest=$1 and e.kind='staff' ${lock?'for update of e':''}`,[digest(token)])).rows[0];
  if (!e || e.status!=='pending_email' || new Date(e.expires_at).getTime()<=Date.now() || !(await client.query('select private.staff_invitation_authorized($1) as allowed',[e.id])).rows[0].allowed)
    throw new ApiError(404,'This staff invitation is unavailable. Ask your manager for an active invitation.');
  const grant=await client.query(`select m.id from public.manager_assignments m join public.account_contexts c on c.id=m.manager_context_id
    where m.manager_context_id=$1 and m.residence_id=$2 and m.ended_at is null and c.status='active' for share of m,c`,[e.initiator_context_id,e.residence_id]);
  if(!grant.rowCount) throw new ApiError(404,'This staff invitation is unavailable.');
  return e;
}
export async function finishStaffInvitation(client:PoolClient,token:unknown,identity:{authUserId:string;sessionId:string;email:string}) {
  const e=await staffInvitation(client,token,true);
  const person=(await client.query(`select c.id from public.account_contexts c join public.profiles p on p.id=c.auth_user_id
    join auth.users u on u.id=p.id join auth.sessions s on s.user_id=u.id
    where c.id=$1 and c.auth_user_id=$2 and c.kind='staff' and c.status='pending' and c.primary_owner_id is null and p.primary_owner_id is null
      and lower(u.email)=$3 and lower(p.email)=$3 and u.email_confirmed_at is not null and s.id=$4
      and (s.not_after is null or s.not_after>clock_timestamp()) for update of c`,[e.linked_context_id,identity.authUserId,e.invited_email,identity.sessionId])).rows[0];
  if (!person || identity.authUserId!==e.auth_user_id || identity.email!==e.invited_email) throw new ApiError(403,'Verify the work email belonging to this invitation.');
  const f=e.enrollment_fields;
  const id=(await client.query(`insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id,assigned_block_id,job_role,shift)
    values ($1,$2,$3,$4,$5,$6) returning id`,[person.id,e.residence_id,e.initiator_context_id,f.assignedBlockId || null,f.role || '',f.shift || ''])).rows[0].id;
  await client.query("update public.account_contexts set status='active',updated_at=now() where id=$1",[person.id]);
  await client.query("update private.account_enrollments set status='completed',verified_at=now() where id=$1",[e.id]);
  await audit(client,{contextId:person.id},'staff_email_verified','staff_assignment',id);
  await notify(client,[person.id,e.initiator_context_id],{category:'staff',title:'Staff Account Activated',message:`${f.displayName} verified their work email and joined ${e.residence_name}. The staff portal is now available through a separate sign-in.`});
  return {success:true,verified:true,requiresSeparateLogin:true,staffId:id};
}
export async function editStaff(client:PoolClient,actor:VerifiedActor,id:unknown,body:any,end?:'removed'|'resigned') {
  const staffId=uuid(id),selected=(await client.query('select residence_id,staff_context_id from public.staff_assignments where id=$1',[staffId])).rows[0];
  if (!selected) throw new ApiError(404,'Staff assignment not found.');
  if(end==='resigned') {
    if(actor.kind!=='staff' || selected.staff_context_id!==actor.contextId) throw new ApiError(403,'You may resign only from your own employment.');
    await client.query('select id from public.residences where id=$1 for update',[selected.residence_id]);
  } else await staffManagerResidence(client,actor,selected.residence_id);
  const s=(await client.query('select s.*,c.auth_user_id from public.staff_assignments s join public.account_contexts c on c.id=s.staff_context_id where s.id=$1 for update of s,c',[staffId])).rows[0];
  if(s.ended_at) throw new ApiError(409,'This employment has already ended.');
  let status=s.status,reason:null|string=null;
  if(end) {
    if(end==='resigned') {if(!body || Array.isArray(body) || Object.keys(body).some(k=>k!=='reason'))throw new ApiError(400,'Only your resignation reason may be submitted.');reason=text(body?.reason,'resignation reason',2000,true);if(reason.length<5) throw new ApiError(400,'Explain your resignation in at least five characters.');}
    status=end;
  } else {
    const allowed=['name','phone','role','shift','assignedBlock','status'];
    if(!body || Object.keys(body).some(k=>!allowed.includes(k))) throw new ApiError(400,'Only staff contact and employment fields may be changed.');
    const statuses:Record<string,string>={Active:'active',Inactive:'suspended',Suspended:'suspended'};
    if(body.status!==undefined) {status=typeof body.status==='string' && Object.hasOwn(statuses,body.status)?statuses[body.status]:undefined;if(!status) throw new ApiError(400,'Choose Active or Suspended.');}
    for(const [key,col] of [['name','display_name'],['phone','phone']] as const) if(body[key]!==undefined)
      await client.query(`update public.profiles set ${col}=$2,updated_at=now() where id=$1`,[s.auth_user_id,text(body[key],key,key==='name'?120:40,true)]);
  }
  const role=end || body?.role===undefined?s.job_role:text(body.role,'job role'),shift=end || body?.shift===undefined?s.shift:text(body.shift,'shift'),block=end || body?.assignedBlock===undefined?s.assigned_block_id:await blockId(client,s.residence_id,body.assignedBlock);
  await client.query(`update public.staff_assignments set status=$2,job_role=$3,shift=$4,assigned_block_id=$5,ended_at=case when $6 then now() else null end,end_reason=$7 where id=$1`,[staffId,status,role,shift,block,Boolean(end),reason]);
  await client.query(`update public.account_contexts set status=$2,updated_at=now() where id=$1`,[s.staff_context_id,end?'closed':status==='active'?'active':'suspended']);
  if(end || status!==s.status) await client.query('delete from private.account_sessions where active_context_id=$1',[s.staff_context_id]);
  if(end) await client.query("update public.staff_bargains set status='cancelled',updated_at=now() where staff_assignment_id=$1 and status in ('proposed','declined')",[staffId]);
  const managers=(await client.query(`select m.manager_context_id as id from public.manager_assignments m join public.account_contexts c on c.id=m.manager_context_id
    where m.residence_id=$1 and m.ended_at is null and c.status='active'`,[s.residence_id])).rows.map(r=>r.id);
  await audit(client,actor,end?`staff_${end}`:'staff_updated','staff_assignment',staffId);
  await notify(client,[s.staff_context_id,...managers],{category:'staff',title:end==='resigned'?'Staff Resignation':end==='removed'?'Staff Access Removed':'Staff Assignment Updated',message:end==='resigned'?`The staff member resigned. Reason: ${reason}`:end==='removed'?'This staff employment has ended and staff portal sessions were revoked.':'The staff employment details were updated.'});
  return {success:true,message:end?'Staff access ended. Employment history is retained.':'Staff assignment updated.'};
}

export async function editStaffProfile(client:PoolClient,actor:VerifiedActor,body:any) {
  if(actor.kind!=='staff')throw new ApiError(403,'Staff account required.');
  if(!body || Array.isArray(body) || Object.keys(body).some(k=>!['name','phone'].includes(k)))throw new ApiError(400,'Only your display name and contact phone may be updated here.');
  const saved=(await client.query(`select p.id from public.staff_assignments s join public.account_contexts c on c.id=s.staff_context_id
    join public.profiles p on p.id=c.auth_user_id where s.staff_context_id=$1 and c.auth_user_id=$2 and c.kind='staff'
      and c.status='active' and s.status='active' and s.ended_at is null for share of s,c`,[actor.contextId,actor.authUserId])).rows[0];
  if(!saved)throw new ApiError(403,'Active manager-created staff employment is required.');
  const name=body.name===undefined?null:text(body.name,'name',120,true),phone=body.phone===undefined?null:text(body.phone,'phone',40,true);
  await client.query('update public.profiles set display_name=coalesce($2,display_name),phone=coalesce($3,phone),updated_at=now() where id=$1',[saved.id,name,phone]);
  await audit(client,actor,'staff_profile_updated','profile',saved.id);
  return {success:true};
}

async function ownedStaffInvitation(c:PoolClient,a:VerifiedActor,id:unknown) {
  const initial=(await c.query("select residence_id from private.account_enrollments where id=$1 and kind='staff' and initiator_context_id=$2",[uuid(id),a.contextId])).rows[0];
  if(!initial)throw new ApiError(404,'Staff invitation not found.');await staffManagerResidence(c,a,initial.residence_id);
  const e=(await c.query("select * from private.account_enrollments where id=$1 and kind='staff' and initiator_context_id=$2 for update",[id,a.contextId])).rows[0];
  if(e.status!=='pending_email')throw new ApiError(409,'This invitation is no longer pending.');return e;
}
export async function rotateStaffInvitation(c:PoolClient,a:VerifiedActor,id:unknown,token:string) {
  const e=await ownedStaffInvitation(c,a,id);
  if(!(await c.query('select private.staff_invitation_authorized($1) as allowed',[e.id])).rows[0].allowed)throw new ApiError(403,'Residence registration approval is required.');
  await c.query("update private.account_enrollments set token_digest=$2,expires_at=clock_timestamp()+interval '24 hours' where id=$1",[e.id,digest(invitationToken(token))]);
  await audit(c,a,'staff_invitation_rotated','account_enrollment',e.id);
  await notify(c,[a.contextId],{category:'staff',title:'Staff Invitation Renewed',message:`The invitation for ${e.enrollment_fields.displayName} was renewed. The previous link is no longer valid.`});
}
export async function cancelStaffInvitation(c:PoolClient,a:VerifiedActor,id:unknown) {
  const e=await ownedStaffInvitation(c,a,id);
  if(e.linked_context_id)await c.query("update public.account_contexts set status='closed',updated_at=now() where id=$1 and status='pending'",[e.linked_context_id]);
  await c.query("update private.account_enrollments set status='cancelled' where id=$1",[e.id]);
  await audit(c,a,'staff_invitation_cancelled','account_enrollment',e.id);
  await notify(c,[a.contextId],{category:'staff',title:'Staff Invitation Cancelled',message:`The invitation for ${e.enrollment_fields.displayName} was cancelled. It can no longer grant staff portal access.`});
}

export function installStaff(app:Express,auth:SupabaseAuth) {
  app.post('/api/staff',auth.require(['manager']),route(async(req,res)=>res.status(201).json(await auth.db.authorizedSystem(req.actor,['manager'],c=>reserveStaffInvitation(c,req.actor,req.body,crypto.randomBytes(32).toString('hex'))))));
  app.get('/api/staff/invitations',auth.require(['manager']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['manager'],async c=>(await c.query(`select e.id,e.invited_email as email,e.enrollment_fields->>'displayName' as name,e.status,e.expires_at,e.auth_user_id is not null as signup_started
    from private.account_enrollments e where e.kind='staff' and e.initiator_context_id=$1 and e.status='pending_email'
    and exists(select 1 from public.manager_assignments m where m.manager_context_id=$1 and m.residence_id=e.residence_id and m.ended_at is null) order by e.created_at desc`,[req.actor.contextId])).rows))));
  app.post('/api/staff/invitations/:id/rotate',auth.require(['manager']),route(async(req,res)=>{
    const token=crypto.randomBytes(32).toString('hex');
    await auth.db.authorizedSystem(req.actor,['manager'],c=>rotateStaffInvitation(c,req.actor,req.params.id,token));
    return res.json({invitationToken:token});
  }));
  app.delete('/api/staff/invitations/:id',auth.require(['manager']),route(async(req,res)=>{
    await auth.db.authorizedSystem(req.actor,['manager'],c=>cancelStaffInvitation(c,req.actor,req.params.id));return res.json({success:true});
  }));
  app.put('/api/staff/profile',auth.require(['staff']),route(async(req,res)=>{
    await auth.db.authorizedSystem(req.actor,['staff'],c=>editStaffProfile(c,req.actor,req.body));
    const user=await auth.projection(req.actor),rows=await auth.db.actor(req.actor,c=>housingDashboardRows(c,'staff'));
    return res.json({success:true,user,staffRecord:rows.find(r=>'userId' in r && r.userId===req.actor.contextId)});
  }));
  app.put('/api/staff/:id',auth.require(['manager']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['manager'],c=>editStaff(c,req.actor,req.params.id,req.body)))));
  app.delete('/api/staff/:id',auth.require(['manager']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['manager'],c=>editStaff(c,req.actor,req.params.id,{},'removed')))));
  app.post(['/api/staff/resign','/api/staff/quit'],auth.require(['staff']),route(async(req,res)=>{
    const result=await auth.db.authorizedSystem(req.actor,['staff'],async c=>{const s=(await c.query("select id from public.staff_assignments where staff_context_id=$1 and status='active' and ended_at is null",[req.actor.contextId])).rows[0];
      if(!s)throw new ApiError(403,'Active staff employment is required.');return editStaff(c,req.actor,s.id,req.body,'resigned');});return res.json(result);
  }));
  app.post('/api/auth/staff-invitations/inspect',route(async(req,res)=>{const e=await auth.db.availableSystem(c=>staffInvitation(c,req.body?.invitationToken));
    return res.json({name:e.enrollment_fields.displayName,email:e.invited_email,residenceName:e.residence_name,verificationRequired:true,signupStarted:Boolean(e.auth_user_id)});
  }));
  app.post('/api/auth/staff-invitations/signup',route(async(req,res)=>{
    const token=invitationToken(req.body?.invitationToken),password=passwordInput(req.body?.password);
    if(password.length<8)throw new ApiError(400,'Choose a password of at least eight characters.');
    requireConfirmationSettings(await auth.provider('/settings'));
    const e=await auth.db.availableSystem(c=>staffInvitation(c,token,true));
    if(e.auth_user_id) return res.status(202).json({verificationRequired:true,signupStarted:true});
    const data=await auth.provider('/signup',{email:e.invited_email,password,data:{name:e.enrollment_fields.displayName,pinevela_enrollment_token:token}});
    if(data.access_token || data.session)throw new ApiError(503,'Email confirmation must be enabled.');
    const saved=await auth.db.availableSystem(c=>staffInvitation(c,token,true));
    if(!saved.auth_user_id || saved.auth_user_id!==(data.user || data).id)throw new ApiError(503,'Signup did not match this staff invitation.');
    return res.status(202).json({verificationRequired:true,signupStarted:true});
  }));
  app.post('/api/auth/staff-invitations/resend',route(async(req,res)=>{const e=await auth.db.availableSystem(c=>staffInvitation(c,req.body?.invitationToken,true));
    if(!e.auth_user_id)throw new ApiError(409,'Choose your password before requesting another email.');
    await auth.provider('/resend',{type:'signup',email:e.invited_email});return res.status(202).json({success:true});
  }));
  app.post('/api/auth/staff-invitations/verify',route(async(req,res)=>{
    const token=invitationToken(req.body?.invitationToken),e=await auth.db.availableSystem(c=>staffInvitation(c,token,true));
    if(!e.auth_user_id)throw new ApiError(409,'Choose your password before verifying your work email.');
    const proof=typeof req.body?.code==='string' && req.body.code.trim()?signupChallenge(req.body.code,signupProviderConfig().url):null;
    const session=proof?await auth.provider('/verify','token' in proof?{email:e.invited_email,...proof}:proof):await auth.provider('/token?grant_type=password',{email:e.invited_email,password:passwordInput(req.body?.password)});
    try {const person=await auth.provider('/user',undefined,session.access_token),identity=verifiedClaims(session.access_token,person);
      return res.json(await auth.db.availableSystem(c=>finishStaffInvitation(c,token,{...identity,email:String(person.email).toLowerCase()})));
    } finally {await auth.provider('/logout?scope=local',{},session.access_token).catch(()=>undefined);}
  }));
}
