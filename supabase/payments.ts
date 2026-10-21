import crypto from 'node:crypto';
import express,{type Express,type RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {sellerStore} from './storeSetup.js';
import {sellerStatus} from './sellerRegistration.js';
import {notify,notifyPrimaryOwner} from './notifications.js';
import {publicPlatformSettings} from '../platformSettings.js';
import {PLAN_LIMITS,validPlan,type MarketPlan} from '../marketPlans.js';
import {paystackConfig,paymentOrigin,paystackRequest,validPaystackSignature,addMonths,PaymentError} from '../paystackProvider.js';
import {AttemptBudgets} from '../resourceSecurity.js';
import {installPaymentReversalRoutes,queuePaymentRecheck,queuePaymentReversal} from './paymentReversals.js';
const paymentBudgets=new AttemptBudgets();
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
const planName=(p:MarketPlan)=>p==='star'?'pine_star':p==='pro'?'pine_pro':'default';
const clientPlan=(p:string):MarketPlan=>p==='pine_star'?'star':p==='pine_pro'?'pro':'default';
const clientPurpose=(p:string)=>p==='store_activation'?'activation':p==='residence_onboarding'?'housing':p;
const REFERENCE=/^PV-[a-f0-9]{48}$/;
function fields(body:any,keys:string[]){if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!keys.includes(k)))throw new ApiError(400,'Unsupported payment fields.');}
function reference(value:unknown){if(typeof value!=='string' || !REFERENCE.test(value))throw new ApiError(400,'Invalid payment reference.');return value;}
async function audit(c:PoolClient,context:string,type:string,id:string){await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,$2,'payment',$3)",[context,type,id]);}
async function capacity(c:PoolClient,store:string,plan:MarketPlan){const row=(await c.query(`select count(*) filter(where kind='product')::integer as items,count(*) filter(where kind='service')::integer as services,
  coalesce(sum(stock_quantity) filter(where kind='product'),0)::integer as units from public.listings where store_id=$1 and retired_at is null`,[store])).rows[0],limit=PLAN_LIMITS[plan];
  if(row.items>limit.items || row.services>limit.services || row.units>limit.inventory)throw new ApiError(409,'Reduce your listings and inventory to this plan’s limits before switching.');}
const query=`select p.*,q.request_id,q.request_fingerprint,q.payer_email,q.plan,q.amount_minor,q.lines,q.callback_origin,q.settlement_code,q.mobile_money,
  q.initialization_state,q.authorization_url,q.provider_status,q.review_required from public.payments p join private.payment_checkouts q on q.payment_id=p.id`;
