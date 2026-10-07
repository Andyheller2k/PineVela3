import crypto from "crypto";
import { ResourceLimitError } from './resourceSecurity.js';
import { loadPersistentStore, savePersistentStore, PersistentStore } from "./persistentDb.js";

// Helper to generate UUIDs
export function generateUUID(): string {
  return crypto.randomUUID();
}

// Memory store initialized from disk
let memoryStore: PersistentStore | null = null;

export function getStoreInstance(defaults?: Partial<PersistentStore> | any): PersistentStore {
  return getStore(defaults);
}

export function getStore(defaults?: Partial<PersistentStore> | any): PersistentStore {
  if (!memoryStore) {
    const emptyDefault: PersistentStore = {
      hostels: defaults?.hostels || [],
      issueReports: [],
      activities: [],
      hostelVerifications: [],
      managerRegistrationRequests: [],
      verificationAuditLogs: [],
      users: defaults?.users || [],
      notifications: [], boardRequests: [],
      staff: [],
      staffAuditLogs: [],
      ratings: [],
      staffBargains: [],
      digitalMarketServiceReviews: [],
      onboardingPayments: [],
      managerProfiles: [],
      platformSettings: {
        registrationFee: 3500,
        commission: 5,
        announcement: '',
        maintenanceMode: false
      },
      managerRestrictions: [],
      verificationTeams: defaults?.verificationTeams || [],
      verificationInspections: []
    };
    memoryStore = loadPersistentStore(emptyDefault);
  }
  return memoryStore;
}

export function persistStore(): void {
  if (memoryStore) {
    savePersistentStore(memoryStore);
  }
}

// 0. Settings
export async function dbGetSettings(): Promise<any> {
  const store = getStore();
  return store.platformSettings;
}

export async function dbUpdateSettings(settings: any): Promise<void> {
  const store = getStore();
  store.platformSettings = settings;
  persistStore();
}

// 1. Users / Profiles
export async function dbGetUsers(fallbackUsers?: any[], ..._args: any[]): Promise<any[]> {
  const store = getStore({ hostels: [], users: fallbackUsers || [] });
  if (!store.users || store.users.length === 0) {
    if (fallbackUsers && fallbackUsers.length > 0) {
      store.users = fallbackUsers;
      persistStore();
    }
  }
  return store.users || [];
}

export async function dbGetAllUsersByEmailOrUsername(identifier: string, fallbackUsers?: any[]): Promise<any[]> {
  const store = getStore();
  const storeUsers = await dbGetUsers(fallbackUsers);
  const allCandidates = [
    ...(store.users || []),
    ...(storeUsers || []),
    ...(fallbackUsers || [])
  ];
  
  const raw = (identifier || '').trim();
  if (!raw) return [];

  const normalized = raw.toLowerCase();
  const normalizedClean = raw.toLowerCase().replace(/[^a-z0-9]/g, '');

  const matches: any[] = [];
  const seenIds = new Set<string>();

  for (const u of allCandidates) {
    if (!u) continue;

    // Direct object or nested .user property
    const userObj = u.user || u;
    const email = (u.email || userObj.email || '').toLowerCase().trim();
    const username = (u.username || userObj.username || '').toLowerCase().trim();
    const id = (u.id || userObj.id || '').toLowerCase().trim();
    const studentId = (u.studentId || userObj.studentId || u.residentId || userObj.residentId || '').toLowerCase().trim();
    const phone = (u.phone || userObj.phone || '').toLowerCase().trim();
    const roomKey = (u.roomKey || userObj.roomKey || '').toLowerCase().trim();

    const usernameClean = username.replace(/[^a-z0-9]/g, '');
    const studentIdClean = studentId.replace(/[^a-z0-9]/g, '');

    const candidateRole = (u.role || userObj.role || 'user').toLowerCase().trim();
    const candidateUniqueId = userObj.id || u.id || '';
    const candidatePass = userObj.password || u.password || userObj.plainPassword || u.plainPassword || '';
    const candidateKey = `${candidateUniqueId}_${candidateRole}_${candidatePass}_${email}_${username}_${studentId}`;

    // Exact matches
    if (
      (email && email === normalized) ||
      (username && username === normalized) ||
      (id && id === normalized) ||
      (studentId && studentId === normalized) ||
      (phone && phone === normalized) ||
      (roomKey && roomKey === normalized)
    ) {
      if (!seenIds.has(candidateKey)) {
        seenIds.add(candidateKey);
        matches.push(u);
      }
      continue;
    }

    // Cleaned alphanumeric matches (for student IDs with/without hyphens e.g. STU-2024-8842 vs STU20248842)
    if (normalizedClean && normalizedClean.length > 2) {
      if (
        (studentIdClean && studentIdClean === normalizedClean) ||
        (usernameClean && usernameClean === normalizedClean)
      ) {
        if (!seenIds.has(candidateKey)) {
          seenIds.add(candidateKey);
          matches.push(u);
        }
      }
    }
  }

  return matches;
}

