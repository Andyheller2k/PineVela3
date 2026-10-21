import type { PoolClient } from 'pg';
import { ResourceLimitError } from '../resourceSecurity.js';

export const COMPANION_ALLOWANCE = {
  windowSeconds: 5 * 60 * 60,
  userRequests: 25,
  globalRequests: 50,
  userTokens: 100000,
  globalTokens: 200000,
  reservedTokens: 8000,
} as const;

/** Call only inside the live primary-account transaction. The database clock
 * chooses one shared window; request bodies never supply identities or times. */
export async function reserveCompanionAllowance(c: PoolClient, authUserId: string): Promise<Date> {
  const { window_start: windowStart, retry_after: retryAfter } = (await c.query(`
    with allowance_clock as (
      select date_bin(interval '5 hours', statement_timestamp(), timestamptz '1970-01-01 00:00:00+00') as start
    ) select start as window_start,
      greatest(1,ceil(extract(epoch from start+interval '5 hours'-statement_timestamp())))::int as retry_after
    from allowance_clock`)).rows[0];
  for (const [scope, maximum, tokenMaximum] of [
    ['global', COMPANION_ALLOWANCE.globalRequests, COMPANION_ALLOWANCE.globalTokens],
    [authUserId, COMPANION_ALLOWANCE.userRequests, COMPANION_ALLOWANCE.userTokens],
  ] as const) {
    const held = await c.query(`insert into private.companion_usage_windows as u(bucket,window_start,requests,tokens)
      values($1,$2,1,$4) on conflict(bucket,window_start) do update
      set requests=u.requests+1,tokens=u.tokens+$4
      where u.requests<$3 and u.tokens+$4<=$5 returning bucket`,
    [scope, windowStart, maximum, COMPANION_ALLOWANCE.reservedTokens, tokenMaximum]);
    if (!held.rowCount) throw new ResourceLimitError(429, retryAfter,
      'Your free companion allowance for this five-hour window is used up. App features and Help are still available.');
  }
  return windowStart;
}

/** A reply may finish after a window changes. Settle the window reserved at
 * admission, never the new window. Failed/ambiguous work keeps its reservation. */
export async function settleCompanionAllowance(c: PoolClient, authUserId: string, windowStart: Date, used: number) {
  for (const scope of ['global', authUserId]) await c.query(`update private.companion_usage_windows
    set tokens=greatest(0,tokens+$3-$4) where bucket=$1 and window_start=$2`,
  [scope, windowStart, Math.min(used, 20000), COMPANION_ALLOWANCE.reservedTokens]);
}
