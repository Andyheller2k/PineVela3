/** Focused regression checks on an existing encrypted checkpoint restored locally.
 * No hosted changes, fabricated identities, external providers or submissions. */
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError, SessionExpiredError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { createSupabaseApp } from '../supabase/app.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {DEFAULT_COMPANION_PREFERENCES} from '../companionModel.js';
import {companionState,saveCompanionPreferences,reserveCompanionTurn} from '../supabase/companion.js';
import {verifyRemediationBrowser} from './lib/remediation-browser.js';
import {readNotifications} from '../supabase/notifications.js';
import {expireOrderReservations} from '../supabase/orderExpiry.js';
import {changeOrder,orderPage,orderTimelinePage,orderEventRows} from '../supabase/orders.js';
import {conversationPage} from '../supabase/marketConversation.js';
import {loadOrderPins} from '../supabase/orderPins.js';
import {historyPage,encodeHistoryCursor} from '../supabase/historyPagination.js';
import {paymentReversalRows,processPaymentReversal,queuePaymentReversal,reviewPaymentReversal} from '../supabase/paymentReversals.js';

const directory=path.resolve('.security/remediation-2026-10-20');
fs.mkdirSync(directory,{recursive:true,mode:0o700});
const selected=process.argv[2]||'PV-01';
const checkpoint='ebd5a53c-e4d5-4be2-8b0d-fd31bbf3c017';
dotenv.config({quiet:true});
for(const name of ['GROQ_API_KEY','OPENAI_API_KEY','RESEND_API_KEY','RESEND_FROM_EMAIL','PAYSTACK_SECRET_KEY','GEMINI_API_KEY'])delete process.env[name];
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{
  const url=new URL(input instanceof Request?input.url:String(input),globalThis.location?.origin);
  assert.equal(url.hostname,'127.0.0.1','This verifier cannot call external services');
  return nativeFetch(url,options);
};
const checks:{finding:string;name:string}[]=[];
function check(finding:string,name:string,value:unknown){assert.ok(value,`${finding}: ${name}`);checks.push({finding,name});}
async function verifyLimits(db:SupabaseDatabase){
  const created=createSupabaseApp(db),server=created.app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+(server.address() as any).port;
  const post=async(route:string)=>{
    const r=await fetch(origin+'/api'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
    const result={status:r.status,retryAfter:r.headers.get('Retry-After')};await r.body?.cancel();return result;
  };
  try{
    for(const {finding,limit,paths,status} of [
      {finding:'PV-01',limit:20,paths:['/auth/login','/auth/login/','/AUTH/LOGIN','/AUTH/LOGIN/'],status:400},
      {finding:'PV-01',limit:10,paths:['/room-keys/claim','/room-keys/claim/','/ROOM-KEYS/CLAIM','/ROOM-KEYS/CLAIM/'],status:401},
      {finding:'PV-01',limit:20,paths:['/users/delete-registered-account','/users/delete-registered-account/','/USERS/DELETE-REGISTERED-ACCOUNT','/USERS/DELETE-REGISTERED-ACCOUNT/'],status:401},
    ]){
      for(let i=0;i<limit;i++)check(finding,'Equivalent spellings consume the shared budget and retain the original guard',(await post(paths[i%paths.length])).status===status);
      for(const route of paths){const r=await post(route);check(finding,'Every spelling is denied after the shared budget is exhausted',r.status===429&&Number(r.retryAfter)>0);}
    }
    for(const route of ['/auth/RECOVER/','/auth/verify-unified/','/AUTH/STAFF-INVITATIONS/ACTIVATE/','/auth/OFFICER-INVITATION/activate/','/AUTH/ENROLLMENTS/GOOGLE/START/'])
      check('PV-01','Other sensitive authentication operations share the exhausted budget',(await post(route)).status===429);
    for(const route of ['/ROOM-KEYS/VERIFY/','/RESIDENTS/ONBOARD/'])
      check('PV-01','Room verification and onboarding share the exhausted room-key budget',(await post(route)).status===429);
    const health=await fetch(origin+'/api/health');check('PV-01','Exhausting sensitive budgets does not block ordinary API reads',health.status===200);await health.body?.cancel();
  }finally{
    await created.app.locals.closeSupport?.();await created.app.locals.closeRealtime();server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}

async function verifyApiFailures(db:SupabaseDatabase){
  const created=createSupabaseApp(db),server=created.app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+(server.address() as any).port;
  const previous={window:globalThis.window,location:globalThis.location};
  const target=new EventTarget();let expired=0;
  target.addEventListener('pinevela-session-expired',()=>expired++);
  Object.assign(globalThis,{window:target,location:new URL(origin)});
  try{
    const {apiFetch,ApiRequestError}=await import('../src/lib/api.js');
    const {sessionFetch}=await import('../src/lib/session.js');
    for(const [route,method] of [['/api/staff','POST'],['/api/staff/00000000-0000-4000-8000-000000000000','DELETE'],['/api/staff','GET']] as const){
      let error:unknown,fulfilled=false;
      try{await apiFetch(route,{method,...(method==='POST'?{body:'{}'}:{})});fulfilled=true;}catch(e){error=e;}
      check('PV-02','Denied reads and mutations reject with typed HTTP 401',!fulfilled&&error instanceof ApiRequestError&&error.status===401);
    }
    check('PV-02','Confirmed current-session failures emit the expiration event',expired===3);
    const invalidLogin=await sessionFetch('/api/AUTH/LOGIN/',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    check('PV-02','A failed sign-in validation does not clear a separate current identity',invalidLogin.status===400&&expired===3);
    const denied=await sessionFetch('/api/staff',{method:'GET'}),data=await denied.json();
    check('PV-02','The current-session guard explicitly identifies expiration',denied.status===401&&data.sessionExpired===true&&expired===4);
    const health=await apiFetch('/api/health');check('PV-02','Successful API data still resolves normally',health.status==='ok'&&health.persistence==='supabase');
    const proofError=new ApiError(401,'Invalid independent identity proof.');
    check('PV-02','A separate identity proof error is not a current-session-expiration error',!(proofError instanceof SessionExpiredError)&&!('sessionExpired' in proofError));
    const actors=(await db.pool.query(`select distinct on(c.auth_user_id) s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
      from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
      join public.account_contexts c on c.id=s.active_context_id where c.status='active' and c.kind='primary'
      and(n.not_after is null or n.not_after>now()) and private.portal_session_allowed(c.id,s.portal_pin_version)
      and private.account_session_allowed(c.id,s.session_id) order by c.auth_user_id,n.created_at desc limit 2`)).rows as VerifiedActor[];
    check('PV-02','Two genuine archived native identities are available',actors.length===2);
    for(const a of actors)check('PV-02','An authorized own-profile read still succeeds',(await db.readActor(a,c=>c.query('select id from public.profiles where id=$1',[a.authUserId]))).rowCount===1);
    await db.system(c=>c.query('delete from private.account_sessions where session_id=$1',[actors[0].sessionId]));
    let revoked:unknown;try{await db.readActor(actors[0],c=>c.query('select current_user'));}catch(e){revoked=e;}
    check('PV-02','Revoked native sessions produce the typed expiration error',revoked instanceof SessionExpiredError&&revoked.status===401&&revoked.sessionExpired);
    check('PV-02','Revoking one native session does not affect another',(await db.readActor(actors[1],c=>c.query('select id from public.profiles where id=$1',[actors[1].authUserId]))).rowCount===1);
  }finally{
    Object.assign(globalThis,previous);
    await created.app.locals.closeSupport?.();await created.app.locals.closeRealtime();server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}

async function verifyReversalMigration(db:SupabaseDatabase,config:any){
 const finding='PV-03';
 const tables=(await db.pool.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname in ('payment_reversals','payment_reversal_events')`)).rows;
 check(finding,'Both private reconciliation tables have RLS enabled',tables.length===2&&tables.every(t=>t.relrowsecurity));
 for(const role of ['anon','authenticated','pinevela_backend','pinevela_catalog'])for(const table of tables){
  const allowed=(await db.pool.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed",[role,'private.'+table.relname])).rows[0].allowed;
  check(finding,'Browser/catalog/backend roles cannot directly read or write reconciliation state',!allowed);
 }
 const fn=(await db.pool.query(`select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('payment_grants_access','check_payment_reversal','check_paid_period')`)).rows;
 check(finding,'Payment helpers retain restricted execution and pinned search paths',fn.length===3&&fn.every(f=>!f.anon&&!f.authenticated&&f.proconfig?.includes('search_path=""')));
 const auth=new SupabaseAuth(db);
 check(finding,'An empty persistent reconciliation queue is a safe no-op',await processPaymentReversal(auth)===false);
 check(finding,'Unrelated provider events do not enqueue reconciliation',await queuePaymentReversal(auth,{event:'charge.success'},crypto.randomBytes(32).toString('hex'))===false);
 check(finding,'Malformed unrelated references cannot select a payment',await queuePaymentReversal(auth,{event:'refund.processed',data:{transaction_reference:'not-a-platform-reference'}},crypto.randomBytes(32).toString('hex'))===false);
 const actors=(await db.pool.query(`select distinct on(c.auth_user_id) s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
  from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
  join public.account_contexts c on c.id=s.active_context_id where c.status='active' and c.kind='primary'
  and(n.not_after is null or n.not_after>now()) and private.portal_session_allowed(c.id,s.portal_pin_version)
  and private.account_session_allowed(c.id,s.session_id) order by c.auth_user_id,n.created_at desc limit 2`)).rows as VerifiedActor[];
 check(finding,'Genuine native identities remain available',actors.length===2);
 for(const a of actors){
  check(finding,'Own authorized profile reads remain available',(await db.readActor(a,c=>c.query('select id from public.profiles where id=$1',[a.authUserId]))).rowCount===1);
  for(const sql of ['select * from private.payment_reversals','select * from private.payment_reversal_events','update private.payment_reversals set manual_access=\'retain\'']){
   let error:any;try{await db.actor(a,c=>c.query(sql));}catch(e){error=e;}check(finding,'Native accounts cannot bypass reconciliation permissions',error?.code==='42501');
  }
  let error:any;try{await db.readActor(a,c=>paymentReversalRows(c,a));}catch(e){error=e;}
  check(finding,'Primary accounts cannot read the administrator payment queue',error instanceof ApiError&&error.status===403);
  try{error=undefined;await db.actor(a,c=>reviewPaymentReversal(c,a,{allowed:true,version:'forged'},crypto.randomUUID(),{decision:'retain',reason:'Unauthorized attempt',revision:'1'}));}catch(e){error=e;}
  check(finding,'A forged grant cannot authorize payment review',error instanceof ApiError&&error.status===403);
 }
 let spoof:any;try{await db.authorizedRead({...actors[0],kind:'admin'},['admin'],c=>paymentReversalRows(c,{...actors[0],kind:'admin'}));}catch(e){spoof=e;}
 check(finding,'Forging the administrator kind fails the native-session binding',spoof instanceof ApiError&&spoof.status===401);
 const created=createSupabaseApp(db),server=created.app.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const origin='http://127.0.0.1:'+(server.address() as any).port;
  for(const [route,method] of [['/api/admin/payments/reversals','GET'],['/api/admin/payments/00000000-0000-4000-8000-000000000000/reconcile','POST'],['/api/admin/payments/00000000-0000-4000-8000-000000000000/reversal-review','POST']] as const){
   const response=await fetch(origin+route,{method,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
   check(finding,'Direct anonymous payment review/reconciliation requests are denied',response.status===401);await response.body?.cancel();
  }
 }finally{await created.app.locals.closeSupport?.();await created.app.locals.closeRealtime();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}

async function verifyAdvisor(config:any,finding:string){
 const cli=process.env.PINEVELA_SUPABASE_CLI;
 if(cli){
  const dbUrl=`postgresql://pv_restore@localhost:6543/postgres?host=${encodeURIComponent(config.host)}&sslmode=disable`;
  try{
   const result=await promisify(execFile)(cli,['db','advisors','--db-url',dbUrl,'--type','security','--output','json'],{
    env:{...process.env,SUPABASE_HOME:'/tmp/pinevela-remediation-cli',SUPABASE_TELEMETRY_DISABLED:'true'},timeout:45000,maxBuffer:4*1024*1024});
   fs.writeFileSync(path.join(directory,finding.toLowerCase()+'-advisors.json'),result.stdout,{mode:0o600});
   fs.writeFileSync(path.join(directory,finding.toLowerCase()+'-advisors.stderr'),result.stderr,{mode:0o600});
  }catch(error:any){
   fs.writeFileSync(path.join(directory,finding.toLowerCase()+'-advisors-failure.log'),String(error.stderr||error.message),{mode:0o600});
   throw new Error('Local security advisor could not complete; inspect private diagnostics before proceeding.');
  }
 }
}

async function nativeActors(db:SupabaseDatabase){return (await db.pool.query(`select distinct on(c.auth_user_id,c.kind) s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
  from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
  join public.account_contexts c on c.id=s.active_context_id where c.status='active' and c.kind in ('primary','seller','admin')
  and(n.not_after is null or n.not_after>now()) and private.portal_session_allowed(c.id,s.portal_pin_version)
  and private.account_session_allowed(c.id,s.session_id) order by c.auth_user_id,c.kind,n.created_at desc limit 8`)).rows as VerifiedActor[];}
async function verifyHistory(db:SupabaseDatabase){
 const f='PV-04',actors=await nativeActors(db);check(f,'Existing native sessions are used without creating test accounts',actors.length>=2);
 const indexes=(await db.pool.query("select indexname from pg_indexes where indexname in ('market_messages_buyer_history_idx','market_messages_store_history_idx','market_orders_buyer_history_idx','market_orders_store_history_idx','market_order_events_history_idx')")).rows;
 check(f,'All five scoped history indexes are installed',indexes.length===5);
 check(f,'The bounded batched timeline query executes against the actual schema',(await db.system(c=>orderEventRows(c,[]))).length===0);
 for(const a of actors){
  let statements=0;
  const page=await db.authorizedSystem(a,['primary','seller','admin'],async c=>{
    const query=c.query.bind(c);c.query=((...args:any[])=>{statements++;return (query as any)(...args);}) as any;
    try{return await orderPage(c,a,undefined,historyPage({limit:'1',paged:'1'}));}finally{c.query=query;}
  });
  check(f,'Order page is bounded and related reads use a constant query budget',page.orders.length<=1&&statements<=7);
  check(f,'Each returned timeline is bounded independently of its historical length',page.orders.every(order=>order.timeline.length<=20));
  await assert.rejects(()=>db.authorizedSystem(a,['primary','seller','admin'],c=>orderTimelinePage(c,a,a.authUserId)),(e:any)=>e instanceof ApiError&&e.status===404);
  check(f,'The timeline endpoint does not expose unrelated resources',true);
  check(f,'Order totals are calculated independently of the displayed page',page.summary.total>=page.orders.length&&page.summary.pending>=0&&page.summary.completed>=0&&page.summary.revenue>=0);
  check(f,'Order pages cannot reveal another buyer or seller account',page.orders.every(o=>a.kind==='admin'||a.kind==='primary'&&o.buyerId===a.contextId||a.kind==='seller'&&o.sellerId===a.contextId));
  if(a.kind!=='primary')check(f,'Seller and administrator history has no delivery PIN material',page.orders.every(o=>!Object.hasOwn(o,'otpPin')&&!Object.hasOwn(o,'deliveryPinState')));
  if(page.nextCursor){const next=await db.authorizedSystem(a,['primary','seller','admin'],c=>orderPage(c,a,undefined,historyPage({limit:'1',before:page.nextCursor!})));
   check(f,'The next order page does not repeat the boundary row',next.orders.every(o=>o.id!==page.orders[0].id));}
  if(a.kind!=='admin'){
   const messages=await db.authorizedRead(a,['primary','seller'],c=>conversationPage(c,a,historyPage({limit:'1'},true)));
   check(f,'Encrypted message reads have a bounded page size',messages.messages.length<=1);
   check(f,'Message pages remain scoped to the active participant',messages.messages.every(m=>m.senderId===a.contextId||m.recipientId===a.contextId));
   if(messages.newestCursor){const next=await db.authorizedRead(a,['primary','seller'],c=>conversationPage(c,a,historyPage({after:messages.newestCursor!,limit:'1'},true)));
    check(f,'Incremental polling does not download the previous history',next.messages.length===0);}
   const future=encodeHistoryCursor({cursor_time:'2099-01-01T00:00:00.123456Z',id:a.contextId});
   const none=await db.authorizedRead(a,['primary','seller'],c=>conversationPage(c,a,historyPage({after:future},true)));
   check(f,'A caller-selected cursor cannot widen message ownership',none.messages.length===0);
  }
 }
 const forged={...actors.find(a=>a.kind==='primary')!,contextId:actors.find(a=>a.contextId!==actors[0].contextId)!.contextId};
 await assert.rejects(()=>db.authorizedRead(forged,['primary','seller'],c=>conversationPage(c,forged)));
 check(f,'Spoofing another active context is rejected before a history query',true);
}

async function verifyOrderRecovery(db:SupabaseDatabase){
 const f='PV-05',actors=await nativeActors(db);
 const table=(await db.pool.query(`select c.relrowsecurity,not a.attnotnull as system_actor_allowed from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attname='actor_context_id' where n.nspname='private' and c.relname='market_order_events'`)).rows[0];
 check(f,'Expiry evidence keeps RLS and permits an explicitly system-owned actor',table.relrowsecurity&&table.system_actor_allowed);
 for(const role of ['anon','authenticated','pinevela_backend'])check(f,'Clients cannot manufacture or rewrite order events',!(await db.pool.query("select has_table_privilege($1,'private.market_order_events','INSERT,UPDATE,DELETE') as allowed",[role])).rows[0].allowed);
 const before=(await db.pool.query(`select count(*)::int as count from public.market_orders where status in ('awaiting_seller','pending_meetup') and reserved_until<=clock_timestamp()`)).rows[0].count;
 const terminal=async()=> (await db.pool.query("select md5(coalesce(jsonb_agg(to_jsonb(o) order by id),'[]'::jsonb)::text) as hash from public.market_orders o where status in ('completed','cancelled','rejected')")).rows[0].hash;
 const retained=await terminal(),first=await expireOrderReservations(db),second=await expireOrderReservations(db);
 check(f,'Expiry processing is bounded to 50 saved reservations',first<=50&&first<=before);
 check(f,'Recovery preserves every existing completed/cancelled/rejected order',retained===await terminal());
 check(f,'Recovery does not duplicate expiry for a processed batch',before<=50?second===0:second<=50);
 const inconsistent=(await db.pool.query(`select count(*)::int as count from public.market_orders o where o.status='expired' and exists(select 1 from private.market_order_pins p where p.order_id=o.id)`)).rows[0].count;
 check(f,'Terminal expired orders retain no active private PIN',inconsistent===0);
 for(const a of actors.filter(a=>a.kind!=='admin')){
  await assert.rejects(()=>db.authorizedSystem(a,['primary','seller'],c=>changeOrder(c,a,a.authUserId,{action:'cancelled'},loadOrderPins())),(e:any)=>e instanceof ApiError&&e.status===404);
  check(f,'A genuine native account cannot cancel an unrelated resource ID',true);
  await assert.rejects(()=>db.authorizedSystem(a,['primary','seller'],c=>changeOrder(c,a,a.authUserId,{action:'cancelled',buyerId:a.contextId},loadOrderPins())),(e:any)=>e instanceof ApiError&&e.status===400);
  check(f,'Cancellation rejects caller-supplied ownership selectors',true);
 }
 // Real domain rows are never fabricated just to satisfy a positive assertion.
 fs.writeFileSync(path.join(directory,'pv05-available-coverage.json'),JSON.stringify({realExpiredReservationsAvailable:before,processed:first+second,liveHandoverOrCancellationPerformed:false})+'\n',{mode:0o600});
}

async function verifyCompanionRetry(db:SupabaseDatabase){
 const f='PV-06',actor=(await nativeActors(db)).find(a=>a.kind==='primary')!,auth=new SupabaseAuth(db);
 const state=await db.readActor(actor,c=>companionState(c,actor));
 await db.actor(actor,c=>saveCompanionPreferences(c,actor,{...state.preferences,aiEnabled:true}));
 const id=crypto.randomUUID(),first=await reserveCompanionTurn(auth,actor,id);
 check(f,'The real native account can reserve one logical companion reply',!first.cached&&!!first.state);
 const usage=async()=>JSON.stringify((await db.pool.query('select * from private.companion_usage_windows where bucket=$1',[actor.authUserId])).rows);
 const before=await usage();
 await assert.rejects(()=>reserveCompanionTurn(auth,actor,id),(e:any)=>e instanceof ApiError&&e.status===409);
 check(f,'Retrying while the same reply is pending cannot reserve another turn',before===await usage());
 const other=(await nativeActors(db)).find(a=>a.kind==='primary'&&a.authUserId!==actor.authUserId)!;
 await assert.rejects(()=>reserveCompanionTurn(auth,{...actor,contextId:other.contextId},id));
 check(f,'A retry cannot reuse a different native account context',true);
}

async function verifyOrderNotices(db:SupabaseDatabase){
 const f='PV-07',actors=(await nativeActors(db)).filter(a=>a.kind==='primary');
 const fk=(await db.pool.query(`select c.confdeltype from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.conrelid='public.notifications'::regclass and c.contype='f' and a.attname='market_order_id'`)).rows[0];
 check(f,'Order notices use an actual optional FK and preserve notices after approved order deletion',fk?.confdeltype==='n');
 check(f,'The migration does not guess historical notice ownership from text',(await db.pool.query('select count(*)::int as count from public.notifications where market_order_id is not null')).rows[0].count===0);
 const fn=(await db.pool.query(`select p.proconfig,p.prosecdef,has_function_privilege('authenticated',p.oid,'execute') as browser from pg_proc p where p.oid='private.check_order_notification_reference()'::regprocedure`)).rows[0];
 check(f,'Reference guards use a pinned search path and cannot be invoked by browsers',fn.prosecdef&&fn.proconfig.includes('search_path=""')&&!fn.browser);
 let sample:any[]=[];
 for(const actor of actors){
  const notices=await db.readActor(actor,c=>readNotifications(c,actor));
  check(f,'Native owners can still read their own notifications',Array.isArray(notices));
  if(!sample.length)sample=notices.filter(n=>!n.read).slice(0,4);
  const notice=notices[0];if(!notice)continue;
  const other=actors.find(a=>a.authUserId!==actor.authUserId)!;
  const denied=await db.actor(other,c=>c.query('update public.notification_recipients set read_at=now() where notification_id=$1 and context_id=$2',[notice.id,actor.contextId]));
  check(f,'Direct cross-account acknowledgement is denied by RLS',denied.rowCount===0);
  const changed=await db.actor(actor,c=>c.query('update public.notification_recipients set read_at=coalesce(read_at,now()) where notification_id=$1 and context_id=$2 returning read_at',[notice.id,actor.contextId]));
  check(f,'The native recipient can acknowledge the actual visible notice',changed.rowCount===1&&!!changed.rows[0].read_at);
 }
 fs.writeFileSync(path.join(directory,'pv07-browser-notices.json'),JSON.stringify(sample)+'\n',{mode:0o600});
}

async function verifyPreferenceTypes(db:SupabaseDatabase){
 const f='PV-10',actor=(await nativeActors(db)).find(a=>a.kind==='primary')!;
 const original=await db.readActor(actor,c=>companionState(c,actor));
 const snapshot=async()=>JSON.stringify((await db.pool.query('select * from private.companion_preferences where context_id=$1',[actor.contextId])).rows);
 const before=await snapshot();
 for(const responseStyle of [['brief'],['balanced'],['detailed'],{},true,1,null]){
  await assert.rejects(()=>db.actor(actor,c=>saveCompanionPreferences(c,actor,{...DEFAULT_COMPANION_PREFERENCES,responseStyle})),(e:any)=>e instanceof ApiError&&e.status===400);
  check(f,'Malformed preference primitive produces a controlled 400 before any database write',await snapshot()===before);
 }
 for(const responseStyle of ['balanced','brief','detailed'] as const){
  const result=await db.actor(actor,c=>saveCompanionPreferences(c,actor,{...original.preferences,responseStyle}));
  check(f,'A genuine native account can save each supported response style',result.responseStyle===responseStyle);
 }
 const other=(await nativeActors(db)).find(a=>a.kind==='primary'&&a.authUserId!==actor.authUserId)!;
 await assert.rejects(()=>db.actor({...actor,contextId:other.contextId},c=>saveCompanionPreferences(c,actor,original.preferences)));
 check(f,'Preference validation does not weaken native account binding',true);
}

try{
  assert.ok(['PV-01','PV-02','PV-03','PV-04','PV-05','PV-06','PV-07','PV-08','PV-10'].includes(selected),'Unknown or unimplemented finding');
  await withIsolatedBackup(checkpoint,async config=>{
    const db=new SupabaseDatabase(config);
    try{
      const paymentFingerprint=async()=> (await db.pool.query("select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb)::text) as digest from public.payments p")).rows[0].digest;
      const originalPayments=await paymentFingerprint();
      await db.system(async client=>{
        const installed=new Map((await client.query('select version,digest from private.schema_migrations')).rows.map(row=>[row.version,row.digest]));
        for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
          const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
          if(installed.has(version))assert.equal(installed.get(version),digest,'Installed migrations remain immutable');
          else{await client.query(sql);await client.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,digest]);}
        }
      });
      if(selected==='PV-01')await verifyLimits(db);
      if(selected==='PV-02')await verifyApiFailures(db);
      if(selected==='PV-08'){const result=await verifyRemediationBrowser(db);for(const name of result.framing)check('PV-08',name,true);for(const name of result.visibility)check('PV-07',name,true);}
      if(selected==='PV-10')await verifyPreferenceTypes(db);
      if(selected==='PV-07'){await verifyOrderNotices(db);await verifyAdvisor(config,selected);}
      if(selected==='PV-06')await verifyCompanionRetry(db);
      if(selected==='PV-05'){await verifyOrderRecovery(db);await verifyAdvisor(config,selected);}
      if(selected==='PV-04'){await verifyHistory(db);await verifyAdvisor(config,selected);}
      if(selected==='PV-03'){
        check('PV-03','Migration preserves every original payment and receipt',await paymentFingerprint()===originalPayments);
        await verifyReversalMigration(db,config);await verifyAdvisor(config,selected);
      }
    }finally{await db.close();}
  });
  const result={passed:true,finding:selected,checks:checks.length,results:checks,existingEncryptedCheckpointOnly:true,hostedWrites:0,providerCalls:0,fabricatedIdentities:0};
  fs.writeFileSync(path.join(directory,selected.toLowerCase()+'-runtime.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({passed:true,finding:selected,checks:checks.length,hostedWrites:0,providerCalls:0}));
}catch(error){
  fs.writeFileSync(path.join(directory,selected.toLowerCase()+'-failure.log'),String((error as any)?.stack||error),{mode:0o600});
  console.error(JSON.stringify({passed:false,finding:selected,checks:checks.length,code:(error as any)?.code}));process.exitCode=1;
}finally{globalThis.fetch=nativeFetch;}
