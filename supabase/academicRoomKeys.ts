import crypto from 'node:crypto';
import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {bodyFields,type SettingsGrant} from './adminSettings.js';
import {checkApprovalKey,deniedApprovalKey,requireApprovalGrant} from './adminGovernance.js';
import {requireManagerKeyGrant} from './managerKeys.js';
import {requireAccountAccess} from './accountAccess.js';
import {managedResidence,keyRows} from './housing.js';
import {notify} from './notifications.js';
import {insertRoomActivationKeys} from './activationCodes.js';
export function academicYear(value:unknown){
 const match=typeof value==='string'&&/^([0-9]{4})\/([0-9]{4})$/.exec(value);
 if(!match||Number(match[2])!==Number(match[1])+1)throw new ApiError(400,'Enter consecutive academic years, such as 2026/2027.');return value as string;
}
async function resetTarget(c:PoolClient,a:VerifiedActor,id:string){
 const h=await managedResidence(c,a,id);await requireAccountAccess(c,a.contextId,['rooms'],a.sessionId);
 if(!(await c.query('select private.residence_has_reviewed_setup($1) as allowed',[id])).rows[0].allowed)throw new ApiError(409,'Residence registration must pass review before annual room-key reset.');
 if((await c.query("select 1 from private.residence_deletion_preparations f join public.admin_proposals p on p.id=f.proposal_id where f.state='frozen' and p.preview#>'{resources,residences}' ? $1",[id])).rowCount)throw new ApiError(409,'This residence is paused for reviewed backup preparation.');
 return h;
}
async function snapshot(c:PoolClient,a:VerifiedActor,id:string,year:string){
 const residence=await resetTarget(c,a,id);
 const latest=(await c.query('select * from private.residence_room_key_cycles where residence_id=$1 order by academic_year desc limit 1',[id])).rows[0];
 if(latest&&latest.academic_year>year)throw new ApiError(409,'Choose an academic year after the last completed reset.');
 if(latest?.academic_year===year)return{residence,latest,rooms:[],fingerprint:null,alreadyCompleted:true};
 const rooms=(await c.query(`select r.id,r.room_number,f.floor_number,b.id as block_id,b.name as block_name,
  (select count(*)::integer from public.beds bed where bed.room_id=r.id) as beds,
  k.id as key_id,k.code,k.claimed_by,k.claimed_at,k.cycle_id,a.id as allocation_id,a.resident_context_id,a.bed_id,a.started_at,
  x.status as resident_status,x.auth_user_id,x.primary_owner_id,p.primary_owner_id as profile_owner
  from public.rooms r join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
  left join private.room_activation_keys k on k.room_id=r.id and k.revoked_at is null
  left join public.allocations a on a.room_id=r.id and a.ended_at is null
  left join public.account_contexts x on x.id=a.resident_context_id left join public.profiles p on p.id=x.auth_user_id
  where b.residence_id=$1 order by r.id limit 10001 for update of r`,[id])).rows;
 if(!rooms.length||rooms.length>10000)throw new ApiError(409,'An annual reset requires between one and 10,000 configured rooms.');
 if(rooms.some(r=>!r.beds||r.allocation_id&&(r.resident_status!=='active'||!r.primary_owner_id||r.primary_owner_id!==r.profile_owner||!r.key_id||r.claimed_by!==r.resident_context_id)||!r.allocation_id&&r.claimed_by))throw new ApiError(409,'Room occupancy, beds or claimed keys need review before reset.');
 const assignments=(await c.query('select id,manager_context_id from public.manager_assignments where residence_id=$1 and ended_at is null order by id',[id])).rows;
 const keyVersion=a.kind==='manager'?(await c.query('select version from private.manager_operation_keys where manager_context_id=$1',[a.contextId])).rows[0]?.version:(await c.query('select approval_key_version as version from private.admin_secrets where context_id=$1',[a.contextId])).rows[0]?.version;
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({actor:a.contextId,keyVersion,year,residence,latest:latest?.id,assignments,rooms})).digest('hex');
 return{residence,latest,rooms,fingerprint,alreadyCompleted:false};
}
function receipt(r:any,noChange:boolean){return{success:true,noChange,cycleId:r.id,academicYear:r.academic_year,count:r.room_count,occupantsRemoved:r.occupants_removed,completedAt:r.completed_at,identityRetained:true,otherPortalsRetained:true,
 message:noChange?'This academic-year reset is already complete. No room access or keys were changed.':`Room access reset for ${r.academic_year}. Verified identities and other portals are retained; residents must activate again with their new room keys.`};}
