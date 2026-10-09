import crypto from 'node:crypto';
import { accountData, accountId, accountRole, normalizeEmail } from './accountSecurity.js';
import { JSON_COLLECTIONS } from './jsonStoreSafety.js';

export const WIPE_SCOPES = ['hostels', 'markets', 'managers', 'residents', 'users', 'total'] as const;
export type WipeScope = typeof WIPE_SCOPES[number];
export function parseWipeScopes(input: unknown): WipeScope[] {
  if (!Array.isArray(input) || !input.length || input.some(s => !WIPE_SCOPES.includes(s)) || new Set(input).size !== input.length || input.includes('total') && input.length !== 1) {
    throw new Error('Select valid, distinct wipe categories. Total wipe cannot be combined with other categories.');
  }
  return WIPE_SCOPES.filter(s => input.includes(s));
}
const linkedAccountFields = ['parentUserId', 'userId', 'claimedByUserId', 'ownerId'];
const personFields = ['managerId', 'assignedManagerId', 'staffId', 'assignedStaffId', 'officerId', 'assignedOfficerId', 'studentId', 'residentId', 'assignedStudentId', 'buyerId', 'sellerId', 'reviewerId', 'requesterId', 'recipientId', 'targetAccountId', 'accountId', 'actorId', ...linkedAccountFields];
const homeFields = ['hostelId', 'residenceId', 'propertyId'];
const marketFields = ['storeId', 'sellerStoreId', 'merchantStoreId', 'marketId'];
const walk = (v: any, fn: (key: string, value: any) => boolean): boolean => !!v && typeof v === 'object' && Object.entries(v).some(([k, x]) => fn(k, x) || (x && typeof x === 'object' && walk(x, fn)));
const has = (v: any, fields: string[], ids: Set<string>) => walk(v, (k, x) => fields.includes(k) && typeof x === 'string' && ids.has(x));
export function uploadReferences(value: any, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    try {
      const url = new URL(value, 'https://pinevela.invalid');
      if (url.pathname.startsWith('/uploads/')) {
        const relative = decodeURIComponent(url.pathname.slice(9));
        if (relative && !relative.split('/').some(s => !s || s === '.' || s === '..') && !relative.includes('\\') && !relative.includes('\0')) out.add(relative);
      }
    } catch { /* Not a media reference. */ }
  } else if (value && typeof value === 'object') for (const child of Object.values(value)) uploadReferences(child, out);
  return out;
}
export interface WipePlan {
  scopes: WipeScope[]; counts: Record<string, number>; fingerprint: string;
  removed: Record<string, any[]>; kept: Record<string, any[]>;
  retired: Record<string, any[]>; settings: Record<string, any>;
  media: string[]; notes: string[]; managerKeys: Record<string, any>;
  signupState?: any; roomAttemptState?: any;
}
/** Resolve cascading relationships on the server. IDs never come from the proposal body. */
export function buildWipePlan(store: any, scopes: WipeScope[], target?: { accountIds: string[]; marketIds?: string[]; officerIds?: string[]; hostelIds?: string[] }): WipePlan {
  const total = scopes.includes('total'), users = store.users || [];
  const ids = new Set<string>(), homes = new Set<string>(), markets = new Set<string>(), products = new Set<string>(), orders = new Set<string>(), staff = new Set<string>();
  for (const id of target?.accountIds || []) ids.add(id);
  for (const id of target?.officerIds || []) ids.add(id);
  for (const id of target?.marketIds || []) markets.add(id);
  for (const id of target?.hostelIds || []) homes.add(id);
  const roomAccounts = new Map<string, any[]>();
  for (const u of users) if (['student', 'resident'].includes(accountRole(u))) {
    const key = String(accountData(u).roomKey || u.roomKey || '').toUpperCase();
    if (key) roomAccounts.set(key, [...(roomAccounts.get(key) || []), u]);
  }
  for (const u of users) {
    const r = accountRole(u);
    if (r !== 'admin' && (total || scopes.includes('users') && r === 'user' || scopes.includes('managers') && r === 'manager' || scopes.includes('residents') && ['student', 'resident'].includes(r))) ids.add(accountId(u));
  }
  // Iterate until account -> property/store -> dependent accounts reaches a fixed point.
  let changed = true;
  while (changed) {
    const size = ids.size + homes.size + markets.size + staff.size;
    const managerEmails = new Set(users.filter((u: any) => accountRole(u) === 'manager' && ids.has(accountId(u))).map((u: any) => normalizeEmail(accountData(u).email || u.email)).filter(Boolean));
    for (const h of store.hostels || []) if (total || scopes.includes('hostels') || has(h, ['managerId', 'assignedManagerId'], ids) ||
      !h.managerId && !h.assignedManagerId && [h.managerEmail, h.email].some(e => e && managerEmails.has(normalizeEmail(e)))) homes.add(String(h.id));
    for (const key of store.roomKeys || []) if (has(key, homeFields, homes)) {
      for (const account of roomAccounts.get(String(key.roomKey || '').toUpperCase()) || []) {
        if (normalizeEmail(accountData(account).email || account.email) === normalizeEmail(key.assignedStudentEmail || key.studentEmail)) ids.add(accountId(account));
      }
    }
    for (const m of [...(store.digitalMarketStores || []), ...(store.digitalMarketApplications || [])]) if (total || scopes.includes('markets') || has(m, personFields, ids)) markets.add(String(m.id));
    for (const member of store.staff || []) if (total || ids.has(String(member.id)) || has(member, personFields, ids) || has(member, homeFields, homes)) {
      staff.add(String(member.id)); if (member.userId) ids.add(String(member.userId));
    }
    for (const u of users) if (accountRole(u) !== 'admin') {
      const data = accountData(u), r = accountRole(u);
      if (has(u, linkedAccountFields, ids) || ['staff', 'student', 'resident'].includes(r) && has(u, homeFields, homes) || r === 'staff' && (staff.has(accountId(u)) || has(u, ['staffId', 'managerId'], new Set([...ids, ...staff]))) || r === 'merchant' && (has(u, marketFields, markets) || has(u, linkedAccountFields, ids))) ids.add(accountId(u));
      // Legacy seller records do not all carry a store ID: use their unique matching store's primary ID.
      if (r === 'merchant' && (store.digitalMarketStores || []).filter((m: any) => normalizeEmail(m.studentEmail || m.email) === normalizeEmail(data.email) && !!data.email).length === 1 && (store.digitalMarketStores || []).some((m: any) => markets.has(String(m.id)) && normalizeEmail(m.studentEmail || m.email) === normalizeEmail(data.email) && !!data.email)) ids.add(accountId(u));
    }
    changed = size !== ids.size + homes.size + markets.size + staff.size;
  }
  for (const p of store.digitalMarketProducts || []) if (total || has(p, marketFields, markets) || has(p, personFields, ids)) products.add(String(p.id));
  for (const o of store.digitalMarketOrders || []) if (total || has(o, marketFields, markets) || has(o, ['productId', 'itemId', 'serviceId'], products) || has(o, personFields, ids)) orders.add(String(o.id));
  const deletedEmails = new Set(users.filter((u: any) => ids.has(accountId(u))).map((u: any) => normalizeEmail(accountData(u).email || u.email)).filter(Boolean));
  const keptEmails = new Set(users.filter((u: any) => !ids.has(accountId(u))).map((u: any) => normalizeEmail(accountData(u).email || u.email)));
  const exclusiveEmails = new Set([...deletedEmails].filter(e => !keptEmails.has(e)));
  const related = (v: any) => has(v, personFields, ids) || has(v, homeFields, homes) || has(v, marketFields, markets) || has(v, ['productId', 'itemId', 'serviceId'], products) || has(v, ['orderId'], orders) || has(v, ['staffId', 'assignedStaffId'], staff) || walk(v, (k, x) => ['managerEmail', 'studentEmail', 'buyerEmail', 'sellerEmail', 'recipientEmail', 'email'].includes(k) && typeof x === 'string' && exclusiveEmails.has(normalizeEmail(x)));
  const kept: Record<string, any[]> = {}, removed: Record<string, any[]> = {}, counts: Record<string, number> = {};
  for (const key of JSON_COLLECTIONS) {
    const list = store[key] || [];
    const adminActivity = (v: any) => key === 'notifications' && v.targetRole === 'admin' && ['admin_governance', 'admin_settings'].includes(v.module) && users.some((user: any) => accountRole(user) === 'admin' && accountId(user) === v.targetAccountId);
    const shouldRemove = (v: any) => adminActivity(v) || key === 'marketMedia' && users.some((user: any) => accountRole(user) === 'admin' && accountId(user) === v.accountId) ? false : key === 'users' ? accountRole(v) !== 'admin' && ids.has(accountId(v)) : total ||
      key === 'hostels' && homes.has(String(v?.id)) ||
      ['digitalMarketStores', 'digitalMarketApplications'].includes(key) && markets.has(String(v?.id)) ||
      key === 'digitalMarketProducts' && products.has(String(v?.id)) ||
      key === 'digitalMarketOrders' && orders.has(String(v?.id)) ||
      key === 'staff' && staff.has(String(v?.id)) ||
      key === 'verificationTeams' && ids.has(String(v?.id)) ||
      (key.startsWith('digitalMarket') || key === 'marketMedia' || key === 'paymentTransactions' && v?.purpose !== 'housing') && scopes.includes('markets') ||
      key === 'retiredRoomKeys' && scopes.includes('hostels') || related(v);
    removed[key] = list.filter(shouldRemove); kept[key] = list.filter((v: any) => !shouldRemove(v));
    if (removed[key].length) counts[key] = removed[key].length;
  }
  const references = ['inspectionId', 'verificationId', 'verificationRequestId', 'managerVerificationId', 'managerRequestId', 'requestId', 'issueId', 'issueReportId', 'boardRequestId', 'keyId', 'roomKeyId', 'messageId', 'applicationId', 'relatedId', 'entityId'];
  const removedIds = new Set<string>(), removedKeys = new Set<string>();
  let cascade = true;
  while (cascade) {
    cascade = false;
    for (const rows of Object.values(removed)) for (const row of rows) if (row?.id) removedIds.add(String(row.id));
    for (const row of removed.roomKeys) if (row?.roomKey) removedKeys.add(row.roomKey);
    for (const key of JSON_COLLECTIONS) if (key !== 'users') {
      const dependents = kept[key].filter(row => has(row, references, removedIds) || has(row, ['roomKey', 'assignedRoomKey'], removedKeys));
      if (dependents.length) {
        const marked = new Set(dependents); kept[key] = kept[key].filter(row => !marked.has(row)); removed[key].push(...dependents);
        counts[key] = removed[key].length; cascade = true;
      }
    }
  }
  const retired = Object.fromEntries(Object.entries(store.retiredFeatureRecords || {}).map(([k, v]) => [k, (v as any[]).filter(r => !total && !related(r) && !has(r, references, removedIds) && !has(r, ['roomKey', 'assignedRoomKey'], removedKeys))]));
  for (const [k, v] of Object.entries(retired)) if (v.length !== store.retiredFeatureRecords[k].length) counts[`archived.${k}`] = store.retiredFeatureRecords[k].length - v.length;
  const deletedManagerEmails = new Set(removed.users.filter(u => accountRole(u) === 'manager').map(u => normalizeEmail(accountData(u).email || u.email)));
  const retainedManagerEmails = new Set(kept.users.filter(u => accountRole(u) === 'manager').map(u => normalizeEmail(accountData(u).email || u.email)));
  const settings = Object.fromEntries(Object.entries(store.managerAccountSettings || {}).filter(([id]) => !total && !ids.has(id) && !(deletedManagerEmails.has(normalizeEmail(id)) && !retainedManagerEmails.has(normalizeEmail(id)))));
  const managerKeys = Object.fromEntries(Object.entries(store.managerOperationKeys || {}).filter(([id]) => !total && !ids.has(id)));
  const removedManagerKeys = Object.fromEntries(Object.entries(store.managerOperationKeys || {}).filter(([id]) => total || ids.has(id)));
  if (Object.keys(removedManagerKeys).length) counts.managerOperationKeys = Object.keys(removedManagerKeys).length;
  const removedSettings = Object.keys(store.managerAccountSettings || {}).length - Object.keys(settings).length;
  if (removedSettings) counts.managerAccountSettings = removedSettings;
  // Kept primary identities can hold legacy cached sub-account credentials/room summaries.
  const embedded: any[] = [];
  kept.users = kept.users.map(original => {
    let copy = original;
    for (const nested of [false, true]) {
      const data = nested ? original.user : original, registered = data?.registeredAccounts;
      if (!registered || typeof registered !== 'object') continue;
      const next: any = { ...registered }; let changed = false;
      const deleted = (value: any) => related(value) || ids.has(accountId(value)) || has(value, references, removedIds) || has(value, ['roomKey', 'assignedRoomKey'], removedKeys);
      for (const [key, value] of Object.entries(registered)) {
        if (Array.isArray(value)) { const removedRows = value.filter(deleted); if (removedRows.length) { embedded.push(...removedRows); next[key] = value.filter(v => !deleted(v)); changed = true; } }
        else if (value && typeof value === 'object' && deleted(value)) { embedded.push(value); delete next[key]; changed = true; }
      }
      if (changed) { if (copy === original) copy = { ...original }; if (nested) copy.user = { ...original.user, registeredAccounts: next }; else copy.registeredAccounts = next; }
    }
    return copy;
  });
  if (embedded.length) counts.cachedAccountRecords = embedded.length;
  const accountLimitHashes = new Set([...ids].map(id => crypto.createHash('sha256').update(`account:${id}`).digest('hex')));
  const signupLimitHashes = new Set([...exclusiveEmails].flatMap(email => ['send-email', 'verify-email'].map(scope => crypto.createHash('sha256').update(`${scope}:${email}`).digest('hex'))));
  const signupState = store.signupVerification ? { ...store.signupVerification, pending: (store.signupVerification.pending || []).filter((p: any) => !exclusiveEmails.has(normalizeEmail(p.email))), limits: (store.signupVerification.limits || []).filter((l: any) => !signupLimitHashes.has(l.key)) } : undefined;
  const roomAttemptState = store.roomKeyAttempts ? { ...store.roomKeyAttempts, limits: (store.roomKeyAttempts.limits || []).filter((l: any) => !accountLimitHashes.has(l.key)) } : undefined;
  const deletedMedia = uploadReferences({ removed, embedded, removedArchive: store.retiredFeatureRecords, removedSettings: store.managerAccountSettings });
  const retainedMedia = uploadReferences({ kept, retired, settings, platformSettings: total ? {} : store.platformSettings });
  const media = [...deletedMedia].filter(p => !retainedMedia.has(p)).sort();
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ scopes, removed, retired, settings, media, embedded, removedManagerKeys,
    signupState: target ? signupState : undefined, roomAttemptState: target ? roomAttemptState : undefined,
    totalState: total ? { signupVerification: store.signupVerification, roomKeyAttempts: store.roomKeyAttempts, platformSettings: store.platformSettings } : undefined })).digest('hex');
  return { scopes, counts, fingerprint, kept, removed, retired, settings, managerKeys, media, signupState, roomAttemptState, notes: [
    'Manager deletion also removes owned residences, their staff, activated room accounts, and related records.',
    'Primary user deletion also removes linked accounts and their owned residences or markets.',
    'Hostel deletion ends activated room accounts and staff employment; unrelated primary accounts and administrators remain.',
    'Shared images referenced by retained records are preserved. A verified encrypted recovery backup is required.'
  ] };
}

/** In-place array updates preserve aliases held by existing JSON-backed route handlers. */
export function applyWipePlan(store: any, plan: WipePlan): void {
  for (const [key, rows] of Object.entries(plan.kept)) {
    if (!Array.isArray(store[key])) store[key] = [];
    store[key].splice(0, store[key].length, ...rows);
  }
  Object.assign(store, { retiredFeatureRecords: plan.retired, managerAccountSettings: plan.settings, managerOperationKeys: plan.managerKeys });
  if (plan.signupState && store.signupVerification) Object.assign(store.signupVerification, plan.signupState);
  if (plan.roomAttemptState && store.roomKeyAttempts) Object.assign(store.roomKeyAttempts, plan.roomAttemptState);
  if (plan.scopes.includes('total')) {
    store.signupVerification = { pending: [], limits: [] }; store.roomKeyAttempts = { limits: [] };
    Object.assign(store.platformSettings, { registrationFee: 0, commission: 0, announcement: '', maintenanceMode: false });
  }
}
