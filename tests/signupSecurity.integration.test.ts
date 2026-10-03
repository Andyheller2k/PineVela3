import { sessionFixtureJson } from './sessionFixtures.cjs';
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
import { hashCredential } from '../accountSecurity.js';
import { SignupGuard, type SignupState } from '../signupSecurity.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

test('S05: both public signup paths fail closed; no account/session/code leaks and restart preserves attempt limits', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-signup-'));
  const dataDir = path.join(temp, 'data'); const db = path.join(dataDir, 'pinevela_store.json');
  const input = { name: crypto.randomUUID(), email: 'security@example.test', password: 'Isolated-signup-only!' };
  const state: SignupState = { pending: [], limits: [] };
  const guard = new SignupGuard(state, () => {});
  const pending = guard.remember(input, crypto.randomUUID(), 'https://project.supabase.co');
  const existing = { id: crypto.randomUUID(), role: 'user', email: 'existing@example.test', name: 'Security Test', password: hashCredential('Existing-security-only!') };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [existing], signupVerification: state, platformSettings: { registrationFee: 0, commission: 0, announcement: '', maintenanceMode: false } }));
  let child: ChildProcess | undefined; let logs = '';
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    logs = '';
    // No provider emulation: explicitly exercise missing configuration, without outbound email.
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', data => logs += data); child.stderr?.on('data', data => logs += data);
    for (let attempt = 0; attempt < 150; attempt++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Starting */ }
      if (child.exitCode !== null) assert.fail(`Server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Server failed to start: ${logs}`);
  };
  const request = async (route: string, body: any, status: number) => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data));
    assert(!data.code && !data.token && !data.user && !response.headers.get('set-cookie'));
  };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  await start();
  for (const route of ['/api/auth/register-unified', '/api/users/register']) {
    await request(route, { ...input, role: 'user' }, 503);
    await request(route, { ...input, role: 'user', email: 'invalid' }, 400);
    await request(route, { ...input, role: 'user', email: existing.email }, 409);
  }
  await request('/api/users/register', { ...input, role: 'admin' }, 400);
  const verify = { email: input.email, password: input.password, signupId: pending.id, code: '123456' };
  // Correct local inputs still cannot activate without real Supabase confirmation.
  await request('/api/auth/verify-unified', verify, 503);
  await request('/api/auth/verify-unified', { ...verify, password: 'Wrong-password!' }, 400);
  await request('/api/auth/verify-unified', { ...verify, signupId: crypto.randomUUID() }, 400);
  await request('/api/auth/verify-unified', { ...verify, code: 'ABCDEF' }, 400);
  await stop(); await start();
  await request('/api/auth/verify-unified', { ...verify, code: '654321' }, 503);
  await request('/api/auth/verify-unified', verify, 429);
  const disk = await read(); assert.equal(disk.users.length, 1); assert.equal(disk.users[0].id, existing.id);
  assert(!JSON.stringify(disk).includes(input.password));
  assert(!logs.includes('123456') && !logs.includes(input.password));
});
