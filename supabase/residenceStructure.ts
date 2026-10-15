import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
type Layout = {typeName:string;bedsPerRoom:number;totalRooms:number};
type Block = {name:string;gender:string;floors:number;roomPrefix:string;startNum:number;roomTypes:Layout[]};
const normalized = (items:Block[]) => items.map(b => ({name:b.name,gender:b.gender,floors:b.floors,roomPrefix:b.roomPrefix,startNum:b.startNum,
  roomTypes:b.roomTypes.map(r => ({typeName:r.typeName,bedsPerRoom:r.bedsPerRoom,totalRooms:r.totalRooms}))})).sort((a,b) => a.name.localeCompare(b.name));
export const sameResidenceStructure = (left:Block[],right:Block[]) => JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
const integer = (value:unknown,minimum:number,maximum:number) => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new ApiError(400,'Enter whole, positive floor, room and bed counts within the supported limits.');
  return Number(value);
};
const text = (value:unknown,maximum:number) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new ApiError(400,'Enter the actual block names and room layouts.');
  return value.trim();
};
export function parseResidenceStructure(value:unknown):Block[] {
  if (!Array.isArray(value) || !value.length || value.length > 32) throw new ApiError(400,'Configure between one and 32 actual blocks.');
  const names = new Set<string>();let rooms = 0,beds = 0;
  const blocks = value.map(b => {
    const name = text(b?.name,120),gender = b?.gender;
    if (names.has(name.toLowerCase())) throw new ApiError(400,'Each block needs a distinct name.');names.add(name.toLowerCase());
    if (!['Male','Female','Mixed'].includes(gender)) throw new ApiError(400,'Choose the block gender category.');
    if (typeof b?.roomPrefix !== 'string' || !/^[A-Za-z0-9-]{0,12}$/.test(b.roomPrefix)) throw new ApiError(400,'Use a room prefix up to twelve letters, digits or hyphens.');
    if (!Array.isArray(b?.roomTypes) || !b.roomTypes.length || b.roomTypes.length > 16) throw new ApiError(400,'Specify actual room layouts and counts for each block.');
    const types = new Set<string>();
    const roomTypes = b.roomTypes.map((r:any) => {
      const typeName = text(r?.typeName,120);
      if (types.has(typeName.toLowerCase())) throw new ApiError(400,'Each room layout in a block needs a distinct name.');types.add(typeName.toLowerCase());
      const bedsPerRoom = integer(r.bedsPerRoom,1,4),totalRooms = integer(r.totalRooms,1,10000);
      rooms += totalRooms;beds += totalRooms * bedsPerRoom;
      return {typeName,bedsPerRoom,totalRooms};
    });
    const totalRooms = roomTypes.reduce((n:number,r:Layout) => n + r.totalRooms,0),floors = integer(b.floors,1,100),startNum = integer(b.startNum,1,999999);
    if (floors > totalRooms || startNum + totalRooms - 1 > 999999) throw new ApiError(400,'Each configured floor must have a room, and room numbers must stay within range.');
    if (b.totalRooms !== undefined && b.totalRooms !== totalRooms) throw new ApiError(400,'Block room totals must match their room layouts.');
    return {name,gender,floors,roomPrefix:b.roomPrefix,startNum,roomTypes};
  });
  if (rooms > 10000 || beds > 40000) throw new ApiError(400,'A residence supports up to 10,000 rooms and 40,000 configured beds.');
  return blocks;
}
async function scope(client:PoolClient,actor:VerifiedActor,residenceId:string,write=false) {
  if (!(write ? ['manager','admin'] : ['manager','admin','staff']).includes(actor.kind)) throw new ApiError(403,'Authorized housing account required.');
  const residence = (await client.query(`select h.id,h.status from public.residences h where h.id = $1 and
    ($2::text = 'admin' or ($2 = 'manager' and exists(select 1 from public.manager_assignments a where a.residence_id = h.id
      and a.manager_context_id = $3 and a.ended_at is null)) or ($2 = 'staff' and exists(select 1 from public.staff_assignments a
      where a.residence_id = h.id and a.staff_context_id = $3 and a.status = 'active' and a.ended_at is null))) ${write ? 'for update of h' : ''}`,
    [residenceId,actor.kind,actor.contextId])).rows[0];
  if (!residence) throw new ApiError(404,'Authorized residence not found.');
  if (write && residence.status !== 'approved') throw new ApiError(409,'The property must pass verification before rooms can be configured.');
  if (write && actor.kind === 'manager') {
    const assignment = await client.query('select id from public.manager_assignments where residence_id = $1 and manager_context_id = $2 and ended_at is null for share',[residenceId,actor.contextId]);
    if (!assignment.rowCount) throw new ApiError(403,'Manager assignment is no longer active.');
  }
}
export async function residenceStructure(client:PoolClient,actor:VerifiedActor,residenceId:string) {
  await scope(client,actor,residenceId);
  const blocks = (await client.query(`select b.id,b.name,b.gender,b.room_prefix as "roomPrefix",b.starting_room_number as "startNum",
    (select count(*)::integer from public.floors f where f.block_id = b.id) as floors,
    coalesce((select jsonb_agg(t order by t.first_room) from (select r.layout_label as "typeName",count(*)::integer as "totalRooms",
      min((select count(*)::integer from public.beds bed where bed.room_id = r.id)) as "bedsPerRoom",
      min(case when r.room_number ~ '^[0-9]+$' then r.room_number::integer else null end) as first_room
      from public.rooms r join public.floors f on f.id = r.floor_id where f.block_id = b.id group by r.layout_label) t),'[]'::jsonb) as "roomTypes"
    from public.blocks b where b.residence_id = $1 order by b.created_at,b.id`,[residenceId])).rows;
  let totalRooms = 0,totalBeds = 0,totalFloors = 0;
  for (const b of blocks) {
    b.roomTypes = b.roomTypes.map((t:any) => ({typeName:t.typeName,totalRooms:t.totalRooms,bedsPerRoom:t.bedsPerRoom}));
    b.totalRooms = b.roomTypes.reduce((n:number,t:Layout) => n + t.totalRooms,0);
    totalRooms += b.totalRooms;totalBeds += b.roomTypes.reduce((n:number,t:Layout) => n + t.totalRooms * t.bedsPerRoom,0);totalFloors += b.floors;
  }
  return {residenceId,blocksList:blocks,totalBlocks:blocks.length,totalFloors,totalRooms,totalBeds};
}
export async function createResidenceStructure(client:PoolClient,actor:VerifiedActor,residenceId:string,blocks:Block[]) {
  await scope(client,actor,residenceId,true);
  const existing = await residenceStructure(client,actor,residenceId);
  if (existing.blocksList.length) {
    if (!sameResidenceStructure(existing.blocksList,blocks)) throw new ApiError(409,'Room structure already exists. Submit a reviewed residence change request to modify it.');
    return {...existing,alreadyConfigured:true};
  }
  return insertResidenceStructure(client,actor,residenceId,blocks);
}
/** Only the assigned applicant's requested correction of an unpublished setup.
 * The residence row is locked before inspecting dependencies; every housing writer
 * uses that same lock. Existing operational identities/history are never replaced. */
