/** Rollback-only cloud DDL rehearsal. Existing real Google subjects; no key,
 * Auth session or provider response is fabricated to bypass fresh enrollment. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {pricingProposals} from '../supabase/pricing.js';
import {pricingSettings,publicPlatformSettings} from '../platformSettings.js';
dotenv.config({quiet:true});const db=new SupabaseDatabase(),rollback=new Error('Pricing rehearsal rollback');let checks=0;
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
const inventory=async()=>(await db.pool.query(`select (select count(*) from auth.users) as users,(select count(*) from auth.sessions) as sessions,
  (select count(*) from public.profiles) as profiles,(select count(*) from public.admin_proposals) as proposals,
  (select count(*) from private.schema_migrations) as migrations`)).rows[0];
try{
  const before=await inventory();
  try{await db.system(async c=>{
    check(!(await c.query("select version from private.schema_migrations where version='20261010000000'")).rowCount,'Migration remains a draft');
    const people=(await c.query(`select distinct on(u.id) u.id,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
      join auth.identities i on i.user_id=u.id and i.provider='google' where u.email_confirmed_at is not null and not u.is_anonymous
      and (s.not_after is null or s.not_after>now()) order by u.id,s.created_at desc limit 3`)).rows;
    check(people.length===3,'Real confirmed Google subjects available');const actors:VerifiedActor[]=[];let primary:VerifiedActor|undefined;
    for(const [i,p] of people.entries()){
      await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
      const id=(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[p.id])).rows[0].id;
      const a={authUserId:p.id,sessionId:p.session_id,contextId:id,kind:'admin'};actors.push(a);
      await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[id,i+1]);
      await c.query('insert into private.admin_secrets(context_id) values($1)',[id]);
      await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
      if(i===0)primary={...a,contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id,kind:'primary'};
    }
    const beforePrices=pricingSettings(publicPlatformSettings({})),newPrices={...beforePrices,registrationFee:beforePrices.registrationFee+1};
    const roster=(await c.query(`select jsonb_agg(jsonb_build_object('id',m.context_id,'slot',m.slot,'name',coalesce(nullif(p.display_name,''),p.email)) order by m.slot) as roster
      from public.admin_memberships m join public.account_contexts x on x.id=m.context_id join public.profiles p on p.id=x.auth_user_id`)).rows[0].roster;
    const p=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,preview,baseline_digest,reason,quorum,expires_at)
      values('pricing',$1,$2,'0:0','Review pricing protocol',3,now()+interval '24 hours') returning id`,[actors[0].contextId,JSON.stringify({before:beforePrices,prices:newPrices,roster})])).rows[0];
    await c.query(fs.readFileSync('supabase/migrations/20261010000000_shared_pricing_governance.sql','utf8'));
    await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actors[0].authUserId,session_id:actors[0].sessionId,role:'authenticated'})]);
    async function denied(work:()=>Promise<unknown>,expected:string,label:string){await c.query('savepoint negative');let e:any;try{await work();}catch(error){e=error;}await c.query('rollback to savepoint negative');check(e?.code===expected,label);}
    check((await c.query('select private.valid_pricing($1) as valid',[JSON.stringify(beforePrices)])).rows[0].valid,'SQL accepts actual configured defaults');
    check(!(await c.query('select private.valid_pricing($1) as valid',[JSON.stringify({...beforePrices,registrationFee:-1})])).rows[0].valid,'SQL rejects negative prices');
    check(!(await c.query('select private.pricing_roster_ready() as ready')).rows[0].ready,'Unenrolled administrators cannot approve pricing');
    check((await pricingProposals(c,actors[0]))[0].status==='invalidated','Pre-protocol proposals are preserved but cannot become new approvals');
    await denied(()=>c.query("update public.admin_proposals set status='pending' where id=$1",[p.id]),'42501','Old invalidated decision cannot be reopened');
    await denied(()=>c.query('select private.apply_approved_pricing($1)',[p.id]),'42501','Founder without an enrolled settings key cannot apply');
    const version=(await c.query('select settings_key_version from private.admin_secrets where context_id=$1',[actors[0].contextId])).rows[0].settings_key_version;
    await c.query("select set_config('pinevela.settings_key_version',$1,true)",[version]);
    await denied(()=>c.query('select private.apply_approved_pricing($1)',[p.id]),'42501','A version alone cannot substitute for enrolled settings authorization');
    await denied(()=>c.query(`insert into public.admin_proposals(kind,proposer_context_id,preview,baseline_digest,reason,quorum,expires_at,pricing_roster_revision,pricing_revision)
      values('pricing',$1,$2,'0:0','Review pricing',3,now()+interval '24 hours',0,0)`,[actors[0].contextId,JSON.stringify({before:beforePrices,prices:newPrices,roster})]),'42501','SQL denies proposals without a verified settings-key grant');
    await denied(()=>c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[p.id,actors[0].contextId]),'42501','Invalidated proposal cannot receive a forged vote');
    const originalRevision=(await c.query('select roster_revision from private.admin_pricing_state')).rows[0].roster_revision;
    await c.query("update public.admin_memberships set status='suspended' where context_id=$1",[actors[2].contextId]);
    await c.query("update public.admin_memberships set status='active' where context_id=$1",[actors[2].contextId]);
    check(BigInt((await c.query('select roster_revision from private.admin_pricing_state')).rows[0].roster_revision)===BigInt(originalRevision)+2n,'Membership revisions cannot disappear when changes are undone');
    await c.query("insert into private.platform_settings(key,value) values('platform',$1)",[JSON.stringify(newPrices)]);
    await c.query("update private.platform_settings set value=$1 where key='platform'",[JSON.stringify(beforePrices)]);
    check((await c.query('select pricing_revision from private.admin_pricing_state')).rows[0].pricing_revision==='2','Trusted policy changes advance the pricing revision');
    await denied(()=>c.query("update private.platform_settings set value=value||'{\"semesterFee\":-1}'::jsonb where key='platform'"),'23514','SQL rejects invalid private policy values');
    for(const role of ['anon','authenticated','pinevela_backend']){
      await denied(async()=>{await c.query('set local role '+role);return c.query('select private.apply_approved_pricing($1)',[p.id]);},'42501',role+' cannot call privileged execution');
      await denied(async()=>{await c.query('set local role '+role);return c.query('select * from private.admin_pricing_state');},'42501',role+' cannot read pricing state');
      await denied(async()=>{await c.query('set local role '+role);return c.query("update public.admin_proposals set status='executed'");},'42501',role+' cannot write proposal state');
      await denied(async()=>{await c.query('set local role '+role);return c.query("update private.platform_settings set value='{}'");},'42501',role+' cannot write prices directly');
    }
    await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary!.sessionId,primary!.contextId]);
    await c.query('set local role pinevela_backend');check((await c.query('select id from public.admin_proposals')).rowCount===0,'RLS hides pricing history from primary users');await c.query('reset role');
    throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
  assert.deepEqual(await inventory(),before);checks++;
  check((await db.pool.query("select to_regclass('private.admin_pricing_state') is null as rolled_back")).rows[0].rolled_back,'All rehearsal DDL rolled back');
  console.log(JSON.stringify({checks,passed:true,cloudFixtureCommitted:false,authAccountsCreated:0,providerMocks:0}));
}catch(e:any){console.error(JSON.stringify({checks,passed:false,status:e instanceof ApiError?e.status:undefined,sqlstate:/^[0-9A-Z]{5}$/.test(e?.code)?e.code:undefined,assertion:e?.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;}
finally{await db.close();}
