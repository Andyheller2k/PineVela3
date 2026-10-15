import type {Express, RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import type {SupabaseAuth, AuthRequest} from './auth.js';
import {ApiError, type VerifiedActor} from './db.js';
import {requireAdministrator} from './adminSettings.js';
import {checkAccountReviewContext} from './accountReviews.js';

const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>
  (req,res,next)=>{work(req as AuthRequest,res).catch(next);};

/** Administrator projection only. Historical approvals never confer current access. */
export async function administratorStores(c:PoolClient,a:VerifiedActor) {
  await requireAdministrator(c,a);
  const rows=(await c.query(`select s.id,s.seller_context_id,s.application_id,s.registration_generation,s.name,s.campus,
    s.primary_category,s.status,s.setup_completed_at,s.activated_at,s.created_at,x.status as account_status,
    s.registration_generation=x.seller_generation as is_current,p.display_name as owner_name,p.email as student_email,
    private.account_access(x.id) as account_access,private.store_is_public(s.id) as catalog_eligible,
    exists(select 1 from public.payments pay where pay.store_id=s.id and pay.purpose='store_activation'
      and private.payment_grants_access(pay.id)) as registration_paid,
    (select max(ends_at) from public.store_fee_periods where store_id=s.id) as fee_expires_at,
    exists(select 1 from public.store_fee_periods fee where fee.store_id=s.id and fee.starts_at<=now()
      and fee.ends_at>now() and private.payment_grants_access(fee.payment_id)) as fee_active,
    sub.plan,sub.ends_at as subscription_expires_at
    from public.stores s join public.account_contexts x on x.id=s.seller_context_id and x.kind='seller'
    join public.profiles p on p.id=x.auth_user_id
    join public.seller_applications application on application.id=s.application_id
      and application.seller_context_id=x.id and application.registration_generation=s.registration_generation
    left join lateral(select plan,ends_at from public.store_subscriptions where store_id=s.id
      and status='active' and starts_at<=now() and ends_at>now() and private.payment_grants_access(payment_id)
      order by starts_at desc,id desc limit 1) sub on true
    order by s.created_at desc,s.id`)).rows;
  return rows.map(r=>{
    const isBanned=r.status==='banned'||r.account_access.banned===true;
    const statusLabel=r.status==='closed'?'Closed':!r.is_current?'Historical registration':isBanned?'Banned':
      r.status==='suspended'||r.account_status!=='active'?'Account unavailable':
      !r.setup_completed_at?'Setup pending':!r.registration_paid?'Registration payment pending':
      !r.fee_active?'Access expired':!r.plan?'Subscription inactive':r.catalog_eligible?'Active':'Unavailable';
    return {id:r.id,accountId:r.seller_context_id,applicationId:r.application_id,registrationGeneration:r.registration_generation,
      isCurrent:r.is_current,storeName:r.name,ownerName:r.owner_name,studentEmail:r.student_email,university:r.campus,
      category:r.primary_category,status:r.status,accountStatus:r.account_status,statusLabel,isBanned,
      isActive:r.catalog_eligible===true,accountAccess:r.account_access,setupCompleted:Boolean(r.setup_completed_at),
      registrationFeePaid:r.registration_paid,semesterExpiresAt:r.fee_expires_at,activatedAt:r.activated_at,createdAt:r.created_at,
      subscriptionPlan:r.plan==='pine_pro'?'pro':r.plan==='pine_star'?'star':'default',subscriptionExpiresAt:r.subscription_expires_at};
  });
}

/** Reviewed registration cooldowns are immutable; this endpoint cannot waive them. */
export async function administratorManagerRestrictions(c:PoolClient,a:VerifiedActor) {
  await requireAdministrator(c,a);
  return (await c.query(`select ban.id,ban.kind,ban.reason,ban.until_at as "expiresAt",ban.created_at as "createdAt",
    ban.until_at>clock_timestamp() as "isActive",ban.account_context_id as "accountId",x.kind as "accountKind",
    x.status as "accountStatus",subject.display_name as "accountName",subject.email as "accountEmail",
    primary_profile.email as "userEmail",case when x.kind='manager' then subject.email end as "managerEmail",
    ban.imposed_by_context_id as "imposedBy",administrator.display_name as "imposedByName",
    ban.proposal_id as "proposalId",proposal.kind as "proposalKind",proposal.status as "proposalStatus"
    from public.registration_bans ban join public.account_contexts x on x.id=ban.account_context_id
    join public.profiles subject on subject.id=x.auth_user_id
    left join public.profiles primary_profile on primary_profile.id=coalesce(x.primary_owner_id,x.auth_user_id)
    join public.account_contexts author on author.id=ban.imposed_by_context_id
    join public.profiles administrator on administrator.id=author.auth_user_id
    left join public.admin_proposals proposal on proposal.id=ban.proposal_id
    where ban.kind in ('manager_account','residence') order by ban.created_at desc,ban.id`)).rows;
}

export function installAdminStoreOverview(app:Express,auth:SupabaseAuth) {
  const read=(work:(c:PoolClient,a:VerifiedActor)=>Promise<unknown>)=>route(async(req,res)=>{
    checkAccountReviewContext(req.actor,req.headers['x-pinevela-account-context']);
    if(Object.keys(req.query).length)throw new ApiError(400,'Account selectors are not accepted.');
    res.set('Cache-Control','private, no-store');
    // Names/policy details are a privileged admin read, like accountDirectory.
    // The verified binding and active membership are rechecked inside this transaction.
    res.json(await auth.db.authorizedRead(req.actor,['admin'],c=>work(c,req.actor)));
  });
  app.get('/api/admin/digital-market/stores',auth.require(['admin']),read(administratorStores));
  app.get('/api/admin/manager-restrictions',auth.require(['admin']),read(administratorManagerRestrictions));
}
