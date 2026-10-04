import crypto from 'node:crypto';
import { accountData, accountId, accountRole, normalizeEmail, credentialValues, verifyCredentialAsync, hashCredentialAsync } from './accountSecurity.js';
import { clearRecordSession } from './sessionSecurity.js';
import { buildWipePlan, applyWipePlan, parseWipeScopes, type WipeScope } from './adminWipeScope.js';
import { WipeRecovery } from './adminWipeRecovery.js';
import { validatePlatformSettings } from './platformSettings.js';

export class GovernanceError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new GovernanceError(status, message); };
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const matches = (actual: string, expected?: string) => !!expected && /^[a-f0-9]{64}$/.test(expected) && crypto.timingSafeEqual(Buffer.from(digest(actual), 'hex'), Buffer.from(expected, 'hex'));
const cleanText = (value: unknown, label: string, max = 500) => {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > max) return fail(400, `${label} must contain 3–${max} characters.`);
  return value.trim();
};
type Member = { id: string; slot: number; active: boolean; keyHash?: string; settingsKeyHash?: string };
type Vote = { id: string; slot: number; name: string; decision: 'approved' | 'rejected'; at: string };
type Proposal = { id: string; scopes: WipeScope[]; reason: string; createdBy: string; createdAt: string; expiresAt: string; revision: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'invalidated' | 'executed'; preview: any; fingerprint: string; votes: Vote[]; roster: { id: string; slot: number; name: string }[]; executedAt?: string; backup?: string };
type Invitation = { id: string; email: string; name: string; slot: number; tokenHash: string; expiresAt: string };
type Change = { id: string; targetId: string; action: 'remove' | 'reset-key' | 'reset-settings-key'; reason: string; requestedBy: string; revision: number; expiresAt: string; status: 'pending' | 'approved' | 'rejected' | 'invalidated'; votes: Vote[] };
export interface AdminGovernanceState { version: 1; mainId: string; revision: number; members: Member[]; proposals: Proposal[]; invitations: Invitation[]; changes: Change[]; attempts: Record<string, { count: number; until: number }> }

export function initializeAdminGovernance(store: any, configuredMain = process.env.PINEVELA_MAIN_ADMIN_ID): boolean {
  if (store.adminGovernance) return false;
  const admins = (store.users || []).filter((u: any) => accountRole(u) === 'admin');
  const unique = [...new Map<string, any>(admins.map((u: any) => [accountId(u), u])).values()];
  if (unique.length > 5 || unique.some(u => !accountId(u))) throw new Error('Administrator roster requires manual reconciliation: at most five distinct administrator IDs.');
  const main = unique.find(u => configuredMain ? accountId(u) === configuredMain : normalizeEmail(accountData(u).email || u.email) === 'andyheller2k@gmail.com') || (!configuredMain && unique.length === 1 ? unique[0] : undefined);
  if (configuredMain && !main) throw new Error('PINEVELA_MAIN_ADMIN_ID must identify an existing administrator.');
  unique.sort((a, b) => a === main ? -1 : b === main ? 1 : accountId(a).localeCompare(accountId(b)));
  store.adminGovernance = { version: 1, mainId: main ? accountId(main) : '', revision: 1,
    members: unique.map((u, index) => ({ id: accountId(u), slot: index + 1, active: !['disabled', 'banned', 'suspended'].includes(String(accountData(u).accountStatus || u.accountStatus || '').toLowerCase()) })),
    proposals: [], invitations: [], changes: [], attempts: {} } satisfies AdminGovernanceState;
  return true;
}
export function activeAdministrator(store: any, id: string): boolean {
  const state = store.adminGovernance as AdminGovernanceState | undefined;
  return !!state?.members.some(m => m.id === id && m.active) && (store.users || []).some((u: any) => accountRole(u) === 'admin' && accountId(u) === id);
}

