/** Existing Google subjects restored locally. Credential fixtures are seeded before
 * enrollment guards; no Auth identity/session timestamp/JWT/provider response is invented. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError,SupabaseDatabase,type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { hashCredentialAsync } from '../accountSecurity.js';
import { SupabaseAdminGovernance,governanceStatus,enrollApprovalKey,checkApprovalKey,requireApprovalGrant,proposeKeyRecovery,voteKeyRecovery } from '../supabase/adminGovernance.js';
import { administratorSettingsStatus,checkAdministratorSettingsKey } from '../supabase/adminSettings.js';
import { SupabasePricing } from '../supabase/pricing.js';
import { pricingSettings,publicPlatformSettings } from '../platformSettings.js';
dotenv.config({quiet:true});const backup=process.argv[2];if(!backup)throw new Error('Pass the migration-27 checkpoint UUID.');
let checks=0,stage='fixture';const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError && error.status===expected:error?.code===expected,label);}
try {await withIsolatedBackup(backup,async config=>{
  let db=new SupabaseDatabase(config);
  try {
    const fixture=await db.system(async c=>{
      const ledger=(await c.query('select version,digest from private.schema_migrations')).rows;check(ledger.length===27,'Credential fixtures use the preserved pre-enrollment checkpoint');
      for(const row of ledger){const file=fs.readdirSync('supabase/migrations').find(f=>f.startsWith(row.version));
        check(file&&crypto.createHash('sha256').update(fs.readFileSync(path.join('supabase/migrations',file))).digest('hex')===row.digest,'Historical migration is immutable');}
      check((await c.query('select count(*) from public.profiles')).rows[0].count==='0','No production profiles were restored');
      const people=(await c.query(`select distinct on(u.id) u.id,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
        join auth.identities i on i.user_id=u.id and i.provider='google' where u.email_confirmed_at is not null and not u.is_anonymous
        and (s.not_after is null or s.not_after>clock_timestamp()) order by u.id,s.created_at desc limit 4`)).rows;
      check(people.length===4,'Four genuine confirmed Google subjects available');
      const actors:VerifiedActor[]=[],keys:string[]=[],settingsKeys:string[]=[];let primary!:VerifiedActor;
      for(const [i,p] of people.entries()){
        await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        const contextId=(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[p.id])).rows[0].id;
        const actor={authUserId:p.id,sessionId:p.session_id,contextId,kind:'admin'};actors.push(actor);
        await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[contextId,i+1]);
        const key=crypto.randomBytes(32).toString('base64url'),settings=crypto.randomBytes(32).toString('base64url');keys.push(key);settingsKeys.push(settings);
        await c.query(`insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at)
          values($1,$2,case when $2::text is null then null else clock_timestamp() end,$3,clock_timestamp())`,
          [contextId,i===3?null:await hashCredentialAsync(`approval:${contextId}:${key}`),await hashCredentialAsync(`settings:${contextId}:${settings}`)]);
        await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[actor.sessionId,actor.authUserId,contextId]);
        if(i===3)primary={...actor,kind:'primary',contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id};
      }
      // Actual historical governance history, created before its new protocol, must
      // remain closed and must never become a current authorization grant.
      const expired=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,target_context_id,preview,baseline_digest,reason,quorum,status,created_at,expires_at)
        values('administrator_key_reset',$1,$2,$3,'legacy','Recover approval key',2,'expired',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day') returning id`,
        [actors[0].contextId,actors[1].contextId,JSON.stringify({action:'reset-key'})])).rows[0].id;
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000').sort()){
        const sql=fs.readFileSync(path.join('supabase/migrations',file),'utf8');await c.query(sql);
        await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
      }
      return {actors,keys,settingsKeys,primary,expired,authTimes:JSON.stringify((await c.query('select id,created_at from auth.sessions order by id')).rows)};
    });
    const {actors:[founder,second,third,fourth],keys,settingsKeys,primary}=fixture;
    let auth=new SupabaseAuth(db),service=new SupabaseAdminGovernance(auth);
    const status=(a:VerifiedActor)=>db.authorizedSystem(a,['admin'],c=>governanceStatus(c,a));
    const grant=(a:VerifiedActor,key:string)=>db.authorizedSystem(a,['admin'],c=>checkApprovalKey(c,a,key));
    const propose=(a:VerifiedActor,target:VerifiedActor,key:string,action='reset-settings-key')=>service.propose(a,target.contextId,{action,reason:'Recover administrator key',privateKey:key});
    const vote=(a:VerifiedActor,id:string,key:string,decision='approved')=>service.vote(a,id,{privateKey:key,decision});
    stage='enrollment';
    const initial=await status(founder);
    check(initial.currentId===founder.contextId&&initial.mainId===founder.contextId&&initial.members.length===4,'Status derives the actual roster and founder');
    check(initial.capabilities.approvalKeys&&initial.capabilities.keyRecovery&&initial.capabilities.invitations&&!initial.capabilities.wipes,'Status describes available and pending controls honestly');
    check(initial.changes.some(p=>p.id===fixture.expired&&p.status==='expired'),'Historical expired recovery remains expired');
    check(!JSON.stringify(initial).includes(keys[0])&&!JSON.stringify(initial).includes('scrypt-sha256'),'Governance projection exposes no secrets or hashes');
    await denied(()=>db.authorizedSystem(fourth,['admin'],c=>enrollApprovalKey(c,fourth,{password:'untrusted'})),400,'Enrollment rejects a client password/identity');
    await denied(()=>db.authorizedSystem(founder,['admin'],c=>enrollApprovalKey(c,founder,{})),409,'An issued approval key cannot be displayed or replaced');
    await denied(()=>db.authorizedSystem(fourth,['admin'],c=>enrollApprovalKey(c,fourth,{})),403,'An old genuine session cannot enroll an approval key');
    const hash=await hashCredentialAsync(`approval:${fourth.contextId}:${keys[3]}`);
    await denied(()=>db.authorizedSystem(fourth,['admin'],c=>c.query('update private.admin_secrets set approval_key_hash=$2 where context_id=$1',[fourth.contextId,hash])),
      '42501','SQL independently requires a fresh actual sign-in');
    await denied(()=>db.system(c=>c.query('update private.admin_secrets set approval_key_version=gen_random_uuid() where context_id=$1',[founder.contextId])),
      '42501','Approval version cannot be spoofed');
    await denied(()=>db.system(c=>c.query('update private.admin_secrets set sessions_invalidated_at=clock_timestamp() where context_id=$1',[founder.contextId])),
      '42501','Session invalidation time cannot be spoofed');
    await denied(()=>db.system(c=>c.query('delete from private.admin_secrets where context_id=$1',[founder.contextId])),'42501','Active administrator keys cannot be deleted to bypass recovery');
    stage='key attempts';
    check(!(await grant(founder,keys[1])).allowed,'Another administrator approval key is denied');
    check(!(await grant(founder,settingsKeys[0])).allowed,'A settings key cannot authorize approvals');
    const valid=await grant(founder,keys[0]);check(valid.allowed&&valid.version,'Own context-bound approval key succeeds');
    for(let i=1;i<=5;i++){const wrong=await grant(second,crypto.randomBytes(32).toString('hex'));check(!wrong.allowed&&Boolean(wrong.locked)===(i===5),'Five failed guesses persist and lock approvals');}
    check((await db.pool.query('select settings_failed_attempts from private.admin_secrets where context_id=$1',[second.contextId])).rows[0].settings_failed_attempts===0,'Approval guesses do not consume settings-key attempts');
    await db.close();db=new SupabaseDatabase(config);auth=new SupabaseAuth(db);service=new SupabaseAdminGovernance(auth);
    check((await grant(second,keys[1])).locked,'Approval lockout survives a new backend pool');
    await db.system(c=>c.query("update private.admin_secrets set approval_attempt_window=clock_timestamp()-interval '31 minutes',locked_until=clock_timestamp()-interval '1 minute' where context_id=$1",[second.contextId]));
    check((await grant(second,keys[1])).allowed,'Expired lockout admits the valid approval key');
    stage='proposals';
    await denied(()=>propose(founder,founder,keys[0]),403,'The targeted administrator cannot propose their own recovery');
    await denied(()=>service.propose(founder,second.contextId,{action:'remove',reason:'Remove account',privateKey:keys[0]}),409,'Removal requires its separate four-voter electorate');
    await denied(()=>service.propose(founder,second.contextId,{action:'reset-key',reason:'Recover approval key',privateKey:keys[0],userId:second.authUserId}),400,'Proposal rejects actor/owner assertions');
    await denied(()=>propose(founder,fourth,keys[0],'reset-key'),409,'An unenrolled key has no recovery authorization');
    await denied(()=>propose(founder,second,settingsKeys[0]),403,'Settings credentials cannot propose recovery');
    check((await db.pool.query('select failed_attempts from private.admin_secrets where context_id=$1',[founder.contextId])).rows[0].failed_attempts===1,'Service denial commits its failed approval attempt');
    const p=await propose(founder,fourth,keys[0]);
    const row=(await db.pool.query('select * from public.admin_proposals where id=$1',[p.id])).rows[0];
    check(row.quorum===2&&row.proposer_context_id===founder.contextId&&row.target_context_id===fourth.contextId,'Server fixes quorum, proposer and reviewed target');
    check(new Date(row.expires_at).getTime()-new Date(row.created_at).getTime()===86400000,'Server fixes a 24-hour recovery deadline');
    check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[p.id])).rows[0].count==='1','The proposer contributes exactly one approval');
    check((await db.pool.query("select count(*) from public.notifications where category='admin_governance' and title='Administrator key recovery submitted'")).rows[0].count==='1','Submission creates one Approvals notice');
    check((await db.pool.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.category='admin_governance'")).rows[0].count==='4','Exact active administrators receive the notice');
    await denied(()=>propose(second,fourth,keys[1]),409,'Concurrent duplicate target/key proposal is rejected');
    await denied(()=>vote(founder,p.id,keys[0]),403,'A proposer cannot count twice');
    await denied(()=>vote(fourth,p.id,keys[3]),403,'An unenrolled target cannot approve their own recovery');
    await denied(()=>db.system(c=>c.query("update public.admin_proposals set reason='Change target review' where id=$1",[p.id])),'42501','Reviewed reason cannot change');
    await denied(()=>db.system(c=>c.query('update public.admin_proposals set expires_at=clock_timestamp() where id=$1',[p.id])),'42501','Deadline cannot change');
    await denied(()=>db.system(c=>c.query('delete from public.admin_votes where proposal_id=$1',[p.id])),'42501','Recorded approvals cannot be deleted');
    await denied(()=>db.system(c=>c.query('update private.admin_secrets set settings_key_hash=null where context_id=$1',[fourth.contextId])),'42501','Raw SQL cannot clear a key without reviewed approvals');
    const foreign=await grant(second,keys[1]);
    await denied(()=>db.authorizedSystem(founder,['admin'],c=>proposeKeyRecovery(c,founder,foreign,second.contextId,{action:'reset-key',reason:'Recover approval key'})),403,'A grant cannot transfer to another administrator');
    await denied(()=>db.authorizedSystem(founder,['admin'],c=>requireApprovalGrant(c,founder,{allowed:true,version:crypto.randomUUID()})),403,'A stale/forged grant cannot authorize a vote');
    const beforeFailure=JSON.stringify((await db.pool.query('select settings_key_hash,sessions_invalidated_at from private.admin_secrets where context_id=$1',[fourth.contextId])).rows[0]);
    const secondGrant=await grant(second,keys[1]);
    await denied(()=>db.authorizedSystem(second,['admin'],async c=>{await voteKeyRecovery(c,second,secondGrant,p.id,'approved');
      await c.query('insert into public.notification_recipients(notification_id,context_id) values(gen_random_uuid(),$1)',[second.contextId]);}),
      '23503','A later failure rolls back vote, credential reset, invalidation and notices');
    check(JSON.stringify((await db.pool.query('select settings_key_hash,sessions_invalidated_at from private.admin_secrets where context_id=$1',[fourth.contextId])).rows[0])===beforeFailure,'Failed reset preserves the key and target session eligibility');
    check((await db.pool.query('select status from public.admin_proposals where id=$1',[p.id])).rows[0].status==='pending','Failed reset leaves the proposal pending');
    stage='reset execution';
    const secondProposal=await propose(third,second,keys[2]);
    await denied(()=>vote(second,secondProposal.id,keys[1]),403,'A target with a valid enrolled approval key cannot vote on their recovery');
    const founderProposal=await propose(second,founder,keys[1]);
    const thirdGrant=await grant(third,keys[2]);
    await denied(()=>db.authorizedSystem(third,['admin'],async c=>{
      await voteKeyRecovery(c,third,thirdGrant,founderProposal.id,'approved');
      check((await c.query('select settings_key_hash from private.admin_secrets where context_id=$1',[founder.contextId])).rows[0].settings_key_hash===null,
        'Two other administrators can recover the founder settings key');
      check((await c.query('select private.administrator_session_allowed($1,$2) as allowed',[founder.contextId,founder.sessionId])).rows[0].allowed===false,
        'Founder recovery invalidates the founder old administrator session');
      check((await c.query('select slot,status from public.admin_memberships where context_id=$1',[founder.contextId])).rows[0].slot===1,
        'Founder recovery preserves the main administrator membership');
      throw new ApiError(418,'Rollback isolated founder recovery');
    }),418,'Isolated founder recovery is rolled back after checking its actual effects');
    check((await grant(founder,keys[0])).allowed,'Rollback preserves the founder existing credentials');
    const pricing=new SupabasePricing(auth);
    const prices=pricingSettings(publicPlatformSettings({platformSettings:{}}));
    const priceProposal=await pricing.propose(founder,{settingsKey:settingsKeys[0],reason:'Review registration fee',prices:{...prices,registrationFee:prices.registrationFee+1}});
    const concurrent=await Promise.allSettled([vote(second,p.id,keys[1]),vote(third,p.id,keys[2])]);
    check(concurrent.filter(r=>r.status==='fulfilled'&&r.value.status==='executed').length===1,
      'Two competing independent voters complete recovery once');
    check(concurrent.filter(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===409).length===1,
      'The competing post-decision approval is rejected');
    const changed=(await db.pool.query('select * from private.admin_secrets where context_id=$1',[fourth.contextId])).rows[0];
    check(changed.settings_key_hash===null&&changed.settings_enrolled_at===null&&changed.settings_failed_attempts===0,'Recovery clears only the selected credential and its lockout');
    check(changed.approval_key_hash===null&&changed.sessions_invalidated_at,'Recovery invalidates the target old application sessions');
    await denied(()=>status(fourth),401,'A pre-reset actual Auth session cannot use the administrator portal');
    await denied(()=>db.actor(fourth,async()=>undefined),401,'The RLS actor wrapper rejects the old administrator session');
    await db.system(async c=>{await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:fourth.authUserId,session_id:fourth.sessionId,role:'authenticated'})]);
      await c.query('set local role authenticated');check((await c.query('select private.current_context_id() as id')).rows[0].id===null,'Direct RLS also rejects the target old actual session');});
    check((await db.pool.query('select status from public.admin_proposals where id=$1',[secondProposal.id])).rows[0].status==='invalidated','Credential recovery invalidates other stale recovery reviews');
    check((await db.pool.query('select status from public.admin_proposals where id=$1',[priceProposal.id])).rows[0].status==='invalidated','Credential recovery invalidates stale pricing approvals');
    await denied(()=>vote(third,p.id,keys[2]),409,'A completed recovery cannot execute again');
    check((await db.pool.query('select count(*) from private.audit_events where event_type=$1',['administrator_key_recovery_executed'])).rows[0].count==='1','Recovery execution is audited once');
    check((await db.pool.query('select count(*) from auth.users')).rows[0].count==='5'&&JSON.stringify((await db.pool.query('select id,created_at from auth.sessions order by id')).rows)===fixture.authTimes,'Auth identities and genuine Auth timestamps are unchanged');
    stage='invalidation/rejection';
    const stale=await propose(founder,second,keys[0],'reset-key');
    await service.setActive(founder,fourth.contextId,{active:false,privateKey:keys[0]});
    await service.setActive(founder,fourth.contextId,{active:true,privateKey:keys[0]});
    check((await db.pool.query('select status from public.admin_proposals where id=$1',[stale.id])).rows[0].status==='invalidated','A reversed membership change cannot revive old consent');
    const rejected=await propose(founder,second,keys[0],'reset-key');
    check((await vote(third,rejected.id,keys[2],'rejected')).status==='rejected','An independent rejection closes recovery');
    check((await grant(second,keys[1])).allowed,'A rejected proposal preserves the current key');
    await denied(()=>vote(third,fixture.expired,keys[2]),409,'Expired historical recovery cannot receive a new vote');
    stage='approval recovery/concurrency';
    const final=await propose(founder,second,keys[0],'reset-key');
    const competing=await Promise.allSettled([vote(third,final.id,keys[2]),vote(third,final.id,keys[2])]);
    check(competing.filter(r=>r.status==='fulfilled').length===1&&competing.filter(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===409).length===1,'Parallel second approvals complete recovery once');
    const secondKeys=(await db.pool.query('select approval_key_hash,settings_key_hash from private.admin_secrets where context_id=$1',[second.contextId])).rows[0];
    check(secondKeys.approval_key_hash===null&&secondKeys.settings_key_hash!==null,'Approval recovery preserves the separate settings credential');
    await denied(()=>status(second),401,'Approval recovery also invalidates old administrator sessions');
    await db.close();db=new SupabaseDatabase(config);auth=new SupabaseAuth(db);
    check((await status(founder)).changes.find(p=>p.id===final.id)?.status==='executed','Recovery history survives a backend pool restart');
    await denied(()=>status(second),401,'Target session invalidation persists across pool restart');
    stage='RLS and private ACL';
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary.sessionId,primary.contextId]));
    await denied(()=>status(primary),403,'A primary portal cannot inspect governance');
    check((await db.actor(primary,c=>c.query("select id from public.admin_proposals where kind='administrator_key_reset'"))).rowCount===0,'RLS hides administrator recovery proposals from primary users');
    check((await db.actor(primary,c=>c.query("select id from public.notifications where category='admin_governance'"))).rowCount===2,'Primary users receive only their own suspension and restoration notices');
    check((await db.actor(founder,c=>c.query("select id from public.notifications where category='admin_governance'"))).rowCount!>0,'The actual administrator recipient can read Approvals notices');
    for(const role of ['anon','authenticated','pinevela_backend']) {
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select approval_key_hash from private.admin_secrets');}),'42501','Client/backend roles cannot read approval secrets');
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query("update public.admin_proposals set status='executed'");}),'42501','Client/backend roles cannot directly execute recovery');
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select private.recovery_execution_allowed($1,$2)',[second.contextId,'reset-key']);}),'42501','Private recovery authorization is not a browser RPC');
    }
    const settings=(await db.authorizedSystem(founder,['admin'],c=>checkAdministratorSettingsKey(c,founder,settingsKeys[0])));check(settings.allowed,'Other administrators settings credentials remain usable');
    check((await db.pool.query('select count(*) from auth.users')).rows[0].count==='5','No Auth account was created');
  }finally{await db.close();}
});console.log(JSON.stringify({checks,passed:true,isolatedRestore:true,cloudRecordsModified:0,authAccountsCreated:0,authSessionTimesChanged:0,providerMocks:0,
  freshEnrollmentAcceptance:'Requires a real fresh Google/email sign-in; old Auth sessions were not made fresh.'}));
}catch(e:any){console.error(JSON.stringify({passed:false,checks,stage,status:e instanceof ApiError?e.status:undefined,sqlstate:/^[0-9A-Z]{5}$/.test(e?.code)?e.code:undefined,assertion:e?.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;}
