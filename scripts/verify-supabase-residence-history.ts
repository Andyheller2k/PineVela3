/** Native financial/governance history on restored genuine Google identities.
 * No cloud deletion, fake provider evidence or altered Auth sessions. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabaseResidenceReviews} from '../supabase/residenceReviews.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {prepareCheckout,fulfillCheckout} from '../supabase/payments.js';
import {paymentOrigin} from '../paystackProvider.js';
dotenv.config({quiet:true});
const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the genuine Auth checkpoint and immutable migration-27 application checkpoint.');
const suffix='_retained_residence_history_targets.sql';
const migrationVersion=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix))!.slice(0,14);
const migration=draft||path.join('supabase/migrations',fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix))!);
const sql=fs.readFileSync(migration,'utf8'),files:string[]=[];
let checks=0;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
 check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,
  `${label} (expected ${expected}; received ${error instanceof ApiError?error.status:error?.code||'success'})`);}
const fingerprintSQL=`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
 'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
 'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
try{await withIsolatedBackup(backup,async config=>{
 const db=new SupabaseDatabase(config);
 try{
  const authBefore=(await db.pool.query(fingerprintSQL)).rows[0].digest;
  const {actors,keys,primaries,manager,paymentHome,reviewHome}=await db.system(async c=>{
   check((await c.query('select count(*) from private.schema_migrations')).rows[0].count==='27','Seed private domain keys before enrollment guards');
   const people=(await c.query(`select u.id,s.id as session_id from auth.users u join lateral
    (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
    where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i
     where i.user_id=u.id and i.provider='google' and lower(i.identity_data->>'email')=lower(u.email)
      and i.identity_data->>'email_verified'='true')
    order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 4`)).rows;
   check(people.length===4,'Four genuinely verified Google identities have actual native sessions');
   const primaries:VerifiedActor[]=[],actors:VerifiedActor[]=[],keys:string[]=[];
   for(const [i,p] of people.entries()){
    await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
    const primary:VerifiedActor={authUserId:p.id,sessionId:p.session_id,contextId:
     (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id,kind:'primary'};
    primaries.push(primary);
    if(i<3){
     const contextId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[p.id])).rows[0].id;
     const a={...primary,contextId,kind:'admin'};actors.push(a);
     await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[contextId,i+1]);
     const key=crypto.randomBytes(32).toString('base64url');keys.push(key);
     await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at) values($1,$2,clock_timestamp())',
      [contextId,await hashCredentialAsync(`approval:${contextId}:${key}`)]);
     await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
    }
   }
   await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[people[3].id,people[0].id]);
   const manager:VerifiedActor={...primaries[3],kind:'manager',contextId:
    (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[people[3].id,people[0].id])).rows[0].id};
   await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[manager.sessionId,manager.authUserId,manager.contextId]);
   const homes:string[]=[];
   for(let i=0;i<2;i++){
    const home=(await c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1 returning id',[people[0].id])).rows[0].id;
    await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager.contextId,home]);homes.push(home);
   }
   for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000'&&f.slice(0,14)<migrationVersion).sort()){
    const text=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(text);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(text).digest('hex')]);
   }
   return {actors,keys,primaries,manager,paymentHome:homes[0],reviewHome:homes[1]};
  });
  const [founder,second,third]=actors;
  const quote=(home:string,requestId=crypto.randomUUID())=>db.authorizedSystem(manager,['manager'],c=>prepareCheckout(c,manager,{requestId,purpose:'housing',hostelId:home},paymentOrigin()));
  const payment=(await quote(paymentHome)).record;
  check(payment.status==='initialized'&&payment.provider==='paystack'&&payment.mode==='live'&&Number(payment.amount_minor)===5000,'Saved native unpaid quote uses the configured provider/fee without charging it');
  const service=new SupabaseResidenceReviews(new SupabaseAuth(db));
  const options={hostelId:reviewHome,deleteHostel:true,deleteManager:false,ban:{amount:0,unit:'days'}};
  const preview=await service.preview(founder,options);
  const proposal=await service.propose(founder,{...options,fingerprint:preview.fingerprint,reason:'Retain genuine review history before native worker execution',privateKey:keys[0]});
  await service.vote(second,proposal.id,{decision:'approved',privateKey:keys[1]});
  await service.prepare(founder,proposal.id,{privateKey:keys[0],confirmation:'FREEZE APPROVED HOSTEL'});
  const row=async(table:string,id:string)=>(await db.pool.query(`select to_jsonb(t) as row from ${table} t where id=$1`,[id])).rows[0].row;
  const paymentBefore=await row('public.payments',payment.id),proposalBefore=await row('public.admin_proposals',proposal.id);
  const referenceBefore=(await db.pool.query('select to_jsonb(r) as row from private.residence_payment_references r where residence_id=$1',[paymentHome])).rows[0].row;
  const originalFK=async()=>(await db.pool.query(`select confrelid::regclass::text as target,confdeltype from pg_constraint
   where conrelid='public.admin_proposals'::regclass and conname='admin_proposals_target_residence_id_fkey'`)).rows[0];
  check((await originalFK()).confdeltype==='n','Original review target uses the incompatible SET NULL action');
  await denied(()=>db.system(async c=>{await c.query(sql);throw new ApiError(409,'Abort isolated DDL rehearsal');}),409,'Interrupted DDL rolls back atomically');
  check((await db.pool.query("select to_regclass('private.residence_history_targets') as table_name")).rows[0].table_name===null&&(await originalFK()).target==='residences','Rollback retains original FK and creates no partial history protocol');
  await db.system(async c=>{await c.query(sql);if(!draft)await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',
   [path.basename(migration).slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);});
  // Rehearse historical DDL before dependent migrations, then verify the current schema.
  if(!draft)await db.system(async c=>{
   for(const name of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>migrationVersion).sort()){
    const text=fs.readFileSync('supabase/migrations/'+name,'utf8');await c.query(text);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[name.slice(0,14),crypto.createHash('sha256').update(text).digest('hex')]);
   }
  });
  check(JSON.stringify(await row('public.payments',payment.id))===JSON.stringify(paymentBefore),'Migration leaves quote, provider and ownership evidence unchanged');
  check(JSON.stringify(await row('public.admin_proposals',proposal.id))===JSON.stringify(proposalBefore),'Migration preserves exact proposal target, scope, votes and decisions');
  check(JSON.stringify((await db.pool.query('select to_jsonb(r) as row from private.residence_payment_references r where residence_id=$1',[paymentHome])).rows[0].row)===JSON.stringify(referenceBefore),'Existing payment reference remains byte-equivalent');
  check((await db.pool.query('select private.residence_review_current(p) as valid from public.admin_proposals p where id=$1',[proposal.id])).rows[0].valid,'Existing genuine frozen review remains current');
  const targets=async()=>(await db.pool.query('select * from private.residence_history_targets order by residence_id')).rows;
  const backfilled=await targets();
  check(backfilled.length===2,'Only the two actual saved residences are captured');
  check((await db.pool.query(`select count(*) from private.residence_history_targets h join public.residences r on r.id=h.residence_id
   where h.original_name=r.name and h.original_primary_owner_id=r.primary_owner_id and h.original_registered_at=r.registered_at
    and h.captured_at<=clock_timestamp()`)).rows[0].count==='2','All retained identities derive exact saved metadata and native time');
  const fks=(await db.pool.query(`select conrelid::regclass::text as source,confrelid::regclass::text as target,conname,confdeltype
   from pg_constraint where contype='f' and conrelid in('public.payments'::regclass,'public.admin_proposals'::regclass)
    and confrelid in('public.residences'::regclass,'private.residence_payment_references'::regclass,'private.residence_history_targets'::regclass)`)).rows;
  check(fks.length===2&&fks.every(f=>f.confdeltype==='a')&&fks.some(f=>f.target==='private.residence_payment_references')
   &&fks.some(f=>f.target==='private.residence_history_targets'),'Financial and review history have enforced retained FKs without operational SET NULL/cascade: '+JSON.stringify(fks));
  for(const statement of ['update private.residence_history_targets set original_name=original_name',
   'delete from private.residence_history_targets','truncate private.residence_history_targets cascade'])
   await denied(()=>db.system(c=>c.query(statement)),'42501','Native history cannot be changed or erased');
  await denied(()=>db.system(c=>c.query(`insert into private.residence_history_targets(residence_id,original_primary_owner_id,original_name,original_registered_at)
   select $1,original_primary_owner_id,original_name,original_registered_at from private.residence_history_targets limit 1`,[crypto.randomUUID()])),
   '42501','Invented target cannot borrow genuine saved metadata');
  await denied(()=>db.system(c=>c.query(`insert into private.residence_history_targets(residence_id,original_primary_owner_id,original_name,original_registered_at)
   select residence_id,$1,original_name,original_registered_at from private.residence_history_targets limit 1`,[third.authUserId])),
   '42501','Foreign owner cannot be captured as original owner');
  for(const role of ['anon','authenticated','pinevela_backend']){
   check(!(await db.pool.query("select has_table_privilege($1,'private.residence_history_targets','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as allowed",[role])).rows[0].allowed,'Private historical identities have no direct role grants');
   for(const fn of ['residence_history_target_guard','capture_residence_history_target','residence_history_identity_guard','residence_proposal_live_target_guard'])
    check(!(await db.pool.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role,`private.${fn}()`])).rows[0].allowed,'No history/delete helper becomes an exposed RPC');
   await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.residence_history_targets');}),'42501','Direct role cannot read retained owner metadata');
  }
  check((await db.pool.query("select relrowsecurity from pg_class where oid='private.residence_history_targets'::regclass")).rows[0].relrowsecurity,'Private history has RLS');
  check((await db.pool.query("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('residence_history_target_guard','capture_residence_history_target','residence_history_identity_guard','residence_proposal_live_target_guard') and p.prosecdef")).rows[0].count==='0','New helpers use invoker security');
  await denied(()=>db.system(c=>c.query('delete from public.residences where id=$1',[reviewHome])),409,'Frozen scope retains its native write guard');
  await denied(()=>db.system(c=>c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1',[founder.authUserId])),
   409,'History capture does not allow another row inside the frozen owner scope');
  await service.cancelPreparation(founder,proposal.id,{privateKey:keys[0],reason:'Finish isolated frozen-history verification'});
  await denied(()=>db.system(c=>c.query('delete from public.residences where id=$1',[paymentHome])),'42501','Removing operational payment FK does not enable root deletion');
  await denied(()=>db.system(c=>c.query('truncate public.residences cascade')),'42501','Native truncate cannot bypass the worker gate');
  await denied(()=>db.system(async c=>{await c.query("select set_config('pinevela.residence_execution_confirmation','AUTHORIZE APPROVED HOSTEL',true)");
   return c.query('delete from public.residences where id=$1',[paymentHome]);}),'42501','Caller GUC cannot open operational deletion');
  await denied(()=>service.execute(founder,proposal.id,{privateKey:keys[0],confirmation:'DELETE APPROVED HOSTEL'}),503,'Authenticated execution remains disabled');
  await denied(()=>db.system(c=>c.query('update public.residences set id=$2 where id=$1',[paymentHome,crypto.randomUUID()])),
   '42501','Operational residence cannot change identity to bypass retained references');
  await denied(()=>db.system(c=>c.query('insert into public.residences(id,primary_owner_id,name) select id,primary_owner_id,name from public.residences where id=$1',[paymentHome])),
   '23505','Historical identity cannot be recycled');
  const create=async(id=crypto.randomUUID())=>db.system(async c=>{
   await c.query('set constraints residences_history_target_fkey immediate');
   return (await c.query('insert into public.residences(id,primary_owner_id,name) select $1,id,display_name from public.profiles where id=$2 returning id',[id,third.authUserId])).rows[0].id;
  });
  const newlyCreated=await create();
  check((await targets()).some(t=>t.residence_id===newlyCreated),'New actual residence captures history atomically with immediate identity FK');
  const competingId=crypto.randomUUID(),competing=await Promise.allSettled([create(competingId),create(competingId)]);
  check(competing.filter(r=>r.status==='fulfilled').length===1&&competing.some(r=>r.status==='rejected'&&r.reason?.code==='23505'),
   'Competing inserts save exactly one operational/historical identity');
  const beforeRollback=(await targets()).length;
  await denied(()=>db.system(async c=>{await c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1',[third.authUserId]);
   throw new ApiError(409,'Abort actual creation');}),409,'Failed residence creation rolls back');
  check((await targets()).length===beforeRollback,'Failed creation leaves no historical orphan');
  const captured=(await targets()).find(t=>t.residence_id===paymentHome)!;
  await db.system(c=>c.query('update public.residences set name=(select display_name from public.profiles where id=$2) where id=$1',[paymentHome,third.authUserId]));
  check(JSON.stringify((await targets()).find(t=>t.residence_id===paymentHome))===JSON.stringify(captured),'Later current name change preserves original retained metadata');
  const repeated=await quote(paymentHome,payment.request_id);
  check(!repeated.created&&repeated.record.id===payment.id,'Existing real checkout retry remains idempotent');
  const later=await quote(paymentHome);
  check(later.created&&(await db.pool.query('select count(*) from private.residence_payment_references where residence_id=$1',[paymentHome])).rows[0].count==='1','New quotes still use the exact saved residence and one immutable financial reference');
  await db.actor(manager,c=>c.query('select id from public.payments where id=$1',[payment.id]).then(r=>check(r.rowCount===1,'Paying manager retains RLS access')));
  await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[third.sessionId,primaries[2].contextId]));
  await db.actor(primaries[2],c=>c.query('select id from public.payments where id=$1',[payment.id]).then(r=>check(r.rowCount===0,'Unrelated primary portal cannot adopt the retained manager quote')));
  await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[third.sessionId,third.contextId]));
  await denied(()=>quote(crypto.randomUUID()),404,'An invented live target cannot create a quote');
  await denied(()=>db.authorizedSystem(manager,['manager'],c=>fulfillCheckout(c,payment.id)),409,'Retained references do not prove provider payment or grant access');
  await denied(()=>db.system(c=>c.query('update public.payments set residence_id=$2 where id=$1',[payment.id,reviewHome])),'23514','Payment target remains immutable');
  await denied(()=>db.system(c=>c.query('update public.admin_proposals set target_residence_id=$2 where id=$1',[proposal.id,paymentHome])),'42501','Governance target remains immutable');
  await denied(()=>db.system(c=>c.query('delete from public.residences where id=$1',[reviewHome])),'42501','Ending a pause does not authorize deletion');
  check((await row('public.admin_proposals',proposal.id)).target_residence_id===reviewHome,'Cancelled review retains original target UUID');
  const fresh=await service.preview(founder,options);
  const next=await service.propose(founder,{...options,fingerprint:fresh.fingerprint,reason:'Verify new review uses actual live target',privateKey:keys[0]});
  await service.vote(second,next.id,{decision:'approved',privateKey:keys[1]});
  check((await row('public.admin_proposals',next.id)).status==='approved','Fresh keyed proposal and two distinct votes still work');
  const checkpoint=nativeRecoveryCheckpoint(config,new URL(process.env.SUPABASE_URL!).hostname.split('.')[0]);files.push(...checkpoint.files);
  await withIsolatedBackup(checkpoint.id,async restored=>{
   const recovered=new SupabaseDatabase(restored);try{
    check(JSON.stringify((await recovered.pool.query('select * from private.residence_history_targets order by residence_id')).rows)===JSON.stringify(await targets()),'Actual encrypted full restore preserves immutable target history');
    check((await recovered.pool.query('select target_residence_id from public.admin_proposals where id=$1',[proposal.id])).rows[0].target_residence_id===reviewHome,'Full restore preserves original governance target');
    check((await recovered.pool.query('select residence_id,provider_receipt from public.payments where id=$1',[payment.id])).rows[0].residence_id===paymentHome,'Full restore preserves exact financial target');
    await denied(()=>recovered.system(c=>c.query('delete from public.residences where id=$1',[paymentHome])),'42501','Restored native worker gate still refuses deletion');
   }finally{await recovered.close();}
  });
  const restarted=new SupabaseDatabase(config);try{
   check((await restarted.pool.query('select count(*) from private.residence_history_targets')).rows[0].count==='4','Saved history survives a new backend connection pool');
  }finally{await restarted.close();}
  check((await db.pool.query(fingerprintSQL)).rows[0].digest===authBefore,'Genuine Auth users/identities/sessions remain unchanged');
 }finally{await db.close();}
},{applicationCheckpoint});
 console.log(JSON.stringify({passed:true,checks,isolatedRestore:true,actualEncryptedRecovery:true,authAccountsCreated:0,providerMocks:0,cloudRecordsModified:0,cloudObjectsModified:0,executionEnabled:false}));
}catch(error){console.error(JSON.stringify({passed:false,checks,assertion:error instanceof Error?error.message:'native_history_failed'}));process.exitCode=1;}
finally{for(const file of files)fs.rmSync(file,{force:true});}
