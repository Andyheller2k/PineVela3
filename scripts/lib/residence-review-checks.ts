/** Native review tests with restored genuine Auth subjects. No cloud deletion or provider mocks. */
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ApiError,type SupabaseDatabase,type VerifiedActor} from '../../supabase/db.js';
import {SupabaseAuth} from '../../supabase/auth.js';
import {SupabaseResidenceReviews,residenceReviewStatus,voteResidenceReview} from '../../supabase/residenceReviews.js';
import {checkApprovalKey,requireApprovalGrant,setAdministratorActive} from '../../supabase/adminGovernance.js';
import {verifyResidencePreparation} from './residence-preparation-checks.js';

export async function verifyResidenceReviews(db:SupabaseDatabase,fixture:{actors:VerifiedActor[];primaries:VerifiedActor[];keys:string[];settingsKeys:string[];item?:string}) {
  let checks=0;
  const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
  async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
    check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);}
  const {actors,primaries,keys,settingsKeys}=fixture,[founder,second,third]=actors;
  const service=new SupabaseResidenceReviews(new SupabaseAuth(db));
  const housing=await db.system(async c=>{
    const manager=(await c.query("select id from public.account_contexts where kind='manager' and primary_owner_id=$1",[primaries[4].authUserId])).rows[0].id;
    const home=(await c.query('select residence_id from public.manager_assignments where manager_context_id=$1 and ended_at is null',[manager])).rows[0].residence_id;
    const block=(await c.query('insert into public.blocks(residence_id,name) select $1,display_name from public.profiles where id=$2 returning id',[home,primaries[4].authUserId])).rows[0].id;
    const floor=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[block])).rows[0].id;
    const room=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[floor])).rows[0].id;
    const bed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[room])).rows[0].id;
    const resident=(await c.query("select id from public.account_contexts where kind='resident' and primary_owner_id=$1",[primaries[4].authUserId])).rows[0].id;
    await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3)',[resident,room,bed]);
    await c.query('insert into private.room_activation_keys(room_id,code) values($1,$2)',[room,crypto.randomBytes(24).toString('hex')]);
    const other=(await c.query('insert into public.residences(primary_owner_id,name) select $1,display_name from public.profiles where id=$1 returning id',[primaries[4].authUserId])).rows[0].id;
    await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager,other]);
    const unrelated=(await c.query('insert into public.residences(primary_owner_id,name) select $1,display_name from public.profiles where id=$1 returning id',[primaries[0].authUserId])).rows[0].id;
    return {home,other,unrelated,manager,resident,room,block,floor};
  });
  const options={hostelId:housing.home,deleteHostel:true,deleteManager:false,ban:{amount:2,unit:'days'}};
  const preview=(extra:any={})=>service.preview(founder,{...options,...extra});
  const propose=async(a=second,extra:any={})=>{
    const opts={...options,...extra},p=await service.preview(a,opts);
    return service.propose(a,{...opts,fingerprint:p.fingerprint,reason:'Review property and linked housing access',privateKey:keys[actors.indexOf(a)]});
  };
  const vote=(a:VerifiedActor,id:string,decision='approved')=>service.vote(a,id,{decision,privateKey:keys[actors.indexOf(a)]});
  const row=async(id:string)=>(await db.pool.query('select * from public.admin_proposals where id=$1',[id])).rows[0];
  const status=()=>db.authorizedSystem(founder,['admin'],c=>residenceReviewStatus(c,founder));
  const p=await preview(),both=await preview({deleteManager:true});
  check(p.counts.residences===1&&both.counts.residences===2,'Manager removal expands to the actual other assigned residence');
  check(p.counts.rooms===1&&p.counts.beds===1&&p.counts.allocations===1&&p.counts.room_activation_keys===1,'Preview includes room, bed, allocation and activation-key dependencies');
  check(p.accounts.some((a:any)=>a.id===housing.manager&&a.effect==='retain-sign-in')&&both.accounts.some((a:any)=>a.id===housing.manager&&a.effect==='close-portal'),'Residence-only preserves manager login; combined selection plans portal removal');
  check(p.accounts.some((a:any)=>a.id===housing.resident&&a.effect==='end-housing-access'),'Affected resident access is based on the saved active allocation');
  check(p.primaryOwners.includes(primaries[4].contextId)&&!p.primaryOwners.includes(primaries[0].contextId),'Saved primary owner is resolved without email matching');
  check(!JSON.stringify(p).includes('token_digest')&&!JSON.stringify(p).includes('approval_key_hash')&&!JSON.stringify(p).includes('dependenciesDigest')&&!('resourceIds' in p),'Browser preview excludes raw private dependencies, key hashes and enrollment challenges');
  check(!p.executionAvailable&&p.blockers.length===0,'Actual safe review can open while operational deletion remains gated');
  for(const extra of [{hostelId:'wrong'},{deleteHostel:false},{deleteManager:'yes'},{ban:{amount:-1,unit:'days'}},{ban:{amount:1.5,unit:'days'}},
    {ban:{amount:101,unit:'years'}},{ban:{amount:1,unit:'bad'}},{ban:{amount:1,unit:'days',managerId:housing.manager}},{userId:founder.authUserId}])
    await denied(()=>preview(extra),400,'Invalid options and ownership fields are rejected');
  await denied(()=>preview({hostelId:crypto.randomUUID()}),404,'Missing residence cannot be reviewed');
  for(const key of [settingsKeys[1],keys[0],'wrong-key'])await denied(()=>service.propose(second,{...options,reason:'Review property dependencies',fingerprint:p.fingerprint,privateKey:key}),403,'Settings, foreign and wrong keys cannot consent');
  await denied(()=>service.propose(second,{...options,reason:'Review property dependencies',fingerprint:both.fingerprint,privateKey:keys[1]}),409,'Changed selection cannot reuse another preview');
  const unrelatedPreview=await preview({hostelId:housing.unrelated,deleteManager:true});
  check(unrelatedPreview.blockers.length>0,'Manager removal without an unambiguous assignment is blocked');
  await denied(()=>service.propose(founder,{...options,hostelId:housing.unrelated,deleteManager:true,fingerprint:unrelatedPreview.fingerprint,reason:'Review property dependencies',privateKey:keys[0]}),409,'Incomplete ownership cannot be proposed');
  const opened=await propose();
  check((await row(opened.id)).quorum===2,'Residence review requires two distinct voters');
  const lifetime=await row(opened.id);
  check(new Date(lifetime.expires_at).getTime()-new Date(lifetime.created_at).getTime()===86400000,'Review expiry is stamped exactly 24 hours by PostgreSQL');
  await denied(()=>propose(),409,'Overlapping open review is blocked');
  await denied(()=>vote(second,opened.id),403,'Proposer cannot count twice');
  const results=await Promise.allSettled([vote(third,opened.id),vote(third,opened.id)]);
  check(results.filter(r=>r.status==='fulfilled').length===1&&results.some(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===403),'Concurrent duplicate votes count exactly once');
  check((await row(opened.id)).status==='approved','Two independent non-founder consents reach reviewed approval');
  check((await db.pool.query('select count(*) from public.residences where id=any($1::uuid[])',[[housing.home,housing.other]])).rows[0].count==='2','Approval does not remove either residence');
  for(const sql of ["update public.admin_proposals set status='executed' where id=$1","update public.admin_proposals set reason='changed' where id=$1",
    'update public.admin_proposals set quorum=5 where id=$1',"update public.admin_proposals set kind='pricing' where id=$1",'delete from public.admin_proposals where id=$1',
    "update public.admin_votes set decision='rejected' where proposal_id=$1",'delete from public.admin_votes where proposal_id=$1',
    "update public.admin_proposals set residence_final_reason='forged' where id=$1"])
    await denied(()=>db.system(c=>c.query(sql,[opened.id])),'42501','Native metadata, votes and execution cannot be forged');
  const founderGrant=await db.authorizedSystem(founder,['admin'],c=>checkApprovalKey(c,founder,keys[0]));
  await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await requireApprovalGrant(c,founder,founderGrant);
    await c.query("select set_config('pinevela.residence_confirmation','DELETE APPROVED HOSTEL',true)");return c.query("update public.admin_proposals set status='executed' where id=$1",[opened.id]);
  }),'42501','Even the founder cannot bypass the missing backup/Storage execution protocol');
  await denied(()=>service.execute(founder,opened.id,{privateKey:keys[0],confirmation:'DELETE APPROVED HOSTEL'}),503,'The explicit execute endpoint fails closed');
  await denied(()=>service.rejectFinal(third,opened.id,{privateKey:keys[2],reason:'Keep this residence'}),403,'Another administrator cannot make the founder final decision');
  await service.rejectFinal(founder,opened.id,{privateKey:keys[0],reason:'Keep this residence'});
  const final=await row(opened.id);
  check(final.status==='rejected'&&final.residence_final_by===founder.contextId&&!!final.residence_final_at&&final.residence_final_reason==='Keep this residence','Final rejection stores the founder, reason and native timestamp');
  await denied(()=>service.rejectFinal(founder,opened.id,{privateKey:keys[0],reason:'Repeat this decision'}),409,'Final rejection cannot be replayed');
  const independent=await propose();
  await db.system(c=>c.query("update public.residences set description=description||' ' where id=$1",[housing.unrelated]));
  check((await status()).find(r=>r.id===independent.id)?.status==='pending','Unrelated residence changes preserve current consent');
  await db.system(c=>c.query('update public.rooms set room_number=room_number where id=$1',[housing.room]));
  check((await status()).find(r=>r.id===independent.id)?.status==='pending','No-op dependency writes preserve consent');
  await db.system(c=>c.query("update public.rooms set room_number='2' where id=$1",[housing.room]));
  await db.system(c=>c.query("update public.rooms set room_number='1' where id=$1",[housing.room]));
  check((await status()).find(r=>r.id===independent.id)?.status==='invalidated','A dependency changed and restored permanently invalidates consent');
  await denied(()=>vote(third,independent.id),409,'Stale dependency consent cannot collect another vote');
  const added=await propose();
  const newRoom=(await db.system(c=>c.query("insert into public.rooms(floor_id,room_number) values($1,'2') returning id",[housing.floor]))).rows[0].id;
  await db.system(c=>c.query('delete from public.rooms where id=$1',[newRoom]));
  check((await status()).find(r=>r.id===added.id)?.status==='invalidated','A newly added and removed child record also invalidates consent');
  const ownerChanged=await propose();
  await db.system(c=>c.query('update public.residences set primary_owner_id=$2 where id=$1',[housing.home,primaries[0].authUserId]));
  await db.system(c=>c.query('update public.residences set primary_owner_id=$2 where id=$1',[housing.home,primaries[4].authUserId]));
  check((await status()).find(r=>r.id===ownerChanged.id)?.status==='invalidated','Changed and restored primary ownership invalidates consent');
  const rollback=await propose();
  const thirdGrant=await db.authorizedSystem(third,['admin'],c=>checkApprovalKey(c,third,keys[2]));
  await denied(()=>db.authorizedSystem(third,['admin'],async c=>{await voteResidenceReview(c,third,thirdGrant,rollback.id,'approved');throw new ApiError(409,'Abort the isolated transaction');}),409,'Failed review transaction rolls back all effects');
  check((await row(rollback.id)).status==='pending'&&(await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[rollback.id])).rows[0].count==='1','Rollback preserves pending status and sole proposer vote');
  await vote(third,rollback.id,'rejected');
  check((await row(rollback.id)).status==='rejected','Any independent rejection closes residence review');
  const bothReview=await propose(founder,{deleteManager:true});await vote(second,bothReview.id);
  check((await row(bothReview.id)).status==='approved','Founder plus one other own-key approval satisfies the two-voter rule');
  await vote(third,bothReview.id,'rejected');
  check((await row(bothReview.id)).status==='rejected','Additional reviewed administrator can reject before execution');
  for(const role of ['anon','authenticated','pinevela_backend']){
    check(!(await db.pool.query("select has_function_privilege($1,'private.residence_review_preview(jsonb)','EXECUTE') as allowed",[role])).rows[0].allowed,'Private dependency helper is not a browser or backend RPC');
    await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.residence_review_events');}),'42501','Private lifecycle evidence cannot be read directly');
  }
  await denied(()=>db.system(c=>c.query('update private.residence_review_state set revision=revision+1 where singleton')),'42501','Direct revision forgery is denied');
  await denied(()=>db.system(c=>c.query('delete from private.residence_review_events')),'42501','Lifecycle history cannot be erased');
  await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[founder.sessionId,primaries[0].contextId]));
  await denied(()=>service.preview(primaries[0],options),403,'Primary portal cannot read residence deletion dependencies');
  check((await db.actor(primaries[0],c=>c.query("select * from public.admin_proposals where kind='residence_deletion'"))).rowCount===0,'Primary RLS does not expose deletion proposals');
  await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[founder.sessionId,founder.contextId]));
  const recipients=(await db.pool.query("select distinct r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title like 'Residence deletion%' or n.title='Residence deletion review closed'")).rows.map(r=>r.context_id);
  check(actors.every(a=>recipients.includes(a.contextId))&&primaries.every(a=>!recipients.includes(a.contextId)),'Review state notifications reach genuine admin portals without telling owners a deletion happened');
  check((await db.pool.query('select count(*) from public.registration_bans')).rows[0].count==='0','Review does not impose registration cooldowns before actual execution');
  check((await db.pool.query("select count(*) from public.admin_proposals where kind='residence_deletion' and status='executed'")).rows[0].count==='0','No residence review was executed');
  checks+=await verifyResidencePreparation(db,fixture,housing);
  const native=await propose(founder);
  await denied(()=>db.authorizedSystem(third,['admin'],async c=>{await requireApprovalGrant(c,third,thirdGrant);
    return c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[native.id,second.contextId]);
  }),'42501','A current administrator grant cannot credit another voter');
  await denied(()=>db.system(c=>c.query("insert into public.admin_proposals(kind,proposer_context_id,target_residence_id,preview,baseline_digest,reason,quorum,expires_at) values('residence_deletion',$1,$2,'{}','forged','Review residence',2,clock_timestamp()+interval '24 hours')",[founder.contextId,housing.home])),
    '42501','A direct root proposal still requires a real own-key grant and reviewed snapshot');
  check(!(await db.pool.query("select private.valid_residence_review($1) as valid",[JSON.stringify({...options,deleteHostel:null})])).rows[0].valid,'Native option validation rejects null required selections');
  const changeMembership=async(a:VerifiedActor,active:boolean)=>{
    const grant=await db.authorizedSystem(founder,['admin'],c=>checkApprovalKey(c,founder,keys[0]));
    await db.authorizedSystem(founder,['admin'],c=>setAdministratorActive(c,founder,grant,a.contextId,active));
  };
  await changeMembership(actors[4],false);await changeMembership(actors[4],true);
  check((await status()).find(r=>r.id===native.id)?.status==='invalidated','Changed and restored administrator roster requires fresh residence consent');
  for(const a of actors.slice(1))await changeMembership(a,false);
  const insufficient=await preview();
  check(insufficient.blockers.some((b:string)=>b.includes('two administrators')),'Fewer than two keyed administrators prevents reviewed deletion');
  await denied(()=>service.propose(founder,{...options,fingerprint:insufficient.fingerprint,reason:'Review property dependencies',privateKey:keys[0]}),409,'Native one-admin roster cannot submit a review');
  for(const a of actors.slice(1))await changeMembership(a,true);
  check((await preview()).blockers.length===0,'Restored keyed roster permits a fresh dependency review');
  return checks;
}
