import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor} from './db.js';
import {requireApprovalGrant} from './adminGovernance.js';
import type {SettingsGrant} from './adminSettings.js';
import {notify} from './notifications.js';

/** Server-only release gate. Request bodies and VITE variables cannot enable it. */
export function residenceExecutionRequestsEnabled() {
 return process.env.PINEVELA_RESIDENCE_EXECUTION_REQUESTS==='true';
}
export async function requestResidenceExecution(c:PoolClient,actor:VerifiedActor,grant:SettingsGrant,proposalId:string) {
 await requireApprovalGrant(c,actor,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[actor.contextId])).rowCount)
  throw new ApiError(403,'Only the founder can request reviewed residence deletion.');
 const completed=(await c.query("select id,completed_at from private.residence_executions where proposal_id=$1 and state='completed'",[proposalId])).rows[0];
 if(completed)return {success:true,status:'executed',noChange:true,executionId:completed.id,completedAt:completed.completed_at,
  message:'Reviewed residence deletion is already completed. No deletion was replayed.'};
 const consent=(await c.query(`select a.* from private.residence_execution_authorizations a
  join private.residence_deletion_preparations f on f.id=a.preparation_id
  where f.proposal_id=$1 and a.founder_context_id=$2 and a.auth_user_id=$3 and a.session_id=$4
   and a.approval_key_version=$5 and private.residence_execution_authorization_current(a)
  order by a.created_at desc,a.id desc limit 1`,[proposalId,actor.contextId,actor.authUserId,actor.sessionId,grant.version])).rows[0];
 if(!consent)throw new ApiError(409,'Give fresh final founder consent for the exact verified recovery plan.');
 const prior=(await c.query('select id,state,created_at,expires_at from private.residence_execution_requests where authorization_id=$1',[consent.id])).rows[0];
 if(prior&&prior.state!=='requested')throw new ApiError(409,'This execution request is no longer usable. Refresh approvals.');
 if(prior)return {success:true,status:'queued',noChange:true,request:{id:prior.id,state:prior.state,requestedAt:prior.created_at,expiresAt:prior.expires_at},
  message:'The same reviewed deletion request is already queued. No records have been deleted.'};
 await c.query("select set_config('pinevela.residence_execution_request_confirmation','DELETE APPROVED HOSTEL',true)");
 const saved=(await c.query(`insert into private.residence_execution_requests(authorization_id,proposal_id,founder_context_id,auth_user_id,session_id,approval_key_version,expires_at)
  values($1,$2,$3,$4,$5,$6,$7) returning id,state,created_at,expires_at`,
  [consent.id,proposalId,actor.contextId,actor.authUserId,actor.sessionId,grant.version,consent.expires_at])).rows[0];
 const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
 await notify(c,admins,{category:'admin_governance',title:'Reviewed residence deletion requested',
  message:'The founder requested the exact reviewed deletion. Backups and current consent must be rechecked before execution; no records have been deleted.',sender:actor.contextId,link:'governance'});
 await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'residence_execution_requested','admin_proposal',$2)",[actor.contextId,proposalId]);
 return {success:true,status:'queued',noChange:false,request:{id:saved.id,state:saved.state,requestedAt:saved.created_at,expiresAt:saved.expires_at},
  message:'Reviewed deletion requested. The worker must verify backups and current consent before deleting records.'};
}
