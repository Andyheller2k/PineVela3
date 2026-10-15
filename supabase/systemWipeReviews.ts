import type {Express,RequestHandler} from 'express';import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';import type {SupabaseAuth,AuthRequest} from './auth.js';
import {bodyFields,requireAdministrator,type SettingsGrant} from './adminSettings.js';
import {checkApprovalKey,deniedApprovalKey,requireApprovalGrant} from './adminGovernance.js';
import {notify} from './notifications.js';import {AttemptBudgets} from '../resourceSecurity.js';
import {requestSystemWipeExecution} from './systemWipeExecutionRequests.js';
export const WIPE_REVIEW_SCOPES=['hostels','markets','managers','residents','users','total'] as const;
export function wipeScopes(value:unknown){
 if(!Array.isArray(value)||!value.length||value.length>6||value.some(s=>!WIPE_REVIEW_SCOPES.includes(s))||new Set(value).size!==value.length||value.includes('total')&&value.length!==1)throw new ApiError(400,'Choose distinct wipe scopes; total cannot be combined with other scopes.');
 return WIPE_REVIEW_SCOPES.filter(s=>value.includes(s));
}
function reason(value:unknown){if(typeof value!=='string'||value.trim().length<3||value.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new ApiError(400,'Provide a reason of 3–500 characters.');return value.trim();}
async function requireFounder(c:PoolClient,a:VerifiedActor,grant:SettingsGrant){
 await requireApprovalGrant(c,a,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)throw new ApiError(403,'Only the founder can prepare or cancel wipe backups.');
}
export async function pauseSystemWipeScope(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,body:any){
 bodyFields(body,['privateKey','confirmation']);await requireFounder(c,a,grant);
 if(body.confirmation!=='PAUSE REVIEWED WIPE')throw new ApiError(400,'Type PAUSE REVIEWED WIPE to pause this exact scope.');
 const row=(await c.query(`select f.id,f.state,p.baseline_digest,private.system_wipe_current(p)as current,private.system_wipe_quorum(p.id)as quorum,
  p.status,p.wipe_final_decision,private.system_wipe_pause_ready(p)as ready from private.system_wipe_preparations f
  join public.admin_proposals p on p.id=f.proposal_id where p.id=$1 for update of f,p`,[id])).rows[0];
 if(!row||row.state!=='active'||row.status!=='approved'||!row.current||!row.quorum||row.wipe_final_decision!=='approve-backup')throw new ApiError(409,'Current five-admin and founder backup consent are required.');
 const existing=(await c.query('select state,created_at from private.system_wipe_freezes where preparation_id=$1',[row.id])).rows[0];
 if(existing?.state==='frozen')return{success:true,noChange:true,pausedAt:existing.created_at,executionAvailable:false,message:'This exact scope is already paused. Nothing was closed or deleted.'};
 if(!row.ready)throw new ApiError(409,'Resolve open orders, unsettled payments, active email verification, photograph uploads and overlapping residence reviews before pausing.');
 if((await c.query('select 1 from private.system_wipe_recovery_evidence where preparation_id=$1',[row.id])).rowCount)throw new ApiError(409,'This preparation already has an earlier snapshot. Cancel it and start a fresh review so recovery files can include the pause.');
 if((await c.query("select 1 from private.system_wipe_freezes where state='frozen'")).rowCount)throw new ApiError(409,'Cancel the existing wipe preparation before pausing another scope.');
 await c.query("select set_config('pinevela.system_wipe_pause_confirmation','PAUSE REVIEWED WIPE',true)");
 const saved=(await c.query('insert into private.system_wipe_freezes(preparation_id,founder_context_id,scope_digest)values($1,$2,$3)returning created_at',[row.id,a.contextId,row.baseline_digest])).rows[0];
 await receipt(c,a,id,'system_wipe_scope_paused');await notice(c,a,'Reviewed system wipe scope paused','The founder paused changes to the exact reviewed records. Accounts and history remain. Restore and verify new database and Storage backups that include this pause. Cancellation resumes writes; no wipe was executed.');
 return{success:true,noChange:false,pausedAt:saved.created_at,executionAvailable:false,message:'Reviewed records are paused. Prepare and verify new recovery files. Cancel preparation to resume writes. Nothing was removed.'};
}
export async function authorizeSystemWipeExecution(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,body:any){
 bodyFields(body,['privateKey','confirmation']);await requireFounder(c,a,grant);
 if(body.confirmation!=='AUTHORIZE REVIEWED WIPE')throw new ApiError(400,'Type AUTHORIZE REVIEWED WIPE to record short-lived final consent.');
 const row=(await c.query(`select f.id,f.scope_digest,z.created_at::text as frozen_at,r.native_catalog_digest from private.system_wipe_preparations f
  join public.admin_proposals p on p.id=f.proposal_id join private.system_wipe_freezes z on z.preparation_id=f.id
  join private.system_wipe_recovery_evidence r on r.preparation_id=f.id
  where p.id=$1 and f.state='active'and z.state='frozen'and p.status='approved'and private.system_wipe_current(p)
   and private.system_wipe_quorum(p.id)and private.system_wipe_pause_ready(p)and p.wipe_final_decision='approve-backup'
   and r.checkpoint_created_at>=z.created_at and r.native_catalog_digest=private.residence_recovery_catalog_digest()for update of f,p,z`,[id])).rows[0];
 if(!row)throw new ApiError(409,'A current paused five-admin review and verified post-pause recovery files are required.');
 const existing=(await c.query(`select id,expires_at,session_id from private.system_wipe_execution_authorizations x where preparation_id=$1
  and private.system_wipe_execution_authorization_current(x)order by created_at desc limit 1`,[row.id])).rows[0];
 if(existing){if(existing.session_id!==a.sessionId)throw new ApiError(409,'Current final consent belongs to another founder sign-in. Wait for it to expire or cancel preparation.');return{success:true,noChange:true,expiresAt:existing.expires_at,executionAvailable:false,message:'Current final consent is already recorded. Its deadline is unchanged; execution remains disabled.'};}
 await c.query("select set_config('pinevela.system_wipe_execution_confirmation','AUTHORIZE REVIEWED WIPE',true)");
 const saved=(await c.query(`insert into private.system_wipe_execution_authorizations(preparation_id,founder_context_id,auth_user_id,session_id,approval_key_version,scope_digest,native_catalog_digest,freeze_created_at)
  values($1,$2,$3,$4,$5,$6,$7,$8)returning expires_at`,[row.id,a.contextId,a.authUserId,a.sessionId,grant.version,row.scope_digest,row.native_catalog_digest,row.frozen_at])).rows[0];
 await receipt(c,a,id,'system_wipe_final_consent');await notice(c,a,'Founder final system wipe consent recorded','The founder used their own current approval key after the reviewed scope was paused and post-pause recovery files were verified. Consent lasts at most five minutes and is bound to that session, key and exact scope. Wipe execution remains disabled.');
 return{success:true,noChange:false,expiresAt:saved.expires_at,executionAvailable:false,message:'Final founder consent recorded for at most five minutes. Execution remains disabled; no account, record or image was removed.'};
}
export async function startSystemWipePreparation(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,body:any){
 bodyFields(body,['privateKey','confirmation']);await requireFounder(c,a,grant);
 if(body.confirmation!=='START WIPE BACKUP')throw new ApiError(400,'Type START WIPE BACKUP to prepare this approved review.');
 const p=(await c.query("select p.*,private.system_wipe_current(p)as current,private.system_wipe_quorum(p.id)as quorum_met from public.admin_proposals p where id=$1 and kind='system_wipe' for update",[id])).rows[0];
 if(!p)throw new ApiError(404,'System wipe review not found.');
 if(p.status!=='approved'||!p.current||!p.quorum_met||p.wipe_final_decision!=='approve-backup'||p.wipe_founder_context_id!==a.contextId)throw new ApiError(409,'Current five-admin approvals and final founder backup consent are required.');
 const existing=(await c.query('select id,state,created_at from private.system_wipe_preparations where proposal_id=$1',[id])).rows[0];
 if(existing){if(existing.state!=='active')throw new ApiError(409,'This preparation ended. Start a fresh review.');return{success:true,noChange:true,preparation:existing,message:'This review already has an active backup preparation. No records were changed.'};}
 if(Number((await c.query("select count(*)from private.system_wipe_preparations where state='active'")).rows[0].count)>=10)throw new ApiError(409,'Cancel an existing backup preparation before starting another.');
 await c.query("select set_config('pinevela.system_wipe_preparation_confirmation','START WIPE BACKUP',true)");
 const saved=(await c.query('insert into private.system_wipe_preparations(proposal_id,founder_context_id,scope_digest)values($1,$2,$3)returning id,state,created_at',[id,a.contextId,p.baseline_digest])).rows[0];
 await receipt(c,a,id,'system_wipe_preparation_started');await notice(c,a,'System wipe backup preparation started','The founder started backup preparation for an exact five-admin review. A trusted operator must restore the database and verify actual Storage bytes. Changes invalidate the review; no records were closed or deleted.');
 return{success:true,noChange:false,preparation:saved,message:'Backup preparation started. Records remain available; changes require fresh consent and backups. Execution remains disabled.'};
}
export async function cancelSystemWipePreparation(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,body:any){
 bodyFields(body,['privateKey','reason']);await requireFounder(c,a,grant);const text=reason(body.reason);
 const prep=(await c.query('select id,state from private.system_wipe_preparations where proposal_id=$1 for update',[id])).rows[0];
 if(prep?.state==='completed')throw new ApiError(409,'This reviewed closure is already complete and cannot be cancelled.');
 if(!prep||prep.state!=='active')throw new ApiError(409,'This review has no active backup preparation.');
 await c.query("update private.system_wipe_preparations set state='cancelled',cancellation_reason=$2 where id=$1",[prep.id,text]);
 await receipt(c,a,id,'system_wipe_preparation_cancelled');await notice(c,a,'System wipe backup preparation cancelled','The founder cancelled backup preparation. Previous consent and backup evidence cannot be reused for a new wipe. Accounts, history and images remain.');
 return{success:true,message:'Backup preparation cancelled. Start a fresh review before any further preparation. Nothing was removed.'};
}
export async function systemWipePreview(c:PoolClient,a:VerifiedActor,selection:unknown){
 await requireAdministrator(c,a);const scopes=wipeScopes(selection);
 let row:any;try{row=(await c.query(`select private.system_wipe_preview($1::jsonb) as preview,(select roster_revision from private.admin_pricing_state where singleton) as roster_revision,(select revision from private.residence_review_state where singleton)as resource_revision`,[JSON.stringify(scopes)])).rows[0];}catch(e:any){if(e?.code==='54000')throw new ApiError(409,'This scope requires an operator-reviewed bulk plan beyond the dashboard limit.');throw e;}
 const total=Object.values(row.preview.counts).reduce<number>((n,v)=>n+Number(v),0);
 if(total>50000)throw new ApiError(409,'This scope requires an operator-reviewed bulk plan beyond the dashboard limit.');
 const fingerprint=(await c.query('select private.system_wipe_digest($1::jsonb,$2::bigint)as digest',[JSON.stringify(row.preview),row.roster_revision])).rows[0].digest;
 return{...row,fingerprint,ready:row.preview.roster.length===5,executionAvailable:false};
}
async function notice(c:PoolClient,a:VerifiedActor,title:string,message:string){
 const ids=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
 await notify(c,ids,{category:'admin_governance',title,message,sender:a.contextId,link:'governance'});
}
async function receipt(c:PoolClient,a:VerifiedActor,id:string,event:string){await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)values($1,$2,'admin_proposal',$3)",[a.contextId,event,id]);}
export async function refreshSystemWipeReviews(c:PoolClient,a:VerifiedActor){
 await requireAdministrator(c,a);
 const changes=(await c.query(`update public.admin_proposals p set status=case when expires_at<=clock_timestamp() then 'expired' else 'invalidated' end
  where kind='system_wipe' and status in('pending','approved') and(expires_at<=clock_timestamp() or not private.system_wipe_current(p))returning id,status`)).rows;
 for(const p of changes){await receipt(c,a,p.id,'system_wipe_review_'+p.status);await notice(c,a,'System wipe review '+p.status,'A wipe review is '+p.status+'. No account, operational record or image was removed. A fresh exact preview and independent approvals are required.');}
 return changes;
}
export async function proposeSystemWipe(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,body:any){
 bodyFields(body,['scopes','reason','fingerprint','privateKey']);const text=reason(body.reason);await requireApprovalGrant(c,a,grant);await refreshSystemWipeReviews(c,a);
 const review=await systemWipePreview(c,a,body.scopes);
 if(!review.ready)throw new ApiError(409,'All five active administrators must enroll their own approval keys, including the founder.');
 if(review.preview.accounts.length+review.preview.residences.length+review.preview.stores.length===0)throw new ApiError(409,'There are no active operational targets in this scope.');
 if(body.fingerprint!==review.fingerprint)throw new ApiError(409,'The exact wipe preview changed. Review it again before proposing.');
 if((await c.query("select 1 from public.admin_proposals where kind='system_wipe' and status in('pending','approved') and preview->'scopes'=$1::jsonb",[JSON.stringify(review.preview.scopes)])).rowCount)throw new ApiError(409,'This exact wipe scope already has an open review.');
 if(Number((await c.query("select count(*)from public.admin_proposals where kind='system_wipe' and status in('pending','approved')")).rows[0].count)>=10)throw new ApiError(409,'Complete an existing wipe review before submitting another.');
 const p=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,preview,baseline_digest,reason,quorum,expires_at,wipe_roster_revision,wipe_resource_revision)
  values('system_wipe',$1,$2,$3,$4,5,clock_timestamp()+interval'24 hours',$5,$6)returning id,status`,[a.contextId,JSON.stringify(review.preview),review.fingerprint,text,review.roster_revision,review.resource_revision])).rows[0];
 await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision)values($1,$2,'approved')",[p.id,a.contextId]);
 await receipt(c,a,p.id,'system_wipe_review_proposed');await notice(c,a,'System wipe proposed for five-key review',`${text} · Scope: ${review.preview.scopes.join(', ')}. The proposer approved once; four other current own-key approvals, including the founder, are required. Verified logins and history are retained. Nothing has been removed.`);
 return{success:true,...p,executionAvailable:false,message:'Exact wipe review saved with your single approval. Nothing has been removed.'};
}
export async function voteSystemWipe(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,decision:unknown){
 await requireApprovalGrant(c,a,grant);if(typeof decision!=='string'||!['approved','rejected'].includes(decision))throw new ApiError(400,'Approve or reject this review.');
 const p=(await c.query("select p.*,private.system_wipe_current(p)as current from public.admin_proposals p where id=$1 and kind='system_wipe' for update",[id])).rows[0];
 if(!p)throw new ApiError(404,'System wipe review not found.');if(p.status!=='pending'||!p.current)throw new ApiError(409,'This wipe review changed, ended or expired. Refresh the reviews.');
 if((await c.query('select 1 from public.admin_votes where proposal_id=$1 and administrator_context_id=$2',[id,a.contextId])).rowCount)throw new ApiError(409,'Your approval key has already voted on this exact review.');
 await c.query('insert into public.admin_votes(proposal_id,administrator_context_id,decision)values($1,$2,$3)',[id,a.contextId,decision]);
 const result=(await c.query('select status from public.admin_proposals where id=$1',[id])).rows[0];
 await receipt(c,a,id,'system_wipe_vote_'+decision);await notice(c,a,'System wipe review '+result.status,'An administrator '+decision+' the exact wipe review. Status: '+result.status+'. Verified logins and history remain; no wipe was executed.');
 return{success:true,status:result.status,executionAvailable:false,message:result.status==='approved'?'All five own-key approvals recorded. The founder must independently review backup preparation. Nothing has been removed.':'Your independent decision is saved. Nothing has been removed.'};
}
export async function founderSystemWipeReview(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,body:any){
 bodyFields(body,['privateKey','decision','reason','confirmation']);await requireApprovalGrant(c,a,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)throw new ApiError(403,'Only the founder can record the final wipe review.');
 if(!['approve-backup','reject'].includes(body.decision)||body.confirmation!==(body.decision==='approve-backup'?'APPROVE WIPE BACKUP':'REJECT APPROVED WIPE'))throw new ApiError(400,'Enter the exact confirmation for this founder decision.');
 const text=reason(body.reason),p=(await c.query("select p.*,private.system_wipe_current(p)as current,private.system_wipe_quorum(p.id)as quorum_met from public.admin_proposals p where id=$1 and kind='system_wipe' for update",[id])).rows[0];
 if(!p)throw new ApiError(404,'System wipe review not found.');
 if(p.status!=='approved'||!p.current||!p.quorum_met||p.wipe_final_decision)throw new ApiError(409,'A current five-keyed review with no final founder decision is required.');
 await c.query("update public.admin_proposals set status=case when $2='reject' then 'rejected' else status end,wipe_final_decision=$2,wipe_final_reason=$3 where id=$1",[id,body.decision,text]);
 await receipt(c,a,id,'system_wipe_founder_'+body.decision);await notice(c,a,'Founder completed system wipe review',body.decision==='reject'?'The founder rejected the five-keyed wipe review. Nothing has been removed.':'The founder approved backup preparation for the exact five-keyed review. Database/Storage recovery and execution remain gated; nothing has been removed.');
 return{success:true,decision:body.decision,executionAvailable:false,message:body.decision==='reject'?'The founder rejected this wipe. Nothing has been removed.':'Founder backup consent recorded. Recovery preparation and execution are still gated. Nothing has been removed.'};
}
export async function systemWipeReviewStatus(c:PoolClient,a:VerifiedActor){
 await refreshSystemWipeReviews(c,a);
 return(await c.query(`select p.id,p.reason,p.status,p.preview,p.proposer_context_id as "createdBy",p.created_at as "createdAt",p.expires_at as "expiresAt",
  p.wipe_final_decision as "founderDecision",p.wipe_final_reason as "founderReason",p.wipe_final_decided_at as "founderDecidedAt",
  coalesce((select jsonb_agg(jsonb_build_object('id',v.administrator_context_id,'decision',v.decision,'at',v.decided_at)order by v.decided_at,v.administrator_context_id)from public.admin_votes v where v.proposal_id=p.id),'[]')as votes,
  (select jsonb_build_object('id',f.id,'state',f.state,'startedAt',f.created_at,'cancelledAt',f.cancelled_at,'completedAt',f.completed_at,'reason',f.cancellation_reason,
   'pause',(select jsonb_build_object('state',z.state,'startedAt',z.created_at,'cancelledAt',z.cancelled_at,'completedAt',z.completed_at)from private.system_wipe_freezes z where z.preparation_id=f.id),
   'finalConsent',(select jsonb_build_object('expiresAt',x.expires_at,'current',private.system_wipe_execution_authorization_current(x))from private.system_wipe_execution_authorizations x where x.preparation_id=f.id order by x.created_at desc limit 1),
   'executionRequest',(select jsonb_build_object('state',q.state,'requestedAt',q.created_at,'expiresAt',q.expires_at,'finishedAt',q.finished_at,'current',private.system_wipe_execution_request_current(q))from private.system_wipe_execution_requests q where q.preparation_id=f.id order by q.created_at desc,q.id desc limit 1),
   'current',f.state='active' and p.status='approved' and private.system_wipe_current(p) and private.system_wipe_quorum(p.id),
   'recovery',(select jsonb_build_object('verifiedAt',r.verified_at,'objects',r.objects,'bytes',r.bytes,'current',f.state='active' and p.status='approved' and private.system_wipe_current(p) and private.system_wipe_quorum(p.id) and r.native_catalog_digest=private.residence_recovery_catalog_digest())from private.system_wipe_recovery_evidence r where r.preparation_id=f.id))
   from private.system_wipe_preparations f where f.proposal_id=p.id)as preparation
  from public.admin_proposals p where kind='system_wipe' order by created_at desc,id limit 100`)).rows;
}
function checked(req:AuthRequest){if(Object.keys(req.query).length)throw new ApiError(400,'Identity selectors are not accepted.');const expected=req.headers['x-pinevela-account-context'];if(expected!==undefined&&expected!==req.actor.contextId)throw new ApiError(409,'Your active account changed. Reopen wipe reviews.');}
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
export function installSystemWipeReviews(app:Express,auth:SupabaseAuth){
 const limits=new AttemptBudgets(),grant=async(req:AuthRequest)=>{limits.reserve([{scope:'system-wipe-review',identity:req.actor.contextId,maximum:10,windowMs:60000}]);const g=await auth.db.authorizedSystem(req.actor,['admin'],c=>checkApprovalKey(c,req.actor,req.body.privateKey));deniedApprovalKey(g);return g;};
 app.post('/api/admin/governance/preview',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['scopes']);res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>systemWipePreview(c,req.actor,req.body.scopes)));}));
 app.post('/api/admin/governance/proposals',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['scopes','reason','fingerprint','privateKey']);const g=await grant(req);res.status(201).json(await auth.db.authorizedSystem(req.actor,['admin'],c=>proposeSystemWipe(c,req.actor,g,req.body),false,false,true));}));
 app.post('/api/admin/governance/proposals/:id/vote',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['privateKey','decision']);const g=await grant(req);res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>voteSystemWipe(c,req.actor,g,uuid(req.params.id),req.body.decision),false,false,true));}));
 app.post('/api/admin/governance/proposals/:id/founder-review',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['privateKey','decision','reason','confirmation']);const g=await grant(req);res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>founderSystemWipeReview(c,req.actor,g,uuid(req.params.id),req.body),false,false,true));}));
 app.post('/api/admin/governance/proposals/:id/prepare',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['privateKey','confirmation']);const g=await grant(req);res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>startSystemWipePreparation(c,req.actor,g,uuid(req.params.id),req.body),false,false,true));}));
 app.post('/api/admin/governance/proposals/:id/cancel-preparation',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['privateKey','reason']);const g=await grant(req);res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>cancelSystemWipePreparation(c,req.actor,g,uuid(req.params.id),req.body),false,false,true));}));
 app.post('/api/admin/governance/proposals/:id/pause',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['privateKey','confirmation']);const g=await grant(req);res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>pauseSystemWipeScope(c,req.actor,g,uuid(req.params.id),req.body),false,false,true));}));
 app.post('/api/admin/governance/proposals/:id/authorize-execution',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['privateKey','confirmation']);const g=await grant(req);res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>authorizeSystemWipeExecution(c,req.actor,g,uuid(req.params.id),req.body),false,false,true));}));
 app.post('/api/admin/governance/proposals/:id/execute',auth.require(['admin']),route(async(req,res)=>{checked(req);bodyFields(req.body,['privateKey','confirmation']);const g=await grant(req);const result=await auth.db.authorizedSystem(req.actor,['admin'],c=>requestSystemWipeExecution(c,req.actor,g,uuid(req.params.id),req.body),false,false,true);res.status(result.status==='queued'?202:200).json(result);}));
 app.post('/api/admin/clear-all-registered-accounts',auth.require(['admin']),(_req,res)=>res.status(410).json({error:'Single-administrator wipes are retired. Use an exact five-administrator wipe review.'}));
}
