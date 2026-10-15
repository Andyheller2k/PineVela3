import type { PoolClient } from 'pg';
import { ApiError, type VerifiedActor } from './db.js';

/** The subject has already been authenticated; distinguish missing enrollment
 * from a saved account whose access must remain closed. */
export async function unavailableAccountError(client:PoolClient,authUserId:string) {
  const profile=await client.query('select id from public.profiles where id=$1',[authUserId]);
  if(profile.rowCount && (await client.query(`select 1 from public.account_contexts c
    where c.auth_user_id=$1 and c.kind='primary' and c.status='closed' and exists(
      select 1 from private.primary_wipe_executions e where c.id=any(e.context_ids) and e.state='completed')`,[authUserId])).rowCount)
    return new ApiError(403,'Your primary portal was closed after a reviewed wipe. Choose Sign Up with Google or Reopen primary account with email using the same verified account.','google_primary_closed');
  return profile.rowCount
    ? new ApiError(403,'This account is not active in the new application database.')
    : new ApiError(403,'Choose Sign Up with Google using the same account to create your PineVela profile.','google_profile_missing');
}

/** Called only after the server has verified the Google PKCE session with /user.
 * Retain the exact Auth subject; never import legacy roles, credentials or records. */
export async function initializeRetainedGooglePrimary(
  client: PoolClient,
  identity: Pick<VerifiedActor, 'authUserId' | 'sessionId'>,
) {
  await client.query("select pg_advisory_xact_lock(hashtextextended('retained-google-signup:' || $1,0))", [identity.authUserId]);
  const verified = await client.query(`select u.id from auth.users u
    join auth.sessions s on s.user_id=u.id and s.id=$2
    join auth.identities i on i.user_id=u.id and i.provider='google'
    where u.id=$1 and u.email_confirmed_at is not null and u.is_anonymous is false
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
      and (s.not_after is null or s.not_after>clock_timestamp())
      and i.identity_data->'email_verified'='true'::jsonb
      and lower(i.identity_data->>'email')=lower(u.email)
    for share of u,s,i`, [identity.authUserId,identity.sessionId]);
  if (!verified.rowCount) throw new ApiError(401,'A live verified Google identity is required.');
  if ((await client.query('select id from public.profiles where id=$1 for share',[identity.authUserId])).rowCount) {
    return reopenRetainedPrimary(client,identity,'verified-google-signup');
  }
  // The existing initializer enforces pending enrollment ownership/token rules.
  // Passing no token must never consume a staff or other sub-account invitation.
  await client.query('select private.initialize_auth_profile($1,null)',[identity.authUserId]);
  return true;
}

export type PrimaryReentryMethod = 'verified-google-signup' | 'verified-email-reentry';

/** Only server handlers that completed the corresponding provider proof call this.
 * SQL independently checks the native identity, live session, policy and receipt. */
export async function reopenRetainedPrimary(client:PoolClient,identity:Pick<VerifiedActor,'authUserId'|'sessionId'>,method:PrimaryReentryMethod) {
  await client.query("select pg_advisory_xact_lock(hashtextextended('retained-primary-reentry:' || $1,0))",[identity.authUserId]);
  const live=await client.query(`select u.id from auth.users u join auth.sessions s on s.user_id=u.id and s.id=$2
    where u.id=$1 and private.primary_reentry_identity_supported(u.id,$3)
      and(s.not_after is null or s.not_after>clock_timestamp()) for share of u,s`,[identity.authUserId,identity.sessionId,method]);
  if(!live.rowCount)throw new ApiError(401,'A live verified account is required.');
  const context=(await client.query(`select id,status from public.account_contexts
    where auth_user_id=$1 and kind='primary' for update`,[identity.authUserId])).rows[0];
  if(!context) {
    if(method==='verified-google-signup')return false; // Existing separately verified portal profile.
    throw new ApiError(403,'This account has no retained primary portal to reopen.');
  }
  const execution=(await client.query(`select id from private.primary_wipe_executions
    where $1=any(context_ids) and state='completed' order by completed_at desc limit 1`,[context.id])).rows[0];
  if(context.status!=='closed') {
    if(method==='verified-email-reentry'&&!execution)throw new ApiError(403,'This account has no reviewed primary closure to reopen.');
    return false;
  }
  if(!execution)throw new ApiError(403,'This account closure does not permit self-service re-entry.');
  await client.query("select set_config('request.jwt.claims',$1,true),set_config('pinevela.primary_reentry_verified',$2,true)",
    [JSON.stringify({sub:identity.authUserId,session_id:identity.sessionId,role:'authenticated'}),method]);
  await client.query(`insert into private.primary_wipe_reentries(execution_id,context_id,auth_user_id,session_id,proof_method)
    values($1,$2,$3,$4,$5)`,[execution.id,context.id,identity.authUserId,identity.sessionId,method]);
  return true;
}
