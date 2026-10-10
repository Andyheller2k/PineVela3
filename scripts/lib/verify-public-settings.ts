import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../../supabase/db.js';
import { SupabaseAuth } from '../../supabase/auth.js';
import { SupabasePublicSettings, savePublicSettings } from '../../supabase/publicSettings.js';
import { checkAdministratorSettingsKey } from '../../supabase/adminSettings.js';
import { SupabasePricing } from '../../supabase/pricing.js';
import { EMPTY_CONTACT_DETAILS, pricingSettings, publicPlatformSettings } from '../../platformSettings.js';

/** Uses only the caller's isolated actual-Google fixture; no cloud writes or fake Auth. */
export async function verifyPublicSettings(db: SupabaseDatabase, actors: VerifiedActor[], keys: string[], approvalKeys: string[], primary: VerifiedActor) {
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value,label); checks++; };
  async function denied(work:()=>Promise<unknown>, code:number|string,label:string) {
    let error:any;try{await work();}catch(e){error=e;}
    check(typeof code==='number'?error instanceof ApiError && error.status===code:error?.code===code,label);
  }
  const [founder,other,third] = actors, auth = new SupabaseAuth(db), service = new SupabasePublicSettings(auth);
  const live = async () => (await db.pool.query("select value from private.platform_settings where key='platform'")).rows[0].value;
  const notices = async () => Number((await db.pool.query('select count(*) from public.notifications')).rows[0].count);
  const settings = await live(), beforePrices = pricingSettings(publicPlatformSettings({platformSettings:settings}));
  const pricing = new SupabasePricing(auth);
  const proposal = await pricing.propose(founder,{settingsKey:keys[0],reason:'Review the registration fee',prices:{...beforePrices,registrationFee:beforePrices.registrationFee+1}});
  const revisions = (await db.pool.query('select * from private.admin_pricing_state')).rows[0];
  await denied(()=>service.update(founder,{settingsKey:keys[1],contactDetails:EMPTY_CONTACT_DETAILS}),403,'Foreign settings key cannot update public contacts');
  check((await db.pool.query('select settings_failed_attempts from private.admin_secrets where context_id=$1',[founder.contextId])).rows[0].settings_failed_attempts===1,'Public-settings denial persists its key counter');
  await denied(()=>service.update(founder,{settingsKey:approvalKeys[0],announcement:'Contact details have been updated.'}),403,'An approval key cannot publish announcements');
  for (const fields of [{registrationFee:1},{maintenanceMode:'true'},{updatedBy:other.contextId},{contactDetails:{...EMPTY_CONTACT_DETAILS,ownerId:founder.contextId}},
    {announcement:null},{announcement:'a'.repeat(2001)},{contactDetails:{...EMPTY_CONTACT_DETAILS,linkedinUrl:'javascript:alert(1)'}},
    {contactDetails:{...EMPTY_CONTACT_DETAILS,linkedinUrl:'https://linkedin.com.untrusted.invalid'}},
    {contactDetails:{...EMPTY_CONTACT_DETAILS,facebookUrl:'https://user:pass@facebook.com'}},
    {contactDetails:{...EMPTY_CONTACT_DETAILS,tiktokUrl:'http://tiktok.com'}},
    {contactDetails:{...EMPTY_CONTACT_DETAILS,whatsappNumber:'1'}},{}]) {
    await denied(()=>service.update(founder,{settingsKey:keys[0],...fields}),400,'Invalid contact, announcement or unrelated field is rejected');
  }
  const contacts = { ...EMPTY_CONTACT_DETAILS,linkedinUrl:'https://www.linkedin.com/' };
  const result = await service.update(founder,{settingsKey:keys[0],contactDetails:contacts});
  check(result.success && result.settings.contactDetails?.linkedinUrl===contacts.linkedinUrl,'Allowed HTTPS contact channel is stored and publicly projected');
  check(JSON.stringify((await live()).paystackSettlement)===JSON.stringify(settings.paystackSettlement),'Public contacts preserve the receiving account');
  check(JSON.stringify(pricingSettings(result.settings))===JSON.stringify(beforePrices),'Contact update preserves live prices');
  check(!JSON.stringify(result).includes(keys[0]) && !(result.settings as any).paystackSettlement,'Public response excludes keys and private payment destination');
  const afterContacts = await notices();
  await service.update(founder,{settingsKey:keys[0],contactDetails:contacts});
  check(await notices()===afterContacts,'Identical contact retry does not repeat notification');
  const announcement = 'Contact details have been updated.';
  await Promise.all([service.update(founder,{settingsKey:keys[0],announcement}),service.update(third,{settingsKey:keys[2],announcement})]);
  check((await live()).announcement===announcement,'Concurrent identical announcements save the same actual text');
  check((await db.pool.query("select count(*) from public.notifications where category='system_announcement'")).rows[0].count==='1','Concurrent identical announcement publishes once');
  const delivered = (await db.pool.query(`select x.kind,x.status from public.notification_recipients r join public.notifications n on n.id=r.notification_id
    join public.account_contexts x on x.id=r.context_id where n.category='system_announcement'`)).rows;
  check(delivered.length===4 && delivered.every(x=>x.kind!=='admin' && x.status==='active'),'Announcement recipients are exact active non-admin portals');
  const afterAnnouncement = await notices();
  await service.update(founder,{settingsKey:keys[0],contactDetails:contacts});
  check(await notices()===afterAnnouncement,'Contact save does not republish an unchanged announcement');
  await service.update(founder,{settingsKey:keys[0],announcement:''});
  check((await live()).announcement==='','Clearing stops public announcement text');
  check((await db.pool.query("select count(*) from public.notifications where category='system_announcement'")).rows[0].count==='1','Clearing sends no blank notification and retains history');
  const afterClear = await notices(), beforeRollback = JSON.stringify(await live());
  const grant = await db.authorizedSystem(founder,['admin'],c=>checkAdministratorSettingsKey(c,founder,keys[0]));
  await denied(()=>db.authorizedSystem(other,['admin'],c=>savePublicSettings(c,other,grant,{announcement})),403,'A key grant belongs to its actual administrator');
  await denied(()=>db.authorizedSystem(founder,['admin'],c=>savePublicSettings(c,founder,{allowed:true,version:crypto.randomUUID()},{announcement})),403,'A stale grant cannot update public settings');
  await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{
    await savePublicSettings(c,founder,grant,{announcement});
    await c.query('insert into public.notification_recipients(notification_id,context_id) values(gen_random_uuid(),$1)',[founder.contextId]);
  }),'23503','A transaction failure rolls back settings and notifications');
  check(JSON.stringify(await live())===beforeRollback && await notices()===afterClear,'Failed settings transaction leaves values and notices unchanged');
  const afterRevisions = (await db.pool.query('select * from private.admin_pricing_state')).rows[0];
  check(JSON.stringify(afterRevisions)===JSON.stringify(revisions),'Contacts and announcements preserve pricing revisions and approvals');
  await pricing.vote(other,proposal.id,{settingsKey:keys[1],decision:'approved'});
  await pricing.vote(third,proposal.id,{settingsKey:keys[2],decision:'approved'});
  check((await db.pool.query('select status from public.admin_proposals where id=$1',[proposal.id])).rows[0].status==='approved','The original pricing proposal remains eligible for approval');
  const restarted = new SupabaseDatabase(db.pool.options);
  try {
    check((await restarted.pool.query("select value->>'announcement' as announcement from private.platform_settings where key='platform'")).rows[0].announcement==='',
      'Saved public settings persist through a new backend pool');
    check((await new SupabasePublicSettings(new SupabaseAuth(restarted)).update(third,{settingsKey:keys[2],contactDetails:contacts})).success,
      'Verified public-settings access persists through a new backend pool');
  } finally { await restarted.close(); }
  const binding = (await db.pool.query('select active_context_id from private.account_sessions where session_id=$1',[primary.sessionId])).rows[0].active_context_id;
  await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary.sessionId,primary.contextId]));
  try {
    await denied(()=>service.update(primary,{settingsKey:keys[3],announcement}),403,'An active primary portal cannot publish administrator settings');
    check((await db.actor(primary,c=>c.query("select id from public.notifications where category='system_announcement'"))).rowCount===1,
      'Actual non-admin recipient can read the saved announcement through RLS');
    check((await db.actor(primary,c=>c.query("select id from public.notifications where category='admin_settings'"))).rowCount===0,
      'Announcement recipient does not inherit administrator settings notices');
  } finally {
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary.sessionId,binding]));
  }
  return checks;
}
