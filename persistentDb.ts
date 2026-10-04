import type { AdminGovernanceState } from './adminGovernance.js';
import type { RoomKeyLimitState } from './roomKeySecurity.js';
import 'dotenv/config';
import type { SignupState } from './signupSecurity.js';
import { JsonStoreWriter, DatabasePersistenceError } from './jsonStoreSafety.js';
import { removeRawSessions } from './sessionSecurity.js';
import path from 'path';
import { accountKey, protectStoredCredentials } from './accountSecurity.js';
import { CREDENTIAL_EXPOSURE_VERSION, revokeExposedCredentials } from './credentialExposure.js';

export interface PersistentStore {
  adminGovernance?: AdminGovernanceState;
  signupVerification?: SignupState;
  roomKeyAttempts?: RoomKeyLimitState;
  hostels: any[];
  retiredFeatureRecords?: Record<string, any[]>;
  issueReports: any[];
  activities: any[];
  hostelVerifications: any[];
  managerRegistrationRequests: any[];
  managerVerifications?: any[];
  managerRequests?: any[];
  managerProfiles?: any[];
  verificationAuditLogs: any[];
  users: any[];
  notifications: any[];
  boardRequests?: any[];
  meetings?: any[];
  ratings?: any[];
  onboardingPayments?: any[];
  managerAccountSettings?: Record<string, any>;
  staff?: any[];
  staffAuditLogs?: any[];
  staffReviews?: any[];
  staffBargains?: any[];
  roomKeys?: any[];
  retiredRoomKeys?: string[];
  accountSecurityVersion?: number;
  credentialExposureVersion?: number;
  credentialsRevokedAt?: string;
  keyDispatches?: any[];
  platformSettings: {
    registrationFee: number;
    commission: number;
    announcement: string;
    maintenanceMode: boolean;
  };
  managerRestrictions?: any[];
  digitalMarketApplications?: any[];
  digitalMarketStores?: any[];
  digitalMarketProducts?: any[];
  marketMedia?: { imageUrl: string; accountId: string; createdAt: string }[];
  digitalMarketOrders?: any[];
  digitalMarketMessages?: any[];
  digitalMarketRatings?: any[];
  digitalMarketServiceReviews?: any[];
  verificationTeams?: any[];
  verificationInspections?: any[];
}

const DATA_DIR = path.resolve(process.env.PINEVELA_DATA_DIR || path.join(process.cwd(), 'data'));
const STORE_PATH = path.join(DATA_DIR, 'pinevela_store.json');

const writer = new JsonStoreWriter(STORE_PATH);

function deduplicateById<T extends { id?: any; email?: any }>(arr: T[], accounts = false): T[] {
  if (!Array.isArray(arr)) return [];
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  return arr.filter(item => {
    if (!item) return false;
    if (accounts) {
      const identity = accountKey(item);
      if (seenIds.has(identity)) return false;
      seenIds.add(identity);
      return true;
    }
    const itemId = item.id ? String(item.id) : '';
    const itemEmail = item.email ? String(item.email).toLowerCase().trim() : '';
    if (itemId) {
      if (seenIds.has(itemId)) return false;
      seenIds.add(itemId);
    }
    if (itemEmail) {
      if (seenEmails.has(itemEmail)) return false;
      seenEmails.add(itemEmail);
    }
    return true;
  });
}

/**
 * Load persistent store from disk or initialize with defaults
 */
