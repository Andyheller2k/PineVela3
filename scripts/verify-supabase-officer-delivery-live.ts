/** Read-only ledger/privilege evidence; no identities, keys or session values printed. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase();
try {
  const ledger=(await db.pool.query('select version,digest from private.schema_migrations')).rows;
  const files=fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
  assert.equal(ledger.length,files.length);
  for(const file of files)assert.equal(ledger.find(r=>r.version===file.slice(0,14))?.digest,
    crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+file)).digest('hex'));
  const state=(await db.pool.query(`select
    (select count(*)::int from auth.users) as "authUsers",
    (select count(*)::int from auth.sessions) as "nativeSessions",
    (select count(*)::int from public.profiles) as profiles,
    (select count(*)::int from storage.objects) as "storageObjects",
    (select count(*)::int from public.account_contexts where kind='officer') as officers,
    (select count(*)::int from private.account_enrollments where kind='officer') as "officerInvitations",
    (select count(*)::int from private.room_key_deliveries) as deliveries,
    (select relrowsecurity from pg_class where oid='private.room_key_deliveries'::regclass) as "deliveryRls",
    has_table_privilege('authenticated','private.room_key_deliveries','SELECT') as "browserCanReadDeliveries",
    has_table_privilege('pinevela_backend','private.room_key_deliveries','SELECT') as "scopedBackendCanReadDeliveries",
    has_function_privilege('authenticated','private.room_key_delivery_recipient(text)','EXECUTE') as "browserCanResolveRecipients",
    has_function_privilege('pinevela_backend','private.room_key_delivery_recipient(text)','EXECUTE') as "scopedBackendCanResolveRecipients",
    has_function_privilege('authenticated','private.officer_invitation_acceptance_allowed(private.account_enrollments,uuid)','EXECUTE') as "browserCanAdmitOfficers"
    `)).rows[0];
  assert(state.deliveryRls);
  for(const key of ['browserCanReadDeliveries','scopedBackendCanReadDeliveries','browserCanResolveRecipients',
    'scopedBackendCanResolveRecipients','browserCanAdmitOfficers'])assert.equal(state[key],false);
  const result={passed:true,migrationHashesMatch:true,migrations:ledger.length,readOnly:true,credentialsPrinted:false,...state};
  fs.writeFileSync('.security/migration-reset/officer-delivery-live.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
}finally {await db.close();}
