import type { Express, RequestHandler } from 'express';
import { accountId, accountRole } from './accountSecurity.js';
import { requestSessionToken, sessionMatches } from './sessionSecurity.js';

/** Appearance belongs to the authenticated account, never an email or a supplied ID. */
export function installThemePreferences(app: Express, requireAuth: () => RequestHandler, getStore: () => any, save: () => void) {
  const recordFor = (req: any) => {
    const store = getStore();
    const user = store.users?.find((record: any) => accountId(record) === req.user.id && accountRole(record) === req.user.role);
    if (user) return user;
    if (req.user.role === 'verification_team') return store.verificationTeams?.find((record: any) => record.id === req.user.id);
    if (req.user.role === 'merchant') {
      const token = requestSessionToken(req);
      return store.digitalMarketStores?.find((record: any) => sessionMatches(record, token)) ||
        store.digitalMarketApplications?.find((record: any) => sessionMatches(record, token));
    }
  };
  app.get('/api/auth/appearance', requireAuth(), (req: any, res) => {
    const record = recordFor(req);
    if (!record) return res.status(404).json({ error: 'Account appearance is unavailable.' });
    return res.json({ theme: ['light', 'dark'].includes(record.appearanceTheme) ? record.appearanceTheme : null });
  });
  app.put('/api/auth/appearance', requireAuth(), (req: any, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || !['light', 'dark'].includes(req.body.theme)) {
      return res.status(400).json({ error: 'Supply only theme: light or dark.' });
    }
    const record = recordFor(req);
    if (!record) return res.status(404).json({ error: 'Account appearance is unavailable.' });
    record.appearanceTheme = req.body.theme;
    save();
    return res.json({ theme: record.appearanceTheme });
  });
}
