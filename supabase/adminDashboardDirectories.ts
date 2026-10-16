import type {Express, RequestHandler} from 'express';
import {ApiError, type SupabaseDatabase, type VerifiedActor} from './db.js';
import type {AuthRequest, SupabaseAuth} from './auth.js';
import {accountDirectory, checkAccountReviewContext} from './accountReviews.js';
import {administratorManagerRestrictions, administratorStores} from './adminStoreOverview.js';
import {housingDashboardRows} from './dashboardReads.js';
import {paymentLedger} from './payments.js';
import {checkProfileContext} from './profiles.js';
import {adminResidenceRows} from './residenceRegistration.js';
import {administratorSellerApplications} from './sellerRegistration.js';

export function checkAdministratorDashboardRequest(actor:VerifiedActor,query:object,profileContext:unknown,accountContext:unknown) {
  checkProfileContext(actor,profileContext);
  checkAccountReviewContext(actor,accountContext);
  if(Object.keys(query).length)throw new ApiError(400,'Account selectors are not accepted.');
}

/** One authenticated dashboard read replaces eight independently authenticated
 * HTTP requests. Each group rechecks the live session, policy and maintenance
 * state. Housing and seller views retain their non-BYPASSRLS backend role. */
export async function administratorDashboardDirectories(db:SupabaseDatabase,actor:VerifiedActor) {
  if(actor.kind!=='admin')throw new ApiError(403,'Administrator access required.');
  const [administrator,scoped]=await Promise.allSettled([
    db.authorizedRead(actor,['admin'],async client=>({
      residences:await adminResidenceRows(client,actor),
      managerRestrictions:await administratorManagerRestrictions(client,actor),
      digitalMarketStores:await administratorStores(client,actor),
      paymentRecords:await paymentLedger(client,actor),
      allUsersData:await accountDirectory(client,actor),
    })),
    db.readActor(actor,async client=>({
      boardRequests:await housingDashboardRows(client,'board'),
      activities:await housingDashboardRows(client,'activities'),
      digitalMarketApps:await administratorSellerApplications(client),
    })),
  ]);
  // Finish both read transactions before reporting a failed group; do not leave
  // a sibling transaction using the actor after the HTTP request has ended.
  if(administrator.status==='rejected')throw administrator.reason;
  if(scoped.status==='rejected')throw scoped.reason;
  return {...administrator.value,...scoped.value};
}

export function installAdministratorDashboardDirectories(app:Express,auth:SupabaseAuth) {
  const read:RequestHandler=(req,res,next)=>{
    const request=req as AuthRequest;
    try {
      checkAdministratorDashboardRequest(request.actor,request.query,
        request.headers['x-pinevela-profile-context'],request.headers['x-pinevela-account-context']);
    } catch(error) {next(error);return;}
    administratorDashboardDirectories(auth.db,request.actor).then(data=>res.json(data)).catch(next);
  };
  app.get('/api/admin/dashboard-directories',auth.require(['admin']),read);
}
