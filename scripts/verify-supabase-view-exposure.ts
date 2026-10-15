/** Real archived Google subjects/sessions, isolated PostgreSQL only. Product
 * relationships are confined to the restore; no Auth/provider replies are invented. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabasePublicSettings} from '../supabase/publicSettings.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {issueManagerKey,checkManagerKey} from '../supabase/managerKeys.js';
import {reserveMedia,finishMedia,mediaUrl} from '../supabase/media.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
import {prepareCheckout,fulfillCheckout} from '../supabase/payments.js';
import {saveListing} from '../supabase/inventory.js';
import {createOrder,changeOrder} from '../supabase/orders.js';
import {purchaseReview} from '../supabase/marketConversation.js';
import {loadOrderPins} from '../supabase/orderPins.js';
import {publicProducts} from '../supabase/catalog.js';
const catalogs=['residence_catalog','store_catalog','listing_catalog','market_reviews_public','listing_media_public','listing_price_options_public'];
const operational=['housing_staff_directory','housing_issue_details','housing_bargain_details','account_activity_feed','housing_staff_reviews','housing_meeting_details','housing_meeting_participants','seller_application_details'];
const names=[...catalogs,...operational],version='20261012212513';
dotenv.config({quiet:true});const [checkpoint,applicationCheckpoint,mode]=process.argv.slice(2);const projectionsOnly=mode==='--projections-only';
if(![4,5].includes(process.argv.length)||(mode!==undefined&&!projectionsOnly)||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks=0,stage='restore';const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
try{await withIsolatedBackup(checkpoint,async config=>{const db=new SupabaseDatabase(config);
try{
 const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as d`)).rows[0].d;
 const beforeAuth=await authDigest();
 const fixture=await db.system(async c=>{
  stage='native subjects';
  const people=(await c.query(`select u.id,u.email,u.email_confirmed_at,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') as name,s.id as session_id from auth.users u
   join lateral(select id from auth.sessions where user_id=u.id and(not_after is null or not_after>now()) order by created_at desc limit 1)s on true
   where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
   order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 6`)).rows;
  check(people.length===6,'Six genuine verified Google subjects and native sessions');
  const primaries:VerifiedActor[]=[];
  for(const p of people){await c.query('select private.initialize_auth_profile($1,null)',[p.id]);const id=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;primaries.push({authUserId:p.id,sessionId:p.session_id,contextId:id,kind:'primary'});}
  for(let i=2;i<6;i++)await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[people[i].id,people[i%2].id]);
  const context=async(i:number,kind:string,owner:number,status='active'):Promise<VerifiedActor>=>({authUserId:people[i].id,sessionId:people[i].session_id,kind,contextId:(await c.query('insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,$3,$4) returning id',[people[i].id,kind==='admin'?null:people[owner].id,kind,status])).rows[0].id});
  const admin=await context(0,'admin',0),managers=[await context(2,'manager',0),await context(3,'manager',1)],residents=[await context(4,'resident',0),await context(3,'resident',1)],staff=[await context(5,'staff',1),await context(2,'staff',0)],sellers=[await context(4,'seller',0,'pending'),await context(5,'seller',1,'pending')];
  await c.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[admin.contextId]);
  const settingsKey=crypto.randomBytes(32).toString('hex');
  await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at) values($1,$2,now(),$3,now())',[admin.contextId,await hashCredentialAsync('approval:'+admin.contextId+':'+crypto.randomBytes(32).toString('hex')),await hashCredentialAsync('settings:'+admin.contextId+':'+settingsKey)]);
  const bind=async(a:VerifiedActor)=>{await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3) on conflict(session_id) do update set active_context_id=excluded.active_context_id',[a.sessionId,a.authUserId,a.contextId]);await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);};
  const homes:any[]=[],stores:any[]=[];
  stage='housing relationships';
  for(let i=0;i<2;i++){
   await bind(managers[i]);const h=(await c.query("insert into public.residences(primary_owner_id,name,status,setup_submitted_at) values($1,$2,'approved',now()) returning id",[people[i].id,people[i].name])).rows[0].id;
   await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[managers[i].contextId,h]);
   const block=(await c.query('insert into public.blocks(residence_id,name) values($1,$2) returning id',[h,people[i].name])).rows[0].id;
   const floor=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[block])).rows[0].id;
   const room=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[floor])).rows[0].id;
   const bed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[room])).rows[0].id;
   const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id',[residents[i].contextId,room,bed])).rows[0].id;
   const assignment=(await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id,assigned_block_id) values($1,$2,$3,$4) returning id',[staff[i].contextId,h,managers[i].contextId,block])).rows[0].id;
   await c.query("insert into public.maintenance_issues(residence_id,room_id,allocation_id,reporter_context_id,assigned_staff_id,title) values($1,$2,$3,$4,$5,$6)",[h,room,allocation,residents[i].contextId,assignment,people[i].name]);
   await c.query("insert into public.staff_bargains(staff_assignment_id,manager_context_id,proposed_terms,reason_to_quit,original_role,original_shift,original_block_id) select id,$2,$3,$4,job_role,shift,assigned_block_id from public.staff_assignments where id=$1",[assignment,managers[i].contextId,JSON.stringify({type:'custom',title:people[i].name,proposedTerms:people[i].email,notes:''}),people[i].email]);
   await bind(residents[i]);await c.query('insert into public.staff_reviews(allocation_id,staff_assignment_id,resident_context_id,rating,comment) values($1,$2,$3,5,$4)',[allocation,assignment,residents[i].contextId,people[i].name]);
   await c.query(`insert into public.meetings(residence_id,requested_by_context_id,manager_context_id,participant_context_id,allocation_id,requester_type,contact_name,contact_email,contact_phone,room_label,topic,category,starts_at,ends_at,mode,notes)
    select $1,$2,$3,c.id,$4,'resident',p.display_name,p.email,coalesce(p.phone,''),'1',$5,'General Consultation',now()+interval '1 day',now()+interval '1 day 30 minutes','In-Person (Admin Office)','' from public.account_contexts c join public.profiles p on p.id=c.auth_user_id where c.id=$2`,[h,residents[i].contextId,managers[i].contextId,allocation,people[i].name]);
   await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'view_boundary_check','residence',$2)",[managers[i].contextId,h]);
   await bind(admin);await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values($1,$2,'residence_registration','approved')",[managers[i].contextId,h]);
   homes.push({id:h,room,block,allocation,assignment});
  }
  stage='seller relationships';
  for(let i=0;i<2;i++){
   await bind(primaries[i]);const p=people[i+4];const e=(await c.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,auth_user_id,linked_context_id,status,verified_at,expires_at)
    values($1,$2,'seller',$3,$4,$5,$6,'pending_review',$7,now()+interval '1 day') returning id`,[primaries[i].contextId,people[i].id,p.email.toLowerCase(),crypto.randomBytes(32).toString('hex'),p.id,sellers[i].contextId,p.email_confirmed_at])).rows[0].id;
   const app=(await c.query('insert into public.seller_applications(seller_context_id,enrollment_id,campus,primary_category,student_id,proposed_store_name) values($1,$2,$3,$4,$5,$6) returning id',[sellers[i].contextId,e,p.name,'General Campus Essentials','PV-VIEWS-'+i,p.name])).rows[0].id;
   await bind(admin);await c.query("update public.seller_applications set status='approved',reviewed_at=now(),reviewed_by_context_id=$2 where id=$1",[app,admin.contextId]);
   await c.query("update public.account_contexts set status='active' where id=$1",[sellers[i].contextId]);
   const store=(await c.query('insert into public.stores(seller_context_id,primary_owner_id,name,campus,primary_category,username,location,phone_country,primary_phone,delivery_mode,setup_completed_at) values($1,$2,$3,$3,$4,$5,$3,\'GH\',\'+233241234567\',\'Campus Meetup\',now()) returning id',[sellers[i].contextId,people[i].id,p.name,'General Campus Essentials',p.email.split('@')[0]])).rows[0].id;stores.push(store);
  }
  stage='historical migrations';const applied=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)&&f.slice(0,14)<version).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),v=file.slice(0,14),d=crypto.createHash('sha256').update(sql).digest('hex');if(applied.has(v))assert.equal(applied.get(v),d);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[v,d]);}
  }
  for(const a of [admin,...managers,...residents,...staff,...sellers])await bind(a);
  return{admin,managers,residents,staff,sellers,primaries,homes,stores,settingsKey};
 });
 const {admin,managers,residents,staff,sellers,primaries,homes,stores}=fixture;
 const bind=async(a:VerifiedActor)=>db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[a.sessionId,a.contextId]));
 const read=async(a:VerifiedActor,schema:string,name:string)=>{await bind(a);return db.readActor(a,c=>c.query(`select coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text),'[]'::jsonb) as rows from ${schema}.${name} v`)).then(r=>r.rows[0].rows);};
 stage='before migration reads';const actors=[admin,...managers,...residents,...staff,...sellers,primaries[0],primaries[1]],snapshots:any[]=[];
 for(const a of actors)for(const n of names)snapshots.push({a,n,rows:await read(a,'public',n)});
 const beforeAcl=(await db.pool.query(`select n.nspname,c.relname,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in('public','private') order by 1,2`)).rows;
 const beforePolicies=(await db.pool.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
 stage='new migration';const file=fs.readdirSync('supabase/migrations').find(f=>f.startsWith(version+'_'))!;const ddl=fs.readFileSync('supabase/migrations/'+file,'utf8');
 await db.system(async c=>{await c.query(ddl);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,crypto.createHash('sha256').update(ddl).digest('hex')]);});
 stage='after migration boundaries';
 const catalogRole=(await db.pool.query("select rolcanlogin,rolbypassrls,rolinherit from pg_roles where rolname='pinevela_catalog'")).rows[0];check(!catalogRole.rolcanlogin&&!catalogRole.rolbypassrls&&!catalogRole.rolinherit,'Catalog role has no login, BYPASSRLS or inherited membership');
 check(!(await db.pool.query("select has_schema_privilege('anon','private','usage') as allowed")).rows[0].allowed,'Private schema remains inaccessible to anonymous browser');
 const executable=(await db.pool.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and has_function_privilege('pinevela_catalog',p.oid,'execute') order by 1")).rows.map(r=>r.proname);assert.deepEqual(executable,['platform_access_allowed','residence_has_reviewed_setup','residence_is_public','store_is_public']);checks++;

 for(const s of snapshots){assert.deepEqual(await read(s.a,'private',s.n),s.rows,'Projection rows and fields stay identical for each real portal');checks++;}
 check((await db.pool.query("select count(*) from pg_views where schemaname='public'")).rows[0].count==='0','No owner-executed view remains in exposed public');
 assert.deepEqual((await db.pool.query(`select n.nspname,c.relname,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in('public','private') order by 1,2`)).rows,beforeAcl);checks++;
 assert.deepEqual((await db.pool.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,beforePolicies);checks++;
 async function denied(work:()=>Promise<unknown>,code:string,label:string){let e:any;try{await work();}catch(x){e=x;}check(e?.code===code||e instanceof ApiError&&String(e.status)===code,label);}
 for(const n of names){
  await denied(()=>db.system(async c=>{await c.query('set local role authenticated');await c.query('select * from private.'+n);}), '42501','Browser role cannot query backend projections');
  const grants=(await db.pool.query(`select has_table_privilege('anon',$1,'select') as anon,has_table_privilege('pinevela_backend',$1,'select') as backend,has_table_privilege('anon',$1,'insert,update,delete,truncate') as anon_write,has_table_privilege('authenticated',$1,'insert,update,delete,truncate') as user_write,has_table_privilege('pinevela_backend',$1,'insert,update,delete,truncate') as backend_write`,['private.'+n])).rows[0];
  check(!grants.anon&&grants.backend&&!grants.anon_write&&!grants.user_write&&!grants.backend_write,'Only six safe catalog reads and scoped backend reads are granted');
  await denied(()=>db.system(async c=>{await c.query('set local role anon');await c.query('select * from private.'+n);}), '42501','Anonymous browser cannot query moved projections');
  if(operational.includes(n))await denied(()=>db.publicRows('select * from private.'+n),'42501','Catalog role cannot read private operational projections');
 }
 for(let i=0;i<2;i++){
  for(const n of ['housing_staff_directory','housing_issue_details','housing_meeting_details']){const rows=await read(managers[i],'private',n);check(rows.length===1&&rows[0].residence_id===homes[i].id,'Manager reads only assigned house dossier');}
  check((await read(managers[i],'private','housing_meeting_participants')).length===2,'Assigned manager sees actual resident/staff participants');
  for(const n of ['housing_bargain_details','housing_staff_reviews']){const rows=await read(managers[i],'private',n);check(rows.length===1&&rows[0].residence_id===homes[i].id,'Employment proposals and resident reviews stay within house');}
  check((await read(managers[i],'private','account_activity_feed')).length===1,'Manager audit feed contains own activity only');
  const r=await read(primaries[i],'private','seller_application_details');check(r.length===1&&r[0].seller_context_id===sellers[i].contextId,'Primary sees only saved owned seller registration');
  check((await read(residents[i],'private','housing_issue_details')).length===1,'Resident sees own maintenance dossier');
  check((await read(staff[i],'private','housing_meeting_participants')).length===0,'Staff cannot enumerate appointment contacts');
 }
 check((await db.publicRows('select id from private.residence_catalog')).length===2,'Guest receives only the two reviewed residence cards');
 await denied(()=>db.publicRows('select * from public.profiles'),'42501','Guest base profile access is still denied');
 await denied(()=>db.publicRows('select * from private.account_sessions'),'42501','Private schema usage grants no private session table access');
 if(!projectionsOnly){
 stage='actual free activation and public market reads';
 await db.system(c=>c.query("insert into private.platform_settings(key,value) values('platform',$1) on conflict(key) do update set value=excluded.value",[JSON.stringify({registrationFee:0})]));
 for(let i=0;i<2;i++){
  await bind(sellers[i]);await db.authorizedSystem(sellers[i],['seller'],async c=>{const q=await prepareCheckout(c,sellers[i],{requestId:crypto.randomUUID(),purpose:'activation',plan:'default'},'http://127.0.0.1:3001');check(q.record.mode==='free','Zero-price native activation does not fabricate paid provider evidence');await fulfillCheckout(c,q.record.id);});
 }
 const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),512);
 await bind(sellers[0]);const asset=await db.authorizedSystem(sellers[0],['seller'],async c=>{const a=await reserveMedia(c,sellers[0],'market',image);await finishMedia(c,sellers[0],a.id);return a;});
 const itemResult=await db.authorizedSystem(sellers[0],['seller'],c=>saveListing(c,sellers[0],{title:'View authorization verification',description:'Isolated native verification',price:10,category:'General Campus Essentials',stockQuantity:5,isService:false,condition:'Like New',meetingLocation:'Campus Meetup',imageUrl:mediaUrl(asset.id)}));
 const item=itemResult.product;
 await db.authorizedSystem(sellers[0],['seller'],c=>saveListing(c,sellers[0],{title:'Isolated service projection check',description:'Isolated native verification',price:10,category:'Professional Services',isService:true,serviceCategory:'Laundry & Cleaning',serviceLocationMode:'flexible',meetingLocation:'Campus Meetup',callLine:'+233241234567',workingDays:'Mon - Fri',openingTime:'08:00',closingTime:'18:00',isOpen247:false,imageUrl:mediaUrl(asset.id),priceCategories:[{name:'Standard',price:10}]}));
 check((await db.publicRows('select id from private.store_catalog')).length===2,'Guest store cards still require native verified access periods');
 check((await publicProducts(db,stores[0])).length===2,'Actual catalog product API reads moved projections');
 check((await db.publicRows('select id from private.listing_media_public')).length===2,'Published item images remain available through safe projection');
 check((await db.publicRows('select id from private.listing_price_options_public')).length===1,'Published price choices remain available');
 check((await db.system(c=>c.query('select private.media_asset_is_public($1) as available',[asset.id]).then(r=>r.rows)))[0].available,'Media publication helper follows moved catalogs');
 await bind(primaries[1]);const pins=loadOrderPins();const order=(await db.authorizedSystem(primaries[1],['primary'],c=>createOrder(c,primaries[1],{requestId:crypto.randomUUID(),productId:item.id,quantity:1,buyerPhone:'+233241234567',meetingLocation:'Campus Meetup'},pins))).order;
 await bind(sellers[0]);await db.authorizedSystem(sellers[0],['seller'],c=>changeOrder(c,sellers[0],order.id,{action:'agree-location'},pins));await db.authorizedSystem(sellers[0],['seller'],c=>changeOrder(c,sellers[0],order.id,{newStatus:'Completed & Paid',inputPin:order.otpPin},pins));
 await bind(primaries[1]);await db.authorizedSystem(primaries[1],['primary'],c=>purchaseReview(c,primaries[1],{orderId:order.id,rating:5,review:'Isolated native completed purchase'}));
 const reviews=await db.publicRows('select * from private.market_reviews_public');check(reviews.length===1&&reviews[0].listing_id===item.id&&!('buyer_context_id' in reviews[0]),'Completed purchase reputation exposes no buyer identity');
 const published=(await publicProducts(db,stores[0])).find(p=>p.id===item.id)!;check(published.rating===5&&published.storeRating===5,'Catalog listing and store ratings still derive from actual receipt review');
 stage='maintenance boundary';await bind(admin);await new SupabasePublicSettings(new SupabaseAuth(db)).update(admin,{settingsKey:fixture.settingsKey,maintenanceMode:true});
 for(const n of catalogs){await denied(()=>db.publicRows('select * from private.'+n),'503','Public API reads pause during maintenance');const r=await db.system(async c=>{await c.query('set local role pinevela_catalog');return c.query('select * from private.'+n);});check(r.rowCount===0,'Catalog projection itself also fails closed during maintenance');}
 }
 const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
 fs.writeFileSync('.security/migration-reset/view-exposure-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});check(advisor.status===0,'Native security advisors complete');const report=JSON.parse(advisor.stdout.toString());const findings=report.results||report.result||report.data||report;check(Array.isArray(findings)&&findings.length===0,'No security advisor findings remain in exposed schema');
 check(await authDigest()===beforeAuth,'Genuine Auth users/identities/native sessions remain unchanged');
 const result={passed:true,checks,projectionsOnly,projectionMigration:version,isolatedNative:true,cloudWrites:false,genuineArchivedGoogleIdentities:true,authRecordsChanged:false,providerRepliesMocked:false,exposedViews:0,securityAdvisorFindings:0};fs.writeFileSync('.security/migration-reset/'+(projectionsOnly?'view-exposure-boundaries-native.json':'view-exposure-native.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}finally{await db.close();}
},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/view-exposure-test-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Isolated native verification failed; diagnostics saved privately.'}));process.exitCode=1;}
