/** Real verified Google subjects and sessions restored locally. Domain rows and
 * keys are isolated; no provider response, JWT or Auth timestamp is fabricated. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { SupabaseDatabase,ApiError,type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { saveProfile,AVATAR_PRESETS,checkProfileContext,profileSettingsGrant } from '../supabase/profiles.js';
import { reserveMedia,finishMedia,mediaUrl } from '../supabase/media.js';
import { SupabaseStorage } from '../supabase/storage.js';
import { normalizeRasterImage,decodeImageUpload,ImageUploadError } from '../imageUploadSecurity.js';
import { hashCredentialAsync } from '../accountSecurity.js';
import { requireSettingsGrant } from '../supabase/adminSettings.js';
dotenv.config({quiet:true});
const [backup,applicationCheckpoint]=process.argv.slice(2);
if(!backup || !applicationCheckpoint)throw new Error('Pass the genuine Auth backup and pre-enrollment application checkpoint.');
let checks=0,stage='fixture',objectPath:string|undefined;
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?(error instanceof ApiError || error instanceof ImageUploadError)&&error.status===expected:error?.code===expected,label);}
const storage=new SupabaseStorage();
try{await withIsolatedBackup(backup,async config=>{
  let db=new SupabaseDatabase(config);
  try {
    const fixture=await db.system(async c=>{
      const authDigest=(await c.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
        'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
        'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
      const ledger=(await c.query('select version,digest from private.schema_migrations')).rows;
      check(ledger.length===27,'Only the preserved isolated pre-enrollment schema is used for domain fixtures');
      for(const row of ledger){const file=fs.readdirSync('supabase/migrations').find(f=>f.startsWith(row.version));check(file&&crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+file)).digest('hex')===row.digest,'Historical migration remains immutable');}
      const people=(await c.query(`select u.id,s.id as session_id from auth.users u join lateral
        (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
        where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
          and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
        order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 3`)).rows;
      check(people.length===3,'Three genuine confirmed Google identities with actual sessions');
      const actors:VerifiedActor[]=[];
      for(const p of people){await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        const primary=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
        const a={authUserId:p.id,sessionId:p.session_id,contextId:primary,kind:'primary'};actors.push(a);
        await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);}
      // A genuinely separate work/student identity linked to the primary owner
      // must not inherit that owner's photograph or media access.
      await c.query('update public.profiles set primary_owner_id=$1 where id=$2',[actors[0].authUserId,actors[1].authUserId]);
      const shared={...actors[1],kind:'seller',contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'seller','active') returning id",[actors[1].authUserId,actors[0].authUserId])).rows[0].id};
      const admin={...actors[0],kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[actors[0].authUserId])).rows[0].id};
      await c.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[admin.contextId]);
      const key=crypto.randomBytes(32).toString('base64url'),approval=crypto.randomBytes(32).toString('base64url');
      await c.query('insert into private.admin_secrets(context_id,settings_key_hash,settings_enrolled_at,approval_key_hash,approval_enrolled_at) values($1,$2,clock_timestamp(),$3,clock_timestamp())',
        [admin.contextId,await hashCredentialAsync(`settings:${admin.contextId}:${key}`),await hashCredentialAsync(`approval:${admin.contextId}:${approval}`)]);
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000').sort()){
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);}
      return {actors,admin,shared,key,approval,authDigest};
    });
    const {actors:[owner,child,other],admin,shared,key,approval}=fixture;
    let auth=new SupabaseAuth(db);
    const bind=(a:VerifiedActor)=>db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[a.sessionId,a.contextId]));
    const save=(a:VerifiedActor,b:any,grant?:any)=>db.authorizedSystem(a,[a.kind],c=>saveProfile(c,a,b,grant));
    const avatar=(a:VerifiedActor)=>auth.projection(a).then(p=>p.avatar);
    const read=(a:VerifiedActor,id:string)=>db.actor(a,c=>c.query('select id from public.media_assets where id=$1',[id]));
    stage='presets and profile fields';
    for(const id of AVATAR_PRESETS){await save(child,{avatar:`preset:${id}`});check(await avatar(child)===`preset:${id}`,'Each supported preset persists');}
    const original=(await auth.projection(child));
    await save(child,{name:original.name || original.email,phone:'+233 24 000 0000',email:original.email});
    check((await auth.projection(child)).phone==='+233 24 000 0000','Authorized contact edit persists');
    for(const body of [{email:'different@example.invalid'},{userId:other.authUserId},{profileId:other.authUserId},{role:'admin'},{hostelId:crypto.randomUUID()},
      {name:''},{phone:'x'.repeat(41)},{name:'x'.repeat(121)},{phone:'\u0000'},{avatar:'preset:unknown'},
      {avatar:'data:image/png;base64,AA=='},{avatar:'https://untrusted.invalid/image.png'},{avatar:'preset:pine-dark',photo:'preset:pine-cyan'},[],null,{}])
      await denied(()=>save(child,body),400,'Invalid or ownership-changing profile input is rejected');
    await denied(async()=>checkProfileContext(child,other.contextId),409,'A stale account-context header cannot save to the new account');
    checkProfileContext(child,child.contextId);check(true,'Matching context is accepted as a consistency check');
    stage='owned image';
    const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),512);
    await denied(()=>decodeImageUpload({fileType:'image/svg+xml',fileData:'PHN2Zy8+'}),415,'Executable SVG is rejected');
    await denied(()=>decodeImageUpload({fileType:'image/png',fileData:'data:image/jpeg;base64,AA=='}),400,'Mismatched data URL type is rejected');
    const reserve=(a:VerifiedActor,grant?:any)=>db.authorizedSystem(a,[a.kind],async c=>{if(grant)await requireSettingsGrant(c,a,grant);return reserveMedia(c,a,'avatar',image);});
    const asset=await reserve(child);
    await denied(()=>save(child,{photo:mediaUrl(asset.id)}),403,'An unfinished upload cannot become an avatar');
    await db.authorizedSystem(child,[child.kind],c=>finishMedia(c,child,asset.id));
    await save(child,{photo:mediaUrl(asset.id),avatar:mediaUrl(asset.id)});
    check(await avatar(child)===mediaUrl(asset.id),'Owned ready avatar reference persists');
    check((await read(child,asset.id)).rowCount===1,'Owner can read own private avatar');
    check((await read(owner,asset.id)).rowCount===0,'Linked primary owner cannot read another verified identity avatar');
    check((await read(other,asset.id)).rowCount===0,'Unrelated identity cannot read avatar');
    await denied(()=>save(other,{photo:mediaUrl(asset.id)}),403,'Another identity cannot attach the avatar');
    check(await avatar(other)===null,'Another identity retains its own profile picture');
    await bind(admin);
    check((await read(admin,asset.id)).rowCount===0,'Generic administrator access does not expose unrelated personal avatars');
    await denied(()=>save(admin,{avatar:'preset:pine-dark'}),403,'Administrator profile save requires settings key');
    await denied(()=>profileSettingsGrant(auth,admin,approval),403,'Approval key cannot substitute for settings key');
    await denied(()=>reserve(admin),'42501','SQL independently rejects administrator avatar reservation without settings grant');
    const grant=await profileSettingsGrant(auth,admin,key);
    const adminAsset=await reserve(admin,grant);
    await db.authorizedSystem(admin,['admin'],async c=>{await requireSettingsGrant(c,admin,grant!);return finishMedia(c,admin,adminAsset.id);});
    await save(admin,{photo:mediaUrl(adminAsset.id)},grant);
    check(await avatar(admin)===mediaUrl(adminAsset.id),'Keyed administrator profile save succeeds');
    const hostelAsset=await db.authorizedSystem(admin,['admin'],c=>reserveMedia(c,admin,'hostel',image));
    await db.authorizedSystem(admin,['admin'],c=>finishMedia(c,admin,hostelAsset.id));
    await denied(()=>save(admin,{photo:mediaUrl(hostelAsset.id)},grant),403,'A residence image cannot be attached as a personal avatar');
    await denied(()=>db.authorizedSystem(admin,['admin'],c=>c.query("update public.profiles set avatar_path='preset:pine-cyan',avatar_asset_id=null where id=$1",[admin.authUserId])),'42501','Raw SQL cannot bypass administrator profile key');
    await bind(owner);
    await denied(()=>profileSettingsGrant(auth,owner,undefined),403,'Shared primary login cannot bypass administrator settings key');
    await denied(()=>save(owner,{avatar:'preset:pine-rose'}),403,'Primary profile save cannot change an active administrator identity without its portal key');
    await denied(()=>db.authorizedSystem(owner,['primary'],c=>c.query("update public.profiles set avatar_path='preset:pine-rose',avatar_asset_id=null where id=$1",[owner.authUserId])),'42501','SQL also prevents primary-portal administrator key bypass');
    await denied(()=>save(owner,{photo:mediaUrl(asset.id)}),403,'Primary owner cannot adopt the linked student/work identity image');
    await bind(shared);
    check(await avatar(shared)===mediaUrl(asset.id),'Another portal using the same Auth identity shares that identity picture');
    check((await read(shared,asset.id)).rowCount===1,'Shared identity portal can read its identity avatar');
    await save(shared,{avatar:'preset:pine-classic'});
    await bind(child);
    check(await avatar(child)==='preset:pine-classic','Same identity changes project consistently across its portals');
    await save(child,{photo:mediaUrl(asset.id)});
    await db.actor(child,c=>c.query("update public.profiles set avatar_path='preset:pine-cyan',avatar_asset_id=null where id=$1",[child.authUserId]));
    check(await avatar(child)==='preset:pine-cyan','Scoped backend UPDATE grant remains usable under owner RLS');
    await save(child,{photo:mediaUrl(asset.id)});
    stage='SQL and RLS';
    const employment=await db.system(async c=>{
      await c.query('update public.profiles set primary_owner_id=$1 where id=$2',[owner.authUserId,other.authUserId]);
      const manager=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[other.authUserId,owner.authUserId])).rows[0].id;
      const residence=(await c.query('insert into public.residences(primary_owner_id,name) select $2::uuid,display_name from public.profiles where id=$1 returning id',[other.authUserId,owner.authUserId])).rows[0].id;
      await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager,residence]);
      const staff=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'staff','active') returning id",[child.authUserId,owner.authUserId])).rows[0].id;
      return (await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id) values($1,$2,$3) returning id',[staff,residence,manager])).rows[0].id;
    });
    await bind(admin);
    check((await read(admin,asset.id)).rowCount===1,'An authorized housing administrator can see the current active staff directory portrait');
    await bind(owner);
    check((await read(owner,asset.id)).rowCount===0,'Linked primary access cannot view a staff portrait without a housing relationship');
    check((await read(other,asset.id)).rowCount===0,'A manager primary portal cannot impersonate its manager portal for staff portraits');
    await db.system(c=>c.query("update public.staff_assignments set status='removed',ended_at=clock_timestamp(),end_reason='Employment ended' where id=$1",[employment]));
    await bind(admin);
    check((await read(admin,asset.id)).rowCount===0,'Ending employment removes related staff portrait access');
    await bind(child);
    await denied(()=>db.authorizedSystem(other,['primary'],c=>c.query('update public.profiles set avatar_path=$2,avatar_asset_id=$3 where id=$1',[other.authUserId,mediaUrl(asset.id),asset.id])),'23514','SQL forbids a cross-identity avatar');
    await denied(()=>db.system(c=>c.query("update public.media_assets set state='failed' where id=$1",[asset.id])),'23514','A referenced ready avatar cannot be retired');
    await denied(()=>db.system(c=>c.query('delete from public.media_assets where id=$1',[asset.id])),'23514','A referenced avatar must be detached before deletion');
    await denied(()=>db.system(c=>c.query('update public.media_assets set owner_auth_user_id=$2 where id=$1',[asset.id,other.authUserId])),'23514','Media owner is immutable');
    check(!(await db.pool.query('select private.media_asset_is_public($1) as allowed',[asset.id])).rows[0].allowed,'Profile picture never becomes public catalog media');
    await denied(()=>db.authorizedSystem(child,['primary'],c=>c.query('update public.profiles set avatar_path=$2 where id=$1',[child.authUserId,mediaUrl(adminAsset.id)])),'23514','Canonical image path cannot disagree with its asset foreign key');
    await denied(()=>db.authorizedSystem(child,['primary'],c=>c.query("update public.profiles set avatar_path='https://untrusted.invalid/image.png',avatar_asset_id=null where id=$1",[child.authUserId])),'23514','SQL refuses external URLs independently of API validation');
    await db.system(async c=>{await c.query('set local role anon');await denied(()=>c.query('select id from public.profiles'),'42501','Guest cannot access profiles');});
    await db.system(async c=>{await c.query('set local role authenticated');await denied(()=>c.query("update public.profiles set avatar_path='preset:pine-dark' where id=$1",[child.authUserId]),'42501','Browser role has no direct profile write grant');});
    await db.system(async c=>{await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:child.authUserId,session_id:child.sessionId,role:'authenticated'})]);await c.query('set local role authenticated');
      check((await c.query('select id from public.media_assets where id=$1',[asset.id])).rowCount===1,'Direct authenticated RLS permits own avatar');
      check((await c.query('select id from public.media_assets where id=$1',[adminAsset.id])).rowCount===0,'Direct authenticated RLS denies another identity avatar');});
    stage='Storage bytes';objectPath=asset.object_path;
    await storage.upload(objectPath,image);
    check((await storage.download(objectPath,asset)).equals(image),'Actual private Supabase Storage round-trips the real image bytes');
    await denied(()=>storage.download(objectPath,{byte_size:asset.byte_size,sha256:'0'.repeat(64)}),503,'Byte integrity mismatch fails closed');
    const response=await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/pinevela-media/${objectPath}`,{signal:AbortSignal.timeout(30000)});
    check(!response.ok,'Public bucket URL cannot expose private avatar');await response.body?.cancel();
    await storage.remove(objectPath);objectPath=undefined;
    await denied(()=>storage.download(asset.object_path,asset),503,'Removed object can no longer be downloaded');
    stage='restart and detachment';await db.close();db=new SupabaseDatabase(config);auth=new SupabaseAuth(db);
    check(await avatar(child)===mediaUrl(asset.id),'New database connections reload persisted avatar reference');
    const projection=await auth.projection(child);check([projection.photo,projection.photoUrl,projection.avatarUrl,projection.profilePicture].every(v=>v===projection.avatar),'All frontend aliases project one canonical avatar');
    await save(child,{avatar:''});check(await avatar(child)===null,'Owner can reset to the default icon');
    await db.system(c=>c.query("update public.media_assets set state='removing' where id=$1",[asset.id]));
    await db.system(c=>c.query('delete from public.media_assets where id=$1',[asset.id]));check(true,'Detached object metadata may be removed after Storage deletion');
    const authDigest=(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
      'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
      'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
    check(authDigest===fixture.authDigest,'Genuine Auth identities and session timestamps remain untouched');
    check((await db.pool.query("select count(*) from pg_tables where schemaname='public' and not rowsecurity")).rows[0].count==='0','All public tables retain RLS');
    console.log(JSON.stringify({checks,passed:true,isolated:true,realStorageRoundTrip:true,authAccountsCreated:0,liveProfilesChanged:0}));
  }finally{await db.close();}
},{applicationCheckpoint});}catch(error){
  fs.writeFileSync('.security/migration-reset/'+crypto.randomUUID()+'.profile-test-failure.log',String((error as any)?.stack || error),{mode:0o600});
  console.error(JSON.stringify({checks,stage,failed:true,code:(error as any)?.code,status:error instanceof ApiError?error.status:undefined,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;
}finally{if(objectPath)await storage.remove(objectPath);}
