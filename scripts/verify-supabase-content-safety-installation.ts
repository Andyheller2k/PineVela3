/** Read-only hosted verification. No customer account, message or photo writes.
 * Real authenticated positive/negative workflows use the owned native harness. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { SupabaseDatabase } from '../supabase/db.js';

dotenv.config({ quiet: true });
const db = new SupabaseDatabase();
let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; };
try {
  const files = fs.readdirSync('supabase/migrations').filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
  let approvedPhotos = 0;
  await db.system(async c => {
    await c.query('set transaction read only');
    const ledger = new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(row => [row.version, row.digest]));
    check(ledger.size === files.length && files.length === 75, 'Every reviewed migration is installed');
    for (const file of files) check(ledger.get(file.slice(0,14)) === crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/' + file)).digest('hex'), 'Immutable migration digest matches source');
    const names = ['content_safety_checks', 'content_safety_decisions'];
    const tables = (await c.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname=any($1::text[]) and c.relkind='r'`, [names])).rows;
    check(tables.length === 2 && tables.every(row => row.relrowsecurity), 'Both private moderation tables enforce RLS');
    const grants = (await c.query(`select actor,relation,has_table_privilege(actor,'private.'||relation,'select') as read,has_table_privilege(actor,'private.'||relation,'insert,update,delete,truncate') as write from unnest(array['anon','authenticated','pinevela_catalog','pinevela_backend']) actor cross join unnest($1::text[]) relation`, [names])).rows;
    check(grants.every(row => !row.write && row.read === (row.actor === 'pinevela_backend')), 'Browser/catalog cannot read or write evidence; scoped backend has SELECT only');
    const policies = (await c.query(`select tablename,cmd,roles::text[] as roles from pg_policies where schemaname='private' and tablename=any($1::text[])`, [names])).rows;
    check(policies.length === 2 && policies.every(row => row.cmd === 'SELECT' && row.roles.length === 1 && row.roles[0] === 'pinevela_backend'), 'Evidence reads retain scoped policies');
    const functions = ['content_safety_approved','media_content_approved','listing_text_digest','store_text_digest','listing_content_approved','retain_content_safety_history','guard_media_content_safety','guard_profile_content_safety','guard_published_listing_safety','guard_store_content_safety'];
    const routines = (await c.query(`select p.oid,p.proname,p.proconfig,coalesce((select bool_or(a.grantee=0 and a.privilege_type='EXECUTE') from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a),false) as public_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=any($1::text[])`, [functions])).rows;
    check(routines.length === functions.length && routines.every(row => row.proconfig?.includes('search_path=""') && !row.public_execute), 'All moderation functions fix search_path and deny PUBLIC execution');
    const internal = routines.filter(row => !['content_safety_approved','media_content_approved','listing_content_approved'].includes(row.proname));
    for (const role of ['anon','authenticated','pinevela_backend','pinevela_catalog']) {
      const execution = (await c.query('select has_function_privilege($1::name,oid,\'execute\')as allowed from unnest($2::oid[])oid', [role, internal.map(row => row.oid)])).rows;
      check(execution.every(row => !row.allowed), 'Internal moderation functions cannot be invoked directly');
    }
    const triggers = (await c.query(`select tgname,tgenabled from pg_trigger where not tgisinternal and tgname=any($1::text[])`, [['content_safety_check_history','content_safety_decision_history','media_content_safety','profile_content_safety','listing_content_safety','listing_option_content_safety','listing_media_content_safety','store_content_safety']])).rows;
    check(triggers.length === 8 && triggers.every(row => row.tgenabled === 'O'), 'All immutable/publication guards are enabled');
    const restrictions = (await c.query(`select policyname,permissive,roles::text[]as roles from pg_policies where policyname=any($1::text[])`, [['content_safety_media_read','content_safety_storage_read','content_safety_listing_read']])).rows;
    check(restrictions.length === 3 && restrictions.every(row => row.permissive === 'RESTRICTIVE' && row.roles.length === 1 && row.roles[0] === 'authenticated'), 'Media/Storage/listing restrictions do not broaden existing access');
    const media = (await c.query("select id,owner_context_id,owner_auth_user_id,purpose,sha256,byte_size,state,private.media_content_approved(id)as approved from public.media_assets where purpose in('market','avatar') and state='ready' order by id")).rows;
    const baselinePath = '.security/nsfw-moderation/pre-activation-state.json';
    const baseline = JSON.parse(fs.readFileSync(baselinePath,'utf8'));
    check(JSON.stringify(media.map(({approved,...row}) => row)) === JSON.stringify(baseline.media), 'Existing photo ownership/digests/states are unchanged');
    check(media.length === 8 && media.every(row => row.approved), 'All eight existing photos have exact real-provider approvals'); approvedPhotos = media.length;
    const evidence = (await c.query("select verdict,model,provider_request_id,sexual_score,categories from private.content_safety_checks")).rows;
    check(evidence.length > 0 && evidence.every(row => row.verdict === 'approved' && row.model !== 'local-child-safety-guard' && !!row.provider_request_id && row.categories.sexual === false), 'Activation contains genuine approved provider receipts');
    const unmatched = (await c.query("select private.content_safety_approved(owner_context_id,case when purpose='market' then 'market_image' else 'avatar' end,repeat('0',64))as approved from public.media_assets where purpose in('market','avatar') and state='ready'")).rows;
    check(unmatched.length === 8 && unmatched.every(row => !row.approved), 'Approval cannot be reused for another content digest');
    const counts = (await c.query(`select (select count(*)::int from auth.users) as users,(select count(*)::int from public.profiles) as profiles,(select count(*)::int from public.media_assets) as assets,(select count(*)::int from private.support_tickets) as cases,(select count(*)::int from public.listings) as listings,(select count(*)::int from public.stores) as stores`)).rows[0];
    check(JSON.stringify(counts) === JSON.stringify(baseline.counts), 'Customer accounts, photos, support cases, listings and stores were not created or removed');
  });
  for (const role of ['anon','authenticated','pinevela_catalog']) {
    let denied = false;
    try { await db.system(async c => { await c.query('set transaction read only'); await c.query('set local role ' + role); await c.query('select count(*) from private.content_safety_checks'); }); }
    catch(error) { denied = (error as any)?.code === '42501'; }
    check(denied, 'Direct database reads of moderation evidence are denied to browser/catalog roles');
  }
  const unbound = await db.system(async c => { await c.query('set transaction read only'); await c.query('set local role pinevela_backend'); return (await c.query('select count(*)::int as count from private.content_safety_checks')).rows[0].count; });
  check(unbound === 0, 'An unbound scoped backend session cannot read another account evidence');
  const origin = 'http://127.0.0.1:3001';
  for (const [method,path] of [['GET','/api/customer-service/content-checks'],['GET','/api/customer-service/content-checks/00000000-0000-4000-8000-000000000001/image'],['POST','/api/admin/content-checks/00000000-0000-4000-8000-000000000001/decision'],['POST','/api/storage/upload-profile-image'],['POST','/api/storage/upload-market-image']]) {
    const response = await fetch(origin + path, { method, signal: AbortSignal.timeout(10000), redirect:'error' });
    check(response.status === 401, 'Live private moderation/upload routes require a native session'); await response.body?.cancel();
  }
  const foreign = await fetch(origin + '/api/admin/content-checks/00000000-0000-4000-8000-000000000001/decision', { method:'POST',headers:{origin:'https://cross-site.invalid'},signal:AbortSignal.timeout(10000) });
  check(foreign.status === 403, 'Cross-site decision requests are denied'); await foreign.body?.cancel();
  for (const path of ['/.env','/.security/nsfw-moderation/existing-content-provider.json','/dist-supabase-backend/supabase-server.mjs']) {
    const response = await fetch(origin + path, { signal:AbortSignal.timeout(10000),redirect:'error' });
    check(response.status === 404, 'Configuration, private moderation evidence and server bundles remain inaccessible'); await response.body?.cancel();
  }
  const health = await fetch(origin + '/api/health', {signal:AbortSignal.timeout(10000)});
  check(health.status === 200, 'Live app health responds'); await health.body?.cancel();
  const result = {passed:true,checks,installedMigrations:files.length,realApprovedExistingPhotos:approvedPhotos,customerRecordsChanged:0,privateRoutesRequireAuthentication:true};
  fs.writeFileSync('.security/nsfw-moderation/activation-verification.json',JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify(result));
} catch(error) {
  console.error(JSON.stringify({passed:false,checks,type:error?.constructor?.name,message:error instanceof assert.AssertionError?error.message:'Installation verification did not complete; inspect the current database and private evidence.'})); process.exitCode=1;
} finally { await db.close(); }
