/** Real native quotes and restored Google identities; no provider responses or Auth state are fabricated. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {prepareCheckout,fulfillCheckout,pendingCheckouts,paymentLedger} from '../supabase/payments.js';
import {paymentOrigin} from '../paystackProvider.js';
dotenv.config({quiet:true});const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the latest genuine Auth checkpoint and immutable migration-27 application checkpoint.');
let checks=0;const files:string[]=[];const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
 check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,
  `${label} (expected ${expected}; received ${error instanceof ApiError?error.status:error?.code||'success'})`);}
const fingerprintSQL=`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
 'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
try{await withIsolatedBackup(backup,async config=>{
 const db=new SupabaseDatabase(config);try{
  const before=(await db.pool.query(fingerprintSQL)).rows[0].digest;
  const {owner,foreignOwner,manager,foreignManager,admin,home,foreignHome,originalName,originalOwner}=await db.system(async c=>{
   const people=(await c.query(`select u.id,s.id as session_id from auth.users u join lateral
    (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
    where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
     and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
    order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 4`)).rows;
   check(people.length===4,'Four real verified Google subjects have actual native sessions');
   check((await c.query('select count(*) from private.schema_migrations')).rows[0].count==='27','Fixture uses the immutable pre-enrollment schema');
   const primaries:VerifiedActor[]=[],managers:VerifiedActor[]=[];
   for(const p of people){await c.query('select private.initialize_auth_profile($1,null)',[p.id]);primaries.push({authUserId:p.id,sessionId:p.session_id,kind:'primary',contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id});}
   for(let i=0;i<2;i++){
    await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[people[i+2].id,people[i].id]);
    const contextId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[people[i+2].id,people[i].id])).rows[0].id;
    managers.push({...primaries[i+2],kind:'manager',contextId});
   }
   const admin={...primaries[0],kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[people[0].id])).rows[0].id};
   await c.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[admin.contextId]);
   for(const a of [primaries[0],primaries[1],...managers])await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
   const homes=[];
   for(let i=0;i<2;i++){
    const row=(await c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1 returning *',[people[i].id])).rows[0];homes.push(row);
    await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[managers[i].contextId,row.id]);
   }
   for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000'&&f.slice(0,14)<'20261011151137').sort()){
    const sql=fs.readFileSync(path.join('supabase/migrations',file),'utf8');await c.query(sql);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
   }
   return {owner:primaries[0],foreignOwner:primaries[1],manager:managers[0],foreignManager:managers[1],admin,home:homes[0].id,foreignHome:homes[1].id,originalName:homes[0].name,originalOwner:people[0].id};
  });
  const quote=(a:VerifiedActor,id:string,requestId=crypto.randomUUID())=>db.authorizedSystem(a,['manager'],c=>prepareCheckout(c,a,{requestId,purpose:'housing',hostelId:id},paymentOrigin()));
  const initial=(await quote(manager,home)).record;
  check(initial.residence_id===home&&initial.mode==='live'&&initial.provider==='paystack'&&Number(initial.amount_minor)===5000&&initial.status==='initialized','Actual unpaid residence quote uses the configured live provider and saved fee; no receipt is fabricated');
  const paymentBefore=(await db.pool.query('select to_jsonb(p) as row from public.payments p where id=$1',[initial.id])).rows[0].row;
  const referencesBefore=await db.pool.query("select to_regclass('private.residence_payment_references') as name");
  check(referencesBefore.rows[0].name===null,'Existing payment predates the retention migration');
  const file=draft||path.join('supabase/migrations',fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_retained_residence_payment_references.sql'))!);
  await db.system(async c=>{const sql=fs.readFileSync(file,'utf8');await c.query(sql);if(!draft)await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[path.basename(file).slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);});
  // Later history migrations depend on payment retention; apply them in native
  // ledger order after exercising the genuine pre-retention quote/backfill.
  await db.system(async c=>{for(const later of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261011151137').sort()){
   const text=fs.readFileSync(path.join('supabase/migrations',later),'utf8');await c.query(text);
   await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[later.slice(0,14),crypto.createHash('sha256').update(text).digest('hex')]);
  }});
  const reference=async(id=home)=>(await db.pool.query('select * from private.residence_payment_references where residence_id=$1',[id])).rows[0];
  const retained=await reference();
  check(retained.residence_id===home&&retained.source_payment_id===initial.id&&retained.original_name===originalName&&retained.original_primary_owner_id===originalOwner,'Backfill records only the actual saved payment/residence relationship');
  check(JSON.stringify((await db.pool.query('select to_jsonb(p) as row from public.payments p where id=$1',[initial.id])).rows[0].row)===JSON.stringify(paymentBefore),'Backfill rewrites no amount, owner, reference, status or provider evidence');
  await db.authorizedSystem(manager,['manager'],async c=>{check((await c.query('select id from public.payments where id=$1',[initial.id])).rowCount===1,'Paying manager reads its unchanged native receipt');});
  await db.actor(manager,async c=>check((await c.query('select id from public.payments where id=$1',[initial.id])).rowCount===1,'Direct payment RLS permits the paying portal'));
  for(const a of [foreignManager,owner,foreignOwner])await db.actor(a,async c=>check((await c.query('select id from public.payments where id=$1',[initial.id])).rowCount===0,'Foreign or primary portal cannot adopt the separate manager payment'));
  await denied(()=>quote(foreignManager,home),404,'Another manager cannot create a target reference through foreign checkout');
  const nativeFK=(await db.pool.query(`select count(*) as count from pg_constraint where conrelid='public.payments'::regclass and contype='f'
    and confrelid in('public.residences'::regclass,'private.residence_payment_references'::regclass)`)).rows[0].count;
  const historyEnabled=(await db.pool.query("select to_regclass('private.residence_history_targets') is not null as enabled")).rows[0].enabled;
  check(nativeFK===(historyEnabled?'1':'2'),'Native payment target retains the enforced historical relationship');
  await denied(()=>db.system(c=>c.query('delete from public.residences where id=$1',[home])),historyEnabled?'42501':'23503','Retained references do not enable unreviewed property deletion');
  for(const sql of ['update private.residence_payment_references set original_name=original_name','delete from private.residence_payment_references','truncate private.residence_payment_references cascade'])
   await denied(()=>db.system(c=>c.query(sql)),'42501','Retained payment target history cannot be edited or erased');
  for(const role of ['anon','authenticated','pinevela_backend']){
   check(!(await db.pool.query("select has_table_privilege($1,'private.residence_payment_references','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as allowed",[role])).rows[0].allowed,'Private reference has no direct role grant');
   check(!(await db.pool.query("select has_function_privilege($1,'private.capture_residence_payment_reference()','EXECUTE') as allowed",[role])).rows[0].allowed,'Capture is not a browser-callable RPC');
   await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.residence_payment_references');}),'42501','Private original owner/name stay inaccessible');
  }
  const foreign=(await quote(foreignManager,foreignHome)).record;
  check((await reference(foreignHome)).source_payment_id===foreign.id,'New actual quote atomically creates its native target reference');
  await denied(()=>db.system(c=>c.query(`insert into private.residence_payment_references(residence_id,source_payment_id,original_name,original_primary_owner_id)
   values($1,$2,$3,$4)`,[crypto.randomUUID(),initial.id,originalName,originalOwner])),'42501','A genuine payment cannot anchor an invented or foreign residence');
  await denied(()=>db.system(c=>c.query(`insert into private.residence_payment_references(residence_id,source_payment_id,original_name,original_primary_owner_id)
   values($1,$2,$3,$4)`,[home,crypto.randomUUID(),originalName,originalOwner])),'42501','Invented payment cannot create financial history');
  const laterName=(await db.pool.query('select display_name from public.profiles where id=$1',[foreignManager.authUserId])).rows[0].display_name;
  await db.system(c=>c.query('update public.residences set name=$2 where id=$1',[home,laterName]));
  const renamed=await reference();check(renamed.original_name===originalName&&renamed.source_payment_id===initial.id,'Later live metadata changes preserve the exact original financial target');
  const competing=await Promise.all([quote(manager,home),quote(manager,home)]);
  check(competing[0].record.id!==competing[1].record.id&&(await db.pool.query('select count(*) from private.residence_payment_references where residence_id=$1',[home])).rows[0].count==='1','Competing quotes share one immutable reference without losing real payments');
  const extraHome=async(a:VerifiedActor,primary:VerifiedActor)=>db.system(async c=>{
   const id=(await c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1 returning id',[primary.authUserId])).rows[0].id;
   await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[a.contextId,id]);return id;
  });
  const immediateHome=await extraHome(manager,owner);
  const instant=await db.authorizedSystem(manager,['manager'],async c=>{await c.query('set constraints payments_residence_retention_fkey immediate');return prepareCheckout(c,manager,{requestId:crypto.randomUUID(),purpose:'housing',hostelId:immediateHome},paymentOrigin());});
  check(instant.created&&(await reference(immediateHome)).source_payment_id===instant.record.id,'Immediate constraints allow the first actual quote and reference together');
  const retry=await quote(manager,home,initial.request_id);
  check(!retry.created&&retry.record.id===initial.id&&(await reference()).captured_at.getTime()===retained.captured_at.getTime(),'Exact quote retry preserves the original immutable reference');
  const rollbackHome=await extraHome(foreignManager,foreignOwner);
  const count=(await db.pool.query('select count(*) from public.payments')).rows[0].count;
  await denied(()=>db.authorizedSystem(foreignManager,['manager'],async c=>{await prepareCheckout(c,foreignManager,{requestId:crypto.randomUUID(),purpose:'housing',hostelId:rollbackHome},paymentOrigin());throw new ApiError(409,'Abort native quote');}),409,'Failed first quote rolls back receipt effects');
  check((await db.pool.query('select count(*) from public.payments')).rows[0].count===count&&!(await reference(rollbackHome)),'Quote rollback retains the exact prior payment count and leaves no orphan reference');
  await denied(()=>db.system(c=>c.query('update public.payments set residence_id=$2 where id=$1',[initial.id,foreignHome])),'23514','Original payment target stays immutable');
  await denied(()=>db.system(c=>c.query('delete from public.payments where id=$1',[initial.id])),'23514','Payment history remains immutable');
  await denied(()=>db.authorizedSystem(manager,['manager'],c=>fulfillCheckout(c,initial.id)),409,'Retention evidence is not proof of payment or access');
  check(!(await db.pool.query('select private.payment_grants_access($1) as allowed',[initial.id])).rows[0].allowed,'An unpaid retained quote cannot grant residence access');
  const pending=await db.authorizedSystem(manager,['manager'],c=>pendingCheckouts(c,manager));
  check(pending.some(p=>p.reference===initial.provider_reference&&p.purpose==='housing'),'Existing checkout recovery still lists the actual saved quote');
  await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[admin.sessionId,admin.contextId]));
  const ledger=await db.authorizedSystem(admin,['admin'],c=>paymentLedger(c,admin));
  check(ledger.length===0,'Retention does not falsely list unpaid quotes as paid administrator receipts');
  const checkpoint=nativeRecoveryCheckpoint(config,new URL(process.env.SUPABASE_URL!).hostname.split('.')[0]);files.push(...checkpoint.files);
  await withIsolatedBackup(checkpoint.id,async restored=>{
   const recovered=new SupabaseDatabase(restored);try{
    check((await recovered.pool.query('select count(*) from private.residence_payment_references')).rows[0].count==='3','Actual encrypted dump restores all immutable target references');
    check((await recovered.pool.query('select residence_id,provider_receipt from public.payments where id=$1',[initial.id])).rows[0].residence_id===home,'Full native recovery retains original payment UUID target');
    check((await recovered.pool.query('select provider_receipt from public.payments where id=$1',[initial.id])).rows[0].provider_receipt===null,'Backup restoration fabricates no provider evidence');
   }finally{await recovered.close();}
  });
  const reconnected=new SupabaseDatabase(config);try{check((await reconnected.pool.query('select count(*) from private.residence_payment_references')).rows[0].count==='3','Native reference survives backend pool restart');}finally{await reconnected.close();}
  check((await db.pool.query(fingerprintSQL)).rows[0].digest===before,'Real Auth users/identities/sessions remain unchanged');
 }finally{await db.close();}
},{applicationCheckpoint});console.log(JSON.stringify({passed:true,checks,isolatedRestore:true,actualEncryptedRecovery:true,authAccountsCreated:0,providerMocks:0,cloudRecordsModified:0,cloudObjectsModified:0}));
}catch(error){console.error(JSON.stringify({passed:false,checks,assertion:error instanceof Error?error.message:'native_retention_failed'}));process.exitCode=1;}
finally{for(const file of files)fs.rmSync(file,{force:true});}
