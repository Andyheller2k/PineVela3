/** Read-only catalog/receipt verification; never exports hosted account data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';

dotenv.config({quiet:true});
const phase=process.argv[2];assert(['before','after'].includes(phase),'Choose before or after.');
const directory=path.resolve('.security/remediation-2026-10-20'),db=new SupabaseDatabase();
const versions=['20261020214438','20261020220934','20261020221203','20261020221812'];
try{
 const ledger=new Map((await db.pool.query('select version,digest from private.schema_migrations')).rows.map(row=>[row.version,row.digest]));
 for(const name of fs.readdirSync('supabase/migrations').filter(name=>/^\d{14}_.*\.sql$/.test(name))){
  const version=name.slice(0,14);if(ledger.has(version))assert.equal(ledger.get(version),crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+name)).digest('hex'),'Installed migration digest must match source.');
 }
 const payment=(await db.pool.query("select count(*)::int as count,md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb)::text) as digest from public.payments p")).rows[0];
 const result:any={phase,readOnly:true,checkedAt:new Date().toISOString(),installed:versions.filter(version=>ledger.has(version)),payment,hostedTestWrites:0};
 if(phase==='after'){
  const before=JSON.parse(fs.readFileSync(path.join(directory,'hosted-before.json'),'utf8'));
  assert.equal(result.installed.length,4,'All four reviewed migrations must be installed.');
  assert.deepEqual(payment,before.payment,'Every original hosted payment/receipt remains byte-equivalent.');result.originalPaymentsPreserved=true;
  const privateTables=(await db.pool.query("select relname,relrowsecurity from pg_class where oid in ('private.payment_reversals'::regclass,'private.payment_reversal_events'::regclass)")).rows;
  assert(privateTables.length===2&&privateTables.every(table=>table.relrowsecurity));
  for(const role of ['anon','authenticated','pinevela_backend','pinevela_catalog'])for(const table of privateTables)
   assert.equal((await db.pool.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed",[role,'private.'+table.relname])).rows[0].allowed,false);
  const guards=(await db.pool.query(`select p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as authenticated
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
   and p.proname in ('check_payment_reversal','payment_grants_access','check_paid_period','check_market_order_event','check_order_notification_reference')`)).rows;
  assert(guards.length===5&&guards.every(fn=>fn.proconfig?.includes('search_path=""')&&!fn.anon&&!fn.authenticated));
  const indexes=(await db.pool.query("select indexname from pg_indexes where indexname in ('market_messages_buyer_history_idx','market_messages_store_history_idx','market_orders_buyer_history_idx','market_orders_store_history_idx','market_order_events_history_idx','market_orders_expiration_idx','notifications_market_order_idx')")).rows;
  assert.equal(indexes.length,7);
  result.rlsAndRestrictedGuardsVerified=true;result.historyIndexesVerified=true;
 }
 fs.writeFileSync(path.join(directory,'hosted-'+phase+'.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({passed:true,phase,installed:result.installed.length,readOnly:true,originalPaymentsPreserved:result.originalPaymentsPreserved}));
}catch(error:any){console.error(JSON.stringify({passed:false,phase,code:error.code||'verification_failed'}));process.exitCode=1;}
finally{await db.close();}
