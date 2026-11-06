import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,type VerifiedActor } from './db.js';
import { SupabaseAuth,type AuthRequest } from './auth.js';
/** Caller must have locked a verified primary actor in authorizedSystem. This
 * exposes registration progress, never child session tokens or passwords. */
export async function registrationStatus(client: PoolClient,actor: VerifiedActor) {
  if (actor.kind !== 'primary') throw new ApiError(403,'Use your primary user account to view registrations.');
  const rows = (await client.query(`select c.id,c.kind,c.status,p.display_name,p.email,p.phone,c.created_at,
    e.id as enrollment_id,e.status as enrollment_status,e.verified_at,e.enrollment_fields->>'authentication' as authentication,
    v.status as review_status,v.review_notes,v.id as verification_id,v.submitted_data,v.residence_id as verification_residence_id,v.withdrawn_by_wipe_id
    from public.account_contexts c join public.profiles p on p.id = c.auth_user_id
    left join private.account_enrollments e on e.linked_context_id = c.id
    left join lateral (select id,status,review_notes,submitted_data,residence_id,withdrawn_by_wipe_id from public.verification_cases where applicant_context_id = c.id
      and (c.kind<>'manager' or kind='manager_registration' and manager_generation=e.manager_generation)
      order by submitted_at desc limit 1) v on true
    where c.primary_owner_id = $1 and p.primary_owner_id = $1 and c.status <> 'closed'
    order by c.created_at desc`,[actor.authUserId])).rows;
  const manager = rows.find(r => r.kind === 'manager');
  let managerAccount: any = null;
  if (manager) {
    const residences = (await client.query(`select h.id,h.name,h.status from public.manager_assignments m
      join public.residences h on h.id = m.residence_id where m.manager_context_id = $1 and m.ended_at is null`,[manager.id])).rows;
    const approved = manager.status === 'active';
    managerAccount = { id:manager.id,managerId:manager.id,name:manager.display_name,email:manager.email,phone:manager.phone,
      status:approved ? 'approved' : manager.status !== 'pending' ? manager.status : manager.review_status || 'pending',
      isApproved:approved,isVerified:approved,emailVerified:Boolean(manager.verified_at),enrollmentId:manager.enrollment_id,
      enrollmentStatus:manager.enrollment_status,requiresPropertyRegistration:manager.status==='pending'&&manager.enrollment_status==='pending_review'&&Boolean(manager.verified_at)&&residences.length===0,submittedAt:manager.created_at,adminNotes:manager.review_notes,
      verificationId:manager.verification_id,property:manager.submitted_data,
      canCorrectRegistration:manager.status==='pending'&&manager.review_status==='more_info_required'&&!manager.withdrawn_by_wipe_id&&Boolean(manager.verified_at)&&residences.some(r=>r.id===manager.verification_residence_id&&r.status==='inspection'),
      hostelName:residences[0]?.name || '',hostelId:residences[0]?.id || null,residences };
  }
  const resident = rows.find(r => r.kind === 'resident');
  let residentAccount: any = null;
  if (resident) {
    const room = (await client.query(`select a.id,a.room_id,a.started_at,r.room_number,b.name as block_name,
      h.id as residence_id,h.name as residence_name,k.code
      from public.allocations a join public.rooms r on r.id = a.room_id
      join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
      join public.residences h on h.id = b.residence_id
      left join private.room_activation_keys k on k.room_id = r.id and k.claimed_by = a.resident_context_id and k.revoked_at is null
      where a.resident_context_id = $1 and a.ended_at is null`,[resident.id])).rows[0];
    const pinLogin=resident.authentication==='resident_pin';
    const primaryEmail=pinLogin?(await client.query('select email from public.profiles where id=$1',[actor.authUserId])).rows[0]?.email:undefined;
    residentAccount = { id:resident.id,name:resident.display_name,email:primaryEmail||resident.email,phone:resident.phone,residentPinLogin:pinLogin,
      active:resident.status === 'active' && Boolean(room),status:resident.status,emailVerified:Boolean(resident.verified_at),
      enrollmentId:resident.enrollment_id,enrollmentStatus:resident.enrollment_status,
      roomKey:room?.code || '',roomNumber:room?.room_number || '',blockName:room?.block_name || '',
      hostelId:room?.residence_id || null,hostelName:room?.residence_name || '',claimedAt:room?.started_at || null };
  }
  // Pending enrollment may not yet have an Auth subject. Include its actual
  // progress so the user can resume confirmation without a fake account row.
  const enrollments = (await client.query(`select id,kind,invited_email as email,status,verified_at,expires_at,
    linked_context_id as account_id from private.account_enrollments where primary_owner_id = $1
    and status in ('pending_email','pending_review','completed') order by created_at desc`,[actor.authUserId])).rows;
  return { managerAccount,residentAccount,residentRooms:residentAccount?.active ? [residentAccount] : [],staffAccount:null,enrollments };
}
export function installAccountStatus(app: Express,auth: SupabaseAuth) {
  const route: RequestHandler = (req,res,next) => {
    const actor = (req as AuthRequest).actor;
    auth.db.authorizedSystem(actor,['primary'],client => registrationStatus(client,actor)).then(data => res.json(data)).catch(next);
  };
  app.get(['/api/users/my-registered-accounts','/api/user/registered-accounts'],auth.require(['primary']),route);
}
