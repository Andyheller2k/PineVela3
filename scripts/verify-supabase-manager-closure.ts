/** Real Google subjects/native sessions restored locally. Isolated domain rows
 * and private test keys never reach the cloud; no Auth/provider/JWT is fabricated. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {checkApprovalKey,deniedApprovalKey} from '../supabase/adminGovernance.js';
import {checkAdministratorSettingsKey,deniedKey} from '../supabase/adminSettings.js';
import {issueManagerKey,checkManagerKey,resetManagerKey,petitionManagerKey} from '../supabase/managerKeys.js';
import {ownManagerClosure,submitManagerClosure,withdrawManagerClosure,managerClosureDirectory,rejectManagerClosure,linkManagerClosure} from '../supabase/managerClosureRequests.js';
import {proposeResidenceReview,voteResidenceReview,rejectResidenceReview} from '../supabase/residenceReviews.js';
import {reserveMedia,finishMedia} from '../supabase/media.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
dotenv.config({quiet:true});
const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw new Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks=0,stage='restore';
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);}
try{await withIsolatedBackup(checkpoint,async config=>{
  let db=new SupabaseDatabase(config);
  try{
    const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
      'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
    const beforeAuth=await authDigest();
    stage='native fixtures';
    const fixture=await db.system(async c=>{
      const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') as name,s.id as session_id
        from auth.users u join lateral(select id from auth.sessions where user_id=u.id and(not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1)s on true
        where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
          and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
        order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 6`)).rows;
      check(people.length===6,'Six actual verified Google subjects and native sessions');
      const admins:VerifiedActor[]=[],managers:VerifiedActor[]=[],primaries:VerifiedActor[]=[],approvalKeys:string[]=[],settingsKeys:string[]=[],homes:any[]=[];
      for(const index of [0,1,4]){
        const p=people[index];await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        const primary={authUserId:p.id,sessionId:p.session_id,contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id,kind:'primary'};
        primaries.push(primary);
        if(index<2){
          const admin={...primary,kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[p.id])).rows[0].id};admins.push(admin);
          await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[admin.contextId,index+1]);
          const approval=crypto.randomBytes(32).toString('base64url'),settings=crypto.randomBytes(32).toString('base64url');approvalKeys.push(approval);settingsKeys.push(settings);
          await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at) values($1,$2,clock_timestamp(),$3,clock_timestamp())',
            [admin.contextId,await hashCredentialAsync(`approval:${admin.contextId}:${approval}`),await hashCredentialAsync(`settings:${admin.contextId}:${settings}`)]);
        }
      }
      for(let i=0;i<3;i++){
        const p=people[i===2?5:i+2],owner=people[i===2?4:i];
        await c.query('insert into public.profiles(id,email,display_name,primary_owner_id) values($1,$2,$3,$4)',[p.id,p.email,p.name,owner.id]);
        const manager={authUserId:p.id,sessionId:p.session_id,contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[p.id,owner.id])).rows[0].id,kind:'manager'};managers.push(manager);
        const home=(await c.query("insert into public.residences(primary_owner_id,name,status) values($1,$2,'approved') returning id",[owner.id,owner.name])).rows[0].id;
        await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager.contextId,home]);
        const block=(await c.query('insert into public.blocks(residence_id,name) values($1,$2) returning id',[home,p.name])).rows[0].id;
        const empty=(await c.query('insert into public.blocks(residence_id,name) values($1,$2) returning id',[home,p.email])).rows[0].id;
        const floor=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[block])).rows[0].id;
        const room=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[floor])).rows[0].id;
        const bed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[room])).rows[0].id;
        homes.push({id:home,block,empty,floor,room,bed});
      }
      const staff=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'staff','closed') returning id",[people[3].id,people[1].id])).rows[0].id;
      await c.query("insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id,assigned_block_id,status,ended_at) values($1,$2,$3,$4,'removed',clock_timestamp())",[staff,homes[1].id,managers[1].contextId,homes[1].empty]);
      for(const a of [...admins,...managers,primaries[2]])await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
      const applied=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
        if(applied.has(version))assert.equal(applied.get(version),digest,'Historical migrations remain immutable');else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,digest]);}
      }
      return{admins,managers,primaries,approvalKeys,settingsKeys,homes,people};
    });
    const {admins:[admin,otherAdmin],managers:[manager,otherManager],primaries:[owner,,unrelated],homes:[home,foreign],approvalKeys,settingsKeys,people}=fixture;
    const run=<T>(a:VerifiedActor,kinds:string[],work:(c:any)=>Promise<T>)=>db.authorizedSystem(a,kinds,work);
    const bind=(a:VerifiedActor)=>db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[a.sessionId,a.contextId]));
    const grant=async(a:VerifiedActor,key:string)=>{const g=await run(a,['admin'],c=>checkApprovalKey(c,a,key));deniedApprovalKey(g);return g;};

    const rawKey=(await run(manager,['manager'],c=>issueManagerKey(c,manager))).key;
    manager.managerKeyVersion=(await run(manager,['manager'],c=>checkManagerKey(c,manager,rawKey))).version;
    const otherKey=(await run(otherManager,['manager'],c=>issueManagerKey(c,otherManager))).key;
    otherManager.managerKeyVersion=(await run(otherManager,['manager'],c=>checkManagerKey(c,otherManager,otherKey))).version;
    const info=()=>run(manager,['manager'],c=>ownManagerClosure(c,manager));
    const body=()=>info().then(s=>({confirm:true,reason:people[2].name,requestWaiver:true,fingerprint:s.preview.fingerprint}));
    const submit=(a:VerifiedActor,b:any)=>run(a,[a.kind],c=>submitManagerClosure(c,a,b));
    const read=await info();check(read.preview.residences.length===1&&read.preview.residences[0].id===home.id,'Own preview derives assigned residence');
    check(!read.preview.executionAvailable&&read.preview.identityRetained&&read.preview.defaultCooldownDays===30,'Request grants no deletion and reports reviewed cooldown');
    for(const actor of [admin,unrelated])await denied(()=>run(actor,[actor.kind],c=>ownManagerClosure(c,actor)),403,'Other portal cannot read manager own closure');
    await denied(()=>run({...manager,contextId:otherManager.contextId},['manager'],c=>ownManagerClosure(c,manager)),401,'Cross-manager context spoof is denied');
    await denied(()=>run({...manager,authUserId:otherManager.authUserId},['manager'],c=>ownManagerClosure(c,manager)),401,'Cross-subject session spoof is denied');
    const input=await body();
    await denied(()=>submit({...manager,managerKeyVersion:undefined},input),403,'Manager key grant cannot be omitted');
    for(const bad of [{...input,managerId:otherManager.contextId},{...input,email:people[3].email},{...input,privateKey:rawKey},
      {...input,role:'admin'},{...input,confirm:false},{...input,requestWaiver:'true'},{...input,reason:''},{...input,fingerprint:'changed'}])
      await denied(()=>submit(manager,bad),bad.fingerprint==='changed'?409:400,'Malformed input, selectors and stale preview denied');
    for(const role of ['anon','authenticated','pinevela_backend'])await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query('select * from private.manager_closure_requests');}),'42501','Private request table cannot be read directly');
    const domain=async()=>(await db.pool.query(`select md5(jsonb_build_object('homes',(select jsonb_agg(to_jsonb(t) order by id) from public.residences t),
      'contexts',(select jsonb_agg(to_jsonb(t) order by id) from public.account_contexts t),
      'bans',(select jsonb_agg(to_jsonb(t) order by id) from public.registration_bans t),
      'bindings',(select jsonb_agg(to_jsonb(t) order by session_id) from private.account_sessions t))::text) as digest`)).rows[0].digest;
    const beforeDomain=await domain();
    stage='submission and withdrawal';
    const simultaneous=await Promise.all([submit(manager,input),submit(manager,input)]);
    const first=simultaneous[0];check(first.success&&!first.deleted&&first.state==='pending','Correct own-key manager submits review request');
    check(simultaneous[1].requestId===first.requestId,'Concurrent identical submissions reconcile one request');
    check((await submit(manager,input)).requestId===first.requestId,'Exact retry reconciles same pending request');
    check((await db.pool.query('select count(*) from private.manager_closure_requests')).rows[0].count==='1','Retries do not duplicate request');
    check((await db.pool.query('select count(*) from public.notification_recipients')).rows[0].count==='4','Actual admins, manager and saved primary owner receive notice');
    await denied(()=>submit(manager,{...input,reason:people[3].name}),409,'Conflicting duplicate denied');
    await denied(()=>run(otherManager,['manager'],c=>withdrawManagerClosure(c,otherManager,first.requestId)),404,'Foreign manager cannot withdraw request');
    await denied(()=>run({...manager,managerKeyVersion:undefined},['manager'],c=>withdrawManagerClosure(c,{...manager,managerKeyVersion:undefined},first.requestId)),403,'Withdrawal also requires current manager key');
    check((await run(manager,['manager'],c=>withdrawManagerClosure(c,manager,first.requestId))).success,'Own pending request withdrawn');
    await denied(()=>run(manager,['manager'],c=>withdrawManagerClosure(c,manager,first.requestId)),409,'Decided request cannot be rewritten');
    stage='keyed rejection and proposal binding';
    const second=await submit(manager,await body());
    await denied(()=>run(admin,['admin'],c=>rejectManagerClosure(c,admin,{allowed:false},second.requestId,people[0].name)),403,'Administrator cannot skip approval key');
    await denied(()=>grant(admin,settingsKeys[0]),403,'Settings key cannot substitute for approval key');
    const g=await grant(admin,approvalKeys[0]);
    check((await run(admin,['admin'],c=>rejectManagerClosure(c,admin,g,second.requestId,people[0].name))).success,'Own approval key declines pending request');
    const third=await submit(manager,await body());
    const options={hostelId:home.id,deleteHostel:true as const,deleteManager:true,ban:{amount:30,unit:'days'}};
    const propose=async(requestId:string,change:any={})=>run(admin,['admin'],async c=>{
      const selected={...options,...change};
      const p=(await c.query('select private.residence_review_preview($1::jsonb) as p',[JSON.stringify(selected)])).rows[0].p;
      const proposal=await proposeResidenceReview(c,admin,g,selected,people[0].name,p.fingerprint);
      await linkManagerClosure(c,admin,g,requestId,proposal.id);return proposal;
    });
    await denied(()=>propose(third.requestId,{hostelId:foreign.id}),409,'Foreign residence proposal cannot consume own manager request');
    await denied(()=>propose(third.requestId,{deleteManager:false}),409,'Residence-only proposal cannot fulfill manager closure');
    check((await db.pool.query('select count(*) from public.admin_proposals')).rows[0].count==='0','Failed linkage rolls back proposal and votes atomically');
    const linked=await propose(third.requestId);check(linked.status==='pending'&&!linked.executionAvailable,'Correct linkage creates only independently reviewed proposal');
    const saved=(await info()).requests.find((r:any)=>r.id===third.requestId);
    check(saved.state==='reviewing'&&saved.proposalId===linked.id&&saved.proposalStatus==='pending','Own status reflects linked proposal');
    await denied(()=>run(manager,['manager'],c=>withdrawManagerClosure(c,manager,third.requestId)),409,'Manager cannot withdraw administrator consent');
    await denied(()=>run(admin,['admin'],c=>rejectManagerClosure(c,admin,g,third.requestId,people[0].name)),409,'Request rejection cannot bypass an existing proposal');
    const duplicateBody=await body();await denied(()=>submit(manager,duplicateBody),409,'Linked review blocks duplicate closure requests');
    const otherGrant=await grant(otherAdmin,approvalKeys[1]);
    const vote=await run(otherAdmin,['admin'],c=>voteResidenceReview(c,otherAdmin,otherGrant,linked.id,'approved'));
    check(vote.status==='approved'&&!vote.executionAvailable,'Two actual private-key votes still grant no execution');
    check((await info()).requests.find((r:any)=>r.id===third.requestId).proposalStatus==='approved','Manager status follows actual proposal votes');
    const recipients=(await db.pool.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Residence deletion approval updated'")).rows.map(r=>r.context_id);
    check(recipients.includes(manager.contextId)&&recipients.includes(owner.contextId),'Linked review updates reach manager and saved primary before portal entry');
    check((await run(admin,['admin'],c=>managerClosureDirectory(c,admin))).requests.length===3,'Administrator reads retained request history');
    for(const sql of ["update private.manager_closure_requests set reason='changed' where id=$1",'delete from private.manager_closure_requests where id=$1'])
      await denied(()=>run(admin,['admin'],c=>c.query(sql,[third.requestId])),'42501','Native immutable history resists direct rewrite/deletion');
    await denied(()=>db.system(c=>c.query('truncate private.manager_closure_requests')),'42501','Truncate cannot erase request history');
    await denied(()=>db.system(async c=>{await c.query('set local role pinevela_backend');await c.query('update private.manager_closure_requests set state=\'rejected\' where id=$1',[third.requestId]);}),'42501','Scoped backend cannot directly decide requests');
    await run(admin,['admin'],c=>rejectResidenceReview(c,admin,g,linked.id,people[0].name));
    check((await info()).requests.find((r:any)=>r.id===third.requestId).state==='resolved','Terminated proposal is visible as resolved without history loss');
    const renewed=await submit(manager,await body());
    check(renewed.requestId!==third.requestId,'Manager can request fresh review after founder rejection');
    const retained=(await db.pool.query('select state,proposal_id from private.manager_closure_requests where id=$1',[third.requestId])).rows[0];
    check(retained.state==='resolved'&&retained.proposal_id===linked.id,'Resubmission retains exact old review reference');
    check((await db.pool.query('select count(*) from private.manager_closure_requests')).rows[0].count==='4','Earlier requests remain retained');
    check(await domain()===beforeDomain,'Requests, votes and rejections change no housing, accounts, bindings or registration bans');
    check(await authDigest()===beforeAuth,'Genuine Auth users, identities, sessions and timestamps remain unchanged');
    const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
    fs.writeFileSync('.security/migration-reset/manager-closure-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});
    console.log(JSON.stringify({advisorCompleted:advisor.status===0,advisorExit:advisor.status,advisorReportPrivate:true}));
    check((await db.pool.query("select relrowsecurity from pg_class where oid='private.manager_closure_requests'::regclass")).rows[0].relrowsecurity,'Private request RLS remains enabled');
    await db.close();db=new SupabaseDatabase(config);
    check((await info()).requests.find((r:any)=>r.id===third.requestId).proposalStatus==='rejected','Saved request and review survive reconnect');
    console.log(JSON.stringify({passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,authRecordsChanged:false,cloudWrites:false,destructiveExecution:false,providerRepliesMocked:false}));
  }finally{await db.close();}
},{applicationCheckpoint});}catch(error:any){console.error(JSON.stringify({passed:false,stage,checks,code:error?.code||null,error:error instanceof assert.AssertionError?error.message:'Native verification failed; credentials suppressed.'}));process.exitCode=1;}
