import type { Express, RequestHandler } from 'express';

export function needsApprovalKey(method: string, route: string, body: any): boolean {
  if (!['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) return false;
  const path = route.toLowerCase().replace(/\/+$/, '');
  if (/^\/api\/(manager-requests|manager-verifications|hostel-verifications)\/[^/]+\/approve$/.test(path) || path === '/api/admin/digital-market/approve-application') return true;
  if (/^\/api\/hostels\/[^/]+\/verify$/.test(path)) return !(body?.isApproved === false || body?.status === 'Rejected' || body?.approvalStatus === 'Rejected');
  return false; // Direct residence edits are retired; change decisions verify their own approval key.
}

export function installAdminApprovalSecurity(app: Express, requireAuth: (roles?: string[]) => RequestHandler, verify: (id: string, key: unknown) => void) {
  app.use((req: any, res, next) => {
    if (!needsApprovalKey(req.method, req.path, req.body)) return next();
    return requireAuth(['admin'])(req, res, () => {
      try { verify(req.user.id, req.body?.privateKey); delete req.body.privateKey; next(); }
      catch (error: any) { res.status(error.status || 500).json({ error: error.message || 'Approval could not be authorized.' }); }
    });
  });
}
