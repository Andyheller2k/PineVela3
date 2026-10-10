import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, type VerifiedActor } from './db.js';
import type { SupabaseAuth, AuthRequest } from './auth.js';
import { bodyFields, checkAdministratorSettingsKey, deniedKey, requireSettingsGrant, settingsEvent, type SettingsGrant } from './adminSettings.js';
import { publicPlatformSettings, validateContactDetails, type ContactDetails } from '../platformSettings.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { notify } from './notifications.js';

export type PublicSettingsChanges = { contactDetails?: ContactDetails; announcement?: string; maintenanceMode?: boolean; maintenanceRecoveryMessage?: string };
function changes(body: unknown): PublicSettingsChanges {
  bodyFields(body, ['settingsKey','contactDetails','announcement','maintenanceMode','maintenanceRecoveryMessage']);
  const input = body as Record<string,unknown>, result: PublicSettingsChanges = {};
  if (Object.hasOwn(input,'contactDetails')) {
    try { result.contactDetails = validateContactDetails(input.contactDetails); }
    catch (error) { throw new ApiError(400,(error as Error).message); }
  }
  if (Object.hasOwn(input,'announcement')) {
    if (typeof input.announcement !== 'string' || input.announcement.length > 2000)
      throw new ApiError(400,'Announcement must contain at most 2,000 characters.');
    result.announcement = input.announcement.trim();
  }
  if (Object.hasOwn(input,'maintenanceMode')) {
    if (typeof input.maintenanceMode !== 'boolean') throw new ApiError(400,'Maintenance mode must be a boolean.');
    result.maintenanceMode=input.maintenanceMode;
  }
  if (Object.hasOwn(input,'maintenanceRecoveryMessage')) {
    if (!Object.hasOwn(input,'maintenanceMode') || input.maintenanceMode!==false || typeof input.maintenanceRecoveryMessage!=='string'
      || !input.maintenanceRecoveryMessage.trim() || input.maintenanceRecoveryMessage.length>2000)
      throw new ApiError(400,'Provide a recovery message of 1–2,000 characters when ending maintenance.');
    result.maintenanceRecoveryMessage=input.maintenanceRecoveryMessage.trim();
  }
  if (!Object.keys(result).length) throw new ApiError(400,'Supply contact details or an announcement.');
  return result;
}
/** Private configuration has no client-write grants. Only the verified key service
 * supplies changes; prices and client identity assertions are rejected. Maintenance
 * callers hold the exclusive platform-maintenance lease before actor/credential locks. */
export async function savePublicSettings(c: PoolClient, a: VerifiedActor, grant: SettingsGrant, update: PublicSettingsChanges) {
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  await requireSettingsGrant(c,a,grant);
  // Validate again at the transaction boundary, without accepting identity/key fields.
  const reviewed = changes(update);
  await c.query("insert into private.platform_settings(key,value) values('platform','{}') on conflict do nothing");
  const raw = (await c.query("select value from private.platform_settings where key='platform' for update")).rows[0].value;
  const {maintenanceRecoveryMessage,...stored}=reviewed;
  const maintenanceChanged=stored.maintenanceMode!==undefined && stored.maintenanceMode!==(raw.maintenanceMode===true);
  if (maintenanceChanged && stored.maintenanceMode===false && !maintenanceRecoveryMessage)
    throw new ApiError(400,'Write a message for users before ending maintenance.');
  await c.query("select set_config('pinevela.maintenance_return_message',$1,true)",[maintenanceRecoveryMessage || '']);
  const different = (await c.query('select $1::jsonb || $2::jsonb is distinct from $1::jsonb as changed',
    [JSON.stringify(raw),JSON.stringify(stored)])).rows[0].changed;
  if (!different) return { success: true, settings: publicPlatformSettings({platformSettings:raw}) };
  const announcementChanged = reviewed.announcement !== undefined && reviewed.announcement !== (raw.announcement || '');
  const next = (await c.query(`update private.platform_settings set value=value || $1::jsonb,
    updated_by_context_id=$2,updated_at=clock_timestamp() where key='platform' returning value`,
    [JSON.stringify(stored),a.contextId])).rows[0].value;
  // Maintenance transitions have their own atomic SQL audit and administrator notice.
  if (!maintenanceChanged || stored.contactDetails!==undefined || stored.announcement!==undefined)
    await settingsEvent(c,a,'public_settings_updated','Public platform settings updated',
    'An administrator updated public contact details or the platform announcement.');
  if (announcementChanged && reviewed.announcement) {
    const recipients = (await c.query("select id from public.account_contexts where kind<>'admin' and status='active'")).rows.map(r=>r.id);
    await notify(c,recipients,{category:'system_announcement',title:'PineVela announcement',message:reviewed.announcement,sender:a.contextId});
  }
  return { success: true, settings: publicPlatformSettings({platformSettings:next}) };
}
export class SupabasePublicSettings {
  private budgets = new AttemptBudgets();
  constructor(readonly auth: SupabaseAuth) {}
  async update(a: VerifiedActor, body: unknown) {
    const reviewed = changes(body);
    this.budgets.reserve([{scope:'administrator-public-settings',identity:a.contextId,maximum:30,windowMs:60000}]);
    const grant = await this.auth.db.authorizedSystem(a,['admin'],c=>checkAdministratorSettingsKey(c,a,(body as any).settingsKey));
    deniedKey(grant);
    return this.auth.db.authorizedSystem(a,['admin'],c=>savePublicSettings(c,a,grant,reviewed),reviewed.maintenanceMode!==undefined);
  }
}
export function installPublicSettings(app: Express, auth: SupabaseAuth) {
  const service = new SupabasePublicSettings(auth);
  const route: RequestHandler = (req,res,next) => {
    service.update((req as AuthRequest).actor,req.body).then(value=>res.json(value)).catch(next);
  };
  app.post('/api/settings',auth.require(['admin']),route);
}
