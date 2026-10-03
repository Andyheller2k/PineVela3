import crypto from 'node:crypto';
import { clearRecordSession } from './sessionSecurity.js';
import { accountData, accountId, accountRole, canManageHostel, hasActiveRoom, hashCredentialAsync, normalizeEmail, publicAccountData } from './accountSecurity.js';

export function activeResidentRoom(actor: any, store: any) {
  if (!['student', 'resident'].includes(actor.role) || !hasActiveRoom(actor, store.roomKeys || [])) return undefined;
  return (store.roomKeys || []).find((r: any) => r.isAssigned && String(r.roomKey).toUpperCase() === String(actor.roomKey).toUpperCase() &&
    (!r.assignedStudentId || r.assignedStudentId === actor.id || r.assignedStudentId === actor.studentId));
}
export function staffHostel(member: any, store: any) { return (store.hostels || []).find((h: any) => h.id === member?.hostelId); }
export function activeManagedStaff(actor: any, store: any) {
  if (accountRole(actor) !== 'staff') return undefined;
  return (store.staff || []).find((s: any) => s.userId === accountId(actor) &&
    (s.managerCreated === true || s.isInternalStaff === true) &&
    String(s.status || '').toLowerCase() === 'active' &&
    s.managerId && staffHostel(s, store)?.managerId === s.managerId);
}
export function managesStaff(actor: any, member: any, store: any) {
  const hostel = staffHostel(member, store);
  return actor.role === 'manager' && Boolean(hostel && canManageHostel(actor, hostel)) && (!member.managerId || member.managerId === actor.id);
}
export function installStaffManagement(app: any, requireAuth: any, getStore: () => any, syncStore: () => void) {
  const auth = (roles: string[]) => [requireAuth(roles), (req: any, res: any, next: any) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'This account cannot perform this action.' })];
  app.get('/api/staff', auth(['manager', 'staff', 'student', 'resident']), (req: any, res: any) => {
    const store = getStore(); const actor = req.user; const room = activeResidentRoom(actor, store);
    if (['student', 'resident'].includes(actor.role) && !room) return res.status(403).json({ error: 'Activate your room to view its staff.' });
    const staff = (store.staff || []).filter((s: any) => actor.role === 'manager' ? managesStaff(actor, s, store) :
      actor.role === 'staff' ? (s.userId || s.id) === actor.id : s.hostelId === room.hostelId);
    return res.json(publicAccountData(staff));
  });
  app.post('/api/staff', auth(['manager']), async (req: any, res: any) => {
    const store = getStore(); const body = req.body || {}; const actor = req.user;
    const owned = (store.hostels || []).filter((h: any) => canManageHostel(actor, h));
    const hostel = body.hostelId ? owned.find((h: any) => h.id === body.hostelId) : owned.length === 1 ? owned[0] : undefined;
    if (!hostel) return res.status(403).json({ error: 'Choose a residence managed by your account.' });
    if (hostel.isApproved !== true) return res.status(403).json({ error: 'Your residence needs administrator approval before creating staff accounts.' });
    const email = normalizeEmail(body.email);
    if (typeof body.name !== 'string' || !body.name.trim() || typeof body.phone !== 'string' || !body.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 1024) return res.status(400).json({ error: 'Staff name, phone, email and a password of 6–1024 characters are required.' });
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : email;
    if ((store.users || []).some((u: any) => normalizeEmail(accountData(u)?.email || u.email) === email || String(u.username || accountData(u)?.username || '').toLowerCase() === username) ||
      (store.staff || []).some((s: any) => normalizeEmail(s.email) === email)) return res.status(409).json({ error: 'This email or username already belongs to an account.' });
    const passwordHash = await hashCredentialAsync(body.password);
    // Hashing yields to other requests: recheck uniqueness and assignment before committing.
    const currentHostel = (store.hostels || []).find((h: any) => h.id === hostel.id);
    if (!canManageHostel(actor, currentHostel) || currentHostel.isApproved !== true) return res.status(403).json({ error: 'This residence is not available to your manager account.' });
    if ((store.users || []).some((u: any) => normalizeEmail(accountData(u)?.email || u.email) === email || String(u.username || accountData(u)?.username || '').toLowerCase() === username)) return res.status(409).json({ error: 'This email or username already belongs to an account.' });
    const staffId = crypto.randomUUID(), userId = crypto.randomUUID();
    const member = { id: staffId, userId, name: body.name.trim(), email, phone: body.phone.trim(), role: typeof body.role === 'string' ? body.role : '',
      shift: typeof body.shift === 'string' ? body.shift : '', assignedBlock: typeof body.assignedBlock === 'string' ? body.assignedBlock : '',
      hostelId: hostel.id, hostelName: hostel.name, managerId: actor.id, managerEmail: actor.email,
      createdById: actor.id, managerCreated: true, isInternalStaff: true, isVerified: true, verificationStatus: 'Verified',
      isApproved: true, status: 'Active', createdAt: new Date().toISOString() };
    const profile = { ...member, id: userId, staffId, username, role: 'staff', staffRole: member.role };
    store.staff ||= []; store.staff.unshift(member);
    store.users.push({ email, username, password: passwordHash, user: profile });
    syncStore(); return res.status(201).json(publicAccountData(member));
  });
  app.put('/api/staff/profile', auth(['staff']), (req: any, res: any) => {
    const store = getStore(); const member = (store.staff || []).find((s: any) => (s.userId || s.id) === req.user.id);
    const entry = (store.users || []).find((u: any) => accountId(u) === req.user.id && accountRole(u) === 'staff');
    if (!member || !entry) return res.status(403).json({ error: 'An active manager-created staff account is required.' });
    const body = req.body || {};
    const email = body.email === undefined ? normalizeEmail(member.email) : normalizeEmail(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid staff email is required.' });
    if ((store.users || []).some((u: any) => accountId(u) !== req.user.id && normalizeEmail(accountData(u)?.email || u.email) === email)) return res.status(409).json({ error: 'That email is already registered.' });
    const patch: any = { email };
    for (const key of ['name', 'phone', 'username', 'profilePicture', 'avatar', 'photo']) if (body[key] !== undefined) {
      if (typeof body[key] !== 'string' || body[key].length > (['avatar', 'photo', 'profilePicture'].includes(key) ? 3000000 : 200)) return res.status(400).json({ error: 'Invalid profile field.' });
      patch[key] = body[key].trim();
    }
    if (patch.username && (store.users || []).some((u: any) => accountId(u) !== req.user.id && String(u.username || accountData(u)?.username || '').toLowerCase() === patch.username.toLowerCase())) return res.status(409).json({ error: 'That username is already registered.' });
    Object.assign(member, patch); Object.assign(accountData(entry), patch); entry.email = email;
    if (patch.username) entry.username = patch.username;
    syncStore(); return res.json({ success: true, user: { ...publicAccountData(accountData(entry)), token: req.user.token }, staffRecord: publicAccountData(member) });
  });
  app.put('/api/staff/:id', auth(['manager']), (req: any, res: any) => {
    const store = getStore(); const member = (store.staff || []).find((s: any) => s.id === req.params.id || s.userId === req.params.id);
    if (!member) return res.status(404).json({ error: 'Staff member not found.' });
    if (!managesStaff(req.user, member, store)) return res.status(403).json({ error: 'You cannot manage another residence’s staff.' });
    const allowed = ['name', 'phone', 'role', 'shift', 'assignedBlock', 'status'];
    if (Object.keys(req.body).some(key => !allowed.includes(key)) || Object.values(req.body).some(value => typeof value !== 'string' || value.length > 200) || req.body.status !== undefined && !['Active', 'Inactive', 'Suspended'].includes(req.body.status)) return res.status(400).json({ error: 'Only valid staff assignment fields may be updated.' });
    const previousStatus = member.status;
    Object.assign(member, req.body, { updatedAt: new Date().toISOString() });
    const entry = (store.users || []).find((u: any) => accountRole(u) === 'staff' && accountId(u) === (member.userId || member.id));
    if (entry) Object.assign(accountData(entry), { name: member.name, phone: member.phone, staffRole: member.role, status: member.status });
    if (req.body.status && (req.body.status !== 'Active' || previousStatus !== 'Active')) {
      for (const account of store.users || []) if (accountRole(account) === 'staff' && accountId(account) === (member.userId || member.id)) clearRecordSession(account);
      clearRecordSession(member);
    }
    syncStore(); return res.json(publicAccountData(member));
  });
  app.delete('/api/staff/:id', auth(['manager']), (req: any, res: any) => {
    const store = getStore(); const member = (store.staff || []).find((s: any) => s.id === req.params.id || s.userId === req.params.id);
    if (!member) return res.status(404).json({ error: 'Staff member not found.' });
    if (!managesStaff(req.user, member, store)) return res.status(403).json({ error: 'You cannot remove another residence’s staff.' });
    for (const account of store.users || []) if (accountRole(account) === 'staff' && accountId(account) === (member.userId || member.id)) clearRecordSession(account);
    clearRecordSession(member);
    store.staff = store.staff.filter((s: any) => s !== member);
    store.users = store.users.filter((u: any) => !(accountRole(u) === 'staff' && accountId(u) === (member.userId || member.id)));
    syncStore(); return res.json({ success: true, message: 'Staff account removed and sessions revoked.' });
  });
  app.get('/api/staff-reviews', auth(['manager', 'staff', 'student', 'resident']), (req: any, res: any) => {
    const store = getStore(); const actor = req.user; const room = activeResidentRoom(actor, store);
    if (['student', 'resident'].includes(actor.role) && !room) return res.status(403).json({ error: 'Activate your room to view staff reviews.' });
    const visible = (store.staff || []).filter((s: any) => actor.role === 'manager' ? managesStaff(actor, s, store) : actor.role === 'staff' ? (s.userId || s.id) === actor.id : s.hostelId === room.hostelId);
    const ids = new Set(visible.flatMap((s: any) => [s.id, s.userId]));
    return res.json((store.staffReviews || []).filter((r: any) => ids.has(r.staffId) && (!req.query.staffId || r.staffId === req.query.staffId)));
  });
  app.post('/api/staff-reviews', auth(['student', 'resident']), (req: any, res: any) => {
    const store = getStore(); const room = activeResidentRoom(req.user, store);
    const member = (store.staff || []).find((s: any) => s.id === req.body.staffId || s.userId === req.body.staffId);
    if (!room || !member || room.hostelId !== member.hostelId) return res.status(403).json({ error: 'You can review staff only from your activated residence.' });
    const rating = req.body.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || req.body.comment !== undefined && (typeof req.body.comment !== 'string' || req.body.comment.length > 3000)) return res.status(400).json({ error: 'Select a rating from 1 to 5 and a comment up to 3000 characters.' });
    const review = { id: crypto.randomUUID(), staffId: member.id, hostelId: room.hostelId, reviewerId: req.user.id, reviewerName: req.user.name, rating, comment: req.body.comment?.trim() || '', createdAt: new Date().toISOString() };
    store.staffReviews ||= []; store.staffReviews.unshift(review); syncStore(); return res.status(201).json(review);
  });
}
