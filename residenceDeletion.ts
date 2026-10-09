import crypto from 'node:crypto';
import { accountData, accountId, accountRole, normalizeEmail } from './accountSecurity.js';
import { primaryAccountRecipient } from './accountSubmissionNotifications.js';
import { buildWipePlan, applyWipePlan } from './adminWipeScope.js';
import { reconcileDeletedAccountPolicies } from './accountModeration.js';
import type { WipeRecovery } from './adminWipeRecovery.js';

export class ResidenceDeletionError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new ResidenceDeletionError(status, message); };
const hash = (value: any) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
type RosterMember = { id: string; slot: number; name: string };
type Dependencies = { getStore: () => any; commit: () => void; guard: (id: string, key: unknown, main?: boolean) => void;
  roster: () => RosterMember[]; recovery: WipeRecovery; busy: () => number; now: () => number; block: () => void };

export function registrationBan(store: any, actor: any, kind: 'hostel' | 'manager_account', now = Date.now()): any {
  if (!actor?.id || actor.role === 'admin') return undefined;
  return (store.adminGovernance?.registrationBans || []).find((ban: any) => ban.accountId === actor.id && ban.accountRole === actor.role && ban.kind === kind && Date.parse(ban.until) > now);
}

export class ResidenceDeletion {
  constructor(private deps: Dependencies) {}
  private get store() { return this.deps.getStore(); }
  private get state() { return this.store.adminGovernance; }
  private options(body: any) {
    if (typeof body?.hostelId !== 'string' || !body.hostelId.trim() || body.deleteHostel !== true || typeof body.deleteManager !== 'boolean') fail(400, 'Select a hostel, and choose whether its manager account is also deleted.');
    const amount = body.ban?.amount ?? 0, unit = body.ban?.unit ?? 'days';
    const units: Record<string, number> = { hours: 3600_000, days: 86400_000, weeks: 7 * 86400_000, months: 30 * 86400_000, years: 365 * 86400_000 };
    if (!Number.isSafeInteger(amount) || amount < 0 || !Object.hasOwn(units, unit) || amount * units[unit] > 100 * units.years) fail(400, 'Choose a registration ban from zero to 100 years, using a whole number and a supported time unit.');
    return { hostelId: body.hostelId.trim(), deleteHostel: true, deleteManager: body.deleteManager, ban: { amount, unit, milliseconds: amount * units[unit] } };
  }
  private plan(input: any) {
    const options = this.options(input), hostel = (this.store.hostels || []).find((h: any) => h.id === options.hostelId);
    if (!hostel) fail(404, 'Hostel no longer exists.');
    const managers = (this.store.users || []).filter((u: any) => accountRole(u) === 'manager' &&
      (hostel.managerId || hostel.assignedManagerId ? accountId(u) === (hostel.managerId || hostel.assignedManagerId) : normalizeEmail(accountData(u).email || u.email) === normalizeEmail(hostel.managerEmail) && !!hostel.managerEmail));
    const managerIds = [...new Set<string>(managers.map(accountId))];
    if (managerIds.length !== 1 && (options.deleteManager || options.ban.amount)) fail(409, 'The manager assignment must identify one account before deleting it or imposing a registration ban.');
    const manager = managers[0] ? { ...managers[0], ...accountData(managers[0]) } : undefined;
    const recipient = manager ? primaryAccountRecipient(manager, this.store, 'manager') : {};
    if (options.deleteManager && options.ban.amount && !recipient.targetAccountId) fail(409, 'A saved primary owner is required to ban new manager-account registration.');
    const plan = buildWipePlan(this.store, [], { accountIds: options.deleteManager ? managerIds : [], hostelIds: [hostel.id] });
    // Retained managers must not carry a stale assignment to a removed property.
    const homes = new Set(plan.removed.hostels.map((h: any) => h.id));
    plan.kept.users = plan.kept.users.map((entry: any) => {
      if (accountRole(entry) !== 'manager' || !homes.has(accountData(entry).hostelId || entry.hostelId)) return entry;
      const remaining = plan.kept.hostels.find((home: any) => (home.managerId || home.assignedManagerId) === accountId(entry));
      const copy = { ...entry }, data = { ...accountData(entry), hasApprovedHostel: remaining?.isApproved === true, hostelStatus: remaining ? remaining.approvalStatus || remaining.status : 'None' };
      delete data.hostelId; delete data.hostelName;
      if (remaining) { data.hostelId = remaining.id; data.hostelName = remaining.name; }
      if (entry.user) { copy.user = data; delete copy.hostelId; delete copy.hostelName; return copy; }
      return data;
    });
    const media = this.deps.recovery.manifest(this.store, plan);
    const fingerprint = hash({ plan: plan.fingerprint, media: media.digest, options, owner: recipient.targetAccountId, managerId: manager?.id, revision: this.state.revision });
    const preview = { ...options, hostelName: hostel.name, managerId: manager?.id, managerName: manager?.name,
      primaryOwnerId: recipient.targetAccountId, counts: plan.counts, uploadCount: media.files.length, uploadBytes: media.size,
      residences: plan.removed.hostels.map((home: any) => ({ id: home.id, name: home.name })),
      accounts: plan.removed.users.map((entry: any) => ({ id: accountId(entry), role: accountRole(entry), name: accountData(entry).name || accountData(entry).email || accountId(entry) })),
      notes: [options.deleteManager ? 'The linked manager account, its owned residences, staff and activated room accounts are included.' : 'The manager account stays available for sign-in. This hostel, its staff, activated room accounts and related operational records are removed.',
        'Primary users, unrelated accounts and administrator accounts remain. An encrypted recovery backup is saved before execution.',
        options.ban.amount ? `${options.ban.amount} ${options.ban.unit} without ${options.deleteManager ? 'new manager-account registration by the primary owner' : 'new hostel registration by the retained manager'}.` : 'No new registration ban.'], fingerprint };
    return { options, plan, preview, manager, recipient };
  }
  preview(body: any) { return this.plan(body).preview; }
  list() {
    return (this.state.residenceProposals || []).map(({ fingerprint, revision, backup, ...p }: any) => ({ ...p,
      status: ['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) <= this.deps.now() ? 'expired' : p.status }));
  }
  propose(id: string, body: any) {
    this.deps.guard(id, body.privateKey);
    if (this.deps.roster().length < 2) fail(409, 'At least two active administrators are required.');
    const { preview, options } = this.plan(body);
    if (body.fingerprint !== preview.fingerprint) fail(409, 'The deletion preview changed. Review it again.');
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1000) fail(400, 'Explain the deletion in 3–1000 characters.');
    const proposals = this.state.residenceProposals ||= [];
    if (proposals.some((p: any) => p.options.hostelId === options.hostelId && ['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) > this.deps.now())) fail(409, 'This hostel already has a live deletion proposal.');
    const actor = this.deps.roster().find(m => m.id === id)!;
    const now = new Date(this.deps.now()).toISOString();
    const { fingerprint, ...visiblePreview } = preview;
    const p = { id: crypto.randomUUID(), options, preview: visiblePreview, fingerprint, revision: this.state.revision, reason: body.reason.trim(), createdBy: id,
      createdAt: now, expiresAt: new Date(this.deps.now() + 86400_000).toISOString(), status: 'pending',
      votes: [{ ...actor, decision: 'approved', at: now }] };
    this.state.residenceProposals = [...proposals.slice(-99), p]; this.deps.commit(); return { id: p.id, status: p.status };
  }
  private pending(id: string) {
    const p = (this.state.residenceProposals || []).find((p: any) => p.id === id);
    if (!p) fail(404, 'Hostel deletion proposal not found.');
    if (['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) <= this.deps.now()) { p.status = 'expired'; this.deps.commit(); }
    if (!['pending', 'approved'].includes(p.status) || p.revision !== this.state.revision) fail(409, 'This proposal is no longer eligible.');
    let current: ReturnType<ResidenceDeletion['plan']>;
    try { current = this.plan(p.options); } catch (error) { if (error instanceof ResidenceDeletionError && [404, 409].includes(error.status)) { p.status = 'invalidated'; this.deps.commit(); } throw error; }
    if (p.fingerprint !== current.preview.fingerprint) { p.status = 'invalidated'; this.deps.commit(); fail(409, 'Selected records or ownership changed. Submit a new reviewed proposal.'); }
    return { p, current };
  }
  vote(id: string, proposalId: string, body: any) {
    this.deps.guard(id, body.privateKey);
    const { p } = this.pending(proposalId);
    if (!['approved', 'rejected'].includes(body.decision)) fail(400, 'Choose approve or reject.');
    if (p.votes.some((v: any) => v.id === id)) fail(409, 'You have already voted.');
    p.votes.push({ ...this.deps.roster().find(m => m.id === id), decision: body.decision, at: new Date(this.deps.now()).toISOString() });
    p.status = body.decision === 'rejected' ? 'rejected' : p.votes.length >= 2 ? 'approved' : 'pending';
    this.deps.commit(); return { success: true, status: p.status };
  }
  rejectFinal(id: string, proposalId: string, body: any) {
    this.deps.guard(id, body.privateKey, true);
    const { p } = this.pending(proposalId);
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1000) fail(400, 'Explain the final rejection in 3–1000 characters.');
    Object.assign(p, { status: 'rejected', finalDecisionBy: id, finalDecisionAt: new Date(this.deps.now()).toISOString(), finalReason: body.reason.trim() });
    this.deps.commit(); return { success: true, status: 'rejected', message: 'Founder rejected the deletion. The hostel remains.' };
  }
  execute(id: string, proposalId: string, body: any) {
    this.deps.guard(id, body.privateKey, true);
    const { p, current } = this.pending(proposalId);
    if (body.confirmation !== 'DELETE APPROVED HOSTEL') fail(400, 'Type DELETE APPROVED HOSTEL for the final action.');
    const activeIds = new Set(this.deps.roster().map(m => m.id));
    const approvals = p.votes.filter((v: any) => v.decision === 'approved' && activeIds.has(v.id));
    if (p.status !== 'approved' || new Set(approvals.map((v: any) => v.id)).size < 2 || p.votes.some((v: any) => v.decision === 'rejected')) fail(409, 'Two distinct active administrator approvals are required before the founder’s final action.');
    if (this.deps.busy() > 0) fail(409, 'Other writes are still running. Try the final action again when they finish.');
    // Founder execution is an explicit, keyed consent even if others supplied the quorum.
    if (!approvals.some((v: any) => v.id === id)) p.votes.push({ ...this.deps.roster().find(m => m.id === id), decision: 'approved', at: new Date(this.deps.now()).toISOString() });
    const { plan, manager, recipient, options } = current;
    const backup = this.deps.recovery.backup(p.id, this.store, plan);
    this.deps.recovery.audit({ event: 'hostel-deletion-prepared', proposalId: p.id, counts: plan.counts, administratorIds: p.votes.map((v: any) => v.id), backup: backup.file });
    this.deps.recovery.blockExecution(); let rollback = () => {};
    try {
      rollback = backup.stage(); applyWipePlan(this.store, plan);
      const now = this.deps.now();
      if (options.ban.amount) {
        const bans = this.state.registrationBans ||= [];
        bans.push({ id: crypto.randomUUID(), proposalId: p.id, kind: options.deleteManager ? 'manager_account' : 'hostel', accountId: options.deleteManager ? recipient.targetAccountId : manager.id,
          accountRole: options.deleteManager ? 'user' : 'manager', until: new Date(now + options.ban.milliseconds).toISOString(), reason: p.reason, appliedBy: id });
      }
      const message = `Your hostel "${p.preview.hostelName}" has been deleted by PineVela administrators. You can no longer manage this hostel. ${options.deleteManager ? 'Your linked manager account was also deleted.' : 'Your manager account remains available for sign-in.'}${options.ban.amount ? ` New ${options.deleteManager ? 'manager-account' : 'hostel'} registration is blocked for ${options.ban.amount} ${options.ban.unit}.` : ''} Reason: ${p.reason}`;
      const targets = [recipient, ...(!options.deleteManager && manager ? [{ targetRole: 'manager', targetAccountId: manager.id, userId: manager.id }] : [])].filter(t => t.targetAccountId);
      for (const target of targets) (this.store.notifications ||= []).unshift({ ...target, id: crypto.randomUUID(), adminMessage: true, senderRole: 'admin', title: 'Hostel Deleted', message, type: 'warning', category: 'account_lifecycle', date: new Date(now).toISOString(), read: false });
      Object.assign(p, { status: 'executed', executedBy: id, executedAt: new Date(now).toISOString(), backup: backup.file });
      reconcileDeletedAccountPolicies(this.store); this.deps.commit();
    } catch { this.deps.block(); try { rollback(); } catch {} fail(503, 'Deletion could not be committed. Writes are blocked pending offline recovery.'); }
    let cleanupPending = false;
    try { backup.cleanup(); this.deps.recovery.audit({ event: 'hostel-deleted', proposalId: p.id, administratorIds: p.votes.map((v: any) => v.id) }); this.deps.recovery.unblockExecution(); }
    catch { cleanupPending = true; this.deps.block(); }
    return { success: true, status: 'executed', cleanupPending, message: 'Approved hostel deletion completed. Account recipients have been notified.' };
  }
}
