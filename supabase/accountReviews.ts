import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import type { SupabaseAuth, AuthRequest } from './auth.js';
import { bodyFields, requireAdministrator, type SettingsGrant } from './adminSettings.js';
import { checkApprovalKey, deniedApprovalKey, requireApprovalGrant } from './adminGovernance.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { ACCOUNT_FEATURES } from '../accountFeatures.js';
import { notify,notifyPrimaryOwner } from './notifications.js';
import {linkUnassignedManagerClosure,managerClosurePreview,notifyManagerClosureReview} from './managerClosureRequests.js';

const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { work(req as AuthRequest, res).catch(next); };
const displayRoles: Record<string,string> = {primary:'user',resident:'student',seller:'merchant',officer:'verification_team',manager:'manager',staff:'staff',admin:'admin'};
const kinds: Record<string,string> = {user:'primary',student:'resident',resident:'resident',merchant:'seller',verification_team:'officer',manager:'manager',staff:'staff',admin:'admin'};
function reason(value:unknown) {
  if(typeof value!=='string'||value.trim().length<3||value.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new ApiError(400,'Provide a reason of 3–500 characters.');
  return value.trim();
}
export function checkAccountReviewContext(actor:VerifiedActor,expected:unknown) {
  if(expected!==undefined&&expected!==actor.contextId)throw new ApiError(409,'Your active account changed. Reopen account approvals.');
}
function actionInput(body:any) {
  bodyFields(body,['targetId','targetRole','action','reason','privateKey','features','duration','closureRequestId']);
  const id=uuid(body.targetId);
  if(typeof body.targetRole!=='string'||!Object.hasOwn(kinds,body.targetRole))throw new ApiError(400,'Choose a supported account type.');
  const kind=kinds[body.targetRole];
  if(kind==='admin')throw new ApiError(403,'Administrator accounts use membership governance.');
  if(!['ban','restrict','restore','close-manager'].includes(body.action))throw new ApiError(400,'Choose a supported reviewed action. Deletion requires its separate reviewed lifecycle.');
  const closureRequestId=body.action==='close-manager'?uuid(body.closureRequestId):undefined;
  if(body.action==='close-manager'&&(kind!=='manager'||body.duration!==null||!Array.isArray(body.features)||body.features.length))
    throw new ApiError(400,'Portal-only closure requires a pending manager request and retains existing restrictions.');
  if(body.action!=='close-manager'&&body.closureRequestId!==undefined)throw new ApiError(400,'Closure requests cannot authorize other account policies.');
  let features:string[]=[],duration:{amount:number;unit:string}|null=null;
  if(body.action==='restrict') {
    if(!Array.isArray(body.features)||body.features.length<1||body.features.length>6||body.features.some((f:unknown)=>typeof f!=='string'||!Object.hasOwn(ACCOUNT_FEATURES,f)))
      throw new ApiError(400,'Choose supported features to restrict.');
    features=[...new Set<string>(body.features)].sort();
  }
  if(body.action==='ban') {
    bodyFields(body.duration,['amount','unit']);
    const units:Record<string,number>={hours:3600000,days:86400000,weeks:604800000,months:2592000000,years:31536000000};
    const {amount,unit}=body.duration;
    if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<1||typeof unit!=='string'||!Object.hasOwn(units,unit)||amount*units[unit]>3153600000000)
      throw new ApiError(400,'Choose a positive whole duration of no more than 100 years.');
    duration={amount,unit};
  }
  return {id,kind,action:body.action as string,reason:reason(body.reason),features,duration,closureRequestId};
}
async function announce(c:PoolClient,a:VerifiedActor|undefined,p:any,title:string,message:string) {
  const ids=(await c.query(`select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    where m.status='active' and x.status='active' and m.context_id=any($1::uuid[])`,[p.preview.roster.map((r:any)=>r.id)])).rows.map(r=>r.context_id);
  await notify(c,ids,{category:'admin_governance',title,message,sender:a?.contextId,link:'governance'});
}
export async function expireAccountReviews(c:PoolClient) {
  const expired=(await c.query(`update public.admin_proposals set status=case when expires_at<=clock_timestamp() then 'expired' else 'invalidated' end
    where kind='account_action' and status in('pending','approved') and not private.account_review_current(admin_proposals)
    returning id,status,preview`)).rows;
  for(const p of expired)await announce(c,undefined,p,'Account approval review closed',
    `The account review ${p.id} is ${p.status}. A fresh review is required; no account was changed.`);
  for(const p of expired)if(p.preview?.action==='close-manager')await notifyManagerClosureReview(c,p.id,'Manager portal closure review ended',`The review is ${p.status}. Your portal is unchanged; submit a fresh review request to continue.`);
}
export async function accountReviewStatus(c:PoolClient,a:VerifiedActor) {
  await requireAdministrator(c,a);await expireAccountReviews(c);
  return (await c.query(`select p.*,coalesce((select jsonb_agg(jsonb_build_object('id',v.administrator_context_id,
    'decision',v.decision,'at',v.decided_at) order by v.decided_at,v.administrator_context_id)
    from public.admin_votes v where v.proposal_id=p.id),'[]'::jsonb) as votes
    from public.admin_proposals p where p.kind='account_action' order by p.created_at desc,p.id desc limit 100`)).rows.map(p=>({
      id:p.id,status:p.status,targetId:p.target_context_id,targetRole:displayRoles[p.preview.target?.kind],
      targetName:p.preview.target?.name,action:p.preview.action,reason:p.reason,features:p.preview.features||[],
      duration:p.preview.duration,roster:p.preview.roster||[],votes:p.votes,requestedBy:p.proposer_context_id,
      createdAt:p.created_at,expiresAt:p.expires_at,finalRejectionReason:p.account_final_rejection_reason,
      finalRejectedBy:p.account_final_rejected_by,finalRejectedAt:p.account_final_rejected_at,applicationAvailable:true,appliedAt:p.executed_at,appliedBy:p.executed_by_context_id
      ,closureRequestId:p.preview.closureRequest?.id,portalOnly:p.preview.action==='close-manager'
    }));
}
export async function accountDirectory(c:PoolClient,a:VerifiedActor) {
  await requireAdministrator(c,a);
  const rows=(await c.query(`select x.id,x.kind,x.status,p.display_name as name,p.email,p.phone,private.account_access(x.id) as "accountAccess",x.created_at as "registeredAt",
    root.id as "primaryAccountId",case when x.kind='primary' then null when x.kind='staff' then staff.created_by_manager_id else root.id end as "parentId",
    case when x.kind='primary' then null when x.kind='staff' then 'manager' else 'user' end as "parentRole"
    from public.account_contexts x join public.profiles p on p.id=x.auth_user_id
    left join public.staff_assignments staff on staff.staff_context_id=x.id and staff.ended_at is null
    left join public.account_contexts manager on manager.id=staff.created_by_manager_id
    left join public.account_contexts root on root.kind='primary' and root.auth_user_id=case
      when x.kind='staff' then coalesce(manager.primary_owner_id,manager.auth_user_id,x.primary_owner_id,x.auth_user_id)
      else coalesce(x.primary_owner_id,x.auth_user_id) end
    where x.status<>'closed' order by x.created_at,x.id`)).rows;
  const users=rows.map(({kind,...r})=>({...r,role:displayRoles[kind]}));
  const count=(roles:string[])=>users.filter(u=>roles.includes(u.role)).length;
  return {users,totalUsers:users.length,breakdown:{total:users.length,residents:count(['user','student']),managers:count(['manager']),
    staff:count(['staff']),officers:count(['verification_team']),merchants:count(['merchant']),admins:count(['admin']),others:0}};
}
async function lock(c:PoolClient) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  await c.query('select revision from private.account_review_state where singleton for share');
  await expireAccountReviews(c);
}
export async function proposeAccountReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,input:ReturnType<typeof actionInput>) {
  await lock(c);await requireApprovalGrant(c,a,grant);
  const target=(await c.query('select kind,status from public.account_contexts where id=$1',[input.id])).rows[0];
  if(!target||target.status==='closed')throw new ApiError(404,'Account not found.');
  if(target.kind!==input.kind)throw new ApiError(409,'The selected account type changed. Refresh the directory.');
  if(input.action==='close-manager'){
    const request=(await c.query("select id from private.manager_closure_requests where id=$1 and manager_context_id=$2 and state='pending' for update",[input.closureRequestId,input.id])).rows[0];
    const preview=await managerClosurePreview(c,input.id);
    if(!request||preview.reviewKind!=='account_action'||preview.blockers.length)throw new ApiError(409,'A pending own request from an unassigned manager is required.');
  }
  const roster=(await c.query('select private.recovery_roster() as roster')).rows[0].roster;
  if(roster.length!==5||!roster.some((r:any)=>r.slot===1))throw new ApiError(409,'Five active administrators, including the founder, must enroll their approval keys.');
  if((await c.query("select 1 from public.admin_proposals where kind='account_action' and target_context_id=$1 and status in('pending','approved')",[input.id])).rowCount)
    throw new ApiError(409,'This account already has an open review.');
  if((await c.query("select count(*) from public.admin_proposals where kind='account_action' and status in('pending','approved')")).rows[0].count>=10)
    throw new ApiError(409,'Complete existing account reviews before opening another.');
  const p=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,target_context_id,preview,baseline_digest,reason,quorum,expires_at,account_roster_revision,account_lifecycle_revision)
    select 'account_action',$1,$2,review,private.account_review_digest(review,s.roster_revision,r.revision),$6,5,
      clock_timestamp()+interval '24 hours',s.roster_revision,r.revision
    from private.admin_pricing_state s cross join private.account_review_state r
      cross join lateral(select private.account_review_preview($2,$3,$4::jsonb,$5::jsonb) as review) preview
    where s.singleton and r.singleton returning *`,[a.contextId,input.id,input.action,JSON.stringify(input.features),JSON.stringify(input.duration),input.reason])).rows[0];
  if(input.action==='close-manager')await linkUnassignedManagerClosure(c,a,grant,input.closureRequestId!,p.id);
  await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[p.id,a.contextId]);
  await announce(c,a,p,'Account action proposed','An account action awaits five independent administrator approvals. Approval alone changes no account.');
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'account_review_proposed','admin_proposal',$2)",[a.contextId,p.id]);
  return {success:true,id:p.id,status:'pending',message:'Submitted for five-admin review. The main administrator must make the final decision after five approvals.'};
}
async function proposal(c:PoolClient,id:string,status:string) {
  const p=(await c.query("select p.*,private.account_review_current(p) as current from public.admin_proposals p where id=$1 and kind='account_action' for update",[id])).rows[0];
  if(!p)throw new ApiError(404,'Account review not found.');
  if(!p.current||p.status!==status)throw new ApiError(409,'This review changed or closed. Refresh account approvals.');return p;
}
export async function voteAccountReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,decision:string) {
  await lock(c);await requireApprovalGrant(c,a,grant);const p=await proposal(c,id,'pending');
  if(!p.preview.roster.some((r:any)=>r.id===a.contextId))throw new ApiError(403,'You are not part of the reviewed administrator roster.');
  if((await c.query('select 1 from public.admin_votes where proposal_id=$1 and administrator_context_id=$2',[id,a.contextId])).rowCount)
    throw new ApiError(403,'Each administrator may vote only once.');
  await c.query('insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,$3)',[id,a.contextId,decision]);
  const status=(await c.query('select status from public.admin_proposals where id=$1',[id])).rows[0].status;
  await announce(c,a,p,'Account approval updated',status==='approved'?'Five approvals recorded. The main administrator can now make the final decision.':status==='rejected'?'An administrator rejected the account review. No account changed.':'An independent account review vote was recorded.');
  if(p.preview.action==='close-manager')await notifyManagerClosureReview(c,id,'Manager portal closure approval updated',status==='approved'?'Five approvals were recorded. The founder must still confirm closure.':status==='rejected'?'The closure review was declined. Your portal remains active.':'An administrator recorded a closure-review vote. Your portal remains active.');
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'account_review_vote','admin_proposal',$2)",[a.contextId,id]);
  return {success:true,status,message:status==='approved'?'Five approvals recorded. No account has changed.':'Your account review vote was saved.'};
}
export async function rejectFinalAccountReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,text:string) {
  await lock(c);await requireApprovalGrant(c,a,grant);
  if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)
    throw new ApiError(403,'Only the main administrator can make the final decision.');
  const p=await proposal(c,id,'approved');
  await c.query("update public.admin_proposals set status='rejected',account_final_rejection_reason=$2 where id=$1",[id,text]);
  await announce(c,a,p,'Account action rejected by main administrator','The main administrator rejected the approved account action. No account changed.');
  if(p.preview.action==='close-manager')await notifyManagerClosureReview(c,id,'Manager portal closure declined by founder','The founder declined your closure review. Your portal remains active.');
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'account_review_final_rejected','admin_proposal',$2)",[a.contextId,id]);
  return {success:true,status:'rejected',message:'The final action was rejected. No account changed.'};
}
export async function applyAccountReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string) {
  await lock(c);await requireApprovalGrant(c,a,grant);
  if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)
    throw new ApiError(403,'Only the main administrator can apply an account policy.');
  const p=await proposal(c,id,'approved');
  if(p.preview.action==='close-manager'){
    const notice={category:'verification',title:'Manager portal closed',message:'The founder confirmed your requested unassigned-manager portal closure. Your verified login, primary account, other portals, history and existing registration restrictions are retained.',sender:a.contextId};
    await notify(c,[p.target_context_id],notice);await notifyPrimaryOwner(c,p.target_context_id,notice);
  }
  await c.query("select set_config('pinevela.account_action_confirmation','APPLY ACCOUNT POLICY',true),set_config('pinevela.account_action_proposal_id',$1,true)",[id]);
  const executed=(await c.query("update public.admin_proposals set status='executed' where id=$1 returning executed_at,executed_by_context_id",[id])).rows[0];
  if(p.preview.action==='close-manager'){
    await expireAccountReviews(c);await announce(c,a,p,'Manager portal closure completed','The founder confirmed the reviewed unassigned manager’s portal-only closure. Identity, history and existing restrictions are retained.');
    return {success:true,status:'executed',appliedAt:executed.executed_at,appliedBy:executed.executed_by_context_id,message:'Approved manager portal closure completed. Verified identity and history are retained.'};
  }
  const policy=(await c.query('select ban_until from private.account_policies where context_id=$1',[p.target_context_id])).rows[0];
  await expireAccountReviews(c);
  await announce(c,a,p,'Account policy applied','The main administrator applied the approved '+p.preview.action+' policy.');
  const affected=p.preview.scope.affected as string[];
  const primary=(await c.query("select id from public.account_contexts where kind='primary' and id=any($1::uuid[])",[p.preview.scope.ancestors])).rows.map(r=>r.id);
  const title=p.preview.action==='ban'?'Account access paused':p.preview.action==='restrict'?'Account features restricted':'Account access restored';
  const message=p.preview.target.name+': '+p.reason+(p.preview.action==='ban'?'. Banned until '+new Date(policy.ban_until).toISOString()+'.':
    p.preview.action==='restore'?'. Please sign in again. Policies inherited from a parent account still apply.':'. Restricted features: '+p.preview.features.join(', ')+'.');
  await notify(c,[...affected,...primary],{category:'account_access',title,message,sender:a.contextId});
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'account_policy_applied','admin_proposal',$2)",[a.contextId,id]);
  return {success:true,status:'executed',appliedAt:executed.executed_at,appliedBy:executed.executed_by_context_id,message:'Approved account policy applied.'};
}
export class SupabaseAccountReviews {
  private budgets=new AttemptBudgets();
  constructor(readonly auth:SupabaseAuth){}
  async grant(a:VerifiedActor,key:unknown) {
    this.budgets.reserve([{scope:'administrator-approval-key',identity:a.contextId,maximum:30,windowMs:60000}]);
    const grant=await this.auth.db.authorizedSystem(a,['admin'],c=>checkApprovalKey(c,a,key));deniedApprovalKey(grant);return grant;
  }
  async propose(a:VerifiedActor,body:any) {
    const input=actionInput(body),grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>proposeAccountReview(c,a,grant,input));
  }
  async vote(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['decision','privateKey']);const proposalId=uuid(id);
    if(!['approved','rejected'].includes(body.decision))throw new ApiError(400,'Choose approve or reject.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>voteAccountReview(c,a,grant,proposalId,body.decision));
  }
  async apply(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','confirmation']);const proposalId=uuid(id);
    if(body.confirmation!=='APPLY ACCOUNT POLICY')throw new ApiError(400,'Confirm the account policy before applying it.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>applyAccountReview(c,a,grant,proposalId),false,true,true);
  }
  async rejectFinal(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['reason','privateKey']);const proposalId=uuid(id),text=reason(body.reason),grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>rejectFinalAccountReview(c,a,grant,proposalId,text));
  }
}
export function installAccountReviews(app:Express,auth:SupabaseAuth) {
  const service=new SupabaseAccountReviews(auth);
  const checked=(req:AuthRequest)=>checkAccountReviewContext(req.actor,req.headers['x-pinevela-account-context']);
  app.get('/api/admin/all-users',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await auth.db.authorizedRead(req.actor,['admin'],c=>accountDirectory(c,req.actor)));}));
  app.post('/api/admin/manager-closure-requests/:id/review',auth.require(['admin']),route(async(req,res)=>{
    checked(req);if(Object.keys(req.query).length)throw new ApiError(400,'Account selectors are not accepted.');
    bodyFields(req.body,['privateKey','fingerprint']);const id=uuid(req.params.id),grant=await service.grant(req.actor,req.body.privateKey);
    res.json(await auth.db.authorizedSystem(req.actor,['admin'],async c=>{
      const request=(await c.query('select * from private.manager_closure_requests where id=$1 for update',[id])).rows[0];
      if(!request||request.state!=='pending')throw new ApiError(409,'This closure request is no longer pending.');
      const preview=await managerClosurePreview(c,request.manager_context_id);
      if(preview.reviewKind!=='account_action'||preview.blockers.length||preview.fingerprint!==req.body.fingerprint)
        throw new ApiError(409,'The manager’s assignments changed. Refresh the closure preview.');
      return proposeAccountReview(c,req.actor,grant,{id:request.manager_context_id,kind:'manager',action:'close-manager',reason:request.reason.slice(0,500),features:[],duration:null,closureRequestId:id});
    }));
  }));
  app.post('/api/admin/governance/accounts',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.propose(req.actor,req.body));}));
  app.post('/api/admin/governance/accounts/:id/vote',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.vote(req.actor,req.params.id,req.body));}));
  app.post('/api/admin/governance/accounts/:id/apply',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.apply(req.actor,req.params.id,req.body));}));
  app.post('/api/admin/governance/accounts/:id/final-reject',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.rejectFinal(req.actor,req.params.id,req.body));}));
}