export function loadPersistentStore(defaultStore: PersistentStore): PersistentStore {
  const parsed = writer.load();
  if (parsed === undefined) {
    defaultStore.credentialExposureVersion = CREDENTIAL_EXPOSURE_VERSION;
    savePersistentStore(defaultStore);
    console.log('[PineVela Database] Initialized local persistent store at:', STORE_PATH);
    return defaultStore;
  }

  let containingCredentials = false;
  try {
    containingCredentials = true;
    const containment = revokeExposedCredentials(parsed);
    if (containment.changed) {
      savePersistentStore(parsed);
      console.log('[PineVela Security] Exposed sessions revoked; existing credentials require recovery.');
    }
    // Historical indefinite sessions must require fresh authentication.
    if (removeRawSessions(parsed)) {
      containingCredentials = true;
      savePersistentStore(parsed);
    }
    containingCredentials = false;
    
    const managerSettings = (parsed.managerAccountSettings && typeof parsed.managerAccountSettings === 'object') ? parsed.managerAccountSettings : (defaultStore.managerAccountSettings || {});
    for (const settings of Object.values(managerSettings) as any[]) {
      if (settings?.notifications) settings.notifications = Object.fromEntries(
        ['emailAlerts', 'smsAlerts', 'maintenanceTicketAlerts', 'meetingRequestAlerts'].filter(key => key in settings.notifications).map(key => [key, settings.notifications[key]])
      );
    }
    const result: PersistentStore = {
      adminGovernance: parsed.adminGovernance,
      roomKeyAttempts: { limits: Array.isArray(parsed.roomKeyAttempts?.limits) ? parsed.roomKeyAttempts.limits : [] },
      signupVerification: { pending: Array.isArray(parsed.signupVerification?.pending) ? parsed.signupVerification.pending : [], limits: Array.isArray(parsed.signupVerification?.limits) ? parsed.signupVerification.limits : [] },
      hostels: deduplicateById(Array.isArray(parsed.hostels) ? parsed.hostels : defaultStore.hostels),
      // Preserve retired housing applications privately without an active model or API.
      retiredFeatureRecords: { ...(parsed.retiredFeatureRecords || {}), housingApplications: deduplicateById([
        ...(parsed.retiredFeatureRecords?.housingApplications || []),
        ...(Array.isArray(parsed.bookingRequests) ? parsed.bookingRequests : [])
      ]) },
      issueReports: deduplicateById(Array.isArray(parsed.issueReports) ? parsed.issueReports : defaultStore.issueReports),
      activities: deduplicateById(Array.isArray(parsed.activities) ? parsed.activities : defaultStore.activities),
      hostelVerifications: deduplicateById(Array.isArray(parsed.hostelVerifications) ? parsed.hostelVerifications : defaultStore.hostelVerifications),
      managerRegistrationRequests: deduplicateById(Array.isArray(parsed.managerRegistrationRequests) ? parsed.managerRegistrationRequests : defaultStore.managerRegistrationRequests),
      managerVerifications: deduplicateById(Array.isArray(parsed.managerVerifications) ? parsed.managerVerifications : (defaultStore.managerVerifications || [])),
      managerRequests: deduplicateById(Array.isArray(parsed.managerRequests) ? parsed.managerRequests : (defaultStore.managerRequests || [])),
      managerProfiles: Array.isArray(parsed.managerProfiles) ? parsed.managerProfiles : (defaultStore.managerProfiles || []),
      verificationAuditLogs: deduplicateById(Array.isArray(parsed.verificationAuditLogs) ? parsed.verificationAuditLogs : defaultStore.verificationAuditLogs),
      users: deduplicateById((Array.isArray(parsed.users) ? parsed.users : defaultStore.users).filter((u: any) => u && u.email !== 'staff@pinevela.com' && u.username !== 'staff'), true),
      notifications: deduplicateById(Array.isArray(parsed.notifications) ? parsed.notifications : defaultStore.notifications), boardRequests: deduplicateById(Array.isArray(parsed.boardRequests) ? parsed.boardRequests : (defaultStore.boardRequests || [])),
      meetings: deduplicateById(Array.isArray(parsed.meetings) ? parsed.meetings : (defaultStore.meetings || [])),
      ratings: Array.isArray(parsed.ratings) ? parsed.ratings : (defaultStore.ratings || []),
      onboardingPayments: Array.isArray(parsed.onboardingPayments) ? parsed.onboardingPayments : (defaultStore.onboardingPayments || []),
      managerAccountSettings: managerSettings,
      staff: deduplicateById(Array.isArray(parsed.staff) ? parsed.staff : (defaultStore.staff || [])),
      staffAuditLogs: deduplicateById(Array.isArray(parsed.staffAuditLogs) ? parsed.staffAuditLogs : (defaultStore.staffAuditLogs || [])), staffReviews: deduplicateById(Array.isArray(parsed.staffReviews) ? parsed.staffReviews : (defaultStore.staffReviews || [])),
      staffBargains: Array.isArray(parsed.staffBargains) ? parsed.staffBargains : (defaultStore.staffBargains || []),
      roomKeys: deduplicateById(Array.isArray(parsed.roomKeys) ? parsed.roomKeys : (defaultStore.roomKeys || [])),
      retiredRoomKeys: Array.isArray(parsed.retiredRoomKeys) ? parsed.retiredRoomKeys : [],
      accountSecurityVersion: parsed.accountSecurityVersion,
      credentialExposureVersion: parsed.credentialExposureVersion,
      credentialsRevokedAt: parsed.credentialsRevokedAt,
      keyDispatches: Array.isArray(parsed.keyDispatches) ? parsed.keyDispatches : [],
      platformSettings: parsed.platformSettings || defaultStore.platformSettings,
      managerRestrictions: deduplicateById(Array.isArray(parsed.managerRestrictions) ? parsed.managerRestrictions : (defaultStore.managerRestrictions || [])),
      digitalMarketApplications: deduplicateById(Array.isArray(parsed.digitalMarketApplications) ? parsed.digitalMarketApplications : (defaultStore.digitalMarketApplications || [])),
      digitalMarketStores: deduplicateById(Array.isArray(parsed.digitalMarketStores) ? parsed.digitalMarketStores : (defaultStore.digitalMarketStores || [])),
      marketMedia: Array.isArray(parsed.marketMedia) ? parsed.marketMedia.filter((m: any) => m && typeof m.imageUrl === 'string' && typeof m.accountId === 'string') : [],
      digitalMarketProducts: deduplicateById(Array.isArray(parsed.digitalMarketProducts) ? parsed.digitalMarketProducts : (defaultStore.digitalMarketProducts || [])),
      digitalMarketOrders: deduplicateById(Array.isArray(parsed.digitalMarketOrders) ? parsed.digitalMarketOrders : (defaultStore.digitalMarketOrders || [])),
      digitalMarketMessages: deduplicateById(Array.isArray(parsed.digitalMarketMessages) ? parsed.digitalMarketMessages : (defaultStore.digitalMarketMessages || [])),
      digitalMarketRatings: deduplicateById(Array.isArray(parsed.digitalMarketRatings) ? parsed.digitalMarketRatings : (defaultStore.digitalMarketRatings || [])),
      // Preserve legacy service reviews privately; only purchase-verified ratings are public.
      digitalMarketServiceReviews: Array.isArray(parsed.digitalMarketServiceReviews) ? parsed.digitalMarketServiceReviews : (defaultStore.digitalMarketServiceReviews || []),
      verificationTeams: deduplicateById(Array.isArray(parsed.verificationTeams) ? parsed.verificationTeams : (defaultStore.verificationTeams || [])),
      verificationInspections: deduplicateById(Array.isArray(parsed.verificationInspections) ? parsed.verificationInspections : (defaultStore.verificationInspections || [])),
    };

    console.log(`[PineVela Database] Loaded persistent store: ${result.hostels.length} hostels, ${result.users.length} users, ${result.hostelVerifications.length} verifications`);
    return result;
  } catch (err) {
    if (containingCredentials) throw new DatabasePersistenceError('CONTAINMENT_FAILED', 'Credential containment could not be persisted. Refusing to load exposed sessions. Existing data must be inspected offline.');
    if (err instanceof DatabasePersistenceError) throw err;
    throw new DatabasePersistenceError('INVALID_DATABASE', 'Existing database could not be loaded. Refusing defaults; preserve the file and restore a validated backup offline.');
  }
}

/**
 * Atomically save persistent store to disk
 */
export function savePersistentStore(store: PersistentStore): void {
  protectStoredCredentials(store);
  removeRawSessions(store);
  writer.save(store);
}
