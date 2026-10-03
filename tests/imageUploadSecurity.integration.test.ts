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
import sharp from 'sharp';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

test('S19: authenticated raster uploads, safe legacy serving and separate media origin hold across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-image-security-'));
  const dataDir = path.join(temp, 'data'), uploadDir = path.join(temp, 'uploads'), imageDir = path.join(uploadDir, 'hostels');
  await fs.mkdir(dataDir); await fs.mkdir(imageDir, { recursive: true });
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const admin = actor('admin'), manager = actor('manager'), primary = actor('user'), merchant = actor('merchant');
  const pending = { ...actor('manager'), isVerified: false, verificationStatus: 'pending' };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({
    credentialExposureVersion: 1, accountSecurityVersion: 1, users: [admin, manager, primary, merchant, pending],
    managerVerifications: [{ id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, status: 'approved' }]
  }));
  const jpeg = await sharp({ create: { width: 13, height: 11, channels: 3, background: '#1255cc' } }).jpeg().toBuffer();
  const png = await sharp(jpeg).png().toBuffer();
  const marker = Buffer.from('<html>benign untrusted document bytes</html>');
  await fs.writeFile(path.join(imageDir, 'legacy.jpg'), Buffer.concat([jpeg, marker]));
  await fs.writeFile(path.join(imageDir, 'document.html'), marker);
  await fs.writeFile(path.join(imageDir, 'document.png'), marker);
  await fs.writeFile(path.join(imageDir, 'vector.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>benign</text></svg>');
  await fs.writeFile(path.join(temp, 'outside.png'), png);
  await fs.symlink(path.join(temp, 'outside.png'), path.join(imageDir, 'escape.png'));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`, media = `http://127.0.0.2:${port}`;
  let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async (separateOrigin = false, development = false) => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], {
      cwd: development ? project : temp, env: { ...process.env, NODE_ENV: development ? 'development' : 'test', DISABLE_HMR: 'true', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: uploadDir, PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_MEDIA_ORIGIN: separateOrigin ? media : '' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', data => logs += data); child.stderr?.on('data', data => logs += data);
    for (let i = 0; i < 200; i++) {
      try { const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }); await health.arrayBuffer(); if (health.ok) return; } catch {}
      if (child.exitCode !== null) assert.fail(`Server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Server did not start: ${logs}`);
  };
  const upload = async (body: any, token: string | undefined, status: number) => {
    const response = await fetch(`${base}/api/storage/upload-hostel-image`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await response.json(); assert.equal(response.status, status, data.error || 'Unexpected upload status'); return data;
  };
  const image = async (url: string, status: number) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(response.status, status);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert(response.headers.get('content-security-policy')?.includes('sandbox'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (status === 200) {
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal((await sharp(bytes).metadata()).format, 'png'); assert(!bytes.includes(marker));
      assert(!response.headers.get('set-cookie')); assert(!response.headers.get('access-control-allow-origin'));
    }
  };
  await start();
  const body = { fileName: '../../document.html', fileType: 'image/png', fileData: `data:image/png;base64,${png.toString('base64')}` };
  await upload(body, undefined, 401); await upload(body, primary.token, 403); await upload(body, merchant.token, 403); await upload(body, pending.token, 403);
  const before = await fs.readdir(imageDir);
  await upload({ ...body, fileData: marker.toString('base64') }, admin.token, 415);
  await upload({ ...body, fileType: undefined }, admin.token, 415);
  await upload({ ...body, fileType: 'image/svg+xml', fileData: '<svg></svg>' }, admin.token, 415);
  await upload({ ...body, fileData: png.subarray(0, 8).toString('base64') }, admin.token, 400);
  assert.deepEqual(await fs.readdir(imageDir), before, 'Rejected uploads must not create files');
  const created = await upload(body, admin.token, 200);
  assert.match(created.imageUrl, /^\/uploads\/hostels\/[a-f0-9-]{36}\.png$/);
  const stored = await fs.readFile(path.join(temp, created.imagePath)); assert.equal((await sharp(stored).metadata()).format, 'png');
  await upload({ ...body, fileName: 'wrong.png', fileType: 'image/jpeg', fileData: jpeg.toString('base64') }, manager.token, 200);
  await image(base + created.imageUrl, 200); await image(base + '/uploads/hostels/legacy.jpg', 200);
  for (const name of ['document.html', 'document.png', 'vector.svg', 'escape.png', 'missing.png']) await image(base + '/uploads/hostels/' + name, 404);
  await image(base + '/uploads/hostels', 404);
  assert((await fs.readFile(path.join(imageDir, 'legacy.jpg'))).includes(marker), 'Historical files remain preserved privately');
  await stop(); await start(); await image(base + created.imageUrl, 200);
  await stop(); await start(true);
  const redirected = await fetch(base + created.imageUrl, { redirect: 'manual' }); await redirected.arrayBuffer();
  assert.equal(redirected.status, 307); assert.equal(redirected.headers.get('location'), media + created.imageUrl);
  await image(media + created.imageUrl, 200);
  const separateUpload = await upload(body, manager.token, 200); assert(separateUpload.imageUrl.startsWith(media + '/uploads/hostels/'));
  await image(separateUpload.imageUrl, 200);
  const isolatedApi = await fetch(media + '/api/health'); await isolatedApi.arrayBuffer(); assert.equal(isolatedApi.status, 404, 'Media host does not serve API routes');
  await stop(); await start(false, true);
  await image(base + created.imageUrl, 200);
  for (const name of ['document.html', path.basename(created.imageUrl)]) {
    const raw = await fetch(`${base}/@fs${path.join(imageDir, name)}`);
    const bytes = Buffer.from(await raw.arrayBuffer());
    assert.equal(raw.status, 403, 'Development raw-file URLs must not bypass the protected upload router');
    assert(!bytes.includes(marker), 'Raw-file denial must not return original document bytes');
  }
});
