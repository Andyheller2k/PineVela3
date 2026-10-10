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
import { SupabaseAdminGovernance,governanceStatus,enrollApprovalKey,checkApprovalKey,requireApprovalGrant,proposeKeyRecovery,voteKeyRecovery,setAdministratorActive } from '../supabase/adminGovernance.js';
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
          [contextId,await hashCredentialAsync(`approval:${contextId}:${key}`),await hashCredentialAsync(`settings:${contextId}:${settings}`)]);
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

    stage='status';
    const initial=await status(founder);
    check(initial.capabilities.membershipChanges&&initial.capabilities.removal,'Suspension and reviewed removal commands are available');
    const active=(a:VerifiedActor,t:VerifiedActor,value:boolean,key:string)=>service.setActive(a,t.contextId,{active:value,privateKey:key});
    const snapshot=async()=>JSON.stringify((await db.pool.query('select * from public.admin_memberships order by slot')).rows);
    const before=await snapshot();
    await denied(()=>active(second,third,false,keys[1]),403,'Another administrator cannot suspend a colleague');
    await denied(()=>active(founder,founder,false,keys[0]),403,'Founder cannot suspend self');
    await denied(()=>active(founder,second,false,settingsKeys[0]),403,'Settings key cannot authorize suspension');
    await denied(()=>active(founder,second,false,keys[1]),403,'Foreign approval key cannot authorize suspension');
    await denied(()=>service.setActive(founder,second.contextId,{active:'false',privateKey:keys[0]}),400,'Boolean status is required');
    await denied(()=>service.setActive(founder,second.contextId,{active:false,privateKey:keys[0],userId:third.authUserId}),400,'Client owner fields are rejected');
    await denied(()=>service.setActive(founder,crypto.randomUUID(),{active:false,privateKey:keys[0]}),404,'Unknown membership cannot be changed');
    await denied(()=>active(founder,second,true,keys[0]),409,'Duplicate restoration cannot reset session metadata');
    check(before===await snapshot(),'Denied requests preserve membership state');
    stage='database guards';
    await denied(()=>db.system(c=>c.query("update public.admin_memberships set status='suspended' where context_id=$1",[second.contextId])),'42501','Raw SQL requires an actual founder grant');
    await denied(()=>db.system(c=>c.query("update public.admin_memberships set status='suspended' where context_id=$1",[founder.contextId])),'42501','Raw SQL cannot suspend founder');
    await denied(()=>db.system(c=>c.query('delete from public.admin_memberships where context_id=$1',[second.contextId])),'42501','Raw SQL cannot bypass removal review');
    await denied(()=>db.system(c=>c.query('delete from public.account_contexts where id=$1',[second.contextId])),'42501','Deleting a context cannot bypass removal review');
    await denied(()=>db.system(c=>c.query("update public.account_contexts set status='suspended' where id=$1",[founder.contextId])),'42501','Founder cannot be disabled through generic context status');
    await denied(()=>db.system(c=>c.query('update public.account_contexts set auth_user_id=$2 where id=$1',[second.contextId,third.authUserId])),'42501','Admin ownership cannot be reassigned');
    await denied(()=>db.system(c=>c.query('update public.admin_memberships set slot=5 where context_id=$1',[second.contextId])),'42501','Founder slot cannot be reassigned indirectly');
    await denied(()=>db.system(c=>c.query('update public.admin_memberships set sessions_invalidated_at=clock_timestamp() where context_id=$1',[second.contextId])),'42501','Client timestamps cannot alter session eligibility');
    const foreign=await grant(second,keys[1]);
    await denied(()=>db.authorizedSystem(second,['admin'],async c=>{await requireApprovalGrant(c,second,foreign);return c.query("update public.admin_memberships set status='suspended' where context_id=$1",[third.contextId]);}),'42501','SQL enforces founder requirement independently of API');
    const own=await grant(founder,keys[0]);
    await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await requireApprovalGrant(c,founder,own);return c.query("update public.admin_memberships set status='removed' where context_id=$1",[second.contextId]);}),'42501','Founder grant does not bypass removal protocol');
    stage='rollback';
    const notices=Number((await db.pool.query('select count(*) from public.notifications')).rows[0].count);
    await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await setAdministratorActive(c,founder,own,second.contextId,false);
      return c.query('insert into public.notification_recipients(notification_id,context_id) values(gen_random_uuid(),$1)',[founder.contextId]);}),'23503','A failure rolls back the status, epoch, audit and notifications');
    check(before===await snapshot()&&Number((await db.pool.query('select count(*) from public.notifications')).rows[0].count)===notices,'Rollback preserves prior membership and notice state');
    stage='suspension';
    const proposal=await propose(founder,third,keys[0],'reset-settings-key');
    const credentials=JSON.stringify((await db.pool.query('select approval_key_hash,settings_key_hash,approval_key_version,settings_key_version from private.admin_secrets where context_id=$1',[second.contextId])).rows[0]);
    const parallel=await Promise.allSettled([active(founder,second,false,keys[0]),active(founder,second,false,keys[0])]);
    check(parallel.filter(x=>x.status==='fulfilled').length===1&&parallel.filter(x=>x.status==='rejected'&&x.reason instanceof ApiError&&x.reason.status===409).length===1,'Concurrent suspension commits exactly once');
    const suspended=(await db.pool.query('select * from public.admin_memberships where context_id=$1',[second.contextId])).rows[0];
    check(suspended.status==='suspended'&&suspended.sessions_invalidated_at&&suspended.changed_at,'Server stamps suspension and session epoch');
    await denied(()=>status(second),401,'Suspended administrator cannot read governance');
    await denied(()=>service.vote(second,proposal.id,{privateKey:keys[1],decision:'approved'}),401,'Suspended administrator cannot vote');
    check((await db.pool.query('select status from public.admin_proposals where id=$1',[proposal.id])).rows[0].status==='invalidated','Membership change invalidates pending recovery consent');
    check(JSON.stringify((await db.pool.query('select approval_key_hash,settings_key_hash,approval_key_version,settings_key_version from private.admin_secrets where context_id=$1',[second.contextId])).rows[0])===credentials,'Suspension preserves separate keys and versions');
    await db.system(async c=>{await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:second.authUserId,session_id:second.sessionId,role:'authenticated'})]);
      await c.query('set local role authenticated');check((await c.query('select private.current_context_id() as id')).rows[0].id===null,'Direct RLS invalidates suspended admin context');});
    check((await db.pool.query("select count(*) from private.audit_events where event_type='administrator_membership_suspended'")).rows[0].count==='1','Suspension audited once');
    const notice=(await db.pool.query("select id from public.notifications where title='Administrator access suspended'")).rows[0].id;
    const recipients=(await db.pool.query('select context_id from public.notification_recipients where notification_id=$1',[notice])).rows.map(r=>r.context_id);
    const primaryId=(await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[second.authUserId])).rows[0].id;
    check(recipients.length===5&&fixture.actors.every(a=>recipients.includes(a.contextId))&&recipients.includes(primaryId),'Exact administrator roster and affected primary account receive the notice');
    stage='restoration';
    check((await active(founder,second,true,keys[0])).status==='active','Founder can restore an existing suspended administrator');
    await denied(()=>status(second),401,'Restoration cannot revive an old session');
    await db.system(async c=>{await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:second.authUserId,session_id:second.sessionId,role:'authenticated'})]);
      await c.query('set local role authenticated');check((await c.query('select private.current_context_id() as id')).rows[0].id===null,'Direct RLS rejects old sessions after restoration');});
    check((await db.pool.query('select private.administrator_session_allowed($1,$2) as allowed',[second.contextId,second.sessionId])).rows[0].allowed===false,'Auth session refresh cannot bypass restored membership epoch');
    const primaryActor={...second,contextId:primaryId,kind:'primary'};
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[second.sessionId,primaryId]));
    check((await db.actor(primaryActor,c=>c.query("select id from public.notifications where category='admin_governance'"))).rowCount===2,'Affected primary portal sees suspension and restoration notices');
    await denied(()=>auth.switchContext(primaryActor,second.contextId),403,'Switching from primary with an old Auth session cannot restore admin access');
    check((await db.actor(third,c=>c.query("select id from public.notifications where title='Administrator access restored'"))).rowCount===1,'Other active administrators see restoration notice');
    stage='restart and ACL';
    await db.close();db=new SupabaseDatabase(config);auth=new SupabaseAuth(db);service=new SupabaseAdminGovernance(auth);
    check((await status(founder)).members.find((m:any)=>m.id===second.contextId)?.active,'Restored membership persists after pool restart');
    await denied(()=>status(second),401,'Old admin session remains invalid after restart');
    for(const role of ['anon','authenticated','pinevela_backend']) {
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query("update public.admin_memberships set status='suspended' where context_id=$1",[second.contextId]);}),'42501','Browser/backend cannot directly modify membership');
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select private.administrator_session_allowed($1,$2)',[second.contextId,second.sessionId]);}),'42501','Private session guard is not a public RPC');
    }
    check((await db.pool.query('select count(*) from auth.users')).rows[0].count==='5'&&JSON.stringify((await db.pool.query('select id,created_at from auth.sessions order by id')).rows)===fixture.authTimes,'No Auth account or genuine session timestamps changed');
  }finally{await db.close();}
});console.log(JSON.stringify({checks,passed:true,isolatedRestore:true,cloudRecordsModified:0,authAccountsCreated:0,authSessionTimesChanged:0,providerMocks:0,
  restoredProviderLoginAcceptance:'Requires actual new Google/email sign-in; no session was made fresh.'}));
}catch(e:any){console.error(JSON.stringify({passed:false,checks,stage,status:e instanceof ApiError?e.status:undefined,sqlstate:/^[0-9A-Z]{5}$/.test(e?.code)?e.code:undefined,assertion:e?.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;}
