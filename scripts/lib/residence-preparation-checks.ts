/** Disposable native PostgreSQL only: real restored Google subjects and sessions. */
import assert from 'node:assert/strict';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../../supabase/db.js';
import {SupabaseAuth} from '../../supabase/auth.js';
import {SupabaseResidenceReviews,prepareResidenceReview,residenceReviewStatus} from '../../supabase/residenceReviews.js';
import {checkApprovalKey} from '../../supabase/adminGovernance.js';

type Fixture={actors:VerifiedActor[];primaries:VerifiedActor[];keys:string[];settingsKeys:string[];item?:string};
type Housing={home:string;other:string;unrelated:string;manager:string;resident:string;room:string;block:string;floor:string};
export async function verifyResidencePreparation(db:SupabaseDatabase,fixture:Fixture,housing:Housing) {
  let checks=0;
  const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
  async function denied(work:()=>Promise<unknown>,expected:number|string,label:string) {let error:any;try{await work();}catch(e){error=e;}
    check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,
      `${label} (expected ${expected}; received ${error instanceof ApiError?error.status:error?.code||'success'})`);}
  const {actors,primaries,keys,settingsKeys}=fixture,[founder,second,third]=actors;
  const service=new SupabaseResidenceReviews(new SupabaseAuth(db));
  const options={hostelId:housing.home,deleteHostel:true,deleteManager:false,ban:{amount:2,unit:'days'}};
  const propose=async(a=second,extra:any={})=>{const opts={...options,...extra},preview=await service.preview(a,opts);
    return service.propose(a,{...opts,fingerprint:preview.fingerprint,reason:'Review housing records before backup preparation',privateKey:keys[actors.indexOf(a)]});};
  const vote=(id:string,a=third)=>service.vote(a,id,{decision:'approved',privateKey:keys[actors.indexOf(a)]});
  const prepare=(id:string,a=founder,extra:any={})=>service.prepare(a,id,{privateKey:keys[actors.indexOf(a)],confirmation:'FREEZE APPROVED HOSTEL',...extra});
  const cancel=(id:string,a=founder,extra:any={})=>service.cancelPreparation(a,id,{privateKey:keys[actors.indexOf(a)],reason:'Resume housing after backup review',...extra});
  const record=async(id:string)=>(await db.pool.query('select * from private.residence_deletion_preparations where proposal_id=$1',[id])).rows[0];
  const opened=await propose();
  await denied(()=>prepare(opened.id),409,'One consent cannot freeze reviewed housing');
  await vote(opened.id);
  await denied(()=>prepare(opened.id,third),403,'Independent administrator cannot replace keyed founder');
  for(const key of [settingsKeys[0],keys[1],'wrong-key'])await denied(()=>prepare(opened.id,founder,{privateKey:key}),403,'Only founder own approval key can freeze');
  for(const extra of [{confirmation:'DELETE APPROVED HOSTEL'},{confirmation:null},{managerId:housing.manager},{userId:founder.authUserId}])
    await denied(()=>prepare(opened.id,founder,extra),400,'Confirmation and request shape reject spoofing');
  await denied(()=>db.system(c=>c.query(`insert into private.residence_deletion_preparations(proposal_id,founder_context_id,preview_digest)
    select id,$2,baseline_digest from public.admin_proposals where id=$1`,[opened.id,founder.contextId])),'42501','Native root insert without own-key authorization fails');
  const grant=await db.authorizedSystem(founder,['admin'],c=>checkApprovalKey(c,founder,keys[0]));
  await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await prepareResidenceReview(c,founder,grant,opened.id);
    throw new ApiError(409,'Abort isolated preparation transaction');},false,false,true),409,'Preparation rollback remains atomic');
  check(!await record(opened.id),'Rollback leaves no durable freeze');
  check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[opened.id])).rows[0].count==='2','Rollback does not save third founder vote');
  const results=await Promise.allSettled([prepare(opened.id),prepare(opened.id)]);
  check(results.filter(r=>r.status==='fulfilled').length===1&&results.some(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===409),'Concurrent preparation creates exactly one pause');
  const saved=await record(opened.id);
  check(saved.state==='frozen'&&saved.founder_context_id===founder.contextId&&!!saved.created_at,'Native durable pause stamps actual founder and time');
  check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[opened.id])).rows[0].count==='3','Founder final consent is recorded after two other approvals');
  await denied(()=>propose(),409,'Frozen dependencies cannot collect an overlapping review');
  const status=await db.authorizedSystem(founder,['admin'],c=>residenceReviewStatus(c,founder));
  check(status.find(p=>p.id===opened.id)?.preparation?.state==='frozen'&&!status.find(p=>p.id===opened.id)?.executionAvailable,'Admin status exposes pause without execution or credentials');
  const newer=await propose(founder,{hostelId:housing.unrelated,ban:{amount:0,unit:'days'}});
  const reordered=await db.authorizedSystem(founder,['admin'],c=>residenceReviewStatus(c,founder));
  check(reordered[0].id===opened.id,'Durable active pause remains visible ahead of newer review history');
  await service.rejectFinal(founder,newer.id,{privateKey:keys[0],reason:'Retain unrelated housing operations'});
  for(const sql of ["update private.residence_deletion_preparations set preview_digest=repeat('a',64) where proposal_id=$1",
    "update private.residence_deletion_preparations set state='cancelled',cancellation_reason='Forged cancellation' where proposal_id=$1",
    'delete from private.residence_deletion_preparations where proposal_id=$1'])
    await denied(()=>db.system(c=>c.query(sql,[opened.id])),'42501','Native pause evidence cannot be altered or released without founder key');
  const writes:[string,unknown[]][]=[
    ["update public.rooms set room_number='3' where id=$1",[housing.room]],
    ['delete from public.rooms where id=$1',[housing.room]],
    ["insert into public.rooms(floor_id,room_number) values($1,'3')",[housing.floor]],
    ["insert into public.blocks(residence_id,name) values($1,'Additional block')",[housing.home]],
    ['update public.blocks set residence_id=$2 where id=$1',[housing.block,housing.unrelated]],
    ['update public.residences set primary_owner_id=$2 where id=$1',[housing.home,primaries[0].authUserId]],
    ["update public.account_contexts set status='closed' where id=$1",[housing.manager]],
    ["update public.profiles set display_name=display_name||' ' where id=$1",[primaries[4].authUserId]],
    ["update private.room_activation_keys set code=code||'x' where room_id=$1",[housing.room]],
    ["update public.allocations set ended_at=clock_timestamp() where room_id=$1 and ended_at is null",[housing.room]],
    ["update public.manager_assignments set ended_at=clock_timestamp() where residence_id=$1 and ended_at is null",[housing.home]],
  ];
  for(const [sql,values] of writes)await denied(()=>db.system(c=>c.query(sql,values)),409,'Frozen write denied: '+sql.split(' where')[0]);
  await denied(()=>db.system(c=>c.query('truncate public.rooms cascade')),409,'Native truncate cannot bypass frozen hierarchy');
  await denied(()=>db.system(c=>c.query('truncate private.residence_deletion_preparations cascade')),'42501','Preparation history cannot be truncated, including its dependent recovery records');
  await db.system(c=>c.query('update public.rooms set room_number=room_number where id=$1',[housing.room]));
  check((await db.pool.query('select room_number from public.rooms where id=$1',[housing.room])).rows[0].room_number==='1','No-op writes preserve unchanged reviewed rows');
  await db.system(c=>c.query("update public.residences set description=description||' ' where id=$1",[housing.unrelated]));
  check(true,'Unrelated housing stays writable');
  if(fixture.item){await db.system(c=>c.query('update public.listings set stock_quantity=stock_quantity+1 where id=$1',[fixture.item]));check(true,'Unrelated marketplace remains writable');}
  for(const role of ['anon','authenticated','pinevela_backend']){
    check(!(await db.pool.query("select has_table_privilege($1,'private.residence_deletion_preparations','SELECT') as allowed",[role])).rows[0].allowed,'Private preparation has no direct browser or backend grants');
    check(!(await db.pool.query("select has_function_privilege($1,'private.residence_freeze_write_guard()','EXECUTE') as allowed",[role])).rows[0].allowed,'Privileged metadata guard cannot be called as RPC');
    await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.residence_deletion_preparations');}),'42501','Private preparation cannot be read directly');
  }
  const reconnected=new SupabaseDatabase(db.pool.options);
  try{check((await reconnected.pool.query('select state from private.residence_deletion_preparations where proposal_id=$1',[opened.id])).rows[0].state==='frozen','New connection observes durable pause');
    await denied(()=>reconnected.system(c=>c.query("update public.rooms set room_number='4' where id=$1",[housing.room])),409,'Restarted connection cannot bypass pause');
  }finally{await reconnected.close();}
  const recipients=(await db.pool.query(`select distinct r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id
    where n.title='Residence backup preparation started'`)).rows.map(r=>r.context_id);
  check(actors.every(a=>recipients.includes(a.contextId))&&recipients.includes(primaries[4].contextId)&&recipients.includes(housing.manager)&&recipients.includes(housing.resident),'Actual pause notifies admins, saved primary owner and affected portals');
  check(!recipients.includes(primaries[0].contextId),'Unrelated primary owner receives no housing-pause notice');
  await denied(()=>cancel(opened.id,third),403,'Other administrator cannot release founder pause');
  await denied(()=>cancel(opened.id,founder,{reason:'x'}),400,'Cancellation requires reason');
  await service.rejectFinal(founder,opened.id,{privateKey:keys[0],reason:'Keep residence operations available'});
  check((await record(opened.id)).state==='frozen','Closing consent does not silently unfreeze housing');
  await cancel(opened.id);
  const cancelled=await record(opened.id);
  check(cancelled.state==='cancelled'&&cancelled.cancelled_by===founder.contextId&&!!cancelled.cancelled_at&&cancelled.cancellation_reason==='Resume housing after backup review','Founder can release pause even after review closes');
  await denied(()=>cancel(opened.id),409,'Cancellation cannot replay');
  await denied(()=>prepare(opened.id),409,'Closed review cannot restart preparation');
  await db.system(c=>c.query("update public.rooms set room_number='2' where id=$1",[housing.room]));
  await db.system(c=>c.query("update public.rooms set room_number='1' where id=$1",[housing.room]));
  check(true,'Cancelled preparation releases housing writes');
  const next=await propose(founder);await vote(next.id,second);
  let entered!:()=>void,release!:()=>void;
  const enteredWriter=new Promise<void>(resolve=>{entered=resolve;}),releaseWriter=new Promise<void>(resolve=>{release=resolve;});
  const writer=db.system(async c=>{await c.query('update public.rooms set room_number=room_number where id=$1',[housing.room]);entered();await releaseWriter;});
  await enteredWriter;
  const preparation=prepare(next.id);let waiting=false;
  try {
    const deadline=Date.now()+5000;
    while(Date.now()<deadline&&!waiting){waiting=(await db.pool.query(`select exists(select 1 from pg_stat_activity
      where wait_event='advisory' and query like '%pg_advisory_xact_lock(hashtextextended(''residence-deletion-freeze''%') as waiting`)).rows[0].waiting;
      if(!waiting)await new Promise(resolve=>setTimeout(resolve,25));}
  }finally{release();await writer;}
  await preparation;
  check(waiting,'Founder preparation waits for an in-flight native housing writer before locking governance and context rows');
  check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[next.id])).rows[0].count==='2','Founder plus one independent consent is sufficient');
  await cancel(next.id);
  check((await db.pool.query('select status from public.admin_proposals where id=$1',[next.id])).rows[0].status==='invalidated','Cancellation invalidates consent rather than permitting replay');
  check((await db.pool.query('select count(*) from public.residences where id=any($1::uuid[])',[[housing.home,housing.other]])).rows[0].count==='2','Preparation never deletes residences');
  check((await db.pool.query('select count(*) from public.registration_bans')).rows[0].count==='0','Preparation never starts a registration cooldown');
  return checks;
}
