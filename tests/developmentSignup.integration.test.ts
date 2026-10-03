import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;
test('temporary codes activate and log in locally across restarts, but cannot authorize in production', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-dev-signup-'));
  const dataDir = path.join(temp, 'data'); const db = path.join(dataDir, 'pinevela_store.json');
  let child: ChildProcess | undefined;
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async (mode: 'development' | 'production') => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: mode, PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_DEV_SIGNUP_CODES: 'true', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', data => logs += data); child.stderr?.on('data', data => logs += data);
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Starting */ }
      if (child.exitCode !== null) assert.fail(`Server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Server failed to start: ${logs}`);
  };
  const request = async (route: string, body: any, status: number, headers: Record<string, string> = {}) => {
    const { statusCode, data } = await new Promise<{ statusCode: number; data: any }>((resolve, reject) => {
      const call = http.request(`${base}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, response => {
        let raw = ''; response.setEncoding('utf8'); response.on('data', chunk => raw += chunk);
        response.on('end', () => { try { resolve({ statusCode: response.statusCode!, data: JSON.parse(raw) }); } catch (error) { reject(error); } });
      });
      call.on('error', reject); if (body !== undefined) call.write(JSON.stringify(body)); call.end();
    });
    assert.equal(statusCode, status, data.error || route); return data;
  };
  await start('development');
  const password = 'Isolated-development-only!';
  for (const headers of [{ 'x-forwarded-for': '127.0.0.1' }, { host: 'external.example.test' }]) {
    const blocked = await request('/api/auth/register-unified', { name: 'Development Security Test', email: 'blocked@example.test', password }, 503, headers);
    assert(!blocked.developmentCode);
  }
  const tokens: string[] = [];
  for (const [index, route] of ['/api/auth/register-unified', '/api/users/register'].entries()) {
    const email = `development-${index}@example.test`;
    const signup = await request(route, { name: 'Development Security Test', email, password, role: 'user' }, 200);
    assert.match(signup.developmentCode, /^\d{6}$/); assert(!signup.token && !signup.user);
    const before = JSON.parse(await fs.readFile(db, 'utf8'));
    assert(!JSON.stringify(before).includes(`"${signup.developmentCode}"`));
    const verification = { email, password, code: signup.developmentCode, signupId: signup.signupId };
    await request('/api/auth/verify-unified', { ...verification, password: 'Wrong-password!' }, 400);
    const wrong = signup.developmentCode === '000000' ? '000001' : '000000';
    await request('/api/auth/verify-unified', { ...verification, code: wrong }, 400);
    await stop(); await start('development');
    const activated = await request('/api/auth/verify-unified', verification, 201);
    assert.equal(activated.user.isVerified, false); assert.equal(activated.user.emailVerificationProvider, 'development');
    assert.equal(activated.user.role, 'user'); assert(activated.user.developmentOnly && !activated.user.supabaseUserId);
    await request('/api/auth/verify-unified', verification, 409);
    const login = await request('/api/auth/login', { usernameOrEmail: email, password }, 200);
    tokens.push((login.user || login).token);
    await request('/api/auth/me', undefined, 200, { Authorization: `Bearer ${tokens[index]}` });
  }
  await stop(); await start('production');
  for (const [index, token] of tokens.entries()) {
    await request('/api/auth/me', undefined, 401, { Authorization: `Bearer ${token}` });
    await request('/api/auth/login', { usernameOrEmail: `development-${index}@example.test`, password }, 401);
  }
  for (const route of ['/api/auth/register-unified', '/api/users/register']) {
    const blocked = await request(route, { name: 'Production Test', email: 'production@example.test', password, role: 'user' }, 503);
    assert(!blocked.developmentCode);
  }
});
