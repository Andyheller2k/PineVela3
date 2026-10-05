import { DEFAULT_SUBSCRIPTION_PRICES, MARKET_PLANS } from './marketPlans.js';
export interface PlatformSettings { registrationFee: number; commission: number; announcement: string; maintenanceMode: boolean; semesterFee: number; subscriptionPrices: Record<"default" | "star" | "pro", number> }
export type PricingSettings = Pick<PlatformSettings, 'registrationFee' | 'commission' | 'semesterFee' | 'subscriptionPrices'>;
export function pricingSettings(settings: PlatformSettings): PricingSettings {
  return { registrationFee: settings.registrationFee, commission: settings.commission, semesterFee: settings.semesterFee, subscriptionPrices: { default: settings.subscriptionPrices.default, star: settings.subscriptionPrices.star, pro: settings.subscriptionPrices.pro } };
}
export function validatePricingSettings(body: any): PricingSettings {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 4 || Object.keys(body).some(key => !['registrationFee', 'commission', 'semesterFee', 'subscriptionPrices'].includes(key))) throw new Error('Supply only registration, commission, semester and all three monthly prices.');
  return pricingSettings(validatePlatformSettings({ ...body, announcement: '', maintenanceMode: false }));
}
export const MAINTENANCE_MESSAGE = 'PineVela is temporarily unavailable ,please try again later,thank you.';
export function publicPlatformSettings(store: any): PlatformSettings {
  const settings = store.platformSettings || {};
  return {
    registrationFee: typeof settings.registrationFee === 'number' && Number.isFinite(settings.registrationFee) && settings.registrationFee >= 0 ? settings.registrationFee : 50,
    commission: typeof settings.commission === 'number' && Number.isFinite(settings.commission) && settings.commission >= 0 && settings.commission <= 100 ? settings.commission : 0,
    announcement: typeof settings.announcement === 'string' ? settings.announcement : '',
    maintenanceMode: settings.maintenanceMode === true,
    semesterFee: validMoney(settings.semesterFee) ? settings.semesterFee : 300,
    subscriptionPrices: Object.fromEntries(MARKET_PLANS.map(plan => [plan, validMoney(settings.subscriptionPrices?.[plan]) ? settings.subscriptionPrices[plan] : DEFAULT_SUBSCRIPTION_PRICES[plan]])) as PlatformSettings['subscriptionPrices']
  };
}
function validMoney(value: any): boolean { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001 && (value === 0 || value >= 0.1); }
export function validatePlatformSettings(body: any, current?: any): PlatformSettings {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['registrationFee', 'commission', 'announcement', 'maintenanceMode', 'settingsKey', 'semesterFee', 'subscriptionPrices', 'maintenanceRecoveryMessage'].includes(key))) throw new Error('Only platform settings may be changed.');
  if (typeof body.registrationFee !== 'number' || !Number.isFinite(body.registrationFee) || body.registrationFee < 0 || body.registrationFee > 1_000_000 || Math.abs(body.registrationFee * 100 - Math.round(body.registrationFee * 100)) > 0.00001) throw new Error('Registration fee must be a valid GHS amount with at most two decimal places.');
  if (typeof body.commission !== 'number' || !Number.isFinite(body.commission) || body.commission < 0 || body.commission > 100) throw new Error('Commission must be a number between 0 and 100 percent.');
  if (typeof body.announcement !== 'string' || body.announcement.length > 2000) throw new Error('Announcement must contain at most 2,000 characters.');
  if (typeof body.maintenanceMode !== 'boolean') throw new Error('Maintenance mode must be a boolean.');
  if (body.maintenanceRecoveryMessage !== undefined && (typeof body.maintenanceRecoveryMessage !== 'string' || body.maintenanceRecoveryMessage.trim().length > 2000)) throw new Error('Return message must contain at most 2,000 characters.');
  const defaults = publicPlatformSettings({ platformSettings: current });
  const semesterFee = body.semesterFee === undefined ? defaults.semesterFee : body.semesterFee;
  const subscriptionPrices = body.subscriptionPrices === undefined ? defaults.subscriptionPrices : body.subscriptionPrices;
  if (!validMoney(semesterFee) || !subscriptionPrices || typeof subscriptionPrices !== 'object' || Array.isArray(subscriptionPrices) || Object.keys(subscriptionPrices).length !== 3 || MARKET_PLANS.some(plan => !validMoney(subscriptionPrices[plan]))) throw new Error('Enter all three subscription prices and the two-month fee as valid GHS amounts (zero or at least GHS 0.10).');
  if (!validMoney(body.registrationFee)) throw new Error('Registration fee must be zero or at least GHS 0.10.');
  return { semesterFee, subscriptionPrices, registrationFee: body.registrationFee, commission: body.commission, announcement: body.announcement.trim(), maintenanceMode: body.maintenanceMode };
}
