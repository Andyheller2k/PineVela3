/** Genuine archived provider identities; only the disposable local domain schema is changed. */
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {SupabaseAdminGovernance,checkApprovalKey,requireApprovalGrant} from '../supabase/adminGovernance.js';
import {SupabaseOfficerInvitations,officerInvitationDigest,inspectOfficerInvitation,acceptOfficerInvitation,officerInvitationRows,changeOfficerStatus} from '../supabase/officerInvitations.js';
import {validateLoginContinuation,validatePublicContinuation} from '../publicContinuation.js';

const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(!checkpoint||!applicationCheckpoint)throw Error('Pass genuine Auth and immutable migration-27 application backup UUIDs.');
let checks=0,stage='restore';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string) {
  let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);
}
try {await withIsolatedBackup(checkpoint,async config=>{
  let db=new SupabaseDatabase(config);
  try {
    const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id)from auth.users t),
      'identities',(select jsonb_agg(to_jsonb(t) order by id)from auth.identities t),
      'sessions',(select jsonb_agg(to_jsonb(t) order by id)from auth.sessions t))::text)d`)).rows[0].d;
    const beforeAuth=await authDigest();stage='fixture';
    const f=await db.system(async c=>{
      const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') as name,s.id sid
        from auth.users u join lateral(select id from auth.sessions where user_id=u.id and(not_after is null or not_after>clock_timestamp())
          order by created_at desc limit 1)s on true
        where u.email_confirmed_at is not null and not u.is_anonymous and u.deleted_at is null
          and(u.banned_until is null or u.banned_until<=clock_timestamp())
          and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
            and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
        order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 6`)).rows;
      check(people.length>=5,'Five genuine verified subjects and existing native sessions available');
      const admins:VerifiedActor[]=[],primaries:VerifiedActor[]=[],keys:string[]=[],settings:string[]=[];
      for(const [i,p]of people.entries()) {
        // Leave the fifth real subject without an app profile to exercise ordinary signup after an officer reservation.
        if(i===4)continue;
        await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        const id=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
        const primary={contextId:id,authUserId:p.id,sessionId:p.sid,kind:'primary'};primaries[i]=primary;
        let actor=primary;
        if(i<3) {
          actor={...primary,contextId:(await c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,'admin','active')returning id",[p.id])).rows[0].id,kind:'admin'};
          await c.query('insert into public.admin_memberships(context_id,slot)values($1,$2)',[actor.contextId,i+1]);
          const key=crypto.randomBytes(32).toString('base64url'),setting=crypto.randomBytes(32).toString('base64url');keys.push(key);settings.push(setting);admins.push(actor);
          await c.query(`insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at)
            values($1,$2,clock_timestamp(),$3,clock_timestamp())`,[actor.contextId,await hashCredentialAsync(`approval:${actor.contextId}:${key}`),await hashCredentialAsync(`settings:${actor.contextId}:${setting}`)]);
        }else if(i===5)await c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,'officer','closed')",[p.id]);
        await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[actor.sessionId,actor.authUserId,actor.contextId]);
      }
      return {people,admins,primaries,keys,settings};
    });
    stage='migrations';await db.system(async c=>{
      const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
      for(const file of fs.readdirSync('supabase/migrations').filter(x=>/^\d{14}.*\.sql$/.test(x)).sort()) {
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),digest=crypto.createHash('sha256').update(sql).digest('hex');
        if(ledger.has(file.slice(0,14)))assert.equal(ledger.get(file.slice(0,14)),digest);
        else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[file.slice(0,14),digest]);}
      }
    });
    check((await db.pool.query("select count(*)::int n from pg_attribute where attrelid='private.account_enrollments'::regclass and attname='officer_approval_key_version' and not attisdropped")).rows[0].n===1,'Combined officer migration is present');
    let auth=new SupabaseAuth(db),service=new SupabaseOfficerInvitations(auth);
    const [founder,second,third]=f.admins,recipient=f.primaries[3],person=f.people[3],otherPerson=f.people[4];
    const payload=(p=person)=>({fullName:p.name||p.email,email:p.email,phone:'+233 20 123 9876',assignedZone:'Verified native fixture inspection zone'});
    const create=(p=person,key=f.keys[0],a=founder)=>service.create(a,{...payload(p),privateKey:key});
    const accept=(token:string,a=recipient)=>db.authorizedSystem(a,['primary'],c=>acceptOfficerInvitation(c,a,officerInvitationDigest(token)));
    const inspect=(token:string,a=recipient)=>db.authorizedSystem(a,['primary'],c=>inspectOfficerInvitation(c,a,officerInvitationDigest(token)));
    const rows=()=>db.authorizedSystem(founder,['admin'],c=>officerInvitationRows(c));
    stage='authorization';
    await denied(()=>create(person,f.settings[0]),403,'Settings key cannot authorize an officer invitation');
    await denied(()=>create(person,f.keys[1]),403,'Another administrator key cannot authorize the inviter');
    await denied(()=>service.create(founder,{...payload(),privateKey:f.keys[0],password:'must-not-be-created'}),400,'Administrator cannot supply an officer password');
    await denied(()=>service.create(founder,{...payload(),privateKey:f.keys[0],userId:recipient.authUserId}),400,'Client ownership fields rejected');
    await denied(()=>create(f.people[0]),409,'Existing administrator identity cannot become an officer');
    if(f.people[5])await denied(()=>create(f.people[5]),409,'Closed officer identity cannot be adopted into another invitation');
    const invitation=await create(person,f.keys[1],second),digest=officerInvitationDigest(invitation.invitationToken);
    const stored=(await db.pool.query('select * from private.account_enrollments where id=$1',[invitation.invitationId])).rows[0];
    check(stored.kind==='officer'&&stored.primary_owner_id===null&&stored.room_id===null&&stored.residence_id===null,'Officer grant has no owner or housing spoofing scope');
    check(stored.officer_reserved_subject===person.id&&stored.auth_user_id===null&&stored.linked_context_id===null,'Reservation binds exact known real subject without activating a portal');
    check(stored.token_digest===digest&&stored.token_digest!==invitation.invitationToken,'Only one-way private token digest saved');
    check(new Date(stored.expires_at).getTime()-new Date(stored.created_at).getTime()===86400000,'Native deadline exactly 24 hours');
    check(!JSON.stringify(await rows()).includes(invitation.invitationToken)&&!JSON.stringify(await rows()).includes(digest),'Administrative list omits raw tokens and digests');
    await denied(()=>create(),409,'Duplicate unfinished officer reservation rejected');
    await denied(()=>inspect(crypto.randomBytes(32).toString('base64url')),403,'Unknown invitation reveals no mailbox');
    await denied(()=>inspect(invitation.invitationToken,f.primaries[0]),401,'Admin-bound native session cannot impersonate primary recipient');
    await denied(()=>accept(invitation.invitationToken,founder),403,'Administrator portal cannot accept invitation');
    await denied(()=>Promise.resolve(officerInvitationDigest('invalid')),400,'Malformed private tokens rejected');
    check((await inspect(invitation.invitationToken)).id===stored.id,'Matching verified primary can inspect invitation');
    await denied(()=>db.system(c=>c.query('delete from private.account_enrollments where id=$1',[stored.id])),'42501','Invitation history retained');
    await denied(()=>db.system(c=>c.query('truncate private.account_enrollments cascade')),'42501','Native TRUNCATE cannot erase officer invitation history');
    check((await db.pool.query('select id from private.account_enrollments where id=$1',[stored.id])).rowCount===1,'Rejected truncate preserves saved grant');
    await denied(()=>db.system(c=>c.query("update private.account_enrollments set expires_at=expires_at+interval'1 day' where id=$1",[stored.id])),'42501','Raw deadline extension rejected');
    await denied(()=>db.system(c=>c.query("update private.account_enrollments set status='cancelled' where id=$1",[stored.id])),'42501','Raw cancellation requires current administrator key');
    await denied(()=>db.system(c=>c.query("update private.account_enrollments set status='completed',auth_user_id=$2,linked_context_id=$3 where id=$1",[stored.id,person.id,recipient.contextId])),'42501','Raw receipt cannot confer officer access');
    await denied(()=>db.authorizedSystem(recipient,['primary'],c=>c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,'officer','active')",[person.id])),'42501','Raw officer context insertion requires saved private invitation');
    check(!(await db.pool.query("select 1 from public.account_contexts where auth_user_id=$1 and kind='officer'",[person.id])).rowCount,'Denied insertion leaves no officer portal');
    check(!(await db.authorizedSystem(recipient,['primary'],async c=>{
      await c.query("select set_config('pinevela.officer_enrollment_id',$1,true),set_config('pinevela.officer_invitation_digest',$2,true)",[stored.id,digest]);
      return c.query(`select private.officer_invitation_acceptance_allowed(jsonb_populate_record(null::private.account_enrollments,
        to_jsonb(e)||jsonb_build_object('expires_at',clock_timestamp()-interval'1 second')),gen_random_uuid())allowed from private.account_enrollments e where id=$1`,[stored.id]);
    })).rows[0].allowed,'Native acceptance refuses expired composite even with exact saved proof');
    stage='standard signup';
    const other=await create(otherPerson);
    await denied(()=>db.system(c=>c.query('select private.initialize_auth_profile($1,$2)',[otherPerson.id,other.invitationToken])),'23514','Officer link cannot be used as an automatic Auth enrollment nonce');
    check(!(await db.pool.query('select 1 from public.profiles where id=$1',[otherPerson.id])).rowCount,'Rejected role nonce leaves genuine retained subject without an app profile');
    const newcomer=await db.system(async c=>{
      await c.query('select private.initialize_auth_profile($1,null)',[otherPerson.id]);
      const id=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[otherPerson.id])).rows[0].id;
      await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[otherPerson.sid,otherPerson.id,id]);
      return {authUserId:otherPerson.id,sessionId:otherPerson.sid,contextId:id,kind:'primary'};
    });
    check(!(await db.pool.query("select 1 from public.account_contexts where auth_user_id=$1 and kind='officer'",[newcomer.authUserId])).rowCount,'Standard verified signup during officer reservation grants only primary role');
    await denied(()=>inspect(invitation.invitationToken,newcomer),403,'Different verified mailbox cannot inspect stolen invitation');
    await denied(()=>accept(invitation.invitationToken,newcomer),403,'Different verified mailbox cannot consume stolen invitation');
    await service.cancel(founder,other.invitationId,{privateKey:f.keys[0]});
    await denied(()=>accept(other.invitationToken,newcomer),403,'Cancelled invitation cannot be accepted');
    const cancelled=(await db.pool.query('select * from private.account_enrollments where id=$1',[other.invitationId])).rows[0];
    await denied(()=>db.system(c=>c.query("update private.account_enrollments set status='pending_email' where id=$1",[cancelled.id])),'42501','Cancelled grant cannot revive');
    stage='rollback';
    await db.system(c=>c.query(`create function private.test_officer_notice_failure()returns trigger language plpgsql as $$begin
      if new.title='Verification officer invitation accepted' then raise exception 'Isolated notification failure' using errcode='23514';end if;return new;end;$$;
      create trigger test_officer_notice_failure before insert on public.notifications for each row execute function private.test_officer_notice_failure();`));
    await denied(()=>accept(invitation.invitationToken),'23514','Late notification failure rolls back officer context and receipt');
    check((await db.pool.query('select status from private.account_enrollments where id=$1',[stored.id])).rows[0].status==='pending_email','Late failure preserves unconsumed invitation');
    check(!(await db.pool.query("select 1 from public.account_contexts where auth_user_id=$1 and kind='officer'",[person.id])).rowCount,'Late failure leaves no role elevation');
    await db.system(c=>c.query('drop trigger test_officer_notice_failure on public.notifications;drop function private.test_officer_notice_failure();'));
    stage='concurrent acceptance';
    const attempts=await Promise.all([accept(invitation.invitationToken),accept(invitation.invitationToken)]);
    check(attempts.filter(x=>!x.alreadyAccepted).length===1&&attempts.every(x=>x.id===attempts[0].id),'Concurrent retries return one immutable acceptance');
    const id=attempts[0].id,receipt=(await db.pool.query('select * from private.account_enrollments where id=$1',[stored.id])).rows[0];
    check(receipt.status==='completed'&&receipt.auth_user_id===person.id&&receipt.linked_context_id===id&&receipt.verified_at,'Receipt records exact subject, context and acceptance time');
    check((await db.pool.query("select count(*)::int n from public.account_contexts where auth_user_id=$1 and kind='officer'",[person.id])).rows[0].n===1,'One actual officer portal');
    check((await db.pool.query("select count(*)::int n from private.audit_events where event_type='officer_invitation_accepted' and resource_id=$1",[stored.id])).rows[0].n===1,'Exactly one acceptance audit');
    check((await db.pool.query("select count(*)::int n from public.notifications where title='Verification officer invitation accepted'")).rows[0].n===1,'Exactly one acceptance notification');
    check((await db.pool.query(`select count(*)::int n from public.notification_recipients r join public.notifications n on n.id=r.notification_id
      where n.title='Verification officer invitation accepted'`)).rows[0].n===4,'Three actual active administrators and recipient primary receive notice');
    check((await db.pool.query('select active_context_id from private.account_sessions where session_id=$1',[recipient.sessionId])).rows[0].active_context_id===recipient.contextId,'Acceptance does not silently switch the primary session');
    await denied(()=>db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[recipient.sessionId,id])),'42501','Earlier real native primary session cannot enter newly accepted officer portal');
    await denied(()=>auth.switchContext(recipient,id),401,'Stale officer context switch maps native denial to sign-in error instead of server failure');
    stage='status versus first binding';
    // Exercise a first app-binding INSERT for an actual earlier provider session.
    // Auth rows and native session times stay intact throughout this race.
    await db.system(c=>c.query('delete from private.account_sessions where session_id=$1 and active_context_id=$2',[recipient.sessionId,recipient.contextId]));
    let releaseContext!:()=>void,contextLocked!:()=>void,rejectContext!:(e:unknown)=>void;
    const held=new Promise<void>(resolve=>{releaseContext=resolve;}),locked=new Promise<void>((resolve,reject)=>{contextLocked=resolve;rejectContext=reject;});
    const statusWrite=db.authorizedSystem(founder,['admin'],async c=>{
      const grant=await checkApprovalKey(c,founder,f.keys[0]);await requireApprovalGrant(c,founder,grant);
      await c.query("select id from public.account_contexts where id=$1 and kind='officer' for update",[id]);contextLocked();
      await held;return changeOfficerStatus(c,founder,grant,id,'suspended');
    }).then(result=>({result,error:undefined as any}),error=>{rejectContext(error);return {result:undefined,error};});
    let pendingBinding:Promise<{error:any;inserted:boolean}>|undefined;
    try {
      await locked;
      let readerReady!:(pid:number)=>void;const ready=new Promise<number>(resolve=>{readerReady=resolve;});
      pendingBinding=db.system(async c=>{
        readerReady((await c.query('select pg_backend_pid() as pid')).rows[0].pid);
        await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[recipient.sessionId,recipient.authUserId,id]);
      }).then(()=>({error:undefined,inserted:true}),error=>({error,inserted:false}));
      const pid=await ready;let blocked=false;
      for(let attempt=0;attempt<50;attempt++) {
        blocked=!!(await db.pool.query("select 1 from pg_stat_activity where pid=$1 and state='active' and wait_event_type='Lock'",[pid])).rowCount;
        if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20));
      }
      check(blocked,'First officer binding waits while administrator holds exact context update lock');
    }finally {releaseContext();}
    const statusOutcome=await statusWrite;if(statusOutcome.error)throw statusOutcome.error;
    const bindingOutcome=await pendingBinding!;
    check(!bindingOutcome.inserted&&bindingOutcome.error?.code==='42501','Pending first binding denies after administrator status transition commits');
    check((await db.pool.query('select status from public.account_contexts where id=$1',[id])).rows[0].status==='suspended','Concurrent suspension remains saved');
    check(!(await db.pool.query('select 1 from private.account_sessions where active_context_id=$1',[id])).rowCount,'Concurrent binding cannot recreate officer access behind suspension');
    // Restore only the retained primary app binding, never fabricate a provider session.
    await db.system(c=>c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[recipient.sessionId,recipient.authUserId,recipient.contextId]));
    await service.status(founder,id,{status:'active',privateKey:f.keys[0]});
    stage='identity and status';
    await denied(()=>db.system(c=>c.query('update public.account_contexts set auth_user_id=$2 where id=$1',[id,founder.authUserId])),'42501','Officer cannot be reassigned to an administrator subject');
    await denied(()=>db.system(c=>c.query('delete from public.account_contexts where id=$1',[id])),'42501','Officer context history retained');
    await denied(()=>db.system(c=>c.query("update public.account_contexts set kind='primary' where id=$1",[id])),'42501','Officer kind immutable');
    await denied(()=>db.system(c=>c.query('update private.account_enrollments set verified_at=null where id=$1',[stored.id])),'42501','Acceptance receipt immutable');
    await denied(()=>service.cancel(founder,stored.id,{privateKey:f.keys[0]}),409,'Accepted invitation cannot be cancelled');
    await denied(()=>db.system(c=>c.query("update public.account_contexts set status='suspended' where id=$1",[id])),'42501','Officer suspension requires current administrator approval key');
    await denied(()=>service.status(founder,id,{status:'suspended'}),403,'HTTP status service requires administrator own key');
    await service.status(founder,id,{status:'suspended',privateKey:f.keys[0]});
    check((await db.pool.query('select status from public.account_contexts where id=$1',[id])).rows[0].status==='suspended','Keyed suspension saves native officer status');
    const suspendedRetry=await accept(invitation.invitationToken);
    check(suspendedRetry.alreadyAccepted&&suspendedRetry.officerStatus==='suspended'&&!suspendedRetry.accessAvailable,'Consumed invitation reports actual suspension without offering officer access');
    check((await db.pool.query('select status from public.account_contexts where id=$1',[id])).rows[0].status==='suspended','Consumed link does not restore suspended officer');
    await service.status(founder,id,{status:'inactive',privateKey:f.keys[0]});
    const closedRetry=await accept(invitation.invitationToken);
    check(closedRetry.officerStatus==='closed'&&!closedRetry.accessAvailable,'Consumed invitation cannot reopen closed officer');
    await service.status(founder,id,{status:'active',privateKey:f.keys[0]});
    check((await db.pool.query('select status from public.account_contexts where id=$1',[id])).rows[0].status==='active','Keyed restoration retains completed invitation');
    await denied(()=>db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[recipient.sessionId,id])),'42501','Earlier native session cannot bypass fresh sign-in after officer restoration');
    stage='private access';
    await denied(()=>db.actor(founder,c=>c.query('select * from private.account_enrollments')),'42501','Backend browser role cannot read invitation grants');
    await denied(()=>db.system(async c=>{await c.query('set local role anon');return c.query('select * from private.account_enrollments');}),'42501','Guest cannot read invitation tokens');
    await denied(()=>db.system(async c=>{await c.query('set local role authenticated');return c.query('select private.officer_invitation_issuer_valid(e) from private.account_enrollments e');}),'42501','Authenticated browser cannot invoke private protocol helper');
    check((await db.pool.query(`select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='private' and p.proname in('officer_invitation_issuer_valid','officer_invitation_acceptance_allowed','guard_officer_invitation',
       'guard_officer_context','guard_officer_session_binding','officer_invitation_recorded','officer_invitation_issuer_changed') and p.prosecdef`)).rows[0].n===0,'New protocol adds no SECURITY DEFINER helpers');
    stage='restart';await db.close();db=new SupabaseDatabase(config);auth=new SupabaseAuth(db);service=new SupabaseOfficerInvitations(auth);
    check((await accept(invitation.invitationToken)).alreadyAccepted,'Same verified recipient retry survives server pool restart without another role');
    stage='issuer authority';
    const outstanding=await create(otherPerson,f.keys[1],second),governance=new SupabaseAdminGovernance(auth);
    const recovery=await governance.propose(founder,second.contextId,{action:'reset-key',reason:'Isolated genuine approval-key recovery verification',privateKey:f.keys[0]});
    await governance.vote(third,recovery.id,{decision:'approved',privateKey:f.keys[2]});
    check((await db.pool.query('select status from private.account_enrollments where id=$1',[outstanding.invitationId])).rows[0].status==='cancelled','Recovered issuer approval key immediately closes pending officer grant');
    await denied(()=>accept(outstanding.invitationToken,newcomer),403,'Key-invalidated grant cannot later be accepted');
    check((await db.pool.query('select status from public.account_contexts where id=$1',[id])).rows[0].status==='active','Issuer recovery preserves already accepted officer');
    const suspension=await create(otherPerson,f.keys[2],third);
    await governance.setActive(founder,third.contextId,{active:false,privateKey:f.keys[0]});
    check((await db.pool.query('select status from private.account_enrollments where id=$1',[suspension.invitationId])).rows[0].status==='cancelled','Issuer suspension immediately cancels unfinished invitation');
    await governance.setActive(founder,third.contextId,{active:true,privateKey:f.keys[0]});
    await denied(()=>accept(suspension.invitationToken,newcomer),403,'Restoring issuer cannot revive cancelled grant');
    check(await authDigest()===beforeAuth,'Every genuine Auth user, identity and native session preserved byte-for-byte');
    const continuation=`/officer-invitation?token=${invitation.invitationToken}`;
    check(validateLoginContinuation(continuation)===continuation,'Strict officer invitation resumes after ordinary verified sign-in');
    check(!validatePublicContinuation(continuation),'Private officer token never enters catalog continuation persistence');
    for(const value of ['https://evil.invalid'+continuation,'//evil.invalid',continuation+'&role=officer',continuation+'#fragment',continuation+'&token='+invitation.invitationToken,'/officer-invitation?token=invalid'])
      check(!validateLoginContinuation(value),'Foreign, duplicate, malformed or additional continuation claims rejected');
    const advisors=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
    fs.writeFileSync('.security/migration-reset/officer-invitations-native-advisors.json',advisors.stdout.length?advisors.stdout:advisors.stderr,{mode:0o600});
    check(advisors.status===0,'Native security advisors complete');const data=JSON.parse(advisors.stdout.toString()),findings=data.results||data;
    check(Array.isArray(findings)&&findings.length===0,'Native security advisors report no findings');
    const report={passed:true,checks,isolatedNative:true,authAccountsFabricated:false,nativeSessionTimestampsChanged:false,cloudRecordsModified:0,
      providerMocks:0,officerFreshLoginVerified:false,providerBrowserAcceptance:'Actual verified officer signup/login and private invitation browser acceptance remain pending.'};
    fs.writeFileSync('.security/migration-reset/officer-invitations-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
  }finally{await db.close();}
},{applicationCheckpoint});
}catch(error) {
  fs.writeFileSync('.security/migration-reset/officer-invitations-failure.json',JSON.stringify({stage,checks,error:String(error),stack:(error as Error).stack},null,2),{mode:0o600});
  console.error(JSON.stringify({passed:false,stage,checks,code:(error as any)?.code,assertion:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;
}
