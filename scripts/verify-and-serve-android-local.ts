/** Genuine isolated Auth/SMTP/PostgreSQL verification plus a loopback TLS app
 * for Android emulator testing. Never loads .env or reaches hosted services.
 * Keep running until interrupted; private local credentials stay in the owned
 * harness directory. The TLS CA/certificate are supplied by the local test task. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { runLocalSupabaseVerification, createLocalPrimary, saveLocalFixture, type LocalSupabaseHarness } from './lib/local-supabase-harness.js';

let checks = 0, stage = 'owned local stack';
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
async function work(h: LocalSupabaseHarness) {
  await h.assertOwned();
  process.env.PINEVELA_PUBLIC_ORIGIN = 'https://10.0.2.2:9443';
  // The harness already verified its loopback-only endpoints and owned database.
  // Emit the same Secure cookies used by production while testing local TLS.
  process.env.NODE_ENV = 'production';
  stage = 'genuine email signup and confirmation';
  const primary = await createLocalPrimary(h, 'android-user');
  const other = await createLocalPrimary(h, 'android-other');
  check(primary.user.role === 'user' && primary.user.legal?.accepted === true, 'Real confirmed primary has the current Terms receipt');
  check(primary.user.id !== other.user.id, 'Independent actual local identities have separate account contexts');
  const counts = (await h.db.pool.query(`select (select count(*)::int from auth.users) as users,
    (select count(*)::int from auth.users where email_confirmed_at is not null) as confirmed,
    (select count(*)::int from private.schema_migrations) as migrations`)).rows[0];
  check(counts.users === 2 && counts.confirmed === 2 && counts.migrations === 84, 'Only two genuinely confirmed test identities and 84 reviewed migrations exist');

  stage = 'fresh browser-to-native handoff';
  const verifier = crypto.randomBytes(48).toString('base64url'), state = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const browser = h.session(), native = h.session();
  const started = await native.json('/api/auth/mobile/start', { challenge, state, client: 'android-debug', mode: 'login' });
  check(started.status === 200, 'A real unsigned native client starts a bounded handoff');
  const url = new URL(started.data.browserUrl);
  check(url.origin === process.env.PINEVELA_PUBLIC_ORIGIN && url.pathname === '/api/auth/mobile/browser', 'The server selects the exact local TLS browser endpoint');
  const opened = await browser.request(url.pathname + url.search);
  check(opened.status === 303 && opened.headers.get('location') === '/#/login?mobile=1', 'One-use browser bootstrap opens hosted login');
  check(opened.headers.getSetCookie().every(line => line.includes('Secure') && line.includes('HttpOnly')), 'Bound browser flow uses production Secure HttpOnly cookies');
  const before = await browser.request('/api/auth/mobile/status');
  check(before.status === 200 && before.data.active === true && before.data.fresh === false, 'Opening a browser does not establish authentication proof');
  const logged = await browser.json('/api/auth/login', { email: primary.credentials.email, password: primary.credentials.password });
  check(logged.status === 200 && logged.data.id === primary.user.id && logged.data.token === '', 'Actual local password verification establishes only the intended account');
  check(logged.headers.getSetCookie().length === 2 && logged.headers.getSetCookie().every(line => line.includes('Secure') && line.includes('HttpOnly') && line.includes('SameSite=Strict')), 'Actual provider session is carried only by production cookie flags');
  const after = await browser.request('/api/auth/mobile/status');
  check(after.status === 200 && after.data.fresh === true, 'The exact fresh provider-verified browser session is recorded');
  const finished = await browser.json('/api/auth/mobile/finish', {});
  check(finished.status === 200, 'Explicit browser confirmation finishes the genuine sign-in');
  const returned = new URL(finished.data.returnUrl);
  check(returned.protocol === 'pinevela-debug:' && returned.hostname === 'auth' && returned.pathname === '/callback'
    && returned.searchParams.get('state') === state, 'Only the fixed native callback and bound state are returned');
  check((await browser.request('/api/auth/me')).status === 401, 'Browser cookies are cleared after explicit transfer');
  const body = { code: returned.searchParams.get('code'), state, verifier };
  const exchanged = await native.json('/api/auth/mobile/exchange', body);
  check(exchanged.status === 200 && exchanged.data.ok === true && exchanged.data.redirectTo === '/user/dashboard', 'Actual Supabase verification and current database binding allow native redemption');
  check(Object.keys(exchanged.data).sort().join(',') === 'ok,redirectTo', 'Native exchange response contains no provider credential or profile');
  check(exchanged.headers.getSetCookie().length === 2 && exchanged.headers.getSetCookie().every(line => line.includes('Secure') && line.includes('HttpOnly')), 'Native receives the same private production cookie transport');
  const me = await native.request('/api/auth/me');
  check(me.status === 200 && me.data.id === primary.user.id && me.data.email === primary.credentials.email, 'Transferred cookies restore the exact real identity');
  const replay = await h.session().json('/api/auth/mobile/exchange', body);
  check(replay.status === 400 && replay.headers.getSetCookie().length === 0, 'Real application code replay installs no session');

  stage = 'unauthorized selectors and revocation';
  const contexts = await native.request('/api/auth/contexts');
  check(contexts.status === 200 && contexts.data.every((row: any) => row.id !== other.user.id), 'A verified account cannot list another identity context');
  check((await native.json('/api/auth/context', { contextId: other.user.id })).status === 403, 'A direct API ownership spoof cannot select another actual account');
  check((await native.request('/api/student/my-profile?userId=' + encodeURIComponent(other.user.id))).status === 400, 'Profile reads reject caller-supplied identity selectors');
  const mismatch = await native.request('/api/auth/profile', { method: 'POST', headers: { 'content-type': 'application/json', 'X-PineVela-Profile-Context': other.user.id }, body: JSON.stringify({ name: 'Should never save' }) });
  check(mismatch.status === 409, 'Profile writes reject a different account-context header');
  const media = '/api/media/' + crypto.randomUUID();
  check((await h.session().request(media)).status === 404 && (await native.request(media)).status === 404, 'Unavailable private-media identifiers reveal no existence to unsigned or unrelated users');
  // This owned stack has GoTrue and SMTP but no Storage service. Do not fabricate
  // an authorized object response or describe this negative check as photo E2E.
  const retained = native.copy();
  const logout = await native.json('/api/auth/logout', {});
  check(logout.status === 200 && logout.data.success === true, 'Native logout commits the actual application-session revocation');
  check((await native.request('/api/auth/me')).status === 401 && (await retained.request('/api/auth/me')).status === 401, 'Both cleared and copied old cookie jars lose authorized access after logout');
  check((await other.session.request('/api/auth/me')).status === 200, 'Revoking this native session preserves the other actual identity');

  stage = 'TLS emulator endpoint';
  const tlsRoot = '/tmp/pinevela-android-step3/tls';
  const target = new URL(h.origin);
  const proxy = https.createServer({ cert: fs.readFileSync(tlsRoot + '/server.crt'), key: fs.readFileSync(tlsRoot + '/server.key') }, (req, res) => {
    if (!req.url?.startsWith('/') || req.url.startsWith('//') || /[\\\r\n]/.test(req.url)) { res.writeHead(400).end(); return; }
    const upstream = http.request({ hostname: '127.0.0.1', port: Number(target.port), path: req.url, method: req.method,
      headers: { ...req.headers, host: target.host } }, response => {
      // Test-only fallback when newer Android dumpsys hides the browser intent.
      // Keep only the latest public one-use bootstrap URL; never capture request
      // bodies, PKCE proof, Auth cookies, provider credentials or return codes.
      if (req.method === 'POST' && req.url === '/api/auth/mobile/start'
        && req.headers['x-pinevela-native'] === 'android' && response.statusCode === 200) {
        const chunks: Buffer[] = []; let size = 0;
        response.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= 8192) chunks.push(chunk); });
        response.once('end', () => {
          try {
            if (size > 8192) return;
            const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const url = new URL(value.browserUrl);
            if (Object.keys(value).join(',') !== 'browserUrl' || url.origin !== process.env.PINEVELA_PUBLIC_ORIGIN
              || url.pathname !== '/api/auth/mobile/browser' || url.username || url.password || url.hash
              || [...url.searchParams.keys()].join(',') !== 'ticket'
              || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('ticket') || '')) return;
            saveLocalFixture(h, 'android-native-browser.json', { browserUrl: url.href });
          } catch { /* An optional private test capture never changes API behavior. */ }
        });
      }
      res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
    });
    upstream.setTimeout(45000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.on('aborted', () => upstream.destroy()); req.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => { proxy.once('error', reject); proxy.listen(9443, '127.0.0.1', resolve); });
  saveLocalFixture(h, 'android-server.json', { apiOrigin: h.origin, publicOrigin: process.env.PINEVELA_PUBLIC_ORIGIN,
    metadataPath: process.argv.at(-1), credentialsFile: 'primary-android-user.json', otherCredentialsFile: 'primary-android-other.json',
    checks, actualGoTrue: true, actualMailpit: true, migrations: 84, authorizedMediaBytesVerified: false, cloudWrites: 0 });
  console.log(JSON.stringify({ ready: true, checks, actualGoTrue: true, actualMailpit: true, migrations: 84,
    publicOrigin: process.env.PINEVELA_PUBLIC_ORIGIN, privateServerFile: h.meta.root + '/pinevela-harness/android-server.json', cloudWrites: 0 }));
  try { await new Promise<void>(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); }); }
  finally { proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); }
}

runLocalSupabaseVerification(work, { staticFrontend: true }).catch(() => {
  console.error(JSON.stringify({ ready: false, stage, error: 'Owned Android local verification failed; private run diagnostics retained.', cloudWrites: 0 }));
  process.exitCode = 1;
});
