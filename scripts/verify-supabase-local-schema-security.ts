/** Read-only inspection of the actual owned local native schema and immutable
 * application migration ledger. No session claims, policies or rows are seeded. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readLocalFixture,saveLocalFixture,signInLocalAccount,runLocalSupabaseVerification,type LocalAccountCredentials} from './lib/local-supabase-harness.js';
let checks=0,stage='native schema inventory';const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
try{await runLocalSupabaseVerification(async h=>{
 await h.assertOwned();
 const files=fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
 const ledger=(await h.db.pool.query('select version,digest from private.schema_migrations order by version')).rows;
 check(ledger.length===files.length&&ledger.length===75,'Exactly the current 75 immutable migration versions are installed');
 for(const file of files){const version=file.slice(0,14),digest=crypto.createHash('sha256').update(fs.readFileSync(path.join('supabase/migrations',file))).digest('hex');
  check(ledger.find(r=>r.version===version)?.digest===digest,'Actual migration digest matches its immutable source');}
 const tables=(await h.db.pool.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in('r','p') order by c.relname`)).rows;
 check(tables.length===37,'Actual application table inventory remains complete');
 for(const table of tables)check(table.relrowsecurity===true,'Every actual public application table retains RLS');
 const roles=(await h.db.pool.query(`select rolname,rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_roles
  where rolname in('pinevela_backend','pinevela_catalog') order by rolname`)).rows;
 check(roles.length===2,'Both native server-selected database roles exist');
 for(const role of roles)check(!role.rolcanlogin&&!role.rolbypassrls&&!role.rolsuper,'Native application roles cannot log in, bypass RLS or act as superuser');
 check(roles.find(r=>r.rolname==='pinevela_catalog')?.rolinherit===false,'Public catalog role does not inherit unrelated role privileges');
 const privilegedMembership=(await h.db.pool.query(`select pg_has_role('pinevela_backend','service_role','member') as backend,
  pg_has_role('pinevela_catalog','service_role','member') as catalog`)).rows[0];
 check(!privilegedMembership.backend&&!privilegedMembership.catalog,'Application and catalog roles cannot inherit the provider service role');
 const views=(await h.db.pool.query(`select n.nspname,count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in('v','m') and n.nspname in('public','private') group by n.nspname`)).rows;
 check(!views.some(v=>v.nspname==='public'&&v.count>0),'Private application projections are not exposed as public views');
 check(views.find(v=>v.nspname==='private')?.count===14,'All 14 private application projections remain available');
 const privateTableLeaks=(await h.db.pool.query(`select n.nspname,c.relname,r.role from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join unnest(array['anon','authenticated']) r(role) where n.nspname='private' and c.relkind in('r','p')
   and (has_table_privilege(r.role,c.oid,'SELECT') or has_table_privilege(r.role,c.oid,'INSERT')
    or has_table_privilege(r.role,c.oid,'UPDATE') or has_table_privilege(r.role,c.oid,'DELETE')
    or has_table_privilege(r.role,c.oid,'TRUNCATE')) order by c.relname,r.role`)).rows;
 check(privateTableLeaks.length===0,'Browser database roles cannot read or mutate private lifecycle and credential tables');
 const anonProfile=(await h.db.pool.query(`select has_table_privilege('anon','public.profiles','SELECT') as profiles,
  has_table_privilege('authenticated','public.account_contexts','UPDATE') as promote,
  has_table_privilege('pinevela_catalog','private.residence_catalog','SELECT') as catalog`)).rows[0];
 check(!anonProfile.profiles&&!anonProfile.promote&&anonProfile.catalog,'Guest profile denial, context promotion denial and intentional catalog read remain intact');
 const definers=(await h.db.pool.query(`select n.nspname,p.proname,p.oid::regprocedure::text as signature,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in('public','private') order by n.nspname,p.proname`)).rows;
 check(!definers.some(f=>f.nspname==='public'&&(f.anon_execute||f.authenticated_execute||f.public_execute)),'No browser-callable SECURITY DEFINER function is exposed in public');
 const unsafeSearchPaths=definers.filter(f=>f.nspname==='private'&&!f.proconfig?.some((c:string)=>/^search_path=(?:""|)$/.test(c)));
 check(unsafeSearchPaths.length===0,'Private SECURITY DEFINER functions retain a fixed empty search path');
 const inheritedPublicExecute=definers.filter(f=>f.nspname==='private'&&f.public_execute);
 check(inheritedPublicExecute.length===0,'Private privileged functions do not inherit default PUBLIC execution');
 const dangerous=(await h.db.pool.query(`select p.oid::regprocedure::text as signature,r.role from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join unnest(array['anon','authenticated','pinevela_backend','pinevela_catalog']) r(role)
  where n.nspname='private' and p.proname in('run_residence_execution','run_primary_wipe','run_operational_wipe','run_system_wipe',
   'account_access','account_session_allowed','administrator_session_allowed','initialize_auth_profile')
   and has_function_privilege(r.role,p.oid,'EXECUTE') order by p.proname,r.role`)).rows;
 check(dangerous.length===0,'Direct client/backend roles cannot invoke privileged lifecycle, policy or session-management internals');
 const policyCounts=(await h.db.pool.query(`select schemaname,count(*)::int as count from pg_policies
  where schemaname in('public','private','storage') group by schemaname order by schemaname`)).rows;
 check(policyCounts.some(p=>p.schemaname==='public'&&p.count>0)&&policyCounts.some(p=>p.schemaname==='storage'&&p.count>0),'Actual public and private Storage RLS policies exist');
 const fixtures=readLocalFixture<{administrators:LocalAccountCredentials[];officer:LocalAccountCredentials}>(h,'administrator-fixtures.json');
 const support=readLocalFixture<{admin:LocalAccountCredentials;owner:LocalAccountCredentials}>(h,'support-browser.json');
 assert.ok(fixtures||support,'Use actual administrator and non-administrator credentials from this owned run');
 stage='actual provider-authenticated role projections';
 const admin=await signInLocalAccount(h,fixtures?fixtures.administrators[0]:support!.admin,'admin'),officer=await signInLocalAccount(h,fixtures?fixtures.officer:support!.owner,fixtures?'officer':undefined);
 check((await admin.session.request('/api/database/status')).status===200,'Actual provider-authenticated administrator reaches the live native database boundary');
 check((await officer.session.request('/api/database/status')).status===403,'Actual provider-authenticated non-administrator cannot enter the administrator database boundary');
 check((await h.session().request('/api/database/status')).status===401,'Guest cannot enter the live database boundary');
 const result={passed:true,checks,actualNativeDatabase:true,actualGoTrueRoleChecks:true,migrationVersions:ledger.length,
  immutableMigrationHashes:true,publicTables:tables.length,allPublicTablesRls:true,privateProjectionViews:14,
  browserPrivateTableGrants:privateTableLeaks.length,publicSecurityDefinerExposure:0,privateDefaultPublicExecute:inheritedPublicExecute.length,
  unsafeDefinerSearchPaths:unsafeSearchPaths.length,privilegedFunctionLeaks:dangerous.length,
  policyCounts,queriesReadOnly:true,claimsFabricated:0,cloudRecordsModified:0};
 saveLocalFixture(h,'schema-security-result.json',result);console.log(JSON.stringify(result));
});}catch(error){
 console.error(JSON.stringify({passed:false,stage,checks,error:'Native schema/security verification stopped; inspect private run diagnostics.'}));
 if(process.argv[2]==='--local-supabase-worker')throw error;process.exitCode=1;
}
