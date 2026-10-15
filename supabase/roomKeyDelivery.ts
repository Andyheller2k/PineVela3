import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {bodyFields} from './adminSettings.js';
import {managedResidence} from './housing.js';
import {managerKeyError,requireManagerKeyGrant} from './managerKeys.js';
import {requireAccountAccess} from './accountAccess.js';
import {notify} from './notifications.js';

export function roomKeyDeliveryInput(body:any){
 bodyFields(body,['keyId','recipientEmail','customNote','requestId']);
 const keyId=uuid(body.keyId).toLowerCase(),requestId=uuid(body.requestId).toLowerCase();
 if(typeof body.recipientEmail!=='string')throw new ApiError(400,'Enter the recipient’s verified PineVela or resident email.');
 const recipientEmail=body.recipientEmail.trim().toLowerCase();
 if(recipientEmail.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))throw new ApiError(400,'Enter the recipient’s verified PineVela or resident email.');
 if(body.customNote!==undefined&&typeof body.customNote!=='string')throw new ApiError(400,'The optional welcome note must be text.');
 const customNote=(body.customNote||'').trim();
 if(customNote.length>1000)throw new ApiError(400,'Keep the optional welcome note within 1,000 characters.');
 return{keyId,recipientEmail,customNote,requestId};
}
function receipt(row:any,noChange:boolean,currentKey:boolean){return{success:true,noChange,channel:'pinevela_notification',currentKey,
 message:currentKey?(noChange?'This room key was already delivered to the recipient’s PineVela notifications.':'The room key was delivered to the recipient’s PineVela notifications.'):
  'This earlier delivery is recorded, but its room key has been replaced. Refresh the room list before sending a current key.',
 dispatch:{id:row.id,dispatchedAt:row.created_at,recipientEmail:row.recipient_email,roomId:row.room_id,keyId:row.key_id}};}
