import express, { type ErrorRequestHandler } from 'express';
import { ApiError, SupabaseDatabase } from './db.js';
import { SupabaseAuth, csrfBoundary, installSupabaseAuth, type AuthRequest } from './auth.js';
import { installCatalog } from './catalog.js';
import { installNotifications } from './notifications.js';
import { installRealtime } from './realtime.js';
import { installEnrollment } from './enrollment.js';
import { SignupError } from '../supabaseSignup.js';
import { installAccountStatus } from './accountStatus.js';
import { installManagerKeys } from './managerKeys.js';
import { installMedia } from './media.js';
import { installProfiles } from './profiles.js';
import { ImageUploadError } from '../imageUploadSecurity.js';
import { installHousing } from './housing.js';
import { installResidenceRegistration } from './residenceRegistration.js';
import { installResidenceStructure } from './residenceStructure.js';
import { installStaff } from './staff.js';
import { installStaffRetention } from './staffRetention.js';
import { installMeetings } from './meetings.js';
import { installSellerRegistration } from './sellerRegistration.js';
import { installStoreSetup } from './storeSetup.js';
import { installInventory } from './inventory.js';
import { installOrders } from './orders.js';
import { installMarketConversation } from './marketConversation.js';
import {installPayments,installPaymentWebhook} from './payments.js';
import {PaymentError} from '../paystackProvider.js';
import { installAdministratorSettings } from './adminSettings.js';
import { installAdminGovernance } from './adminGovernance.js';
import { installAdminInvitations } from './adminInvitations.js';
import { installAdminMessages } from './adminMessages.js';
import { installAccountReviews } from './accountReviews.js';
import { installPricing } from './pricing.js';
import { installPublicSettings } from './publicSettings.js';
import { maintenanceBoundary, installRecoveryNotice } from './platformMaintenance.js';
import { installMaintenance } from './maintenance.js';
import { installDashboardReads } from './dashboardReads.js';
import { installInspections } from './inspections.js';
import { installManagerRegistration } from './managerRegistration.js';
import { publicPlatformSettings } from '../platformSettings.js';
import { AttemptBudgets, ResourceLimitError, trustedProxyAddresses } from '../resourceSecurity.js';

/** Replacement backend is tested independently until all active routes are ported.
 * It never imports localDb, persistentDb, JSON credentials, or legacy bootstrap. */
export function createSupabaseApp(db: SupabaseDatabase) {
  const app = express(), auth = new SupabaseAuth(db);
  const budgets = new AttemptBudgets();
  app.disable('x-powered-by');
  app.set('trust proxy', trustedProxyAddresses());
  app.use('/api', (_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); next(); });
  app.use('/api', (req, _res, next) => {
    try {
      const limits = [
        { scope: 'supabase-api-ip', identity: req.ip || req.socket.remoteAddress || '', maximum: 900, windowMs: 60000 },
        { scope: 'supabase-api-global', identity: 'all', maximum: 3000, windowMs: 60000 },
      ];
      if (req.method === 'POST' && (req.path.startsWith('/auth/staff-invitations/') || /^\/auth\/(login|register-unified|verify-unified|recover|enrollments(?:\/[^/]+\/(?:verify|resend|reactivate))?|google\/start)$/.test(req.path) || /\/(login|verification-team-login)$/.test(req.path))) limits.push({ scope: 'supabase-auth-ip', identity: req.ip || req.socket.remoteAddress || '', maximum: 20, windowMs: 60000 });
      if (req.method === 'POST' && ['/room-keys/claim','/room-keys/verify','/residents/onboard'].includes(req.path)) limits.push({ scope:'supabase-room-key-ip',identity:req.ip || req.socket.remoteAddress || '',maximum:10,windowMs:60000 });
      budgets.reserve(limits); next();
    } catch (error) { next(error); }
  });
  installPaymentWebhook(app,auth);
  app.use('/api', csrfBoundary);
  app.use('/api', maintenanceBoundary(auth));
  installMedia(app,auth);
  app.use(express.json({ limit: '1mb',inflate:false }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', persistence: 'supabase' }));
  app.get('/api/settings', (_req, res, next) => {
    db.system(async client => {
      const { rows } = await client.query("select value from private.platform_settings where key = 'platform'");
      return publicPlatformSettings({ platformSettings: rows[0]?.value });
    }).then(settings => res.json(settings)).catch(next);
  });
  installSupabaseAuth(app, auth); installCatalog(app, db); installNotifications(app, auth);
  installProfiles(app,auth);
  installEnrollment(app,auth);
  installAccountStatus(app,auth);
  installManagerRegistration(app,auth);
  installInspections(app,auth);
  installHousing(app,auth);
  installResidenceStructure(app,auth);
  installResidenceRegistration(app,auth);
  installDashboardReads(app,auth);
  installMaintenance(app,auth);
  installStaff(app,auth);
  installStaffRetention(app,auth);
  installMeetings(app,auth);
  installSellerRegistration(app,auth);
  installStoreSetup(app,auth);
  installInventory(app,auth);
  installOrders(app,auth);
  installMarketConversation(app,auth);
  installPayments(app,auth);
  installAdministratorSettings(app,auth);
  installAdminGovernance(app,auth);
  installAdminInvitations(app,auth);
  installAdminMessages(app,auth);
  installAccountReviews(app,auth);
  installPricing(app,auth);
  installPublicSettings(app,auth);
  installRecoveryNotice(app,auth);
  installManagerKeys(app,auth);
  app.locals.closeRealtime = installRealtime(app, auth);
  app.get('/api/database/status', auth.require(['admin']), (req, res, next) => {
    db.actor((req as AuthRequest).actor, async client => (await client.query('select now() as checked_at')).rows[0])
      .then(result => res.json({ persistence: 'supabase', connected: true, ...result })).catch(next);
  });
  // Failing clearly prevents an unported operation from writing to JSON or pretending
  // success. This backend is not the default until the workflow checklist is complete.
  app.all('/api/*', (_req, res) => res.status(503).json({ error: 'This operation is not yet available in the Supabase migration backend.' }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const known = error instanceof ApiError || error instanceof ResourceLimitError || error instanceof SignupError || error instanceof ImageUploadError || error instanceof PaymentError;
    const status = known ? error.status : error?.type === 'entity.too.large' ? 413 : error?.type === 'entity.parse.failed' ? 400 :
      ['encoding.unsupported','charset.unsupported'].includes(error?.type) ? 415 : 500;
    if (status === 500) console.error('[Supabase API] Request failed.');
    if (error instanceof ApiError && error.code==='platform_maintenance') res.set('Retry-After','30');
    res.status(status).json({ ...(error instanceof ApiError && error.code==='platform_maintenance' ? {maintenanceMode:true} : {}),error: known ? error.message : status === 400 ? 'Invalid JSON request.' : status === 413 ? 'Request body is too large.' :
      status === 415 ? 'Use uncompressed UTF-8 JSON.' : 'The request could not complete.',
      ...(error instanceof ApiError && error.code ? { code:error.code } : {}),
      ...(error instanceof ApiError && error.code === 'manager_key_required' ? {managerKeyRequired:true} : {}) });
  };
  app.use(errorHandler);
  return { app, auth };
}
