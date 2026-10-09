import type { PoolClient } from 'pg';
import { ApiError } from './db.js';
import { hashCredentialAsync, verifyCredentialAsync } from '../accountSecurity.js';
export function portalPin(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{6,12}$/.test(value)) throw new ApiError(400,'Choose a portal access PIN with 6–12 digits.');
  return value;
}
export const hashPortalPin = (pin: unknown) => hashCredentialAsync(portalPin(pin));
/** Return a denial instead of throwing, so failed attempts COMMIT before the
 * caller returns an error. Locks serialize concurrent guesses per portal. */
export async function checkPortalPin(client: PoolClient, context: string, value: unknown): Promise<{ allowed: boolean; version: string | null }> {
  const { rows: [key] } = await client.query('select * from private.portal_access_keys where context_id = $1 for update',[context]);
  if (!key) return { allowed:true,version:null };
  if (key.locked_until && new Date(key.locked_until).getTime() > Date.now()) return { allowed:false,version:null };
  // Missing PIN is a prompt, not a guess that could lock an account accidentally.
  if (typeof value !== 'string' || !value) return { allowed:false,version:null };
  const valid = /^\d{6,12}$/.test(value) && await verifyCredentialAsync(value,key.pin_hash);
  if (!valid) {
    await client.query(`update private.portal_access_keys set
      failed_attempts = case when locked_until is not null and locked_until <= clock_timestamp() then 1 else least(failed_attempts + 1,5) end,
      locked_until = case when (case when locked_until is not null and locked_until <= clock_timestamp() then 0 else failed_attempts end) >= 4
        then clock_timestamp() + interval '15 minutes' else null end where context_id = $1`,[context]);
    return { allowed:false,version:null };
  }
  await client.query('update private.portal_access_keys set failed_attempts = 0,locked_until = null where context_id = $1',[context]);
  return { allowed:true,version:String(key.version) };
}
