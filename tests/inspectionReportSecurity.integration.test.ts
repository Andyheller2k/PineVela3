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

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

// Real HTTP/session checks and storage, confined to a disposable private database.
test('S04: forged reports are denied and assigned active officers submit attributed reports across restarts', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s04-'));
  const dataDir = path.join(temp, 'data');
  const db = path.join(dataDir, 'pinevela_store.json');
  let child: ChildProcess | undefined;
  const stop = async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    child = undefined;
  };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const officer = (status = 'active') => ({ id: crypto.randomUUID(), officerId: crypto.randomUUID(), fullName: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.test`, role: 'verification_team', token: crypto.randomUUID(), status });
  const assigned = officer();
  const other = { ...officer(), fullName: assigned.fullName };
  const inactive = officer('inactive');
  const stale = officer();
  const staleSession = { ...stale, token: crypto.randomUUID() };
  const impersonator = { ...officer(), role: 'user' };
  const admin = { ...officer(), role: 'admin' };
  const manager = { ...officer(), role: 'manager' };
  const email = `${crypto.randomUUID()}@example.test`;
  const verification = { id: crypto.randomUUID(), managerId: crypto.randomUUID(), managerName: crypto.randomUUID(), managerEmail: email, hostelName: crypto.randomUUID(), assignedOfficerId: assigned.id, inspectionStatus: 'dispatched', status: 'pending' };
  const unrelated = { ...verification, id: crypto.randomUUID(), managerId: crypto.randomUUID(), assignedOfficerId: other.id };
  const legacy = { ...verification, id: crypto.randomUUID(), managerEmail: `${crypto.randomUUID()}@example.test`, assignedOfficerId: assigned.officerId };
  const unassigned = { ...verification, id: crypto.randomUUID(), assignedOfficerId: undefined, inspectionStatus: 'pending_dispatch' };
  const inspection = { id: crypto.randomUUID(), managerVerificationId: verification.id, managerEmail: email, managerName: verification.managerName, hostelName: verification.hostelName, assignedOfficerId: assigned.id, assignedOfficerName: crypto.randomUUID(), assignedOfficerEmail: other.email, status: 'dispatched', report: null };
  const request = { id: crypto.randomUUID(), managerId: verification.managerId, managerEmail: email };
  const foreignRequest = { id: crypto.randomUUID(), managerId: unrelated.managerId, managerEmail: email };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({
    credentialExposureVersion: 1, accountSecurityVersion: 1,
    users: [staleSession, impersonator, admin, manager],
    verificationTeams: [assigned, other, inactive, stale],
    verificationInspections: [inspection], managerVerifications: [verification, unrelated, legacy, unassigned],
    managerRegistrationRequests: [request, foreignRequest], verificationAuditLogs: [], notifications: []
  }), { mode: 0o600 });
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], {
      cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', data => { logs += data; });
    child.stderr?.on('data', data => { logs += data; });
    for (let attempt = 0; attempt < 150; attempt++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Starting. */ }
      if (child.exitCode !== null) assert.fail(`Test server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Test server failed to start: ${logs}`);
  };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const relevant = (data: any) => ({ inspections: data.verificationInspections, verifications: data.managerVerifications, requests: data.managerRegistrationRequests, officers: data.verificationTeams, audit: data.verificationAuditLogs, notifications: data.notifications });
  const body = { observations: crypto.randomUUID(), recommendation: 'recommend_rejection', gpsCoordinates: { lat: 6.67, lng: -1.57 }, checklist: { residenceExists: true }, propertyDetails: { estimatedRooms: 20 }, photos: [] };
  const submit = async (actor: { token: string } | undefined, id: string, status: number, payload: any = body) => {
    const response = await fetch(`${base}/api/verification-team/inspections/${id}/submit-report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  };
  await start();
  const before = relevant(await read());
  // Authorized admin display merging must not rewrite stored assignments or create reports.
  assert.equal((await fetch(`${base}/api/verification-inspections`, { headers: { Authorization: `Bearer ${admin.token}` } })).status, 200);
  for (const id of [inspection.id, verification.id, `insp-${verification.id}`]) {
    await submit(undefined, id, 401);
    await submit({ token: crypto.randomUUID() }, id, 401);
    for (const actor of [other, inactive, staleSession, impersonator, admin, manager]) await submit(actor, id, 403);
    assert.deepEqual(relevant(await read()), before);
  }
  await submit(assigned, unassigned.id, 403);
  await submit(assigned, unrelated.id, 403);
  await submit(assigned, crypto.randomUUID(), 404);
  for (const payload of [{ ...body, observations: {} }, { ...body, observations: '' }, { ...body, recommendation: 'approved' }, { ...body, checklist: { residenceExists: 'true' } }, { ...body, gpsCoordinates: { lat: 91, lng: 0 } }, { ...body, photos: [{}] }]) await submit(assigned, inspection.id, 400, payload);
  assert.deepEqual(relevant(await read()), before);
  const spoof = { ...body, officerId: other.id, officerName: crypto.randomUUID(), inspectorSignature: crypto.randomUUID(), timestamp: '1970-01-01', submittedAt: '1970-01-01', assignedOfficerId: other.id, status: 'approved' };
  const submitted = await submit(assigned, inspection.id, 200, spoof);
  assert.equal(submitted.report.officerId, assigned.id);
  assert.equal(submitted.report.officerName, assigned.fullName);
  assert.equal(submitted.report.officerCode, assigned.officerId);
  assert.equal(submitted.report.inspectorSignature, `${assigned.fullName} (${assigned.officerId})`);
  assert.notEqual(submitted.report.timestamp, spoof.timestamp);
  assert.equal(submitted.inspection.assignedOfficerId, assigned.id);
  assert.equal(submitted.inspection.status, 'report_submitted');
  const disk = await read();
  assert.deepEqual(disk.verificationInspections.find((entry: any) => entry.id === inspection.id).report, submitted.report);
  assert.deepEqual(disk.managerVerifications.find((entry: any) => entry.id === verification.id).inspectionReport, submitted.report);
  assert.deepEqual(disk.managerVerifications.find((entry: any) => entry.id === unrelated.id), before.verifications.find((entry: any) => entry.id === unrelated.id));
  assert.deepEqual(disk.managerRegistrationRequests.find((entry: any) => entry.id === foreignRequest.id), before.requests.find((entry: any) => entry.id === foreignRequest.id));
  assert.deepEqual(disk.managerRegistrationRequests.find((entry: any) => entry.id === request.id).inspectionReport, submitted.report);
  assert.equal(disk.verificationAuditLogs[0].performedById, assigned.id);
  assert.equal(disk.verificationAuditLogs[0].performedBy, assigned.fullName);
  assert.equal(disk.notifications[0].userId, admin.id);
  // Route aliases and genuinely dispatched legacy records remain usable.
  await submit(assigned, verification.id, 200);
  await submit(assigned, `insp-${verification.id}`, 200);
  await submit(assigned, legacy.id, 200);
  const persisted = relevant(await read());
  await stop(); await start();
  assert.deepEqual(relevant(await read()), persisted);
  await submit(other, inspection.id, 403);
  await submit(undefined, inspection.id, 401);
  assert.deepEqual(relevant(await read()), persisted);
  // Suspension permanently revokes the copied bearer token, including after restart.
  const suspended = await fetch(`${base}/api/verification-teams/${assigned.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ status: 'suspended' }) });
  assert.equal(suspended.status, 200);
  const blocked = relevant(await read());
  await submit(assigned, inspection.id, 401);
  assert.deepEqual(relevant(await read()), blocked);
  await stop(); await start();
  await submit(assigned, inspection.id, 401);
  assert.deepEqual(relevant(await read()), blocked);
});
