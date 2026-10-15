/** Genuine restored Google subjects, real native dumps/restores and encrypted
 * Storage archives. No live deletion, provider mocks or fabricated Auth state. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';
import {storageCheckpoint,storageArchiveRoot} from './lib/storage-checkpoint.js';
import {attachResidenceRecovery,verifyResidenceRecoveryFiles,recordResidenceRecovery} from './lib/residence-recovery.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {SupabaseResidenceReviews,residenceReviewStatus} from '../supabase/residenceReviews.js';
import {createStorageBackup,readStorageSnapshot,storageRecoveryObjects} from '../supabase/storageBackup.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
import {reserveMedia,finishMedia} from '../supabase/media.js';
import {prepareResidenceCleanup,recordResidenceCleanupPlan} from './lib/residence-cleanup.js';
dotenv.config({quiet:true});const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the newest genuine Auth checkpoint and immutable migration-27 checkpoint.');
const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0];
let checks=0;const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:expected==='error'?error instanceof Error:error?.code===expected,
    `${label} (expected ${expected}; received ${error instanceof ApiError?error.status:error?.code||'success'})`);}
const fingerprintSQL=`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
 'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
const checkpointFiles:string[]=[],storageDirectories:string[]=[];
try{await withIsolatedBackup(backup,async config=>{
 const db=new SupabaseDatabase(config);
 try{
  const before=(await db.pool.query(fingerprintSQL)).rows[0].digest;
  const {actors,keys,manager,home,room,owner,avatarOwner}=await db.system(async c=>{
   const people=(await c.query(`select u.id,s.id as session_id from auth.users u join lateral
    (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
    where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
     and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
    order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 6`)).rows;
   check(people.length===6,'Six genuine Google identities with actual live sessions are available');
   check((await c.query('select count(*) from private.schema_migrations')).rows[0].count==='27','Private test credentials seeded before enrollment guards');
   const actors:VerifiedActor[]=[],keys:string[]=[],primaries:string[]=[];
   for(const [i,p] of people.slice(0,5).entries()){
    await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
    primaries.push((await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id);
    const contextId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[p.id])).rows[0].id;
    await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[contextId,i+1]);
    const key=crypto.randomBytes(32).toString('base64url');keys.push(key);
    await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at) values($1,$2,clock_timestamp())',[contextId,await hashCredentialAsync(`approval:${contextId}:${key}`)]);
    const actor={authUserId:p.id,sessionId:p.session_id,contextId,kind:'admin'};actors.push(actor);
    await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[actor.sessionId,actor.authUserId,contextId]);
   }
   const portraitPerson=people[5];await c.query('select private.initialize_auth_profile($1,null)',[portraitPerson.id]);
   const avatarOwner={authUserId:portraitPerson.id,sessionId:portraitPerson.session_id,kind:'primary',contextId:
    (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[portraitPerson.id])).rows[0].id};
   await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[avatarOwner.sessionId,avatarOwner.authUserId,avatarOwner.contextId]);
   await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[people[3].id,people[4].id]);
   const manager=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[people[3].id,people[4].id])).rows[0].id;
   const home=(await c.query('insert into public.residences(primary_owner_id,name) select $1,display_name from public.profiles where id=$1 returning id',[people[4].id])).rows[0].id;
   await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager,home]);
   const block=(await c.query('insert into public.blocks(residence_id,name) select $1,display_name from public.profiles where id=$2 returning id',[home,people[4].id])).rows[0].id;
   const floor=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[block])).rows[0].id;
   const room=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[floor])).rows[0].id;
   for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000').sort()){
    const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(sql);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
   }
   if(draft)await c.query(fs.readFileSync(draft,'utf8'));
   return {actors,keys,manager,home,room,owner:primaries[4],avatarOwner};
  });
  const service=new SupabaseResidenceReviews(new SupabaseAuth(db)),[founder,second,third]=actors;
  const options={hostelId:home,deleteHostel:true,deleteManager:false,ban:{amount:0,unit:'days'}};
  const propose=async()=>{const p=await service.preview(second,options);return service.propose(second,{...options,fingerprint:p.fingerprint,reason:'Review actual housing before recovery preparation',privateKey:keys[1]});};
  const freeze=async()=>{const p=await propose();await service.vote(third,p.id,{decision:'approved',privateKey:keys[2]});
   await service.prepare(founder,p.id,{privateKey:keys[0],confirmation:'FREEZE APPROVED HOSTEL'});return p.id;};
  const checkpoint=()=>{const result=nativeRecoveryCheckpoint(config,projectRef);checkpointFiles.push(...result.files);return result.id;};
  const archive=async(id:string)=>{const {binding,snapshot}=await storageCheckpoint(id);const storage=new SupabaseStorage();
   const result=await createStorageBackup(storageArchiveRoot(),binding,snapshot,o=>storage.downloadForBackup(o.path,o),()=>db.system(c=>readStorageSnapshot(c)));
   storageDirectories.push(path.join(storageArchiveRoot(),result.id+'.pvstorage'));return result.id;};
  // Classify actual normalized image reservations in native PostgreSQL. Ready
  // fixture metadata is deliberately not provider evidence: the real catalog
  // recovery validator must reject its missing bytes, and fixtures are removed
  // before any archive can authorize a recorded plan.
  const photograph=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),512);
  const assets=[];
  for(const purpose of ['hostel','hostel','hostel','market'] as const){
   const a=await db.authorizedSystem(founder,['admin'],c=>reserveMedia(c,founder,purpose,photograph));assets.push(a);
  }
  assets.push(await db.authorizedSystem(avatarOwner,['primary'],c=>reserveMedia(c,avatarOwner,'avatar',photograph)));
  for(const a of assets.slice(0,2))await db.authorizedSystem(founder,['admin'],c=>finishMedia(c,founder,a.id));
  const outside=(await db.authorizedSystem(founder,['admin'],async c=>{
   await c.query('update public.residences set cover_path=$2,gallery_paths=$3,description=$4 where id=$1',
    [home,'/api/media/'+assets[0].id,['/api/media/'+assets[1].id],'/api/media/'+assets[2].id+' /api/media/'+assets[3].id+' /api/media/'+assets[4].id]);
   return (await c.query("insert into public.residences(primary_owner_id,name,description) select auth_user_id,$2,$3 from public.account_contexts where id=$1 returning id",
    [owner,(await c.query('select display_name from public.profiles where id=$1',[founder.authUserId])).rows[0].display_name,'/api/media/'+assets[1].id])).rows[0].id;
  }));
  const classified=(await db.authorizedSystem(founder,['admin'],c=>c.query("select private.residence_cleanup_candidates(private.residence_review_preview($1::jsonb)->'resources') as plan",[JSON.stringify(options)]))).rows[0].plan;
  check(classified.items.find((x:any)=>x.assetId===assets[0].id)?.decision==='remove','Only exclusive reviewed housing image metadata is removable');
  check(classified.items.find((x:any)=>x.assetId===assets[1].id)?.reason==='shared-reference','Another residence retains its shared image');
  check(classified.items.find((x:any)=>x.assetId===assets[2].id)?.reason==='not-ready','Unfinished reservation is retained');
  check(classified.items.find((x:any)=>x.assetId===assets[3].id)?.reason==='retained-purpose','Marketplace media survives housing cleanup');
  check(classified.items.find((x:any)=>x.assetId===assets[4].id)?.reason==='retained-purpose','Profile photographs survive housing cleanup');
  check(classified.removeCount===1&&classified.retainCount===4,'Exact native image classification counts are derived from saved relationships');
  await denied(async()=>storageRecoveryObjects(await db.system(c=>readStorageSnapshot(c))),'error','Native ready metadata without actual provider bytes cannot establish recovery evidence');
  await db.authorizedSystem(founder,['admin'],async c=>{
   await c.query("update public.residences set cover_path=null,gallery_paths='{}',description='' where id=$1",[home]);
   await c.query("update public.residences set description='' where id=$1",[outside]);
   await c.query('delete from public.media_assets where id=any($1::uuid[])',[assets.map(a=>a.id)]);
  });
  const pre=checkpoint(),preStorage=await archive(pre),proposal=await freeze();
  await denied(()=>verifyResidenceRecoveryFiles(proposal,pre,preStorage),409,'Pre-pause checkpoint cannot establish archived pause');
  const post=checkpoint(),postStorage=await archive(post),verified=await verifyResidenceRecoveryFiles(proposal,post,postStorage);
  check(verified.pause.state==='frozen'&&verified.pause.proposalId===proposal,'Actual restored dump contains this precise frozen preparation');
  check(verified.evidence.objects===0&&verified.evidence.bytes===0,'Actual native Storage catalog is empty; no provider reply is fabricated');
  const counts=async()=>(await db.pool.query(`select (select count(*) from private.residence_recovery_evidence) as receipts,
   (select count(*) from public.notifications where title='Residence preparation backups verified') as notices,
   (select count(*) from private.audit_events where event_type='residence_recovery_verified') as audits`)).rows[0];
  const initial=await counts();
  await denied(()=>db.system(c=>recordResidenceRecovery(c,{...verified,[Object.getOwnPropertySymbols(verified)[0]]:false} as any,projectRef)),409,'Unchecked metadata cannot substitute for archive verification');
  await denied(()=>db.system(c=>recordResidenceRecovery(c,verified,'a'.repeat(20))),409,'Foreign project evidence is rejected');
  await denied(()=>db.system(c=>c.query(`insert into private.residence_recovery_evidence(preparation_id,checkpoint_id,storage_archive_id,project_ref,dump_sha256,
    storage_inventory_digest,native_catalog_digest,manifest_sha256,scope_digest,preparation_created_at,checkpoint_created_at,objects,bytes)
    select preparation_id,checkpoint_id,storage_archive_id,project_ref,dump_sha256,storage_inventory_digest,private.residence_recovery_catalog_digest(),manifest_sha256,
    scope_digest,preparation_created_at,checkpoint_created_at,objects,bytes from jsonb_populate_record(null::private.residence_recovery_evidence,$1)`,[JSON.stringify(verified.evidence)])),'42501','Native direct insert without checked worker evidence fails');
  await denied(()=>db.system(async c=>{await c.query('set transaction isolation level repeatable read');return c.query("update public.rooms set room_number='2' where id=$1",[room]);}),'42501','Older snapshot cannot miss durable freeze');
  await denied(()=>db.system(async c=>{await c.query('set transaction isolation level serializable');return c.query('update private.residence_deletion_preparations set state=state');}),'42501','Preparation writes reject unsupported isolation');
  const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),512);
  const asset=await db.authorizedSystem(actors[0],['admin'],c=>reserveMedia(c,actors[0],'market',image));
  await denied(()=>db.system(c=>recordResidenceRecovery(c,verified,projectRef)),409,'Changed actual media catalog rejects old evidence');
  await db.system(c=>c.query('delete from public.media_assets where id=$1',[asset.id]));
  const manifest=path.join(storageArchiveRoot(),postStorage+'.pvstorage','manifest.pvsb'),original=fs.readFileSync(manifest);
  try{const damaged=Buffer.from(original);damaged[damaged.length-1]^=1;fs.writeFileSync(manifest,damaged);
   await denied(()=>verifyResidenceRecoveryFiles(proposal,post,postStorage),'error','Tampered encrypted manifest fails actual authentication');
  }finally{fs.writeFileSync(manifest,original);}
  await denied(()=>verifyResidenceRecoveryFiles(proposal,post,preStorage),'error','Storage archive cannot swap PostgreSQL binding');
  check(JSON.stringify(initial)===JSON.stringify(await counts()),'Rejected evidence changes no receipt, notice or audit');
  await denied(()=>db.system(async c=>{await recordResidenceRecovery(c,verified,projectRef);throw new ApiError(409,'Abort native receipt transaction');}),409,'Receipt failure rolls back native evidence and notifications');
  check(JSON.stringify(initial)===JSON.stringify(await counts()),'Receipt, targeted notice and audit roll back together');
  const results=await Promise.all([db.system(c=>recordResidenceRecovery(c,verified,projectRef)),db.system(c=>recordResidenceRecovery(c,verified,projectRef))]);
  check(results.filter(r=>r.noChange).length===1,'Competing identical checked evidence records exactly once');
  check(JSON.stringify(await counts())===JSON.stringify({receipts:'1',notices:'1',audits:'1'}),'Exactly one receipt, notification and audit persist');
  const recipientIds=(await db.pool.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Residence preparation backups verified'")).rows.map(r=>r.context_id);
  check(actors.every(a=>recipientIds.includes(a.contextId))&&!recipientIds.includes(owner)&&!recipientIds.includes(manager),'Technical verification status reaches admins only');
  check((await db.pool.query("select actor_context_id from private.audit_events where event_type='residence_recovery_verified'")).rows[0].actor_context_id===null,'Operator verification does not impersonate founder session');
  const status=await db.authorizedSystem(founder,['admin'],c=>residenceReviewStatus(c,founder));
  check(!!status.find(p=>p.id===proposal)?.preparation?.recovery?.verifiedAt&&!status.find(p=>p.id===proposal)?.executionAvailable,'Admin status reports recorded backup and keeps deletion disabled');
  check(!JSON.stringify(status).includes(post)&&!JSON.stringify(status).includes(postStorage)&&!JSON.stringify(status).includes(verified.evidence.dump_sha256),'Browser status excludes private archive bindings and digests');
  for(const role of ['anon','authenticated','pinevela_backend']){
   check(!(await db.pool.query("select has_table_privilege($1,'private.residence_recovery_evidence','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as allowed",[role])).rows[0].allowed,'Private receipt grants remain denied');
   check(!(await db.pool.query("select has_function_privilege($1,'private.residence_recovery_catalog_digest()','EXECUTE') as allowed",[role])).rows[0].allowed,'Recovery helper is not an exposed RPC');
   await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.residence_recovery_evidence');}),'42501','Receipt details cannot be read directly');
  }
  for(const sql of ['update private.residence_recovery_evidence set bytes=bytes+1','delete from private.residence_recovery_evidence','truncate private.residence_recovery_evidence cascade'])
   await denied(()=>db.system(c=>c.query(sql)),'42501','Native recovery history remains immutable');
  const planCounts=async()=>(await db.pool.query(`select (select count(*) from private.residence_cleanup_plans) as plans,
   (select count(*) from public.notifications where title='Residence Storage cleanup planned') as notices,
   (select count(*) from private.audit_events where event_type='residence_cleanup_planned') as audits`)).rows[0];
  const planBefore=await planCounts();
  const nativeProof=(await db.pool.query(`with derived as materialized(select private.residence_cleanup_preview($1::uuid) as plan)
   select jsonb_build_object('preparation_id',$1::uuid,'native_catalog_digest',private.residence_recovery_catalog_digest(),
    'plan',plan,'plan_digest',encode(sha256(convert_to(plan::text,'UTF8')),'hex')) as proof from derived`,[verified.pause.id])).rows[0].proof;
  const insertPlan=`insert into private.residence_cleanup_plans(preparation_id,native_catalog_digest,plan,plan_digest)
   select preparation_id,native_catalog_digest,plan,plan_digest from jsonb_populate_record(null::private.residence_cleanup_plans,$1)`;
  await denied(()=>db.system(c=>c.query(insertPlan,[JSON.stringify(nativeProof)])),'42501','Native insertion without checked operator evidence is rejected');
  const tampered={...nativeProof,plan:{...nativeProof.plan,removeCount:1}};
  await denied(()=>db.system(async c=>{await c.query("select set_config('pinevela.residence_cleanup_checked',$1::jsonb::text,true)",[JSON.stringify(tampered)]);
   return c.query(insertPlan,[JSON.stringify(tampered)]); }),'42501','Even matching caller evidence cannot invent cleanup decisions');
  await denied(()=>db.system(async c=>{await c.query('set transaction isolation level repeatable read');
   return c.query(insertPlan,[JSON.stringify(nativeProof)]); }),'42501','Cleanup planning cannot use an older native snapshot');
  await denied(()=>db.system(c=>recordResidenceCleanupPlan(c,{} as any,projectRef)),409,'Fabricated filesystem proof cannot plan cleanup');
  await denied(()=>db.system(async c=>{await recordResidenceCleanupPlan(c,verified,projectRef);throw new ApiError(409,'Abort plan transaction');}),409,'Native plan failure rolls back plan, notice and audit');
  check(JSON.stringify(planBefore)===JSON.stringify(await planCounts()),'Failed planning leaves exact prior counts');
  const planned=await Promise.all([db.system(c=>recordResidenceCleanupPlan(c,verified,projectRef)),db.system(c=>recordResidenceCleanupPlan(c,verified,projectRef))]);
  check(planned.filter(p=>p.noChange).length===1,'Competing real verified plan requests save once');
  check(JSON.stringify(await planCounts())===JSON.stringify({plans:'1',notices:'1',audits:'1'}),'One durable plan, status notice and operator audit commit');
  const savedPlan=(await db.pool.query('select plan from private.residence_cleanup_plans')).rows[0].plan;
  check(savedPlan.items.length===0&&savedPlan.removeCount===0&&savedPlan.retainCount===0,'Actual empty frozen scope invents no cleanup object');
  const planRecipients=(await db.pool.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Residence Storage cleanup planned'")).rows.map(r=>r.context_id);
  check(actors.every(a=>planRecipients.includes(a.contextId))&&!planRecipients.includes(owner)&&!planRecipients.includes(manager),'Planning status reaches current admins without a false owner deletion notice');
  check((await db.pool.query("select actor_context_id from private.audit_events where event_type='residence_cleanup_planned'")).rows[0].actor_context_id===null,'Planning worker fabricates no founder session');
  const visiblePlan=await db.authorizedSystem(founder,['admin'],c=>residenceReviewStatus(c,founder));
  const displayed=visiblePlan.find(p=>p.id===proposal)?.preparation?.cleanup;
  check(displayed?.plannedAt&&displayed.removeCount===0&&displayed.retainCount===0&&!JSON.stringify(visiblePlan).includes(postStorage),'Administrator status shows plan counts without archive bindings or paths');
  const retried=await prepareResidenceCleanup(db,projectRef,proposal,post,postStorage);
  check(retried.noChange,'Operator restart re-verifies real archives and reconciles the immutable plan');
  for(const role of ['anon','authenticated','pinevela_backend']){
   check(!(await db.pool.query("select has_table_privilege($1,'private.residence_cleanup_plans','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as allowed",[role])).rows[0].allowed,'Private cleanup paths and ownership stay inaccessible');
   check(!(await db.pool.query("select has_function_privilege($1,'private.residence_cleanup_preview(uuid)','EXECUTE') as allowed",[role])).rows[0].allowed,'Cleanup planning is not a callable RPC');
   await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.residence_cleanup_plans');}),'42501','Direct role cannot read private plans');
  }
  for(const sql of ['update private.residence_cleanup_plans set plan=plan','delete from private.residence_cleanup_plans','truncate private.residence_cleanup_plans cascade'])
   await denied(()=>db.system(c=>c.query(sql)),'42501','Native cleanup history cannot be edited or erased');
  const restoredPlan=checkpoint();
  await withIsolatedBackup(restoredPlan,async native=>{const again=new SupabaseDatabase(native);try{
   check((await again.pool.query('select count(*) from private.residence_cleanup_plans')).rows[0].count==='1','Actual encrypted native recovery preserves the cleanup plan');
  }finally{await again.close();}});
  const same=await attachResidenceRecovery(db,projectRef,proposal,post,postStorage);check(same.noChange,'Restarted operator re-verifies actual files and idempotently reconciles receipt');
  const another=await archive(post);await denied(()=>attachResidenceRecovery(db,projectRef,proposal,post,another),409,'Different valid archive cannot replace immutable receipt');
  const reconnected=new SupabaseDatabase(config);try{check((await reconnected.pool.query('select count(*) from private.residence_recovery_evidence')).rows[0].count==='1','Receipt survives a new connection');}finally{await reconnected.close();}
  await service.cancelPreparation(founder,proposal,{privateKey:keys[0],reason:'Resume housing after native recovery rehearsal'});
  await denied(()=>prepareResidenceCleanup(db,projectRef,proposal,post,postStorage),409,'Cancelled pause rejects previous plan proof');
  await denied(()=>db.system(c=>recordResidenceRecovery(c,verified,projectRef)),409,'Cancelled preparation cannot accept old checked evidence');
  const next=await freeze();await denied(()=>verifyResidenceRecoveryFiles(next,post,postStorage),409,'New pause cannot reuse old archived preparation');
  await service.cancelPreparation(founder,next,{privateKey:keys[0],reason:'Resume housing after native recovery rehearsal'});
  check((await db.pool.query('select count(*) from public.residences where id=$1',[home])).rows[0].count==='1','No residence deleted during recovery preparation');
  check((await db.pool.query('select count(*) from public.registration_bans')).rows[0].count==='0','Recovery does not start cooldowns');
  check((await db.pool.query(fingerprintSQL)).rows[0].digest===before,'Real Auth users, identities and sessions remain unchanged');
 }finally{await db.close();}
},{applicationCheckpoint});
 console.log(JSON.stringify({passed:true,checks,actualNativeDumpsAndRestores:true,isolatedRestore:true,cloudRecordsModified:0,cloudObjectsModified:0,authAccountsCreated:0,providerMocks:0,genuineBrowserAcceptancePending:true}));
}catch(error){console.error(JSON.stringify({passed:false,checks,assertion:error instanceof assert.AssertionError?error.message:error instanceof Error?error.message:'native_recovery_failed'}));process.exitCode=1;}
finally{for(const directory of storageDirectories)fs.rmSync(directory,{recursive:true,force:true});for(const file of checkpointFiles)fs.rmSync(file,{force:true});}
