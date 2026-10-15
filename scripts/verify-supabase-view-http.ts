/** Read-only live metadata and actual HTTP/Data API checks. No identity, cookie,
 * payment, domain row, private key or provider response is fabricated. */
import assert from 'node:assert/strict';import fs from 'node:fs';import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
dotenv.config({quiet:true});const db=new SupabaseDatabase(),base='http://127.0.0.1:3001';
const names=['residence_catalog','store_catalog','listing_catalog','market_reviews_public','listing_media_public','listing_price_options_public','housing_staff_directory','housing_issue_details','housing_bargain_details','account_activity_feed','housing_staff_reviews','housing_meeting_details','housing_meeting_participants','seller_application_details'];
let checks=0;const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
try{
 const schema=(await db.pool.query(`select (select count(*) from pg_views where schemaname='public')::int as public_views,
 (select count(*) from pg_views where schemaname='private' and viewname=any($1))::int as private_views,
 (select count(*) from pg_tables where schemaname='public' and not rowsecurity)::int as missing_rls,
 (select count(*) from private.schema_migrations)::int as versions`,[names])).rows[0];
 check(schema.public_views===0&&schema.private_views===14&&schema.missing_rls===0&&schema.versions===54,'Live schema matches private projection migration');
 const grants=(await db.pool.query(`select c.relname,has_table_privilege('anon',c.oid,'select,insert,update,delete') as anonymous,
 has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as browser,
 has_table_privilege('pinevela_backend',c.oid,'select') as backend,has_table_privilege('pinevela_catalog',c.oid,'select') as catalog
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname=any($1)`,[names])).rows;
 check(grants.length===14&&grants.every(r=>!r.anonymous&&!r.browser&&r.backend)&&grants.filter(r=>r.catalog).length===6,'No browser grants and exactly six catalog grants');
 const role=(await db.pool.query("select rolcanlogin,rolinherit,rolbypassrls from pg_roles where rolname='pinevela_catalog'")).rows[0];check(!role.rolcanlogin&&!role.rolinherit&&!role.rolbypassrls,'Live catalog role is narrow and non-login');
 for(const actor of ['anon','authenticated','authenticator','pinevela_backend'])check(!(await db.pool.query("select pg_has_role($1,'pinevela_catalog','MEMBER') as allowed",[actor])).rows[0].allowed,'Browser/Data API roles have no catalog-role membership');
 for(const [route,status,array] of [['/api/health',200,false],['/api/hostels',200,true],['/api/digital-market/products',200,true],['/api/admin/digital-market/applications',401,false],['/api/staff',401,false],['/api/issue-reports',401,false],['/api/staff-bargains',401,false],['/api/activities',401,false],['/api/admin/manager-closure-requests',401,false]] as const){const r=await fetch(base+route,{signal:AbortSignal.timeout(45000)}),d=await r.json();check(r.status===status&&(!array||Array.isArray(d)),'Actual public catalog and private API boundaries');}
 const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('Configured project API key is required.');
 for(const n of names){const r=await fetch(new URL('/rest/v1/'+n+'?select=*&limit=0',process.env.SUPABASE_URL),{headers:{apikey:key},signal:AbortSignal.timeout(20000)});const d=await r.json();check(r.status===404&&['PGRST205','42P01'].includes(d.code),'Removed public projection has no direct Data API endpoint');}
 const r=await fetch(new URL('/rest/v1/residence_catalog?select=*&limit=0',process.env.SUPABASE_URL),{headers:{apikey:key,'Accept-Profile':'private'},signal:AbortSignal.timeout(20000)}),d=await r.json();check(r.status===406&&d.code==='PGRST106','Private schema is excluded from live Data API');
 const result={passed:true,checks,liveHttp:true,liveDataApi:true,liveMetadata:true,domainWrites:false,exposedViews:0,privateViews:14,browserProjectionGrants:0,privateSchemaExposed:false};fs.writeFileSync('.security/migration-reset/view-exposure-http.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}catch(e){console.error(JSON.stringify({passed:false,checks,error:e instanceof assert.AssertionError?e.message:'Live view verification failed; credentials suppressed.'}));process.exitCode=1;}finally{await db.close();}
