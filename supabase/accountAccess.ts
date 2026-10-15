import type {PoolClient} from 'pg';
import {ApiError} from './db.js';
import type {AccountFeature} from '../accountFeatures.js';

/** Only canonical operations and verified server-owned actors determine restrictions. */
export function accountFeaturesForRequest(method:string,path:string):AccountFeature[] {
 const p=path.toLowerCase().replace(/\/+$/,''),write=['POST','PUT','PATCH','DELETE'].includes(method.toUpperCase());
 if(p==='/api/digital-market/messages')return ['messaging'];
 if(!write)return [];
 const features:AccountFeature[]=[];
 if(p==='/api/room-keys/send-digital'||/^\/api\/(?:hostels\/[^/]+\/(?:generate-room-keys|reshuffle-room-keys)|room-keys\/[^/]+\/release)$/.test(p))features.push('rooms');
 if(p==='/api/auth/officer-invitation/accept'||p==='/api/auth/enrollments'||/^\/api\/auth\/enrollments\/[^/]+\/(verify|reactivate(?:\/send-code)?)$/.test(p)
   ||['/api/auth/register-manager','/api/auth/register-manager-account','/api/manager-verifications/submit','/api/digital-market/register','/api/staff'].includes(p))
  features.push('subaccounts');
 if(['/api/room-keys/claim','/api/residents/onboard','/api/room-keys/verify','/api/student/add-room'].includes(p))
  features.push('subaccounts','rooms');
 if(method.toUpperCase()==='POST'&&p==='/api/digital-market/orders')features.push('orders');
 if(p.startsWith('/api/digital-market/products')||['/api/storage/upload-market-image','/api/storage/upload-market-images'].includes(p))features.push('publishing');
 if(method.toUpperCase()==='POST'&&['/api/issue-reports','/api/storage/upload-maintenance-image'].includes(p))features.push('maintenance');
 return [...new Set(features)];
}
export async function requireAccountAccess(c:PoolClient,contextId:string,features:AccountFeature[]=[],sessionId?:string) {
 const access=(await c.query('select private.account_access($1) as access',[contextId])).rows[0].access;
 if(access.banned) {
  const error=new ApiError(403,'This account is banned until '+access.until+'. Reason: '+access.reason,'account_banned');
  Object.assign(error,{accountAccess:access});throw error;
 }
 if(sessionId&&!(await c.query('select private.account_session_allowed($1,$2) as allowed',[contextId,sessionId])).rows[0].allowed)
  throw new ApiError(401,'Please sign in again to access this account.','account_signin_required');
 const restriction=access.restrictions.find((r:any)=>r.features.some((f:AccountFeature)=>features.includes(f)));
 if(restriction) {
  const error=new ApiError(403,'This feature is restricted. Reason: '+restriction.reason,'account_restricted');
  Object.assign(error,{accountAccess:access});throw error;
 }
 return access;
}
