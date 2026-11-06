import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, type VerifiedActor } from './db.js';
import type { AuthRequest, SupabaseAuth } from './auth.js';
import { checkProfileContext } from './profiles.js';

export function checkResidentProfileRequest(actor: VerifiedActor, query: unknown, expectedContext: unknown) {
  if (!['primary', 'resident'].includes(actor.kind)) throw new ApiError(403, 'Use your user or resident account to view your room profile.');
  if (!query || typeof query !== 'object' || Object.keys(query).length) throw new ApiError(400, 'Your room profile does not accept account selectors.');
  checkProfileContext(actor, expectedContext);
}

/** Called only within authorizedSystem after the native session/context is locked.
 * Parent status access requires all three saved ownership relationships. It does
 * not grant access to a child's profile photograph or their resident operations. */
export async function ownResidentRooms(client: PoolClient, actor: VerifiedActor) {
  if (!['primary', 'resident'].includes(actor.kind)) throw new ApiError(403, 'Use your user or resident account to view your rooms.');
  const rows = (await client.query(`select a.id as allocation_id,a.room_id,a.bed_id,a.started_at,
    c.id as resident_context_id,p.display_name,case when e.enrollment_fields->>'authentication'='resident_pin' then owner.email else p.email end as email,p.phone,
    r.room_number,f.floor_number,b.name as block_name,h.id as residence_id,h.name as residence_name,
    k.id as key_id,k.code,coalesce(h.manager_contact_name,manager.display_name) as manager_name,
    coalesce(h.contact_phone,manager.phone) as manager_phone
    from public.allocations a join public.account_contexts c on c.id=a.resident_context_id
    join public.profiles p on p.id=c.auth_user_id
    left join private.account_enrollments e on e.linked_context_id=c.id
    left join public.profiles owner on owner.id=c.primary_owner_id
    join public.rooms r on r.id=a.room_id join public.floors f on f.id=r.floor_id
    join public.blocks b on b.id=f.block_id join public.residences h on h.id=b.residence_id
    left join private.room_activation_keys k on k.room_id=r.id and k.claimed_by=c.id and k.revoked_at is null
    left join lateral (select mp.display_name,mp.phone from public.manager_assignments ma
      join public.account_contexts mc on mc.id=ma.manager_context_id
      join public.profiles mp on mp.id=mc.auth_user_id
      where ma.residence_id=h.id and ma.ended_at is null and mc.status='active'
      order by ma.assigned_at,ma.id limit 1) manager on true
    where a.ended_at is null and c.kind='resident' and c.status='active'
      and a.primary_owner_id=c.primary_owner_id and p.primary_owner_id=c.primary_owner_id
      and (($1='primary' and a.primary_owner_id=$2)
        or ($1='resident' and c.id=$3 and c.auth_user_id=$2))
    order by a.started_at,a.id limit 2`, [actor.kind, actor.authUserId, actor.contextId])).rows;
  if (rows.length > 1) throw new ApiError(409, 'Your active room allocation needs review.');
  return rows.map(r => ({
    id: r.key_id || r.allocation_id, allocationId: r.allocation_id, roomId: r.room_id, bedId: r.bed_id,
    roomKey: r.code || '', hostelId: r.residence_id, hostelName: r.residence_name,
    blockName: r.block_name, floor: r.floor_number, roomNumber: r.room_number, isAssigned: true,
    assignedStudentId: r.resident_context_id, assignedStudentName: r.display_name,
    assignedStudentEmail: r.email, assignedStudentPhone: r.phone,
    assignedAt: r.started_at, claimedAt: r.started_at,
    managerName: r.manager_name || '', managerPhone: r.manager_phone || ''
  }));
}

export function installResidentProfiles(app: Express, auth: SupabaseAuth) {
  const handler: RequestHandler = (req, res, next) => {
    const request = req as AuthRequest;
    (async () => {
      checkResidentProfileRequest(request.actor, req.query, req.headers['x-pinevela-profile-context']);
      const rooms = await auth.db.authorizedSystem(request.actor, ['primary', 'resident'], c => ownResidentRooms(c, request.actor));
      if (req.path === '/api/student/my-rooms') return res.json({ rooms });
      // The canonical user projection belongs to this verified identity. Never
      // merge a secondary resident's name, email or portrait into the parent.
      return res.json({ user: await auth.projection(request.actor), roomKeyDetails: rooms[0] || null, rooms });
    })().catch(next);
  };
  app.get(['/api/student/my-profile', '/api/student/my-rooms'], auth.require(['primary', 'resident']), handler);
}
