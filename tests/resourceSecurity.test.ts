import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';
import { AttemptBudgets, credentialContext, credentialWork, createResourceProtection, EventConnections, ResourceLimitError, trustedProxyAddresses, WorkPool } from '../resourceSecurity.js';
import { hashCredential, hashCredentialAsync, verifyCredential, verifyCredentialAsync, passwordIsReusedAsync } from '../accountSecurity.js';
import { createImageStorage } from '../imageUploadSecurity.js';

test('S23: shared actor/IP budgets are atomic, expire, persist across restart and fail closed on corrupt state', async t => {
  let now = 1000;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-budget-unit-')); t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'limits.json');
  const budgets = new AttemptBudgets(() => now, 3, file); await budgets.load();
  const actor = { scope: 'actor', identity: 'fixture-actor', maximum: 2, windowMs: 1000 };
  const ip = { scope: 'ip', identity: '127.0.0.1', maximum: 1, windowMs: 1000 };
  budgets.reserve([actor, ip]); await budgets.persist();
  assert.throws(() => budgets.reserve([actor, ip]), ResourceLimitError);
  budgets.reserve([actor]); // Failed multi-budget reservation did not consume the actor slot.
  await budgets.persist();
  const restored = new AttemptBudgets(() => now, 3, file); await restored.load();
  assert.throws(() => restored.reserve([actor]), ResourceLimitError);
  const raw = await fs.readFile(file, 'utf8'); assert(!raw.includes(actor.identity)); assert(!raw.includes(ip.identity));
  now += 1001; restored.reserve([actor, ip]);
  restored.reserve([{ ...actor, identity: 'different' }]);
  assert.throws(() => restored.reserve([{ ...actor, identity: 'overflow' }]), ResourceLimitError);
  await fs.writeFile(file, '{}'); await assert.rejects(new AttemptBudgets(() => now, 3, file).load());
});

test('S23: work queues are bounded, recover after completion/error, and credential contexts deduplicate and cap work', async () => {
  const pool = new WorkPool(1, 1); let release!: () => void;
  const first = pool.run(() => new Promise<number>(resolve => release = () => resolve(1)));
  const second = pool.run(async () => 2);
  await assert.rejects(pool.run(async () => 3), ResourceLimitError);
  release(); assert.equal(await first, 1); assert.equal(await second, 2);
  await assert.rejects(pool.run(async () => { throw new Error('Expected fixture failure'); }));
  assert.equal(await pool.run(async () => 4), 4);
  credentialContext(() => {
    let executions = 0;
    for (let i = 0; i < 100; i++) assert.equal(credentialWork('same', () => ++executions), 1);
    for (let i = 0; i < 15; i++) credentialWork(String(i), () => 1);
    assert.throws(() => credentialWork('overflow', () => 1), ResourceLimitError);
  });
});

test('S23: async credentials preserve hash compatibility, password reuse and event-loop progress', async () => {
  const password = 'Disposable-S23-password!';
  let finished = false;
  const pending = hashCredentialAsync(password).then(hash => { finished = true; return hash; });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(finished, false, 'The event loop can progress while derivation is in flight');
  const hash = await pending;
  assert(verifyCredential(password, hash)); assert(await verifyCredentialAsync(password, hashCredential(password)));
  assert.equal(await verifyCredentialAsync('wrong', hash), false);
  assert(await passwordIsReusedAsync(password, [{ id: 'fixture-id', email: 'fixture@example.test', password: hash }], 'fixture@example.test'));
  await new Promise<void>((resolve, reject) => credentialContext(() => {
    Promise.all(Array.from({ length: 100 }, () => verifyCredentialAsync(password, hash))).then(values => { assert(values.every(Boolean)); resolve(); }, reject);
  }));
});

