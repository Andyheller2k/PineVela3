import type { SupabaseDatabase } from './db.js';

export function supportMailConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const local = env.SUPPORT_MAILPIT_URL;
  if (local && env.NODE_ENV !== 'production') {
    const url = new URL(local);
    if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port && !url.username && !url.password && url.pathname === '/')
      return { type: 'mailpit' as const, url: url.origin, from: 'support@pinevela.test' };
    throw Error('Support test email requires an explicit loopback Mailpit URL.');
  }
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.RESEND_FROM_EMAIL)) return null;
  return { type: 'resend' as const, key: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL };
}

/** Commit the lease before sending. Stable provider keys deduplicate ambiguous
 * network outcomes. Never hold a database transaction across an email request. */
export async function deliverSupportEmail(db: SupabaseDatabase, limit = 5) {
  const config = supportMailConfiguration();
  if (!config) return { configured: false, sent: 0 };
  let sent = 0;
  for (let i = 0; i < limit; i++) {
    const email = await db.system(async c => {
      // A process may stop during its final attempt. Expiring that lease must
      // leave an actionable failure, rather than a permanently sending row.
      await c.query(`update private.support_email_outbox set status='failed',lease_until=null,
        last_error='Email delivery could not be confirmed. Manual retry is available.'
        where status='sending' and attempts>=8 and lease_until<clock_timestamp()`);
      const row = (await c.query(`select * from private.support_email_outbox where attempts<8 and
        ((status='queued' and available_at<=clock_timestamp()) or(status='sending' and lease_until<clock_timestamp()))
        order by available_at,id for update skip locked limit 1`)).rows[0];
      if (!row) return null;
      return (await c.query(`update private.support_email_outbox set status='sending',attempts=attempts+1,
        lease_until=clock_timestamp()+interval'2 minutes' where id=$1 returning *`, [row.id])).rows[0];
    });
    if (!email) break;
    let providerId: string | undefined;
    try {
      const response = config.type === 'resend'
        ? await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `support-reply/${email.id}` },
          body: JSON.stringify({ from: `PineVela Support <${config.from}>`, to: [email.recipient_email], subject: email.subject, text: email.body }) })
        : await fetch(`${config.url}/api/v1/send`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ From: { Email: config.from, Name: 'PineVela Support' }, To: [{ Email: email.recipient_email }], Subject: email.subject, Text: email.body }) });
      if (!response.ok) throw Error(`Email provider returned ${response.status}.`);
      const result = await response.json(); providerId = result.id || result.ID;
      if (typeof providerId !== 'string' || !providerId) throw Error('Email provider did not confirm acceptance.');
      await db.system(c => c.query(`update private.support_email_outbox set status='sent',sent_at=clock_timestamp(),
        lease_until=null,last_error=null,provider_id=$2 where id=$1 and status='sending'`, [email.id, providerId]));
      sent++;
    } catch {
      await db.system(c => c.query(`update private.support_email_outbox set status=case when attempts>=8 then 'failed' else 'queued' end,
        available_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::int),
        lease_until=null,last_error='Email delivery could not be confirmed. Retry is scheduled.' where id=$1 and status='sending'`, [email.id]));
    }
  }
  return { configured: true, sent };
}
