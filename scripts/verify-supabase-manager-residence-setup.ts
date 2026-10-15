/** Isolated native acceptance. The user-authorized fictional residence stays in
 * a disposable Unix-socket cluster. Auth identities/sessions are genuine archived
 * rows, unchanged. This does not claim work-email delivery or browser signup. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {finishEnrollment,enrollmentInput} from '../supabase/enrollment.js';
import {managerProperty,submitManagerRegistration} from '../supabase/managerRegistration.js';
import {dispatchInspection,submitInspection,decideManager,inspectionRows} from '../supabase/inspections.js';
import {readNotifications} from '../supabase/notifications.js';
import {verifyResidenceRegistration} from './verify-residence-registration.js';
import {validateManagerWorkEmail} from '../src/lib/validation.js';
import {registrationStatus} from '../supabase/accountStatus.js';
import {pendingManagerRegistration,currentManagerInspection} from '../src/lib/registrationStatus.js';
import {checkProfileContext} from '../supabase/profiles.js';
import {checkManagerOnboardingRequest,managerOnboardingSnapshot} from '../supabase/managerOnboarding.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabasePublicSettings} from '../supabase/publicSettings.js';

const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4 || [checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))
  throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks=0,stage='restore';
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,status:number,label:string){
  let error:unknown;try{await work();}catch(e){error=e;}
  check(error instanceof ApiError&&error.status===status,label);
}
try{
 await withIsolatedBackup(checkpoint,async config=>{
  const db=new SupabaseDatabase(config);
  try{
   const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object(
     'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
     'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
     'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
   const beforeAuth=await authDigest();
   stage='isolated application fixture';
   const fixture=await db.system(async c=>{
    const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name',u.email) as name,s.id as sid
      from auth.users u join lateral(select id from auth.sessions where user_id=u.id
        and(not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1)s on true
      where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i
        where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb
        and lower(i.identity_data->>'email')=lower(u.email))
      order by(lower(u.email)='finalform2k@gmail.com')desc,u.id limit 6`)).rows;
    check(people.length===6,'Six genuine archived Google subjects and native sessions');
    const primary=async(p:any)=>{
      await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
      const id=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
      return {authUserId:p.id,sessionId:p.sid,contextId:id,kind:'primary'} as VerifiedActor;
    };
    const bind=async(a:VerifiedActor)=>c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
    const owner=await primary(people[0]),foreign=await primary(people[1]);await bind(owner);await bind(foreign);
    const nonce=crypto.randomBytes(32).toString('hex');
    const enrollment=(await c.query(`insert into private.account_enrollments
      (initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
      values($1,$2,'manager',$3,$4,$5,clock_timestamp()+interval'24 hours')returning id`,
      [owner.contextId,owner.authUserId,people[2].email,crypto.createHash('sha256').update(nonce).digest('hex'),JSON.stringify({displayName:people[2].name,phone:''})])).rows[0].id;
    await c.query('select private.initialize_auth_profile($1,$2)',[people[2].id,nonce]);
    const manager:VerifiedActor={authUserId:people[2].id,sessionId:people[2].sid,
      contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='manager'",[people[2].id])).rows[0].id,kind:'manager'};
    await bind(manager);
    const portal=async(p:any,kind:string)=>{
      await primary(p);
      const contextId=(await c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,$2,'active')returning id",[p.id,kind])).rows[0].id;
      const actor:VerifiedActor={authUserId:p.id,sessionId:p.sid,contextId,kind};await bind(actor);return actor;
    };
    const admin=await portal(people[3],'admin');
    await c.query('insert into public.admin_memberships(context_id,slot)values($1,1)',[admin.contextId]);
    // The immutable pre-enrollment schema permits isolated domain credentials
    // before protocol guards are applied. Never alter the genuine Auth archive.
    const settingsKey=crypto.randomBytes(32).toString('base64url');
    await c.query(`insert into private.admin_secrets(context_id,settings_key_hash,settings_enrolled_at)
      values($1,$2,clock_timestamp())`,[admin.contextId,await hashCredentialAsync(`settings:${admin.contextId}:${settingsKey}`)]);
    const officer=await portal(people[4],'officer'),otherOfficer=await portal(people[5],'officer');
    const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
    for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
      const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
      if(ledger.has(version))assert.equal(ledger.get(version),digest);
      else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
    }
    return {owner,foreign,manager,admin,settingsKey,officer,otherOfficer,enrollment,email:people[2].email,requestedOwnerPresent:people[0].email==='finalform2k@gmail.com'};
   });
   const {owner,foreign,manager,admin,officer,otherOfficer,enrollment,email}=fixture;
   const run=<T>(actor:VerifiedActor,work:(c:PoolClient)=>Promise<T>)=>db.authorizedSystem(actor,[actor.kind],work);
   stage='one authorized manager-onboarding snapshot';
   const snapshot=(a:VerifiedActor=owner,google=true)=>db.authorizedRead(a,['primary'],c=>managerOnboardingSnapshot(c,a,google));
   const beforeSnapshot=(await db.pool.query('select count(*)::int as count from private.account_enrollments')).rows[0].count;
   const ownSnapshot=await snapshot(),foreignSnapshot=await snapshot(foreign);
   check(ownSnapshot.policy.googleManagerEnrollment===true&&!(await snapshot(owner,false)).policy.googleManagerEnrollment,'Server-selected Google policy is preserved');
   check(ownSnapshot.enrollments.some(e=>e.id===enrollment),'Snapshot includes the actual owned enrollment');
   check(!foreignSnapshot.enrollments.some(e=>e.id===enrollment)&&foreignSnapshot.registrations.managerAccount===null,'Another real primary cannot see this manager or enrollment');
   check(ownSnapshot.registrations.managerAccount?.id===manager.contextId,'Snapshot preserves the genuine owned manager progress');
   check(ownSnapshot.access.restriction===null&&Number.isFinite(new Date(ownSnapshot.access.serverTime).getTime()),'Snapshot requires the real native cooldown read and clock');
   check(ownSnapshot.enrollments.every(e=>!Object.keys(e).some(k=>['token_digest','enrollment_fields','password','access_token','refresh_token'].includes(k))),'Snapshot exposes no enrollment secrets or credentials');
   check((await db.pool.query('select count(*)::int as count from private.account_enrollments')).rows[0].count===beforeSnapshot,'Loading the snapshot does not create an enrollment');
   const request={query:{},body:undefined,headers:{'x-pinevela-profile-context':owner.contextId,'x-pinevela-account-context':owner.contextId}};
   checkManagerOnboardingRequest(owner,request);check(true,'Actual captured primary context is accepted');
   await denied(async()=>checkManagerOnboardingRequest(admin,request),403,'Administrator cannot use primary manager onboarding');
   await denied(async()=>checkManagerOnboardingRequest(owner,{...request,query:{userId:foreign.authUserId}}),400,'Client identity selectors are rejected');
   await denied(async()=>checkManagerOnboardingRequest(owner,{...request,body:{managerId:manager.contextId}}),400,'Request bodies cannot spoof a manager');
   await denied(async()=>checkManagerOnboardingRequest(owner,{...request,headers:{'x-pinevela-profile-context':foreign.contextId}}),409,'Stale profile scope is rejected');
   await denied(async()=>checkManagerOnboardingRequest(owner,{...request,headers:{'x-pinevela-account-context':foreign.contextId}}),409,'Stale account scope is rejected');
   await denied(()=>snapshot({...owner,authUserId:foreign.authUserId}),401,'Native session cannot impersonate another primary');
   await denied(()=>snapshot({...owner,contextId:foreign.contextId}),401,'Native session cannot select another primary context');
   const savedPlatform=(await db.pool.query("select value from private.platform_settings where key='platform'")).rows[0];
   const platformSettings=new SupabasePublicSettings(new SupabaseAuth(db));
   try{
    await platformSettings.update(admin,{settingsKey:fixture.settingsKey,maintenanceMode:true});
    await denied(()=>snapshot(),503,'The consolidated read still enforces native maintenance without a preliminary transaction');
   }finally{
    await platformSettings.update(admin,{settingsKey:fixture.settingsKey,maintenanceMode:false,maintenanceRecoveryMessage:'Isolated maintenance verification completed.'});
    if(savedPlatform)await db.pool.query("update private.platform_settings set value=$1 where key='platform'",[savedPlatform.value]);
    else await db.pool.query("delete from private.platform_settings where key='platform'");
   }
   stage='street and map validation';
   const input={hostelName:'Pine Premium Hills',location:'KNUST Main Library, Kumasi',latitude:6.6745,longitude:-1.5716,knustAccreditedConfirmed:true};
   let property=managerProperty(input);
   checkProfileContext(owner,owner.contextId);check(true,'Captured owner context matches the live session');
   await denied(async()=>checkProfileContext(owner,foreign.contextId),409,'A stale captured account cannot be silently substituted');
   check(!('managerId' in managerProperty({...input,managerId:foreign.contextId,userId:foreign.authUserId})),'Client ownership fields never become application authority');
   check(property.name===input.hostelName&&property.location===input.location,'User-authorized test residence accepts street/map fields');
   for(const fields of [{location:''},{latitude:5.6},{longitude:NaN},{knustAccreditedConfirmed:false}])
     await denied(async()=>managerProperty({...input,...fields}),400,'Incomplete or out-of-region identity remains denied');
   check(!validateManagerWorkEmail('finalform2k@gmail.com').isValid,'Personal manager email restriction remains intact');
   await denied(async()=>enrollmentInput({kind:'manager',name:'Pine Premium Hills',phone:'+233241234567',email:'finalform2k@gmail.com',password:crypto.randomBytes(18).toString('base64url')}),400,'Native acceptance does not bypass public work-email validation');
   check(!(await db.pool.query("select 1 from information_schema.columns where table_schema='public'and table_name='residences'and column_name='digital_address'")).rowCount,'Retired database column is absent');
   stage='verified enrollment and application';
   await denied(()=>run(manager,async()=>undefined),401,'Pending manager cannot enter the active portal');
   await denied(()=>run(owner,c=>submitManagerRegistration(c,owner,enrollment,property)),409,'Unconfirmed enrollment cannot submit property');
   const proof={authUserId:manager.authUserId,sessionId:manager.sessionId,email};
   await denied(()=>run(foreign,c=>finishEnrollment(c,foreign,enrollment,proof)),404,'Foreign primary cannot confirm enrollment');
   await run(owner,c=>finishEnrollment(c,owner,enrollment,proof));
   await denied(()=>run(foreign,c=>submitManagerRegistration(c,foreign,enrollment,property)),404,'Foreign primary cannot submit another enrollment');
   const submitted=await run(owner,c=>submitManagerRegistration(c,owner,enrollment,property));
   check(submitted.status==='inspection_pending','Submission requires physical inspection');
   check((await run(owner,c=>submitManagerRegistration(c,owner,enrollment,property))).alreadySubmitted,'Application retry is idempotent');
   await denied(()=>run(owner,c=>submitManagerRegistration(c,owner,enrollment,{...property,name:'Changed property'})),409,'Submission retry cannot change inspected identity');
   check(!(await db.actor(foreign,c=>c.query('select id from public.residences where id=$1',[submitted.residenceId]))).rowCount,'RLS excludes a foreign primary from the unapproved residence');
   stage='dispatch and simulated inspection';
   await denied(()=>run(admin,c=>decideManager(c,admin,submitted.id,'approved','')),409,'Approval cannot precede a submitted inspection');
   const dispatched=await run(admin,c=>dispatchInspection(c,admin,submitted.id,officer.contextId,'medium','Isolated development acceptance'));
   check(!dispatched.alreadyDispatched,'Dispatch creates an assigned native inspection');
   check(!(await run(otherOfficer,c=>inspectionRows(c,otherOfficer))).length,'Unassigned officer cannot read the inspection');
   const report={observations:'Isolated development acceptance; no physical visit occurred.',recommendation:'recommend_approval',
     checklist:{residenceExists:true,managerConnected:true,basicPropertyInfoVerified:true,managerAuthorityConfirmed:true,generalLegitimacyConfirmed:true,safetyHabitableCompliance:true},
     propertyDetails:{estimatedRooms:4,estimatedBeds:7},gpsCoordinates:{lat:input.latitude,lng:input.longitude}};
   await denied(()=>run(otherOfficer,c=>submitInspection(c,otherOfficer,dispatched.id,report)),404,'Unassigned officer cannot submit a report');
   await run(officer,c=>submitInspection(c,officer,dispatched.id,report));
   await denied(()=>run(officer,c=>decideManager(c,officer,submitted.id,'approved','')),403,'Officer cannot grant manager approval');
   stage='primary manager application corrections';
   const originalProperty={...property},notes='Clarify the entrance street and map pin before another inspection.';
   const originalReport=(await db.pool.query('select report from public.verification_inspections where id=$1',[dispatched.id])).rows[0].report;
   // Native historical fixture representing a pre-snapshot dispatch. It stays
   // inside this disposable cluster, with the same explicitly fictional report.
   const legacyInspection=(await run(admin,c=>c.query(`insert into public.verification_inspections
     (case_id,officer_context_id,dispatched_by_context_id,priority,dispatch_notes,status,report)
     values($1,$2,$3,'medium','Isolated historical inspection fixture','rejected',$4)returning id`,
     [submitted.id,officer.contextId,admin.contextId,JSON.stringify(originalReport)]))).rows[0].id;
   check(currentManagerInspection(submitted.id,await run(admin,c=>inspectionRows(c,admin)))?.id===dispatched.id,'A current report takes precedence over newer imported closed history');
   await run(admin,c=>decideManager(c,admin,submitted.id,'more_info_required',notes));
   const saved=(await run(owner,c=>registrationStatus(c,owner))).managerAccount;
   check(saved.canCorrectRegistration&&saved.verificationId===submitted.id&&saved.adminNotes===notes&&saved.property.location===originalProperty.location,'Only the owner receives saved application corrections and feedback');
   check(!(await run(foreign,c=>registrationStatus(c,foreign))).managerAccount,'Foreign primary does not receive another application');
   for(const status of ['inspection_pending','under_review','more_info_required'])check(pendingManagerRegistration({status}),'Administrator pending count includes '+status);
   for(const status of ['approved','rejected','withdrawn','closed'])check(!pendingManagerRegistration({status}),'Final/withdrawn case leaves the pending count: '+status);
   await denied(()=>run(manager,async()=>undefined),401,'Corrections do not unlock the pending manager portal');
   await denied(()=>run(owner,c=>submitManagerRegistration(c,owner,enrollment,property)),400,'Unchanged correction cannot dismiss administrator feedback');
   property=managerProperty({...input,location:'KNUST Main Library entrance, Kumasi',latitude:6.6746,description:'User-authorized isolated correction acceptance; fictional residence.'});
   await denied(()=>run(foreign,c=>submitManagerRegistration(c,foreign,enrollment,property)),404,'Foreign primary cannot correct the manager application');
   await run(admin,c=>dispatchInspection(c,admin,submitted.id,officer.contextId,'medium','Isolated concurrent dispatch boundary'));
   await denied(()=>run(owner,c=>submitManagerRegistration(c,owner,enrollment,property)),409,'A dispatch that wins first locks property details against corrections');
   check(!(await run(owner,c=>registrationStatus(c,owner))).managerAccount.canCorrectRegistration,'An active dispatch removes the owner correction action');
   await run(admin,c=>decideManager(c,admin,submitted.id,'more_info_required',notes));
   await run(admin,async c=>{
     await c.query("insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id)values($1,'manager_account',now()+interval'1 day','Isolated correction boundary',$2)",[owner.contextId,admin.contextId]);
   });
   await denied(()=>run(owner,c=>submitManagerRegistration(c,owner,enrollment,property)),403,'Account registration bans also deny corrections');
   await run(admin,c=>c.query("delete from public.registration_bans where account_context_id=$1 and reason='Isolated correction boundary'",[owner.contextId]));
   const corrected=await run(owner,c=>submitManagerRegistration(c,owner,enrollment,property));
   check(corrected.id===submitted.id&&corrected.residenceId===submitted.residenceId&&corrected.status==='inspection_pending'&&'corrected' in corrected&&corrected.corrected,'Correction reuses the exact case and inspection shell');
   const afterCorrection=(await run(owner,c=>registrationStatus(c,owner))).managerAccount;
   check(!afterCorrection.canCorrectRegistration&&!afterCorrection.adminNotes&&afterCorrection.property.location===property.location,'Resubmitted application exits correction mode with saved new details');
   check((await db.pool.query("select count(*)::int n from public.verification_cases where applicant_context_id=$1 and kind='manager_registration'",[manager.contextId])).rows[0].n===1,'Correction does not create duplicate applications');
   const preserved=(await db.pool.query("select event_data from private.audit_events where resource_id=$1 and event_type='manager_registration_corrected'",[submitted.id])).rows[0].event_data;
   check(preserved.before.location===originalProperty.location&&preserved.after.location===property.location&&preserved.previousReview.notes===notes&&preserved.previousReview.reviewedBy===admin.contextId&&preserved.requiresFreshInspection,'Append-only correction audit preserves prior property and administrator feedback');
   const noticeCount=(await db.pool.query('select count(*)::int n from public.notifications')).rows[0].n;
   check((await run(owner,c=>submitManagerRegistration(c,owner,enrollment,property))).alreadySubmitted,'Exact correction retry is idempotent');
   check((await db.pool.query('select count(*)::int n from public.notifications')).rows[0].n===noticeCount,'Exact correction retry does not duplicate notifications');
   await denied(()=>run(owner,c=>submitManagerRegistration(c,owner,enrollment,{...property,name:'Changed again'})),409,'A resubmitted correction is locked for inspection');
   const historical=(await run(admin,c=>inspectionRows(c,admin))).find(r=>r.id===dispatched.id)!;
   check(historical.status==='rejected'&&historical.location===originalProperty.location&&JSON.stringify(historical.report)===JSON.stringify(originalReport),'Earlier rejected inspection preserves its original target and complete report');
   const legacyHistorical=(await run(admin,c=>inspectionRows(c,admin))).find(r=>r.id===legacyInspection)!;
   check(legacyHistorical.location===originalProperty.location&&JSON.stringify(legacyHistorical.report)===JSON.stringify(originalReport),'Pre-snapshot inspection history also preserves the original property after correction');
   check((await db.pool.query("select count(*)::int n from private.audit_events where resource_id=$1 and event_type='inspection_property_preserved'",[submitted.id])).rows[0].n===1,'Only historical dispatches missing a property snapshot receive a preservation event');
   await denied(()=>run(admin,c=>decideManager(c,admin,submitted.id,'approved','')),409,'An old inspection cannot approve corrected property details');
   await denied(()=>run(officer,c=>submitInspection(c,officer,dispatched.id,report)),409,'An old inspection cannot be resubmitted after correction');
   const fresh=await run(admin,c=>dispatchInspection(c,admin,submitted.id,otherOfficer.contextId,'medium','Fresh isolated inspection after applicant corrections'));
   check(fresh.id!==dispatched.id,'Corrected application requires a new dispatch');
   const freshRow=(await run(otherOfficer,c=>inspectionRows(c,otherOfficer))).find(r=>r.id===fresh.id)!;
   check(freshRow.location===property.location&&freshRow.status==='dispatched','Fresh officer dispatch receives corrected property details');
   await denied(()=>run(officer,c=>submitInspection(c,officer,fresh.id,report)),404,'Earlier officer cannot submit another officer’s new dispatch');
   await run(otherOfficer,c=>submitInspection(c,otherOfficer,fresh.id,{...report,gpsCoordinates:{lat:property.latitude,lng:property.longitude}}));
   check((await run(admin,c=>decideManager(c,admin,submitted.id,'approved','Isolated development acceptance'))).status==='approved','Native administrator decision activates the assigned manager');
   check((await run(admin,c=>decideManager(c,admin,submitted.id,'approved','Isolated development acceptance'))).alreadyDecided,'Approval retry is idempotent');
   await denied(()=>run(owner,c=>submitManagerRegistration(c,owner,enrollment,{...property,name:'Reopen approved application'})),409,'Approved manager application cannot be reopened by owner submission');
   stage='primary notifications';
   const notices=await db.readActor(owner,c=>readNotifications(c,owner));
   for(const title of ['Manager Account Registered - Inspection Pending','PineVela Verification Team Dispatched','Manager Account More Information Required','Manager Application Corrections Submitted','Manager Account Approved!'])
     check(notices.some((n:any)=>n.title===title),'Primary portal receives lifecycle notice '+title);
   const managerNotices=await db.readActor(manager,c=>readNotifications(c,manager));
   check(!managerNotices.some((n:any)=>['Manager Account Registered - Inspection Pending','PineVela Verification Team Dispatched','Manager Account More Information Required','Manager Application Corrections Submitted','Manager Account Approved!'].includes(n.title)),'Primary notices are not substituted with manager-only delivery');
   stage='full residence setup';
   await run(manager,c=>verifyResidenceRegistration(c,manager,owner,foreign,submitted.residenceId,property,check));
   check(await authDigest()===beforeAuth,'Auth subjects, identities and provider sessions remain exact');
   stage='native security advisors';
   const advisor=spawnSync(process.env.SUPABASE_CLI_BINARY||'/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
   if(advisor.error)throw Error('Security-advisor CLI could not start. Restore the verified tool or set SUPABASE_CLI_BINARY.');
   fs.writeFileSync('.security/migration-reset/manager-residence-setup-advisors.json',advisor.stdout?.length?advisor.stdout:advisor.stderr||Buffer.from('Advisor returned no diagnostics.'),{mode:0o600});
   check(advisor.status===0,'Native advisors completed');const data=JSON.parse(advisor.stdout.toString());
   check(Array.isArray(data.results||data)&&(data.results||data).length===0,'Native advisors report zero findings');
   const result={passed:true,checks,isolatedNative:true,userAuthorizedFictionalResidence:true,genuineArchivedGoogleIdentities:true,
     requestedOwnerPresent:fixture.requestedOwnerPresent,authRecordsChanged:false,cloudWrites:false,providerRepliesMocked:false,
     realWorkEmailDeliveryPending:true,genuineManagerBrowserAcceptancePending:true};
   fs.writeFileSync('.security/migration-reset/manager-residence-setup-native.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  }finally{await db.close();}
 },{applicationCheckpoint});
}catch(error:any){
 fs.writeFileSync('.security/migration-reset/manager-residence-setup-failure.log',String(error.stack||error),{mode:0o600});
 console.error(JSON.stringify({passed:false,stage,checks,code:error.code||null,error:error instanceof assert.AssertionError?error.message:'Native acceptance failed; diagnostics saved privately.'}));process.exitCode=1;
}
