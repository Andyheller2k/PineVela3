import { accountSubmissionNotification } from './accountSubmissionNotifications.js';
import crypto from 'node:crypto';
import { assignedResidences } from './hostelSecurity.js';
import { internationalPhone } from './internationalPhone.js';
import { notificationVisible, notificationReaderKey, notificationForActor } from './recordAccessSecurity.js';

const DAY = 86400000;
export class ResidenceRequestError extends Error { constructor(public status: number, message: string, public details: any = {}) { super(message); } }
const fail = (status: number, message: string, details = {}): never => { throw new ResidenceRequestError(status, message, details); };
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const managerKeyHash = (id: string, key: string) => hash(`manager-operation:${id}:${key}`);
const equal = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const copy = <T>(value: T): T => structuredClone(value);
const registeredBlocks = (hostel: any): any[] => Array.isArray(hostel.blocksList) && hostel.blocksList.length ? hostel.blocksList : Array.isArray(hostel.blocks) ? hostel.blocks : [];
const blockReference = (hostel: any, block: any, index: number) => block.id !== undefined && block.id !== null && block.id !== '' ? block.id : `legacy-block-${hash(`${hostel.id}:block:${index}`).slice(0, 24)}`;
export function residenceFields(hostel: any) {
  return {
    name: hostel.name || '', cover: hostel.imageUrl || hostel.image || hostel.exteriorPhotoUrl || '',
    gallery: Array.isArray(hostel.gallery) ? hostel.gallery : [], managerName: hostel.managerName || '', managerPhone: hostel.managerPhone || hostel.contact_phone || '',
    blocks: registeredBlocks(hostel).map((b: any, index: number) => ({ id: blockReference(hostel, b, index), name: b.name || b.blockName || '' }))
  };
}

