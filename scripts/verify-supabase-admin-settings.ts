/** Real confirmed Auth subjects restored locally. Keys are generated as private
 * test credentials before migration 28; no Auth session/JWT/provider is fabricated.
 * Fresh Google enrollment remains a real sign-in acceptance check. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { verifyPublicSettings } from './lib/verify-public-settings.js';
import { verifyPlatformMaintenance } from './lib/verify-platform-maintenance.js';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { hashCredentialAsync } from '../accountSecurity.js';
import { administratorSettingsStatus, enrollAdministratorSettingsKey, checkAdministratorSettingsKey,
  saveReceivingAccount, SupabaseAdministratorSettings } from '../supabase/adminSettings.js';
dotenv.config({ quiet: true });
const id = process.argv[2]; if (!id) throw new Error('Pass the encrypted migration-27 checkpoint UUID.');
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function denied(work: () => Promise<unknown>, status: number | string, label: string) {
  let error: any; try { await work(); } catch (e) { error = e; }
  check(typeof status === 'number' ? error instanceof ApiError && error.status === status : error?.code === status, label);
}
try {
  await withIsolatedBackup(id, async config => {
    let db = new SupabaseDatabase(config);
    try {
      const fixtures = await db.system(async c => {
        const ledger = (await c.query('select version,digest from private.schema_migrations')).rows;
        check(ledger.length === 27, 'Use the unmodified migration-27 checkpoint for prior-schema key fixtures');
        for (const row of ledger) {
          const file = fs.readdirSync('supabase/migrations').find(name => name.startsWith(row.version));
          check(file && crypto.createHash('sha256').update(fs.readFileSync(path.join('supabase/migrations', file))).digest('hex') === row.digest, 'Applied migration is immutable');
        }
        check((await c.query('select count(*) from public.profiles')).rows[0].count === '0', 'Checkpoint has no restored application accounts');
        const subjects = (await c.query(`select distinct on(u.id) u.id,u.email,s.id as session_id from auth.users u
          join auth.sessions s on s.user_id=u.id join auth.identities i on i.user_id=u.id and i.provider='google'
          where u.email_confirmed_at is not null and not u.is_anonymous and (s.not_after is null or s.not_after>now())
          order by u.id,s.created_at desc limit 4`)).rows;
        check(subjects.length === 4, 'Four genuine confirmed Google subjects are available');
        const admins: VerifiedActor[] = [], keys: string[] = [], approvalKeys: string[] = [];
        let primary: VerifiedActor | undefined;
        for (const [index, subject] of subjects.entries()) {
          await c.query('select private.initialize_auth_profile($1,null)', [subject.id]);
          const p = (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'", [subject.id])).rows[0];
          const contextId = (await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id", [subject.id])).rows[0].id;
          const actor = { authUserId: subject.id, sessionId: subject.session_id, contextId, kind: 'admin' };
          admins.push(actor);
          await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)', [contextId,index+1]);
          const key = crypto.randomBytes(32).toString('base64url'), approval = crypto.randomBytes(32).toString('base64url');
          keys.push(key); approvalKeys.push(approval);
          await c.query(`insert into private.admin_secrets(context_id,settings_key_hash,settings_enrolled_at,approval_key_hash,approval_enrolled_at)
            values($1,$2,case when $2::text is null then null else now() end,$3,now())`, [contextId, index === 3 ? null : await hashCredentialAsync(`settings:${contextId}:${key}`), await hashCredentialAsync(`approval:${contextId}:${approval}`)]);
          await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)', [actor.sessionId,actor.authUserId,actor.contextId]);
          if (index === 3) primary = { ...actor, kind: 'primary', contextId: p.id };
        }
        const migration = fs.readFileSync('supabase/migrations/20261009230000_administrator_settings_keys.sql','utf8');
        await c.query(migration);
        await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', ['20261009230000',crypto.createHash('sha256').update(migration).digest('hex')]);
        for (const file of fs.readdirSync('supabase/migrations').filter(name => /^\d{14}.*\.sql$/.test(name) && name.slice(0,14) > '20261009230000').sort()) {
          const sql = fs.readFileSync(path.join('supabase/migrations',file),'utf8'); await c.query(sql);
          await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
        }
        return { admins, keys, approvalKeys, primary: primary! };
      });
      const { admins: [founder, other, third, unenrolled], keys, approvalKeys, primary } = fixtures;
      const status = (a: VerifiedActor) => db.authorizedSystem(a,['admin'],c => administratorSettingsStatus(c,a));
      const keyCheck = (a: VerifiedActor, key: unknown) => db.authorizedSystem(a,['admin'],c => checkAdministratorSettingsKey(c,a,key));
      const first = await status(founder);
      check(first.mainId === founder.contextId && first.members.length === 4, 'Status derives the actual founder and roster');
      check(first.members.filter(m => m.settingsKeyEnrolled).length === 3, 'Status reflects actual separate enrollment');
      check(!JSON.stringify(first).includes(keys[0]) && !JSON.stringify(first).includes('scrypt-sha256'), 'Status exposes no credentials or hashes');
      check(first.enrollmentMethod === 'fresh_sign_in' && first.capabilities.portalSettings === true, 'Keyed portal settings and fresh enrollment are available');
      await denied(() => status(primary), 401, 'A different active context cannot impersonate an administrator');
      const wrong = await keyCheck(founder, keys[1]); check(!wrong.allowed, 'Another administrator settings key is denied');
      check(!(await keyCheck(founder,approvalKeys[0])).allowed, 'Own approval key cannot authorize settings');
      const grant = await keyCheck(founder, keys[0]); check(grant.allowed && grant.version, 'Own separate settings key succeeds');
      check((await db.pool.query('select settings_failed_attempts from private.admin_secrets where context_id=$1',[founder.contextId])).rows[0].settings_failed_attempts === 0, 'Successful authorization resets failed attempts');
      await denied(() => db.authorizedSystem(unenrolled,['admin'], c => enrollAdministratorSettingsKey(c,unenrolled,{ userId: founder.contextId })),400,'Enrollment rejects client-selected identity');
      await denied(() => db.authorizedSystem(founder,['admin'], c => enrollAdministratorSettingsKey(c,founder,{})),409,'Existing one-time key cannot be displayed or replaced');
      await denied(() => db.authorizedSystem(unenrolled,['admin'], c => enrollAdministratorSettingsKey(c,unenrolled,{})),403,'Old genuine Auth session cannot enroll a settings key');
      const generatedHash = await hashCredentialAsync(`settings:${unenrolled.contextId}:${keys[3]}`);
      await denied(() => db.authorizedSystem(unenrolled,['admin'],c => c.query('update private.admin_secrets set settings_key_hash=$2 where context_id=$1',[unenrolled.contextId,generatedHash])), '42501','SQL independently rejects enrollment without fresh authentication');
      await denied(() => db.authorizedSystem(founder,['admin'],c => c.query('update private.admin_secrets set settings_key_hash=$2 where context_id=$1',[founder.contextId,generatedHash])), '42501','SQL prevents unilateral replacement of enrolled keys');
      await denied(() => db.system(c => c.query('update private.admin_secrets set settings_key_version=gen_random_uuid() where context_id=$1',[founder.contextId])), '42501','Key version metadata cannot be spoofed');
      for (let attempt = 1; attempt <= 5; attempt++) {
        const deniedGrant = await keyCheck(other,crypto.randomBytes(32).toString('hex'));
        check(!deniedGrant.allowed && Boolean(deniedGrant.locked) === (attempt === 5),'Five bad attempts persist and lock settings only');
      }
      check((await db.pool.query('select failed_attempts,settings_failed_attempts from private.admin_secrets where context_id=$1',[other.contextId])).rows[0].failed_attempts === 0,'Settings guesses do not consume approval attempts');
      await db.close(); db = new SupabaseDatabase(config);
      check((await keyCheck(other, keys[1])).locked, 'Lockout persists across application database restart');
      check((await keyCheck(third,keys[2])).allowed,'Other administrators remain independent of a lockout');
      await db.system(c => c.query(`update private.admin_secrets set settings_attempt_window=clock_timestamp()-interval '31 minutes',settings_locked_until=clock_timestamp()-interval '1 minute' where context_id=$1`,[other.contextId]));
      check((await keyCheck(other,keys[1])).allowed,'Expired lockout permits the valid key');
      await db.system(c => c.query(`insert into private.platform_settings(key,value) values('platform',$1)`,[JSON.stringify({registrationFee:50,semesterFee:300,announcement:'',contactDetails:{},subscriptionPrices:{default:0,star:90,pro:150}})]));
      const service = new SupabaseAdministratorSettings(new SupabaseAuth(db));
      await denied(() => service.setReceivingAccount(founder,{code:'',settingsKey:keys[1]}),403,'Receiving-account action commits a failed key denial');
      check((await db.pool.query('select settings_failed_attempts from private.admin_secrets where context_id=$1',[founder.contextId])).rows[0].settings_failed_attempts === 1,'HTTP service denial leaves the failed attempt recorded');
      await denied(() => service.setReceivingAccount(founder,{code:'https://untrusted.invalid',settingsKey:keys[0]}),400,'Receiving-account selector cannot become a provider URL');
      await denied(() => service.setReceivingAccount(founder,{code:'',settingsKey:keys[0],adminId:other.contextId}),400,'Receiving-account action rejects identity spoofing');
      const selected = await service.setReceivingAccount(founder,{code:'',settingsKey:keys[0]});
      check(selected.success && selected.selected === '', 'Valid key selects the real main Paystack account without a provider mutation');
      const raw = (await db.pool.query("select value from private.platform_settings where key='platform'")).rows[0].value;
      check(raw.registrationFee === 50 && raw.subscriptionPrices.pro === 150 && raw.paystackSettlement.updatedBy === founder.contextId,'Destination update preserves pricing and derives its actor');
      check((await db.pool.query("select count(*) from public.notifications where category='admin_settings'")).rows[0].count === '1','Receiving-account state change creates one settings notification');
      check((await db.pool.query('select count(*) from public.notification_recipients')).rows[0].count === '4','All active administrators receive the notice');
      check((await db.pool.query('select count(*) from public.notification_recipients where context_id=$1',[primary.contextId])).rows[0].count === '0','Primary users receive no administrator settings notice');
      await service.setReceivingAccount(founder,{code:'',settingsKey:keys[0]});
      check((await db.pool.query('select count(*) from public.notifications')).rows[0].count === '1','No-op destination update does not repeat notices');
      checks += await verifyPublicSettings(db, fixtures.admins, keys, approvalKeys, primary);
      checks += await verifyPlatformMaintenance(db, fixtures.admins, keys, primary);
      await denied(() => db.authorizedSystem(other,['admin'],c => saveReceivingAccount(c,other,grant,'','live')),403,'A grant is bound to the administrator that earned it');
      await denied(() => db.authorizedSystem(founder,['admin'],c => saveReceivingAccount(c,founder,{allowed:true,version:crypto.randomUUID()},'','live')),403,'Stale key version cannot authorize configuration');
      const again = await keyCheck(other,keys[1]);
      for(let i=0;i<5;i++) await keyCheck(other,crypto.randomBytes(32).toString('hex'));
      await denied(() => db.authorizedSystem(other,['admin'],c => saveReceivingAccount(c,other,again,'','live')),403,'Lockout invalidates an in-flight provider authorization');
      await denied(() => db.system(c => c.query("update public.admin_memberships set status='suspended' where context_id=$1",[founder.contextId])),'42501','Founder access cannot be revoked by direct settings mutation');
      await db.system(c => c.query('delete from auth.sessions where id=$1',[founder.sessionId]));
      await denied(() => status(founder),401,'Revoked real Auth session cannot read administrator status');
      for(const role of ['anon','authenticated','pinevela_backend']) {
        await denied(() => db.system(async c => { await c.query('set local role '+role); return c.query('select settings_key_hash from private.admin_secrets'); }), '42501', role+' cannot read administrator keys');
        await denied(() => db.system(async c => { await c.query('set local role '+role); return c.query("update private.platform_settings set value='{}'"); }), '42501', role+' cannot bypass settings authorization');
      }
      await db.system(c => c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[primary.sessionId,primary.contextId]));
      await denied(() => status(primary),403,'A genuine active primary session cannot use administrator settings');
      await denied(() => service.setReceivingAccount(primary,{code:'',settingsKey:keys[3]}),403,'An active non-administrator cannot change payment routing');
      check((await db.actor(primary,c => c.query('select context_id from public.admin_memberships'))).rowCount === 0,'RLS hides the administrator roster from a primary session');
      const primaryRows = await db.actor(primary,c => c.query("select id from public.notifications where category='admin_settings'"));
      check(primaryRows.rowCount === 0,'RLS hides administrator notifications from the primary portal');
      const adminRows = await db.actor(third,c => c.query("select id from public.notifications where title='Payment receiving account updated'"));
      check(adminRows.rowCount === 1,'RLS permits the actual administrator recipient');
      check((await db.pool.query('select count(*) from auth.users')).rows[0].count === '5','No Auth accounts were created or restored');
    } finally { await db.close(); }
  });
  console.log(JSON.stringify({checks,passed:true,isolatedRestore:true,providerMocks:0,authAccountsCreated:0,cloudRecordsModified:0,
    freshEnrollmentAcceptance:'Requires an actual fresh administrator sign-in; no Auth session timestamps were fabricated.'}));
} catch(error:any) { console.error(JSON.stringify({passed:false,checks,status:error instanceof ApiError ? error.status : undefined,sqlstate:/^[0-9A-Z]{5}$/.test(error?.code)?error.code:undefined,
  assertion:error?.code==='ERR_ASSERTION'?error.message:undefined})); process.exitCode=1; }
