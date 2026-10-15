import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import type { AuthRequest, SupabaseAuth } from './auth.js';
import { bodyFields, requireAdministrator, type SettingsGrant } from './adminSettings.js';
import { checkApprovalKey, deniedApprovalKey, requireApprovalGrant } from './adminGovernance.js';
import { requireManagerKeyGrant } from './managerKeys.js';
import { notify, notifyPrimaryOwner } from './notifications.js';
import { completeResidentClosure } from './residentClosure.js';

const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
function reason(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new ApiError(400, 'Provide a reason of 3–1000 characters.');
  return value.trim();
}
function manager(actor: VerifiedActor, captured?: unknown) {
  if (actor.kind !== 'manager') throw new ApiError(403, 'Use your verified manager account.');
  if (captured !== undefined && captured !== actor.contextId) throw new ApiError(409, 'Your active account changed. Refresh its settings.');
}
export async function managerClosurePreview(c: PoolClient, contextId: string) {
  const homes = (await c.query(`select h.id,h.name,h.status,
    (select count(*)::int from public.allocations a join public.rooms r on r.id=a.room_id join public.floors f on f.id=r.floor_id
      join public.blocks b on b.id=f.block_id where b.residence_id=h.id and a.ended_at is null) as residents,
    (select count(*)::int from public.staff_assignments s where s.residence_id=h.id and s.status='active' and s.ended_at is null) as staff
    from public.manager_assignments a join public.residences h on h.id=a.residence_id
    where a.manager_context_id=$1 and a.ended_at is null and h.status<>'closed' order by h.id`, [contextId])).rows;
  const eligible=homes.length?true:(await c.query('select private.unassigned_manager_closable($1) as allowed',[contextId])).rows[0].allowed;
  const scope = { managerId: contextId, residences: homes, defaultCooldownDays: homes.length?30:0,
    reviewKind:homes.length?'residence_deletion':'account_action',reviewQuorum:homes.length?2:5,
    executionAvailable: false, identityRetained: true,
    blockers: eligible ? [] : ['Generate your manager key and resolve any remaining assignments, active staff or live property registration before portal-only closure.'] };
  return { ...scope, fingerprint: crypto.createHash('sha256').update(JSON.stringify(scope)).digest('hex') };
}
function visible(row: any) {
  const resolved = row.state === 'reviewing' && ['rejected','expired','invalidated'].includes(row.proposal_status) && !row.frozen;
  return { id: row.id, managerId: row.manager_context_id, managerName: row.manager_name, state: resolved ? 'resolved' : row.state, reason: row.reason,
    requestWaiver: row.request_waiver, createdAt: row.created_at, decidedAt: row.decided_at, decisionReason: row.decision_reason,
    proposalId: row.proposal_id, proposalStatus: row.proposal_status, completedAt: row.completed_at || null };
}
const rowsSql = `select q.*,p.display_name as manager_name,g.status as proposal_status,
  exists(select 1 from private.residence_deletion_preparations f where f.proposal_id=q.proposal_id and f.state='frozen') as frozen,
    coalesce((select e.completed_at from private.residence_executions e where e.proposal_id=q.proposal_id and e.state='completed'),
      case when g.kind='account_action' and g.preview->>'action'='close-manager' and g.status='executed' then g.executed_at end,
      (select e.completed_at from private.primary_wipe_executions e where e.id=q.withdrawn_by_wipe_id and e.state='completed')) as completed_at
  from private.manager_closure_requests q join public.account_contexts x on x.id=q.manager_context_id
  join public.profiles p on p.id=x.auth_user_id left join public.admin_proposals g on g.id=q.proposal_id`;
