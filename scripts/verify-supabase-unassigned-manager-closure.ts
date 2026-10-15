/** Isolated domain scenarios on genuine archived Google subjects and sessions.
 * No cloud writes, fake Auth rows, provider replies or payments. */
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {checkApprovalKey,deniedApprovalKey} from '../supabase/adminGovernance.js';
import {checkAdministratorSettingsKey,deniedKey} from '../supabase/adminSettings.js';
import {issueManagerKey,checkManagerKey,managerKeyStatus,petitionManagerKey,resetManagerKey} from '../supabase/managerKeys.js';
import {ownManagerClosure,submitManagerClosure,withdrawManagerClosure,managerClosureDirectory} from '../supabase/managerClosureRequests.js';
import {proposeAccountReview,voteAccountReview,applyAccountReview,expireAccountReviews,rejectFinalAccountReview} from '../supabase/accountReviews.js';
import {reactivateManager} from '../supabase/managerReactivation.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {primaryManagerRegistrationRestricted} from '../supabase/registrationRestrictions.js';
dotenv.config({quiet:true});const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks=0,stage='restore';function check(v:unknown,label:string){assert.ok(v,label);checks++;}
async function denied(work:()=>Promise<unknown>,status:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}check(typeof status==='number'?e instanceof ApiError&&e.status===status:e?.code===status,label);}
try{await withIsolatedBackup(checkpoint,async config=>{let db=new SupabaseDatabase(config);try{
 const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as d`)).rows[0].d;
 const beforeAuth=await authDigest();stage='fixture';const fixture=await db.system(async c=>{
  const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') as name,s.id as session_id from auth.users u join lateral(select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1)s on true where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email)) order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 6`)).rows;
  check(people.length===6,'Six genuine Google subjects with native sessions');const admins:VerifiedActor[]=[],keys:string[]=[],settings:string[]=[],owners:string[]=[];
  for(const [i,p]of people.entries()){
   await c.query('select private.initialize_auth_profile($1,null)',[p.id]);owners.push((await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id);
   if(i===5)continue;
   const contextId=(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active')returning id",[p.id])).rows[0].id;
   const a={authUserId:p.id,sessionId:p.session_id,contextId,kind:'admin'};admins.push(a);await c.query('insert into public.admin_memberships(context_id,slot)values($1,$2)',[contextId,i+1]);
   const key=crypto.randomBytes(32).toString('base64url'),setting=crypto.randomBytes(32).toString('base64url');keys.push(key);settings.push(setting);
   await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at)values($1,$2,clock_timestamp(),$3,clock_timestamp())',[contextId,await hashCredentialAsync(`approval:${contextId}:${key}`),await hashCredentialAsync(`settings:${contextId}:${setting}`)]);
   await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
  }
  const p=people[5];await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[p.id,people[0].id]);
  const contextId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'manager','active')returning id",[p.id,people[0].id])).rows[0].id;
  const manager:VerifiedActor={authUserId:p.id,sessionId:p.session_id,contextId,kind:'manager'};
  await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[manager.sessionId,manager.authUserId,contextId]);
  const enrollment=(await c.query("insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,status,verified_at,auth_user_id,linked_context_id,expires_at)values($1,$2,'manager',$3,$4,$5,'completed',clock_timestamp(),$6,$7,clock_timestamp()+interval'24 hours')returning id",[owners[0],people[0].id,p.email,crypto.randomBytes(32).toString('hex'),JSON.stringify({displayName:p.name,phone:''}),p.id,contextId])).rows[0].id;
  const home=(await c.query("insert into public.residences(primary_owner_id,name,status)values($1,$2,'closed')returning id",[people[0].id,p.name])).rows[0].id;
  const assignment=(await c.query('insert into public.manager_assignments(manager_context_id,residence_id,ended_at)values($1,$2,clock_timestamp())returning id',[contextId,home])).rows[0].id;
  const block=(await c.query('insert into public.blocks(residence_id,name)values($1,$2)returning id',[home,p.name])).rows[0].id;
  const floor=(await c.query('insert into public.floors(block_id,floor_number)values($1,0)returning id',[block])).rows[0].id;
  const room=(await c.query("insert into public.rooms(floor_id,room_number)values($1,'1')returning id",[floor])).rows[0].id;
  await c.query('insert into public.beds(room_id,bed_number)values($1,1)',[room]);
  await c.query('insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id)values($1,\'residence\',clock_timestamp()+interval\'30 days\',$2,$3)',[contextId,p.name,admins[0].contextId]);
  await c.query('insert into private.manager_settings(manager_context_id,value)values($1,$2)',[contextId,JSON.stringify({notificationPreferences:{enabled:true}})]);
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
   if(ledger.has(version))assert.equal(ledger.get(version),digest);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
  }
  return{people,admins,keys,settings,owners,manager,home,assignment,enrollment};
 });
 const{people,admins,keys,settings,owners,manager,home,assignment,enrollment}=fixture;
 const run=<T>(a:VerifiedActor,work:(c:any)=>Promise<T>,exclusive=false)=>db.authorizedSystem(a,[a.kind],work,false,exclusive,exclusive);
 const grant=async(i:number)=>{const g=await run(admins[i],c=>checkApprovalKey(c,admins[i],keys[i]));deniedApprovalKey(g);return g;};
 const keyStatus=await run(manager,c=>managerKeyStatus(c,manager));check(keyStatus.available&&!keyStatus.hasResidence,'Unassigned active manager can obtain own operation key');
 const rawKey=(await run(manager,c=>issueManagerKey(c,manager))).key;manager.managerKeyVersion=(await run(manager,c=>checkManagerKey(c,manager,rawKey))).version;
 check(!!manager.managerKeyVersion,'Own manager key verifies without assignment');
 await denied(()=>run(manager,c=>issueManagerKey(c,manager)),409,'Existing key cannot be shown again');
 check((await run(manager,c=>petitionManagerKey(c,manager,people[5].name))).status==='Pending','Unassigned manager can petition for lost key');
 const sg=await run(admins[0],c=>checkAdministratorSettingsKey(c,admins[0],settings[0]));deniedKey(sg);
 check((await run(admins[0],c=>resetManagerKey(c,admins[0],manager.contextId,sg))).success,'Own settings key resets unassigned manager key');
 await denied(()=>run(manager,c=>ownManagerClosure(c,manager)),403,'Old manager-key grant stops working after reset');
 manager.managerKeyVersion=undefined;const replacement=(await run(manager,c=>issueManagerKey(c,manager))).key;
 manager.managerKeyVersion=(await run(manager,c=>checkManagerKey(c,manager,replacement))).version;
 const own=()=>run(manager,c=>ownManagerClosure(c,manager));
 await db.system(c=>c.query("update public.account_contexts set status='pending' where id=$1",[manager.contextId]));await denied(()=>own(),401,'Pending manager is not an active verified manager session');await db.system(c=>c.query("update public.account_contexts set status='active' where id=$1",[manager.contextId]));
 const status=await own();
 check(status.preview.reviewKind==='account_action'&&status.preview.reviewQuorum===5&&!status.preview.blockers.length,'Unassigned manager uses five-administrator review');
 const body={confirm:true,reason:people[5].name,requestWaiver:false,fingerprint:status.preview.fingerprint};
 await denied(()=>run({...manager,managerKeyVersion:undefined},c=>submitManagerClosure(c,{...manager,managerKeyVersion:undefined},body)),403,'Submission requires own manager-key proof');
 await denied(()=>run(admins[1],c=>submitManagerClosure(c,admins[1],body)),403,'Administrator cannot impersonate request author');
 await denied(()=>run({...manager,authUserId:people[0].id},c=>ownManagerClosure(c,manager)),401,'Native identity spoof is rejected');
 await denied(()=>run(manager,c=>submitManagerClosure(c,manager,{...body,managerId:admins[0].contextId})),400,'Client manager ownership selector is rejected');
 for(const role of['anon','authenticated','pinevela_backend'])await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query('select * from private.manager_closure_requests');}),'42501','Requests are private under RLS/grants');
 const request=await run(manager,c=>submitManagerClosure(c,manager,body));check(request.success&&!request.deleted,'Own-key request leaves account active');
 check((await run(manager,c=>submitManagerClosure(c,manager,body))).requestId===request.requestId,'Exact retry returns saved request');
 const input={id:manager.contextId,kind:'manager',action:'close-manager',reason:people[5].name,features:[],duration:null,closureRequestId:request.requestId};
 const g=await grant(0);await denied(()=>run(admins[0],c=>proposeAccountReview(c,admins[0],{allowed:false},input)),403,'Proposal needs administrator own approval key');
 await denied(()=>run(admins[0],c=>proposeAccountReview(c,admins[0],g,{...input,closureRequestId:crypto.randomUUID()})),409,'Other request cannot authorize manager closure');
 stage='review invalidation';const review=await run(admins[0],c=>proposeAccountReview(c,admins[0],g,input));check(review.status==='pending','Proposal starts with one own vote only');
 await denied(()=>run(manager,c=>withdrawManagerClosure(c,manager,request.requestId)),409,'Manager cannot withdraw collected administrator consent');
 const unchanged=(await db.pool.query('select status from public.account_contexts where id=$1',[manager.contextId])).rows[0].status;
 check(unchanged==='active','Proposal alone keeps manager active');
 await denied(()=>run(admins[0],c=>applyAccountReview(c,admins[0],g,review.id),true),409,'Founder cannot execute before five approvals');
 await run(admins[0],c=>c.query('update public.manager_assignments set ended_at=null where id=$1',[assignment]));
 await run(admins[0],c=>expireAccountReviews(c));
 check((await db.pool.query('select status from public.admin_proposals where id=$1',[review.id])).rows[0].status==='invalidated','New assignment invalidates the account-only review');
 await run(admins[0],c=>c.query('update public.manager_assignments set ended_at=clock_timestamp() where id=$1',[assignment]));
 const renewedStatus=await own();const renewed=await run(manager,c=>submitManagerClosure(c,manager,{...body,fingerprint:renewedStatus.preview.fingerprint}));
 check(renewed.requestId!==request.requestId,'New request retains invalidated prior review');
 const second=await run(admins[0],c=>proposeAccountReview(c,admins[0],g,{...input,closureRequestId:renewed.requestId}));
 for(let i=1;i<5;i++){const ig=await grant(i);await run(admins[i],c=>voteAccountReview(c,admins[i],ig,second.id,'approved'));}
 check((await db.pool.query('select status from public.admin_proposals where id=$1',[second.id])).rows[0].status==='approved','Five distinct actual own-key votes approve review');
 const otherGrant=await grant(1);await denied(()=>run(admins[1],c=>applyAccountReview(c,admins[1],otherGrant,second.id),true),403,'Non-founder cannot execute after quorum');
 check((await db.pool.query('select status from public.account_contexts where id=$1',[manager.contextId])).rows[0].status==='active','Five votes still do not close manager portal');
 // A reset invalidates saved key/version evidence without mutating native Auth.
 await run(admins[0],c=>resetManagerKey(c,admins[0],manager.contextId,sg));await run(admins[0],c=>expireAccountReviews(c));
 check((await db.pool.query('select status from public.admin_proposals where id=$1',[second.id])).rows[0].status==='invalidated','Manager credential changes invalidate collected closure consent');
 manager.managerKeyVersion=undefined;const finalKey=(await run(manager,c=>issueManagerKey(c,manager))).key;manager.managerKeyVersion=(await run(manager,c=>checkManagerKey(c,manager,finalKey))).version;
 const last=await own();const third=await run(manager,c=>submitManagerClosure(c,manager,{...body,fingerprint:last.preview.fingerprint}));
 const final=await run(admins[0],c=>proposeAccountReview(c,admins[0],g,{...input,closureRequestId:third.requestId}));
 for(let i=1;i<5;i++){const ig=await grant(i);await run(admins[i],c=>voteAccountReview(c,admins[i],ig,final.id,'approved'));}
 for(const role of['authenticated','pinevela_backend'])await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query("update public.account_contexts set status='closed' where id=$1",[manager.contextId]);}),'42501','Scoped SQL cannot bypass final closure protocol');
 check((await run(admins[0],c=>rejectFinalAccountReview(c,admins[0],g,final.id,people[0].name))).success,'Founder can decline a fully approved closure');
 check((await db.pool.query('select status from public.account_contexts where id=$1',[manager.contextId])).rows[0].status==='active','Founder rejection leaves manager active');
 const fourthStatus=await own(),fourth=await run(manager,c=>submitManagerClosure(c,manager,{...body,fingerprint:fourthStatus.preview.fingerprint}));
 const accepted=await run(admins[0],c=>proposeAccountReview(c,admins[0],g,{...input,closureRequestId:fourth.requestId}));
 for(let i=1;i<5;i++){const ig=await grant(i);await run(admins[i],c=>voteAccountReview(c,admins[i],ig,accepted.id,'approved'));}
 const history=async()=>(await db.pool.query(`select md5(jsonb_build_object('homes',(select jsonb_agg(to_jsonb(t)order by id)from public.residences t),'assignments',(select jsonb_agg(to_jsonb(t)order by id)from public.manager_assignments t),'bans',(select jsonb_agg(to_jsonb(t)order by id)from public.registration_bans t),'settings',(select jsonb_agg(to_jsonb(t)order by manager_context_id)from private.manager_settings t),'keys',(select jsonb_agg(to_jsonb(t)order by manager_context_id)from private.manager_operation_keys t))::text) as d`)).rows[0].d;
 const beforeHistory=await history();stage='founder closure';const result=await run(admins[0],c=>applyAccountReview(c,admins[0],g,accepted.id),true);check(result.success&&result.status==='executed','Founder own-key confirmation closes exact unassigned portal');
 check((await db.pool.query('select status from public.account_contexts where id=$1',[manager.contextId])).rows[0].status==='closed','Manager context closes');
 check((await db.pool.query('select count(*)from private.account_sessions where active_context_id=$1',[manager.contextId])).rows[0].count==='0','Manager app bindings revoke');
 check((await db.pool.query('select count(*)from private.account_sessions where active_context_id=any($1::uuid[])',[admins.map(a=>a.contextId)])).rows[0].count==='5','Other actual account bindings remain');
 check(await history()===beforeHistory,'Housing, settings, keys and exact restriction/history records retained');
 check(await run(admins[0],c=>primaryManagerRegistrationRestricted(c,people[0].id)),'Closing manager cannot bypass its live residence registration cooldown');
 check(!await run(admins[1],c=>primaryManagerRegistrationRestricted(c,people[1].id)),'Cooldown cannot affect unrelated primary identity');
 check((await db.pool.query('select status from public.account_contexts where id=$1',[owners[0]])).rows[0].status==='active','Saved primary remains active');
 check((await db.pool.query("select count(*)from private.audit_events where event_type='unassigned_manager_portal_closed'")).rows[0].count==='1','Closure records one audit receipt');
 const recipients=(await db.pool.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Manager portal closed'")).rows.map(r=>r.context_id);
 check(recipients.includes(owners[0])&&recipients.includes(manager.contextId),'Primary and manager receive atomic closure notices');
 const directory=await run(admins[0],c=>managerClosureDirectory(c,admins[0]));check(directory.requests.find((r:any)=>r.id===fourth.requestId)?.completedAt,'Retained closure request reports exact completed review');
 await denied(()=>own(),401,'Closed manager cannot use old binding');
 await denied(()=>run(admins[0],c=>applyAccountReview(c,admins[0],g,accepted.id),true),409,'Final action cannot repeat');
 stage='completed closure re-enrollment';
 const primary=await new SupabaseAuth(db).switchContext(admins[0],owners[0]);
 const proof={authUserId:manager.authUserId,sessionId:manager.sessionId,email:people[5].email};
 await denied(()=>run(primary,c=>reactivateManager(c,primary,enrollment,proof),true),403,'Retained closure cooldown still blocks verified re-enrollment');
 await db.system(c=>c.query("update public.registration_bans set until_at=clock_timestamp()-interval'1 second' where account_context_id=$1",[manager.contextId]));
 check((await run(primary,c=>reactivateManager(c,primary,enrollment,proof),true)).status==='pending_review','Verified primary can restart after real founder-reviewed closure');
 check((await db.pool.query('select state from private.manager_closure_requests where id=$1',[fourth.requestId])).rows[0].state==='resolved','Executed closure request resolves without deleting its history');
 check((await db.pool.query('select status from public.admin_proposals where id=$1',[accepted.id])).rows[0].status==='executed','Founder closure receipt is preserved');
 check((await db.pool.query('select key_hash from private.manager_operation_keys where manager_context_id=$1',[manager.contextId])).rows[0].key_hash===null,'Old closure key is retired for new generation');
 check(await authDigest()===beforeAuth,'Genuine Auth subjects/identities/sessions unchanged');
 await db.close();db=new SupabaseDatabase(config);check((await db.pool.query('select status from public.account_contexts where id=$1',[manager.contextId])).rows[0].status==='pending','Verified re-enrollment survives reconnect');
 const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
 fs.writeFileSync('.security/migration-reset/unassigned-manager-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});check(advisor.status===0,'Native security advisors completed');
 const reportData=JSON.parse(advisor.stdout.toString()),findings=reportData.results||reportData;check(Array.isArray(findings)&&findings.length===0,'Native security advisors report zero findings');
 const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,authRecordsChanged:false,cloudWrites:false,providerRepliesMocked:false,retainedHistory:true,realManagerBrowserPending:true};fs.writeFileSync('.security/migration-reset/unassigned-manager-closure-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.close();}},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/unassigned-manager-closure-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Isolated verification failed; diagnostics saved privately.'}));process.exitCode=1;}
