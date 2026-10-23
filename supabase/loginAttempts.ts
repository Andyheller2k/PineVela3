import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { ResourceLimitError } from '../resourceSecurity.js';
import { ApiError, type SupabaseDatabase } from './db.js';
import { signupEmail } from './signupEmails.js';

export const PASSWORD_FAILURE_WINDOW_SECONDS = 15 * 60;
export const PASSWORD_FAILURE_COOLDOWN_SECONDS = 15 * 60;
export const PASSWORD_EMAIL_FAILURE_LIMIT = 5;
export const PASSWORD_IP_FAILURE_LIMIT = 30;
export const PASSWORD_FAILURE_BUCKET_CAPACITY = 50_000;
const pause = (seconds: number) => new ResourceLimitError(429, seconds,
  'Too many unsuccessful sign-in attempts. Please wait before trying again.');
const unavailable = () => new ApiError(503, 'Sign-in protection is temporarily unavailable. Please try again shortly.');

/** Only Express's already-validated req.ip belongs here, never a body/header IP.
 * Canonicalize IPv6 and mapped IPv4 so alternate spellings share one budget. */
export function passwordAttemptKeys(input: { email: unknown; ip: unknown }): { pair: string; ip: string } {
  const email = signupEmail(input.email);
  if (typeof input.ip !== 'string' || input.ip.length > 128 || !isIP(input.ip)) throw unavailable();
  let address = input.ip;
  if (isIP(address) === 6) {
    try { address = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase(); }
    catch { throw unavailable(); }
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
    if (mapped) {
      const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
      address = `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
    }
  }
  const hash = (scope: string, values: string[]) => createHash('sha256')
    .update(`pinevela-password-failure:v1:${scope}:`).update(JSON.stringify(values)).digest('hex');
  return { pair: hash('ip-email', [address, email]), ip: hash('ip', [address]) };
}

export type PasswordFailureState = {
  recent_failures: Date[];
  blocked_until: Date | null;
};

function milliseconds(value: Date): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw unavailable();
  return value.getTime();
}

/** Kept bounded to thirty timestamps while preserving a real rolling window. */
export function passwordFailureState(state: PasswordFailureState | undefined, now: Date) {
  const timestamp = milliseconds(now);
  if (!state) return { recent: [] as Date[], retryAfter: 0 };
  if (!Array.isArray(state.recent_failures) || state.recent_failures.length > PASSWORD_IP_FAILURE_LIMIT) throw unavailable();
  const blocked = state.blocked_until === null ? 0 : milliseconds(state.blocked_until);
  const recent = state.recent_failures.filter(value => {
    const failed = milliseconds(value);
    // Only timestamps written by PostgreSQL are accepted. A backward clock
    // jump must not silently waive a failure budget.
    if (failed > timestamp) throw unavailable();
    return failed > timestamp - PASSWORD_FAILURE_WINDOW_SECONDS * 1000;
  }).sort((left, right) => left.getTime() - right.getTime());
  return { recent, retryAfter: Math.max(0, Math.ceil((blocked - timestamp) / 1000)) };
}

export function nextPasswordFailure(state: PasswordFailureState | undefined, now: Date, maximum: number): PasswordFailureState {
  if (maximum !== PASSWORD_EMAIL_FAILURE_LIMIT && maximum !== PASSWORD_IP_FAILURE_LIMIT) throw unavailable();
  const current = passwordFailureState(state, now);
  if (current.retryAfter > 0) throw pause(current.retryAfter);
  const recent = [...current.recent, now].slice(-maximum);
  return { recent_failures: recent,
    blocked_until: recent.length >= maximum ? new Date(now.getTime() + PASSWORD_FAILURE_COOLDOWN_SECONDS * 1000) : null };
}

export function isPasswordCredentialFailure(error: unknown): error is ApiError {
  // CAPTCHA, provider outages, portal PINs, role choices and unconfirmed
  // accounts are not incorrect email/password proofs.
  return error instanceof ApiError && error.status === 401 && error.code === 'invalid_credentials';
}

/** Admission wraps only the native password-token exchange, before bind().
 * Pair/IP locks are try-locks: parallel guesses cannot overrun a budget or
 * occupy an unbounded waiting queue. Failures commit before errors escape.
 * One IP cannot lock a victim out from another IP; all portal aliases share
 * the same keys. Successful proofs clear only the matching email/IP bucket. */
export async function withPasswordLoginLimit<T>(db: SupabaseDatabase, input: { email: unknown; ip: unknown }, attempt: () => Promise<T>): Promise<T> {
  const keys = passwordAttemptKeys(input);
  const result = await db.system(async client => {
    for (const key of [keys.ip, keys.pair].sort()) {
      const held = await client.query(`select pg_try_advisory_xact_lock(hashtextextended('pinevela-password-admission:' || $1::text,0)) as acquired`, [key]);
      if (!held.rows[0]?.acquired) throw new ResourceLimitError(429, 2, 'A sign-in request is already in progress. Please wait.');
    }
    // Rows contain only one-way selectors and bounded timestamp histories.
    // Skip active rows and bound each cleanup; expiry is never client-selected.
    await client.query(`delete from private.auth_login_attempts where bucket_key in (
      select bucket_key from private.auth_login_attempts where updated_at < clock_timestamp() - interval '24 hours'
        and (blocked_until is null or blocked_until <= clock_timestamp())
      order by updated_at limit 100 for update skip locked)`);
    const { rows: [clock] } = await client.query<{ server_now: Date }>('select clock_timestamp() as server_now');
    const { rows } = await client.query<PasswordFailureState & { bucket_key: string }>(
      'select bucket_key,recent_failures,blocked_until from private.auth_login_attempts where bucket_key = any($1::text[])', [[keys.ip, keys.pair]]);
    const states = new Map(rows.map(row => [row.bucket_key, row]));
    const wait = Math.max(...[keys.ip, keys.pair].map(key => passwordFailureState(states.get(key), clock.server_now).retryAfter));
    if (wait > 0) throw pause(wait);
    let value: T;
    try { value = await attempt(); }
    catch (error) {
      if (!isPasswordCredentialFailure(error)) throw error;
      const { rows: [failedClock] } = await client.query<{ server_now: Date }>('select clock_timestamp() as server_now');
      const next = [
        { key: keys.ip, state: nextPasswordFailure(states.get(keys.ip), failedClock.server_now, PASSWORD_IP_FAILURE_LIMIT) },
        { key: keys.pair, state: nextPasswordFailure(states.get(keys.pair), failedClock.server_now, PASSWORD_EMAIL_FAILURE_LIMIT) },
      ];
      const newRows = next.filter(entry => !states.has(entry.key)).length;
      if (newRows) {
        // A brief shared capacity lock happens after the provider has replied.
        // This bounds attacks with ever-changing addresses without serializing
        // provider requests across unrelated users.
        await client.query("select pg_advisory_xact_lock(hashtextextended('pinevela-password-bucket-capacity',0))");
        const { rows: [count] } = await client.query<{ total: string }>('select count(*)::text as total from private.auth_login_attempts');
        if (Number(count.total) + newRows > PASSWORD_FAILURE_BUCKET_CAPACITY) throw unavailable();
      }
      for (const { key, state } of next) {
        await client.query(`insert into private.auth_login_attempts
          (bucket_key,failures,window_started_at,blocked_until,updated_at,recent_failures)
          values ($1,$2,$3,$4,$5,$6::timestamptz[]) on conflict (bucket_key) do update set
          failures = excluded.failures,window_started_at = excluded.window_started_at,
          blocked_until = excluded.blocked_until,updated_at = excluded.updated_at,recent_failures = excluded.recent_failures`,
        [key, state.recent_failures.length, state.recent_failures[0], state.blocked_until, failedClock.server_now, state.recent_failures]);
      }
      const limited = next.some(entry => entry.state.blocked_until !== null);
      // Throwing here would roll back the persisted failure counters.
      return { ok: false as const, error: limited ? pause(PASSWORD_FAILURE_COOLDOWN_SECONDS) : error };
    }
    await client.query('delete from private.auth_login_attempts where bucket_key = $1', [keys.pair]);
    return { ok: true as const, value };
  });
  if (!result.ok) throw result.error;
  return result.value;
}
