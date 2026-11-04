/** Actual HTTP/CSRF/native-Google/Auth bind+projection handlers. Provider and
 * PostgreSQL dependencies are explicit local fixtures, never Google/accounts. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { createNativeGoogleAuth } from '../supabase/nativeGoogleAuth.js';
import { SupabaseAuth, csrfBoundary, readCookie } from '../supabase/auth.js';
import { ApiError, type SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { PLATFORM_TERMS } from '../legalPolicy.js';
import { maintenanceError } from '../supabase/platformMaintenance.js';

const subject = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const contextId = '33333333-3333-4333-8333-333333333333';
const otherSubject = '44444444-4444-4444-8444-444444444444';
const random = () => crypto.randomBytes(32).toString('base64url');
const hash = (value: string, encoding: 'base64url' | 'hex' = 'base64url') => crypto.createHash('sha256').update(value).digest(encoding);
const acceptance = { accepted: true, version: PLATFORM_TERMS.version };

test('native Google exchanges only a nonce-bound, one-use verified identity into existing cookie sessions', async t => {
  const oldMode = process.env.NODE_ENV, oldClient = process.env.GOOGLE_WEB_CLIENT_ID;
  process.env.NODE_ENV = 'production'; delete process.env.GOOGLE_WEB_CLIENT_ID;
  let clock = Date.now(), sequence = 0;
  t.mock.method(Date, 'now', () => clock);
  const state = {
    kind: 'primary', available: true, banned: false, live: true, allowed: true, pin: false,
    profile: true, closed: false, choice: false, google: true, signup: true, verified: true,
    userSubject: subject, tokenSubject: subject, projectionFailure: false, providerFailure: false,
    blockExchange: undefined as Promise<void> | undefined,
  };
  const receipts: unknown[][] = [], queries: string[] = [], providerCalls: { route: string; body?: any; token?: string }[] = [];
  const access = () => ({ banned: state.banned, restrictions: [], until: '2099-01-01', reason: 'fixture' });
  const row = (rows: any[] = []) => ({ rows, rowCount: rows.length });
  const client = { query: async (sql: string, values: any[] = []) => {
    queries.push(sql);
    if (sql.includes('pg_advisory_xact_lock')) return row();
    if (sql.startsWith('select private.platform_available()')) return row([{ available: state.available }]);
    if (sql.startsWith('select id from auth.sessions')) return row(state.live ? [{ id: sessionId }] : []);
    if (sql.startsWith('select u.id from auth.users')) return row(state.live && state.verified ? [{ id: subject }] : []);
    if (sql.startsWith('select id from public.profiles')) return row(state.profile ? [{ id: subject }] : []);
    if (sql.startsWith('select id,status from public.account_contexts')) return row(state.kind === 'primary' ? [{ id: contextId, status: state.closed ? 'closed' : 'active' }] : []);
    if (sql.startsWith('select id from private.primary_wipe_executions')) return row();
    if (sql.startsWith('select private.initialize_auth_profile')) { state.profile = true; return row(); }
    if (sql.includes('select c.id, c.kind from public.account_contexts')) return row(!state.profile || state.closed ? [] :
      state.choice ? [{ id: contextId, kind: 'resident' }, { id: contextId, kind: 'seller' }] : [{ id: contextId, kind: state.kind }]);
    if (sql.startsWith('select 1 from public.account_contexts')) return row(state.closed ? [{ exists: 1 }] : []);
    if (sql.startsWith('select private.account_access')) return row([{ access: access(), allowed: state.allowed }]);
    if (sql.startsWith('select * from private.portal_access_keys')) return row(state.pin ? [{ version: 1 }] : []);
    if (sql.startsWith('insert into private.account_sessions')) return row([{ active_context_id: contextId }]);
    if (sql.startsWith('insert into private.legal_acceptances')) { receipts.push(values); return row(); }
    if (sql.startsWith('select accepted_at from private.legal_acceptances')) return row(receipts.some(receipt => receipt[0] === subject) ? [{ accepted_at: '2026-11-03T00:00:00Z' }] : []);
    if (sql.startsWith('select display_name, email, phone, avatar_path')) return row([{ display_name: 'Local fixture', email: 'fixture@test.edu.gh', account_access: access() }]);
    if (sql.startsWith('select 1 from private.support_memberships')) return row();
    if (sql.includes('from private.account_enrollments e')) return row([{ full_name: 'Fixture officer' }]);
    if (sql.includes('from public.stores') || sql.includes('from public.allocations')) return row();
    assert.fail('Unexpected database fixture query: ' + sql.slice(0, 100));
  } };
  function authorized(actor: VerifiedActor, kinds: string[], work: (c: any) => Promise<unknown>) {
    assert.equal(actor.authUserId, subject); assert.equal(actor.sessionId, sessionId); assert.equal(actor.contextId, contextId);
    assert(kinds.includes(state.kind));
    if (!state.live || !state.allowed) throw new ApiError(401, 'Fixture session no longer allowed.');
    if (state.banned) throw new ApiError(403, 'Fixture banned.', 'account_banned');
    if (!state.available && state.kind !== 'admin') throw maintenanceError();
    return work(client);
  }
  const database = {
    system: async (work: (c: any) => Promise<unknown>) => work(client),
    authorizedSystem: async (actor: VerifiedActor, kinds: string[], work: (c: any) => Promise<unknown>) => authorized(actor, kinds, work),
    authorizedRead: async (actor: VerifiedActor, kinds: string[], work: (c: any) => Promise<unknown>) => {
      if (state.projectionFailure) throw new ApiError(503, 'Projection unavailable.');
      return authorized(actor, kinds, work);
    },
    readActor: async (actor: VerifiedActor, work: (c: any) => Promise<unknown>) => authorized(actor, [actor.kind], work),
  } as unknown as SupabaseDatabase;
  const auth = new SupabaseAuth(database);
  const issued = () => ({ access_token: `fixture.${Buffer.from(JSON.stringify({ sub: state.tokenSubject, session_id: sessionId, role: 'authenticated', exp: Math.floor(clock / 1000) + 3600 })).toString('base64url')}.${random()}`,
    refresh_token: random() });
  let session = issued();
  t.mock.method(auth, 'provider', async (route: string, body?: any, token?: string) => {
    providerCalls.push({ route, body, token });
    if (route === '/settings') return { external: { google: state.google }, disable_signup: !state.signup };
    if (route === '/token?grant_type=id_token') {
      if (state.blockExchange) await state.blockExchange;
      if (state.providerFailure) throw new ApiError(401, 'Fixture ID token rejected.');
      session = issued(); return session;
    }
    if (route === '/user') {
      assert.equal(token, session.access_token);
      return { id: state.userSubject, email: 'fixture@test.edu.gh', is_anonymous: false,
        email_confirmed_at: state.verified ? '2026-11-03T00:00:00Z' : null,
        identities: state.google ? [{ provider: 'google', identity_data: { email: 'fixture@test.edu.gh', email_verified: state.verified } }] : [] };
    }
    if (route === '/logout?scope=local') { assert.equal(token, session.access_token); return {}; }
    assert.fail('Unexpected intercepted provider operation: ' + route);
  });
  const app = express();
  app.set('trust proxy', ['loopback']);
  app.use(csrfBoundary); app.use(express.json({ limit: '32kb' }));
  createNativeGoogleAuth(auth).install(app);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 500).json({ code: error.code || 'test_failure', error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, path = '/api/auth/mobile/google/native/';
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldMode;
    if (oldClient === undefined) delete process.env.GOOGLE_WEB_CLIENT_ID; else process.env.GOOGLE_WEB_CLIENT_ID = oldClient;
  });
  function reset() {
    clock += 61_000; providerCalls.length = 0; queries.length = 0; receipts.length = 0;
    Object.assign(state, { kind: 'primary', available: true, banned: false, live: true, allowed: true, pin: false,
      profile: true, closed: false, choice: false, google: true, signup: true, verified: true,
      userSubject: subject, tokenSubject: subject, projectionFailure: false, providerFailure: false, blockExchange: undefined });
  }
  const request = (operation: string, body: unknown, headers: Record<string, string> = {}) => fetch(origin + path + operation, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${++sequence % 250 + 1}`, ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  async function begin(mode = 'login', client = 'android-debug') {
    const verifier = random(), response = await request('start', { mode, client, challenge: hash(verifier), ...(mode === 'signup' ? { termsAcceptance: acceptance } : {}) });
    assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json();
    assert.deepEqual(Object.keys(data), ['flowId', 'nonce', 'serverClientId', 'expiresAt']);
    assert.match(data.flowId, /^[\w-]{43}$/); assert.match(data.nonce, /^[a-f0-9]{64}$/);
    assert.equal(Date.parse(data.expiresAt), clock + 5 * 60_000);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.getSetCookie().length, 0);
    return { ...data, verifier };
  }
  const token = (flow: any, extra: Record<string, unknown> = {}) => `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ aud: flow.serverClientId, nonce: flow.nonce, ...extra })).toString('base64url')}.${random()}`;
  const complete = (flow: any, extra: Record<string, unknown> = {}) => request('complete', { flowId: flow.flowId, verifier: flow.verifier, idToken: token(flow), ...extra });

  await t.test('login exchanges raw server nonce and returns only a role destination plus HttpOnly cookies', async () => {
    reset(); const flow = await begin(), response = await complete(flow);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { authenticated: true, redirectTo: '/user/dashboard' });
    assert.equal(receipts.length, 0, 'Login never auto-accepts Terms');
    const exchange = providerCalls.find(call => call.route === '/token?grant_type=id_token')!;
    assert.deepEqual(Object.keys(exchange.body), ['provider', 'id_token', 'nonce']);
    assert.equal(exchange.body.provider, 'google'); assert.notEqual(exchange.body.nonce, flow.nonce);
    assert.equal(hash(exchange.body.nonce, 'hex'), flow.nonce);
    assert(providerCalls.filter(call => call.route === '/user').length >= 2, 'Provider identity and actual Auth.bind both verify the user');
    assert(queries.some(sql => sql.startsWith('insert into private.account_sessions')), 'Actual Auth.bind establishes a live account binding');
    assert(queries.some(sql => sql.startsWith('select display_name, email')), 'Actual Auth.projection completes before cookies');
    assert.equal(response.headers.getSetCookie().length, 2);
    for (const cookie of response.headers.getSetCookie()) { assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/); }
    const cookie = response.headers.getSetCookie().map(line => line.split(';')[0]).join('; ');
    assert.equal(readCookie({ headers: { cookie } } as express.Request, 'pv_sb_access'), session.access_token);
    assert.equal((await complete(flow)).status, 400, 'Successful flow cannot be replayed');
  });
  await t.test('explicit signup uses retained identity semantics and creates only the bound current agreement receipt', async () => {
    reset(); state.profile = false;
    const flow = await begin('signup', 'android'), response = await complete(flow);
    assert.equal(response.status, 200); assert.equal(receipts.length, 1);
    assert(queries.some(sql => sql.startsWith('select private.initialize_auth_profile')));
    assert.deepEqual(receipts[0].slice(0, 3), [subject, contextId, sessionId]);
    assert.equal(receipts[0][6], PLATFORM_TERMS.version); assert.equal(receipts[0][7], PLATFORM_TERMS.sha256); assert.equal(receipts[0][8], 'google_signup');
  });
  await t.test('missing, false or obsolete signup Terms are rejected before provider or database work', async () => {
    reset();
    for (const termsAcceptance of [undefined, { accepted: false, version: PLATFORM_TERMS.version }, { accepted: true, version: 'old' }, { ...acceptance, userId: subject }]) {
      const response = await request('start', { mode: 'signup', client: 'android', challenge: hash(random()), ...(termsAcceptance ? { termsAcceptance } : {}) });
      assert([400, 409].includes(response.status));
    }
    assert.equal(providerCalls.length, 0); assert.equal(queries.length, 0);
  });
  await t.test('identity, redirect and credential selectors cannot be injected into either protocol body', async () => {
    reset(); const base = { mode: 'login', client: 'android', challenge: hash(random()) };
    for (const extra of [{ userId: subject }, { contextId }, { preferredKind: 'admin' }, { nonce: random() }, { serverClientId: 'foreign' }, { redirectTo: 'https://foreign.test' }, { termsAcceptance: acceptance }])
      assert.equal((await request('start', { ...base, ...extra })).status, 400);
    for (const body of [null, [], {}, { ...base, mode: 'enroll' }, { ...base, client: 'ios' }, { ...base, challenge: random() + 'x' }])
      assert.equal((await request('start', body)).status, 400);
    assert.equal(providerCalls.length, 0);
    const flow = await begin();
    for (const extra of [{ userId: otherSubject }, { contextId }, { mode: 'signup' }, { termsAcceptance: acceptance }, { access_token: 'forged' }, { redirectTo: '/admin/dashboard' }])
      assert.equal((await complete(flow, extra)).status, 400);
    assert.equal((await complete(flow)).status, 200, 'Malformed requests do not consume another valid flow');
  });
  await t.test('a wrong S256 verifier cannot exchange and does not consume its protected flow', async () => {
    reset(); const flow = await begin();
    assert.equal((await complete(flow, { verifier: random() })).status, 400);
    assert.equal(providerCalls.filter(call => call.route.startsWith('/token')).length, 0);
    assert.equal((await complete(flow)).status, 200);
  });
  await t.test('expired flows and process restarts cannot reuse nonce or verifier proof', async () => {
    reset(); const flow = await begin(); clock += 5 * 60_000;
    assert.equal((await complete(flow)).status, 400); assert.equal(providerCalls.filter(call => call.route.startsWith('/token')).length, 0);
    const fresh = await begin(); assert.notEqual(fresh.nonce, flow.nonce); assert.notEqual(fresh.flowId, flow.flowId);
  });
  await t.test('malformed and oversized ID tokens never reach Supabase', async () => {
    reset(); const flow = await begin();
    for (const idToken of ['', 'invalid', 'a.b.', 'a.b.c.'.repeat(6000), 'a.\u00e9.c', {}, null])
      assert([400, 413].includes((await complete(flow, { idToken })).status));
    assert.equal(providerCalls.filter(call => call.route.startsWith('/token')).length, 0);
  });
  await t.test('wrong nonce or audience is rejected and consumes only the correctly proved one-use flow', async () => {
    reset();
    for (const extra of [{ nonce: random() }, { aud: 'foreign.apps.googleusercontent.com' }, { aud: ['foreign', 'second'] }]) {
      const flow = await begin(); assert.equal((await complete(flow, { idToken: token(flow, extra) })).status, 400);
      assert.equal((await complete(flow)).status, 400);
    }
    assert.equal(providerCalls.filter(call => call.route.startsWith('/token')).length, 0);
  });
  await t.test('simultaneous completion consumes proof before the first provider await', async () => {
    reset(); const flow = await begin(); let release!: () => void;
    state.blockExchange = new Promise<void>(resolve => { release = resolve; });
    const first = complete(flow);
    for (let i = 0; i < 100 && !providerCalls.some(call => call.route.startsWith('/token')); i++) await new Promise(resolve => setTimeout(resolve, 2));
    assert(providerCalls.some(call => call.route.startsWith('/token')));
    assert.equal((await complete(flow)).status, 400); release(); assert.equal((await first).status, 200);
    assert.equal(providerCalls.filter(call => call.route.startsWith('/token')).length, 1);
  });
  await t.test('unverified, non-Google or mismatched subjects cannot bind and minted sessions are revoked', async () => {
    for (const change of [{ verified: false }, { google: false }, { userSubject: otherSubject }, { tokenSubject: otherSubject }]) {
      reset(); const flow = await begin(); Object.assign(state, change);
      const response = await complete(flow); assert.equal(response.status, 401);
      assert.equal(response.headers.getSetCookie().length, 0); assert.equal(receipts.length, 0);
      assert.equal(providerCalls.filter(call => call.route.startsWith('/logout')).length, 1);
      assert.equal(queries.some(sql => sql.startsWith('insert into private.account_sessions')), false);
    }
  });
  await t.test('live session, account, portal PIN, account-choice and closure restrictions remain inside actual Auth.bind', async () => {
    for (const [change, status, code] of [
      [{ live: false }, 401, undefined], [{ allowed: false }, 401, 'account_signin_required'],
      [{ banned: true }, 403, 'account_banned'], [{ pin: true }, 403, 'portal_pin_required'],
      [{ choice: true }, 400, 'account_choice_required'], [{ profile: false }, 403, 'google_profile_missing'],
      [{ closed: true }, 403, 'google_primary_closed'],
    ] as const) {
      reset(); const flow = await begin(); Object.assign(state, change);
      const response = await complete(flow); assert.equal(response.status, status, JSON.stringify(change));
      if (code) assert.equal((await response.json()).code, code);
      assert.equal(response.headers.getSetCookie().length, 0); assert.equal(receipts.length, 0);
      assert.equal(providerCalls.filter(call => call.route.startsWith('/logout')).length, 1);
    }
  });
  await t.test('a provider exchange rejection cannot issue cookies or be replayed', async () => {
    reset(); const flow = await begin(); state.providerFailure = true;
    const response = await complete(flow); assert.equal(response.status, 401); assert.equal(response.headers.getSetCookie().length, 0);
    assert.equal((await complete(flow)).status, 400); assert.equal(providerCalls.filter(call => call.route.startsWith('/token')).length, 1);
  });
  await t.test('failed projection never installs cookies and revokes the minted provider session', async () => {
    reset(); const flow = await begin(); state.projectionFailure = true;
    const response = await complete(flow); assert.equal(response.status, 503); assert.equal(response.headers.getSetCookie().length, 0);
    assert.equal(providerCalls.filter(call => call.route.startsWith('/logout')).length, 1);
  });
  await t.test('provider disabled/signup disabled/maintenance policy preserves existing Google entry semantics', async () => {
    reset(); state.google = false; assert.equal((await request('start', { mode: 'login', client: 'android', challenge: hash(random()) })).status, 503);
    reset(); state.signup = false; assert.equal((await request('start', { mode: 'signup', client: 'android', challenge: hash(random()), termsAcceptance: acceptance })).status, 503);
    reset(); state.available = false; assert.equal((await request('start', { mode: 'signup', client: 'android', challenge: hash(random()), termsAcceptance: acceptance })).status, 503);
    reset(); state.available = false; const flow = await begin(); const denied = await complete(flow);
    assert.equal(denied.status, 503); assert.equal((await denied.json()).code, 'platform_maintenance'); assert.equal(denied.headers.getSetCookie().length, 0);
    reset(); state.available = false; state.kind = 'admin'; const admin = await complete(await begin());
    assert.equal(admin.status, 200); assert.deepEqual(await admin.json(), { authenticated: true, redirectTo: '/admin/dashboard' });
  });
  await t.test('role routing comes from the verified binding and every role still projects before cookie issuance', async () => {
    for (const [kind, redirectTo] of Object.entries({ manager: '/manager/dashboard', officer: '/field-officer', resident: '/student/dashboard', seller: '/digital-market', staff: '/staff/dashboard' })) {
      reset(); state.kind = kind; const response = await complete(await begin());
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { authenticated: true, redirectTo });
    }
  });
  await t.test('client-ID override is public configuration, validated and pinned per flow', async () => {
    reset(); process.env.GOOGLE_WEB_CLIENT_ID = 'not-a-client-id';
    assert.equal((await request('start', { mode: 'login', client: 'android', challenge: hash(random()) })).status, 503);
    assert.equal(providerCalls.length, 0);
    process.env.GOOGLE_WEB_CLIENT_ID = '123456789012-abcdefghij0123456789.apps.googleusercontent.com';
    const flow = await begin(); assert.equal(flow.serverClientId, process.env.GOOGLE_WEB_CLIENT_ID);
    delete process.env.GOOGLE_WEB_CLIENT_ID; assert.equal((await complete(flow)).status, 200);
  });
  await t.test('cross-site browser requests cannot start or exchange native Google proof', async () => {
    reset(); const body = { mode: 'login', client: 'android', challenge: hash(random()) };
    assert.equal((await request('start', body, { origin: 'https://foreign.test', 'sec-fetch-site': 'cross-site' })).status, 403);
    const flow = await begin();
    assert.equal((await request('complete', { flowId: flow.flowId, verifier: flow.verifier, idToken: token(flow) }, { origin: 'https://foreign.test' })).status, 403);
    assert.equal(providerCalls.filter(call => call.route.startsWith('/token')).length, 0);
  });
  await t.test('start and complete share a 20-request/IP/minute budget before expensive provider work', async () => {
    reset(); const ip = { 'x-forwarded-for': '198.51.100.25' };
    for (let i = 0; i < 20; i++) assert.equal((await request(i % 2 ? 'complete' : 'start', {}, ip)).status, 400);
    assert.equal((await request('start', { mode: 'login', client: 'android', challenge: hash(random()) }, ip)).status, 429);
    assert.equal(providerCalls.length, 0);
    clock += 60_000; assert.equal((await request('start', { mode: 'login', client: 'android', challenge: hash(random()) }, ip)).status, 200);
  });
  await t.test('global budget bounds distributed malformed traffic without retaining body/token keys', async () => {
    reset(); for (let i = 0; i < 200; i++) assert.equal((await request('complete', {})).status, 400);
    assert.equal((await request('start', { mode: 'login', client: 'android', challenge: hash(random()) })).status, 429);
    assert.equal(providerCalls.length, 0);
  });
});