export async function dbGetUserByEmailOrUsername(identifier: string, fallbackUsers?: any[], expectedRole?: string): Promise<any | null> {
  const matches = await dbGetAllUsersByEmailOrUsername(identifier, fallbackUsers);
  if (matches.length === 0) return null;

  if (expectedRole) {
    const roleNormalized = expectedRole.toLowerCase().trim();
    const roleMatch = matches.find((u: any) => {
      const r = (u.user?.role || u.role || '').toLowerCase().trim();
      return r === roleNormalized;
    });
    if (roleMatch) return roleMatch;
  }

  return matches[0];
}

// 2. Hostels
export async function dbGetHostels(fallbackHostels?: any[], ..._args: any[]): Promise<any[]> {
  const store = getStore({ hostels: fallbackHostels || [], users: [] });
  if (!store.hostels || store.hostels.length === 0) {
    if (fallbackHostels && fallbackHostels.length > 0) {
      store.hostels = fallbackHostels;
      persistStore();
    }
  }
  return store.hostels || [];
}

export async function dbCreateHostel(hostelData: any, fallbackHostels?: any[], ..._args: any[]): Promise<any> {
  const store = getStore({ hostels: fallbackHostels || [], users: [] });
  const id = hostelData.id || generateUUID();
  const newHostel = {
    ...hostelData,
    id,
    registrationDate: hostelData.registrationDate || new Date().toISOString().split('T')[0],
    subscriptionPaid: true,
    isApproved: hostelData.isApproved ?? false,
    approvalStatus: hostelData.approvalStatus || 'Pending Approval'
  };
  
  // Replace or append
  const idx = store.hostels.findIndex((h: any) => h.id === id);
  if (idx >= 0) {
    store.hostels[idx] = newHostel;
  } else {
    store.hostels.unshift(newHostel);
  }
  persistStore();
  return newHostel;
}

export async function dbUpdateHostel(id: string, updates: any, fallbackHostels?: any[], ..._args: any[]): Promise<any> {
  const store = getStore({ hostels: fallbackHostels || [], users: [] });
  const idx = store.hostels.findIndex((h: any) => h.id === id);
  if (idx >= 0) {
    store.hostels[idx] = { ...store.hostels[idx], ...updates, id };
    persistStore();
    return store.hostels[idx];
  }
  return null;
}

// 4. Issue Reports
export async function dbGetIssueReports(fallbackIssues?: any[], ..._args: any[]): Promise<any[]> {
  const store = getStore();
  if (!store.issueReports || store.issueReports.length === 0) {
    if (fallbackIssues && fallbackIssues.length > 0) {
      store.issueReports = fallbackIssues;
      persistStore();
    }
  }
  return store.issueReports || [];
}

export async function dbCreateIssueReport(issueData: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  const id = issueData.id || `issue-${Date.now()}`;
  const newIssue = { ...issueData, id, createdAt: new Date().toISOString() };
  if (!store.issueReports) store.issueReports = [];
  store.issueReports.unshift(newIssue);
  persistStore();
  return newIssue;
}

export async function dbUpdateIssueReport(id: string, updates: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!store.issueReports) store.issueReports = [];
  const issue = store.issueReports.find((i: any) => i.id === id);
  if (issue) {
    Object.assign(issue, updates);
    persistStore();
    return issue;
  }
  return { id, ...updates };
}

// 5. Staff
export async function dbGetStaff(hostelId?: string | any[], ..._args: any[]): Promise<any[]> {
  const store = getStore();
  const staffList = (store as any).staff || [];
  if (typeof hostelId === 'string') {
    return staffList.filter((s: any) => s.hostelId === hostelId);
  }
  return staffList;
}

export async function dbCreateStaff(staffData: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!(store as any).staff) (store as any).staff = [];
  const newStaff = { ...staffData, id: staffData.id || `staff-${Date.now()}` };
  const existingIdx = (store as any).staff.findIndex((s: any) => 
    s.id === newStaff.id || 
    (s.email && newStaff.email && s.email.toLowerCase() === newStaff.email.toLowerCase() && s.hostelId === newStaff.hostelId)
  );
  if (existingIdx !== -1) {
    (store as any).staff[existingIdx] = { ...(store as any).staff[existingIdx], ...newStaff };
  } else {
    (store as any).staff.unshift(newStaff);
  }
  persistStore();
  return newStaff;
}

export async function dbUpdateStaff(id: string, updates: any): Promise<any> {
  const store = getStore();
  if (!(store as any).staff) (store as any).staff = [];
  const index = (store as any).staff.findIndex((s: any) => s.id === id || s.userId === id || (s.email && updates.email && s.email.toLowerCase() === updates.email.toLowerCase()));
  if (index !== -1) {
    (store as any).staff[index] = { ...(store as any).staff[index], ...updates, updatedAt: new Date().toISOString() };
    persistStore();
    return (store as any).staff[index];
  }
  return null;
}

