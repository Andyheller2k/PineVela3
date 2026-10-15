import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {ApiError,type VerifiedActor} from './db.js';

const primaryManagerCooldownScope=`(
  (b.kind='manager_account' and owner.kind='primary' and owner.primary_owner_id is null and owner.auth_user_id=$1)
  or (b.kind='residence' and owner.kind='manager' and owner.status='closed' and owner.primary_owner_id=$1))`;

/** IDs come from the verified primary actor, never request ownership fields. */
export async function primaryManagerRegistrationRestricted(client:PoolClient,primaryAuthUserId:string) {
  return (await client.query(`select exists(select 1 from public.registration_bans b
    join public.account_contexts owner on owner.id=b.account_context_id
    where b.until_at>clock_timestamp() and ${primaryManagerCooldownScope}) as restricted`,
    [primaryAuthUserId])).rows[0].restricted as boolean;
}

/** The caller has authorized the saved manager or its enrollment/review target.
 * Residence cooldowns belong to that exact portal; manager-account cooldowns
 * belong to its saved primary owner, including after an old manager is closed. */
export async function managerRegistrationRestricted(client:PoolClient,managerContextId:string) {
  const manager=(await client.query(`select exists(select 1 from public.registration_bans b
    where b.until_at>clock_timestamp() and (
      (b.kind='residence' and b.account_context_id=m.id) or
      (b.kind='manager_account' and exists(select 1 from public.account_contexts owner
        where owner.id=b.account_context_id and owner.kind='primary' and owner.primary_owner_id is null
          and owner.auth_user_id=m.primary_owner_id)))) as restricted
    from public.account_contexts m where m.id=$1 and m.kind='manager' and m.primary_owner_id is not null`,
    [managerContextId])).rows[0];
  if(!manager)throw new ApiError(404,'Saved manager account not found.');
  return manager.restricted as boolean;
}

/** The caller must have locked its real primary session in authorizedSystem.
 * The latest applicable expiry matches the write gate when several bans overlap. */
export async function primaryManagerRegistrationRestriction(client:PoolClient,actor:VerifiedActor) {
  if(actor.kind!=='primary'||!(await client.query(`select c.id from public.account_contexts c
    join public.profiles p on p.id=c.auth_user_id where c.id=$1 and c.auth_user_id=$2
      and c.kind='primary' and c.status='active' and c.primary_owner_id is null and p.primary_owner_id is null
      and c.id=private.current_context_id() for share of c,p`,[actor.contextId,actor.authUserId])).rowCount)
    throw new ApiError(403,'Use your primary user account to view manager registration restrictions.');
  const observed=(await client.query(`with observed as materialized(select clock_timestamp() as server_time)
    select observed.server_time as "serverTime",restriction.id,restriction.kind,restriction.reason,
      restriction.until_at as "expiresAt",
      greatest(0,ceil(extract(epoch from restriction.until_at-observed.server_time)))::bigint as remaining_seconds
    from observed left join lateral(
      select b.id,b.kind,b.reason,b.until_at from public.registration_bans b
      join public.account_contexts owner on owner.id=b.account_context_id
      where b.until_at>observed.server_time and ${primaryManagerCooldownScope}
      order by b.until_at desc,b.created_at desc,b.id limit 1
    )restriction on true`,[actor.authUserId])).rows[0];
  return {serverTime:observed.serverTime,restriction:observed.id?{id:observed.id,kind:observed.kind,reason:observed.reason,
    expiresAt:observed.expiresAt,remainingSeconds:Number(observed.remaining_seconds)}:null};
}

export function checkRegistrationRestrictionRequest(actor:VerifiedActor,request:Pick<AuthRequest,'query'|'body'|'headers'>) {
  if(actor.kind!=='primary')throw new ApiError(403,'Use your primary user account to view manager registration restrictions.');
  if(Object.keys(request.query).length||request.body!==undefined&&(request.body===null||typeof request.body!=='object'
    ||Array.isArray(request.body)||Object.keys(request.body).length))
    throw new ApiError(400,'Identity selectors are not accepted.');
  const context=request.headers['x-pinevela-account-context'];
  if(context!==undefined&&context!==actor.contextId)
    throw new ApiError(409,'Your active account changed. Refresh manager onboarding.');
}

export function installRegistrationRestrictions(app:Express,auth:SupabaseAuth) {
  const read:RequestHandler=(req,res,next)=>{
    const request=req as AuthRequest;
    try{checkRegistrationRestrictionRequest(request.actor,request);}catch(error){return next(error);}
    res.set('Cache-Control','private, no-store');
    // The closed-manager branch needs a scoped server read; browser RLS still
    // hides other identities' manager/profile rows and cannot be broadened here.
    auth.db.authorizedSystem(request.actor,['primary'],client=>primaryManagerRegistrationRestriction(client,request.actor))
      .then(result=>res.json(result)).catch(next);
  };
  app.get('/api/users/manager-restriction',auth.require(['primary']),read);
}
