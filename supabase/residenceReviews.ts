import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {bodyFields,requireAdministrator,type SettingsGrant} from './adminSettings.js';
import {checkApprovalKey,deniedApprovalKey,requireApprovalGrant} from './adminGovernance.js';
import {checkAccountReviewContext} from './accountReviews.js';
import {AttemptBudgets} from '../resourceSecurity.js';
import {authorizeResidenceExecution} from './residenceAuthorization.js';
import {requestResidenceExecution,residenceExecutionRequestsEnabled} from './residenceExecutionRequests.js';
import {notify} from './notifications.js';
import {linkManagerClosure,notifyManagerClosureReview} from './managerClosureRequests.js';

const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
type Options={hostelId:string;deleteHostel:true;deleteManager:boolean;ban:{amount:number;unit:string}};
export function residenceReviewOptions(body:any):Options {
  const hostelId=uuid(body.hostelId);
  if(body.deleteHostel!==true||typeof body.deleteManager!=='boolean')throw new ApiError(400,'Select a residence and choose whether to remove its manager portal.');
  bodyFields(body.ban,['amount','unit']);
  const {amount,unit}=body.ban,units:Record<string,number>={hours:3600000,days:86400000,weeks:604800000,months:2592000000,years:31536000000};
  if(!Number.isSafeInteger(amount)||amount<0||typeof unit!=='string'||!Object.hasOwn(units,unit)||amount*units[unit]>3153600000000)
    throw new ApiError(400,'Choose a whole registration cooldown from zero to 100 years.');
  return {hostelId:hostelId.toLowerCase(),deleteHostel:true,deleteManager:body.deleteManager,ban:{amount,unit}};
}
function reason(value:unknown) {
  if(typeof value!=='string'||value.trim().length<3||value.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new ApiError(400,'Provide a reason of 3–1000 characters.');
  return value.trim();
}
async function lock(c:PoolClient) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  await c.query('select revision from private.residence_review_state where singleton for share');
}
async function announce(c:PoolClient,a:VerifiedActor|undefined,p:any,title:string,message:string) {
  const ids=(await c.query(`select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    where m.status='active' and x.status='active'`)).rows.map(r=>r.context_id);
  await notify(c,ids,{category:'admin_governance',title,message,sender:a?.contextId,link:'governance'});
  await notifyManagerClosureReview(c,p.id,title,message);
  if(a)await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,$2,'admin_proposal',$3)",
    [a.contextId,'residence_review_'+p.status,p.id]);
}
export async function expireResidenceReviews(c:PoolClient) {
  const rows=(await c.query(`update public.admin_proposals set status=case when expires_at<=clock_timestamp() then 'expired' else 'invalidated' end
    where kind='residence_deletion' and status in('pending','approved') and not private.residence_review_current(admin_proposals)
    returning id,status,preview`)).rows;
  for(const p of rows)await announce(c,undefined,p,'Residence deletion review closed',
    `The review for ${p.preview.hostelName} is ${p.status}. Fresh consent is required. No residence or account was deleted.`);
}
function visiblePreview(p:any) {
  const {resourceIds,dependenciesDigest,rosterRevision,lifecycleRevision,...visible}=p;
  return {...visible,...p.options,uploadCount:p.uploads.length,uploadBytes:p.uploads.reduce((sum:number,m:any)=>sum+m.bytes,0),
    managerName:p.accounts.filter((a:any)=>a.role==='manager').map((a:any)=>a.name).join(', ')};
}
export async function residenceReviewStatus(c:PoolClient,a:VerifiedActor) {
  await requireAdministrator(c,a);await lock(c);await expireResidenceReviews(c);
  return (await c.query(`select p.*,coalesce((select jsonb_agg(jsonb_build_object('id',v.administrator_context_id,'slot',m.slot,
    'name',f.display_name,'decision',v.decision,'at',v.decided_at) order by v.decided_at,v.administrator_context_id)
    from public.admin_votes v join public.admin_memberships m on m.context_id=v.administrator_context_id
    join public.account_contexts x on x.id=m.context_id join public.profiles f on f.id=x.auth_user_id
    where v.proposal_id=p.id),'[]'::jsonb) as votes,
    (select jsonb_build_object('id',f.id,'state',f.state,'startedAt',f.created_at,'cancelledAt',f.cancelled_at,
      'reason',f.cancellation_reason,'recovery',(select jsonb_build_object('verifiedAt',r.verified_at)
        from private.residence_recovery_evidence r where r.preparation_id=f.id),
      'cleanup',(select jsonb_build_object('plannedAt',q.created_at,'removeCount',q.plan->'removeCount','retainCount',q.plan->'retainCount')
        from private.residence_cleanup_plans q where q.preparation_id=f.id),
      'authorization',(select jsonb_build_object('authorizedAt',a.created_at,'expiresAt',a.expires_at,
        'current',private.residence_execution_authorization_current(a)) from private.residence_execution_authorizations a
        where a.preparation_id=f.id order by a.created_at desc,a.id desc limit 1),
      'request',(select jsonb_build_object('id',r.id,'state',r.state,'requestedAt',r.created_at,'expiresAt',r.expires_at,
        'current',private.residence_execution_request_current(r),'failureCode',r.failure_code)
        from private.residence_execution_requests r where r.proposal_id=p.id order by r.created_at desc,r.id desc limit 1),
      'execution',(select jsonb_build_object('completedAt',e.completed_at,
        'cleanupTotal',(select count(*) from private.residence_storage_cleanup_tasks t where t.execution_id=e.id),
        'cleanupCompleted',(select count(*) from private.residence_storage_cleanup_tasks t
          join private.residence_storage_cleanup_attempts a on a.asset_id=t.asset_id and a.state='completed' where t.execution_id=e.id))
        from private.residence_executions e where e.preparation_id=f.id and e.state='completed'))
      from private.residence_deletion_preparations f where f.proposal_id=p.id) as preparation
    from public.admin_proposals p
    where kind='residence_deletion' order by exists(select 1 from private.residence_deletion_preparations f
      where f.proposal_id=p.id and f.state='frozen') desc,created_at desc,id desc limit 100`)).rows.map(p=>({
      id:p.id,status:p.status,preview:visiblePreview(p.preview),reason:p.reason,votes:p.votes,createdAt:p.created_at,expiresAt:p.expires_at,
      finalReason:p.residence_final_reason,finalDecisionBy:p.residence_final_by,finalDecisionAt:p.residence_final_at,
      preparation:p.preparation,preparationAvailable:p.preview.preparationAvailable===true,
      executionAvailable:residenceExecutionRequestsEnabled()&&p.status==='approved'&&p.preparation?.state==='frozen'
        &&p.preparation?.authorization?.current===true&&p.preparation?.request?.current!==true
    }));
}
async function preview(c:PoolClient,options:Options) {
  const p=(await c.query('select private.residence_review_preview($1::jsonb) as preview',[JSON.stringify(options)])).rows[0].preview;
  if(!p)throw new ApiError(404,'Residence not found or already closed.');return p;
}
export async function proposeResidenceReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,options:Options,text:string,fingerprint:string) {
  await lock(c);await requireApprovalGrant(c,a,grant);await expireResidenceReviews(c);
  const p=await preview(c,options);
  if(p.fingerprint!==fingerprint)throw new ApiError(409,'The dependency preview changed. Review the current records again.');
  if(p.blockers.length)throw new ApiError(409,p.blockers.join(' '));
  if((await c.query(`select 1 from private.residence_deletion_preparations f join public.admin_proposals existing on existing.id=f.proposal_id
    where f.state='frozen' and existing.preview->'resourceIds' ?| $1::text[]`,[p.resourceIds])).rowCount)
    throw new ApiError(409,'Resume the overlapping preparation pause before opening another review.');
  const overlap=(await c.query(`select 1 from public.admin_proposals where kind='residence_deletion' and status in('pending','approved')
    and preview->'resourceIds' ?| $1::text[]`,[p.resourceIds])).rowCount;
  if(overlap)throw new ApiError(409,'An overlapping residence deletion review is already open.');
  if(Number((await c.query("select count(*) from public.admin_proposals where kind='residence_deletion' and status in('pending','approved')")).rows[0].count)>=10)
    throw new ApiError(409,'Complete existing residence reviews before opening another.');
  const saved=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,target_residence_id,preview,baseline_digest,reason,quorum,
    expires_at,residence_roster_revision,residence_lifecycle_revision) values('residence_deletion',$1,$2,$3,$4,$5,2,
    clock_timestamp()+interval '24 hours',$6,$7) returning *`,
    [a.contextId,options.hostelId,JSON.stringify(p),p.fingerprint,text,p.rosterRevision,p.lifecycleRevision])).rows[0];
  await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[saved.id,a.contextId]);
  await announce(c,a,saved,'Residence deletion proposed',
    `${p.hostelName} awaits at least two independent keyed approvals and the founder's final decision. No residence or account has changed.`);
  return {success:true,id:saved.id,status:'pending',executionAvailable:false,message:'Residence deletion review submitted. No residence or account was deleted.'};
}
async function proposal(c:PoolClient,id:string) {
  const p=(await c.query("select p.*,private.residence_review_current(p) as current from public.admin_proposals p where id=$1 and kind='residence_deletion' for update",[id])).rows[0];
  if(!p)throw new ApiError(404,'Residence deletion review not found.');
  if(!p.current||!['pending','approved'].includes(p.status))throw new ApiError(409,'This residence review changed or closed. Refresh approvals.');return p;
}
export async function voteResidenceReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,decision:string) {
  await lock(c);await requireApprovalGrant(c,a,grant);await expireResidenceReviews(c);const p=await proposal(c,id);
  if(!p.preview.roster.some((r:any)=>r.id===a.contextId))throw new ApiError(403,'You are not in the reviewed administrator roster.');
  if((await c.query('select 1 from public.admin_votes where proposal_id=$1 and administrator_context_id=$2',[id,a.contextId])).rowCount)
    throw new ApiError(403,'Each administrator may vote only once.');
  await c.query('insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,$3)',[id,a.contextId,decision]);
  const saved=(await c.query('select * from public.admin_proposals where id=$1',[id])).rows[0];
  await announce(c,a,saved,'Residence deletion approval updated',saved.status==='rejected'
    ?`${p.preview.hostelName}: an administrator rejected deletion. No records changed.`
    :`${p.preview.hostelName}: ${saved.status==='approved'?'At least two approvals recorded. The founder must give final keyed consent.':'An independent vote was saved.'} No records changed.`);
  return {success:true,status:saved.status,executionAvailable:false,message:'Your residence deletion vote was saved. No records were deleted.'};
}
export async function rejectResidenceReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,text:string) {
  await lock(c);await requireApprovalGrant(c,a,grant);await expireResidenceReviews(c);
  if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)
    throw new ApiError(403,'Only the founder can make the final residence decision.');
  const p=await proposal(c,id);
  await c.query("update public.admin_proposals set status='rejected',residence_final_reason=$2 where id=$1",[id,text]);
  await announce(c,a,{...p,status:'rejected'},'Residence deletion rejected by founder',`${p.preview.hostelName}: the founder rejected deletion. The residence and accounts remain.`);
  return {success:true,status:'rejected',message:'Founder rejected deletion. No residence or account changed.'};
}
async function requireFounder(c:PoolClient,a:VerifiedActor,grant:SettingsGrant) {
  await requireApprovalGrant(c,a,grant);
  if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)
    throw new ApiError(403,'Only the founder can pause or resume reviewed housing records.');
}
async function preparationNotice(c:PoolClient,a:VerifiedActor,p:any,paused:boolean) {
  const title=paused?'Residence backup preparation started':'Residence backup preparation cancelled';
  const message=paused?`${p.preview.hostelName}: reviewed housing records are paused while backups are prepared. No residence or account has been deleted.`
    :`${p.preview.hostelName}: the backup preparation pause has ended. Fresh deletion approvals are required. No residence or account was deleted.`;
  await announce(c,a,p,title,message);
  const recipients=[...p.preview.primaryOwners,...p.preview.accounts.map((x:any)=>x.id)];
  await notify(c,recipients,{category:'account_access',title,message,sender:a.contextId});
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,$2,'admin_proposal',$3)",
    [a.contextId,paused?'residence_preparation_started':'residence_preparation_cancelled',p.id]);
}
/** The caller must take the exclusive residence-deletion-freeze lock before any
 * actor/governance locks. This transaction pauses records only; no provider I/O. */
