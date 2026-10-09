import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { ownedEnrollment } from './enrollment.js';
import { notify,notifyPrimaryOwner } from './notifications.js';
import { MARKET_DEFAULT_COVERS,MARKET_DEFAULT_LOGO,marketStoreBranding } from '../marketBranding.js';
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
function fields(body:any,allowed:string[]){if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k)))throw new ApiError(400,'Unsupported seller application fields.');}
function text(v:unknown,max:number,min=1){if(typeof v!=='string' || v.length>max || v.trim().length<min)throw new ApiError(400,'Enter valid seller registration details.');return v.trim();}
function application(r:any){return {id:r.id,accountId:r.seller_context_id,enrollmentId:r.enrollment_id,
  fullName:r.display_name,studentEmail:r.email,phone:r.phone,university:r.campus,categoryToSell:r.primary_category,
  idNumber:r.student_id,storeName:r.proposed_store_name,status:r.status==='submitted'?'pending':r.status,
  accountStatus:r.account_status,submittedAt:r.submitted_at,reviewedAt:r.reviewed_at,adminNotes:r.review_notes,
  emailVerified:Boolean(r.verified_at),submissionVersion:r.submission_version};}
async function administrators(c:PoolClient){return (await c.query("select c.id from public.account_contexts c join public.admin_memberships m on m.context_id=c.id where c.kind='admin' and c.status='active' and m.status='active'")).rows.map(r=>r.id);}
async function audit(c:PoolClient,a:VerifiedActor,id:string,event:string,data:any){await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data) values ($1,$2,'seller_application',$3,$4)",[a.contextId,event,id,JSON.stringify(data)]);}
export async function sellerStatus(c:PoolClient,a:VerifiedActor){
  if(!['primary','seller'].includes(a.kind))throw new ApiError(403,'Use your primary or seller account to view market registration.');
  const rows=(await c.query('select * from public.seller_application_details order by submitted_at desc limit 2')).rows;
  if(rows.length>1)throw new ApiError(409,'More than one seller registration requires administrative reconciliation.');
  const app=rows[0];if(!app)return {application:null,store:null};
  const s=(await c.query(`select s.*,exists(select 1 from public.payments p where p.store_id=s.id and p.purpose='store_activation' and private.payment_grants_access(p.id)) as paid,
    (select max(ends_at) from public.store_fee_periods where store_id=s.id) as semester_expires_at,
    sub.plan as subscription_plan,sub.ends_at as subscription_expires_at,
    (select coalesce(round(avg(r.rating),1),0) from public.market_reviews_public r where r.store_id=s.id) as rating,
    (select count(*) from public.market_reviews_public r where r.store_id=s.id) as rating_count from public.stores s
    left join lateral(select plan,ends_at from public.store_subscriptions where store_id=s.id and status='active' and starts_at<=now() and ends_at>now() order by starts_at desc limit 1) sub on true
    where s.seller_context_id=$1`,[app.seller_context_id])).rows[0];
  const plan=s?.subscription_plan==='pine_pro'?'pro':s?.subscription_plan==='pine_star'?'star':'default';
  const branding={subscriptionPlan:plan,subscriptionStatus:s?.subscription_plan?'active':'inactive',subscriptionExpiresAt:s?.subscription_expires_at,semesterExpiresAt:s?.semester_expires_at,
    profilePicture:s?.logo_path || MARKET_DEFAULT_LOGO,coverPicture:s?.cover_path || MARKET_DEFAULT_COVERS[0].url};
  return {application:application(app),store:s?{id:s.id,storeName:s.name,username:s.username || '',studentEmail:app.email,university:s.campus,location:s.location || '',
    category:s.primary_category,deliveryMode:s.delivery_mode || '',deliveryForm:s.delivery_mode || '',phone:s.primary_phone || '',phoneCountry:s.phone_country || '',description:s.description,
    ...branding,...marketStoreBranding(branding,true),
    status:s.status==='pending'?'pending_setup':s.status,setupCompleted:Boolean(s.setup_completed_at),registrationFeePaid:s.paid,
    storeRating:Number(s.rating),ratingCount:Number(s.rating_count)}:null};
}
export async function submitSellerApplication(c:PoolClient,a:VerifiedActor,body:any){
  if(a.kind!=='primary')throw new ApiError(403,'Submit seller registration from your primary account.');
  fields(body,['enrollmentId','university','categoryToSell','idNumber','storeName','certified']);
  const campus=text(body.university,250),category=text(body.categoryToSell,200),studentId=text(body.idNumber,32).toUpperCase(),name=text(body.storeName,200);
  if(!/^[A-Z0-9][A-Z0-9/-]{3,31}$/.test(studentId) || body.certified!==true)throw new ApiError(400,'Enter your actual school-issued ID and confirm the student seller declaration.');
  const e=await ownedEnrollment(c,a,uuid(body.enrollmentId));
  if(e.kind!=='seller' || !e.verified_at || !['pending_review','completed'].includes(e.status) || e.context_status!=='pending')throw new ApiError(409,'Verify the seller student email before submitting registration.');
  if(!(await c.query(`select c.id from public.account_contexts c join public.profiles p on p.id=c.auth_user_id
    join auth.users u on u.id=p.id where c.id=$1 and c.kind='seller' and c.status='pending' and c.primary_owner_id=$2
    and p.primary_owner_id=$2 and u.email_confirmed_at is not null and lower(u.email)=$3 for share of c,p`,[e.linked_context_id,a.authUserId,e.invited_email])).rowCount)
    throw new ApiError(409,'The verified seller identity is no longer eligible for registration.');
  if((await c.query(`select 1 from public.registration_bans b join public.account_contexts x on x.id=b.account_context_id
    where (x.auth_user_id=$1 or x.primary_owner_id=$1) and b.kind='seller_account' and b.until_at>clock_timestamp()`,[a.authUserId])).rowCount)throw new ApiError(403,'Seller registration is temporarily restricted.');
  const old=(await c.query('select * from public.seller_applications where seller_context_id=$1 for update',[e.linked_context_id])).rows[0];
  if(old && old.status!=='rejected'){
    if(old.campus!==campus || old.primary_category!==category || old.student_id!==studentId || old.proposed_store_name!==name)throw new ApiError(409,'This seller application already exists.');
    return {success:true,application:(await sellerStatus(c,a)).application,idempotent:true};
  }
  const row=old?(await c.query(`update public.seller_applications set campus=$2,primary_category=$3,student_id=$4,proposed_store_name=$5,
    status='submitted',submitted_at=now(),reviewed_at=null,reviewed_by_context_id=null,review_notes='',submission_version=submission_version+1 where id=$1 returning *`,[old.id,campus,category,studentId,name])).rows[0]:
    (await c.query('insert into public.seller_applications(seller_context_id,enrollment_id,campus,primary_category,student_id,proposed_store_name) values ($1,$2,$3,$4,$5,$6) returning *',[e.linked_context_id,e.id,campus,category,studentId,name])).rows[0];
  await c.query("update private.account_enrollments set status='completed' where id=$1",[e.id]);
  await audit(c,a,row.id,old?'seller_application_resubmitted':'seller_application_submitted',{previous:old || null,submission:{campus,category,studentId,storeName:name,version:row.submission_version}});
  await notify(c,[a.contextId],{category:'account_submission',title:'Digital Market Application Submitted',message:'Your verified seller application has been received and is pending administrator review.',sender:a.contextId,link:'/user/dashboard?tab=notifications'});
  await notify(c,await administrators(c),{category:'verification',title:'Digital Market Application Submitted',message:`${name} is awaiting seller registration review.`,sender:a.contextId,link:'/admin/dashboard'});
  return {success:true,application:(await sellerStatus(c,a)).application,idempotent:false};
}
export async function decideSellerApplication(c:PoolClient,a:VerifiedActor,body:any,approved:boolean){
  if(a.kind!=='admin')throw new ApiError(403,'Administrator access required.');
  fields(body,['id','applicationId','adminNotes']);
  if(body.id!==undefined && body.applicationId!==undefined && body.id!==body.applicationId)throw new ApiError(400,'Choose one seller application.');
  const id=uuid(body.id ?? body.applicationId),notes=body.adminNotes===undefined?'':text(body.adminNotes,3000,0);
  if(!approved && !notes)throw new ApiError(400,'Explain why the seller application was rejected.');
  const selected=(await c.query('select a.enrollment_id,a.seller_context_id,x.primary_owner_id from public.seller_applications a join public.account_contexts x on x.id=a.seller_context_id where a.id=$1',[id])).rows[0];
  if(!selected)throw new ApiError(404,'Seller application not found.');
  // Match primary submission's owner -> enrollment -> child -> application order.
  // Store creation also references the owner profile; lock it before enrollment.
  await c.query('select id from public.profiles where id=$1 for update',[selected.primary_owner_id]);
  await c.query('select id from private.account_enrollments where id=$1 for update',[selected.enrollment_id]);
  await c.query('select id from public.account_contexts where id=$1 for update',[selected.seller_context_id]);
  const app=(await c.query('select * from public.seller_applications where id=$1 for update',[id])).rows[0];if(!app)throw new ApiError(404,'Seller application not found.');
  const status=approved?'approved':'rejected';
  if(app.status===status && app.review_notes===notes)return {success:true,idempotent:true};
  if(app.status!=='submitted')throw new ApiError(409,'This seller application already has a decision.');
  if(approved && (await c.query(`select 1 from public.registration_bans b join public.account_contexts x on x.id=b.account_context_id
    join public.account_contexts applicant on applicant.id=$1 where (x.id=applicant.id or x.auth_user_id=applicant.primary_owner_id or x.primary_owner_id=applicant.primary_owner_id)
    and b.kind='seller_account' and b.until_at>clock_timestamp()`,[app.seller_context_id])).rowCount)throw new ApiError(403,'Seller registration is temporarily restricted.');
  const e=(await c.query("select e.id from private.account_enrollments e join public.account_contexts x on x.id=e.linked_context_id join auth.users u on u.id=x.auth_user_id where e.id=$1 and e.kind='seller' and e.status='completed' and e.verified_at is not null and x.id=$2 and x.kind='seller' and x.status='pending' and u.email_confirmed_at is not null and lower(u.email)=e.invited_email for update of e,x",[app.enrollment_id,app.seller_context_id])).rows[0];
  if(!e)throw new ApiError(409,'The saved verified seller enrollment is no longer eligible for review.');
  await c.query('update public.seller_applications set status=$2,review_notes=$3,reviewed_at=now(),reviewed_by_context_id=$4 where id=$1',[id,status,notes,a.contextId]);
  if(approved){
    await c.query("insert into public.stores(seller_context_id,primary_owner_id,name,campus,primary_category) select id,primary_owner_id,$2,$3,$4 from public.account_contexts where id=$1",[app.seller_context_id,app.proposed_store_name,app.campus,app.primary_category]);
    await c.query("update public.account_contexts set status='active',updated_at=now() where id=$1",[app.seller_context_id]);
  }
  await audit(c,a,id,approved?'seller_application_approved':'seller_application_rejected',{version:app.submission_version,notes});
  await notifyPrimaryOwner(c,app.seller_context_id,{category:'account_submission',title:approved?'Digital Market Application Approved':'Digital Market Application Rejected',message:approved?'Your seller registration was approved. Sign in with the verified seller identity to complete store setup and payment.':`Your seller registration was rejected. ${notes} You can revise and resubmit from your primary account.`,sender:a.contextId,link:'/user/dashboard?tab=notifications'});
  await notify(c,await administrators(c),{category:'verification',title:approved?'Seller Registration Approved':'Seller Registration Rejected',message:`${app.proposed_store_name}: ${status}. ${notes}`,sender:a.contextId,link:'/admin/dashboard'});
  return {success:true,idempotent:false};
}
export function installSellerRegistration(app:Express,auth:SupabaseAuth){
  app.get('/api/digital-market/status',auth.require(['primary','seller']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['primary','seller'],c=>sellerStatus(c,req.actor)))));
  app.post('/api/digital-market/register',auth.require(['primary']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['primary'],c=>submitSellerApplication(c,req.actor,req.body)))));
  app.get('/api/admin/digital-market/applications',auth.require(['admin']),route(async(req,res)=>res.json(await auth.db.actor(req.actor,async c=>(await c.query('select * from public.seller_application_details order by submitted_at desc limit 1000')).rows.map(application)))));
  const decide=(approved:boolean)=>route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>decideSellerApplication(c,req.actor,req.body,approved))));
  app.post('/api/admin/digital-market/approve-application',auth.require(['admin']),decide(true));
  app.post('/api/admin/digital-market/reject-application',auth.require(['admin']),decide(false));
}
