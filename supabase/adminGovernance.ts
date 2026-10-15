import {systemWipeReviewStatus} from './systemWipeReviews.js';
import crypto from 'node:crypto';
import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { administratorSettingsStatus,bodyFields,requireAdministrator,type SettingsGrant } from './adminSettings.js';
import { hashCredentialAsync,verifyCredentialAsync } from '../accountSecurity.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { notify } from './notifications.js';
import { accountReviewStatus } from './accountReviews.js';
import { residenceReviewStatus } from './residenceReviews.js';
import {residenceExecutionRequestsEnabled} from './residenceExecutionRequests.js';
import {systemWipeExecutionRequestsEnabled} from './systemWipeExecutionRequests.js';
import {expireAdministratorRemovals,administratorRemovalStatus,proposeAdministratorRemoval,voteAdministratorRemoval,
  submitAdministratorAppeal,decideAdministratorAppeal,acknowledgeAdministratorAppeal,confirmAdministratorRemoval} from './adminRemoval.js';
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
function reason(value:unknown) {if(typeof value!=='string'||value.trim().length<3||value.length>500)throw new ApiError(400,'Provide a reason of 3–500 characters.');return value.trim();}
export async function enrollApprovalKey(c:PoolClient,a:VerifiedActor,body:unknown) {
  bodyFields(body,[]);await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");await requireAdministrator(c,a);
  await c.query('insert into private.admin_secrets(context_id) values($1) on conflict do nothing',[a.contextId]);
  const old=(await c.query('select approval_key_hash from private.admin_secrets where context_id=$1 for update',[a.contextId])).rows[0];
  if(old.approval_key_hash)throw new ApiError(409,'Your approval key was already issued. Two other administrators must approve recovery.');
  const fresh=(await c.query(`select id from auth.sessions where id=$1 and user_id=$2
    and created_at between clock_timestamp()-interval '5 minutes' and clock_timestamp()
    and (not_after is null or not_after>clock_timestamp()) for share`,[a.sessionId,a.authUserId])).rowCount;
  if(!fresh)throw new ApiError(403,'Sign out and sign in again with Google or verified email, then enroll within five minutes.','fresh_sign_in_required');
  const privateKey=crypto.randomBytes(32).toString('base64url');
  await c.query('update private.admin_secrets set approval_key_hash=$2 where context_id=$1',[a.contextId,await hashCredentialAsync(`approval:${a.contextId}:${privateKey}`)]);
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'admin_approval_key_enrolled','account_context',$1)",[a.contextId]);
  const recipients=(await c.query(`select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    where m.status='active' and x.kind='admin' and x.status='active'`)).rows.map(r=>r.context_id);
  await notify(c,recipients,{category:'admin_governance',title:'Administrator approval key enrolled',message:'An administrator enrolled their separate approval key.',sender:a.contextId,link:'governance'});
  return {success:true,privateKey,message:'Save your approval key privately. It will only be shown once.'};
}
/** A rejected guess must commit before the HTTP denial. Settings keys never count. */
export async function checkApprovalKey(c:PoolClient,a:VerifiedActor,value:unknown):Promise<SettingsGrant> {
  await requireAdministrator(c,a);
  const row=(await c.query(`select *,locked_until>clock_timestamp() as locked,
    approval_attempt_window>clock_timestamp()-interval '15 minutes' as current_window from private.admin_secrets where context_id=$1 for update`,[a.contextId])).rows[0];
  if(!row?.approval_key_hash)return {allowed:false};
  if(row.locked)return {allowed:false,locked:true};
  if(typeof value!=='string'||!value)return {allowed:false};
  if(value.length>128||!await verifyCredentialAsync(`approval:${a.contextId}:${value}`,row.approval_key_hash)) {
    const attempts=row.current_window?Math.min(row.failed_attempts+1,5):1;
    await c.query(`update private.admin_secrets set failed_attempts=$2::smallint,
      approval_attempt_window=case when $3::boolean then approval_attempt_window else clock_timestamp() end,
      locked_until=case when $2::smallint=5 then clock_timestamp()+interval '15 minutes' else null end where context_id=$1`,[a.contextId,attempts,Boolean(row.current_window)]);
    return {allowed:false,locked:attempts===5};
  }
  await c.query('update private.admin_secrets set failed_attempts=0,approval_attempt_window=null,locked_until=null where context_id=$1',[a.contextId]);
  return {allowed:true,version:row.approval_key_version};
}
export function deniedApprovalKey(grant:SettingsGrant) {
  if(!grant.allowed)throw new ApiError(grant.locked?429:403,grant.locked?'Too many approval-key attempts. Wait 15 minutes.':'Enter your current separate approval key.',grant.locked?'approval_key_locked':'approval_key_required');
}
export async function requireApprovalGrant(c:PoolClient,a:VerifiedActor,grant:SettingsGrant) {
  await requireAdministrator(c,a);deniedApprovalKey(grant);
  if(!(await c.query(`select context_id from private.admin_secrets where context_id=$1 and approval_key_hash is not null
    and approval_key_version=$2 and (locked_until is null or locked_until<=clock_timestamp()) for share`,[a.contextId,grant.version])).rowCount)
    throw new ApiError(403,'Your approval authorization changed. Enter your current key again.');
  await c.query("select set_config('pinevela.approval_key_version',$1,true)",[grant.version]);
}
async function expireRecovery(c:PoolClient) {
  await c.query("update public.admin_proposals set status='expired' where kind='administrator_key_reset' and status='pending' and expires_at<=clock_timestamp()");
}
export async function governanceStatus(c:PoolClient,a:VerifiedActor) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  const status=await administratorSettingsStatus(c,a);await expireRecovery(c);await expireAdministratorRemovals(c);
  await c.query(`update private.admin_invitations i set cancelled_at=clock_timestamp()
    where i.accepted_at is null and i.cancelled_at is null and (i.expires_at<=clock_timestamp() or not private.invitation_issuer_valid(i))`);
  const rows=(await c.query(`select p.*,coalesce((select jsonb_agg(jsonb_build_object('id',v.administrator_context_id,'slot',m.slot,'name',f.display_name,
    'decision',v.decision,'at',v.decided_at) order by v.decided_at,v.administrator_context_id) from public.admin_votes v
    join public.admin_memberships m on m.context_id=v.administrator_context_id join public.account_contexts x on x.id=m.context_id
    join public.profiles f on f.id=x.auth_user_id where v.proposal_id=p.id),'[]'::jsonb) as votes
    from public.admin_proposals p where p.kind='administrator_key_reset' order by p.created_at desc limit 100`)).rows;
  const changes=rows.map(p=>({id:p.id,targetId:p.target_context_id,action:p.preview.action,reason:p.reason,requestedBy:p.proposer_context_id,
    expiresAt:p.expires_at,status:p.status,votes:p.votes,executedAt:p.executed_at}));
  // Read actual persistence even for controls still awaiting their command ports.
  const proposals=await systemWipeReviewStatus(c,a);
  const invitations=a.contextId===status.mainId?(await c.query(`select id,invited_email as email,invited_name as name,reserved_slot as slot,expires_at as "expiresAt",
    case when accepted_at is not null then 'accepted' when cancelled_at is not null then cancellation_reason else 'reserved' end as status
    from private.admin_invitations order by case when accepted_at is null and cancelled_at is null then 0 else 1 end,created_at desc limit 100`)).rows:undefined;
  changes.push(...await administratorRemovalStatus(c,a,status.mainId));
  const accountProposals=await accountReviewStatus(c,a);
  const residenceProposals=await residenceReviewStatus(c,a);
  return {...status,changes,proposals,invitations,accountProposals,residenceProposals,capabilities:{approvalKeys:true,keyRecovery:true,invitations:true,membershipChanges:true,removal:true,accountReviews:true,accountApplication:true,accountDeletion:false,residenceReviews:true,residencePreparation:true,residenceExecutionRequests:residenceExecutionRequestsEnabled(),residenceDeletion:false,wipeReviews:true,wipePreparation:true,wipePause:true,wipeFinalConsent:true,wipes:systemWipeExecutionRequestsEnabled()},blocked:false};
}
export async function setAdministratorActive(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,target:string,active:boolean) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  await requireApprovalGrant(c,a,grant);
  if(!(await c.query("select context_id from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)
    throw new ApiError(403,'Only the main administrator can suspend or restore administrator access.');
  const member=(await c.query('select slot,status from public.admin_memberships where context_id=$1 for update',[target])).rows[0];
  if(!member)throw new ApiError(404,'Administrator not found.');
  if(member.slot===1)throw new ApiError(403,'The main administrator cannot be suspended or removed.');
  if(!['active','suspended'].includes(member.status))throw new ApiError(409,'This membership cannot be restored through suspension controls.');
  const status=active?'active':'suspended';
  if(member.status===status)throw new ApiError(409,active?'This administrator is already active.':'This administrator is already suspended.');
  await c.query('update public.admin_memberships set status=$2 where context_id=$1',[target,status]);
  return {success:true,status,message:active?'Administrator access restored. They must sign out and sign in again.':'Administrator access suspended and existing portal sessions revoked.'};
}
export async function proposeKeyRecovery(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,target:string,body:any) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");await requireApprovalGrant(c,a,grant);await expireRecovery(c);
  if(target===a.contextId)throw new ApiError(403,'Two other administrators must approve recovery for their colleague.');
  const member=(await c.query(`select k.*,m.status,x.status as account_status from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    left join private.admin_secrets k on k.context_id=m.context_id where m.context_id=$1`,[target])).rows[0];
  if(!member||member.status!=='active'||member.account_status!=='active')throw new ApiError(404,'Active administrator not found.');
  if(!(body.action==='reset-key'?member.approval_key_hash:member.settings_key_hash))throw new ApiError(409,'This key has not been enrolled.');
  const roster=(await c.query('select private.recovery_roster() as roster')).rows[0].roster;
  if(roster.filter((r:any)=>r.id!==target).length<2)throw new ApiError(409,'Two other active administrators with enrolled approval keys are required.');
  if((await c.query("select id from public.admin_proposals where kind='administrator_key_reset' and status='pending' and target_context_id=$1 and preview->>'action'=$2",[target,body.action])).rowCount)
    throw new ApiError(409,'This administrator already has an open recovery proposal for this key.');
  if((await c.query("select count(*) from public.admin_proposals where kind='administrator_key_reset' and status='pending'")).rows[0].count>=10)
    throw new ApiError(409,'Complete an existing recovery proposal before submitting another.');
  const p=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,target_context_id,preview,baseline_digest,reason,quorum,expires_at,recovery_roster_revision)
    select 'administrator_key_reset',$1,$2,jsonb_build_object('action',$3::text,'roster',private.recovery_roster()),
      private.recovery_digest($2,$3,roster_revision),$4,2,clock_timestamp()+interval '24 hours',roster_revision
    from private.admin_pricing_state where singleton returning id`,[a.contextId,target,body.action,body.reason])).rows[0];
  await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[p.id,a.contextId]);
  return {success:true,id:p.id,status:'pending',message:'Recovery proposed. A different administrator must approve; the target cannot vote.'};
}
export async function voteKeyRecovery(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,decision:string) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");await requireApprovalGrant(c,a,grant);await expireRecovery(c);
  const p=(await c.query("select * from public.admin_proposals where id=$1 and kind='administrator_key_reset' for update",[id])).rows[0];
  if(!p)throw new ApiError(404,'Recovery proposal not found.');
  if(p.target_context_id===a.contextId||p.proposer_context_id===a.contextId)throw new ApiError(403,'A different existing administrator must independently approve recovery.');
  if(p.status!=='pending')throw new ApiError(409,'This proposal expired, changed or was already decided.');
  if(!p.preview.roster.some((r:any)=>r.id===a.contextId))throw new ApiError(403,'You are not on this reviewed roster.');
  await c.query('insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,$3)',[id,a.contextId,decision]);
  const status=(await c.query('select status from public.admin_proposals where id=$1',[id])).rows[0].status;
  return {success:true,status,message:status==='executed'?'Recovery approved. The target must sign in again and enroll a new key.':'Recovery rejected. The current key is unchanged.'};
}
export class SupabaseAdminGovernance {
  private budgets=new AttemptBudgets();
  constructor(readonly auth:SupabaseAuth){}
  private async grant(a:VerifiedActor,key:unknown) {
    this.budgets.reserve([{scope:'administrator-approval-key',identity:a.contextId,maximum:30,windowMs:60000}]);
    const grant=await this.auth.db.authorizedSystem(a,['admin'],c=>checkApprovalKey(c,a,key));deniedApprovalKey(grant);return grant;
  }
  async setActive(a:VerifiedActor,target:unknown,body:any) {
    bodyFields(body,['active','privateKey']);const id=uuid(target);
    if(typeof body.active!=='boolean')throw new ApiError(400,'Active must be a boolean.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>setAdministratorActive(c,a,grant,id,body.active));
  }
  async propose(a:VerifiedActor,target:unknown,body:any) {
    bodyFields(body,['action','reason','privateKey']);const id=uuid(target),text=reason(body.reason);
    if(!['reset-key','reset-settings-key','remove'].includes(body.action))throw new ApiError(400,'Select a key recovery or administrator removal.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>body.action==='remove'
      ?proposeAdministratorRemoval(c,a,grant,id,text):proposeKeyRecovery(c,a,grant,id,{action:body.action,reason:text}));
  }
  async vote(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','decision']);const proposal=uuid(id);
    if(!['approved','rejected'].includes(body.decision))throw new ApiError(400,'Select approve or reject.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],async c=>{
      await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
      const kind=(await c.query('select kind from public.admin_proposals where id=$1',[proposal])).rows[0]?.kind;
      return kind==='administrator_removal'?voteAdministratorRemoval(c,a,grant,proposal,body.decision):voteKeyRecovery(c,a,grant,proposal,body.decision);
    });
  }
  async plea(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['message']);const proposal=uuid(id);
    if(typeof body.message!=='string'||body.message.trim().length<3||body.message.length>2000)throw new ApiError(400,'Provide an appeal of 3–2000 characters.');
    return this.auth.db.authorizedSystem(a,['admin'],c=>submitAdministratorAppeal(c,a,proposal,body.message.trim()));
  }
  async decidePlea(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','decision','reason']);const proposal=uuid(id),text=reason(body.reason);
    if(!['accepted','rejected'].includes(body.decision))throw new ApiError(400,'Accept or reject the appeal.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>decideAdministratorAppeal(c,a,grant,proposal,body.decision,text));
  }
  async acknowledgePlea(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,[]);const proposal=uuid(id);
    return this.auth.db.authorizedSystem(a,['admin'],c=>acknowledgeAdministratorAppeal(c,a,proposal));
  }
  async confirmRemoval(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','confirmation']);const proposal=uuid(id);
    if(body.confirmation!=='REMOVE ADMINISTRATOR')throw new ApiError(400,'Type REMOVE ADMINISTRATOR to confirm.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>confirmAdministratorRemoval(c,a,grant,proposal,body.confirmation));
  }
}
export function installAdminGovernance(app:Express,auth:SupabaseAuth) {
  const service=new SupabaseAdminGovernance(auth),budgets=new AttemptBudgets();
  app.get('/api/admin/governance',auth.require(['admin']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>governanceStatus(c,req.actor)))));
  app.post('/api/admin/governance/keys/enroll',auth.require(['admin']),route(async(req,res)=>{
    budgets.reserve([{scope:'administrator-approval-enrollment',identity:req.actor.contextId,maximum:5,windowMs:60000}]);
    return res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>enrollApprovalKey(c,req.actor,req.body)));
  }));
  app.post('/api/admin/governance/members/:id/changes',auth.require(['admin']),route(async(req,res)=>res.json(await service.propose(req.actor,req.params.id,req.body))));
  app.post('/api/admin/governance/members/:id/active',auth.require(['admin']),route(async(req,res)=>res.json(await service.setActive(req.actor,req.params.id,req.body))));
  app.post('/api/admin/governance/changes/:id/vote',auth.require(['admin']),route(async(req,res)=>res.json(await service.vote(req.actor,req.params.id,req.body))));
  app.post('/api/admin/governance/changes/:id/plea',auth.require(['admin']),route(async(req,res)=>res.json(await service.plea(req.actor,req.params.id,req.body))));
  app.post('/api/admin/governance/changes/:id/plea/decision',auth.require(['admin']),route(async(req,res)=>res.json(await service.decidePlea(req.actor,req.params.id,req.body))));
  app.post('/api/admin/governance/changes/:id/plea/acknowledge',auth.require(['admin']),route(async(req,res)=>res.json(await service.acknowledgePlea(req.actor,req.params.id,req.body))));
  app.post('/api/admin/governance/changes/:id/confirm-removal',auth.require(['admin']),route(async(req,res)=>res.json(await service.confirmRemoval(req.actor,req.params.id,req.body))));
}
