/** Native retained housing links on genuine backed-up identities.
 * Image metadata uses actual supplied bytes; this does not upload to a provider.
 * All domain records stay in disposable local PostgreSQL restores. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabaseResidenceReviews} from '../supabase/residenceReviews.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
dotenv.config({quiet:true});
const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the genuine Auth checkpoint and immutable migration-27 application checkpoint.');
const suffix='_retained_housing_media_enrollment_targets.sql';
const generated=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix));
const file=draft||path.join('supabase/migrations',generated!);
const sql=fs.readFileSync(file,'utf8'),temporary:string[]=[];
let checks=0,stage='fixture';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
 check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,
  `${label}: expected ${expected}, received ${error instanceof ApiError?error.status:error?.code||'success'}${error?.constraint?' constraint='+error.constraint:''}${error?.code==='42601'?' '+error.message:''}`);}
const fingerprint=`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
 'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
 'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
try{await withIsolatedBackup(backup,async config=>{
 const db=new SupabaseDatabase(config);
 try{
  const originalAuth=(await db.pool.query(fingerprint)).rows[0].digest;
  const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),2048);
  const {admins,keys,manager,owner,resident,officer,staff,home,floor,room,allocation,caseId,inspection,issue,nullableCase,enrollment,blank}=await db.system(async c=>{
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
   return {admins,keys,manager,owner,resident,officer,staff,home,floor,room,allocation,caseId,inspection,issue,nullableCase,enrollment,blank};
  });image.fill(0);
  const records=async()=>(await db.pool.query(`select jsonb_build_object('media',(select jsonb_agg(to_jsonb(t) order by id) from public.media_assets t),
   'enrollments',(select jsonb_agg(to_jsonb(t) order by id) from private.account_enrollments t)) as saved`)).rows[0].saved;
  const saved=await records();stage='migration';
  await denied(()=>db.system(async c=>{
   await c.query(sql);
   await denied(()=>db.system(async writer=>{
    await writer.query("set local lock_timeout='150ms'");
    return writer.query("insert into public.rooms(floor_id,room_number) values($1,'3')",[floor]);
   }),'55P03','Concurrent direct native writer cannot race migration backfill/capture installation');
   await denied(()=>db.system(async writer=>{
    await writer.query("set local lock_timeout='150ms'");
    return writer.query("select pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0))");
   }),'55P03','Normal housing writer waits for migration admission before table locks');
   throw new ApiError(409,'Abort isolated reference DDL');
  }),409,'DDL abort rolls back atomically');
  check((await db.pool.query("select to_regclass('private.housing_reference_targets') as target")).rows[0].target===null,'Aborted DDL leaves no partial private history');
  check((await db.pool.query("select count(*) from pg_constraint where conrelid='public.media_assets'::regclass and confrelid in('public.allocations'::regclass,'public.verification_inspections'::regclass,'public.maintenance_issues'::regclass,'public.residences'::regclass)")).rows[0].count==='4','Original media FKs survive aborted DDL');
  await db.system(async c=>{await c.query(sql);if(!draft)await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[path.basename(file).slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);});
  if(!draft)await db.system(async c=>{
   for(const name of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>generated!.slice(0,14)).sort()){
    const text=fs.readFileSync('supabase/migrations/'+name,'utf8');await c.query(text);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[name.slice(0,14),crypto.createHash('sha256').update(text).digest('hex')]);
   }
  });
  check(JSON.stringify(await records())===JSON.stringify(saved),'Existing media/enrollment bytes, source IDs, ownership and status are unchanged');
  const targets=async()=>(await db.pool.query('select * from private.housing_reference_targets order by kind,id')).rows;
  const captured=await targets();
  check(captured.length===6&&new Set(captured.map(t=>t.kind)).size===5,'Only six actual source rows of five active housing kinds are captured');
  check(captured.every(t=>Date.parse(t.captured_at)<=Date.now()),'Capture time uses actual native time');
  for(const [id,kind,parent] of [[room,'room',null],[allocation,'allocation',room],[caseId,'verification_case',null],
   [inspection,'inspection',caseId],[issue,'maintenance_issue',allocation]] as const){
   const t=captured.find(t=>t.id===id);check(t&&t.kind===kind&&t.residence_id===home&&t.parent_id===parent,'Captured kind/home/parent match actual original relationships');
  }
  check(captured.find(t=>t.id===nullableCase)?.residence_id===null,'Legal nullable verification-case residence remains nullable without guessed metadata');
  check((await db.pool.query(`select count(*) from pg_constraint where contype='f'
   and conrelid in('public.media_assets'::regclass,'private.account_enrollments'::regclass)
   and confrelid in('private.housing_reference_targets'::regclass,'private.residence_history_targets'::regclass)
   and confdeltype='a'`)).rows[0].count==='6','All six historical media/enrollment FKs remain enforced with no cascade/nulling');
  for(const role of ['anon','authenticated','pinevela_backend']){
   check(!(await db.pool.query("select has_table_privilege($1,'private.housing_reference_targets','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as allowed",[role])).rows[0].allowed,'Retained housing identifiers have no direct role grants');
   await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.housing_reference_targets');}),'42501','Direct role cannot read private retained metadata');
   for(const fn of ['housing_reference_source(text,uuid)','housing_reference_target_guard()','capture_housing_reference_target()',
    'housing_reference_identity_guard()','housing_reference_truncate_guard()','housing_media_live_target_guard()','enrollment_live_housing_target_guard()'])
    check(!(await db.pool.query("select has_function_privilege($1,$2,'EXECUTE') as allowed",[role,'private.'+fn])).rows[0].allowed,'No retained metadata or deletion helper becomes a browser RPC');
  }
  check((await db.pool.query("select relrowsecurity from pg_class where oid='private.housing_reference_targets'::regclass")).rows[0].relrowsecurity,'Private reference table has RLS');
  check((await db.pool.query("select count(*) from pg_proc where pronamespace='private'::regnamespace and proname in('housing_reference_source','housing_reference_target_guard','capture_housing_reference_target','housing_reference_identity_guard','housing_reference_truncate_guard','housing_media_live_target_guard','enrollment_live_housing_target_guard') and prosecdef")).rows[0].count==='0','New functions preserve invoker security');
  stage='native-boundaries';
  for(const statement of ['update private.housing_reference_targets set kind=kind','delete from private.housing_reference_targets','truncate private.housing_reference_targets cascade'])
   await denied(()=>db.system(c=>c.query(statement)),'42501','Native retained history cannot be rewritten or erased');
  await denied(()=>db.system(c=>c.query("insert into private.housing_reference_targets(id,kind,residence_id,parent_id) values($1,'room',$2,null)",[crypto.randomUUID(),home])),'42501','Invented identifier cannot borrow a real residence');
  await denied(()=>db.system(c=>c.query("insert into private.housing_reference_targets(id,kind,residence_id,parent_id) values($1,'allocation',$2,$3)",[allocation,blank,room])),'42501','Forged residence metadata cannot overwrite a real allocation');
  await denied(()=>db.system(c=>c.query("insert into private.housing_reference_targets(id,kind,residence_id,parent_id) values($1,'inspection',$2,$3)",[inspection,home,nullableCase])),'42501','Forged parent cannot borrow a genuine inspection');
  for(const [table,id] of [['rooms',room],['allocations',allocation],['verification_inspections',inspection],['maintenance_issues',issue]] as const){
   await denied(()=>db.system(c=>c.query('delete from public.'+table+' where id=$1',[id])),'42501','Retained FKs do not enable unreviewed bound-source deletion');
   await denied(()=>db.system(c=>c.query('truncate public.'+table+' cascade')),'42501','TRUNCATE cannot bypass bound-source deletion gate');
   await denied(()=>db.system(c=>c.query('update public.'+table+' set id=$2 where id=$1',[id,crypto.randomUUID()])),'42501','Public source identity cannot be rewritten');
  }
  await denied(()=>db.system(c=>c.query('delete from public.residences where id=$1',[home])),'42501','Residence deletion remains disabled');
  await denied(()=>db.system(async c=>{await c.query("select set_config('pinevela.residence_execution_confirmation','AUTHORIZE APPROVED HOSTEL',true)");
   return c.query('delete from public.verification_inspections where id=$1',[inspection]);}),'42501','Caller-set execution configuration cannot open source deletion');
  await denied(()=>db.system(c=>c.query('update public.media_assets set allocation_id=null where allocation_id=$1',[allocation])),'23514','Media origins remain immutable');
  const transient=(await db.system(c=>c.query("insert into public.rooms(floor_id,room_number) values($1,'2') returning id",[floor]))).rows[0].id;
  check((await targets()).some(t=>t.id===transient),'New room captures its actual identifier atomically');
  await db.system(c=>c.query('delete from public.rooms where id=$1',[transient]));
  check((await targets()).some(t=>t.id===transient),'Ordinary unbound room cleanup retains original identity');
  await denied(()=>db.system(c=>c.query("insert into public.rooms(id,floor_id,room_number) values($1,$2,'2')",[transient,floor])),'23505','Deleted historical room UUID cannot be reused');
  await denied(()=>db.system(c=>c.query('update private.account_enrollments set room_id=$2 where id=$1',[enrollment,transient])),'42501','Retained room identity cannot authorize a new enrollment binding');
  const beforeRollback=(await targets()).length;
  await denied(()=>db.system(async c=>{await c.query("insert into public.rooms(floor_id,room_number) values($1,'3')",[floor]);throw new ApiError(409,'Abort actual room insertion');}),409,'Aborted source creation rolls back its capture');
  check((await targets()).length===beforeRollback,'No orphan reference remains after rollback');
  await denied(()=>db.authorizedSystem(manager,['manager'],async c=>{
   const createdRoom=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'3') returning id",[floor])).rows[0].id;
   const bed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[createdRoom])).rows[0].id;
   await c.query('update public.allocations set ended_at=clock_timestamp() where id=$1',[allocation]);
   const createdAllocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id',[resident.contextId,createdRoom,bed])).rows[0].id;
   await c.query("update public.verification_cases set status='rejected' where id=$1",[nullableCase]);
   const createdCase=(await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values($1,$2,'residence_registration','submitted') returning id",[manager.contextId,home])).rows[0].id;
   const createdInspection=(await c.query('insert into public.verification_inspections(case_id,officer_context_id) values($1,$2) returning id',[createdCase,officer.contextId])).rows[0].id;
   const createdIssue=(await c.query("insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,title) values($1,$2,$3,'Native housing reference verification') returning id",[home,createdRoom,manager.contextId])).rows[0].id;
   for(const [id,kind,parent] of [[createdRoom,'room',null],[createdAllocation,'allocation',createdRoom],
    [createdCase,'verification_case',null],[createdInspection,'inspection',createdCase],[createdIssue,'maintenance_issue',null]] as const){
    const t=(await c.query('select * from private.housing_reference_targets where id=$1',[id])).rows[0];
    check(t?.kind===kind&&t.residence_id===home&&t.parent_id===parent,'Authorized native creation captures each actual source kind and parent immediately');
   }
   const mediaId=crypto.randomUUID();
   await c.query(`insert into public.media_assets(id,owner_context_id,owner_auth_user_id,purpose,inspection_id,object_path,byte_size,sha256)
    select $1,owner_context_id,owner_auth_user_id,purpose,$2,$3,byte_size,sha256 from public.media_assets where inspection_id=$4`,
    [mediaId,createdInspection,`contexts/${officer.contextId}/${mediaId}.png`,inspection]);
   check((await c.query('select inspection_id from public.media_assets where id=$1',[mediaId])).rows[0]?.inspection_id===createdInspection,
    'New reservation for actual image bytes still accepts its live authorized inspection');
   throw new ApiError(409,'Abort actual five-kind creation');
  }),409,'Actual multi-kind creation and image reservation roll back atomically');
  check((await targets()).length===beforeRollback&&JSON.stringify(await records())===JSON.stringify(saved),'Rollback leaves no orphan sources, retained identities or image reservations');
  stage='freeze';
  const service=new SupabaseResidenceReviews(new SupabaseAuth(db)),options={hostelId:blank,deleteHostel:true,deleteManager:false,ban:{amount:0,unit:'days'}};
  const preview=await service.preview(admins[0],options);
  const proposal=await service.propose(admins[0],{...options,fingerprint:preview.fingerprint,reason:'Verify native retained housing references preserve reviewed pause',privateKey:keys[0]});
  await service.vote(admins[1],proposal.id,{decision:'approved',privateKey:keys[1]});
  await service.prepare(admins[0],proposal.id,{privateKey:keys[0],confirmation:'FREEZE APPROVED HOSTEL'});
  const pausedFloor=(await db.pool.query('select f.id from public.floors f join public.blocks b on b.id=f.block_id where b.residence_id=$1',[blank])).rows[0].id;
  await denied(()=>db.system(c=>c.query("insert into public.rooms(floor_id,room_number) values($1,'1')",[pausedFloor])),409,'Historical capture cannot bypass reviewed housing pause');
  await denied(()=>service.execute(admins[0],proposal.id,{privateKey:keys[0],confirmation:'DELETE APPROVED HOSTEL'}),503,'Authenticated execution remains disabled');
  check((await db.pool.query('select private.residence_review_current(p) as valid from public.admin_proposals p where id=$1',[proposal.id])).rows[0].valid,'Denied writes preserve current saved review');
  await service.cancelPreparation(admins[0],proposal.id,{privateKey:keys[0],reason:'Finish isolated retained-reference verification'});
  await denied(()=>db.system(c=>c.query('delete from public.allocations where id=$1',[allocation])),'42501','Cancelling a pause does not enable bound-source deletion');
  stage='recovery';
  const snapshot=JSON.stringify(await targets()),checkpoint=nativeRecoveryCheckpoint(config,new URL(process.env.SUPABASE_URL!).hostname.split('.')[0]);temporary.push(...checkpoint.files);
  await withIsolatedBackup(checkpoint.id,async restored=>{
   const recovered=new SupabaseDatabase(restored);
   try{
    check(JSON.stringify((await recovered.pool.query('select * from private.housing_reference_targets order by kind,id')).rows)===snapshot,'Actual encrypted full restore preserves immutable housing identities');
    check(JSON.stringify((await recovered.pool.query(`select jsonb_build_object('media',(select jsonb_agg(to_jsonb(t) order by id) from public.media_assets t),
     'enrollments',(select jsonb_agg(to_jsonb(t) order by id) from private.account_enrollments t)) as saved`)).rows[0].saved)===JSON.stringify(saved),'Actual restore preserves original media/enrollment rows');
    await denied(()=>recovered.system(c=>c.query('delete from public.verification_inspections where id=$1',[inspection])),'42501','Deletion gate survives restart/full restore');
    check((await recovered.pool.query(fingerprint)).rows[0].digest===originalAuth,'Recovery preserves genuine Auth bytes');
   }finally{await recovered.close();}
  });
  check((await db.pool.query(fingerprint)).rows[0].digest===originalAuth,'Native verification never changes genuine Auth users, identities or sessions');
 }finally{await db.close();}
},{applicationCheckpoint});
console.log(JSON.stringify({passed:true,checks,isolatedRestore:true,cloudRecordsModified:0,authAccountsCreated:0,providerMocks:0}));
}catch(error){
 const diagnostic='.security/migration-reset/'+crypto.randomUUID()+'.housing-reference-failure.log';
 const fd=fs.openSync(diagnostic,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,error instanceof Error?error.stack||error.message:'Native reference verification failed.');}finally{fs.closeSync(fd);}
 console.error(JSON.stringify({passed:false,checks,stage,diagnostic,cloudRecordsModified:0}));process.exitCode=1;
}finally{for(const file of temporary)fs.rmSync(file,{force:true});}
