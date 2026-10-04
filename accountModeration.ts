import crypto from 'node:crypto';
import { accountData, accountId, accountRole, normalizeEmail } from './accountSecurity.js';
import { clearRecordSession, sessionMatches, tokenDigest } from './sessionSecurity.js';
import { applyWipePlan, buildWipePlan } from './adminWipeScope.js';
import type { WipeRecovery } from './adminWipeRecovery.js';
import { ACCOUNT_FEATURES, type AccountFeature } from './accountFeatures.js';
export class AccountModerationError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new AccountModerationError(status, message); };
const digest = (value: any) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyFor = (id: string, role: string) => `${role}:${id}`;
type Account = { id: string; role: string; name: string; email: string; phone?: string; registeredAt?: string; status?: string; parentId?: string; records: any[]; marketIds: string[]; aliases: string[]; hostelName?: string };
export type AccountPolicy = { revision: number; reason: string; proposalId: string; appliedAt: string; appliedBy: string; banUntil?: string; features: AccountFeature[]; deniedSessions?: { tokenHash: string; expiresAt: number }[] };
type Vote = { id: string; slot: number; name: string; decision: 'approved' | 'rejected'; at: string };
export type AccountProposal = { id: string; targetId: string; targetRole: string; targetName: string; action: 'ban' | 'restrict' | 'restore' | 'delete'; reason: string; duration?: { amount: number; unit: string; milliseconds: number }; features: AccountFeature[]; fingerprint: string; preview?: any; revision: number; createdBy: string; createdAt: string; expiresAt: string; status: 'pending' | 'approved' | 'rejected' | 'expired' | 'invalidated' | 'applied'; roster: { id: string; slot: number; name: string }[]; votes: Vote[]; appliedAt?: string; appliedBy?: string };

