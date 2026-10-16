/** Actual local HTTP acceptance of the existing administrator pricing quorum.
 * These helpers are test-only; callers supply real independently enrolled admins. */
import assert from 'node:assert/strict';
import {pricingSettings, type PricingSettings} from '../../platformSettings.js';
import type {LocalApiSession,LocalSupabaseHarness} from './local-supabase-harness.js';

export type LocalPricingAdministrator={session:LocalApiSession;contextId:string;settingsKey:string;approvalKey:string};
type Reply=Awaited<ReturnType<LocalApiSession['request']>>;
function status(reply:Reply,expected:number,label:string){assert.equal(reply.status,expected,label);}

/** Leaves zero-fee prices in this disposable run so the actual application can
 * activate stores without contacting a payment gateway. This never supplies
 * payment-provider evidence and never changes the hosted platform's prices. */
export async function verifyLocalPricing(h:LocalSupabaseHarness,admins:LocalPricingAdministrator[],primary:LocalApiSession){
 await h.assertOwned();assert.ok(admins.length>=3,'Three independently enrolled administrators required');
 const [founder,second,third]=admins;
 assert.equal(new Set(admins.map(a=>a.contextId)).size,admins.length);
 let checks=0;
 const expect=(reply:Reply,expected:number,label:string)=>{status(reply,expected,label);checks++;return reply.data;};
 const initial=expect(await h.session().request('/api/settings'),200,'Public settings available');
 const before=pricingSettings(initial);
 const prices:PricingSettings={...before,registrationFee:0,semesterFee:0,subscriptionPrices:{default:0,star:0,pro:0}};
 const live=async()=>pricingSettings(expect(await h.session().request('/api/settings'),200,'Current settings available'));
 expect(await primary.json('/api/admin/governance/pricing',{prices,reason:'Local zero-fee activation coverage',settingsKey:founder.settingsKey}),403,'Primary cannot propose pricing');
 expect(await founder.session.json('/api/settings',{registrationFee:0,settingsKey:founder.settingsKey}),400,'Direct settings mutation cannot bypass pricing quorum');
 expect(await founder.session.json('/api/admin/governance/pricing',{prices,reason:'Local zero-fee activation coverage',settingsKey:founder.approvalKey}),403,'Approval key cannot authorize pricing');
 expect(await founder.session.json('/api/admin/governance/pricing',{prices:{...prices,registrationFee:-1},reason:'Invalid price coverage',settingsKey:founder.settingsKey}),400,'Negative pricing denied');
 expect(await founder.session.json('/api/admin/governance/pricing',{prices,reason:'Local zero-fee activation coverage',settingsKey:founder.settingsKey,proposerId:second.contextId}),400,'Client cannot select proposer identity');
 const proposal=expect(await founder.session.json('/api/admin/governance/pricing',{prices,reason:'Owned local acceptance: free store activation and plans',settingsKey:founder.settingsKey}),200,'Founder creates pricing proposal');
 assert.match(proposal.id,/^[a-f0-9-]{36}$/);checks++;
 assert.deepEqual(await live(),before,'Proposal alone leaves prices unchanged');checks++;
 const vote=(admin:LocalPricingAdministrator)=>admin.session.json('/api/admin/governance/pricing/'+proposal.id+'/vote',{decision:'approved',settingsKey:admin.settingsKey});
 const apply=(admin:LocalPricingAdministrator)=>admin.session.json('/api/admin/governance/pricing/'+proposal.id+'/apply',{settingsKey:admin.settingsKey});
 expect(await apply(founder),409,'One approval cannot change pricing');
 expect(await vote(founder),409,'An administrator cannot vote twice');
 expect(await vote(second),200,'Second independent approval accepted');
 expect(await apply(founder),409,'Two approvals cannot change pricing');
 expect(await vote(third),200,'Third independent approval accepted');
 assert.deepEqual(await live(),before,'Quorum alone leaves prices unchanged');checks++;
 expect(await apply(second),403,'Only founder may apply an approved proposal');
 expect(await apply(founder),200,'Founder applies independently approved prices');
 assert.deepEqual(await live(),prices,'Actual settings now use approved zero fees');checks++;
 expect(await apply(founder),409,'Applied proposal cannot replay');
 const listed=expect(await founder.session.request('/api/admin/settings/pricing'),200,'Pricing history available');
 const stored=listed.pricingProposals.find((p:any)=>p.id===proposal.id);
 assert.equal(stored?.status,'applied');checks++;
 assert.equal(new Set(stored.votes.filter((v:any)=>v.decision==='approved').map((v:any)=>v.id)).size,3);checks++;
 const publicReply=JSON.stringify(listed);
 assert.ok(admins.every(a=>!publicReply.includes(a.settingsKey)&&!publicReply.includes(a.approvalKey)),'Pricing responses exclude private keys');checks++;
 return{checks,proposalId:proposal.id,before,prices,cloudWrites:0,paymentProviderCalls:0};
}

/** Call after domain fixtures are complete: maintenance must gate existing
 * authenticated sessions and public catalog reads while admins retain recovery. */
export async function verifyLocalMaintenance(h:LocalSupabaseHarness,founder:LocalPricingAdministrator,primary:LocalApiSession){
 await h.assertOwned();let checks=0,enabled=false;
 const expect=(reply:Reply,expected:number,label:string)=>{status(reply,expected,label);checks++;return reply.data;};
 expect(await primary.request('/api/auth/me'),200,'Existing primary session starts active');
 expect(await primary.json('/api/settings',{maintenanceMode:true,settingsKey:founder.settingsKey}),403,'Primary cannot enable maintenance');
 try{
  expect(await founder.session.json('/api/settings',{maintenanceMode:true,settingsKey:founder.settingsKey}),200,'Founder enables maintenance');enabled=true;
  const guest=await h.session().request('/api/hostels');expect(guest,503,'Maintenance closes public residence catalog');
  assert.equal(guest.data?.code,'platform_maintenance');checks++;
  assert.equal(guest.headers.get('retry-after'),'30');checks++;
  expect(await primary.request('/api/auth/me'),503,'Existing primary session cannot bypass maintenance');
  expect(await founder.session.request('/api/admin/governance'),200,'Administrator retains recovery access');
  expect(await founder.session.json('/api/settings',{maintenanceMode:false,settingsKey:founder.settingsKey}),400,'Ending maintenance requires a recovery message');
  expect(await founder.session.json('/api/settings',{maintenanceMode:false,maintenanceRecoveryMessage:'The isolated verification pause is complete.',settingsKey:founder.settingsKey}),200,'Founder ends maintenance with a recovery message');enabled=false;
  expect(await primary.request('/api/auth/me'),200,'Existing primary recovers after maintenance');
  const notice=expect(await primary.request('/api/auth/maintenance-notice'),200,'Own recovery notice available');
  assert.match(notice.notice?.id||'',/^[a-f0-9-]{36}$/);checks++;
  expect(await primary.json('/api/auth/maintenance-notice/dismiss',{noticeId:notice.notice.id}),200,'Own notice can be dismissed');
  assert.equal(expect(await primary.request('/api/auth/maintenance-notice'),200,'Dismissal persists').notice,null);checks++;
 }finally{
  if(enabled)status(await founder.session.json('/api/settings',{maintenanceMode:false,maintenanceRecoveryMessage:'Isolated test recovery after a failed assertion.',settingsKey:founder.settingsKey}),200,'Failed local check restores availability');
 }
 return{checks,cloudWrites:0};
}
