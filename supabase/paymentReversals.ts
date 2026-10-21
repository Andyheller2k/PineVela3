import crypto from 'node:crypto';
import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {paystackConfig,paystackRequest} from '../paystackProvider.js';
import {paymentReversalPolicy} from '../paymentReversalPolicy.js';
import {requireAdministrator,type SettingsGrant} from './adminSettings.js';
import {checkApprovalKey,deniedApprovalKey,requireApprovalGrant} from './adminGovernance.js';
import {notify} from './notifications.js';
import {AttemptBudgets} from '../resourceSecurity.js';

const kinds=new Set(['refund.pending','refund.processing','refund.needs-attention','refund.failed','refund.processed','charge.dispute.create','charge.dispute.remind','charge.dispute.resolve']);
const reference=/^PV-[a-f0-9]{48}$/;
const budgets=new AttemptBudgets();
const hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
function providerId(value:unknown):string {
 if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)return String(value);
 if(typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value)&&Number.isSafeInteger(Number(value)))return value;
 throw new ApiError(502,'The payment provider returned an invalid transaction identifier.');
}
/** Only signed provider events reach this function; payload amounts never change access. */
export async function queuePaymentReversal(auth:SupabaseAuth,event:any,digest:string){
 if(!kinds.has(event?.event))return false;
 let ref=event.data?.transaction_reference||event.data?.transaction?.reference;
 if(!ref){
  const transaction=event.data?.transaction?.id??event.data?.transaction;
  if(typeof transaction==='number'||typeof transaction==='string')ref=(await paystackRequest('/transaction/'+providerId(transaction))).reference;
 }
 if(typeof ref!=='string'||!reference.test(ref))return false;
 const mode=paystackConfig().mode;
 await auth.db.system(async c=>{
  const p=(await c.query("select id,mode from public.payments where provider='paystack' and provider_reference=$1",[ref])).rows[0];
  if(!p)return;
  if(p.mode!==mode||mode!=='live')throw new ApiError(409,'Payment reconciliation environment does not match the saved charge.');
  await c.query(`insert into private.payment_reversal_events(event_digest,payment_id,event_kind) values($1,$2,$3) on conflict(event_digest) do nothing`,[digest,p.id,event.event]);
 });
 return true;
}

