import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { test } from 'node:test';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sessionFixtureJson } from './sessionFixtures.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(root, 'node_modules/tsx/dist/loader.mjs')).href;
const run = promisify(execFile);
const stop = async (child: ChildProcess | undefined, signal: NodeJS.Signals = 'SIGTERM') => {
  if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(signal); await exited; }
};
async function finish(child: ChildProcess): Promise<{ code: number | null; output: string }> {
  let output = ''; child.stdout?.on('data', chunk => output += chunk); child.stderr?.on('data', chunk => output += chunk);
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15000);
  try { const [code] = await once(child, 'exit'); return { code, output }; }
  finally { clearTimeout(timeout); }
}

test('B09: real startup exits on malformed/unreadable data without replacing primary or last-good backup', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-b09-startup-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const data = path.join(temp, 'data'); await fs.mkdir(data);
  const file = path.join(data, 'pinevela_store.json'), backup = `${file}.bak`;
  const originalBackup = JSON.stringify({ users: [], hostels: [], ratings: [{ id: 'preserved' }] });
  await fs.writeFile(backup, originalBackup);
  const env = { ...process.env, NODE_ENV: 'test', PORT: '0', PINEVELA_DATA_DIR: data };
  const launch = () => spawn(process.execPath, ['--import', loader, path.join(root, 'server.ts')], { cwd: temp, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const bad of ['{"PRIVATE_MARKER_DO_NOT_LOG":', 'null', '{}', '{"users":{},"ratings":[]}']) {
    await fs.writeFile(file, bad);
    const result = await finish(launch());
    assert.equal(result.code, 1, result.output);
    assert(!result.output.includes('Server listening'));
    assert(!result.output.includes('PRIVATE_MARKER_DO_NOT_LOG'));
    assert.equal(await fs.readFile(file, 'utf8'), bad);
    assert.equal(await fs.readFile(backup, 'utf8'), originalBackup);
  }
  await fs.unlink(file); await fs.mkdir(file);
  const directoryFailure = await finish(launch()); assert.equal(directoryFailure.code, 1, directoryFailure.output);
  assert((await fs.stat(file)).isDirectory()); await fs.rmdir(file);
  const missing = await finish(launch()); assert.equal(missing.code, 1, missing.output);
  assert.equal(await fs.readFile(backup, 'utf8'), originalBackup);
  assert(!(await fs.readdir(data)).includes('pinevela_store.json'));
});

test('B10/B09: a second server and offline tools cannot overwrite the writer; crash releases lease and restore revokes sessions', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-b10-processes-'));
  const data = path.join(temp, 'data'); await fs.mkdir(data);
  const file = path.join(data, 'pinevela_store.json'); let owner: ChildProcess | undefined;
  t.after(async () => { await stop(owner); await fs.rm(temp, { recursive: true, force: true }); });
  const admin = { id: crypto.randomUUID(), role: 'admin', name: 'Isolated admin', email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID() };
  await fs.writeFile(file, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [admin], ratings: [{ id: 'history', nested: { kept: true } }] }));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(r => listener.close(() => r()));
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: data };
  const launch = () => spawn(process.execPath, ['--import', loader, path.join(root, 'server.ts')], { cwd: temp, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const start = async () => {
    owner = launch(); let logs = '';
    owner.stdout?.on('data', chunk => logs += chunk); owner.stderr?.on('data', chunk => logs += chunk);
    for (let attempt = 0; attempt < 150; attempt++) {
      try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
      if (owner.exitCode !== null) assert.fail(logs);
      await new Promise(r => setTimeout(r, 100));
    }
    assert.fail('Isolated writer server did not start');
  };
  const command = async (script: string, action: string, expectedCode = 0) => {
    try {
      const result = await run(process.execPath, ['--import', loader, path.join(root, 'scripts', script), action], { cwd: temp, env, timeout: 15000 });
      assert.equal(expectedCode, 0); return result.stdout + result.stderr;
    } catch (error: any) { assert.equal(error.code, expectedCode, error.stderr || error.message); return error.stdout + error.stderr; }
  };
  await start();
  const first = await fs.readFile(file), firstBackup = await fs.readFile(`${file}.bak`);
  const contender = await finish(launch()); assert.equal(contender.code, 1, contender.output); assert.match(contender.output, /already in use/);
  assert.match(await command('credential-recovery.ts', 'revoke', 1), /already in use/);
  assert.match(await command('database-recovery.ts', 'restore', 1), /already in use/);
  assert.deepEqual(await fs.readFile(file), first); assert.deepEqual(await fs.readFile(`${file}.bak`), firstBackup);
  await stop(owner, 'SIGKILL'); owner = undefined;
  await start();
  const auth = await fetch(base + '/api/auth/me', { headers: { Authorization: `Bearer ${admin.token}` } }); assert.equal(auth.status, 200); await auth.arrayBuffer();
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).ratings[0].id, 'history');
  await stop(owner); owner = undefined;
  const broken = '{"PRIVATE_MARKER_RECOVERY":'; await fs.writeFile(file, broken);
  assert.match(await command('database-recovery.ts', 'check'), /valid/);
  assert.equal(await fs.readFile(file, 'utf8'), broken);
  assert.match(await command('database-recovery.ts', 'restore'), /sessions.*revoked/i);
  assert.equal(await fs.readFile(`${file}.quarantine`, 'utf8'), broken);
  const recovered = await fs.readFile(file);
  const restored = JSON.parse(recovered.toString());
  assert.equal(restored.ratings[0].id, 'history'); assert(!restored.users[0].session);
  assert.equal((await fs.stat(`${file}.bak`)).mode & 0o777, 0o600);
  assert.match(await command('database-recovery.ts', 'restore', 1), /quarantine.*exists/i);
  assert.deepEqual(await fs.readFile(file), recovered);
  await start();
  const oldSession = await fetch(base + '/api/auth/me', { headers: { Authorization: `Bearer ${admin.token}` } }); assert.equal(oldSession.status, 401); await oldSession.arrayBuffer();
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).ratings[0].id, 'history');
});

test('B09/B10: development file serving denies operational database and recovery artifacts', { timeout: 60000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-private-backup-'));
  // Custom directory intentionally avoids the generic **/data/** exclusion.
  const data = path.join(temp, 'private-records'); await fs.mkdir(data);
  const file = path.join(data, 'pinevela_store.json'); let child: ChildProcess | undefined;
  t.after(async () => { await stop(child); await fs.rm(temp, { recursive: true, force: true }); });
  const sentinel = 'PRIVATE_BACKUP_MUST_NOT_BE_SERVED';
  await fs.writeFile(file, JSON.stringify({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [], ratings: [{ id: sentinel }] }));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(r => listener.close(() => r()));
  const base = `http://127.0.0.1:${port}`; let logs = '';
  child = spawn(process.execPath, ['--import', loader, path.join(root, 'server.ts')], { cwd: temp,
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port), PINEVELA_DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', chunk => logs += chunk); child.stderr?.on('data', chunk => logs += chunk);
  let ready = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) assert.fail(logs);
    await new Promise(r => setTimeout(r, 100));
  }
  assert(ready, logs);
  for (const artifact of [file, `${file}.bak`, `${file}.lock`]) {
    const response = await fetch(`${base}/@fs${artifact}`);
    const body = await response.text();
    assert.equal(response.status, 403, `${artifact} must be blocked by Vite`);
    assert(!body.includes(sentinel));
  }
});
