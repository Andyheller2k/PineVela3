/** Wipe review protocol in a disposable native restore. Actual archived Google
 * identities/sessions only; no cloud writes, simulated provider replies or wipes. */
import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';import {checkApprovalKey,deniedApprovalKey,setAdministratorActive} from '../supabase/adminGovernance.js';
import {wipeScopes,systemWipePreview,proposeSystemWipe,voteSystemWipe,founderSystemWipeReview,refreshSystemWipeReviews,systemWipeReviewStatus} from '../supabase/systemWipeReviews.js';
import {SupabaseAuth} from '../supabase/auth.js';
dotenv.config({quiet:true});const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks=0,stage='restore';function check(v:unknown,label:string){assert.ok(v,label);checks++;}
async function denied(work:()=>Promise<unknown>,status:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}
 if((typeof status==='number'?e?.status:e?.code)!==status)fs.writeFileSync('.security/migration-reset/system-wipe-denial.log',JSON.stringify({label,status,actualStatus:e?.status,actualCode:e?.code,detail:String(e?.stack||e)},null,2),{mode:0o600});
 check(typeof status==='number'?e instanceof ApiError&&e.status===status:e?.code===status,label);}
try{await withIsolatedBackup(checkpoint,async config=>{let db=new SupabaseDatabase(config);try{
 const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t)order by id)from auth.users t),'identities',(select jsonb_agg(to_jsonb(t)order by id)from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t)order by id)from auth.sessions t))::text)as d`)).rows[0].d;
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

  const home=(await c.query("insert into public.residences(primary_owner_id,name,status)values($1,$2,'approved')returning id",[people[0].id,p.name])).rows[0].id;
  await c.query('insert into public.manager_assignments(manager_context_id,residence_id)values($1,$2)',[contextId,home]);
  const block=(await c.query('insert into public.blocks(residence_id,name)values($1,$2)returning id',[home,p.name])).rows[0].id;
  const floor=(await c.query('insert into public.floors(block_id,floor_number)values($1,0)returning id',[block])).rows[0].id;
  const room=(await c.query("insert into public.rooms(floor_id,room_number)values($1,'1')returning id",[floor])).rows[0].id;
  const bed=(await c.query('insert into public.beds(room_id,bed_number)values($1,1)returning id',[room])).rows[0].id;
  await c.query('update public.profiles set primary_owner_id=$2 where id=any($1::uuid[])',[[people[1].id,people[2].id],people[0].id]);
  const resident=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'resident','active')returning id",[people[1].id,people[0].id])).rows[0].id;
  const seller=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'seller','active')returning id",[people[1].id,people[0].id])).rows[0].id;
  const staff=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'staff','active')returning id",[people[2].id,people[0].id])).rows[0].id;
  const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id)values($1,$2,$3)returning id',[resident,room,bed])).rows[0].id;
  await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id)values($1,$2,$3)',[staff,home,contextId]);
  // Establish the saved verified enrollment through real native relationship
  // guards. These disposable domain rows never go to the configured project.
  const campus='Kwame Nkrumah University of Science and Technology (KNUST)',category='Services',studentId=crypto.randomBytes(8).toString('hex').toUpperCase();
  await c.query("update public.account_contexts set status='pending' where id=$1",[seller]);
  const enrollment=(await c.query("insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,status,verified_at,auth_user_id,linked_context_id,expires_at)values($1,$2,'seller',$3,$4,$5,'completed',clock_timestamp(),$6,$7,clock_timestamp()+interval'24 hours')returning id",[owners[0],people[0].id,people[1].email,crypto.randomBytes(32).toString('hex'),JSON.stringify({university:campus,categoryToSell:category,idNumber:studentId,storeName:people[1].name}),people[1].id,seller])).rows[0].id;
  await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[admins[0].sessionId,owners[0]]);
  await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admins[0].authUserId,session_id:admins[0].sessionId,role:'authenticated'})]);
  const application=(await c.query('insert into public.seller_applications(seller_context_id,enrollment_id,campus,primary_category,student_id,proposed_store_name)values($1,$2,$3,$4,$5,$6)returning id',[seller,enrollment,campus,category,studentId,people[1].name])).rows[0].id;
  await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[admins[0].sessionId,admins[0].contextId]);
  await c.query("update public.seller_applications set status='approved',reviewed_at=clock_timestamp(),reviewed_by_context_id=$2 where id=$1",[application,admins[0].contextId]);
  await c.query("update public.account_contexts set status='active' where id=$1",[seller]);
  const store=(await c.query("insert into public.stores(seller_context_id,primary_owner_id,name,campus,status)values($1,$2,$3,$4,'pending')returning id",[seller,people[0].id,people[1].name,campus])).rows[0].id;
  await c.query('insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,title)values($1,$2,$3,$4,$5)',[home,room,resident,allocation,people[1].name]);
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
   if(ledger.has(version))assert.equal(ledger.get(version),digest);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
  }
  return{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff};
 });

 const{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff}=fixture;
 const run=<T>(a:VerifiedActor,work:(c:any)=>Promise<T>,exclusive=false)=>db.authorizedSystem(a,[a.kind],work,false,false,exclusive);
 const grant=async(i:number)=>{const g=await run(admins[i],c=>checkApprovalKey(c,admins[i],keys[i]));deniedApprovalKey(g);return g;};
 const gs=[];for(let i=0;i<5;i++)gs.push(await grant(i));
 const preview=(scopes:any=['total'],a=admins[0])=>run(a,c=>systemWipePreview(c,a,scopes));
 const propose=async(scopes:string[],i=1)=>{const v=await preview(scopes,admins[i]);return run(admins[i],c=>proposeSystemWipe(c,admins[i],gs[i],{scopes,reason:people[i].name,fingerprint:v.fingerprint}),true);};
 const vote=(id:string,i:number,decision:any='approved')=>run(admins[i],c=>voteSystemWipe(c,admins[i],gs[i],id,decision),true);
 const final=(id:string,i=0,decision='approve-backup',confirmation=decision==='reject'?'REJECT APPROVED WIPE':'APPROVE WIPE BACKUP')=>run(admins[i],c=>founderSystemWipeReview(c,admins[i],gs[i],id,{decision,confirmation,reason:people[i].name}),true);
 const operational=async()=>(await db.pool.query(`select md5(jsonb_build_object('contexts',(select jsonb_agg(to_jsonb(t)order by id)from public.account_contexts t),'profiles',(select jsonb_agg(to_jsonb(t)order by id)from public.profiles t),'homes',(select jsonb_agg(to_jsonb(t)order by id)from public.residences t),'rooms',(select jsonb_agg(to_jsonb(t)order by id)from public.rooms t),'allocations',(select jsonb_agg(to_jsonb(t)order by id)from public.allocations t),'stores',(select jsonb_agg(to_jsonb(t)order by id)from public.stores t),'payments',(select jsonb_agg(to_jsonb(t)order by id)from public.payments t),'images',(select jsonb_agg(to_jsonb(t)order by id)from public.media_assets t),'storage',(select jsonb_agg(to_jsonb(t)order by id)from storage.objects t),'bindings',(select jsonb_agg(to_jsonb(t)order by session_id)from private.account_sessions t))::text)as d`)).rows[0].d;
 stage='scopes and native boundaries';
 for(const bad of[undefined,[],['unknown'],['total','users'],['users','users'],['users',null],{},'total'])await denied(async()=>wipeScopes(bad),400,'Invalid scopes are rejected');
 check(JSON.stringify(wipeScopes(['users','markets']))==='["markets","users"]','Scopes normalize in canonical order');
 for(const scopes of[['users','markets'],['users','users'],['total','users'],['unknown']])check(!(await db.pool.query('select private.valid_system_wipe_scopes($1::jsonb)as valid',[JSON.stringify(scopes)])).rows[0].valid,'Native malformed/noncanonical scopes are rejected');
 await denied(()=>preview(['total'],manager),403,'Manager cannot inspect global wipe candidates');
 for(const patch of[{authUserId:manager.authUserId},{contextId:admins[1].contextId},{sessionId:manager.sessionId}])await denied(()=>preview(['total'],{...admins[0],...patch}),401,'Native subject/session/context substitution denied');
 const total=await preview();check(total.ready&&!total.executionAvailable,'Five keyed roster permits reviews but no execution');
 check(total.preview.accounts.every((a:any)=>a.kind!=='admin')&&total.preview.roster.length===5,'All administrative portals excluded and all five independent voters included');
 check(Object.values(total.preview.retention).every(Boolean),'All requested login and history retention flags are explicit');
 const raw=JSON.stringify(total);check(![...keys,...settings,...people.map(p=>p.session_id),...people.map(p=>p.email)].some(s=>raw.includes(s)),'Preview excludes private credentials, session identifiers and mailboxes');
 const housing=(await preview(['hostels'])).preview;
 check(housing.residences.some((h:any)=>h.id===home)&&housing.accounts.some((a:any)=>a.id===resident)&&housing.accounts.some((a:any)=>a.id===staff),'Residence scope includes allocated residents and staff');
 check(!housing.accounts.some((a:any)=>[manager.contextId,seller,...owners].includes(a.id))&&!housing.stores.length,'Residence scope retains manager, seller, primary and stores');
 const market=(await preview(['markets'])).preview;check(market.stores.some((s:any)=>s.id===store)&&market.accounts.length===1&&market.accounts[0].id===seller,'Market scope closes exact seller portal only');
 check(!market.accounts.some((a:any)=>a.id===resident),'Same-mailbox resident portal is preserved in market-only scope');
 const residentScope=(await preview(['residents'])).preview;check(residentScope.accounts.length===1&&residentScope.accounts[0].id===resident&&!residentScope.residences.length&&!residentScope.stores.length&&residentScope.resources.rooms.includes(room),'Resident scope covers live room access without closing the home or shared seller');
 const managerScope=(await preview(['managers'])).preview;check(managerScope.accounts.length===3&&[manager.contextId,resident,staff].every(id=>managerScope.accounts.some((a:any)=>a.id===id))&&!managerScope.stores.length,'Manager scope cascades housing only');
 const users=(await preview(['users'])).preview;check(users.accounts.length===total.preview.accounts.length&&users.residences.length===1&&users.stores.length===1,'Primary user closure follows server-owned portal/residence/store relations');
 for(const role of['anon','authenticated','pinevela_backend']){
  await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query('select private.system_wipe_preview($1::jsonb)',['["total"]']);}),'42501','Unprivileged SQL cannot invoke wipe preview');
  await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query("update public.admin_proposals set status='executed' where kind='system_wipe'");}),'42501','Unprivileged SQL cannot execute proposals');
  await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query('delete from public.admin_votes');}),'42501','Unprivileged SQL cannot delete votes');
 }
 await denied(()=>run(admins[1],c=>proposeSystemWipe(c,admins[1],{allowed:false},{scopes:['total'],reason:people[1].name,fingerprint:total.fingerprint}),true),403,'Proposal requires own current approval grant');
 check(!(await run(admins[1],c=>checkApprovalKey(c,admins[1],settings[1]))).allowed,'Settings key is not an approval key');
 check(!(await run(admins[1],c=>checkApprovalKey(c,admins[1],keys[0]))).allowed,'Another administrator key cannot substitute for own key');
 for(const patch of[{userId:people[0].id},{scope:['total']},{reason:''},{fingerprint:'changed'}])await denied(()=>run(admins[1],c=>proposeSystemWipe(c,admins[1],gs[1],{scopes:['total'],reason:people[1].name,fingerprint:total.fingerprint,...patch}),true),patch.fingerprint?409:400,'Identity/body tampering and stale preview denied');
 await denied(()=>run(admins[1],c=>proposeSystemWipe(c,admins[1],gs[0],{scopes:['total'],reason:people[1].name,fingerprint:total.fingerprint}),true),403,'Grant from a different administrator cannot authorize own proposal');
 const beforeFailure=await operational();
 await db.system(c=>c.query("create function private.reject_wipe_receipt_test()returns trigger language plpgsql as $$begin if new.event_type='system_wipe_review_proposed' then raise exception using errcode='22000',message='Isolated native receipt failure';end if;return new;end;$$;create trigger reject_wipe_receipt_test before insert on private.audit_events for each row execute function private.reject_wipe_receipt_test()"));
 await denied(()=>propose(['total']),'22000','Real receipt insertion failure rolls back proposal and its first vote');
 check((await db.pool.query("select count(*)from public.admin_proposals where kind='system_wipe'")).rows[0].count==='0'&&(await db.pool.query('select count(*)from public.admin_votes')).rows[0].count==='0','Failed transaction leaves no proposal or counted vote');
 check(await operational()===beforeFailure,'Receipt failure leaves accounts, operational data, Storage and bindings unchanged');
 await db.system(c=>c.query('drop trigger reject_wipe_receipt_test on private.audit_events;drop function private.reject_wipe_receipt_test()'));
 stage='independent quorum';const beforeOperational=await operational(),p=await propose(['total']);check(p.status==='pending','Proposal starts with one vote');
 check(!(await db.pool.query("select private.system_wipe_current(jsonb_populate_record(null::public.admin_proposals,to_jsonb(p)||jsonb_build_object('expires_at',clock_timestamp()-interval'1 second')))as current from public.admin_proposals p where id=$1",[p.id])).rows[0].current,'Native current-review predicate rejects past deadlines without tampering saved history or clocks');
 await denied(()=>propose(['total']),409,'Duplicate exact scope cannot bypass outstanding review');
 await denied(()=>vote(p.id,1),409,'Proposer cannot count twice');
 await denied(()=>vote(p.id,2,['approved']),400,'Array-shaped decision cannot bypass validation');
 await denied(()=>final(p.id),409,'Founder cannot finalize before five votes');
 for(let i=2;i<5;i++)await vote(p.id,i);
 check((await db.pool.query('select status from public.admin_proposals where id=$1',[p.id])).rows[0].status==='pending','Four independent votes without founder remain pending');
 await denied(()=>run(admins[0],c=>c.query("update public.admin_proposals set status='approved' where id=$1",[p.id]),true),'42501','SQL cannot fake completed quorum');
 check((await vote(p.id,0)).status==='approved','Fifth independent own-key vote approves exact scope');
 check(await operational()===beforeOperational,'Proposal and five votes do not change accounts, allocations, stores, payments, Storage or bindings');
 await denied(()=>final(p.id,2),403,'Only founder can make final decision');await denied(()=>final(p.id,0,'approve-backup','APPROVE'),400,'Exact typed founder backup confirmation required');
 await denied(()=>run(admins[0],c=>c.query("update public.admin_proposals set wipe_founder_context_id=$2 where id=$1",[p.id,admins[2].contextId]),true),'42501','SQL cannot forge final metadata without current own key');
 check((await final(p.id)).success,'Current founder own-key records backup preparation consent');
 check(await operational()===beforeOperational,'Founder backup consent still performs no operational wipe');
 await denied(()=>final(p.id),409,'Founder final review is immutable');
 for(const query of["update public.admin_proposals set status='executed' where id=$1","update public.admin_proposals set preview='{}' where id=$1","delete from public.admin_proposals where id=$1","delete from public.admin_votes where proposal_id=$1","update public.admin_votes set decision='rejected' where proposal_id=$1"])
  await denied(()=>run(admins[0],c=>c.query(query,[p.id]),true),'42501','Native guards protect scope, execution and immutable vote/history records');
 const stamped=(await db.pool.query("select expires_at-created_at=interval'24 hours'as deadline,wipe_founder_context_id from public.admin_proposals where id=$1",[p.id])).rows[0];check(stamped.deadline&&stamped.wipe_founder_context_id===admins[0].contextId,'Native founder identity and 24-hour deadline are authoritative');
 stage='change invalidation';const stale=await preview(['markets']),aba=await propose(['markets']);
 await db.system(c=>c.query("update public.stores set status='suspended' where id=$1",[store]));await db.system(c=>c.query("update public.stores set status='pending' where id=$1",[store]));
 await denied(()=>vote(aba.id,2),409,'Change-and-reversal cannot revive stale consent');
 await denied(()=>run(admins[2],c=>proposeSystemWipe(c,admins[2],gs[2],{scopes:['markets'],reason:people[2].name,fingerprint:stale.fingerprint}),true),409,'Pre-change preview cannot be reused after exact row reversal');
 const changes=await run(admins[0],c=>refreshSystemWipeReviews(c,admins[0]));check(changes.length===2,'Domain revision invalidates both pending and fully approved backup reviews');
 check(!(await run(admins[0],c=>refreshSystemWipeReviews(c,admins[0]))).length,'Repeated status refresh cannot duplicate invalidation receipts');
 check((await db.pool.query("select count(*)from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='System wipe review invalidated'")).rows[0].count==='10','Each changed review notifies all five current administrators once');
 const reject=await propose(['markets']);check((await vote(reject.id,2,'rejected')).status==='rejected','One independent rejection closes review');await denied(()=>vote(reject.id,3),409,'Rejected scope cannot collect later approvals');
 const rejectFinal=await propose(['hostels']);for(const i of[2,3,4,0])await vote(rejectFinal.id,i);check((await final(rejectFinal.id,0,'reject')).decision==='reject','Founder can reject after all five consent');
 check((await db.pool.query('select status from public.residences where id=$1',[home])).rows[0].status==='approved','Founder rejection preserves operational housing');
 const directory=await run(admins[0],c=>systemWipeReviewStatus(c,admins[0]));check(directory.length===4&&directory.every((r:any)=>r.votes.length>=1),'Status retains exact historical previews and independent vote receipts');
 stage='roster invalidation';const roster=await propose(['residents']);await run(admins[0],c=>setAdministratorActive(c,admins[0],gs[0],admins[4].contextId,false));
 await run(admins[0],c=>refreshSystemWipeReviews(c,admins[0]));check((await db.pool.query('select status from public.admin_proposals where id=$1',[roster.id])).rows[0].status==='invalidated','Roster changes invalidate saved quorum evidence');
 const fewer=await preview(['residents']);check(!fewer.ready&&fewer.preview.roster.length===4,'Suspended voter cannot count toward five-key readiness');
 await denied(()=>run(admins[0],c=>proposeSystemWipe(c,admins[0],gs[0],{scopes:['residents'],reason:people[0].name,fingerprint:fewer.fingerprint}),true),409,'Four active keyed administrators cannot submit wipe');
 check(await authDigest()===beforeAuth,'All genuine verified Auth identities and native sessions remain byte-identical');
 await db.close();db=new SupabaseDatabase(config);check((await db.pool.query("select count(*)from public.admin_proposals where kind='system_wipe'")).rows[0].count==='5','Reviews survive database reconnect');
 const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
 fs.writeFileSync('.security/migration-reset/system-wipe-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});check(advisor.status===0,'Native advisors complete');const findings=JSON.parse(advisor.stdout.toString());check(Array.isArray(findings.results||findings)&&(findings.results||findings).length===0,'Native advisors report zero security findings');
 const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,authRecordsChanged:false,cloudWrites:false,providerRepliesMocked:false,executionImplemented:false,loginAndHistoryRetained:true};fs.writeFileSync('.security/migration-reset/system-wipe-review-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.close();}},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/system-wipe-review-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Isolated verification failed; diagnostics saved privately.'}));process.exitCode=1;}
