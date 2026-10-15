/** Wipe review protocol in a disposable native restore. Actual archived Google
 * identities/sessions only; no cloud writes, simulated provider replies or wipes. */
import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';import {checkApprovalKey,deniedApprovalKey,setAdministratorActive} from '../supabase/adminGovernance.js';
import {wipeScopes,systemWipePreview,proposeSystemWipe,voteSystemWipe,founderSystemWipeReview,refreshSystemWipeReviews,systemWipeReviewStatus} from '../supabase/systemWipeReviews.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';
import {storageCheckpoint,storageArchiveRoot} from './lib/storage-checkpoint.js';
import {createStorageBackup,readStorageSnapshot,verifyStorageBackup} from '../supabase/storageBackup.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {pauseSystemWipeScope,authorizeSystemWipeExecution,startSystemWipePreparation,cancelSystemWipePreparation} from '../supabase/systemWipeReviews.js';
import {systemWipeRecoveryPreparation,verifySystemWipeRecoveryFiles,recordSystemWipeRecovery,attachSystemWipeRecovery} from './lib/system-wipe-recovery.js';
import path from 'node:path';
import{executePrimaryWipeCore}from'./lib/primary-wipe-execution.js';
import{initializeRetainedGooglePrimary,reopenRetainedPrimary,unavailableAccountError}from'../supabase/googleSignup.js';
import {emailReentryAvailable,primaryReentryEmail,primaryReentryChallenge} from '../supabase/primaryEmailReentry.js';
dotenv.config({quiet:true});const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0];const checkpointFiles:string[]=[],storageDirectories:string[]=[];
let checks=0,stage='restore';function check(v:unknown,label:string){assert.ok(v,label);checks++;}
async function denied(work:()=>Promise<unknown>,status:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}
 if((typeof status==='number'?e?.status:e?.code)!==status)fs.writeFileSync('.security/migration-reset/primary-wipe-denial.log',JSON.stringify({label,status,actualStatus:e?.status,actualCode:e?.code,detail:String(e?.stack||e)},null,2),{mode:0o600});
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
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
   if(ledger.has(version))assert.equal(ledger.get(version),digest);else{try{await c.query(sql);}catch(e:any){if(e.position)console.error(JSON.stringify({version,position:e.position,context:sql.slice(Math.max(0,Number(e.position)-80),Number(e.position)+80)}));throw e;}await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
  }
  await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[people[5].session_id,people[5].id,owners[5]]);
  return{people,admins,keys,settings,owners};
 });
 const{people,admins,keys,owners}=fixture;
 const run=<T>(a:VerifiedActor,work:(c:any)=>Promise<T>)=>db.authorizedSystem(a,[a.kind],work,false,false,true);
 const grants=[];for(let i=0;i<5;i++){const g=await run(admins[i],c=>checkApprovalKey(c,admins[i],keys[i]));deniedApprovalKey(g);grants.push(g);}
 const propose=async()=>{const v=await run(admins[1],c=>systemWipePreview(c,admins[1],['users']));return run(admins[1],c=>proposeSystemWipe(c,admins[1],grants[1],{scopes:['users'],reason:people[1].name,fingerprint:v.fingerprint}));};
 const prepare=async()=>{const p=await propose();for(const i of[2,3,4,0])await run(admins[i],c=>voteSystemWipe(c,admins[i],grants[i],p.id,'approved'));
  await run(admins[0],c=>founderSystemWipeReview(c,admins[0],grants[0],p.id,{decision:'approve-backup',reason:people[0].name,confirmation:'APPROVE WIPE BACKUP'}));
  await run(admins[0],c=>startSystemWipePreparation(c,admins[0],grants[0],p.id,{confirmation:'START WIPE BACKUP'}));
  await run(admins[0],c=>pauseSystemWipeScope(c,admins[0],grants[0],p.id,{confirmation:'PAUSE REVIEWED WIPE'}));return p;
 };
 const archives=async(proposalId:string)=>{const backup=nativeRecoveryCheckpoint(config,projectRef);checkpointFiles.push(...backup.files);
  const{binding,snapshot}=await storageCheckpoint(backup.id);const storage=new SupabaseStorage();
  const saved=await createStorageBackup(storageArchiveRoot(),binding,snapshot,o=>storage.downloadForBackup(o.path,o),()=>db.system(c=>readStorageSnapshot(c)));
  storageDirectories.push(path.join(storageArchiveRoot(),saved.id+'.pvstorage'));
  const verified=await verifySystemWipeRecoveryFiles(proposalId,backup.id,saved.id);await db.system(c=>recordSystemWipeRecovery(c,verified,projectRef));return verified;
 };
 stage='email input boundaries';
 const providerUrl=new URL(process.env.SUPABASE_URL!).origin,link=providerUrl+'/auth/v1/verify?type=magiclink&token='+crypto.randomBytes(32).toString('hex');
 check(primaryReentryEmail(' '+people[5].email.toUpperCase()+' ')===people[5].email.toLowerCase(),'Delivery mailbox normalizes without selecting ownership');
 check(primaryReentryChallenge('123456',providerUrl).type==='email','OTP uses only email sign-in verification');
 check(primaryReentryChallenge(link,providerUrl).type==='magiclink','Configured unopened magic link parses without navigation');
 for(const bad of[null,{},'bad@','x'.repeat(255)])await denied(async()=>primaryReentryEmail(bad),400,'Malformed delivery mailbox rejected');
 for(const bad of[null,{},'garbage',link.replace('magiclink','recovery'),link.replace('magiclink','signup'),link.replace('magiclink','invite'),link.replace(providerUrl,'https://untrusted.invalid'),link+'&type=email',link+'&token_hash='+'a'.repeat(64),link+'#access_token=invalid'])
  await denied(async()=>primaryReentryChallenge(bad,providerUrl),400,'Wrong flow/provider/duplicate challenge rejected before provider work');
 check(!await db.system(c=>emailReentryAvailable(c,people[5].email.toLowerCase())),'Active portal does not request a re-entry email');
 await denied(()=>db.system(c=>reopenRetainedPrimary(c,{authUserId:people[5].id,sessionId:people[5].session_id},'verified-email-reentry')),403,'Email proof cannot turn ordinary signup into re-entry');
 stage='closure denials';
 await denied(()=>db.system(c=>c.query("update public.account_contexts set status='closed'where id=$1",[owners[5]])),'42501','Arbitrary primary closure rejected');
 await denied(()=>db.system(c=>c.query('delete from public.account_contexts where id=$1',[owners[5]])),'42501','Primary history deletion rejected');
 await denied(()=>db.system(c=>c.query("update public.account_contexts set auth_user_id=$2 where id=$1",[owners[5],people[0].id])),'42501','Primary ownership cannot be reassigned');
 for(const role of['anon','authenticated','pinevela_backend']){
  check(!(await db.pool.query("select has_table_privilege($1,'private.primary_wipe_executions','insert')as allowed",[role])).rows[0].allowed,role+' cannot create execution receipts');
  check(!(await db.pool.query("select has_table_privilege($1,'private.primary_wipe_reentries','insert')as allowed",[role])).rows[0].allowed,role+' cannot create re-entry receipts');
  check(!(await db.pool.query("select has_function_privilege($1,'private.run_primary_wipe(uuid)','execute')as allowed",[role])).rows[0].allowed,role+' cannot invoke native closure');
 }
 check((await db.pool.query("select count(*)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'and c.relname in('primary_wipe_executions','primary_wipe_reentries')and c.relrowsecurity")).rows[0].count==='2','Private lifecycle tables retain RLS');
 const profiles=JSON.stringify((await db.pool.query('select * from public.profiles order by id')).rows);
 stage='unsupported operational scope';
 const priorHome=(await db.system(c=>c.query("insert into public.residences(primary_owner_id,name,status)values($1,$2,'approved')returning id",[people[0].id,people[0].name]))).rows[0].id;
 const mixed=await prepare(),mixedProof=await archives(mixed.id);
 await run(admins[0],c=>authorizeSystemWipeExecution(c,admins[0],grants[0],mixed.id,{confirmation:'AUTHORIZE REVIEWED WIPE'}));
 await denied(()=>run(admins[0],c=>executePrimaryWipeCore(c,admins[0],grants[0],mixedProof,projectRef)),'42501','Current fully approved mixed housing scope cannot use primary-only execution');
 await run(admins[0],c=>cancelSystemWipePreparation(c,admins[0],grants[0],mixed.id,{reason:people[0].name}));
 await db.system(c=>c.query("update public.residences set status='closed'where id=$1",[priorHome]));
 const p=await prepare();stage='actual post-pause recovery';const verified=await archives(p.id);
 const execute=()=>run(admins[0],c=>executePrimaryWipeCore(c,admins[0],grants[0],verified,projectRef));
 await denied(()=>execute(),409,'Recovery without final founder consent cannot close accounts');
 await run(admins[0],c=>authorizeSystemWipeExecution(c,admins[0],grants[0],p.id,{confirmation:'AUTHORIZE REVIEWED WIPE'}));
 await denied(()=>run(admins[1],c=>executePrimaryWipeCore(c,admins[1],grants[1],verified,projectRef)),403,'Other administrator cannot execute founder closure');
 await denied(()=>run(admins[0],c=>executePrimaryWipeCore(c,admins[0],{allowed:false},verified,projectRef)),403,'Own current founder key required');
 await denied(()=>run(admins[0],c=>executePrimaryWipeCore(c,admins[0],grants[0],JSON.parse(JSON.stringify(verified)),projectRef)),409,'Copied JSON-like proof cannot replace verified recovery brand');
 const consent=(await db.pool.query('select id from private.system_wipe_execution_authorizations where preparation_id=$1',[verified.preparation.id])).rows[0].id;
 await denied(()=>db.system(c=>c.query('select private.run_primary_wipe($1)',[consent])),'42501','Native direct calls without verified founder key fail');
 const noGoogle=await db.pool.connect();try{
  await noGoogle.query('begin');await noGoogle.query("delete from auth.identities where user_id=$1 and provider='google'",[people[5].id]);
  const proof=(await noGoogle.query("select to_jsonb(r)-'verified_at'as proof from private.system_wipe_recovery_evidence r where preparation_id=$1",[verified.preparation.id])).rows[0].proof;
  await noGoogle.query("select set_config('request.jwt.claims',$1,true),set_config('pinevela.approval_key_version',$2,true),set_config('pinevela.primary_wipe_confirmation','CLOSE REVIEWED PRIMARY ACCOUNTS',true),set_config('pinevela.primary_wipe_recovery_checked',$3::jsonb::text,true)",[JSON.stringify({sub:admins[0].authUserId,session_id:admins[0].sessionId,role:'authenticated'}),grants[0].version,JSON.stringify(proof)]);
  await denied(()=>noGoogle.query('select private.run_primary_wipe($1)',[consent]),'42501','Identity without implemented Google re-entry cannot be closed by this executor');
 }finally{await noGoogle.query('rollback');noGoogle.release();}
 stage='transaction admission';
 const admit=async(c:any)=>{await executeSetup(c);await c.query('insert into private.primary_wipe_executions(authorization_id)values($1)',[consent]);};
 const executeSetup=async(c:any)=>{await recordSystemWipeRecovery(c,verified,projectRef);
  await c.query("select set_config('pinevela.approval_key_version',$1,true)",[grants[0].version]);
  const receipt=(await c.query("select to_jsonb(r)-'verified_at'as proof from private.system_wipe_recovery_evidence r where preparation_id=$1",[verified.preparation.id])).rows[0];
  await c.query("select set_config('pinevela.primary_wipe_confirmation','CLOSE REVIEWED PRIMARY ACCOUNTS',true),set_config('pinevela.primary_wipe_recovery_checked',$1::jsonb::text,true)",[JSON.stringify(receipt.proof)]);};
 await denied(()=>run(admins[0],async c=>{await admit(c);}), '42501','Running admission cannot commit without atomic completion');
 await denied(()=>run(admins[0],async c=>{await admit(c);await c.query('update public.profiles set display_name=display_name||$2 where id=$1',[people[5].id,' ']);}), '42501','Transaction receipt cannot authorize profile/history edits');
 check((await db.pool.query('select count(*)from private.primary_wipe_executions')).rows[0].count==='0','Failed native admissions leave no execution receipt');
 stage='atomic rollback';
 await db.system(c=>c.query("create function private.reject_primary_notice()returns trigger language plpgsql as $$begin if new.title='Primary account closed after reviewed system wipe'then raise exception using errcode='23514',message='Native notice failure';end if;return new;end;$$;create trigger reject_primary_notice before insert on public.notifications for each row execute function private.reject_primary_notice()"));
 await denied(()=>execute(),'23514','Native notice failure rolls all closure effects back');
 await db.system(c=>c.query('drop trigger reject_primary_notice on public.notifications;drop function private.reject_primary_notice()'));
 check((await db.pool.query("select count(*)from public.account_contexts where kind='primary'and status='active'")).rows[0].count==='6','Rejected execution leaves every primary active');
 stage='native execution';const result=await execute();check(result.success&&result.authIdentitiesRetained&&result.storageObjectsModified===0,'Native reviewed primary closure succeeds');
 check((await db.pool.query('select status from public.residences where id=$1',[priorHome])).rows[0].status==='closed','Previously closed residence history remains intact');
 check((await db.pool.query("select count(*)from public.account_contexts where kind='primary'and status='closed'")).rows[0].count==='6','Exact reviewed primary portals closed');
 check((await db.pool.query("select count(*)from public.account_contexts where kind='admin'and status='active'")).rows[0].count==='5','All independent administrator portals remain active');
 check((await db.pool.query('select count(*)from private.account_sessions where active_context_id=any($1::uuid[])',[owners])).rows[0].count==='0','All selected application bindings revoked');
 for(const admin of admins)check((await db.actor(admin,c=>c.query('select private.current_context_id()as id'))).rows[0].id===admin.contextId,'Genuine administrator binding survives primary closure');
 const ordinary={authUserId:people[5].id,sessionId:people[5].session_id,contextId:owners[5],kind:'primary'};
 await denied(()=>db.actor(ordinary,c=>c.query('select 1')),401,'Old primary application binding cannot access closed portal');
 const status=(await db.pool.query(`select p.status,f.state as preparation,z.state as pause from public.admin_proposals p
  join private.system_wipe_preparations f on f.proposal_id=p.id join private.system_wipe_freezes z on z.preparation_id=f.id where p.id=$1`,[p.id])).rows[0];
 check(status.status==='executed'&&status.preparation==='completed'&&status.pause==='completed','Review and pause finish atomically');
 const publicStatus=(await run(admins[0],c=>systemWipeReviewStatus(c,admins[0]))).find(r=>r.id===p.id);
 check(publicStatus?.status==='executed'&&publicStatus.preparation.state==='completed'&&publicStatus.preparation.completedAt&&publicStatus.preparation.pause.completedAt,'Status reports completed history and native times');
 await denied(()=>run(admins[0],c=>cancelSystemWipePreparation(c,admins[0],grants[0],p.id,{reason:people[0].name})),409,'Completed closure cannot be cancelled through the API service');

 check((await db.pool.query("select count(*)from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Primary account closed after reviewed system wipe'")).rows[0].count==='11','Six affected primaries and five administrators notified');
 check(JSON.stringify((await db.pool.query('select * from public.profiles order by id')).rows)===profiles,'Profile identity/contact/avatar history unchanged');
 check(await authDigest()===beforeAuth,'Native Auth users, Google identities and sessions unchanged');
 await denied(()=>execute(),409,'Completed review cannot be replayed');
 for(const sql of['delete from private.primary_wipe_executions','truncate private.primary_wipe_executions cascade',"update private.primary_wipe_executions set state='running'"])
  await denied(()=>db.system(c=>c.query(sql)),'42501','Completed execution history immutable');
 stage='verified primary re-entry';const identity={authUserId:people[5].id,sessionId:people[5].session_id};
 check((await db.system(c=>unavailableAccountError(c,identity.authUserId))).code==='google_primary_closed','Login explains explicit same-account signup continuation');
 await denied(()=>db.system(c=>c.query("update public.account_contexts set status='active'where id=$1",[owners[5]])),'42501','Direct status changes cannot reopen closed primary');
 await denied(()=>db.system(c=>initializeRetainedGooglePrimary(c,{...identity,sessionId:people[0].session_id})),401,'Another identity session cannot reopen a portal');
 await denied(()=>db.system(c=>initializeRetainedGooglePrimary(c,{...identity,sessionId:crypto.randomUUID()})),401,'Unknown session cannot reopen a portal');
 const results=await Promise.all([db.system(c=>initializeRetainedGooglePrimary(c,identity)),db.system(c=>initializeRetainedGooglePrimary(c,identity))]);
 check(results.filter(Boolean).length===1,'Concurrent verified signup reopens once');
 check((await db.pool.query('select status,auth_user_id from public.account_contexts where id=$1',[owners[5]])).rows[0].status==='active','Original primary context is reused');
 check((await db.pool.query('select count(*)from private.primary_wipe_reentries where context_id=$1',[owners[5]])).rows[0].count==='1','One immutable re-entry receipt retained');
 check((await db.pool.query("select count(*)from public.account_contexts where kind='primary'and status='closed'")).rows[0].count==='5','No other primary account reactivated');
 check(!(await db.system(c=>initializeRetainedGooglePrimary(c,identity))),'Repeat explicit signup is idempotent');
 await denied(()=>db.actor(ordinary,c=>c.query('select 1')),401,'Re-entry does not restore revoked application bindings');
 for(const sql of['delete from private.primary_wipe_reentries','truncate private.primary_wipe_reentries cascade','update private.primary_wipe_reentries set created_at=clock_timestamp()'])
  await denied(()=>db.system(c=>c.query(sql)),'42501','Re-entry history cannot be erased or rewritten');
 stage='verified email post-provider lifecycle';
 const emailIdentity={authUserId:people[3].id,sessionId:people[3].session_id},emailContext=owners[3];
 check(await db.system(c=>emailReentryAvailable(c,people[3].email.toLowerCase())),'Eligible retained verified mailbox may request re-entry');
 check(!await db.system(c=>emailReentryAvailable(c,people[5].email.toLowerCase())),'Already reopened primary does not request another re-entry email');
 await denied(()=>db.system(c=>reopenRetainedPrimary(c,{...emailIdentity,sessionId:people[0].session_id},'verified-email-reentry')),401,'Foreign native session cannot prove email ownership');
 await denied(()=>db.system(c=>reopenRetainedPrimary(c,{...emailIdentity,sessionId:crypto.randomUUID()},'verified-email-reentry')),401,'Unknown native session cannot prove email ownership');
 await denied(()=>db.system(async c=>{await c.query("update auth.users set banned_until=clock_timestamp()+interval'1 day'where id=$1",[emailIdentity.authUserId]);await reopenRetainedPrimary(c,emailIdentity,'verified-email-reentry');}),401,'Native Auth ban blocks email re-entry');
 await denied(()=>db.system(async c=>{await c.query('update auth.users set email_confirmed_at=null where id=$1',[emailIdentity.authUserId]);await reopenRetainedPrimary(c,emailIdentity,'verified-email-reentry');}),401,'An unconfirmed mailbox cannot reopen a primary');
 const execution=(await db.pool.query('select id from private.primary_wipe_executions where $1=any(context_ids)',[emailContext])).rows[0].id;
 await denied(()=>db.system(async c=>{await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:emailIdentity.authUserId,session_id:emailIdentity.sessionId,role:'authenticated'})]);await c.query(`insert into private.primary_wipe_reentries(execution_id,context_id,auth_user_id,session_id,proof_method)values($1,$2,$3,$4,'verified-email-reentry')`,[execution,emailContext,emailIdentity.authUserId,emailIdentity.sessionId]);}),'42501','A live session alone is not an explicit server email proof');
 await denied(()=>db.system(async c=>{await c.query("select set_config('request.jwt.claims',$1,true),set_config('pinevela.primary_reentry_verified','verified-email-reentry',true)",[JSON.stringify({sub:emailIdentity.authUserId,session_id:emailIdentity.sessionId,role:'authenticated'})]);await c.query(`insert into private.primary_wipe_reentries(execution_id,context_id,auth_user_id,session_id,proof_method)values($1,$2,$3,$4,'verified-google-signup')`,[execution,emailContext,emailIdentity.authUserId,emailIdentity.sessionId]);}),'42501','Receipt proof method must match the verified server flow');
 await db.system(c=>c.query("create function private.reject_reentry_notice()returns trigger language plpgsql as $$begin if new.title='Primary account reopened'then raise exception using errcode='23514',message='Native notice failure';end if;return new;end;$$;create trigger reject_reentry_notice before insert on public.notifications for each row execute function private.reject_reentry_notice()"));
 await denied(()=>db.system(c=>reopenRetainedPrimary(c,emailIdentity,'verified-email-reentry')),'23514','Email re-entry notice failure rolls back the status and receipt');
 await db.system(c=>c.query('drop trigger reject_reentry_notice on public.notifications;drop function private.reject_reentry_notice()'));
 check((await db.pool.query('select status from public.account_contexts where id=$1',[emailContext])).rows[0].status==='closed','Failed email re-entry retains closed status');
 check(!(await db.pool.query('select 1 from private.primary_wipe_reentries where context_id=$1',[emailContext])).rowCount,'Failed email re-entry leaves no receipt');
 check(await db.system(c=>reopenRetainedPrimary(c,emailIdentity,'verified-email-reentry')),'Verified email post-provider lifecycle reopens the original primary');
 const emailReceipt=(await db.pool.query('select proof_method,auth_user_id,context_id from private.primary_wipe_reentries where context_id=$1',[emailContext])).rows[0];
 check(emailReceipt.proof_method==='verified-email-reentry'&&emailReceipt.auth_user_id===emailIdentity.authUserId,'Receipt retains exact subject and email proof method');
 check(!await db.system(c=>reopenRetainedPrimary(c,emailIdentity,'verified-email-reentry')),'Repeated email continuation is idempotent');
 check((await db.actor(admins[3],c=>c.query('select private.current_context_id()as id'))).rows[0].id===admins[3].contextId,'Independent administrator binding survives email primary re-entry');
 const concurrentIdentity={authUserId:people[4].id,sessionId:people[4].session_id};
 const competing=await Promise.all([db.system(c=>reopenRetainedPrimary(c,concurrentIdentity,'verified-email-reentry')),db.system(c=>initializeRetainedGooglePrimary(c,concurrentIdentity))]);
 check(competing.filter(Boolean).length===1,'Concurrent Google/email continuation reopens once');
 check((await db.pool.query('select count(*)from private.primary_wipe_reentries where context_id=$1',[owners[4]])).rows[0].count==='1','Competing proof methods produce exactly one retained receipt');
 check((await db.pool.query("select count(*)from public.account_contexts where kind='primary'and status='closed'")).rows[0].count==='3','Email continuations never reopen unrelated primary portals');
 check((await db.pool.query("select count(*)from private.audit_events where event_type='primary_wipe_reentry'")).rows[0].count==='3','Each successful re-entry emits one retained audit');
 check((await db.pool.query("select count(*)from public.notifications where title='Primary account reopened'")).rows[0].count==='3','Each successful re-entry emits one retained notice');
 for(const role of['anon','authenticated','pinevela_backend'])check(!(await db.pool.query("select has_function_privilege($1,'private.primary_reentry_identity_supported(uuid,text)','execute')as allowed",[role])).rows[0].allowed,'Identity eligibility lookup is private to '+role);
 const restored=new SupabaseDatabase(config);try{check((await restored.pool.query('select status from public.account_contexts where id=$1',[owners[5]])).rows[0].status==='active','Re-entry persists after process reconnect');}finally{await restored.close();}
 check(await authDigest()===beforeAuth,'No Auth identity or session fabricated during closure/re-entry');
 const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
 fs.writeFileSync('.security/migration-reset/primary-wipe-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});check(advisor.status===0,'Native advisors complete');const findings=JSON.parse(advisor.stdout.toString());check(Array.isArray(findings.results||findings)&&(findings.results||findings).length===0,'Native advisors report zero security findings');
 const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,actualNativeDumpsAndRestores:true,actualStorageObjects:verified.evidence.objects,actualStorageBytes:verified.evidence.bytes,cloudRecordsModified:0,cloudObjectsModified:0,authRecordsChanged:false,providerRepliesMocked:false,primaryOnlyNativeClosure:true,liveExecutionEnabled:false,genuineGoogleReentryBrowserPending:true,emailPostProviderLifecycle:true,genuineEmailOtpProviderBrowserPending:true};fs.writeFileSync('.security/migration-reset/primary-wipe-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.close();}},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/primary-wipe-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Native lifecycle verification failed; diagnostics saved privately.'}));process.exitCode=1;}
finally{for(const directory of storageDirectories)fs.rmSync(directory,{recursive:true,force:true});for(const file of checkpointFiles)fs.rmSync(file,{force:true});}
