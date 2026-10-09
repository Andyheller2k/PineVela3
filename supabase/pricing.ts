import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import type { SupabaseAuth, AuthRequest } from './auth.js';
import { administratorSettingsStatus, bodyFields, checkAdministratorSettingsKey, deniedKey, requireAdministrator, requireSettingsGrant, type SettingsGrant } from './adminSettings.js';
import { validatePricingSettings, publicPlatformSettings, type PricingSettings } from '../platformSettings.js';
import { AttemptBudgets } from '../resourceSecurity.js';

const route = (work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler => (req,res,next) => { work(req as AuthRequest,res).catch(next); };
export async function lockPricing(c:PoolClient) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  await c.query('select singleton from private.admin_pricing_state where singleton for update');
}
export async function expirePricing(c:PoolClient) {
  await c.query("update public.admin_proposals set status='expired' where kind='pricing' and status in ('pending','approved') and expires_at<=clock_timestamp()");
}
export async function pricingProposals(c:PoolClient,a:VerifiedActor) {
  await requireAdministrator(c,a);
  await lockPricing(c); await expirePricing(c);
  const proposals=(await c.query(`select id,preview,reason,proposer_context_id as "createdBy",created_at as "createdAt",
    expires_at as "expiresAt",case when status='executed' then 'applied' else status end as status,
    executed_by_context_id as "appliedBy",executed_at as "appliedAt" from public.admin_proposals where kind='pricing'
    order by (status in ('pending','approved')) desc,created_at desc,id desc limit 110`)).rows.reverse();
  const votes=(await c.query(`select proposal_id,administrator_context_id as id,decision,decided_at as at from public.admin_votes
    where proposal_id=any($1::uuid[]) order by decided_at,administrator_context_id`,[proposals.map(p=>p.id)])).rows;
  return proposals.map(p=>({id:p.id,before:p.preview.before,prices:p.preview.prices,roster:p.preview.roster,reason:p.reason,
    createdBy:p.createdBy,createdAt:p.createdAt,expiresAt:p.expiresAt,status:p.status,appliedBy:p.appliedBy,appliedAt:p.appliedAt,
    votes:votes.filter(v=>v.proposal_id===p.id).map(({proposal_id,...vote})=>vote)}));
}
async function currentProposal(c:PoolClient,id:string):Promise<{error:ApiError}|{proposal:any}> {
  await expirePricing(c);
  const p=(await c.query(`select p.*,s.roster_revision=p.pricing_roster_revision and s.pricing_revision=p.pricing_revision as current
    from public.admin_proposals p cross join private.admin_pricing_state s where p.id=$1 and p.kind='pricing' for update of p`,[id])).rows[0];
  if(!p) return {error:new ApiError(404,'Pricing proposal not found.')};
  if(!['pending','approved'].includes(p.status)) return {error:new ApiError(409,'This pricing proposal is no longer eligible.')};
  if(!p.current){await c.query("update public.admin_proposals set status='invalidated' where id=$1",[id]);return {error:new ApiError(409,'The roster, enrolled keys or live prices changed. Submit a fresh proposal.')};}
  return {proposal:p};
}
/** Key grants come from the separately committed guess check, never request data. */
export async function proposePricing(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,prices:PricingSettings,reason:string) {
  await lockPricing(c); await requireSettingsGrant(c,a,grant); await expirePricing(c);
  const state=(await c.query('select roster_revision,pricing_revision from private.admin_pricing_state where singleton')).rows[0];
  const ready=(await c.query('select private.pricing_roster_ready() as ready')).rows[0].ready;
  if(!ready)throw new ApiError(409,'At least three active administrators with settings keys, including administrator #1, are required.');
  const before=(await c.query("select private.pricing_projection((select value from private.platform_settings where key='platform')) as prices")).rows[0].prices;
  const same=(await c.query('select $1::jsonb=$2::jsonb as same',[JSON.stringify(before),JSON.stringify(prices)])).rows[0].same;
  if(same)throw new ApiError(400,'Change at least one price or the commission rate.');
  if(Number((await c.query("select count(*) from public.admin_proposals where kind='pricing' and status in ('pending','approved')")).rows[0].count)>=10)
    throw new ApiError(429,'At most ten live pricing proposals are allowed.');
  const roster=(await c.query('select private.pricing_roster() as roster')).rows[0].roster;
  const p=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,preview,baseline_digest,reason,quorum,expires_at,pricing_roster_revision,pricing_revision)
    values('pricing',$1,$2,$3,$4,3,now()+interval '24 hours',$5,$6) returning id`,
    [a.contextId,JSON.stringify({before,prices,roster}),`${state.roster_revision}:${state.pricing_revision}`,reason,state.roster_revision,state.pricing_revision])).rows[0];
  await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,'approved')",[p.id,a.contextId]);
  return {success:true,id:p.id,message:'Pricing proposal submitted. Your approval counts as one; live prices have not changed.'};
}
export async function votePricing(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string,decision:'approved'|'rejected'):
  Promise<{error:ApiError}|{success:true;status:string;approvals:number;message:string}> {
  await lockPricing(c); await requireSettingsGrant(c,a,grant);
  const result=await currentProposal(c,id); if('error' in result)return result;
  const p=result.proposal;
  if(!p.preview.roster.some((m:any)=>m.id===a.contextId))throw new ApiError(403,'You are not on this proposal’s administrator roster.');
  if((await c.query('select proposal_id from public.admin_votes where proposal_id=$1 and administrator_context_id=$2',[id,a.contextId])).rowCount)
    throw new ApiError(409,'You have already voted on this pricing proposal.');
  await c.query('insert into public.admin_votes(proposal_id,administrator_context_id,decision) values($1,$2,$3)',[id,a.contextId,decision]);
  const state=(await c.query(`select p.status,(select count(*)::integer from public.admin_votes where proposal_id=p.id and decision='approved') as approvals
    from public.admin_proposals p where p.id=$1`,[id])).rows[0];
  return {success:true,...state,message:state.status==='approved'?'At least three approvals received. Administrator #1 must make the final push.':'Vote saved. Live prices have not changed.'};
}
export async function applyPricing(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,id:string):
  Promise<{error:ApiError}|{success:true;status:'applied';settings:ReturnType<typeof publicPlatformSettings>;message:string}> {
  await lockPricing(c); await requireSettingsGrant(c,a,grant);
  if(!(await c.query('select context_id from public.admin_memberships where context_id=$1 and slot=1 and status=\'active\'',[a.contextId])).rowCount)
    throw new ApiError(403,'Only administrator #1 may make the final pricing push.');
  const result=await currentProposal(c,id); if('error' in result)return result;
  if(result.proposal.status!=='approved')throw new ApiError(409,'Three distinct administrator approvals are required.');
  await c.query('select private.apply_approved_pricing($1)',[id]);
  const raw=(await c.query("select value from private.platform_settings where key='platform'")).rows[0].value;
  return {success:true,status:'applied',settings:publicPlatformSettings({platformSettings:raw}),message:'Approved pricing applied by administrator #1. New checkouts use these prices.'};
}
function prices(body:any) {
  try {
    const value=validatePricingSettings(body),money=(n:number)=>Math.round(n*100)/100;
    return {...value,registrationFee:money(value.registrationFee),semesterFee:money(value.semesterFee),
      subscriptionPrices:{default:money(value.subscriptionPrices.default),star:money(value.subscriptionPrices.star),pro:money(value.subscriptionPrices.pro)}};
  } catch(e:any){throw new ApiError(400,e.message);}
}
function reason(value:unknown){if(typeof value!=='string'||value.trim().length<3||value.trim().length>500)throw new ApiError(400,'Provide a reason of 3–500 characters.');return value.trim();}
export class SupabasePricing {
  private budgets=new AttemptBudgets();
  constructor(readonly auth:SupabaseAuth){}
  private async grant(a:VerifiedActor,key:unknown){
    this.budgets.reserve([{scope:'administrator-pricing',identity:a.contextId,maximum:30,windowMs:60000}]);
    const grant=await this.auth.db.authorizedSystem(a,['admin'],c=>checkAdministratorSettingsKey(c,a,key));
    deniedKey(grant);return grant;
  }
  async propose(a:VerifiedActor,body:any){bodyFields(body,['prices','reason','settingsKey']);const reviewed=prices(body.prices),explanation=reason(body.reason);
    const grant=await this.grant(a,body.settingsKey);return this.auth.db.authorizedSystem(a,['admin'],c=>proposePricing(c,a,grant,reviewed,explanation));}
  async vote(a:VerifiedActor,id:unknown,body:any){bodyFields(body,['decision','settingsKey']);const proposal=uuid(id);
    if(!['approved','rejected'].includes(body.decision))throw new ApiError(400,'Choose approve or reject.');
    const grant=await this.grant(a,body.settingsKey),result=await this.auth.db.authorizedSystem(a,['admin'],c=>votePricing(c,a,grant,proposal,body.decision));
    if('error' in result)throw result.error;return result;}
  async apply(a:VerifiedActor,id:unknown,body:any){bodyFields(body,['settingsKey']);const proposal=uuid(id),grant=await this.grant(a,body.settingsKey);
    const result=await this.auth.db.authorizedSystem(a,['admin'],c=>applyPricing(c,a,grant,proposal));if('error' in result)throw result.error;return result;}
}
export function installPricing(app:Express,auth:SupabaseAuth){
  const pricing=new SupabasePricing(auth);
  app.get('/api/admin/settings/pricing',auth.require(['admin']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['admin'],async c=>{
    await lockPricing(c);return {...await administratorSettingsStatus(c,req.actor),pricingProposals:await pricingProposals(c,req.actor)};
  }))));
  app.post('/api/admin/governance/pricing',auth.require(['admin']),route(async(req,res)=>res.json(await pricing.propose(req.actor,req.body))));
  app.post('/api/admin/governance/pricing/:id/vote',auth.require(['admin']),route(async(req,res)=>res.json(await pricing.vote(req.actor,req.params.id,req.body))));
  app.post('/api/admin/governance/pricing/:id/apply',auth.require(['admin']),route(async(req,res)=>res.json(await pricing.apply(req.actor,req.params.id,req.body))));
}
