import {json,type Express,type RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import type {AuthRequest,SupabaseAuth} from './auth.js';
import type {VerifiedActor} from './db.js';
import {registrationStatus} from './accountStatus.js';
import {readOwnedEnrollments} from './enrollment.js';
import {googleManagerDevelopmentEnabled} from './googleManagerEnrollment.js';
import {checkProfileContext} from './profiles.js';
import {checkRegistrationRestrictionRequest,primaryManagerRegistrationRestriction} from './registrationRestrictions.js';

export function checkManagerOnboardingRequest(actor:VerifiedActor,request:Pick<AuthRequest,'query'|'body'|'headers'>){
  checkRegistrationRestrictionRequest(actor,request);
  checkProfileContext(actor,request.headers['x-pinevela-profile-context']);
}
/** One already-authorized transaction; no guessed identities, cached permissions,
 * provider calls, account creation or writes. Policy is selected by the server. */
export async function managerOnboardingSnapshot(client:PoolClient,actor:VerifiedActor,googleManagerEnrollment:boolean){
  const access=await primaryManagerRegistrationRestriction(client,actor);
  const registrations=await registrationStatus(client,actor);
  const enrollments=await readOwnedEnrollments(client,actor);
  return {registrations,enrollments,policy:{googleManagerEnrollment},access};
}
export function installManagerOnboarding(app:Express,auth:SupabaseAuth){
  const read:RequestHandler=(req,res,next)=>{
    const request=req as AuthRequest;
    try{checkManagerOnboardingRequest(request.actor,request);}catch(error){return next(error);}
    const googleManagerEnrollment=googleManagerDevelopmentEnabled(request);
    auth.db.authorizedRead(request.actor,['primary'],client=>managerOnboardingSnapshot(client,request.actor,googleManagerEnrollment))
      .then(snapshot=>res.json(snapshot)).catch(next);
  };
  app.get('/api/users/manager-onboarding',json({limit:'1mb',inflate:false}),auth.require(['primary']),read);
}
