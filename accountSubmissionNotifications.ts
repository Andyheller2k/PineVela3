import { accountData, accountId, accountRole, normalizeEmail } from './accountSecurity.js';

// Only pre-entry account lifecycle notices move to the primary inbox. Operational,
// staff, officer, buyer/seller chat and residence-management notices keep their scope.
export function submissionKind(notice: any): 'manager' | 'merchant' | 'resident' | undefined {
  const title = String(notice?.title || '').trim();
  if (/^Manager Account (Registration Submitted|Registered - Inspection Pending|Approved!|Registration Update|Application Status: Rejected)$/.test(title) || title === 'PineVela Verification Team Dispatched') return 'manager';
  if (/^(Student Merchant Application Approved! 🎉|Digital Market Application (Submitted|Update))$/.test(title)) return 'merchant';
  if (title === 'Resident Account Activated & Room Linked') return 'resident';
}

function primaryOwner(record: any, store: any, kind: string): string | undefined {
  const primary = (store.users || []).filter((entry: any) => accountRole(entry) === 'user');
  const ownerId = record.parentUserId || (kind === 'merchant' ? record.userId : undefined);
  // A missing explicit owner must never fall back to another account sharing email.
  if (ownerId) return primary.find((entry: any) => accountId(entry) === ownerId) ? ownerId : undefined;
  const email = normalizeEmail(record.parentUserEmail);
  if (!email) return undefined;
  const matches = primary.filter((entry: any) => normalizeEmail(accountData(entry).email || entry.email) === email);
  const ids = new Set<string>(matches.map(accountId));
  return ids.size === 1 ? [...ids][0] : undefined;
}

export function primaryAccountRecipient(record: any, store: any, kind: string): any {
  const id = accountRole(record) === 'user' ? accountId(record) : primaryOwner(record, store, kind);
  const owner = (store.users || []).find((entry: any) => accountRole(entry) === 'user' && accountId(entry) === id);
  return owner ? { targetRole: 'user', targetAccountId: id, userId: id, category: 'account_submission' } : {};
}

export function accountSubmissionNotification(notice: any, store: any): any {
  if (notice.category === 'admin_gateway') return notice;
  const kind = submissionKind(notice);
  if (!kind || notice.targetRole === 'admin' || notice.targetRole === 'verification_team') return notice;
  if (notice.targetRole === 'user' && notice.targetAccountId) return notice;

  const accounts = (store.users || []).filter((entry: any) =>
    kind === 'resident' ? ['student', 'resident'].includes(accountRole(entry)) : accountRole(entry) === kind
  ).map((entry: any) => ({ ...entry, ...accountData(entry) }));
  const records = kind === 'manager'
    ? [...accounts, ...(store.managerVerifications || []), ...(store.managerRegistrationRequests || [])]
    : kind === 'merchant'
      ? [...(store.digitalMarketApplications || []), ...(store.digitalMarketStores || [])]
      : accounts;
  const ids = [notice.targetAccountId, notice.managerId, notice.userId, notice.studentId].filter(value => typeof value === 'string' && value && !value.includes('@'));
  const emails = [notice.managerEmail, notice.userEmail, notice.recipientEmail, notice.userId, notice.studentId].map(normalizeEmail).filter(value => value.includes('@'));
  const matches = records.filter((record: any) => {
    if (notice.registrationId) return record.id === notice.registrationId;
    // Explicit secondary IDs take precedence over all contact fields.
    if (ids.length) return ids.some(id => [record.id, record.managerId].includes(id));
    return emails.some(email => [record.email, record.managerEmail, record.studentEmail].map(normalizeEmail).includes(email));
  });
  const owners = new Set<string>();
  for (const record of matches) {
    const owner = primaryOwner(record, store, kind);
    if (!owner) return notice; // Ambiguous/orphan historical records stay within existing boundaries.
    owners.add(owner);
  }
  if (owners.size !== 1) return notice;
  const ownerId = [...owners][0];
  return { ...notice, category: 'account_submission', registrationKind: kind,
    targetRole: 'user', targetAccountId: ownerId, userId: ownerId, studentId: undefined,
    // Historical secondary-account reads must not acknowledge the primary inbox.
    read: false, isRead: false };
}