export async function dbDeleteStaff(id: string, ..._args: any[]): Promise<boolean> {
  const store = getStore();
  if ((store as any).staff) {
    (store as any).staff = (store as any).staff.filter((s: any) => s.id !== id && s.userId !== id);
    persistStore();
  }
  return true;
}

export async function dbGetStaffAuditLogs(): Promise<any[]> {
  const store = getStore();
  return (store as any).staffAuditLogs || [];
}

export async function dbLogStaffAudit(logEntry: any): Promise<void> {
  const store = getStore();
  if (!(store as any).staffAuditLogs) (store as any).staffAuditLogs = [];
  (store as any).staffAuditLogs.unshift({
    id: `staff-audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...logEntry
  });
  persistStore();
}

// 6. Meetings
export async function dbGetMeetings(..._args: any[]): Promise<any[]> {
  const store = getStore();
  return (store as any).meetings || [];
}

export async function dbCreateMeeting(meetingData: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!(store as any).meetings) (store as any).meetings = [];
  const newMeeting = { ...meetingData, id: meetingData.id || `meet-${Date.now()}` };
  (store as any).meetings.push(newMeeting);
  persistStore();
  return newMeeting;
}

export async function dbUpdateMeeting(id: string, updates: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if ((store as any).meetings) {
    const m = (store as any).meetings.find((item: any) => item.id === id);
    if (m) {
      Object.assign(m, updates);
      persistStore();
      return m;
    }
  }
  return { id, ...updates };
}

export async function dbDeleteMeeting(id: string, ..._args: any[]): Promise<boolean> {
  const store = getStore();
  if ((store as any).meetings) {
    const idx = (store as any).meetings.findIndex((item: any) => item.id === id);
    if (idx !== -1) {
      (store as any).meetings.splice(idx, 1);
      persistStore();
      return true;
    }
  }
  return false;
}

const currentManagerNotifications = (settings: any) => Object.fromEntries(
  ['emailAlerts', 'smsAlerts', 'maintenanceTicketAlerts', 'meetingRequestAlerts'].filter(key => key in (settings || {})).map(key => [key, settings[key]])
);

export async function dbGetManagerAccountSettings(managerId: string): Promise<any> {
  const store = getStore();
  if (!store.managerAccountSettings) store.managerAccountSettings = {};
  const existing = store.managerAccountSettings[managerId];
  if (existing) return { ...existing, notifications: currentManagerNotifications(existing.notifications) };

  const defaults = {
    managerId,
    notifications: {
      emailAlerts: true,
      smsAlerts: true,
      maintenanceTicketAlerts: true,
      meetingRequestAlerts: true
    },
    security: {
      twoFactorAuth: false,
      sessionTimeoutMinutes: 60,
      requirePasswordForPayouts: true
    },
    meetingAvailability: {
      allowStudentBookings: true,
      allowStaffBookings: true,
      workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      officeHoursStart: "09:00",
      officeHoursEnd: "17:00",
      slotDurationMinutes: 30,
      meetingModes: ["In-Person (Admin Office)", "Google Meet / Video", "Phone Call"],
      autoConfirmMeetings: false,
      officeLocation: "Hostel Admin Office (Room 101)"
    },
    emergencyContact: {
      contactName: "Facility Emergency Lead",
      contactPhone: "+233 24 000 0000",
      contactRelation: "Duty Supervisor"
    }
  };
  store.managerAccountSettings[managerId] = defaults;
  persistStore();
  return defaults;
}

export async function dbUpdateManagerAccountSettings(managerId: string, updates: any): Promise<any> {
  const store = getStore();
  if (!store.managerAccountSettings) store.managerAccountSettings = {};
  const current = await dbGetManagerAccountSettings(managerId);
  const updated = {
    ...current,
    ...updates,
    managerId,
    notifications: {
      ...(current.notifications || {}),
      ...(updates.notifications || {})
    },
    security: {
      ...(current.security || {}),
      ...(updates.security || {})
    },
    meetingAvailability: {
      ...(current.meetingAvailability || {}),
      ...(updates.meetingAvailability || {})
    },
    emergencyContact: {
      ...(current.emergencyContact || {}),
      ...(updates.emergencyContact || {})
    }
  };
  updated.notifications = currentManagerNotifications(updated.notifications);
  store.managerAccountSettings[managerId] = updated;
  persistStore();
  return updated;
}

// 7. Notifications
export async function dbGetNotifications(userId?: string | any[], ..._args: any[]): Promise<any[]> {
  const store = getStore();
  if (!store.notifications) store.notifications = [];
  if (typeof userId === 'string') {
    return store.notifications.filter((n: any) => n.userId === userId || !n.userId);
  }
  return store.notifications;
}

export async function dbCreateNotification(notifData: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!store.notifications) store.notifications = [];
  const newNotif = { 
    ...notifData, 
    id: notifData.id || `notif-${Date.now()}`, 
    isRead: notifData.isRead ?? notifData.read ?? false, 
    read: notifData.read ?? notifData.isRead ?? false, 
    createdAt: new Date().toISOString() 
  };
  store.notifications.unshift(newNotif);
  persistStore();
  return newNotif;
}

export async function dbMarkNotificationRead(id: string, readerKey: string): Promise<any> {
  const store = getStore();
  if (store.notifications) {
    const n = store.notifications.find((item: any) => item.id === id);
    if (n) {
      n.readBy = Array.from(new Set([...(Array.isArray(n.readBy) ? n.readBy : []), readerKey]));
      persistStore();
      return n;
    }
  }
  return undefined;
}

// 8. Ratings
export async function dbGetRatings(hostelId?: string | any[], ..._args: any[]): Promise<any[]> {
  const store = getStore();
  const ratings = (store as any).ratings || [];
  if (typeof hostelId === 'string') {
    return ratings.filter((r: any) => r.hostelId === hostelId);
  }
  return ratings;
}

export async function dbCreateRating(ratingData: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!(store as any).ratings) (store as any).ratings = [];
  const newRating = { ...ratingData, id: ratingData.id || `rating-${Date.now()}`, createdAt: new Date().toISOString() };
  (store as any).ratings.push(newRating);
  persistStore();
  return newRating;
}

// 9. Activities
export async function dbGetActivities(fallbackActivities?: any[], ..._args: any[]): Promise<any[]> {
  const store = getStore();
  if (!store.activities || store.activities.length === 0) {
    if (fallbackActivities && fallbackActivities.length > 0) {
      store.activities = fallbackActivities;
      persistStore();
    }
  }
  return store.activities || [];
}

export async function dbCreateActivity(activityData: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!store.activities) store.activities = [];
  const newAct = { ...activityData, id: activityData.id || `act-${Date.now()}`, timestamp: activityData.timestamp || 'Just now' };
  store.activities.unshift(newAct);
  persistStore();
  return newAct;
}

// 13. Atomic Hostel Registration
export async function dbRegisterHostelAtomic(registrationPayload: any, fallbackHostels?: any[], ..._args: any[]): Promise<any> {
  const store = getStore({ hostels: fallbackHostels || [], users: [] });
  const hostelId = registrationPayload.hostelId || registrationPayload.id || generateUUID();
  
  const resolvedName = registrationPayload.name || registrationPayload.hostelName || 'Registered Hostel';
  const resolvedImage = registrationPayload.imageUrl || registrationPayload.image || registrationPayload.exteriorPhotoUrl || registrationPayload.imagePreviewUrl || (Array.isArray(registrationPayload.images) && registrationPayload.images[0]) || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80';
  const resolvedLocation = registrationPayload.location || (registrationPayload.addressLine1 ? `${registrationPayload.addressLine1}, ${registrationPayload.city || 'Accra'}` : (registrationPayload.address || registrationPayload.city || 'Accra, Ghana'));
  const resolvedCapacity = Number(registrationPayload.maximumCapacity || registrationPayload.totalCapacity || registrationPayload.totalBeds || 100);
  const resolvedManagerPhoto = registrationPayload.managerPhoto || registrationPayload.managerAvatar || registrationPayload.avatar || registrationPayload.photo || '';

  const hostelRecord = {
    id: hostelId,
    name: resolvedName,
    location: resolvedLocation,
    wing: registrationPayload.wing || (registrationPayload.blocksList?.[0]?.name ? registrationPayload.blocksList[0].name : 'North Wing'),
    status: registrationPayload.status || 'Pending Approval',
    bedsLeft: resolvedCapacity,
    totalCapacity: resolvedCapacity,
    availableSpaces: resolvedCapacity,
    image: resolvedImage,
    imageUrl: resolvedImage,
    exteriorPhotoUrl: resolvedImage,
    imagePreviewUrl: resolvedImage,
    managerName: registrationPayload.managerName || 'Property Manager',
    managerPhone: registrationPayload.managerPhone || '+233 24 000 0000',
    managerEmail: registrationPayload.managerEmail || '',
    managerPhoto: resolvedManagerPhoto,
    managerId: registrationPayload.managerId || registrationPayload.assignedManagerId,
    description: registrationPayload.description || 'Hostel property profile and configurations.',
    rating: 5.0,
    registrationDate: new Date().toISOString().split('T')[0],
    subscriptionPaid: registrationPayload.subscriptionPaid === true,
    isApproved: Boolean(registrationPayload.isApproved),
    approvalStatus: registrationPayload.approvalStatus || (registrationPayload.isApproved ? 'Approved' : 'Pending Approval'),
    blocksList: registrationPayload.blocksList || [],
    pricingTiers: registrationPayload.pricingTiers || [],
    campusProximity: registrationPayload.campusProximity || '5-10 Mins Walk',
    campusProximityDetails: registrationPayload.campusProximityDetails || 'Shuttle & walking routes',
    gallery: registrationPayload.gallery || (registrationPayload.imageUrl ? [registrationPayload.imageUrl] : []),
    contact_phone: registrationPayload.contactPhone,
    contact_phone_country: registrationPayload.contactPhoneCountry,
    contact_email: registrationPayload.contactEmail || '',
    hostel_type: registrationPayload.hostelType || registrationPayload.hostel_type || 'Hostel'
  };

  const existingIdx = store.hostels.findIndex((h: any) => h.id === hostelId || (h.managerEmail && registrationPayload.managerEmail && h.managerEmail.toLowerCase() === registrationPayload.managerEmail.toLowerCase()));
  if (existingIdx >= 0) throw Object.assign(new Error('This hostel already exists. Use its authorized edit route.'), { status: 409 });
  store.hostels.unshift(hostelRecord);

  // Create verification entry
  const verifRecord = {
    id: `verif-${hostelId}`,
    hostelId,
    hostelName: hostelRecord.name,
    managerName: hostelRecord.managerName,
    managerEmail: hostelRecord.managerEmail,
    managerPhone: hostelRecord.managerPhone,
    managerPhoto: hostelRecord.managerPhoto,
    imageUrl: hostelRecord.imageUrl,
    image: hostelRecord.image,
    location: hostelRecord.location,
    totalCapacity: hostelRecord.totalCapacity,
    status: hostelRecord.isApproved ? 'Approved' : 'Pending Approval',
    submittedAt: new Date().toISOString()
  };
  if (!store.hostelVerifications) store.hostelVerifications = [];
  store.hostelVerifications.unshift(verifRecord);

  persistStore();
  return { hostel: hostelRecord, verification: verifRecord };
}

export async function dbCleanupPlaceholderHostels(fallbackHostels?: any[], ..._args: any[]): Promise<void> {
  const store = getStore({ hostels: fallbackHostels || [], users: [] });
  // Ensure invalid or blank entries are pruned
  if (Array.isArray(store.hostels)) {
    store.hostels = store.hostels.filter((h: any) => h && h.name);
    persistStore();
  }
}

// 14. Manager Requests & Profiles
export async function dbSaveManagerProfile(profile: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!store.managerProfiles) store.managerProfiles = [];
  const idx = store.managerProfiles.findIndex((p: any) => p.email === profile.email);
  if (idx >= 0) {
    store.managerProfiles[idx] = { ...store.managerProfiles[idx], ...profile };
  } else {
    store.managerProfiles.push(profile);
  }
  persistStore();
  return profile;
}

export async function dbGetManagerRequests(..._args: any[]): Promise<any[]> {
  const store = getStore();
  const list = store.managerRegistrationRequests || [];
  const seenIds = new Set<string>();
  const uniqueList: any[] = [];
  for (const item of list) {
    if (item && item.id) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniqueList.push(item);
      }
    }
  }
  return uniqueList;
}

export async function dbCreateManagerRequest(req: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!store.managerRegistrationRequests) store.managerRegistrationRequests = [];
  const id = req.id || `mreq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newReq = { ...req, id, submittedAt: req.submittedAt || new Date().toISOString() };
  
  // Replace if exists, else unshift
  const existingIdx = store.managerRegistrationRequests.findIndex((m: any) => m.id === id || (req.managerId && m.managerId === req.managerId));
  if (existingIdx >= 0) {
    store.managerRegistrationRequests[existingIdx] = { ...store.managerRegistrationRequests[existingIdx], ...newReq };
  } else {
    store.managerRegistrationRequests.unshift(newReq);
  }
  persistStore();
  return newReq;
}

export async function dbUpdateManagerRequestStatus(id: string, status: string, notes?: string, ..._args: any[]): Promise<any> {
  const store = getStore();
  const req = store.managerRegistrationRequests.find((m: any) => m.id === id || m.managerId === id);
  if (req) {
    req.status = status;
    req.adminNotes = notes;
    if (status === 'blocked') {
      req.isBlocked = true;
      req.isApproved = false;
      req.blockReason = notes;
    } else if (status === 'approved') {
      req.isBlocked = false;
      req.isApproved = true;
      req.blockReason = null;
    }
    persistStore();
    return req;
  }
  return { id, status, notes };
}

// 15. Manager & Hostel Verifications
export async function dbGetManagerVerifications(..._args: any[]): Promise<any[]> {
  const store = getStore();
  return (store as any).managerVerifications || [];
}

export async function dbCreateManagerVerification(verif: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!(store as any).managerVerifications) (store as any).managerVerifications = [];
  const newVerif = { ...verif, id: verif.id || `mverif-${Date.now()}`, createdAt: new Date().toISOString() };
  (store as any).managerVerifications.unshift(newVerif);
  persistStore();
  return newVerif;
}

export async function dbUpdateManagerVerificationStatus(id: string, status: string, notes?: string, ..._args: any[]): Promise<any> {
  const store = getStore();
  const list = (store as any).managerVerifications || [];
  const rec = list.find((m: any) => m.id === id || m.managerId === id);
  if (rec) {
    rec.status = status;
    rec.adminNotes = notes;
    if (status === 'blocked') {
      rec.isBlocked = true;
      rec.isApproved = false;
      rec.blockReason = notes;
    } else if (status === 'approved') {
      rec.isBlocked = false;
      rec.isApproved = true;
      rec.blockReason = null;
    }
    persistStore();
    return rec;
  }
  return { id, status, notes };
}

export async function dbGetHostelVerifications(..._args: any[]): Promise<any[]> {
  const store = getStore();
  return store.hostelVerifications || [];
}

export async function dbCreateHostelVerification(verif: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!store.hostelVerifications) store.hostelVerifications = [];
  const newVerif = { ...verif, id: verif.id || `hverif-${Date.now()}`, submittedAt: new Date().toISOString() };
  store.hostelVerifications.unshift(newVerif);
  persistStore();
  return newVerif;
}

