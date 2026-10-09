import type { PoolClient } from 'pg';
import { ApiError,type VerifiedActor } from './db.js';
import { ownedEnrollment } from './enrollment.js';
/** Caller has locked the primary actor; proof is verified by Supabase /user,
 * never copied from request identity fields. A release keeps this identity for
 * allocation history and, where applicable, the separate seller portal. */
export async function reactivateResident(client:PoolClient,actor:VerifiedActor,id:string,
  proof:{authUserId:string;sessionId:string;email:string},pinVersion:string | null) {
  const record = await ownedEnrollment(client,actor,id);
  if (record.kind !== 'resident' || !record.verified_at ||
      !((record.status === 'completed' && record.context_status === 'closed') ||
        (record.status === 'pending_review' && record.context_status === 'pending')))
    throw new ApiError(409,'Only a released verified resident account can be reactivated.');
  if (record.auth_user_id !== proof.authUserId || record.invited_email !== proof.email)
    throw new ApiError(403,'Sign in with this resident account\'s own verified credentials.');
  const identity = await client.query(`select c.id from public.account_contexts c
    join public.profiles p on p.id = c.auth_user_id join auth.users u on u.id = p.id
    join auth.sessions s on s.user_id = u.id where c.id = $1 and c.auth_user_id = $2
      and c.kind = 'resident' and c.primary_owner_id = $3 and p.primary_owner_id = $3
      and lower(u.email) = $4 and u.email_confirmed_at is not null and s.id = $5
      and (s.not_after is null or s.not_after > clock_timestamp()) for share of c,p,u,s`,
    [record.linked_context_id,proof.authUserId,actor.authUserId,proof.email,proof.sessionId]);
  if (!identity.rowCount) throw new ApiError(403,'This verified resident identity is no longer available.');
  const key = (await client.query('select version,locked_until from private.portal_access_keys where context_id = $1 for share',[record.linked_context_id])).rows[0];
  if ((key ? String(key.version) : null) !== pinVersion || key?.locked_until && new Date(key.locked_until).getTime() > Date.now())
    throw new ApiError(403,'Enter the current resident portal PIN.','portal_pin_required');
  const banned = await client.query(`select 1 from public.registration_bans b join public.account_contexts c on c.id = b.account_context_id
    where coalesce(c.primary_owner_id,c.auth_user_id) = $1 and b.kind = 'resident_account' and b.until_at > clock_timestamp()`,[actor.authUserId]);
  if (banned.rowCount) throw new ApiError(403,'Resident registration is temporarily restricted for this account.');
  const conflict = await client.query(`select 1 from public.allocations where primary_owner_id = $1 and ended_at is null
    union all select 1 from private.account_enrollments where primary_owner_id = $1 and kind = 'resident'
      and status in ('pending_email','pending_review') and id <> $2
    union all select 1 from public.account_contexts where primary_owner_id = $1 and kind = 'resident'
      and status <> 'closed' and id <> $3`,[actor.authUserId,record.id,record.linked_context_id]);
  if (conflict.rowCount) throw new ApiError(409,'You already have an active or pending resident account.');
  if (record.status === 'pending_review') return {enrollmentId:record.id,status:'pending_review',alreadyReactivated:true};
  await client.query("update public.account_contexts set status = 'pending',updated_at = now() where id = $1",[record.linked_context_id]);
  await client.query(`update private.account_enrollments set status = 'pending_review',verified_at = clock_timestamp(),
    expires_at = clock_timestamp() + interval '24 hours',room_id = null,residence_id = null where id = $1`,[record.id]);
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values ($1,'resident_reactivation_requested','account_context',$2,$3)`,[actor.contextId,record.linked_context_id,JSON.stringify({enrollmentId:record.id})]);
  return {enrollmentId:record.id,status:'pending_review',alreadyReactivated:false};
}
