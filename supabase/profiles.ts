import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { checkAdministratorSettingsKey,deniedKey,requireSettingsGrant,type SettingsGrant } from './adminSettings.js';

export const AVATAR_PRESETS = ['pine-classic','pine-emerald','pine-amber','pine-rose','pine-violet','pine-dark','pine-cyan','pine-golden','pine-crimson','pine-forest'];
const aliases = ['avatar','avatarUrl','photo','photoUrl','profilePicture'];
export function managerAvatarOnlyBody(body:unknown):{photo:string} {
  if(!body || typeof body!=='object' || Array.isArray(body) ||
    Object.keys(body).length!==1 || typeof (body as any).photo!=='string')
    throw new ApiError(400,'Only your profile picture can be changed here.');
  return {photo:(body as any).photo};
}
export function checkProfileContext(actor:VerifiedActor,expected:unknown) {
  // This is a stale-request check, never proof of identity or ownership.
  if (expected !== undefined && expected !== actor.contextId) throw new ApiError(409,'Your active account changed. Reopen the profile editor.');
}
export async function profileSettingsGrant(auth:SupabaseAuth,a:VerifiedActor,key:unknown):Promise<SettingsGrant|undefined> {
  if(a.kind!=='admin') {
    const protectedIdentity=await auth.db.authorizedSystem(a,[a.kind],async c=>Boolean((await c.query(`select 1 from public.admin_memberships m
      join public.account_contexts x on x.id=m.context_id where x.auth_user_id=$1 and m.status='active' and x.status='active'`,[a.authUserId])).rowCount));
    if(protectedIdentity)throw new ApiError(403,'Use your administrator portal and settings key to change this identity\'s profile.');
    return undefined;
  }
  const grant=await auth.db.authorizedSystem(a,['admin'],c=>checkAdministratorSettingsKey(c,a,key));
  deniedKey(grant);return grant;
}
export async function saveProfile(c:PoolClient,a:VerifiedActor,body:any,grant?:SettingsGrant) {
  if(!body || typeof body!=='object' || Array.isArray(body) || !Object.keys(body).length ||
    Object.keys(body).some(k=>!['name','phone','email','settingsKey',...aliases].includes(k)))throw new ApiError(400,'Only your display name, contact phone and profile picture may be changed here.');
  const person=(await c.query('select * from public.profiles where id=$1 for update',[a.authUserId])).rows[0];
  if(!person)throw new ApiError(401,'Your profile is no longer available.');
  if(a.kind!=='admin' && (await c.query(`select 1 from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    where x.auth_user_id=$1 and m.status='active' and x.status='active'`,[a.authUserId])).rowCount)
    throw new ApiError(403,'Use your administrator portal and settings key to change this identity\'s profile.');
  if(body.email!==undefined && (typeof body.email!=='string' || body.email.trim().toLowerCase()!==person.email.toLowerCase()))
    throw new ApiError(400,'Credential emails require a verified account-email change process.');
  const fields:any={};
  for(const [key,col,max] of [['name','display_name',120],['phone','phone',40]] as const) {
    if(body[key]===undefined)continue;
    if(typeof body[key]!=='string' || body[key].trim().length>max || key==='name'&&!body[key].trim() || /[\u0000-\u001f\u007f]/.test(body[key]))
      throw new ApiError(400,`Enter a valid ${key}.`);
    fields[col]=body[key].trim();
  }
  const photos=aliases.filter(k=>body[k]!==undefined).map(k=>body[k]);
  if(photos.length) {
    const value=photos[0];
    if(photos.some(v=>v!==value) || typeof value!=='string')throw new ApiError(400,'Profile picture fields must agree.');
    if(value==='' || AVATAR_PRESETS.some(id=>value===`preset:${id}`)) {fields.avatar_path=value||null;fields.avatar_asset_id=null;}
    else {
      if(!/^\/api\/media\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value))throw new ApiError(400,'Upload your picture to PineVela before saving it.');
      const asset=(await c.query(`select id from public.media_assets where id=$1 and owner_auth_user_id=$2 and purpose='avatar'
        and state='ready' for share`,[value.slice('/api/media/'.length),a.authUserId])).rows[0];
      if(!asset)throw new ApiError(403,'Use a ready profile picture uploaded by this verified identity.');
      if(!(await c.query('select private.media_content_approved($1) as allowed',[asset.id])).rows[0].allowed)
        throw new ApiError(422,'This profile picture must pass its safety review before it can be saved.','moderation_required');
      fields.avatar_path=value;fields.avatar_asset_id=asset.id;
    }
  }
  if(a.kind==='admin')await requireSettingsGrant(c,a,grant || {allowed:false});
  const changed=Object.keys(fields).filter(col=>fields[col]!==person[col]);
  if(changed.length) {
    const values=changed.map(col=>fields[col]);
    await c.query(`update public.profiles set ${changed.map((col,i)=>`${col}=$${i+2}`).join(',')},updated_at=clock_timestamp() where id=$1`,[a.authUserId,...values]);
    await c.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
      values($1,'own_profile_updated','profile',$2)`,[a.contextId,a.authUserId]);
  }
  return {success:true};
}
export function installProfiles(app:Express,auth:SupabaseAuth) {
  const handler:RequestHandler=(req,res,next)=>{(async()=>{
    const request=req as AuthRequest;
    checkProfileContext(request.actor,request.headers['x-pinevela-profile-context']);
    const grant=await profileSettingsGrant(auth,request.actor,request.body?.settingsKey);
    await auth.db.authorizedSystem(request.actor,[request.actor.kind],c=>saveProfile(c,request.actor,request.body,grant));
    res.json({success:true,user:await auth.projection(request.actor)});
  })().catch(next);};
  app.put('/api/auth/profile',auth.require(),handler);
  app.post('/api/auth/profile',auth.require(),handler);
  app.put('/api/auth/profile/avatar',auth.require(['manager']),(req,res,next)=>{(async()=>{
    const request=req as AuthRequest;
    const body=managerAvatarOnlyBody(request.body);
    checkProfileContext(request.actor,request.headers['x-pinevela-profile-context']);
    const grant=await profileSettingsGrant(auth,request.actor,undefined);
    await auth.db.authorizedSystem(request.actor,['manager'],c=>saveProfile(c,request.actor,body,grant));
    res.json({success:true,user:await auth.projection(request.actor)});
  })().catch(next);});
}
