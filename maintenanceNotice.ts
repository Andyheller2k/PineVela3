import type { Express, RequestHandler } from 'express';

/** Notice state and acknowledgements are private and keyed by the server session. */
export function installMaintenanceNotice(app: Express, requireAuth: () => RequestHandler, getStore: () => any, save: () => void) {
  const identity = (req: any) => `${req.user.role}:${req.user.id}`;
  app.get('/api/auth/maintenance-notice', requireAuth(), (req: any, res) => {
    const settings = getStore().platformSettings;
    const notice = settings?.maintenanceRecoveryNotice;
    res.set('Cache-Control', 'no-store').json({ notice: !settings?.maintenanceMode && notice && !notice.dismissedBy.includes(identity(req)) ? { id: notice.id, message: notice.message } : null });
  });
  app.post('/api/auth/maintenance-notice/dismiss', requireAuth(), (req: any, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.noticeId !== 'string') return res.status(400).json({ error: 'Supply only the notice ID.' });
    const notice = getStore().platformSettings?.maintenanceRecoveryNotice;
    if (!notice || notice.id !== req.body.noticeId) return res.status(409).json({ error: 'The notice changed. Please reload it.' });
    if (!notice.dismissedBy.includes(identity(req))) { notice.dismissedBy.push(identity(req)); save(); }
    res.json({ success: true });
  });
}
