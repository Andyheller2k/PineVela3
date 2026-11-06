import crypto from 'node:crypto';
import type {PoolClient} from 'pg';
import type {SupabaseDatabase} from './db.js';
import {notify} from './notifications.js';
import {PLATFORM_TERMS} from '../legalPolicy.js';
import {privatePushBody,pushOpenPath,pushTitle} from '../devicePushPolicy.js';
import {pushConfiguration,sendDevicePush,type PushMessage,type DeliveryResult} from './devicePushProvider.js';

// A push grant is created only while this exact portal is authenticated. It
// can survive switching portals; it cannot survive logout, PIN rotation,
// session revocation, bans, staff departure or a withdrawn housing allocation.
export const PUSH_BINDING_ALLOWED=`b.enabled and i.enabled and i.expires_at>clock_timestamp()
  and c.status='active' and private.account_session_allowed(c.id,b.session_id)
  and private.portal_session_allowed(c.id,b.portal_pin_version)
  and exists(select 1 from private.account_sessions s where s.session_id=b.session_id and s.auth_user_id=b.auth_user_id)
  and exists(select 1 from auth.users u where u.id=b.auth_user_id and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=clock_timestamp()))
  and exists(select 1 from private.legal_acceptances a where a.auth_user_id=b.auth_user_id and a.purpose='platform_access'
    and a.document_key='platform_terms' and a.document_version='${PLATFORM_TERMS.version}' and a.document_sha256='${PLATFORM_TERMS.sha256}')
  and (c.kind<>'admin' or private.administrator_session_allowed(c.id,b.session_id))
  and (c.kind<>'resident' or exists(select 1 from public.allocations a where a.resident_context_id=c.id and a.ended_at is null))
  and (c.kind<>'staff' or exists(select 1 from public.staff_assignments a where a.staff_context_id=c.id and a.status='active' and a.ended_at is null))`;

export async function discoverPushPublications(c:PoolClient){
  if(!(await c.query('select private.platform_available() as available')).rows[0].available)return 0;
  // A nonblocking transaction lock prevents replicas duplicating a broadcast.
  if(!(await c.query("select pg_try_advisory_xact_lock(hashtextextended('pinevela-push-discovery',0)) as allowed")).rows[0].allowed)return 0;
  const candidates=(await c.query(`select * from (
    select 'listing'::text as kind,l.id as subject_id,l.title,l.kind as listing_kind,l.price,l.currency
    from private.listing_catalog l where l.is_available
      and not exists(select 1 from private.device_push_publications p where p.kind='listing' and p.subject_id=l.id)
    union all select 'residence',r.id,r.name,null,null,null from private.residence_catalog r
      where not exists(select 1 from private.device_push_publications p where p.kind='residence' and p.subject_id=r.id)
    ) candidates order by kind,subject_id limit 20`)).rows;
  for(const item of candidates){
    const reserved=await c.query(`insert into private.device_push_publications(kind,subject_id) values($1,$2)
      on conflict(kind,subject_id) do nothing returning subject_id`,[item.kind,item.subject_id]);
    if(!reserved.rowCount)continue;
    const preference=item.kind==='listing'?'marketplace':'residences';
    const recipients=(await c.query(`select distinct b.context_id from private.device_push_bindings b
      join private.device_push_installations i on i.id=b.installation_id
      join public.account_contexts c on c.id=b.context_id where b.${preference} and ${PUSH_BINDING_ALLOWED}`)).rows.map(r=>r.context_id);
    if(!recipients.length)continue;
    const title=item.kind==='residence'?'New residence on PineVela':item.listing_kind==='service'?'New service on PineMarket':'New item on PineMarket';
    const message=item.kind==='residence'?`Explore ${item.title}.`: `${item.title} · ${item.currency} ${Number(item.price).toFixed(2)}`;
    const id=await notify(c,recipients,{category:item.kind==='listing'?'discover_market':'discover_residence',title,message,
      link:item.kind==='listing'?'/pinemarket?listing='+item.subject_id:'/pineresidence?property='+item.subject_id});
    await c.query('update private.device_push_publications set notification_id=$3 where kind=$1 and subject_id=$2',[item.kind,item.subject_id,id]);
  }
  return candidates.length;
}

