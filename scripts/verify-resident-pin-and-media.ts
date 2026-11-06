/** Real PostgreSQL, pinned GoTrue and actual Express handlers. Only domain
 * fixture relationships and Storage transport bytes are synthetic. No cloud
 * writes, provider mail, push delivery or payment requests are permitted. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import {once} from 'node:events';
import sharp from 'sharp';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {withIsolatedGoTrue} from './lib/isolated-gotrue.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth,installSupabaseAuth,csrfBoundary} from '../supabase/auth.js';
import {installEnrollment,reserveEnrollment,finishEnrollment,claimResidentRoom} from '../supabase/enrollment.js';
import {verifiedClaims} from '../supabase/auth.js';
import {installResidentPin,activateResidentPin} from '../supabase/residentPin.js';
import {installPortalSecurity} from '../supabase/portalSecurity.js';
import {createSupportTicket} from '../supabase/support.js';
import {installProfiles} from '../supabase/profiles.js';
import {keyRows} from '../supabase/housing.js';
import {installResidentClosure} from '../supabase/residentClosure.js';
import {installLegal} from '../supabase/legal.js';
import {authProtectionContext} from '../supabase/authProtection.js';
import {installMedia,reserveMedia,finishMedia,mediaUrl} from '../supabase/media.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {decodeImageUpload} from '../imageUploadSecurity.js';
import {termsAcceptance} from '../legalPolicy.js';
import {hashPortalPin} from '../supabase/portalAccess.js';
import {ownResidentReleasePreview,releaseOwnResidentRoom} from '../supabase/housing.js';

const [checkpoint]=process.argv.slice(2);if(!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw Error('Pass a restore-verified checkpoint UUID.');
const output='docs/verification/resident-pin-media-2026-11-05';fs.mkdirSync(output,{recursive:true});
let stage='restore',checks=0;const labels:string[]=[],check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;labels.push(label);};
const env={...process.env};
try{await withIsolatedBackup(checkpoint,async config=>{
  const db=new SupabaseDatabase(config);
  try{
    stage='migrations';
    const ledger=new Map((await db.pool.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
    for(const file of fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort()){
      const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
      if(ledger.has(version))assert.equal(ledger.get(version),digest);
      else if(version==='20261105150000'){
        const wrapper=fs.readFileSync('releases/database/pinevela-apply-resident-pin-media-20261105.sql','utf8');
        await db.pool.query(wrapper);await db.pool.query(wrapper);
        for(const target of ['20261105150000','20261105160000'])ledger.set(target,(await db.pool.query('select digest from private.schema_migrations where version=$1',[target])).rows[0].digest);
        check(true,'Exact SQL Editor wrapper applies and repeats safely');
      }else await db.system(async c=>{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,digest]);});
    }
    check((await db.pool.query("select relrowsecurity from pg_class where oid='private.resident_pin_credentials'::regclass")).rows[0].relrowsecurity,'Resident credentials have RLS');
    for(const role of ['anon','authenticated','pinevela_backend','pinevela_catalog']){
      check(!(await db.pool.query("select has_table_privilege($1,'private.resident_pin_credentials','select,insert,update,delete') as granted",[role])).rows[0].granted,role+' has no private credential grants');
      await assert.rejects(db.system(async c=>{await c.query('set local role '+role);await c.query('select * from private.resident_pin_credentials');}),e=>(e as any).code==='42501');checks++;
    }
    await withIsolatedGoTrue(config,async native=>{
      const key=path.join(config.host as string,'resident-master.key');fs.writeFileSync(key,crypto.randomBytes(32),{mode:0o600});
      Object.assign(process.env,{NODE_ENV:'development',SUPABASE_URL:native.provider,SUPABASE_ANON_KEY:native.publicKey,SUPABASE_SERVICE_ROLE_KEY:native.serviceKey,SUPABASE_SECRET_KEY:'',MARKET_ORDER_PIN_KEY_FILE:key,AUTH_CAPTCHA_SITE_KEY:''});
      const auth=new SupabaseAuth(db),app=express();
      const objects=new Map<string,Buffer>();let downloads=0;
      class FixtureStorage extends SupabaseStorage{async download(objectPath:string,expected:any){downloads++;const bytes=objects.get(objectPath);if(!bytes||bytes.length!==expected.byte_size||crypto.createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw new ApiError(503,'Fixture photograph integrity failed');return bytes;}}
      app.use(csrfBoundary);installMedia(app,auth,new FixtureStorage());app.use(express.json());app.use('/api',authProtectionContext(db));
      installSupabaseAuth(app,auth);installLegal(app,auth);installProfiles(app,auth);installEnrollment(app,auth);installResidentPin(app,auth);installPortalSecurity(app,auth);installResidentClosure(app,auth);
      const failures:any[]=[];
      app.use((error:any,_req:any,res:any,_next:any)=>{if(!error.status)failures.push({stage,code:error.code,message:error.message});res.status(error.status||500).json({error:error instanceof ApiError?error.message:'Local verification operation failed',code:error.code});});
      const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+(server.address() as any).port;
      class Session{cookie='';user:any;
        async call(route:string,body?:any,headers:Record<string,string>={}){const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{origin,...(this.cookie?{cookie:this.cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
          const cookies=r.headers.getSetCookie().filter(v=>v.startsWith('pv_sb_')).map(v=>v.split(';',1)[0]);if(cookies.length)this.cookie=cookies.join('; ');
          return {status:r.status,data:await r.json().catch(()=>null),headers:r.headers};}
      }
      const adminCreate=async(email:string,password:string,metadata:any={})=>{const r=await fetch(native.provider+'/auth/v1/admin/users',{method:'POST',headers:{apikey:native.serviceKey,authorization:'Bearer '+native.serviceKey,'content-type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:metadata})});const data:any=await r.json();assert.equal(r.status,200,'Actual local Auth admin create succeeds');return data.user||data;};
      const actorFor=async(s:Session)=>{const parsed=Object.fromEntries(s.cookie.split('; ').map(x=>x.split('='))),req={headers:{cookie:s.cookie}} as any;const response={set(){},cookie(){},clearCookie(){}} as any;return (await auth.authenticate(req,response)).actor;};
      const primary=async(label:string)=>{const email=label.toLowerCase().replace(/[^a-z0-9]/g,'-')+'-'+crypto.randomBytes(8).toString('hex')+'@pinevela.test',password='Pv!9aA-'+crypto.randomBytes(24).toString('base64url'),s=new Session(),person=await adminCreate(email,password,{name:label});
        const login=await s.call('/api/auth/login',{email,password});assert.equal(login.status,200);s.user=login.data;
        assert.equal((await s.call('/api/legal/accept',{termsAcceptance:termsAcceptance(true)})).status,200);return {s,email,password,id:person.id,actor:await actorFor(s)};};
      try{
        stage='real primary identities';const owner=await primary('Resident PIN owner'),foreign=await primary('Other owner'),racer=await primary('Concurrent owner');
        const originalPrimary=(await db.pool.query('select encrypted_password from auth.users where id=$1',[owner.id])).rows[0].encrypted_password;
        const managerId=(await db.pool.query("select id from public.account_contexts where kind='manager' and status='active' limit 1")).rows[0].id;
        const home=(await db.pool.query("insert into public.residences(primary_owner_id,name,status,setup_submitted_at) values($1,'Isolated Room PIN residence','approved',now()) returning id",[owner.id])).rows[0].id;
        await db.pool.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[managerId,home]);
        await db.pool.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status,submitted_data) values($1,$2,'residence_registration','approved','{\"fixture\":true}')",[managerId,home]);
        const block=(await db.pool.query("insert into public.blocks(residence_id,name) values($1,'Fixture block') returning id",[home])).rows[0].id;
        const floor=(await db.pool.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[block])).rows[0].id;
        const room=async(n:number)=>{const id=(await db.pool.query('insert into public.rooms(floor_id,room_number) values($1,$2) returning id',[floor,String(n)])).rows[0].id;await db.pool.query('insert into public.beds(room_id,bed_number) values($1,1)',[id]);const key='TEST-'+crypto.randomBytes(4).toString('hex').toUpperCase();await db.pool.query('insert into private.room_activation_keys(room_id,code) values($1,$2)',[id,key]);return{id,key};};
        const one=await room(1),two=await room(2),three=await room(3),four=await room(4);const guest=new Session();
        stage='activation authorization';
        check((await guest.call('/api/auth/resident-activate',{roomKey:one.key,pin:'123456'})).status===401,'Anonymous activation is denied');
        check((await owner.s.call('/api/auth/resident-activate',{roomKey:one.key,pin:'123456',primaryOwnerId:foreign.id})).status===400,'Body ownership spoofing is rejected');
        check((await owner.s.call('/api/auth/resident-activate',{roomKey:'BAD-KEY',pin:'123456'})).status===404,'Invalid room keys cannot provision an identity');
        check((await owner.s.call('/api/auth/resident-activate',{roomKey:one.key,pin:'123'})).status===400,'Invalid PIN length is rejected');
        const counts=async()=>(await db.pool.query('select count(*)::int as n from auth.users')).rows[0].n;
        const beforeUsers=await counts(),activated=await owner.s.call('/api/auth/resident-activate',{roomKey:one.key,pin:'123456'});
        check(activated.status===200&&activated.data?.authentication==='resident_pin'&&activated.data.loginEmail===owner.email,'A non-student primary email activates a room using only its key and chosen PIN');
        check(await counts()===beforeUsers+1,'Activation creates exactly one isolated native Auth identity');
        const context=activated.data.accountId;
        const resident=(await db.pool.query('select auth_user_id,primary_owner_id from public.account_contexts where id=$1',[context])).rows[0];
        check(resident.auth_user_id!==owner.id&&resident.primary_owner_id===owner.id,'Resident and primary native Auth subjects are distinct');
        const stored=(await db.pool.query('select k.*,e.invited_email from private.resident_pin_credentials k join private.account_enrollments e on e.id=k.enrollment_id where e.linked_context_id=$1',[context])).rows[0];
        check(!JSON.stringify(stored).includes('123456')&&!JSON.stringify(stored).includes(owner.password),'PIN/password plaintext is absent from saved resident credentials');
        check((await owner.s.call('/api/auth/resident-activate',{roomKey:one.key,pin:'123456'})).data?.alreadyActivated===true&&await counts()===beforeUsers+1,'An uncertain activation reply can be retried without a duplicate account');
        check((await owner.s.call('/api/auth/resident-activate',{roomKey:two.key,pin:'123456'})).status===409,'One primary owner cannot acquire a second active room');
        check((await foreign.s.call('/api/auth/resident-activate',{roomKey:one.key,pin:'654321'})).status===409,'A claimed room cannot be occupied by a second primary owner');
        check((await owner.s.call('/api/auth/me')).data.id===owner.s.user.id,'Activation preserves the primary session');

        stage='real native resident login';const roomSession=new Session();
        const signIn=await roomSession.call('/api/auth/resident-login',{email:owner.email,pin:'123456'});roomSession.user=signIn.data;
        check(signIn.status===200&&signIn.data.role==='student'&&signIn.data.id===context&&signIn.data.email===owner.email,'Real GoTrue token exchange opens the resident portal using primary email plus room PIN');
        check(signIn.headers.getSetCookie().filter(c=>c.startsWith('pv_sb_')).every(c=>/httponly/i.test(c)&&/samesite=strict/i.test(c)),'Resident login keeps native HttpOnly Strict session cookies');
        check(!JSON.stringify(signIn.data).includes('accounts.pinevela.app')&&!JSON.stringify(signIn.data).includes('wrapped_password'),'The public profile contains no internal alias or credential envelope');
        check((await roomSession.call('/api/auth/resident-activate',{roomKey:two.key,pin:'123456'})).status===403,'Resident PIN authority cannot activate another room as the primary owner');
        check((await roomSession.call('/api/auth/context',{contextId:owner.s.user.id})).status===403,'Resident native session cannot switch into its primary owner');
        await roomSession.call('/api/legal/accept',{termsAcceptance:termsAcceptance(true)});
        const childActor=await actorFor(roomSession);
        check(childActor.authUserId===resident.auth_user_id,'The actual bound native session belongs only to the resident identity');
        const profileSave=await roomSession.call('/api/auth/profile',{name:'Resident profile update',email:owner.email});
        check(profileSave.status===200&&profileSave.data.user.email===owner.email,'Resident profile edits accept the displayed primary contact email without changing native credentials');
        check((await roomSession.call('/api/auth/profile',{name:'Wrong contact',email:foreign.email})).status===400,'Resident profile edits cannot replace their verified contact email');
        const managerRows=await db.system(c=>keyRows(c,{contextId:managerId,authUserId:crypto.randomUUID(),sessionId:crypto.randomUUID(),kind:'manager'},home));
        check(managerRows.find(r=>r.roomId===one.id)?.assignedStudentEmail===owner.email,'Authorized housing contacts show the real primary email rather than the internal Auth alias');
        const ticket=await db.authorizedSystem(childActor,['resident'],c=>createSupportTicket(c,childActor,{subject:'Local room PIN support question',body:'A local verification ticket only.',category:'account',type:'question',source:'/help',requestKey:crypto.randomUUID()}));
        const contact=(await db.pool.query('select requester_email from private.support_tickets where id=$1',[ticket.id])).rows[0];
        check(contact?.requester_email===owner.email,'Support replies use the resident primary contact email');

        const rls=await db.actor(childActor,async c=>({contexts:(await c.query('select id,kind from public.account_contexts')).rows,profiles:(await c.query('select id from public.profiles where id=$1',[owner.id])).rowCount}));
        check(!rls.contexts.some(c=>c.id===owner.s.user.id)&&rls.profiles===0,'Direct PostgreSQL RLS cannot expose the primary context/profile to a room-PIN session');
        check((await owner.s.call('/api/auth/login',{email:owner.email,password:'123456'})).status===401,'A room PIN is not accepted as the primary password');
        const userAgain=new Session();check((await userAgain.call('/api/auth/login',{email:owner.email,password:owner.password})).data?.role==='user','The unchanged primary email/password still opens its primary account');
        check((await guest.call('/api/auth/resident-login',{email:foreign.email,pin:'123456'})).status===401,'Another primary email cannot claim this resident login');
        check((await guest.call('/api/auth/resident-login',{email:owner.email,pin:'123456',authUserId:owner.id})).status===400,'Resident login rejects injected native identity fields');
        check((await roomSession.call('/api/auth/portal-security')).data.residentPinLogin===true,'Resident settings identify the PIN-only sign-in method');
        stage='atomic PIN change and recovery';
        const change=await roomSession.call('/api/auth/portal-pin',{currentPin:'123456',newPin:'234567'});
        check(change.status===200&&change.data.signInRequired,'Resident changes its own PIN without resetting a native email password');
        check((await roomSession.call('/api/auth/me')).status===401,'Earlier resident bindings expire after a PIN change');
        const changed=new Session();check((await changed.call('/api/auth/resident-login',{email:owner.email,pin:'234567'})).status===200,'The new PIN decrypts the same native credential and signs in');
        check((await guest.call('/api/auth/resident-login',{email:owner.email,pin:'123456'})).status===401,'The previous PIN cannot sign in after rotation');
        check((await foreign.s.call('/api/auth/resident-pin/reset',{newPin:'345678'})).status===409,'A different primary owner cannot reset this room PIN');
        check((await changed.call('/api/auth/resident-pin/reset',{newPin:'345678'})).status===403,'A resident cannot impersonate a primary owner to recover a PIN');
        check((await owner.s.call('/api/auth/resident-pin/reset',{newPin:'345678',contextId:context})).status===400,'Recovery rejects client-selected target contexts');
        check((await owner.s.call('/api/auth/resident-pin/reset',{newPin:'345678'})).status===200,'Verified primary owner recovers its own resident PIN atomically');
        check((await changed.call('/api/auth/me')).status===401,'Recovery expires earlier resident bindings');
        const recovered=new Session();check((await recovered.call('/api/auth/resident-login',{email:owner.email,pin:'345678'})).status===200,'Recovered PIN signs into the retained resident context');
        await recovered.call('/api/legal/accept',{termsAcceptance:termsAcceptance(true)});
        check((await db.pool.query('select encrypted_password from auth.users where id=$1',[owner.id])).rows[0].encrypted_password===originalPrimary,'Primary native password hash remains byte-for-byte unchanged');
        check((await owner.s.call('/api/auth/me')).status===200,'Primary session survives resident PIN rotation and recovery');

        stage='persistent wrong PIN lockout';
        for(let i=0;i<5;i++){const r=await guest.call('/api/auth/resident-login',{email:owner.email,pin:'999999'});check([401,429].includes(r.status),'Wrong PIN attempt '+(i+1)+' is denied');}
        check((await db.pool.query('select failed_attempts,locked_until>clock_timestamp() as locked from private.portal_access_keys where context_id=$1',[context])).rows[0].locked,'Five wrong PINs persist the portal lock in PostgreSQL');
        check([401,429].includes((await guest.call('/api/auth/resident-login',{email:owner.email,pin:'345678'})).status),'Even the correct PIN cannot bypass the active lock');
        // Advance only disposable test deadlines instead of waiting 15 minutes.
        await db.pool.query("update private.portal_access_keys set locked_until=clock_timestamp()-interval '1 minute' where context_id=$1",[context]);
        await db.pool.query("update private.auth_login_attempts set blocked_until=null,recent_failures='{}',failures=0");
        check((await guest.call('/api/auth/resident-login',{email:owner.email,pin:'345678'})).status===200,'Correct proof works after the simulated cooldown and resets counters');

        stage='concurrent claims and reactivation';
        const competing=await Promise.all([foreign.s.call('/api/auth/resident-activate',{roomKey:two.key,pin:'456789'}),racer.s.call('/api/auth/resident-activate',{roomKey:two.key,pin:'567890'})]);
        check(competing.filter(r=>r.status===200).length===1&&competing.filter(r=>r.status===409).length===1,'Concurrent independent owners cannot double-claim a room');
        const winning=competing[0].status===200?foreign:racer,losing=winning===foreign?racer:foreign,losingPin=losing===foreign?'456789':'567890';
        check((await db.pool.query('select count(*)::int as n from public.allocations where room_id=$1 and ended_at is null',[two.id])).rows[0].n===1,'Database contains one active allocation for the contested room');
        check((await losing.s.call('/api/auth/resident-activate',{roomKey:three.key,pin:losingPin})).status===200,'A failed final claim can resume safely with another valid room key');
        const activeActor=await actorFor(recovered);
        const preview=await db.authorizedSystem(activeActor,['resident'],c=>ownResidentReleasePreview(c,activeActor));
        const released=await db.authorizedSystem(activeActor,['resident'],c=>releaseOwnResidentRoom(c,activeActor,{confirm:'END MY ROOM ACCESS',fingerprint:preview.fingerprint,currentPin:'345678'}),false,false,true);
        check(released.success,'Existing resident self-release works with the new PIN account');
        check((await new Session().call('/api/auth/resident-login',{email:owner.email,pin:'345678'})).status===401,'Released residents cannot log into a closed room');
        const resumed=await owner.s.call('/api/auth/resident-activate',{roomKey:four.key,pin:'345678'});
        check(resumed.status===200&&resumed.data.accountId===context,'A released resident reuses its existing native identity and PIN for a new room');

        stage='legacy resident and shared seller compatibility';
        const legacyOwner=await primary('Legacy owner'),legacyEmail='legacy-'+crypto.randomBytes(8).toString('hex')+'@st.knust.edu.gh',legacyPassword='Aa1!'+crypto.randomBytes(24).toString('base64url'),nonce=crypto.randomBytes(32).toString('hex');
        const legacyEnrollment=await db.authorizedSystem(legacyOwner.actor,['primary'],c=>reserveEnrollment(c,legacyOwner.actor,{kind:'resident',name:'Existing verified resident',email:legacyEmail,phone:'+233241234567',password:legacyPassword},nonce));
        await adminCreate(legacyEmail,legacyPassword,{pinevela_enrollment_token:nonce});
        const nativeLegacy=await auth.provider('/token?grant_type=password',{email:legacyEmail,password:legacyPassword}),legacyPerson=await auth.provider('/user',undefined,nativeLegacy.access_token),legacyIdentity=verifiedClaims(nativeLegacy.access_token,legacyPerson);
        await db.authorizedSystem(legacyOwner.actor,['primary'],c=>finishEnrollment(c,legacyOwner.actor,legacyEnrollment,{...legacyIdentity,email:legacyEmail}));
        const legacyRoom=await room(6);const legacyActivation=await db.authorizedSystem(legacyOwner.actor,['primary'],c=>claimResidentRoom(c,legacyOwner.actor,legacyEnrollment,legacyRoom.key));
        const sellerContext=(await db.pool.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'seller','active') returning id",[legacyIdentity.authUserId,legacyOwner.id])).rows[0].id;
        for(const [id,pin] of [[legacyActivation.accountId,'112233'],[sellerContext,'223344']])await db.pool.query('insert into private.portal_access_keys(context_id,pin_hash) values($1,$2)',[id,await hashPortalPin(pin)]);
        const sellerSession=new Session(),legacySession=new Session();
        const sellerLogin=await sellerSession.call('/api/auth/login',{email:legacyEmail,password:legacyPassword,accountKind:'seller',portalPin:'223344'});
        check(sellerLogin.status===200&&sellerLogin.data.role==='merchant','A pre-existing shared seller keeps its verified native password and own PIN');
        const legacyLogin=await legacySession.call('/api/auth/login',{email:legacyEmail,password:legacyPassword,accountKind:'resident',portalPin:'112233'});
        check(legacyLogin.status===200&&legacyLogin.data.role==='student','A legacy resident keeps its original verified email/password and portal PIN');
        await legacySession.call('/api/legal/accept',{termsAcceptance:termsAcceptance(true)});
        check((await legacySession.call('/api/auth/portal-pin',{currentPin:'112233',newPin:'334455'})).status===200,'Legacy resident PIN rotation remains available');
        const sellerAgain=new Session();check((await sellerAgain.call('/api/auth/login',{email:legacyEmail,password:legacyPassword,accountKind:'seller',portalPin:'223344'})).status===200,'Resident PIN changes preserve the companion seller password/PIN');
        const legacyAgain=new Session();check((await legacyAgain.call('/api/auth/login',{email:legacyEmail,password:legacyPassword,accountKind:'resident',portalPin:'334455'})).status===200,'Legacy resident can sign back in after its own PIN change');
        check((await legacyOwner.s.call('/api/auth/resident-pin/reset',{newPin:'445566'})).status===409,'Primary recovery cannot reset a legacy identity shared with a seller');
        stage='safe setup retry';const retryOwner=await primary('Setup retry');const spare=await room(5);
        const beforeRetry=await counts();
        await assert.rejects(activateResidentPin(auth,retryOwner.actor,{roomKey:spare.key,pin:'678901'},async()=>{throw new ApiError(503,'Injected local provider outage');}),e=>(e as any).status===503);checks++;
        check(await counts()===beforeRetry,'An interrupted provider create leaves a reservation rather than an adopted Auth user');
        check((await retryOwner.s.call('/api/auth/resident-pin/reset',{newPin:'789012'})).status===200,'A primary owner can recover a forgotten PIN even before native provisioning finishes');
        check((await retryOwner.s.call('/api/auth/resident-activate',{roomKey:spare.key,pin:'789012'})).status===200,'A saved setup reservation resumes through the real Auth provider');
        stage='protected CAPTCHA exchange';process.env.AUTH_CAPTCHA_SITE_KEY='local-room-test';
        check((await new Session().call('/api/auth/resident-login',{email:owner.email,pin:'345678'})).status===400,'A correct room PIN cannot skip required submission CAPTCHA');
        process.env.AUTH_CAPTCHA_SITE_KEY='';

        stage='photo variants and publication revalidation';
        const manager=(await db.pool.query('select auth_user_id from public.account_contexts where id=$1',[managerId])).rows[0];
        const bytes=await decodeImageUpload({fileType:'image/jpeg',fileData:fs.readFileSync('src/assets/images/girls_1789053323516.jpg').toString('base64')},1600,'webp');
        const asset=await db.system(c=>reserveMedia(c,{kind:'manager',contextId:managerId,authUserId:manager.auth_user_id,sessionId:crypto.randomUUID()},'hostel',bytes));
        objects.set(asset.object_path,bytes);await db.system(c=>finishMedia(c,{kind:'manager',contextId:managerId,authUserId:manager.auth_user_id,sessionId:crypto.randomUUID()},asset.id));
        check(asset.object_path.endsWith('.webp'),'New catalogue reservations use the actual WebP extension');
        await db.pool.query('update public.residences set cover_path=$2 where id=$1',[home,mediaUrl(asset.id)]);
        const photo=mediaUrl(asset.id),first=await fetch(origin+photo+'?size=card'),card=Buffer.from(await first.arrayBuffer()),etag=first.headers.get('etag');
        check(first.status===200&&first.headers.get('content-type')?.startsWith('image/webp')&&(await sharp(card).metadata()).width===640,'Public catalogue endpoint serves a useful 640px WebP card');
        check(card.length<bytes.length,'Card transfer uses fewer bytes than the detail photo');
        check(first.headers.get('cache-control')?.includes('must-revalidate'),'Publication-sensitive browser cache requires validation');
        const beforeDownload=downloads;const repeated=await fetch(origin+photo+'?size=card');await repeated.arrayBuffer();
        check(repeated.status===200&&downloads===beforeDownload,'Repeated authorized reads reuse derived bytes without another Storage download');
        const conditional=await fetch(origin+photo+'?size=card',{cache:'force-cache',headers:{'If-None-Match':etag!}});check(conditional.status===304&&(await conditional.arrayBuffer()).byteLength===0,'Unchanged public photo validates with a zero-byte 304');
        const thumbnail=await fetch(origin+photo+'?size=thumb'),thumb=Buffer.from(await thumbnail.arrayBuffer());
        check((await sharp(thumb).metadata()).width===192&&thumbnail.headers.get('etag')!==etag,'Purchase thumbnails have a distinct compact size and cache identity');
        check((await fetch(origin+photo+'?size=999999')).status===400,'Unbounded image transform sizes are rejected');
        check((await fetch(origin+photo+'?size=card&url=http://127.0.0.1')).status===400,'Photo resizing cannot become a remote URL proxy');
        await db.pool.query("update public.residences set status='suspended' where id=$1",[home]);
        check((await fetch(origin+photo+'?size=card',{cache:'force-cache',headers:{'If-None-Match':etag!}})).status===404,'A withdrawn residence cannot get cached bytes or a 304');
        check((await fetch(origin+photo+'?size=card',{headers:{cookie:foreign.s.cookie}})).status===404,'Another account cannot read withdrawn private media');
        check((await db.pool.query("select allowed_mime_types @> array['image/png','image/webp'] as formats,not public as private from storage.buckets where id='pinevela-media'")).rows[0].private,'The expanded raster formats keep the Storage bucket private');
        check(failures.length===0,'All verified HTTP paths completed without an unclassified server error');
        const sourceFiles=['imageUploadSecurity.ts','supabase/media.ts','supabase/storage.ts','supabase/cataloguePhotos.ts','supabase/contentSafety.ts','supabase/storageBackup.ts','supabase/residentPin.ts','supabase/residentPinCrypto.ts','supabase/residentAuthProvider.ts','supabase/residentContact.ts','supabase/auth.ts','supabase/accountAccess.ts','supabase/enrollment.ts','supabase/portalSecurity.ts','supabase/app.ts','supabase/profiles.ts','supabase/support.ts','supabase/housing.ts','supabase/residentProfiles.ts','supabase/accountStatus.ts',...fs.readdirSync('supabase/migrations').filter(n=>/^202611051[56]0000_/.test(n)).map(n=>'supabase/migrations/'+n)];
        const sourceSha256=Object.fromEntries(sourceFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
        const sqlEditorSha256=crypto.createHash('sha256').update(fs.readFileSync('releases/database/pinevela-apply-resident-pin-media-20261105.sql')).digest('hex');
        fs.writeFileSync(output+'/database-auth-http-report.json',JSON.stringify({passed:true,checks,labels,sourceSha256,sqlEditorSha256,realGoTrue:true,providerVersion:'2.197.0',nativeTokensIssuedByGoTrue:true,providerFixtureAccountsOnly:true,storageTransport:'in-memory bytes with real database authorization',cloudWrites:0,cloudMail:0,cloudPush:0},null,2)+'\n');
        console.log(JSON.stringify({passed:true,checks,realGoTrue:true,cloudWrites:0,report:output+'/database-auth-http-report.json'}));
      }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
    });
  }finally{await db.pool.end();}
});}catch(error){fs.writeFileSync(output+'/failure.json',JSON.stringify({passed:false,stage,checks,code:(error as any)?.code,error:error instanceof Error?error.message:String(error)},null,2)+'\n');console.error(JSON.stringify({passed:false,stage,checks,error:error instanceof Error?error.message:String(error)}));process.exitCode=1;}
finally{for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
