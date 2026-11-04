import crypto from 'node:crypto';
import { EMAIL_CODE_RESEND_SECONDS, emailResendDelay } from '../emailOtp.js';
import { ResourceLimitError } from '../resourceSecurity.js';
import { ApiError, UUID, type SupabaseDatabase } from './db.js';

export function registeredSignupEmailError(): ApiError {
  return new ApiError(409, 'This email is already registered. Please sign in.', 'email_already_registered');
}

/** Supabase can return an obfuscated successful response for an existing user.
 * Never open verification for that response or an automatically confirmed user. */
export function signupVerificationId(data: any, email: string): string {
  if (data?.access_token || data?.session)
    throw new ApiError(503, 'Email confirmation must be enabled.');
  const user = data?.user || data;
  if (user?.email_confirmed_at || Array.isArray(user?.identities) && user.identities.length === 0)
    throw registeredSignupEmailError();
  if (typeof user?.id !== 'string' || !UUID.test(user.id) || typeof user?.email !== 'string' || user.email.trim().toLowerCase() !== email ||
      !Array.isArray(user?.identities) || user.identities.length === 0)
    throw new ApiError(503, 'Email verification could not be started. Please try again later.');
  return user.id;
}

export function signupEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
    throw new ApiError(400, 'Enter a valid email address.');
  return value.trim().toLowerCase();
}

/** A resend can request delivery only. It never accepts roles, owners, provider
 * operation types, redirect URLs or identity selectors from the caller. */
export function signupResendEmail(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'email') || Object.keys(body).some(key => key !== 'email'))
    throw new ApiError(400, 'Provide only the signup email address.');
  return signupEmail((body as Record<string, unknown>).email);
}

export function signupEmailWait(sentAt: Date | null, now: Date): number {
  if (sentAt === null) return 0;
  if (!Number.isFinite(sentAt.getTime()) || !Number.isFinite(now.getTime()))
    throw new ApiError(503, 'Email delivery is temporarily unavailable.');
  return Math.max(0, Math.ceil((sentAt.getTime() + EMAIL_CODE_RESEND_SECONDS * 1000 - now.getTime()) / 1000));
}

/** Native confirmation_sent_at is a floor, including direct provider sends.
 * Persist only hashed delivery budgets, never OTPs. The lock spans actual Auth
 * delivery; rejected CAPTCHA/provider requests do not increase the penalty. */
export async function withSignupEmailCooldown<T>(db: SupabaseDatabase, value: unknown, send: (state:{pendingSignupId?:string}) => Promise<T>, options: { registration?: boolean } = {}): Promise<{value:T;retryAfter:number}> {
  const email = signupEmail(value);
  const key = crypto.createHash('sha256').update('pinevela-signup-email:'+email).digest('hex');
  return db.system(async client => {
    const lock = await client.query(`select pg_try_advisory_xact_lock(hashtextextended($1,0)) as acquired`, [key]);
    if (!lock.rows[0]?.acquired)
      throw new ResourceLimitError(429, 2, 'An email request is already in progress. Please wait.');
    const { rows: [delivery] } = await client.query(`select max(confirmation_sent_at) as sent_at,
      coalesce(bool_or(email_confirmed_at is not null),false) as registered, clock_timestamp() as server_now
      from auth.users where lower(email) = $1`, [email]);
    // This is an availability decision, never identity or ownership proof. Check
    // before the timer/provider call, including for Google and closed accounts.
    if (options.registration && delivery.registered) throw registeredSignupEmailError();
    let pendingSignupId:string|undefined;
    if(options.registration){
      const pending=(await client.query(`select u.id,exists(select 1 from public.profiles p
        join public.account_contexts c on c.auth_user_id=p.id where p.id=u.id and p.primary_owner_id is null
        and c.kind='primary' and c.status='active' and c.primary_owner_id is null
        and not exists(select 1 from public.account_contexts other where other.auth_user_id=u.id and other.kind<>'primary')) as primary_signup
        from auth.users u where lower(u.email)=$1 and u.email_confirmed_at is null`,[email])).rows[0];
      // Delivery selector only. A pending child/foreign enrollment cannot become
      // a primary signup through email equality. Confirmation still proves identity.
      if(pending){if(!pending.primary_signup)throw registeredSignupEmailError();pendingSignupId=pending.id;}
    }
    const saved = (await client.query(`select send_count,next_allowed_at,last_requested_at from private.auth_email_delivery_limits
      where bucket_key=$1 and last_requested_at>clock_timestamp()-interval '24 hours'`,[key])).rows[0];
    let count = saved?.send_count || (delivery.sent_at && delivery.server_now.getTime()-delivery.sent_at.getTime()<86400000 ? 1 : 0);
    // Reconcile a successful native delivery whose app transaction response was
    // lost. This can only increase a delay, never authorize a session.
    const unrecorded = saved && delivery.sent_at && delivery.sent_at > saved.last_requested_at;
    if(unrecorded)count=Math.min(5,count+1);
    const nativeWait=delivery.sent_at ? Math.max(0,Math.ceil((delivery.sent_at.getTime()+emailResendDelay(Math.max(1,count))*1000-delivery.server_now.getTime())/1000)) : 0;
    const wait = Math.max(nativeWait,saved ? Math.max(0,Math.ceil((saved.next_allowed_at.getTime()-delivery.server_now.getTime())/1000)) : 0);
    if (wait > 0) throw new ResourceLimitError(429, wait, 'Please wait for the resend countdown before requesting another code.');
    await client.query(`delete from private.auth_email_delivery_limits where bucket_key in
      (select bucket_key from private.auth_email_delivery_limits where last_requested_at<clock_timestamp()-interval '24 hours'
       order by last_requested_at limit 100 for update skip locked)`);
    const result=await send({pendingSignupId}),nextCount=Math.min(5,count+1),retryAfter=emailResendDelay(nextCount);
    if(!saved){
      await client.query("select pg_advisory_xact_lock(hashtextextended('pinevela-email-budget-capacity',0))");
      const capacity=(await client.query('select count(*)::int as total from private.auth_email_delivery_limits')).rows[0];
      if(capacity.total>=50000)throw new ResourceLimitError(503,60,'Email delivery capacity is busy. Please try again later.');
    }
    await client.query(`insert into private.auth_email_delivery_limits(bucket_key,send_count,next_allowed_at,last_requested_at)
      values($1,$2,clock_timestamp()+$3::int*interval '1 second',clock_timestamp())
      on conflict(bucket_key) do update set send_count=excluded.send_count,next_allowed_at=excluded.next_allowed_at,last_requested_at=excluded.last_requested_at`,[key,nextCount,retryAfter]);
    return {value:result,retryAfter};
  });
}
