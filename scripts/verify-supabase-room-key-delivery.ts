/** Native in-app key delivery in a disposable restore of real Auth identities/sessions.
 * No cloud Auth/product/email writes, fabricated provider replies or TCP listener. */
import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import dotenv from 'dotenv';import {spawnSync} from 'node:child_process';import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {issueManagerKey,checkManagerKey} from '../supabase/managerKeys.js';import {readNotifications} from '../supabase/notifications.js';
import {deliverRoomKey,roomKeyDeliveryInput,roomKeyDeliveryMetadata} from '../supabase/roomKeyDelivery.js';
import {releaseResidentRoom} from '../supabase/housing.js';import {accountFeaturesForRequest} from '../supabase/accountAccess.js';
dotenv.config({quiet:true});const[checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>! /^[a-f0-9-]{36}$/.test(v||'')))throw new Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks=0,stage='restore';function check(value:unknown,label:string){assert.ok(value,label);checks++;}
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
 if((typeof expected==='number'?error?.status:error?.code)!==expected)fs.writeFileSync('.security/migration-reset/room-key-delivery-denial.log',JSON.stringify({expected,actualStatus:error?.status,actualCode:error?.code,label,detail:String(error?.stack||error)},null,2),{mode:0o600});
 check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);}
try{
 await withIsolatedBackup(checkpoint,async config=>{
  let db=new SupabaseDatabase(config);try{
   const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t)order by id)from auth.users t),'identities',(select jsonb_agg(to_jsonb(t)order by id)from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t)order by id)from auth.sessions t))::text)as value`)).rows[0].value;
   const beforeAuth=await authDigest();
   const fixture=await db.system(async c=>{
    const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','')as name,
     (select array_agg(s.id order by s.created_at desc)from auth.sessions s where s.user_id=u.id and(s.not_after is null or s.not_after>clock_timestamp()))as sessions
     from auth.users u where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
      and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))order by u.id`)).rows.filter(p=>p.sessions?.length);
    check(people.length>=6,'Six genuine verified Google subjects have native sessions');
    const[op,fp,student,otherStudent,mp,fmp]=people;
    const owners:VerifiedActor[]=[];
    for(const p of[op,fp]){await c.query('select private.initialize_auth_profile($1,null)',[p.id]);owners.push({authUserId:p.id,sessionId:p.sessions[0],contextId:(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id,kind:'primary'});}
    const residents:VerifiedActor[]=[],managers:VerifiedActor[]=[];
    for(const[p,parent,kind]of[[student,op,'resident'],[otherStudent,fp,'resident'],[mp,op,'manager'],[fmp,fp,'manager']]as const){
     await c.query('insert into public.profiles(id,email,display_name,primary_owner_id)values($1,$2,$3,$4)',[p.id,p.email,p.name,parent.id]);
     const actor:VerifiedActor={authUserId:p.id,sessionId:p.sessions[0],kind,contextId:(await c.query('insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,$3,$4)returning id',[p.id,parent.id,kind,kind==='resident'&&p===otherStudent?'pending':'active'])).rows[0].id};
     (kind==='resident'?residents:managers).push(actor);
    }
    const houses=[];for(let i=0;i<2;i++){const parent=[op,fp][i],p=[student,otherStudent][i];
     const home=(await c.query("insert into public.residences(primary_owner_id,name,status,setup_submitted_at)values($1,$2,'approved',now())returning id",[parent.id,parent.name||parent.email])).rows[0].id;
     await c.query('insert into public.manager_assignments(manager_context_id,residence_id)values($1,$2)',[managers[i].contextId,home]);
     await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status)values($1,$2,'residence_registration','approved')",[managers[i].contextId,home]);
     const block=(await c.query('insert into public.blocks(residence_id,name)values($1,$2)returning id',[home,p.name||p.email])).rows[0].id;
     const floor=(await c.query('insert into public.floors(block_id,floor_number)values($1,0)returning id',[block])).rows[0].id;
     const rooms=[];for(const number of['1','2','3']){const room=(await c.query('insert into public.rooms(floor_id,room_number)values($1,$2)returning id',[floor,number])).rows[0].id;
      const bed=(await c.query('insert into public.beds(room_id,bed_number)values($1,1)returning id',[room])).rows[0].id;
      const code='PV-'+crypto.randomBytes(16).toString('hex').toUpperCase();
      const occupied=i===0&&number==='1';if(occupied)await c.query('insert into public.allocations(resident_context_id,room_id,bed_id)values($1,$2,$3)',[residents[0].contextId,room,bed]);
      const key=(await c.query('insert into private.room_activation_keys(room_id,code,claimed_by,claimed_at)values($1,$2,$3,$4)returning id',[room,code,occupied?residents[0].contextId:null,occupied?new Date():null])).rows[0].id;
      rooms.push({room,bed,key,code});}
     houses.push({home,block,floor,rooms});
     await c.query("insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,status,verified_at,auth_user_id,linked_context_id,room_id,residence_id,expires_at)values($1,$2,'resident',$3,$4,$5,$6,now(),$7,$8,$9,$10,now()+interval'24 hours')",[owners[i].contextId,parent.id,p.email,crypto.randomBytes(32).toString('hex'),JSON.stringify({displayName:p.name}),i===0?'completed':'pending_review',p.id,residents[i].contextId,i===0?rooms[0].room:null,i===0?home:null]);
    }
    for(const actor of[...owners,residents[0],...managers])await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[actor.sessionId,actor.authUserId,actor.contextId]);
    const applied=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
    for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
     const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
     if(applied.has(version))assert.equal(applied.get(version),digest);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}}
    return{owners,residents,managers,houses,op,fp,student,otherStudent,mp,fmp};
   });
   const{owners,residents,managers,houses,op,fp,student,otherStudent}=fixture;
   const run=<T>(a:VerifiedActor,fn:(c:PoolClient)=>Promise<T>)=>db.authorizedSystem(a,[a.kind],fn);
   for(const manager of managers){const key=(await run(manager,c=>issueManagerKey(c,manager))).key;manager.managerKeyVersion=(await run(manager,c=>checkManagerKey(c,manager,key))).version;}
   const manager=managers[0],key=houses[0].rooms[1],occupied=houses[0].rooms[0];
   const input={keyId:key.key,recipientEmail:fp.email,customNote:'',requestId:crypto.randomUUID()};
   const send=(a=manager,body:any=input)=>run(a,c=>deliverRoomKey(c,a,body));
   stage='validation and ownership';
   check(accountFeaturesForRequest('POST','/api/room-keys/send-digital').includes('rooms'),'Delivery uses the rooms feature restriction boundary');
   for(const patch of[{roomKey:key.code},{roomId:key.room},{managerId:manager.contextId},{recipientContextId:owners[0].contextId},{hostelName:op.name},{recipientPhone:op.email},{recipientName:fp.name},{requestId:'invalid'},{keyId:'invalid'},{recipientEmail:''},{customNote:'a'.repeat(1001)},{customNote:[] }])await denied(()=>send(manager,{...input,...patch}),400,'Client ownership/room metadata/raw code and invalid fields rejected');
   await denied(()=>send({...manager,managerKeyVersion:undefined}),403,'Native helper explicitly requires its own manager operation-key proof');
   await denied(()=>send({...manager,managerKeyVersion:'999999'}),403,'Old manager-key version is rejected');
   for(const a of[owners[0],owners[1],residents[0]])await denied(()=>send(a),403,'Primary and resident portals cannot send room keys');
   await denied(()=>send(managers[1]),404,'Foreign manager cannot dispatch keys from another residence');
   for(const patch of[{contextId:managers[1].contextId},{authUserId:managers[1].authUserId},{sessionId:owners[0].sessionId}])await denied(()=>send({...manager,...patch}),401,'Forged session/identity/context fails native actor binding');
   await denied(()=>send(manager,{...input,keyId:houses[1].rooms[1].key}),404,'Key selector cannot cross residence ownership');
   await denied(()=>send(manager,{...input,recipientEmail:fixture.fmp.email}),404,'Verified child work identity is not adopted as a primary recipient');

   await denied(()=>send(manager,{...input,keyId:occupied.key}),409,'Occupied key cannot be sent to another primary owner');
   await db.system(c=>c.query("update private.manager_operation_keys set locked_until=clock_timestamp()+interval'15 minutes'where manager_context_id=$1",[manager.contextId]));
   await denied(()=>send(),403,'Locked manager operation key cannot dispatch');await db.system(c=>c.query('update private.manager_operation_keys set locked_until=null where manager_context_id=$1',[manager.contextId]));
   await db.system(c=>c.query("update public.residences set status='inspection'where id=$1",[houses[0].home]));await denied(()=>send(),409,'Unapproved housing cannot dispatch');await db.system(c=>c.query("update public.residences set status='approved'where id=$1",[houses[0].home]));
   for(const role of['anon','authenticated','pinevela_backend'])for(const sql of['select * from private.room_key_deliveries',"select * from private.room_key_delivery_recipient('')"])
    await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query(sql);}), '42501','Browser and scoped backend roles cannot directly inspect private delivery identities');
   stage='atomic delivery and retry';
   const digest=async()=>(await db.pool.query(`select md5(jsonb_build_object('deliveries',(select jsonb_agg(to_jsonb(t)order by id)from private.room_key_deliveries t),'notices',(select jsonb_agg(to_jsonb(t)order by id)from public.notifications t),'recipients',(select jsonb_agg(to_jsonb(t)order by notification_id,context_id)from public.notification_recipients t),'audits',(select jsonb_agg(to_jsonb(t)order by id)from private.audit_events t))::text)as value`)).rows[0].value;
   const beforeFailure=await digest();await db.system(c=>c.query("create function private.reject_delivery_test()returns trigger language plpgsql as $$begin if new.event_type='room_key_delivered'then raise exception using errcode='22000',message='Isolated native audit rejection';end if;return new;end;$$;create trigger reject_delivery_test before insert on private.audit_events for each row execute function private.reject_delivery_test()"));
   await denied(()=>send(),'22000','Actual native audit failure rejects delivery after notification and receipt insertion');check(await digest()===beforeFailure,'Notification, recipient, receipt and audit writes all roll back');
   await db.system(c=>c.query('drop trigger reject_delivery_test on private.audit_events;drop function private.reject_delivery_test()'));
   const outcomes=await Promise.all([send(),send()]);check(outcomes.every(r=>r.success&&r.channel==='pinevela_notification')&&outcomes.filter(r=>!r.noChange).length===1,'Concurrent exact retries create one genuine recipient delivery');
   const delivered=outcomes.find(r=>!r.noChange)!;check(outcomes.every(r=>r.dispatch.id===delivered.dispatch.id),'Concurrent responses reference the same immutable receipt');
   const row=(await db.pool.query('select * from private.room_key_deliveries where id=$1',[delivered.dispatch.id])).rows[0];
   check(row.recipient_context_id===owners[1].contextId&&row.actor_context_id===manager.contextId,'Receipt stores derived primary recipient and actual manager');
   check(!JSON.stringify(row).includes(key.code),'Private receipt contains no additional raw room-key copy');
   const notice=(await db.pool.query('select * from public.notifications where id=$1',[row.notification_id])).rows[0];check(notice.message.includes(key.code)&&notice.message.includes(op.name||op.email)&&notice.category==='verification','Recipient notification has the actual key and native residence labels');
   const own=await db.actor(owners[1],c=>readNotifications(c,owners[1]));check(own.some(n=>n.id===notice.id&&n.message.includes(key.code)),'Verified recipient reads the key in their primary notifications');
   check(!(await db.actor(owners[0],c=>readNotifications(c,owners[0]))).some(n=>n.id===notice.id),'Another primary cannot see the delivered key');
   check(!(await db.actor(manager,c=>readNotifications(c,manager))).some(n=>n.id===notice.id),'Sender-only notification cannot masquerade as delivery');
   const audits=(await db.pool.query("select * from private.audit_events where event_type='room_key_delivered'and resource_id=$1",[row.id])).rows;check(audits.length===1&&!JSON.stringify(audits).includes(key.code),'One native audit contains no raw secret');
   await denied(()=>send(manager,{...input,customNote:student.name||student.email}),409,'Nonce cannot be reused for different delivery content');
   await denied(()=>send(manager,{...input,recipientEmail:op.email}),409,'Nonce cannot be retargeted to another primary');
   const casingNonce=crypto.randomUUID();const caseRetries=await Promise.all([send(manager,{...input,requestId:casingNonce}),send(manager,{...input,keyId:key.key.toUpperCase(),requestId:casingNonce.toUpperCase()})]);
   check(caseRetries.every(r=>r.success)&&caseRetries.filter(r=>!r.noChange).length===1&&caseRetries[0].dispatch.id===caseRetries[1].dispatch.id,'Equivalent UUID casing shares the canonical retry lock and one receipt');
   const studentDelivery=await send(manager,{...input,recipientEmail:otherStudent.email,requestId:crypto.randomUUID()});check(studentDelivery.success,'Saved verified resident email resolves to its original primary owner');
   const studentRow=(await db.pool.query('select recipient_context_id from private.room_key_deliveries where id=$1',[studentDelivery.dispatch.id])).rows[0];check(studentRow.recipient_context_id===owners[1].contextId,'Student mailbox cannot spoof a different owner');
   const occupiedDelivery=await send(manager,{...input,keyId:occupied.key,recipientEmail:student.email,requestId:crypto.randomUUID()});check(occupiedDelivery.success,'Occupied key can be resent only to its current resident’s verified primary owner');
   for(const sql of['update private.room_key_deliveries set recipient_email=recipient_email where id=$1','delete from private.room_key_deliveries where id=$1'])await denied(()=>db.system(c=>c.query(sql,[row.id])),'42501','Delivery history cannot be edited or removed');
   await denied(()=>db.system(c=>c.query('truncate private.room_key_deliveries')),'42501','Delivery history cannot be truncated');
   const raw=async(patch:Record<string,unknown>={})=>run(manager,async c=>{
    const data:Record<string,unknown>={...row,id:crypto.randomUUID(),request_id:crypto.randomUUID(),notification_id:notice.id,...patch};
    await c.query("select set_config('pinevela.room_key_delivery_version',$1,true)",[manager.managerKeyVersion!]);
    const columns=['id','key_id','residence_id','room_id','actor_context_id','manager_key_version','recipient_context_id','recipient_email','custom_note','request_id','payload_digest','notification_id'];
    await c.query('insert into private.room_key_deliveries('+columns.join(',')+')values('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',columns.map(k=>data[k]));});
   for(const patch of[{actor_context_id:managers[1].contextId},{recipient_context_id:owners[0].contextId},{room_id:occupied.room},{residence_id:houses[1].home},{payload_digest:'0'.repeat(64)}])await denied(()=>raw(patch),'42501','Native guard rejects forged sender, recipient, key/housing relationship and payload');
   await denied(()=>raw(),'42501','Earlier notification cannot authorize a fresh native receipt');
   const metadata=await run(manager,c=>roomKeyDeliveryMetadata(c,[key.key]));check(metadata.get(key.key)?.lastDispatchedTo===otherStudent.email,'Reload metadata uses persisted recipient delivery');
   stage='rotation and retention';
   // A real manager release rotates the occupied key and retains the delivery receipt.
   await run(manager,c=>releaseResidentRoom(c,manager,occupied.key,true));
   const replay=await send(manager,{...input,keyId:occupied.key,recipientEmail:student.email,requestId:(await db.pool.query('select request_id from private.room_key_deliveries where id=$1',[occupiedDelivery.dispatch.id])).rows[0].request_id});
   check(replay.noChange&&!replay.currentKey&&!JSON.stringify(replay).includes(occupied.code),'Rotated-key retry returns historical receipt without advertising old code as usable');
   await denied(()=>send(manager,{...input,keyId:occupied.key,recipientEmail:student.email,requestId:crypto.randomUUID()}),404,'Rotated keys cannot receive a fresh delivery');
   check((await db.pool.query('select count(*)from public.allocations where room_id=$1 and ended_at is null',[key.room])).rows[0].count==='0','Dispatch never allocates or reserves a room');
   check((await db.pool.query('select count(*)from private.room_key_deliveries where id=$1',[occupiedDelivery.dispatch.id])).rows[0].count==='1','Native release keeps the immutable delivery history');
   const refs=(await db.pool.query(`select a.attname from pg_constraint f join pg_attribute a on a.attrelid=f.conrelid and a.attnum=any(f.conkey)where f.conrelid='private.room_key_deliveries'::regclass and f.contype='f'`)).rows.map(r=>r.attname);
   check(!refs.some(v=>['key_id','room_id','residence_id'].includes(v)),'Immutable historical housing snapshots do not block existing reviewed physical key/residence removal');
   check(refs.includes('actor_context_id')&&refs.includes('recipient_context_id')&&refs.includes('notification_id'),'Retained identities and recipient notification still have real foreign keys');
   await db.close();db=new SupabaseDatabase(config);const restored=await run(manager,c=>roomKeyDeliveryMetadata(c,[key.key]));check(restored.get(key.key)?.lastDispatchedTo===otherStudent.email,'Delivery metadata persists after backend pool restart');
   check(await authDigest()===beforeAuth,'All genuine Auth users, identities and sessions remain unchanged');
   const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
   fs.writeFileSync('.security/migration-reset/room-key-delivery-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});check(advisor.status===0,'Native security advisors completed');const report=JSON.parse(advisor.stdout.toString()),findings=report.results||report;check(Array.isArray(findings)&&!findings.length,'Native security advisors report zero findings');
  }finally{await db.close();}
 },{applicationCheckpoint});
 const report={checks,isolated:true,genuineAuthSubjects:true,nativeSessions:true,cloudWrites:false,emailProviderCalls:false,providerMocks:false,physicalWorkerCompatibility:'historical housing UUID snapshots retain receipts without key/room/residence FKs',realStudentBrowserAcceptance:'pending'};
 fs.writeFileSync('.security/migration-reset/room-key-delivery-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}catch(error){fs.writeFileSync('.security/migration-reset/room-key-delivery-native-failure.log',String((error as any)?.stack||error),{mode:0o600});console.error('Native room-key delivery verification failed at '+stage+'; diagnostics saved privately.');process.exitCode=1;}
