/** Read-only checks using genuinely signed-in, enrolled administrator bindings.
 * No fabricated Auth, private-key retrieval, proposals, votes or price changes. */
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {administratorSettingsStatus} from '../supabase/adminSettings.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase();let checks=0;
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
try{
  const readiness=(await db.pool.query(`select private.pricing_roster_ready() as pricing_ready,
    jsonb_array_length(private.pricing_roster()) as pricing_roster_count,
    jsonb_array_length(private.recovery_roster()) as recovery_roster_count,
    (select count(*)::integer from public.admin_memberships where status='active') as active_administrators`)).rows[0];
  check(readiness.pricing_ready===true&&readiness.pricing_roster_count>=3,'Actual pricing roster meets its independent-key quorum');
  check(readiness.recovery_roster_count>=3,'Actual recovery roster supports two independent colleagues');
  // A fresh project can legitimately use the product defaults before its first
  // settings save. Fingerprint the empty row set as well as persisted settings.
  const settingsDigest=async()=>(await db.pool.query("select md5(coalesce(jsonb_agg(value order by key),'[]'::jsonb)::text) as digest from private.platform_settings where key='platform'")).rows[0].digest;
  const pricesBefore=await settingsDigest();
  const proposalsBefore=(await db.pool.query('select count(*)::integer as count from public.admin_proposals')).rows[0].count;
  const actors=(await db.pool.query(`select distinct on(m.slot) s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
    from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
    join public.account_contexts c on c.id=s.active_context_id join public.admin_memberships m on m.context_id=c.id
    where c.kind='admin' and c.status='active' and m.status='active' and (n.not_after is null or n.not_after>clock_timestamp())
      and private.administrator_session_allowed(c.id,s.session_id)
      and exists(select 1 from auth.identities i join auth.users u on u.id=i.user_id
        where i.user_id=s.auth_user_id and i.provider='google' and u.email_confirmed_at is not null and u.is_anonymous is false
          and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
    order by m.slot,n.created_at desc`)).rows as VerifiedActor[];
  check(actors.length>0,'A genuine active administrator session is available');
  for(const actor of actors){
    // Match the actual HTTP status route's guarded server transaction. Browser
    // database roles deliberately cannot inspect these private control records.
    const status=await db.authorizedSystem(actor,['admin'],c=>administratorSettingsStatus(c,actor));
    check(status.currentId===actor.contextId,'Status belongs to this exact native session');
    check(status.members.length===readiness.active_administrators&&status.members.every(m=>m.active&&m.keyEnrolled&&m.settingsKeyEnrolled),'Status reflects the actual enrolled administrator roster');
    check(!/key_hash|key_version|access_token|refresh_token|password/i.test(JSON.stringify(status)),'Projection contains no private grants or credentials');
    const other=status.members.find(m=>m.id!==actor.contextId)!;
    let error:unknown;
    try{const forged={...actor,contextId:other.id};await db.authorizedSystem(forged,['admin'],c=>administratorSettingsStatus(c,forged));}catch(e){error=e;}
    check(error instanceof ApiError&&error.status===401,'Native session cannot impersonate another administrator context');
    let directError:any;
    try{await db.actor(actor,c=>administratorSettingsStatus(c,actor));}catch(e){directError=e;}
    check(directError?.code==='42501','Direct database role cannot replace the guarded server status route');
  }
  for(const role of ['anon','authenticated','pinevela_backend']){
    const grants=(await db.pool.query(`select has_table_privilege($1,'private.admin_secrets','select') as secrets,
      has_function_privilege($1,'private.apply_approved_pricing(uuid)','execute') as apply`,[role])).rows[0];
    check(!grants.secrets&&!grants.apply,'Direct '+role+' grants cannot read keys or bypass final pricing approval');
  }
  check(await settingsDigest()===pricesBefore,'Live platform settings remain unchanged');
  check((await db.pool.query('select count(*)::integer as count from public.admin_proposals')).rows[0].count===proposalsBefore,'Verification creates no operational proposal');
  console.log(JSON.stringify({passed:true,checks,readiness,genuineAdministratorBindingsChecked:actors.length,cloudRecordsModified:0,livePricesChanged:false,fullBrowserVotingTested:false}));
}finally{await db.close();}
