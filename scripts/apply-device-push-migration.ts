/** Owner-authorized additive deployment through the existing verified-TLS DB
 * connection. No subscriptions, campaigns or user messages are created. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import {SupabaseDatabase} from '../supabase/db.js';
dotenv.config({quiet:true});
const report:any={passed:false,databaseOnly:true,webDeployed:false,apkInstalled:false,notificationsSent:0};
let stage='local verification gate',db:SupabaseDatabase|undefined;
try{
  const verification=JSON.parse(fs.readFileSync('docs/verification/device-push-2026-11-05/database-http-report.json','utf8'));
  assert(verification.passed&&verification.checks>=100);
  assert.equal(new URL(process.env.SUPABASE_URL||'').hostname,'bivajljcdeofyxzmplxm.supabase.co');
  const migration=fs.readFileSync('supabase/migrations/20261105110000_device_push_delivery.sql','utf8');
  const digest=crypto.createHash('sha256').update(migration).digest('hex');
  const sql=fs.readFileSync('releases/database/pinevela-apply-device-push-20261105.sql','utf8');assert(sql.includes(digest)&&/\ncommit;\s*$/.test(sql));
  assert.equal(verification.sqlEditorSha256,crypto.createHash('sha256').update(sql).digest('hex'));
  for(const [file,expected] of Object.entries(verification.sourceSha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected);
  db=new SupabaseDatabase();
  const previous=(await db.pool.query("select digest from private.schema_migrations where version='20261105110000'")).rows[0];
  if(previous)assert.equal(previous.digest,digest);
  const inspect=async()=>{
    const ledger=(await db!.pool.query("select digest from private.schema_migrations where version='20261105110000'")).rows[0];assert.equal(ledger?.digest,digest);
    const tables=(await db!.pool.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname='private' and c.relname in('device_push_installations','device_push_bindings','device_push_publications','device_push_jobs')`)).rows;
    assert.equal(tables.length,4);assert(tables.every(r=>r.relrowsecurity));
    const grants=(await db!.pool.query(`select r.name,t.name as relation,has_table_privilege(r.name,'private.'||t.name,'select,insert,update,delete') as granted
      from(values('anon'),('authenticated'),('pinevela_backend'),('pinevela_catalog'))r(name)
      cross join(values('device_push_installations'),('device_push_bindings'),('device_push_publications'),('device_push_jobs'))t(name)`)).rows;
    assert(grants.every(r=>!r.granted));
    assert((await db!.pool.query("select bool_and(not prosecdef) as safe from pg_proc where oid in('private.queue_device_push()'::regprocedure,'private.wake_device_push_catalog()'::regprocedure)")).rows[0].safe);
    return{rlsTables:tables.length,browserAndScopedRoleGrantChecks:grants.length};
  };
  stage='rolled-back hosted dry run';
  await db.pool.query(sql.replace(/\ncommit;\s*$/,'\nrollback;\n'));
  if(!previous)assert(!(await db.pool.query("select to_regclass('private.device_push_installations') as relation")).rows[0].relation);
  stage='atomic migration application';await db.pool.query(sql);
  stage='independent committed readback';Object.assign(report,await inspect());
  const counts=(await db.pool.query(`select
    (select count(*)::int from private.device_push_installations) as installations,
    (select count(*)::int from private.device_push_bindings) as bindings,
    (select count(*)::int from private.device_push_jobs) as jobs,
    (select count(*)::int from private.device_push_publications) as catalogBaseline`)).rows[0];
  if(!previous)assert(counts.installations===0&&counts.bindings===0&&counts.jobs===0);
  Object.assign(report,{passed:true,project:'bivajljcdeofyxzmplxm',version:'20261105110000',migrationSha256:digest,
    sqlEditorSha256:crypto.createHash('sha256').update(sql).digest('hex'),rolledBackDryRunPassed:true,alreadyApplied:Boolean(previous),counts});
}catch(error:any){
  report.stage=stage;report.failureCode=String(error?.code||'VERIFICATION_FAILED').slice(0,60);process.exitCode=1;
}finally{await db?.close();}
fs.writeFileSync('docs/verification/device-push-2026-11-05/live-sql-application.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