export async function dbUpdateHostelVerificationStatus(id: string, status: string, notes?: string, ..._args: any[]): Promise<any> {
  const store = getStore();
  const rec = store.hostelVerifications.find((h: any) => h.id === id || h.hostelId === id);
  if (rec) {
    rec.status = status;
    rec.adminNotes = notes;
    persistStore();
    return rec;
  }
  return { id, status, notes };
}

// Helper for users array saving
export async function dbSaveUsers(users: any[]): Promise<any[]> {
  const store = getStore();
  store.users = users;
  persistStore();
  return store.users;
}

export async function dbCreateVerificationAuditLog(log: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!store.verificationAuditLogs) store.verificationAuditLogs = [];
  const newLog = { ...log, id: log.id || `audit-${Date.now()}`, createdAt: new Date().toISOString() };
  store.verificationAuditLogs.unshift(newLog);
  persistStore();
  return newLog;
}

export async function dbGetVerificationAuditLogs(..._args: any[]): Promise<any[]> {
  const store = getStore();
  return store.verificationAuditLogs || [];
}

export async function dbCreateOnboardingPayment(payment: any, ..._args: any[]): Promise<any> {
  const store = getStore();
  if (!store.onboardingPayments) store.onboardingPayments = [];
  const newPayment = { ...payment, id: payment.id || `pay-${Date.now()}`, timestamp: new Date().toISOString() };
  store.onboardingPayments.unshift(newPayment);
  persistStore();
  return newPayment;
}