export async function academicResetPreview(c:PoolClient,a:VerifiedActor,id:string,value:unknown){
 const year=academicYear(value),s=await snapshot(c,a,id,year);
 return{residenceName:s.residence.name,academicYear:year,previousAcademicYear:s.latest?.academic_year||null,alreadyCompleted:s.alreadyCompleted,
  receipt:s.alreadyCompleted?receipt(s.latest,true):undefined,fingerprint:s.fingerprint||undefined,rooms:s.alreadyCompleted?undefined:s.rooms.length,
  occupants:s.alreadyCompleted?undefined:s.rooms.filter(r=>r.allocation_id).length,identityRetained:true,otherPortalsRetained:true};
}
/** Caller holds the exclusive housing lifecycle lock before any actor/room locks. */
export async function resetAcademicRoomKeys(c:PoolClient,a:VerifiedActor,id:string,body:any,grant?:SettingsGrant){
 bodyFields(body,['academicYear','confirm','fingerprint',...(a.kind==='admin'?['approvalKey']:[])]);
 if(body.confirm!=='RESET ROOM ACCESS')throw new ApiError(400,'Type RESET ROOM ACCESS to confirm ending residence room access.');
 if(a.kind==='manager'){
  if(a.managerKeyVersion===undefined)throw new ApiError(403,'Enter your current manager operation key.','manager_key_required');
  await requireManagerKeyGrant(c,a);
 }else if(a.kind==='admin'){if(!grant)throw new ApiError(403,'Enter your current approval key.','approval_key_required');await requireApprovalGrant(c,a,grant);}
 else throw new ApiError(403,'Manager access required.');
 const year=academicYear(body.academicYear),s=await snapshot(c,a,id,year);
 if(s.alreadyCompleted)return receipt(s.latest,true);
 if(body.fingerprint!==s.fingerprint)throw new ApiError(409,'Rooms, occupants or authorization changed. Refresh the exact reset preview.');
 const occupied=s.rooms.filter(r=>r.allocation_id);
 await c.query("select set_config('pinevela.room_cycle_confirmation','RESET ROOM ACCESS',true),set_config('pinevela.room_cycle_key_version',$1,true)",[a.managerKeyVersion||String(grant?.version)]);
 const cycle=(await c.query(`insert into private.residence_room_key_cycles(residence_id,residence_name,academic_year,actor_context_id,actor_kind,manager_key_version,approval_key_version,fingerprint,room_count,occupants_removed)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,[id,s.residence.name,year,a.contextId,a.kind,a.managerKeyVersion||null,grant?.version||null,s.fingerprint,s.rooms.length,occupied.length])).rows[0];
 const residentOwners=(await c.query("select id from public.account_contexts where kind='primary' and status='active' and auth_user_id=any($1::uuid[])",[occupied.map(r=>r.primary_owner_id)])).rows.map(r=>r.id);
 await notify(c,residentOwners,{category:'verification',title:'Academic-year resident room access ended',sender:a.contextId,
  message:`Your room allocation at "${s.residence.name}" was released for ${year}. Its previous activation key and resident portal access ended. Your verified identity, other portals and history remain. Obtain a new room key and activate again when ready.`});
 const residentIds=occupied.map(r=>r.resident_context_id),roomIds=s.rooms.map(r=>r.id);
 await c.query('update public.allocations set ended_at=transaction_timestamp() where id=any($1::uuid[]) and ended_at is null',[occupied.map(r=>r.allocation_id)]);
 await c.query("update public.account_contexts set status='closed',updated_at=transaction_timestamp() where id=any($1::uuid[]) and kind='resident'",[residentIds]);
 await c.query('delete from private.account_sessions where active_context_id=any($1::uuid[])',[residentIds]);
 await c.query('update private.room_activation_keys set revoked_at=transaction_timestamp() where room_id=any($1::uuid[]) and revoked_at is null',[roomIds]);
 await insertRoomActivationKeys(c,roomIds,cycle.id);
 await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)values($1,'academic_year_room_keys_reset','residence',$2,$3)",[a.contextId,id,JSON.stringify({cycleId:cycle.id,academicYear:year,roomCount:s.rooms.length,occupantsRemoved:occupied.length})]);
 const managers=(await c.query("select m.manager_context_id from public.manager_assignments m join public.account_contexts x on x.id=m.manager_context_id where m.residence_id=$1 and m.ended_at is null and x.status='active'",[id])).rows.map(r=>r.manager_context_id);
 const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
 await notify(c,[...managers,...admins],{category:'admin_governance',title:'Academic-year room-key reset completed',sender:a.contextId,message:`${s.residence.name}: ${s.rooms.length} rooms reset for ${year}; ${occupied.length} resident allocations ended. Verified identities and other portals are retained.`,link:a.kind==='admin'?'governance':undefined});
 const owners=(await c.query("select id from public.account_contexts where kind='primary' and status='active' and auth_user_id=$1",[s.residence.primary_owner_id])).rows.map(r=>r.id);
 await notify(c,owners,{category:'verification',title:'Residence room access reset completed',sender:a.contextId,message:`Room activation keys for "${s.residence.name}" were replaced for ${year}. Residents must use their new keys; their verified identities are retained.`});
 return{...receipt(cycle,false),roomKeys:await keyRows(c,a,id)};
}
function checked(req:AuthRequest){const context=req.headers['x-pinevela-account-context'];if(context!==undefined&&context!==req.actor.contextId)throw new ApiError(409,'Your active account changed. Refresh the preview.');}
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
export function installAcademicRoomKeys(app:Express,auth:SupabaseAuth){
 app.get('/api/hostels/:id/room-key-reset-preview',auth.require(['manager','admin']),route(async(req,res)=>{
  checked(req);if(Object.keys(req.query).some(k=>k!=='academicYear'))throw new ApiError(400,'Only the academic year may be selected.');
  res.json(await auth.db.authorizedSystem(req.actor,['manager','admin'],c=>academicResetPreview(c,req.actor,uuid(req.params.id),req.query.academicYear)));
 }));
 app.post('/api/hostels/:id/reshuffle-room-keys',auth.require(['manager','admin']),route(async(req,res)=>{
  checked(req);if(Object.keys(req.query).length)throw new ApiError(400,'Identity selectors are not accepted.');
  bodyFields(req.body,['academicYear','confirm','fingerprint',...(req.actor.kind==='admin'?['approvalKey']:[])]);
  let grant:SettingsGrant|undefined;
  if(req.actor.kind==='admin'){grant=await auth.db.authorizedSystem(req.actor,['admin'],c=>checkApprovalKey(c,req.actor,req.body.approvalKey));deniedApprovalKey(grant);}
  res.json(await auth.db.authorizedSystem(req.actor,['manager','admin'],c=>resetAcademicRoomKeys(c,req.actor,uuid(req.params.id),req.body,grant),false,false,true));
 }));
}
