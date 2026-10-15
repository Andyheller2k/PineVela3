import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import {bodyFields,type SettingsGrant} from './adminSettings.js';
import {requireApprovalGrant} from './adminGovernance.js';
import {notify} from './notifications.js';

/** Server/operator configuration only. Browser fields cannot release this gate. */
export function systemWipeExecutionRequestsEnabled(){
 return process.env.PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS==='true';
}
export async function requestSystemWipeExecution(c:PoolClient,actor:VerifiedActor,grant:SettingsGrant,proposalId:string,body:any){
 bodyFields(body,['privateKey','confirmation']);
 await requireApprovalGrant(c,actor,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[actor.contextId])).rowCount)
  throw new ApiError(403,'Only the current founder can request reviewed operational closure.');
 if(body.confirmation!=='CLOSE REVIEWED OPERATIONAL PORTALS')throw new ApiError(400,'Type CLOSE REVIEWED OPERATIONAL PORTALS to request this exact closure.');
 if(!systemWipeExecutionRequestsEnabled())throw new ApiError(503,'Reviewed wipe execution is not enabled. No request was queued.');
 const target=uuid(proposalId);
 const completed=(await c.query("select id,completed_at from private.primary_wipe_executions where proposal_id=$1 and state='completed'",[target])).rows[0];
 if(completed)return{success:true,status:'executed',noChange:true,executionId:completed.id,completedAt:completed.completed_at,message:'This reviewed closure is already completed. It was not replayed.'};
 const consent=(await c.query(`select a.* from private.system_wipe_execution_authorizations a
  join private.system_wipe_preparations f on f.id=a.preparation_id where f.proposal_id=$1
  and a.founder_context_id=$2 and a.auth_user_id=$3 and a.session_id=$4 and a.approval_key_version=$5
  and private.system_wipe_execution_authorization_current(a)order by a.created_at desc,a.id desc limit 1`,
  [target,actor.contextId,actor.authUserId,actor.sessionId,grant.version])).rows[0];
 if(!consent)throw new ApiError(409,'Fresh final founder consent for this exact paused and restored scope is required.');
 const prior=(await c.query('select id,state,created_at,expires_at from private.system_wipe_execution_requests where authorization_id=$1',[consent.id])).rows[0];
 if(prior&&prior.state!=='requested')throw new ApiError(409,'This execution request ended. Refresh the review before continuing.');
 if(prior)return{success:true,status:'queued',noChange:true,request:{id:prior.id,state:prior.state,requestedAt:prior.created_at,expiresAt:prior.expires_at},message:'The same reviewed closure is already queued. No duplicate request was created.'};
 const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active'and x.status='active'")).rows.map(r=>r.context_id);
 const notice=await notify(c,admins,{category:'admin_governance',title:'Reviewed system wipe queued',sender:actor.contextId,link:'governance',
  message:'The founder requested the exact five-admin operational closure. The worker must recheck saved recovery files and current consent before acting. Verified logins and history are retained.'});
 await c.query("select set_config('pinevela.system_wipe_request_confirmation','CLOSE REVIEWED OPERATIONAL PORTALS',true)");
 const saved=(await c.query(`insert into private.system_wipe_execution_requests(authorization_id,preparation_id,proposal_id,founder_context_id,auth_user_id,session_id,approval_key_version,expires_at,queued_notification_id)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9)returning id,state,created_at,expires_at`,
  [consent.id,consent.preparation_id,target,actor.contextId,actor.authUserId,actor.sessionId,grant.version,consent.expires_at,notice])).rows[0];
 await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)values($1,'system_wipe_execution_requested','system_wipe_execution_request',$2)",[actor.contextId,saved.id]);
 return{success:true,status:'queued',noChange:false,request:{id:saved.id,state:saved.state,requestedAt:saved.created_at,expiresAt:saved.expires_at},message:'Reviewed closure queued. The worker must verify recovery and current consent before acting. Your verified login and history will remain.'};
}
