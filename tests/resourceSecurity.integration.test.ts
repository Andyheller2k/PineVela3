import { managerKeyHash } from '../residenceRequests.js';
import { sessionFixtureJson } from './sessionFixtures.cjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { hashCredential } from '../accountSecurity.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

test('S23: pre-auth body limits, shared login budgets, upload quotas and SSE caps hold without impacting authorized access across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-resource-api-'));
  const dataDir = path.join(temp, 'data'), uploads = path.join(temp, 'uploads'); await fs.mkdir(dataDir);
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, email: `${crypto.randomUUID()}@example.test`, username: `${role}-${crypto.randomUUID()}`, token: crypto.randomUUID(), password: hashCredential(`Disposable-${role}-S23!`), isVerified: true, verificationStatus: 'approved' });
  const admin = actor('admin'), manager = actor('manager'), buyer = actor('user'), otherBuyer = actor('user');
  const officer = { ...actor('verification_team'), officerId: `PV-S23-${crypto.randomUUID()}`, fullName: 'Disposable S23 officer', status: 'active' };
  const residence = { id: crypto.randomUUID(), name: 'Disposable S23 residence', managerId: manager.id, isApproved: true, blocks: [{ name: 'A', totalRooms: 2, startNum: 101 }] };
  const excessiveResidence = { ...residence, id: crypto.randomUUID(), blocks: [{ name: 'A', totalRooms: 1000000000 }] };
  const room = { id: crypto.randomUUID(), hostelId: residence.id, hostelName: residence.name, blockName: 'A', roomNumber: 'A-101', roomKey: `S23-A-${crypto.randomInt(100000, 1000000)}`, isAssigned: false, status: 'Available' };
  const keyedManagers = [manager];
  const managerSecrets = new Map(keyedManagers.map(actor => [actor.id, crypto.randomBytes(32).toString('base64url')]));
  const managerOperationKeys = Object.fromEntries(keyedManagers.map(actor => [actor.id, { hash: managerKeyHash(actor.id, managerSecrets.get(actor.id)!) }]));
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({
    credentialExposureVersion: 1, accountSecurityVersion: 1, managerOperationKeys, users: [admin, manager, buyer, otherBuyer], verificationTeams: [officer], hostels: [residence, excessiveResidence], roomKeys: [room],
    managerVerifications: [{ id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, status: 'approved' }]
  }));
  const limitsFile = path.join(dataDir, 'request-limits.json');
  // Place this disposable administrator at the real quota boundary; no large files/flood needed.
  await fs.writeFile(limitsFile, JSON.stringify([
    { key: crypto.createHash('sha256').update(`upload-actor-count:admin:${admin.id}`).digest('hex'), count: 99, expiresAt: Date.now() + 86400000 },
    { key: crypto.createHash('sha256').update(`login-identity:${officer.email}`).digest('hex'), count: 20, expiresAt: Date.now() + 15 * 60000 }
  ]));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined, logs = '';
  const controllers: AbortController[] = [];
  const stop = async () => { for (const c of controllers) c.abort(); if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], {
      cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: uploads, PINEVELA_MEDIA_ORIGIN: '', PINEVELA_TRUST_PROXY: '' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', d => logs += d); child.stderr?.on('data', d => logs += d);
    for (let i = 0; i < 150; i++) { try { const response = await fetch(base + '/api/health'); await response.arrayBuffer(); if (response.ok) return; } catch {} if (child.exitCode !== null) assert.fail('Isolated server did not start.'); await new Promise(r => setTimeout(r, 100)); }
    assert.fail('Isolated server did not become ready.');
  };
  const request = async (route: string, status: number, body?: any, token?: string, extra: Record<string, string> = {}) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}`, ...(keyedManagers.some(actor => actor.token === token) ? { 'X-PineVela-Manager-Key': managerSecrets.get(keyedManagers.find(actor => actor.token === token)!.id)! } : {}) } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    const data = await response.json(); assert.equal(response.status, status, `${route}: ${data.error || 'Unexpected status'}`);
    if (status === 429) { assert(Number(response.headers.get('retry-after')) > 0); assert.equal(response.headers.get('cache-control'), 'no-store'); }
    return data;
  };
  const declaredBody = (route: string, token?: string, method = 'POST'): Promise<number> => new Promise((resolve, reject) => {
    const req = http.request(base + route, { method, headers: { 'Content-Type': 'application/json', 'Content-Length': '100000000', ...(token ? { Authorization: `Bearer ${token}`, ...(keyedManagers.some(actor => actor.token === token) ? { 'X-PineVela-Manager-Key': managerSecrets.get(keyedManagers.find(actor => actor.token === token)!.id)! } : {}) } : {}) } }, res => { res.resume(); res.once('end', () => resolve(res.statusCode!)); });
    req.setTimeout(5000, () => req.destroy(new Error(`Early rejection timed out for ${route} (${token ? 'authenticated' : 'anonymous'}); server state: ${logs.slice(-1500)}`))); req.once('error', reject); req.end('{}');
  });
  const oversizedStream = (route: string, maximum: number): Promise<number> => new Promise((resolve, reject) => {
    let responded = false, remaining = maximum + 1;
    const req = http.request(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      responded = true; res.resume(); res.once('end', () => resolve(res.statusCode!));
    });
    req.once('error', error => { if (!responded) reject(error); });
    req.setTimeout(5000, () => req.destroy(new Error('Oversize stream rejection timed out')));
    req.write('{"review":"');
    const pump = () => {
      if (responded || req.destroyed) return;
      if (!remaining) { req.end('"}'); return; }
      const size = Math.min(32768, remaining); remaining -= size;
      if (!req.write(Buffer.alloc(size, 'x'))) req.once('drain', () => setImmediate(pump));
      else setImmediate(pump);
    };
    pump();
  });
  await start();
  assert.equal(await declaredBody('/api/storage/upload-hostel-image'), 401, 'Large uploads must authorize before body parsing');
  assert.equal(await declaredBody('/api/storage/upload-hostel-image', buyer.token), 403);
  assert.equal(await declaredBody('/api/storage/upload-hostel-image', admin.token), 413);
  assert.equal(await declaredBody('/api/auth/login'), 413);
  assert.equal(await declaredBody('/api/sync/events', undefined, 'GET'), 400, 'An event-stream URL cannot bypass body admission limits');
  assert.equal(await declaredBody('/api/sync/events'), 413, 'Unsupported event-stream methods retain ordinary parsing limits');
  assert.equal(await oversizedStream('/api/auth/login', 256 * 1024), 413);
  await request('/api/auth/login', 415, {}, undefined, { 'Content-Encoding': 'gzip' });
  let nested: any = {}; for (let i = 0; i < 14; i++) nested = { nested };
  await request('/api/auth/login', 400, nested);
  assert.equal(await oversizedStream('/api/digital-market/ratings', 4 * 1024 * 1024), 413);
  const malformed = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"S23-DO-NOT-LOG"' });
  assert.equal(malformed.status, 400); await malformed.arrayBuffer(); assert(!logs.includes('S23-DO-NOT-LOG'));
  const png = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#234567' } }).png().toBuffer();
  const photograph = { fileType: 'image/png', fileData: png.toString('base64') };
  await request('/api/storage/upload-hostel-image', 200, photograph, admin.token);
  const before = await fs.readdir(path.join(uploads, 'hostels'));
  await request('/api/storage/upload-hostel-image', 429, photograph, admin.token);
  assert.deepEqual(await fs.readdir(path.join(uploads, 'hostels')), before);
  await request('/api/storage/upload-hostel-image', 200, photograph, manager.token);
  const generation = `/api/hostels/${residence.id}/generate-room-keys`;
  assert.equal((await request(generation, 200, {}, manager.token)).count, 1);
  const dbPath = path.join(dataDir, 'pinevela_store.json'), written = (await fs.stat(dbPath)).mtimeMs;
  assert.equal((await request(generation, 200, {}, manager.token)).count, 0);
  assert.equal((await fs.stat(dbPath)).mtimeMs, written, 'Idempotent key reads/generation must not rewrite the application database');
  await request(`/api/hostels/${excessiveResidence.id}/generate-room-keys`, 413, {}, manager.token);
  const activate = async (owner: any, suffix: string) => {
    const response = await fetch(base + '/api/room-keys/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: JSON.stringify({ roomKey: room.roomKey, name: `Disposable ${suffix}`, email: `${suffix}@st.knust.edu.gh`, phone: '0000000000', password: `Separate-S23-room-${suffix}!` }) });
    await response.arrayBuffer(); return response.status;
  };
  const claims = await Promise.all([activate(buyer, 'first'), activate(otherBuyer, 'second')]);
  assert.equal(claims.filter(status => status >= 200 && status < 300).length, 1);
  assert.equal(claims.filter(status => status === 409).length, 1, 'Async password work must not permit two occupants for one room');
  const persisted = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  assert.equal(persisted.users.filter((u: any) => (u.user || u).roomKey === room.roomKey).length, 1);
  const stream = async (token?: string) => {
    const controller = new AbortController(); controllers.push(controller);
    const response = await fetch(base + '/api/sync/events', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
    assert.equal(response.status, 200); const reader = response.body!.getReader(); const initial = await reader.read(); assert(Buffer.from(initial.value!).toString().includes('connected'));
    return { controller, reader };
  };
  const opened = [await stream(buyer.token), await stream(buyer.token), await stream(buyer.token)];
  await request('/api/sync/events', 429, undefined, buyer.token);
  opened[0].controller.abort(); await opened[0].reader.cancel().catch(() => {}); await new Promise(r => setTimeout(r, 50));
  const recovered = await stream(buyer.token); recovered.controller.abort();
  for (const openedStream of opened) openedStream.controller.abort();
  const publicStream = await stream(); publicStream.controller.abort();
  await request('/api/verification-teams/login', 429, { email: officer.email.split('@')[0], password: 'wrong' });
  await request('/api/auth/verification-team-login', 429, { officerId: officer.officerId, password: 'wrong' });
  await request('/api/auth/verification-team-login', 429, { usernameOrEmail: 'unrelated@example.test', email: officer.email, password: 'wrong' });
  const login = await request('/api/auth/login', 200, { usernameOrEmail: buyer.email, password: 'Disposable-user-S23!' });
  await request('/api/auth/me', 200, undefined, login.token);
  for (let i = 0; i < 19; i++) await request(i % 2 ? '/API/AUTH/LOGIN/' : '/api/auth/login', 401, { usernameOrEmail: i % 2 ? buyer.username : buyer.email, password: 'Deliberately-wrong-fixture-password' });
  await request('/api/digital-market/login', 429, { studentEmail: buyer.email, password: 'wrong' }, undefined, { 'X-Forwarded-For': '203.0.113.10' });
  await request('/api/auth/verification-team-login', 429, { email: buyer.email, password: 'wrong' });
  // Requests below are fixed invalid fixtures, not password guessing or a load test.
  for (let i = 0; i < 10; i++) await request('/api/auth/login', 401, { usernameOrEmail: `unused-${i}@example.test`, password: 'wrong' }, undefined, { 'X-Forwarded-For': `203.0.113.${i + 1}` });
  await request('/api/auth/login', 429, { usernameOrEmail: 'different@example.test', password: 'wrong' }, undefined, { 'X-Forwarded-For': '198.51.100.1' });
  await request('/api/auth/me', 200, undefined, login.token);
  const rawState = await fs.readFile(limitsFile, 'utf8');
  for (const privateValue of [buyer.email, buyer.username, buyer.token, login.token, '127.0.0.1', 'Disposable-user-S23!']) assert(!rawState.includes(privateValue));
  await stop(); await start();
  await request('/api/auth/login', 429, { usernameOrEmail: buyer.email, password: 'Disposable-user-S23!' });
  await request('/api/auth/me', 200, undefined, login.token);
  await request('/api/storage/upload-hostel-image', 429, photograph, admin.token);
  const state = JSON.parse(await fs.readFile(limitsFile, 'utf8')); for (const bucket of state) bucket.expiresAt = Date.now() - 1;
  await stop(); await fs.writeFile(limitsFile, JSON.stringify(state)); await start();
  await request('/api/auth/login', 200, { usernameOrEmail: buyer.username, password: 'Disposable-user-S23!' });
  await request('/api/verification-teams/login', 200, { email: officer.email.split('@')[0], password: 'Disposable-verification_team-S23!' });
  await request('/api/storage/upload-hostel-image', 200, photograph, admin.token);
});