/** Requires the caller's live actor transaction. No provider calls or allocation changes. */
export async function deliverRoomKey(c:PoolClient,a:VerifiedActor,body:any){
 const input=roomKeyDeliveryInput(body);
 if(a.kind!=='manager')throw new ApiError(403,'Use your assigned manager account to send a room key.');
 if(a.managerKeyVersion===undefined)throw managerKeyError();
 await requireManagerKeyGrant(c,a);await requireAccountAccess(c,a.contextId,['rooms'],a.sessionId);
 await c.query("select pg_advisory_xact_lock(hashtextextended('room-key-delivery:'||$1::uuid::text||':'||$2::uuid::text,0))",[a.contextId,input.requestId]);
 const digest=(await c.query("select encode(sha256(convert_to(jsonb_build_array($1::uuid,$2::text,$3::text)::text,'UTF8')),'hex') as value",[input.keyId,input.recipientEmail,input.customNote])).rows[0].value;
 const prior=(await c.query('select * from private.room_key_deliveries where actor_context_id=$1 and request_id=$2',[a.contextId,input.requestId])).rows[0];
 if(prior){
  if(prior.payload_digest!==digest)throw new ApiError(409,'This delivery request was already used with different details. Start a new delivery.');
  await managedResidence(c,a,prior.residence_id);
  const current=(await c.query('select id from private.room_activation_keys where id=$1 and revoked_at is null',[prior.key_id])).rowCount;
  return receipt(prior,true,Boolean(current));
 }
 const selected=(await c.query(`select b.residence_id from private.room_activation_keys k join public.rooms r on r.id=k.room_id
  join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id where k.id=$1 and k.revoked_at is null`,[input.keyId])).rows[0];
 if(!selected)throw new ApiError(404,'This current room key is unavailable. Refresh the room list.');
 await managedResidence(c,a,selected.residence_id);
 if(!(await c.query('select private.residence_has_reviewed_setup($1)as allowed',[selected.residence_id])).rows[0].allowed)throw new ApiError(409,'Residence registration must pass review before keys can be delivered.');
 if((await c.query("select 1 from private.residence_deletion_preparations f join public.admin_proposals p on p.id=f.proposal_id where f.state='frozen'and p.preview#>'{resources,residences}' ? $1",[selected.residence_id])).rowCount)
  throw new ApiError(409,'This residence is paused for reviewed backup preparation.');
 const key=(await c.query(`select k.id,k.code,k.room_id,k.claimed_by,k.claimed_at,r.room_number,b.name as block_name,h.name as residence_name
  from private.room_activation_keys k join public.rooms r on r.id=k.room_id join public.floors f on f.id=r.floor_id
  join public.blocks b on b.id=f.block_id join public.residences h on h.id=b.residence_id where k.id=$1 and k.revoked_at is null for update of k,r`,[input.keyId])).rows[0];
 if(!key)throw new ApiError(409,'The room key changed. Refresh the room list.');
 const recipients=(await c.query('select * from private.room_key_delivery_recipient($1)',[input.recipientEmail])).rows;
 if(recipients.length!==1)throw new ApiError(404,'A verified recipient with an active PineVela user account was not found.');
 const recipient=recipients[0];
 await c.query("select id from public.account_contexts where id=$1 and kind='primary'and status='active'for share",[recipient.context_id]);
 const occupant=(await c.query('select resident_context_id,primary_owner_id from public.allocations where room_id=$1 and ended_at is null',[key.room_id])).rows[0];
 if(occupant&&(occupant.primary_owner_id!==recipient.auth_user_id||key.claimed_by!==occupant.resident_context_id)||
  !occupant&&(key.claimed_by||key.claimed_at)||occupant&&!key.claimed_at)
  throw new ApiError(409,'An occupied room key can only be sent to its current resident’s primary account.');
 if((await c.query("select private.system_wipe_row_paused('private','room_key_deliveries','{}'::jsonb,jsonb_build_object('residence_id',$1::uuid,'room_id',$2::uuid,'actor_context_id',$3::uuid,'context_id',$4::uuid))as paused",
   [selected.residence_id,key.room_id,a.contextId,recipient.context_id])).rows[0].paused)throw new ApiError(409,'These reviewed records are paused for recovery verification.');
 const message=`Room ${key.room_number} at "${key.residence_name}" (${key.block_name}). Your activation key is ${key.code}. Use it when activating your separately verified resident account.`+(input.customNote?'\n\n'+input.customNote:'');
 const notification=await notify(c,[recipient.context_id],{category:'verification',title:'Room activation key received',sender:a.contextId,message,link:'/user/dashboard?tab=login-room'});
 await c.query("select set_config('pinevela.room_key_delivery_version',$1,true)",[a.managerKeyVersion]);
 const row=(await c.query(`insert into private.room_key_deliveries(key_id,residence_id,room_id,actor_context_id,manager_key_version,recipient_context_id,recipient_email,custom_note,request_id,payload_digest,notification_id)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)returning *`,[key.id,selected.residence_id,key.room_id,a.contextId,a.managerKeyVersion,recipient.context_id,input.recipientEmail,input.customNote,input.requestId,digest,notification])).rows[0];
 await c.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)values($1,'room_key_delivered','room_key_delivery',$2,$3)`,
  [a.contextId,row.id,JSON.stringify({residenceId:selected.residence_id,roomId:key.room_id,recipientContextId:recipient.context_id,channel:'pinevela_notification'})]);
 return receipt(row,false,true);
}
/** Called only after keyRows has independently authorized and scoped each key. */
export async function roomKeyDeliveryMetadata(c:PoolClient,keyIds:string[]){
 if(!keyIds.length)return new Map<string,{lastDispatchedAt:string;lastDispatchedTo:string}>();
 const rows=(await c.query(`select distinct on(key_id)key_id,created_at,recipient_email from private.room_key_deliveries where key_id=any($1::uuid[]) order by key_id,created_at desc,id desc`,[keyIds])).rows;
 return new Map(rows.map(r=>[r.key_id,{lastDispatchedAt:r.created_at,lastDispatchedTo:r.recipient_email}]));
}
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
export function installRoomKeyDelivery(app:Express,auth:SupabaseAuth){
 app.post('/api/room-keys/send-digital',auth.require(['manager']),route(async(req,res)=>{
  if(Object.keys(req.query).length)throw new ApiError(400,'Identity selectors are not accepted.');
  const context=req.headers['x-pinevela-account-context'];if(context!==undefined&&context!==req.actor.contextId)throw new ApiError(409,'Your active account changed. Refresh the room list.');
  res.json(await auth.db.authorizedSystem(req.actor,['manager'],c=>deliverRoomKey(c,req.actor,req.body)));
 }));
}