export async function claimPushJobs(c:PoolClient,limit=12){
  return (await c.query(`with due as (
    select id from private.device_push_jobs where (state='pending' and available_at<=clock_timestamp()
      or state='processing' and lease_until<clock_timestamp()) and attempts<6 and expires_at>clock_timestamp()
    order by available_at,created_at for update skip locked limit $1)
    update private.device_push_jobs j set state='processing',attempts=attempts+1,
    lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
    from due where j.id=due.id returning j.id,j.lease_id`,[Math.min(20,Math.max(1,limit))])).rows;
}

export async function pushJobMessage(c:PoolClient,id:string,lease:string):Promise<{platform:string;endpoint:any;message:PushMessage}|null>{
  const row=(await c.query(`select n.id,n.title,n.category,n.link,b.context_id,c.kind,i.platform,i.endpoint,
    p.kind as discovery,p.subject_id,
    exists(select 1 from private.support_memberships m where m.context_id=c.id and m.status='active') as support_operator
    from private.device_push_jobs j join private.device_push_bindings b on b.id=j.binding_id and b.installation_id=j.installation_id
    join private.device_push_installations i on i.id=b.installation_id
    join public.account_contexts c on c.id=b.context_id
    join public.notifications n on n.id=j.notification_id
    join public.notification_recipients r on r.notification_id=n.id and r.context_id=b.context_id
    left join private.device_push_publications p on p.notification_id=n.id
    where j.id=$1 and j.lease_id=$2 and j.state='processing' and j.expires_at>clock_timestamp()
      and n.created_at>=b.enabled_at and ${PUSH_BINDING_ALLOWED}
      and case n.category when 'discover_market' then b.marketplace when 'discover_residence' then b.residences else b.account_alerts end`,[id,lease])).rows[0];
  if(!row)return null;
  let kind=row.kind,body=privatePushBody(kind,row.category),image:string|undefined;
  if(typeof row.link==='string'&&row.link.startsWith('/customer-service')){
    if(!row.support_operator&&kind!=='admin')return null;
    kind='feedback';body=privatePushBody(kind,row.category);
  }
  if(row.discovery){
    // One discovery alert per device, even when several of its account portals
    // opted in. Private/maintenance alerts remain distinct per account.
    const preferred=(await c.query(`select b.context_id from private.device_push_bindings b
      join private.device_push_installations i on i.id=b.installation_id join public.account_contexts c on c.id=b.context_id
      where i.id=(select installation_id from private.device_push_jobs where id=$1)
      and ${PUSH_BINDING_ALLOWED} and ${row.discovery==='listing'?'b.marketplace':'b.residences'}
      and exists(select 1 from public.notification_recipients r join public.notifications n on n.id=r.notification_id
        where r.notification_id=$2 and r.context_id=b.context_id and n.created_at>=b.enabled_at)
      order by (c.kind='primary') desc,b.enabled_at,b.id limit 1`,[id,row.id])).rows[0];
    if(preferred?.context_id!==row.context_id)return null;
    const item=row.discovery==='listing'
      ?(await c.query('select title,price,currency from private.listing_catalog where id=$1 and is_available',[row.subject_id])).rows[0]
      :(await c.query('select name as title from private.residence_catalog where id=$1',[row.subject_id])).rows[0];
    if(!item)return null;
    if(!(await c.query('select private.platform_available() as available')).rows[0].available)return null;
    body=row.discovery==='listing'?`${item.title} · ${item.currency} ${Number(item.price).toFixed(2)}`:`Explore ${item.title}.`;
    image=`https://pinevela.app/api/device-push/images/${row.discovery}/${row.subject_id}.jpg`;
  }
  return {platform:row.platform,endpoint:row.endpoint,message:{title:pushTitle(kind,row.title),body:body.slice(0,220),
    tag:'pv:'+row.id+':'+row.context_id,path:pushOpenPath(row.id,row.context_id,kind),
    image,accountKind:kind,notificationId:row.id,contextId:row.context_id,discovery:Boolean(row.discovery)}};
}

