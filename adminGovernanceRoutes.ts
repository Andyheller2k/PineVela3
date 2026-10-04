import type { Express } from 'express';
import { AdminGovernance, GovernanceError } from './adminGovernance.js';
import { AccountModerationError } from './accountModeration.js';

export function installAdminGovernance(app: Express, requireAuth: any, governance: AdminGovernance) {
  const route = (action: (req: any) => any) => async (req: any, res: any) => {
    res.set('Cache-Control', 'no-store');
    try { return res.json(await governance.run(() => action(req))); }
    catch (error) {
      if (error instanceof GovernanceError || error instanceof AccountModerationError) {
        if (error.status === 429) res.set('Retry-After', '900');
        return res.status(error.status).json({ error: error.message });
      }
      console.error('[Admin governance] Operation failed:', error instanceof Error ? error.message : 'Unknown error');
      return res.status(503).json({ error: 'This operation could not be saved or verified. Nothing further will be executed; inspect server recovery logs.' });
    }
  };
  const auth = requireAuth(['admin']), root = '/api/admin/governance';
  app.get(root, auth, route(req => governance.view(req.user.id)));
  app.post(`${root}/keys/enroll`, auth, route(req => governance.enroll(req.user.id, req.body.password)));
  app.post(`${root}/keys/settings/enroll`, auth, route(req => governance.enrollSettingsKey(req.user.id, req.body.password)));
  app.post('/api/settings', auth, route(req => governance.updateSettings(req.user.id, req.body)));
  app.post(`${root}/pricing`, auth, route(req => governance.proposePricing(req.user.id, req.body)));
  app.post(`${root}/pricing/:id/vote`, auth, route(req => governance.decidePricing(req.user.id, req.params.id, req.body)));
  app.post(`${root}/pricing/:id/apply`, auth, route(req => governance.applyPricing(req.user.id, req.params.id, req.body)));
  app.post(`${root}/accounts/preview`, auth, route(req => governance.moderation.preview(req.body.targetId, req.body.targetRole)));
  app.post(`${root}/accounts`, auth, route(req => governance.moderation.propose(req.user.id, req.body)));
  app.post(`${root}/accounts/:id/vote`, auth, route(req => governance.moderation.vote(req.user.id, req.params.id, req.body)));
  app.post(`${root}/accounts/:id/apply`, auth, route(req => governance.moderation.apply(req.user.id, req.params.id, req.body)));
  app.post(`${root}/accounts/:id/final-reject`, auth, route(req => governance.moderation.rejectFinal(req.user.id, req.params.id, req.body)));
  app.post(`${root}/invitations`, auth, route(req => governance.invite(req.user.id, req.body)));
  app.post(`${root}/invitations/:id/cancel`, auth, route(req => governance.cancelInvitation(req.user.id, req.params.id, req.body.privateKey)));
  app.post('/api/auth/admin-invitation/accept', route(req => governance.acceptInvitation(req.body)));
  app.post(`${root}/members/:id/status`, auth, route(req => governance.setActive(req.user.id, req.params.id, req.body.active, req.body.privateKey)));
  app.post(`${root}/members/:id/changes`, auth, route(req => governance.requestChange(req.user.id, req.params.id, req.body)));
  app.post(`${root}/changes/:id/vote`, auth, route(req => governance.decideChange(req.user.id, req.params.id, req.body)));
  app.post(`${root}/preview`, auth, route(req => governance.preview(req.user.id, req.body.scopes)));
  app.post(`${root}/proposals`, auth, route(req => governance.propose(req.user.id, req.body)));
  app.post(`${root}/proposals/:id/vote`, auth, route(req => governance.decide(req.user.id, req.params.id, req.body)));
  app.post(`${root}/proposals/:id/execute`, auth, route(req => governance.execute(req.user.id, req.params.id, req.body)));
  app.post('/api/admin/clear-all-registered-accounts', auth, (_req, res) => res.status(410).json({ error: 'Single-administrator wipes are retired. Submit a five-administrator wipe proposal.' }));
}
