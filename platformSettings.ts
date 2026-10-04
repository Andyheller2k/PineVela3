export interface PlatformSettings { registrationFee: number; commission: number; announcement: string; maintenanceMode: boolean }
export const MAINTENANCE_MESSAGE = 'PineVela is temporarily unavailable during database updates. Administrator accounts can still sign in.';
export function publicPlatformSettings(store: any): PlatformSettings {
  const settings = store.platformSettings || {};
  return {
    registrationFee: typeof settings.registrationFee === 'number' && Number.isFinite(settings.registrationFee) && settings.registrationFee >= 0 ? settings.registrationFee : 50,
    commission: typeof settings.commission === 'number' && Number.isFinite(settings.commission) && settings.commission >= 0 && settings.commission <= 100 ? settings.commission : 0,
    announcement: typeof settings.announcement === 'string' ? settings.announcement : '',
    maintenanceMode: settings.maintenanceMode === true
  };
}
export function validatePlatformSettings(body: any): PlatformSettings {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['registrationFee', 'commission', 'announcement', 'maintenanceMode', 'settingsKey'].includes(key))) throw new Error('Only platform settings may be changed.');
  if (typeof body.registrationFee !== 'number' || !Number.isFinite(body.registrationFee) || body.registrationFee < 0 || body.registrationFee > 1_000_000 || Math.abs(body.registrationFee * 100 - Math.round(body.registrationFee * 100)) > 0.00001) throw new Error('Registration fee must be a valid GHS amount with at most two decimal places.');
  if (typeof body.commission !== 'number' || !Number.isFinite(body.commission) || body.commission < 0 || body.commission > 100) throw new Error('Commission must be a number between 0 and 100 percent.');
  if (typeof body.announcement !== 'string' || body.announcement.length > 2000) throw new Error('Announcement must contain at most 2,000 characters.');
  if (typeof body.maintenanceMode !== 'boolean') throw new Error('Maintenance mode must be a boolean.');
  return { registrationFee: body.registrationFee, commission: body.commission, announcement: body.announcement.trim(), maintenanceMode: body.maintenanceMode };
}
