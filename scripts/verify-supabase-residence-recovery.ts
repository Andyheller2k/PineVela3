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
import {createStorageBackup,readStorageSnapshot} from '../supabase/storageBackup.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
import {reserveMedia} from '../supabase/media.js';
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
  const {actors,keys,manager,home,room,owner}=await db.system(async c=>{
   const people=(await c.query(`select u.id,s.id as session_id from auth.users u join lateral
    (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
    where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
     and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
    order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 5`)).rows;
   check(people.length===5,'Five genuine Google identities with actual live sessions are available');
   check((await c.query('select count(*) from private.schema_migrations')).rows[0].count==='27','Private test credentials seeded before enrollment guards');
   const actors:VerifiedActor[]=[],keys:string[]=[],primaries:string[]=[];
   for(const [i,p] of people.entries()){
    await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
    primaries.push((await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id);
    const contextId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[p.id])).rows[0].id;
    await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[contextId,i+1]);
    const key=crypto.randomBytes(32).toString('base64url');keys.push(key);
    await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at) values($1,$2,clock_timestamp())',[contextId,await hashCredentialAsync(`approval:${contextId}:${key}`)]);
    const actor={authUserId:p.id,sessionId:p.session_id,contextId,kind:'admin'};actors.push(actor);
    await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[actor.sessionId,actor.authUserId,contextId]);
   }
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
   return {actors,keys,manager,home,room,owner:primaries[4]};
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
  const pre=checkpoint(),preStorage=await archive(pre),proposal=await freeze();
  await denied(()=>verifyResidenceRecoveryFiles(proposal,pre,preStorage),409,'Pre-pause checkpoint cannot establish archived pause');
  const post=checkpoint(),postStorage=await archive(post),verified=await verifyResidenceRecoveryFiles(proposal,post,postStorage);
  check(verified.pause.state==='frozen'&&verified.pause.proposalId===proposal,'Actual restored dump contains this precise frozen preparation');
  const actualCatalog=await db.system(c=>readStorageSnapshot(c));
  check(verified.evidence.objects===actualCatalog.objects.length&&verified.evidence.bytes===actualCatalog.objects.reduce((n,o)=>n+Number(o.metadata.size),0),'Actual recovery covers the complete restored Storage catalog; no provider reply is fabricated');
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
  const same=await attachResidenceRecovery(db,projectRef,proposal,post,postStorage);check(same.noChange,'Restarted operator re-verifies actual files and idempotently reconciles receipt');
  const another=await archive(post);await denied(()=>attachResidenceRecovery(db,projectRef,proposal,post,another),409,'Different valid archive cannot replace immutable receipt');
  const reconnected=new SupabaseDatabase(config);try{check((await reconnected.pool.query('select count(*) from private.residence_recovery_evidence')).rows[0].count==='1','Receipt survives a new connection');}finally{await reconnected.close();}
  await service.cancelPreparation(founder,proposal,{privateKey:keys[0],reason:'Resume housing after native recovery rehearsal'});
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
