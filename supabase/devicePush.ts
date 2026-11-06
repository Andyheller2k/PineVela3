import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {pushConfiguration,validateAndroidToken,validateWebSubscription} from './devicePushProvider.js';
import {PUSH_ACCOUNT_LABELS,PUSH_DASHBOARDS} from '../devicePushPolicy.js';
import {SupabaseStorage} from './storage.js';
import {AttemptBudgets,WorkPool} from '../resourceSecurity.js';
import {notify} from './notifications.js';

const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
export function deviceProof(id:unknown,key:unknown){
  if(typeof key!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(key))throw new ApiError(400,'Reconnect notifications on this device.');
  return {id:uuid(id),hash:digest(key)};
}
function fields(value:any,allowed:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new ApiError(400,'Unsupported device notification fields.');}
function context(req:AuthRequest){if(req.get('X-PineVela-Profile-Context')!==undefined&&req.get('X-PineVela-Profile-Context')!==req.actor.contextId)throw new ApiError(409,'Your active account changed. Reopen notification settings.');}
export async function registerDevicePush(c:PoolClient,a:VerifiedActor,input:any){
  fields(input,['installationId','installationSecret','platform','subscription','token','accountAlerts','marketplace','residences','keepExistingAccounts']);
  const proof=deviceProof(input.installationId,input.installationSecret);
  if(!['web','android'].includes(input.platform))throw new ApiError(400,'Choose a supported notification platform.');
  for(const name of ['accountAlerts','marketplace','residences'])if(typeof input[name]!=='boolean')throw new ApiError(400,'Choose your notification preferences.');
  if(input.keepExistingAccounts!==undefined&&typeof input.keepExistingAccounts!=='boolean')throw new ApiError(400,'Choose whether to keep your other connected accounts.');
  if(input.platform==='web'&&input.token!==undefined||input.platform==='android'&&input.subscription!==undefined)throw new ApiError(400,'Choose one notification transport.');
  const endpoint=input.platform==='web'?validateWebSubscription(input.subscription):validateAndroidToken(input.token);
  const endpointHash=digest(input.platform+':'+('endpoint' in endpoint?endpoint.endpoint:endpoint.token));
  const owner=(await c.query('select coalesce(primary_owner_id,auth_user_id) as id from public.account_contexts where id=$1 and auth_user_id=$2',[a.contextId,a.authUserId])).rows[0];
  if(!owner)throw new ApiError(403,'Use your verified account to enable notifications.');
  await c.query("select pg_advisory_xact_lock(hashtextextended('device-push-owner:'||$1::text,0))",[owner.id]);
  const session=(await c.query('select portal_pin_version from private.account_sessions where session_id=$1 and auth_user_id=$2 and active_context_id=$3',[a.sessionId,a.authUserId,a.contextId])).rows[0];
  if(!session)throw new ApiError(401,'Sign in again before enabling notifications.');
  const existing=(await c.query('select * from private.device_push_installations where id=$1 for update',[proof.id])).rows[0];
  if(existing&&existing.secret_sha256!==proof.hash)throw new ApiError(403,'Reconnect notifications on this device.');
  if((await c.query('select id from private.device_push_installations where endpoint_sha256=$1 and id<>$2',[endpointHash,proof.id])).rowCount)throw new ApiError(409,'Reconnect this browser or Android notification registration.','push_registration_conflict');
  const count=Number((await c.query(`select count(*) from private.device_push_installations i where i.enabled and i.expires_at>clock_timestamp() and i.id<>$2
    and exists(select 1 from private.device_push_bindings b join public.account_contexts x on x.id=b.context_id
      where b.installation_id=i.id and b.enabled and coalesce(x.primary_owner_id,x.auth_user_id)=$1)`,[owner.id,proof.id])).rows[0].count);
  if(count>=10)throw new ApiError(429,'This account already has notifications enabled on ten devices.');
  const alreadyConnected=existing&&(await c.query(`select 1 from private.device_push_bindings b join public.account_contexts x on x.id=b.context_id
    where b.installation_id=$1 and coalesce(x.primary_owner_id,x.auth_user_id)=$2`,[proof.id,owner.id])).rowCount;
  if(existing&&!alreadyConnected&&input.keepExistingAccounts!==true){
    // Independent logins replace previous connections by default. Keeping
    // them requires an explicit choice and the device capability; each retained
    // account still needs its own live, previously verified session/PIN grant.
    await c.query('delete from private.device_push_bindings where installation_id=$1',[proof.id]);
  }
  await c.query(`insert into private.device_push_installations(id,owner_auth_user_id,secret_sha256,platform,endpoint,endpoint_sha256)
    values($1,$2,$3,$4,$5,$6) on conflict(id) do update set owner_auth_user_id=excluded.owner_auth_user_id,
    platform=excluded.platform,endpoint=excluded.endpoint,endpoint_sha256=excluded.endpoint_sha256,
    enabled=true,updated_at=clock_timestamp(),expires_at=clock_timestamp()+interval '90 days'`,
    [proof.id,owner.id,proof.hash,input.platform,JSON.stringify(endpoint),endpointHash]);
  await c.query(`insert into private.device_push_bindings(installation_id,context_id,auth_user_id,session_id,portal_pin_version,account_alerts,marketplace,residences)
    values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(installation_id,context_id) do update set
    session_id=excluded.session_id,portal_pin_version=excluded.portal_pin_version,account_alerts=excluded.account_alerts,
    marketplace=excluded.marketplace,residences=excluded.residences,enabled=true,
    enabled_at=case when private.device_push_bindings.enabled and private.device_push_bindings.session_id=excluded.session_id
      then private.device_push_bindings.enabled_at else clock_timestamp() end,
    updated_at=clock_timestamp()`,[proof.id,a.contextId,a.authUserId,a.sessionId,session.portal_pin_version,input.accountAlerts,input.marketplace,input.residences]);
  return {registered:true,accountKind:a.kind,accountLabel:PUSH_ACCOUNT_LABELS[a.kind],accountAlerts:input.accountAlerts,marketplace:input.marketplace,residences:input.residences};
}
export async function devicePushStatus(c:PoolClient,a:VerifiedActor,id:unknown,key:unknown){
  const proof=deviceProof(id,key);
  const installation=(await c.query(`select i.id,i.enabled,i.expires_at,
    exists(select 1 from private.device_push_bindings b where b.installation_id=i.id and b.enabled) as other_connections,
    exists(select 1 from private.device_push_bindings b join public.account_contexts x on x.id=b.context_id
    join public.account_contexts current on current.id=$3 where b.installation_id=i.id and b.enabled
      and coalesce(x.primary_owner_id,x.auth_user_id)=coalesce(current.primary_owner_id,current.auth_user_id)) as connected
    from private.device_push_installations i where i.id=$1 and i.secret_sha256=$2`,[proof.id,proof.hash,a.contextId])).rows[0];
  if(!installation?.connected)return {registered:false,connected:false,otherAccounts:Boolean(installation?.other_connections),accounts:[]};
  const accounts=(await c.query(`select b.context_id as "contextId",x.kind,b.account_alerts as "accountAlerts",b.marketplace,b.residences,
    exists(select 1 from private.support_memberships m where m.context_id=x.id and m.status='active') as feedback
    from private.device_push_bindings b join public.account_contexts x on x.id=b.context_id
    where b.installation_id=$1 and b.enabled order by b.enabled_at`,[proof.id])).rows;
  return {registered:installation.enabled&&new Date(installation.expires_at).getTime()>Date.now()&&accounts.some(r=>r.contextId===a.contextId),
    connected:true,otherAccounts:false,accounts:accounts.map(r=>({...r,label:PUSH_ACCOUNT_LABELS[r.kind]}))};
}

