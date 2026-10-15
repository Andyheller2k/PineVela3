/** Read-only regression using the administrator's real saved photograph and
 * genuine native Google sessions. No fake identity, key or image is created. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {reusableAvatar,reserveMedia,mediaUrl} from '../supabase/media.js';
import {checkProfileContext,profileSettingsGrant,saveProfile} from '../supabase/profiles.js';
dotenv.config({quiet:true});const db=new SupabaseDatabase();let checks=0;
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
async function denied(work:()=>Promise<unknown>,status:number,label:string){let error:unknown;try{await work();}catch(e){error=e;}check(error instanceof ApiError&&error.status===status,label);}
try{
  const actors=(await db.pool.query(`select distinct on(m.slot) s.auth_user_id as "authUserId",s.session_id as "sessionId",
    s.active_context_id as "contextId",c.kind,m.slot from private.account_sessions s
    join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
    join public.account_contexts c on c.id=s.active_context_id join public.admin_memberships m on m.context_id=c.id
    where c.kind='admin' and c.status='active' and m.status='active'
      and (n.not_after is null or n.not_after>clock_timestamp()) and private.administrator_session_allowed(c.id,s.session_id)
      and exists(select 1 from auth.identities i join auth.users u on u.id=i.user_id where i.user_id=s.auth_user_id
        and i.provider='google' and u.email_confirmed_at is not null and not u.is_anonymous
        and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
    order by m.slot,n.created_at desc`)).rows as (VerifiedActor&{slot:number})[];
  const owner=actors.find(a=>a.slot===1)!;
  check(owner&&actors.some(a=>a.authUserId!==owner.authUserId),'Two genuinely signed-in administrator identities are available');
  const fingerprint=async()=>(await db.pool.query(`select md5(jsonb_build_object(
    'profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p),
    'assets',(select jsonb_agg(to_jsonb(m) order by id) from public.media_assets m),
    'objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o),
    'auditCount',(select count(*) from private.audit_events))::text) as digest`)).rows[0].digest;
  const before=await fingerprint();
  const asset=await db.authorizedSystem(owner,['admin'],async c=>(await c.query(`select m.* from public.profiles p
    join public.media_assets m on m.id=p.avatar_asset_id where p.id=$1 and m.owner_auth_user_id=p.id
      and m.owner_context_id=$2 and m.purpose='avatar' and m.state='ready'
      and p.avatar_path='/api/media/'||m.id::text`,[owner.authUserId,owner.contextId])).rows[0]);
  check(asset,'The actual profile references its owned ready photograph');
  const storage=new SupabaseStorage(),bytes=await storage.download(asset.object_path,{byte_size:Number(asset.byte_size),sha256:asset.sha256});
  try{
    check(crypto.createHash('sha256').update(bytes).digest('hex')===asset.sha256,'The saved object matches its canonical image hash');
    const reused=await db.authorizedSystem(owner,['admin'],c=>reserveMedia(c,owner,'avatar',bytes,undefined,{},true));
    check(reused.state==='ready'&&reused.sha256===asset.sha256,'An identical real photograph reuses a ready object');
    const repeat=await db.authorizedSystem(owner,['admin'],c=>reserveMedia(c,owner,'avatar',bytes,undefined,{},true));
    check(repeat.id===reused.id,'Repeated reservation does not create another copy');
    const auth=new SupabaseAuth(db),profile=await auth.projection(owner);
    check([profile.photo,profile.photoUrl,profile.avatar,profile.avatarUrl,profile.profilePicture].every(v=>v===mediaUrl(asset.id)),
      'Reconnecting projects the saved picture consistently to all avatar fields');
    check((await db.actor(owner,c=>c.query('select id from public.media_assets where id=$1',[asset.id]))).rowCount===1,'Owner RLS permits the saved picture');
    await denied(()=>profileSettingsGrant(auth,owner,undefined),403,'The upload endpoint still requires the administrator settings key');
    await denied(()=>db.authorizedSystem(owner,['admin'],c=>saveProfile(c,owner,{photo:mediaUrl(asset.id)})),403,'Even an unchanged picture cannot bypass the settings grant');
    for(const other of actors.filter(a=>a.authUserId!==owner.authUserId)){
      check(!(await db.authorizedSystem(other,['admin'],c=>reusableAvatar(c,other,bytes))),'Another identity cannot reuse the owner\'s image');
      check((await db.actor(other,c=>c.query('select id from public.media_assets where id=$1',[asset.id]))).rowCount===0,'Other administrator RLS cannot read a personal photograph');
      await denied(()=>db.authorizedSystem(other,['admin'],c=>saveProfile(c,other,{photo:mediaUrl(asset.id)})),403,'Another identity cannot attach the photograph');
      await denied(async()=>checkProfileContext(owner,other.contextId),409,'A stale account header is rejected');
      const forged={...owner,contextId:other.contextId};
      await denied(()=>db.authorizedSystem(forged,['admin'],c=>reusableAvatar(c,forged,bytes)),401,'A forged context cannot authorize image reuse');
    }
    const response=await fetch('http://127.0.0.1:3001'+mediaUrl(asset.id),{signal:AbortSignal.timeout(30000)});
    check(response.status===404,'The real private picture is unavailable without a session');await response.body?.cancel();
    check(await fingerprint()===before,'The verification changed no profile, media, Storage or audit rows');
  }finally{bytes.fill(0);}
  console.log(JSON.stringify({passed:true,checks,genuineAdministratorSessions:actors.length,savedPhotographVerified:true,
    identicalAvatarReused:true,cloudRecordsModified:0,cloudObjectsModified:0,keyedHttpRetryTested:false}));
}catch(error){console.error(JSON.stringify({passed:false,checks,
  code:error instanceof ApiError?error.code:undefined,status:error instanceof ApiError?error.status:undefined,
  sqlstate:/^[0-9A-Z]{5}$/.test((error as any)?.code||'')?(error as any).code:undefined}));process.exitCode=1;}
finally{await db.close();}
