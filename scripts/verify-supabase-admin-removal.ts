/** Local-only domain fixtures on five actual Google subjects. No invented Auth
 * account, provider response, JWT or changed Auth-session freshness. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabaseAdminGovernance,governanceStatus,checkApprovalKey,requireApprovalGrant} from '../supabase/adminGovernance.js';
import {confirmAdministratorRemoval} from '../supabase/adminRemoval.js';
import {SupabaseAdminInvitations} from '../supabase/adminInvitations.js';
import {hashCredentialAsync} from '../accountSecurity.js';
dotenv.config({quiet:true});const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the latest genuine Auth checkpoint and the immutable migration-27 checkpoint.');
let checks=0,stage='fixture';const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);}
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
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000').sort()){
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(sql);
        await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
      }
      if(draft)await c.query(fs.readFileSync(draft,'utf8'));
      return {actors,primaries,keys,settingsKeys,authDigest};
    });
    const {actors:[founder,second,third,fourth,target],keys,settingsKeys,primaries}=fixture;
    let auth=new SupabaseAuth(db),service=new SupabaseAdminGovernance(auth);
    const status=(a:VerifiedActor)=>db.authorizedSystem(a,['admin'],c=>governanceStatus(c,a));
    const propose=(a=founder,t=target,key=keys[0])=>service.propose(a,t.contextId,{action:'remove',reason:'Review administrator membership',privateKey:key});
    const vote=(a:VerifiedActor,id:string,key:string,decision='approved')=>service.vote(a,id,{decision,privateKey:key});
    const confirm=(id:string,a=founder,key=keys[0])=>service.confirmRemoval(a,id,{privateKey:key,confirmation:'REMOVE ADMINISTRATOR'});
    const read=(id:string)=>db.pool.query('select * from public.admin_proposals where id=$1',[id]).then(r=>r.rows[0]);
    const approvals=async(id:string)=>{for(const [i,a] of [second,third,fourth].entries())await vote(a,id,keys[i+1]);};
    const change=async(a:VerifiedActor,id:string)=>(await status(a)).changes.find((p:any)=>p.id===id) as any;

    stage='eligibility and input';check((await status(founder)).capabilities.removal,'Removal command is available');
    await denied(()=>propose(second,target,keys[1]),403,'Only founder can propose removal');
    await denied(()=>propose(founder,founder),403,'Founder cannot be removed');
    await denied(()=>propose(founder,target,settingsKeys[0]),403,'Settings key cannot authorize removal');
    await denied(()=>propose(founder,target,keys[1]),403,'Another approval key cannot authorize removal');
    await denied(()=>service.propose(founder,target.contextId,{action:'remove',reason:'abc',privateKey:keys[0],userId:target.authUserId}),400,'Client owner aliases are rejected');
    await denied(()=>service.plea(target,crypto.randomUUID(),{message:'a'}),400,'Short appeal is rejected');
    await denied(()=>service.confirmRemoval(founder,crypto.randomUUID(),{privateKey:keys[0],confirmation:'DELETE'}),400,'Exact final confirmation is required');
    stage='rejection and immutable votes';
    const rejected=await propose();
    check((await read(rejected.id)).quorum===4,'Quorum is four, never two');
    check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[rejected.id])).rows[0].count==='1','Founder initial vote counts once');
    await denied(()=>propose(),409,'Only one unfinished removal per target');
    await denied(()=>vote(target,rejected.id,keys[4]),403,'Target cannot vote');
    await denied(()=>vote(founder,rejected.id,keys[0]),403,'Founder cannot vote twice');
    await denied(()=>confirm(rejected.id),409,'One vote cannot execute removal');
    await denied(()=>db.system(c=>c.query("update public.admin_votes set decision='rejected' where proposal_id=$1",[rejected.id])),'42501','Removal votes cannot be rewritten');
    await denied(()=>db.system(c=>c.query('delete from public.admin_votes where proposal_id=$1',[rejected.id])),'42501','Removal votes cannot be deleted');
    await vote(second,rejected.id,keys[1],'rejected');check((await read(rejected.id)).status==='rejected','A rejection closes review');
    await denied(()=>vote(third,rejected.id,keys[2]),409,'Rejected review cannot receive later approval');
    stage='accepted private appeal';
    const accepted=await propose();await approvals(accepted.id);
    const awaiting=await read(accepted.id);check(awaiting.status==='awaiting-plea','Fourth distinct approval opens appeal');
    check(new Date(awaiting.removal_plea_until).getTime()>Date.now()+23*3600000,'Fresh 24-hour appeal deadline is server stamped');
    await denied(()=>confirm(accepted.id),409,'Four votes do not bypass private appeal window');
    await denied(()=>service.plea(second,accepted.id,{message:'Private appeal text'}),403,'Another administrator cannot impersonate appeal author');
    await service.plea(target,accepted.id,{message:'Private appeal text'});
    check((await change(target,accepted.id)).plea.message==='Private appeal text','Target sees own appeal');
    check((await change(founder,accepted.id)).plea.message==='Private appeal text','Founder sees appeal');
    check((await change(second,accepted.id)).plea===null,'Other voters never receive appeal text');
    await denied(()=>service.plea(target,accepted.id,{message:'Second appeal'}),409,'An appeal may be submitted only once');
    await denied(()=>service.decidePlea(second,accepted.id,{privateKey:keys[1],decision:'accepted',reason:'Accept this appeal'}),403,'Only founder decides appeal');
    await denied(()=>confirm(accepted.id),409,'Submitted appeal requires founder decision');
    await service.decidePlea(founder,accepted.id,{privateKey:keys[0],decision:'accepted',reason:'Membership retained after review'});
    check((await read(accepted.id)).status==='revoked','Accepted appeal revokes removal authority');
    check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[accepted.id])).rows[0].count==='4','Revoked votes remain immutable audit history');
    await denied(()=>confirm(accepted.id),409,'Revoked consent never authorizes removal');
    await denied(()=>service.acknowledgePlea(second,accepted.id,{}),403,'Only target acknowledges appeal decision');
    await service.acknowledgePlea(target,accepted.id,{});await service.acknowledgePlea(target,accepted.id,{});
    check(Boolean((await change(target,accepted.id)).plea.acknowledgedAt),'Target acknowledgement is persistent and idempotent');
    await denied(()=>db.system(c=>c.query("update private.administrator_appeals set message='changed' where proposal_id=$1",[accepted.id])),'42501','Private appeal text cannot be edited');
    const noticeRows=(await db.pool.query('select title,message from public.notifications')).rows;
    check(!JSON.stringify(noticeRows).includes('Private appeal text')&&!JSON.stringify(noticeRows).includes('Membership retained after review'),'Shared notifications never leak appeal/decision text');
    stage='roster invalidation';
    const stale=await propose();
    const rollback=Symbol('rollback');
    try{await db.authorizedSystem(founder,['admin'],async c=>{
      await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
      const g=await checkApprovalKey(c,founder,keys[0]);await requireApprovalGrant(c,founder,g);
      await c.query("update public.admin_memberships set status='suspended' where context_id=$1",[second.contextId]);
      check((await c.query('select status from public.admin_proposals where id=$1',[stale.id])).rows[0].status==='invalidated','Roster changes invalidate removal consent');
      await c.query("update public.admin_memberships set status='active' where context_id=$1",[second.contextId]);
      check((await c.query('select status from public.admin_proposals where id=$1',[stale.id])).rows[0].status==='invalidated','Roster reversal cannot revive consent');
      throw rollback;
    });}catch(e){if(e!==rollback)throw e;}
    check((await read(stale.id)).status==='pending','Rollback restores domain state without making provider sessions fresh');
    await vote(second,stale.id,keys[1],'rejected');
    stage='reviewed execution';service=new SupabaseAdminGovernance(auth);
    const final=await propose();
    const concurrent=await Promise.allSettled([vote(second,final.id,keys[1]),vote(second,final.id,keys[1])]);
    check(concurrent.filter(r=>r.status==='fulfilled').length===1&&concurrent.filter(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===403).length===1,'Concurrent duplicate votes count once');
    await vote(third,final.id,keys[2]);await vote(fourth,final.id,keys[3]);
    await service.plea(target,final.id,{message:'Request private review before removal'});
    await service.decidePlea(founder,final.id,{privateKey:keys[0],decision:'rejected',reason:'Removal remains required after review'});
    check((await read(final.id)).status==='plea-rejected','Founder rejection enables explicit final confirmation');
    await denied(()=>confirm(final.id,second,keys[1]),403,'Another voter cannot make the final decision');
    await denied(()=>db.system(c=>c.query("update public.admin_memberships set status='removed' where context_id=$1",[target.contextId])),'42501','SQL cannot bypass final review');
    await denied(()=>db.system(c=>c.query("update public.account_contexts set status='closed' where id=$1",[target.contextId])),'42501','Generic context closure cannot remove administrator');
    await denied(()=>db.system(c=>c.query('delete from public.admin_memberships where context_id=$1',[target.contextId])),'42501','History membership cannot be deleted');
    const grant=await db.authorizedSystem(founder,['admin'],c=>checkApprovalKey(c,founder,keys[0]));
    await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await requireApprovalGrant(c,founder,grant);
      return c.query("update public.admin_memberships set status='removed' where context_id=$1",[target.contextId]);
    }),'42501','A founder key alone cannot bypass reviewed execution');
    await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await requireApprovalGrant(c,founder,grant);
      await c.query("select set_config('pinevela.admin_removal_proposal_id',$1,true),set_config('pinevela.admin_removal_confirmation','DELETE',true)",[final.id]);
      return c.query("update public.admin_memberships set status='removed' where context_id=$1",[target.contextId]);
    }),'42501','SQL independently checks exact final confirmation');
    const membershipBefore=JSON.stringify((await db.pool.query('select * from public.admin_memberships order by slot')).rows);
    const eventsBefore=(await db.pool.query('select (select count(*) from public.notifications)::text as notices,(select count(*) from private.audit_events)::text as audits')).rows[0];
    await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{
      await confirmAdministratorRemoval(c,founder,grant,final.id,'REMOVE ADMINISTRATOR');
      await c.query('insert into public.notification_recipients(notification_id,context_id) values(gen_random_uuid(),$1)',[founder.contextId]);
    }),'23503','Later failure rolls back the entire removal');
    check(membershipBefore===JSON.stringify((await db.pool.query('select * from public.admin_memberships order by slot')).rows),'Rollback preserves portal membership and epoch');
    check((await read(final.id)).status==='plea-rejected'&&(await db.pool.query('select 1 from private.admin_secrets where context_id=$1',[target.contextId])).rowCount===1,'Rollback preserves consent and target keys');
    check(JSON.stringify(eventsBefore)===JSON.stringify((await db.pool.query('select (select count(*) from public.notifications)::text as notices,(select count(*) from private.audit_events)::text as audits')).rows[0]),'Rollback preserves audit and notification counts');
    const done=await Promise.allSettled([confirm(final.id),confirm(final.id),status(target)]);
    check(done.slice(0,2).filter(r=>r.status==='fulfilled').length===1&&done.slice(0,2).filter(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===409).length===1,'Concurrent final confirmation commits once');
    check(done[2].status==='fulfilled'||done[2].status==='rejected'&&done[2].reason instanceof ApiError&&done[2].reason.status===401,'Concurrent target request completes or loses authorization without a deadlock');
    check((await read(final.id)).status==='executed','Removal executed after appeal decision and founder key');
    const member=(await db.pool.query('select * from public.admin_memberships where context_id=$1',[target.contextId])).rows[0];
    check(member.status==='removed'&&Boolean(member.sessions_invalidated_at),'Removed tombstone has server invalidation epoch');
    check((await db.pool.query('select status from public.account_contexts where id=$1',[target.contextId])).rows[0].status==='closed','Only administrator portal is closed');
    check((await db.pool.query('select 1 from private.admin_secrets where context_id=$1',[target.contextId])).rowCount===0,'Removed portal keys are deleted');
    check((await db.pool.query('select count(*) from public.admin_votes where proposal_id=$1',[final.id])).rows[0].count==='4','Historic votes survive removal');
    await denied(()=>status(target),401,'Existing removed administrator session immediately loses access');
    await denied(()=>service.setActive(founder,target.contextId,{active:true,privateKey:keys[0]}),409,'Suspension controls cannot revive removed portal');
    check((await status(founder)).members.length===4,'Removed tombstone does not occupy active roster');
    await denied(()=>propose(founder,fourth),409,'Vacant roster never reduces the required removal quorum');
    const invite=new SupabaseAdminInvitations(auth);
    // A real unconfirmed historical mailbox is allowed to receive a reservation;
    // no user is fabricated and no message is sent or invitation accepted.
    const mailbox=(await db.pool.query("select email from auth.users u where not exists(select 1 from public.account_contexts c where c.auth_user_id=u.id and c.kind<>'primary') order by id limit 1")).rows[0]?.email;
    if(mailbox){const name=(await db.pool.query('select coalesce(nullif(raw_user_meta_data->>\'name\',\'\'),email) as name from auth.users where email=$1',[mailbox])).rows[0].name;
      check((await invite.create(founder,{email:mailbox,name,privateKey:keys[0]})).slot===5,'Removed slot can be privately reserved without deleting history');}
    const notice=(await db.pool.query("select id from public.notifications where title='Administrator removal executed' order by created_at desc limit 1")).rows[0].id;
    const recipients=(await db.pool.query('select context_id from public.notification_recipients where notification_id=$1',[notice])).rows.map(r=>r.context_id);
    check(recipients.length===6&&fixture.actors.every(a=>recipients.includes(a.contextId))&&recipients.includes(primaries[4].contextId),'Exact roster plus target primary receive final lifecycle notification');
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[target.sessionId,primaries[4].contextId]));
    check((await db.actor(primaries[4],c=>c.query('select id from public.notifications where id=$1',[notice]))).rowCount===1,'Primary account remains usable and sees removal notice before sub-account entry');
    await denied(()=>service.propose(primaries[4],second.contextId,{action:'remove',reason:'Primary cannot remove administrator',privateKey:keys[4]}),403,'Actual primary portal cannot perform administrator removal');
    await denied(()=>auth.switchContext(primaries[4],target.contextId),403,'Primary account cannot switch back into removed administrator portal');
    stage='restart and private boundaries';
    await db.close();db=new SupabaseDatabase(config);auth=new SupabaseAuth(db);service=new SupabaseAdminGovernance(auth);
    check((await status(founder)).changes.find((p:any)=>p.id===final.id)?.status==='executed','Removal history persists after restart');
    for(const role of ['anon','authenticated','pinevela_backend']){
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.administrator_appeals');}),'42501','Appeal table is inaccessible to browser/backend roles');
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select private.removal_execution_allowed($1)',[target.contextId]);}),'42501','Private removal functions cannot be called as public RPCs');
    }
    await db.system(async c=>{await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:target.authUserId,session_id:target.sessionId,role:'authenticated'})]);
      await c.query('set local role authenticated');check((await c.query('select * from public.admin_proposals')).rowCount===0,'Former administrator primary session cannot read governance via Data API');
    });
    check((await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
      'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest===fixture.authDigest,'All genuine Auth accounts, provider identities and session timestamps are unchanged');
  }finally{await db.close();}
},{applicationCheckpoint});console.log(JSON.stringify({passed:true,checks,isolatedRestore:true,cloudRecordsModified:0,authAccountsCreated:0,providerMocks:0}));
}catch(e:any){fs.writeFileSync(path.resolve('.security/migration-reset',backup+'.removal-test-failure.log'),String(e.stack||e),{mode:0o600});
  console.error(JSON.stringify({passed:false,checks,stage,status:e instanceof ApiError?e.status:undefined,sqlstate:/^[0-9A-Z]{5}$/.test(e?.code)?e.code:undefined,assertion:e?.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;}