async function verifiedSnapshot(p:any){
 if(p.mode!=='live'||paystackConfig().mode!==p.mode)throw new ApiError(409,'Use the original live payment configuration to reconcile this charge.');
 const transaction=await paystackRequest('/transaction/verify/'+p.provider_reference);
 if(!['success','reversed'].includes(transaction?.status)||transaction.reference!==p.provider_reference||transaction.amount!==Number(p.amount_minor)
  ||transaction.currency!=='GHS'||transaction.domain!=='live'||typeof transaction.customer?.email!=='string'
  ||transaction.customer.email.trim().toLowerCase()!==p.payer_email
  ||p.settlement_code&&transaction.subaccount?.subaccount_code!==p.settlement_code)
  throw new ApiError(409,'Provider reconciliation does not match the original payment quote.');
 const id=providerId(transaction.id),refunds=new Map<string,number>();let complete=false;
 for(let page=1;page<=10;page++){
  const rows=await paystackRequest(`/refund?transaction=${id}&perPage=100&page=${page}`);
  if(!Array.isArray(rows)||rows.length>100)throw new ApiError(502,'The refund list could not be verified.');
  for(const refund of rows){
   if(providerId(refund.transaction?.id??refund.transaction)!==id||refund.domain!=='live'||refund.currency!=='GHS')
    throw new ApiError(409,'A provider refund does not match this payment.');
   if(refund.status!=='processed')continue;
   const refundId=providerId(refund.id),amount=refund.amount;
   if(!Number.isSafeInteger(amount)||amount<=0||amount>Number(p.amount_minor)||refunds.has(refundId)&&refunds.get(refundId)!==amount)
    throw new ApiError(409,'A provider refund amount could not be verified.');
   refunds.set(refundId,amount);
  }
  if(rows.length<100){complete=true;break;}
 }
 if(!complete)throw new ApiError(502,'Refund history needs provider review before reconciliation can complete.');
 const refundedMinor=[...refunds.values()].reduce((a,b)=>a+b,0);
 paymentReversalPolicy(Number(p.amount_minor),refundedMinor,transaction.status);
 return {providerStatus:transaction.status as 'success'|'reversed',refundedMinor,
  digest:hash(JSON.stringify([transaction.status,[...refunds].sort(([a],[b])=>a.localeCompare(b))])),refundCount:refunds.size};
}
async function lockPayment(c:PoolClient,p:any){
 await c.query(p.store_id?'select id from public.stores where id=$1 for update':'select id from public.residences where id=$1 for update',[p.store_id||p.residence_id]);
 await c.query('select id from public.payments where id=$1 for update',[p.id]);
}
export async function queuePaymentRecheck(c:PoolClient,paymentId:string){
 const digest=hash('reconcile:'+paymentId+':'+Math.floor(Date.now()/60000));
 await c.query("insert into private.payment_reversal_events(event_digest,payment_id,event_kind) values($1,$2,'reconcile') on conflict do nothing",[digest,paymentId]);
}
/** One leased job per payment, including across application processes/restarts. */
export async function processPaymentReversal(auth:SupabaseAuth){
 const job=await auth.db.system(async c=>{
  await c.query(`update private.payment_reversal_events set status='pending',lease_id=null,lease_until=null where status='processing' and lease_until<clock_timestamp()`);
  return (await c.query(`with candidate as(select e.event_digest from private.payment_reversal_events e
   where e.status='pending' and e.next_at<=clock_timestamp() and not exists(select 1 from private.payment_reversal_events busy
    where busy.payment_id=e.payment_id and busy.status='processing') order by e.created_at for update of e skip locked limit 1)
   update private.payment_reversal_events e set status='processing',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'
   from candidate where e.event_digest=candidate.event_digest returning e.*`)).rows[0];
 });
 if(!job)return false;
 try{
  const p=(await auth.db.pool.query(`select p.*,q.amount_minor,q.payer_email,q.settlement_code from public.payments p
   join private.payment_checkouts q on q.payment_id=p.id where p.id=$1`,[job.payment_id])).rows[0];
  if(!p)throw new ApiError(404,'The original payment could not be found.');
  const snapshot=await verifiedSnapshot(p);
  if(job.event_kind==='refund.processed'&&snapshot.refundCount===0)
   throw new ApiError(502,'The processed refund is not visible in provider history yet. Reconciliation will retry.');
  await auth.db.system(async c=>{
   await lockPayment(c,p);
   const lease=(await c.query(`select event_digest from private.payment_reversal_events where event_digest=$1 and status='processing'
    and lease_id=$2 and lease_until>clock_timestamp() for update`,[job.event_digest,job.lease_id])).rowCount;
   if(!lease)throw new ApiError(409,'Payment reconciliation will be retried by the current worker.');
   const old=(await c.query('select * from private.payment_reversals where payment_id=$1 for update',[p.id])).rows[0];
   const dispute=job.event_kind==='charge.dispute.resolve'?'resolved':job.event_kind.startsWith('charge.dispute')?'open':old?.dispute_state||'none';
   const digest=hash(JSON.stringify([snapshot.digest,dispute]));
   const changed=!old||old.evidence_digest!==digest;
   const review=snapshot.refundedMinor>0||snapshot.providerStatus==='reversed'||dispute!=='none';
   await c.query(`insert into private.payment_reversals(payment_id,provider_status,refunded_minor,evidence_digest,review_required,dispute_state)
    values($1,$2,$3,$4,$5,$7) on conflict(payment_id) do update set provider_status=excluded.provider_status,refunded_minor=excluded.refunded_minor,
    dispute_state=excluded.dispute_state,
    evidence_digest=excluded.evidence_digest,verified_at=clock_timestamp(),revision=payment_reversals.revision+case when $6 then 1 else 0 end,
    review_required=case when $6 then excluded.review_required else payment_reversals.review_required end`,[p.id,snapshot.providerStatus,snapshot.refundedMinor,digest,review,changed,dispute]);
   const summary={providerStatus:snapshot.providerStatus,refundedMinor:snapshot.refundedMinor,refundCount:snapshot.refundCount};
   await c.query(`update private.payment_reversal_events set status='complete',completed_at=clock_timestamp(),lease_id=null,lease_until=null,summary=$3
    where event_digest=$1 and lease_id=$2`,[job.event_digest,job.lease_id,JSON.stringify(summary)]);
   if(changed){
    await c.query("insert into private.audit_events(event_type,resource_type,resource_id) values('payment_reconciled','payment',$1)",[p.id]);
    const admins=(await c.query("select c.id from public.account_contexts c join public.admin_memberships m on m.context_id=c.id where c.kind='admin' and c.status='active' and m.status='active'")).rows.map(r=>r.id);
    if(review)await notify(c,[p.actor_context_id,...admins],{category:'payment_review',title:'Payment reversal reviewed by provider',
     message:paymentReversalPolicy(Number(p.amount_minor),snapshot.refundedMinor,snapshot.providerStatus).reversed
      ?'The provider confirmed a full reversal. Paid access from this receipt has ended. Your order history and original receipt remain saved.'
      :'A partial refund or dispute was received. An administrator can review its effect on paid access.'});
   }
  });
 }catch(error){
  await auth.db.system(c=>c.query(`update private.payment_reversal_events set status='pending',lease_id=null,lease_until=null,
   next_at=clock_timestamp()+least(3600,15*power(2,least(attempts,8))) * interval '1 second'
   where event_digest=$1 and lease_id=$2 and status='processing'`,[job.event_digest,job.lease_id]));
  throw error;
 }
 return true;
}