export async function ownManagerClosure(c: PoolClient, actor: VerifiedActor) {
  manager(actor);
  const requests = (await c.query(rowsSql + ' where q.manager_context_id=$1 order by q.created_at desc,q.id limit 20', [actor.contextId])).rows;
  return { preview: await managerClosurePreview(c, actor.contextId), requests: requests.map(visible) };
}
async function announce(c: PoolClient, id: string, managerId: string, title: string, message: string) {
  const admins = (await c.query(`select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    where m.status='active' and x.status='active'`)).rows.map(r => r.context_id);
  await notify(c, admins, { category: 'admin_governance', title, message, link: 'governance' });
  const notice = { category: 'verification', title, message };
  await notify(c, [managerId], notice); await notifyPrimaryOwner(c, managerId, notice);
  await c.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values(private.current_context_id(),'manager_closure_request_updated','manager_closure_request',$1)`, [id]);
}
export async function submitManagerClosure(c: PoolClient, actor: VerifiedActor, body: any) {
  manager(actor); bodyFields(body, ['confirm', 'reason', 'requestWaiver', 'fingerprint']);
  if (body.confirm !== true || typeof body.requestWaiver !== 'boolean') throw new ApiError(400, 'Confirm this review request and your cooldown preference.');
  const text = reason(body.reason);
  if (actor.managerKeyVersion === undefined) throw new ApiError(403, 'Enter your current manager secret key.', 'manager_key_required');
  await requireManagerKeyGrant(c, actor);
  // Serialise identical submissions even before the first request row exists.
  await c.query("select pg_advisory_xact_lock(hashtextextended('manager-closure-request:'||$1,0))", [actor.contextId]);
  const scope = await managerClosurePreview(c, actor.contextId);
  if (scope.fingerprint !== body.fingerprint) throw new ApiError(409, 'Your assigned residence preview changed. Review it again.');
  if (scope.blockers.length) throw new ApiError(409, scope.blockers[0]);
  let pending = (await c.query("select * from private.manager_closure_requests where manager_context_id=$1 and state in('pending','reviewing') for update", [actor.contextId])).rows[0];
  if(pending?.state==='reviewing' && (await c.query(`select 1 from public.admin_proposals p where p.id=$1 and p.status in('rejected','expired','invalidated')
    and not exists(select 1 from private.residence_deletion_preparations f where f.proposal_id=p.id and f.state='frozen')`,[pending.proposal_id])).rowCount) {
    await c.query("update private.manager_closure_requests set state='resolved' where id=$1",[pending.id]); pending=undefined;
  }
  if (pending) {
    if (pending.state === 'pending' && pending.reason === text && pending.request_waiver === body.requestWaiver)
      return { success: true, requestId: pending.id, state: 'pending', deleted: false, message: 'Your closure request is already awaiting review. No records were deleted.' };
    throw new ApiError(409, 'A manager closure request is already open.');
  }
  await c.query("select set_config('pinevela.manager_closure_key_version',$1,true)",[actor.managerKeyVersion]);
  const row = (await c.query(`insert into private.manager_closure_requests(manager_context_id,reason,request_waiver)
    values($1,$2,$3) returning id`, [actor.contextId, text, body.requestWaiver])).rows[0];
  await announce(c, row.id, actor.contextId, 'Manager account closure requested',
    scope.reviewKind==='account_action'?'An unassigned manager requested portal-only closure. Five administrator approvals and the founder’s final confirmation are required. Identity, history and registration restrictions are retained.':
    'A manager requested closure of their portal and assigned residences. Administrator review, founder consent and verified backups are required. No records were deleted.');
  return { success: true, requestId: row.id, state: 'pending', deleted: false, message: 'Your manager closure request was submitted for review. Your account and residences remain active.' };
}
export async function withdrawManagerClosure(c: PoolClient, actor: VerifiedActor, id: string) {
  manager(actor);
  if (actor.managerKeyVersion === undefined) throw new ApiError(403, 'Enter your current manager secret key.', 'manager_key_required');
  await requireManagerKeyGrant(c, actor);
  const row = (await c.query('select * from private.manager_closure_requests where id=$1 and manager_context_id=$2 for update', [id, actor.contextId])).rows[0];
  if (!row) throw new ApiError(404, 'Own closure request not found.');
  if (row.state !== 'pending') throw new ApiError(409, 'An administrator has already reviewed this request. Use the reviewed proposal status.');
  await c.query("update private.manager_closure_requests set state='withdrawn',decided_at=clock_timestamp() where id=$1", [id]);
  await announce(c, id, actor.contextId, 'Manager closure request withdrawn', 'The manager withdrew their pending closure request. No records were deleted.');
  return { success: true };
}
export async function managerClosureDirectory(c: PoolClient, actor: VerifiedActor) {
  await requireAdministrator(c, actor);
  const rows = (await c.query(rowsSql + ' order by q.created_at desc,q.id limit 100')).rows;
  const requests=[];
  for(const row of rows) requests.push({...visible(row),preview:await managerClosurePreview(c,row.manager_context_id)});
  return {requests};
}
export async function rejectManagerClosure(c: PoolClient, actor: VerifiedActor, grant: SettingsGrant, id: string, text: unknown) {
  await requireApprovalGrant(c, actor, grant); const note = reason(text);
  const row = (await c.query('select * from private.manager_closure_requests where id=$1 for update', [id])).rows[0];
  if (!row) throw new ApiError(404, 'Closure request not found.');
  if (row.state !== 'pending') throw new ApiError(409, 'This request is already decided or linked to its residence review.');
  await c.query("update private.manager_closure_requests set state='rejected',decided_at=clock_timestamp(),decided_by_context_id=$2,decision_reason=$3 where id=$1", [id, actor.contextId, note]);
  await announce(c, id, row.manager_context_id, 'Manager closure request declined', `The closure request was declined: ${note}. Your account and residences remain active.`);
  return { success: true, deleted: false };
}
/** The residence proposal is the sole deletion authority. A request grants none. */
export async function linkManagerClosure(c: PoolClient, actor: VerifiedActor, grant: SettingsGrant, requestId: string, proposalId: string) {
  await requireApprovalGrant(c, actor, grant);
  const row = (await c.query('select * from private.manager_closure_requests where id=$1 for update', [requestId])).rows[0];
  if (!row) throw new ApiError(404, 'Closure request not found.');
  const proposal = (await c.query("select * from public.admin_proposals where id=$1 and kind='residence_deletion'", [proposalId])).rows[0];
  if (row.state !== 'pending' || !proposal || !proposal.preview?.options?.deleteManager ||
      !proposal.preview.accounts?.some((a: any) => a.id === row.manager_context_id && a.role === 'manager' && a.effect === 'close-portal'))
    throw new ApiError(409, 'The residence review must close this request’s exact manager portal.');
  await c.query("update private.manager_closure_requests set state='reviewing',proposal_id=$2,decided_at=clock_timestamp(),decided_by_context_id=$3 where id=$1", [requestId, proposalId, actor.contextId]);
  await announce(c, requestId, row.manager_context_id, 'Manager closure entered administrator review',
    'Your closure request is linked to a residence deletion proposal. Votes, founder consent and verified backups must complete before any records are removed.');
}
export async function linkUnassignedManagerClosure(c:PoolClient,actor:VerifiedActor,grant:SettingsGrant,requestId:string,proposalId:string){
  await requireApprovalGrant(c,actor,grant);
  const row=(await c.query('select * from private.manager_closure_requests where id=$1 for update',[requestId])).rows[0];
  const p=(await c.query("select * from public.admin_proposals where id=$1 and kind='account_action'",[proposalId])).rows[0];
  if(!row||row.state!=='pending'||!p||p.preview?.action!=='close-manager'||p.target_context_id!==row.manager_context_id||p.preview?.closureRequest?.id!==requestId)
    throw new ApiError(409,'Review the exact pending unassigned-manager request.');
  await c.query("update private.manager_closure_requests set state='reviewing',proposal_id=$2,decided_at=clock_timestamp(),decided_by_context_id=$3 where id=$1",[requestId,proposalId,actor.contextId]);
  await announce(c,requestId,row.manager_context_id,'Manager portal closure entered administrator review',
    'Five independent administrator approvals and the founder’s final confirmation are required. Your manager portal remains active until that final decision.');
}
export async function notifyManagerClosureReview(c: PoolClient, proposalId: string, title: string, message: string) {
  const requests=(await c.query("select manager_context_id from private.manager_closure_requests where proposal_id=$1 and state='reviewing'",[proposalId])).rows;
  for(const row of requests) {
    const notice={category:'verification',title,message};
    await notify(c,[row.manager_context_id],notice);await notifyPrimaryOwner(c,row.manager_context_id,notice);
  }
}
export function installManagerClosureRequests(app: Express, auth: SupabaseAuth) {
  const checked = (req: AuthRequest) => {
    if (Object.keys(req.query).length) throw new ApiError(400, 'Account selectors are not accepted.');
    manager(req.actor, req.headers['x-pinevela-profile-context']);
  };
  app.get('/api/manager/closure-request', auth.require(['manager']), route(async (req, res) => {
    checked(req); res.json(await auth.db.authorizedSystem(req.actor, ['manager'], c => ownManagerClosure(c, req.actor)));
  }));
  app.post('/api/users/delete-registered-account', auth.require(['manager','primary','resident']), route(async (req, res) => {
    if (req.actor.kind === 'primary') throw new ApiError(410, 'Use the separately verified portal to manage its closure. Primary accounts cannot remove a separate verified identity.', 'verified_portal_required');
    if (req.actor.kind === 'resident') return completeResidentClosure(auth,req,res);
    checked(req); res.status(202).json(await auth.db.authorizedSystem(req.actor, ['manager'], c => submitManagerClosure(c, req.actor, req.body)));
  }));
  app.post('/api/manager/closure-request/:id/withdraw', auth.require(['manager']), route(async (req, res) => {
    checked(req); bodyFields(req.body, []);
    res.json(await auth.db.authorizedSystem(req.actor, ['manager'], c => withdrawManagerClosure(c, req.actor, uuid(req.params.id))));
  }));
  app.get('/api/admin/manager-closure-requests', auth.require(['admin']), route(async (req, res) => {
    if (Object.keys(req.query).length) throw new ApiError(400, 'Account selectors are not accepted.');
    res.json(await auth.db.authorizedSystem(req.actor, ['admin'], c => managerClosureDirectory(c, req.actor)));
  }));
  app.post('/api/admin/manager-closure-requests/:id/reject', auth.require(['admin']), route(async (req, res) => {
    bodyFields(req.body, ['privateKey', 'reason']);
    const grant = await auth.db.authorizedSystem(req.actor, ['admin'], c => checkApprovalKey(c, req.actor, req.body.privateKey)); deniedApprovalKey(grant);
    res.json(await auth.db.authorizedSystem(req.actor, ['admin'], c => rejectManagerClosure(c, req.actor, grant, uuid(req.params.id), req.body.reason)));
  }));
}