/** One serialized governance mutation at a time; actual wipe commits contain no await. */
export class AdminGovernance {
  private queue: Promise<unknown> = Promise.resolve();
  blocked = false;
  constructor(private getStore: () => any, private save: () => void, readonly recovery = new WipeRecovery(), private otherWrites = () => 0, private now = () => Date.now()) { this.blocked = recovery.isBlocked(); }
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.queue.catch(() => {}).then(fn); this.queue = next; return next;
  }
  private commit() {
    try { this.save(); }
    catch {
      this.blocked = true;
      try { this.recovery.blockExecution(); } catch { /* A failing disk may also prevent a marker write; this process still fails closed. */ }
      fail(503, 'Governance persistence failed. Writes are blocked; stop the server and inspect the database and recovery files offline.');
    }
  }
  get state(): AdminGovernanceState { return this.getStore().adminGovernance; }
  private account(id: string) { return this.getStore().users.find((u: any) => accountRole(u) === 'admin' && accountId(u) === id); }
  private member(id: string): Member {
    if (!activeAdministrator(this.getStore(), id)) return fail(403, 'An active administrator account is required.');
    return this.state.members.find(m => m.id === id)!;
  }
  private main(id: string) { const m = this.member(id); if (id !== this.state.mainId) fail(403, 'Only administrator #1 may manage administrator membership.'); return m; }
  private vote(id: string, decision: Vote['decision']): Vote {
    const m = this.member(id), a = accountData(this.account(id));
    return { id, slot: m.slot, name: a.name || a.fullName || a.email, decision, at: new Date(this.now()).toISOString() };
  }
  private verifyKey(id: string, key: unknown) {
    const m = this.member(id), now = this.now(), attempts = this.state.attempts[id];
    if (attempts && attempts.until > now && attempts.count >= 5) return fail(429, 'Too many approval-key attempts. Wait 15 minutes.');
    if (typeof key !== 'string' || key.length > 128 || !matches(`${id}:${key}`, m.keyHash)) {
      this.state.attempts[id] = { count: attempts && attempts.until > now ? attempts.count + 1 : 1, until: attempts && attempts.until > now ? attempts.until : now + 15 * 60_000 };
      this.commit(); return fail(403, 'Your private approval key is invalid or has not been enrolled.');
    }
    delete this.state.attempts[id];
  }
  private changedMembership() {
    this.state.revision++;
    for (const p of this.state.proposals) if (['pending', 'approved'].includes(p.status)) p.status = 'invalidated';
    for (const c of this.state.changes) if (c.status === 'pending') c.status = 'invalidated';
  }
  verifySettingsKey(id: string, key: unknown) {
    if (this.blocked) fail(503, 'Settings writes are blocked pending offline recovery.');
    const member = this.member(id), bucket = `settings:${id}`, now = this.now(), attempts = this.state.attempts[bucket];
    if (attempts && attempts.until > now && attempts.count >= 5) fail(429, 'Too many settings-key attempts. Wait 15 minutes.');
    if (typeof key !== 'string' || key.length > 128 || !matches(`settings:${id}:${key}`, member.settingsKeyHash)) {
      this.state.attempts[bucket] = { count: attempts && attempts.until > now ? attempts.count + 1 : 1, until: attempts && attempts.until > now ? attempts.until : now + 15 * 60_000 };
      this.commit(); fail(403, 'Your separate settings key is invalid or has not been enrolled. Wipe approval keys cannot authorize settings.');
    }
    delete this.state.attempts[bucket];
  }
  async enrollSettingsKey(id: string, password: unknown) {
    const member = this.member(id), account = this.account(id), bucket = `settings-enroll:${id}`, now = this.now(), attempts = this.state.attempts[bucket];
    if (this.blocked) fail(503, 'Settings writes are blocked pending offline recovery.');
    if (member.settingsKeyHash) fail(409, 'A settings key is already enrolled. A lost-key reset requires two other administrators.');
    if (attempts && attempts.until > now && attempts.count >= 5) fail(429, 'Too many password attempts. Wait 15 minutes.');
    if (typeof password !== 'string' || !password || password.length > 1024) fail(400, 'Your current login password is required.');
    let verified = false;
    for (const credential of credentialValues(account, false)) if (await verifyCredentialAsync(password as string, credential)) { verified = true; break; }
    this.member(id);
    if (!verified || account.requiresPasswordReset || account.user?.requiresPasswordReset) {
      this.state.attempts[bucket] = { count: attempts && attempts.until > now ? attempts.count + 1 : 1, until: attempts && attempts.until > now ? attempts.until : now + 15 * 60_000 };
      this.commit(); fail(403, 'Your current login password could not be verified.');
    }
    const settingsKey = crypto.randomBytes(32).toString('base64url');
    member.settingsKeyHash = digest(`settings:${id}:${settingsKey}`); delete this.state.attempts[bucket]; this.commit();
    return { settingsKey, message: 'Save your settings key privately. It is different from your wipe approval key and will not be displayed again.' };
  }
  updateSettings(id: string, body: any) {
    this.verifySettingsKey(id, body?.settingsKey);
    let settings;
    try { settings = validatePlatformSettings(body); } catch (error: any) { fail(400, error.message); }
    Object.assign(this.getStore().platformSettings, settings);
    this.commit(); return { success: true, settings };
  }
  private fullRoster() {
    if (this.state.members.length !== 5 || this.state.members.some(m => !m.active || !m.keyHash || !this.account(m.id))) fail(409, 'Five active administrators, each with an enrolled private approval key, are required.');
  }
  view(id: string) {
    this.member(id);
    return { mainId: this.state.mainId, revision: this.state.revision, currentId: id,
      members: this.state.members.map(m => ({ id: m.id, slot: m.slot, active: m.active, keyEnrolled: !!m.keyHash, settingsKeyEnrolled: !!m.settingsKeyHash, name: accountData(this.account(m.id))?.name, email: accountData(this.account(m.id))?.email })),
      proposals: this.state.proposals.map(p => ({ id: p.id, scopes: p.scopes, reason: p.reason, createdBy: p.createdBy, createdAt: p.createdAt, expiresAt: p.expiresAt,
        status: ['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) <= this.now() ? 'expired' : p.status, preview: p.preview, votes: p.votes, roster: p.roster, executedAt: p.executedAt })),
      invitations: id === this.state.mainId ? this.state.invitations.filter(i => Date.parse(i.expiresAt) > this.now()).map(({ tokenHash, ...i }) => i) : [],
      changes: this.state.changes.map(({ revision, ...c }) => c), blocked: this.blocked };
  }
  async enroll(id: string, password: unknown) {
    const m = this.member(id), a = this.account(id);
    if (m.keyHash) fail(409, 'A private key is already enrolled. A reset requires a second administrator’s approval.');
    if (typeof password !== 'string' || password.length > 1024) fail(400, 'Your current login password is required.');
    let verified = false;
    for (const credential of credentialValues(a, false)) if (await verifyCredentialAsync(password as string, credential)) { verified = true; break; }
    this.member(id); // Password verification yields; recheck membership.
    if (!verified || a.requiresPasswordReset || a.user?.requiresPasswordReset) fail(403, 'Your current login password could not be verified.');
    const privateKey = crypto.randomBytes(32).toString('base64url'); m.keyHash = digest(`${id}:${privateKey}`);
    this.changedMembership(); this.commit();
    return { privateKey, message: 'Save this key privately. It will not be displayed again.' };
  }
  invite(id: string, body: any) {
    this.main(id); this.verifyKey(id, body.privateKey);
    this.state.invitations = this.state.invitations.filter(i => Date.parse(i.expiresAt) > this.now());
    if (this.state.members.length + this.state.invitations.length >= 5) fail(409, 'All five administrator slots are occupied or reserved.');
    const email = normalizeEmail(body.email), name = cleanText(body.name, 'Administrator name', 100);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail(400, 'A valid administrator email is required.');
    if (this.getStore().users.some((u: any) => normalizeEmail(accountData(u).email || u.email) === email) || this.state.invitations.some(i => i.email === email)) fail(409, 'This email already has an account or invitation. Use a separate administrator email.');
    const occupied = new Set([...this.state.members.map(m => m.slot), ...this.state.invitations.map(i => i.slot)]);
    const slot = [2, 3, 4, 5].find(n => !occupied.has(n)); if (!slot) fail(409, 'No administrator slot is available.');
    const token = crypto.randomBytes(32).toString('base64url');
    const invitation = { id: crypto.randomUUID(), email, name, slot: slot!, tokenHash: digest(token), expiresAt: new Date(this.now() + 24 * 3600_000).toISOString() };
    this.state.invitations.push(invitation); this.commit();
    return { invitationId: invitation.id, invitationToken: token, email, slot, expiresAt: invitation.expiresAt };
  }
  cancelInvitation(id: string, inviteId: string, key: unknown) {
    this.main(id); this.verifyKey(id, key);
    this.state.invitations = this.state.invitations.filter(i => i.id !== inviteId); this.commit(); return { success: true };
  }
  async acceptInvitation(body: any) {
    if (typeof body.invitationToken !== 'string' || body.invitationToken.length > 128) fail(400, 'A valid invitation is required.');
    const invitation = this.state.invitations.find(i => matches(body.invitationToken, i.tokenHash));
    if (!invitation || Date.parse(invitation.expiresAt) <= this.now()) fail(403, 'This invitation is invalid or has expired.');
    if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128 || body.password.startsWith('scrypt-sha256$') || /^[a-f0-9]{64}$/i.test(body.password)) fail(400, 'Choose a new login password of 12–128 characters.');
    if (this.state.members.length >= 5 || this.state.members.some(m => m.slot === invitation!.slot) || this.getStore().users.some((u: any) => normalizeEmail(accountData(u).email || u.email) === invitation!.email)) fail(409, 'The reserved administrator slot is no longer available.');
    const password = await hashCredentialAsync(body.password), id = crypto.randomUUID(), privateKey = crypto.randomBytes(32).toString('base64url');
    if (!this.state.invitations.includes(invitation!) || Date.parse(invitation!.expiresAt) <= this.now() || this.state.members.length >= 5 || this.state.members.some(m => m.slot === invitation!.slot) || this.getStore().users.some((u: any) => normalizeEmail(accountData(u).email || u.email) === invitation!.email)) fail(409, 'The invitation or reserved email changed during enrollment.');
    this.getStore().users.push({ id, role: 'admin', name: invitation!.name, email: invitation!.email, username: invitation!.email, password, isVerified: true, verificationStatus: 'approved', accountStatus: 'Active' });
    this.state.members.push({ id, slot: invitation!.slot, active: true, keyHash: digest(`${id}:${privateKey}`) });
    this.state.invitations = this.state.invitations.filter(i => i.id !== invitation!.id); this.changedMembership(); this.commit();
    return { id, slot: invitation!.slot, email: invitation!.email, privateKey, message: 'Administrator enrolled. Save your private key, then sign in.' };
  }
  setActive(id: string, targetId: string, active: unknown, key: unknown) {
    this.main(id); this.verifyKey(id, key);
    if (typeof active !== 'boolean') fail(400, 'Active must be a boolean.');
    const m = this.state.members.find(m => m.id === targetId); if (!m) fail(404, 'Administrator not found.');
    if (targetId === this.state.mainId) fail(403, 'Administrator #1 cannot be suspended or deleted.');
    m!.active = active as boolean; clearRecordSession(this.account(targetId)); this.changedMembership(); this.commit(); return { success: true };
  }
  requestChange(id: string, targetId: string, body: any) {
    if (body.action === 'remove') this.main(id); else this.member(id);
    this.verifyKey(id, body.privateKey);
    if (!['remove', 'reset-key', 'reset-settings-key'].includes(body.action)) fail(400, 'Unknown administrator change.');
    if (!this.state.members.some(m => m.id === targetId)) fail(404, 'Administrator not found.');
    if (body.action !== 'remove' && id === targetId) fail(403, 'Two different administrators must authorize a lost-key reset for its owner.');
    if (body.action === 'remove' && targetId === this.state.mainId) fail(403, 'Administrator #1 cannot be deleted.');
    const change: Change = { id: crypto.randomUUID(), targetId, action: body.action, reason: cleanText(body.reason, 'Reason'), requestedBy: id,
      revision: this.state.revision, expiresAt: new Date(this.now() + 24 * 3600_000).toISOString(), status: 'pending', votes: [this.vote(id, 'approved')] };
    this.state.changes = [...this.state.changes.slice(-99), change]; this.commit(); return { id: change.id };
  }
  decideChange(id: string, changeId: string, body: any) {
    this.verifyKey(id, body.privateKey);
    const c = this.state.changes.find(c => c.id === changeId); if (!c) fail(404, 'Administrator change not found.');
    if (c!.status !== 'pending' || c!.revision !== this.state.revision || Date.parse(c!.expiresAt) <= this.now()) fail(409, 'This administrator change is no longer pending.');
    if (id === c!.requestedBy || id === c!.targetId || c!.votes.some(v => v.id === id)) fail(403, 'A different existing administrator must independently approve this change.');
    if (!['approved', 'rejected'].includes(body.decision)) fail(400, 'Select approve or reject.');
    c!.votes.push(this.vote(id, body.decision));
    if (body.decision === 'rejected') c!.status = 'rejected';
    else {
      const target = this.state.members.find(m => m.id === c!.targetId)!;
      if (c!.action === 'remove') {
        const index = this.getStore().users.findIndex((u: any) => accountRole(u) === 'admin' && accountId(u) === target.id);
        if (index >= 0) this.getStore().users.splice(index, 1);
        this.state.members = this.state.members.filter(m => m.id !== target.id); delete this.state.attempts[target.id];
      } else {
        if (c!.action === 'reset-settings-key') { delete target.settingsKeyHash; delete this.state.attempts[`settings:${target.id}`]; delete this.state.attempts[`settings-enroll:${target.id}`]; }
        else delete target.keyHash;
        clearRecordSession(this.account(target.id));
      }
      c!.status = 'approved'; this.changedMembership();
    }
    this.commit(); return { success: true };
  }
  preview(id: string, input: unknown) {
    this.member(id); let scopes: WipeScope[];
    try { scopes = parseWipeScopes(input); } catch (error: any) { return fail(400, error.message); }
    const plan = buildWipePlan(this.getStore(), scopes), media = this.recovery.manifest(this.getStore(), plan);
    const fingerprint = digest(`${plan.fingerprint}:${media.digest}:${this.state.revision}`);
    return { scopes, counts: plan.counts, uploadCount: media.files.length, uploadBytes: media.size, notes: plan.notes, fingerprint, revision: this.state.revision };
  }
  propose(id: string, body: any) {
    this.fullRoster(); this.verifyKey(id, body.privateKey);
    const preview = this.preview(id, body.scopes);
    if (typeof body.fingerprint !== 'string' || body.fingerprint !== preview.fingerprint) fail(409, 'The deletion preview has changed. Review a fresh preview before submitting.');
    if (this.state.proposals.filter(p => ['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) > this.now()).length >= 10) fail(429, 'At most ten live wipe proposals are allowed.');
    const p: Proposal = { id: crypto.randomUUID(), scopes: preview.scopes, reason: cleanText(body.reason, 'Reason'), createdBy: id,
      createdAt: new Date(this.now()).toISOString(), expiresAt: new Date(this.now() + 24 * 3600_000).toISOString(), revision: this.state.revision,
      status: 'pending', preview: { counts: preview.counts, uploadCount: preview.uploadCount, uploadBytes: preview.uploadBytes, notes: preview.notes }, fingerprint: preview.fingerprint,
      votes: [this.vote(id, 'approved')], roster: this.state.members.map(m => ({ id: m.id, slot: m.slot, name: accountData(this.account(m.id)).name || accountData(this.account(m.id)).email })) };
    this.state.proposals = [...this.state.proposals.slice(-99), p]; this.commit(); return { id: p.id };
  }
  private pending(id: string): Proposal {
    const p = this.state.proposals.find(p => p.id === id); if (!p) return fail(404, 'Wipe proposal not found.');
    if (Date.parse(p.expiresAt) <= this.now() && ['pending', 'approved'].includes(p.status)) { p.status = 'expired'; this.commit(); }
    if (!['pending', 'approved'].includes(p.status) || p.revision !== this.state.revision) return fail(409, 'This proposal is no longer eligible for approval or execution.');
    return p;
  }
  decide(id: string, proposalId: string, body: any) {
    this.fullRoster(); this.verifyKey(id, body.privateKey); const p = this.pending(proposalId);
    if (p.votes.some(v => v.id === id)) fail(409, 'You have already voted on this proposal.');
    if (!['approved', 'rejected'].includes(body.decision)) fail(400, 'Select approve or reject.');
    if (this.preview(id, p.scopes).fingerprint !== p.fingerprint) { p.status = 'invalidated'; this.commit(); fail(409, 'Selected data changed. A new deletion preview and proposal are required.'); }
    p.votes.push(this.vote(id, body.decision));
    p.status = body.decision === 'rejected' ? 'rejected' : p.votes.length === 5 ? 'approved' : 'pending'; this.commit(); return { success: true, status: p.status };
  }
  execute(id: string, proposalId: string, body: any) {
    this.main(id); this.fullRoster(); this.verifyKey(id, body.privateKey);
    if (this.blocked) fail(503, 'Execution is blocked pending offline recovery inspection.');
    if (body.confirmation !== 'WIPE APPROVED DATA') fail(400, 'Type WIPE APPROVED DATA to execute the approved proposal.');
    const p = this.pending(proposalId);
    if (p.status !== 'approved' || p.votes.length !== 5 || new Set(p.votes.map(v => v.id)).size !== 5 || p.votes.some(v => v.decision !== 'approved') || this.state.members.some(m => !p.votes.some(v => v.id === m.id))) fail(409, 'Exactly five separate approvals are required.');
    if (this.otherWrites() > 0) fail(409, 'Other write requests are still running. Try execution again when they have completed.');
    if (this.preview(id, p.scopes).fingerprint !== p.fingerprint) { p.status = 'invalidated'; this.commit(); fail(409, 'Selected data changed after approval. Submit a new proposal.'); }
    const store = this.getStore(), plan = buildWipePlan(store, p.scopes), backup = this.recovery.backup(p.id, store, plan);
    this.recovery.audit({ event: 'prepared', proposalId: p.id, scopes: p.scopes, counts: p.preview.counts, administratorIds: p.votes.map(v => v.id), backup: backup.file });
    this.recovery.blockExecution(); // Durable crash marker precedes all destructive steps.
    let rollbackMedia = () => {};
    try {
      rollbackMedia = backup.stage();
      applyWipePlan(store, plan); p.status = 'executed'; p.executedAt = new Date(this.now()).toISOString(); p.backup = backup.file;
      for (const other of this.state.proposals) if (other.id !== p.id && ['pending', 'approved'].includes(other.status)) other.status = 'invalidated';
      this.commit();
    } catch {
      this.blocked = true;
      try { rollbackMedia(); } catch { /* Verified recovery archive remains authoritative. */ }
      fail(503, 'Database commit failed. Further writes are blocked. Stop the server and inspect the encrypted recovery archive offline.');
    }
    // Commit is durable before removing staged media. A cleanup failure never repeats the wipe.
    let cleanupPending = false;
    try { backup.cleanup(); this.recovery.audit({ event: 'executed', proposalId: p.id, scopes: p.scopes, administratorIds: p.votes.map(v => v.id) }); this.recovery.unblockExecution(); } catch { cleanupPending = true; this.blocked = true; }
    return { success: true, status: 'executed', cleanupPending, message: 'Approved data wiped. Administrator accounts and the recovery audit are preserved.' };
  }
}