export class ResidenceRequests {
  constructor(private getStore: () => any, private commit: () => void, private governance: any, private now = Date.now) {}
  private get store(): any { return this.getStore(); }
  private get keys(): Record<string, any> { return this.store.managerOperationKeys ||= {}; }
  ownHostels(actor: any) { return assignedResidences(actor, this.store); }
  private manager(actor: any) { if (actor?.role !== 'manager' || !actor.id) fail(403, 'A manager account is required.'); }
  private hostel(actor: any, id: any) {
    this.manager(actor); const h = this.ownHostels(actor).find((h: any) => h.id === id);
    if (!h) fail(403, 'This residence is not assigned to your manager account.'); return h;
  }
  keyStatus(actor: any) { this.manager(actor); return { available: this.ownHostels(actor).length > 0, issueRequired: !this.keys[actor.id]?.hash }; }
  issue(actor: any) {
    this.manager(actor); if (!this.ownHostels(actor).length) fail(409, 'Create your assigned residence before receiving a request key.');
    if (this.keys[actor.id]?.hash) fail(409, 'Your key has already been shown. Petition the admin board if it was lost.');
    const key = crypto.randomBytes(32).toString('base64url');
    this.keys[actor.id] = { hash: managerKeyHash(actor.id, key), issuedAt: this.now(), attempts: 0, until: 0 };
    this.commit(); return { key };
  }
  verify(actor: any, key: unknown) {
    this.manager(actor); const entry = this.keys[actor.id];
    if (!key) fail(403, 'Enter your manager secret key to authorize this action.', { managerKeyRequired: true });
    if (!entry?.hash) fail(403, 'Save your manager secret key first, or petition the admin board for a reset.', { managerKeyRequired: true });
    if (entry.until > this.now() && entry.attempts >= 5) fail(429, 'Too many secret-key attempts. Wait 15 minutes.');
    if (typeof key !== 'string' || key.length > 128 || !equal(managerKeyHash(actor.id, key), entry.hash)) {
      const active = entry.until > this.now();
      entry.attempts = active ? Number(entry.attempts || 0) + 1 : 1;
      if (!active) entry.until = this.now() + 15 * 60_000;
      this.commit(); fail(403, 'Your manager secret key is invalid.', { managerKeyRequired: true });
    }
    if (entry.attempts || entry.until) { entry.attempts = 0; entry.until = 0; this.commit(); }
  }
  gate(req: any) {
    if (req.user?.role !== 'manager' || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.managerKeyVerified === req.user.id) return;
    const path = req.path;
    // Personal appearance is session-owned and cannot authorize a business change.
    if (req.method === 'PUT' && path === '/api/auth/appearance') return;
    // Credential bootstrap/recovery and server delivery receipts do not authorize business changes.
    if (['/api/manager/secret-key/issue', '/api/manager/secret-key/petition', '/api/auth/maintenance-notice/dismiss'].includes(path) || /^\/api\/admin-messages\/[^/]+\/ack$/.test(path)) return;
    if (!this.ownHostels(req.user).length && ['/api/hostels/register', '/api/storage/upload-hostel-image', '/api/hostel-verifications/submit'].includes(path)) return;
    this.verify(req.user, req.get('X-PineVela-Manager-Key')); req.managerKeyVerified = req.user.id;
  }
  notify(managerId: string, title: string, message: string, type: string) {
    (this.store.notifications ||= []).unshift({ id: crypto.randomUUID(), targetAccountId: managerId, targetRole: 'manager', title, message, type, senderRole: 'admin', adminMessage: true, date: new Date(this.now()).toISOString(), read: false });
  }
  petition(actor: any, body: any) {
    this.manager(actor); if (!this.ownHostels(actor).length) fail(409, 'There is no assigned residence.');
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 2000) fail(400, 'Explain why you need a new key (up to 2,000 characters).');
    const list = this.store.managerKeyPetitions ||= [];
    if (list.some((p: any) => p.managerId === actor.id && p.status === 'Pending')) fail(409, 'A key-reset petition is already pending.');
    const item = { id: crypto.randomUUID(), managerId: actor.id, managerName: actor.name, reason, status: 'Pending', createdAt: new Date(this.now()).toISOString() };
    list.unshift(item); this.commit(); return item;
  }
  reset(admin: any, managerId: string, settingsKey: unknown) {
    if (admin?.role !== 'admin') fail(403, 'An administrator account is required.');
    this.governance.verifySettingsKey(admin.id, settingsKey);
    const manager = (this.store.users || []).map((u: any) => u.user || u).find((u: any) => u.id === managerId && u.role === 'manager');
    if (!manager || !this.ownHostels(manager).length) fail(404, 'Assigned manager not found.');
    this.keys[managerId] = { resetAt: this.now(), resetBy: admin.id };
    for (const p of this.store.managerKeyPetitions || []) if (p.managerId === managerId && p.status === 'Pending') { p.status = 'Approved'; p.decidedAt = this.now(); p.decidedBy = admin.id; }
    (this.store.activities ||= []).unshift({ id: crypto.randomUUID(), actorId: admin.id, managerId, type: 'info', text: `Administrator reset the request key for ${manager.name || managerId}.`, date: new Date(this.now()).toISOString() });
    this.notify(managerId, 'Manager secret key reset', 'Your administrator approved a new secret key. Copy and save the new key when prompted; the previous key is no longer valid.', 'success');
    this.commit(); return { success: true };
  }
  private requests(): any[] { return this.store.boardRequests ||= []; }
  list(actor: any) {
    if (actor.role === 'admin') return this.requests().map(r => this.publicRequest(r));
    this.manager(actor); return this.requests().filter(r => r.managerId === actor.id).map(r => this.publicRequest(r));
  }
  private publicRequest(r: any) { const { reviews, ...rest } = r; return copy(rest); }
  private fingerprint(r: any) { return hash(JSON.stringify([r.id, r.hostelId, r.managerId, r.before, r.after])); }
  nextRequestAt(actor: any) {
    const last = this.requests().filter(r => r.kind === 'residence-change' && r.managerId === actor.id).reduce((n, r) => Math.max(n, Date.parse(r.createdAt) || 0), 0);
    return last ? last + 30 * DAY : 0;
  }
  private normalized(hostel: any, actor: any, changes: any) {
    if (!changes || Array.isArray(changes) || typeof changes !== 'object' || !Object.keys(changes).length) fail(400, 'Supply the changed residence fields.');
    const allowed = ['name', 'cover', 'gallery', 'managerName', 'managerPhone', 'managerPhoneCountry', 'blocks'];
    if (Object.keys(changes).some(k => !allowed.includes(k))) fail(400, 'Only residence name, photographs, manager name/contact and block names/count can be requested.');
    const before = residenceFields(hostel), after: any = copy(before);
    for (const k of ['name', 'managerName']) if (k in changes) {
      if (typeof changes[k] !== 'string' || !changes[k].trim() || changes[k].length > 160) fail(400, 'Residence and manager names must contain 1–160 characters.'); after[k] = changes[k].trim();
    }
    if ('managerPhone' in changes || 'managerPhoneCountry' in changes) {
      try { after.managerPhone = internationalPhone(changes.managerPhone ?? before.managerPhone, changes.managerPhoneCountry).number; }
      catch (error) { fail(400, (error as Error).message); }
    }
    const image = (url: any) => {
      const origin = process.env.PINEVELA_MEDIA_ORIGIN?.trim() ? new URL(process.env.PINEVELA_MEDIA_ORIGIN.trim()).origin : '';
      const path = typeof url === 'string' ? url.startsWith('/') ? url : origin && url.startsWith(origin + '/') ? url.slice(origin.length) : '' : '';
      if (!/^\/uploads\/hostels\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(png|jpg|jpeg|webp)$/i.test(path) || !this.store.hostelMedia?.some((m: any) => m.managerId === actor.id && m.imageUrl === url)) fail(400, 'Upload your own residence photograph before requesting it.');
      return url;
    };
    if ('cover' in changes) after.cover = changes.cover === before.cover ? before.cover : image(changes.cover);
    if ('gallery' in changes) {
      if (!Array.isArray(changes.gallery) || changes.gallery.length < 1 || changes.gallery.length > 3) fail(400, 'Provide 1–3 interior photographs.');
      after.gallery = changes.gallery.map((url: any) => before.gallery.includes(url) ? url : image(url));
    }
    if ('blocks' in changes) {
      if (!Array.isArray(changes.blocks) || changes.blocks.length < 1 || changes.blocks.length > 100) fail(400, 'Provide between 1 and 100 blocks.');
      const names = new Set<string>(), ids = new Set<string>();
      after.blocks = changes.blocks.map((b: any) => {
        if (!b || typeof b !== 'object' || Object.keys(b).some(k => !['id', 'name'].includes(k)) || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) fail(400, 'Each block needs a name only, and its existing ID when applicable.');
        const name = b.name.trim(); if (names.has(name.toLowerCase())) fail(400, 'Block names must be unique.'); names.add(name.toLowerCase());
        if (b.id !== undefined && b.id !== null && b.id !== '' && (!before.blocks.some((old: any) => old.id === b.id) || ids.has(b.id))) fail(400, 'Invalid or repeated residence block.');
        const id = b.id !== undefined && b.id !== null && b.id !== '' ? b.id : crypto.randomUUID(); ids.add(id); return { id, name };
      });
      this.checkBlockRemoval(hostel, after.blocks);
    }
    if (JSON.stringify(before) === JSON.stringify(after)) fail(400, 'No changes were made.'); return { before, after };
  }
  private checkBlockRemoval(hostel: any, blocks: any[]) {
    for (const [index, old] of registeredBlocks(hostel).entries()) if (!blocks.some(b => b.id === blockReference(hostel, old, index))) {
      const occupied = [this.store.roomKeys, this.store.staff].flatMap(v => v || []).some((r: any) => r.hostelId === hostel.id && [r.blockId, r.blockName, r.block, r.assignedBlock].some(v => v && [old.id, old.name, old.blockName].includes(v)));
      if (occupied || (Array.isArray(old.floors) ? old.floors.length > 0 : Number(old.floors) > 0) || old.rooms?.length || [old.totalRooms, old.totalBeds, old.capacity, old.floorCount, old.totalFloors, old.roomsPerFloor, old.roomCount].some(v => Number(v) > 0)) fail(409, 'A block with floors, rooms, beds or assigned staff cannot be removed. Rename it instead.');
    }
  }
  submit(actor: any, body: any) {
    const hostel = this.hostel(actor, body?.hostelId);
    const next = this.nextRequestAt(actor); if (next > this.now()) fail(429, 'Residence change requests are limited to one every 30 days.', { nextRequestAt: new Date(next).toISOString() });
    const { before, after } = this.normalized(hostel, actor, body?.changes);
    const r = { id: crypto.randomUUID(), kind: 'residence-change', managerId: actor.id, managerName: actor.name, hostelId: hostel.id, hostelName: hostel.name, subject: `Residence update: ${hostel.name}`, before, after, status: 'Pending', createdAt: new Date(this.now()).toISOString(), reviews: {} };
    this.requests().unshift(r); this.commit(); return this.publicRequest(r);
  }
  review(admin: any, id: string) {
    if (admin?.role !== 'admin') fail(403, 'An administrator account is required.');
    const r = this.requests().find(r => r.id === id && r.kind === 'residence-change'); if (!r) fail(404, 'Residence change request not found.');
    const token = crypto.randomBytes(24).toString('base64url');
    (r.reviews ||= {})[admin.id] = { tokenHash: hash(token), fingerprint: this.fingerprint(r), until: this.now() + 30 * 60_000 };
    this.commit(); return { request: this.publicRequest(r), reviewToken: token };
  }
  decision(admin: any, id: string, body: any) {
    if (admin?.role !== 'admin') fail(403, 'An administrator account is required.');
    this.governance.verifyApprovalKey(admin.id, body?.approvalKey);
    const r = this.requests().find(r => r.id === id && r.kind === 'residence-change'); if (!r) fail(404, 'Residence change request not found.');
    if (r.status !== 'Pending') fail(409, 'This request has already been decided.');
    const review = r.reviews?.[admin.id];
    if (!review || review.until <= this.now() || review.fingerprint !== this.fingerprint(r) || typeof body?.reviewToken !== 'string' || !equal(hash(body.reviewToken), review.tokenHash)) fail(409, 'View this request before confirming a decision.');
    if (!['approve', 'reject'].includes(body?.decision)) fail(400, 'Choose approve or reject.');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (body.decision === 'reject' && (!reason || reason.length > 2000)) fail(400, 'Provide a rejection reason (up to 2,000 characters).');
    if (body.decision === 'approve') {
      const hostel = this.store.hostels.find((h: any) => h.id === r.hostelId);
      if (!hostel || !this.ownHostels((this.store.users || []).map((u: any) => u.user || u).find((u: any) => u.id === r.managerId && u.role === 'manager')).some((h: any) => h.id === hostel.id)) fail(409, 'The requesting manager no longer manages this residence.');
      if (JSON.stringify(residenceFields(hostel)) !== JSON.stringify(r.before)) fail(409, 'Residence details have changed. Reject this stale request and request a new submission.');
      this.checkBlockRemoval(hostel, r.after.blocks);
      const oldBlocks = registeredBlocks(hostel);
      const blocks = r.after.blocks.map((b: any) => ({ ...(oldBlocks.find((old: any, index: number) => blockReference(hostel, old, index) === b.id) || { floors: 0, totalRooms: 0, totalBeds: 0, bedsPerRoom: 0 }), ...b }));
      for (const block of blocks) if ('blockName' in block) block.blockName = block.name;
      if ('hostelName' in hostel) hostel.hostelName = r.after.name;
      Object.assign(hostel, { name: r.after.name, image: r.after.cover, imageUrl: r.after.cover, exteriorPhotoUrl: r.after.cover, imagePreviewUrl: r.after.cover, gallery: copy(r.after.gallery), managerName: r.after.managerName, managerPhone: r.after.managerPhone, blocksList: blocks, totalBlocks: blocks.length, updatedAt: new Date(this.now()).toISOString() });
      if (hostel.blocks) hostel.blocks = copy(blocks);
      // Keep operational labels aligned while preserving allocation/capacity/ownership.
      for (const row of [this.store.roomKeys, this.store.staff, this.store.issueReports, this.store.staffBargains].flatMap(v => v || [])) if (row.hostelId === hostel.id) {
        for (const field of ['blockName', 'block', 'assignedBlock']) {
          const index = oldBlocks.findIndex((b: any) => (b.name || b.blockName) === row[field]);
          const next = index >= 0 && blocks.find((b: any) => b.id === blockReference(hostel, oldBlocks[index], index));
          if (next) row[field] = next.name;
        }
        if ('hostelName' in row) row.hostelName = hostel.name;
        if ('managerName' in row) row.managerName = hostel.managerName;
        if ('managerPhone' in row) row.managerPhone = hostel.managerPhone;
      }
    }
    r.status = body.decision === 'approve' ? 'Approved' : 'Rejected'; r.reason = reason; r.decidedBy = admin.id; r.decidedAt = new Date(this.now()).toISOString(); r.reviews = {};
    this.notify(r.managerId, `Residence update ${r.status.toLowerCase()}`, body.decision === 'approve' ? `Your requested changes to ${r.hostelName} were approved and applied.` : `Your changes to ${r.hostelName} were rejected. Reason: ${reason}`, body.decision === 'approve' ? 'success' : 'error');
    this.commit(); return this.publicRequest(r);
  }
}

