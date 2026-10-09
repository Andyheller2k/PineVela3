import crypto from 'node:crypto';
import { accountId, accountRole } from './accountSecurity.js';
import { publicPlatformSettings } from './platformSettings.js';

type Activity = { id: string; label: string; module: 'admin_governance' | 'admin_settings'; status: string; votes?: { approved: number; rejected: number }; state: unknown };
export type AdminActivitySnapshot = { entries: Activity[]; settings: ReturnType<typeof publicPlatformSettings> };
/** Track public state only: never approval keys, password hashes, invitation tokens or private pleas. */
export function captureAdminActivity(store: any, now = Date.now()): AdminActivitySnapshot {
  const g = store.adminGovernance || {}, entries: Activity[] = [];
  for (const [collection, label, module] of [
    ['proposals', 'Wipe proposal', 'admin_governance'], ['changes', 'Administrator change', 'admin_governance'],
    ['accountProposals', 'Account proposal', 'admin_governance'], ['residenceProposals', 'Residence deletion proposal', 'admin_governance'],
    ['pricingProposals', 'Pricing proposal', 'admin_settings'],
  ] as const) for (const p of g[collection] || []) {
    const status = ['pending', 'approved'].includes(p.status) && Date.parse(p.expiresAt) <= now ? 'expired' : p.status;
    const votes = { approved: (p.votes || []).filter((v: any) => v.decision === 'approved').length, rejected: (p.votes || []).filter((v: any) => v.decision === 'rejected').length };
    entries.push({ id: `${collection}:${p.id}`, label, module, status, votes, state: { status, votes, appliedAt: p.appliedAt, executedAt: p.executedAt, pleaSubmitted: !!p.plea, pleaDecision: p.plea?.decision } });
  }
  for (const m of g.members || []) entries.push({ id: `member:${m.id}`, label: `Administrator #${m.slot}`, module: 'admin_governance', status: m.active ? 'active' : 'suspended', state: { active: m.active, slot: m.slot, keyEnrolled: !!m.keyHash } });
  for (const m of g.members || []) entries.push({ id: `settings-key:${m.id}`, label: `Administrator #${m.slot} settings key`, module: 'admin_settings', status: m.settingsKeyHash ? 'enrolled' : 'not enrolled', state: !!m.settingsKeyHash });
  for (const i of g.invitations || []) entries.push({ id: `invitation:${i.id}`, label: `Administrator #${i.slot} invitation`, module: 'admin_governance', status: Date.parse(i.expiresAt) <= now ? 'expired' : 'reserved', state: { slot: i.slot, expiresAt: i.expiresAt } });
  const settlement = store.platformSettings?.paystackSettlement;
  if (settlement) entries.push({ id: 'settlement-settings', label: 'Payment receiving settings', module: 'admin_settings', status: settlement.code ? 'configured' : 'default', state: { configured: !!settlement.code, mode: settlement.mode, updatedAt: settlement.updatedAt } });
  return { entries, settings: publicPlatformSettings(store) };
}
export function adminActivityChanges(previous: AdminActivitySnapshot, current: AdminActivitySnapshot) {
  const changes: { module: Activity['module']; title: string; message: string; status: string; activityId: string }[] = [];
  const before = new Map(previous.entries.map(e => [e.id, e]));
  for (const entry of current.entries) {
    const old = before.get(entry.id);
    if (old && old.status === entry.status && JSON.stringify(old.state) === JSON.stringify(entry.state)) continue;
    const tab = entry.module === 'admin_settings' ? 'Admin Settings' : 'Admin Approvals';
    changes.push({ module: entry.module, activityId: entry.id, status: entry.status, title: `${entry.label} ${old ? 'updated' : 'submitted'}`,
      message: `${entry.label} is ${entry.status}.${entry.votes ? ` ${entry.votes.approved} approval(s), ${entry.votes.rejected} rejection(s).` : ''} Open ${tab} to review.` });
  }
  const ids = new Set(current.entries.map(e => e.id));
  for (const old of previous.entries) if (!ids.has(old.id)) changes.push({ module: old.module, activityId: old.id, status: 'removed', title: `${old.label} removed`, message: `${old.label} has been removed. Open ${old.module === 'admin_settings' ? 'Admin Settings' : 'Admin Approvals'} to review the current state.` });
  const fields = Object.keys(current.settings).filter(key => JSON.stringify((current.settings as any)[key]) !== JSON.stringify((previous.settings as any)[key]));
  if (fields.length) changes.push({ module: 'admin_settings', activityId: 'platform-settings', status: 'updated', title: 'Admin Settings updated', message: `Updated: ${fields.join(', ')}. Open Admin Settings to review the current values.` });
  return changes;
}
export function adminActivityNotices(store: any, previous: AdminActivitySnapshot, current: AdminActivitySnapshot, now = Date.now()) {
  const date = new Date(now).toISOString(), g = store.adminGovernance;
  const recipients = [...new Set<string>((store.users || []).filter((u: any) => accountRole(u) === 'admin' && g?.members.some((m: any) => m.id === accountId(u) && m.active)).map((u: any) => accountId(u)))];
  return adminActivityChanges(previous, current).flatMap(event => recipients.map(targetAccountId => ({ ...event, id: crypto.randomUUID(), targetAccountId, targetRole: 'admin', category: event.module, type: ['approved', 'applied', 'executed'].includes(event.status) ? 'success' : ['rejected', 'invalidated', 'expired'].includes(event.status) ? 'warning' : 'info', read: false, isRead: false, createdAt: date, date })));
}
