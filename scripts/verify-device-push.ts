/** Disposable restored PostgreSQL + actual Express/Auth handlers. Provider
 * identities are explicit local fixtures. Push delivery is captured in memory;
 * this script never sends a cloud message, email or payment request. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import dotenv from 'dotenv';
import sharp from 'sharp';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth,installSupabaseAuth,csrfBoundary} from '../supabase/auth.js';
import {recordTermsAcceptance} from '../supabase/legal.js';
import {termsAcceptance} from '../legalPolicy.js';
import {installDevicePush,registerDevicePush,devicePushStatus} from '../supabase/devicePush.js';
import {notify} from '../supabase/notifications.js';
import {claimPushJobs,discoverPushPublications,finishPushJob,processPushBatch,pushJobMessage} from '../supabase/devicePushWorker.js';
import {PUSH_ACCOUNT_LABELS} from '../devicePushPolicy.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {hashPortalPin} from '../supabase/portalAccess.js';
import {reserveStaffInvitation,finishStaffInvitation} from '../supabase/staff.js';
dotenv.config({quiet:true});
const [checkpoint]=process.argv.slice(2);if(!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw Error('Pass a locally restore-verified backup UUID.');
const evidenceDirectory=process.env.PINEVELA_PUSH_EVIDENCE_DIRECTORY||'docs/verification/device-push-2026-11-05';
let stage='restore',checks=0;const labels:string[]=[],check=(condition:unknown,label:string)=>{assert.ok(condition,label);checks++;labels.push(label);};
const realFetch=globalThis.fetch;
try{await withIsolatedBackup(checkpoint,async config=>{
  const db=new SupabaseDatabase(config);let server:ReturnType<express.Express['listen']>|undefined;
  const provider='https://device-push-fixture.supabase.co',identities=new Map<string,any>();
  try{
    stage='additive migrations and private grants';
    const ledger=new Map((await db.pool.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
    for(const file of fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort()){
      const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
      if(ledger.has(version))assert.equal(ledger.get(version),digest);
      else if(version==='20261105110000'&&process.env.PINEVELA_PUSH_SQL){
        const wrapper=fs.readFileSync(process.env.PINEVELA_PUSH_SQL,'utf8');await db.pool.query(wrapper);await db.pool.query(wrapper);
        check((await db.pool.query('select digest from private.schema_migrations where version=$1',[version])).rows[0]?.digest===digest,'Exact SQL Editor wrapper applies and safely repeats with the matching ledger digest');
      }else await db.system(async c=>{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,digest]);});
    }
    for(const table of ['device_push_installations','device_push_bindings','device_push_publications','device_push_jobs']){
      check((await db.pool.query("select relrowsecurity from pg_class where oid=$1::regclass",['private.'+table])).rows[0].relrowsecurity,'RLS is enabled on '+table);
      for(const role of ['anon','authenticated','pinevela_backend','pinevela_catalog']){
        check(!(await db.pool.query('select has_table_privilege($1,$2,\'select,insert,update,delete\') as granted',[role,'private.'+table])).rows[0].granted,role+' has no grants on '+table);
        await assert.rejects(db.system(async c=>{await c.query('set local role '+role);await c.query('select * from private.'+table);}),e=>(e as any).code==='42501');checks++;
      }
    }
    check((await db.pool.query("select bool_and(not prosecdef) as invoker from pg_proc where oid in('private.queue_device_push()'::regprocedure,'private.wake_device_push_catalog()'::regprocedure)")).rows[0].invoker,'New triggers retain invoker rights');
    check((await db.pool.query('select count(*)::int as n from private.device_push_jobs')).rows[0].n===0,'Migration never queues historical alerts');
    Object.assign(process.env,{SUPABASE_URL:provider,SUPABASE_ANON_KEY:'sb_publishable_local_device_fixture',NODE_ENV:'development'});
    globalThis.fetch=(async(input:any,options:any={})=>{
      const url=new URL(String(input));
      if(url.origin===provider){const bearer=new Headers(options.headers).get('authorization')?.replace(/^Bearer /,'');
        if(url.pathname==='/auth/v1/user')return new Response(JSON.stringify(identities.get(bearer||'')||{}),{status:identities.has(bearer||'')?200:401,headers:{'Content-Type':'application/json'}});
        if(url.pathname==='/auth/v1/logout')return new Response('{}',{headers:{'Content-Type':'application/json'}});
      }
      if(url.hostname==='127.0.0.1')return realFetch(input,options);
      throw Error('Cloud network calls are forbidden in isolated push verification');
    }) as typeof fetch;
    const auth=new SupabaseAuth(db),app=express();app.use(express.json());app.use(csrfBoundary);installSupabaseAuth(app,auth);installDevicePush(app,auth);
    app.use((e:any,_q:any,s:any,_next:any)=>s.status(e.status||500).json({error:e instanceof ApiError?e.message:'Test operation failed',code:e.code}));
    server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
    async function fixture(kind='primary',contextId?:string,pin?:string){
      if(!contextId){const id=crypto.randomUUID();await db.pool.query(`insert into auth.users(id,email,role,aud,email_confirmed_at,is_anonymous,raw_user_meta_data,created_at,updated_at)
        values($1,$2,'authenticated','authenticated',now(),false,'{"name":"Isolated Device Push"}',now(),now())`,[id,'push-'+id+'@test.edu.gh']);
        contextId=(await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[id])).rows[0].id;}
      const row=(await db.pool.query(`select c.*,u.email from public.account_contexts c join auth.users u on u.id=c.auth_user_id where c.id=$1`,[contextId])).rows[0];
      const sessionId=crypto.randomUUID();await db.pool.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessionId,row.auth_user_id]);
      const token='test.'+Buffer.from(JSON.stringify({sub:row.auth_user_id,session_id:sessionId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.local-fixture';
      identities.set(token,{id:row.auth_user_id,email:row.email,is_anonymous:false,email_confirmed_at:new Date().toISOString()});
      const actor=await auth.bind({access_token:token,refresh_token:'fixture-only'},kind,pin);
      await db.authorizedSystem(actor,[kind],c=>recordTermsAcceptance(c,actor,termsAcceptance(true),'account_gate'));
      return{actor,cookie:'pv_sb_access='+token,token};
    }
    type Fixture=Awaited<ReturnType<typeof fixture>>;
    const managerContext=(await db.pool.query("select id,primary_owner_id from public.account_contexts where kind='manager' and status='active' limit 1")).rows[0];assert(managerContext);
    const primaryContext=(await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary' and status='active'",[managerContext.primary_owner_id])).rows[0].id;
    const owner=await fixture('primary',primaryContext),manager=await fixture('manager',managerContext.id),foreign=await fixture();
    async function call(path:string,f?:Fixture,body?:any,extra:Record<string,string>={}){
      const r=await realFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(f?{cookie:f.cookie,'X-PineVela-Profile-Context':f.actor.contextId}:{}),
        ...(body===undefined?{}:{'Content-Type':'application/json',origin}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
      return{status:r.status,data:await r.json().catch(()=>null)};
    }
    const capability=()=>({installationId:crypto.randomUUID(),installationSecret:crypto.randomBytes(32).toString('base64url'),platform:'android',token:crypto.randomBytes(48).toString('base64url'),accountAlerts:true,marketplace:false,residences:false});
    const device=capability(),proof={'X-PineVela-Push-Installation':device.installationId,'X-PineVela-Push-Key':device.installationSecret};
    const register=(f:Fixture,input:any)=>db.authorizedSystem(f.actor,[f.actor.kind],c=>registerDevicePush(c,f.actor,input));
    const saved=()=>db.authorizedRead(owner.actor,['primary'],c=>devicePushStatus(c,owner.actor,device.installationId,device.installationSecret));
    stage='actual registration and account authorization';
    check((await call('/api/device-push/register',undefined,device)).status===401,'Anonymous subscription is denied');
    check((await call('/api/device-push/register',owner,{...device,contextId:foreign.actor.contextId})).status===400,'Body recipient spoofing is rejected');
    check((await call('/api/device-push/register',owner,device,{'X-PineVela-Profile-Context':foreign.actor.contextId})).status===409,'Stale account header is rejected');
    check((await call('/api/device-push/register',owner,device,{origin:'https://foreign.invalid'})).status===403,'Cross-origin subscription is rejected');
    const browserKeys=crypto.createECDH('prime256v1');browserKeys.generateKeys();
    const browserDevice={...capability(),platform:'web',token:undefined,subscription:{
      endpoint:'https://jmt17.google.com/fcm/send/local-chromium-fixture',expirationTime:null,
      keys:{p256dh:browserKeys.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')},
    }};
    const browserProof={'X-PineVela-Push-Installation':browserDevice.installationId,'X-PineVela-Push-Key':browserDevice.installationSecret};
    check((await call('/api/device-push/register',undefined,browserDevice)).status===401,'Chromium subscription still requires a verified login');
    check((await call('/api/device-push/register',owner,{...browserDevice,contextId:foreign.actor.contextId})).status===400,'Chromium subscription cannot choose another account in its body');
    check((await call('/api/device-push/register',owner,browserDevice,{'X-PineVela-Profile-Context':foreign.actor.contextId})).status===409,'Chromium subscription rejects a different active account header');
    check((await call('/api/device-push/register',owner,{...browserDevice,subscription:{...browserDevice.subscription,endpoint:'https://jmt17.google.com.evil.invalid/fcm/send/local-fixture'}})).status===400,'Lookalike Chromium push hosts are rejected by the actual API');
    check((await call('/api/device-push/register',owner,{...browserDevice,subscription:{...browserDevice.subscription,endpoint:'https://127.0.0.1/fcm/send/local-fixture'}})).status===400,'Private-network push endpoints are rejected by the actual API');
    check((await call('/api/device-push/register',owner,browserDevice)).status===200,'Verified Chrome/Chromium account registers its original Google push endpoint');
    check((await call('/api/device-push/status',owner,undefined,browserProof)).data.registered,'Chromium device binding is available to its own authenticated account');
    check((await db.pool.query('select endpoint from private.device_push_installations where id=$1',[browserDevice.installationId])).rows[0].endpoint.endpoint===browserDevice.subscription.endpoint,'Chromium subscription endpoint is stored unchanged');
    check((await call('/api/device-push/disconnect',owner,{installationId:browserDevice.installationId,installationSecret:browserDevice.installationSecret})).status===200,'Chromium test installation disconnects without affecting other devices');
    const historical=await db.system(c=>notify(c,[owner.actor.contextId],{category:'verification',title:'Old alert',message:'Never backfill this alert.'}));
    check((await call('/api/device-push/register',owner,device)).status===200,'Verified account enables its own device');
    check((await saved()).registered,'Own device status is available');
    check(!(await db.pool.query('select 1 from private.device_push_jobs where notification_id=$1',[historical])).rowCount,'Enabling does not backfill old notifications');
    check(!(await call('/api/device-push/status',owner,undefined,proof)).data.accounts.some((a:any)=>a.contextId===manager.actor.contextId),'A linked manager is not connected before authenticating that portal');
    await register(manager,device);check((await saved()).accounts.length===2,'A separately verified manager can share its primary owner device');
    const status=await call('/api/device-push/status',owner,undefined,proof);
    check(status.status===200&&!JSON.stringify(status.data).includes(device.token)&&!JSON.stringify(status.data).includes(device.installationSecret),'Status never exposes device credentials or tokens');
    check((await call('/api/device-push/status',foreign,undefined,proof)).data.connected===false,'Another person cannot read connected account identities');
    await assert.rejects(register(foreign,{...device,installationSecret:crypto.randomBytes(32).toString('base64url')}),e=>(e as any).status===403);checks++;
    await assert.rejects(register(foreign,{...capability(),token:device.token}),e=>(e as any).status===409);checks++;
    const sent:any[]=[];const deliver=async()=>processPushBatch(db,async(platform,endpoint,message)=>{sent.push({platform,message});return{state:'sent' as const,code:'captured_fixture'};});
    stage='all existing account alerts and transaction rollback';
    let rolled:string|undefined;
    await assert.rejects(db.system(async c=>{rolled=await notify(c,[owner.actor.contextId],{category:'verification',title:'Rolled back',message:'Local only'});throw Error('rollback');}));
    check(!(await db.pool.query('select 1 from private.device_push_jobs where notification_id=$1',[rolled])).rowCount,'Rolled-back workflows cannot leak notifications');
    const secret='123456-PRIVATE-FIXTURE-KEY';
    const n=await db.system(c=>notify(c,[owner.actor.contextId,manager.actor.contextId],{category:'issue_report',title:'Maintenance updated',message:'Private details '+secret}));
    await deliver();const messages=sent.filter(s=>s.message.notificationId===n);
    check(messages.length===2,'One shared device receives separately labelled primary and manager alerts');
    check(messages.some(s=>s.message.accountKind==='manager')&&messages.some(s=>s.message.accountKind==='primary'),'Delivered messages identify the receiving account type');
    check(!JSON.stringify(sent).includes(secret),'Private message contents and keys never enter a device payload');
    check(!(await db.pool.query('select read_at from public.notification_recipients where notification_id=$1',[n])).rows.some(r=>r.read_at),'Device delivery does not mark in-app alerts read');
    check((await call('/api/device-push/open/'+n,foreign)).status===404,'Another account cannot open the private alert');
    check((await call('/api/device-push/open/'+n,owner)).data.message.includes(secret),'Authorized account can read full details only inside the app');
    check(await deliver()===0,'Settled delivery jobs are not replayed');
    check((await call('/api/device-push/test',owner,{},proof)).status===200,'Own authenticated test queues a message');
    check((await call('/api/device-push/test',foreign,{},proof)).status===409,'A different account cannot send through another account binding');await deliver();
    stage='administrator and verification role delivery';
    for(const kind of ['admin','officer']){
      const ctx=(await db.pool.query("select id from public.account_contexts where kind=$1 and status='active' limit 1",[kind])).rows[0];assert(ctx);
      const f=await fixture(kind,ctx.id);await register(f,capability());
      const id=await db.system(c=>notify(c,[f.actor.contextId],{category:'verification',title:'Role alert',message:'Private local role fixture'}));await deliver();
      check(sent.some(s=>s.message.notificationId===id&&s.message.title.includes(PUSH_ACCOUNT_LABELS[kind])),kind+' receives its own verified role label');
      if(kind==='admin'){
        const supportNotice=await db.system(c=>notify(c,[f.actor.contextId],{category:'support',title:'Support alert',message:'Private support fixture',link:'/customer-service?ticket='+crypto.randomUUID()}));await deliver();
        check(sent.some(s=>s.message.notificationId===supportNotice&&s.message.accountKind==='feedback'),'Customer-service alerts identify the feedback account workspace');
      }
    }
    const deniedSupport=await db.system(c=>notify(c,[owner.actor.contextId],{category:'support',title:'Revoked support fixture',message:'Local only',link:'/customer-service?ticket='+crypto.randomUUID()}));await deliver();
    check(!sent.some(s=>s.message.notificationId===deniedSupport)&&(await call('/api/device-push/open/'+deniedSupport,owner)).status===404,'An account without support-operator access cannot receive or open operator details');
    stage='discovery opt-in, approval and device deduplication';
    const residence=(await db.pool.query("insert into public.residences(primary_owner_id,name,status) values($1,'Isolated Push Residence','pending') returning id",[managerContext.primary_owner_id])).rows[0].id;
    await db.pool.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager.actor.contextId,residence]);
    check(await db.system(c=>discoverPushPublications(c))===0,'An unapproved residence never broadcasts');
    await register(owner,{...device,residences:true});await register(manager,{...device,residences:true});
    await db.system(async c=>{
      await c.query("update public.residences set status='approved',setup_submitted_at=now() where id=$1",[residence]);
      await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status,submitted_data) values($1,$2,'residence_registration','approved','{\"fixture\":true}')",[manager.actor.contextId,residence]);
    });
    check(await db.system(c=>discoverPushPublications(c))===1,'A newly approved public residence creates one discovery');await deliver();
    const publication=(await db.pool.query('select notification_id from private.device_push_publications where subject_id=$1',[residence])).rows[0];
    const discovery=sent.filter(s=>s.message.notificationId===publication.notification_id);
    check(discovery.length===1,'Discovery is deduplicated across the same device accounts');
    check(discovery[0].message.image.endsWith('/residence/'+residence+'.jpg'),'Discovery includes the current public residence thumbnail route');
    check(!(await db.pool.query('select 1 from public.notification_recipients where notification_id=$1 and context_id=$2',[publication.notification_id,foreign.actor.contextId])).rowCount,'Accounts without discovery opt-in do not receive discovery');
    await db.pool.query("update public.residences set name='Edited public title' where id=$1",[residence]);
    check(await db.system(c=>discoverPushPublications(c))===0,'Editing a published property does not broadcast it again');
    check((await call('/api/device-push/open/'+publication.notification_id,owner)).data.destination==='/pineresidence?property='+residence,'Discovery taps open the exact public listing');
    check((await call('/api/device-push/images/residence/'+residence+'.jpg')).status===404,'No nonexistent or private photo is exposed through the thumbnail route');
    stage='seller, resident and staff session grants';
    async function enrolledIdentity(kind:string,root:Fixture){
      const id=crypto.randomUUID(),nonce=crypto.randomBytes(32).toString('hex'),email=kind+'-'+id+'@st.knust.edu.gh';
      await db.pool.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
        values($1,$2,$3,$4,$5,'{"displayName":"Isolated Push Portal","phone":"+233241234567"}',now()+interval '1 day')`,
        [root.actor.contextId,root.actor.authUserId,kind,email,crypto.createHash('sha256').update(nonce).digest('hex')]);
      await db.pool.query(`insert into auth.users(id,email,role,aud,email_confirmed_at,is_anonymous,raw_user_meta_data,created_at,updated_at)
        values($1,$2,'authenticated','authenticated',now(),false,$3,now(),now())`,[id,email,JSON.stringify({pinevela_enrollment_token:nonce})]);
      const ctx=(await db.pool.query('select id from public.account_contexts where auth_user_id=$1 and kind=$2',[id,kind])).rows[0].id;
      // Local domain approval fixtures only. No protocol trigger is disabled.
      await db.pool.query("update public.account_contexts set status='active' where id=$1",[ctx]);
      await db.pool.query("update private.account_enrollments set status='completed',verified_at=now() where linked_context_id=$1",[ctx]);
      return ctx;
    }
    const sellerOwner=await fixture(),sellerContext=await enrolledIdentity('seller',sellerOwner),pin='123456';
    await db.pool.query('insert into private.portal_access_keys(context_id,pin_hash) values($1,$2)',[sellerContext,await hashPortalPin(pin)]);
    const seller=await fixture('seller',sellerContext,pin),sellerDevice=capability();await register(seller,sellerDevice);
    const sellerNotice=await db.system(c=>notify(c,[seller.actor.contextId],{category:'market',title:'Seller alert',message:'Local seller fixture'}));await deliver();
    check(sent.some(s=>s.message.notificationId===sellerNotice&&s.message.accountKind==='seller'),'A PIN-verified seller receives its own account alert');
    const afterPin=await db.system(c=>notify(c,[seller.actor.contextId],{category:'market',title:'PIN rotation fixture',message:'Local only'}));
    await db.pool.query('update private.portal_access_keys set pin_hash=$2 where context_id=$1',[sellerContext,await hashPortalPin('654321')]);await deliver();
    check(!sent.some(s=>s.message.notificationId===afterPin),'Rotating a portal PIN invalidates its older push grant');
    const residentOwner=await fixture(),residentContext=await enrolledIdentity('resident',residentOwner);
    const block=(await db.pool.query("insert into public.blocks(residence_id,name) values($1,'Push fixture block') returning id",[residence])).rows[0].id;
    const floor=(await db.pool.query('insert into public.floors(block_id,floor_number) values($1,1) returning id',[block])).rows[0].id;
    const room=(await db.pool.query("insert into public.rooms(floor_id,room_number) values($1,'P1') returning id",[floor])).rows[0].id;
    const bed=(await db.pool.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[room])).rows[0].id;
    const allocation=(await db.pool.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id',[residentContext,room,bed])).rows[0].id;
    const resident=await fixture('resident',residentContext);await register(resident,capability());
    const residentNotice=await db.system(c=>notify(c,[resident.actor.contextId],{category:'issue_report',title:'Resident maintenance alert',message:'Private room fixture'}));await deliver();
    check(sent.some(s=>s.message.notificationId===residentNotice&&s.message.accountKind==='resident'),'An allocated resident receives its own maintenance alert');
    const afterRelease=await db.system(c=>notify(c,[resident.actor.contextId],{category:'issue_report',title:'Released allocation fixture',message:'Local only'}));
    await db.pool.query('update public.allocations set ended_at=clock_timestamp() where id=$1',[allocation]);await deliver();
    check(!sent.some(s=>s.message.notificationId===afterRelease),'Ending a room allocation stops its older resident push grant');
    const staffNonce=crypto.randomBytes(32).toString('hex'),staffId=crypto.randomUUID(),staffEmail='staff-'+staffId+'@test.edu.gh',staffSession=crypto.randomUUID();
    await db.authorizedSystem(manager.actor,['manager'],c=>reserveStaffInvitation(c,manager.actor,{hostelId:residence,name:'Isolated Push Staff',email:staffEmail,phone:'+233241234567',role:'Maintenance'},staffNonce));
    await db.pool.query(`insert into auth.users(id,email,role,aud,email_confirmed_at,is_anonymous,raw_user_meta_data,created_at,updated_at)
      values($1,$2,'authenticated','authenticated',now(),false,$3,now(),now())`,[staffId,staffEmail,JSON.stringify({pinevela_enrollment_token:staffNonce})]);
    await db.pool.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[staffSession,staffId]);
    const employment=await db.system(c=>finishStaffInvitation(c,staffNonce,{authUserId:staffId,sessionId:staffSession,email:staffEmail}));
    const staffContext=(await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='staff'",[staffId])).rows[0].id;
    const staff=await fixture('staff',staffContext);await register(staff,capability());
    const staffNotice=await db.system(c=>notify(c,[staff.actor.contextId],{category:'issue_report',title:'Staff maintenance alert',message:'Private staff fixture'}));await deliver();
    check(sent.some(s=>s.message.notificationId===staffNotice&&s.message.accountKind==='staff'),'A manager-invited staff account receives its own maintenance alert');
    const afterDeparture=await db.system(c=>notify(c,[staff.actor.contextId],{category:'issue_report',title:'Employment ended fixture',message:'Local only'}));
    await db.pool.query("update public.staff_assignments set status='removed',ended_at=clock_timestamp() where id=$1",[employment.staffId]);await deliver();
    check(!sent.some(s=>s.message.notificationId===afterDeparture),'Staff departure stops its older device notification grant');
    stage='public thumbnail rendering and publication recheck';
    const imageId=crypto.randomUUID(),image=await sharp({create:{width:1200,height:900,channels:3,background:'#003566'}}).png().toBuffer();
    await db.pool.query(`insert into public.media_assets(id,owner_context_id,owner_auth_user_id,purpose,object_path,byte_size,sha256,state)
      values($1,$2,$3,'hostel',$4,$5,$6,'ready')`,[imageId,manager.actor.contextId,manager.actor.authUserId,'contexts/'+manager.actor.contextId+'/'+imageId+'.png',image.length,crypto.createHash('sha256').update(image).digest('hex')]);
    await db.pool.query("update public.residences set cover_path='/api/media/'||$2::text where id=$1",[residence,imageId]);
    const download=SupabaseStorage.prototype.download;let imageDownloads=0;
    SupabaseStorage.prototype.download=async()=>{imageDownloads++;return image;};
    try{
      const photo=await realFetch(origin+'/api/device-push/images/residence/'+residence+'.jpg');
      const bytes=Buffer.from(await photo.arrayBuffer()),metadata=await sharp(bytes).metadata();
      check(photo.status===200&&metadata.format==='jpeg'&&metadata.width!<=640&&metadata.height!<=400&&bytes.length<500000,'Currently public photo becomes a bounded notification JPEG');
      check(photo.headers.get('cache-control')==='private, no-cache','Thumbnail response requires publication revalidation');
      await realFetch(origin+'/api/device-push/images/residence/'+residence+'.jpg');check(imageDownloads===1,'Unchanged public thumbnails reuse bounded server memory cache');
      await db.pool.query("update public.residences set status='suspended' where id=$1",[residence]);
      check((await realFetch(origin+'/api/device-push/images/residence/'+residence+'.jpg')).status===404,'Withdrawing publication hides even a cached thumbnail immediately');
      await db.pool.query("update public.residences set status='approved' where id=$1",[residence]);
    }finally{SupabaseStorage.prototype.download=download;}
    stage='live revocation and preference checks';
    const revokeProbe=async(change:(f:Fixture,p:any)=>Promise<void>,label:string)=>{
      const f=await fixture(),p=capability();await register(f,p);
      const id=await db.system(c=>notify(c,[f.actor.contextId],{category:'verification',title:'Revocation fixture',message:'Local only'}));
      await change(f,p);await deliver();check(!sent.some(s=>s.message.notificationId===id),label);
    };
    await revokeProbe(async f=>{await db.pool.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[f.actor.sessionId]);},'An expired provider session stops pending push delivery');
    await revokeProbe(async f=>{await db.pool.query("update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=$1",[f.actor.authUserId]);},'A provider-banned identity stops pending push delivery');
    await revokeProbe(async f=>{await db.pool.query('delete from private.account_sessions where session_id=$1',[f.actor.sessionId]);},'A revoked app session stops pending push delivery');
    await revokeProbe(async(_f,p)=>{await db.pool.query("update private.device_push_installations set expires_at=clock_timestamp()-interval '1 second' where id=$1",[p.installationId]);},'An expired device grant stops pending push delivery');
    await revokeProbe(async(f,p)=>{await register(f,{...p,accountAlerts:false});},'Turning off account alerts stops pending delivery');
    const rotated=await fixture(),rotatedDevice=capability();await register(rotated,rotatedDevice);
    const rotationNotice=await db.system(c=>notify(c,[rotated.actor.contextId],{category:'verification',title:'Token rotation fixture',message:'Local only'}));
    const rotationJob=(await db.system(c=>claimPushJobs(c,1)))[0];assert(rotationJob);
    await db.system(c=>finishPushJob(c,rotationJob.id,rotationJob.lease_id,{state:'invalid',code:'fcm_unregistered'}));
    const renewable=await db.authorizedRead(rotated.actor,['primary'],c=>devicePushStatus(c,rotated.actor,rotatedDevice.installationId,rotatedDevice.installationSecret));
    check(renewable.connected&&!renewable.registered,'An expired provider token retains a verified device grant for automatic token renewal');
    await register(rotated,{...rotatedDevice,token:crypto.randomBytes(48).toString('base64url')});
    check((await db.authorizedRead(rotated.actor,['primary'],c=>devicePushStatus(c,rotated.actor,rotatedDevice.installationId,rotatedDevice.installationSecret))).registered,'A newly issued provider token reconnects the same authenticated installation');
    stage='leases, retries, disable and shared device transfer';
    const retryNotice=await db.system(c=>notify(c,[manager.actor.contextId],{category:'verification',title:'Retry fixture',message:'Local only'}));
    const job=(await db.system(c=>claimPushJobs(c,1)))[0];assert(job);
    check((await db.system(c=>claimPushJobs(c,1))).length===0,'Concurrent claims do not take a live lease twice');
    await db.system(c=>finishPushJob(c,job.id,crypto.randomUUID(),{state:'sent',code:'wrong_lease'}));
    check((await db.pool.query('select state from private.device_push_jobs where id=$1',[job.id])).rows[0].state==='processing','A stale worker cannot settle another lease');
    await db.system(c=>finishPushJob(c,job.id,job.lease_id,{state:'retry',code:'local_retry'}));
    const retry=(await db.pool.query('select state,available_at>clock_timestamp() as delayed from private.device_push_jobs where id=$1',[job.id])).rows[0];
    check(retry.state==='pending'&&retry.delayed,'Provider failures back off without a client polling loop');
    check((await call('/api/device-push/disconnect',undefined,{installationId:device.installationId,installationSecret:crypto.randomBytes(32).toString('base64url')})).status===200,'Invalid revocation proof reveals no installation status');
    check((await saved()).connected,'Wrong revocation proof cannot disconnect another installation');
    await register(foreign,{...device,keepExistingAccounts:true});
    check((await db.pool.query('select count(*)::int as n from private.device_push_bindings where installation_id=$1',[device.installationId])).rows[0].n===3,'An explicit keep choice can connect independently verified logins on one device');
    check((await call('/api/device-push/open/'+n,foreign)).status===404,'Keeping device notifications never grants another account private-content access');
    const newPerson=await fixture();
    await register(newPerson,device);check(!(await db.pool.query('select 1 from private.device_push_bindings where installation_id=$1 and context_id=any($2::uuid[])',[device.installationId,[owner.actor.contextId,manager.actor.contextId,foreign.actor.contextId]])).rowCount,'Default transfer to a different person removes all former account bindings');
    check(!(await db.pool.query('select 1 from private.device_push_jobs where notification_id=$1',[retryNotice])).rowCount,'Transfer removes the previous person pending deliveries');
    const changed=await call('/api/auth/logout',newPerson,{},proof);check(changed.status===200,'Actual logout succeeds with a device capability');
    check(!(await db.pool.query('select enabled from private.device_push_installations where id=$1',[device.installationId])).rows[0].enabled,'Confirmed logout durably disconnects this installation');
    check(!(await db.pool.query('select 1 from private.device_push_bindings where installation_id=$1',[device.installationId])).rowCount,'Session logout cascades the exact authenticated binding');
    check((await call('/api/device-push/open/'+n,owner)).status===200,'Another person logout preserves unrelated verified sessions');
    const securityFiles=['supabase/devicePush.ts','supabase/devicePushWorker.ts','supabase/devicePushProvider.ts','supabase/auth.ts','devicePushPolicy.ts','supabase/migrations/20261105110000_device_push_delivery.sql'];
    const sourceSha256=Object.fromEntries(securityFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
    const sqlEditorSha256=process.env.PINEVELA_PUSH_SQL?crypto.createHash('sha256').update(fs.readFileSync(process.env.PINEVELA_PUSH_SQL)).digest('hex'):null;
    const report={passed:true,checks,labels,sourceSha256,sqlEditorSha256,realRestoredPostgres:true,actualHttpHandlers:true,providerReplies:'explicit local identity fixtures',
      capturedPushPayloads:sent.length,cloudMessagesSent:0,cloudDatabaseWrites:0,liveDeviceDeliveryVerified:false};
    fs.mkdirSync(evidenceDirectory,{recursive:true});
    fs.writeFileSync(evidenceDirectory+'/database-http-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,labels:undefined}));
    fs.rmSync('.security/push/verification-failure.json',{force:true});
  }finally{globalThis.fetch=realFetch;if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}await db.close();}
});}catch(error:any){
  fs.writeFileSync('.security/push/verification-failure.json',JSON.stringify({stage,checks,code:error?.code,message:error?.message},null,2)+'\n',{mode:0o600});
  console.error(JSON.stringify({passed:false,stage,checks,privateDiagnostics:'.security/push/verification-failure.json'}));process.exitCode=1;
}
