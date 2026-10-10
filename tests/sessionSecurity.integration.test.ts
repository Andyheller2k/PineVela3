import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setRecordSession, tokenDigest } from '../sessionSecurity.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

test('S21: all login paths expire/revoke hashed sessions, protect cookies and preserve account isolation across restart', { timeout: 120000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-sessions-'));
  const dataDir = path.join(temp, 'data'), db = path.join(dataDir, 'pinevela_store.json');
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, email: `${crypto.randomUUID()}@example.test`, name: `Isolated ${role}`, password: crypto.randomBytes(18).toString('hex'), token: crypto.randomUUID() });
  const buyer = actor('user'), other = actor('user'), admin = actor('admin'), manager = { ...actor('manager'), isVerified: true, verificationStatus: 'approved' };
  const officer = { ...actor('verification_team'), officerId: crypto.randomUUID(), fullName: 'Isolated officer', status: 'active' };
  const seller = actor('merchant');
  const market = { id: crypto.randomUUID(), userId: seller.id, studentEmail: seller.email, password: seller.password, status: 'approved' };
  const store = { id: crypto.randomUUID(), userId: seller.id, studentEmail: seller.email, status: 'active', isBanned: false, setupCompleted: true, registrationFeePaid: true };
  const ownManager = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, status: 'approved' };
  const foreignManager = { id: crypto.randomUUID(), managerId: other.id, managerEmail: other.email, status: 'pending' };
  const legacyToken = buyer.token;
  const expired = actor('user'), expiring = actor('user'), malformed = actor('user');
  setRecordSession(expired, expired.token, Date.now() - 10000, 1000);
  const liveExpiryToken = expiring.token; setRecordSession(expiring, liveExpiryToken, Date.now(), 30000);
  const malformedToken = malformed.token; setRecordSession(malformed, malformedToken); delete (malformed as any).session.expiresAt;
  await fs.mkdir(dataDir);
  await fs.writeFile(db, JSON.stringify({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [buyer, other, admin, manager, expired, expiring, malformed], managerRegistrationRequests: [ownManager, foreignManager], managerVerifications: [ownManager, foreignManager], verificationTeams: [officer], digitalMarketApplications: [market], digitalMarketStores: [store] }));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(r => socket.close(() => r()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_SESSION_TTL_SECONDS: '86400' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', d => logs += d); child.stderr?.on('data', d => logs += d);
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail(logs); await new Promise(r => setTimeout(r, 100)); }
    assert.fail(logs);
  };
  const request = async (route: string, expected: number, body?: any, headers: any = {}) => {
    const res = await fetch(base + route, { signal: AbortSignal.timeout(15000), method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json(); assert.equal(res.status, expected, `${route}: ${data.error || 'Unexpected status'}`);
    return { data, cookie: res.headers.get('set-cookie'), cache: res.headers.get('cache-control') };
  };
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = (token: string, status = 200) => request('/api/auth/me', status, undefined, bearer(token));
  const login = async (account: any, route = '/api/auth/login', cookie = false) => {
    const result = await request(route, 200, { usernameOrEmail: account.email, email: account.email, studentEmail: account.email, password: account.password }, cookie ? { 'X-PineVela-Session': 'cookie', Origin: base } : {});
    assert.match(result.cookie || '', /HttpOnly/); assert.match(result.cookie || '', /SameSite=Strict/); assert.match(result.cookie || '', /Max-Age=86400/); assert.equal(result.cache, 'private, no-store');
    return result;
  };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const noRaw = (value: any): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) { assert(!['token', 'merchantToken', 'sessionToken'].includes(key), `Raw ${key} in persistence`); noRaw(child); }
  };
  await start();
  await me(legacyToken, 401); await me(crypto.randomUUID(), 401); await me(malformedToken, 401);
  await me(tokenDigest(legacyToken), 401); await request('/api/auth/me', 401);
  await me(liveExpiryToken); // Expiry is rechecked during this same server process.
  for (let i = 0; i < 350; i++) {
    const res = await fetch(base + '/api/auth/me', { headers: bearer(liveExpiryToken) });
    await res.arrayBuffer();
    if (res.status === 401) break;
    assert.equal(res.status, 200); assert(i < 349, 'Live session did not expire'); await new Promise(r => setTimeout(r, 100));
  }
  await me(liveExpiryToken, 401);
  console.log('S21 live expiry passed.');
  const primary = (await login(buyer)).data, independent = (await login(other)).data;
  assert.equal(primary.role, 'user'); assert(primary.token);
  const firstSession = (await read()).users.find((u: any) => u.id === buyer.id).session;
  assert.equal(firstSession.tokenHash, tokenDigest(primary.token)); assert.equal(firstSession.expiresAt - firstSession.issuedAt, 86400000);
  await me(primary.token); await me(firstSession.tokenHash, 401);
  assert(!JSON.stringify((await me(primary.token)).data).includes(primary.token));
  assert.deepEqual((await read()).users.find((u: any) => u.id === buyer.id).session, firstSession);
  const rotated = (await login(buyer)).data;
  assert.notEqual(rotated.token, primary.token); await me(primary.token, 401); await me(rotated.token); await me(independent.token);
  // Every alternate issuer must create the same expiring/revocable session.
  console.log('S21 primary rotation passed.');
  const adminLogin = (await login(admin)).data;
  const managerResult = await login(manager);
  const managerLogin = managerResult.data;
  for (const route of ['/api/manager-requests', '/api/manager-verifications']) {
    const bearerList = await request(route, 200, undefined, bearer(managerLogin.token));
    const cookieList = await request(route, 200, undefined, { Cookie: managerResult.cookie!.split(';')[0] });
    assert.deepEqual(cookieList.data, bearerList.data);
    assert(cookieList.data.length > 0 && cookieList.data.every((r: any) => r.managerId === manager.id), 'Cookie transport leaked another manager record');
  }
  const sellerLogin = (await login(seller, '/api/digital-market/login')).data;
  const officerLogin = (await login(officer, '/api/verification-teams/login')).data;
  assert.equal(officerLogin.user.role, 'verification_team');
  await request('/api/verification-team/my-inspections', 200, undefined, bearer(officerLogin.token));
  await request('/api/verification-team/my-inspections', 401);
  await request('/api/verification-team/my-inspections', 403, undefined, bearer(adminLogin.token));
  await request('/api/verification-team/me', 401, undefined, bearer(adminLogin.token));
  for (const route of ['/api/verification-teams/login', '/api/auth/verification-team-login']) {
    await request(route, 401, { email: admin.email, password: admin.password });
    assert.equal((await me(adminLogin.token)).data.role, 'admin');
  }

  for (const session of [adminLogin, managerLogin, sellerLogin, officerLogin]) {
    const token = session.token || session.user?.token; assert(token); await me(token);
    await request('/api/auth/logout', 200, { token: independent.token }, bearer(token));
    await me(token, 401); await me(independent.token);
  }
  await request('/api/verification-team/me', 401, undefined, bearer(officerLogin.token));
  console.log('S21 alternate-account logout passed.');
  noRaw(await read());
  const cookieLogin = await login(buyer, '/api/auth/login', true);
  assert(!JSON.stringify(cookieLogin.data).includes('token')); assert(!('session' in cookieLogin.data));
  const cookie = cookieLogin.cookie!.split(';')[0], copied = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  await request('/api/auth/me', 200, undefined, { Cookie: cookie });
  const ownRegistered = await request('/api/users/my-registered-accounts', 200, undefined, { Cookie: cookie });
  const forgedSelector = await request(`/api/users/my-registered-accounts?email=${encodeURIComponent(other.email)}`, 200, undefined, { Cookie: cookie });
  assert.deepEqual(forgedSelector.data, ownRegistered.data); // The session overrides client identity selectors.
  assert(!JSON.stringify(forgedSelector.data).includes(other.email));
  await request('/api/auth/me', 401, undefined, { Cookie: cookie, Authorization: 'Bearer invalid' });
  await request('/api/auth/logout', 403, {}, { Cookie: cookie, Origin: 'https://foreign.example.test' });
  await request('/api/auth/logout', 403, {}, { Cookie: cookie }); await me(copied);
  const logout = await request('/api/auth/logout', 200, {}, { Cookie: cookie, Origin: base });
  assert.match(logout.cookie || '', /Expires=/); await me(copied, 401); await me(independent.token);
  await request('/api/auth/logout', 200, {}, bearer(copied)); // Idempotent revocation.
  await stop(); await start();
  await me(copied, 401); await me(primary.token, 401); await me(independent.token);
  for (const data of [sellerLogin, officerLogin]) await me(data.token, 401);
  const restored = (await login(buyer)).data; await stop(); await start(); await me(restored.token);
  noRaw(await read());
});