export async function correctResidenceStructure(client:PoolClient,actor:VerifiedActor,residenceId:string,before:Block[],blocks:Block[]) {
  if (actor.kind !== 'manager') throw new ApiError(403,'Use your assigned manager account.');
  const allowed = await client.query(`select r.id from public.residences r join public.verification_cases v on v.residence_id=r.id
    join public.manager_assignments a on a.residence_id=r.id and a.manager_context_id=v.applicant_context_id
    where r.id=$1 and r.status='pending' and r.setup_submitted_at is not null
      and v.kind='residence_registration' and v.status='more_info_required' and v.applicant_context_id=$2
      and a.ended_at is null for update of r,v`,[residenceId,actor.contextId]);
  if (!allowed.rowCount) throw new ApiError(409,'Room corrections require your residence registration to be awaiting more information.');
  const existing = await residenceStructure(client,actor,residenceId);
  if (!sameResidenceStructure(existing.blocksList,before)) throw new ApiError(409,'The existing room configuration differs from the saved submission. Administrator review is required.');
  if (sameResidenceStructure(existing.blocksList,blocks)) return {...existing,alreadyConfigured:true};
  const history = (await client.query(`with rooms as (
      select room.id from public.rooms room join public.floors f on f.id=room.floor_id
      join public.blocks b on b.id=f.block_id where b.residence_id=$1)
    select exists(select 1 from public.allocations where room_id in(select id from rooms))
      or exists(select 1 from private.room_activation_keys where room_id in(select id from rooms))
      or exists(select 1 from private.account_enrollments where room_id in(select id from rooms))
      or exists(select 1 from public.staff_assignments where residence_id=$1)
      or exists(select 1 from public.maintenance_issues where residence_id=$1) as present`,[residenceId])).rows[0].present;
  if (history) throw new ApiError(409,'Room layouts with activation keys or operational history cannot be replaced during a registration correction.');
  // Only unused hierarchy rows are replaced. Retained room identifiers remain in
  // the private reference ledger, and their full configuration is audited below.
  await client.query('delete from public.blocks where residence_id=$1',[residenceId]);
  return insertResidenceStructure(client,actor,residenceId,blocks);
}
async function insertResidenceStructure(client:PoolClient,actor:VerifiedActor,residenceId:string,blocks:Block[]) {
  for (const b of blocks) {
    const blockId = (await client.query(`insert into public.blocks(residence_id,name,gender,room_prefix,starting_room_number,beds_per_room)
      values ($1,$2,$3,$4,$5,$6) returning id`,[residenceId,b.name,b.gender,b.roomPrefix,b.startNum,b.roomTypes[0].bedsPerRoom])).rows[0].id;
    const total = b.roomTypes.reduce((n,r) => n + r.totalRooms,0);
    // Preserve sequential room numbering and distribute the declared rooms over
    // every declared floor, with at most one room difference between floors.
    const rows:{roomNumber:string;floor:number;label:string;beds:number}[] = [];let index = 0;
    for (const type of b.roomTypes) for (let i = 0; i < type.totalRooms; i++,index++) {
      const largerFloors = total % b.floors,base = Math.floor(total / b.floors),largerRooms = largerFloors * (base + 1);
      const floor = index < largerRooms ? Math.floor(index / (base + 1)) + 1 : largerFloors + Math.floor((index - largerRooms) / base) + 1;
      rows.push({roomNumber:String(b.startNum + index),floor,label:type.typeName,beds:type.bedsPerRoom});
    }
    await client.query(`with floors as (insert into public.floors(block_id,floor_number) select $1,n from generate_series(1,$2::integer) n returning id,floor_number),
      config as (select * from jsonb_to_recordset($3::jsonb) as x("roomNumber" text,floor integer,label text,beds integer)),
      rooms as (insert into public.rooms(floor_id,room_number,layout_label) select f.id,c."roomNumber",c.label from config c
        join floors f on f.floor_number = c.floor returning id,room_number)
      insert into public.beds(room_id,bed_number) select r.id,n from rooms r join config c on c."roomNumber" = r.room_number
        cross join lateral generate_series(1,c.beds) n`,[blockId,b.floors,JSON.stringify(rows)]);
  }
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values ($1,'residence_structure_configured','residence',$2,$3)`,[actor.contextId,residenceId,JSON.stringify({blocks:blocks.length,rooms:blocks.reduce((n,b) => n + b.roomTypes.reduce((s,t) => s + t.totalRooms,0),0)})]);
  return {...await residenceStructure(client,actor,residenceId),alreadyConfigured:false};
}
export function installResidenceStructure(app:Express,auth:SupabaseAuth) {
  const route = (work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler => (req,res,next) => {work(req as AuthRequest,res).catch(next);};
  app.get('/api/hostels/:id/structure',auth.require(['manager','admin','staff']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['manager','admin','staff'],
    c => residenceStructure(c,req.actor,uuid(req.params.id))))));
  app.post('/api/hostels/:id/structure',auth.require(['manager','admin']),route(async (req,res) => {
    const blocks = parseResidenceStructure(req.body?.blocksList);
    const result = await auth.db.authorizedSystem(req.actor,['manager','admin'],c => createResidenceStructure(c,req.actor,uuid(req.params.id),blocks));
    return res.status(result.alreadyConfigured ? 200 : 201).json({success:true,...result});
  }));
}