class StreamResponse extends EventEmitter {
  writableLength = 0; destroyed = false; headers: any; chunks: string[] = [];
  set(headers: any) { this.headers = headers; return this; }
  flushHeaders() {}
  write(chunk: string) { this.chunks.push(chunk); return true; }
  end() { this.destroyed = true; this.emit('close'); }
  destroy() { this.end(); }
}
class AdmissionResponse extends StreamResponse {
  statusCode = 200;
  status(code: number) { this.statusCode = code; return this; }
  json(_body: any) { this.emit('finish'); this.end(); return this; }
}
test('S23: in-flight IP/actor/global and credential limits reject excess requests and release capacity', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-admission-unit-')); t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const resources = await createResourceProtection({ dataDir: temp, actor: (req: any) => req.fixtureActor || '', loginIdentity: () => '' });
  const responses: AdmissionResponse[] = [];
  const admit = (ip: string, actor = '', route = '/api/health', method = 'GET') => {
    const res = new AdmissionResponse(); responses.push(res);
    let admitted = false;
    const req = { path: route, method, headers: {}, ip, fixtureActor: actor, socket: { remoteAddress: ip } };
    resources.beforeBody(req as any, res as any, error => { assert(!error); admitted = true; });
    return { res, admitted };
  };
  const close = () => responses.splice(0).forEach(res => res.end()); t.after(close);
  for (let i = 0; i < 12; i++) assert(admit('one-ip').admitted);
  assert.equal(admit('one-ip').res.statusCode, 503);
  assert(admit('different-ip').admitted); close(); assert(admit('one-ip').admitted); close();
  for (let i = 0; i < 16; i++) assert(admit(`ip-${i}`, 'same-actor').admitted);
  assert.equal(admit('new-ip', 'same-actor').res.statusCode, 503); close();
  for (let i = 0; i < 32; i++) assert(admit(`unique-ip-${i}`).admitted);
  assert.equal(admit('global-overflow').res.statusCode, 503); close();
  assert(admit('login-ip', '', '/api/auth/login', 'POST').admitted);
  assert(admit('login-ip', '', '/api/auth/login', 'POST').admitted);
  assert.equal(admit('login-ip', '', '/api/auth/login', 'POST').res.statusCode, 503);
  assert(admit('other-login-ip', '', '/api/auth/login', 'POST').admitted);
  assert(admit('third-login-ip', '', '/api/auth/login', 'POST').admitted);
  assert.equal(admit('fourth-login-ip', '', '/api/auth/login', 'POST').res.statusCode, 503); close();
  assert(admit('login-ip', '', '/api/auth/login', 'POST').admitted); close();
});
const streamRequest = (ip: string): any => Object.assign(new EventEmitter(), { ip, socket: { remoteAddress: ip } });
test('S23: SSE actor/IP/global caps release on disconnect, backpressure and expiry', async () => {
  const streams = new EventConnections(3, 2, 1, 30);
  const first = new StreamResponse(), second = new StreamResponse(), third = new StreamResponse();
  streams.add(streamRequest('ip-a'), first as any, 'actor-a');
  assert.throws(() => streams.add(streamRequest('ip-b'), new StreamResponse() as any, 'actor-a'), ResourceLimitError);
  streams.add(streamRequest('ip-a'), second as any, 'actor-b');
  assert.throws(() => streams.add(streamRequest('ip-a'), new StreamResponse() as any, ''), ResourceLimitError);
  streams.add(streamRequest('ip-b'), third as any, 'actor-c');
  assert.throws(() => streams.add(streamRequest('ip-c'), new StreamResponse() as any, ''), ResourceLimitError);
  first.writableLength = 70000; streams.broadcast('{"entity":"hostels"}'); assert(first.destroyed);
  const replacement = new StreamResponse(); const req = streamRequest('ip-c'); streams.add(req, replacement as any, 'actor-a');
  req.emit('close'); assert(replacement.destroyed);
  await new Promise(resolve => setTimeout(resolve, 50)); assert(second.destroyed && third.destroyed);
  const fresh = new StreamResponse(); streams.add(streamRequest('ip-a'), fresh as any, 'actor-a'); fresh.end();
});

test('S23: upload capacity counts legacy files and atomically rejects concurrent overspending without deleting originals', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-quota-unit-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'hostels')); await fs.writeFile(path.join(root, 'hostels', 'legacy.txt'), 'preserve original');
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } }).png().toBuffer();
  const storage = createImageStorage({ root, capacityBytes: 4096, capacityFiles: 2 });
  const body = { fileType: 'image/png', fileData: png.toString('base64') };
  const results = await Promise.allSettled([storage.save(body), storage.save(body)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason instanceof ResourceLimitError).length, 1);
  assert.equal(await fs.readFile(path.join(root, 'hostels', 'legacy.txt'), 'utf8'), 'preserve original');
  const restored = createImageStorage({ root, capacityBytes: 4096, capacityFiles: 2 });
  await assert.rejects(restored.save(body), ResourceLimitError);
  await assert.rejects(createImageStorage({ root, capacityBytes: 1 }).save(body), ResourceLimitError);
});

test('S23: forwarding headers are trusted only behind explicitly configured proxy addresses', () => {
  assert.equal(trustedProxyAddresses(''), false);
  assert.deepEqual(trustedProxyAddresses('127.0.0.1,10.0.0.0/8,::1'), ['127.0.0.1', '10.0.0.0/8', '::1']);
  for (const value of ['true', '1', 'loopback', '10.0.0.0/99', '0.0.0.0/0', '::/0', 'https://proxy.example.test']) assert.throws(() => trustedProxyAddresses(value));
});