export async function dbAssignHostelManager(hostelId: string, managerId: string, managerName?: string, managerEmail?: string, managerPhone?: string, ..._args: any[]): Promise<any> {
  const store = getStore();
  const hostel = store.hostels.find((h: any) => h.id === hostelId);
  if (hostel) {
    hostel.managerId = managerId;
    if (managerName) hostel.managerName = managerName;
    if (managerEmail) hostel.managerEmail = managerEmail;
    if (managerPhone) hostel.managerPhone = managerPhone;
    persistStore();
    return hostel;
  }
  return { id: hostelId, managerId };
}

export async function dbDeleteHostel(id: string): Promise<boolean> {
  const store = getStore();
  const initialLen = store.hostels.length;
  store.hostels = store.hostels.filter((h: any) => h.id !== id);
  persistStore();
  return store.hostels.length < initialLen;
}

export async function dbGetBoardRequests(): Promise<any[]> {
  const store = getStore();
  if (!store.boardRequests) store.boardRequests = [];
  return store.boardRequests;
}

export async function dbCreateBoardRequest(requestData: any): Promise<any> {
  const store = getStore();
  if (!store.boardRequests) store.boardRequests = [];
  const newReq = {
    id: requestData.id || `req-board-${Date.now()}`,
    managerId: requestData.managerId || '',
    managerName: requestData.managerName || 'Resident Manager',
    managerEmail: requestData.managerEmail || '',
    managerPhone: requestData.managerPhone || '+233 24 123 4567',
    managerPhoto: requestData.managerPhoto || '',
    hostelName: requestData.hostelName || 'Registered Property',
    category: requestData.category || 'General Inquiry',
    priority: requestData.priority || 'Normal',
    subject: requestData.subject || 'Manager Operational Request',
    message: requestData.message || '',
    status: requestData.status || 'Pending',
    adminNotes: requestData.adminNotes || '',
    createdAt: new Date().toISOString()
  };
  store.boardRequests.unshift(newReq);
  persistStore();
  return newReq;
}

