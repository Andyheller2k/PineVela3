/** Real zero-fee policy exercised only by rollback/isolated verification scripts.
 * No payment provider response or successful paid charge is fabricated. */
import crypto from 'node:crypto';
import type {PoolClient} from 'pg';
import type {VerifiedActor} from '../../supabase/db.js';
import {prepareCheckout,fulfillCheckout} from '../../supabase/payments.js';
import type {MarketPlan} from '../../marketPlans.js';
export async function freeStoreVerification(c:PoolClient,a:VerifiedActor,plan:MarketPlan='default',purpose:'activation'|'subscription'|'semester'='activation'){
  const prior=(await c.query("select value from private.platform_settings where key='platform'")).rows[0];
  const settings={...(prior?.value || {}),registrationFee:0,semesterFee:0,subscriptionPrices:{default:0,star:0,pro:0}};
  await c.query("insert into private.platform_settings(key,value) values('platform',$1) on conflict(key) do update set value=excluded.value",[JSON.stringify(settings)]);
  try{
    const payment=await prepareCheckout(c,a,{requestId:crypto.randomUUID(),purpose,plan:purpose==='activation'?'default':plan});
    const activated=await fulfillCheckout(c,payment.record.id);
    if(!activated.accessGranted)throw new Error('Actual zero-fee policy did not grant eligible access.');
    if(purpose==='activation' && plan!=='default'){
      const upgrade=await prepareCheckout(c,a,{requestId:crypto.randomUUID(),purpose:'subscription',plan});
      if(!(await fulfillCheckout(c,upgrade.record.id)).accessGranted)throw new Error('Actual zero-fee plan policy did not grant eligible upgrade.');
    }
    return activated;
  }finally{
    if(prior)await c.query("update private.platform_settings set value=$1 where key='platform'",[JSON.stringify(prior.value)]);
    else await c.query("delete from private.platform_settings where key='platform'");
  }
}
