/** Real PostgreSQL cooldown scopes on isolated, genuine backed-up Google identities.
 * No cloud mutations, Auth changes, provider responses or account restoration. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {managerRegistrationRestricted,primaryManagerRegistrationRestricted,primaryManagerRegistrationRestriction,checkRegistrationRestrictionRequest} from '../supabase/registrationRestrictions.js';
import {canUploadMedia} from '../supabase/media.js';
import {reserveEnrollment} from '../supabase/enrollment.js';
dotenv.config({quiet:true});
const [backup,applicationCheckpoint]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the genuine Auth checkpoint and immutable migration-27 application checkpoint.');
let checks=0;
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,status:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof status==='number'?error instanceof ApiError&&error.status===status:error?.code===status,
    `${label}: expected ${status}, received ${error instanceof ApiError?error.status:error?.code||'success'}`);}
const fingerprint=`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
  'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
  'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
try{await withIsolatedBackup(backup,async config=>{
  const db=new SupabaseDatabase(config);
  try{
    const originalAuth=(await db.pool.query(fingerprint)).rows[0].digest;
    const {owner,otherOwner,previous,current,foreign,admin}=await db.system(async c=>{
      check((await c.query('select count(*) from private.schema_migrations')).rows[0].count==='27','Seed domain relationships before immutable enrollment guards');
      const people=(await c.query(`select u.id,u.email,s.id as session_id from auth.users u join lateral
        (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
        where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id
          and i.provider='google' and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
        order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 5`)).rows;
      check(people.length===5,'Five actual verified Google identities retain their native sessions');
      const primaries:VerifiedActor[]=[];
      for(const p of people){
        await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        primaries.push({authUserId:p.id,sessionId:p.session_id,kind:'primary',contextId:
          (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id});
      }
      const owner=primaries[0],otherOwner=primaries[1];
      const admin:VerifiedActor={...owner,kind:'admin',contextId:(await c.query(
        "insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[owner.authUserId])).rows[0].id};
      await c.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[admin.contextId]);
      const managers:VerifiedActor[]=[];
      for(const [i,parent,status] of [[2,owner,'closed'],[3,owner,'active'],[4,otherOwner,'active']] as const){
        await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[people[i].id,parent.authUserId]);
        managers.push({...primaries[i],kind:'manager',contextId:(await c.query(
          "insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager',$3) returning id",
          [people[i].id,parent.authUserId,status])).rows[0].id});
      }
      for(const a of [owner,otherOwner,...managers])await c.query(
        'insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
      const applied=(await c.query('select version,digest from private.schema_migrations')).rows;
      for(const row of applied){const file=fs.readdirSync('supabase/migrations').find(f=>f.startsWith(row.version));
        check(!!file&&crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+file)).digest('hex')===row.digest,'Applied historical hash matches its immutable source');}
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000').sort()){
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(sql);
        await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
      }
      return {owner,otherOwner,previous:managers[0],current:managers[1],foreign:managers[2],admin};
    });
    const restricted=(a:VerifiedActor)=>db.system(c=>managerRegistrationRestricted(c,a.contextId));
    const ownerRestricted=(a:VerifiedActor)=>db.system(c=>primaryManagerRegistrationRestricted(c,a.authUserId));
    const readRestriction=(a:VerifiedActor=owner)=>db.authorizedSystem(a,['primary'],c=>primaryManagerRegistrationRestriction(c,a));
    const upload=(a:VerifiedActor)=>db.authorizedSystem(a,['manager'],c=>canUploadMedia(c,a,'hostel'));
    // Enrollment validates saved owner and cooldown before existing-account/email
    // checks. Use the actual saved manager mailbox, never a fictitious Auth subject.
    const person=(await db.pool.query('select email,display_name,phone from public.profiles where id=$1',[current.authUserId])).rows[0];
    const reserve=()=>db.authorizedSystem(owner,['primary'],c=>reserveEnrollment(c,owner,
      {kind:'manager',email:person.email,name:person.display_name,phone:person.phone||'',password:crypto.randomBytes(32).toString('base64url')},crypto.randomBytes(32).toString('hex')));
    async function withBan(contextId:string,kind:'residence'|'manager_account'|'seller_account',expired:boolean,work:(id:string)=>Promise<void>,duration='1 day'){
      const id=(await db.system(c=>c.query(`insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id)
        values($1,$2,clock_timestamp()+$3::interval,'Isolated native cooldown boundary verification',$4) returning id`,
        [contextId,kind,expired?'-1 second':duration,admin.contextId]))).rows[0].id;
      try{await work(id);}finally{await db.system(c=>c.query('delete from public.registration_bans where id=$1',[id]));}
    }
    check(!(await restricted(current))&&!(await restricted(foreign))&&!(await ownerRestricted(owner)),'Unrestricted actual managers and owners remain eligible');
    await upload(current);check(true,'Real active manager session can reserve housing photographs');
    await denied(()=>upload(previous),401,'Closed previous manager cannot use its still-existing Auth session');
    await denied(()=>reserve(),409,'Existing active manager cannot bypass enrollment uniqueness');
    await withBan(current.contextId,'residence',false,async()=>{
      check(await restricted(current),'Residence cooldown targets the exact saved manager');
      check(!(await restricted(previous))&&!(await restricted(foreign)),'Residence cooldown does not target a predecessor or another owner');
      check(!(await ownerRestricted(owner)),'Residence cooldown does not become a primary-owner manager-account ban');
      await denied(()=>upload(current),403,'Authenticated target manager cannot reserve a housing photograph during cooldown');
      await upload(foreign);check(true,'An unrelated actual manager can still reserve housing photographs');
      await denied(()=>reserve(),409,'A residence cooldown does not change primary enrollment into an owner ban');
    });
    await withBan(previous.contextId,'residence',false,async()=>{
      check(await restricted(previous),'Closed predecessor retains its own residence cooldown history');
      check(!(await restricted(current)),'Predecessor residence cooldown does not spread to a replacement manager with the same owner');
      await upload(current);check(true,'Replacement manager retains authorized housing-media access');
    });
    await withBan(owner.contextId,'manager_account',false,async()=>{
      check(await ownerRestricted(owner),'Combined-removal cooldown belongs to the primary owner');
      check(await restricted(current)&&await restricted(previous),'Owner manager-account cooldown applies to its saved managers');
      check(!(await ownerRestricted(otherOwner))&&!(await restricted(foreign)),'Owner cooldown cannot cross into another primary owner');
      await denied(()=>upload(current),403,'Owner cooldown blocks the linked manager housing-media workflow');
      await denied(()=>reserve(),403,'Owner cooldown prevents a new manager enrollment before other eligibility checks');
    });
    for(const [id,kind] of [[current.contextId,'residence'],[owner.contextId,'manager_account']] as const)
      await withBan(id,kind,true,async()=>{
        check(!(await restricted(current))&&!(await ownerRestricted(owner)),'Native expired cooldown no longer restricts registration');
        await upload(current);check(true,'Actual session regains housing upload eligibility after expiry');
      });
    await withBan(owner.contextId,'seller_account',false,async()=>{
      check(!(await restricted(current))&&!(await ownerRestricted(owner)),'Seller-account cooldown never becomes a manager restriction');
      await upload(current);check(true,'Seller cooldown preserves manager housing-media eligibility');
    });
    const empty=await readRestriction();
    check(empty.restriction===null&&Number.isFinite(new Date(empty.serverTime).getTime()),'Unrestricted primary read returns null with a real server clock');
    await withBan(current.contextId,'residence',false,async()=>{
      check((await readRestriction()).restriction===null,'Current manager residence cooldown does not become a primary manager-creation cooldown');
    });
    await withBan(previous.contextId,'residence',false,async id=>{
      const own=await readRestriction();
      check(own.restriction?.id===id&&own.restriction.kind==='residence','Primary can read its closed manager residence cooldown through the exact saved owner relationship');
      check((await readRestriction(otherOwner)).restriction===null,'Closed manager cooldown cannot leak to another verified primary owner');
      check(await ownerRestricted(owner),'Owner read agrees with native write gate for closed manager re-entry');
    });
    await withBan(owner.contextId,'manager_account',false,async shorter=>{
      await withBan(previous.contextId,'residence',false,async longer=>{
        const rowsBefore=(await db.pool.query('select jsonb_agg(to_jsonb(b)order by id)as rows from public.registration_bans b')).rows[0].rows;
        const noticesBefore=(await db.pool.query('select(select count(*)from public.notifications)as notices,(select count(*)from private.audit_events)as audits')).rows[0];
        const own=await readRestriction(),detail=own.restriction!;
        check(detail.id===longer&&detail.kind==='residence'&&detail.id!==shorter,'Overlapping cooldown read chooses the actual latest expiry rather than first match');
        check(detail.remainingSeconds>2*86400&&detail.remainingSeconds<=3*86400,'Countdown uses the actual variable three-day ban, not a hardcoded duration');
        check(Math.abs(detail.remainingSeconds-Math.ceil((new Date(detail.expiresAt).getTime()-new Date(own.serverTime).getTime())/1000))<=1,'Expiry and remaining time share the same native clock sample');
        check(Object.keys(detail).sort().join(',')==='expiresAt,id,kind,reason,remainingSeconds','DTO exposes only current own cooldown fields');
        const encoded=JSON.stringify(own);
        check(!/auth_user_id|session_id|primary_owner|token|password|key_hash|imposed_by|userEmail|deletedAt|deletedManagerEmail/.test(encoded),'Read excludes credentials, other identity contacts and invented legacy deletion metadata');
        const direct=(await db.actor(owner,c=>c.query('select id from public.registration_bans order by id'))).rows;
        check(direct.some(r=>r.id===shorter)&&!direct.some(r=>r.id===longer),'Browser RLS remains exact-context scoped while authorized owner read derives the closed manager relationship');
        check((await readRestriction(otherOwner)).restriction===null,'Foreign primary has no inherited access through email or another manager identity');
        const again=new SupabaseDatabase(config);try{
          check((await again.authorizedSystem(owner,['primary'],c=>primaryManagerRegistrationRestriction(c,owner))).restriction?.id===longer,'Native cooldown read survives backend pool restart');
        }finally{await again.close();}
        assert.deepEqual((await db.pool.query('select jsonb_agg(to_jsonb(b)order by id)as rows from public.registration_bans b')).rows[0].rows,rowsBefore);checks++;
        assert.deepEqual((await db.pool.query('select(select count(*)from public.notifications)as notices,(select count(*)from private.audit_events)as audits')).rows[0],noticesBefore);checks++;
      },'3 days');
    });
    await withBan(otherOwner.contextId,'manager_account',false,async id=>{
      check((await readRestriction()).restriction===null&&(await readRestriction(otherOwner)).restriction?.id===id,'A foreign owner ban is visible only to its actual verified owner');
    });
    for(const [context,kind]of [[owner.contextId,'manager_account'],[previous.contextId,'residence']]as const)
      await withBan(context,kind,true,async id=>{
        check((await readRestriction()).restriction===null,'Expired own registration cooldown no longer appears as active');
        check((await db.pool.query('select id from public.registration_bans where id=$1',[id])).rowCount===1,'Expired read retains immutable native cooldown history');
      });
    await withBan(owner.contextId,'seller_account',false,async()=>{
      check((await readRestriction()).restriction===null,'Unrelated seller cooldown is excluded from manager onboarding response');
    });
    await withBan(owner.contextId,'manager_account',false,async()=>{
      check((await readRestriction()).restriction===null,'Zero-duration deadline is expired at the native read boundary');
    },'0 seconds');
    await withBan(owner.contextId,'manager_account',false,async id=>{
      check((await readRestriction()).restriction?.id===id,'Actual short cooldown is initially active');
      await new Promise(resolve=>setTimeout(resolve,1200));
      check((await readRestriction()).restriction===null&&!(await ownerRestricted(owner)),'Natural native expiry clears both read status and write restriction without a client waiver');
      check((await db.pool.query('select id from public.registration_bans where id=$1',[id])).rowCount===1,'Natural expiry preserves historical cooldown row');
    },'1 second');
    await denied(()=>readRestriction({...owner,sessionId:otherOwner.sessionId}),401,'Foreign genuine provider session cannot impersonate primary cooldown owner');
    await denied(()=>readRestriction({...owner,contextId:otherOwner.contextId}),401,'Foreign primary context cannot be paired with owner native session');
    await denied(()=>readRestriction({...current,kind:'primary'}),401,'Client role spoof cannot turn an actual manager binding into primary read access');
    await denied(()=>db.authorizedSystem(current,['manager'],c=>primaryManagerRegistrationRestriction(c,current)),403,'Genuine manager portal cannot substitute for primary onboarding access');
    await denied(()=>db.authorizedSystem(previous,['manager'],c=>primaryManagerRegistrationRestriction(c,previous)),401,'Closed portal and retained provider session cannot access owner cooldown read');
    await denied(()=>db.authorizedSystem(owner,['primary'],c=>primaryManagerRegistrationRestriction(c,{...owner,authUserId:otherOwner.authUserId})),403,'Helper independently rejects another subject even in an otherwise authorized transaction');
    const auth=new SupabaseAuth(db),realAdmin=await auth.switchContext(owner,admin.contextId);
    try{await denied(()=>db.authorizedSystem(realAdmin,['admin'],c=>primaryManagerRegistrationRestriction(c,realAdmin)),403,'Real administrator context cannot read primary onboarding cooldown by inherited privilege');}
    finally{await auth.switchContext(realAdmin,owner.contextId);}
    const request=(query:Record<string,unknown>={},body:unknown=undefined,headers:Record<string,string|undefined>={})=>({query,body,headers})as Parameters<typeof checkRegistrationRestrictionRequest>[1];
    checkRegistrationRestrictionRequest(owner,request());check(true,'Owner request accepts absent optional context header');
    checkRegistrationRestrictionRequest(owner,request({}, {}, {'x-pinevela-account-context':owner.contextId}));check(true,'Exact current context header and empty body are accepted');
    for(const selectors of [{userId:otherOwner.authUserId},{managerId:foreign.contextId},{email:'identity-selection-is-not-authority'},{unknown:'ignored-selector'}])
      await denied(()=>Promise.resolve(checkRegistrationRestrictionRequest(owner,request(selectors))),400,'Request rejects every query selector rather than using it for ownership');
    await denied(()=>Promise.resolve(checkRegistrationRestrictionRequest(owner,request({}, {userId:owner.authUserId}))),400,'GET body cannot smuggle identity selectors');
    await denied(()=>Promise.resolve(checkRegistrationRestrictionRequest(owner,request({},undefined,{'x-pinevela-account-context':otherOwner.contextId}))),409,'Stale or cross-account context header triggers refresh denial');
    await denied(()=>Promise.resolve(checkRegistrationRestrictionRequest(current,request())),403,'Request parser rejects non-primary portal roles');
    await denied(()=>restricted(owner),404,'A primary context cannot be treated as a saved manager');
    await denied(()=>db.system(c=>managerRegistrationRestricted(c,crypto.randomUUID())),404,'A fabricated context UUID cannot become a saved manager');
    for(const role of ['anon','authenticated','pinevela_backend'])await denied(()=>db.system(async c=>{
      await c.query('set local role '+role);return c.query(`insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id)
        values($1,'residence',clock_timestamp()+interval '1 day','Denied direct-role mutation',$2)`,[current.contextId,admin.contextId]);
    }),'42501','Browser/backend actor role cannot invent a registration cooldown');
    check((await db.pool.query('select count(*) from public.registration_bans')).rows[0].count==='0','Isolated test cooldowns are removed after each actual transaction');
    check((await db.pool.query(fingerprint)).rows[0].digest===originalAuth,'Genuine Auth users, identities and sessions remain byte-equivalent');
  }finally{await db.close();}
},{applicationCheckpoint});
const report={checks,passed:true,genuineAuthUnchanged:true,cloudRecordsModified:0,providerResponsesFabricated:0,isolatedNative:true};
fs.writeFileSync('.security/migration-reset/registration-restrictions-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));
}catch(error){
  const diagnostic='.security/migration-reset/'+crypto.randomUUID()+'.registration-restrictions-failure.log';
  const fd=fs.openSync(diagnostic,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{fs.writeFileSync(fd,error instanceof Error?error.stack||error.message:'Native verification failed.');}finally{fs.closeSync(fd);}
  console.error(JSON.stringify({checks,passed:false,cloudRecordsModified:0,diagnostic}));process.exitCode=1;
}