export async function dbUpdateBoardRequest(id: string, updates: any): Promise<any> {
  const store = getStore();
  if (!store.boardRequests) store.boardRequests = [];
  const idx = store.boardRequests.findIndex((r: any) => r.id === id);
  if (idx >= 0) {
    store.boardRequests[idx] = {
      ...store.boardRequests[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    persistStore();
    return store.boardRequests[idx];
  }
  return null;
}

// ==========================================
// 12. DIGITAL ROOM KEYS & STUDENT ACCESS
// ==========================================

export function generateHostelRoomKeyCode(hostelName: string, blockNameOrInitial: string): string {
  // Extract a clean prominent prefix from the hostel name
  const words = (hostelName || 'Pinevela').replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
  let prefix = '';
  if (words.length > 1) {
    const significant = words.find(w => !['the', 'hotel', 'hostel', 'residence', 'hall', 'heights', 'villa', 'lodge'].includes(w.toLowerCase())) || words[0];
    prefix = significant.toUpperCase().slice(0, 5);
  } else {
    prefix = (words[0] || 'PINE').toUpperCase().slice(0, 5);
  }
  if (prefix.length < 3) prefix = (prefix + 'VELA').slice(0, 4);

  // Extract block initial: e.g. "Block A" -> "A", "Block B" -> "B", "Floor 1" -> "F1"
  const cleanBlock = (blockNameOrInitial || 'A').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  let blockCode = 'A';
  if (cleanBlock.startsWith('BLOCK') && cleanBlock.length > 5) {
    blockCode = cleanBlock.substring(5);
  } else if (cleanBlock) {
    blockCode = cleanBlock.slice(0, 3);
  }

  // 6 randomly generated digits
  const random6 = crypto.randomInt(100000, 1000000).toString();

  return `${prefix}-${blockCode}-${random6}`;
}

export async function dbGenerateHostelRoomKeys(hostel: any): Promise<any[]> {
  const store = getStore();
  if (!store.roomKeys) store.roomKeys = [];

  const hostelId = hostel.id;
  const hostelName = hostel.name || 'PineVela Residence';

  // Determine blocks configuration from blocksList, blocks, or default synthesis
  let blocks = hostel.blocksList || hostel.blocks || [];
  if (!Array.isArray(blocks) || blocks.length === 0) {
    const totalRooms = hostel.totalRooms || hostel.roomsAvailable || 30;
    blocks = [
      { name: 'Block A (Alpha)', blockName: 'Block A (Alpha)', totalRooms: Math.min(totalRooms, 30), startNum: 101, roomPrefix: 'A' },
      { name: 'Block B (Beta)', blockName: 'Block B (Beta)', totalRooms: Math.max(10, Math.floor(totalRooms / 2)), startNum: 201, roomPrefix: 'B' }
    ];
  }

  const generatedKeys: any[] = [];

  // Bound client-controlled generation before mutating keys or entering nested loops.
  const counts = blocks.map((block: any) => Number(block.totalRooms || block.rooms || 20));
  if (hostelName.length > 200 || blocks.length > 100 || counts.some((count: number) => !Number.isSafeInteger(count) || count < 1) || counts.reduce((sum: number, count: number) => sum + count, 0) > 2000 || blocks.some((block: any, idx: number) => {
    const name = block.name || block.blockName || '', prefix = block.roomPrefix || '';
    const start = Number(block.startNum || (idx + 1) * 100 + 1);
    return typeof name !== 'string' || name.length > 120 || typeof prefix !== 'string' || prefix.length > 16 || !Number.isSafeInteger(start) || start < 1 || start > 1000000;
  })) {
    throw new ResourceLimitError(413, 60, 'A residence may generate at most 2,000 rooms across 100 blocks per operation.');
  }
  const existingRooms = new Set(store.roomKeys.filter((r: any) => r.hostelId === hostelId).map((r: any) => `${String(r.blockName || '').toLowerCase()}\0${r.roomNumber}`));
  const reservedCodes = new Set([...(store.roomKeys || []).map((r: any) => r.roomKey), ...(store.retiredRoomKeys || [])]);

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    const blockName = block.name || block.blockName || `Block ${String.fromCharCode(65 + idx)}`;
    const roomCount = counts[idx];
    const startNum = Number(block.startNum || (idx + 1) * 100 + 1);
    const defaultPrefix = String.fromCharCode(65 + idx);
    const roomPrefix = block.roomPrefix || defaultPrefix;

    for (let i = 0; i < roomCount; i++) {
      const roomNum = `${roomPrefix}-${startNum + i}`;
      const roomIdentity = `${blockName.toLowerCase()}\0${roomNum}`;
      if (!existingRooms.has(roomIdentity)) {
        let keyVal: string | undefined;
        for (let attempt = 0; attempt < 32; attempt++) {
          const candidate = generateHostelRoomKeyCode(hostelName, blockName);
          if (!reservedCodes.has(candidate)) { keyVal = candidate; break; }
        }
        if (!keyVal) throw new ResourceLimitError(503, 60, 'Room-key capacity is busy. Contact an administrator.');
        reservedCodes.add(keyVal); existingRooms.add(roomIdentity);
        const newKey = {
          id: `rk-${hostelId}-${blockName.replace(/[^a-zA-Z0-9]/g, '_')}-${roomNum}`,
          hostelId,
          hostelName,
          blockName,
          blockInitial: roomPrefix || blockName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'A',
          roomNumber: roomNum,
          floor: Math.floor(i / 10) + 1,
          roomKey: keyVal,
          isAssigned: false,
          status: 'Available',
          createdAt: new Date().toISOString()
        };
        generatedKeys.push(newKey);
      }
    }
  }

  if (generatedKeys.length) { store.roomKeys.push(...generatedKeys); persistStore(); }
  return generatedKeys;
}

export async function dbRecordRoomKeyDispatch(roomKey: string, dispatchInfo: {
  recipientEmail?: string;
  recipientPhone?: string;
  recipientName?: string;
  customNote?: string;
  senderManagerId?: string;
  senderManagerName?: string;
  [key: string]: any;
}): Promise<any> {
  const store = getStore();
  if (!store.roomKeys) store.roomKeys = [];
  if (!store.keyDispatches) store.keyDispatches = [];

  const normalized = (roomKey || '').trim().toUpperCase();
  const keyIndex = store.roomKeys.findIndex((rk: any) => rk.roomKey?.trim().toUpperCase() === normalized);

  const dispatchRecord = {
    id: `dispatch-${Date.now()}`,
    roomKey: normalized,
    ...dispatchInfo,
    dispatchedAt: new Date().toISOString()
  };
  store.keyDispatches.unshift(dispatchRecord);

  if (keyIndex >= 0) {
    store.roomKeys[keyIndex].lastDispatchedAt = dispatchRecord.dispatchedAt;
    store.roomKeys[keyIndex].lastDispatchedTo = dispatchInfo.recipientEmail || dispatchInfo.recipientPhone || dispatchInfo.recipientName || 'Resident';
  }

  persistStore();
  return dispatchRecord;
}

// Reads never generate keys. Generation requires an authorized management operation.
export async function dbGetRoomKeys(hostelId?: string): Promise<any[]> {
  const keys = getStore().roomKeys || [];
  return hostelId === undefined ? keys : keys.filter((room: any) => room.hostelId === hostelId);
}

export async function dbGetRoomKeyByCode(code: string): Promise<any | null> {
  const normalized = (code || '').trim().toUpperCase();
  return (getStore().roomKeys || []).find((room: any) => room.roomKey?.trim().toUpperCase() === normalized) || null;
}

export async function dbAssignRoomKey(roomKey: string, studentData: {
  studentId: string;
  studentName: string;
  studentEmail?: string;
  studentPhone?: string;
  assignedResidentType?: string;
  assignedProgram?: string;
  assignedDepartment?: string;
  assignedInstitution?: string;
  [key: string]: any;
}): Promise<any> {
  const store = getStore();
  if (!store.roomKeys) store.roomKeys = [];
  const normalized = (roomKey || '').trim().toUpperCase();

  const idx = store.roomKeys.findIndex((rk: any) => rk.roomKey?.trim().toUpperCase() === normalized);
  if (idx >= 0) {
    if (store.roomKeys[idx].isAssigned || store.roomKeys[idx].status === 'Occupied') {
      throw new Error('This room is already occupied.');
    }
    store.roomKeys[idx] = {
      ...store.roomKeys[idx],
      isAssigned: true,
      status: 'Occupied',
      assignedStudentId: studentData.studentId,
      assignedStudentName: studentData.studentName,
      assignedStudentEmail: studentData.studentEmail,
      assignedStudentPhone: studentData.studentPhone,
      studentId: studentData.studentId,
      residentId: studentData.studentId,
      studentName: studentData.studentName,
      studentEmail: studentData.studentEmail,
      studentPhone: studentData.studentPhone,
      assignedResidentType: studentData.assignedResidentType || 'student',
      assignedProgram: studentData.assignedProgram,
      assignedDepartment: studentData.assignedDepartment,
      assignedInstitution: studentData.assignedInstitution,
      parentUserEmail: studentData.parentUserEmail || store.roomKeys[idx].parentUserEmail,
      parentUserId: studentData.parentUserId || store.roomKeys[idx].parentUserId,
      claimedByUserId: studentData.claimedByUserId || studentData.parentUserId || store.roomKeys[idx].claimedByUserId,
      assignedAt: new Date().toISOString()
    };
    persistStore();
    return store.roomKeys[idx];
  }
  return null;
}
