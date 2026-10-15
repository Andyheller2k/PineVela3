import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor} from './db.js';
import {requireApprovalGrant} from './adminGovernance.js';
import type {SettingsGrant} from './adminSettings.js';
import {notify} from './notifications.js';

/** A short native consent record. The future worker must reverify recovery files
 * and current authorization before any operational removal or Storage API call. */
export async function authorizeResidenceExecution(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,proposalId:string) {
 await c.query("select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0))");
 await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
 await requireApprovalGrant(c,a,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)
  throw new ApiError(403,'Only the founder can give final residence deletion authorization.');
 const plan=(await c.query(`select f.id,p.baseline_digest,q.plan_digest,q.native_catalog_digest,p.preview->>'hostelName' as hostel_name
  from private.residence_deletion_preparations f join public.admin_proposals p on p.id=f.proposal_id
  join private.residence_cleanup_plans q on q.preparation_id=f.id
  where p.id=$1 and p.kind='residence_deletion' and p.status='approved' and f.state='frozen'
   and private.residence_review_current(p) and private.residence_review_quorum(p.id)
   and q.plan=private.residence_cleanup_preview(f.id)
   and q.native_catalog_digest=private.residence_recovery_catalog_digest() for update of f,p`,[proposalId])).rows[0];
 if(!plan)throw new ApiError(409,'A current approved pause, verified recovery and exact cleanup plan are required.');
 const saved=(await c.query(`select id,created_at,expires_at from private.residence_execution_authorizations a
  where preparation_id=$1 and private.residence_execution_authorization_current(a) order by created_at desc limit 1`,[plan.id])).rows[0];
 if(saved)return result(saved,true);
 await c.query("select set_config('pinevela.residence_execution_confirmation','AUTHORIZE APPROVED HOSTEL',true)");
 const row=(await c.query(`insert into private.residence_execution_authorizations(preparation_id,founder_context_id,auth_user_id,
  session_id,approval_key_version,scope_digest,plan_digest,native_catalog_digest)
  values($1,$2,$3,$4,$5,$6,$7,$8) returning id,created_at,expires_at`,
  [plan.id,a.contextId,a.authUserId,a.sessionId,grant.version,plan.baseline_digest,plan.plan_digest,plan.native_catalog_digest])).rows[0];
 const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
 await notify(c,admins,{category:'admin_governance',title:'Founder authorized residence deletion',sender:a.contextId,
  message:`${plan.hostel_name}: the founder gave final keyed consent. Consent expires within five minutes and requires current recovery evidence. No residence, account or image has been deleted.`,link:'governance'});
 await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'residence_execution_authorized','residence_preparation',$2)",[a.contextId,plan.id]);
 return result(row,false);
}
function result(row:any,noChange:boolean) {
 return {success:true,noChange,authorization:{authorizedAt:row.created_at,expiresAt:row.expires_at},executionAvailable:false,
  message:'Final founder consent recorded. It expires within five minutes. No residence, account or image has been deleted.'};
}
