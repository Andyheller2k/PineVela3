import {termsAcceptance} from '../legalPolicy.js';
/** Real PostgreSQL/RLS checks using existing confirmed Auth subjects. Enrollment
 * and product fixtures roll back; no provider response, identity or email is mocked. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {submitSellerApplication,decideSellerApplication,sellerStatus} from '../supabase/sellerRegistration.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase(),c=await db.pool.connect();let checks=0;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'seller_checks',checks}));};
try{
  await c.query('begin');
  const counts=async()=>(await c.query(`select (select count(*) from auth.users) as users,(select count(*) from auth.sessions) as sessions,
    (select count(*) from public.profiles) as profiles,(select count(*) from private.account_enrollments) as enrollments,
    (select count(*) from public.seller_applications) as applications,(select count(*) from public.stores) as stores,
    (select count(*) from public.notifications) as notices,(select count(*) from private.audit_events) as audit`)).rows[0];
  const before=await counts();if(before.profiles!=='0')throw new Error('Run before operational profiles exist.');
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const f of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()){
    const sql=fs.readFileSync(path.join('supabase/migrations',f),'utf8');if(ledger.has(f.slice(0,14)))assert.equal(ledger.get(f.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));else await c.query(sql);
  }
  const subjects=(await c.query(`select distinct on(u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
    where u.email_confirmed_at is not null and (s.not_after is null or s.not_after>now()) order by u.id,s.created_at desc limit 4`)).rows;
  if(subjects.length!==4)throw new Error('Four existing confirmed subjects required.');
  const [root,other,child,foreignChild]=subjects;
  async function primary(p:any):Promise<VerifiedActor>{await c.query('select private.initialize_auth_profile($1,null)',[p.id]);const contextId=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;return {authUserId:p.id,sessionId:p.session_id,contextId,kind:'primary'};}
  const owner=await primary(root),foreignOwner=await primary(other);
  async function bind(a:VerifiedActor){await c.query(`insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)
    on conflict(session_id) do update set active_context_id=excluded.active_context_id`,[a.sessionId,a.authUserId,a.contextId]);await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);}
  async function enrollment(p:any,a:VerifiedActor){const nonce=crypto.randomBytes(32).toString('hex');const id=(await c.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
    values($1,$2,'seller',$3,$4,$5,now()+interval '24 hours') returning id`,[a.contextId,a.authUserId,p.email.toLowerCase(),crypto.createHash('sha256').update(nonce).digest('hex'),JSON.stringify({displayName:p.raw_user_meta_data?.full_name || p.raw_user_meta_data?.name || p.email,phone:''})])).rows[0].id;
    await c.query('select private.initialize_auth_profile($1,$2)',[p.id,nonce]);const ctx=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='seller'",[p.id])).rows[0].id;
    await bind(a);await finishEnrollment(c,a,id,{authUserId:p.id,email:p.email.toLowerCase(),sessionId:p.session_id});return {id,actor:{authUserId:p.id,sessionId:p.session_id,contextId:ctx,kind:'seller'} as VerifiedActor};}
  const own=await enrollment(child,owner),foreign=await enrollment(foreignChild,foreignOwner);
  const admin:VerifiedActor={...owner,contextId:(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[root.id])).rows[0].id,kind:'admin'};
  await c.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[admin.contextId]);
  async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){await c.query('savepoint negative');let error:any;try{await work();}catch(e){error=e;}await c.query('rollback to savepoint negative');check(typeof expected==='number'?error instanceof ApiError && error.status===expected:error?.code===expected,label);}
  async function scoped(a:VerifiedActor,work:()=>Promise<any>){await bind(a);await c.query('set local role pinevela_backend');try{return await work();}finally{await c.query('reset role');}}
  const payload={enrollmentId:own.id,university:'Kwame Nkrumah University of Science and Technology (KNUST)',categoryToSell:'General Campus Essentials',idNumber:'PV-20261009',storeName:child.raw_user_meta_data?.full_name || child.email,certified:true,termsAcceptance:termsAcceptance(true)};
  await bind(owner);
  check((await sellerStatus(c,owner)).application===null,'No invented seller application before submission');
  await denied(()=>submitSellerApplication(c,own.actor,payload),403,'Child portal cannot act as a primary applicant');
  await denied(()=>submitSellerApplication(c,owner,{...payload,userId:foreignOwner.authUserId}),400,'Client ownership fields rejected');
  await denied(()=>submitSellerApplication(c,owner,{...payload,password:'not-persisted'}),400,'Application route cannot receive login credentials');
  await denied(()=>submitSellerApplication(c,owner,{...payload,studentEmail:foreignChild.email}),400,'Student identity cannot be overridden by email');
  await denied(()=>submitSellerApplication(c,owner,{...payload,enrollmentId:foreign.id}),404,'Another owner enrollment cannot be used');
  for(const changes of [{certified:false},{idNumber:'!bad'},{storeName:''},{university:''},{categoryToSell:''}])await denied(()=>submitSellerApplication(c,owner,{...payload,...changes}),400,'Actual registration fields and declaration required');
  await c.query('savepoint unverified');await c.query('update private.account_enrollments set verified_at=null where id=$1',[own.id]);
  await denied(()=>submitSellerApplication(c,owner,payload),409,'Email-unverified enrollment cannot submit');await c.query('rollback to savepoint unverified');
  await c.query('savepoint submission_banned');await c.query("insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id) values($1,'seller_account',now()+interval '1 day','Registration boundary verification',$2)",[owner.contextId,admin.contextId]);
  await denied(()=>submitSellerApplication(c,owner,payload),403,'Primary-owner registration ban prevents seller submission');
  await denied(()=>c.query(`insert into public.seller_applications(seller_context_id,enrollment_id,campus,primary_category,student_id,proposed_store_name) values($1,$2,$3,$4,$5,$6)`,[own.actor.contextId,own.id,payload.university,payload.categoryToSell,payload.idNumber,payload.storeName]),'23514','SQL enforces registration ban independently');await c.query('rollback to savepoint submission_banned');
  await denied(()=>c.query(`insert into public.seller_applications(seller_context_id,enrollment_id,campus,primary_category,student_id,proposed_store_name) values($1,$2,$3,$4,$5,$6)`,[own.actor.contextId,foreign.id,payload.university,payload.categoryToSell,payload.idNumber,payload.storeName]),'23514','SQL rejects mismatched verified enrollment');
  const submitted=await submitSellerApplication(c,owner,payload),id=submitted.application.id;
  await denied(()=>c.query('update public.seller_applications set student_id=null where id=$1',[id]),'23514','Submission evidence cannot be erased through a raw update');
  check(submitted.application.studentEmail===child.email.toLowerCase() && submitted.application.emailVerified,'Status uses actual confirmed subject, not supplied email');
  check(submitted.application.accountId===own.actor.contextId && submitted.application.status==='pending','Saved seller context remains pending administrator review');
  check((await c.query("select status from private.account_enrollments where id=$1",[own.id])).rows[0].status==='completed','Submission completes owned verified enrollment');
  const saved=await counts();check((await submitSellerApplication(c,owner,payload)).idempotent,'Exact submit retry is idempotent');assert.deepEqual(await counts(),saved);checks++;
  await denied(()=>submitSellerApplication(c,owner,{...payload,storeName:root.email}),409,'Pending original submission cannot be overwritten');
  await denied(()=>c.query('update public.seller_applications set enrollment_id=$2 where id=$1',[id,foreign.id]),'23514','SQL cannot reassign original enrollment');
  check((await scoped(owner,()=>c.query('select id from private.seller_application_details'))).rowCount===1,'Primary owner can read exact registration status');
  check((await scoped(foreignOwner,()=>c.query('select id from private.seller_application_details'))).rowCount===0,'Foreign primary cannot enumerate applications');
  check((await scoped(owner,()=>c.query('select id from public.seller_applications'))).rowCount===0,'Primary status view does not grant raw child-table access');
  await c.query('set local role anon');await denied(()=>c.query('select * from private.seller_application_details'),'42501','Guest cannot read private applications');await c.query('reset role');
  await c.query('set local role pinevela_backend');await denied(()=>c.query("update public.seller_applications set status='approved' where id=$1",[id]),'42501','Browser role cannot directly approve registration');await c.query('reset role');
  await denied(()=>decideSellerApplication(c,owner,{id},true),403,'Primary cannot approve its seller account');
  await denied(()=>decideSellerApplication(c,{...owner,kind:'manager'},{id},true),403,'Housing managers cannot approve arbitrary sellers');
  await bind(owner);await denied(()=>c.query("update public.seller_applications set status='approved',reviewed_at=now(),reviewed_by_context_id=$2 where id=$1",[id,admin.contextId]),'23514','SQL rejects a spoofed administrator decision');
  await bind(admin);check((await scoped(admin,()=>c.query('select id from private.seller_application_details'))).rowCount===1,'Active administrator can review applications');
  await denied(()=>decideSellerApplication(c,admin,{id},false),400,'Rejection needs actual feedback');
  await decideSellerApplication(c,admin,{id,adminNotes:'Correct the submitted school identification.'},false);
  check((await c.query('select count(*) from public.stores')).rows[0].count==='0','Rejection creates no store');
  check((await c.query('select status from public.account_contexts where id=$1',[own.actor.contextId])).rows[0].status==='pending','Rejected seller cannot sign in to an active portal');
  check((await decideSellerApplication(c,admin,{id,adminNotes:'Correct the submitted school identification.'},false)).idempotent,'Exact rejection retry is idempotent');
  await denied(()=>decideSellerApplication(c,admin,{id},true),409,'Final rejection cannot be reversed without resubmission');
  await bind(owner);await denied(()=>c.query("update public.seller_applications set status='submitted',reviewed_at=null,reviewed_by_context_id=null,review_notes='' where id=$1",[id]),'23514','SQL requires a new submission version for resubmission');
  await bind(owner);const resubmitted=await submitSellerApplication(c,owner,{...payload,idNumber:'PV-20261009-R'});
  check(resubmitted.application.id===id && resubmitted.application.submissionVersion===2 && resubmitted.application.adminNotes==='','Revised submission reuses exact verified identity and increments version');
  check((await c.query("select event_data->'previous'->>'review_notes' as notes from private.audit_events where resource_id=$1 and event_type='seller_application_resubmitted'",[id])).rows[0].notes==='Correct the submitted school identification.','Audit preserves actual earlier decision and submission evidence');
  await bind(admin);await c.query('savepoint revoked_decision');await c.query('delete from auth.sessions where id=$1',[admin.sessionId]);
  await denied(()=>c.query("update public.seller_applications set status='approved',reviewed_at=now(),reviewed_by_context_id=$2 where id=$1",[id,admin.contextId]),'23514','SQL denies revoked administrator decisions even with an existing context binding');await c.query('rollback to savepoint revoked_decision');
  await bind(admin);await c.query('savepoint approval_banned');await c.query("insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id) values($1,'seller_account',now()+interval '1 day','Registration boundary verification',$2)",[own.actor.contextId,admin.contextId]);
  await denied(()=>decideSellerApplication(c,admin,{id},true),403,'Ban imposed during review prevents approval');
  await denied(()=>c.query("update public.seller_applications set status='approved',reviewed_at=now(),reviewed_by_context_id=$2 where id=$1",[id,admin.contextId]),'23514','SQL cannot approve a banned seller');await c.query('rollback to savepoint approval_banned');
  await bind(admin);await decideSellerApplication(c,admin,{id},true);
  const store=(await c.query('select * from public.stores')).rows[0];
  check(store.seller_context_id===own.actor.contextId && store.primary_owner_id===owner.authUserId && store.name===payload.storeName,'Approval creates a pending store for saved identity and primary owner');
  check(store.status==='pending' && store.activated_at===null,'Review approval never fabricates paid activation');
  check((await c.query('select status from public.account_contexts where id=$1',[own.actor.contextId])).rows[0].status==='active','Approved seller can enter its separate portal');
  check((await decideSellerApplication(c,admin,{id},true)).idempotent,'Approval retry cannot duplicate store or notices');
  await denied(()=>decideSellerApplication(c,admin,{id,adminNotes:'Rewrite final decision'},true),409,'Final approval notes cannot be overwritten');
  await bind(owner);const status=await sellerStatus(c,owner);
  check(status.store.id===store.id && !status.store.registrationFeePaid && !status.store.setupCompleted,'Primary sees actual unpaid pending store progress');
  check((await scoped(own.actor,()=>sellerStatus(c,own.actor))).application.id===id,'Seller sees its own application');
  check((await scoped(foreignOwner,()=>sellerStatus(c,foreignOwner))).application===null,'Foreign status lookup returns no unrelated application');
  check((await scoped(own.actor,()=>c.query('select id from public.seller_applications'))).rowCount===1,'Raw RLS allows exact seller');
  await c.query('savepoint admin_revoked');await c.query('delete from auth.sessions where id=$1',[admin.sessionId]);
  check((await scoped(admin,()=>c.query('select id from private.seller_application_details'))).rowCount===0,'Revoked administrator loses private review view');await c.query('rollback to savepoint admin_revoked');
  check((await c.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.category='account_submission' and r.context_id=$1",[owner.contextId])).rowCount!>0,'Primary user receives submission and decision notices before seller login');
  check((await c.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.category='verification' and r.context_id=$1",[admin.contextId])).rowCount!>0,'Administrators receive review-state notices');
  await c.query('rollback');assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({checks,rolledBack:true,authUsersCreated:0,authUsersModified:0,providerFlowTested:false,institutionalEmailDeliveryTested:false,authenticatedHttpTested:false}));
}catch(error){console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || undefined,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;}
finally{await c.query('rollback').catch(()=>undefined);c.release(true);await db.close();}