/** Credential identities, not email addresses or unapproved registration requests. */
export function moderationAccounts(store: any): Account[] {
  const accounts = new Map<string, Account>();
  const add = (record: any, role = accountRole(record), id = accountId(record)) => {
    if (!id || !role) return;
    const d = accountData(record), key = keyFor(id, role), existing = accounts.get(key);
    if (existing) { if (!existing.records.includes(record)) existing.records.push(record); return; }
    accounts.set(key, { id, role, name: d.name || d.fullName || record.fullName || d.username || '', email: normalizeEmail(d.email || record.email || record.studentEmail),
      phone: d.phone || record.phone, registeredAt: d.createdAt || d.registeredAt || record.createdAt, status: d.status || record.status,
      parentId: d.parentUserId || record.parentUserId, records: [record], marketIds: [], aliases: [id], hostelName: d.hostelName || record.hostelName });
  };
  for (const u of store.users || []) if (accountRole(u) !== 'merchant') add(u);
  for (const o of store.verificationTeams || []) add(o, 'verification_team', o.id);
  const apps = store.digitalMarketApplications || [], markets = store.digitalMarketStores || [];
  for (const app of apps) {
    const linked = markets.filter((m: any) => m.applicationId === app.id || m.id === app.storeId || normalizeEmail(m.studentEmail) === normalizeEmail(app.studentEmail) && (!m.userId || !app.userId || m.userId === app.userId));
    add(app, 'merchant', `merchant:${app.id}`);
    const a = accounts.get(keyFor(`merchant:${app.id}`, 'merchant'))!;
    a.parentId = app.parentUserId || app.userId; a.name = app.fullName || app.storeName || a.name;
    a.records.push(...linked); a.marketIds = [...new Set([app.id, ...linked.map((m: any) => m.id)])];
  }
  for (const m of markets) if (![...accounts.values()].some(a => a.role === 'merchant' && a.records.includes(m))) {
    add(m, 'merchant', `merchant:${m.id}`); const a = accounts.get(keyFor(`merchant:${m.id}`, 'merchant'))!;
    a.parentId = m.parentUserId || m.userId; a.marketIds = [m.id]; a.name = m.storeName || a.name;
  }
  for (const u of store.users || []) if (accountRole(u) === 'merchant') {
    const d = accountData(u), linked = [...accounts.values()].filter(a => a.role === 'merchant' && (a.id === accountId(u) || a.marketIds.includes(d.merchantStoreId || u.merchantStoreId) || a.email && a.email === normalizeEmail(d.email) && (!d.parentUserId || a.parentId === d.parentUserId)));
    if (linked.length === 1) { linked[0].records.push(u); linked[0].aliases.push(accountId(u)); }
    else add(u);
  }
  return [...accounts.values()];
}
export function accountFor(store: any, id: string, role: string): Account | undefined {
  return moderationAccounts(store).find(a => a.role === role && a.aliases.includes(id));
}
function lineage(store: any, id: string, role: string): Account[] {
  const all = moderationAccounts(store), result: Account[] = [], seen = new Set<string>();
  let current = all.find(a => a.role === role && a.aliases.includes(id));
  while (current && !seen.has(keyFor(current.id, current.role))) {
    result.push(current); seen.add(keyFor(current.id, current.role));
    const data = accountData(current.records[0]);
    const manager = current.role === 'staff' ? data.managerId || current.records[0].managerId || (store.staff || []).find((s: any) => s.userId === current!.id || s.id === current!.id || s.id === data.staffId)?.managerId : undefined;
    const parent = current.parentId || manager, parentRole = current.parentId ? 'user' : 'manager';
    current = all.find(a => a.id === parent && a.role === parentRole);
  }
  return result;
}
export function accountAccess(store: any, id: string, role: string, now = Date.now()) {
  const policies: Record<string, AccountPolicy> = store.adminGovernance?.accountPolicies || {};
  if (!Object.keys(policies).length) return { banned: false, reason: undefined as string | undefined, until: undefined as string | undefined, remainingSeconds: 0, restrictions: [] as { features: AccountFeature[]; reason: string; inherited: boolean; appliedAt: string }[] };
  const applicable = lineage(store, id, role).map(a => ({ account: a, policy: policies[keyFor(a.id, a.role)] })).filter(p => p.policy);
  const banned = applicable.filter(p => p.policy.banUntil && Date.parse(p.policy.banUntil) > now).sort((a, b) => Date.parse(b.policy.banUntil!) - Date.parse(a.policy.banUntil!))[0];
  return { banned: !!banned, reason: banned?.policy.reason, until: banned?.policy.banUntil,
    remainingSeconds: banned ? Math.ceil((Date.parse(banned.policy.banUntil!) - now) / 1000) : 0,
    restrictions: applicable.filter(p => p.policy.features.length).map(p => ({ features: p.policy.features, reason: p.policy.reason, inherited: p.account.role !== role || !p.account.aliases.includes(id), appliedAt: p.policy.appliedAt })) };
}
export function banResponse(access: ReturnType<typeof accountAccess>) {
  return { error: `This account is banned until ${access.until}. Reason: ${access.reason}`, accountBanned: true, accountAccess: access };
}
/** The allowlist covers canonical endpoints and aliases before their handlers run. */
export function restrictedFeaturesForRequest(method: string, path: string): AccountFeature[] {
  if (method.toUpperCase() === 'GET' && path.toLowerCase().replace(/\/+$/, '') === '/api/digital-market/messages') return ['messaging'];
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return [];
  const p = path.toLowerCase().replace(/\/+$/, ''), features: AccountFeature[] = [];
  if (['/api/auth/register-manager', '/api/auth/register-manager-account', '/api/manager-verifications/submit', '/api/digital-market/register', '/api/users/register', '/api/room-keys/claim', '/api/residents/onboard', '/api/staff'].includes(p)) features.push('subaccounts');
  if (['/api/room-keys/claim', '/api/residents/onboard', '/api/room-keys/verify', '/api/student/add-room'].includes(p)) features.push('rooms');
  if (method.toUpperCase() === 'POST' && p === '/api/digital-market/orders') features.push('orders');
  if (p.startsWith('/api/digital-market/products') || p === '/api/storage/upload-market-image' || p === '/api/storage/upload-market-images') features.push('publishing');
  if (p === '/api/digital-market/messages') features.push('messaging');
  if (method.toUpperCase() === 'POST' && p === '/api/issue-reports') features.push('maintenance');
  return features;
}
export function accountRestriction(store: any, id: string, role: string, method: string, path: string) {
  const access = accountAccess(store, id, role), features = restrictedFeaturesForRequest(method, path);
  const restriction = access.restrictions.find(r => r.features.some(f => features.includes(f)));
  return restriction ? { error: `This feature is restricted. Reason: ${restriction.reason}`, accountRestricted: true, accountAccess: access } : undefined;
}
export function tokenAccount(store: any, token: string): Account | undefined {
  return token ? moderationAccounts(store).find(a => a.records.some(r => sessionMatches(r, token))) : undefined;
}
export function governedMarketBanned(store: any, storeId: string): boolean {
  if (!Object.keys(store.adminGovernance?.accountPolicies || {}).length) return false;
  return moderationAccounts(store).some(a => a.role === 'merchant' && a.marketIds.includes(storeId) && accountAccess(store, a.id, a.role).banned);
}
/** Revoked tokens reveal only the ban notice, never grant authorization or revive after expiry. */
export function revokedBanNotice(store: any, token: string) {
  if (!token || token.length > 512) return;
  const hash = tokenDigest(token), now = Date.now();
  for (const [key, policy] of Object.entries(store.adminGovernance?.accountPolicies || {}) as [string, AccountPolicy][]) {
    if (!policy.deniedSessions?.some(s => s.tokenHash === hash && s.expiresAt > now)) continue;
    const a = moderationAccounts(store).find(a => keyFor(a.id, a.role) === key);
    if (a) { const access = accountAccess(store, a.id, a.role); if (access.banned) return banResponse(access); }
  }
}
export function reconcileDeletedAccountPolicies(store: any) {
  const retained = new Set(moderationAccounts(store).map(a => keyFor(a.id, a.role))), state = store.adminGovernance;
  if (!state) return;
  for (const key of Object.keys(state.accountPolicies || {})) if (!retained.has(key)) delete state.accountPolicies[key];
  for (const p of state.accountProposals || []) if (!retained.has(keyFor(p.targetId, p.targetRole))) {
    p.targetName = 'Deleted account';
    if (['pending', 'approved'].includes(p.status)) p.status = 'invalidated';
  }
}

