import type {PoolClient} from 'pg';
import type {VerifiedActor} from './db.js';

/** Internal Auth aliases never become a resident's display/support address.
 * Call only in the already authorized transaction for this exact live actor. */
export async function residentContactEmail(client:PoolClient,actor:VerifiedActor):Promise<string|undefined>{
  if(actor.kind!=='resident')return undefined;
  return (await client.query(`select owner.email from private.resident_pin_credentials k
    join private.account_enrollments e on e.id=k.enrollment_id
    join public.account_contexts x on x.id=e.linked_context_id and x.auth_user_id=e.auth_user_id
    join public.profiles owner on owner.id=k.primary_owner_id
    where x.id=$1 and x.auth_user_id=$2 and x.kind='resident' and x.primary_owner_id=k.primary_owner_id
      and e.primary_owner_id=k.primary_owner_id and e.enrollment_fields->>'authentication'='resident_pin'
      and owner.primary_owner_id is null`,[actor.contextId,actor.authUserId])).rows[0]?.email;
}
