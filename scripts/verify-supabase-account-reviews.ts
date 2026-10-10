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
import {SupabaseAccountReviews,accountDirectory,accountReviewStatus,checkAccountReviewContext,voteAccountReview} from '../supabase/accountReviews.js';
import {readNotifications} from '../supabase/notifications.js';
import {hashCredentialAsync} from '../accountSecurity.js';
dotenv.config({quiet:true});const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the latest genuine Auth checkpoint and immutable migration-27 checkpoint.');
let checks=0,stage='fixture';const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
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
      const officer=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'officer','active') returning id",[people[4].id])).rows[0].id;
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000').sort()){
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(sql);
        await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
      }
      if(draft)await c.query(fs.readFileSync(draft,'utf8'));
      return {actors,primaries,keys,settingsKeys,authDigest,officer};
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
    check(directory.totalUsers===11&&directory.breakdown.admins===5&&directory.breakdown.officers===1,'Directory uses actual primary and portal records');
    check(directory.users.filter(u=>u.role==='user').every(u=>u.primaryAccountId===u.id&&u.parentId===null),'Primary directory identities remain independent');
    check(directory.users.filter(u=>u.role==='admin').every(u=>u.parentRole==='user'&&u.primaryAccountId===u.parentId),'Administrator directory links use persisted identity relationships');
    check(!JSON.stringify(directory).includes('hash')&&!JSON.stringify(directory).includes('session'),'Directory projects no credential/session records');
    const available=await status();check(available.capabilities.accountReviews&&!available.capabilities.accountApplication&&!available.capabilities.accountDeletion,'Only review capabilities are enabled');
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
    const notices=(await db.pool.query("select n.id,n.category,count(r.context_id)::int as count from public.notifications n join public.notification_recipients r on r.notification_id=n.id where n.title like 'Account %' group by n.id,n.category")).rows;
    check(notices.length>0&&notices.every(n=>n.category==='admin_governance'&&n.count===5),'Proposal and vote lifecycle notifications reach all five administrator portals');
    const adminNotices=await db.actor(founder,c=>readNotifications(c,founder));
    check(adminNotices.some(n=>n.module==='admin_governance'&&!n.read),'Administrator approvals tab receives unread module notices');
    check((await db.pool.query('select count(*) from public.notification_recipients where context_id=any($1::uuid[])',[primaries.map(p=>p.contextId)])).rows[0].count==='0','Approval-only updates do not tell primary users their account was banned');
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
    check((await db.pool.query("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%account_review%' and p.prosecdef")).rows[0].count==='0','New review helpers are invoker functions');
    stage='restart and genuine identity integrity';
    await db.close();db=new SupabaseDatabase(config);service=new SupabaseAccountReviews(new SupabaseAuth(db));
    check((await status()).accountProposals.find((p:any)=>p.id===atomic.id).finalRejectionReason==='Final action rejected after independent review','Review history and final reason survive a new database connection');
    check((await db.pool.query(fingerprintSQL)).rows[0].digest===fixture.authDigest,'No genuine Auth account, identity or session timestamp changed');
  }finally{await db.close();}
},{applicationCheckpoint});console.log(JSON.stringify({passed:true,checks,isolatedRestore:true,cloudRecordsModified:0,authAccountsCreated:0,providerMocks:0,accountActionsApplied:0}));
}catch(e:any){fs.writeFileSync(path.resolve('.security/migration-reset',backup+'.account-review-test-failure.log'),String(e.stack||e),{mode:0o600});
  console.error(JSON.stringify({passed:false,checks,stage,status:e instanceof ApiError?e.status:undefined,sqlstate:/^[0-9A-Z]{5}$/.test(e?.code)?e.code:undefined,assertion:e?.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;}
