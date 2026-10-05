import { accountData, accountId, accountRole, normalizeEmail } from './accountSecurity.js';

const status = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
export function managerRecordMatches(record: any, manager: any, users: any[]) {
  const id = accountId(manager);
  if (!id || accountRole(manager) !== 'manager' || !record) return false;
  if (record.managerId) return String(record.managerId) === id;
  // Only unambiguous legacy dossiers may use email; explicit IDs always win.
  const email = normalizeEmail(accountData(manager)?.email || manager.email);
  const ids = new Set(users.filter(u => accountRole(u) === 'manager' && normalizeEmail(accountData(u)?.email || u.email) === email).map(accountId));
  return Boolean(email) && ids.size === 1 && normalizeEmail(record.managerEmail) === email;
}
export function managerForDossier(record: any, users: any[]) {
  const managers = users.filter(u => accountRole(u) === 'manager');
  const candidates = managers.filter(u => managerRecordMatches(record, u, users));
  const ids = new Set(candidates.map(accountId));
  return ids.size === 1 ? candidates[0] : undefined;
}
export function managerIsApproved(entry: any, store: { users?: any[]; managerVerifications?: any[]; managerRegistrationRequests?: any[]; managerRequests?: any[] }) {
  if (accountRole(entry) !== 'manager') return false;
  const id = accountId(entry);
  const users = store.users || [];
  const current = users.filter(u => accountRole(u) === 'manager' && accountId(u) === id);
  if (!current.length) return false;
  const blocked = (value: any) => value?.isBlocked === true || value?.isSuspended === true || ['blocked', 'suspended', 'rejected', 'inactive', 'disabled'].includes(status(value?.status)) || ['blocked', 'suspended', 'rejected'].includes(status(value?.verificationStatus));
  if (current.some(u => blocked(u) || blocked(accountData(u)))) return false;
  const records = [...(store.managerVerifications || []), ...(store.managerRegistrationRequests || []), ...(store.managerRequests || [])].filter(r => managerRecordMatches(r, current[0], users));
  if (records.length) return records.every(r => !blocked(r) && status(r.status) === 'approved');
  // Preserve explicitly approved historical manager identities, never an implicit/default flag.
  return current.every(u => accountData(u)?.isVerified === true && status(accountData(u)?.verificationStatus) === 'approved');
}
export function managerOnboardingRequest(method: string, route: string) {
  return (['GET', 'PUT'].includes(method) && route === '/api/auth/appearance') ||
    (method === 'GET' && ['/api/auth/me', '/api/auth/account-access', '/api/auth/maintenance-notice', '/api/manager-requests', '/api/manager-verifications'].includes(route)) ||
    (method === 'POST' && ['/api/manager-verifications/submit', '/api/manager-requests', '/api/auth/maintenance-notice/dismiss'].includes(route));
}
