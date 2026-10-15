/** Live schema/permission evidence only. Never exports credentials or candidate identities. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {systemWipeExecutionRequestsEnabled} from '../supabase/systemWipeExecutionRequests.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase();
try{
 const c=await db.pool.connect();
 try{
  await c.query('begin isolation level repeatable read read only');
  const ledger=(await c.query('select version,digest from private.schema_migrations')).rows;
  const files=fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
  assert.equal(ledger.length,files.length);
  for(const file of files)assert.equal(ledger.find(r=>r.version===file.slice(0,14))?.digest,
   crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+file)).digest('hex'));
  let checks=ledger.length;
  for(const role of['anon','authenticated','pinevela_backend']){
   assert.equal((await c.query("select has_function_privilege($1,'private.system_wipe_enrollment_selected(private.account_enrollments,jsonb)','EXECUTE')as allowed",[role])).rows[0].allowed,false);checks++;
   assert.equal((await c.query("select has_function_privilege($1,'private.run_operational_wipe(uuid)','EXECUTE')as allowed",[role])).rows[0].allowed,false);checks++;
   assert.equal((await c.query("select has_table_privilege($1,'private.primary_wipe_executions','INSERT')as allowed",[role])).rows[0].allowed,false);checks++;
   for(const privilege of['SELECT','INSERT']){assert.equal((await c.query("select has_table_privilege($1,'private.system_wipe_execution_requests',$2)as allowed",[role,privilege])).rows[0].allowed,false);checks++;}
   assert.equal((await c.query("select has_function_privilege($1,'private.system_wipe_execution_request_current(private.system_wipe_execution_requests)','EXECUTE')as allowed",[role])).rows[0].allowed,false);checks++;
  }
  const helper=(await c.query("select prosecdef,proconfig from pg_proc where oid='private.system_wipe_enrollment_selected(private.account_enrollments,jsonb)'::regprocedure")).rows[0];
  assert.equal(helper.prosecdef,false);assert(helper.proconfig.includes('search_path=""'));checks++;
  for(const signature of['private.run_operational_wipe(uuid)','private.operational_wipe_write_allowed(text,text,text,jsonb,jsonb)','private.wipe_withdrawal_guard()','private.wipe_withdrawn_dependency_guard()',
   'private.system_wipe_execution_request_current(private.system_wipe_execution_requests)','private.system_wipe_execution_request_guard()','private.system_wipe_request_commit_guard()','private.system_wipe_execution_handoff_commit_guard()']){
   const fn=(await c.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
   assert.equal(fn.prosecdef,false);assert(fn.proconfig.includes('search_path=""'));checks++;
  }
  for(const table of['public.maintenance_issues','public.verification_cases','public.verification_inspections','public.seller_applications','private.manager_closure_requests']){
   assert.equal((await c.query("select count(*)::int n from pg_attribute where attrelid=$1::regclass and attname='withdrawn_by_wipe_id'and not attisdropped",[table])).rows[0].n,1);checks++;
  }
  for(const view of['private.housing_issue_details','private.seller_application_details']){
   assert.equal((await c.query("select count(*)::int n from pg_attribute where attrelid=$1::regclass and attname='withdrawn_by_wipe_id'and not attisdropped",[view])).rows[0].n,1);checks++;
  }
  const hooks=(await c.query(`select count(*)::integer n from pg_trigger t
   where t.tgrelid in('public.notifications'::regclass,'public.notification_recipients'::regclass)
    and t.tgname in('aa0_system_wipe_writer_lock','aab_system_wipe_write_guard','zzz_system_wipe_write_guard','system_wipe_truncate_guard')
    and not t.tgisinternal and t.tgenabled='O'`)).rows[0].n;
  assert.equal(hooks,8);checks++;
  assert.equal((await c.query("select relrowsecurity from pg_class where oid='private.system_wipe_execution_requests'::regclass")).rows[0].relrowsecurity,true);checks++;
  assert.equal((await c.query("select count(*)::int n from pg_trigger where tgname in('system_wipe_execution_request_guard','system_wipe_execution_request_truncate','system_wipe_request_commit_guard','system_wipe_execution_handoff_commit_guard')and not tgisinternal and tgenabled='O'")).rows[0].n,4);checks++;
  assert.equal(systemWipeExecutionRequestsEnabled(),false);checks++;
  const state=(await c.query(`select (select count(*)::int from auth.users)as "authUsers",
   (select count(*)::int from auth.sessions)as "nativeSessions",(select count(*)::int from public.profiles)as profiles,
   (select count(*)::int from storage.objects)as "storageObjects",
   (select count(*)::int from public.admin_memberships where status='active')as "activeAdministrators",
   (select count(*)::int from private.admin_secrets where approval_key_hash is not null)as "keyedAdministrators",
   (select count(*)::int from pg_tables where schemaname='public'and not rowsecurity)as "publicTablesWithoutRls",
   (select count(*)::int from private.system_wipe_freezes where state='frozen')as "activeWipePauses",
   (select count(*)::int from private.primary_wipe_executions)as "primaryWipeExecutions",
   (select count(*)::int from private.system_wipe_execution_requests)as "wipeExecutionRequests"`)).rows[0];
  assert.equal(state.publicTablesWithoutRls,0);checks++;
  for(const scopes of[['total'],['markets'],['residents']]){
   const p=(await c.query('select private.system_wipe_preview($1::jsonb)as preview',[JSON.stringify(scopes)])).rows[0].preview;
   assert.equal(p.executionAvailable,false);assert(Array.isArray(p.resources.account_enrollments));
   assert(Array.isArray(p.retainedDependencies.room_key_deliveries));checks++;
  }
  await c.query('commit');
  const report={passed:true,checks,migrations:ledger.length,migrationHashesMatch:true,readOnly:true,
   scopedHelperIsInvoker:true,privateHelperGrantsDenied:true,notificationHooks:hooks,credentialsPrinted:false,...state};
  fs.writeFileSync('.security/migration-reset/system-wipe-scope-live.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));
 }finally{await c.query('rollback').catch(()=>{});c.release();}
}finally{await db.close();}
