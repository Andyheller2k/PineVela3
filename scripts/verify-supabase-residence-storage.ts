/** Actual provider bytes + isolated native domain records. No mocked provider,
 * fabricated Auth or cloud application accounts. Only two journaled temporary
 * private copies of the supplied cover are uploaded and removed. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabaseResidenceReviews} from '../supabase/residenceReviews.js';
import {checkApprovalKey,requireApprovalGrant} from '../supabase/adminGovernance.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
import {reserveMedia,finishMedia} from '../supabase/media.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {createStorageBackup,readStorageSnapshot,storageSnapshotDigest} from '../supabase/storageBackup.js';
import {storageCheckpoint,storageArchiveRoot} from './lib/storage-checkpoint.js';
import {prepareResidenceCleanup} from './lib/residence-cleanup.js';
import {executeResidenceCore,verifyResidenceExecutionFiles} from './lib/residence-execution.js';
import {claimResidenceStorageTask,prepareResidenceStorageTask,removePreparedResidenceStorageTask,completeResidenceStorageTask,failResidenceStorageTask} from './lib/residence-storage-worker.js';
dotenv.config({quiet:true});
const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass genuine Auth and immutable migration-27 checkpoints.');
const suffix='_reviewed_residence_storage_worker.sql';
const generated=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix));
const file=draft||path.join('supabase/migrations',generated!);
const sql=fs.readFileSync(file,'utf8'),projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0];
const temporary:string[]=[],storageDirectories:string[]=[],uploaded:{path:string;journal:string}[]=[];
let checks=0,stage='baseline',uncertainUpload=false;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
 check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,
 `${label}: expected ${expected}, received ${error instanceof ApiError?error.status:error?.code||'success'}`);}
const fingerprint=`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
 'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
const storage=new SupabaseStorage(),cloud=new SupabaseDatabase();
const env=dotenv.parse(fs.readFileSync('.env'));
const source=new URL(env.DATABASE_URL||env.SUPABASE_DB_URL),pgEnv={...process.env,PGHOST:source.hostname,PGPORT:'5432',PGUSER:decodeURIComponent(source.username),
 PGPASSWORD:decodeURIComponent(source.password),PGDATABASE:source.pathname.slice(1),PGSSLMODE:'verify-full',PGSSLROOTCERT:env.SUPABASE_DB_CA_FILE,PGCONNECT_TIMEOUT:'15'};
/** Real catalog replication by pg_dump/pg_restore, never fabricated Storage rows.
 * DELETEs happen only through the actual API before restoring its observed result. */
