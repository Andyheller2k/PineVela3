import {termsAcceptance} from '../legalPolicy.js';
/** Account approval reviews on isolated restored Google identities and real sessions. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {governanceStatus,checkApprovalKey,requireApprovalGrant} from '../supabase/adminGovernance.js';
import {SupabaseAccountReviews,accountDirectory,accountReviewStatus,checkAccountReviewContext,voteAccountReview,applyAccountReview} from '../supabase/accountReviews.js';
import {requireAccountAccess,accountFeaturesForRequest} from '../supabase/accountAccess.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {submitSellerApplication,decideSellerApplication} from '../supabase/sellerRegistration.js';
import {saveStoreProfile} from '../supabase/storeSetup.js';
import {prepareCheckout,fulfillCheckout} from '../supabase/payments.js';
import {createOrder,changeOrder} from '../supabase/orders.js';
import {loadOrderPins} from '../supabase/orderPins.js';
import {reserveMedia,finishMedia,mediaUrl} from '../supabase/media.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
import {readNotifications} from '../supabase/notifications.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {verifyResidenceReviews} from './lib/residence-review-checks.js';
dotenv.config({quiet:true});const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the latest genuine Auth checkpoint and immutable migration-27 checkpoint.');
let checks=0,residenceChecks=0,stage='fixture';const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);}
const fingerprintSQL=`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
  'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
  'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
try{await withIsolatedBackup(backup,async config=>{
  let db=new SupabaseDatabase(config);
  try{
    const fixture=await db.system(async c=>{
      const ledger=(await c.query('select version,digest from private.schema_migrations')).rows;
      check(ledger.length===27,'Seed private fixture keys before enrollment guards');
      for(const row of ledger){const file=fs.readdirSync('supabase/migrations').find(f=>f.startsWith(row.version));check(file&&crypto.createHash('sha256').update(fs.readFileSync(path.join('supabase/migrations',file))).digest('hex')===row.digest,'Historical migration digest unchanged');}
      const fingerprint=()=>c.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
        'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
        'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`);
      const authDigest=(await fingerprint()).rows[0].digest;
      const people=(await c.query(`select u.id,s.id as session_id from auth.users u join lateral
        (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
        where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
          and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
        order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 5`)).rows;
      check(people.length===5,'Five genuinely verified Google subjects with real sessions');
      const actors:VerifiedActor[]=[],keys:string[]=[],settingsKeys:string[]=[],primaries:VerifiedActor[]=[];
      for(const [i,p] of people.entries()){
        await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        const primary=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
        const contextId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[p.id])).rows[0].id;
        const a={authUserId:p.id,sessionId:p.session_id,contextId,kind:'admin'};actors.push(a);primaries.push({...a,contextId:primary,kind:'primary'});
        await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[contextId,i+1]);
        const key=crypto.randomBytes(32).toString('base64url'),settings=crypto.randomBytes(32).toString('base64url');keys.push(key);settingsKeys.push(settings);
        await c.query(`insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at)
          values($1,$2,clock_timestamp(),$3,clock_timestamp())`,[contextId,await hashCredentialAsync(`approval:${contextId}:${key}`),await hashCredentialAsync(`settings:${contextId}:${settings}`)]);
        await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,contextId]);
      }
      await c.query("insert into private.platform_settings(key,value) values('platform',$1) on conflict(key) do update set value=private.platform_settings.value||excluded.value",[JSON.stringify({registrationFee:0,semesterFee:0,subscriptionPrices:{default:0,star:0,pro:0}})]);
      const officer=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'officer','active') returning id",[people[4].id])).rows[0].id;
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000').sort()){
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(sql);
        await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
      }
      // Complete the existing native store flow using the sixth genuine subject.
      // The isolated baseline has an actual zero-fee policy, not a fake payment.
      const person=(await c.query(`select u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u join lateral
        (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
        where not (u.id=any($1::uuid[])) and u.email_confirmed_at is not null and not u.is_anonymous and exists
        (select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->>'email_verified'='true') limit 1`,[people.map(p=>p.id)])).rows[0];
      check(!!person,'An additional genuine verified Google subject supplies the store fixture');
      const owner=primaries[0];
      const bind=async(a:VerifiedActor)=>{
        await c.query(`insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)
          on conflict(session_id) do update set active_context_id=excluded.active_context_id`,[a.sessionId,a.authUserId,a.contextId]);
        await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);
      };
      const nonce=crypto.randomBytes(32).toString('hex');await bind(owner);
      const enrollment=(await c.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
        values($1,$2,'seller',$3,$4,$5,clock_timestamp()+interval '24 hours') returning id`,[owner.contextId,owner.authUserId,person.email.toLowerCase(),crypto.createHash('sha256').update(nonce).digest('hex'),JSON.stringify({displayName:person.raw_user_meta_data?.full_name||person.email,phone:''})])).rows[0].id;
      await c.query('select private.initialize_auth_profile($1,$2)',[person.id,nonce]);
      const storeSeller:VerifiedActor={authUserId:person.id,sessionId:person.session_id,contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='seller'",[person.id])).rows[0].id,kind:'seller'};
      await finishEnrollment(c,owner,enrollment,{authUserId:person.id,email:person.email.toLowerCase(),sessionId:person.session_id});
      const submitted=await submitSellerApplication(c,owner,{enrollmentId:enrollment,university:'Kwame Nkrumah University of Science and Technology (KNUST)',categoryToSell:'General Campus Essentials',idNumber:'PV-'+person.id.slice(0,8).toUpperCase(),storeName:person.raw_user_meta_data?.full_name||person.email,certified:true,termsAcceptance:termsAcceptance(true)});
      await bind(actors[0]);await decideSellerApplication(c,actors[0],{id:submitted.application.id},true);
      await bind(storeSeller);await saveStoreProfile(c,storeSeller,{storeName:submitted.application.storeName,username:person.email.split('@')[0],location:submitted.application.university,category:'General Campus Essentials',deliveryMode:'Campus Meetup',phone:'+233241234567',phoneCountry:'GH',description:''},true);
      const payment=await prepareCheckout(c,storeSeller,{requestId:crypto.randomUUID(),purpose:'activation',plan:'default'});
      check((await fulfillCheckout(c,payment.record.id)).accessGranted,'Native zero-fee policy grants real store access');
      const store=(await c.query('select id from public.stores where seller_context_id=$1',[storeSeller.contextId])).rows[0].id;
      const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),512);
      const photo=await reserveMedia(c,storeSeller,'market',image);await finishMedia(c,storeSeller,photo.id);
      const item=(await c.query("insert into public.listings(store_id,kind,title,price,stock_quantity,is_published) values($1,'product',$2,1,2,true) returning id",[store,submitted.application.storeName])).rows[0].id;
      await c.query('insert into public.listing_media(listing_id,sort_order,storage_path) values($1,0,$2)',[item,mediaUrl(photo.id)]);
      await bind(primaries[2]);
      const order=await createOrder(c,primaries[2],{requestId:crypto.randomUUID(),productId:item,quantity:1,buyerPhone:'+233241234567',meetingLocation:submitted.application.university},loadOrderPins());
      await bind(actors[2]);
      await bind(actors[0]);
      if(draft)await c.query(fs.readFileSync(draft,'utf8'));
      return {actors,primaries,keys,settingsKeys,authDigest,officer,storeSeller,store,item,orderId:order.order.id,deliveryPin:order.order.otpPin};
    });
    const {actors,primaries,keys,settingsKeys,officer}=fixture;
    const [founder,second,third,fourth,fifth]=actors;
    let service=new SupabaseAccountReviews(new SupabaseAuth(db));
    const status=(a=founder)=>db.authorizedSystem(a,['admin'],c=>governanceStatus(c,a));
    const target=primaries[3].contextId;
    const body=(key=keys[0],extra:Record<string,unknown>={})=>({targetId:target,targetRole:'user',action:'ban',reason:'Review the selected account access',
      privateKey:key,features:[],duration:{amount:24,unit:'hours'},...extra});
    const propose=(extra:Record<string,unknown>={},a=founder,key=keys[0])=>service.propose(a,body(key,extra));
    const vote=(a:VerifiedActor,id:string,decision='approved')=>service.vote(a,id,{decision,privateKey:keys[actors.indexOf(a)]});
    const finalReject=(id:string,a=founder)=>service.rejectFinal(a,id,{privateKey:keys[actors.indexOf(a)],reason:'Final action rejected after independent review'});
    const row=(id:string)=>db.pool.query('select * from public.admin_proposals where id=$1',[id]).then(r=>r.rows[0]);
    const allApprovals=async(id:string)=>{for(const a of actors.slice(1))await vote(a,id);};
    const initialContexts=JSON.stringify((await db.pool.query('select * from public.account_contexts order by id')).rows);
    stage='directory and validation';
    const directory=await db.authorizedSystem(founder,['admin'],c=>accountDirectory(c,founder));
    check(directory.totalUsers===12&&directory.breakdown.admins===5&&directory.breakdown.officers===1,'Directory uses actual primary and portal records');
    check(directory.users.filter(u=>u.role==='user').every(u=>u.primaryAccountId===u.id&&u.parentId===null),'Primary directory identities remain independent');
    check(directory.users.filter(u=>u.role==='admin').every(u=>u.parentRole==='user'&&u.primaryAccountId===u.parentId),'Administrator directory links use persisted identity relationships');
    check(!JSON.stringify(directory).includes('hash')&&!JSON.stringify(directory).includes('session'),'Directory projects no credential/session records');
    const available=await status();check(available.capabilities.accountReviews&&available.capabilities.accountApplication&&!available.capabilities.accountDeletion,'Reviewed policy application is enabled; deletion remains disabled');
    await denied(()=>Promise.resolve().then(()=>checkAccountReviewContext(founder,second.contextId)),409,'A stale browser account header is rejected');
    checkAccountReviewContext(founder,founder.contextId);checks++;
    for(const extra of [{userId:founder.authUserId},{managerId:founder.contextId},{targetId:'bad'},{targetRole:'__proto__'},{action:'delete'},
      {reason:'x'},{duration:{amount:0,unit:'hours'}},{duration:{amount:-1,unit:'hours'}},{duration:{amount:1.5,unit:'days'}},
      {duration:{amount:101,unit:'years'}},{duration:{amount:2,unit:'invalid'}},{duration:{amount:2,unit:'days',userId:target}},
      {action:'restrict',features:[]},{action:'restrict',features:['unsupported']}])await denied(()=>propose(extra),400,'Invalid review input is rejected');
    await denied(()=>propose({targetId:second.contextId,targetRole:'admin'}),403,'Admin accounts remain protected by membership governance');
    await denied(()=>propose({targetRole:'manager'}),409,'Client role does not override the persisted target kind');
    await denied(()=>propose({targetId:crypto.randomUUID()}),404,'Missing account cannot be reviewed');
    await denied(()=>propose({},founder,settingsKeys[0]),403,'Settings key cannot authorize account reviews');
    await denied(()=>propose({},founder,keys[1]),403,'Another administrator key cannot authorize the sender');
    await denied(()=>propose({},founder,'incorrect-key'),403,'Wrong key is denied');
    check((await db.pool.query('select failed_attempts from private.admin_secrets where context_id=$1',[founder.contextId])).rows[0].failed_attempts===3,'Failed key attempts commit independently of rejected review');
    stage='native proposal boundaries';
    await denied(()=>db.system(c=>c.query(`insert into public.admin_proposals(kind,proposer_context_id,target_context_id,preview,baseline_digest,reason,quorum,expires_at,account_roster_revision,account_lifecycle_revision)
      values('account_action',$1,$2,'{}','forged','abc',5,clock_timestamp()+interval '24 hours',0,0)`,[founder.contextId,target])),'42501','SQL proposal creation requires current own approval grant');
    const rejected=await propose();
    check((await row(rejected.id)).quorum===5,'Account action quorum stays five');
    check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[rejected.id])).rows[0].count==='1','Proposer first approval counts exactly once');
    const serverRow=await row(rejected.id);
    check(new Date(serverRow.expires_at).getTime()-new Date(serverRow.created_at).getTime()===86400000,'Database stamps an exact 24-hour review lifetime');
    await denied(()=>propose(),409,'Duplicate open account review is denied');
    await denied(()=>vote(founder,rejected.id),403,'Proposer cannot vote again');
    await denied(()=>finalReject(rejected.id),409,'Founder cannot finalize before all five approvals');
    for(const sql of ["update public.admin_proposals set reason='different' where id=$1","update public.admin_proposals set preview=preview||'{\"features\":[\"orders\"]}'::jsonb where id=$1",
      "update public.admin_proposals set quorum=2 where id=$1","update public.admin_proposals set expires_at=clock_timestamp()-interval '1 hour' where id=$1",
      "update public.admin_proposals set kind='pricing' where id=$1","delete from public.admin_proposals where id=$1",
      "update public.admin_votes set decision='rejected' where proposal_id=$1","delete from public.admin_votes where proposal_id=$1"])
      await denied(()=>db.system(c=>c.query(sql,[rejected.id])),'42501','SQL review metadata/votes cannot be altered');
    await vote(second,rejected.id,'rejected');
    check((await row(rejected.id)).status==='rejected','Any independent rejection closes the review');
    await denied(()=>vote(third,rejected.id),409,'Closed reviews cannot collect more votes');
    stage='five distinct approvals and final rejection';
    const approved=await propose({action:'restrict',features:['orders','messaging','orders'],duration:null});
    check(JSON.stringify((await row(approved.id)).preview.features)==='["messaging","orders"]','Feature selection is normalized without merging account identities');
    const duplicate=await Promise.allSettled([vote(second,approved.id),vote(second,approved.id)]);
    check(duplicate.filter(r=>r.status==='fulfilled').length===1&&duplicate.some(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===403),'Concurrent duplicate votes count only once');
    await vote(third,approved.id);await vote(fourth,approved.id);
    check((await row(approved.id)).status==='pending','Four approvals never replace the five-admin rule');
    await vote(fifth,approved.id);
    check((await row(approved.id)).status==='approved','Five different actual administrators approve the review');
    await denied(()=>finalReject(approved.id,second),403,'Another voter cannot make the founder final decision');
    await denied(()=>db.system(c=>c.query("update public.admin_proposals set status='executed' where id=$1",[approved.id])),'42501','Native SQL cannot apply an approved account action');
    const grant=await db.authorizedSystem(founder,['admin'],c=>checkApprovalKey(c,founder,keys[0]));
    await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await requireApprovalGrant(c,founder,grant);
      return c.query("update public.admin_proposals set status='executed',executed_by_context_id=$2 where id=$1",[approved.id,founder.contextId]);
    }),'42501','Even founder approval does not enable unverified account execution');
    await finalReject(approved.id);
    const final=await row(approved.id);
    check(final.status==='rejected'&&final.account_final_rejected_by===founder.contextId&&Boolean(final.account_final_rejected_at),'Founder final rejection has server-stamped identity/time');
    check(final.account_final_rejection_reason==='Final action rejected after independent review','Final rejection reason persists');
    await denied(()=>finalReject(approved.id),409,'Final rejection cannot be replayed as a new decision');
    await denied(()=>db.system(c=>c.query("update public.admin_proposals set account_final_rejection_reason='changed' where id=$1",[approved.id])),'42501','Final rejection reason cannot be edited');
    check(JSON.stringify((await db.pool.query('select * from public.account_contexts order by id')).rows)===initialContexts,'Review, approval and rejection change no portal access');
    stage='non-founder proposals and SQL validation';
    const independent=await propose({action:'restore',duration:null},second,keys[1]);
    check((await row(independent.id)).proposer_context_id===second.contextId,'Another actual administrator may propose with their own key');
    await vote(founder,independent.id);await vote(third,independent.id);await vote(fourth,independent.id);await vote(fifth,independent.id);
    check((await row(independent.id)).status==='approved','Non-founder proposal still needs the founder and every other administrator');
    await finalReject(independent.id);
    for(const changes of ["quorum=2","preview=preview||'{\"features\":[\"unsupported\"]}'::jsonb","proposer_context_id=$3","target_context_id=$3"])
      await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{
        await requireApprovalGrant(c,founder,await checkApprovalKey(c,founder,keys[0]));
        // Copy real review evidence, then independently attempt to reduce quorum,
        // substitute actor/target or introduce a feature the product never supports.
        return c.query(`insert into public.admin_proposals(id,kind,proposer_context_id,target_context_id,preview,baseline_digest,reason,quorum,expires_at,account_roster_revision,account_lifecycle_revision)
          select gen_random_uuid(),kind,proposer_context_id,target_context_id,preview,baseline_digest,reason,quorum,clock_timestamp()+interval '24 hours',account_roster_revision,account_lifecycle_revision
          from jsonb_populate_record(null::public.admin_proposals,to_jsonb((select p from public.admin_proposals p where id=$1))||$2::jsonb)`,
          [independent.id,JSON.stringify(changes==='quorum=2'?{quorum:2}:changes.startsWith('preview=')?{preview:{...(await row(independent.id)).preview,features:['unsupported']}}:
            changes.startsWith('proposer')?{proposer_context_id:second.contextId}:{target_context_id:second.contextId})]);
      }),'42501','Own key cannot override SQL actor, target, feature or quorum validation');
    stage='roster change and reversal';
    service=new SupabaseAccountReviews(new SupabaseAuth(db));
    const stale=await propose({action:'restore',duration:null});
    const rollback=Symbol('rollback');
    try{await db.authorizedSystem(founder,['admin'],async c=>{
      await requireApprovalGrant(c,founder,await checkApprovalKey(c,founder,keys[0]));
      await c.query("update public.admin_memberships set status='suspended' where context_id=$1",[second.contextId]);
      check((await accountReviewStatus(c,founder)).find(p=>p.id===stale.id)?.status==='invalidated','Membership change invalidates account review');
      await c.query("update public.admin_memberships set status='active' where context_id=$1",[second.contextId]);
      check((await accountReviewStatus(c,founder)).find(p=>p.id===stale.id)?.status==='invalidated','Membership reversal cannot revive account consent');
      throw rollback;
    });}catch(e){if(e!==rollback)throw e;}
    check((await row(stale.id)).status==='pending','Transaction rollback preserves previous account review');
    await vote(second,stale.id,'rejected');
    stage='lifecycle change and reversal';
    const changed=await propose({targetId:officer,targetRole:'verification_team'});
    const beforeRevision=(await db.pool.query('select revision from private.account_review_state')).rows[0].revision;
    await db.system(c=>c.query("update public.account_contexts set status='suspended' where id=$1",[officer]));
    await db.system(c=>c.query("update public.account_contexts set status='active' where id=$1",[officer]));
    check(BigInt((await db.pool.query('select revision from private.account_review_state')).rows[0].revision)===BigInt(beforeRevision)+2n,'Lifecycle revisions advance even when status is reversed');
    await denied(()=>vote(second,changed.id),409,'Changed-and-restored target cannot reuse old approval');
    check((await status()).accountProposals.find((p:any)=>p.id===changed.id).status==='invalidated','Status read persists lifecycle invalidation');
    await denied(()=>db.system(c=>c.query('update private.account_review_state set revision=revision-1')),'42501','Review revision cannot be rolled back directly');
    await denied(()=>db.system(c=>c.query('delete from private.account_review_state')),'42501','Review revision metadata cannot be deleted');
    if ((await db.pool.query("select to_regclass('private.account_review_events') as name")).rows[0].name) {
      stage='target-scoped lifecycle evidence';
      await db.system(c=>c.query('update public.profiles set primary_owner_id=$2 where id=$1',[primaries[2].authUserId,primaries[4].authUserId]));
      const scoped=await propose({targetId:officer,targetRole:'verification_team',action:'restore',duration:null});
      const parent=primaries[4].contextId;
      const unrelated=(await db.system(c=>c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'officer','active') returning id",[primaries[2].authUserId]))).rows[0].id;
      await db.system(c=>c.query("update public.account_contexts set status='suspended' where id=$1",[unrelated]));
      await db.system(c=>c.query("update public.account_contexts set status='active' where id=$1",[unrelated]));
      const sibling=(await db.system(c=>c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'seller','active') returning id",[primaries[2].authUserId,primaries[4].authUserId]))).rows[0].id;
      const shared=(await db.system(c=>c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'resident','active') returning id",[primaries[2].authUserId,primaries[4].authUserId]))).rows[0].id;
      await db.system(c=>c.query("update public.account_contexts set status='suspended' where id=$1",[sibling]));
      await db.system(c=>c.query("update public.account_contexts set status='active' where id=$1",[sibling]));
      check((await db.pool.query('select private.account_review_current(p) as current from public.admin_proposals p where id=$1',[scoped.id])).rows[0].current,
        'Unrelated account changes and same-mailbox sibling creation/status do not invalidate a leaf review');
      await vote(second,scoped.id);
      check((await row(scoped.id)).status==='pending','A scoped review remains votable after unrelated lifecycle changes');
      await vote(third,scoped.id,'rejected');
      const separate=await propose({targetId:sibling,targetRole:'merchant',action:'restore',duration:null});
      await db.system(c=>c.query("update public.account_contexts set status='suspended' where id=$1",[shared]));
      await db.system(c=>c.query("update public.account_contexts set status='active' where id=$1",[shared]));
      check((await db.pool.query('select private.account_review_current(p) as current from public.admin_proposals p where id=$1',[separate.id])).rows[0].current,
        'Resident and seller portals sharing a verified identity retain independent review consent');
      await vote(second,separate.id,'rejected');
      const inherited=await propose({targetId:officer,targetRole:'verification_team',action:'restore',duration:null});
      await db.system(c=>c.query('update public.account_contexts set primary_owner_id=$2 where id=$1',[officer,primaries[3].authUserId]));
      await db.system(c=>c.query('update public.account_contexts set primary_owner_id=$2 where id=$1',[officer,primaries[4].authUserId]));
      await denied(()=>vote(second,inherited.id),409,'Parent relationship change-and-reversal invalidates child consent');
      await status();
      const branch=await propose({targetId:parent,targetRole:'user',action:'restore',duration:null});
      const added=(await db.system(c=>c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[primaries[2].authUserId,primaries[4].authUserId]))).rows[0].id;
      check((await db.system(c=>c.query('delete from public.account_contexts where id=$1',[added]))).rowCount===1,
        'Non-administrator deletion reaches the domain lifecycle trigger');
      await denied(()=>vote(second,branch.id),409,'Adding and removing a linked child cannot revive a parent review');
      check((await status()).accountProposals.find((p:any)=>p.id===branch.id).status==='invalidated','Parent review closure persists with scoped evidence');
      stage='manager and staff review scope';
      const manager=(await db.system(c=>c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[primaries[2].authUserId,primaries[4].authUserId]))).rows[0].id;
      const residence=(await db.system(c=>c.query('insert into public.residences(primary_owner_id,name) select $1,display_name from public.profiles where id=$1 returning id',[primaries[4].authUserId]))).rows[0].id;
      await db.system(c=>c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager,residence]));
      const staff=(await db.system(c=>c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'staff','active') returning id",[primaries[3].authUserId]))).rows[0].id;
      const beforeStaff=await propose({targetId:manager,targetRole:'manager',action:'restore',duration:null});
      const assignment=(await db.system(c=>c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id) values($1,$2,$3) returning id',[staff,residence,manager]))).rows[0].id;
      await denied(()=>vote(second,beforeStaff.id),409,'New authorized staff changes the manager review scope');
      await status();
      const scope=(await db.pool.query('select private.account_review_scope($1) as scope',[parent])).rows[0].scope;
      check([parent,officer,sibling,shared,manager,staff].every(id=>scope.affected.includes(id))&&actors.every(a=>!scope.affected.includes(a.contextId))&&!scope.affected.includes(unrelated),
        'Primary scope follows saved portal and manager-staff links, excluding administrators and other roots');
      const ancestor=await propose({targetId:staff,targetRole:'staff',action:'restore',duration:null});
      await db.system(c=>c.query("update public.account_contexts set status='suspended' where id=$1",[manager]));
      await db.system(c=>c.query("update public.account_contexts set status='active' where id=$1",[manager]));
      await denied(()=>vote(second,ancestor.id),409,'Changed-and-restored manager invalidates inherited staff consent');
      await status();
      const employment=await propose({targetId:staff,targetRole:'staff',action:'restore',duration:null});
      await db.system(c=>c.query("update public.staff_assignments set status='suspended' where id=$1",[assignment]));
      await db.system(c=>c.query("update public.staff_assignments set status='active' where id=$1",[assignment]));
      await denied(()=>vote(second,employment.id),409,'Changed-and-restored employment invalidates staff consent');
      await status();
      await denied(()=>db.system(c=>c.query('update private.account_review_events set changed_context_ids=ARRAY[]::uuid[]')),'42501','Lifecycle evidence cannot be edited');
      await denied(()=>db.system(c=>c.query('delete from private.account_review_events')),'42501','Lifecycle evidence cannot be erased');
      await denied(()=>db.system(c=>c.query("insert into private.account_review_events values(999999,ARRAY[]::uuid[],ARRAY[]::uuid[])")),'42501','Lifecycle evidence cannot be forged directly');
      for (const role of ['anon','authenticated','pinevela_backend'])
        await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('insert into private.account_review_events values(999999,ARRAY[]::uuid[],ARRAY[]::uuid[])');}),
          '42501','Browser and backend roles cannot append arbitrary lifecycle evidence');
    }
    stage='atomic vote and notices';
    const atomic=await propose({action:'restore',duration:null});
    const snapshot=JSON.stringify((await db.pool.query('select (select count(*) from public.notifications) as notices,(select count(*) from private.audit_events) as audits')).rows);
    const g=await db.authorizedSystem(second,['admin'],c=>checkApprovalKey(c,second,keys[1]));
    await denied(()=>db.authorizedSystem(second,['admin'],async c=>{await voteAccountReview(c,second,g,atomic.id,'approved');
      return c.query('insert into public.notification_recipients(notification_id,context_id) values(gen_random_uuid(),$1)',[second.contextId]);
    }),'23503','Later failure rolls back vote, notices and audit');
    check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[atomic.id])).rows[0].count==='1','Rollback preserves only original proposer approval');
    check(snapshot===JSON.stringify((await db.pool.query('select (select count(*) from public.notifications) as notices,(select count(*) from private.audit_events) as audits')).rows),'Notice and audit are atomic with the vote');
    await allApprovals(atomic.id);await finalReject(atomic.id);
    const notices=(await db.pool.query("select n.id,n.category,count(r.context_id)::int as count from public.notifications n join public.notification_recipients r on r.notification_id=n.id where n.title like 'Account %' and n.category='admin_governance' group by n.id,n.category")).rows;
    check(notices.length>0&&notices.every(n=>n.category==='admin_governance'&&n.count===5),'Proposal and vote lifecycle notifications reach all five administrator portals');
    const adminNotices=await db.actor(founder,c=>readNotifications(c,founder));
    check(adminNotices.some(n=>n.module==='admin_governance'&&!n.read),'Administrator approvals tab receives unread module notices');
    check((await db.pool.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=any($1::uuid[]) and n.category='admin_governance'",[primaries.map(p=>p.contextId)])).rows[0].count==='0','Approval-only updates do not tell primary users their account was banned');
    stage='portal and private boundaries';
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[fifth.sessionId,primaries[4].contextId]));
    await denied(()=>propose({},primaries[4],keys[4]),403,'A genuine primary portal cannot propose administrator actions');
    await denied(()=>db.authorizedSystem(primaries[4],['admin'],c=>accountDirectory(c,primaries[4])),403,'Primary portal cannot read full account directory');
    check((await db.actor(primaries[4],c=>c.query('select * from public.admin_proposals'))).rowCount===0,'Primary Data API boundary hides administrator reviews');
    for(const role of ['anon','authenticated'])await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.account_review_state');}),'42501','Browser roles cannot read private lifecycle state');
    for(const role of ['anon','authenticated','pinevela_backend']){
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select private.account_review_current(p) from public.admin_proposals p limit 1');}),'42501','Private review helper is not a browser/backend RPC');
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query("update public.admin_proposals set status='executed'");}),'42501','Browser/backend roles cannot execute reviews');
    }
    await denied(()=>db.system(async c=>{await c.query('set local role pinevela_backend');return c.query('update private.account_review_state set revision=revision+1');}),'42501','Backend cannot forge lifecycle revision outside a domain trigger');
    const helpers=(await db.pool.query("select p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%account_review%' and p.prosecdef")).rows;
    check(helpers.every(p=>p.proname==='account_review_lifecycle_changed'&&p.proconfig?.includes('search_path=\"\"')),
      'Only the domain lifecycle trigger uses definer privileges, with an empty fixed search path');
    for(const role of ['anon','authenticated','pinevela_backend'])
      check(!(await db.pool.query("select has_function_privilege($1,'private.account_review_lifecycle_changed()','EXECUTE') as allowed",[role])).rows[0].allowed,
        'The definer lifecycle trigger is not a browser or backend RPC');
    stage='reviewed account policy execution';
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[fifth.sessionId,fifth.contextId]));
    const apply=(id:string,a=founder,extra:Record<string,unknown>={})=>service.apply(a,id,{privateKey:keys[actors.indexOf(a)],confirmation:'APPLY ACCOUNT POLICY',...extra});
    const reviewed=async(extra:Record<string,unknown>)=>{
      service=new SupabaseAccountReviews(new SupabaseAuth(db));
      const p=await propose(extra);await allApprovals(p.id);return p;
    };
    const root=primaries[4],leaf=(await db.pool.query("select id from public.account_contexts where primary_owner_id=$1 and kind='seller'",[root.authUserId])).rows[0].id;
    const resident=(await db.pool.query("select id from public.account_contexts where primary_owner_id=$1 and kind='resident'",[root.authUserId])).rows[0].id;
    const manager=(await db.pool.query("select id from public.account_contexts where primary_owner_id=$1 and kind='manager'",[root.authUserId])).rows[0].id;
    const staff=(await db.pool.query('select staff_context_id from public.staff_assignments where created_by_manager_id=$1',[manager])).rows[0].staff_context_id;
    const access=(id:string)=>db.system(c=>requireAccountAccess(c,id));
    const allFeatures=['subaccounts','rooms','orders','publishing','messaging','maintenance'];
    const restricted=await reviewed({targetId:root.contextId,action:'restrict',features:allFeatures,duration:null});
    await denied(()=>apply(restricted.id,founder,{confirmation:undefined}),400,'Explicit final confirmation is mandatory');
    await denied(()=>apply(restricted.id,second),403,'All five approvals cannot replace the founder final decision');
    await denied(()=>apply(restricted.id,founder,{privateKey:settingsKeys[0]}),403,'Settings key cannot apply an account policy');
    await denied(()=>apply(restricted.id,founder,{userId:root.authUserId}),400,'Final application rejects supplied ownership fields');
    const grantForPolicy=await db.authorizedSystem(founder,['admin'],c=>checkApprovalKey(c,founder,keys[0]));
    const beforePolicy=JSON.stringify((await db.pool.query('select (select count(*) from private.account_policies) as policies,(select count(*) from public.notifications) as notices,(select count(*) from private.audit_events) as audits')).rows);
    await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{
      await applyAccountReview(c,founder,grantForPolicy,restricted.id);
      return c.query('insert into public.notification_recipients(notification_id,context_id) values(gen_random_uuid(),$1)',[root.contextId]);
    },false,true),'23503','Later failure rolls back policy, review, epochs, notices and audit together');
    check((await row(restricted.id)).status==='approved'&&beforePolicy===JSON.stringify((await db.pool.query('select (select count(*) from private.account_policies) as policies,(select count(*) from public.notifications) as notices,(select count(*) from private.audit_events) as audits')).rows),'Failed application leaves the approved review intact');
    const simultaneous=await Promise.allSettled([apply(restricted.id),apply(restricted.id)]);
    check(simultaneous.filter(x=>x.status==='fulfilled').length===1&&simultaneous.some(x=>x.status==='rejected'&&x.reason instanceof ApiError&&x.reason.status===409),'Concurrent final application executes exactly once');
    const applied=(await row(restricted.id));
    check(applied.status==='executed'&&applied.executed_by_context_id===founder.contextId&&!!applied.executed_at,'Execution identity and time come from the native founder guard');
    for(const id of [root.contextId,leaf,resident,manager,staff]){
      check(!(await access(id)).banned,'Feature restrictions preserve general account access');
      for(const feature of allFeatures)await denied(()=>db.system(c=>requireAccountAccess(c,id,[feature as any])),403,'All six feature restrictions follow saved account relationships');
    }
    check((await access(fifth.contextId)).restrictions.length===0&&(await access(primaries[2].contextId)).restrictions.length===0,'Administrators and unrelated roots stay independent of inherited restrictions');
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[root.sessionId,root.contextId]));
    const ownAccess=await db.actor(root,async c=>(await c.query('select private.current_account_access() as access')).rows[0].access);
    check(ownAccess.restrictions.length===1&&ownAccess.restrictions[0].features.length===6,'The live account-access endpoint query returns only the bound primary policy');
    check(JSON.stringify((await new SupabaseAuth(db).projection(root)).accountAccess)===JSON.stringify(ownAccess),'Verified sign-in projection includes the same account restriction status');
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[root.sessionId,fifth.contextId]));
    const {store,storeSeller}=fixture;
    check((await db.pool.query('select private.store_is_public($1) as visible',[store])).rows[0].visible,'A genuinely approved, set-up and zero-fee activated store is public before moderation');
    const publishingRestriction=await reviewed({targetId:storeSeller.contextId,targetRole:'merchant',action:'restrict',features:['publishing'],duration:null});await apply(publishingRestriction.id);
    for(const [sql,args] of [
      ["insert into public.market_orders(buyer_context_id,store_id) values($1,$2)",[root.contextId,store]],
      ["insert into public.market_messages(buyer_context_id,store_id,sender_context_id,body) values($1,$2,$1,'Review boundary')",[root.contextId,store]],
      ["insert into public.listings(store_id,kind,title,price,stock_quantity) values($1,'product','Review boundary',1,1)",[store]],
      ["insert into public.media_assets(id,owner_context_id,purpose) values(gen_random_uuid(),$1,'market')",[leaf]],
      ["insert into public.maintenance_issues(reporter_context_id,title) values($1,'Review boundary')",[manager]],
      ["insert into public.allocations(resident_context_id) values($1)",[resident]],
      ["insert into public.staff_assignments(staff_context_id,created_by_manager_id) values($1,$2)",[staff,manager]],
      ["insert into private.account_enrollments(initiator_context_id,kind) values($1,'seller')",[root.contextId]],
    ] as [string,unknown[]][])await denied(()=>db.system(c=>c.query(sql,args)),'42501','Native feature trigger denies a restricted write before other record checks');
    check((await db.pool.query('select private.store_is_public($1) as visible',[store])).rows[0].visible,'Publishing restriction leaves the existing approved store visible');
    await db.authorizedSystem(storeSeller,['seller'],c=>changeOrder(c,storeSeller,fixture.orderId,{action:'agree-location'},loadOrderPins()));
    await db.authorizedSystem(storeSeller,['seller'],c=>changeOrder(c,storeSeller,fixture.orderId,{action:'completed',inputPin:fixture.deliveryPin},loadOrderPins()));
    check((await db.pool.query('select stock_quantity from public.listings where id=$1',[fixture.item])).rows[0].stock_quantity===1,'Publishing restriction preserves verified existing handover and its exact stock decrement');
    await denied(()=>db.system(c=>c.query('update public.listings set stock_quantity=0 where id=$1',[fixture.item])),'42501','Direct stock edits cannot impersonate nested order completion');
    check(accountFeaturesForRequest('PUT','/api/digital-market/orders/'+crypto.randomUUID()).length===0,'Order restrictions preserve existing fulfillment operations');
    await denied(()=>db.system(c=>c.query("update private.account_policies set features='{}' where context_id=$1",[root.contextId])),'42501','Direct SQL cannot remove policy restrictions');
    await denied(()=>db.system(c=>c.query('delete from private.account_policies where context_id=$1',[root.contextId])),'42501','Applied policy history cannot be erased');
    const restore=await reviewed({targetId:root.contextId,action:'restore',duration:null});await apply(restore.id);
    check((await access(leaf)).restrictions.length===0,'Founder restoration clears the root policy for its descendants');
    await denied(()=>db.system(c=>requireAccountAccess(c,root.contextId,[],root.sessionId)),401,'Restoration requires a new actual provider sign-in');
    const leafBan=await reviewed({targetId:leaf,targetRole:'merchant',action:'ban',duration:{amount:2,unit:'days'}});await apply(leafBan.id);
    const leafPolicy=(await db.pool.query('select * from private.account_policies where context_id=$1',[leaf])).rows[0];
    check(new Date(leafPolicy.ban_until).getTime()-new Date(leafPolicy.applied_at).getTime()===172800000,'Ban duration starts at actual execution time');
    await denied(()=>access(leaf),403,'Selected seller portal is banned');
    check(!(await access(resident)).banned,'Resident portal sharing the same verified identity remains independent');
    check(!(await access(root.contextId)).banned,'Child ban does not ban the primary owner');
    const dependent=await propose({targetId:leaf,targetRole:'merchant',action:'restore',duration:null});
    const independentConsent=await propose({targetId:primaries[2].contextId,action:'restore',duration:null});
    const rootBan=await reviewed({targetId:root.contextId,action:'ban',duration:{amount:1,unit:'hours'}});await apply(rootBan.id);
    check((await row(dependent.id)).status==='invalidated','Applied parent policy invalidates previous child restoration consent');
    check((await row(independentConsent.id)).status==='pending','An unrelated policy application preserves independent review consent');
    await vote(second,independentConsent.id,'rejected');
    for(const id of [root.contextId,resident,manager,staff])await denied(()=>access(id),403,'Root ban follows saved portal and manager-staff relationships');
    check((await access(fifth.contextId)).banned===false,'A primary ban does not change administrator access');
    const childRestore=await reviewed({targetId:leaf,targetRole:'merchant',action:'restore',duration:null});await apply(childRestore.id);
    await denied(()=>access(leaf),403,'Restoring a child cannot bypass an active parent ban');
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[root.sessionId,root.contextId]));
    check((await db.system(async c=>{await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:root.authUserId,session_id:root.sessionId,role:'authenticated'})]);return c.query('select id from public.profiles where id=$1',[root.authUserId]);})).rowCount===0,'Native authenticated RLS hides private profile rows even with an unchanged valid JWT');
    await denied(()=>db.actor(root,c=>c.query('select 1')),403,'Authenticated API transactions reject a banned primary context');
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[root.sessionId,fifth.contextId]));
    const rootRestore=await reviewed({targetId:root.contextId,action:'restore',duration:null});await apply(rootRestore.id);
    check(!(await access(root.contextId)).banned,'Restoration removes an active own ban');
    await denied(()=>db.system(c=>requireAccountAccess(c,root.contextId,[],root.sessionId)),401,'Restoration never revives a pre-ban provider session');
    await denied(()=>db.system(c=>c.query('delete from private.account_access_epochs where context_id=$1',[root.contextId])),'42501','Native epoch history cannot be erased to revive old sessions');
    await denied(()=>db.system(c=>c.query("update public.admin_proposals set executed_at=clock_timestamp() where id=$1",[rootRestore.id])),'42501','Execution metadata remains immutable');
    const recipients=(await db.pool.query("select distinct r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.category='account_access'")).rows.map(r=>r.context_id);
    check([root.contextId,leaf,resident,manager,staff].every(id=>recipients.includes(id))&&!recipients.includes(primaries[2].contextId),'Actual policy notices reach affected portals and their saved primary owner, not a shared-email stranger');
    const storeBan=await reviewed({targetId:storeSeller.contextId,targetRole:'merchant',action:'ban',duration:{amount:1,unit:'hours'}});await apply(storeBan.id);
    check((await db.pool.query('select features from private.account_policies where context_id=$1',[storeSeller.contextId])).rows[0].features.includes('publishing'),'A new ban preserves existing feature restrictions');
    check(!(await db.pool.query('select private.store_is_public($1) as visible',[store])).rows[0].visible,'A banned seller is hidden from the native public catalog');
    await denied(()=>db.system(c=>c.query('insert into public.market_orders(buyer_context_id,store_id) values($1,$2)',[primaries[2].contextId,store])),'42501','Unrestricted buyers cannot create orders for a banned seller');
    const storeRestore=await reviewed({targetId:storeSeller.contextId,targetRole:'merchant',action:'restore',duration:null});await apply(storeRestore.id);
    check((await db.pool.query('select private.store_is_public($1) as visible',[store])).rows[0].visible,'Restoring a seller brings its still-eligible store back into the catalog');
    for(const role of ['anon','authenticated','pinevela_backend']){
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.account_policies');}),'42501','Policy records are not directly readable by browser or backend roles');
      check(!(await db.pool.query("select has_function_privilege($1,'private.account_access(uuid)','EXECUTE') as allowed",[role])).rows[0].allowed,'Internal policy lookup is not an exposed RPC');
    }
    stage='restart and genuine identity integrity';
    await db.close();db=new SupabaseDatabase(config);service=new SupabaseAccountReviews(new SupabaseAuth(db));
    check((await status()).accountProposals.find((p:any)=>p.id===atomic.id).finalRejectionReason==='Final action rejected after independent review','Review history and final reason survive a new database connection');
    await denied(()=>db.system(c=>requireAccountAccess(c,root.contextId,[],root.sessionId)),401,'Account epochs persist after reconnecting to PostgreSQL');
    stage='residence dependency reviews';
    if((await db.pool.query("select to_regprocedure('private.residence_review_preview(jsonb)') is not null as ready")).rows[0].ready)
      checks+=residenceChecks=await verifyResidenceReviews(db,fixture);
    if(residenceChecks){await db.close();db=new SupabaseDatabase(config);
      check((await db.authorizedSystem(founder,['admin'],c=>governanceStatus(c,founder))).residenceProposals.some((p:any)=>p.finalReason==='Keep this residence'),
        'Residence review history and founder final reason persist across reconnect');}
    check((await db.pool.query(fingerprintSQL)).rows[0].digest===fixture.authDigest,'No genuine Auth account, identity or session timestamp changed');
  }finally{await db.close();}
},{applicationCheckpoint});console.log(JSON.stringify({passed:true,checks,residenceChecks,isolatedRestore:true,cloudRecordsModified:0,authAccountsCreated:0,providerMocks:0,genuineFreshSigninPending:true}));
}catch(e:any){fs.writeFileSync(path.resolve('.security/migration-reset',backup+'.account-review-test-failure.log'),String(e.stack||e),{mode:0o600});
  console.error(JSON.stringify({passed:false,checks,stage,status:e instanceof ApiError?e.status:undefined,sqlstate:/^[0-9A-Z]{5}$/.test(e?.code)?e.code:undefined,sqlPosition:e?.position,assertion:e?.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;}
