/** Wipe dependency boundaries in a disposable native restore. Actual archived
 * Google identities and provider sessions stay byte-for-byte unchanged. No
 * Cloud writes, fabricated Auth subjects, provider replies or wipe execution. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {checkApprovalKey,deniedApprovalKey} from '../supabase/adminGovernance.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabaseOfficerInvitations} from '../supabase/officerInvitations.js';
import {issueManagerKey,checkManagerKey} from '../supabase/managerKeys.js';
import {deliverRoomKey} from '../supabase/roomKeyDelivery.js';
import {systemWipePreview,proposeSystemWipe,voteSystemWipe,founderSystemWipeReview,
 startSystemWipePreparation,pauseSystemWipeScope,cancelSystemWipePreparation} from '../supabase/systemWipeReviews.js';

dotenv.config({quiet:true});
const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))
 throw Error('Pass genuine Auth and immutable pre-enrollment application checkpoint UUIDs.');
let checks=0,stage='restore';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,code:number|string,label:string){
 let error:any;try{await work();}catch(e){error=e;}
 if((typeof code==='number'?error?.status:error?.code)!==code)
  fs.writeFileSync('.security/migration-reset/system-wipe-scope-denial.log',JSON.stringify({label,expected:code,
   actualStatus:error?.status,actualCode:error?.code,error:String(error?.stack||error)},null,2),{mode:0o600});
 check(typeof code==='number'?error instanceof ApiError&&error.status===code:error?.code===code,label);
}
try{await withIsolatedBackup(checkpoint,async config=>{
 const db=new SupabaseDatabase(config);
 try{
  const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object(
   'users',(select jsonb_agg(to_jsonb(t)order by id)from auth.users t),
   'identities',(select jsonb_agg(to_jsonb(t)order by id)from auth.identities t),
   'sessions',(select jsonb_agg(to_jsonb(t)order by id)from auth.sessions t))::text)as d`)).rows[0].d;
  const beforeAuth=await authDigest();stage='local domain fixture';
  const f=await db.system(async c=>{
   const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name',u.email)as name,
    s.id as session_id from auth.users u join lateral(select id from auth.sessions where user_id=u.id
     and(not_after is null or not_after>clock_timestamp())order by created_at desc limit 1)s on true
    where u.email_confirmed_at is not null and not u.is_anonymous and u.deleted_at is null
     and(u.banned_until is null or u.banned_until<=clock_timestamp())
     and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
      and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
    order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 6`)).rows;
   check(people.length===6,'Six genuinely verified archived Google identities and native sessions');
   const admins:VerifiedActor[]=[],primaries:VerifiedActor[]=[],keys:string[]=[],settings:string[]=[];
   for(const [i,p]of people.entries()){
    await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
    const primaryId=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
    const primary={authUserId:p.id,sessionId:p.session_id,contextId:primaryId,kind:'primary'};primaries.push(primary);
    let actor=primary;
    if(i<5){
     actor={...primary,kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,'admin','active')returning id",[p.id])).rows[0].id};
     admins.push(actor);await c.query('insert into public.admin_memberships(context_id,slot)values($1,$2)',[actor.contextId,i+1]);
     const key=crypto.randomBytes(32).toString('base64url'),setting=crypto.randomBytes(32).toString('base64url');keys.push(key);settings.push(setting);
     await c.query(`insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at)
      values($1,$2,clock_timestamp(),$3,clock_timestamp())`,[actor.contextId,await hashCredentialAsync(`approval:${actor.contextId}:${key}`),
       await hashCredentialAsync(`settings:${actor.contextId}:${setting}`)]);
    }
    await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[actor.sessionId,actor.authUserId,actor.contextId]);
   }
   await c.query('update public.profiles set primary_owner_id=$2 where id=any($1::uuid[])',[[people[1].id,people[2].id],people[0].id]);
   const manager=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'manager','active')returning id",[people[1].id,people[0].id])).rows[0].id;
   const resident=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'resident','active')returning id",[people[2].id,people[0].id])).rows[0].id;
   const home=(await c.query("insert into public.residences(primary_owner_id,name,status,setup_submitted_at)values($1,$2,'approved',now())returning id",[people[0].id,people[0].name])).rows[0].id;
   await c.query('insert into public.manager_assignments(manager_context_id,residence_id)values($1,$2)',[manager,home]);
   await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status)values($1,$2,'residence_registration','approved')",[manager,home]);
   const block=(await c.query('insert into public.blocks(residence_id,name)values($1,$2)returning id',[home,people[0].name])).rows[0].id;
   const floor=(await c.query('insert into public.floors(block_id,floor_number)values($1,0)returning id',[block])).rows[0].id;
   const room=(await c.query("insert into public.rooms(floor_id,room_number)values($1,'1')returning id",[floor])).rows[0].id;
   const bed=(await c.query('insert into public.beds(room_id,bed_number)values($1,1)returning id',[room])).rows[0].id;
   const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id)values($1,$2,$3)returning id',[resident,room,bed])).rows[0].id;
   const emptyRoom=(await c.query("insert into public.rooms(floor_id,room_number)values($1,'2')returning id",[floor])).rows[0].id;
   await c.query('insert into public.beds(room_id,bed_number)values($1,1)',[emptyRoom]);
   const roomCode='PV-'+crypto.randomBytes(16).toString('hex').toUpperCase();
   const roomKey=(await c.query('insert into private.room_activation_keys(room_id,code)values($1,$2)returning id',[emptyRoom,roomCode])).rows[0].id;
   return{people,admins,primaries,keys,settings,manager,resident,home,room,allocation,emptyRoom,roomKey,roomCode};
  });
  stage='immutable migrations';await db.system(async c=>{
   const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
   for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
    const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
    if(ledger.has(version))assert.equal(ledger.get(version),digest);
    else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
   }
  });
  const run=<T>(a:VerifiedActor,work:(c:any)=>Promise<T>,exclusive=false)=>db.authorizedSystem(a,[a.kind],work,false,false,exclusive);
  // Direct native checks retain the PostgreSQL SQLSTATE. Product actor helpers
  // intentionally map a paused row to a retryable API409 instead.
  const native=async<T>(work:(c:PoolClient)=>Promise<T>)=>{
   const c=await db.pool.connect();try{await c.query('begin isolation level read committed');
    const result=await work(c);await c.query('commit');return result;
   }catch(error){await c.query('rollback');throw error;}finally{c.release();}
  };
  const grants=[];for(let i=0;i<5;i++){const g=await run(f.admins[i],c=>checkApprovalKey(c,f.admins[i],f.keys[i]));deniedApprovalKey(g);grants.push(g);}
  const view=(scopes:string[])=>run(f.admins[0],c=>systemWipePreview(c,f.admins[0],scopes));
  const propose=async(scopes:string[])=>{const preview=await view(scopes);return run(f.admins[1],c=>proposeSystemWipe(c,f.admins[1],grants[1],
   {scopes,reason:f.people[1].name,fingerprint:preview.fingerprint}),true);};
  const approve=async(id:string)=>{
   for(const i of[2,3,4,0])await run(f.admins[i],c=>voteSystemWipe(c,f.admins[i],grants[i],id,'approved'),true);
   await run(f.admins[0],c=>founderSystemWipeReview(c,f.admins[0],grants[0],id,{decision:'approve-backup',reason:f.people[0].name,confirmation:'APPROVE WIPE BACKUP'}),true);
   return run(f.admins[0],c=>startSystemWipePreparation(c,f.admins[0],grants[0],id,{confirmation:'START WIPE BACKUP'}),true);
  };
  const pause=(id:string)=>run(f.admins[0],c=>pauseSystemWipeScope(c,f.admins[0],grants[0],id,{confirmation:'PAUSE REVIEWED WIPE'}),true);
  const cancel=(id:string)=>run(f.admins[0],c=>cancelSystemWipePreparation(c,f.admins[0],grants[0],id,{reason:f.people[0].name}),true);
  const auth=new SupabaseAuth(db),invitations=new SupabaseOfficerInvitations(auth);
  const person=f.people[5],recipient=f.primaries[5];
  const create=()=>invitations.create(f.admins[0],{privateKey:f.keys[0],fullName:person.name,email:person.email,
   phone:'Isolated verification',assignedZone:'Local native boundary verification'});
  stage='actual retained delivery';
  const manager:VerifiedActor={authUserId:f.people[1].id,sessionId:f.people[1].session_id,contextId:f.manager,kind:'manager'};
  const delivery=await db.system(async c=>{
   await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[manager.sessionId,manager.contextId]);
  }).then(async()=>{
   try{
    const key=(await run(manager,c=>issueManagerKey(c,manager))).key;
    manager.managerKeyVersion=(await run(manager,c=>checkManagerKey(c,manager,key))).version;
    return await run(manager,c=>deliverRoomKey(c,manager,{keyId:f.roomKey,recipientEmail:person.email,requestId:crypto.randomUUID(),customNote:''}));
   }finally{
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[f.admins[1].sessionId,f.admins[1].contextId]));
   }
  });
  check(delivery.success&&!delivery.noChange,'Actual assigned manager sends current room key using own native key');
  const deliveryRow=(await db.pool.query('select * from private.room_key_deliveries where id=$1',[delivery.dispatch.id])).rows[0];
  const deliveryHistory=async()=>(await db.pool.query(`select md5(jsonb_build_object('delivery',to_jsonb(d),
   'notification',to_jsonb(n),'recipients',(select jsonb_agg(to_jsonb(r)-array['read_at','popup_acknowledged_at']order by context_id)from public.notification_recipients r where notification_id=n.id))::text)d
   from private.room_key_deliveries d join public.notifications n on n.id=d.notification_id where d.id=$1`,[delivery.dispatch.id])).rows[0].d;
  const initialDeliveryHistory=await deliveryHistory();
  stage='scope contract';
  const preview=await view(['users']);
  check(preview.executionAvailable===false,'The scope review cannot execute a wipe');
  check(preview.preview.retainedDependencies.room_key_deliveries.includes(delivery.dispatch.id),'Primary recipient selection retains its actual delivery even though sending manager is a different portal');
  const receiptDigest=(await db.pool.query("select encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex')d from private.room_key_deliveries d where id=$1",[delivery.dispatch.id])).rows[0].d;
  check(preview.preview.rowDigests.room_key_deliveries.find((d:any)=>d.id===delivery.dispatch.id)?.digest===receiptDigest,'Retained dependency digest covers the exact immutable native delivery');
  const noticeDigest=(await db.pool.query("select encode(sha256(convert_to(to_jsonb(n)::text,'UTF8')),'hex')d from public.notifications n where id=$1",[deliveryRow.notification_id])).rows[0].d;
  check(preview.preview.rowDigests.room_key_delivery_notifications.find((n:any)=>n.id===deliveryRow.notification_id)?.digest===noticeDigest,'Actual delivered notification content is covered in the reviewed dependency');
  check(preview.preview.rowDigests.room_key_delivery_recipients.length===1,'The exact one-recipient delivery relationship is retained in the preview');
  await db.actor(recipient,c=>c.query('update public.notification_recipients set read_at=coalesce(read_at,now()) where notification_id=$1 and context_id=$2',[deliveryRow.notification_id,recipient.contextId]));
  check((await view(['users'])).fingerprint===preview.fingerprint,'Reading a delivered notification does not alter the exact scope digest');
  const enrolled=(p:any,id:string)=>p.preview.rowDigests.pending_enrollments.find((e:any)=>e.id===id);
  const invitation=await create(),reserved=(await db.pool.query('select * from private.account_enrollments where id=$1',[invitation.invitationId])).rows[0];
  const users=await view(['users']);
  check(enrolled(users,reserved.id)?.kind==='officer','Primary-targeted officer invitation is a selected dependency');
  check(reserved.officer_reserved_subject===person.id&&reserved.initiator_context_id===f.admins[0].contextId,'Actual native reservation has separate administrator issuer and primary recipient');
  check(!users.preview.resources.account_contexts.includes(f.admins[0].contextId),'Primary selection preserves issuer administrator portal');
  check(users.preview.resources.account_contexts.includes(recipient.contextId),'Recipient primary portal is reviewed');
  check(users.fingerprint!==preview.fingerprint,'Directed officer dependency changes exact native preview digest');
  const fullEnrollmentDigest=(await db.pool.query("select encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex')d from private.account_enrollments e where id=$1",[reserved.id])).rows[0].d;
  check(enrolled(users,reserved.id).digest===fullEnrollmentDigest,'Enrollment digest covers saved private fields and exact reserved subject');
  check(users.preview.resources.account_enrollments.includes(reserved.id),'Only selected active enrollment is a potential lifecycle cancellation target');
  const encoded=JSON.stringify(users.preview);
  for(const secret of[invitation.invitationToken,reserved.token_digest,...f.keys,...f.settings,...f.people.map(p=>p.session_id)])
   check(!encoded.includes(secret),'Preview does not expose private invitations, credentials or native session UUIDs');
  for(const scope of['residents','hostels','managers','markets']){
   const p=await view([scope]);
   check(!enrolled(p,reserved.id),'Unrelated operational scope does not expand into primary mailbox invitation');
   check(!p.preview.resources.account_contexts.includes(recipient.contextId),'Unrelated portal scope preserves invitation recipient primary');
  }
  stage='exact invitation pause obligation';
  const review=await propose(['users']);await approve(review.id);
  await denied(()=>pause(review.id),409,'Active directed officer invitation blocks a reviewed primary write pause');
  check(!(await db.pool.query('select 1 from private.system_wipe_freezes f join private.system_wipe_preparations p on p.id=f.preparation_id where p.proposal_id=$1',[review.id])).rowCount,'Rejected pause creates no freeze');
  await invitations.cancel(f.admins[0],reserved.id,{privateKey:f.keys[0]});
  check((await db.pool.query('select status from private.account_enrollments where id=$1',[reserved.id])).rows[0].status==='cancelled','Actual own-key cancellation retains officer invitation history');
  const cancelledView=await view(['users']);
  check(enrolled(cancelledView,reserved.id)?.status==='cancelled','Selected completed enrollment history remains reviewed');
  check(!cancelledView.preview.resources.account_enrollments.includes(reserved.id),'Final invitation history is not treated as a mutable lifecycle target');
  check(!(await db.pool.query('select private.system_wipe_current(p)as current from public.admin_proposals p where id=$1',[review.id])).rows[0].current,'Saved scope becomes stale after real private enrollment lifecycle transition');
  await cancel(review.id);
  stage='unregistered officer dependency';
  // An explicit negative address is only an unconsumed local invitation selector.
  // It never becomes a fabricated or allegedly verified Auth identity.
  const unknownEmail='unregistered-'+crypto.randomUUID()+'@example.invalid';
  const unregistered=await invitations.create(f.admins[0],{privateKey:f.keys[0],fullName:person.name,email:unknownEmail,
   phone:'Isolated verification',assignedZone:'Local native boundary verification'});
  const unknownRow=(await db.pool.query('select * from private.account_enrollments where id=$1',[unregistered.invitationId])).rows[0];
  check(unknownRow.officer_reserved_subject===null&&unknownRow.auth_user_id===null,'An unregistered invitation creates no provider subject or officer portal');
  check(enrolled(await view(['total']),unknownRow.id)?.status==='pending_email','Total review includes unregistered officer invitations even though issuer administrator survives');
  check(!enrolled(await view(['users']),unknownRow.id),'Primary-only review does not adopt an unknown invitation mailbox');
  stage='scope freeze and before-after relationships';
  const readyReview=await propose(['users']);await approve(readyReview.id);
  // The writer starts its real UPDATE while the freeze INSERT is uncommitted.
  // A statement-level shared lock must wait, then a fresh native guard snapshot
  // must see the committed freeze; an earlier row read must not bypass it.
  let releaseFreeze!:()=>void,freezeInserted!:()=>void,rejectFreeze!:(e:unknown)=>void;
  const held=new Promise<void>(resolve=>{releaseFreeze=resolve;});
  const inserted=new Promise<void>((resolve,reject)=>{freezeInserted=resolve;rejectFreeze=reject;});
  const freezing=run(f.admins[0],async c=>{
   const result=await pauseSystemWipeScope(c,f.admins[0],grants[0],readyReview.id,{confirmation:'PAUSE REVIEWED WIPE'});
   freezeInserted();await held;return result;
  },true).then(result=>({result,error:undefined as any}),error=>{rejectFreeze(error);return{result:undefined,error};});
  let writerPid!:number,writerStarted!:()=>void,waiterObserved=false;
  const startedWriter=new Promise<void>(resolve=>{writerStarted=resolve;});
  let writeResult:{error:any}|undefined;
  let writing:Promise<{error:any}>|undefined;
  try{
   await inserted;
   writing=native(async c=>{
    writerPid=(await c.query('select pg_backend_pid()as pid')).rows[0].pid;writerStarted();
    await c.query('update public.notifications set message=message||$2 where id=$1',[deliveryRow.notification_id,' changed']);
   }).then(()=>({error:undefined}),error=>({error}));
   await startedWriter;
   for(let i=0;i<200;i++){
    if((await db.pool.query("select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'and wait_event='advisory'",[writerPid])).rowCount){waiterObserved=true;break;}
    await new Promise(resolve=>setTimeout(resolve,25));
   }
  }finally{releaseFreeze();}
  const freezeResult=await freezing;if(freezeResult.error)throw freezeResult.error;
  const frozen=freezeResult.result!;if(writing)writeResult=await writing;
  check(waiterObserved,'Native notice content UPDATE actually waits behind the reviewed freeze lock');
  check(writeResult?.error?.code==='55000','Waiting native notice writer rechecks committed selected scope and is denied');
  check(frozen.success&&!frozen.noChange&&frozen.executionAvailable===false,'Five native own-key approvals and independent founder review pause exact scope without execution');
  const paused=async(table:string,before:Record<string,unknown>,after:Record<string,unknown>)=>(await db.pool.query(
   'select private.system_wipe_row_paused($1,$2,$3::jsonb,$4::jsonb)as paused',['private',table,JSON.stringify(before),JSON.stringify(after)])).rows[0].paused;
  check(await paused('room_key_deliveries',{}, {recipient_context_id:recipient.contextId}),'Native recipient_context_id alone intersects selected primary scope');
  check(await paused('room_key_deliveries',{recipient_context_id:recipient.contextId},{}),'Removing a selected recipient relationship remains paused');
  check(!await paused('room_key_deliveries',{}, {recipient_context_id:f.admins[0].contextId}),'Preserved administrator recipient is not inferred from its ordinary primary');
  const officerSelection={kind:'officer',status:'pending_email',initiator_context_id:f.admins[0].contextId,officer_reserved_subject:person.id};
  check(await paused('account_enrollments',{},officerSelection),'Pending invitation targeting selected real Auth subject is paused before INSERT');
  check(await paused('account_enrollments',officerSelection,{}),'An old directed recipient cannot escape a pause through changed relationship fields');
  check(await paused('account_enrollments',{}, {...officerSelection,officer_reserved_subject:null,invited_email:person.email}),'Native predicate follows real current identity when original officer reservation had no provider subject');
  check(!await paused('account_enrollments',{}, {...officerSelection,officer_reserved_subject:null,invited_email:unknownEmail}),'Unknown mailbox invitation is not expanded into a primary scope');
  const beforeRead=await view(['users']);
  await db.actor(recipient,c=>c.query('update public.notification_recipients set read_at=clock_timestamp() where notification_id=$1 and context_id=$2',[deliveryRow.notification_id,recipient.contextId]));
  check((await view(['users'])).fingerprint===beforeRead.fingerprint,'Paused scope still allows own notification reading without staling consent');
  await denied(()=>native(c=>c.query('update public.notifications set message=message||$2 where id=$1',[deliveryRow.notification_id,' changed'])),'55000','Direct SQL cannot alter the exact retained delivery notice while paused');
  await denied(()=>native(c=>c.query('delete from public.notification_recipients where notification_id=$1 and context_id=$2',[deliveryRow.notification_id,recipient.contextId])),'55000','Direct SQL cannot remove the exact retained delivery recipient while paused');
  await denied(()=>create(),409,'Fresh officer reservation cannot target a paused selected primary');
  await denied(()=>native(c=>c.query("update public.account_contexts set updated_at=clock_timestamp() where id=$1",[recipient.contextId])),'55000','Direct SQL cannot update selected primary through another caller');
  check(await deliveryHistory()===initialDeliveryHistory,'Pause and denial retain exact room delivery, immutable notice content and recipient identity');
  for(const admin of f.admins)check((await db.pool.query('select active_context_id from private.account_sessions where session_id=$1',[admin.sessionId])).rows[0].active_context_id===admin.contextId,'Every real administrator appbinding is retained during ordinary-primary pause');
  await cancel(readyReview.id);
  await invitations.cancel(f.admins[0],unregistered.invitationId,{privateKey:f.keys[0]});
  const afterCancellation=await create();
  check(afterCancellation.success,'Founder cancellation resumes actual invitation writes without reopening or deleting portals');
  await invitations.cancel(f.admins[0],afterCancellation.invitationId,{privateKey:f.keys[0]});
  await denied(()=>db.system(c=>c.query('delete from private.room_key_deliveries where id=$1',[delivery.dispatch.id])),'42501','Retained room delivery history cannot be deleted');
  await denied(()=>db.system(c=>c.query('delete from private.account_enrollments where id=$1',[reserved.id])),'42501','Retained officer invitation history cannot be deleted');
  check(await deliveryHistory()===initialDeliveryHistory,'Freeze cancellation leaves exact retained delivery and notification unchanged');
  stage='native access and lifecycle preservation';
  for(const role of['anon','authenticated','pinevela_backend']){
   for(const fn of['private.system_wipe_enrollment_selected(private.account_enrollments,jsonb)',
    'private.system_wipe_preview(jsonb)','private.system_wipe_row_paused(text,text,jsonb,jsonb)'])
    check(!(await db.pool.query("select has_function_privilege($1,$2,'EXECUTE')as allowed",[role,fn])).rows[0].allowed,'Private wipe relationship helpers grant no browser or scoped backend access');
   for(const table of['private.account_enrollments','private.room_key_deliveries'])
    check(!(await db.pool.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')as allowed",[role,table])).rows[0].allowed,'Private pending and retained history tables stay inaccessible directly');
  }
  for(const context of[...f.primaries,...f.admins])
   check((await db.pool.query('select status from public.account_contexts where id=$1',[context.contextId])).rows[0].status==='active','Scope review, pause and cancellation do not close any genuine account portal');
  check((await db.pool.query('select count(*)::int n from private.primary_wipe_executions')).rows[0].n===0,'No primary wipe execution was manufactured or run');
  check(await deliveryHistory()===initialDeliveryHistory,'Final immutable delivery history and exact retained recipient notice unchanged');
  check(await authDigest()===beforeAuth,'Genuine Auth identities and native sessions unchanged');
  const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,cloudWrites:false,
   providerRepliesMocked:false,executionAvailable:false,actualDirectedInvitation:true,actualRetainedRoomDelivery:true,
   actualNoticeWriterWaitObserved:waiterObserved,nativeAuthBytesUnchanged:true};
  fs.writeFileSync('.security/migration-reset/system-wipe-scope-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));
 }finally{await db.close();}
},{applicationCheckpoint});}catch(e:any){
 fs.writeFileSync('.security/migration-reset/system-wipe-scope-failure.log',String(e?.stack||e),{mode:0o600});
 console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,
  error:e instanceof assert.AssertionError?e.message:'Native verification failed; private diagnostics saved.'}));process.exitCode=1;
}
