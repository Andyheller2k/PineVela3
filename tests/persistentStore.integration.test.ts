import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sessionFixtureJson } from './sessionFixtures.cjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('B01: real startup and repeated restarts preserve historical collections and new onboarding writes', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-b01-startup-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const db = path.join(dataDir, 'pinevela_store.json');
  const admin = { id: crypto.randomUUID(), role: 'admin', name: 'Isolated administrator', email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID() };
  const records = (key: string) => [1, 2].map(i => ({ id: `${key}-${i}`, email: 'shared-history@example.test',
    hostelId: 'isolated-residence', serviceId: 'isolated-service', rating: i + 2,
    details: { note: `Retained ${key} ${i}`, nested: [i, { preserved: true }] } }));
  const expected: any = Object.fromEntries(['ratings', 'staffBargains', 'digitalMarketServiceReviews', 'onboardingPayments', 'managerProfiles'].map(key => [key, records(key)]));
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1,
    users: [admin], ...expected }));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_TRUST_PROXY: '' }, stdio: 'ignore' });
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail('Isolated server exited'); await new Promise(r => setTimeout(r, 100)); }
    assert.fail('Isolated server did not start');
  };
  const request = async (method: string, route: string, token: string | undefined, body: any, expected: number | number[]) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert([expected].flat().includes(response.status), `${method} ${route}: expected ${expected}, got ${response.status}; ${result.error || ''}`); return result;
  };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const verify = async () => {
    const disk = await read();
    for (const [key, records] of Object.entries(expected)) assert.deepEqual(disk[key], records, `${key} changed across startup/persistence`);
    assert.deepEqual(await request('GET', '/api/ratings', undefined, undefined, 200), expected.ratings);
    assert.deepEqual(await request('GET', '/api/staff-bargains', admin.token, undefined, 200), expected.staffBargains);
    const reviews = await request('GET', '/api/digital-market/services/isolated-service/reviews', undefined, undefined, 200);
    assert.equal(reviews.reviewCount, 0, 'Preserving old service reviews must not publish unverified reviews');
  };
  await start(); await verify();
  const payments = '/api/hostel-verifications/pay-onboarding-fee';
  await request('POST', payments, admin.token, { agreedToPay: false }, 400);
  await verify();
  await request('POST', payments, admin.token, { agreedToPay: true, hostelId: 'isolated-residence', hostelName: 'Isolated residence', managerId: 'isolated-manager', managerName: 'Isolated manager' }, 201);
  const afterPayment = (await read()).onboardingPayments;
  assert.equal(afterPayment.length, expected.onboardingPayments.length + 1, 'A payment is inserted exactly once');
  const added = afterPayment.find((payment: any) => !expected.onboardingPayments.some((original: any) => original.id === payment.id));
  assert(added?.timestamp && added?.paidAt && added?.reference);
  assert.equal(added.amount, 50);
  expected.onboardingPayments = afterPayment;
  await verify();
  for (let restart = 0; restart < 2; restart++) { await stop(); await start(); await verify(); }
});
