import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor} from './db.js';
import {requireAdministrator,type SettingsGrant} from './adminSettings.js';
import {requireApprovalGrant} from './adminGovernance.js';

const open=['pending','awaiting-plea','plea-submitted','plea-rejected'];
export async function expireAdministratorRemovals(c:PoolClient) {
  await c.query("update public.admin_proposals set status='expired' where kind='administrator_removal' and status='pending' and expires_at<=clock_timestamp()");
}
async function founder(c:PoolClient,a:VerifiedActor,grant:SettingsGrant) {
  await requireApprovalGrant(c,a,grant);
  if(!(await c.query('select private.removal_founder()=$1 as allowed',[a.contextId])).rows[0].allowed)
    throw new ApiError(403,'Only the main administrator may propose removal, decide an appeal or confirm removal.');
}
async function lock(c:PoolClient) {await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");await expireAdministratorRemovals(c);}
async function proposal(c:PoolClient,id:string) {
  const p=(await c.query(`select p.*,private.removal_current(p) as current,private.removal_quorum(p.id) as has_quorum,
    p.removal_plea_until>clock_timestamp() as plea_open from public.admin_proposals p
    where p.id=$1 and p.kind='administrator_removal' for update`,[id])).rows[0];
  if(!p)throw new ApiError(404,'Administrator removal proposal not found.');return p;
}
function current(p:any,states:string[],quorum=false) {
  if(!p.current||!states.includes(p.status)||quorum&&!p.has_quorum)
    throw new ApiError(409,'The reviewed removal, electorate or required approvals changed. Refresh Admin Approvals.');
}
export async function proposeAdministratorRemoval(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,target:string,reason:string) {
  await lock(c);await founder(c,a,grant);
  const member=(await c.query("select slot,status from public.admin_memberships where context_id=$1 and status<>'removed'",[target])).rows[0];
  if(!member)throw new ApiError(404,'Administrator not found.');
  if(member.slot===1)throw new ApiError(403,'The main administrator cannot be removed.');
  const roster=(await c.query('select private.removal_roster($1) as roster',[target])).rows[0].roster;
  if(roster.length!==4||(await c.query("select count(*) from public.admin_memberships where status<>'removed'")).rows[0].count!=='5')
    throw new ApiError(409,'Removal requires the main administrator and three other active administrators with enrolled approval keys, excluding the target.');
  if((await c.query('select id from public.admin_proposals where kind=$1 and target_context_id=$2 and status=any($3::text[])',['administrator_removal',target,open])).rowCount)
    throw new ApiError(409,'This administrator already has an outstanding removal review.');
  const p=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,target_context_id,preview,baseline_digest,reason,quorum,expires_at,removal_roster_revision)
    select 'administrator_removal',$1,$2,jsonb_build_object('action','remove','removalVersion',2,'roster',private.removal_roster($2)),
      private.recovery_digest($2,'remove',roster_revision),$3,4,clock_timestamp()+interval '24 hours',roster_revision
      from private.admin_pricing_state where singleton returning id`,[a.contextId,target,reason])).rows[0];
  await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[p.id,a.contextId]);
  return {success:true,id:p.id,status:'pending',message:'Removal proposed. All four other administrators must approve before the private appeal window opens.'};
}
export async function voteAdministratorRemoval(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,decision:string) {
  await lock(c);await requireApprovalGrant(c,a,grant);const p=await proposal(c,id);
  if(p.target_context_id===a.contextId||p.proposer_context_id===a.contextId)throw new ApiError(403,'The target cannot vote and the proposer already voted.');
  current(p,['pending']);
  if(!p.preview.roster.some((r:any)=>r.id===a.contextId))throw new ApiError(403,'You are not in the reviewed electorate.');
  if((await c.query('select 1 from public.admin_votes where proposal_id=$1 and administrator_context_id=$2',[id,a.contextId])).rowCount)
    throw new ApiError(403,'Each administrator may vote only once.');
  await c.query('insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,$3)',[id,a.contextId,decision]);
  const status=(await c.query('select status from public.admin_proposals where id=$1',[id])).rows[0].status;
  return {success:true,status,message:status==='awaiting-plea'?'Four approvals received. The target has 24 hours to submit a private appeal.':status==='rejected'?'Removal rejected. Administrator access is unchanged.':'Your independent removal vote was saved.'};
}
export async function submitAdministratorAppeal(c:PoolClient,a:VerifiedActor,id:string,message:string) {
  await lock(c);await requireAdministrator(c,a);const p=await proposal(c,id);
  if(a.contextId!==p.target_context_id)throw new ApiError(403,'Only the targeted administrator may submit the appeal.');
  current(p,['awaiting-plea'],true);
  if(!p.plea_open)throw new ApiError(409,'The 24-hour appeal window has closed.');
  await c.query('insert into private.administrator_appeals(proposal_id,message) values($1,$2)',[id,message]);
  return {success:true,status:'plea-submitted',message:'Your private appeal was submitted to the main administrator.'};
}
export async function decideAdministratorAppeal(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,decision:string,reason:string) {
  await lock(c);await founder(c,a,grant);const p=await proposal(c,id);current(p,['plea-submitted'],true);
  await c.query('update private.administrator_appeals set decision=$2,decision_reason=$3 where proposal_id=$1 and decision is null',[id,decision,reason]);
  return {success:true,status:decision==='accepted'?'revoked':'plea-rejected',message:decision==='accepted'?'Appeal accepted. Removal consent is revoked; administrator access is unchanged.':'Appeal rejected. Removal still requires your explicit final confirmation.'};
}
export async function acknowledgeAdministratorAppeal(c:PoolClient,a:VerifiedActor,id:string) {
  await lock(c);await requireAdministrator(c,a);const p=await proposal(c,id);
  if(p.target_context_id!==a.contextId)throw new ApiError(403,'Only the targeted administrator may acknowledge the decision.');
  const appeal=(await c.query('select decision,acknowledged_at from private.administrator_appeals where proposal_id=$1',[id])).rows[0];
  if(!appeal?.decision)throw new ApiError(409,'There is no appeal decision to acknowledge.');
  if(!appeal.acknowledged_at)await c.query('update private.administrator_appeals set acknowledged_at=clock_timestamp() where proposal_id=$1',[id]);
  return {success:true,message:'Appeal decision acknowledged.'};
}
export async function confirmAdministratorRemoval(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,confirmation:string) {
  await lock(c);await founder(c,a,grant);const p=await proposal(c,id);current(p,['awaiting-plea','plea-rejected'],true);
  if(confirmation!=='REMOVE ADMINISTRATOR')throw new ApiError(400,'Type REMOVE ADMINISTRATOR to confirm.');
  if(p.status==='awaiting-plea'&&p.plea_open)throw new ApiError(409,'Wait until the private appeal window ends or decide the submitted appeal.');
  await c.query("select set_config('pinevela.admin_removal_proposal_id',$1,true),set_config('pinevela.admin_removal_confirmation',$2,true)",[id,confirmation]);
  if(!(await c.query('select private.removal_execution_allowed($1) as allowed',[p.target_context_id])).rows[0].allowed)
    throw new ApiError(409,'The reviewed appeal or independent removal consent changed.');
  // Preserve foreign-key history and the shared verified identity. Never revoke
  // unrelated primary/seller/resident provider sessions as a portal side effect.
  await c.query("update public.admin_memberships set status='removed' where context_id=$1",[p.target_context_id]);
  await c.query("update public.account_contexts set status='closed' where id=$1",[p.target_context_id]);
  await c.query('delete from private.admin_secrets where context_id=$1',[p.target_context_id]);
  await c.query("update public.admin_proposals set status='executed' where id=$1",[id]);
  return {success:true,status:'executed',message:'Administrator access permanently removed. The verified login, primary account and governance history are preserved.'};
}
export async function administratorRemovalStatus(c:PoolClient,a:VerifiedActor,mainId:string|null) {
  const rows=(await c.query(`select p.*,(select f.display_name from public.account_contexts x join public.profiles f on f.id=x.auth_user_id where x.id=p.target_context_id) as target_name,
    private.removal_current(p) as current,private.removal_quorum(p.id) as has_quorum,
    p.removal_plea_until>clock_timestamp() as plea_open,
    case when $1::uuid=p.target_context_id or $1::uuid=$2::uuid then
      (select jsonb_build_object('message',r.message,'submittedAt',r.submitted_at,'decision',r.decision,
        'decisionReason',r.decision_reason,'decidedAt',r.decided_at,'acknowledgedAt',r.acknowledged_at)
        from private.administrator_appeals r where r.proposal_id=p.id) else null end as plea,
    coalesce((select jsonb_agg(jsonb_build_object('id',v.administrator_context_id,'slot',m.slot,'name',f.display_name,'decision',v.decision,'at',v.decided_at)
      order by v.decided_at,v.administrator_context_id) from public.admin_votes v join public.admin_memberships m on m.context_id=v.administrator_context_id
      join public.account_contexts x on x.id=m.context_id join public.profiles f on f.id=x.auth_user_id where v.proposal_id=p.id),'[]'::jsonb) as votes
    from public.admin_proposals p where p.kind='administrator_removal' order by p.created_at desc limit 100`,[a.contextId,mainId])).rows;
  return rows.map(p=>({id:p.id,targetId:p.target_context_id,targetName:p.target_name,action:'remove',reason:p.reason,requestedBy:p.proposer_context_id,
    expiresAt:p.expires_at,status:p.status,votes:p.votes,executedAt:p.executed_at,pleaUntil:p.removal_plea_until,plea:p.plea,
    canSubmitPlea:p.current&&p.has_quorum&&p.status==='awaiting-plea'&&p.plea_open&&a.contextId===p.target_context_id,
    canConfirmRemoval:p.current&&p.has_quorum&&a.contextId===mainId&&(p.status==='plea-rejected'||p.status==='awaiting-plea'&&!p.plea_open)}));
}