export async function prepareResidenceReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string) {
  await lock(c);await requireFounder(c,a,grant);await expireResidenceReviews(c);
  const p=await proposal(c,id);
  if(p.status!=='approved'||p.preview.preparationAvailable!==true)throw new ApiError(409,'Obtain two current approvals before preparing backups.');
  if((await c.query('select 1 from private.residence_deletion_preparations where proposal_id=$1',[id])).rowCount)
    throw new ApiError(409,'This review already has a preparation record. Refresh its status.');
  if(Number((await c.query("select count(*) from private.residence_deletion_preparations where state='frozen'")).rows[0].count)>=10)
    throw new ApiError(409,'Resume existing preparation pauses before starting another.');
  if(!(await c.query('select 1 from public.admin_votes where proposal_id=$1 and administrator_context_id=$2',[id,a.contextId])).rowCount)
    await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[id,a.contextId]);
  await c.query("select set_config('pinevela.residence_preparation_confirmation','FREEZE APPROVED HOSTEL',true)");
  const saved=(await c.query(`insert into private.residence_deletion_preparations(proposal_id,founder_context_id,preview_digest)
    values($1,$2,$3) returning id,state`,[id,a.contextId,p.baseline_digest])).rows[0];
  await preparationNotice(c,a,p,true);
  return {success:true,preparation:saved,message:'Reviewed housing records are paused for backup preparation. No records were deleted.'};
}
export async function cancelResidencePreparation(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,text:string) {
  await lock(c);await requireFounder(c,a,grant);
  const p=(await c.query("select * from public.admin_proposals where id=$1 and kind='residence_deletion' for update",[id])).rows[0];
  if(!p)throw new ApiError(404,'Residence deletion review not found.');
  const saved=(await c.query(`select id,state from private.residence_deletion_preparations where proposal_id=$1 for update`,[id])).rows[0];
  if(!saved||saved.state!=='frozen')throw new ApiError(409,'This review has no active preparation pause.');
  await c.query("update private.residence_deletion_preparations set state='cancelled',cancellation_reason=$2 where id=$1",[saved.id,text]);
  await preparationNotice(c,a,p,false);
  return {success:true,preparation:{id:saved.id,state:'cancelled'},message:'Housing records are available again. Start a new review before deletion.'};
}
export class SupabaseResidenceReviews {
  private budgets=new AttemptBudgets();
  constructor(readonly auth:SupabaseAuth,readonly executionRequestsEnabled=residenceExecutionRequestsEnabled()){}
  private async grant(a:VerifiedActor,key:unknown) {
    this.budgets.reserve([{scope:'administrator-residence-approval-key',identity:a.contextId,maximum:30,windowMs:60000}]);
    const grant=await this.auth.db.authorizedSystem(a,['admin'],c=>checkApprovalKey(c,a,key));deniedApprovalKey(grant);return grant;
  }
  async preview(a:VerifiedActor,body:any) {
    bodyFields(body,['hostelId','deleteHostel','deleteManager','ban']);const options=residenceReviewOptions(body);
    return this.auth.db.authorizedSystem(a,['admin'],async c=>{await requireAdministrator(c,a);await lock(c);return visiblePreview(await preview(c,options));});
  }
  async propose(a:VerifiedActor,body:any) {
    bodyFields(body,['hostelId','deleteHostel','deleteManager','ban','privateKey','reason','fingerprint','closureRequestId']);
    const options=residenceReviewOptions(body),text=reason(body.reason);
    if(typeof body.fingerprint!=='string'||! /^[a-f0-9]{64}$/.test(body.fingerprint))throw new ApiError(400,'Review the residence dependencies before proposing deletion.');
    const grant=await this.grant(a,body.privateKey);
    const requestId=body.closureRequestId===undefined ? undefined : uuid(body.closureRequestId);
    return this.auth.db.authorizedSystem(a,['admin'],async c=>{
      const result=await proposeResidenceReview(c,a,grant,options,text,body.fingerprint);
      if(requestId)await linkManagerClosure(c,a,grant,requestId,result.id);
      return result;
    });
  }
  async vote(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['decision','privateKey']);const target=uuid(id);
    if(!['approved','rejected'].includes(body.decision))throw new ApiError(400,'Choose approve or reject.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>voteResidenceReview(c,a,grant,target,body.decision));
  }
  async rejectFinal(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','reason']);const target=uuid(id),text=reason(body.reason),grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>rejectResidenceReview(c,a,grant,target,text));
  }
  async execute(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','confirmation']);const target=uuid(id);
    if(!this.executionRequestsEnabled)return this.auth.db.authorizedSystem(a,['admin'],async()=>{throw new ApiError(503,
      'Reviewed deletion requests are not enabled pending authenticated acceptance. No records were deleted.','residence_execution_unavailable');});
    if(body.confirmation!=='DELETE APPROVED HOSTEL')throw new ApiError(400,'Type DELETE APPROVED HOSTEL to request the reviewed deletion.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>requestResidenceExecution(c,a,grant,target),false,false,true);
  }
  async authorizeExecution(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','confirmation']);const target=uuid(id);
    if(body.confirmation!=='AUTHORIZE APPROVED HOSTEL')throw new ApiError(400,'Type AUTHORIZE APPROVED HOSTEL to give final consent.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>authorizeResidenceExecution(c,a,grant,target),false,false,true);
  }
  async prepare(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','confirmation']);const target=uuid(id);
    if(body.confirmation!=='FREEZE APPROVED HOSTEL')throw new ApiError(400,'Type FREEZE APPROVED HOSTEL to pause the reviewed records.');
    const grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>prepareResidenceReview(c,a,grant,target),false,false,true);
  }
  async cancelPreparation(a:VerifiedActor,id:unknown,body:any) {
    bodyFields(body,['privateKey','reason']);const target=uuid(id),text=reason(body.reason),grant=await this.grant(a,body.privateKey);
    return this.auth.db.authorizedSystem(a,['admin'],c=>cancelResidencePreparation(c,a,grant,target,text),false,false,true);
  }
}
export function installResidenceReviews(app:Express,auth:SupabaseAuth) {
  const service=new SupabaseResidenceReviews(auth),checked=(req:AuthRequest)=>checkAccountReviewContext(req.actor,req.headers['x-pinevela-account-context']);
  app.post('/api/admin/governance/residences/preview',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.preview(req.actor,req.body));}));
  app.post('/api/admin/governance/residences',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.propose(req.actor,req.body));}));
  app.post('/api/admin/governance/residences/:id/vote',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.vote(req.actor,req.params.id,req.body));}));
  app.post('/api/admin/governance/residences/:id/final-reject',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.rejectFinal(req.actor,req.params.id,req.body));}));
  app.post('/api/admin/governance/residences/:id/execute',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.execute(req.actor,req.params.id,req.body));}));
  app.post('/api/admin/governance/residences/:id/authorize-execution',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.authorizeExecution(req.actor,req.params.id,req.body));}));
  app.post('/api/admin/governance/residences/:id/prepare',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.prepare(req.actor,req.params.id,req.body));}));
  app.post('/api/admin/governance/residences/:id/cancel-preparation',auth.require(['admin']),route(async(req,res)=>{checked(req);res.json(await service.cancelPreparation(req.actor,req.params.id,req.body));}));
}
