import crypto from 'node:crypto';
import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import { SupabaseAuth,type AuthRequest } from './auth.js';
import { notifyPrimaryOwner } from './notifications.js';
import { residenceStructure } from './residenceStructure.js';
const route = (work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler => (req,res,next) => { work(req as AuthRequest,res).catch(next); };
const scope = `($1::text = 'admin' or ($1 = 'manager' and exists (select 1 from public.manager_assignments m
  where m.residence_id = h.id and m.manager_context_id = $2 and m.ended_at is null))
  or ($1 = 'staff' and exists (select 1 from public.staff_assignments s where s.residence_id = h.id
    and s.staff_context_id = $2 and s.status = 'active' and s.ended_at is null)))`;
/** The caller has already locked a live account session in authorizedSystem. */
export async function keyRows(client:PoolClient,actor:VerifiedActor,residenceId?:string,roomId?:string) {
  if (!['manager','admin','staff'].includes(actor.kind)) throw new ApiError(403,'Housing staff access required.');
  if (residenceId && !(await client.query(`select h.id from public.residences h where h.id = $3 and ${scope}`,[actor.kind,actor.contextId,residenceId])).rowCount)
    throw new ApiError(404,'Authorized residence not found.');
  return (await client.query(`select k.id,r.id as "roomId",k.code as "roomKey",h.id as "hostelId",h.name as "hostelName",b.name as "blockName",b.room_prefix as "blockInitial",
    r.room_number as "roomNumber",f.floor_number as floor,a.resident_context_id as "assignedStudentId",
    p.display_name as "assignedStudentName",p.email as "assignedStudentEmail",p.phone as "assignedStudentPhone",
    (a.id is not null) as "isAssigned",case when a.id is null then 'Available' else 'Occupied' end as status
    from private.room_activation_keys k join public.rooms r on r.id = k.room_id join public.floors f on f.id = r.floor_id
    join public.blocks b on b.id = f.block_id join public.residences h on h.id = b.residence_id
    left join public.allocations a on a.room_id = r.id and a.ended_at is null
    left join public.account_contexts c on c.id = a.resident_context_id left join public.profiles p on p.id = c.auth_user_id
    where k.revoked_at is null and ${scope} and ($3::uuid is null or h.id = $3) and ($4::uuid is null or r.id = $4)
    order by h.id,b.name,f.floor_number,r.room_number limit 10000`,[actor.kind,actor.contextId,residenceId || null,roomId || null])).rows;
}
async function managedResidence(client:PoolClient,actor:VerifiedActor,id:string) {
  if (!['admin','manager'].includes(actor.kind)) throw new ApiError(403,'Manager access required.');
  const row = (await client.query(`select h.id,h.name,h.status from public.residences h where h.id = $3 and ${scope} for update of h`,[actor.kind,actor.contextId,id])).rows[0];
  if (!row) throw new ApiError(404,'Authorized residence not found.');
  if (row.status !== 'approved') throw new ApiError(409,'This residence is not approved for room operations.');
  // Lock the saved grant for the write, in addition to the live context lock.
  if (actor.kind === 'manager' && !(await client.query(`select id from public.manager_assignments
    where manager_context_id = $1 and residence_id = $2 and ended_at is null for share`,[actor.contextId,id])).rowCount)
    throw new ApiError(403,'Manager assignment is no longer active.');
  return row;
}
export async function generateRoomKeys(client:PoolClient,actor:VerifiedActor,residenceId:string) {
  await managedResidence(client,actor,residenceId);
  if (!(await client.query('select private.residence_has_reviewed_setup($1) as allowed',[residenceId])).rows[0].allowed)
    throw new ApiError(409,'Residence registration must pass review before room activation keys can be issued.');
  const rooms = (await client.query(`select r.id from public.rooms r join public.floors f on f.id = r.floor_id
    join public.blocks b on b.id = f.block_id where b.residence_id = $1 order by r.id limit 10001 for update of r`,[residenceId])).rows;
  if (!rooms.length) throw new ApiError(409,'Configure the residence rooms before generating keys.');
  if (rooms.length > 10000) throw new ApiError(409,'This residence exceeds the supported room-key batch size.');
  const roomIds = rooms.map(room => room.id);
  const state = (await client.query(`select r.id,
    exists(select 1 from private.room_activation_keys k where k.room_id = r.id and k.revoked_at is null) as has_key,
    exists(select 1 from public.allocations a where a.room_id = r.id and a.ended_at is null) as occupied,
    exists(select 1 from public.beds b where b.room_id = r.id) as has_bed
    from public.rooms r where r.id = any($1::uuid[])`,[roomIds])).rows;
  if (state.some(room => !room.has_bed)) throw new ApiError(409,'Configure at least one bed in each room before generating keys.');
  if (state.some(room => !room.has_key && room.occupied)) throw new ApiError(409,'An occupied room is missing its original key. Contact an administrator.');
  const missing = state.filter(room => !room.has_key);
  if (missing.length) await client.query(`insert into private.room_activation_keys(room_id,code)
    select * from unnest($1::uuid[],$2::text[])`,[missing.map(room => room.id),missing.map(() => `PV-${crypto.randomBytes(16).toString('hex').toUpperCase()}`)]);
  return keyRows(client,actor,residenceId);
}
export async function releaseResidentRoom(client:PoolClient,actor:VerifiedActor,keyId:string,confirm:unknown) {
  if (confirm !== true) throw new ApiError(400,'Confirm that resident room access will be removed.');
  const target = (await client.query(`select k.room_id,h.id as residence_id from private.room_activation_keys k
    join public.rooms r on r.id = k.room_id join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
    join public.residences h on h.id = b.residence_id where k.id = $1 and k.revoked_at is null`,[keyId])).rows[0];
  if (!target) throw new ApiError(404,'Current room key not found.');
  const residence = await managedResidence(client,actor,target.residence_id);
  const key = (await client.query('select id from private.room_activation_keys where id = $1 and revoked_at is null for update',[keyId])).rows[0];
  if (!key) throw new ApiError(409,'The room key has changed. Refresh the room list.');
  await client.query('select id from public.rooms where id = $1 for update',[target.room_id]);
  const occupant = (await client.query('select id,resident_context_id from public.allocations where room_id = $1 and ended_at is null for update',[target.room_id])).rows[0];
  if (!occupant) throw new ApiError(409,'This room is already available.');
  // Close only the resident context. The verified Auth identity and any shared
  // seller portal remain intact, while every existing resident binding is revoked.
  await client.query('update public.allocations set ended_at = now() where id = $1',[occupant.id]);
  await client.query("update public.account_contexts set status = 'closed',updated_at = now() where id = $1 and kind = 'resident'",[occupant.resident_context_id]);
  await client.query('delete from private.account_sessions where active_context_id = $1',[occupant.resident_context_id]);
  await client.query('update private.room_activation_keys set revoked_at = now() where id = $1',[keyId]);
  await client.query('insert into private.room_activation_keys(room_id,code) values ($1,$2)',[target.room_id,`PV-${crypto.randomBytes(16).toString('hex').toUpperCase()}`]);
  await notifyPrimaryOwner(client,occupant.resident_context_id,{category:'verification',title:'Resident Room Access Removed',
    message:`Your room allocation at "${residence.name}" has ended. The previous room key and resident portal access have been revoked.`,sender:actor.contextId});
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values ($1,'resident_room_released','allocation',$2,$3)`,[actor.contextId,occupant.id,JSON.stringify({residenceId:residence.id,roomId:target.room_id,residentContextId:occupant.resident_context_id})]);
  return (await keyRows(client,actor,residence.id,target.room_id)).find(row => row.roomId === target.room_id);
}
export function installHousing(app:Express,auth:SupabaseAuth) {
  app.get('/api/manager/my-hostel',auth.require(['manager']),route(async (req,res) => {
    const hostel = await auth.db.actor(req.actor,async c => {
      const row = (await c.query(`select h.*,private.residence_has_reviewed_setup(h.id) as operational,
        (select v.status from public.verification_cases v where v.residence_id = h.id and v.kind = 'residence_registration') as registration_status
        from public.residences h join public.manager_assignments a on a.residence_id = h.id
        where a.manager_context_id = $1 and a.ended_at is null order by a.assigned_at limit 1`,[req.actor.contextId])).rows[0];
      if (!row) return null;
      const structure = await residenceStructure(c,req.actor,row.id);
      return {...row,...structure,totalCapacity:structure.totalBeds,capacity:structure.totalBeds,blocksConfig:structure.blocksList,
        image:row.cover_path,imageUrl:row.cover_path,gallery:row.gallery_paths,contactPhone:row.contact_phone,contactEmail:row.contact_email,
        digitalAddress:row.digital_address,isApproved:row.operational,approvalStatus:row.registration_status || 'not_submitted',
        registrationRequired:!row.setup_submitted_at,registrationStatus:row.registration_status || 'not_submitted',managerId:req.actor.contextId};
    });
    return res.json({success:true,hostel});
  }));
  app.get('/api/room-keys',auth.require(['manager','admin','staff']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['manager','admin','staff'],
    c => keyRows(c,req.actor,req.query.hostelId === undefined ? undefined : uuid(req.query.hostelId))))));
  app.post('/api/hostels/:id/generate-room-keys',auth.require(['manager','admin']),route(async (req,res) => {
    const keys = await auth.db.authorizedSystem(req.actor,['manager','admin'],c => generateRoomKeys(c,req.actor,uuid(req.params.id)));
    return res.json({success:true,count:keys.length,generatedKeys:keys});
  }));
  app.post('/api/room-keys/:id/release',auth.require(['manager','admin']),route(async (req,res) => {
    const room = await auth.db.authorizedSystem(req.actor,['manager','admin'],c => releaseResidentRoom(c,req.actor,uuid(req.params.id),req.body?.confirm));
    return res.json({success:true,room,message:'Room allocation ended, resident portal revoked and replacement key generated.'});
  }));
}
