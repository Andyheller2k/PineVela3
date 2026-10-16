import type {PoolClient} from 'pg';
import type {SupabaseAuth} from './auth.js';
import type {VerifiedActor} from './db.js';
import {checkApprovalKey,deniedApprovalKey,requireApprovalGrant} from './adminGovernance.js';

/** Commit failed guesses before denying the request, then revalidate the exact
 * actor/key version inside the mutation transaction. A UI prompt is not proof. */
export async function administratorApproval<T>(auth:SupabaseAuth,actor:VerifiedActor,key:unknown,
 work:(client:PoolClient)=>Promise<T>):Promise<T>{
 const grant=await auth.db.authorizedSystem(actor,['admin'],c=>checkApprovalKey(c,actor,key));
 deniedApprovalKey(grant);
 return auth.db.authorizedSystem(actor,['admin'],async c=>{
  await requireApprovalGrant(c,actor,grant);
  return work(c);
 });
}