export function startPaymentReconciliation(auth:SupabaseAuth){
 let stopped=false,pending:Promise<void>|undefined;
 const tick=()=>{if(stopped||pending)return;pending=processPaymentReversal(auth).then(()=>undefined).catch(()=>{
  console.error('[Payments] Reconciliation is pending and will retry.');
 }).finally(()=>{pending=undefined;});};
 const timer=setInterval(tick,15000);timer.unref();tick();
 return async()=>{stopped=true;clearInterval(timer);await pending;};
}

export async function paymentReversalRows(c:PoolClient,a:VerifiedActor){
 await requireAdministrator(c,a);
 return (await c.query(`select p.id,p.provider_reference as reference,p.purpose,p.amount::float8 as amount,p.currency,
  r.provider_status as "providerStatus",r.refunded_minor::float8/100 as "refundedAmount",r.manual_access as "manualAccess",r.dispute_state as "disputeState",
  r.review_required as "reviewRequired",r.revision::text,r.verified_at as "verifiedAt",r.review_reason as "reviewReason",
  exists(select 1 from private.payment_reversal_events e where e.payment_id=p.id and e.status<>'complete') as pending,
  private.payment_grants_access(p.id) as "accessGranted"
  from public.payments p left join private.payment_reversals r on r.payment_id=p.id where p.provider='paystack' and p.mode='live' and(p.status='fulfilled' or r.payment_id is not null
   or exists(select 1 from private.payment_reversal_events e where e.payment_id=p.id and e.status<>'complete'))
  order by (coalesce(r.review_required,false) or exists(select 1 from private.payment_reversal_events e where e.payment_id=p.id and e.status<>'complete')) desc,p.created_at desc limit 100`)).rows;
}
export async function reviewPaymentReversal(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,body:any){
 await requireApprovalGrant(c,a,grant);
 if(!['retain','revoke'].includes(body?.decision)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>500||typeof body.revision!=='string'||!/^\d+$/.test(body.revision))
  throw new ApiError(400,'Choose an access decision and give a reason of 3–500 characters.');
 const p=(await c.query('select * from public.payments where id=$1',[uuid(id)])).rows[0];if(!p)throw new ApiError(404,'Payment not found.');
 await lockPayment(c,p);
 const r=(await c.query('select * from private.payment_reversals where payment_id=$1 for update',[p.id])).rows[0];
 if(!r||String(r.revision)!==body.revision)throw new ApiError(409,'Reconciliation changed. Refresh the review before deciding.');
 if(!r.review_required)throw new ApiError(409,'This reconciliation was already reviewed.');
 await c.query(`update private.payment_reversals set manual_access=$2,review_required=false,reviewed_by_context_id=$3,
  reviewed_at=clock_timestamp(),review_reason=$4,revision=revision+1 where payment_id=$1`,[p.id,body.decision,a.contextId,body.reason.trim()]);
 await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'payment_reversal_reviewed','payment',$2)",[a.contextId,p.id]);
 await notify(c,[p.actor_context_id],{category:'payment_review',title:'Payment access review completed',message:body.decision==='revoke'
  ?'An administrator ended paid access from the reviewed receipt. Your original receipt and order history remain saved.'
  :'An administrator completed the payment review. Confirmed full reversals still end paid access from the reversed receipt.'});
 return {success:true};
}
export function installPaymentReversalRoutes(app:Express,auth:SupabaseAuth){
 app.get('/api/admin/payments/reversals',auth.require(['admin']),route(async(req,res)=>res.json(await auth.db.authorizedRead(req.actor,['admin'],c=>paymentReversalRows(c,req.actor)))));
 app.post('/api/admin/payments/:id/reversal-review',auth.require(['admin']),route(async(req,res)=>{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).some(k=>!['privateKey','decision','reason','revision'].includes(k)))throw new ApiError(400,'Unsupported review fields.');
  budgets.reserve([{scope:'payment-reversal-review',identity:req.actor.contextId,maximum:20,windowMs:60000}]);
  const grant=await auth.db.authorizedSystem(req.actor,['admin'],c=>checkApprovalKey(c,req.actor,req.body.privateKey));deniedApprovalKey(grant);
  res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>reviewPaymentReversal(c,req.actor,grant,req.params.id,req.body)));
 }));
 app.post('/api/admin/payments/:id/reconcile',auth.require(['admin']),route(async(req,res)=>{
  if(Object.keys(req.body||{}).length)throw new ApiError(400,'Payment selectors are not accepted.');
  budgets.reserve([{scope:'payment-reconciliation',identity:req.actor.contextId,maximum:10,windowMs:60000}]);
  await auth.db.authorizedSystem(req.actor,['admin'],async c=>{
   await requireAdministrator(c,req.actor);const id=uuid(req.params.id);
   const p=(await c.query("select id from public.payments where id=$1 and mode='live' and provider='paystack'",[id])).rows[0];if(!p)throw new ApiError(404,'Live payment not found.');
   if(paystackConfig().mode!=='live')throw new ApiError(409,'Configure the original live payment environment before reconciliation.');
   await queuePaymentRecheck(c,p.id);
  });res.status(202).json({success:true,queued:true});
 }));
}