export async function finishPushJob(c:PoolClient,id:string,lease:string,result:DeliveryResult){
  const row=(await c.query(`select installation_id,attempts from private.device_push_jobs where id=$1 and lease_id=$2 and state='processing' for update`,[id,lease])).rows[0];
  if(!row)return;
  if(result.state==='invalid')await c.query('update private.device_push_installations set enabled=false where id=$1',[row.installation_id]);
  const state=result.state==='sent'?'sent':result.state==='invalid'?'cancelled':result.state==='retry'&&row.attempts<6?'pending':'failed';
  const delay=Math.min(3600,30*2**row.attempts)+crypto.randomInt(0,15);
  await c.query(`update private.device_push_jobs set state=$3,lease_id=null,lease_until=null,failure_code=$4,
    delivered_at=case when $3='sent' then clock_timestamp() else null end,
    available_at=clock_timestamp()+$5*interval '1 second' where id=$1 and lease_id=$2`,[id,lease,state,result.code,delay]);
}

export async function processPushBatch(db:SupabaseDatabase,send=sendDevicePush){
  const jobs=await db.system(c=>claimPushJobs(c));
  for(let offset=0;offset<jobs.length;offset+=3)await Promise.all(jobs.slice(offset,offset+3).map(async job=>{
    try{
      const prepared=await db.system(c=>pushJobMessage(c,job.id,job.lease_id));
      if(!prepared){await db.system(c=>c.query("update private.device_push_jobs set state='cancelled',lease_id=null,lease_until=null,failure_code='account_or_preference_changed' where id=$1 and lease_id=$2",[job.id,job.lease_id]));return;}
      const result=await send(prepared.platform,prepared.endpoint,prepared.message);
      await db.system(c=>finishPushJob(c,job.id,job.lease_id,result));
    }catch{
      await db.system(c=>finishPushJob(c,job.id,job.lease_id,{state:'retry',code:'delivery_unavailable'})).catch(()=>{});
    }
  }));
  return jobs.length;
}

/** A single server worker uses database wakeups, bounded batches and backoff.
 * No device timer, polling loop, foreground service or wake lock is required. */
export function startDevicePushWorker(db:SupabaseDatabase){
  let closed=false,running=false,timer:ReturnType<typeof setTimeout>|undefined,listener:PoolClient|undefined;
  let lastDiscovery=0,lastPrune=0;
  const wake=()=>{if(!closed&&!running){if(timer)clearTimeout(timer);timer=setTimeout(()=>void pump(),300);timer.unref();}};
  const pump=async()=>{
    if(closed||running)return;running=true;let more=false;
    try{
      const config=pushConfiguration();if(!config.web&&!config.android)return;
      if(!listener){
        const connection=await db.pool.connect();listener=connection;
        connection.on('notification',wake);
        connection.once('error',()=>{connection.removeListener('notification',wake);if(listener===connection){listener=undefined;connection.release(true);}wake();});
        try{await connection.query('listen pinevela_device_push');}
        catch(error){if(listener===connection){listener=undefined;connection.release(true);}throw error;}
      }
      if(Date.now()-lastDiscovery>30000){lastDiscovery=Date.now();await db.system(c=>discoverPushPublications(c));}
      more=(await processPushBatch(db))>=12;
      if(Date.now()-lastPrune>3600000){lastPrune=Date.now();await db.system(async c=>{
        await c.query("update private.device_push_jobs set state='cancelled',failure_code='expired',lease_id=null,lease_until=null where state in('pending','processing') and expires_at<clock_timestamp()");
        await c.query("delete from private.device_push_jobs where state in('sent','cancelled','failed') and created_at<clock_timestamp()-interval '30 days'");
        await c.query("delete from private.device_push_installations where expires_at<clock_timestamp()-interval '30 days'");
      });}
    }catch{console.warn('[Device notifications] Delivery is temporarily unavailable.');}
    finally{running=false;if(!closed){timer=setTimeout(()=>void pump(),more?1000:60000);timer.unref();}}
  };
  wake();
  return async()=>{closed=true;if(timer)clearTimeout(timer);while(running)await new Promise(r=>setTimeout(r,25));
    if(listener){listener.removeListener('notification',wake);await listener.query('unlisten pinevela_device_push').catch(()=>{});listener.release();listener=undefined;}};
}
