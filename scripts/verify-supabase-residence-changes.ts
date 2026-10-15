/** Real Google subjects/native sessions restored locally. Isolated domain rows
 * and private test keys never reach the cloud; no Auth/provider/JWT is fabricated. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {checkApprovalKey,deniedApprovalKey} from '../supabase/adminGovernance.js';
import {checkAdministratorSettingsKey,deniedKey} from '../supabase/adminSettings.js';
import {issueManagerKey,checkManagerKey,resetManagerKey,petitionManagerKey} from '../supabase/managerKeys.js';
import {managerResidenceChanges,submitResidenceChanges,reviewResidenceChanges,decideResidenceChanges,residenceChangeRows} from '../supabase/residenceChanges.js';
import {reserveMedia,finishMedia} from '../supabase/media.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
dotenv.config({quiet:true});
const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw new Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks=0,stage='restore';
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);}
try{await withIsolatedBackup(checkpoint,async config=>{
  let db=new SupabaseDatabase(config);
  try{
    const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
      'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
    const beforeAuth=await authDigest();
    stage='native fixtures';
    const fixture=await db.system(async c=>{
      const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') as name,s.id as session_id
        from auth.users u join lateral(select id from auth.sessions where user_id=u.id and(not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1)s on true
        where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
          and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
        order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 6`)).rows;
      check(people.length===6,'Six actual verified Google subjects and native sessions');
      const admins:VerifiedActor[]=[],managers:VerifiedActor[]=[],primaries:VerifiedActor[]=[],approvalKeys:string[]=[],settingsKeys:string[]=[],homes:any[]=[];
      for(const index of [0,1,4]){
        const p=people[index];await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        const primary={authUserId:p.id,sessionId:p.session_id,contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id,kind:'primary'};
        primaries.push(primary);
        if(index<2){
          const admin={...primary,kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[p.id])).rows[0].id};admins.push(admin);
          await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[admin.contextId,index+1]);
          const approval=crypto.randomBytes(32).toString('base64url'),settings=crypto.randomBytes(32).toString('base64url');approvalKeys.push(approval);settingsKeys.push(settings);
          await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at) values($1,$2,clock_timestamp(),$3,clock_timestamp())',
            [admin.contextId,await hashCredentialAsync(`approval:${admin.contextId}:${approval}`),await hashCredentialAsync(`settings:${admin.contextId}:${settings}`)]);
        }
      }
      for(let i=0;i<3;i++){
        const p=people[i===2?5:i+2],owner=people[i===2?4:i];
        await c.query('insert into public.profiles(id,email,display_name,primary_owner_id) values($1,$2,$3,$4)',[p.id,p.email,p.name,owner.id]);
        const manager={authUserId:p.id,sessionId:p.session_id,contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[p.id,owner.id])).rows[0].id,kind:'manager'};managers.push(manager);
        const home=(await c.query("insert into public.residences(primary_owner_id,name,status) values($1,$2,'approved') returning id",[owner.id,owner.name])).rows[0].id;
        await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager.contextId,home]);
        const block=(await c.query('insert into public.blocks(residence_id,name) values($1,$2) returning id',[home,p.name])).rows[0].id;
        const empty=(await c.query('insert into public.blocks(residence_id,name) values($1,$2) returning id',[home,p.email])).rows[0].id;
        const floor=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[block])).rows[0].id;
        const room=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[floor])).rows[0].id;
        const bed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[room])).rows[0].id;
        homes.push({id:home,block,empty,floor,room,bed});
      }
      const staff=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'staff','closed') returning id",[people[3].id,people[1].id])).rows[0].id;
      await c.query("insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id,assigned_block_id,status,ended_at) values($1,$2,$3,$4,'removed',clock_timestamp())",[staff,homes[1].id,managers[1].contextId,homes[1].empty]);
      for(const a of [...admins,...managers,primaries[2]])await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
      const applied=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
        if(applied.has(version))assert.equal(applied.get(version),digest,'Historical migrations remain immutable');else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,digest]);}
      }
      return{admins,managers,primaries,approvalKeys,settingsKeys,homes,people};
    });
    const {admins:[admin,otherAdmin],managers:[manager,otherManager],primaries:[owner,,unrelated],homes:[home,foreign],approvalKeys,settingsKeys,people}=fixture;
    const run=<T>(a:VerifiedActor,kinds:string[],work:(c:any)=>Promise<T>)=>db.authorizedSystem(a,kinds,work);
    const bind=(a:VerifiedActor)=>db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[a.sessionId,a.contextId]));
    const grant=async(a:VerifiedActor,key:string)=>{const g=await run(a,['admin'],c=>checkApprovalKey(c,a,key));deniedApprovalKey(g);return g;};
    const submit=(a:VerifiedActor,changes:any,hostelId=home.id)=>run(a,['manager'],c=>submitResidenceChanges(c,a,{hostelId,changes}));
    const review=(a:VerifiedActor,id:string)=>run(a,['admin'],c=>reviewResidenceChanges(c,a,id));
    const decide=async(a:VerifiedActor,id:string,body:any)=>{const g=await grant(a,body.approvalKey);return run(a,['admin'],c=>decideResidenceChanges(c,a,g,id,body));};
    const info=await run(manager,['manager'],c=>managerResidenceChanges(c,manager));
    check(info.hostels.length===1&&info.hostels[0].id===home.id&&info.nextRequestAt===0,'Manager sees only own property and real empty cooldown');
    const rawKey=(await run(manager,['manager'],c=>issueManagerKey(c,manager))).key;
    const keyGrant=await run(manager,['manager'],c=>checkManagerKey(c,manager,rawKey));check(keyGrant.allowed,'Actual manager key validation');manager.managerKeyVersion=keyGrant.version;
    const otherKey=(await run(otherManager,['manager'],c=>issueManagerKey(c,otherManager))).key;
    otherManager.managerKeyVersion=(await run(otherManager,['manager'],c=>checkManagerKey(c,otherManager,otherKey))).version;
    stage='authorization and validation';
    await denied(()=>submit({...manager,managerKeyVersion:undefined},{name:people[4].name}),403,'Manager operation key cannot be skipped');
    await denied(()=>submit(manager,{name:people[4].name},foreign.id),404,'Manager cannot submit for foreign property');
    await denied(()=>submit(unrelated,{name:people[4].name}),403,'Primary cannot impersonate manager');
    await denied(()=>submit(admin,{name:people[4].name}),403,'Administrator cannot impersonate submitting manager');
    for(const changes of [{managerId:otherManager.contextId},{capacity:100},{name:''},{cover:'https://untrusted.invalid/photo.png'},{gallery:[]},{blocks:[]},
      {blocks:[{id:foreign.block,name:people[0].name}]},{blocks:[{id:home.block,name:people[0].name},{id:home.block,name:people[1].name}]},
      {blocks:[{name:people[0].name},{name:people[0].name}]},{managerPhone:'0',managerPhoneCountry:'GH'},{}])
      await denied(()=>submit(manager,changes),400,'Invalid selectors, media, blocks or contact data are rejected');
    await denied(()=>submit(manager,{blocks:[{id:home.empty,name:people[0].name}]}),409,'Block containing floors/rooms/beds cannot be removed');
    const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),512);
    const asset=await run(manager,['manager'],async c=>{const m=await reserveMedia(c,manager,'hostel',image);await finishMedia(c,manager,m.id);return m;});
    const foreignAsset=await run(otherManager,['manager'],async c=>{const m=await reserveMedia(c,otherManager,'hostel',image);await finishMedia(c,otherManager,m.id);return m;});
    await denied(()=>submit(manager,{cover:'/api/media/'+foreignAsset.id}),403,'Foreign manager image cannot be requested');
    await denied(()=>submit(otherManager,{blocks:[{id:foreign.block,name:people[3].name}]},foreign.id),409,'Staff employment history blocks removal of an otherwise empty block');
    const blocks=info.hostels[0].blocks.filter((b:any)=>b.id===home.block).map((b:any)=>({id:b.id,name:people[4].name}));blocks.push({name:people[1].email});
    const changes={name:people[4].name,managerName:people[0].name,cover:'/api/media/'+asset.id,gallery:['/api/media/'+asset.id],blocks};
    const request=await submit(manager,changes);
    check(Boolean(request.id),'Actual own change submission succeeds');
    const unchanged=(await db.pool.query('select name,cover_path from public.residences where id=$1',[home.id])).rows[0];
    check(unchanged.name===people[0].name&&unchanged.cover_path===null,'Submission leaves live residence unchanged');
    await denied(()=>submit(manager,{name:people[1].name}),429,'Cooldown covers all residence changes from this manager');
    check((await db.actor(otherManager,c=>residenceChangeRows(c))).length===0,'Foreign manager cannot read own request');
    const pending=(await db.actor(manager,c=>residenceChangeRows(c)))[0];check(pending.kind==='residence-change'&&pending.status==='Pending'&&pending.managerName===people[2].name,'List preserves active UI contract');
    await denied(()=>review(manager,request.id),403,'Manager cannot produce administrator diff proof');
    await denied(()=>decide(admin,request.id,{decision:'approve',approvalKey:settingsKeys[0]}),403,'Settings key cannot approve residence changes');
    await denied(()=>decide(admin,request.id,{decision:'approve',approvalKey:approvalKeys[0]}),409,'Decision requires an actual reviewed diff proof');
    const reviewed=await review(admin,request.id);
    check(reviewed.request.before.name===people[0].name&&reviewed.request.after.name===people[4].name,'Review contains actual before/requested diff');
    await denied(()=>decide(otherAdmin,request.id,{decision:'approve',approvalKey:approvalKeys[1],reviewToken:reviewed.reviewToken}),409,'Another administrator cannot use the review proof');
    await denied(()=>decide(admin,request.id,{decision:'approve',approvalKey:approvalKeys[0],reviewToken:reviewed.reviewToken+'x'}),409,'Tampered proof is rejected');
    const alternate=(await db.pool.query('select id from auth.sessions where user_id=$1 and id<>$2 and(not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1',[admin.authUserId,admin.sessionId])).rows[0];
    check(Boolean(alternate),'An independently existing native session permits real session-bound proof verification');
    const otherSession={...admin,sessionId:alternate.id};
    await db.system(c=>c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[otherSession.sessionId,otherSession.authUserId,otherSession.contextId]));
    await denied(()=>decide(otherSession,request.id,{decision:'approve',approvalKey:approvalKeys[0],reviewToken:reviewed.reviewToken}),409,'Same administrator in another real session cannot reuse diff proof');
    stage='approval and persistence';
    await db.close();db=new SupabaseDatabase(config);
    check((await db.actor(manager,c=>residenceChangeRows(c)))[0].status==='Pending','Pending request survives reconnect');
    await decide(admin,request.id,{decision:'approve',approvalKey:approvalKeys[0],reviewToken:reviewed.reviewToken});
    const live=(await db.pool.query('select name,manager_contact_name,cover_path from public.residences where id=$1',[home.id])).rows[0];
    check(live.name===people[4].name&&live.manager_contact_name===people[0].name&&live.cover_path==='/api/media/'+asset.id,'Keyed approval atomically applies approved fields');
    check((await db.pool.query('select display_name from public.profiles where id=$1',[manager.authUserId])).rows[0].display_name===people[2].name,'Public manager contact does not rename verified account identity');
    check((await db.pool.query('select name from public.blocks where id=$1',[home.block])).rows[0].name===people[4].name,'Block rename preserves existing identity');
    check((await db.pool.query('select id from public.beds where id=$1 and room_id=$2',[home.bed,home.room])).rowCount===1,'Approval preserves floor/room/bed hierarchy');
    check((await db.pool.query('select id from public.blocks where id=$1',[home.empty])).rowCount===0,'Empty unreferenced block can be removed after approval');
    check((await db.actor(manager,c=>residenceChangeRows(c)))[0].status==='Approved','Decision persists in UI-compatible history');
    await denied(()=>decide(admin,request.id,{decision:'approve',approvalKey:approvalKeys[0],reviewToken:reviewed.reviewToken}),409,'Decided request cannot replay');
    const recipients=(await db.pool.query(`select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Residence changes approved'`)).rows.map(r=>r.context_id);
    check([manager.contextId,owner.contextId,admin.contextId,otherAdmin.contextId].every(id=>recipients.includes(id)),'State notices reach manager, primary owner and actual administrators');
    check((await db.pool.query("select category,link from public.notifications where title='Residence changes awaiting review'")).rows.every(r=>r.category==='admin_governance'&&r.link==='residence_changes'),'Request alerts count under approvals and target the actual residence review section');
    await denied(()=>db.actor(unrelated,c=>c.query('select id from public.residence_change_requests where id=$1',[request.id])).then(r=>{if(!r.rowCount)throw new ApiError(403,'RLS denial');}),403,'Unrelated primary has no direct request access');
    await denied(()=>db.actor(manager,c=>c.query("update public.residence_change_requests set status='approved' where id=$1",[request.id])),'42501','Scoped manager cannot decide through SQL');
    await denied(()=>run(manager,['manager'],c=>c.query('update public.residence_change_requests set after_fields=$2 where id=$1',[request.id,{name:people[1].name}])),'23514','Native snapshots cannot be rewritten');
    stage='stale decisions and recovery';
    const foreignRequest=await submit(otherManager,{name:people[4].name},foreign.id),foreignReview=await review(admin,foreignRequest.id);
    await db.system(c=>c.query('update public.residences set name=$2 where id=$1',[foreign.id,people[2].name]));
    await denied(()=>decide(admin,foreignRequest.id,{decision:'approve',approvalKey:approvalKeys[0],reviewToken:foreignReview.reviewToken}),409,'Changed residence baseline blocks approval');
    await denied(()=>decide(admin,foreignRequest.id,{decision:'reject',approvalKey:approvalKeys[0],reviewToken:foreignReview.reviewToken}),400,'Rejection requires explanation');
    await decide(admin,foreignRequest.id,{decision:'reject',approvalKey:approvalKeys[0],reviewToken:foreignReview.reviewToken,reason:'The current property details differ from the requested baseline.'});
    check((await db.actor(otherManager,c=>residenceChangeRows(c)))[0].status==='Rejected','Stale request can still be explicitly rejected');
    const raceManager=fixture.managers[2],raceHome=fixture.homes[2];
    const raceKey=(await run(raceManager,['manager'],c=>issueManagerKey(c,raceManager))).key;
    raceManager.managerKeyVersion=(await run(raceManager,['manager'],c=>checkManagerKey(c,raceManager,raceKey))).version;
    const race=await Promise.allSettled([submit(raceManager,{name:people[0].name},raceHome.id),submit(raceManager,{name:people[1].name},raceHome.id)]);
    check(race.filter(r=>r.status==='fulfilled').length===1&&race.some(r=>r.status==='rejected'&&r.reason instanceof ApiError&&r.reason.status===429),'Concurrent submissions serialize into one genuine request and one cooldown denial');
    const raceRequest=(race.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value,raceReview=await review(admin,raceRequest.id);
    const raceGrant=await grant(admin,approvalKeys[0]);
    await run(admin,['admin'],async c=>{
      await c.query('savepoint ended_assignment');
      await c.query('update public.manager_assignments set ended_at=clock_timestamp() where manager_context_id=$1 and residence_id=$2',[raceManager.contextId,raceHome.id]);
      await denied(()=>decideResidenceChanges(c,admin,raceGrant,raceRequest.id,{decision:'approve',reviewToken:raceReview.reviewToken}),404,'Ended manager assignment blocks property approval');
      await c.query('rollback to savepoint ended_assignment');
    });
    await decide(admin,raceRequest.id,{decision:'approve',approvalKey:approvalKeys[0],reviewToken:raceReview.reviewToken});
    check((await db.pool.query('select manager_contact_name from public.residences where id=$1',[raceHome.id])).rows[0].manager_contact_name===null,'Name-only approval does not publish derived account contact information');
    await petitionManagerKeyInTransaction();
    async function petitionManagerKeyInTransaction(){await run(manager,['manager'],c=>petitionManagerKey(c,manager,'The manager operation key requires recovery.'));}
    await denied(async()=>{const g=await run(admin,['admin'],c=>checkAdministratorSettingsKey(c,admin,approvalKeys[0]));deniedKey(g);await run(admin,['admin'],c=>resetManagerKey(c,admin,manager.contextId,g));},403,'Approval key cannot reset manager operation key');
    const settingsGrant=await run(admin,['admin'],c=>checkAdministratorSettingsKey(c,admin,settingsKeys[0]));deniedKey(settingsGrant);
    await run(admin,['admin'],c=>resetManagerKey(c,admin,manager.contextId,settingsGrant));
    await denied(()=>submit(manager,{name:people[1].name}),403,'Reset invalidates the previously checked manager grant');
    const old=await run({...manager,managerKeyVersion:undefined},['manager'],c=>checkManagerKey(c,manager,rawKey));check(!old.allowed,'Old manager key no longer validates');
    const replacement=(await run({...manager,managerKeyVersion:undefined},['manager'],c=>issueManagerKey(c,manager))).key;
    check(replacement!==rawKey,'Only manager generates its new private key');
    const replacementGrant=await run({...manager,managerKeyVersion:undefined},['manager'],c=>checkManagerKey(c,manager,replacement));
    await denied(()=>submit({...manager,managerKeyVersion:replacementGrant.version},{name:people[1].name}),429,'A genuine recovered manager key cannot bypass the request cooldown');
    check((await db.pool.query('select status from private.manager_key_petitions where manager_context_id=$1',[manager.contextId])).rows[0].status==='approved','Settings-authorized reset decides the real pending petition');
    await bind(owner);await denied(()=>review({...admin,contextId:admin.contextId},foreignRequest.id),401,'Stale administrator session binding is denied');await bind(admin);
    check(await authDigest()===beforeAuth,'Real Auth subjects, identities and timestamps remain unchanged');
    console.log(JSON.stringify({success:true,checks,isolated:true,liveFixtures:false,authPreserved:true}));
  }finally{await db.close();}
},{applicationCheckpoint});}catch(error:any){console.error(JSON.stringify({success:false,stage,checks,code:error?.code||null,error:error instanceof assert.AssertionError?error.message:'Native verification failed; credentials suppressed.'}));process.exitCode=1;}