function refreshStorage(config:any){
 check(String(config.host).startsWith('/tmp/pv-orders-')&&config.user==='pv_restore'&&config.ssl===false,'Storage catalog restoration is confined to a disposable local database');
 const dump=spawnSync('/usr/lib/postgresql/18/bin/pg_dump',['--format=custom','--no-owner','--schema=storage'],{env:pgEnv,timeout:120000,maxBuffer:16*1024*1024});
 if(dump.status!==0||!dump.stdout.subarray(0,5).equals(Buffer.from('PGDMP')))throw new Error('Actual provider catalog dump failed.');
 const restored=spawnSync('/usr/lib/postgresql/18/bin/pg_restore',['--dbname=postgres','--clean','--if-exists','--no-owner','--single-transaction'],
  {input:dump.stdout,env:{...process.env,PGHOST:config.host,PGPORT:String(config.port),PGDATABASE:'postgres',PGUSER:'pv_restore',PGPASSWORD:'',PGSSLMODE:'disable'},timeout:60000,maxBuffer:8*1024*1024});
 dump.stdout.fill(0);if(restored.status!==0)throw new Error('Actual provider catalog isolated restoration failed.');
}
function journal(file:string,state:string,objectPath:string){
 const next=file+'.next',fd=fs.openSync(next,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify({purpose:'residence-storage-acceptance',state,objectPath,time:new Date().toISOString()}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(next,file);
}
async function restoreStorageGuards(db:SupabaseDatabase){
 await db.system(c=>c.query(`do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='zz_residence_queued_storage_guard') then
   create trigger zz_residence_queued_storage_guard before insert or update or delete on storage.objects for each row execute function private.residence_queued_storage_guard();
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='residence_queued_storage_truncate') then
   create trigger residence_queued_storage_truncate before truncate on storage.objects for each statement execute function private.residence_queued_storage_guard();
  end if;
 end;$$;`));
}
let baseline:any,cloudAuth:string;
try{
 baseline=await cloud.system(c=>readStorageSnapshot(c));cloudAuth=(await cloud.pool.query(fingerprint)).rows[0].digest;
 check(baseline.objects.length===0&&baseline.assets.length===0,'Real provider acceptance starts from an honestly empty catalog');
 await withIsolatedBackup(backup,async config=>{
  const db=new SupabaseDatabase(config);
  try{
  const originalAuth=(await db.pool.query(fingerprint)).rows[0].digest;
  const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),2048);
  const {admins,keys,manager,owner,home}=await db.system(async c=>{
   check((await c.query('select count(*) from private.schema_migrations')).rows[0].count==='27','Seed private domain credentials before enrollment guards');
   const people=(await c.query(`select u.id,u.email,u.email_confirmed_at,s.id as session_id from auth.users u join lateral
    (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
    where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id
     and i.provider='google' and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
    order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 5`)).rows;
   check(people.length===5,'Five genuine Google subjects keep their actual native sessions');
   const primaries:VerifiedActor[]=[],admins:VerifiedActor[]=[],keys:string[]=[];
   for(const [i,p] of people.entries()){
    await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
    primaries.push({authUserId:p.id,sessionId:p.session_id,kind:'primary',contextId:
     (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id});
    if(i<2){
     const a={...primaries[i],kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[p.id])).rows[0].id};
     admins.push(a);await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[a.contextId,i+1]);
     const key=crypto.randomBytes(32).toString('base64url');keys.push(key);
     await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at) values($1,$2,clock_timestamp())',
      [a.contextId,await hashCredentialAsync(`approval:${a.contextId}:${key}`)]);
    }
   }
   async function context(i:number,kind:string,parent:VerifiedActor){
    if(['manager','resident','staff'].includes(kind))await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[people[i].id,parent.authUserId]);
    return {...primaries[i],kind,contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,$3,'active') returning id",[people[i].id,parent.authUserId,kind])).rows[0].id};
   }
   const owner=primaries[0],manager=await context(2,'manager',owner),resident=await context(3,'resident',primaries[1]),
    staff=await context(4,'staff',owner),officer=await context(1,'officer',primaries[1]);
   for(const a of [...admins,manager,resident,staff])await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
   const home=(await c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1 returning id',[owner.authUserId])).rows[0].id;
   await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager.contextId,home]);
   const block=(await c.query("insert into public.blocks(residence_id,name) values($1,'Native housing reference verification') returning id",[home])).rows[0].id;
   const floor=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[block])).rows[0].id;
   const room=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[floor])).rows[0].id;
   const bed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[room])).rows[0].id;
   const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id',[resident.contextId,room,bed])).rows[0].id;
   const assignment=(await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id) values($1,$2,$3) returning id',[staff.contextId,home,manager.contextId])).rows[0].id;
   const caseId=(await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values($1,$2,'manager_registration','inspection_pending') returning id",[manager.contextId,home])).rows[0].id;
   const nullableCase=(await c.query("insert into public.verification_cases(applicant_context_id,kind,status) values($1,'residence_registration','submitted') returning id",[manager.contextId])).rows[0].id;
   const inspection=(await c.query('insert into public.verification_inspections(case_id,officer_context_id) values($1,$2) returning id',[caseId,officer.contextId])).rows[0].id;
   const issue=(await c.query("insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,assigned_staff_id,title,status,accepted_at) values($1,$2,$3,$4,$5,'Native housing reference verification','accepted',clock_timestamp()) returning id",[home,room,resident.contextId,allocation,assignment])).rows[0].id;
   const enrollment=(await c.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,
    token_digest,auth_user_id,linked_context_id,room_id,residence_id,status,verified_at,expires_at)
    values($1,$2,'resident',$3,$4,$5,$6,$7,$8,'completed',$9,clock_timestamp()+interval '1 day') returning id`,
    [primaries[1].contextId,primaries[1].authUserId,people[3].email.toLowerCase(),crypto.randomBytes(32).toString('hex'),resident.authUserId,resident.contextId,room,home,people[3].email_confirmed_at])).rows[0].id;
   const invitation=(await c.query(`insert into private.account_enrollments(initiator_context_id,kind,invited_email,
    token_digest,residence_id,expires_at) values($1,'staff',$2,$3,$4,clock_timestamp()+interval '1 day') returning id`,
    [manager.contextId,people[1].email.toLowerCase(),crypto.randomBytes(32).toString('hex'),home])).rows[0].id;
   const blank=(await c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1 returning id',[owner.authUserId])).rows[0].id;
   await c.query("insert into public.blocks(residence_id,name) values($1,'Native frozen reference verification')",[blank]);
   await c.query('insert into public.floors(block_id,floor_number) select id,0 from public.blocks where residence_id=$1',[blank]);
   for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000'&&!f.endsWith(suffix)&&(!generated||f.slice(0,14)<generated.slice(0,14))).sort()){
    const text=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(text);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(text).digest('hex')]);
   }
   // These are reservations for actual supplied bytes, not fake ready/provider objects.
   for(const [a,purpose,inspectionId,allocationId,issueId] of [[officer,'inspection',inspection,null,null],
    [resident,'maintenance',null,allocation,null],[staff,'repair',null,null,issue]] as const){
    const id=crypto.randomUUID();await c.query(`insert into public.media_assets(id,owner_context_id,owner_auth_user_id,purpose,
     inspection_id,residence_id,allocation_id,issue_id,object_path,byte_size,sha256)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,a.contextId,a.authUserId,purpose,inspectionId,
      purpose==='inspection'?null:home,allocationId,issueId,`contexts/${a.contextId}/${id}.png`,image.length,crypto.createHash('sha256').update(image).digest('hex')]);
   }
   return {admins,keys,manager,owner,resident,officer,staff,home,floor,room,allocation,caseId,inspection,issue,nullableCase,enrollment,invitation,blank};
  });
  image.fill(0);
  await db.system(c=>c.query("delete from public.media_assets where state='reserved'"));
  stage='migration';
  await denied(()=>db.system(async c=>{await c.query(sql);throw new ApiError(409,'Abort Storage worker DDL');}),409,'Storage worker DDL abort rolls back atomically');
  check((await db.pool.query("select to_regclass('private.residence_storage_cleanup_attempts') as target")).rows[0].target===null,'No partial cleanup protocol survives aborted DDL');
  await db.system(async c=>{await c.query(sql);if(!draft)await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[path.basename(file).slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);});
  if(!draft)await db.system(async c=>{
   for(const later of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>path.basename(file).slice(0,14)).sort()){
    const text=fs.readFileSync('supabase/migrations/'+later,'utf8');await c.query(text);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[later.slice(0,14),crypto.createHash('sha256').update(text).digest('hex')]);
   }
  });
  // A small genuine copy exercises identical ownership, hash, archive and API
  // behavior without making slow verification uploads depend on a large payload.
  const supplied=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),512);
  const assets:any[]=[];
  stage='actual-provider-upload';
  for(let i=0;i<2;i++){
   const asset=await db.authorizedSystem(manager,['manager'],c=>reserveMedia(c,manager,'hostel',supplied));assets.push(asset);
   const log=path.join(storageArchiveRoot(),asset.id+'.worker-provider-check.json');uploaded.push({path:asset.object_path,journal:log});
   journal(log,'prepared',asset.object_path);
   check(await storage.objectInfo(asset.object_path)===null,'The generated temporary object does not already exist');
   await storage.upload(asset.object_path,supplied);journal(log,'uploaded',asset.object_path);
   const info=await storage.objectInfo(asset.object_path);check(info?.name===asset.object_path,'Actual Storage object-info returns the uploaded private object');
   const download=await storage.download(asset.object_path,{byte_size:supplied.length,sha256:asset.sha256});
   check(download.equals(supplied),'Actual provider bytes match the supplied cover image');download.fill(0);
  }supplied.fill(0);
  refreshStorage(config);
  await restoreStorageGuards(db);
  for(const asset of assets)await db.authorizedSystem(manager,['manager'],c=>finishMedia(c,manager,asset.id));
  await db.authorizedSystem(manager,['manager'],c=>c.query('update public.residences set cover_path=$2,gallery_paths=$3 where id=$1',[home,'/api/media/'+assets[0].id,['/api/media/'+assets[1].id]]));
  await db.system(c=>c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data) values($1,'retained_photo_evidence','media_asset',$2,$3)",
   [manager.contextId,assets[1].id,JSON.stringify({pictureUrl:'/api/media/'+assets[1].id})]));
  const service=new SupabaseResidenceReviews(new SupabaseAuth(db)),founder=admins[0],second=admins[1];
  const options={hostelId:home,deleteHostel:true,deleteManager:false,ban:{amount:0,unit:'days'}};
  const preview=await service.preview(second,options);
  const proposal=await service.propose(second,{...options,fingerprint:preview.fingerprint,reason:'Verify actual archived bytes, reviewed cleanup and retained references',privateKey:keys[1]});
  await service.vote(founder,proposal.id,{decision:'approved',privateKey:keys[0]});
  await service.prepare(founder,proposal.id,{privateKey:keys[0],confirmation:'FREEZE APPROVED HOSTEL'});
  stage='actual-encrypted-recovery';
  const checkpoint=nativeRecoveryCheckpoint(config,projectRef);temporary.push(...checkpoint.files);
  const {binding,snapshot}=await storageCheckpoint(checkpoint.id);
  const archive=await createStorageBackup(storageArchiveRoot(),binding,snapshot,o=>storage.downloadForBackup(o.path,o),()=>db.system(c=>readStorageSnapshot(c)));
  storageDirectories.push(path.join(storageArchiveRoot(),archive.id+'.pvstorage'));
  check(archive.objects===2,'The encrypted archive contains both actual provider photographs');
  const plan=await prepareResidenceCleanup(db,projectRef,proposal.id,checkpoint.id,archive.id);
  check(plan.removeCount===1&&plan.retainCount===1,'Only the exclusive photo is approved; retained audit evidence preserves the other photo');
  await service.authorizeExecution(founder,proposal.id,{privateKey:keys[0],confirmation:'AUTHORIZE APPROVED HOSTEL'});
  const grant=await db.authorizedSystem(founder,['admin'],async c=>{const g=await checkApprovalKey(c,founder,keys[0]);await requireApprovalGrant(c,founder,g);return g;});
  const verified=await verifyResidenceExecutionFiles(db,founder,grant,proposal.id);
  stage='actual-nonempty-execution';
  const execution=await db.authorizedSystem(founder,['admin'],c=>executeResidenceCore(c,founder,grant,verified,projectRef),false,false,true);
  check(execution.cleanupTasks===1&&execution.storageCleanup==='queued','Actual nonempty execution queues only the approved exclusive object');
  check((await db.pool.query('select state from public.media_assets where id=$1',[assets[0].id])).rows[0].state==='removing','The native media timestamp update is admitted during exact execution');
  check((await db.pool.query('select state from public.media_assets where id=$1',[assets[1].id])).rows[0].state==='ready','The shared image retains its ready metadata and bytes');
  for(const query of ["update public.media_assets set state='failed' where id=$1",'delete from public.media_assets where id=$1'])
   await denied(()=>db.system(c=>c.query(query,[assets[0].id])),'42501','Generic reconciliation cannot mutate queued media history');
  await denied(()=>db.system(c=>c.query("insert into private.audit_events(event_type,event_data) values('new_photo_reference',$1)",[JSON.stringify({pictureUrl:'/api/media/'+assets[0].id})])),'42501','Queued images cannot acquire new retained references');
  await denied(()=>db.system(c=>c.query('update storage.objects set name=name where name=$1',[assets[0].object_path])),'42501','Direct native rewrites of queued provider metadata are denied');
  await denied(()=>db.system(c=>c.query('delete from storage.objects where name=$1',[assets[0].object_path])),'42501','Provider metadata cannot be erased without a prepared cleanup lease');
  await denied(()=>db.system(c=>c.query('truncate storage.objects cascade')),'42501','Queued object catalog cannot be erased by native truncation');
  check((await db.pool.query("select count(*) from public.media_assets m where m.state<>'ready' and not exists(select 1 from private.residence_storage_cleanup_tasks t where t.asset_id=m.id)")).rows[0].count==='0','Ordinary interrupted-upload reconciliation excludes reviewed jobs');
  await denied(()=>claimResidenceStorageTask(db,assets[1].id),'42501','A retained shared photograph cannot be claimed for cleanup');
  stage='claim-and-retry';
  await denied(()=>db.system(async c=>{
   await c.query('create table private.cleanup_dependency_probe(id uuid primary key)');
   return c.query('select private.claim_residence_storage_cleanup($1)',[assets[0].id]);
  }),'42501','An unknown unguarded relation blocks cleanup admission');
  await denied(()=>db.system(async c=>{
   await c.query('alter table private.audit_events disable trigger zz_residence_queued_reference_guard');
   return c.query('select private.claim_residence_storage_cleanup($1)',[assets[0].id]);
  }),'42501','Disabled reference protection blocks cleanup admission');
  const simultaneous=await Promise.all([claimResidenceStorageTask(db,assets[0].id),claimResidenceStorageTask(db,assets[0].id)]);
  check(simultaneous.filter(Boolean).length===1,'Two concurrent native workers receive exactly one claim');
  const first=simultaneous.find(Boolean)!;check(first?.state==='claimed','Exact native job receives a durable claim');
  check(await claimResidenceStorageTask(db,assets[0].id)===null,'A concurrent worker cannot acquire the same live job');
  await denied(()=>db.system(c=>c.query("update private.residence_storage_cleanup_attempts set state='completed' where id=$1",[first!.id])),'42501','Claim alone cannot invent completed provider removal');
  await failResidenceStorageTask(db,first!,'verification_failed');
  check((await db.pool.query('select state from private.residence_storage_cleanup_attempts where id=$1',[first!.id])).rows[0].state==='failed','Interrupted verification records a bounded retryable failure');
  const retry=await claimResidenceStorageTask(db,assets[0].id);check(!!retry&&retry.id!==first!.id&&retry.token!==first!.token,'A retry receives a new native lease while retaining earlier history');
  await denied(()=>completeResidenceStorageTask(db,{} as any),409,'Caller JSON cannot substitute actual provider absence');
  stage='prepared-removal';
  const work=await prepareResidenceStorageTask(db,retry!);
  await denied(()=>db.system(async c=>{await c.query("select set_config('pinevela.residence_cleanup_token',$1,true)",[first!.token]);return c.query("update private.residence_storage_cleanup_attempts set state='completed' where id=$1",[retry!.id]);}),'42501','An old lease cannot finish the current attempt');
  const absence=await removePreparedResidenceStorageTask(db,work);
  journal(uploaded[0].journal,'worker_removed',assets[0].object_path);
  check(await storage.objectInfo(assets[0].object_path)===null,'Actual Storage API deletion is independently observed as missing');
  check(!!await storage.objectInfo(assets[1].object_path),'The shared provider object is still present');
  // Local PostgreSQL is separate from the cloud Storage service. Restore only its
  // actual resulting catalog before native completion; no mock disappearance.
  refreshStorage(config);
  await restoreStorageGuards(db);
  stage='actual-lease-expiry';
  const delay=(await db.pool.query('select greatest(0,ceil(extract(epoch from expires_at-clock_timestamp())*1000))::integer as ms from private.residence_storage_cleanup_attempts where id=$1',[retry!.id])).rows[0].ms;
  console.log(JSON.stringify({phase:stage,waitingForActualNativeExpiry:true}));
  await new Promise(resolve=>setTimeout(resolve,delay+500));
  await denied(()=>completeResidenceStorageTask(db,absence),'42501','A genuinely expired lease cannot fabricate completion after provider removal');
  const recoveredLease=await claimResidenceStorageTask(db,assets[0].id);
  check(!!recoveredLease&&recoveredLease.id!==retry!.id,'A restarted worker acquires a fresh lease after actual expiry');
  check((await db.pool.query('select state from private.residence_storage_cleanup_attempts where id=$1',[retry!.id])).rows[0].state==='expired','Expired interrupted work remains in native history');
  const missingWork=await prepareResidenceStorageTask(db,recoveredLease!);
  const missingAgain=await removePreparedResidenceStorageTask(db,missingWork);
  const completed=await completeResidenceStorageTask(db,missingAgain);check(completed.providerAbsenceVerified,'A new worker verifies actual absence and completes without replaying deletion');
  check(await claimResidenceStorageTask(db,assets[0].id)===null,'Completed cleanup never replays removal');
  check((await db.pool.query('select count(*) from private.residence_storage_cleanup_attempts where asset_id=$1 and state=$2',[assets[0].id,'completed'])).rows[0].count==='1','Exactly one native completion receipt exists');
  for(const role of ['anon','authenticated','pinevela_backend']){
   check(!(await db.pool.query('select has_table_privilege($1,$2,$3) as allowed',[role,'private.residence_storage_cleanup_attempts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'])).rows[0].allowed,'Direct roles cannot read or mutate cleanup leases');
   for(const fn of ['claim_residence_storage_cleanup(uuid)','residence_cleanup_unshared(uuid)','residence_cleanup_task_valid(uuid)','residence_cleanup_attempt_guard()','residence_queued_storage_guard()','residence_queued_reference_guard()','residence_queued_media_guard()'])
    check(!(await db.pool.query('select has_function_privilege($1,$2,$3) as allowed',[role,'private.'+fn,'EXECUTE'])).rows[0].allowed,'Cleanup helpers have no public/browser/backend RPC exposure');
  }
  await denied(()=>db.system(c=>c.query('delete from private.residence_storage_cleanup_attempts')),'42501','Cleanup attempt history cannot be erased');
  await denied(()=>db.system(c=>c.query('truncate private.residence_storage_cleanup_attempts')),'42501','Cleanup attempt history cannot be truncated');
  check((await db.pool.query(fingerprint)).rows[0].digest===originalAuth,'All genuine Auth users, identities and sessions remain unchanged');
  stage='post-cleanup-recovery';
  const post=nativeRecoveryCheckpoint(config,projectRef);temporary.push(...post.files);
  await withIsolatedBackup(post.id,async restored=>{
   const recovered=new SupabaseDatabase(restored);try{
    check((await recovered.pool.query('select count(*) from private.residence_storage_cleanup_attempts where state=$1',['completed'])).rows[0].count==='1','Actual encrypted full restoration preserves the cleanup completion receipt');
    check((await recovered.pool.query('select count(*) from private.residence_storage_cleanup_tasks')).rows[0].count==='1','Actual restoration preserves approved media history');
   }finally{await recovered.close();}
  });
  }finally{await db.close();}
 },{applicationCheckpoint});
}catch(error){
 uncertainUpload=stage==='actual-provider-upload'&&error instanceof ApiError&&['storage_timeout','storage_transport'].includes(error.code||'');
 const diagnostic=path.join('.security/migration-reset',crypto.randomUUID()+'.storage-worker-failure.log');
 fs.writeFileSync(diagnostic,error instanceof Error?error.stack||error.message:'Storage worker failed',{mode:0o600});
 console.error(JSON.stringify({passed:false,checks,stage,diagnostic,
  status:error instanceof ApiError?error.status:undefined,
  code:error instanceof ApiError?error.code:(error as any)?.code}));process.exitCode=1;
}finally{
 // A timed-out upload can still commit after the client stops waiting. Give it
 // a bounded settling interval, then reconcile its exact journaled path again.
 if(uncertainUpload&&uploaded.length)await new Promise(resolve=>setTimeout(resolve,30000));
 for(const object of uploaded){try{
  await storage.remove(object.path);
  if(await storage.objectInfo(object.path))throw new Error('Temporary cleanup is not confirmed.');
  journal(object.journal,uncertainUpload?'cleanup_observed_after_timeout':'cleaned',object.path);
 }catch{console.error(JSON.stringify({temporaryObjectCleanupPending:true,journalRetainedPrivately:true}));process.exitCode=1;}}
 if(baseline){check(storageSnapshotDigest(await cloud.system(c=>readStorageSnapshot(c)))===storageSnapshotDigest(baseline),'The actual cloud Storage catalog returns to its original baseline');
 check((await cloud.pool.query(fingerprint)).rows[0].digest===cloudAuth!,'No cloud Auth records change during provider acceptance');}
 await cloud.close();for(const file of temporary)fs.rmSync(file,{force:true});for(const dir of storageDirectories)fs.rmSync(dir,{recursive:true,force:true});
}
if(!process.exitCode)console.log(JSON.stringify({passed:true,checks,providerMocks:0,authAccountsCreated:0,cloudApplicationRecordsChanged:0,temporaryPrivateObjectsRemoved:uploaded.length,actualProviderCleanupVerified:true,isolatedDomainExecution:true,publicExecutionEnabled:false}));