export function installResidenceRequests(app: any, auth: any, service: ResidenceRequests, getStore: () => any, commit: () => void) {
  const route = (fn: any) => (req: any, res: any) => { try { res.set('Cache-Control', 'private, no-store'); return res.json(fn(req)); } catch (e: any) { if (e.status) return res.status(e.status).json({ error: e.message, ...e.details }); throw e; } };
  app.get('/api/manager/secret-key', auth(['manager']), route((r: any) => service.keyStatus(r.user)));
  app.post('/api/manager/secret-key/issue', auth(['manager']), route((r: any) => service.issue(r.user)));
  app.post('/api/manager/secret-key/petition', auth(['manager']), route((r: any) => service.petition(r.user, r.body)));
  app.get('/api/manager/residence-requests', auth(['manager']), route((r: any) => ({ hostels: service.ownHostels(r.user).map((h: any) => ({ id: h.id, ...residenceFields(h) })), nextRequestAt: service.nextRequestAt(r.user) })));
  app.get('/api/admin/manager-request-keys', auth(['admin']), route(() => (getStore().users || []).map((u: any) => u.user || u).filter((u: any) => u.role === 'manager' && service.ownHostels(u).length).map((u: any) => ({ id: u.id, name: u.name, hostelName: service.ownHostels(u)[0].name }))));
  app.get('/api/admin/manager-key-petitions', auth(['admin']), route(() => getStore().managerKeyPetitions || []));
  app.post('/api/admin/managers/:id/reset-request-key', auth(['admin']), route((r: any) => service.reset(r.user, r.params.id, r.body?.settingsKey)));
  app.get('/api/board-requests', auth(['admin', 'manager']), route((r: any) => service.list(r.user)));
  app.post('/api/board-requests', auth(['manager']), route((r: any) => service.submit(r.user, r.body)));
  app.get('/api/board-requests/:id/review', auth(['admin']), route((r: any) => service.review(r.user, r.params.id)));
  app.post('/api/board-requests/:id/decision', auth(['admin']), route((r: any) => service.decision(r.user, r.params.id, r.body)));
  app.put('/api/board-requests/:id', auth(['admin']), (_r: any, res: any) => res.status(410).json({ error: 'General request editing is retired. View the residence diff and confirm with your approval key.' }));
  app.get('/api/admin-messages/pending', auth(), route((r: any) => {
    const seen = new Set<string>();
    return (getStore().notifications || []).filter((n: any) => {
      if (!n.adminMessage || !notificationVisible(r.user, n, getStore()) || n.popupAcknowledgedBy?.includes(notificationReaderKey(r.user)) || seen.has(n.id)) return false;
      seen.add(n.id); return true;
    }).map((n: any) => notificationForActor(accountSubmissionNotification(n, getStore()), r.user));
  }));
  app.post('/api/admin-messages/:id/ack', auth(), route((r: any) => {
    const n = (getStore().notifications || []).find((n: any) => n.id === r.params.id && n.adminMessage && notificationVisible(r.user, n, getStore()));
    if (!n) fail(404, 'Message not found.');
    const key = notificationReaderKey(r.user);
    for (const notice of getStore().notifications) if (notice.id === n.id && notificationVisible(r.user, notice, getStore())) { notice.popupAcknowledgedBy ||= []; if (!notice.popupAcknowledgedBy.includes(key)) notice.popupAcknowledgedBy.push(key); }
    commit(); return { success: true };
  }));
}
