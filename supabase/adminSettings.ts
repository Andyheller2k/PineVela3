import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, type VerifiedActor } from './db.js';
import type { SupabaseAuth, AuthRequest } from './auth.js';
import { hashCredentialAsync, verifyCredentialAsync } from '../accountSecurity.js';
import { paystackConfig, paystackRequest } from '../paystackProvider.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { notify } from './notifications.js';

const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { work(req as AuthRequest, res).catch(next); };
const codePattern = /^ACCT_[A-Za-z0-9]{1,80}$/;
export function bodyFields(body: any, fields: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key)))
    throw new ApiError(400, 'Invalid administrator settings request.');
}
export async function requireAdministrator(c: PoolClient, a: VerifiedActor) {
  if (a.kind !== 'admin' || !(await c.query(`select m.context_id from public.admin_memberships m
    join public.account_contexts x on x.id=m.context_id where m.context_id=$1 and m.status='active'
      and x.kind='admin' and x.status='active' and x.auth_user_id=$2
      and m.context_id=private.current_context_id() for share of m,x`, [a.contextId, a.authUserId])).rowCount)
    throw new ApiError(403, 'Active administrator access required.');
}
export async function settingsEvent(c: PoolClient, a: VerifiedActor, type: string, title: string, message: string) {
  await c.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values($1,$2,'account_context',$1)`, [a.contextId, type]);
  const admins = (await c.query(`select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    where m.status='active' and x.status='active' and x.kind='admin'`)).rows.map(row => row.context_id);
  await notify(c, admins, { category: 'admin_settings', title, message, sender: a.contextId, link: 'admin-settings' });
}
export async function administratorSettingsStatus(c: PoolClient, a: VerifiedActor) {
  await requireAdministrator(c, a);
  const members = (await c.query(`select m.context_id as id,m.slot,m.status='active' and x.status='active' as active,
    p.display_name as name,p.email,k.approval_key_hash is not null as "keyEnrolled",
    k.settings_key_hash is not null as "settingsKeyEnrolled"
    from public.admin_memberships m join public.account_contexts x on x.id=m.context_id
    join public.profiles p on p.id=x.auth_user_id left join private.admin_secrets k on k.context_id=m.context_id where m.status<>'removed' order by m.slot`)).rows;
  const fresh = (await c.query(`select created_at between clock_timestamp()-interval '5 minutes' and clock_timestamp() as fresh
    from auth.sessions where id=$1 and user_id=$2`, [a.sessionId, a.authUserId])).rows[0]?.fresh === true;
  return { currentId: a.contextId, mainId: members.find(row => row.slot === 1)?.id || null, members,
    freshSignIn: fresh, enrollmentMethod: 'fresh_sign_in', capabilities: { receivingAccount: true, pricing: true, contacts: true, announcements: true, portalSettings: true } };
}
export async function enrollAdministratorSettingsKey(c: PoolClient, a: VerifiedActor, body: unknown) {
  bodyFields(body, []);
  // Match pricing's lock order before a key change can invalidate its baseline.
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  await requireAdministrator(c, a);
  await c.query('insert into private.admin_secrets(context_id) values($1) on conflict do nothing', [a.contextId]);
  const previous = (await c.query('select settings_key_hash from private.admin_secrets where context_id=$1 for update', [a.contextId])).rows[0];
  if (previous.settings_key_hash) throw new ApiError(409, 'Your settings key has already been issued. Recovery requires approval by two other administrators.');
  const fresh = (await c.query(`select id from auth.sessions where id=$1 and user_id=$2
    and created_at between clock_timestamp()-interval '5 minutes' and clock_timestamp()
    and (not_after is null or not_after>clock_timestamp()) for share`, [a.sessionId, a.authUserId])).rowCount;
  if (!fresh) throw new ApiError(403, 'Sign out and sign in again with Google or your verified email, then enroll within five minutes.', 'fresh_sign_in_required');
  const key = crypto.randomBytes(32).toString('base64url');
  await c.query('update private.admin_secrets set settings_key_hash=$2 where context_id=$1',
    [a.contextId, await hashCredentialAsync(`settings:${a.contextId}:${key}`)]);
  await settingsEvent(c, a, 'admin_settings_key_enrolled', 'Administrator settings key enrolled', 'An administrator enrolled their separate settings key.');
  return { success: true, settingsKey: key, message: 'Save your settings key privately. It will only be shown once.' };
}
export type SettingsGrant = { allowed: boolean; version?: string; locked?: boolean };
/** Return denials to commit the attempt counter; throw HTTP errors AFTER commit. */
export async function checkAdministratorSettingsKey(c: PoolClient, a: VerifiedActor, value: unknown): Promise<SettingsGrant> {
  await requireAdministrator(c, a);
  const record = (await c.query(`select *,settings_locked_until>clock_timestamp() as locked,
    settings_attempt_window>clock_timestamp()-interval '15 minutes' as current_window
    from private.admin_secrets where context_id=$1 for update`, [a.contextId])).rows[0];
  if (!record?.settings_key_hash) return { allowed: false };
  if (record.locked) return { allowed: false, locked: true };
  if (typeof value !== 'string' || !value) return { allowed: false };
  if (value.length > 128 || !await verifyCredentialAsync(`settings:${a.contextId}:${value}`, record.settings_key_hash)) {
    const count = record.current_window ? Math.min(record.settings_failed_attempts + 1, 5) : 1;
    await c.query(`update private.admin_secrets set settings_failed_attempts=$2::smallint,
      settings_attempt_window=case when $3::boolean then settings_attempt_window else clock_timestamp() end,
      settings_locked_until=case when $2::smallint=5 then clock_timestamp()+interval '15 minutes' else null end where context_id=$1`,
    [a.contextId, count, Boolean(record.current_window)]);
    return { allowed: false, locked: count === 5 };
  }
  await c.query(`update private.admin_secrets set settings_failed_attempts=0,settings_attempt_window=null,settings_locked_until=null where context_id=$1`, [a.contextId]);
  return { allowed: true, version: record.settings_key_version };
}
export function deniedKey(grant: SettingsGrant) {
  if (!grant.allowed) throw new ApiError(grant.locked ? 429 : 403, grant.locked
    ? 'Too many settings-key attempts. Wait 15 minutes.' : 'Enter your current separate settings key.', grant.locked ? 'settings_key_locked' : 'settings_key_required');
}
export async function requireSettingsGrant(c: PoolClient, a: VerifiedActor, grant: SettingsGrant) {
  await requireAdministrator(c, a); deniedKey(grant);
  const key = await c.query(`select context_id from private.admin_secrets where context_id=$1 and settings_key_hash is not null
    and settings_key_version=$2 and (settings_locked_until is null or settings_locked_until<=clock_timestamp()) for share`, [a.contextId,grant.version]);
  if (!key.rowCount) throw new ApiError(403,'Your settings authorization has changed. Enter your current key again.');
  await c.query("select set_config('pinevela.settings_key_version',$1,true)",[grant.version]);
}
export async function saveReceivingAccount(c: PoolClient, a: VerifiedActor, grant: SettingsGrant, code: string, mode: string) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  await requireAdministrator(c, a);
  deniedKey(grant);
  if (typeof code !== 'string' || code !== '' && !codePattern.test(code) || !['live','test'].includes(mode))
    throw new ApiError(400, 'Choose a valid Paystack receiving account.');
  const current = await c.query(`select context_id from private.admin_secrets where context_id=$1 and settings_key_hash is not null
    and settings_key_version=$2 and (settings_locked_until is null or settings_locked_until<=clock_timestamp()) for share`, [a.contextId, grant.version]);
  if (!current.rowCount) throw new ApiError(403, 'Your settings authorization has changed. Enter your current key again.');
  await c.query("insert into private.platform_settings(key,value) values('platform','{}') on conflict do nothing");
  const before = (await c.query("select value from private.platform_settings where key='platform' for update")).rows[0].value;
  if (before.paystackSettlement?.code === code && before.paystackSettlement?.mode === mode) return { success: true, selected: code, mode };
  await c.query(`update private.platform_settings set value=jsonb_set(value,'{paystackSettlement}',jsonb_build_object(
    'code',$1::text,'mode',$2::text,'updatedBy',$3::uuid::text,'updatedAt',clock_timestamp())),updated_by_context_id=$3::uuid,updated_at=clock_timestamp() where key='platform'`, [code, mode, a.contextId]);
  await settingsEvent(c, a, 'paystack_receiving_account_updated', 'Payment receiving account updated',
    'An administrator changed the receiving account for new checkouts. Existing checkouts retain their original destination.');
  return { success: true, selected: code, mode };
}
function validProviderAccount(account: any, mode: string) {
  return account && typeof account.subaccount_code === 'string' && codePattern.test(account.subaccount_code)
    && account.domain === mode && account.currency === 'GHS' && account.active === true && account.is_verified === true;
}
export class SupabaseAdministratorSettings {
  private budgets = new AttemptBudgets();
  constructor(readonly auth: SupabaseAuth) {}
  private limit(a: VerifiedActor) { this.budgets.reserve([{ scope: 'admin-receiving-account', identity: a.contextId, maximum: 15, windowMs: 60000 }]); }
  async receivingAccounts(a: VerifiedActor) {
    this.limit(a);
    await this.auth.db.authorizedSystem(a, ['admin'], c => requireAdministrator(c, a));
    const { mode } = paystackConfig(), accounts = await paystackRequest('/subaccount?perPage=100');
    if (!Array.isArray(accounts)) throw new ApiError(502, 'Paystack returned invalid receiving accounts.');
    // Recheck the actual session/membership after the external read.
    return this.auth.db.authorizedSystem(a, ['admin'], async c => {
      await requireAdministrator(c, a);
      const raw = (await c.query("select value from private.platform_settings where key='platform'")).rows[0]?.value;
      return { mode, selected: raw?.paystackSettlement?.code || '', selectedMode: raw?.paystackSettlement?.mode || null,
        accounts: accounts.filter(account => validProviderAccount(account, mode)).map(account => ({ code: account.subaccount_code,
          name: String(account.business_name || '').slice(0,200), bank: String(account.settlement_bank || '').slice(0,100),
          last4: String(account.account_number || '').replace(/\D/g,'').slice(-4) })), possiblyMore: accounts.length >= 100 };
    });
  }
  async setReceivingAccount(a: VerifiedActor, body: any) {
    bodyFields(body, ['code','settingsKey']);
    if (typeof body.code !== 'string' || body.code !== '' && !codePattern.test(body.code)) throw new ApiError(400, 'Choose a Paystack receiving account.');
    this.limit(a);
    const grant = await this.auth.db.authorizedSystem(a, ['admin'], c => checkAdministratorSettingsKey(c, a, body.settingsKey));
    deniedKey(grant);
    const { mode } = paystackConfig();
    if (body.code) {
      const account = await paystackRequest(`/subaccount/${body.code}`);
      if (!validProviderAccount(account, mode) || account.subaccount_code !== body.code)
        throw new ApiError(409, 'The receiving account must be active, verified and in this Paystack GHS environment.');
    }
    return this.auth.db.authorizedSystem(a, ['admin'], c => saveReceivingAccount(c, a, grant, body.code, mode));
  }
}
export function installAdministratorSettings(app: Express, auth: SupabaseAuth) {
  const settings = new SupabaseAdministratorSettings(auth), budgets = new AttemptBudgets();
  app.get('/api/admin/settings/status', auth.require(['admin']), route(async (req, res) =>
    res.json(await auth.db.authorizedSystem(req.actor, ['admin'], c => administratorSettingsStatus(c, req.actor)))));
  app.post('/api/admin/governance/keys/settings/enroll', auth.require(['admin']), route(async (req, res) => {
    budgets.reserve([{ scope: 'admin-settings-enrollment', identity: req.actor.contextId, maximum: 5, windowMs: 60000 }]);
    res.json(await auth.db.authorizedSystem(req.actor, ['admin'], c => enrollAdministratorSettingsKey(c, req.actor, req.body)));
  }));
  app.get('/api/admin/payments/receiving-account', auth.require(['admin']), route(async (req, res) => res.json(await settings.receivingAccounts(req.actor))));
  app.post('/api/admin/payments/receiving-account', auth.require(['admin']), route(async (req, res) => res.json(await settings.setReceivingAccount(req.actor, req.body))));
}
