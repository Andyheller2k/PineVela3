import crypto from 'node:crypto';
import { moderationAccounts } from './accountModeration.js';

export class AdminMessageError extends Error { constructor(public status: number, message: string) { super(message); } }
const groups: Record<string, string[]> = { managers: ['manager'], residents: ['student', 'resident'], users: ['user'], marketers: ['merchant'], staff: ['staff'] };
export function adminMessageAccounts(store: any) {
  const allowed = new Set(Object.values(groups).flat());
  return moderationAccounts(store).filter(account => allowed.has(account.role)).map(({ id, role, name, email }) => ({ id, role, name, email }));
}
export function previewAdminMessage(store: any, body: any) {
  if (!Array.isArray(body.groups) || body.groups.some((group: any) => !Object.hasOwn(groups, group)) || !Array.isArray(body.accounts) || body.accounts.length > 2000) throw new AdminMessageError(400, 'Choose supported recipient groups or specific accounts.');
  const accounts = adminMessageAccounts(store), selected = new Set<string>();
  for (const target of body.accounts) {
    if (!target || typeof target.id !== 'string' || typeof target.role !== 'string' || !accounts.some(a => a.id === target.id && a.role === target.role)) throw new AdminMessageError(400, 'A selected account is no longer available. Refresh the recipient list.');
    selected.add(JSON.stringify([target.role, target.id]));
  }
  const roles = new Set(body.groups.flatMap((group: string) => groups[group]));
  const recipients = accounts.filter(a => roles.has(a.role) || selected.has(JSON.stringify([a.role, a.id])));
  if (!recipients.length || recipients.length > 2000) throw new AdminMessageError(400, 'Choose between 1 and 2000 actual recipient accounts. Narrow the selection if needed.');
  const counts: Record<string, number> = {};
  for (const account of recipients) counts[account.role] = (counts[account.role] || 0) + 1;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(recipients.map(a => [a.role, a.id]).sort())).digest('hex');
  return { recipients, count: recipients.length, counts, fingerprint };
}
export function prepareAdminMessage(store: any, senderId: string, body: any, now: number) {
  const preview = previewAdminMessage(store, body);
  if (body.fingerprint !== preview.fingerprint) throw new AdminMessageError(409, 'The recipient selection changed. Review a fresh delivery preview.');
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120 || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 4000) throw new AdminMessageError(400, 'Enter a title of up to 120 characters and a message of up to 4000 characters.');
  if (!['info', 'success', 'warning', 'error'].includes(body.type || 'info')) throw new AdminMessageError(400, 'Choose a supported message type.');
  const batchId = crypto.randomUUID(), date = new Date(now).toISOString();
  const notices = preview.recipients.map(recipient => ({ id: crypto.randomUUID(), batchId, targetRole: recipient.role, targetAccountId: recipient.id,
    userId: recipient.id, adminMessage: true, senderRole: 'admin', senderId, category: 'admin_gateway',
    title: body.title.trim(), message: body.message.trim(), type: body.type || 'info', read: false, date, createdAt: date }));
  return { notices, receipt: { batchId, count: preview.count, counts: preview.counts, sentAt: date } };
}
