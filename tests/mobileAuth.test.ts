/** HTTP handoff boundary tests with explicitly intercepted provider/database
 * verification. No Google, mail, cloud account, real token or database is used.
 * These establish the code/cookie/CSRF state machine, not hosted sign-in. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createMobileAuth } from '../supabase/mobileAuth.js';
import { SupabaseAuth, csrfBoundary, readCookie, sessionCookies } from '../supabase/auth.js';
import { ApiError, type SupabaseDatabase } from '../supabase/db.js';
import { googleRequestLogUrl, type GoogleSession } from '../googleAuth.js';

const random = () => crypto.randomBytes(32).toString('base64url');
const challenge = (verifier: string) => crypto.createHash('sha256').update(verifier).digest('base64url');
const publicOrigin = 'https://pinevela.test';
const identityId = '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222222222';
const secondId = '33333333-3333-4333-8333-333333333333', secondSession = '44444444-4444-4444-8444-444444444444';
function fixtureSession(user = identityId, id = sessionId, expired = false): GoogleSession {
  return { access_token: `fixture.${Buffer.from(JSON.stringify({ sub: user, session_id: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600) })).toString('base64url')}.${random()}`,
    refresh_token: random() };
}
function cookieValues(response: Response) {
  return response.headers.getSetCookie().map(line => line.split(';', 1)[0]);
}

test('Android handoff preserves verified sessions and rejects unsafe browser/code transitions', async t => {
  const savedOrigin = process.env.PINEVELA_PUBLIC_ORIGIN, savedMode = process.env.NODE_ENV;
  process.env.PINEVELA_PUBLIC_ORIGIN = publicOrigin;
  process.env.NODE_ENV = 'production';
  let clock = Date.now(), kind = 'primary', terms = true, available = true, userChecks = 0, bindingChecks = 0;
  const known = new Map<string, GoogleSession>(), byRefresh = new Map<string, GoogleSession>();
  const register = (session: GoogleSession) => { known.set(session.access_token, session); byRefresh.set(session.refresh_token, session); return session; };
  let issued = register(fixtureSession());
  t.mock.method(Date, 'now', () => clock);
  const database = { statement: async (_sql: string, values: unknown[]) => {
    bindingChecks++;
    if (!available) throw new ApiError(503, 'Unavailable fixture');
    const actual = [...known.values()].some(session => {
      const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
      return claims.session_id === values[0] && claims.sub === values[1];
    });
    return { rowCount: actual ? 1 : 0, rows: actual ? [{ active_context_id: '55555555-5555-4555-8555-555555555555', kind,
      terms_accepted: terms, access: { banned: false, restrictions: [] }, allowed: true }] : [] };
  } } as unknown as SupabaseDatabase;
  const auth = new SupabaseAuth(database);
  t.mock.method(auth, 'provider', async (route: string, body?: any, token?: string) => {
    if (route === '/user') {
      userChecks++;
      const session = known.get(token || '');
      if (!session) throw new ApiError(401, 'Unknown fixture');
      const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
      if (claims.exp * 1000 <= Date.now()) throw new ApiError(401, 'Expired fixture');
      return { id: claims.sub, email_confirmed_at: '2026-10-29T00:00:00Z', is_anonymous: false };
    }
    if (route === '/token?grant_type=refresh_token') {
      const previous = byRefresh.get(body?.refresh_token);
      if (!previous) throw new ApiError(401, 'Unknown refresh fixture');
      const claims = JSON.parse(Buffer.from(previous.access_token.split('.')[1], 'base64url').toString());
      return register(fixtureSession(claims.sub, claims.session_id));
    }
    assert.fail('Unexpected intercepted provider operation');
  });
  const app = express(), mobile = createMobileAuth(auth);
  app.use('/api', mobile.observe);
  app.use('/api', csrfBoundary);
  app.use(express.json());
  mobile.install(app);
  // Trusted cookie issuance is the explicit integration seam. Real password,
  // emailed proof and Google verification are tested by their existing suites.
  for (const path of ['/api/auth/login', '/api/auth/verify-unified', '/api/auth/google/callback', '/api/auth/me', '/api/fixture-dashboard']) {
    const handler = (_req: express.Request, res: express.Response) => { sessionCookies(res, issued); res.json({ fixture: true }); };
    if (['/api/auth/google/callback', '/api/auth/me', '/api/fixture-dashboard'].includes(path)) app.get(path, handler);
    else app.post(path, handler);
  }
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 500).json({ code: error.code || 'test_failure', error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (savedOrigin === undefined) delete process.env.PINEVELA_PUBLIC_ORIGIN; else process.env.PINEVELA_PUBLIC_ORIGIN = savedOrigin;
    if (savedMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedMode;
  });
  const request = (path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) => fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000),
  });
  async function begin(client = 'android-debug', mode = 'login') {
    const verifier = crypto.randomBytes(48).toString('base64url'), state = random();
    const response = await request('/api/auth/mobile/start', { challenge: challenge(verifier), state, mode, client });
    assert.equal(response.status, 200);
    assert.equal(response.headers.getSetCookie().length, 0, 'Starting in native never creates a browser/session cookie');
    const data = await response.json(), url = new URL(data.browserUrl);
    assert.equal(url.origin, publicOrigin); assert.equal(url.pathname, '/api/auth/mobile/browser');
    assert.deepEqual(Object.keys(data), ['browserUrl']);
    return { verifier, state, url };
  }
  async function browser(client = 'android-debug', mode = 'login') {
    const flow = await begin(client, mode), response = await request(flow.url.pathname + flow.url.search);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `/#/login?mobile=1${mode === 'signup' ? '&mode=register' : ''}`);
    const lines = response.headers.getSetCookie();
    assert.equal(lines.length, 1); assert.match(lines[0], /HttpOnly/); assert.match(lines[0], /Secure/);
    assert.match(lines[0], /SameSite=Lax/); assert.match(lines[0], /Path=\/api\//);
    return { ...flow, flowCookie: cookieValues(response)[0] };
  }
  async function signed(client = 'android-debug', loginPath = '/api/auth/login', mode = 'login') {
    const flow = await browser(client, mode);
    const response = await request(loginPath, loginPath.endsWith('callback') ? undefined : {}, flow.flowCookie);
    assert.equal(response.status, 200);
    return { ...flow, cookie: [flow.flowCookie, ...cookieValues(response)].join('; ') };
  }
  async function finished(client = 'android-debug') {
    const flow = await signed(client), response = await request('/api/auth/mobile/finish', {}, flow.cookie, { origin: publicOrigin });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const data = await response.json(), returned = new URL(data.returnUrl);
    assert.deepEqual(Object.keys(data), ['returnUrl']);
    assert.equal(returned.protocol, client === 'android-debug' ? 'pinevela-debug:' : 'pinevela:');
    assert.equal(returned.hostname, 'auth'); assert.equal(returned.pathname, '/callback');
    assert.equal(returned.searchParams.get('state'), flow.state);
    assert.deepEqual([...returned.searchParams.keys()].sort(), ['code', 'state']);
    assert(response.headers.getSetCookie().some(line => line.startsWith('pv_mobile_flow=;')));
    assert(response.headers.getSetCookie().some(line => line.startsWith('pv_sb_access=;')));
    return { ...flow, code: returned.searchParams.get('code')! };
  }
  const exchangeBody = (flow: { code: string; state: string; verifier: string }) => ({ code: flow.code, state: flow.state, verifier: flow.verifier });

  await t.test('an unsigned native request can start and transfer only fixed client targets', async () => {
    for (const client of ['android-debug', 'android']) {
      const flow = await finished(client), response = await request('/api/auth/mobile/exchange', exchangeBody(flow));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, redirectTo: '/user/dashboard' });
      assert.equal(response.headers.getSetCookie().length, 2);
      for (const line of response.headers.getSetCookie()) assert.match(line, /HttpOnly/);
      assert.equal((await request('/api/auth/mobile/exchange', exchangeBody(flow))).status, 400);
      const cookie = cookieValues(response).join('; ');
      assert.equal(readCookie({ headers: { cookie } } as express.Request, 'pv_sb_access'), issued.access_token);
    }
    assert(userChecks > 0 && bindingChecks > 0, 'Exchange performs actual SupabaseAuth verification and binding checks through intercepted dependencies');
  });
  await t.test('signup confirmation and Google callback establish fresh proof; restoration never does', async () => {
    for (const path of ['/api/auth/verify-unified', '/api/auth/google/callback']) {
      const flow = await signed('android', path, 'signup');
      const response = await request('/api/auth/mobile/status', undefined, flow.cookie);
      assert.deepEqual(await response.json(), { active: true, mode: 'signup', fresh: true });
    }
    const flow = await browser(), existing = `pv_sb_access=${issued.access_token}; pv_sb_refresh=${issued.refresh_token}`;
    const response = await request('/api/auth/me', undefined, flow.flowCookie + '; ' + existing);
    const cookie = [flow.flowCookie, ...cookieValues(response)].join('; ');
    assert.deepEqual(await (await request('/api/auth/mobile/status', undefined, cookie)).json(), { active: true, mode: 'login', fresh: false });
    const denied = await request('/api/auth/mobile/finish', {}, cookie);
    assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'mobile_auth_fresh_required');
  });
  await t.test('Google is a fixed browser UI hint and never establishes authentication', async () => {
    const valid = { challenge: challenge(random()), state: random(), mode: 'login', client: 'android-debug', provider: 'google' };
    const started = await request('/api/auth/mobile/start', valid);
    assert.equal(started.status, 200);
    const url = new URL((await started.json()).browserUrl);
    const opened = await request(url.pathname + url.search);
    assert.equal(opened.headers.get('location'), '/api/auth/mobile/google');
    const cookie = cookieValues(opened).join('; ');
    const launch = await request('/api/auth/mobile/google', undefined, cookie);
    assert.equal(launch.status, 200);assert.match(launch.headers.get('content-type')!, /text\/html/);
    assert.equal(launch.headers.get('cache-control'),'private, no-store');assert.equal(launch.headers.get('x-frame-options'),'DENY');
    assert.match(launch.headers.get('content-security-policy')!,/script-src 'nonce-[A-Za-z0-9_-]{43}'/);
    const page=await launch.text();assert.match(page,/Opening Google/);assert.doesNotMatch(page, /<form|type="password"|name="email"/);
    assert.deepEqual(await (await request('/api/auth/mobile/status', undefined, cookie)).json(), { active: true, mode: 'login', provider: 'google', fresh: false });
    assert.equal((await request('/api/auth/mobile/finish', {}, cookie)).status, 401);
    for (const provider of ['password', 'https://foreign.test', '', null, ['google']]) {
      assert.equal((await request('/api/auth/mobile/start', { ...valid, provider })).status, 400);
    }
  });
  await t.test('Google signup carries current Terms consent to a direct launch without accepting identity selectors', async () => {
    const valid={challenge:challenge(random()),state:random(),mode:'signup',client:'android-debug',provider:'google',termsAcceptance:{accepted:true,version:'2026-10-27'}};
    const response=await request('/api/auth/mobile/start',valid);assert.equal(response.status,200);
    const url=new URL((await response.json()).browserUrl),opened=await request(url.pathname+url.search);
    assert.equal(opened.headers.get('location'),'/api/auth/mobile/google');
    const cookie=cookieValues(opened).join('; '),page=await request('/api/auth/mobile/google',undefined,cookie);
    assert.equal(page.status,200);const html=await page.text();assert.match(html,/"mode":"signup"/);assert.match(html,/"termsAcceptance":\{"accepted":true,"version":"2026-10-27"\}/);
    assert.equal((await request('/api/auth/mobile/finish',{},cookie)).status,401,'Rendering a launcher is never fresh Google proof');
    for(const acceptance of [null,{accepted:false,version:'2026-10-27'},{accepted:true,version:'old'},{accepted:true,version:'2026-10-27',userId:identityId}])
      assert.ok([400,409].includes((await request('/api/auth/mobile/start',{...valid,termsAcceptance:acceptance})).status));
    for(const extra of [{mode:'login'},{provider:'password'},{userId:identityId},{redirectTo:'https://foreign.test'}])
      assert.equal((await request('/api/auth/mobile/start',{...valid,...extra})).status,400);
  });
  await t.test('direct Google launcher rejects absent, non-Google, expired and already-proved handoffs', async () => {
    assert.equal((await request('/api/auth/mobile/google')).status,400);
    const normal=await browser();assert.equal((await request('/api/auth/mobile/google',undefined,normal.flowCookie)).status,400);
    const input={challenge:challenge(random()),state:random(),mode:'login',client:'android',provider:'google'};
    const start=await request('/api/auth/mobile/start',input),url=new URL((await start.json()).browserUrl),opened=await request(url.pathname+url.search),cookie=cookieValues(opened).join('; ');
    const proof=await request('/api/auth/google/callback',undefined,cookie);assert.equal(proof.status,200);
    assert.equal((await request('/api/auth/mobile/google',undefined,cookie)).status,400);
    const legacy=await request('/api/auth/mobile/start',{...input,mode:'signup'}),legacyUrl=new URL((await legacy.json()).browserUrl);
    assert.equal((await request(legacyUrl.pathname+legacyUrl.search)).headers.get('location'),'/#/login?mobile=1&mode=register&native_provider=google','Older APKs without consent must still read and accept the web Terms');
    const expiring=await request('/api/auth/mobile/start',input),expiringUrl=new URL((await expiring.json()).browserUrl);
    const expiringCookie=cookieValues(await request(expiringUrl.pathname+expiringUrl.search)).join('; ');
    clock+=300_001;
    assert.equal((await request('/api/auth/mobile/google',undefined,expiringCookie)).status,400);
  });
  await t.test('foreign browser writes and reads are denied without changing CORS or CSRF policy', async () => {
    const flow = await signed();
    for (const headers of [{ origin: 'https://foreign.test' }, { origin: 'invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
      assert.equal((await request('/api/auth/mobile/finish', {}, flow.cookie, headers)).status, 403);
      assert.equal((await request('/api/auth/mobile/status', undefined, flow.cookie, headers)).status, 403);
      assert.equal((await request('/api/auth/mobile/start', { challenge: challenge(random()), state: random(), mode: 'login', client: 'android' }, undefined, headers)).status, 403);
    }
    const response = await request('/api/auth/mobile/status', undefined, flow.cookie, { origin: publicOrigin });
    assert.equal(response.status, 200); assert.equal(response.headers.has('access-control-allow-origin'), false);
  });
  await t.test('invalid body shapes and redirect/identity injection are rejected', async () => {
    const valid = { challenge: challenge(random()), state: random(), mode: 'login', client: 'android' };
    for (const body of [null, [], {}, { ...valid, userId: identityId }, { ...valid, returnUrl: 'https://foreign.test' },
      { ...valid, challenge: [valid.challenge] }, { ...valid, state: [valid.state] }, { ...valid, challenge: 'x' },
      { ...valid, client: 'https://foreign.test' }, { ...valid, mode: 'admin' }])
      assert.equal((await request('/api/auth/mobile/start', body)).status, 400);
    const flow = await signed();
    for (const body of [null, [], { userId: identityId }, { accepted: true }, { redirectTo: 'https://foreign.test' }])
      assert.equal((await request('/api/auth/mobile/finish', body, flow.cookie)).status, 400);
  });
  await t.test('browser ticket is single-use, cookies are unambiguous and session substitution fails', async () => {
    const flow = await signed();
    assert.equal((await request(flow.url.pathname + flow.url.search)).status, 400);
    for (const cookie of ['', flow.flowCookie + '; ' + flow.flowCookie, 'pv_mobile_flow=%ZZ']) {
      assert.deepEqual(await (await request('/api/auth/mobile/status', undefined, cookie)).json(), { active: false });
      assert.equal((await request('/api/auth/mobile/finish', {}, cookie)).status, 400);
    }
    const other = register(fixtureSession(secondId, secondSession));
    const swapped = flow.flowCookie + `; pv_sb_access=${other.access_token}; pv_sb_refresh=${other.refresh_token}`;
    const response = await request('/api/auth/mobile/finish', {}, swapped);
    assert.equal(response.status, 403); assert.equal((await response.json()).code, 'mobile_auth_fresh_required');
  });
  await t.test('wrong verifier/state, extra selectors and malformed codes issue no cookies', async () => {
    const flow = await finished(), valid = exchangeBody(flow);
    for (const body of [{ ...valid, state: random() }, { ...valid, verifier: random() }, { ...valid, code: random() },
      { ...valid, verifier: 'x' }, { ...valid, code: [valid.code] }, { ...valid, userId: identityId }, { ...valid, redirectTo: '/admin/dashboard' }]) {
      const denied = await request('/api/auth/mobile/exchange', body);
      assert.equal(denied.status, 400); assert.equal(denied.headers.getSetCookie().length, 0);
    }
    assert.equal((await request('/api/auth/mobile/exchange', valid)).status, 200, 'Invalid guesses do not replace the bound verifier or redeem a valid code');
  });
  await t.test('API refresh can update an existing fresh proof without establishing a new one', async () => {
    const flow = await signed();
    const previous = issued;
    issued = register(fixtureSession());
    const rotated = await request('/api/fixture-dashboard', undefined, flow.cookie);
    const cookie = [flow.flowCookie, ...cookieValues(rotated)].join('; ');
    const finish = await request('/api/auth/mobile/finish', {}, cookie);
    assert.equal(finish.status, 200);
    const returned = new URL((await finish.json()).returnUrl);
    const exchange = await request('/api/auth/mobile/exchange', { code: returned.searchParams.get('code'), state: flow.state, verifier: flow.verifier });
    assert.equal(exchange.status, 200);
    assert(cookieValues(exchange).some(line => line.includes(issued.refresh_token)), 'The latest server-issued pair reaches native');
    assert(!cookieValues(exchange).some(line => line.includes(previous.refresh_token)), 'No stale refresh token is handed over');
    const unsigned = await browser();
    await request('/api/fixture-dashboard', undefined, unsigned.flowCookie);
    assert.deepEqual(await (await request('/api/auth/mobile/status', undefined, unsigned.flowCookie)).json(), { active: true, mode: 'login', fresh: false });
  });
  await t.test('concurrent finish and code redemption succeed once only', async () => {
    const flow = await signed();
    const finishes = await Promise.all([request('/api/auth/mobile/finish', {}, flow.cookie), request('/api/auth/mobile/finish', {}, flow.cookie)]);
    assert.deepEqual(finishes.map(response => response.status).sort(), [200, 400]);
    const returned = new URL((await finishes.find(response => response.status === 200)!.json()).returnUrl);
    const completed = { ...flow, code: returned.searchParams.get('code')! };
    const replies = await Promise.all([request('/api/auth/mobile/exchange', exchangeBody(completed)), request('/api/auth/mobile/exchange', exchangeBody(completed))]);
    assert.deepEqual(replies.map(response => response.status).sort(), [200, 400]);
  });
  await t.test('live Terms and binding failures prevent transfer and expose no tokens', async () => {
    const flow = await signed(); terms = false;
    const denied = await request('/api/auth/mobile/finish', {}, flow.cookie);
    assert.equal(denied.status, 403); terms = true;
    const complete = await finished(); terms = false;
    const rejection = await request('/api/auth/mobile/exchange', exchangeBody(complete));
    assert.equal(rejection.status, 403); assert.equal(rejection.headers.getSetCookie().length, 0); terms = true;
    assert.equal((await request('/api/auth/mobile/exchange', exchangeBody(complete))).status, 400);
    const outage = await finished(); available = false;
    const unavailable = await request('/api/auth/mobile/exchange', exchangeBody(outage));
    assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.getSetCookie().length, 0); available = true;
    assert.equal((await request('/api/auth/mobile/exchange', exchangeBody(outage))).status, 400);
  });
  await t.test('expired native proof and expired browser attempts fail closed', async () => {
    const code = await finished(); clock += 60_001;
    assert.equal((await request('/api/auth/mobile/exchange', exchangeBody(code))).status, 400);
    const flow = await signed(); clock += 300_001;
    assert.deepEqual(await (await request('/api/auth/mobile/status', undefined, flow.cookie)).json(), { active: false });
    assert.equal((await request('/api/auth/mobile/finish', {}, flow.cookie)).status, 400);
    issued = register(fixtureSession());
  });
  await t.test('refresh is captured privately until live exchange binding validation succeeds', async () => {
    issued = register(fixtureSession());
    const soon = { ...issued, access_token: `fixture.${Buffer.from(JSON.stringify({ sub: identityId, session_id: sessionId,
      role: 'authenticated', exp: Math.floor(clock / 1000) + 2 })).toString('base64url')}.${random()}` };
    issued = register(soon);
    const expiringFlow = await finished(); clock += 3000;
    available = false;
    const failed = await request('/api/auth/mobile/exchange', exchangeBody(expiringFlow));
    assert.equal(failed.status, 503); assert.equal(failed.headers.getSetCookie().length, 0, 'A staged provider refresh is not installed after binding failure');
    available = true; issued = register(fixtureSession());
    const short = { ...issued, access_token: `fixture.${Buffer.from(JSON.stringify({ sub: identityId, session_id: sessionId, role: 'authenticated', exp: Math.floor(clock / 1000) + 2 })).toString('base64url')}.${random()}` };
    issued = register(short);
    const success = await finished(); clock += 3000;
    const refreshed = await request('/api/auth/mobile/exchange', exchangeBody(success));
    assert.equal(refreshed.status, 200); assert.equal(refreshed.headers.getSetCookie().length, 2);
    assert(!cookieValues(refreshed).some(line => line.includes(issued.access_token)), 'The refreshed cookie pair replaces the expired access token');
    issued = register(fixtureSession());
  });
  await t.test('role destinations come only from the verified actor', async () => {
    for (const [role, path] of Object.entries({ resident: '/student/dashboard', seller: '/digital-market', manager: '/manager/dashboard',
      staff: '/staff/dashboard', officer: '/field-officer', admin: '/admin/dashboard' })) {
      kind = role;
      const flow = await finished(), response = await request('/api/auth/mobile/exchange', exchangeBody(flow));
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, redirectTo: path });
    }
    kind = 'primary';
  });
  await t.test('process-local capacity is bounded and expired entries are reclaimed', async () => {
    clock += 300_001;
    let full = false;
    for (let index = 0; index < 1001; index++) {
      const response = await request('/api/auth/mobile/start', { challenge: challenge(random()), state: random(), mode: 'login', client: 'android' });
      if (response.status === 429) { full = true; break; }
      assert.equal(response.status, 200);
    }
    assert(full, 'The thousand-entry capacity rejects further state allocation');
    clock += 300_001;
    await begin();
  });
  await t.test('callback ticket/code parameters are stripped from request-log URLs', () => {
    for (const path of ['/api/auth/mobile/browser', '/api/auth/mobile/status', '/API/auth/mobile/exchange/', '/api/auth/google/callback'])
      assert.equal(googleRequestLogUrl(path + '?ticket=private&code=private&state=private'), path);
    assert.equal(googleRequestLogUrl('/api/health?probe=ok'), '/api/health?probe=ok');
  });
});