type Dependencies = { getStore: () => any; commit: () => void; guard: (id: string, key: unknown, main?: boolean) => void; roster: () => { id: string; slot: number; name: string }[]; recovery: WipeRecovery; busy: () => number; now: () => number; block: () => void };
export class AccountModeration {
  constructor(private deps: Dependencies) {}
  private get store() { return this.deps.getStore(); }
  private get state() { return this.store.adminGovernance; }
  private target(id: unknown, role: unknown) {
    if (typeof id !== 'string' || id.length > 200 || typeof role !== 'string') return fail(400, 'Select a registered account.');
    const a = accountFor(this.store, id, role); if (!a) return fail(404, 'Registered account not found.');
    if (a.role === 'admin') return fail(403, 'Administrator accounts are protected. Use administrator membership governance.');
    return a;
  }
  private deletion(a: Account) { return buildWipePlan(this.store, [], { accountIds: a.aliases, marketIds: a.marketIds, officerIds: a.role === 'verification_team' ? [a.id, ...a.records.map(r => r.officerId).filter(Boolean)] : [] }); }
  private fingerprint(a: Account, deleting: boolean) {
    const identities = lineage(this.store, a.id, a.role).map(a => ({ id: a.id, role: a.role, policy: this.state.accountPolicies?.[keyFor(a.id, a.role)]?.revision || 0 }));
    return digest({ identities, ...(deleting ? { data: this.deletion(a).fingerprint, media: this.deps.recovery.manifest(this.store, this.deletion(a)).digest } : {}) });
  }
  preview(id: string, role: string) {
    const a = this.target(id, role), plan = this.deletion(a), media = this.deps.recovery.manifest(this.store, plan);
    return { fingerprint: this.fingerprint(a, true), counts: plan.counts, uploadCount: media.files.length, notes: plan.notes };
  }
  propose(id: string, body: any) {
    this.deps.guard(id, body.privateKey); const a = this.target(body.targetId, body.targetRole);
    if (!['ban', 'restrict', 'restore', 'delete'].includes(body.action)) fail(400, 'Select a valid account action.');
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 500) fail(400, 'A reason of 3–500 characters is required.');
    const action = body.action, features: AccountFeature[] = [], duration = action === 'ban' ? this.duration(body.duration) : undefined;
    if (action === 'restrict') {
      if (!Array.isArray(body.features) || !body.features.length || body.features.some((f: any) => !Object.hasOwn(ACCOUNT_FEATURES, f)) || new Set(body.features).size !== body.features.length) fail(400, 'Select distinct supported features.');
      features.push(...body.features);
    }
    const fingerprint = this.fingerprint(a, action === 'delete');
    if (action === 'delete' && body.fingerprint !== fingerprint) fail(409, 'Review a fresh account deletion preview before submitting.');
    const list: AccountProposal[] = this.state.accountProposals || [];
    if (list.some(p => p.targetId === a.id && p.targetRole === a.role && ['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) > this.deps.now())) fail(409, 'This account already has an active proposal.');
    if (list.filter(p => ['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) > this.deps.now()).length >= 10) fail(429, 'At most ten active account proposals are allowed.');
    const now = new Date(this.deps.now()).toISOString(), roster = this.deps.roster(), actor = roster.find(m => m.id === id)!;
    const p: AccountProposal = { id: crypto.randomUUID(), targetId: a.id, targetRole: a.role, targetName: a.name, action, reason: body.reason.trim(), features, duration, fingerprint,
      preview: action === 'delete' ? this.preview(a.id, a.role) : undefined, revision: this.state.revision, createdBy: id, createdAt: now, expiresAt: new Date(this.deps.now() + 86400_000).toISOString(), status: 'pending', roster, votes: [{ ...actor, decision: 'approved', at: now }] };
    this.state.accountProposals = [...list.slice(-99), p]; this.deps.commit(); return { id: p.id, status: p.status };
  }
  private duration(value: any) {
    const units: Record<string, number> = { hours: 3600_000, days: 86400_000, weeks: 7 * 86400_000, months: 30 * 86400_000, years: 365 * 86400_000 };
    if (!value || typeof value.amount !== 'number' || !Number.isSafeInteger(value.amount) || value.amount < 1 || typeof value.unit !== 'string' || !Object.hasOwn(units, value.unit)) return fail(400, 'Ban duration must be a positive whole number in hours, days, weeks, months or years.');
    const milliseconds = value.amount * units[value.unit];
    if (!Number.isSafeInteger(milliseconds) || milliseconds > 100 * units.years) fail(400, 'Ban duration cannot exceed 100 years.');
    return { amount: value.amount, unit: value.unit, milliseconds };
  }
  private pending(proposalId: string) {
    const p = (this.state.accountProposals || []).find((p: AccountProposal) => p.id === proposalId) as AccountProposal;
    if (!p) return fail(404, 'Account proposal not found.');
    if (['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) <= this.deps.now()) { p.status = 'expired'; this.deps.commit(); }
    if (!['pending', 'approved'].includes(p.status) || p.revision !== this.state.revision) fail(409, 'This proposal is no longer eligible.');
    const a = this.target(p.targetId, p.targetRole);
    if (this.fingerprint(a, p.action === 'delete') !== p.fingerprint) { p.status = 'invalidated'; this.deps.commit(); fail(409, 'The account or deletion data changed. Submit a new proposal.'); }
    return p;
  }
  vote(id: string, proposalId: string, body: any) {
    this.deps.guard(id, body.privateKey); const p = this.pending(proposalId);
    if (p.votes.some(v => v.id === id)) fail(409, 'You have already voted.');
    if (!['approved', 'rejected'].includes(body.decision)) fail(400, 'Select approve or reject.');
    const actor = this.deps.roster().find(m => m.id === id)!;
    p.votes.push({ ...actor, decision: body.decision, at: new Date(this.deps.now()).toISOString() });
    p.status = body.decision === 'rejected' ? 'rejected' : p.votes.length === 5 ? 'approved' : 'pending';
    this.deps.commit(); return { status: p.status };
  }
  apply(id: string, proposalId: string, body: any) {
    this.deps.guard(id, body.privateKey, true); const p = this.pending(proposalId);
    const roster = this.deps.roster();
    if (p.status !== 'approved' || p.votes.length !== 5 || new Set(p.votes.map(v => v.id)).size !== 5 || p.votes.some(v => v.decision !== 'approved') || roster.some(m => !p.votes.some(v => v.id === m.id && v.slot === m.slot))) fail(409, 'Five distinct current administrator approvals are required.');
    if (body.confirmation !== (p.action === 'delete' ? 'DELETE APPROVED ACCOUNT' : 'APPLY APPROVED ACTION')) fail(400, 'Enter the displayed final confirmation.');
    if (p.action === 'delete' && this.deps.busy() > 0) fail(409, 'Other requests are running. Try the final action again when they finish.');
    const a = this.target(p.targetId, p.targetRole), now = new Date(this.deps.now()).toISOString();
    if (p.action === 'delete') return this.remove(p, a, id, now);
    const policies = this.state.accountPolicies ||= {}, old: AccountPolicy | undefined = policies[keyFor(a.id, a.role)];
    const policy: AccountPolicy = { revision: (old?.revision || 0) + 1, reason: p.reason, proposalId: p.id, appliedAt: now, appliedBy: id,
      features: p.action === 'restore' ? [] : p.action === 'restrict' ? p.features : old?.features || [],
      banUntil: p.action === 'restore' ? undefined : p.action === 'ban' ? new Date(this.deps.now() + p.duration!.milliseconds).toISOString() : old?.banUntil };
    policies[keyFor(a.id, a.role)] = policy;
    if (p.action === 'ban' || p.action === 'restore') {
      for (const affected of moderationAccounts(this.store)) if (lineage(this.store, affected.id, affected.role).some(parent => parent.id === a.id && parent.role === a.role)) {
        const denial = policies[keyFor(affected.id, affected.role)] ||= { ...policy, features: [], banUntil: undefined };
        denial.deniedSessions = p.action === 'ban' ? affected.records.map(r => r.session || r.user?.session).filter(s => s?.tokenHash && s.expiresAt > this.deps.now()).map(s => ({ tokenHash: s.tokenHash, expiresAt: s.expiresAt })).slice(0, 8) : [];
        affected.records.forEach(clearRecordSession);
      }
    }
    p.status = 'applied'; p.appliedBy = id; p.appliedAt = now; this.invalidate(p.id); this.deps.commit();
    return { success: true, status: p.status, message: 'Approved account action applied.' };
  }
  rejectFinal(id: string, proposalId: string, body: any) {
    this.deps.guard(id, body.privateKey, true); const p = this.pending(proposalId);
    if (p.status !== 'approved' || p.votes.length !== 5 || p.votes.some(v => v.decision !== 'approved')) fail(409, 'A final decision requires five approvals first.');
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 500) fail(400, 'Explain the final rejection in 3–500 characters.');
    Object.assign(p, { status: 'rejected', finalRejectedBy: id, finalRejectedAt: new Date(this.deps.now()).toISOString(), finalRejectionReason: body.reason.trim() });
    this.deps.commit(); return { success: true, status: 'rejected', message: 'The main administrator rejected the final action. No account was changed.' };
  }
  private invalidate(except: string) {
    for (const other of this.state.accountProposals || []) if (other.id !== except && ['pending', 'approved'].includes(other.status)) {
      const a = accountFor(this.store, other.targetId, other.targetRole);
      if (!a || this.fingerprint(a, other.action === 'delete') !== other.fingerprint) other.status = 'invalidated';
    }
  }
  private remove(p: AccountProposal, a: Account, id: string, now: string) {
    const plan = this.deletion(a), recovery = this.deps.recovery, backup = recovery.backup(p.id, this.store, plan);
    recovery.audit({ event: 'account-deletion-prepared', proposalId: p.id, targetId: a.id, counts: plan.counts, administratorIds: p.votes.map(v => v.id), backup: backup.file });
    recovery.blockExecution(); let rollback = () => {};
    try {
      rollback = backup.stage(); applyWipePlan(this.store, plan);
      p.status = 'applied'; p.appliedAt = now; p.appliedBy = id; p.targetName = 'Deleted account';
      reconcileDeletedAccountPolicies(this.store);
      this.invalidate(p.id); this.deps.commit();
    } catch { this.deps.block(); try { rollback(); } catch {} return fail(503, 'Deletion could not be committed. Writes are blocked; inspect the encrypted recovery archive offline.'); }
    let cleanupPending = false;
    try { backup.cleanup(); recovery.audit({ event: 'account-deleted', proposalId: p.id, administratorIds: p.votes.map(v => v.id) }); recovery.unblockExecution(); }
    catch { cleanupPending = true; this.deps.block(); }
    return { success: true, status: 'applied', cleanupPending, message: 'Account and related operational records deleted. A private encrypted recovery archive is retained.' };
  }
}
