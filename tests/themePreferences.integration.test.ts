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
test('personal appearance enforces identity, input validation and restart persistence', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-appearance-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, name: 'Isolated appearance test', email: 'appearance@example.test', token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const first = actor('user'), second = actor('user'), manager = { ...actor('manager'), isVerified: false, verificationStatus: 'pending' };
  const officer = { ...actor('verification_team'), fullName: 'Isolated officer', status: 'active' };
  const market = { id: crypto.randomUUID(), studentEmail: first.email, userId: first.id, status: 'active', token: crypto.randomUUID(), storeName: 'Isolated appearance store' };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1,
    users: [first, second, manager], hostels: [], verificationTeams: [officer], digitalMarketStores: [market],
    digitalMarketApplications: [{ id: crypto.randomUUID(), studentEmail: first.email, status: 'approved' }],
  }));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], {
      cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_TRUST_PROXY: '', PAYSTACK_SECRET_KEY: '' }, stdio: 'ignore',
    });
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail('Isolated server exited'); await new Promise(r => setTimeout(r, 100)); }
    assert.fail('Isolated server did not start');
  };
  const request = async (token: string | undefined, body?: unknown, expected = 200) => {
    const response = await fetch(base + '/api/auth/appearance', { method: body === undefined ? 'GET' : 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); assert.equal(response.status, expected, data.error); return data;
  };
  await start();
  await request(undefined, undefined, 401); await request(undefined, { theme: 'dark' }, 401);
  await request('invalid', undefined, 401);
  assert.equal((await request(first.token)).theme, null);
  for (const body of [{}, { theme: 'blue' }, { theme: 1 }, { theme: null }, { theme: 'dark', userId: second.id }, { theme: 'dark', role: 'admin' }]) await request(first.token, body, 400);
  await request(first.token, { theme: 'dark' });
  assert.equal((await request(second.token)).theme, null, 'Same email does not share preference');
  await request(second.token, { theme: 'light' });
  await request(manager.token, { theme: 'light' });
  await request(officer.token, { theme: 'dark' });
  await request(market.token, { theme: 'light' });
  assert.equal((await request(first.token)).theme, 'dark', 'Seller does not change primary user');
  const disk = JSON.parse(await fs.readFile(path.join(dataDir, 'pinevela_store.json'), 'utf8'));
  assert.equal(disk.users.find((entry: any) => entry.id === first.id).appearanceTheme, 'dark');
  assert.equal(disk.digitalMarketStores[0].appearanceTheme, 'light');
  await stop(); await start();
  for (const [token, theme] of [[first.token, 'dark'], [second.token, 'light'], [manager.token, 'light'], [officer.token, 'dark'], [market.token, 'light']]) assert.equal((await request(token)).theme, theme);
});
