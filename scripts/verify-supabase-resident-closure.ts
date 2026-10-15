/** Genuine archived Google identities/sessions; domain relationships and PINs
 * are confined to a disposable local restore. No Auth/JWT/provider is fabricated. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { hashPortalPin, checkPortalPin } from '../supabase/portalAccess.js';
import {ownResidentReleasePreview,releaseOwnResidentRoom,releaseResidentRoom,keyRows} from '../supabase/housing.js';
import {issueManagerKey,checkManagerKey} from '../supabase/managerKeys.js';
dotenv.config({ quiet: true });
const [checkpoint, applicationCheckpoint] = process.argv.slice(2);
if (process.argv.length !== 4 || [checkpoint, applicationCheckpoint].some(v => !/^[a-f0-9-]{36}$/.test(v || ''))) throw new Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks = 0, stage = 'restore';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function denied(work: () => Promise<unknown>, expected: number | string, label: string) {
  let error: any; try { await work(); } catch (e) { error = e; }
  check(typeof expected === 'number' ? error instanceof ApiError && error.status === expected : error?.code === expected, label);
}
const randomPin = () => String(crypto.randomInt(100000, 1000000));
try {
  await withIsolatedBackup(checkpoint, async config => {
    let db = new SupabaseDatabase(config);
    try {
      const authDigest = async () => (await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
        'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
      const beforeAuth = await authDigest();
      const currentPin = randomPin(); let nextPin = randomPin(); while (nextPin === currentPin) nextPin = randomPin();
      let sellerPin = randomPin(); while ([currentPin, nextPin].includes(sellerPin)) sellerPin = randomPin();
      const fixture = await db.system(async c => {
        const people = (await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') as name,
          (select array_agg(s.id order by s.created_at desc) from auth.sessions s where s.user_id=u.id and (s.not_after is null or s.not_after>clock_timestamp())) as sessions
          from auth.users u where u.email_confirmed_at is not null and not u.is_anonymous
          and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb
            and lower(i.identity_data->>'email')=lower(u.email)) order by u.id`)).rows.filter(p => p.sessions?.length);
        const student = people.find(p => p.sessions.length >= 2);
        check(people.length >= 4 && student, 'Actual verified subjects include one identity with two genuine sessions');
        const [ownerPerson, foreignOwnerPerson, foreignPerson] = people.filter(p => p.id !== student.id);
        const ownerActors: VerifiedActor[] = [];
        for (const p of [ownerPerson, foreignOwnerPerson]) {
          await c.query('select private.initialize_auth_profile($1,null)', [p.id]);
          ownerActors.push({ authUserId: p.id, sessionId: p.sessions[0], kind: 'primary', contextId: (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'", [p.id])).rows[0].id });
        }
        for (const [p, owner] of [[student, ownerPerson], [foreignPerson, foreignOwnerPerson]])
          await c.query('insert into public.profiles(id,email,display_name,primary_owner_id) values($1,$2,$3,$4)', [p.id, p.email, p.name, owner.id]);
        const resident: VerifiedActor = { authUserId: student.id, sessionId: student.sessions[0], kind: 'resident', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'resident','active') returning id", [student.id, ownerPerson.id])).rows[0].id };
        const seller: VerifiedActor = { ...resident, sessionId: student.sessions[1], kind: 'seller', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'seller','active') returning id", [student.id, ownerPerson.id])).rows[0].id };
        const foreign: VerifiedActor = { authUserId: foreignPerson.id, sessionId: foreignPerson.sessions[0], kind: 'resident', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'resident','active') returning id", [foreignPerson.id, foreignOwnerPerson.id])).rows[0].id };
        const home = (await c.query("insert into public.residences(primary_owner_id,name,status) values($1,$2,'approved') returning id", [ownerPerson.id, ownerPerson.name])).rows[0].id;
        const block = (await c.query('insert into public.blocks(residence_id,name) values($1,$2) returning id', [home, student.name])).rows[0].id;
        const floor = (await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id', [block])).rows[0].id;
        const room = (await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id", [floor])).rows[0].id;
        const bed = (await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id', [room])).rows[0].id;
        const allocation = (await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id', [resident.contextId, room, bed])).rows[0].id;
        const managers:VerifiedActor[]=[];
        const spare=people.filter(p=>![student.id,ownerPerson.id,foreignOwnerPerson.id,foreignPerson.id].includes(p.id));
        check(spare.length>=2,'Two additional genuine subjects provide manager sessions');
        for(let i=0;i<2;i++){
          const p=spare[i],parent=[ownerPerson,foreignOwnerPerson][i];
          await c.query('insert into public.profiles(id,email,display_name,primary_owner_id) values($1,$2,$3,$4)',[p.id,p.email,p.name,parent.id]);
          managers.push({authUserId:p.id,sessionId:p.sessions[0],kind:'manager',contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[p.id,parent.id])).rows[0].id});
        }
        await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[managers[0].contextId,home]);
        const key=(await c.query('insert into private.room_activation_keys(room_id,code,claimed_by,claimed_at) values($1,$2,$3,now()) returning id',[room,'PV-'+crypto.randomBytes(16).toString('hex').toUpperCase(),resident.contextId])).rows[0].id;
        const foreignHome=(await c.query("insert into public.residences(primary_owner_id,name,status) values($1,$2,'approved') returning id",[foreignOwnerPerson.id,foreignOwnerPerson.name])).rows[0].id;
        await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[managers[1].contextId,foreignHome]);
        const fb=(await c.query('insert into public.blocks(residence_id,name) values($1,$2) returning id',[foreignHome,foreignPerson.name])).rows[0].id;
        const ff=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[fb])).rows[0].id;
        const fr=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[ff])).rows[0].id;
        const fbed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[fr])).rows[0].id;
        const foreignAllocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id',[foreign.contextId,fr,fbed])).rows[0].id;
        const foreignKey=(await c.query('insert into private.room_activation_keys(room_id,code,claimed_by,claimed_at) values($1,$2,$3,now()) returning id',[fr,'PV-'+crypto.randomBytes(16).toString('hex').toUpperCase(),foreign.contextId])).rows[0].id;
        await c.query('insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,title) values($1,$2,$3,$4,$5)',[home,room,resident.contextId,allocation,student.name||student.email]);
        for (const [actor, pin] of [[resident, currentPin], [seller, sellerPin]] as const)
          await c.query('insert into private.portal_access_keys(context_id,pin_hash) values($1,$2)', [actor.contextId, await hashPortalPin(pin)]);
        for (const a of [...ownerActors, resident, seller, foreign,...managers])
          await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id,portal_pin_version) values($1,$2,$3,$4)', [a.sessionId, a.authUserId, a.contextId, ['resident', 'seller'].includes(a.kind) && a !== foreign ? 1 : null]);
        const applied = new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r => [r.version, r.digest]));
        for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()) {
          const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8'), version = file.slice(0, 14), digest = crypto.createHash('sha256').update(sql).digest('hex');
          if (applied.has(version)) assert.equal(applied.get(version), digest);
          else { await c.query(sql); await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', [version, digest]); }
        }
        return {owner:ownerActors[0],resident,seller,foreign,allocation,key,room,home,managers,foreignHome,foreignKey,foreignAllocation};
      });
      const {owner,resident,seller,foreign,managers,key,foreignKey}=fixture;
      const preview=(a:VerifiedActor)=>db.authorizedSystem(a,['resident'],c=>ownResidentReleasePreview(c,a));
      const release=(a:VerifiedActor,body:any)=>db.authorizedSystem(a,['resident'],c=>releaseOwnResidentRoom(c,a,body),false,false,true);
      const info=await preview(resident),foreignInfo=await preview(foreign);
      check(info.requiresPin&&info.identityRetained&&info.otherPortalsRetained,'Shared identity uses only resident PIN proof');
      check(!foreignInfo.requiresPin&&!foreignInfo.recentSignIn,'Archived unshared identity requires a real new sign-in');
      const input={confirm:'END MY ROOM ACCESS',fingerprint:info.fingerprint,currentPin};
      for(const a of [owner,seller,managers[0]])await denied(()=>preview(a),403,'Other portal cannot preview resident closure');
      for(const patch of [{contextId:foreign.contextId},{authUserId:foreign.authUserId},{sessionId:seller.sessionId}])
        await denied(()=>preview({...resident,...patch}),401,'Spoofed native context/subject/session is denied');
      for(const body of [{...input,roomId:fixture.room},{...input,email:'target'},{...input,password:'secret'},{...input,role:'resident'},{...input,confirm:true},{...input,currentPin:123456}])
        await denied(()=>release(resident,body),400,'Legacy credentials and target selectors are rejected');
      await denied(()=>release(resident,{...input,fingerprint:foreignInfo.fingerprint}),409,'Another allocation preview cannot authorize release');
      await denied(()=>release(foreign,{confirm:'END MY ROOM ACCESS',fingerprint:foreignInfo.fingerprint}),403,'An old verified native sign-in cannot satisfy fresh proof');
      const base=async()=>(await db.pool.query(`select md5(jsonb_build_object('allocations',(select jsonb_agg(to_jsonb(a) order by id) from public.allocations a),'contexts',(select jsonb_agg(to_jsonb(c) order by id) from public.account_contexts c),'keys',(select jsonb_agg(to_jsonb(k) order by id) from private.room_activation_keys k))::text) as d`)).rows[0].d;
      const baseline=await base();const bad=await release(resident,{...input,currentPin:nextPin});
      check('pinDenied' in bad&&!bad.success,'Incorrect resident PIN denies closure');
      check((await db.pool.query('select failed_attempts from private.portal_access_keys where context_id=$1',[resident.contextId])).rows[0].failed_attempts===1,'Incorrect PIN guess is committed');
      check(await base()===baseline,'Denied proof changes no housing/context/key records');
      await denied(()=>db.actor(resident,c=>c.query('update public.allocations set ended_at=now() where id=$1',[fixture.allocation])),'42501','Scoped backend cannot bypass closure proof through SQL');
      for(const manager of managers){const issued=await db.authorizedSystem(manager,['manager'],c=>issueManagerKey(c,manager));manager.managerKeyVersion=(await db.authorizedSystem(manager,['manager'],c=>checkManagerKey(c,manager,issued.key))).version;}
      await denied(()=>db.authorizedSystem(managers[1],['manager'],c=>releaseResidentRoom(c,managers[1],key,true)),404,'Foreign manager cannot release another residence room');
      stage='atomic own release';const concurrent=await Promise.allSettled([release(resident,input),release(resident,input)]);
      check(concurrent.filter(r=>r.status==='fulfilled').length===1&&concurrent.some(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===401),'Concurrent confirmations commit one release and deny the stale request');
      const result=(concurrent.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof release>>>).value;
      check(result.success&&'rooms' in result&&result.rooms.length===0&&!('roomKey' in result),'Verified own release never reveals replacement activation key');
      check((await db.pool.query('select ended_at from public.allocations where id=$1',[fixture.allocation])).rows[0].ended_at!==null,'Allocation ends rather than disappearing');
      check((await db.pool.query('select status from public.account_contexts where id=$1',[resident.contextId])).rows[0].status==='closed','Only resident portal closes');
      check((await db.pool.query('select count(*) from private.account_sessions where active_context_id=$1',[resident.contextId])).rows[0].count==='0','All resident app bindings are revoked');
      check((await db.actor(seller,c=>c.query('select private.current_context_id() as id'))).rows[0].id===seller.contextId,'Shared seller portal binding and PIN remain usable');
      check((await db.pool.query('select status from public.account_contexts where id=$1',[seller.contextId])).rows[0].status==='active','Shared seller portal stays active');
      check((await db.pool.query('select count(*) from public.maintenance_issues where allocation_id=$1',[fixture.allocation])).rows[0].count==='1','Maintenance history is retained');
      const keys=(await db.pool.query('select * from private.room_activation_keys where room_id=$1 order by created_at,id',[fixture.room])).rows;
      check(keys.length===2&&keys.filter(k=>!k.revoked_at).length===1&&keys.find(k=>k.id===key).revoked_at,'One old key is revoked and exactly one replacement remains');
      check(keys.find(k=>!k.revoked_at).claimed_by===null,'Replacement is not assigned to the former resident');
      check((await db.pool.query("select count(*) from private.audit_events where event_type='resident_room_self_released'")).rows[0].count==='1','Own release has one retained audit receipt');
      const notices=(await db.pool.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title in('Resident Room Access Ended','Resident released room access')")).rows.map(r=>r.context_id);
      check(notices.includes(owner.contextId)&&notices.includes(managers[0].contextId)&&!notices.includes(seller.contextId),'Notice reaches saved primary owner and assigned manager only');
      await denied(()=>preview(resident),401,'Closed resident portal cannot access its old preview');
      await denied(()=>release(resident,input),401,'Retry cannot rotate keys or repeat closure notices');
      stage='existing manager release';
      const released=await db.authorizedSystem(managers[1],['manager'],c=>releaseResidentRoom(c,managers[1],foreignKey,true));
      check(released&&!released.isAssigned,'Existing assigned-manager room release still works');
      check((await db.pool.query('select ended_at from public.allocations where id=$1',[fixture.foreignAllocation])).rows[0].ended_at!==null,'Manager release still ends its exact allocation');
      await denied(()=>preview(foreign),401,'Manager release also revokes its resident portal');
      check((await db.pool.query('select count(*) from public.registration_bans')).rows[0].count==='0','Resident closure invents no registration cooldown');
      check(await authDigest()===beforeAuth,'Genuine Auth subjects/identities/native sessions are unchanged');
      await db.close();db=new SupabaseDatabase(config);
      check((await db.pool.query('select status from public.account_contexts where id=$1',[resident.contextId])).rows[0].status==='closed','Closure persists after reconnect');
      const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,authRecordsChanged:false,cloudWrites:false,providerRepliesMocked:false,freshSignInPositivePending:true};
      fs.writeFileSync('.security/migration-reset/resident-closure-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
    }finally{await db.close();}
  },{applicationCheckpoint});
}catch(e:any){fs.writeFileSync('.security/migration-reset/resident-closure-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Isolated verification failed; diagnostics saved privately.'}));process.exitCode=1;}
