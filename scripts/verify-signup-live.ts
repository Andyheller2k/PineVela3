// Manual live integration check: real Supabase project + an inbox owned by the operator.
// Never prints passwords, email codes, local tokens or Supabase sessions.
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

const emailIndex = process.argv.indexOf('--email');
const email = process.argv[emailIndex + 1];
if (emailIndex < 0 || !email || !email.includes('@')) throw new Error('Provide --email with a real inbox you own and authorize for this test.');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-signup-live-'));
const dataDir = path.join(temp, 'data'); const db = path.join(dataDir, 'pinevela_store.json');
const password = crypto.randomBytes(32).toString('base64url');
const pendingIndex = process.argv.indexOf('--pending-db');
const pendingDb = pendingIndex >= 0 ? process.argv[pendingIndex + 1] : undefined;
if (pendingDb) { await fs.mkdir(dataDir, { mode: 0o700 }); await fs.copyFile(pendingDb, db); await fs.chmod(db, 0o600); }
let child: ChildProcess | undefined;
const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
const start = async () => {
  child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Starting */ }
    if (child.exitCode !== null) throw new Error('Live test server exited.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Live test server failed to start.');
};
const request = async (route: string, body: any, status: number) => {
  const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  // Only error messages, not full auth payloads, may be displayed on failure.
  assert.equal(response.status, status, `${route}: ${data.error || 'Unexpected response'}`);
  return { response, data };
};
async function readInboxCode(): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Run the live test in an interactive terminal.');
  process.stdout.write('Email code or confirmation link (hidden): ');
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let code = '';
    const onData = (data: Buffer) => {
      for (const character of data.toString()) {
        if (character === '\u0003') { done(); reject(new Error('Live test cancelled.')); return; }
        if (character === '\r' || character === '\n') { done(); resolve(code); return; }
        if (character === '\u007f') code = code.slice(0, -1);
        else if (character >= ' ' && code.length < 4096) code += character;
      }
    };
    const done = () => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    process.stdin.on('data', onData);
  });
}
if (!process.stdin.isTTY) throw new Error('Run the live test in an interactive terminal.');
try {
  await start();
  let signupId: string;
  let initialHash: string;
  if (pendingDb) {
    const initial = JSON.parse(await fs.readFile(db, 'utf8'));
    const pending = initial.signupVerification?.pending?.find((entry: any) => entry.email === email);
    assert(pending && pending.expiresAt > Date.now(), 'The isolated pending signup has expired. Start a fresh live signup.');
    assert.equal(initial.users.length, 0); signupId = pending.id; initialHash = pending.passwordHash;
    console.log('Resuming the real pending signup; no additional email sent.');
  } else {
    const signup = await request('/api/users/register', { name: 'PineVela signup verification', email, password, role: 'user' }, 200);
    assert(signup.data.signupId && !signup.data.code && !signup.data.token && !signup.data.user);
    assert(!signup.response.headers.get('set-cookie')); signupId = signup.data.signupId;
    const initial = JSON.parse(await fs.readFile(db, 'utf8')); assert.equal(initial.users.length, 0);
    assert(!JSON.stringify(initial).includes(password)); initialHash = initial.signupVerification.pending[0].passwordHash;
    console.log('Supabase accepted the signup request. No PineVela account or session exists yet.');
    await request('/api/auth/register-unified', { name: 'PineVela signup verification', email, password }, 429);
    await request('/api/auth/verify-unified', { email, password: crypto.randomUUID(), signupId, code: '000000' }, 400);
  }
  await stop(); await start();
  console.log('Pending signup persisted across restart. Copy the code or link without opening the link.');
  const code = await readInboxCode();
  assert(code, 'Provide the email code or link.');
  const verified = await request('/api/auth/verify-unified', { email, password, signupId, code }, 201);
  assert.equal(verified.data.user.email, email);
  assert.equal(verified.data.user.role, 'user');
  assert.equal(verified.data.user.emailVerificationProvider, 'supabase');
  assert(verified.data.user.supabaseUserId && verified.data.user.emailVerifiedAt);
  assert(verified.response.headers.get('set-cookie')?.includes('HttpOnly'));
  const final = JSON.parse(await fs.readFile(db, 'utf8'));
  assert.equal(final.users.length, 1); assert.equal(final.signupVerification.pending.length, 0);
  assert(!JSON.stringify(final).includes(password));
  assert.match(final.users[0].password, /^scrypt-sha256\$/);
  assert.equal(final.users[0].password, initialHash);
  await request('/api/auth/verify-unified', { email, password, signupId, code }, pendingDb ? 400 : 409);
  for (const route of ['/api/users/register', '/api/auth/register-unified']) await request(route, { name: 'PineVela signup verification', email, password, role: 'user' }, 409);
  await stop(); await start();
  const meResponse = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${verified.data.token}` } });
  const me = await meResponse.json(); assert.equal(meResponse.status, 200);
  assert.equal((me.user || me).supabaseUserId, verified.data.user.supabaseUserId);
  if (!pendingDb) {
    const login = await request('/api/auth/login', { usernameOrEmail: email, password }, 200);
    assert.equal((login.data.user || login.data).role, 'user');
  }
  console.log('PASS: real Supabase inbox confirmation, alias policy, replay rejection, original password hash and authenticated session after restart.');
  console.log('Only the disposable local database was removed. The real confirmed Supabase Auth identity remains in your project.');
} finally { await stop(); await fs.rm(temp, { recursive: true, force: true }); }
