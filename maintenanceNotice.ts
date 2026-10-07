import type { Express, RequestHandler } from 'express';
import { moderationAccounts } from './accountModeration.js';

export const MAINTENANCE_NOTICE_LIFETIME_MS = 24 * 60 * 60 * 1000;
export type MaintenanceRecoveryNotice = {
  id: string; message: string; dismissedBy: string[];
  // Older notices lack a reliable restoration time/audience and are no longer delivered.
  createdAt?: string; expiresAt?: string; eligibleAccounts?: string[];
};
const identity = (account: any) => `${account.role}:${account.id}`;
export function createMaintenanceRecoveryNotice(store: any, id: string, message: string, now: number): MaintenanceRecoveryNotice {
  const eligibleAccounts = moderationAccounts(store).filter(account => account.role !== 'admin')
    .flatMap(account => account.aliases.map(id => identity({ role: account.role, id })));
  return { id, message, dismissedBy: [], createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + MAINTENANCE_NOTICE_LIFETIME_MS).toISOString(), eligibleAccounts: [...new Set(eligibleAccounts)] };
}
export function eligibleMaintenanceNotice(settings: any, account: any, now: number): MaintenanceRecoveryNotice | null {
  const notice = settings?.maintenanceRecoveryNotice;
  const created = Date.parse(notice?.createdAt), expires = Date.parse(notice?.expiresAt);
  if (!account?.id || !account?.role || account.role === 'admin' || settings?.maintenanceMode ||
      !Number.isFinite(created) || !Number.isFinite(expires) || created > now || expires <= now || now >= created + MAINTENANCE_NOTICE_LIFETIME_MS ||
      !Array.isArray(notice.eligibleAccounts) || !notice.eligibleAccounts.includes(identity(account)) || !Array.isArray(notice.dismissedBy)) return null;
  return notice;
}

/** Notice state and acknowledgements are private and keyed by the server session. */
export function installMaintenanceNotice(app: Express, requireAuth: () => RequestHandler, getStore: () => any, save: () => void, now = () => Date.now()) {
  app.get('/api/auth/maintenance-notice', requireAuth(), (req: any, res) => {
    const timestamp = now(), notice = eligibleMaintenanceNotice(getStore().platformSettings, req.user, timestamp);
    res.set('Cache-Control', 'no-store').json({ serverTime: new Date(timestamp).toISOString(), notice: notice && !notice.dismissedBy.includes(identity(req.user)) ? { id: notice.id, message: notice.message, expiresAt: notice.expiresAt } : null });
  });
  app.post('/api/auth/maintenance-notice/dismiss', requireAuth(), (req: any, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.noticeId !== 'string') return res.status(400).json({ error: 'Supply only the notice ID.' });
    const notice = getStore().platformSettings?.maintenanceRecoveryNotice;
    if (!notice || notice.id !== req.body.noticeId) return res.status(409).json({ error: 'The notice changed. Please reload it.' });
    if (!eligibleMaintenanceNotice(getStore().platformSettings, req.user, now())) return res.status(403).json({ error: 'This message is not available for this account.' });
    if (!notice.dismissedBy.includes(identity(req.user))) { notice.dismissedBy.push(identity(req.user)); save(); }
    res.json({ success: true });
  });
}