export function installDevicePush(app:Express,auth:SupabaseAuth){
  const budgets=new AttemptBudgets(),storage=new SupabaseStorage(),images=new WorkPool(2,4);
  const cache=new Map<string,{bytes:Buffer;expires:number}>();
  const limit=(req:AuthRequest)=>budgets.reserve([{scope:'device-push-ip',identity:req.ip||req.socket.remoteAddress||'',maximum:30,windowMs:60000}]);
  app.get('/api/device-push/config',(_req,res)=>res.json(pushConfiguration()));
  app.get('/api/device-push/status',auth.require(),route(async(req,res)=>{
    context(req);limit(req);if(Object.keys(req.query).length)throw new ApiError(400,'Account selectors are not accepted.');
    res.json(await auth.db.authorizedRead(req.actor,[req.actor.kind],c=>devicePushStatus(c,req.actor,req.get('X-PineVela-Push-Installation'),req.get('X-PineVela-Push-Key'))));
  }));
  app.post('/api/device-push/register',auth.require(),route(async(req,res)=>{
    context(req);limit(req);
    const config=pushConfiguration();
    if(req.body?.platform==='web'&&!config.web||req.body?.platform==='android'&&!config.android)throw new ApiError(503,'Device notification delivery is not configured yet.','push_unconfigured');
    res.json(await auth.db.authorizedSystem(req.actor,[req.actor.kind],c=>registerDevicePush(c,req.actor,req.body)));
  }));
  app.post('/api/device-push/test',auth.require(),route(async(req,res)=>{
    context(req);limit(req);if(req.body!==undefined&&Object.keys(req.body).length)throw new ApiError(400,'Test recipients are selected by your account.');
    const proof=deviceProof(req.get('X-PineVela-Push-Installation'),req.get('X-PineVela-Push-Key'));
    await auth.db.authorizedSystem(req.actor,[req.actor.kind],async c=>{
      const own=(await c.query(`select b.id from private.device_push_bindings b
        join private.device_push_installations i on i.id=b.installation_id
        where i.id=$1 and i.secret_sha256=$2 and i.enabled and i.expires_at>clock_timestamp()
          and b.context_id=$3 and b.auth_user_id=$4 and b.session_id=$5 and b.enabled and b.account_alerts`,
        [proof.id,proof.hash,req.actor.contextId,req.actor.authUserId,req.actor.sessionId])).rowCount;
      if(!own)throw new ApiError(409,'Enable account alerts on this device before sending a test.');
      // This authenticated action can notify only the requesting account.
      const id=await notify(c,[req.actor.contextId],{category:'device_test',title:'Device notifications are connected',message:'This is your PineVela device notification test.'});
      await c.query('delete from private.device_push_jobs where notification_id=$1 and installation_id<>$2',[id,proof.id]);
    });res.json({queued:true});
  }));
  // A device capability can revoke only itself, even after its login expires.
  // It never grants account reads, recipient selection or a new subscription.
  app.post('/api/device-push/disconnect',route(async(req,res)=>{
    limit(req);fields(req.body,['installationId','installationSecret']);const proof=deviceProof(req.body.installationId,req.body.installationSecret);
    await auth.db.system(async c=>{
      await c.query('update private.device_push_installations set enabled=false,updated_at=clock_timestamp() where id=$1 and secret_sha256=$2',[proof.id,proof.hash]);
      await c.query(`update private.device_push_bindings set enabled=false where installation_id in
        (select id from private.device_push_installations where id=$1 and secret_sha256=$2)`,[proof.id,proof.hash]);
    });res.json({success:true});
  }));
  app.get('/api/device-push/open/:id',auth.require(),route(async(req,res)=>{
    context(req);const notice=uuid(req.params.id);
    const record=await auth.db.authorizedRead(req.actor,[req.actor.kind],async c=>{
      const n=(await c.query(`select n.id,n.title,n.message,n.category,n.link,p.kind as discovery,p.subject_id
        from public.notifications n join public.notification_recipients r on r.notification_id=n.id
        left join private.device_push_publications p on p.notification_id=n.id
        where n.id=$1 and r.context_id=$2`,[notice,req.actor.contextId])).rows[0];
      if(!n)throw new ApiError(404,'This alert is unavailable in the account you are using.');
      let destination=PUSH_DASHBOARDS[req.actor.kind]||'/user/dashboard';
      if(n.discovery==='listing')destination='/pinemarket?listing='+n.subject_id;
      if(n.discovery==='residence')destination='/pineresidence?property='+n.subject_id;
      let kind=req.actor.kind;
      if(typeof n.link==='string'&&n.link.startsWith('/customer-service')){
        if(req.actor.kind!=='admin'&&!(await c.query("select 1 from private.support_memberships where context_id=$1 and status='active'",[req.actor.contextId])).rowCount)
          throw new ApiError(404,'This support alert is no longer available to this account.');
        kind='feedback';destination='/customer-service';
      }
      if(typeof n.link==='string'&&/^\/(?:customer-service|help)\?ticket=[a-f0-9-]{36}$/.test(n.link))destination=n.link;
      return {...n,accountKind:kind,accountLabel:PUSH_ACCOUNT_LABELS[kind],destination,
        image:n.discovery?'https://pinevela.app/api/device-push/images/'+n.discovery+'/'+n.subject_id+'.jpg':null};
    });res.json(record);
  }));
  app.get('/api/device-push/images/:kind/:file',route(async(req,res)=>{
    if(!['listing','residence'].includes(req.params.kind)||!req.params.file.endsWith('.jpg'))throw new ApiError(404,'Photograph not found.');
    const id=uuid(req.params.file.slice(0,-4)),kind=req.params.kind;
    const asset=await auth.db.system(async c=>{
      if(!(await c.query('select private.platform_available() as available')).rows[0].available)return;
      const source=kind==='listing'
        ?"select m.storage_path as path from private.listing_media_public m join private.listing_catalog l on l.id=m.listing_id where l.id=$1 order by m.sort_order limit 1"
        :"select cover_path as path from private.residence_catalog where id=$1";
      const cover=(await c.query(source,[id])).rows[0]?.path;if(!cover)return;
      return (await c.query("select * from public.media_assets where '/api/media/'||id::text=$1 and state='ready' and purpose in('market','hostel') and private.media_asset_is_public(id)",[cover])).rows[0];
    });
    if(!asset)throw new ApiError(404,'Photograph not found.');
    const cacheKey=asset.id+':'+asset.sha256;let item=cache.get(cacheKey);
    if(!item||item.expires<Date.now()){
      const bytes=await images.run(async()=>sharp(await storage.download(asset.object_path,asset)).rotate().resize({width:640,height:400,fit:'inside',withoutEnlargement:true}).jpeg({quality:65}).toBuffer());
      if(bytes.length>500000)throw new ApiError(503,'Photograph preview is unavailable.');
      if(cache.size>=16)cache.delete(cache.keys().next().value!);
      item={bytes,expires:Date.now()+300000};cache.set(cacheKey,item);
    }
    res.set({'Content-Type':'image/jpeg','Content-Length':String(item.bytes.length),'Cache-Control':'private, no-cache','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"sandbox; default-src 'none'",'X-Content-Type-Options':'nosniff'}).end(item.bytes);
  }));
}
