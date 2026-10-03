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
import { hashCredential } from '../accountSecurity.js';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

test('S10 retirement and S12 maintenance actors, states, sign-off and replay isolation persist across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s12-'));
  const dataDir = path.join(temp, 'data'); const db = path.join(dataDir, 'pinevela_store.json');
  let child: ChildProcess | undefined;
  const stop = async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    child = undefined;
  };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, email: `${crypto.randomUUID()}@example.test`, name: crypto.randomUUID(), token: crypto.randomUUID() });
  const admin = actor('admin'), primary = actor('user');
  const manager = { ...actor('manager'), isVerified: true, verificationStatus: 'approved' }, foreignManager = { ...actor('manager'), email: manager.email, isVerified: true, verificationStatus: 'approved' };
  const hostel = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, name: crypto.randomUUID(), isApproved: true };
  const foreignHostel = { ...hostel, id: crypto.randomUUID(), managerId: foreignManager.id, name: hostel.name };
  const resident = (hostelId: string) => ({ ...actor('student'), roomKey: crypto.randomUUID(), hostelId });
  const owner = resident(hostel.id), other = { ...resident(hostel.id), email: owner.email }, foreignResident = resident(foreignHostel.id);
  const rooms = [owner, other, foreignResident].map(u => ({ id: crypto.randomUUID(), roomKey: u.roomKey, hostelId: u.hostelId, isAssigned: true, assignedStudentId: u.id, assignedStudentEmail: u.email }));
  const assigned = actor('staff'), colleague = actor('staff'), foreignStaff = actor('staff');
  const roster = (user: any, property: any) => ({ id: crypto.randomUUID(), userId: user.id, hostelId: property.id, managerId: property.managerId, managerCreated: true, status: 'active', name: user.name, email: user.email, role: 'Maintenance' });
  const member = roster(assigned, hostel), colleagueMember = roster(colleague, hostel), foreignMember = roster(foreignStaff, foreignHostel);
  const issue = (overrides: any = {}) => ({ id: crypto.randomUUID(), userId: owner.id, studentId: owner.id, studentEmail: owner.email, roomKey: owner.roomKey, hostelId: hostel.id, hostelName: hostel.name, managerId: manager.id, managerEmail: manager.email, title: crypto.randomUUID(), status: 'In Progress', assignedStaffId: member.id, assignedStaffName: member.name, assignedStaffEmail: member.email, managerReviewed: true, staffAccepted: false, staffCompleted: false, studentConfirmed: false, studentAcceptedResolved: false, closedByManager: false, historyLogs: [], ...overrides });
  const issues: Record<string, any> = {
    assign: issue({ status: 'Pending', assignedStaffId: undefined }),
    'accept-assignment': issue(), 'staff-decline': issue({ staffAccepted: true }),
    'staff-reschedule': issue({ staffAccepted: true }),
    'approve-reschedule': issue({ staffAccepted: true, staffRescheduleRequested: true }),
    'decline-reschedule': issue({ staffAccepted: true, rescheduleRequested: true }),
    'staff-complete': issue({ staffAccepted: true }),
    'student-confirm': issue({ staffAccepted: true, staffCompleted: true, status: 'Resolved' }),
    'manager-close': issue({ staffAccepted: true, staffCompleted: true, studentConfirmed: true, studentAcceptedResolved: true, status: 'Resolved' })
  };
  const lifecycle = issue({ status: 'Pending', assignedStaffId: undefined });
  const replay = issue({ staffAccepted: true, staffCompleted: true, status: 'Resolved' });
  const direct = issue({ userId: manager.id, studentId: manager.id, studentEmail: manager.email, roomKey: '', staffAccepted: true, staffCompleted: true, status: 'Resolved' });
  const retiredNotice = { id: crypto.randomUUID(), type: 'housing_booking', userId: manager.id, title: crypto.randomUUID() };
  const booked = { id: crypto.randomUUID(), studentName: crypto.randomUUID(), status: 'Pending' };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1,
    users: [admin, primary, manager, foreignManager, owner, other, foreignResident, assigned, colleague, foreignStaff],
    hostels: [hostel, foreignHostel], roomKeys: rooms, staff: [member, colleagueMember, foreignMember],
    issueReports: [...Object.values(issues), lifecycle, replay, direct], bookingRequests: [booked], notifications: [retiredNotice],
    managerAccountSettings: { [manager.id]: { notifications: { bookingApplicationAlerts: true, maintenanceTicketAlerts: true } } }
  }));
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
  const request = async (method: string, route: string, actor: any, body: any, status: number) => {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, status, `${method} ${route}: expected ${status}`);
    return response.json();
  };
  const act = (action: string, actor: any, body: any, status: number, target = issues[action]) => request('POST', `/api/issue-reports/${target.id}/${action}`, actor, body, status);
  const relevant = (store: any) => ({ issues: store.issueReports, notifications: store.notifications, reviews: store.staffReviews, activities: store.activities });
  const payloads: Record<string, any> = { assign: { staffId: member.id, timeframe: '24h' }, 'accept-assignment': {}, 'staff-decline': { reason: 'Unable to attend' }, 'staff-reschedule': { reason: 'Need extra equipment', requestedTimeframe: '48h' }, 'approve-reschedule': { approvedTimeframe: '48h' }, 'decline-reschedule': { reason: 'Keep existing schedule' }, 'staff-complete': { completionNotes: 'Repair completed and tested' }, 'student-confirm': { isResolved: true, rating: 4, feedback: 'Repair verified' }, 'manager-close': { managerNotes: 'Verified completed work' } };
  await start();
  for (const actor of [undefined, primary, owner, manager, admin]) {
    await request('GET', '/api/booking-requests', actor, undefined, 404);
    await request('POST', '/api/booking-requests', actor, { studentId: owner.id, status: 'Approved' }, 404);
    await request('PUT', `/api/booking-requests/${booked.id}`, actor, { status: 'Approved' }, 404);
  }
  const settings = await request('GET', '/api/manager/account-settings', manager, undefined, 200);
  assert(!JSON.stringify(settings).includes('bookingApplicationAlerts'));
  const notices = await request('GET', '/api/notifications', manager, undefined, 200);
  assert(!notices.some((notice: any) => notice.id === retiredNotice.id));
  for (const [action, body] of Object.entries(payloads)) {
    const before = relevant(await read());
    await act(action, undefined, body, 401); await act(action, { token: crypto.randomUUID() }, body, 401);
    const wrong = action === 'student-confirm' ? [primary, other, foreignResident, manager, assigned, admin] : ['assign', 'approve-reschedule', 'decline-reschedule', 'manager-close'].includes(action) ? [primary, owner, assigned, foreignManager] : [primary, owner, manager, admin, colleague, foreignStaff];
    for (const actor of wrong) await act(action, actor, body, 403);
    assert.deepEqual(relevant(await read()), before, `${action}: rejected requests must not modify data or send notifications`);
  }
  for (const [action, body] of Object.entries(payloads)) {
    const actor = action === 'student-confirm' ? owner : ['assign', 'approve-reschedule', 'decline-reschedule', 'manager-close'].includes(action) ? manager : assigned;
    const before = relevant(await read());
    await act(action, actor, { ...body, studentConfirmed: true, assignedStaffId: foreignMember.id }, 400);
    assert.deepEqual(relevant(await read()), before);
  }
  await act('assign', manager, { staffId: foreignMember.id }, 403);
  await act('assign', manager, { staffId: crypto.randomUUID() }, 403);
  const spoofed = await act('assign', manager, { ...payloads.assign, staffName: 'Untrusted name', staffEmail: 'untrusted@example.test' }, 200);
  assert.equal(spoofed.assignedStaffId, member.id); assert.equal(spoofed.assignedStaffName, member.name); assert.equal(spoofed.assignedStaffEmail, member.email);
  await act('accept-assignment', assigned, undefined, 200); await act('accept-assignment', assigned, {}, 409);
  await act('staff-decline', assigned, payloads['staff-decline'], 200);
  await act('staff-reschedule', assigned, payloads['staff-reschedule'], 200);
  await act('approve-reschedule', manager, payloads['approve-reschedule'], 200); await act('approve-reschedule', manager, payloads['approve-reschedule'], 409);
  await act('decline-reschedule', manager, payloads['decline-reschedule'], 200);
  await act('staff-complete', assigned, payloads['staff-complete'], 200); await act('staff-complete', assigned, payloads['staff-complete'], 409);
  await act('student-confirm', owner, { isResolved: 'true', rating: 4 }, 400);
  await act('student-confirm', owner, payloads['student-confirm'], 200);
  await act('student-confirm', owner, payloads['student-confirm'], 409);
  await act('manager-close', manager, payloads['manager-close'], 200);
  await act('manager-close', manager, payloads['manager-close'], 200);
  // Every state boundary in the complete resident/staff/manager lifecycle.
  await act('staff-complete', assigned, payloads['staff-complete'], 403, lifecycle);
  await act('student-confirm', owner, payloads['student-confirm'], 409, lifecycle);
  await act('manager-close', manager, {}, 409, lifecycle);
  await act('approve-reschedule', manager, {}, 409, lifecycle);
  await act('assign', admin, payloads.assign, 200, lifecycle);
  await act('staff-complete', assigned, payloads['staff-complete'], 409, lifecycle);
  await act('accept-assignment', assigned, {}, 200, lifecycle);
  await act('staff-reschedule', assigned, payloads['staff-reschedule'], 200, lifecycle);
  await act('staff-complete', assigned, payloads['staff-complete'], 409, lifecycle);
  await act('approve-reschedule', manager, payloads['approve-reschedule'], 200, lifecycle);
  await act('staff-complete', assigned, payloads['staff-complete'], 200, lifecycle);
  await act('manager-close', admin, {}, 409, lifecycle);
  const incomplete = await act('student-confirm', owner, { isResolved: false, feedback: 'Repair still needs attention' }, 200, lifecycle);
  assert.equal(incomplete.staffCompleted, false); assert.equal(incomplete.studentConfirmed, false);
  await act('staff-complete', assigned, payloads['staff-complete'], 200, lifecycle);
  await stop(); await start();
  await act('student-confirm', other, payloads['student-confirm'], 403, lifecycle);
  await act('student-confirm', owner, payloads['student-confirm'], 200, lifecycle);
  await act('manager-close', manager, payloads['manager-close'], 200, lifecycle);
  for (const [action, body] of Object.entries(payloads)) {
    if (action === 'manager-close') continue;
    const actor = action === 'student-confirm' ? owner : ['assign', 'approve-reschedule', 'decline-reschedule'].includes(action) ? manager : assigned;
    await act(action, actor, body, 409, lifecycle);
  }
  // Concurrent resident sign-off yields one review and one conflict.
  const beforeReviews = (await read()).staffReviews.length;
  const concurrent = await Promise.all([1,2].map(() => fetch(`${base}/api/issue-reports/${replay.id}/student-confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: JSON.stringify(payloads['student-confirm']) })));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200,409]);
  assert.equal((await read()).staffReviews.length, beforeReviews + 1);
  const closedDirect = await act('manager-close', manager, {}, 200, direct);
  assert.equal(closedDirect.studentConfirmed, false, 'Manager closure cannot manufacture resident confirmation');
  const disk = await read(); assert(!('bookingRequests' in disk)); assert.deepEqual(disk.retiredFeatureRecords.housingApplications, [booked]);
  await stop(); await start();
  await request('GET', '/api/booking-requests', admin, undefined, 404);
  assert.deepEqual((await read()).retiredFeatureRecords.housingApplications, [booked]);
});
