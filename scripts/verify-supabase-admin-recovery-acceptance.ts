/** Compare actual recovery against its encrypted pre-recovery checkpoint.
 * No Auth/session fabrication, key/hash retrieval, provider mocks or cloud writes. */
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {administratorSettingsStatus} from '../supabase/adminSettings.js';
import {requireApprovalGrant} from '../supabase/adminGovernance.js';
dotenv.config({quiet:true});
const [checkpoint,slotText]=process.argv.slice(2),slot=Number(slotText);
if(!checkpoint||!Number.isInteger(slot)||slot<2||slot>5)throw new Error('Pass the pre-recovery checkpoint UUID and target slot (2–5).');
let checks=0;
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
const baseline=await withIsolatedBackup(checkpoint,async config=>{
  const restored=new SupabaseDatabase(config);
  try{
    const keys=(await restored.pool.query(`select m.slot,c.id as context_id,c.auth_user_id,
      k.approval_key_version,k.settings_key_version,k.approval_key_hash is not null as approval_enrolled,
      k.settings_key_hash is not null as settings_enrolled
      from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
      join private.admin_secrets k on k.context_id=c.id where m.status='active' order by m.slot`)).rows;
    const target=keys.find(k=>k.slot===slot);
    check(target?.approval_enrolled&&target.settings_enrolled,'Actual archived target had both keys before recovery');
    const sessions=(await restored.pool.query(`select a.auth_user_id as "authUserId",a.session_id as "sessionId",a.active_context_id as "contextId",c.kind
      from private.account_sessions a join public.account_contexts c on c.id=a.active_context_id
      join auth.sessions s on s.id=a.session_id and s.user_id=a.auth_user_id
      where c.id=$1 and private.administrator_session_allowed(c.id,s.id)`,[target.context_id])).rows as VerifiedActor[];
    check(sessions.length>0,'An actual pre-recovery administrator session is archived');
    const subjects=(await restored.pool.query('select id from auth.users order by id')).rows.map(p=>p.id);
    return {keys,target,sessions,subjects};
  }finally{await restored.close();}
});
const db=new SupabaseDatabase();
try{
  const receipt=(await db.pool.query(`select id,status,proposer_context_id,executed_by_context_id,created_at,executed_at
    from public.admin_proposals where kind='administrator_key_reset' and target_context_id=$1
      and preview->>'action'='reset-key' order by created_at desc limit 1`,[baseline.target.context_id])).rows[0];
  check(receipt?.status==='executed'&&receipt.executed_at,'Actual approval-key recovery executed');
  const votes=(await db.pool.query('select administrator_context_id,decision from public.admin_votes where proposal_id=$1',[receipt.id])).rows;
  check(votes.length===2&&new Set(votes.map(v=>v.administrator_context_id)).size===2&&votes.every(v=>v.decision==='approved'),'Exactly two independent actual approvals were saved');
  check(votes.every(v=>v.administrator_context_id!==baseline.target.context_id),'Target did not approve their own recovery');
  check(votes.some(v=>v.administrator_context_id===receipt.proposer_context_id),'Proposer counts once');
  check(receipt.executed_by_context_id!==receipt.proposer_context_id&&votes.some(v=>v.administrator_context_id===receipt.executed_by_context_id),'Different approving administrator executed recovery');
  const keys=(await db.pool.query(`select m.slot,c.id as context_id,c.auth_user_id,k.approval_key_version,k.settings_key_version,
    k.approval_key_hash is not null as approval_enrolled,k.settings_key_hash is not null as settings_enrolled,
    k.approval_enrolled_at,k.sessions_invalidated_at from public.admin_memberships m
    join public.account_contexts c on c.id=m.context_id join private.admin_secrets k on k.context_id=c.id
    where m.status='active' order by m.slot`)).rows;
  const target=keys.find(k=>k.slot===slot);
  check(target?.context_id===baseline.target.context_id&&target.auth_user_id===baseline.target.auth_user_id,'Recovery preserved the actual target identity and membership');
  check(target.approval_enrolled&&target.approval_key_version!==baseline.target.approval_key_version,'Target enrolled a new approval-key version');
  check(target.settings_enrolled&&target.settings_key_version===baseline.target.settings_key_version,'Target settings key retained its exact native version');
  check(target.sessions_invalidated_at&&target.approval_enrolled_at>=target.sessions_invalidated_at,'Replacement enrollment follows the real session-invalidation epoch');
  for(const old of baseline.keys.filter(k=>k.slot!==slot)){
    const current=keys.find(k=>k.slot===old.slot);
    check(current?.context_id===old.context_id&&current.approval_key_version===old.approval_key_version&&current.settings_key_version===old.settings_key_version,'Other administrator keys and memberships remain unchanged');
  }
  for(const old of baseline.sessions){
    check((await db.pool.query('select private.administrator_session_allowed($1,$2) as allowed',[old.contextId,old.sessionId])).rows[0].allowed===false,'Actual archived old session remains denied');
    let error:unknown;try{await db.authorizedSystem(old,['admin'],async()=>undefined);}catch(e){error=e;}
    check(error instanceof ApiError&&error.status===401,'Guarded server transaction also rejects the actual old session');
  }
  const actor=(await db.pool.query(`select a.auth_user_id as "authUserId",a.session_id as "sessionId",a.active_context_id as "contextId",c.kind
    from private.account_sessions a join public.account_contexts c on c.id=a.active_context_id
    join auth.sessions s on s.id=a.session_id and s.user_id=a.auth_user_id join private.admin_secrets k on k.context_id=c.id
    where c.id=$1 and s.created_at>=k.sessions_invalidated_at and s.created_at<=k.approval_enrolled_at
      and k.approval_enrolled_at<=s.created_at+interval '5 minutes' and private.administrator_session_allowed(c.id,s.id)
      and exists(select 1 from auth.identities i join auth.users u on u.id=i.user_id where u.id=c.auth_user_id
        and u.email_confirmed_at is not null and u.is_anonymous is false and i.provider='google'
        and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
    order by s.created_at desc limit 1`,[target.context_id])).rows[0] as VerifiedActor;
  check(actor,'Actual new Google session enrolled its key within five minutes');
  const status=await db.authorizedSystem(actor,['admin'],c=>administratorSettingsStatus(c,actor));
  check(status.currentId===target.context_id&&status.members.find(m=>m.id===target.context_id)?.keyEnrolled,'New genuine session has guarded administrator access');
  let staleGrant:unknown;
  try{await db.authorizedSystem(actor,['admin'],c=>requireApprovalGrant(c,actor,{allowed:true,version:baseline.target.approval_key_version}));}catch(e){staleGrant=e;}
  check(staleGrant instanceof ApiError&&staleGrant.status===403,'Archived stale approval grant cannot authorize the new session');
  const audit=(await db.pool.query("select count(*)::integer as count from private.audit_events where resource_id=$1 and event_type='administrator_key_recovery_executed'",[receipt.id])).rows[0].count;
  check(audit===1,'One actual execution audit event was committed');
  const notices=(await db.pool.query(`select n.id from public.notifications n where n.title='Administrator key recovery executed'
    and n.sender_context_id=$1 and n.created_at between $2 and $3`,[receipt.executed_by_context_id,receipt.created_at,receipt.executed_at])).rows;
  check(notices.length===1,'One actual recovery execution notice was committed');
  const recipients=(await db.pool.query('select context_id from public.notification_recipients where notification_id=$1',[notices[0].id])).rows.map(r=>r.context_id).sort();
  check(JSON.stringify(recipients)===JSON.stringify(baseline.keys.map(k=>k.context_id).sort()),'All three actual administrator inboxes received the recovery notice');
  check(JSON.stringify((await db.pool.query('select id from auth.users order by id')).rows.map(p=>p.id))===JSON.stringify(baseline.subjects),'All original genuine Auth subjects remain intact');
  console.log(JSON.stringify({passed:true,checks,targetSlot:slot,genuineRecoveryVerified:true,independentApprovals:2,settingsKeyPreserved:true,archivedOldSessionsDenied:baseline.sessions.length,freshGoogleEnrollmentVerified:true,cloudRecordsModified:0,providerMocks:0,privateKeysOrHashesRetrieved:false,oldPlaintextKeyTested:false}));
}finally{await db.close();}
