/** Verify the actual user-created Google manager from an unchanged encrypted
 * checkpoint. No fixture rebase, migrations, Auth/provider calls or product writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,UUID,type VerifiedActor} from '../supabase/db.js';
import {checkManagerOnboardingRequest,managerOnboardingSnapshot} from '../supabase/managerOnboarding.js';
import {readNotifications} from '../supabase/notifications.js';

const [checkpoint,primaryInput,managerInput]=process.argv.slice(2);
const primaryEmail=primaryInput?.trim().toLowerCase(),managerEmail=managerInput?.trim().toLowerCase();
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if(process.argv.length!==5||!UUID.test(checkpoint||'')||!email.test(primaryEmail||'')||!email.test(managerEmail||'')||primaryEmail===managerEmail)
  throw Error('Pass BACKUP_UUID PRIMARY_EMAIL MANAGER_EMAIL for separate genuine identities.');

let checks=0,stage='restore unchanged checkpoint',lastCheck='';
const reportPath=path.resolve('.security/migration-reset/created-manager-checkpoint.json');
const check=(value:unknown,label:string)=>{lastCheck=label;assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,status:number,label:string){
  let error:unknown;try{await work();}catch(cause){error=cause;}
  check(error instanceof ApiError&&error.status===status,label);
}
function save(report:Record<string,unknown>){
  fs.mkdirSync(path.dirname(reportPath),{recursive:true,mode:0o700});
  const fd=fs.openSync(reportPath,fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');}finally{fs.closeSync(fd);}
}

try{
 await withIsolatedBackup(checkpoint,async config=>{
  check(String(config.host).startsWith('/tmp/pv-orders-')&&config.user==='pv_restore'&&config.ssl===false,'Only the isolated Unix-socket restore is used');
  const db=new SupabaseDatabase(config);
  let before:Array<{table:string;count:string;digest:string}>|undefined;
  // Sensitive row values remain inside PostgreSQL. Only counts and aggregate
  // digests reach this process; no passwords, tokens, keys or session values print.
  const fingerprint=async()=>{
    const tables=(await db.pool.query(`select n.nspname as schema,c.relname as name from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname in('auth','public','private','storage')
      and c.relkind in('r','p') and not c.relispartition order by n.nspname,c.relname`)).rows;
    const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
    const result:Array<{table:string;count:string;digest:string}>=[];
    for(const table of tables){
      const identity=quote(table.schema)+'.'+quote(table.name);
      const row=(await db.pool.query(`select count(*)::text as count,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as digest from ${identity} t`)).rows[0];
      result.push({table:table.schema+'.'+table.name,count:row.count,digest:row.digest});
    }
    return result;
  };
  try{
   stage='fingerprint actual archived application and Auth tables';before=await fingerprint();
   check(before.some(t=>t.table==='auth.users')&&before.some(t=>t.table==='private.account_enrollments'),'Auth and enrollment tables are included in unchanged-data verification');
   stage='actual confirmed separate Google identities';
   const identity=async(selectedEmail:string)=>{
     const rows=(await db.pool.query(`select u.id,u.email_confirmed_at is not null as confirmed,not u.is_anonymous as permanent,
       exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
         and i.identity_data->'email_verified'='true'::jsonb
         and lower(i.identity_data->>'email')=lower(u.email)) as verified_google
       from auth.users u where lower(u.email)=$1`,[selectedEmail])).rows;
     check(rows.length===1,'The selected email resolves to one actual archived Auth identity');
     check(rows[0].confirmed&&rows[0].permanent&&rows[0].verified_google,'The actual identity is confirmed and has a verified Google identity');
     return rows[0];
   };
   const primary=await identity(primaryEmail!),manager=await identity(managerEmail!);
   check(primary.id!==manager.id,'Primary and manager use different actual Auth subjects');
   const profiles=(await db.pool.query(`select id,primary_owner_id,lower(email)=$3 as expected_email
     from public.profiles where id in($1,$2)`,[primary.id,manager.id,managerEmail])).rows;
   check(profiles.length===2,'Both genuine identities have actual PineVela profiles');
   check(profiles.find(p=>p.id===primary.id)?.primary_owner_id===null,'The primary profile is not a child account');
   check(profiles.find(p=>p.id===manager.id)?.primary_owner_id===primary.id&&profiles.find(p=>p.id===manager.id)?.expected_email,'The manager profile belongs to the actual primary and exact verified email');
   const contexts=(await db.pool.query('select id,auth_user_id,primary_owner_id,kind,status from public.account_contexts where auth_user_id in($1,$2)',[primary.id,manager.id])).rows;
   const primaryContexts=contexts.filter(c=>c.auth_user_id===primary.id&&c.kind==='primary');
   check(primaryContexts.length===1&&primaryContexts[0].status==='active'&&primaryContexts[0].primary_owner_id===null,'The selected primary has one active primary portal');
   const childContexts=contexts.filter(c=>c.auth_user_id===manager.id),managerContexts=childContexts.filter(c=>c.kind==='manager');
   check(managerContexts.length===1,'The new manager identity has exactly one manager portal');
   check(childContexts.length===1,'The manager identity has no accidental primary, administrator or other portal');
   const child=managerContexts[0];
   check(child.primary_owner_id===primary.id,'The manager portal is owned by the actual primary');
   check(!(await db.pool.query('select 1 from public.admin_memberships where context_id=$1',[child.id])).rowCount,'The manager portal has no administrator membership');
   stage='actual saved Google manager enrollment';
   const enrollments=(await db.pool.query(`select id,primary_owner_id,initiator_context_id,auth_user_id,linked_context_id,status,
     verified_at,residence_id,enrollment_fields->>'authentication' as authentication,lower(invited_email)=$2 as expected_email
     from private.account_enrollments where auth_user_id=$1 and kind='manager'`,[manager.id,managerEmail])).rows;
   check(enrollments.length===1,'The exact manager identity has one actual saved manager enrollment');
   const enrollment=enrollments[0];
   check(enrollment.primary_owner_id===primary.id&&enrollment.initiator_context_id===primaryContexts[0].id,'Enrollment ownership and initiator match the actual primary');
   check(enrollment.linked_context_id===child.id&&enrollment.auth_user_id===child.auth_user_id&&enrollment.expected_email,'Enrollment subject, linked manager and verified email match');
   check(Boolean(enrollment.verified_at)&&['pending_review','completed'].includes(enrollment.status)&&enrollment.authentication==='google','The saved manager enrollment is verified through Google');
   const callbackAudit=(await db.pool.query(`select actor_context_id,event_data->>'authentication' as authentication,
     event_data->'developmentEnrollment'='true'::jsonb as development_enrollment
     from private.audit_events where event_type='google_manager_identity_verified'
       and resource_type='account_enrollment' and resource_id=$1`,[enrollment.id])).rows;
   check(callbackAudit.length===1&&callbackAudit[0].actor_context_id===primaryContexts[0].id,'The actual enrollment has one saved Google callback audit attributed to its primary owner');
   check(callbackAudit[0].authentication==='google'&&callbackAudit[0].development_enrollment,'The callback audit records the genuine local Google manager workflow');
   const actualBindings=(await db.pool.query(`select s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
     from private.account_sessions s join auth.sessions live on live.id=s.session_id and live.user_id=s.auth_user_id
     join public.account_contexts c on c.id=s.active_context_id and c.auth_user_id=s.auth_user_id
     where s.auth_user_id=$1 and c.id=$2 and c.kind='primary' and c.status='active'
       and(live.not_after is null or live.not_after>clock_timestamp())
     order by live.created_at desc limit 1`,[primary.id,primaryContexts[0].id])).rows as VerifiedActor[];
   check(actualBindings.length===1,'The actual primary retains an existing live native application binding');
   const owner=actualBindings[0];
   const snapshot=(actor:VerifiedActor)=>db.authorizedRead(actor,['primary'],c=>managerOnboardingSnapshot(c,actor,true));
   stage='native authorized read of actual saved manager progress';
   const saved=await snapshot(owner),savedManager=saved.registrations.managerAccount;
   check(savedManager?.id===child.id&&savedManager.enrollmentId===enrollment.id,'The actual primary snapshot exposes this same saved manager and enrollment');
   check(savedManager.email===managerEmail&&savedManager.emailVerified===true&&savedManager.enrollmentStatus===enrollment.status,'The snapshot preserves verified identity and enrollment progress');
   const savedEnrollment=saved.enrollments.find(e=>e.id===enrollment.id);
   check(savedEnrollment?.account_id===child.id&&savedEnrollment.account_status===child.status&&savedEnrollment.authentication==='google'&&Boolean(savedEnrollment.verified_at),'The resume form receives the actual owned Google enrollment');
   check(saved.enrollments.every(e=>!Object.keys(e).some(key=>['token_digest','enrollment_fields','password','access_token','refresh_token'].includes(key))),'The owner snapshot exposes no enrollment credentials or verification secrets');
   check(Number.isFinite(new Date(saved.access.serverTime).getTime()),'Registration access includes the native server clock');
   const cases=(await db.pool.query(`select id,status,residence_id,submitted_data->>'name' as property_name from public.verification_cases
     where applicant_context_id=$1 and kind='manager_registration' order by submitted_at desc`,[child.id])).rows;
   const assignments=(await db.pool.query('select residence_id from public.manager_assignments where manager_context_id=$1 and ended_at is null',[child.id])).rows;
   const phase=cases.length?'property_application':'identity_only';
   let notifiedAdministrators=0;
   if(phase==='identity_only'){
     check(enrollment.status==='pending_review'&&child.status==='pending','Identity-only enrollment retains pending review and pending manager status');
     check(enrollment.residence_id===null&&assignments.length===0,'Identity verification alone creates no residence assignment');
     check(savedManager.requiresPropertyRegistration===true&&savedManager.hostelId===null,'Identity-only progress resumes into property registration');
   }else{
     check(savedManager.requiresPropertyRegistration===false,'An actual submitted property uses its saved review progress');
     check(assignments.some(a=>a.residence_id===cases[0].residence_id)&&enrollment.residence_id===cases[0].residence_id,'The actual application, enrollment and assignment point to the same residence');
     check(savedManager.verificationId===cases[0].id,'The snapshot uses the actual latest manager application case');
     stage='actual submitted-registration notification routing';
     check(typeof cases[0].property_name==='string'&&cases[0].property_name.length>0,'The actual manager application contains its saved property reference');
     const propertyReference='"'+cases[0].property_name+'"';
     const primaryTitle='Manager Account Registered - Inspection Pending',adminTitle='Manager Registration Submitted';
     const recipients=(await db.pool.query(`select n.id,n.title,n.created_at,r.context_id from public.notifications n
       join public.notification_recipients r on r.notification_id=n.id
       where n.sender_context_id=$1 and n.category='verification' and n.title=any($2::text[])
         and strpos(n.message,$3)>0`,[owner.contextId,[primaryTitle,adminTitle],propertyReference])).rows;
     const primaryNotices=recipients.filter(n=>n.title===primaryTitle);
     check(primaryNotices.length>0&&primaryNotices.every(n=>n.context_id===owner.contextId),'The saved property-registration lifecycle notice is delivered to its actual primary owner only');
     check(!recipients.some(n=>n.context_id===child.id),'Registration lifecycle notices do not target the pending manager portal');
     const visible=await db.readActor(owner,c=>readNotifications(c,owner));
     check(visible.some(n=>primaryNotices.some(savedNotice=>savedNotice.id===n.id)&&n.title===primaryTitle
       &&n.message.includes(propertyReference)&&n.link==='/user/dashboard?tab=notifications'),'The actual primary can read its saved property-registration notice through the native notification reader');
     const administrators=(await db.pool.query(`select c.id from public.account_contexts c
       join public.admin_memberships m on m.context_id=c.id
       where c.kind='admin' and c.status='active' and m.status='active'
         and c.created_at<=(select min(n.created_at) from public.notifications n where n.id=any($1::uuid[]))`,
       [primaryNotices.map(n=>n.id)])).rows;
     check(administrators.length>0&&administrators.every(a=>recipients.some(n=>n.title===adminTitle&&n.context_id===a.id)),
       'Every still-active administrator that existed at submission received the actual registration-submitted notice');
     notifiedAdministrators=administrators.length;
   }
   const childBindings=(await db.pool.query('select count(*)::integer as count from private.account_sessions where auth_user_id=$1 or active_context_id=$2',[manager.id,child.id])).rows[0].count;
   if(child.status==='pending'){
     check(childBindings===0,'The pending manager has no operational application session binding');
     await denied(()=>db.authorizedRead({...owner,authUserId:manager.id,contextId:child.id,kind:'manager'},['manager'],async()=>true),401,'The pending manager cannot reuse the actual primary session for operational access');
   }
   stage='native stale-scope, forged-identity and wrong-role denials';
   const request={query:{},body:undefined,headers:{'x-pinevela-profile-context':owner.contextId,'x-pinevela-account-context':owner.contextId}};
   checkManagerOnboardingRequest(owner,request);check(true,'The real captured primary scope is accepted');
   await denied(async()=>checkManagerOnboardingRequest(owner,{...request,query:{userId:manager.id}}),400,'Client subject selectors cannot choose the manager owner');
   await denied(async()=>checkManagerOnboardingRequest(owner,{...request,body:{managerId:child.id}}),400,'Client body selectors cannot choose a manager');
   await denied(async()=>checkManagerOnboardingRequest(owner,{...request,headers:{'x-pinevela-profile-context':child.id}}),409,'A different actual profile scope is rejected');
   await denied(async()=>checkManagerOnboardingRequest(owner,{...request,headers:{'x-pinevela-account-context':child.id}}),409,'A different actual account scope is rejected');
   await denied(()=>snapshot({...owner,authUserId:manager.id}),401,'The real primary session cannot impersonate its manager subject');
   await denied(()=>snapshot({...owner,contextId:child.id}),401,'The real primary session cannot substitute its manager context');
   await denied(()=>db.authorizedRead(owner,['manager'],async()=>true),403,'The genuine primary is not an operational manager');
   await denied(()=>db.authorizedRead(owner,['admin'],async()=>true),403,'The genuine primary is not an administrator');
   await denied(()=>db.authorizedRead(owner,['officer'],async()=>true),403,'The genuine primary is not a verification officer');
   const foreign=(await db.pool.query(`select s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
     from private.account_sessions s join auth.sessions live on live.id=s.session_id and live.user_id=s.auth_user_id
     join public.account_contexts c on c.id=s.active_context_id and c.auth_user_id=s.auth_user_id
     where s.auth_user_id not in($1,$2) and c.kind='primary' and c.status='active' and c.primary_owner_id is null
       and(live.not_after is null or live.not_after>clock_timestamp())
       and private.portal_session_allowed(c.id,s.portal_pin_version) and private.account_session_allowed(c.id,s.session_id)
       and not coalesce((private.account_access(c.id)->>'banned')::boolean,false)
     order by live.created_at desc limit 1`,[primary.id,manager.id])).rows as VerifiedActor[];
   if(foreign.length){
     const other=await snapshot(foreign[0]);
     check(other.registrations.managerAccount?.id!==child.id&&!other.enrollments.some(e=>e.id===enrollment.id),'Another actual saved primary cannot read this manager enrollment or progress');
     await denied(()=>snapshot({...owner,authUserId:foreign[0].authUserId}),401,'The real primary session cannot impersonate another saved primary');
   }
   const otherPortal=foreign.length?[]:(await db.pool.query(`select s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
     from private.account_sessions s join auth.sessions live on live.id=s.session_id and live.user_id=s.auth_user_id
     join public.account_contexts c on c.id=s.active_context_id and c.auth_user_id=s.auth_user_id
     where s.auth_user_id not in($1,$2) and c.kind<>'primary' and c.status='active'
       and(live.not_after is null or live.not_after>clock_timestamp())
     order by live.created_at desc limit 1`,[primary.id,manager.id])).rows as VerifiedActor[];
   if(otherPortal.length){
     await denied(async()=>checkManagerOnboardingRequest(otherPortal[0],{query:{},body:undefined,headers:{}}),403,'Another actual saved non-primary portal cannot enter primary manager onboarding');
     await denied(()=>snapshot({...owner,authUserId:otherPortal[0].authUserId}),401,'The real primary session cannot impersonate another saved portal subject');
   }
   stage='verify all archived application and Auth rows unchanged';
   const after=await fingerprint();
   check(JSON.stringify(before)===JSON.stringify(after),'All archived application, Auth and Storage table counts and row digests remain unchanged');
   const report={passed:true,checks,checkpoint,isolatedRestore:true,applicationRebased:false,readOnly:true,
     verifiedSeparateGoogleIdentities:true,ownershipVerified:true,phase,managerStatus:child.status,enrollmentStatus:enrollment.status,
     savedGoogleCallbackAuditVerified:true,primaryLifecycleNotificationVerified:phase==='property_application',notifiedAdministrators,
     propertyApplicationCount:cases.length,activeAssignmentCount:assignments.length,pendingOperationalBindingDenied:child.status==='pending',
     foreignPrimaryIsolationChecked:foreign.length===1,foreignPrimaryIsolationUnavailable:foreign.length===0?'No other eligible actual saved primary binding exists.':undefined,
     differentActualSavedActorChecked:foreign.length+otherPortal.length>0,
     unchangedTables:after.length,authAndApplicationDataUnchanged:true,cloudConnections:false,providerCalls:false};
   save(report);console.log(JSON.stringify(report));
  }finally{await db.close();}
 });
}catch{
 const report={passed:false,checks,stage,lastCheck,checkpoint,isolatedRestore:true,applicationRebased:false,readOnly:true,cloudConnections:false,credentialsPrinted:false};
 save(report);console.error(JSON.stringify(report));process.exitCode=1;
}
