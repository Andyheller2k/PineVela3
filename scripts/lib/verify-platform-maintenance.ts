import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../../supabase/db.js';
import { SupabaseAuth } from '../../supabase/auth.js';
import { SupabasePublicSettings } from '../../supabase/publicSettings.js';
import { recoveryNotice, dismissRecoveryNotice } from '../../supabase/platformMaintenance.js';
import { createSupabaseApp } from '../../supabase/app.js';
import type { Server } from 'node:http';
import { paystackConfig } from '../../paystackProvider.js';

/** Only isolated restored Google subjects and their existing live sessions. */
export async function verifyPlatformMaintenance(db: SupabaseDatabase, admins: VerifiedActor[], keys: string[], primary: VerifiedActor) {
  let checks=0;
  const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
  const denied=async(work:()=>Promise<unknown>,status:number|string,label:string)=>{
    let error:any;try{await work();}catch(e){error=e;}
    check(typeof status==='number'?error instanceof ApiError && error.status===status:error?.code===status,label);
  };
  const [founder,other]=admins,auth=new SupabaseAuth(db),service=new SupabasePublicSettings(auth);
  const live=async()=>(await db.pool.query("select value from private.platform_settings where key='platform'")).rows[0].value;
  const events=async(type:string)=>Number((await db.pool.query('select count(*) from private.audit_events where event_type=$1',[type])).rows[0].count);
  const savedBinding=(await db.pool.query('select active_context_id from private.account_sessions where session_id=$1',[primary.sessionId])).rows[0].active_context_id;
  await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary.sessionId,primary.contextId]));
  let server:Server|undefined, closeRealtime:(()=>Promise<void>)|undefined;
  try {
    check((await recoveryNotice(auth,primary)).notice===null,'No recovery notice exists before an actual restoration');
    await denied(()=>service.update(primary,{settingsKey:keys[3],maintenanceMode:true}),403,'A primary portal cannot activate maintenance');
    await denied(()=>service.update(founder,{settingsKey:keys[1],maintenanceMode:true}),403,'A foreign settings key cannot activate maintenance');
    await denied(()=>service.update(founder,{settingsKey:keys[0],maintenanceMode:true,maintenanceRecoveryMessage:'Restored'}),400,'Recovery text cannot be supplied on activation');
    await denied(()=>service.update(founder,{settingsKey:keys[0],maintenanceMode:false,maintenanceRecoveryMessage:' '}),400,'Blank recovery text is rejected');
    await denied(()=>db.system(c=>c.query("update private.platform_settings set value=value || '{\"maintenanceMode\":true}'")),'42501','Direct privileged SQL cannot activate maintenance without a verified administrator grant');
    const before=await live(),revision=(await db.pool.query('select * from private.admin_pricing_state')).rows[0];
    let entered!:()=>void,release!:()=>void;
    const ready=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
    const inFlight=db.actor(primary,async c=>{await c.query('select id from public.profiles');entered();await hold;});
    await ready;
    const activation=service.update(founder,{settingsKey:keys[0],maintenanceMode:true});
    // Wait for PostgreSQL itself to report the exclusive maintenance lease waiting.
    let waiting=false;
    for(let attempt=0;attempt<100;attempt++) {
      waiting=(await db.pool.query("select exists(select 1 from pg_locks where locktype='advisory' and not granted and mode='ExclusiveLock') as waiting")).rows[0].waiting;
      if(waiting)break;
      await new Promise(r=>setTimeout(r,10));
    }
    release();await inFlight;await activation;
    check(waiting,'Maintenance activation waits for an in-flight authorized account transaction');
    check((await live()).maintenanceMode===true,'A valid administrator settings key activates maintenance');
    check(await events('platform_maintenance_enabled')===1,'One activation creates one audit event');
    check((await db.pool.query("select count(*) from public.notifications where title='Maintenance mode enabled'")).rows[0].count==='1','Activation creates one administrator settings notice');
    check((await db.pool.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Maintenance mode enabled'")).rows[0].count==='4','All four actual administrators receive the state notice');
    await service.update(founder,{settingsKey:keys[0],maintenanceMode:true});
    check(await events('platform_maintenance_enabled')===1,'An identical activation retry does not repeat history');
    await denied(()=>db.actor(primary,c=>c.query('select id from public.profiles')),503,'Ordinary actor transactions pause during maintenance');
    await denied(()=>db.authorizedSystem(primary,['primary'],async()=>undefined),503,'Privileged lifecycle wrappers cannot bypass maintenance for users');
    await denied(()=>db.publicRows('select * from private.listing_catalog'),503,'Public catalog transactions pause during maintenance');
    await denied(()=>db.availableSystem(async()=>undefined),503,'Public invitation lifecycle transactions cannot bypass maintenance');
    const founderPrimary=(await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[founder.authUserId])).rows[0].id;
    await denied(()=>auth.switchContext(founder,founderPrimary),
      503,'An administrator cannot switch into a paused ordinary portal');
    check((await db.pool.query('select active_context_id from private.account_sessions where session_id=$1',[founder.sessionId])).rows[0].active_context_id===founder.contextId,
      'Rejected switching preserves the administrator recovery binding');
    await denied(()=>recoveryNotice(auth,primary),503,'Paused accounts cannot read their recovery feed');
    check((await db.actor(founder,c=>c.query('select context_id from public.admin_memberships'))).rowCount===4,'Verified administrators retain RLS-protected recovery access');
    await db.system(async c=>{
      await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:primary.authUserId,session_id:primary.sessionId,role:'authenticated'})]);
      await c.query('set local role authenticated');
      check((await c.query('select id from public.profiles')).rowCount===0,'Direct authenticated RLS hides profiles during maintenance');
      check((await c.query('select private.current_context_id() as id')).rows[0].id===null,'A valid ordinary binding yields no usable maintenance context');
    });
    await db.system(async c=>{
      await c.query('set local role pinevela_catalog');
      for(const view of ['listing_catalog','residence_catalog','store_catalog','market_reviews_public'])
        check((await c.query('select * from private.'+view)).rowCount===0,'Anonymous owner-executed projections are gated');
    });
    const {app}=createSupabaseApp(db);closeRealtime=app.locals.closeRealtime;
    server=app.listen(0,'127.0.0.1');
    await new Promise<void>(resolve=>server!.once('listening',resolve));
    const origin=`http://127.0.0.1:${(server.address() as any).port}`;
    const request=async(route:string,status:number,method='GET',body?:unknown)=>{
      const response=await fetch(origin+route,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
      check(response.status===status,`Maintenance HTTP ${method} ${route} returns ${status}`);
      if(status===503)check(response.headers.get('retry-after')==='30' && (await response.json()).maintenanceMode===true,'Maintenance HTTP returns retry guidance and a consistent state');
      return response;
    };
    check((await (await request('/api/settings',200)).json()).maintenanceMode===true,'Public settings expose current maintenance state');
    await request('/api/health',200);
    for(const route of ['/api/auth/signup','/api/digital-market/items','/api/storage/upload-maintenance-image','/api/auth/maintenance-notice'])
      await request(route,503,route.includes('signup')||route.includes('upload')?'POST':'GET');
    await request('/api/auth/google/start',503,'POST',{mode:'signup'});
    await request('/api/auth/logout',200,'POST',{});
    const event=JSON.stringify({event:'verification.protocol-check'});
    const webhook=await fetch(origin+'/api/payments/paystack/webhook',{method:'POST',headers:{'content-type':'application/json',
      'x-paystack-signature':crypto.createHmac('sha512',paystackConfig().key).update(event).digest('hex'),origin:'https://untrusted.invalid'},body:event});
    check(webhook.status===200,'An authentic non-charge provider protocol event remains accepted during maintenance');
    const cross=await fetch(origin+'/api/settings',{method:'POST',headers:{origin:'https://untrusted.invalid','content-type':'application/json'},body:'{}'});
    check(cross.status===403,'CSRF enforcement remains ahead of maintenance recovery operations');
    await denied(()=>service.update(founder,{settingsKey:keys[0],maintenanceMode:false}),400,'Ending maintenance requires an explicit nonblank recovery message');
    check((await live()).maintenanceMode===true,'Rejected restoration leaves maintenance active');
    await denied(()=>service.update(founder,{settingsKey:keys[1],maintenanceMode:false,maintenanceRecoveryMessage:'Service restored.'}),403,'Restoration also requires the acting administrator key');
    await service.update(founder,{settingsKey:keys[0],maintenanceMode:false,maintenanceRecoveryMessage:' Service restored. '});
    check((await live()).maintenanceMode===false && !(await live()).maintenanceRecoveryMessage,'Restoration clears maintenance without storing transient form text in public settings');
    check(await events('platform_restored')===1,'Restoration is audited once');
    const row=(await db.pool.query('select * from private.maintenance_recovery_notices')).rows[0];
    check(row.created_by_context_id===founder.contextId && row.message==='Service restored.','Recovery notice records the actual administrator and trimmed text');
    check(new Date(row.expires_at).getTime()-new Date(row.created_at).getTime()===86400000,'Notice expires exactly 24 hours after server-recorded restoration');
    check((await db.pool.query('select count(*) from private.maintenance_recovery_recipients where notice_id=$1',[row.id])).rows[0].count==='4','Restoration snapshots the existing active non-admin audience');
    check((await recoveryNotice(auth,founder)).notice===null,'Administrator recovery does not inherit a user popup');
    check((await recoveryNotice(auth,primary)).notice?.id===row.id,'The exact existing recipient receives the notice');
    check((await db.actor(primary,c=>c.query('select id from public.profiles'))).rowCount===1,'Ordinary account RLS access returns after restoration');
    await denied(()=>dismissRecoveryNotice(auth,primary,{noticeId:row.id,contextId:founder.contextId}),400,'Dismissal rejects client-selected identity');
    await denied(()=>dismissRecoveryNotice(auth,primary,{noticeId:crypto.randomUUID()}),409,'A different notice cannot be acknowledged');
    await denied(()=>dismissRecoveryNotice(auth,founder,{noticeId:row.id}),409,'An administrator is not a recovery notice recipient');
    await Promise.all([dismissRecoveryNotice(auth,primary,{noticeId:row.id}),dismissRecoveryNotice(auth,primary,{noticeId:row.id})]);
    check((await recoveryNotice(auth,primary)).notice===null,'Concurrent dismissal persists once and hides the recipient popup');
    const dismissed=(await db.pool.query('select dismissed_at from private.maintenance_recovery_recipients where notice_id=$1 and context_id=$2',[row.id,primary.contextId])).rows[0].dismissed_at;
    await db.actor(primary,c=>c.query('update private.maintenance_recovery_recipients set dismissed_at=null where notice_id=$1',[row.id]));
    check((await db.pool.query('select dismissed_at from private.maintenance_recovery_recipients where notice_id=$1 and context_id=$2',[row.id,primary.contextId])).rows[0].dismissed_at.getTime()===dismissed.getTime(),'SQL prevents resetting or forging a dismissal timestamp');
    for(const role of ['anon','authenticated'])
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.maintenance_recovery_notices');}),'42501','Browser roles cannot directly read private notice storage');
    const secondPrimary={...other,contextId:(await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[other.authUserId])).rows[0].id,kind:'primary'};
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[secondPrimary.sessionId,secondPrimary.contextId]));
    try {
      check((await recoveryNotice(auth,secondPrimary)).notice?.id===row.id,'One account dismissal does not dismiss another existing recipient');
      check((await db.actor(primary,c=>c.query('select context_id from private.maintenance_recovery_recipients where context_id=$1',[secondPrimary.contextId]))).rowCount===0,'RLS hides another recipient acknowledgment');
      check((await db.actor(primary,c=>c.query('update private.maintenance_recovery_recipients set dismissed_at=now() where context_id=$1',[secondPrimary.contextId]))).rowCount===0,'RLS prevents cross-account dismissal');
    } finally {await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[other.sessionId,other.contextId]));}
    await service.update(founder,{settingsKey:keys[0],maintenanceMode:false,maintenanceRecoveryMessage:'Service restored.'});
    check((await db.pool.query('select count(*) from private.maintenance_recovery_notices')).rows[0].count==='1','Repeated restoration creates no additional popup');
    await service.update(founder,{settingsKey:keys[0],maintenanceMode:true});
    await service.update(founder,{settingsKey:keys[0],maintenanceMode:false,maintenanceRecoveryMessage:'Second restoration.'});
    check((await recoveryNotice(auth,primary)).notice?.message==='Second restoration.','A new restoration shows its own notice after an earlier dismissal');
    await denied(()=>dismissRecoveryNotice(auth,primary,{noticeId:row.id}),409,'Old restoration cannot dismiss the latest notice');
    const after=await live();delete after.maintenanceMode;
    check(JSON.stringify(after)===JSON.stringify(before),'Maintenance preserves contact, announcement, pricing and payment destination settings');
    check(JSON.stringify((await db.pool.query('select * from private.admin_pricing_state')).rows[0])===JSON.stringify(revision),'Maintenance preserves approved pricing revisions');
    const restarted=new SupabaseDatabase(db.pool.options);
    try{check((await recoveryNotice(new SupabaseAuth(restarted),primary)).notice?.message==='Second restoration.','Recovery notice and audience persist across backend pool restart');}finally{await restarted.close();}
    const late={...primary,kind:'officer',contextId:(await db.system(c=>c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'officer','active') returning id",[primary.authUserId]))).rows[0].id};
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[late.sessionId,late.contextId]));
    try {
      check((await recoveryNotice(auth,late)).notice===null,'A portal created after restoration is excluded from the saved audience');
      await denied(()=>dismissRecoveryNotice(auth,late,{noticeId:row.id}),409,'A later portal cannot acknowledge another portal notice');
    } finally {await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary.sessionId,primary.contextId]));}
    // Legitimate historical notice timestamps in this isolated restore; Auth session
    // times remain unchanged. Remove only isolated notices to test the latest expiry.
    const expired=(await db.system(async c=>{
      await c.query('delete from private.maintenance_recovery_notices');
      const id=(await c.query(`insert into private.maintenance_recovery_notices(created_by_context_id,message,created_at,expires_at)
        select $1,'Service restored.',time,time+interval '24 hours' from (select clock_timestamp()-interval '25 hours' as time) historical returning id`,[founder.contextId])).rows[0].id;
      await c.query('insert into private.maintenance_recovery_recipients(notice_id,context_id) values($1,$2)',[id,primary.contextId]);return id;
    })).toString();
    check((await recoveryNotice(auth,primary)).notice===null,'An expired latest notice is hidden by RLS and the service');
    await denied(()=>dismissRecoveryNotice(auth,primary,{noticeId:expired}),409,'An expired notice cannot be acknowledged');
    await denied(()=>db.actor(primary,c=>c.query('update private.maintenance_recovery_recipients set dismissed_at=now() where notice_id=$1',[expired])),
      '42501','The SQL guard independently rejects expired recipient mutation');
    check((await db.pool.query('select count(*) from auth.users')).rows[0].count==='5','Maintenance tests create no Auth accounts');
  } finally {
    await closeRealtime?.();
    if(server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));}
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary.sessionId,savedBinding]));
  }
  return checks;
}
