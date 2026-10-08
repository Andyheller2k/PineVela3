import { accountData, accountId, accountRole, canManageHostel, normalizeEmail } from './accountSecurity.js';
import { activeManagedStaff } from './staffManagement.js';
import { isMarketMessageNotification, marketNotificationVisible, sellerStore } from './marketMessaging.js';

const identityFields = ['recipientId', 'userId', 'studentId', 'managerId', 'staffId'];
const emailFields = ['recipientEmail', 'userEmail', 'targetEmail', 'parentUserEmail', 'managerEmail', 'staffEmail', 'email'];
const identifier = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

// Email-only historical records are usable only when they identify one account in that role.
function uniqueEmailRecipient(actor: any, email: unknown, store: any, role?: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized !== normalizeEmail(actor?.email)) return false;
  // Merchant sessions can live on the store/application rather than in store.users.
  if (role === 'merchant' && actor.role === 'merchant') {
    const stores = (store.digitalMarketStores || []).filter((s: any) => normalizeEmail(s.studentEmail) === normalized);
    return stores.length === 1 && sellerStore(actor, store)?.id === stores[0].id;
  }
  const candidates = (store.users || []).filter((entry: any) => {
    const data = accountData(entry);
    return normalizeEmail(data?.email || entry.email) === normalized && (!role || accountRole(entry) === role);
  });
  const identities = new Set(candidates.map((entry: any) => JSON.stringify([accountRole(entry), accountId(entry)])));
  return identities.size === 1 && identities.has(JSON.stringify([actor.role, actor.id]));
}

function ownsResidence(actor: any, hostelId: unknown, store: any): boolean {
  const hostel = (store.hostels || []).find((h: any) => h.id === hostelId);
  return Boolean(hostel && canManageHostel(actor, hostel) &&
    (hostel.managerId || hostel.assignedManagerId || uniqueEmailRecipient(actor, hostel.managerEmail || hostel.email, store, 'manager')));
}

export function meetingVisible(actor: any, meeting: any, store: any): boolean {
  if (!actor?.id || !meeting) return false;
  if (actor.role === 'admin') return true;
  if (actor.role === 'manager') {
    // The current residence assignment takes precedence over historical contact/name fields.
    if (meeting.hostelId) return ownsResidence(actor, meeting.hostelId, store);
    if (meeting.managerId) return meeting.managerId === actor.id;
    return uniqueEmailRecipient(actor, meeting.managerEmail, store, 'manager');
  }
  const requesterIds = [meeting.requesterId, meeting.studentId].map(identifier).filter(Boolean);
  if (actor.role === 'staff') {
    const member = activeManagedStaff(actor, store);
    return Boolean(member && (member.hostelId === meeting.hostelId || requesterIds.includes(actor.id)));
  }
  if (!['user', 'student', 'resident'].includes(actor.role)) return false;
  if (requesterIds.length) return requesterIds.includes(actor.id);
  return [meeting.requesterEmail, meeting.studentEmail].some(email => uniqueEmailRecipient(actor, email, store, actor.role));
}

export function notificationVisible(actor: any, notice: any, store: any): boolean {
  if (!actor?.id || !notice) return false;
  if (isMarketMessageNotification(notice)) return marketNotificationVisible(actor, notice, store);
  if (notice.targetAccountId) return notice.targetAccountId === actor.id && (!notice.targetRole || notice.targetRole === actor.role);
  if (notice.targetRole && notice.targetRole !== 'all' && notice.targetRole !== actor.role) return false;
  if (notice.sellerStoreId) return actor.role === 'merchant' && sellerStore(actor, store)?.id === notice.sellerStoreId;

  const ids = identityFields.map(key => identifier(notice[key])).filter(value => value && !value.includes('@'));
  // Explicit account identities cannot be overridden by shared emails or a residence label.
  if (ids.length) {
    const member = activeManagedStaff(actor, store);
    return ids.includes(actor.id) || Boolean(member?.id && ids.includes(member.id));
  }
  if (notice.hostelId) {
    if (actor.role !== 'manager' || notice.targetRole && notice.targetRole !== 'manager') return false;
    return ownsResidence(actor, notice.hostelId, store);
  }
  const emails = [...emailFields.map(key => notice[key]), ...identityFields.map(key => notice[key]).filter(value => typeof value === 'string' && value.includes('@'))];
  if (emails.some(email => normalizeEmail(email))) return emails.some(email => uniqueEmailRecipient(actor, email, store, notice.targetRole === 'all' ? undefined : notice.targetRole));
  if (notice.username) {
    const username = normalizeEmail(notice.username);
    const matches = (store.users || []).filter((entry: any) => normalizeEmail(accountData(entry)?.username || entry.username) === username);
    return matches.length === 1 && accountId(matches[0]) === actor.id && accountRole(matches[0]) === actor.role;
  }
  return actor.role === 'admin' && ['admin', 'all'].includes(notice.targetRole);
}

export const notificationReaderKey = (actor: any): string => JSON.stringify([actor.role, actor.id]);

export function notificationForActor(notice: any, actor: any): any {
  const read = Boolean(notice.read || notice.isRead || Array.isArray(notice.readBy) && notice.readBy.includes(notificationReaderKey(actor)));
  const { readBy, popupAcknowledgedBy, ...visible } = notice;
  return { ...visible, read, isRead: read };
}
