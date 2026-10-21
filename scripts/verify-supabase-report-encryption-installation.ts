/** Read-only hosted installation checks. Real-account positive/negative tests
 * run in the isolated native harness, never against customer records. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';

dotenv.config({quiet:true});
const db=new SupabaseDatabase();
try {
  const files=fs.readdirSync('supabase/migrations').filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
  await db.system(async client=>{
    await client.query('set transaction read only');
    const ledger=await client.query('select version,digest from private.schema_migrations');
    const applied=new Map(ledger.rows.map(row=>[row.version,row.digest]));
    assert.equal(applied.size,files.length,'Every reviewed migration is installed');
    for(const name of files)assert.equal(applied.get(name.slice(0,14)),crypto.createHash('sha256').update(fs.readFileSync(`supabase/migrations/${name}`)).digest('hex'),'Installed migration matches reviewed source');
    const names=['market_chat_keys','content_reports','content_report_evidence','content_report_recommendations','content_report_decisions','content_report_events'];
    const tables=await client.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='private' and c.relkind='r' and c.relname=any($1::text[])`,[names]);
    assert.equal(tables.rowCount,names.length);assert(tables.rows.every(row=>row.relrowsecurity));
    const grants=await client.query(`select actor,relation,
      has_table_privilege(actor,'private.'||relation,'select') as read,
      has_table_privilege(actor,'private.'||relation,'insert,update,delete,truncate') as write
      from unnest(array['anon','authenticated','pinevela_catalog','pinevela_backend']) actor cross join unnest($1::text[]) relation`,[names]);
    assert(grants.rows.every(row=>!row.write&&row.read===(row.actor==='pinevela_backend')),'Only scoped backend SELECT is granted');
    const policies=await client.query(`select tablename,cmd,roles::text[] as roles from pg_policies where schemaname='private' and tablename=any($1::text[])`,[names]);
    assert.equal(policies.rowCount,names.length);assert(policies.rows.every(row=>row.cmd==='SELECT'&&row.roles.length===1&&row.roles[0]==='pinevela_backend'));
    const guards=await client.query(`select p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private' and p.proname=any($1::text[])`,[['immutable_chat_identity','require_encrypted_market_message','guard_content_report_history']]);
    assert.equal(guards.rowCount,3);assert(guards.rows.every(row=>!row.prosecdef&&row.proconfig.includes('search_path=""')));
    const execution=await client.query(`select has_function_privilege(actor,'private.'||routine||'()','execute') as allowed
      from unnest(array['anon','authenticated','pinevela_backend']) actor cross join
      unnest(array['immutable_chat_identity','require_encrypted_market_message','guard_content_report_history']) routine`);
    assert(execution.rows.every(row=>!row.allowed),'Private trigger functions cannot be called directly');
    const triggers=await client.query(`select t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and (n.nspname='private' and c.relname=any($1::text[]) or n.nspname='public' and c.relname='market_messages')
      and t.tgname=any($2::text[])`,[names,['immutable_chat_identity','encrypted_message_boundary','content_report_identity','content_report_evidence_history','content_report_recommendation_history','content_report_decision_history','content_report_event_history']]);
    assert.equal(triggers.rowCount,7);assert(triggers.rows.every(row=>row.tgenabled==='O'));
    const columns=await client.query(`select table_schema,table_name,column_name,udt_name from information_schema.columns
      where (table_schema='public' and table_name='market_messages' and column_name in('encryption_version','recipient_context_id','encrypted_payload'))
      or (table_schema='private' and table_name='content_report_evidence' and column_name='plaintext')`);
    assert.equal(columns.rowCount,4);assert.equal(columns.rows.find(row=>row.column_name==='plaintext')?.udt_name,'bytea');
    const invalid=await client.query(`select count(*)::int as count from public.market_messages where encryption_version=1 and (body<>'' or encrypted_payload is null or recipient_context_id is null)`);
    assert.equal(invalid.rows[0].count,0,'Encrypted records contain ciphertext only');
  });
  const origin='http://127.0.0.1:3001';
  for(const [method,route] of [['GET','/api/digital-market/encryption'],['POST','/api/digital-market/encryption/peer'],['GET','/api/reports'],['GET','/api/customer-service/reports'],['GET','/api/admin/reports']]){
    assert.equal((await fetch(origin+route,{method,signal:AbortSignal.timeout(10000),redirect:'error'})).status,401,'Live private routes require a verified account');
  }
  assert.equal((await fetch(origin,{signal:AbortSignal.timeout(10000),redirect:'error'})).status,200);
  console.log(JSON.stringify({verified:true,installedMigrations:files.length,migrationDigestsMatch:true,newPrivateTablesWithRLS:6,browserWriteGrants:0,immutableGuards:7,livePrivateRoutesRequireAuth:true,customerRecordsModified:0}));
} finally {await db.close();}