async function payment(c:PoolClient,ref:string,a?:VerifiedActor){const p=(await c.query(query+' where p.provider_reference=$1'+(a?' and p.actor_context_id=$2':''),a?[ref,a.contextId]:[ref])).rows[0];if(!p)throw new ApiError(404,'Payment not found for this account.');return p;}
export async function pendingCheckouts(c:PoolClient,a:VerifiedActor){
  if(!['seller','manager'].includes(a.kind))throw new ApiError(403,'Use the account that started checkout.');
  return (await c.query(`select p.provider_reference as reference,p.purpose,p.amount::float8 as amount,p.currency,p.created_at as "createdAt",
    q.initialization_state as "initializationState" from public.payments p join private.payment_checkouts q on q.payment_id=p.id
    where p.actor_context_id=$1 and p.status in ('initialized','pending') and q.review_required is null order by p.created_at desc limit 50`,[a.contextId])).rows.map(p=>({...p,purpose:clientPurpose(p.purpose)}));
}
export async function paymentLedger(c:PoolClient,a:VerifiedActor){
  if(a.kind!=='admin')throw new ApiError(403,'Administrator account required.');
  return (await c.query(`select p.id,p.store_id as "storeId",p.residence_id as "hostelId",
    p.purpose,
    p.amount::float8 as amount,p.currency,p.mode,p.fulfilled_at as "paidAt",q.review_required as "reviewRequired",
    case when r.provider_status='reversed' and r.refunded_minor=0 then 0 else p.amount::float8-coalesce(r.refunded_minor,0)::float8/100 end as "netAmount",
    coalesce(r.refunded_minor,0)::float8/100 as "refundedAmount"
    from public.payments p join private.payment_checkouts q on q.payment_id=p.id left join private.payment_reversals r on r.payment_id=p.id
    where p.status='fulfilled' or q.review_required is not null order by p.created_at desc limit 500`)).rows.map(p=>({...p,purpose:clientPurpose(p.purpose)}));
}
async function lockPayment(c:PoolClient,p:any){
  if(p.store_id)await c.query('select id from public.stores where id=$1 for update',[p.store_id]);
  else await c.query('select id from public.residences where id=$1 for update',[p.residence_id]);
  return (await c.query(query+' where p.id=$1 for update of p,q',[p.id])).rows[0];
}
async function operational(c:PoolClient,p:any){
  if(p.store_id){const s=(await c.query(`select s.*,x.auth_user_id from public.stores s join public.account_contexts x on x.id=s.seller_context_id
    join public.seller_applications a on a.seller_context_id=x.id and a.id=s.application_id and a.registration_generation=x.seller_generation where s.id=$1 and s.seller_context_id=$2 and x.status='active' and a.status='approved' and s.status in ('pending','active')`,[p.store_id,p.actor_context_id])).rows[0];
    if(!s?.setup_completed_at)throw new ApiError(409,'The store is no longer eligible. Contact support about your payment.');return s;}
  const r=(await c.query(`select r.* from public.residences r join public.manager_assignments m on m.residence_id=r.id
    join public.account_contexts x on x.id=m.manager_context_id where r.id=$1 and m.manager_context_id=$2 and m.ended_at is null and x.status='active' and r.status not in ('closed','suspended') for share of m,x`,[p.residence_id,p.actor_context_id])).rows[0];
  if(!r)throw new ApiError(409,'The residence assignment changed. Contact support about your payment.');return r;
}
export async function prepareCheckout(c:PoolClient,a:VerifiedActor,body:any,origin?:string){
  fields(body,['requestId','purpose','plan','hostelId','mobileMoney']);const nonce=uuid(body.requestId);
  if(!['activation','subscription','semester','housing'].includes(body.purpose))throw new ApiError(400,'Choose a valid payment purpose.');
  let mobile:any=null;if(body.mobileMoney!==undefined){fields(body.mobileMoney,['phone','provider']);if(typeof body.mobileMoney.phone!=='string' || !/^(?:0|\+233)[235]\d{8}$/.test(body.mobileMoney.phone) || !['mtn','vod','atl'].includes(body.mobileMoney.provider))throw new ApiError(400,'Enter a valid Ghana mobile-money number and network.');mobile={phone:body.mobileMoney.phone,provider:body.mobileMoney.provider};}
  const purpose=body.purpose==='activation'?'store_activation':body.purpose==='housing'?'residence_onboarding':body.purpose;
  if(body.plan!==undefined && !validPlan(body.plan))throw new ApiError(400,'Invalid subscription plan.');
  if(body.purpose==='activation' && body.plan && body.plan!=='default')throw new ApiError(400,'Registration activates Pine Default. Purchase Star or Pro separately after activation.');
  if(body.purpose!=='housing' && body.hostelId!==undefined || body.purpose==='housing' && body.plan!==undefined)throw new ApiError(400,'Payment selectors do not match this purpose.');
  const selected:MarketPlan=body.purpose==='subscription'?body.plan ?? 'default':'default';
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([purpose,selected,body.hostelId ?? null,mobile])).digest('hex');
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`payment:${a.contextId}`]);
  const existing=(await c.query(query+' where q.actor_context_id=$1 and q.request_id=$2',[a.contextId,nonce])).rows[0];
  if(existing){if(existing.request_fingerprint!==fingerprint)throw new ApiError(409,'This checkout request already has different contents.');
    if(existing.store_id&&!(await c.query(`select 1 from public.stores s join public.account_contexts x on x.id=s.seller_context_id
      where s.id=$1 and s.registration_generation=x.seller_generation and s.status<>'closed'`,[existing.store_id])).rowCount)
      throw new ApiError(409,'This checkout belongs to an earlier store registration. Start a new checkout.');
    return {record:existing,created:false};}
  const settings=(await c.query("select value from private.platform_settings where key='platform' for share")).rows[0]?.value;
  const prices=publicPlatformSettings({platformSettings:settings});let store:any,residence:any;
  if(purpose==='residence_onboarding'){
    if(a.kind!=='manager')throw new ApiError(403,'Use your assigned manager account for residence onboarding payment.');
    const id=uuid(body.hostelId);residence=(await c.query(`select r.* from public.residences r join public.manager_assignments m on m.residence_id=r.id where r.id=$1 and m.manager_context_id=$2 and m.ended_at is null and r.status not in ('closed','suspended') for update of r for share of m`,[id,a.contextId])).rows[0];
    if(!residence)throw new ApiError(404,'Authorized residence not found.');
  }else{store=await sellerStore(c,a,true);if(!store.setup_completed_at)throw new ApiError(409,'Save your store details before checkout.');
    const registered=(await c.query("select id from public.payments where store_id=$1 and purpose='store_activation' and private.payment_grants_access(id)",[store.id])).rowCount;
    if(purpose==='store_activation' && registered)throw new ApiError(409,'Registration has already been paid. Renew your plan or two-month fee instead.');
    if(purpose==='store_activation' && (await c.query("select 1 from public.payments where store_id=$1 and purpose='store_activation' and status='fulfilled'",[store.id])).rowCount)
      throw new ApiError(409,'This store’s original registration payment was reversed. Contact Help for a reviewed registration recovery before starting another checkout.');
    if(purpose!=='store_activation' && !registered)throw new ApiError(403,'Complete verified market registration first.');
    if(['store_activation','subscription'].includes(purpose))await capacity(c,store.id,selected);
  }
  if(residence && (await c.query("select id from public.payments where residence_id=$1 and purpose='residence_onboarding' and private.payment_grants_access(id)",[residence.id])).rowCount)throw new ApiError(409,'Residence onboarding has already been paid.');
  if(residence && (await c.query("select 1 from public.payments where residence_id=$1 and purpose='residence_onboarding' and status='fulfilled'",[residence.id])).rowCount)
    throw new ApiError(409,'This residence’s original onboarding payment was reversed. Contact Help for a reviewed payment recovery before starting another checkout.');
  const payer=(await c.query('select email from public.profiles where id=$1',[a.authUserId])).rows[0]?.email;if(!payer)throw new ApiError(403,'A verified account is required.');
  const charge=purpose==='store_activation'?prices.registrationFee:purpose==='subscription'?prices.subscriptionPrices[selected]:purpose==='semester'?prices.semesterFee:50;
  if(!Number.isFinite(charge) || charge<0 || charge>1000000 || Math.abs(charge*100-Math.round(charge*100))>0.00001)throw new ApiError(503,'Payment pricing requires administrator review.');
  const minor=Math.round(charge*100),mode=minor?paystackConfig().mode:'free',settlement=settings?.paystackSettlement;
  if(minor && settlement?.code && (settlement.mode!==mode || !/^ACCT_[A-Za-z0-9]{1,80}$/.test(settlement.code)))throw new ApiError(503,'The receiving account requires administrator configuration for this payment environment.');
  if(minor && !mobile && !origin)throw new ApiError(503,'Configure the trusted payment return origin.');
  const unfinished=(await c.query("select count(*)::integer as n from public.payments where actor_context_id=$1 and status in ('initialized','pending') and created_at>now()-interval '24 hours'",[a.contextId])).rows[0].n;
  if(unfinished>=5)throw new ApiError(429,'Finish or verify an existing checkout before starting another.');
  const lines=[{kind:purpose==='store_activation'?'registration':body.purpose,amount:charge,amountMinor:minor}];
  const p=(await c.query(`insert into public.payments(actor_context_id,residence_id,store_id,provider,provider_reference,purpose,status,amount,currency,mode)
    values($1,$2,$3,$4,$5,$6,'initialized',$7,'GHS',$8) returning id`,[a.contextId,residence?.id || null,store?.id || null,minor?'paystack':'platform',`PV-${crypto.randomBytes(24).toString('hex')}`,purpose,charge,mode])).rows[0];
  await c.query(`insert into private.payment_checkouts(payment_id,actor_context_id,request_id,request_fingerprint,payer_email,plan,amount_minor,lines,callback_origin,settlement_code,mobile_money)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[p.id,a.contextId,nonce,fingerprint,payer,store?planName(selected):null,minor,JSON.stringify(lines),minor && !mobile?origin:null,minor && settlement?.code || null,mobile?JSON.stringify(mobile):null]);
  await audit(c,a.contextId,'payment_quote_created',p.id);return {record:(await c.query(query+' where p.id=$1',[p.id])).rows[0],created:true};
}
async function result(c:PoolClient,p:any){
  const purpose=clientPurpose(p.purpose);
  const own=(await c.query('select private.current_context_id() as id')).rows[0].id===p.actor_context_id;
  const currentStore=!p.store_id||!!(await c.query(`select 1 from public.stores s join public.account_contexts x on x.id=s.seller_context_id
    where s.id=$1 and s.registration_generation=x.seller_generation and s.status<>'closed' and x.status='active'`,[p.store_id])).rowCount;
  const accessGranted=p.status==='fulfilled'&&currentStore&&(await c.query('select private.payment_grants_access($1) as allowed',[p.id])).rows[0].allowed;
  const reversal=(await c.query('select provider_status,refunded_minor from private.payment_reversals where payment_id=$1',[p.id])).rows[0];
  return {success:true,paid:p.status==='fulfilled' || !!p.review_required,accessGranted,
    ...(reversal?{refundedAmount:Number(reversal.refunded_minor)/100,reversed:(reversal.provider_status==='reversed'&&Number(reversal.refunded_minor)===0)||Number(reversal.refunded_minor)>=Number(p.amount_minor),
      ...(!accessGranted?{message:'Paid access from this receipt has ended after payment reconciliation. Contact Help if you need a review.'}:{})}:{}),
    ...(!currentStore?{historical:true,message:'This payment belongs to a previous store registration. A new store requires its own registration payment.'}:{}),paymentRequired:!accessGranted && !p.review_required,
    reference:p.provider_reference,purpose,mode:p.mode,amount:Number(p.amount),currency:p.currency,lines:p.lines,
    ...(p.review_required?{reviewRequired:true,message:p.review_required}:{}),...(p.store_id && own && currentStore?{store:(await sellerStatus(c,{contextId:p.actor_context_id,kind:'seller'} as VerifiedActor)).store}:{})};
}
function receipt(p:any,e:any){
  if(e?.status!=='success')throw new ApiError(409,'Payment has not succeeded. Finish checkout before verifying.');
  if(e.reference!==p.provider_reference || e.amount!==Number(p.amount_minor) || e.currency!=='GHS' || e.domain!==p.mode || typeof e.customer?.email!=='string' || e.customer.email.trim().toLowerCase()!==p.payer_email || p.settlement_code && e.subaccount?.subaccount_code!==p.settlement_code)throw new ApiError(409,'Provider receipt does not match the saved payment quote. Contact support.');
  return {status:'success',reference:e.reference,amount:e.amount,currency:e.currency,domain:e.domain,email:p.payer_email,source:'paystack_verify',...(p.settlement_code?{settlementCode:p.settlement_code}:{})};
}
/** Evidence is accepted only from the server's verify request, never an API body. */
export async function fulfillCheckout(c:PoolClient,id:string,evidence?:unknown){
  let p=(await c.query(query+' where p.id=$1',[id])).rows[0];if(!p)throw new ApiError(404,'Payment not found.');p=await lockPayment(c,p);
  if(p.status==='fulfilled' || p.review_required)return result(c,p);
  if(p.mode==='test')throw new ApiError(403,'Test payments cannot grant access in the Supabase application database.');
  const proof=p.mode==='free' && Number(p.amount_minor)===0?{status:'success',reference:p.provider_reference,amount:0,currency:'GHS',domain:'free',email:p.payer_email,source:'platform_zero_fee'}:receipt(p,evidence);
  // Retain authentic payment evidence when changed eligibility requires support.
  await c.query('update public.payments set provider_receipt=$2 where id=$1',[p.id,JSON.stringify(proof)]);
  await c.query('savepoint payment_access');
  try{
    const target=await operational(c,p);if(['store_activation','subscription'].includes(p.purpose))await capacity(c,p.store_id,clientPlan(p.plan));
    if(p.purpose==='store_activation' && (await c.query("select id from public.payments where store_id=$1 and purpose='store_activation' and id<>$2 and private.payment_grants_access(id)",[p.store_id,p.id])).rowCount)throw new ApiError(409,'Another registration payment already activated the store. Contact support about this duplicate charge.');
    if(p.purpose==='residence_onboarding' && (await c.query("select id from public.payments where residence_id=$1 and purpose='residence_onboarding' and id<>$2 and private.payment_grants_access(id)",[p.residence_id,p.id])).rowCount)throw new ApiError(409,'Another payment fulfilled residence onboarding. Contact support about this duplicate charge.');
    const now=(await c.query("select date_trunc('milliseconds',now()) as t")).rows[0].t.getTime();
    await c.query("update public.payments set status='fulfilled',fulfilled_at=date_trunc('milliseconds',now()) where id=$1",[p.id]);
    if(['store_activation','semester'].includes(p.purpose)){
      const previous=(await c.query('select max(ends_at) as t from public.store_fee_periods where store_id=$1 and private.payment_grants_access(payment_id)',[p.store_id])).rows[0].t?.getTime() || 0;
      const end=p.purpose==='store_activation'?addMonths(now,2):Number(p.amount_minor)===0?new Date(Math.max(previous,Date.parse(addMonths(now,2)))).toISOString():addMonths(Math.max(now,previous),2);
      await c.query("insert into public.store_fee_periods(store_id,payment_id,starts_at,ends_at) values($1,$2,date_trunc('milliseconds',now()),$3)",[p.store_id,p.id,end]);
    }
    if(['store_activation','subscription'].includes(p.purpose)){
      const old=(await c.query("select * from public.store_subscriptions where store_id=$1 and private.payment_grants_access(payment_id) order by period_sequence desc limit 1",[p.store_id])).rows[0];
      const previous=old?.plan===p.plan?Math.max(now,old.ends_at.getTime()):now;
      const end=p.purpose==='store_activation'?addMonths(now,2):Number(p.amount_minor)===0?new Date(Math.max(previous,Date.parse(addMonths(now,1)))).toISOString():addMonths(previous,1);
      await c.query("update public.store_subscriptions set status='cancelled' where store_id=$1 and status='active'",[p.store_id]);
      await c.query("insert into public.store_subscriptions(store_id,payment_id,plan,starts_at,ends_at) values($1,$2,$3,date_trunc('milliseconds',now()),$4)",[p.store_id,p.id,p.plan,end]);
      if(p.purpose==='store_activation')await c.query("update public.stores set status='active',activated_at=coalesce(activated_at,now()) where id=$1",[p.store_id]);
    }
    await c.query('update private.payment_checkouts set review_required=null where payment_id=$1',[p.id]);
    await audit(c,p.actor_context_id,'payment_fulfilled',p.id);
    await notify(c,[p.actor_context_id],{category:p.store_id?'market_payment':'payment',title:'Payment Confirmed',message:p.purpose==='store_activation'?'Registration confirmed. Pine Default and your initial two-month access are active. Star/Pro upgrades are separate.':`Your ${p.purpose==='semester'?'two-month fee':p.purpose==='subscription'?'monthly plan':'residence onboarding'} payment was verified and saved.`,sender:p.actor_context_id});
    if(p.purpose==='store_activation')await notifyPrimaryOwner(c,p.actor_context_id,{category:'account_submission',title:'Your Seller Store Is Active',message:`${target.name} is active after verified registration payment.`,sender:p.actor_context_id});
    await c.query('release savepoint payment_access');
  }catch(error){await c.query('rollback to savepoint payment_access');if(!(error instanceof ApiError))throw error;
    await c.query('update private.payment_checkouts set review_required=$2 where payment_id=$1',[p.id,error.message]);
    await audit(c,p.actor_context_id,'paid_access_requires_review',p.id);
    const admins=(await c.query("select c.id from public.account_contexts c join public.admin_memberships m on m.context_id=c.id where c.kind='admin' and c.status='active' and m.status='active'")).rows.map(r=>r.id);
    await notify(c,[p.actor_context_id,...admins],{category:'payment_review',title:'Verified Payment Needs Review',message:error.message,sender:p.actor_context_id});
  }
  return result(c,(await c.query(query+' where p.id=$1',[p.id])).rows[0]);
}
export class SupabasePayments {
  constructor(readonly auth:SupabaseAuth){}
  async initialize(a:VerifiedActor,body:any,req?:any){
    paymentBudgets.reserve([{scope:'checkout-account',identity:a.contextId,maximum:15,windowMs:60000}]);
    let origin:string|undefined;try{origin=paymentOrigin(req);}catch{/* Zero-fee and mobile-money payments do not need a redirect. */}
    const prepared=await this.auth.db.authorizedSystem(a,['seller','manager'],c=>prepareCheckout(c,a,body,origin)),p=prepared.record;
    if(p.status==='fulfilled')return this.auth.db.authorizedSystem(a,['seller','manager'],c=>result(c,p));
    if(p.mode==='free')return this.auth.db.authorizedSystem(a,['seller','manager'],c=>fulfillCheckout(c,p.id));
    if(prepared.created){
      const payload={email:p.payer_email,amount:Number(p.amount_minor),currency:'GHS',reference:p.provider_reference,metadata:JSON.stringify({transactionId:p.id}),...(p.settlement_code?{subaccount:p.settlement_code,transaction_charge:0,bearer:'subaccount'}:{})};
      try{
        const data=await paystackRequest(p.mobile_money?'/charge':'/transaction/initialize',p.mobile_money?{...payload,mobile_money:p.mobile_money}:{...payload,callback_url:`${p.callback_origin}/api/payments/paystack/callback`});
        let url:string|null=null;if(data.reference!==p.provider_reference)throw new PaymentError('Invalid checkout response.',502);
        if(!p.mobile_money){const u=new URL(data.authorization_url || '');if(u.protocol!=='https:' || u.hostname!=='checkout.paystack.com' || u.username || u.password)throw new PaymentError('Invalid checkout response.',502);url=u.href;}
        await this.auth.db.system(async c=>{await c.query("update private.payment_checkouts set initialization_state='ready',authorization_url=$2,provider_status=$3 where payment_id=$1",[p.id,url,typeof data.status==='string'?data.status.slice(0,100):null]);await c.query("update public.payments set status='pending' where id=$1 and status='initialized'",[p.id]);});
      }catch{await this.auth.db.system(c=>c.query("update private.payment_checkouts set initialization_state='uncertain' where payment_id=$1 and initialization_state='reserved'",[p.id]));}
    }
    return this.auth.db.authorizedSystem(a,['seller','manager'],async c=>{const fresh=await payment(c,p.provider_reference,a);const response=await result(c,fresh);return {...response,
      ...(fresh.authorization_url?{authorizationUrl:fresh.authorization_url}:{}),...(fresh.mobile_money?{mobileMoney:true}:{}),
      ...(fresh.initialization_state!=='ready'?{initializationUncertain:true,message:'Checkout could not be confirmed. Keep this reference and verify it before starting another payment.'}:{}),providerStatus:fresh.provider_status};});
  }
  async verify(a:VerifiedActor|null,value:unknown){const ref=reference(value);
    if(a)paymentBudgets.reserve([{scope:'payment-verify-account',identity:a.contextId,maximum:15,windowMs:60000}]);
    const load=(c:PoolClient)=>payment(c,ref,a || undefined);
    const p=a?await this.auth.db.authorizedSystem(a,['seller','manager'],load):await this.auth.db.system(load);
    if(p.status==='fulfilled'){
      const recheck=async(c:PoolClient)=>{if(p.mode==='live'&&p.provider==='paystack')await queuePaymentRecheck(c,p.id);return result(c,p);};
      return a?this.auth.db.authorizedSystem(a,['seller','manager'],recheck):this.auth.db.system(recheck);
    }
    if(p.mode==='test')throw new ApiError(403,'Test payments cannot grant access in the Supabase application database.');
    if(p.mode!=='free' && paystackConfig().mode!==p.mode)throw new ApiError(409,'The payment environment changed. Contact support.');
    const evidence=p.mode==='free'?undefined:await paystackRequest(`/transaction/verify/${ref}`);
    return a?this.auth.db.authorizedSystem(a,['seller','manager'],c=>fulfillCheckout(c,p.id,evidence)):this.auth.db.system(c=>fulfillCheckout(c,p.id,evidence));
  }
}
/** Install before JSON/CSRF parsing: provider requests authenticate the raw payload. */
export function installPaymentWebhook(app:Express,auth:SupabaseAuth){const payments=new SupabasePayments(auth);
  app.post('/api/payments/paystack/webhook',express.raw({type:'application/json',limit:'128kb',inflate:false}),route(async(req,res)=>{
    const {key}=paystackConfig();if(!Buffer.isBuffer(req.body) || !validPaystackSignature(req.body,req.get('x-paystack-signature'),key))throw new ApiError(401,'Invalid payment signature.');
    let event:any;try{event=JSON.parse(req.body.toString('utf8'));}catch{throw new ApiError(400,'Invalid webhook JSON.');}
    if(event?.event==='charge.success' && typeof event.data?.reference==='string' && REFERENCE.test(event.data.reference)){
      const exists=(await auth.db.pool.query('select 1 from public.payments where provider=$1 and provider_reference=$2',['paystack',event.data.reference])).rowCount;
      if(exists)await payments.verify(null,event.data.reference);
    }
    await queuePaymentReversal(auth,event,crypto.createHash('sha256').update(req.body).digest('hex'));
    res.json({received:true});
  }));
}
export function installPayments(app:Express,auth:SupabaseAuth){const payments=new SupabasePayments(auth);
  installPaymentReversalRoutes(app,auth);
  app.get('/api/payments/paystack/pending',auth.require(['seller','manager']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['seller','manager'],c=>pendingCheckouts(c,req.actor)))));
  app.post('/api/payments/paystack/initialize',auth.require(['seller','manager']),route(async(req,res)=>res.json(await payments.initialize(req.actor,req.body,req))));
  app.post('/api/digital-market/subscription',auth.require(['seller']),route(async(req,res)=>{fields(req.body,['requestId','plan']);res.json(await payments.initialize(req.actor,{...req.body,purpose:'subscription'},req));}));
  app.post('/api/hostel-verifications/pay-onboarding-fee',auth.require(['manager']),route(async(req,res)=>{fields(req.body,['requestId','hostelId','mobileMoney']);res.json(await payments.initialize(req.actor,{...req.body,purpose:'housing'},req));}));
  app.post('/api/payments/paystack/verify',auth.require(['seller','manager']),route(async(req,res)=>{fields(req.body,['reference']);res.json(await payments.verify(req.actor,req.body.reference));}));
  app.get('/api/payments/paystack/callback',(req,res,next)=>{try{res.redirect(`${paymentOrigin(req)}/#/payments/return?reference=${encodeURIComponent(reference(req.query.reference))}`);}catch(e){next(e);}});
  app.get('/api/admin/payments',auth.require(['admin']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>paymentLedger(c,req.actor)))));
}
