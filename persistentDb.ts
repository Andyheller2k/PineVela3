import fs from 'fs';
import path from 'path';

export interface PersistentStore {
  hostels: any[];
  bookingRequests: any[];
  issueReports: any[];
  activities: any[];
  hostelVerifications: any[];
  managerRegistrationRequests: any[];
  managerVerifications?: any[];
  managerRequests?: any[];
  verificationAuditLogs: any[];
  users: any[];
  notifications: any[];
  chatMessages: any[];
  dmRooms: any[];
  chatProfiles: any[];
  boardRequests?: any[];
  meetings?: any[];
  ratings?: any[];
  managerAccountSettings?: Record<string, any>;
  staff?: any[];
  staffApplications?: any[];
  staffAuditLogs?: any[];
  staffChatRooms?: any[];
  staffChatMessages?: any[];
  staffReviews?: any[];
  jobOffers?: any[];
  staffBargains?: any[];
  roomKeys?: any[];
  keyDispatches?: any[];
  studentMessages?: any[];
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
  digitalMarketOrders?: any[];
  digitalMarketMessages?: any[];
  digitalMarketRatings?: any[];
  digitalMarketServiceReviews?: any[];
  verificationTeams?: any[];
  verificationInspections?: any[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'pinevela_store.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function deduplicateById<T extends { id?: any; email?: any }>(arr: T[]): T[] {
  if (!Array.isArray(arr)) return [];
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  return arr.filter(item => {
    if (!item) return false;
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
  ensureDataDir();

  if (!fs.existsSync(STORE_PATH)) {
    try {
      savePersistentStore(defaultStore);
      console.log('[PineVela Database] Initialized local persistent store at:', STORE_PATH);
      return defaultStore;
    } catch (err) {
      console.error('[PineVela Database] Failed to initialize persistent store:', err);
      return defaultStore;
    }
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    
    const result: PersistentStore = {
      hostels: deduplicateById(Array.isArray(parsed.hostels) ? parsed.hostels : defaultStore.hostels),
      bookingRequests: deduplicateById(Array.isArray(parsed.bookingRequests) ? parsed.bookingRequests : defaultStore.bookingRequests),
      issueReports: deduplicateById(Array.isArray(parsed.issueReports) ? parsed.issueReports : defaultStore.issueReports),
      activities: deduplicateById(Array.isArray(parsed.activities) ? parsed.activities : defaultStore.activities),
      hostelVerifications: deduplicateById(Array.isArray(parsed.hostelVerifications) ? parsed.hostelVerifications : defaultStore.hostelVerifications),
      managerRegistrationRequests: deduplicateById(Array.isArray(parsed.managerRegistrationRequests) ? parsed.managerRegistrationRequests : defaultStore.managerRegistrationRequests),
      managerVerifications: deduplicateById(Array.isArray(parsed.managerVerifications) ? parsed.managerVerifications : (defaultStore.managerVerifications || [])),
      managerRequests: deduplicateById(Array.isArray(parsed.managerRequests) ? parsed.managerRequests : (defaultStore.managerRequests || [])),
      verificationAuditLogs: deduplicateById(Array.isArray(parsed.verificationAuditLogs) ? parsed.verificationAuditLogs : defaultStore.verificationAuditLogs),
      users: deduplicateById((Array.isArray(parsed.users) ? parsed.users : defaultStore.users).filter((u: any) => u && u.email !== 'staff@pinevela.com' && u.username !== 'staff')),
      notifications: deduplicateById(Array.isArray(parsed.notifications) ? parsed.notifications : defaultStore.notifications),
      chatMessages: deduplicateById(Array.isArray(parsed.chatMessages) ? parsed.chatMessages : defaultStore.chatMessages),
      dmRooms: deduplicateById(Array.isArray(parsed.dmRooms) ? parsed.dmRooms : defaultStore.dmRooms),
      chatProfiles: deduplicateById(Array.isArray(parsed.chatProfiles) ? parsed.chatProfiles : defaultStore.chatProfiles),
      boardRequests: deduplicateById(Array.isArray(parsed.boardRequests) ? parsed.boardRequests : (defaultStore.boardRequests || [])),
      meetings: deduplicateById(Array.isArray(parsed.meetings) ? parsed.meetings : (defaultStore.meetings || [])),
      managerAccountSettings: (parsed.managerAccountSettings && typeof parsed.managerAccountSettings === 'object') ? parsed.managerAccountSettings : (defaultStore.managerAccountSettings || {}),
      staff: deduplicateById(Array.isArray(parsed.staff) ? parsed.staff : (defaultStore.staff || [])),
      staffApplications: deduplicateById(Array.isArray(parsed.staffApplications) ? parsed.staffApplications : (defaultStore.staffApplications || [])),
      staffAuditLogs: deduplicateById(Array.isArray(parsed.staffAuditLogs) ? parsed.staffAuditLogs : (defaultStore.staffAuditLogs || [])),
      staffChatRooms: deduplicateById(Array.isArray(parsed.staffChatRooms) ? parsed.staffChatRooms : (defaultStore.staffChatRooms || [])),
      staffChatMessages: deduplicateById(Array.isArray(parsed.staffChatMessages) ? parsed.staffChatMessages : (defaultStore.staffChatMessages || [])),
      staffReviews: deduplicateById(Array.isArray(parsed.staffReviews) ? parsed.staffReviews : (defaultStore.staffReviews || [])),
      jobOffers: deduplicateById(Array.isArray(parsed.jobOffers) ? parsed.jobOffers : (defaultStore.jobOffers || [])),
      roomKeys: deduplicateById(Array.isArray(parsed.roomKeys) ? parsed.roomKeys : (defaultStore.roomKeys || [])),
      studentMessages: deduplicateById(Array.isArray(parsed.studentMessages) ? parsed.studentMessages : (defaultStore.studentMessages || [])),
      platformSettings: parsed.platformSettings || defaultStore.platformSettings,
      managerRestrictions: deduplicateById(Array.isArray(parsed.managerRestrictions) ? parsed.managerRestrictions : (defaultStore.managerRestrictions || [])),
      digitalMarketApplications: deduplicateById(Array.isArray(parsed.digitalMarketApplications) ? parsed.digitalMarketApplications : (defaultStore.digitalMarketApplications || [])),
      digitalMarketStores: deduplicateById(Array.isArray(parsed.digitalMarketStores) ? parsed.digitalMarketStores : (defaultStore.digitalMarketStores || [])),
      digitalMarketProducts: deduplicateById(Array.isArray(parsed.digitalMarketProducts) ? parsed.digitalMarketProducts : (defaultStore.digitalMarketProducts || [])),
      digitalMarketOrders: deduplicateById(Array.isArray(parsed.digitalMarketOrders) ? parsed.digitalMarketOrders : (defaultStore.digitalMarketOrders || [])),
      digitalMarketMessages: deduplicateById(Array.isArray(parsed.digitalMarketMessages) ? parsed.digitalMarketMessages : (defaultStore.digitalMarketMessages || [])),
      digitalMarketRatings: deduplicateById(Array.isArray(parsed.digitalMarketRatings) ? parsed.digitalMarketRatings : (defaultStore.digitalMarketRatings || [])),
      verificationTeams: deduplicateById(Array.isArray(parsed.verificationTeams) ? parsed.verificationTeams : (defaultStore.verificationTeams || [])),
      verificationInspections: deduplicateById(Array.isArray(parsed.verificationInspections) ? parsed.verificationInspections : (defaultStore.verificationInspections || [])),
    };

    console.log(`[PineVela Database] Loaded persistent store: ${result.hostels.length} hostels, ${result.users.length} users, ${result.hostelVerifications.length} verifications`);
    return result;
  } catch (err) {
    console.error('[PineVela Database] Error reading persistent store, falling back to defaults:', err);
    return defaultStore;
  }
}

/**
 * Atomically save persistent store to disk
 */
export function savePersistentStore(store: PersistentStore): void {
  ensureDataDir();
  const tmpPath = `${STORE_PATH}.tmp.${Date.now()}`;
  try {
    const jsonStr = JSON.stringify(store, null, 2);
    fs.writeFileSync(tmpPath, jsonStr, 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('[PineVela Database] Failed to write persistent store:', err);
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (e) {
      // ignore
    }
  }
}
