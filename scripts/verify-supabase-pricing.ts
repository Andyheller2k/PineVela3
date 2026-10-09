/** Real Google subjects and generated private credentials in an isolated restore.
 * No provider/JWT/Auth-session fabrication or cloud fixture commits. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {SupabasePricing,pricingProposals,proposePricing} from '../supabase/pricing.js';
import {checkAdministratorSettingsKey,requireSettingsGrant,SupabaseAdministratorSettings} from '../supabase/adminSettings.js';
import {publicPlatformSettings,pricingSettings} from '../platformSettings.js';
dotenv.config({quiet:true});const id=process.argv[2];if(!id)throw new Error('Pass the encrypted migration-27 checkpoint UUID.');
let checks=0;function check(value:unknown,label:string){assert.ok(value,label);checks++;}
async function denied(work:()=>Promise<unknown>,status:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}
  check(typeof status==='number'?e instanceof ApiError && e.status===status:e?.code===status,label);}
try{await withIsolatedBackup(id,async config=>{
  let db=new SupabaseDatabase(config);
  try{
    const fixture=await db.system(async c=>{
      const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
      check(ledger.size===27,'Key fixtures begin before fresh-enrollment guards, using the preserved checkpoint');
      for(const [version,digest] of ledger){const file=fs.readdirSync('supabase/migrations').find(f=>f.startsWith(version));check(file && crypto.createHash('sha256').update(fs.readFileSync(path.join('supabase/migrations',file))).digest('hex')===digest,'Historical migration is immutable');}
      check((await c.query('select count(*) from public.profiles')).rows[0].count==='0','No production accounts were backfilled');
      const people=(await c.query(`select distinct on(u.id) u.id,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
        join auth.identities i on i.user_id=u.id and i.provider='google' where u.email_confirmed_at is not null and not u.is_anonymous
        and (s.not_after is null or s.not_after>now()) order by u.id,s.created_at desc limit 4`)).rows;
      check(people.length===4,'Four real confirmed Google subjects available');
      const actors:VerifiedActor[]=[],keys:string[]=[],approvalKeys:string[]=[];let primary:VerifiedActor|undefined;
      for(const [i,p] of people.entries()){
        await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        const contextId=(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[p.id])).rows[0].id;
        const a={authUserId:p.id,sessionId:p.session_id,contextId,kind:'admin'};actors.push(a);
        await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[contextId,i+1]);
        const key=crypto.randomBytes(32).toString('base64url'),approval=crypto.randomBytes(32).toString('base64url');keys.push(key);approvalKeys.push(approval);
        await c.query('insert into private.admin_secrets(context_id,settings_key_hash,settings_enrolled_at,approval_key_hash,approval_enrolled_at) values($1,$2,now(),$3,now())',
          [contextId,await hashCredentialAsync(`settings:${contextId}:${key}`),await hashCredentialAsync(`approval:${contextId}:${approval}`)]);
        await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
        if(i===3)primary={...a,contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id,kind:'primary'};
      }
      let expiredId='';
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_.*\.sql$/.test(f)).sort()){
        if(ledger.has(file.slice(0,14)))continue;
        if(file.startsWith('20261010000000')){
          const roster=(await c.query(`select jsonb_agg(jsonb_build_object('id',m.context_id,'slot',m.slot,'name',coalesce(nullif(p.display_name,''),p.email)) order by m.slot) as roster
            from public.admin_memberships m join public.account_contexts x on x.id=m.context_id join public.profiles p on p.id=x.auth_user_id`)).rows[0].roster;
          const before=pricingSettings(publicPlatformSettings({}));
          expiredId=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,preview,baseline_digest,reason,quorum,status,created_at,expires_at)
            values('pricing',$1,$2,'0:0','Expired pricing review',3,'expired',now()-interval '2 days',now()-interval '1 day') returning id`,
            [actors[0].contextId,JSON.stringify({before,prices:{...before,registrationFee:before.registrationFee+1},roster})])).rows[0].id;
        }
        const sql=fs.readFileSync(path.join('supabase/migrations',file),'utf8');await c.query(sql);
        await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
      }
      return {actors,keys,approvalKeys,primary:primary!,expiredId};
    });
    const [founder,second,third,fourth]=fixture.actors,{keys,approvalKeys,primary}=fixture;
    let pricing=new SupabasePricing(new SupabaseAuth(db));
    const live=async()=>publicPlatformSettings({platformSettings:(await db.pool.query("select value from private.platform_settings where key='platform'")).rows[0]?.value});
    const list=()=>db.authorizedSystem(founder,['admin'],c=>pricingProposals(c,founder));
    const view=async(id:string)=>(await list()).find(p=>p.id===id)!;
    const quote=async(increase=1)=>({...pricingSettings(await live()),registrationFee:(await live()).registrationFee+increase});
    const propose=(a:VerifiedActor,key:string,prices:any,reason='Review the registration fee')=>pricing.propose(a,{settingsKey:key,prices,reason});
    const vote=(a:VerifiedActor,key:string,id:string,decision='approved')=>pricing.vote(a,id,{settingsKey:key,decision});
    const apply=(a:VerifiedActor,key:string,id:string)=>pricing.apply(a,id,{settingsKey:key});
    const defaultPrices=pricingSettings(await live());
    await denied(()=>vote(second,keys[1],fixture.expiredId),409,'An expired real-timestamp proposal cannot receive a new vote');
    await denied(()=>apply(founder,keys[0],fixture.expiredId),409,'An expired proposal cannot change current prices');
    check((await view(fixture.expiredId)).status==='expired','Closed history retains its expired state');
    await denied(()=>propose(founder,approvalKeys[0],{...defaultPrices,registrationFee:51}),403,'Approval key cannot authorize a pricing proposal');
    check((await db.pool.query('select settings_failed_attempts from private.admin_secrets where context_id=$1',[founder.contextId])).rows[0].settings_failed_attempts===1,'Bad key attempts commit despite HTTP service denial');
    await denied(()=>pricing.propose(founder,{settingsKey:keys[0],prices:{...defaultPrices,registrationFee:51},reason:'Review pricing',createdBy:second.contextId}),400,'Proposer identity cannot be supplied');
    await denied(()=>propose(founder,keys[0],{...defaultPrices,registrationFee:-1}),400,'Negative pricing rejected');
    await denied(()=>propose(founder,keys[0],{...defaultPrices,semesterFee:0.001}),400,'Invalid fractional fee rejected');
    await denied(()=>propose(founder,keys[0],{...defaultPrices,subscriptionPrices:{...defaultPrices.subscriptionPrices,extra:1}}),400,'Unknown plan price rejected');
    await denied(()=>propose(founder,keys[0],defaultPrices),400,'No-op proposal rejected');
    await denied(()=>propose(founder,keys[0],{...defaultPrices,registrationFee:51},'x'),400,'A meaningful reason is required');
    const p=await propose(founder,keys[0],await quote());
    const decimal=await propose(second,keys[1],{...defaultPrices,registrationFee:51.1+1e-12});
    check((await view(decimal.id)).prices.registrationFee===51.1,'Accepted JavaScript rounding noise is canonicalized to exact monetary cents');
    const pending=await view(p.id);
    check(pending.status==='pending' && pending.votes.length===1 && pending.votes[0].id===founder.contextId,'Proposer contributes exactly one approval');
    check(new Date(pending.expiresAt).getTime()-new Date(pending.createdAt).getTime()===86400000,'Server assigns an immutable 24-hour deadline');
    check(JSON.stringify(pricingSettings(await live()))===JSON.stringify(defaultPrices),'Proposal does not change live pricing');
    check(!JSON.stringify(pending).includes(keys[0]) && !JSON.stringify(pending).includes('settings_key_version'),'Public proposal DTO contains no key grants');
    await denied(()=>apply(founder,keys[0],p.id),409,'Founder cannot apply a single approval');
    await denied(()=>vote(founder,keys[0],p.id),409,'Proposer cannot vote twice');
    await vote(second,keys[1],p.id);
    await denied(()=>apply(founder,keys[0],p.id),409,'Two approvals are insufficient');
    await vote(third,keys[2],p.id);
    check((await view(p.id)).status==='approved','Three actual distinct approvals make the proposal ready');
    check((await live()).registrationFee===defaultPrices.registrationFee,'Approved proposal still does not change prices');
    await denied(()=>apply(second,keys[1],p.id),403,'Non-founder cannot make the final push');
    await denied(async()=>pricing.apply(founder,p.id,{settingsKey:keys[0],prices:await quote(10)}),400,'Final push cannot replace the approved values');
    const competitor=await propose(second,keys[1],await quote(2));
    await db.system(c=>c.query(`insert into private.platform_settings(key,value) values('platform',$1)
      on conflict(key) do update set value=private.platform_settings.value||excluded.value`,[JSON.stringify({announcement:'',contactDetails:{linkedinUrl:'',facebookUrl:'',tiktokUrl:'',whatsappNumber:''}})]));
    await new SupabaseAdministratorSettings(new SupabaseAuth(db)).setReceivingAccount(founder,{code:'',settingsKey:keys[0]});
    check((await view(p.id)).status==='approved','Non-pricing configuration does not invalidate approvals');
    await db.system(c=>c.query('update public.profiles set display_name=upper(display_name) where id=$1',[second.authUserId]));
    check((await view(p.id)).status==='approved','Display-name changes preserve the actual membership approval');
    const oldRaw=(await db.pool.query("select value from private.platform_settings where key='platform'")).rows[0].value;
    await db.close();db=new SupabaseDatabase(config);pricing=new SupabasePricing(new SupabaseAuth(db));
    check((await view(p.id)).status==='approved','Approved proposal and votes persist across runtime restart');
    const applied=await apply(founder,keys[0],p.id);
    check(applied.success && applied.status==='applied' && applied.settings.registrationFee===defaultPrices.registrationFee+1,'Founder applies exactly the approved pricing');
    const newRaw=(await db.pool.query("select value from private.platform_settings where key='platform'")).rows[0].value;
    check(JSON.stringify(newRaw.paystackSettlement)===JSON.stringify(oldRaw.paystackSettlement) && JSON.stringify(newRaw.contactDetails)===JSON.stringify(oldRaw.contactDetails),'Pricing execution preserves destination and contact details');
    check((await view(competitor.id)).status==='invalidated','Applying one proposal invalidates other pending baselines');
    await denied(()=>apply(founder,keys[0],p.id),409,'Final push cannot execute twice');
    await denied(()=>vote(fourth,keys[3],p.id),409,'Completed proposal cannot receive new votes');
    await denied(()=>db.system(c=>c.query('update public.admin_proposals set preview=preview||$2 where id=$1',[p.id,JSON.stringify({prices:defaultPrices})])),'42501','SQL prevents editing reviewed values');
    await denied(()=>db.system(c=>c.query('update public.admin_proposals set expires_at=now() where id=$1',[p.id])),'42501','SQL prevents editing the deadline');
    await denied(()=>db.system(c=>c.query("update public.admin_proposals set status='pending' where id=$1",[p.id])),'42501','Completed history cannot be reopened');
    await denied(()=>db.system(c=>c.query('delete from public.admin_proposals where id=$1',[p.id])),'42501','Pricing history cannot be deleted');
    await denied(()=>db.system(c=>c.query("update public.admin_votes set decision='rejected' where proposal_id=$1",[p.id])),'42501','Votes cannot be edited');
    await denied(()=>db.system(c=>c.query('delete from public.admin_votes where proposal_id=$1',[p.id])),'42501','Votes cannot be deleted');
    await denied(()=>db.system(c=>c.query('select private.apply_approved_pricing($1)',[p.id])),'42501','SQL execution requires the real founder settings grant');
    const noFounderVote=await propose(second,keys[1],await quote(3));await vote(third,keys[2],noFounderVote.id);await vote(fourth,keys[3],noFounderVote.id);
    check((await view(noFounderVote.id)).status==='approved','Three other administrators may approve without a founder vote');
    await apply(founder,keys[0],noFounderVote.id);check((await view(noFounderVote.id)).appliedBy===founder.contextId,'Founder final execution remains mandatory even without a founder vote');
    const fail=await propose(founder,keys[0],await quote(4));await vote(second,keys[1],fail.id,'rejected');
    check((await view(fail.id)).status==='pending','One rejection with four administrators still permits three approvals');
    await vote(third,keys[2],fail.id,'rejected');check((await view(fail.id)).status==='rejected','Impossible quorum closes the proposal');
    await denied(()=>apply(founder,keys[0],fail.id),409,'Rejected proposal cannot execute');
    const changed=await propose(founder,keys[0],await quote(5));
    const prior=(await db.pool.query("select value from private.platform_settings where key='platform'")).rows[0].value;
    await db.system(c=>c.query("update private.platform_settings set value=value||$1 where key='platform'",[JSON.stringify({registrationFee:prior.registrationFee+1})]));
    await db.system(c=>c.query("update private.platform_settings set value=$1 where key='platform'",[JSON.stringify(prior)]));
    check((await view(changed.id)).status==='invalidated','Changing prices away and back cannot revive old approvals');
    const rosterChange=await propose(founder,keys[0],await quote(6));
    await db.system(c=>c.query("update public.admin_memberships set status='suspended' where context_id=$1",[fourth.contextId]));
    await db.system(c=>c.query("update public.admin_memberships set status='active' where context_id=$1",[fourth.contextId]));
    check((await view(rosterChange.id)).status==='invalidated','Changing membership away and back invalidates the baseline');
    const guess=await propose(founder,keys[0],await quote(7));
    await denied(()=>vote(second,keys[0],guess.id),403,'A foreign settings key cannot record a vote');
    check((await view(guess.id)).status==='pending','A failed guess does not change the membership revision');
    const grant=await db.authorizedSystem(second,['admin'],c=>checkAdministratorSettingsKey(c,second,keys[1]));
    await denied(()=>db.authorizedSystem(second,['admin'],async c=>{await requireSettingsGrant(c,second,grant);return c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[guess.id,third.contextId]);}),'42501','SQL rejects a voter identity different from the authenticated key owner');
    await denied(()=>db.authorizedSystem(founder,['admin'],c=>proposePricing(c,founder,grant,defaultPrices,'Review pricing')) ,403,'A key grant cannot transfer between administrators');
    const left=await propose(second,keys[1],await quote(8)),right=await propose(third,keys[2],await quote(9));
    await vote(founder,keys[0],left.id);await vote(third,keys[2],left.id);await vote(founder,keys[0],right.id);await vote(second,keys[1],right.id);
    const concurrent=await Promise.allSettled([apply(founder,keys[0],left.id),apply(founder,keys[0],right.id)]);
    check(concurrent.filter(r=>r.status==='fulfilled').length===1 && concurrent.filter(r=>r.status==='rejected' && r.reason instanceof ApiError && r.reason.status===409).length===1,'Competing final pushes serialize to one execution');
    check(['applied','invalidated'].includes((await view(left.id)).status) && (await view(left.id)).status!==(await view(right.id)).status,'The losing proposal is durably invalidated');
    const keyChange=await propose(second,keys[1],await quote(10));
    await db.system(c=>c.query('delete from private.admin_secrets where context_id=$1',[fourth.contextId]));
    check((await view(keyChange.id)).status==='invalidated','Removing an enrolled key invalidates existing approvals');
    pricing=new SupabasePricing(new SupabaseAuth(db));
    await db.system(c=>c.query("update private.platform_settings set value=value||$1 where key='platform'",[JSON.stringify({commission:1})]));
    const capped=[];for(let i=0;i<10;i++)capped.push(await propose(founder,keys[0],await quote(20+i)));
    await denied(async()=>propose(founder,keys[0],await quote(40)),429,'The ten-live-proposal limit is enforced transactionally');
    check(Number((await db.pool.query("select count(*) from public.admin_proposals where kind='pricing' and status in ('pending','approved')")).rows[0].count)===10,'Capacity denial does not create another proposal');
    await denied(()=>db.system(c=>c.query("update private.platform_settings set value=value||'{\"registrationFee\":-1}'::jsonb where key='platform'")),'23514','SQL rejects invalid private pricing');
    for(const role of ['anon','authenticated','pinevela_backend']){
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query("update public.admin_proposals set status='executed'");}),'42501',role+' cannot write proposal status');
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select private.apply_approved_pricing($1)',[capped[0].id]);}),'42501',role+' cannot execute privileged pricing function');
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.admin_pricing_state');}),'42501',role+' cannot read private pricing authorization state');
    }
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary.sessionId,primary.contextId]));
    await denied(async()=>propose(primary,keys[3],await quote(42)),403,'An active primary account cannot submit pricing');
    check((await db.actor(primary,c=>c.query("select id from public.admin_proposals where kind='pricing'"))).rowCount===0,'RLS hides proposals from primary users');
    check(((await db.actor(third,c=>c.query("select id from public.admin_proposals where kind='pricing'"))).rowCount || 0)>0,'RLS permits active administrator proposal reads');
    const leaks=(await db.pool.query(`select count(*) from public.notifications where message like '%scrypt%' or message like '%settings_key_version%'`)).rows[0].count;
    check(leaks==='0','Notifications contain no private key metadata');
    check((await db.pool.query('select count(*) from public.notification_recipients where context_id=$1',[primary.contextId])).rows[0].count==='0','Pricing notifications target administrators, not primary users');
    check((await db.pool.query("select count(*) from public.notifications where category='admin_settings' and title='Pricing proposal executed'")).rows[0].count==='3','Each successful execution emits exactly one applied notice');
    check((await db.pool.query('select count(*) from auth.users')).rows[0].count==='5','No Auth identities were created');
  }finally{await db.close();}
});console.log(JSON.stringify({checks,passed:true,isolatedRestore:true,providerMocks:0,cloudRecordsModified:0,authAccountsCreated:0}));
}catch(e:any){console.error(JSON.stringify({checks,passed:false,status:e instanceof ApiError?e.status:undefined,sqlstate:/^[0-9A-Z]{5}$/.test(e?.code)?e.code:undefined,assertion:e?.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;}
