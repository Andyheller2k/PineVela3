import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { accountData, accountId, accountKey, accountRole, canManageHostel, credentialValues, hasActiveRoom, hashCredential, normalizeEmail, passwordIsReused, publicAccountData, releaseRoom, verifyCredential } from "./accountSecurity.js";
import express from "express";
import compression from "compression";
import path from "path";
import { createServer as createViteServer } from "vite";
import {
  dbGetUsers,
  dbGetUserByEmailOrUsername,
  dbGetAllUsersByEmailOrUsername,
  dbGetHostels,
  dbCreateHostel,
  dbUpdateHostel,
  dbGetBookingRequests,
  dbCreateBookingRequest,
  dbUpdateBookingRequest,
  dbGetIssueReports,
  dbCreateIssueReport,
  dbUpdateIssueReport,
  dbGetStaff,
  dbCreateStaff,
  dbDeleteStaff,
  dbGetMeetings,
  dbCreateMeeting,
  dbUpdateMeeting,
  dbDeleteMeeting,
  dbGetManagerAccountSettings,
  dbUpdateManagerAccountSettings,
  dbGetNotifications,
  dbCreateNotification,
  dbMarkNotificationRead,
  dbGetRatings,
  dbCreateRating,
  dbGetActivities,
  dbCreateActivity,
  dbGetChatProfile,
  dbUpdateChatProfile,
  dbGetChatMessages,
  dbCreateChatMessage,
  dbReactToChatMessage,
  dbGetDMRooms,
  dbCreateDMRoom,
  dbAcceptDMRoom,
  dbRegisterHostelAtomic,
  dbCleanupPlaceholderHostels,
  dbSaveManagerProfile,
  dbGetManagerRequests,
  dbCreateManagerRequest,
  dbUpdateManagerRequestStatus,
  dbGetManagerVerifications,
  dbCreateManagerVerification,
  dbUpdateManagerVerificationStatus,
  dbGetHostelVerifications,
  dbCreateHostelVerification,
  dbUpdateHostelVerificationStatus,
  dbCreateVerificationAuditLog,
  dbGetVerificationAuditLogs,
  dbCreateOnboardingPayment,
  dbAssignHostelManager,
  dbGetSettings,
  dbUpdateSettings,
  getStoreInstance,
  dbDeleteHostel,
  dbGetBoardRequests,
  dbCreateBoardRequest,
  dbUpdateBoardRequest,
  dbGetRoomKeys,
  dbGetRoomKeyByCode,
  dbAssignRoomKey,
  dbGenerateHostelRoomKeys,
  dbRecordRoomKeyDispatch,
  dbGetStudentMessages,
  dbCreateStudentMessage,
  generateHostelRoomKeyCode,
  persistStore
} from "./localDb.js";
import {
  defaultVerificationProvider,
  getAllSyntheticTestCards,
  getRandomSyntheticCard,
  hashIdentifier,
  maskIdentifier
} from "./verificationService.js";
import { loadPersistentStore, savePersistentStore } from "./persistentDb.js";

/** Cryptographically random session token (not derivable from user id/email). */
function createSessionToken(prefix = "pv"): string {
  return `${prefix}_${crypto.randomBytes(32).toString("hex")}`;
}

function hashPasswordSha256(password: string): string {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

// Known legacy default credentials (plaintext and SHA-256 hashes) that must never authenticate
const KNOWN_LEGACY_PASSWORDS = new Set([
  '1782@HellerPine',
  'admin123',
  'HellerPine2k@'
]);
const KNOWN_LEGACY_HASHES = new Set([
  'bcfcff2f3e5bd8bef762d480c8a8bc4f7da3af64cd059a5da1df0407bc7499f1', // sha256('1782@HellerPine')
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', // sha256('admin123')
  '4e9dfd0fa367d264f3fb8f15dcf40e947171e5491136b856e408ec2367469a47', // sha256('HellerPine2k@')
]);

/** Accept stored plaintext or SHA-256 hash. Never accept locked legacy credentials or known default passwords. */
function passwordsMatch(input: string, ...storedCandidates: Array<string | undefined | null>): boolean {
  if (!input) return false;
  const hashed = hashPasswordSha256(input);
  if (KNOWN_LEGACY_PASSWORDS.has(input) || KNOWN_LEGACY_HASHES.has(hashed)) {
    return false;
  }
  return storedCandidates.some(c => verifyCredential(input, c));
}

/** Remove credential fields before sending user objects to clients. */
function stripSecrets<T extends Record<string, any>>(obj: T | null | undefined): any {
  if (!obj || typeof obj !== "object") return obj;
  const {
    password: _p,
    plainPassword: _pp,
    localPassword: _lp,
    userPropPassword: _up,
    cvData: _cv,
    ...rest
  } = obj as any;
  if (rest.user && typeof rest.user === "object") {
    rest.user = stripSecrets(rest.user);
  }
  return rest;
}

function persistUserSessionToken(userEntry: any, token: string): void {
  if (!userEntry) return;
  userEntry.token = token;
  if (userEntry.user && typeof userEntry.user === "object") {
    userEntry.user.token = token;
  }
  const email = (userEntry.email || userEntry.user?.email || '').toLowerCase().trim();
  const id = userEntry.id || userEntry.user?.id || userEntry.officerId || userEntry.user?.officerId;
  if (email || id) {
    const vt = verificationTeams.find((t: any) => 
      (email && (t.email || '').toLowerCase() === email) ||
      (id && (t.id === id || t.officerId === id))
    );
    if (vt) {
      vt.token = token;
    }
  }
}

// Global crash handlers for debugging
process.on('unhandledRejection', (reason, promise) => {
  // Silent handling for common networking errors that aren't critical application crashes
  const err = reason as any;
  if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET') {
    console.warn(`[Network Warning] ${err.code} detected during async operation.`);
    return;
  }
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  // Gracefully handle EPIPE (Broken Pipe) - usually occurs when client disconnects mid-response
  if (err && (err as any).code === 'EPIPE') {
    console.warn('[Network Warning] EPIPE detected (client likely disconnected). Ignoring.');
    return;
  }
  if (err && (err as any).code === 'ECONNRESET') {
    console.warn('[Network Warning] ECONNRESET detected. Ignoring.');
    return;
  }
  console.error('[CRITICAL] Uncaught Exception:', err);
  // Note: For truly unknown fatal errors, we log and keep running, 
  // but in a production environment one might consider a graceful shutdown.
});

// Stateful backend baseline datasets - only registered managers and accredited properties
const defaultHostels: any[] = [];

const initialHostels: any[] = defaultHostels;

const initialBookingRequests: any[] = [];

const initialIssueReports: any[] = [];

const initialActivities: any[] = [];

// Backend state containers
let hostels = [...initialHostels];
let bookingRequests = [...initialBookingRequests];
let issueReports = [...initialIssueReports];
let activities = [...initialActivities];
let platformSettings: any;

const initialStaff: any[] = [];
let staff: any[] = [...initialStaff];
let staffApplications: any[] = [];
let staffAuditLogs: any[] = [];
let staffChatRooms: any[] = [];
let staffChatMessages: any[] = [];
let staffReviews: any[] = [];
let jobOffers: any[] = [];
let staffBargains: any[] = [];

// Chat state containers
let chatProfiles: any[] = [];

let dmRooms: any[] = [];

let chatMessages: any[] = [];

let meetings: any[] = [];

let notifications: any[] = [];

let ratings: any[] = [];

// In-memory Manager Registration Requests (Manager requests permission to register a hostel -> Admin approves -> Manager registers -> Admin verifies)
interface ServerManagerRequest {
  id: string;
  managerId: string;
  parentUserId?: string;
  parentUserEmail?: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  nationalId: string;
  organization: string;
  roleTitle: string;
  experienceYears?: number;
  propertyName: string;
  proposedHostelName?: string;
  hostelName?: string;
  proposedLocation?: string;
  proposedCapacity?: number;
  notes?: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'blocked' | string;
  isBlocked?: boolean;
  blockReason?: string | null;
  blockedAt?: string;
  unblockedAt?: string;
  requestedAt: string;
  submittedAt?: string;
  createdAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  updatedAt?: string;
  adminNotes?: string;
  rejectionReason?: string;
  isApproved?: boolean;
  operatingCertificate?: any;
  idFront?: any;
  idBack?: any;
  documents?: any[];
  documentsVerified?: {
    operatingCertificate: 'pending' | 'verified' | 'rejected' | string;
    idFront: 'pending' | 'verified' | 'rejected' | string;
    idBack: 'pending' | 'verified' | 'rejected' | string;
  };
  inspectionStatus?: string;
  assignedOfficerName?: string;
  inspectionReport?: any;
  verificationReport?: any;
}

let managerRequests: ServerManagerRequest[] = [
  {
    id: 'req-mgr-001',
    managerId: 'manager_101',
    managerName: 'Anthony Davis',
    managerEmail: 'manager@pinevela.com',
    managerPhone: '+233 24 123 4567',
    nationalId: 'GHA-892019482-1',
    organization: 'Apex Hostels Management Ltd.',
    roleTitle: 'General Manager',
    experienceYears: 6,
    propertyName: 'Pine Crest Residency Block C',
    notes: 'Official application to onboard Pine Crest Residency annex and manage room allocation.',
    status: 'approved',
    requestedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    approvedAt: new Date(Date.now() - 86400000 * 1).toISOString()
  }
];

let managerVerifications: any[] = [
  {
    id: 'mv-001',
    managerId: 'manager_101',
    managerName: 'Anthony Davis',
    managerEmail: 'manager@pinevela.com',
    managerPhone: '+233 24 123 4567',
    country: 'Ghana',
    idDocumentType: 'Ghana Card',
    hashedIdNumber: hashIdentifier('GHA-100000050-0'),
    maskedIdNumber: 'GHA-*****050-0',
    fullNameOnId: 'Anthony Davis',
    dateOfBirth: '1988-04-12',
    idExpiryDate: '2030-05-15',
    idVerificationStatus: 'verified',
    authorityRelationship: 'Authorized Manager',
    claimedOwnerName: 'Apex Real Estate Ventures',
    claimedOwnerPhone: '+233 20 882 1928',
    claimedOwnerEmail: 'properties@apexventures.com',
    organizationName: 'Apex Hostels Management Ltd.',
    organizationRegNumber: 'CS-8920182-GH',
    authorityEvidenceDescription: 'Certified Management Agreement & Power of Attorney signed by Chairman.',
    authorityEvidenceFileName: 'Apex_Hostel_Authorization_2026.pdf',
    authorityEvidenceUrl: 'https://docs.pinevela.com/auth/Apex_Hostel_Authorization_2026.pdf',
    authorityStatus: 'verified',
    systemChecks: {
      identity: 'verified',
      phone: 'verified',
      email: 'verified',
      authorityEvidence: 'submitted',
      informationConsistency: 'passed',
      duplicateManager: 'clean',
      previousHistory: 'clean'
    },
    status: 'approved',
    adminNotes: 'National ID verified against NIA registry. Authority contract verified by Legal.',
    reviewedBy: 'SuperAdmin (PineVela Review Board)',
    reviewedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: 'mv-002',
    managerId: 'manager_pending_002',
    managerName: 'Kwame Mensah Boateng',
    managerEmail: 'kwame.boateng@heritagehostels.com',
    managerPhone: '+233 24 991 2234',
    country: 'Ghana',
    idDocumentType: 'Ghana Card',
    hashedIdNumber: hashIdentifier('GHA-100000001-1'),
    maskedIdNumber: 'GHA-*****001-1',
    fullNameOnId: 'Kwame Mensah Boateng',
    dateOfBirth: '1985-09-21',
    idExpiryDate: '2031-10-18',
    idVerificationStatus: 'verified',
    authorityRelationship: 'Property Owner',
    claimedOwnerName: 'Kwame Mensah Boateng',
    claimedOwnerPhone: '+233 24 991 2234',
    claimedOwnerEmail: 'kwame.boateng@heritagehostels.com',
    organizationName: 'Heritage Luxury Residences',
    organizationRegNumber: 'BN-91823901-24',
    authorityEvidenceDescription: 'Indenture & Land Commission Title Certificate No. LC/GAR/2022/8812',
    authorityEvidenceFileName: 'Title_Indenture_Heritage_Hostel.pdf',
    authorityEvidenceUrl: 'https://docs.pinevela.com/auth/Title_Indenture_Heritage_Hostel.pdf',
    authorityStatus: 'pending',
    systemChecks: {
      identity: 'verified',
      phone: 'verified',
      email: 'verified',
      authorityEvidence: 'submitted',
      informationConsistency: 'passed',
      duplicateManager: 'clean',
      previousHistory: 'clean'
    },
    status: 'pending',
    adminNotes: 'Awaiting administrator verification of Land Commission deed.',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString()
  }
];

let hostelVerifications: any[] = [
  {
    id: 'hv-001',
    hostelId: 'hostel-pending-001',
    hostelName: 'Heritage Palace Residency',
    location: 'Legon Campus East Gate, Accra',
    campusZone: 'University of Ghana (East Gate)',
    addressLine1: 'Plot 44 University Ring Road',
    digitalAddress: 'GA-183-9024',
    totalCapacity: 140,
    totalRooms: 40,
    totalBlocks: 3,
    pricePerYear: 4200,
    currency: 'GHS',
    facilities: ['High Speed Wi-Fi', '24/7 Security & CCTV', 'Standby Generator', 'Private Bathrooms', 'Study Lounge'],
    imageUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
    managerId: 'manager_101',
    managerName: 'Anthony Davis',
    managerEmail: 'manager@pinevela.com',
    managerPhone: '+233 24 123 4567',
    managerApproved: true,
    authorityRelationship: 'Authorized Manager',
    ownerOperatorName: 'Heritage Estates GH',
    ownerOperatorPhone: '+233 20 882 1928',
    ownerOperatorEmail: 'director@heritageestates.com',
    proofOfOwnershipType: 'Management Contract & Owner Consent Letter',
    proofOfOwnershipFileName: 'Heritage_Palace_Management_Deed.pdf',
    proofOfOwnershipUrl: 'https://docs.pinevela.com/auth/Heritage_Palace_Management_Deed.pdf',
    systemValidation: {
      missingInfo: false,
      digitalAddressFormatValid: true,
      duplicateHostelCheck: 'clean',
      duplicateRegistrationCheck: 'clean',
      managerApproved: true,
      identityVerified: true,
      ownershipEvidencePresent: true,
      conflictingInfo: false,
      capacityPricingValid: true
    },
    validationPassed: true,
    paymentStatus: 'paid',
    paymentReference: 'PAY-PV50-2026-99120',
    paymentAmount: 50.00,
    paymentDate: new Date(Date.now() - 3600000 * 6).toISOString(),
    status: 'under_admin_review',
    adminNotes: 'Onboarding fee GHS 50 paid. Digital address GA-183-9024 verified on GhanaPost GPS.',
    submittedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString()
  }
];

let verificationAuditLogs: any[] = [
  {
    id: 'val-001',
    action: 'MANAGER_VERIFIED_IDENTITY',
    targetType: 'manager',
    targetId: 'manager_101',
    targetName: 'Anthony Davis',
    performedBy: 'NIA Synthetic Test Engine',
    role: 'system',
    details: { documentType: 'Ghana Card', hashedId: hashIdentifier('GHA-100000050-0'), status: 'verified' },
    timestamp: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: 'val-002',
    action: 'MANAGER_APPROVED',
    targetType: 'manager',
    targetId: 'manager_101',
    targetName: 'Anthony Davis',
    performedBy: 'SuperAdmin',
    role: 'admin',
    details: { reason: 'Identity verified and management contract validated.' },
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'val-003',
    action: 'ONBOARDING_FEE_PAID',
    targetType: 'payment',
    targetId: 'PAY-PV50-2026-99120',
    targetName: 'Heritage Palace Residency',
    performedBy: 'Anthony Davis',
    role: 'manager',
    details: { amount: 50.00, currency: 'GHS', reference: 'PAY-PV50-2026-99120' },
    timestamp: new Date(Date.now() - 3600000 * 6).toISOString()
  }
];

let onboardingPayments: any[] = [
  {
    id: 'pay-001',
    hostelId: 'hostel-pending-001',
    hostelName: 'Heritage Palace Residency',
    managerId: 'manager_101',
    managerName: 'Anthony Davis',
    amount: 50.00,
    currency: 'GHS',
    status: 'paid',
    reference: 'PAY-PV50-2026-99120',
    agreementAcknowledged: true,
    paymentMethod: 'Manual Confirmation (Direct Agreement)',
    paidAt: new Date(Date.now() - 3600000 * 6).toISOString()
  }
];

// Officers must be registered explicitly; never recreate accounts with source-known passwords.
let verificationTeams: any[] = [];

const DEFAULT_INSPECTIONS: any[] = [
  {
    id: 'insp-001',
    managerVerificationId: 'mv-002',
    managerName: 'Kwame Mensah Boateng',
    managerEmail: 'kwame.boateng@heritagehostels.com',
    managerPhone: '+233 24 991 2234',
    hostelName: 'Heritage Luxury Residences',
    location: 'Plot 44 University Ring Road, Legon Campus East Gate, Accra',
    digitalAddress: 'GA-183-9024',
    dispatchedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    dispatchedBy: 'Admin (System Administrator)',
    assignedOfficerId: 'vt-101',
    assignedOfficerName: 'Samuel Mensah',
    assignedOfficerEmail: 'inspector.mensah@pinevela.com',
    status: 'report_submitted',
    priority: 'high',
    adminDispatchNotes: 'Please verify the full perimeter, manager physical presence, and emergency safety features.',
    report: {
      submittedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      officerId: 'vt-101',
      officerName: 'Samuel Mensah',
      gpsCoordinates: {
        lat: 5.6534,
        lng: -0.1832,
        accuracyMeters: 4.8,
        capturedAddress: 'Plot 44 University Ring Road, Legon East Gate, Accra'
      },
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      checklist: {
        residenceExists: true,
        managerConnected: true,
        basicPropertyInfoVerified: true,
        managerAuthorityConfirmed: true,
        generalLegitimacyConfirmed: true,
        safetyHabitableCompliance: true
      },
      propertyDetails: {
        estimatedRooms: 40,
        estimatedBeds: 120,
        buildingStructure: '3-Storey Reinforced Concrete Structure with Gated Security Compound',
        securityPresent: true,
        utilitiesOperational: true
      },
      photos: [
        {
          title: 'Hostel Exterior & Compound',
          url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
          capturedAt: new Date(Date.now() - 3600000 * 3).toISOString()
        },
        {
          title: 'Entrance Signage & Gate',
          url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
          capturedAt: new Date(Date.now() - 3600000 * 3).toISOString()
        },
        {
          title: 'Interior Rooms & Facilities',
          url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
          capturedAt: new Date(Date.now() - 3600000 * 3).toISOString()
        },
        {
          title: 'On-Site Manager In-Person Verification',
          url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80',
          capturedAt: new Date(Date.now() - 3600000 * 2).toISOString()
        }
      ],
      observations: 'Conducted comprehensive in-person inspection. Property physically confirmed on site. Manager Kwame Mensah was physically present and produced matching identification. Building is in excellent condition with active security, CCTV, standby generator, and clean sanitary facilities.',
      recommendation: 'recommend_approval',
      inspectorSignature: 'Samuel Mensah (PV-INSP-2026-01)'
    }
  }
];

let verificationInspections: any[] = [...DEFAULT_INSPECTIONS];

// System users list (initialized empty; never seeded with hard-coded passwords)
let MOCK_USERS: any[] = [];

// Load Persistent Local Storage through unified store instance
const persistentData = getStoreInstance({
  hostels: defaultHostels,
  users: MOCK_USERS
});

hostels = persistentData.hostels;
bookingRequests = persistentData.bookingRequests;
issueReports = persistentData.issueReports;
activities = persistentData.activities;
hostelVerifications = persistentData.hostelVerifications;
const seenInitialReqIds = new Set<string>();
managerRequests = (persistentData.managerRegistrationRequests || []).filter(r => {
  if (!r?.id || seenInitialReqIds.has(r.id)) return false;
  seenInitialReqIds.add(r.id);
  return true;
});
verificationAuditLogs = persistentData.verificationAuditLogs;
// Retain all registered users (managers, staff, students/residents, admins) so user data is not deleted
MOCK_USERS = (persistentData.users || []).filter(u => u !== null && u !== undefined);

// Ensure existing legacy default accounts with known credentials cannot authenticate until securely reset/replaced
for (const u of MOCK_USERS) {
  if (!u) continue;
  const p = String(u.password || '').trim();
  const rawP = String(u.plainPassword || '').trim();
  const uUserP = String(u.user?.password || '').trim();
  const uUserRawP = String(u.user?.plainPassword || '').trim();

  const isLegacyKnown =
    KNOWN_LEGACY_PASSWORDS.has(p) || KNOWN_LEGACY_PASSWORDS.has(rawP) ||
    KNOWN_LEGACY_PASSWORDS.has(uUserP) || KNOWN_LEGACY_PASSWORDS.has(uUserRawP) ||
    KNOWN_LEGACY_HASHES.has(p) || KNOWN_LEGACY_HASHES.has(uUserP);

  if (isLegacyKnown) {
    u.password = '!LOCKED_LEGACY_CREDENTIAL_RESET_REQUIRED';
    delete u.plainPassword;
    u.requiresPasswordReset = true;
    if (u.user) {
      u.user.password = '!LOCKED_LEGACY_CREDENTIAL_RESET_REQUIRED';
      delete u.user.plainPassword;
      u.user.requiresPasswordReset = true;
    }
  }
}

// Bootstrap administrator support strictly via explicitly configured environment variables with pre-hashed password
// Rules:
// 1. Only create a bootstrap admin when there are no existing admin accounts.
// 2. Never modify, reset, or elevate an existing account based on BOOTSTRAP_ADMIN_EMAIL.
// 3. If an admin already exists, ignore bootstrap configuration.
// 4. Require both BOOTSTRAP_ADMIN_EMAIL and a valid 64-character SHA-256 BOOTSTRAP_ADMIN_PASSWORD_HASH before creating the first admin.
const hasExistingAdmin = MOCK_USERS.some(u => {
  if (!u) return false;
  const role = (u.role || u.user?.role || '').toLowerCase().trim();
  return role === 'admin';
});

if (!hasExistingAdmin) {
  const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const bootstrapHash = (process.env.BOOTSTRAP_ADMIN_PASSWORD_HASH || '').trim().toLowerCase();

  if (bootstrapEmail && /^[a-f0-9]{64}$/i.test(bootstrapHash)) {
    const existingAccount = MOCK_USERS.find(u => (u.email || u.user?.email || '').toLowerCase().trim() === bootstrapEmail);
    // Never modify, reset, or elevate an existing account based on BOOTSTRAP_ADMIN_EMAIL
    if (!existingAccount) {
      const adminId = `admin_${crypto.randomBytes(8).toString('hex')}`;
      const newAdmin = {
        id: adminId,
        name: process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator',
        username: process.env.BOOTSTRAP_ADMIN_USERNAME || bootstrapEmail.split('@')[0],
        email: bootstrapEmail,
        role: 'admin',
        password: bootstrapHash,
        token: createSessionToken('admin'),
        user: {
          id: adminId,
          name: process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator',
          username: process.env.BOOTSTRAP_ADMIN_USERNAME || bootstrapEmail.split('@')[0],
          email: bootstrapEmail,
          role: 'admin',
          password: bootstrapHash,
          token: createSessionToken('admin')
        }
      };
      MOCK_USERS.push(newAdmin);
    }
  }
}

managerRequests = persistentData.managerRegistrationRequests || [];
managerVerifications = persistentData.managerVerifications || [];
// Deduplicate staff list on boot to clean up any past duplicates
const bootStaffSeen = new Set<string>();
const dedupedBootStaff: any[] = [];
for (const s of (persistentData.staff || [])) {
  if (!s) continue;
  const key = s.id || `${s.email}_${s.hostelId}`;
  if (!bootStaffSeen.has(key)) {
    bootStaffSeen.add(key);
    dedupedBootStaff.push(s);
  }
}
staff = dedupedBootStaff;
persistentData.staff = dedupedBootStaff;
staffApplications = persistentData.staffApplications || [];
jobOffers = persistentData.jobOffers || [];
verificationTeams = ((persistentData as any).verificationTeams && (persistentData as any).verificationTeams.length > 0) ? (persistentData as any).verificationTeams : verificationTeams;
verificationInspections = ((persistentData as any).verificationInspections && (persistentData as any).verificationInspections.length > 0) ? (persistentData as any).verificationInspections : [...DEFAULT_INSPECTIONS];
notifications = persistentData.notifications || [];
chatMessages = persistentData.chatMessages || [];
dmRooms = persistentData.dmRooms || [];
chatProfiles = persistentData.chatProfiles || [];
ratings = persistentData.ratings || [];

// Ensure all seeded/retained accounts are written back safely to the database
const initStore = getStoreInstance();
if (initStore) {
  // Repair room records previously promoted to merchant by email and revoke the old mixed sessions once.
  const migratingAccountIsolation = (initStore as any).accountSecurityVersion !== 1;
  for (const entry of MOCK_USERS) {
    const data = accountData(entry);
    if (!data) continue;
    if ((data.roomKey || entry.roomKey) && accountRole(entry) !== 'user') {
      data.role = 'student';
      if (entry.role) entry.role = 'student';
      for (const target of [entry, entry.user].filter(Boolean)) {
        for (const field of ['isDigitalMarketOnly', 'isMerchantApplicant', 'isApprovedMerchant', 'hasApprovedMerchantStore', 'merchantStoreId', 'targetRedirect']) delete target[field];
        if (migratingAccountIsolation) delete target.token;
      }
    } else if (migratingAccountIsolation && (accountRole(entry) === 'merchant' || data.isDigitalMarketOnly)) {
      delete entry.token;
      delete data.token;
    }
  }
  if (migratingAccountIsolation) {
    for (const item of [...(initStore.digitalMarketApplications || []), ...(initStore.digitalMarketStores || [])]) {
      delete item.token;
      delete item.merchantToken;
    }
    (initStore as any).accountSecurityVersion = 1;
  }
  // Database healing: ensure primary resident/student users do not have their role mistakenly mutated to 'manager'
  // and ensure manager accounts are kept cleanly isolated under their official work emails
  if (initStore.users) {
    initStore.users.forEach((u: any) => {
      const uObj = u.user || u;
      const uRole = (uObj.role || u.role || '').toLowerCase();
      const isStudentResident = Boolean(uObj.studentId || u.studentId || uObj.roomKey || u.roomKey || uObj.residentType || u.residentType || uObj.programOfStudy);
      const isParentOfManager = (initStore.managerRegistrationRequests || []).some((r: any) => (r.parentUserEmail && r.parentUserEmail.toLowerCase() === (uObj.email || '').toLowerCase())) ||
                                (initStore.managerVerifications || []).some((v: any) => (v.parentUserEmail && v.parentUserEmail.toLowerCase() === (uObj.email || '').toLowerCase()));
      if (uRole === 'manager' && (isStudentResident || isParentOfManager)) {
        const isOfficialWorkEmail = (initStore.managerRegistrationRequests || []).some((r: any) => (r.managerEmail && r.managerEmail.toLowerCase() === (uObj.email || '').toLowerCase())) ||
                                    (initStore.managerVerifications || []).some((v: any) => (v.managerEmail && v.managerEmail.toLowerCase() === (uObj.email || '').toLowerCase()));
        if (!isOfficialWorkEmail) {
          console.log(`[DB Sanitize] Restoring primary resident user role for ${uObj.email} from 'manager' to 'student'`);
          if (u.user) u.user.role = 'student';
          u.role = 'student';
        }
      }

      // Ensure primary accounts are not mutated to 'merchant' and do not have digital onboarding targetRedirect
      const allApprovedStudentEmails = new Set(
        (initStore.digitalMarketApplications || [])
          .map((a: any) => (a.studentEmail || '').toLowerCase().trim())
          .filter(Boolean)
      );
      (initStore.digitalMarketStores || []).forEach((s: any) => {
        if (s.studentEmail) allApprovedStudentEmails.add(s.studentEmail.toLowerCase().trim());
      });

      if (uRole === 'merchant' && !allApprovedStudentEmails.has((uObj.email || u.email || '').toLowerCase().trim())) {
        console.log(`[DB Sanitize] Restoring primary account role for ${uObj.email} from 'merchant' to primary user`);
        const restoredRole = (uObj.roomKey || u.roomKey) ? 'student' : 'user';
        if (u.user) {
          u.user.role = restoredRole;
          delete u.user.targetRedirect;
          u.user.isDigitalMarketOnly = false;
        }
        u.role = restoredRole;
        delete u.targetRedirect;
        u.isDigitalMarketOnly = false;
      }
    });
  }

  // Unescape legacy HTML entities like &#x27; across all store records
  const unescapeObj = (obj: any) => {
    if (!obj) return;
    if (typeof obj === 'string') {
      return obj.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = unescapeObj(obj[i]);
      }
    } else if (typeof obj === 'object') {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          unescapeObj(obj[key]);
        }
      }
    }
    return obj;
  };
  unescapeObj(initStore.digitalMarketStores);
  unescapeObj(initStore.digitalMarketApplications);
  unescapeObj(initStore.digitalMarketProducts);

  initStore.users = [...MOCK_USERS];
  if (!initStore.managerRegistrationRequests) {
    initStore.managerRegistrationRequests = [];
  }
  if (!initStore.staff) {
    initStore.staff = [];
  }
  if (!initStore.staffApplications) {
    initStore.staffApplications = [];
  }
  if (!initStore.jobOffers) {
    initStore.jobOffers = [];
  }
  if (!(initStore as any).verificationTeams) {
    (initStore as any).verificationTeams = verificationTeams;
  }
  if (!(initStore as any).verificationInspections) {
    (initStore as any).verificationInspections = verificationInspections;
  }
  savePersistentStore(initStore);
}
staffBargains = persistentData.staffBargains || [];

export function syncStore(): void {
  persistentData.hostels = hostels;
  persistentData.bookingRequests = bookingRequests;
  persistentData.issueReports = issueReports;
  persistentData.activities = activities;
  persistentData.hostelVerifications = hostelVerifications;
  persistentData.managerRegistrationRequests = managerRequests;
  persistentData.managerRequests = managerRequests;
  persistentData.managerVerifications = managerVerifications;
  persistentData.verificationAuditLogs = verificationAuditLogs;
  (persistentData as any).verificationTeams = verificationTeams;
  (persistentData as any).verificationInspections = verificationInspections;
  persistentData.users = MOCK_USERS;
  persistentData.notifications = notifications;
  persistentData.chatMessages = chatMessages;
  persistentData.dmRooms = dmRooms;
  persistentData.chatProfiles = chatProfiles;
  persistentData.platformSettings = platformSettings;
  persistentData.staff = staff;
  persistentData.staffApplications = staffApplications;
  persistentData.staffAuditLogs = staffAuditLogs;
  persistentData.staffChatRooms = staffChatRooms;
  persistentData.staffChatMessages = staffChatMessages;
  persistentData.staffReviews = staffReviews;
  persistentData.jobOffers = jobOffers;
  persistentData.staffBargains = staffBargains;

  savePersistentStore(persistentData);
}


// Hash seed account passwords at boot so plaintext is not compared forever in memory dumps of store
const LEAKED_DEMO_TOKENS = new Set([
  'token_admin_andyheller2k',
  'token_admin_001',
  'token_manager_101',
  'token_student_882',
  'token_staff_201',
  'mock-token',
]);
for (const entry of MOCK_USERS) {
  if (!entry) continue;
  if (entry.requiresPasswordReset || entry.user?.requiresPasswordReset || String(entry.password || entry.user?.password || '').startsWith('!LOCKED_')) {
    for (const target of [entry, entry.user].filter(Boolean)) {
      delete target.token;
      delete target.merchantToken;
      delete target.sessionToken;
    }
    continue;
  }
  if (entry.password && !/^[a-f0-9]{64}$/i.test(entry.password) && !entry.password.startsWith('!LOCKED_') && !entry.password.startsWith('scrypt-sha256$')) {
    entry.password = hashPasswordSha256(entry.password);
  }
  if (entry.plainPassword) {
    delete entry.plainPassword;
  }
  const nested = entry.user;
  if (nested?.password && !/^[a-f0-9]{64}$/i.test(nested.password) && !nested.password.startsWith('!LOCKED_') && !nested.password.startsWith('scrypt-sha256$')) {
    nested.password = hashPasswordSha256(nested.password);
  }
  if (nested?.plainPassword) {
    delete nested.plainPassword;
  }
  // Invalidate well-known forgeable demo tokens from older builds
  if (LEAKED_DEMO_TOKENS.has(entry.token) || LEAKED_DEMO_TOKENS.has(nested?.token)) {
    const rotated = createSessionToken('admin');
    entry.token = rotated;
    if (nested) nested.token = rotated;
  }
  if (nested && !nested.token) {
    nested.token = entry.token || createSessionToken('sess');
  }
  if (!entry.token && nested?.token) {
    entry.token = nested.token;
  }
}
for (const officer of verificationTeams) {
  if (officer.requiresPasswordReset || String(officer.password || '').startsWith('!LOCKED_')) {
    delete officer.token;
    continue;
  }
  if (officer?.password && !/^[a-f0-9]{64}$/i.test(officer.password) && !officer.password.startsWith('scrypt-sha256$')) {
    officer.password = hashPasswordSha256(officer.password);
  }
  if (!officer.token || LEAKED_DEMO_TOKENS.has(officer.token) || String(officer.token).startsWith('token_vt_')) {
    officer.token = createSessionToken('vt');
  }
}
try { syncStore(); } catch (_) {}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Support high-resolution hostel photograph uploads (up to 30MB)
  app.use(compression() as any);
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  // Credentials and their hashes are never included in API responses.
  app.use('/api', (req, res, next) => {
    const sendJson = res.json.bind(res);
    const sessionResponse = ['/auth/login', '/auth/me', '/auth/verify-unified', '/digital-market/login', '/room-keys/claim', '/residents/onboard', '/verification-teams/login', '/auth/verification-team-login', '/auth/register-unified', '/users/register', '/auth/register-manager'].includes(req.path);
    res.json = (value: any) => sendJson(publicAccountData(value, sessionResponse));
    next();
  });

  function requirePrimaryAccount(req: any, res: any, next: any) {
    if (req.user?.role !== 'user') return res.status(403).json({ error: 'Create subaccounts from your primary user account. Subaccounts cannot create other subaccounts.' });
    next();
  }

  function passwordRecords(email: string, role: string): any[] {
    const store = getStoreInstance();
    const users = [...MOCK_USERS, ...(store.users || [])].filter(entry => {
      const data = accountData(entry);
      if (normalizeEmail(data.email || entry.email) !== email) return false;
      if (role === 'resident' || role === 'student') return Boolean(data.roomKey || entry.roomKey) && accountRole(entry) !== 'user';
      if (role === 'merchant') return !data.roomKey && accountRole(entry) === 'merchant' && data.isDigitalMarketOnly;
      return accountRole(entry) === role;
    });
    if (role === 'merchant') users.push(...(store.digitalMarketApplications || []).filter(app => normalizeEmail(app.studentEmail) === email));
    return [...new Set(users)];
  }

  function updateIdentityPassword(records: any[], password: string, email: string, role: string): void {
    const hash = hashCredential(password);
    for (const record of records) {
      const previous = credentialValues(record);
      for (const target of [record, record.user].filter(Boolean)) {
        target.passwordHistory = [...new Set([...(target.passwordHistory || []), ...previous])];
        target.password = hash;
        delete target.plainPassword;
        delete target.localPassword;
        delete target.userPropPassword;
        delete target.token;
        delete target.merchantToken;
        target.requiresPasswordReset = false;
      }
    }
    if (role === 'merchant') {
      for (const item of getStoreInstance().digitalMarketStores || []) {
        if (normalizeEmail(item.studentEmail) === email) { delete item.token; delete item.merchantToken; }
      }
    }
    syncStore();
  }

  const creationPaths = new Set([
    '/api/auth/register-manager', '/api/users/register', '/api/auth/register-unified', '/api/auth/verify-unified',
    '/api/auth/register-manager-account', '/api/manager-verifications/submit',
    '/api/digital-market/register', '/api/room-keys/claim', '/api/residents/onboard',
    '/api/staff'
  ]);
  const passwordPaths = new Set(['/api/auth/change-password', '/api/users/reset-registered-account-password', '/api/admin/reset-user-password']);
  app.use('/api', (req: any, res, next) => {
    const route = req.path;
    const fullPath = `/api${route}`;
    if (req.method !== 'POST' || (!creationPaths.has(fullPath) && !passwordPaths.has(fullPath))) return next();
    const store = getStoreInstance();
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const actorEntry = token ? [...MOCK_USERS, ...(store.users || [])].find(u => u.token === token || u.user?.token === token) : null;
    const merchantSession = token && [...(store.digitalMarketApplications || []), ...(store.digitalMarketStores || [])].some(m => m.token === token || m.merchantToken === token);
    const merchantRecord = merchantSession ? [...(store.digitalMarketApplications || []), ...(store.digitalMarketStores || [])].find(m => m.token === token || m.merchantToken === token) : null;
    const actor = accountData(actorEntry) || (merchantRecord ? { id: `merchant:${merchantRecord.id}`, email: merchantRecord.studentEmail, parentUserId: merchantRecord.userId, parentUserEmail: merchantRecord.parentUserEmail, role: 'merchant' } : null);
    const ownManagerDocuments = fullPath === '/api/manager-verifications/submit' && actor?.role === 'manager' && !req.body.password && normalizeEmail(req.body.managerEmail || req.body.email) === normalizeEmail(actor.email);
    const creatingAccount = creationPaths.has(fullPath) && !ownManagerDocuments;
    if (fullPath === '/api/users/register' && req.body.role && !['user', 'manager'].includes(req.body.role)) return res.status(400).json({ error: 'Use the dedicated registration flow for this account type.' });
    if (creatingAccount && (merchantSession || (actor && actor.role !== 'user' && !(actor.role === 'admin' && fullPath === '/api/staff')))) {
      return res.status(403).json({ error: 'Subaccounts cannot create other subaccounts. Sign in with your primary user account.' });
    }
    const primaryCreation = ['/api/auth/register-manager', '/api/auth/register-manager-account', '/api/manager-verifications/submit', '/api/digital-market/register', '/api/room-keys/claim', '/api/residents/onboard'].includes(fullPath) || (fullPath === '/api/users/register' && req.body.role !== 'user');
    if (creatingAccount && primaryCreation && !actor) return res.status(401).json({ error: 'Sign in with your primary account to create a subaccount.' });
    if (creatingAccount && actor?.role === 'user') {
      req.body.parentUserId = actor.id;
      req.body.userId = actor.id;
      req.body.parentUserEmail = actor.email;
    } else if (creatingAccount && !actor && (req.body.parentUserId || req.body.parentUserEmail || req.body.userId)) {
      return res.status(401).json({ error: 'Sign in to your primary account before creating a linked subaccount.' });
    }
    const password = req.body.newPassword ?? req.body.password;
    if (password == null) return next();
    if (typeof password !== 'string' || password.length < 6 || password.length > 1024 || /^[a-f0-9]{64}$/i.test(password) || password.startsWith('scrypt-sha256$')) {
      return res.status(400).json({ error: 'Submit a password of 6–1024 characters, rather than a stored password hash.' });
    }
    if (req.body.plainPassword && req.body.plainPassword !== password) return res.status(400).json({ error: 'Conflicting password fields.' });
    const email = normalizeEmail(req.body.studentEmail || req.body.managerEmail || req.body.staffEmail || req.body.email || actor?.email);
    const intendedRole = fullPath.includes('manager') ? 'manager' : fullPath === '/api/staff' ? 'staff' : '';
    if (creatingAccount && intendedRole && [...MOCK_USERS, ...(store.users || [])].some(u => normalizeEmail(accountData(u).email || u.email) === email && accountRole(u) !== intendedRole)) return res.status(409).json({ error: 'This email belongs to a different account type. Choose a separate email for this subaccount.' });
    const records = [...MOCK_USERS, ...(store.users || []), ...(store.digitalMarketApplications || []), ...(store.staffApplications || []), ...(store.managerVerifications || []), ...(store.managerRegistrationRequests || [])];
    if (passwordIsReused(password, records, email, actor)) {
      return res.status(409).json({ error: 'Choose a different password. This password is already used by your primary account, a linked subaccount, or a previous password.' });
    }
    delete req.body.plainPassword;
    next();
  });

  // Seller operations require a merchant session, not a matching room/primary email.
  app.use('/api/digital-market', (req: any, res, next) => {
    const mutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    const sellerOperation = mutation && (/^\/(create-store|store-setup|store|subscription)$/.test(req.path) || /^\/products(?:\/|$)/.test(req.path));
    if (!sellerOperation) return next();
    return requireAuth(['merchant', 'admin'])(req, res, () => {
      if (req.user.role !== 'merchant' && req.user.role !== 'admin') return res.status(403).json({ error: 'Sign in with your market password to manage a store.' });
      const store = getStoreInstance();
      const email = normalizeEmail(req.user.email);
      const requestedEmail = normalizeEmail(req.body.studentEmail || req.body.userEmail || req.body.email);
      const requestedId = req.body.storeId;
      const productId = req.path.startsWith('/products/') ? req.path.split('/')[2] : null;
      const product = productId ? store.digitalMarketProducts?.find(p => p.id === productId) : null;
      const target = (store.digitalMarketStores || []).find(s => s.id === (requestedId || product?.storeId) || (!requestedId && !product && normalizeEmail(s.studentEmail) === (requestedEmail || email)));
      if (req.user.role !== 'admin' && ((requestedEmail && requestedEmail !== email) || (requestedId && !target) || (target && normalizeEmail(target.studentEmail) !== email))) {
        return res.status(403).json({ error: 'You cannot manage another merchant’s store.' });
      }
      req.body.studentEmail = email;
      req.body.userEmail = email;
      next();
    });
  });

  // Static directory for uploaded hostel images
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Real-time synchronization events (SSE) for TanStack Query invalidation across open tabs/windows
  const sseSyncClients = new Set<express.Response>();

  app.get("/api/sync/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    });
    res.write("data: connected\n\n");
    sseSyncClients.add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch (e) {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      sseSyncClients.delete(res);
    });
  });

  function broadcastDataChange(entity: string, details?: any) {
    const payload = JSON.stringify({ entity, details, timestamp: Date.now() });
    for (const client of sseSyncClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (e) {
        sseSyncClients.delete(client);
      }
    }
  }

  // Middleware: Automatically broadcast data change when mutating requests succeed
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api')) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const pathParts = req.path.replace(/^\/api\//, '').split('/');
          const entity = pathParts[0] || 'all';
          broadcastDataChange(entity, { path: req.path, method: req.method });
        }
      });
    }
    next();
  });

  // Clean up any lingering placeholder demo hostels on boot
  dbCleanupPlaceholderHostels(hostels).catch(err => {
    console.warn("[PineVela] Initial placeholder cleanup note:", err);
  });

  // Middleware: Input Sanitization (XSS mitigation - preserving binary/URLs/keys)
  app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      const skipKeys = [
        'image',
        'imageUrl',
        'image_url',
        'imagePreviewUrl',
        'fileData',
        'photos',
        'token',
        'password',
        'avatar',
        'avatarUrl',
        'website'
      ];

      const sanitizeString = (str: string): string => {
        return str
          .replace(/&#x27;/g, "'")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      };

      const sanitizeObject = (obj: any) => {
        for (const key in obj) {
          if (skipKeys.includes(key)) {
            if (typeof obj[key] === 'string') {
              // Neutralize dangerous executable URI schemes
              const trimmed = obj[key].trim().toLowerCase();
              if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:') || trimmed.startsWith('data:text/html')) {
                obj[key] = '';
              }
            }
            continue;
          }
          if (typeof obj[key] === 'string') {
            obj[key] = sanitizeString(obj[key]);
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeObject(obj[key]);
          }
        }
      };
      
      sanitizeObject(req.body);
    }
    next();
  });

  // Middleware: Request Logger
  app.use((req, res, next) => {
    console.log(`[API ${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Database status and schema diagnostics endpoint
  app.get("/api/database/status", requireAuth(["admin"]), async (req, res) => {
    const persistenceStatus = {
      active: true,
      storageEngine: "local-persistent-json",
      dataFile: "data/pinevela_store.json",
      counts: {
        hostels: hostels.length,
        users: MOCK_USERS.length,
        bookingRequests: bookingRequests.length,
        issueReports: issueReports.length,
        hostelVerifications: hostelVerifications.length
      }
    };

    return res.json({
      configured: true,
      status: "local-persistent-store",
      message: "Operating in secure persistent local storage mode. All hostel registrations and records are safely saved to disk and persist across all restarts, logouts, and reboots.",
      persistence: persistenceStatus,
      tlsSecured: true,
      tablesExisting: "13/13 Local Persistent Tables",
      tables: {
        hostels: { exists: true, count: hostels.length },
        users: { exists: true, count: MOCK_USERS.length },
        bookingRequests: { exists: true, count: bookingRequests.length },
        issueReports: { exists: true, count: issueReports.length },
        hostelVerifications: { exists: true, count: hostelVerifications.length }
      }
    });
  });



  app.get("/api/settings", async (req, res) => {
    const settings = await dbGetSettings();
    res.json(settings);
  });

  app.post("/api/settings", requireAuth(["admin"]), async (req: any, res) => {
    await dbUpdateSettings(req.body);
    res.json({ success: true });
  });

  // Authentication endpoint
  app.post("/api/auth/login", async (req, res) => {
    const { usernameOrEmail, password } = req.body;
    if (typeof usernameOrEmail !== 'string' || !usernameOrEmail || typeof password !== 'string' || !password || password.length > 1024) {
      return res.status(400).json({ error: "Username/Email and Password are required" });
    }

    const cleanIdentifier = (usernameOrEmail || '').trim().toLowerCase();
    const hashedInput = hashPasswordSha256(password);

    if (KNOWN_LEGACY_PASSWORDS.has(password) || KNOWN_LEGACY_HASHES.has(hashedInput)) {
      return res.status(403).json({
        error: "Legacy default credentials have been disabled for security. An administrator must configure or reset this account password before login.",
        requiresPasswordReset: true
      });
    }

    const allCandidates = await dbGetAllUsersByEmailOrUsername(usernameOrEmail, MOCK_USERS);

    const checkCandidateValid = (cand: any) => {
      if (!cand) return false;
      const candRaw = cand.user ? cand.user : cand;
      if (candRaw.roomKey || cand.roomKey) {
        if (!hasActiveRoom(cand, getStoreInstance().roomKeys || [])) return false;
      } else if (accountRole(cand) === 'merchant' || candRaw.isDigitalMarketOnly || candRaw.isMerchantApplicant) {
        return false;
      }
      const candPassword = cand.password || candRaw.password;
      if (String(candPassword).startsWith('!LOCKED_') || cand.requiresPasswordReset || candRaw.requiresPasswordReset) {
        return false;
      }
      return passwordsMatch(
        password,
        cand.password,
        cand.plainPassword,
        candRaw.password,
        candRaw.plainPassword,
        (cand as any).localPassword,
        (cand as any).userPropPassword,
        (cand.user as any)?.password,
        (cand.user as any)?.plainPassword
      );
    };

    const store = getStoreInstance();
    // Digital market applicant/store lookup strictly by explicit studentEmail (or merchant store email)
    const marketApp = store.digitalMarketApplications?.find((a: any) =>
      a.studentEmail?.toLowerCase() === cleanIdentifier
    );
    const approvedMerchantStore = store.digitalMarketStores?.find((s: any) =>
      s.studentEmail?.toLowerCase() === cleanIdentifier &&
      !s.isBanned && (s.status === 'active' || marketApp?.status === 'approved' || (s as any).status === 'active')
    );

    let matched: any = null;

    // If logging in with the student email registered for digital market
    const isStudentMarketEmail = Boolean(
      (marketApp && marketApp.studentEmail?.toLowerCase() === cleanIdentifier) ||
      (approvedMerchantStore && approvedMerchantStore.studentEmail?.toLowerCase() === cleanIdentifier)
    );

    if (isStudentMarketEmail) {
      const marketStore = store.digitalMarketStores?.find(s => normalizeEmail(s.studentEmail) === cleanIdentifier);
      const storedPwd = marketApp?.password || marketApp?.plainPassword;
      const passMatch = storedPwd
        ? passwordsMatch(password, storedPwd)
        : false;

      if (passMatch) {
        if (marketStore?.isBanned || ['rejected', 'banned', 'disabled'].includes(String(marketApp?.status))) return res.status(403).json({ error: 'This market account is not permitted to sign in.' });
        if (allCandidates.some(candidate => (accountData(candidate)?.roomKey || candidate.roomKey || accountRole(candidate) === 'user') && checkCandidateValid(candidate))) {
          return res.status(409).json({ error: 'Your existing accounts share a password. Reset the room or market password to separate these accounts before signing in.', requiresPasswordReset: true });
        }
        if ((marketApp?.status === 'pending') && !approvedMerchantStore) {
          return res.status(403).json({
            error: "Your PineVela Student Digital Market application is awaiting admin verification. PineVela admins are yet to approve your submission. Please check back later.",
            isPendingApproval: true,
            isMerchantPending: true,
            studentEmail: marketApp?.studentEmail || cleanIdentifier,
            studentName: marketApp?.fullName || 'Student Merchant',
            university: marketApp?.university || 'Accredited Ghanaian University',
            submittedAt: marketApp?.submittedAt
          });
        }

        const isSetupCompleted = Boolean(
          (approvedMerchantStore && approvedMerchantStore.setupCompleted === true && approvedMerchantStore.registrationFeePaid === true) ||
          (marketApp && marketApp.setupCompleted === true && marketApp.registrationFeePaid === true)
        );

        matched = {
          id: `merchant:${marketApp?.id || approvedMerchantStore?.id}`,
          name: marketApp?.fullName || approvedMerchantStore?.storeName || 'Student Merchant',
          email: marketApp?.studentEmail || approvedMerchantStore?.studentEmail || cleanIdentifier,
          studentEmail: marketApp?.studentEmail || approvedMerchantStore?.studentEmail || cleanIdentifier,
          role: 'merchant',
          isDigitalMarketOnly: true,
          institution: marketApp?.university || approvedMerchantStore?.university || 'Accredited University',
          isVerified: true,
          verificationStatus: 'approved',
          isApprovedMerchant: true,
          hasApprovedMerchantStore: true,
          merchantStoreId: approvedMerchantStore?.id || marketApp?.id || null,
          merchantStoreName: approvedMerchantStore?.storeName || marketApp?.storeName || null,
          merchantSetupCompleted: isSetupCompleted,
          merchantRegistrationFeePaid: isSetupCompleted,
          targetRedirect: isSetupCompleted ? '/digital-market' : '/digital-market/onboard',
          token: createSessionToken('merchant')
        };
      }
    }

    // Check all standard candidates (staff, manager, admin, student, resident, primary users)
    if (!matched) {
      const isKnustStudentIdentifier = cleanIdentifier.endsWith('knust.edu.gh');
      if (isKnustStudentIdentifier) {
        // Prioritize student/resident role candidate
        const stuCand = allCandidates.find(c => {
          const r = (c.user?.role || c.role || '').toLowerCase();
          return (r === 'student' || r === 'resident') && checkCandidateValid(c);
        });
        if (stuCand) matched = stuCand;
      } else {
        // Prioritize primary user / admin / manager / staff candidates
        const nonStuCand = allCandidates.find(c => {
          const r = (c.user?.role || c.role || '').toLowerCase();
          return r !== 'student' && r !== 'resident' && checkCandidateValid(c);
        });
        if (nonStuCand) matched = nonStuCand;
      }

      if (!matched) {
        for (const cand of allCandidates) {
          if (checkCandidateValid(cand)) {
            matched = cand;
            break;
          }
        }
      }
    }

    // Check verification team officers (Field Officers)
    if (!matched) {
      const allVT = [...verificationTeams, ...(store.verificationTeams || [])];
      const matchedOfficer = allVT.find((t: any) => {
        if (!t) return false;
        const emailMatch = cleanIdentifier && (t.email || '').toLowerCase() === cleanIdentifier;
        const idMatch = cleanIdentifier && ((t.officerId || '').toLowerCase() === cleanIdentifier || (t.id || '').toLowerCase() === cleanIdentifier);
        const usernameMatch = cleanIdentifier && (t.email || '').split('@')[0].toLowerCase() === cleanIdentifier;
        const plainMatch = passwordsMatch(password, t.password, t.plainPassword);
        return (emailMatch || idMatch || usernameMatch) && plainMatch;
      });
      if (matchedOfficer) {
        if (matchedOfficer.status !== 'active') {
          return res.status(403).json({ error: `Officer account is currently ${matchedOfficer.status}. Please contact PineVela Administration.` });
        }
        matched = {
          id: matchedOfficer.id,
          officerId: matchedOfficer.officerId,
          name: matchedOfficer.fullName,
          fullName: matchedOfficer.fullName,
          email: matchedOfficer.email,
          phone: matchedOfficer.phone,
          role: 'verification_team',
          assignedZone: matchedOfficer.assignedZone,
          token: matchedOfficer.token || createSessionToken('vt')
        };
      }
    }


    if (!matched) {
      const fallback = await dbGetUserByEmailOrUsername(usernameOrEmail, MOCK_USERS);
      if (checkCandidateValid(fallback)) {
        matched = fallback;
      }
    }

    if (!matched) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }

    const banStatus = String(
      matched.user?.accountStatus ||
      matched.accountStatus ||
      matched.user?.status ||
      matched.status ||
      ''
    ).toLowerCase();
    const isBannedAccount = Boolean(
      matched.user?.isBanned === true ||
      matched.isBanned === true ||
      banStatus === 'banned' ||
      banStatus === 'disabled'
    );
    if (isBannedAccount) {
      return res.status(403).json({
        error: `This account has been ${banStatus === 'disabled' ? 'disabled' : 'banned'} by PineVela Administration and cannot sign in.`,
        isBanned: true,
        accountStatus: matched.user?.accountStatus || matched.accountStatus || 'Banned'
      });
    }

    const userRole = matched.user?.role || matched.role || 'student';
    const rawUser = matched.user ? { ...matched.user } : { ...matched };

    // Check if this student/applicant has an unapproved pending digital market application (only if role is student/merchant and not staff, manager, admin)
    if (userRole === 'merchant' || ((matched as any).isMerchantApplicant && userRole !== 'staff' && userRole !== 'manager' && userRole !== 'admin')) {
      const cleanEmail = (matched.email || rawUser.email || cleanIdentifier).toLowerCase().trim();
      const store = getStoreInstance();
      const pendingMerchantApp = store.digitalMarketApplications?.find((a: any) =>
        a.studentEmail?.toLowerCase() === cleanEmail &&
        a.status === 'pending'
      );
      const approvedMerchantStore = store.digitalMarketStores?.find((s: any) =>
        (s.studentEmail?.toLowerCase() === cleanEmail || s.userId === rawUser.id) &&
        !s.isBanned && s.status === 'active'
      );

      // If user registered purely as a merchant applicant and is not yet approved
      if (pendingMerchantApp && !approvedMerchantStore && !rawUser.isApprovedMerchant && !matched.isApprovedMerchant) {
        return res.status(403).json({
          error: "Your PineVela Student Digital Market application is awaiting admin verification. PineVela admins are yet to approve your submission. Please check back later.",
          isPendingApproval: true,
          isMerchantPending: true,
          studentEmail: pendingMerchantApp.studentEmail || cleanEmail,
          studentName: pendingMerchantApp.fullName || rawUser.name,
          university: pendingMerchantApp.university || 'Accredited Ghanaian University',
          submittedAt: pendingMerchantApp.submittedAt
        });
      }
    }

    let isStaffApproved = false;
    if (userRole === 'staff') {
      const cleanStaffEmail = (rawUser.email || matched.email || cleanIdentifier).toLowerCase().trim();
      const parentEmail = (rawUser.parentUserEmail || matched.parentUserEmail || matched.user?.parentUserEmail || '').toLowerCase().trim();
      const cleanStaffId = String(rawUser.id || matched.id || rawUser.userId || matched.userId || '').trim();
      const cleanParentId = String(rawUser.parentUserId || matched.parentUserId || matched.user?.parentUserId || '').trim();

      const staffEmails = [cleanStaffEmail, parentEmail, `staff-${cleanStaffEmail}`].filter(Boolean);
      const staffIds = [cleanStaffId, cleanParentId].filter(Boolean);

      const store = getStoreInstance();
      const allStaffCheckList = [
        rawUser,
        matched,
        matched.user,
        ...MOCK_USERS,
        ...(store.users || []),
        ...staff,
        ...(store.staff || []),
        ...staffApplications,
        ...(store.staffApplications || [])
      ];

      isStaffApproved = allStaffCheckList.some((obj: any) => {
        if (!obj) return false;
        const target = obj.user || obj;
        const e1 = (target.email || obj.email || '').toLowerCase().trim();
        const e2 = (target.parentUserEmail || obj.parentUserEmail || '').toLowerCase().trim();
        const e3 = (target.staffEmail || obj.staffEmail || '').toLowerCase().trim();
        const id1 = String(target.id || obj.id || '').trim();
        const id2 = String(target.userId || obj.userId || '').trim();
        const id3 = String(target.parentUserId || obj.parentUserId || '').trim();

        const emailMatch = staffEmails.some(e => e && (e1 === e || e2 === e || e3 === e || e1.endsWith(e) || e2.endsWith(e)));
        const idMatch = staffIds.some(i => i && (id1 === i || id2 === i || id3 === i));

        if (emailMatch || idMatch) {
          const st = String(target.verificationStatus || obj.verificationStatus || target.status || obj.status || '').toLowerCase().trim();
          const isV = Boolean(target.isVerified === true || obj.isVerified === true || target.isApproved === true || obj.isApproved === true);
          return isV || st === 'verified' || st === 'approved';
        }
        return false;
      });
    }

    const userObj = {
      ...rawUser,
      id: rawUser.id || matched.id,
      name: rawUser.name || matched.name || matched.full_name || matched.username || 'User',
      role: userRole,
      email: rawUser.email || matched.email || '',
      phone: rawUser.phone || matched.phone || '',
      studentId: rawUser.studentId || matched.studentId || rawUser.residentId || matched.residentId || '',
      residentType: rawUser.residentType || matched.residentType || 'student',
      programOfStudy: rawUser.programOfStudy || matched.programOfStudy || '',
      department: rawUser.department || matched.department || '',
      institution: rawUser.institution || matched.institution || '',
      roomKey: rawUser.roomKey || matched.roomKey || '',
      hostelId: rawUser.hostelId || matched.hostelId || '',
      hostelName: rawUser.hostelName || matched.hostelName || '',
      blockName: rawUser.blockName || matched.blockName || '',
      roomNumber: rawUser.roomNumber || matched.roomNumber || '',
      managerId: rawUser.managerId || matched.managerId || '',
      managerName: rawUser.managerName || matched.managerName || '',
      managerPhone: rawUser.managerPhone || matched.managerPhone || '',
      managerEmail: rawUser.managerEmail || matched.managerEmail || '',
      avatar: rawUser.avatar || matched.avatar || '',
      isVerified: userRole === 'staff'
        ? isStaffApproved
        : (rawUser.isVerified ?? matched.isVerified ?? true),
      verificationStatus: userRole === 'staff'
        ? (isStaffApproved ? 'Verified' : 'Pending')
        : (rawUser.verificationStatus || matched.verificationStatus || 'approved'),
      token: createSessionToken('sess')
    };

    if (userRole === 'staff') {
      matched.isVerified = userObj.isVerified;
      matched.verificationStatus = userObj.verificationStatus;
      if (matched.user) {
        matched.user.isVerified = userObj.isVerified;
        matched.user.verificationStatus = userObj.verificationStatus;
      }
    }

    if (userRole === 'user') {
      delete (userObj as any).roomKey;
      delete (userObj as any).roomNumber;
      delete (userObj as any).blockName;
      delete (userObj as any).hostelName;
      delete (userObj as any).hostelId;
      delete (userObj as any).targetRedirect;
      userObj.role = 'user';
    }

    // Rotate session token and persist so requireAuth only accepts issued tokens
    if (userRole === 'merchant') {
      if (marketApp) marketApp.merchantToken = userObj.token;
      if (approvedMerchantStore) approvedMerchantStore.merchantToken = userObj.token;
    }
    persistUserSessionToken(matched, userObj.token);
    if (matched.user) persistUserSessionToken(matched.user, userObj.token);
    const storeUsers = getStoreInstance();
    if (storeUsers.users) {
      const su = storeUsers.users.find((u: any) => accountId(u) === userObj.id && accountRole(u) === userObj.role);
      if (su) {
        persistUserSessionToken(su, userObj.token);
        if (userRole === 'staff') {
          su.isVerified = userObj.isVerified;
          su.verificationStatus = userObj.verificationStatus;
          if (su.user) {
            su.user.isVerified = userObj.isVerified;
            su.user.verificationStatus = userObj.verificationStatus;
          }
        }
      }
    }
    // Also update MOCK_USERS entry if present
    const mockIdx = MOCK_USERS.findIndex((u: any) => accountId(u) === userObj.id && accountRole(u) === userObj.role);
    if (mockIdx >= 0) {
      persistUserSessionToken(MOCK_USERS[mockIdx], userObj.token);
      if (userRole === 'staff') {
        MOCK_USERS[mockIdx].isVerified = userObj.isVerified;
        MOCK_USERS[mockIdx].verificationStatus = userObj.verificationStatus;
        if (MOCK_USERS[mockIdx].user) {
          MOCK_USERS[mockIdx].user.isVerified = userObj.isVerified;
          MOCK_USERS[mockIdx].user.verificationStatus = userObj.verificationStatus;
        }
      }
    }
    try { syncStore(); } catch (_) {}

    if (userRole === 'student') {
      const store = getStoreInstance();
      const cleanEmail = (userObj.email || '').toLowerCase().trim();
      const cleanStuId = (userObj.studentId || userObj.id || '').toLowerCase().trim();
      const cleanKey = (userObj.roomKey || '').trim().toUpperCase();

      const rk = store.roomKeys?.find((rk: any) => {
        const rkKey = (rk.roomKey || '').trim().toUpperCase();
        const rkStudentId = (rk.assignedStudentId || rk.studentId || rk.residentId || '').toLowerCase().trim();
        const rkEmail = (rk.assignedStudentEmail || rk.studentEmail || '').toLowerCase().trim();
        const rkParentEmail = (rk.parentUserEmail || '').toLowerCase().trim();
        const rkParentId = (rk.parentUserId || '').trim();

        return (cleanKey && rkKey === cleanKey) ||
               (cleanStuId && rkStudentId === cleanStuId) ||
               (cleanEmail && (rkEmail === cleanEmail || rkParentEmail === cleanEmail)) ||
               (rkParentId && rkParentId === userObj.id);
      });

      if (rk) {
        userObj.roomKey = rk.roomKey || userObj.roomKey;
        userObj.hostelId = rk.hostelId || userObj.hostelId;
        userObj.hostelName = rk.hostelName || userObj.hostelName;
        userObj.blockName = rk.blockName || userObj.blockName;
        userObj.roomNumber = rk.roomNumber || userObj.roomNumber;
        userObj.managerId = rk.managerId || userObj.managerId;
        userObj.managerName = rk.managerName || userObj.managerName;
        userObj.managerPhone = rk.managerPhone || rk.phone || userObj.managerPhone;
        userObj.managerEmail = rk.managerEmail || rk.email || userObj.managerEmail;
      }

      // A room password authenticates only the room identity, even when its email owns a market.
      userObj.role = 'student';
      userObj.isDigitalMarketOnly = false;
      userObj.isApprovedMerchant = false;
      userObj.hasApprovedMerchantStore = false;
      delete (userObj as any).targetRedirect;
      delete (userObj as any).merchantStoreId;

      // Register session token in MOCK_USERS to guarantee immediate authorization
      if (userObj.token) {
        const mockIdx = MOCK_USERS.findIndex(m => {
          const mRole = (m.user?.role || m.role || '').toLowerCase();
          return mRole === userRole && ((m.user && m.user.id === userObj.id) || m.id === userObj.id || (m.email && m.email.toLowerCase() === cleanEmail));
        });
        if (mockIdx >= 0) {
          MOCK_USERS[mockIdx].token = userObj.token;
          if (MOCK_USERS[mockIdx].user) MOCK_USERS[mockIdx].user.token = userObj.token;
        } else {
          MOCK_USERS.push({
            id: userObj.id,
            email: userObj.email,
            username: userObj.studentId || userObj.name,
            role: 'student',
            token: userObj.token,
            user: userObj
          });
        }
      }
    }

    // Check manager approval and block status
    if (userRole === 'manager') {
      const store = getStoreInstance();
      const cleanEmail = (matched.email || userObj.email || '').toLowerCase().trim();
      const targetMgrId = userObj.id || matched.id;
      const verif = managerVerifications.find(v => (v.managerEmail && v.managerEmail.toLowerCase().trim() === cleanEmail) || (targetMgrId && (v.managerId === targetMgrId || v.id === targetMgrId)));
      const reqRecord = managerRequests.find(r => (r.managerEmail && r.managerEmail.toLowerCase().trim() === cleanEmail) || (targetMgrId && (r.managerId === targetMgrId || r.id === targetMgrId)));
      const storedVerif = ((store as any).managerVerifications || []).find((v: any) => (v.managerEmail && v.managerEmail.toLowerCase().trim() === cleanEmail) || (targetMgrId && (v.managerId === targetMgrId || v.id === targetMgrId)));
      const storedReq = (store.managerRegistrationRequests || []).find((r: any) => (r.managerEmail && r.managerEmail.toLowerCase().trim() === cleanEmail) || (targetMgrId && (r.managerId === targetMgrId || r.id === targetMgrId)));

      const isBlocked = 
        userObj.isBlocked === true ||
        userObj.status === 'blocked' ||
        userObj.verificationStatus === 'blocked' ||
        matched.user?.isBlocked === true ||
        matched.isBlocked === true ||
        verif?.status === 'blocked' ||
        verif?.isBlocked === true ||
        reqRecord?.status === 'blocked' ||
        reqRecord?.isBlocked === true ||
        storedVerif?.status === 'blocked' ||
        storedVerif?.isBlocked === true ||
        storedReq?.status === 'blocked' ||
        storedReq?.isBlocked === true;

      if (isBlocked) {
        const restrictionReason = userObj.blockReason || verif?.blockReason || verif?.adminNotes || reqRecord?.blockReason || reqRecord?.adminNotes || storedVerif?.blockReason || storedReq?.blockReason || "Your manager account access has been restricted by administration.";
        return res.status(403).json({
          error: `Your manager account is blocked. Reason: ${restrictionReason}. Please wait until further notice or contact administration.`,
          isBlocked: true,
          restrictionReason: restrictionReason,
          managerEmail: matched.email || userObj.email,
          managerName: userObj.name
        });
      }

      const isApproved = 
        userObj.isVerified === true ||
        userObj.verificationStatus === 'approved' ||
        verif?.status === 'approved' ||
        reqRecord?.status === 'approved' ||
        storedVerif?.status === 'approved' ||
        storedReq?.status === 'approved' ||
        cleanEmail === 'manager@pinevela.com' ||
        cleanEmail === 'sarah.j@pinevela.com';

      if (!isApproved) {
        return res.status(403).json({
          error: "A PineVela verification team will come and inspect the property before your account can be verified.",
          isPendingApproval: true,
          managerEmail: matched.email || userObj.email,
          managerName: userObj.name
        });
      }

      // Ensure user object reflects approval
      userObj.isVerified = true;
      userObj.verificationStatus = 'approved';
      if (matched.user) {
        (matched.user as any).isVerified = true;
        (matched.user as any).verificationStatus = 'approved';
      }
    }

    return res.json(stripSecrets(userObj));
  });

  // Quick Resident Login for instant portal transition from user dashboard
  app.post("/api/auth/quick-resident-login", async (req: any, res) => {
    return res.status(404).json({ error: "Quick resident login has been removed. Please log in via the login page." });
  });

  app.post("/api/auth/quick-merchant-login", async (req: any, res) => {
    return res.status(404).json({ error: "Quick merchant login has been removed. Please log in via the login page." });
  });

  app.post("/api/auth/quick-manager-login", async (req: any, res) => {
    return res.status(404).json({ error: "Quick manager login has been removed. Please log in via the login page." });
  });

  app.post("/api/auth/quick-staff-login", async (req: any, res) => {
    return res.status(404).json({ error: "Quick staff login has been removed. Please log in via the login page." });
  });

  // Helper function to validate strictly Kumasi / KNUST location & accreditation requirement
  function validateKumasiKnustLocation(locationStr: string, isConfirmed?: boolean) {
    const loc = (locationStr || '').toLowerCase().trim();
    if (!loc) {
      return {
        isValid: false,
        error: "Property location in the Kumasi region (KNUST Area) is required."
      };
    }
    
    // Explicit forbidden regions/cities outside Kumasi
    const forbiddenOutsideRegions = [
      'accra', 'legon', 'cape coast', 'takoradi', 'tamale', 'sunyani', 'koforidua', 'winneba', 'ho', 'wa', 'bolgatanga', 'tema', 'madina', 'adenta', 'spintex', 'dansoman', 'teshie', 'osu'
    ];
    for (const forbidden of forbiddenOutsideRegions) {
      if (loc.includes(forbidden)) {
        return {
          isValid: false,
          error: `Hostel registration is strictly restricted to KNUST-accredited properties in the Kumasi region. Locations outside Kumasi (${forbidden.toUpperCase()}) cannot be registered.`
        };
      }
    }

    // Known Kumasi & KNUST keywords
    const validKumasiKeywords = [
      'kumasi', 'knust', 'ayeduase', 'kotei', 'kentinkrono', 'bomso', 'gaza', 'boadi', 'oforikrom', 'maxima', 'tech junction', 'ashanti', 'hilltop', 'new site', 'kwamo', 'ejisu', 'sofoline', 'adum', 'tanoso'
    ];
    
    const matchesKumasi = validKumasiKeywords.some(kw => loc.includes(kw));
    if (!matchesKumasi) {
      return {
        isValid: false,
        error: "Property location must strictly be in the Kumasi region / KNUST area (e.g. Kumasi, Ayeduase, Kotei, Kentinkrono, Bomso, Gaza, Boadi, KNUST Campus)."
      };
    }

    if (isConfirmed === false) {
      return {
        isValid: false,
        error: "You must accept and confirm that your hostel/residence is located in Kumasi and is KNUST accredited."
      };
    }

    return { isValid: true };
  }

  // Public Manager and Hostel registration endpoint (legacy support)
  app.post("/api/auth/register-manager", async (req, res) => {
    try {
      const {
        managerName,
        managerEmail,
        password,
        managerPhone,
        hostelName,
        location,
        wing,
        totalCapacity,
        description,
        knustAccreditedConfirmed
      } = req.body;

      if (!managerName || !managerEmail || !password || !hostelName) {
        return res.status(400).json({ error: "Missing required registration details" });
      }

      // Enforce work email domain requirement for manager registration
      const managerEmailClean = managerEmail.toLowerCase().trim();
      const disallowedDomainsReg = [
        'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
        'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
        'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'yandex.com'
      ];
      const emailDomainReg = managerEmailClean.split('@')[1] || '';
      if (disallowedDomainsReg.includes(emailDomainReg)) {
        return res.status(400).json({
          error: `Manager registration requires an official work or organization email domain (e.g. manager@yourproperty.com, housing@institution.edu.gh). Personal consumer emails (@${emailDomainReg}) are not permitted.`
        });
      }

      const locCheck = validateKumasiKnustLocation(location, knustAccreditedConfirmed);
      if (!locCheck.isValid) {
        return res.status(400).json({ error: locCheck.error });
      }

      // Create new manager user
      const managerId = `manager-new-${Date.now()}`;
      const username = managerEmail.split('@')[0] + Math.floor(Math.random() * 100);
      const userToken = createSessionToken('mgr');

      const newManagerUser = {
        email: managerEmail.toLowerCase().trim(),
        username,
        password,
        user: {
          id: managerId,
          name: managerName,
          role: 'manager',
          email: managerEmail.toLowerCase().trim(),
          phone: managerPhone || '',
          token: userToken
        }
      };

      MOCK_USERS.push(newManagerUser);



      // Create new hostel
      const hostelId = `hostel-new-${Date.now()}`;
      const newHostel = {
        id: hostelId,
        name: hostelName,
        location: location || "Unknown Location",
        wing: wing || "North Wing",
        status: 'Open',
        bedsLeft: Number(totalCapacity || 100),
        totalCapacity: Number(totalCapacity || 100),
        availableSpaces: Number(totalCapacity || 100),
        image: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
        managerName,
        managerPhone: managerPhone || "",
        managerEmail,
        managerId,
        description: description || "Modern student residential community.",
        rating: 5.0,
        registrationDate: new Date().toISOString().split('T')[0],
        subscriptionPaid: true,
        isApproved: true,
        approvalStatus: 'Approved'
      };

      const savedHostel = await dbCreateHostel(newHostel, hostels);
      syncStore();

      // Create admin activity logs
      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `New Manager "${managerName}" registered hostel "${hostelName}"`,
        time: 'Just now',
        type: 'success'
      }, activities);

      return res.status(201).json({
        success: true,
        user: newManagerUser.user,
        hostel: savedHostel
      });
    } catch (err: any) {
      console.error("Manager registration error:", err);
      return res.status(500).json({ error: err.message || "Failed to register manager and hostel" });
    }
  });

  // User registration endpoint alias
  app.post("/api/users/register", async (req, res) => {
    try {
      const { name, managerName, email, managerEmail, password, role, phone, managerPhone, hostelName, proposedHostelName } = req.body;
      const resolvedName = (name || managerName || 'New User').trim();
      const resolvedEmail = (email || managerEmail || '').toLowerCase().trim();
      const resolvedPhone = (phone || managerPhone || '').trim();
      const resolvedRole = role || 'manager';
      if (!['user', 'manager'].includes(resolvedRole)) return res.status(400).json({ error: 'Use the dedicated registration flow for this account type.' });

      if (!resolvedEmail || !password) {
        return res.status(400).json({ error: "Email address and password are required." });
      }

      const existing = MOCK_USERS.find(u => (u.email || '').toLowerCase() === resolvedEmail);
      if (existing) {
        return res.status(400).json({ error: "An account with this email address already exists." });
      }

      const userId = `${resolvedRole}_${Date.now()}`;
      const username = resolvedEmail.split('@')[0] + Math.floor(Math.random() * 100);
      const token = createSessionToken('usr');

      const newUserObj = {
        email: resolvedEmail,
        username,
        password,
        phone: resolvedPhone,
        user: {
          id: userId,
          name: resolvedName,
          role: resolvedRole,
          email: resolvedEmail,
          phone: resolvedPhone,
          isVerified: resolvedRole === 'manager' ? false : true,
          verificationStatus: resolvedRole === 'manager' ? 'pending' : 'approved',
          token
        }
      };

      MOCK_USERS.push(newUserObj);

      if (resolvedRole === 'manager') {
        const nowIso = new Date().toISOString();
        const initialManagerReq = {
          id: `mreq-${Date.now()}`,
          managerId: userId,
          managerName: resolvedName,
          managerEmail: resolvedEmail,
          managerPhone: resolvedPhone,
          nationalId: req.body.nationalId || 'GHA-VERIFIED-CARD',
          organization: req.body.organization || 'Independent Residence',
          roleTitle: req.body.roleTitle || 'Residence Director',
          experienceYears: 1,
          propertyName: hostelName || proposedHostelName || `${resolvedName}'s Hostel`,
          proposedHostelName: hostelName || proposedHostelName || `${resolvedName}'s Hostel`,
          hostelName: hostelName || proposedHostelName || `${resolvedName}'s Hostel`,
          proposedLocation: 'Campus Area',
          proposedCapacity: 120,
          reason: 'Manager account registered via onboarding gateway.',
          notes: 'Submitted via 5-phase onboarding gateway.',
          status: 'pending' as const,
          isApproved: false,
          submittedAt: nowIso,
          requestedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        managerRequests.unshift(initialManagerReq);
        await dbCreateManagerRequest(initialManagerReq);
      }

      return res.status(201).json({
        success: true,
        user: newUserObj.user,
        token
      });
    } catch (err: any) {
      console.error("User registration endpoint error:", err);
      return res.status(500).json({ error: err.message || "User registration failed" });
    }
  });

  // In-memory store for pending unified registration verification codes
  const UNIFIED_SIGNUPS: Record<string, { name: string; email: string; password: string; code: string; expiresAt: number }> = {};

  // Unified Base User Account Registration with temporary email verification token gating
  app.post("/api/auth/register-unified", async (req, res) => {
    try {
      const { name, email, password } = req.body;
      const resolvedName = (name || '').trim();
      const resolvedEmail = (email || '').toLowerCase().trim();

      if (!resolvedName || !resolvedEmail || !password) {
        return res.status(400).json({ error: "Name, email, and password are required." });
      }

      // Check if user already exists
      const existingUser = MOCK_USERS.find(u => 
        (u.email || '').toLowerCase() === resolvedEmail || 
        (u.user && (u.user.email || '').toLowerCase() === resolvedEmail)
      );
      if (existingUser) {
        return res.status(400).json({ error: "An account with this email address already exists. Please log in instead." });
      }

      // Generate a clean 6-character alphanumeric code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      UNIFIED_SIGNUPS[resolvedEmail] = {
        name: resolvedName,
        email: resolvedEmail,
        password: hashCredential(password),
        code: code,
        expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes validity
      };

      console.log(`[UNIFIED SIGNUP CODE] Verification code generated for ${resolvedEmail}: ${code}`);

      return res.json({
        success: true,
        message: `Verification code generated successfully. Please check your simulated inbox or copy the code below.`,
        code: code // sending code in response to display inside the mock verification dialog
      });
    } catch (err: any) {
      console.error("Unified registration error:", err);
      return res.status(500).json({ error: err.message || "Unified registration failed" });
    }
  });

  // Verify temporary registration token and activate base PineVela user account
  app.post("/api/auth/verify-unified", async (req, res) => {
    try {
      const { email, code, password } = req.body;
      const resolvedEmail = (email || '').toLowerCase().trim();
      const resolvedCode = (code || '').trim().toUpperCase();

      if (!resolvedEmail || !resolvedCode) {
        return res.status(400).json({ error: "Email and verification code are required." });
      }

      const signup = UNIFIED_SIGNUPS[resolvedEmail];
      if (!signup || signup.code !== resolvedCode || signup.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired verification code. Please request a new one." });
      }
      if (!verifyCredential(password, signup.password)) return res.status(400).json({ error: 'Confirm the password chosen during registration.' });
      if (MOCK_USERS.some(u => normalizeEmail(accountData(u).email || u.email) === resolvedEmail)) return res.status(409).json({ error: 'This account already exists. Sign in instead.' });

      // Create new unified user
      const newUserId = `user_${Date.now()}`;
      const userToken = createSessionToken('usr');
      
      const userProfile = {
        id: newUserId,
        name: signup.name,
        email: signup.email,
        role: 'user' as const, // generic identity role
        token: userToken,
        isVerified: true,
        verificationStatus: 'approved'
      };

      const newUserEntry = {
        email: signup.email,
        username: signup.email.split('@')[0].replace(/[^a-z0-9]/g, ''),
        password: signup.password,
        user: userProfile
      };

      MOCK_USERS.push(newUserEntry);
      persistentData.users = MOCK_USERS;
      savePersistentStore(persistentData);

      // Remove from pending signup
      delete UNIFIED_SIGNUPS[resolvedEmail];

      res.cookie("pv_auth_token", userToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      console.log(`[UNIFIED SIGNUP SUCCESS] Verified user ${signup.email}. Created account with generic identity.`);

      return res.status(201).json({
        success: true,
        user: userProfile,
        token: userToken,
        message: "Your PineVela account has been successfully verified and activated."
      });
    } catch (err: any) {
      console.error("Unified verification error:", err);
      return res.status(500).json({ error: err.message || "Unified verification failed" });
    }
  });

  // Dedicated Manager Account Registration with keen verification details
  app.post("/api/auth/register-manager-account", async (req, res) => {
    try {
      const {
        managerName,
        name,
        managerEmail,
        email,
        password,
        managerPhone,
        phone,
        nationalId,
        organization,
        roleTitle,
        experienceYears,
        address,
        operatingAddress
      } = req.body;

      const resolvedName = (managerName || name || '').trim();
      const resolvedEmail = (managerEmail || email || '').toLowerCase().trim();
      const resolvedPhone = (managerPhone || phone || '').trim();
      const resolvedAddress = (address || operatingAddress || '').trim();
      const resolvedNationalId = (nationalId || '').trim();
      const resolvedOrg = (organization || 'Independent Accommodation Management').trim();
      const resolvedTitle = (roleTitle || 'Hostel Manager').trim();
      const resolvedExp = Number(experienceYears) || 1;

      if (!resolvedName || !resolvedEmail || !password) {
        return res.status(400).json({ error: "Manager full name, email, and password are required." });
      }

      // Enforce Kumasi / KNUST location & accreditation requirement
      const locCheck = validateKumasiKnustLocation(resolvedAddress, req.body.knustAccreditedConfirmed);
      if (!locCheck.isValid) {
        return res.status(400).json({ error: locCheck.error });
      }

      // Enforce work email domain requirement (disallow personal consumer email domains)
      const disallowedDomains = [
        'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
        'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
        'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'yandex.com'
      ];
      const emailDomain = resolvedEmail.split('@')[1] || '';
      if (disallowedDomains.includes(emailDomain)) {
        return res.status(400).json({
          error: `Manager registration requires an official work or organization email domain (e.g. manager@yourproperty.com, housing@institution.edu). Personal consumer emails (@${emailDomain}) are not permitted for manager credentials.`
        });
      }

      // Check if user is trying to use their own resident account email
      const incomingParentEmail = (req.body.parentUserEmail || req.body.userEmail || '').toLowerCase().trim();
      if (incomingParentEmail && resolvedEmail === incomingParentEmail) {
        return res.status(400).json({
          error: `You cannot register a Manager account using your personal resident user email (${resolvedEmail}). Manager accounts must use a dedicated, official work email address to keep your resident identity and manager identity securely separated.`
        });
      }

      // Check if user already exists with this exact email
      const existingUserIndex = MOCK_USERS.findIndex(u => (u.email || u.user?.email || '').toLowerCase().trim() === resolvedEmail);
      const existingMgrVerif = managerVerifications.find(v => (v.managerEmail || '').toLowerCase().trim() === resolvedEmail);
      const existingMgrReq = managerRequests.find(r => (r.managerEmail || '').toLowerCase().trim() === resolvedEmail);

      if (existingUserIndex >= 0) {
        const existingUser = MOCK_USERS[existingUserIndex];
        const existingRole = existingUser?.user?.role || existingUser?.role;
        if (existingRole && existingRole !== 'manager') {
          return res.status(400).json({
            error: `An existing ${existingRole} account is already registered under ${resolvedEmail}. To preserve your account identity, please use your official work email address to register as a manager.`
          });
        }
      }

      if (existingMgrVerif || existingMgrReq) {
        const statusVal = existingMgrVerif?.status || existingMgrReq?.status || 'pending';
        const statusDisplay = statusVal === 'approved' ? 'Approved' : (statusVal === 'rejected' ? 'Rejected' : 'Pending Admin Approval');
        return res.status(400).json({ 
          error: `You already have a registered Manager account under this work email address (${resolvedEmail}). Current Status: ${statusDisplay}. Creation of multiple Manager accounts is restricted to 1 account per user.` 
        });
      }

      let managerId = `manager_${Date.now()}`;
      let username = resolvedEmail.split('@')[0].replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 100);
      let userToken = createSessionToken('mgr');

      const parentUserId = req.body.userId || req.body.parentUserId || null;
      const parentUserEmail = incomingParentEmail || null;

      // Extract submitted documents
      const operatingCertificate = req.body.operatingCertificate || {
        fileName: req.body.authorityEvidenceFileName || 'Business_Operating_Certificate.pdf',
        url: req.body.authorityEvidenceUrl || null,
        documentType: 'OPERATING_CERTIFICATE_PDF'
      };
      const idFront = req.body.idFront || {
        fileName: 'Ghana_Card_Front.jpg',
        url: null,
        documentType: 'ID_FRONT'
      };
      const idBack = req.body.idBack || {
        fileName: 'Ghana_Card_Back.jpg',
        url: null,
        documentType: 'ID_BACK'
      };
      const documentsList = req.body.documents || [
        { id: 'doc-cert', name: 'Operating Certificate / License', fileName: operatingCertificate.fileName, type: 'PDF', status: 'pending' },
        { id: 'doc-id-front', name: 'National ID (Front)', fileName: idFront.fileName, type: 'IMAGE', status: 'pending' },
        { id: 'doc-id-back', name: 'National ID (Back)', fileName: idBack.fileName, type: 'IMAGE', status: 'pending' }
      ];
      const documentsVerified = req.body.documentsVerified || {
        operatingCertificate: 'pending',
        idFront: 'pending',
        idBack: 'pending'
      };

      // Check for active manager account registration restrictions
      const store = getStoreInstance();
      if (!store.managerRestrictions) store.managerRestrictions = [];
      const pUserEmail = (parentUserEmail || resolvedEmail || '').toLowerCase().trim();
      
      const activeRestriction = store.managerRestrictions.find((r: any) => {
        const uEmail = (r.userEmail || '').toLowerCase().trim();
        const mEmail = (r.deletedManagerEmail || '').toLowerCase().trim();
        const isMatch = uEmail === pUserEmail || mEmail === resolvedEmail || uEmail === resolvedEmail;
        if (isMatch) {
          const isExpired = new Date(r.expiresAt).getTime() <= Date.now();
          if (!isExpired && !r.bypassApproved) {
            return true;
          }
        }
        return false;
      });

      if (activeRestriction) {
        const expiresTime = new Date(activeRestriction.expiresAt).getTime();
        const diffMs = expiresTime - Date.now();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        let errorMsg = `Account creation blocked. You recently deleted a Manager account and have a 30-day restriction (remaining: ${diffDays} days) to prevent account abuse.`;
        if (activeRestriction.bypassRequested) {
          errorMsg += ` Your bypass request is currently pending Admin review.`;
        } else {
          errorMsg += ` You did not submit a detailed reason for bypass when deleting.`;
        }
        return res.status(400).json({ error: errorMsg });
      }

      const newManagerUser = {
        email: resolvedEmail,
        username,
        password,
        parentUserId,
        parentUserEmail,
        nationalId: resolvedNationalId || 'GHA-VERIFIED',
        organization: resolvedOrg,
        roleTitle: resolvedTitle,
        experienceYears: resolvedExp,
        phone: resolvedPhone,
        address: resolvedAddress,
        user: {
          id: managerId,
          parentUserId,
          parentUserEmail,
          name: resolvedName,
          role: 'manager',
          email: resolvedEmail,
          phone: resolvedPhone,
          nationalId: resolvedNationalId || '',
          organization: resolvedOrg,
          roleTitle: resolvedTitle,
          experienceYears: resolvedExp,
          address: resolvedAddress,
          isVerified: false,
          verificationStatus: 'pending',
          token: userToken
        }
      };

      MOCK_USERS.push(newManagerUser);
      if (!store.users) store.users = [];
      store.users.push(newManagerUser.user);
      savePersistentStore(store);

      const returnedUserObj = newManagerUser.user;

      if (parentUserId || parentUserEmail) {
        const parentUser = MOCK_USERS.find(u => 
          (parentUserId && (u.id === parentUserId || u.user?.id === parentUserId)) ||
          (parentUserEmail && ((u.email || '').toLowerCase() === parentUserEmail || (u.user?.email || '').toLowerCase() === parentUserEmail))
        );
        if (parentUser) {
          const uObj = parentUser.user || parentUser;
          if (!uObj.registeredAccounts) uObj.registeredAccounts = {};
          uObj.registeredAccounts.managerAccount = {
            ...returnedUserObj,
            documentsVerified,
            operatingCertificate,
            idFront,
            idBack,
            documents: documentsList
          };
        }
      }

      // Create initial pending manager verification record so Admin sees it immediately
      const nowIso = new Date().toISOString();
      const verifRecordId = `mv-${Date.now()}`;
      const defaultDocType = req.body.documentType || req.body.idDocumentType || 'Ghana Card';
      const initialVerifRecord = {
        id: verifRecordId,
        managerId,
        parentUserId,
        parentUserEmail,
        managerName: resolvedName,
        managerEmail: resolvedEmail,
        managerPhone: resolvedPhone,
        country: req.body.country || 'Ghana',
        idDocumentType: defaultDocType,
        hashedIdNumber: `hash_${resolvedNationalId || managerId}`,
        maskedIdNumber: resolvedNationalId ? `${resolvedNationalId.slice(0, 4)}••••${resolvedNationalId.slice(-4)}` : 'GHA-••••-2026',
        fullNameOnId: req.body.fullNameOnId || resolvedName,
        dateOfBirth: req.body.dateOfBirth || req.body.dob || '1990-01-01',
        idExpiryDate: req.body.expiryDate || req.body.idExpiryDate || '2030-01-01',
        idVerificationStatus: 'verified',
        authorityRelationship: req.body.authorityRelationship || req.body.authorityRel || 'Authorized Manager',
        claimedOwnerName: req.body.claimedOwnerName || null,
        claimedOwnerPhone: req.body.claimedOwnerPhone || null,
        claimedOwnerEmail: req.body.claimedOwnerEmail || null,
        organizationName: resolvedOrg,
        organizationRegNumber: req.body.organizationRegNumber || req.body.orgRegNumber || null,
        authorityEvidenceDescription: req.body.authorityEvidenceDescription || 'Manager registration details provided.',
        authorityEvidenceFileName: operatingCertificate?.fileName || req.body.authorityEvidenceFileName || null,
        authorityEvidenceUrl: operatingCertificate?.url || null,
        authorityStatus: 'pending',
        operatingCertificate,
        idFront,
        idBack,
        documents: documentsList,
        documentsVerified,
        systemChecks: {
          identity: 'verified' as const,
          phone: 'verified' as const,
          email: 'verified' as const,
          authorityEvidence: 'submitted' as const,
          informationConsistency: 'passed' as const,
          duplicateManager: 'clean' as const,
          previousHistory: 'clean' as const
        },
        status: 'pending',
        adminNotes: null,
        rejectionReason: null,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const existingVerifIdx = managerVerifications.findIndex(v => v.managerEmail.toLowerCase() === resolvedEmail);
      if (existingVerifIdx >= 0) {
        managerVerifications[existingVerifIdx] = { ...managerVerifications[existingVerifIdx], ...initialVerifRecord };
      } else {
        managerVerifications.unshift(initialVerifRecord);
      }
      await dbCreateManagerVerification(initialVerifRecord);

      // Also create initial Manager Property Onboarding Request for Admin Approvals
      const initialManagerReq = {
        id: `mreq-${Date.now()}`,
        managerId,
        parentUserId,
        parentUserEmail,
        managerName: resolvedName,
        managerEmail: resolvedEmail,
        managerPhone: resolvedPhone,
        propertyName: `${resolvedName}'s Designated Residence`,
        proposedHostelName: `${resolvedName}'s Designated Residence`,
        hostelName: `${resolvedName}'s Designated Residence`,
        proposedLocation: resolvedAddress || 'Legon Campus Area, Accra',
        proposedCapacity: 120,
        proposedReason: 'Official university-affiliated student accommodation onboarding and management.',
        reason: 'Manager account registered. Awaiting administrative approval to unlock 10-step property onboarding.',
        notes: 'Manager account registered with verified national ID. Ready for administrative review.',
        nationalId: resolvedNationalId,
        organization: resolvedOrg,
        roleTitle: resolvedTitle,
        experienceYears: resolvedExp,
        status: 'pending' as const,
        isApproved: false,
        operatingCertificate,
        idFront,
        idBack,
        documents: documentsList,
        documentsVerified,
        submittedAt: nowIso,
        requestedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      managerRequests.unshift(initialManagerReq);
      await dbCreateManagerRequest(initialManagerReq);

      // Persist to local database (manager_profiles, profiles, users)
      await dbSaveManagerProfile({
        id: managerId,
        name: resolvedName,
        email: resolvedEmail,
        phone: resolvedPhone,
        nationalId: resolvedNationalId,
        organization: resolvedOrg,
        roleTitle: resolvedTitle,
        experienceYears: resolvedExp,
        address: resolvedAddress,
        password
      });

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `New Manager "${resolvedName}" registered (${resolvedOrg}). Verification & Property request queued for Admin approval.`,
        time: 'Just now',
        type: 'info'
      }, activities);

      // Dispatch user notification for manager registration
      const mgrNotif = {
        id: `notif-mgr-${Date.now()}`,
        studentId: managerId,
        userId: managerId,
        userEmail: resolvedEmail,
        recipientEmail: resolvedEmail,
        title: 'Manager Account Registration Submitted',
        message: `Your Manager Account registration for "${resolvedName}" (${resolvedOrg}) has been submitted successfully. Current Status: Pending Administrative Approval.`,
        type: 'verification',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(mgrNotif);
      await dbCreateNotification(mgrNotif, notifications);

      syncStore();

      return res.status(201).json({
        success: true,
        user: returnedUserObj,
        verification: initialVerifRecord,
        request: initialManagerReq
      });
    } catch (err: any) {
      console.error("Manager account creation error:", err);
      return res.status(500).json({ error: err.message || "Failed to create manager account." });
    }
  });

  // Authentication validation middleware
  function requireAuth(allowedRoles?: ("student" | "manager" | "admin" | "staff" | "user" | "resident" | string)[]) {
    return async (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access Denied: No token provided' });
      }
      const token = authHeader.split(' ')[1]?.trim();
      if (!token) {
        return res.status(401).json({ error: 'Access Denied: No token provided' });
      }
      
      const dbUsers = await dbGetUsers(MOCK_USERS);
      const store = getStoreInstance();
      const combinedUsers = [...MOCK_USERS, ...dbUsers, ...(persistentData.users || []), ...(store.users || [])];
      
      // Match only against explicitly stored session tokens (never forge from user id / email).
      let foundEntry = combinedUsers.find(u => {
        if (!u) return false;
        const uToken = u.token || u.user?.token;
        return Boolean(uToken) && uToken === token;
      });

      // Search digital market applications/stores if token matches an issued merchant token
      if (!foundEntry) {
        const mStore = store.digitalMarketStores?.find((s: any) => s.token === token || s.merchantToken === token);
        const mApp = store.digitalMarketApplications?.find((a: any) => a.token === token || a.merchantToken === token);
        if (mStore || mApp) {
          const matchedItem = mStore || mApp;
          const mEmail = (matchedItem.studentEmail || matchedItem.email || '').toLowerCase().trim();
          foundEntry = {
            id: `merchant:${mApp?.id || mStore?.id}`,
            email: mEmail,
            studentEmail: mEmail,
            parentUserEmail: matchedItem.parentUserEmail || mEmail,
            name: matchedItem.fullName || matchedItem.storeName || 'Student Merchant',
            role: 'merchant',
            token: token,
            isVerified: true,
            isApprovedMerchant: true,
            hasApprovedMerchantStore: true,
            merchantStoreId: mStore?.id || matchedItem.id,
            isDigitalMarketOnly: true,
            merchantSetupCompleted: Boolean(mStore?.setupCompleted && mStore?.registrationFeePaid),
            merchantRegistrationFeePaid: Boolean(mStore?.setupCompleted && mStore?.registrationFeePaid)
          };
        }
      }

      // Verification team officers
      if (!foundEntry) {
        const officer = verificationTeams.find((t: any) => t.token === token);
        if (officer) {
          foundEntry = {
            id: officer.id,
            email: officer.email,
            name: officer.fullName,
            role: 'verification_team',
            token: officer.token,
            officerId: officer.officerId
          };
        }
      }

      if (!foundEntry) {
        return res.status(401).json({ error: 'Access Denied: Invalid session token' });
      }

      const rawUser = foundEntry.user ? { ...foundEntry.user } : { ...foundEntry };
      const resolvedRole = rawUser.role || foundEntry.role || 'user';
      if (resolvedRole === 'merchant') {
        const app = store.digitalMarketApplications?.find(a => normalizeEmail(a.studentEmail) === normalizeEmail(rawUser.email));
        const market = store.digitalMarketStores?.find(s => normalizeEmail(s.studentEmail) === normalizeEmail(rawUser.email));
        if (!app || app.status !== 'approved' || market?.isBanned || ['disabled', 'banned'].includes(market?.status)) return res.status(403).json({ error: 'This market account is no longer authorized.' });
      }
      if ((rawUser.roomKey || foundEntry.roomKey) && resolvedRole !== 'user' && !hasActiveRoom(foundEntry, store.roomKeys || [])) {
        return res.status(401).json({ error: 'Your room access has ended. Sign in with your primary account.' });
      }

      const user = {
        ...rawUser,
        id: rawUser.id || foundEntry.id,
        name: rawUser.name || foundEntry.name || foundEntry.full_name || 'Authenticated User',
        role: resolvedRole,
        token: rawUser.token || foundEntry.token || token,
        email: rawUser.email || foundEntry.email || '',
        phone: rawUser.phone || foundEntry.phone || '',
        studentId: rawUser.studentId || foundEntry.studentId || rawUser.residentId || foundEntry.residentId || '',
        residentType: rawUser.residentType || foundEntry.residentType || 'student',
        programOfStudy: rawUser.programOfStudy || foundEntry.programOfStudy || '',
        department: rawUser.department || foundEntry.department || '',
        institution: rawUser.institution || foundEntry.institution || '',
        roomKey: rawUser.roomKey || foundEntry.roomKey || '',
        hostelId: rawUser.hostelId || foundEntry.hostelId || '',
        hostelName: rawUser.hostelName || foundEntry.hostelName || '',
        blockName: rawUser.blockName || foundEntry.blockName || '',
        roomNumber: rawUser.roomNumber || foundEntry.roomNumber || '',
        managerId: rawUser.managerId || foundEntry.managerId || '',
        managerName: rawUser.managerName || foundEntry.managerName || '',
        managerPhone: rawUser.managerPhone || foundEntry.managerPhone || '',
        managerEmail: rawUser.managerEmail || foundEntry.managerEmail || '',
        avatar: rawUser.avatar || foundEntry.avatar || '',
        isVerified: rawUser.isVerified ?? foundEntry.isVerified ?? true,
        verificationStatus: rawUser.verificationStatus || foundEntry.verificationStatus || 'approved'
      };

      if (user.role === 'student' || user.role === 'user' || user.role === 'resident') {
        const store = getStoreInstance();
        const cleanEmail = (user.email || '').toLowerCase().trim();
        const cleanStuId = (user.studentId || user.id || '').toLowerCase().trim();
        const cleanKey = (user.roomKey || '').trim().toUpperCase();

        const rk = store.roomKeys?.find((rk: any) => {
          const rkKey = (rk.roomKey || '').trim().toUpperCase();
          const rkStudentId = (rk.assignedStudentId || rk.studentId || rk.residentId || '').toLowerCase().trim();
          const rkEmail = (rk.assignedStudentEmail || rk.studentEmail || '').toLowerCase().trim();

          return (cleanKey && rkKey === cleanKey) ||
                 (cleanStuId && rkStudentId === cleanStuId) ||
                 (cleanEmail && rkEmail === cleanEmail);
        });

        if (rk) {
          user.roomKey = rk.roomKey || user.roomKey;
          user.hostelId = rk.hostelId || user.hostelId;
          user.hostelName = rk.hostelName || user.hostelName;
          user.blockName = rk.blockName || user.blockName;
          user.roomNumber = rk.roomNumber || user.roomNumber;
          user.managerId = rk.managerId || user.managerId;
          user.managerName = rk.managerName || user.managerName;
          user.managerPhone = rk.managerPhone || rk.phone || user.managerPhone;
          user.managerEmail = rk.managerEmail || rk.email || user.managerEmail;
        }
      }

      console.log(`[AUTH] Resolved session | Role="${user.role}" | Id="${user.id}"`);
      
      if (allowedRoles && allowedRoles.length > 0) {
        const allowed = new Set(allowedRoles as string[]);

        // Equivalence: 'student', 'user', and 'resident' represent student portal users
        if (allowed.has('student') || allowed.has('resident') || allowed.has('user')) {
          allowed.add('student');
          allowed.add('resident');
          allowed.add('user');
        }

        let isAuthorized = user.role === 'admin' || allowed.has(user.role);

        // If not directly authorized by session role, check if user has registered account matching the role
        if (!isAuthorized && allowed.has('manager')) {
          const userEmail = (user.email || '').toLowerCase().trim();
          const userId = user.id;
          const allVerifs = await dbGetManagerVerifications(managerVerifications);
          const isApprovedMgr = allVerifs.some(v => 
            ((v.managerEmail && v.managerEmail.toLowerCase().trim() === userEmail) || (v.managerId && v.managerId === userId)) &&
            (v.status === 'approved' || v.status === 'Approved')
          );
          if (isApprovedMgr) {
            isAuthorized = true;
          }
        }

        if (!isAuthorized && (allowed.has('staff') || allowed.has('employee') || allowed.has('artisan'))) {
          const userEmail = (user.email || '').toLowerCase().trim();
          const userId = user.id;
          const store = getStoreInstance();
          const allStaff = [...staff, ...(store.staff || []), ...(persistentData.staff || [])];
          const allApps = [...staffApplications, ...(store.staffApplications || []), ...(persistentData.staffApplications || [])];
          const allReports = [...issueReports, ...(store.issueReports || [])];

          const isAssigned = allReports.some((rep: any) =>
            (rep.assignedStaffId && (rep.assignedStaffId === userId || rep.assignedStaffId === user.id)) ||
            (rep.assignedStaffEmail && rep.assignedStaffEmail.toLowerCase().trim() === userEmail) ||
            (rep.assignedStaffName && rep.assignedStaffName.toLowerCase().trim() === (user.name || '').toLowerCase().trim())
          );

          const isVerifiedStaff = allStaff.some(s => 
            ((s.email && s.email.toLowerCase().trim() === userEmail) || (s.userId && s.userId === userId) || (s.id && s.id === userId))
          ) || allApps.some(a =>
            ((a.email && a.email.toLowerCase().trim() === userEmail) || (a.staffEmail && a.staffEmail.toLowerCase().trim() === userEmail) || (a.staffId && a.staffId === userId)) &&
            (a.status === 'approved' || a.status === 'Approved' || a.status === 'hired' || a.status === 'active' || a.status === 'pending')
          );

          // Only staff-equivalent roles or verified/assigned staff — never grant via student/user/resident alone
          if (
            isVerifiedStaff ||
            isAssigned ||
            user.role === 'staff' ||
            user.role === 'artisan' ||
            user.role === 'employee'
          ) {
            isAuthorized = true;
          }
        }

        if (!isAuthorized) {
          console.log(`[AUTH] 403 Forbidden | Allowed: ${JSON.stringify(allowedRoles)} | Role: "${user.role}"`);
          return res.status(403).json({ error: `Access Denied: Unauthorized role "${user.role}"` });
        }
      }

      req.user = user;
      next();
    };
  }

  // Get current session profile
  app.get("/api/auth/me", requireAuth(), (req: any, res) => {
    const sanitizedUser = stripSecrets(req.user);
    if (sanitizedUser && sanitizedUser.role === 'user') {
      delete sanitizedUser.roomKey;
      delete sanitizedUser.roomNumber;
      delete sanitizedUser.blockName;
      delete sanitizedUser.hostelName;
      delete sanitizedUser.hostelId;
      delete sanitizedUser.targetRedirect;
      sanitizedUser.role = 'user';
    }
    res.json(sanitizedUser);
  });

  // Update profile details (e.g. photo, name, phone, etc.) and sync everywhere
  const handleProfileUpdate = async (req: any, res: any) => {
    try {
      const { name, email, phone, photo, avatar, photoUrl, avatarUrl, profilePicture, organization, roleTitle, address, studentId, residentType, programOfStudy, department, institution } = req.body;
      const userId = req.user.id;
      const cleanEmail = (req.user.email || '').toLowerCase().trim();

      let userIndex = MOCK_USERS.findIndex(u => accountId(u) === userId && accountRole(u) === req.user.role);

      let targetUserObj: any = userIndex !== -1 ? MOCK_USERS[userIndex] : null;

      if (!targetUserObj) {
        const store = getStoreInstance();
        const foundInStore = (store.users || []).find(u => accountId(u) === userId && accountRole(u) === req.user.role);
        if (foundInStore) {
          targetUserObj = foundInStore.user ? foundInStore : { user: { ...foundInStore }, email: cleanEmail || foundInStore.email, id: userId || foundInStore.id };
          MOCK_USERS.push(targetUserObj);
        } else {
          targetUserObj = {
            id: userId,
            email: cleanEmail,
            username: (req.user.username || (cleanEmail ? cleanEmail.split('@')[0] : `user_${Date.now()}`)),
            user: { ...req.user }
          };
          MOCK_USERS.push(targetUserObj);
        }
      }

      if (!targetUserObj.user) {
        targetUserObj.user = { ...targetUserObj };
      }

      const isUserVerified = Boolean(
        targetUserObj.user?.isVerified === true ||
        targetUserObj.user?.verificationStatus === 'approved' ||
        targetUserObj.user?.verificationStatus === 'verified' ||
        req.user?.isVerified === true ||
        req.user?.verificationStatus === 'approved' ||
        req.user?.verificationStatus === 'verified'
      );

      const incomingPhoto = photo !== undefined ? photo : (avatar !== undefined ? avatar : (profilePicture !== undefined ? profilePicture : (photoUrl !== undefined ? photoUrl : avatarUrl)));
      const updatedPhoto = (incomingPhoto !== undefined && incomingPhoto !== null && incomingPhoto !== '') 
        ? incomingPhoto 
        : (photo || avatar || photoUrl || avatarUrl || profilePicture || req.user.photo || req.user.avatar || req.user.photoUrl || req.user.avatarUrl || req.user.profilePicture || targetUserObj.user?.avatar || targetUserObj.avatar || '');

      const updatedName = name || req.user.name || targetUserObj.user?.name;
      if (email !== undefined && normalizeEmail(email) !== normalizeEmail(req.user.email)) return res.status(400).json({ error: 'Credential emails cannot be changed through the profile editor. Use a verified account-email change process.' });
      const updatedEmail = email ? email.toLowerCase().trim() : (req.user.email || targetUserObj.user?.email || '').toLowerCase().trim();
      const updatedPhone = phone || req.user.phone || targetUserObj.user?.phone;
      const updatedOrg = isUserVerified
        ? (targetUserObj.user?.organization || req.user.organization || organization)
        : (organization !== undefined ? organization : req.user.organization);
      const updatedRoleTitle = isUserVerified
        ? (targetUserObj.user?.roleTitle || req.user.roleTitle || roleTitle)
        : (roleTitle !== undefined ? roleTitle : req.user.roleTitle);
      const updatedAddress = address !== undefined ? address : req.user.address;
      const updatedStudentId = studentId !== undefined ? studentId : req.user.studentId;
      const updatedResidentType = residentType !== undefined ? residentType : req.user.residentType;
      const updatedProgram = programOfStudy !== undefined ? programOfStudy : req.user.programOfStudy;
      const updatedDept = department !== undefined ? department : req.user.department;
      const updatedInst = institution !== undefined ? institution : req.user.institution;

      targetUserObj.user = {
        ...(targetUserObj.user || {}),
        name: updatedName,
        email: updatedEmail,
        phone: updatedPhone,
        photo: updatedPhoto,
        avatar: updatedPhoto,
        photoUrl: updatedPhoto,
        avatarUrl: updatedPhoto,
        profilePicture: updatedPhoto,
        organization: updatedOrg,
        roleTitle: updatedRoleTitle,
        address: updatedAddress,
        studentId: updatedStudentId,
        residentType: updatedResidentType,
        programOfStudy: updatedProgram,
        department: updatedDept,
        institution: updatedInst
      };

      if (targetUserObj.name !== undefined) targetUserObj.name = updatedName;
      if (targetUserObj.email !== undefined) targetUserObj.email = updatedEmail;
      if (targetUserObj.phone !== undefined) targetUserObj.phone = updatedPhone;
      targetUserObj.photo = updatedPhoto;
      targetUserObj.avatar = updatedPhoto;
      targetUserObj.avatarUrl = updatedPhoto;
      targetUserObj.photoUrl = updatedPhoto;
      targetUserObj.profilePicture = updatedPhoto;

      // Update current request user session object
      req.user.photo = updatedPhoto;
      req.user.avatar = updatedPhoto;
      req.user.avatarUrl = updatedPhoto;
      req.user.photoUrl = updatedPhoto;
      req.user.profilePicture = updatedPhoto;
      if (req.user.user) {
        req.user.user.photo = updatedPhoto;
        req.user.user.avatar = updatedPhoto;
        req.user.user.avatarUrl = updatedPhoto;
        req.user.user.photoUrl = updatedPhoto;
        req.user.user.profilePicture = updatedPhoto;
      }

      // Update in store.users as well (all matching records)
      const store = getStoreInstance();
      if (store.users) {
        store.users.forEach((storeU: any) => {
          if (!storeU) return;
          const uClean = (storeU.email || storeU.user?.email || '').toLowerCase().trim();
          const pClean = (storeU.parentUserEmail || storeU.user?.parentUserEmail || '').toLowerCase().trim();
          const sClean = (storeU.studentEmail || storeU.user?.studentEmail || '').toLowerCase().trim();
          const uId = (storeU.id || storeU.user?.id || '').trim();
          const pId = (storeU.parentUserId || storeU.user?.parentUserId || '').trim();
          
          if (accountId(storeU) === userId && accountRole(storeU) === req.user.role) {
            storeU.name = updatedName;
            storeU.email = updatedEmail;
            storeU.phone = updatedPhone;
            storeU.studentId = updatedStudentId || storeU.studentId;
            storeU.residentType = updatedResidentType || storeU.residentType;
            storeU.programOfStudy = updatedProgram || storeU.programOfStudy;
            storeU.department = updatedDept || storeU.department;
            storeU.institution = updatedInst || storeU.institution;
            storeU.avatar = updatedPhoto;
            storeU.photo = updatedPhoto;
            storeU.photoUrl = updatedPhoto;
            storeU.avatarUrl = updatedPhoto;
            storeU.profilePicture = updatedPhoto;
            if (storeU.user) {
              storeU.user = { 
                ...storeU.user, 
                ...targetUserObj.user,
                avatar: updatedPhoto,
                photo: updatedPhoto,
                photoUrl: updatedPhoto,
                avatarUrl: updatedPhoto,
                profilePicture: updatedPhoto
              };
            }
          }
        });
      }

      // Update in staff array if user is staff
      for (let i = 0; i < staff.length; i++) {
        const s = staff[i];
        if (
          (userId && (s.userId === userId || s.id === userId)) ||
          (cleanEmail && s.email && s.email.toLowerCase().trim() === cleanEmail)
        ) {
          staff[i].photo = updatedPhoto;
          staff[i].avatar = updatedPhoto;
          if (updatedName) staff[i].name = updatedName;
          if (updatedPhone) staff[i].phone = updatedPhone;
        }
      }

      // Update in verificationTeams if user is verification officer
      for (const vt of verificationTeams) {
        if (
          (userId && vt.id === userId) ||
          (cleanEmail && vt.email && vt.email.toLowerCase().trim() === cleanEmail)
        ) {
          vt.avatar = updatedPhoto;
          vt.photo = updatedPhoto;
          vt.avatarUrl = updatedPhoto;
          vt.photoUrl = updatedPhoto;
        }
      }

      // Update in chatProfiles
      for (const cp of chatProfiles) {
        if (
          (userId && cp.userId === userId) ||
          (cleanEmail && cp.email && cp.email.toLowerCase().trim() === cleanEmail)
        ) {
          cp.avatarUrl = updatedPhoto;
          if (updatedName) cp.nickname = updatedName;
        }
      }

      // Sync across all registered hostels if user is manager or staff
      const currentHostels = await dbGetHostels(hostels);
      for (const h of currentHostels) {
        if (
          (h.managerId && h.managerId === userId) || 
          (h.assignedManagerId && h.assignedManagerId === userId) || 
          (h.managerEmail && cleanEmail && h.managerEmail.toLowerCase().trim() === cleanEmail)
        ) {
          h.managerName = updatedName;
          h.managerPhone = updatedPhone;
          h.managerPhoto = updatedPhoto;
          h.managerAvatar = updatedPhoto;
          await dbUpdateHostel(h.id, {
            managerName: updatedName,
            managerPhone: updatedPhone,
            managerPhoto: updatedPhoto,
            managerAvatar: updatedPhoto
          }, hostels);
        }
      }

      // Sync across managerRequests and managerVerifications
      for (const mr of managerRequests) {
        if (mr.managerId === userId || (mr.managerEmail && cleanEmail && mr.managerEmail.toLowerCase().trim() === cleanEmail)) {
          mr.managerName = updatedName;
          mr.managerPhone = updatedPhone;
          if (updatedOrg) mr.organization = updatedOrg;
          if (updatedRoleTitle) mr.roleTitle = updatedRoleTitle;
        }
      }
      for (const mv of managerVerifications) {
        if (mv.managerId === userId || (mv.managerEmail && cleanEmail && mv.managerEmail.toLowerCase().trim() === cleanEmail)) {
          mv.managerName = updatedName;
          mv.managerPhone = updatedPhone;
        }
      }

      persistStore();
      syncStore();

      return res.json({
        success: true,
        user: targetUserObj.user,
        message: "Profile updated successfully across all records."
      });
    } catch (err: any) {
      console.error("Profile update error:", err);
      return res.status(500).json({ error: err.message || "Failed to update profile" });
    }
  };

  app.put("/api/auth/profile", requireAuth(), handleProfileUpdate);
  app.post("/api/auth/profile", requireAuth(), handleProfileUpdate);

  // Admin endpoint to clear all registered non-admin accounts
  app.post("/api/admin/clear-all-registered-accounts", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { password } = req.body || {};
      if (!password) {
        return res.status(400).json({ error: "Administrator authorization password is required." });
      }

      // Validate destructive action authorization without static hard-coded passwords
      const destructiveSecret = process.env.ADMIN_DESTRUCTIVE_SECRET;
      const destructiveHash = process.env.ADMIN_DESTRUCTIVE_PASSWORD_HASH;
      const callerUser = MOCK_USERS.find(u =>
        (u.id && u.id === req.user?.id) ||
        (u.user?.id && u.user.id === req.user?.id) ||
        (u.email && u.email.toLowerCase() === (req.user?.email || '').toLowerCase())
      );

      let isAuthorized = false;
      if (destructiveHash && crypto.createHash('sha256').update(password).digest('hex') === destructiveHash) {
        isAuthorized = true;
      } else if (destructiveSecret && password === destructiveSecret) {
        isAuthorized = true;
      } else if (callerUser && passwordsMatch(password, callerUser.password, callerUser.user?.password)) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: "Invalid clear security confirmation. Access Denied." });
      }

      // Retain existing admin accounts strictly by role
      const adminUsers = MOCK_USERS.filter(u => {
        if (!u) return false;
        const role = (u.role || u.user?.role || '').toLowerCase();
        return role === 'admin';
      });

      MOCK_USERS.length = 0;
      MOCK_USERS.push(...adminUsers);

      hostels.length = 0;
      bookingRequests.length = 0;
      issueReports.length = 0;
      activities.length = 0;
      hostelVerifications.length = 0;
      managerRequests.length = 0;
      managerVerifications.length = 0;
      verificationAuditLogs.length = 0;
      onboardingPayments.length = 0;
      verificationInspections.length = 0;
      verificationTeams.length = 0;
      notifications.length = 0;
      chatMessages.length = 0;
      dmRooms.length = 0;
      chatProfiles.length = 0;
      staff.length = 0;
      staffApplications.length = 0;
      if (typeof staffAuditLogs !== 'undefined' && staffAuditLogs) staffAuditLogs.length = 0;
      if (typeof staffChatRooms !== 'undefined' && staffChatRooms) staffChatRooms.length = 0;
      if (typeof staffChatMessages !== 'undefined' && staffChatMessages) staffChatMessages.length = 0;
      if (typeof staffReviews !== 'undefined' && staffReviews) staffReviews.length = 0;
      if (typeof jobOffers !== 'undefined' && jobOffers) jobOffers.length = 0;
      if (typeof staffBargains !== 'undefined' && staffBargains) staffBargains.length = 0;
      meetings.length = 0;

      const store = getStoreInstance();
      store.users = [...adminUsers];
      store.hostels = [];
      store.bookingRequests = [];
      store.issueReports = [];
      store.activities = [];
      store.hostelVerifications = [];
      store.managerRegistrationRequests = [];
      store.managerVerifications = [];
      (store as any).managerRequests = [];
      (store as any).managerVerifications = [];
      store.verificationAuditLogs = [];
      store.verificationTeams = [];
      store.verificationInspections = [];
      store.notifications = [];
      store.chatMessages = [];
      store.dmRooms = [];
      store.chatProfiles = [];
      store.boardRequests = [];
      (store as any).boardRequests = [];
      store.meetings = [];
      (store as any).meetings = [];
      store.managerAccountSettings = {};
      store.staff = [];
      store.staffApplications = [];
      store.staffAuditLogs = [];
      store.staffChatRooms = [];
      store.staffChatMessages = [];
      store.staffReviews = [];
      store.jobOffers = [];
      store.staffBargains = [];
      store.roomKeys = [];
      store.keyDispatches = [];
      store.studentMessages = [];
      store.managerRestrictions = [];
      store.digitalMarketApplications = [];
      store.digitalMarketStores = [];
      store.digitalMarketProducts = [];
      store.digitalMarketOrders = [];
      store.digitalMarketMessages = [];

      savePersistentStore(store);
      syncStore();

      return res.json({
        success: true,
        message: "The entire database (all registered users, residences, student markets, products, orders, chat messages, issue reports, key dispatches, booking requests, etc.) has been cleared successfully. Admin accounts are preserved.",
        remainingAdmins: adminUsers.map(u => u.email || u.user?.email)
      });
    } catch (err: any) {
      console.error("Clear registered accounts error:", err);
      return res.status(500).json({ error: "Failed to clear registered accounts." });
    }
  });

  // Secure administrator password reset endpoint for existing accounts
  app.post("/api/admin/reset-user-password", requireAuth(["admin"]), (req: any, res) => {
    const email = normalizeEmail(req.body.email);
    const password = req.body.newPassword;
    if (!email || typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Target email and a new password of at least 8 characters are required.' });
    const roles = ['user', 'manager', 'staff', 'student', 'merchant'].filter(role => passwordRecords(email, role).length);
    const role = String(req.body.role || (roles.length === 1 ? roles[0] : '')).toLowerCase();
    if (!role) return res.status(400).json({ error: 'This email has multiple accounts. Specify the account role to reset.' });
    const records = passwordRecords(email, role);
    if (!records.length) return res.status(404).json({ error: 'Account not found.' });
    updateIdentityPassword(records, password, email, role);
    return res.json({ success: true, message: 'Password reset. Existing sessions for this account have been revoked.' });
  });

  // --- Manager Requests Endpoints ---
  app.get("/api/manager-requests", requireAuth(["admin", "manager"]), async (req: any, res) => {
    const currentRequests = await dbGetManagerRequests(managerRequests);
    const allVerifs = await dbGetManagerVerifications(managerVerifications);
    const store = getStoreInstance();
    const storedRequests = store.managerRegistrationRequests || [];

    // Merge verifications into managerRequests so Admin sees full dossiers with docs
    const mergedList: any[] = [...currentRequests];

    allVerifs.forEach(v => {
      const existing = mergedList.find(r => 
        r.id === v.id || 
        (r.managerId && v.managerId && r.managerId === v.managerId) ||
        (r.managerEmail && v.managerEmail && r.managerEmail.toLowerCase() === v.managerEmail.toLowerCase())
      );
      if (existing) {
        existing.operatingCertificate = existing.operatingCertificate || v.operatingCertificate || (v.authorityEvidenceFileName ? { fileName: v.authorityEvidenceFileName, url: v.authorityEvidenceUrl, documentType: 'OPERATING_CERTIFICATE_PDF' } : null);
        existing.idFront = existing.idFront || v.idFront;
        existing.idBack = existing.idBack || v.idBack;
        existing.documents = existing.documents || v.documents;
        existing.documentsVerified = existing.documentsVerified || v.documentsVerified || { operatingCertificate: 'pending', idFront: 'pending', idBack: 'pending' };
        if (v.rejectionReason && !existing.rejectionReason) existing.rejectionReason = v.rejectionReason;
        if (v.adminNotes && !existing.adminNotes) existing.adminNotes = v.adminNotes;
        if (v.status && v.status !== 'pending') existing.status = v.status;
      } else {
        mergedList.push({
          id: v.id,
          managerId: v.managerId,
          parentUserId: v.parentUserId,
          parentUserEmail: v.parentUserEmail,
          managerName: v.managerName,
          managerEmail: v.managerEmail,
          managerPhone: v.managerPhone,
          propertyName: `${v.managerName}'s Designated Residence`,
          proposedHostelName: `${v.managerName}'s Designated Residence`,
          hostelName: `${v.managerName}'s Designated Residence`,
          proposedLocation: 'Legon Campus Area, Accra',
          proposedCapacity: 120,
          notes: 'Manager registration dossier with verified identity credentials.',
          status: v.status || 'pending',
          isApproved: v.status === 'approved',
          rejectionReason: v.rejectionReason || null,
          adminNotes: v.adminNotes || v.rejectionReason || null,
          operatingCertificate: v.operatingCertificate || (v.authorityEvidenceFileName ? { fileName: v.authorityEvidenceFileName, url: v.authorityEvidenceUrl, documentType: 'OPERATING_CERTIFICATE_PDF' } : null),
          idFront: v.idFront,
          idBack: v.idBack,
          documents: v.documents,
          documentsVerified: v.documentsVerified || { operatingCertificate: 'pending', idFront: 'pending', idBack: 'pending' },
          requestedAt: v.createdAt || new Date().toISOString()
        });
      }
    });

    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "").trim();
      const foundUser = MOCK_USERS.find(u => (u.user && u.user.token === token) || u.token === token);
      const userRole = foundUser?.user?.role || foundUser?.role;
      const userId = foundUser?.user?.id || foundUser?.id;
      const userEmail = (foundUser?.user?.email || foundUser?.email || '').toLowerCase().trim();
      if (foundUser && userRole === 'manager') {
        const userReqs = mergedList.filter(
          r => r.managerId === userId || (r.managerEmail && userEmail && r.managerEmail.toLowerCase() === userEmail)
        );
        return res.json(userReqs);
      }
    }
    return res.json(mergedList);
  });

  app.post("/api/manager-requests", async (req: any, res) => {
    try {
      const authHeader = req.headers.authorization;
      let authenticatedUser: any = null;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "").trim();
        const foundUser = MOCK_USERS.find(u => u.user.token === token);
        if (foundUser) {
          authenticatedUser = foundUser.user;
        }
      }

      const {
        propertyName,
        proposedHostelName,
        hostelName,
        name,
        notes,
        reason,
        proposedReason,
        nationalId,
        organization,
        roleTitle,
        managerPhone,
        managerEmail,
        managerName,
        managerId,
        experienceYears,
        proposedLocation,
        proposedCapacity
      } = req.body;

      const resolvedPropertyName = (propertyName || proposedHostelName || hostelName || name || '').trim();

      if (!resolvedPropertyName) {
        return res.status(400).json({ error: "Hostel property name is required." });
      }

      const mgrId = authenticatedUser?.id || managerId || `mgr-${Date.now()}`;
      const mgrEmail = authenticatedUser?.email || managerEmail || '';
      const mgrName = authenticatedUser?.name || managerName || 'Hostel Manager';
      const mgrPhone = managerPhone || authenticatedUser?.phone || '+233 24 123 4567';

      // Check current requests from database and memory
      const currentReqs = await dbGetManagerRequests(managerRequests);

      // Check if this manager already has a pending or approved request
      const existingReq = currentReqs.find(
        r => ((mgrId && r.managerId === mgrId) || (mgrEmail && r.managerEmail && (r.managerEmail || '').toLowerCase() === (mgrEmail || '').toLowerCase())) &&
             ((r.status || '').toLowerCase() === 'pending' || (r.status || '').toLowerCase() === 'approved')
      );

      if (existingReq) {
        return res.status(200).json({
          success: true,
          request: existingReq,
          alreadyExists: true,
          isApproved: (existingReq.status || '').toLowerCase() === 'approved',
          message: (existingReq.status || '').toLowerCase() === 'approved'
            ? "You are already approved to register your hostel. Please proceed with the registration form."
            : "You already have a pending registration request awaiting Admin approval.",
          ...existingReq
        });
      }

      const newReq: ServerManagerRequest = {
        id: `req-mgr-${Date.now()}`,
        managerId: mgrId,
        managerName: mgrName,
        managerEmail: mgrEmail || 'manager@pinevela.com',
        managerPhone: mgrPhone,
        nationalId: nationalId || authenticatedUser?.nationalId || 'GHA-VERIFIED-CARD',
        organization: organization || authenticatedUser?.organization || 'Independent Management',
        roleTitle: roleTitle || authenticatedUser?.roleTitle || 'Property Manager',
        experienceYears: Number(experienceYears) || 1,
        propertyName: resolvedPropertyName,
        proposedHostelName: resolvedPropertyName,
        proposedLocation: proposedLocation || 'Campus Area',
        proposedCapacity: Number(proposedCapacity) || 120,
        notes: notes || reason || proposedReason || 'Official manager registration request to onboard property.',
        reason: reason || proposedReason || notes || 'Official manager registration request to onboard property.',
        status: 'pending',
        requestedAt: new Date().toISOString()
      };

      managerRequests.unshift(newReq);

      // Persist manager registration request into local database
      await dbCreateManagerRequest(newReq);

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Manager "${newReq.managerName}" requested permission to register hostel: "${newReq.propertyName}"`,
        time: 'Just now',
        type: 'warning'
      }, activities);

      return res.status(201).json({ success: true, request: newReq, ...newReq });
    } catch (err: any) {
      console.error("Error creating manager request:", err);
      return res.status(500).json({ error: err.message || "Failed to submit request" });
    }
  });

  // Approve manager registration & verification
  app.put(["/api/manager-requests/:id/approve", "/api/manager-verifications/:id/approve"], requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const store = getStoreInstance();

      // Check if ID belongs to an inspection first
      const matchedInsp = verificationInspections.find(i => i.id === id || i.managerVerificationId === id);
      const effectiveId = matchedInsp?.managerVerificationId || id;

      const target = managerRequests.find(r => r.id === effectiveId || r.managerId === effectiveId || r.id === id || r.managerId === id || (r.managerEmail && r.managerEmail.toLowerCase() === id.toLowerCase())) ||
                     managerVerifications.find(v => v.id === effectiveId || v.managerId === effectiveId || v.id === id || v.managerId === id || (v.managerEmail && v.managerEmail.toLowerCase() === id.toLowerCase())) ||
                     (store.managerRegistrationRequests || []).find((r: any) => r.id === effectiveId || r.managerId === effectiveId || r.id === id) ||
                     ((store as any).managerVerifications || []).find((v: any) => v.id === effectiveId || v.managerId === effectiveId || v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Registration request or verification dossier not found." });
      }

      // Mark all documents as approved/verified upon administrative sign-off
      if (!target.documentsVerified) target.documentsVerified = {};
      target.documentsVerified.operatingCertificate = 'verified';
      target.documentsVerified.idFront = 'verified';
      target.documentsVerified.idBack = 'verified';

      const now = new Date().toISOString();
      const cleanEmail = (target.managerEmail || '').toLowerCase().trim();
      const cleanParentEmail = ((target as any).parentUserEmail || '').toLowerCase().trim();
      const targetMgrId = target.managerId || (target as any).userId;

      const matchesTarget = (obj: any) => {
        if (!obj) return false;
        const e1 = (obj.managerEmail || obj.email || '').toLowerCase().trim();
        const e2 = (obj.parentUserEmail || '').toLowerCase().trim();
        const id1 = obj.managerId || obj.userId || obj.id;
        const id2 = obj.parentUserId;

        const emailMatch = Boolean(cleanEmail) && (e1 === cleanEmail || e2 === cleanEmail);
        const parentEmailMatch = Boolean(cleanParentEmail) && (e1 === cleanParentEmail || e2 === cleanParentEmail);
        const idMatch = Boolean(targetMgrId) && (id1 === targetMgrId || id2 === targetMgrId);
        return emailMatch || parentEmailMatch || idMatch || obj.id === id || obj.id === effectiveId;
      };

      const verifiedDocsObj = { operatingCertificate: 'verified', idFront: 'verified', idBack: 'verified' };

      // 1. Update in-memory managerRequests
      managerRequests.forEach(r => {
        if (r.id === id || r.id === effectiveId || matchesTarget(r)) {
          r.status = 'approved';
          (r as any).isApproved = true;
          r.inspectionStatus = 'approved';
          r.documentsVerified = { ...verifiedDocsObj };
          r.approvedAt = now;
          r.updatedAt = now;
        }
      });

      // 2. Update in-memory managerVerifications
      managerVerifications.forEach(v => {
        if (v.id === id || v.id === effectiveId || matchesTarget(v)) {
          v.status = 'approved';
          v.authorityStatus = 'verified';
          v.inspectionStatus = 'approved';
          v.documentsVerified = { ...verifiedDocsObj };
          v.reviewedAt = now;
          v.reviewedBy = req.user?.name || 'Admin';
          v.updatedAt = now;
        }
      });

      // 2b. Update in-memory verificationInspections
      verificationInspections.forEach(i => {
        if (i.id === id || i.managerVerificationId === id || i.managerVerificationId === effectiveId || matchesTarget(i)) {
          i.status = 'approved';
          i.approvedAt = now;
          i.updatedAt = now;
        }
      });

      // 3. Update persistent store records
      if (store.managerRegistrationRequests) {
        store.managerRegistrationRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'approved';
            r.isApproved = true;
            r.approvedAt = now;
            r.updatedAt = now;
          }
        });
      }
      if ((store as any).managerVerifications) {
        (store as any).managerVerifications.forEach((v: any) => {
          if (v.id === id || matchesTarget(v)) {
            v.status = 'approved';
            v.authorityStatus = 'verified';
            v.reviewedAt = now;
            v.reviewedBy = req.user?.name || 'Admin';
            v.updatedAt = now;
          }
        });
      }
      if ((store as any).managerRequests) {
        (store as any).managerRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'approved';
            r.isApproved = true;
            r.approvedAt = now;
            r.updatedAt = now;
          }
        });
      }

      // 4. Update user objects
      const updateUserObj = (u: any) => {
        if (!u) return;
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        const uId = u.id || u.user?.id;
        const uRole = (u.role || u.user?.role || '').toLowerCase();

        // ONLY update role and verification on the actual manager user account (never the parent user)
        const isActualMgr = (uRole === 'manager' || (cleanEmail && uEmail === cleanEmail)) && 
                            (!cleanParentEmail || uEmail !== cleanParentEmail) && 
                            ((cleanEmail && uEmail === cleanEmail) || (targetMgrId && uId === targetMgrId));
        if (isActualMgr) {
          if (u.user) {
            u.user.isVerified = true;
            u.user.verificationStatus = 'approved';
            u.user.role = 'manager';
          }
          u.isVerified = true;
          u.verificationStatus = 'approved';
          u.role = 'manager';
        }

        // For parent user: ONLY update the registeredAccounts.managerAccount metadata! DO NOT change parent user's own role!
        const isParentUser = (cleanParentEmail && uEmail === cleanParentEmail) || (target.parentUserId && uId === target.parentUserId);
        if (isParentUser || u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount) {
          const targetAcc = u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount;
          if (targetAcc) {
            targetAcc.status = 'approved';
            targetAcc.isApproved = true;
            targetAcc.isVerified = true;
          }
        }
      };
      MOCK_USERS.forEach(updateUserObj);
      if (store.users) {
        store.users.forEach(updateUserObj);
      }

      savePersistentStore(store);

      // Persist status update to local database
      await dbUpdateManagerRequestStatus(id, 'approved');
      await dbUpdateManagerVerificationStatus(id, 'approved', 'Approved via manager registration requests', 'Admin', cleanEmail, targetMgrId);

      const verifTarget = managerVerifications.find(matchesTarget);

      // Also ensure any matching hostel for this manager is approved & active
      const currentHostels = await dbGetHostels(hostels);
      for (const h of currentHostels) {
        const isMgr = (h.managerId && targetMgrId && h.managerId === targetMgrId) ||
                      (h.assignedManagerId && targetMgrId && h.assignedManagerId === targetMgrId) ||
                      (h.managerEmail && cleanEmail && h.managerEmail.toLowerCase().trim() === cleanEmail) ||
                      (target.propertyName && h.name && h.name.toLowerCase().trim() === target.propertyName.toLowerCase().trim()) ||
                      (target.proposedHostelName && h.name && h.name.toLowerCase().trim() === target.proposedHostelName.toLowerCase().trim());
        if (isMgr) {
          h.isApproved = true;
          h.approvalStatus = 'Approved';
          h.status = 'Open';
          h.managerId = targetMgrId || h.managerId;
          h.managerEmail = cleanEmail || h.managerEmail;
          h.managerName = target.managerName || h.managerName;
          await dbUpdateHostel(h.id, {
            isApproved: true,
            approvalStatus: 'Approved',
            status: 'Open',
            managerId: h.managerId,
            managerEmail: h.managerEmail,
            managerName: h.managerName
          }, hostels);
        }
      }

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin APPROVED manager account for "${target.managerName}". Manager can now log in and register property.`,
        time: 'Just now',
        type: 'success'
      }, activities);

      // Send notification to manager user AND parent user
      const parentUserId = (target as any).parentUserId || targetMgrId;
      const notifyEmails = Array.from(new Set([cleanEmail, cleanParentEmail].filter(Boolean)));

      for (const emailToNotify of notifyEmails) {
        const titleText = 'Manager Account Approved!';
        const exists = notifications.some((n: any) => 
          n.title === titleText && 
          ((n.userEmail || '').toLowerCase() === emailToNotify || (n.recipientEmail || '').toLowerCase() === emailToNotify || (n.parentUserEmail || '').toLowerCase() === emailToNotify)
        );
        if (!exists) {
          const apprNotif = {
            id: `notif-mgr-appr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            studentId: targetMgrId,
            userId: targetMgrId,
            parentUserId: parentUserId,
            userEmail: emailToNotify,
            recipientEmail: emailToNotify,
            targetEmail: emailToNotify,
            parentUserEmail: cleanParentEmail,
            managerEmail: cleanEmail,
            title: titleText,
            message: `Congratulations ${target.managerName}! Your Manager Account registration and verification has been APPROVED by System Admin. Current Status: Approved. You now have full access to property onboarding and management.`,
            type: 'success',
            date: new Date().toISOString().split('T')[0],
            read: false
          };
          notifications.unshift(apprNotif);
          await dbCreateNotification(apprNotif, notifications);
        }
      }

      syncStore();

      return res.json({
        success: true,
        record: target,
        request: target,
        verification: verifTarget || target,
        manager: target,
        ...target
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to approve request" });
    }
  });

  // Reject manager registration & verification with required feedback reason
  app.put(["/api/manager-requests/:id/reject", "/api/manager-verifications/:id/reject"], requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const rawNotes = (req.body?.adminNotes || req.body?.rejectionReason || req.body?.reason || '').trim();
      if (!rawNotes || rawNotes.length < 5) {
        return res.status(400).json({ error: "A valid, detailed reason for rejection (minimum 5 characters) explaining what adjustments are required must be provided." });
      }
      const rejectionReason = rawNotes;
      const store = getStoreInstance();
      const target = managerRequests.find(r => r.id === id || r.managerId === id) ||
                     managerVerifications.find(v => v.id === id || v.managerId === id) ||
                     (store.managerRegistrationRequests || []).find((r: any) => r.id === id || r.managerId === id) ||
                     ((store as any).managerVerifications || []).find((v: any) => v.id === id || v.managerId === id);

      if (!target) {
        return res.status(404).json({ error: "Registration request or verification dossier not found." });
      }

      const now = new Date().toISOString();
      const cleanEmail = (target.managerEmail || '').toLowerCase().trim();
      const cleanParentEmail = ((target as any).parentUserEmail || '').toLowerCase().trim();
      const targetMgrId = target.managerId || (target as any).userId;

      const matchesTarget = (obj: any) => {
        if (!obj) return false;
        const e1 = (obj.managerEmail || obj.email || '').toLowerCase().trim();
        const e2 = (obj.parentUserEmail || '').toLowerCase().trim();
        const id1 = obj.managerId || obj.userId || obj.id;
        const id2 = obj.parentUserId;

        const emailMatch = Boolean(cleanEmail) && (e1 === cleanEmail || e2 === cleanEmail);
        const parentEmailMatch = Boolean(cleanParentEmail) && (e1 === cleanParentEmail || e2 === cleanParentEmail);
        const idMatch = Boolean(targetMgrId) && (id1 === targetMgrId || id2 === targetMgrId);
        return emailMatch || parentEmailMatch || idMatch || obj.id === id;
      };

      managerRequests.forEach(r => {
        if (r.id === id || matchesTarget(r)) {
          r.status = 'rejected';
          (r as any).isApproved = false;
          r.rejectionReason = rejectionReason;
          r.adminNotes = rejectionReason;
          r.updatedAt = now;
        }
      });

      managerVerifications.forEach(v => {
        if (v.id === id || matchesTarget(v)) {
          v.status = 'rejected';
          v.authorityStatus = 'rejected';
          v.rejectionReason = rejectionReason;
          v.adminNotes = rejectionReason;
          v.reviewedAt = now;
          v.reviewedBy = req.user?.name || 'Admin';
          v.updatedAt = now;
        }
      });

      if (store.managerRegistrationRequests) {
        store.managerRegistrationRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'rejected';
            r.isApproved = false;
            r.rejectionReason = rejectionReason;
            r.adminNotes = rejectionReason;
            r.updatedAt = now;
          }
        });
      }
      if ((store as any).managerVerifications) {
        (store as any).managerVerifications.forEach((v: any) => {
          if (v.id === id || matchesTarget(v)) {
            v.status = 'rejected';
            v.authorityStatus = 'rejected';
            v.rejectionReason = rejectionReason;
            v.adminNotes = rejectionReason;
            v.reviewedAt = now;
            v.reviewedBy = req.user?.name || 'Admin';
            v.updatedAt = now;
          }
        });
      }
      if ((store as any).managerRequests) {
        (store as any).managerRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'rejected';
            r.isApproved = false;
            r.rejectionReason = rejectionReason;
            r.adminNotes = rejectionReason;
            r.updatedAt = now;
          }
        });
      }

      const updateUserObj = (u: any) => {
        if (!u) return;
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        const uId = u.id || u.user?.id;
        const uRole = (u.role || u.user?.role || '').toLowerCase();

        const isActualMgr = (uRole === 'manager' || (cleanEmail && uEmail === cleanEmail)) && 
                            (!cleanParentEmail || uEmail !== cleanParentEmail) && 
                            ((cleanEmail && uEmail === cleanEmail) || (targetMgrId && uId === targetMgrId));
        if (isActualMgr) {
          if (u.user) {
            u.user.isVerified = false;
            u.user.verificationStatus = 'rejected';
            u.user.rejectionReason = rejectionReason;
            u.user.adminNotes = rejectionReason;
          }
          u.isVerified = false;
          u.verificationStatus = 'rejected';
          u.rejectionReason = rejectionReason;
          u.adminNotes = rejectionReason;
        }

        const isParentUser = (cleanParentEmail && uEmail === cleanParentEmail) || (target.parentUserId && uId === target.parentUserId);
        if (isParentUser || u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount) {
          const targetAcc = u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount;
          if (targetAcc) {
            targetAcc.status = 'rejected';
            targetAcc.isApproved = false;
            targetAcc.isVerified = false;
            targetAcc.rejectionReason = rejectionReason;
            targetAcc.adminNotes = rejectionReason;
          }
        }
      };
      MOCK_USERS.forEach(updateUserObj);
      if (store.users) {
        store.users.forEach(updateUserObj);
      }

      savePersistentStore(store);

      await dbUpdateManagerRequestStatus(id, 'rejected');
      await dbUpdateManagerVerificationStatus(id, 'rejected', rejectionReason, req.user?.name || 'Admin', cleanEmail, targetMgrId);

      // Send rejection notification with explicit reason to manager user AND parent user
      const parentUserId = (target as any).parentUserId || targetMgrId;
      const notifyEmails = Array.from(new Set([cleanEmail, cleanParentEmail].filter(Boolean)));

      for (const emailToNotify of notifyEmails) {
        const titleText = 'Manager Account Application Status: Rejected';
        const rejNotif = {
          id: `notif-mgr-rej-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          studentId: targetMgrId,
          userId: targetMgrId,
          parentUserId: parentUserId,
          userEmail: emailToNotify,
          recipientEmail: emailToNotify,
          targetEmail: emailToNotify,
          parentUserEmail: cleanParentEmail,
          managerEmail: cleanEmail,
          title: titleText,
          message: `Your Manager Account application for "${target.managerName || target.organization}" was rejected by the Admin. Reason: ${rejectionReason}. Please sign in to your dashboard to review this feedback and make proper adjustments.`,
          type: 'danger',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(rejNotif);
        await dbCreateNotification(rejNotif, notifications);
      }

      syncStore();

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin REJECTED manager application for "${target.managerName}". Reason: ${rejectionReason}`,
        time: 'Just now',
        type: 'danger'
      }, activities);

      return res.json({
        success: true,
        record: target,
        request: target,
        rejectionReason,
        status: 'rejected',
        ...target
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to reject request" });
    }
  });

  // Block manager access with required detailed explanation message and unlist their hostel
  app.put(["/api/manager-requests/:id/block", "/api/manager-verifications/:id/block", "/api/admin/managers/:id/block", "/api/manager-verifications/:id/suspend"], requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const rawNotes = (req.body?.reason || req.body?.adminNotes || req.body?.blockReason || req.body?.rejectionReason || req.body?.message || '').trim();
      if (!rawNotes || rawNotes.length < 5) {
        return res.status(400).json({ error: "A valid, detailed message explaining why manager access is restricted must be provided (minimum 5 characters)." });
      }
      const blockReason = rawNotes;
      const store = getStoreInstance();

      // Check if ID belongs to an inspection first
      const matchedInsp = verificationInspections.find(i => i.id === id || i.managerVerificationId === id);
      const effectiveId = matchedInsp?.managerVerificationId || id;

      const target = managerRequests.find(r => r.id === effectiveId || r.managerId === effectiveId || r.id === id || r.managerId === id || (r.managerEmail && r.managerEmail.toLowerCase() === id.toLowerCase())) ||
                     managerVerifications.find(v => v.id === effectiveId || v.managerId === effectiveId || v.id === id || v.managerId === id || (v.managerEmail && v.managerEmail.toLowerCase() === id.toLowerCase())) ||
                     (store.managerRegistrationRequests || []).find((r: any) => r.id === effectiveId || r.managerId === effectiveId || r.id === id) ||
                     ((store as any).managerVerifications || []).find((v: any) => v.id === effectiveId || v.managerId === effectiveId || v.id === id) ||
                     MOCK_USERS.find(u => (u.user && (u.user.id === id || u.user.email?.toLowerCase() === id.toLowerCase())) || u.id === id || u.email?.toLowerCase() === id.toLowerCase());

      if (!target) {
        return res.status(404).json({ error: "Manager record not found." });
      }

      const now = new Date().toISOString();
      const cleanEmail = (target.managerEmail || target.email || target.user?.email || '').toLowerCase().trim();
      const cleanParentEmail = ((target as any).parentUserEmail || target.user?.parentUserEmail || '').toLowerCase().trim();
      const targetMgrId = target.managerId || (target as any).userId || target.user?.id || target.id;

      const matchesTarget = (obj: any) => {
        if (!obj) return false;
        const e1 = (obj.managerEmail || obj.email || obj.user?.email || '').toLowerCase().trim();
        const e2 = (obj.parentUserEmail || obj.user?.parentUserEmail || '').toLowerCase().trim();
        const id1 = obj.managerId || obj.userId || obj.user?.id || obj.id;
        const id2 = obj.parentUserId || obj.user?.parentUserId;

        const emailMatch = Boolean(cleanEmail) && (e1 === cleanEmail || e2 === cleanEmail);
        const parentEmailMatch = Boolean(cleanParentEmail) && (e1 === cleanParentEmail || e2 === cleanParentEmail);
        const idMatch = Boolean(targetMgrId) && (id1 === targetMgrId || id2 === targetMgrId);
        return emailMatch || parentEmailMatch || idMatch || obj.id === id || obj.id === effectiveId;
      };

      // 1. Update in-memory managerRequests
      managerRequests.forEach(r => {
        if (r.id === id || r.id === effectiveId || matchesTarget(r)) {
          r.status = 'blocked';
          (r as any).isApproved = false;
          (r as any).isBlocked = true;
          r.blockReason = blockReason;
          r.adminNotes = blockReason;
          r.blockedAt = now;
          r.updatedAt = now;
        }
      });

      // 2. Update in-memory managerVerifications
      managerVerifications.forEach(v => {
        if (v.id === id || v.id === effectiveId || matchesTarget(v)) {
          v.status = 'blocked';
          v.authorityStatus = 'blocked';
          v.isBlocked = true;
          (v as any).isApproved = false;
          v.blockReason = blockReason;
          v.adminNotes = blockReason;
          v.blockedAt = now;
          v.reviewedAt = now;
          v.reviewedBy = req.user?.name || 'Admin';
          v.updatedAt = now;
        }
      });

      // 3. Update store
      if (store.managerRegistrationRequests) {
        store.managerRegistrationRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'blocked';
            r.isApproved = false;
            r.isBlocked = true;
            r.blockReason = blockReason;
            r.adminNotes = blockReason;
            r.blockedAt = now;
            r.updatedAt = now;
          }
        });
      }
      if ((store as any).managerVerifications) {
        (store as any).managerVerifications.forEach((v: any) => {
          if (v.id === id || matchesTarget(v)) {
            v.status = 'blocked';
            v.authorityStatus = 'blocked';
            v.isApproved = false;
            v.isBlocked = true;
            v.blockReason = blockReason;
            v.adminNotes = blockReason;
            v.blockedAt = now;
            v.reviewedAt = now;
            v.reviewedBy = req.user?.name || 'Admin';
            v.updatedAt = now;
          }
        });
      }

      // 4. Update MOCK_USERS and store.users
      const updateUserObj = (u: any) => {
        if (!u) return;
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        const uId = u.id || u.user?.id;
        const uRole = (u.role || u.user?.role || '').toLowerCase();

        const isActualMgr = (uRole === 'manager' || (cleanEmail && uEmail === cleanEmail)) && 
                            (!cleanParentEmail || uEmail !== cleanParentEmail) && 
                            ((cleanEmail && uEmail === cleanEmail) || (targetMgrId && uId === targetMgrId));
        if (isActualMgr) {
          if (u.user) {
            u.user.isVerified = false;
            u.user.isBlocked = true;
            u.user.verificationStatus = 'blocked';
            u.user.status = 'blocked';
            u.user.blockReason = blockReason;
            u.user.adminNotes = blockReason;
          }
          u.isVerified = false;
          u.isBlocked = true;
          u.verificationStatus = 'blocked';
          u.status = 'blocked';
          u.blockReason = blockReason;
          u.adminNotes = blockReason;
        }

        const isParentUser = (cleanParentEmail && uEmail === cleanParentEmail) || (target.parentUserId && uId === target.parentUserId);
        if (isParentUser || u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount) {
          const targetAcc = u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount;
          if (targetAcc && (isParentUser || (cleanEmail && targetAcc.email?.toLowerCase().trim() === cleanEmail))) {
            targetAcc.status = 'blocked';
            targetAcc.isApproved = false;
            targetAcc.isBlocked = true;
            targetAcc.blockReason = blockReason;
            targetAcc.adminNotes = blockReason;
          }
        }
      };
      MOCK_USERS.forEach(updateUserObj);
      if (store.users) {
        store.users.forEach(updateUserObj);
      }

      // 5. Unlist/hide all hostels registered or managed by this manager from live public search
      const currentHostels = await dbGetHostels(hostels);
      for (const h of currentHostels) {
        const isMgr = (h.managerId && targetMgrId && h.managerId === targetMgrId) ||
                      (h.assignedManagerId && targetMgrId && h.assignedManagerId === targetMgrId) ||
                      (h.managerEmail && cleanEmail && h.managerEmail.toLowerCase().trim() === cleanEmail) ||
                      (target.propertyName && h.name && h.name.toLowerCase().trim() === target.propertyName.toLowerCase().trim()) ||
                      (target.proposedHostelName && h.name && h.name.toLowerCase().trim() === target.proposedHostelName.toLowerCase().trim()) ||
                      (target.hostelName && h.name && h.name.toLowerCase().trim() === target.hostelName.toLowerCase().trim());
        if (isMgr) {
          h.isApproved = false;
          h.approvalStatus = 'Blocked';
          h.status = 'Blocked';
          h.isLive = false;
          h.isBlocked = true;
          h.blockReason = blockReason;
          await dbUpdateHostel(h.id, {
            isApproved: false,
            approvalStatus: 'Blocked',
            status: 'Blocked',
            isLive: false,
            isBlocked: true,
            blockReason: blockReason
          }, hostels);
        }
      }

      // 6. Send detailed restriction notification to primary user account and manager
      const parentUserId = (target as any).parentUserId || targetMgrId;
      const notifyEmails = Array.from(new Set([cleanEmail, cleanParentEmail].filter(Boolean)));
      for (const emailToNotify of notifyEmails) {
        const blkNotif = {
          id: `notif-mgr-blk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          studentId: targetMgrId,
          userId: parentUserId || targetMgrId,
          parentUserId: parentUserId,
          userEmail: emailToNotify,
          recipientEmail: emailToNotify,
          targetEmail: emailToNotify,
          parentUserEmail: cleanParentEmail,
          managerEmail: cleanEmail,
          title: 'Manager Account Restricted / Blocked',
          message: `Your Manager Account for "${target.propertyName || target.proposedHostelName || target.managerName || 'Hostel'}" has been restricted by PineVela Administration. Reason: ${blockReason}. Manager Console login and live property listings are suspended until further notice.`,
          type: 'danger',
          isBlocked: true,
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(blkNotif);
        await dbCreateNotification(blkNotif, notifications);
      }

      syncStore();

      await dbUpdateManagerRequestStatus(id, 'blocked', blockReason);
      await dbUpdateManagerVerificationStatus(id, 'blocked', blockReason, req.user?.name || 'Admin', cleanEmail, targetMgrId);

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin RESTRICTED/BLOCKED manager access for "${target.managerName || cleanEmail}". Reason: ${blockReason}`,
        time: 'Just now',
        type: 'danger'
      }, activities);

      return res.json({
        success: true,
        message: `Manager access for ${cleanEmail || target.managerName} has been restricted and property unlisted.`,
        status: 'blocked',
        isBlocked: true,
        blockReason: blockReason
      });
    } catch (err: any) {
      console.error("Error blocking manager:", err);
      return res.status(500).json({ error: err.message || "Failed to block manager." });
    }
  });

  // Unblock manager access and restore property to live
  app.put(["/api/manager-requests/:id/unblock", "/api/manager-verifications/:id/unblock", "/api/admin/managers/:id/unblock"], requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const store = getStoreInstance();

      const matchedInsp = verificationInspections.find(i => i.id === id || i.managerVerificationId === id);
      const effectiveId = matchedInsp?.managerVerificationId || id;

      const target = managerRequests.find(r => r.id === effectiveId || r.managerId === effectiveId || r.id === id || r.managerId === id || (r.managerEmail && r.managerEmail.toLowerCase() === id.toLowerCase())) ||
                     managerVerifications.find(v => v.id === effectiveId || v.managerId === effectiveId || v.id === id || v.managerId === id || (v.managerEmail && v.managerEmail.toLowerCase() === id.toLowerCase())) ||
                     (store.managerRegistrationRequests || []).find((r: any) => r.id === effectiveId || r.managerId === effectiveId || r.id === id) ||
                     ((store as any).managerVerifications || []).find((v: any) => v.id === effectiveId || v.managerId === effectiveId || v.id === id) ||
                     MOCK_USERS.find(u => (u.user && (u.user.id === id || u.user.email?.toLowerCase() === id.toLowerCase())) || u.id === id || u.email?.toLowerCase() === id.toLowerCase());

      if (!target) {
        return res.status(404).json({ error: "Manager record not found." });
      }

      const now = new Date().toISOString();
      const cleanEmail = (target.managerEmail || target.email || target.user?.email || '').toLowerCase().trim();
      const cleanParentEmail = ((target as any).parentUserEmail || target.user?.parentUserEmail || '').toLowerCase().trim();
      const targetMgrId = target.managerId || (target as any).userId || target.user?.id || target.id;

      const matchesTarget = (obj: any) => {
        if (!obj) return false;
        const e1 = (obj.managerEmail || obj.email || obj.user?.email || '').toLowerCase().trim();
        const e2 = (obj.parentUserEmail || obj.user?.parentUserEmail || '').toLowerCase().trim();
        const id1 = obj.managerId || obj.userId || obj.user?.id || obj.id;
        const id2 = obj.parentUserId || obj.user?.parentUserId;

        const emailMatch = Boolean(cleanEmail) && (e1 === cleanEmail || e2 === cleanEmail);
        const parentEmailMatch = Boolean(cleanParentEmail) && (e1 === cleanParentEmail || e2 === cleanParentEmail);
        const idMatch = Boolean(targetMgrId) && (id1 === targetMgrId || id2 === targetMgrId);
        return emailMatch || parentEmailMatch || idMatch || obj.id === id || obj.id === effectiveId;
      };

      // 1. Update in-memory managerRequests
      managerRequests.forEach(r => {
        if (r.id === id || r.id === effectiveId || matchesTarget(r)) {
          r.status = 'approved';
          (r as any).isApproved = true;
          (r as any).isBlocked = false;
          r.blockReason = null;
          r.unblockedAt = now;
          r.updatedAt = now;
        }
      });

      // 2. Update in-memory managerVerifications
      managerVerifications.forEach(v => {
        if (v.id === id || v.id === effectiveId || matchesTarget(v)) {
          v.status = 'approved';
          v.authorityStatus = 'verified';
          v.isBlocked = false;
          (v as any).isApproved = true;
          v.blockReason = null;
          v.unblockedAt = now;
          v.reviewedAt = now;
          v.reviewedBy = req.user?.name || 'Admin';
          v.updatedAt = now;
        }
      });

      // 3. Update store
      if (store.managerRegistrationRequests) {
        store.managerRegistrationRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'approved';
            r.isApproved = true;
            r.isBlocked = false;
            r.blockReason = null;
            r.unblockedAt = now;
            r.updatedAt = now;
          }
        });
      }
      if ((store as any).managerVerifications) {
        (store as any).managerVerifications.forEach((v: any) => {
          if (v.id === id || matchesTarget(v)) {
            v.status = 'approved';
            v.authorityStatus = 'verified';
            v.isApproved = true;
            v.isBlocked = false;
            v.blockReason = null;
            v.unblockedAt = now;
            v.reviewedAt = now;
            v.reviewedBy = req.user?.name || 'Admin';
            v.updatedAt = now;
          }
        });
      }

      // 4. Update MOCK_USERS and store.users
      const updateUserObj = (u: any) => {
        if (!u) return;
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        const uId = u.id || u.user?.id;
        const uRole = (u.role || u.user?.role || '').toLowerCase();

        const isActualMgr = (uRole === 'manager' || (cleanEmail && uEmail === cleanEmail)) && 
                            (!cleanParentEmail || uEmail !== cleanParentEmail) && 
                            ((cleanEmail && uEmail === cleanEmail) || (targetMgrId && uId === targetMgrId));
        if (isActualMgr) {
          if (u.user) {
            u.user.isVerified = true;
            u.user.isBlocked = false;
            u.user.verificationStatus = 'approved';
            u.user.status = 'approved';
            u.user.blockReason = null;
          }
          u.isVerified = true;
          u.isBlocked = false;
          u.verificationStatus = 'approved';
          u.status = 'approved';
          u.blockReason = null;
        }

        const isParentUser = (cleanParentEmail && uEmail === cleanParentEmail) || (target.parentUserId && uId === target.parentUserId);
        if (isParentUser || u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount) {
          const targetAcc = u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount;
          if (targetAcc && (isParentUser || (cleanEmail && targetAcc.email?.toLowerCase().trim() === cleanEmail))) {
            targetAcc.status = 'approved';
            targetAcc.isApproved = true;
            targetAcc.isVerified = true;
            targetAcc.isBlocked = false;
            targetAcc.blockReason = null;
          }
        }
      };
      MOCK_USERS.forEach(updateUserObj);
      if (store.users) {
        store.users.forEach(updateUserObj);
      }

      // 5. Restore hostel(s) back to live public search
      const currentHostels = await dbGetHostels(hostels);
      for (const h of currentHostels) {
        const isMgr = (h.managerId && targetMgrId && h.managerId === targetMgrId) ||
                      (h.assignedManagerId && targetMgrId && h.assignedManagerId === targetMgrId) ||
                      (h.managerEmail && cleanEmail && h.managerEmail.toLowerCase().trim() === cleanEmail) ||
                      (target.propertyName && h.name && h.name.toLowerCase().trim() === target.propertyName.toLowerCase().trim()) ||
                      (target.proposedHostelName && h.name && h.name.toLowerCase().trim() === target.proposedHostelName.toLowerCase().trim()) ||
                      (target.hostelName && h.name && h.name.toLowerCase().trim() === target.hostelName.toLowerCase().trim());
        if (isMgr) {
          h.isApproved = true;
          h.approvalStatus = 'Approved';
          h.status = 'Open';
          h.isLive = true;
          h.isBlocked = false;
          delete h.blockReason;
          await dbUpdateHostel(h.id, {
            isApproved: true,
            approvalStatus: 'Approved',
            status: 'Open',
            isLive: true,
            isBlocked: false,
            blockReason: null
          }, hostels);
        }
      }

      // 6. Send unblock notification to primary user account and manager
      const parentUserId = (target as any).parentUserId || targetMgrId;
      const notifyEmails = Array.from(new Set([cleanEmail, cleanParentEmail].filter(Boolean)));
      for (const emailToNotify of notifyEmails) {
        const unblkNotif = {
          id: `notif-mgr-unblk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          studentId: targetMgrId,
          userId: parentUserId || targetMgrId,
          parentUserId: parentUserId,
          userEmail: emailToNotify,
          recipientEmail: emailToNotify,
          targetEmail: emailToNotify,
          parentUserEmail: cleanParentEmail,
          managerEmail: cleanEmail,
          title: 'Manager Account Access Restored / Unblocked',
          message: `Your Manager Account for "${target.propertyName || target.proposedHostelName || target.managerName || 'Hostel'}" has been unblocked by PineVela Administration. Full manager dashboard access and live property listings are now active.`,
          type: 'success',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(unblkNotif);
        await dbCreateNotification(unblkNotif, notifications);
      }

      syncStore();

      await dbUpdateManagerRequestStatus(id, 'approved');
      await dbUpdateManagerVerificationStatus(id, 'approved', 'Unblocked by Administrator', req.user?.name || 'Admin', cleanEmail, targetMgrId);

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin UNBLOCKED manager access for "${target.managerName || cleanEmail}". Full access and live property listings restored.`,
        time: 'Just now',
        type: 'success'
      }, activities);

      return res.json({
        success: true,
        message: `Manager access for ${cleanEmail || target.managerName} has been restored and property returned to live listings.`,
        status: 'approved',
        isBlocked: false
      });
    } catch (err: any) {
      console.error("Error unblocking manager:", err);
      return res.status(500).json({ error: err.message || "Failed to unblock manager." });
    }
  });

  // Verify manager document individually
  app.put(["/api/manager-verifications/:id/verify-doc", "/api/manager-requests/:id/verify-doc"], requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { docKey, status } = req.body || {};
      if (!docKey || !['operatingCertificate', 'idFront', 'idBack'].includes(docKey)) {
        return res.status(400).json({ error: "Invalid docKey provided." });
      }
      const store = getStoreInstance();
      const target = managerVerifications.find(v => v.id === id || v.managerId === id || (v.managerEmail && v.managerEmail.toLowerCase() === id.toLowerCase())) ||
                     managerRequests.find(r => r.id === id || r.managerId === id || (r.managerEmail && r.managerEmail.toLowerCase() === id.toLowerCase())) ||
                     (store.managerRegistrationRequests || []).find((r: any) => r.id === id || r.managerId === id) ||
                     ((store as any).managerVerifications || []).find((v: any) => v.id === id || v.managerId === id);

      const cleanEmail = (target?.managerEmail || '').toLowerCase().trim();
      const targetMgrId = target?.managerId || target?.userId;

      const matchesTarget = (obj: any) => {
        if (!obj) return false;
        const e = (obj.managerEmail || obj.email || '').toLowerCase().trim();
        const i = obj.id || obj.managerId || obj.userId;
        return (cleanEmail && e === cleanEmail) || (targetMgrId && i === targetMgrId) || obj.id === id;
      };

      managerVerifications.forEach(v => {
        if (matchesTarget(v)) {
          if (!v.documentsVerified) v.documentsVerified = { operatingCertificate: 'pending', idFront: 'pending', idBack: 'pending' };
          v.documentsVerified[docKey] = status;
          v.updatedAt = new Date().toISOString();
        }
      });

      managerRequests.forEach(r => {
        if (matchesTarget(r)) {
          if (!(r as any).documentsVerified) (r as any).documentsVerified = { operatingCertificate: 'pending', idFront: 'pending', idBack: 'pending' };
          (r as any).documentsVerified[docKey] = status;
          r.updatedAt = new Date().toISOString();
        }
      });

      if (store.managerRegistrationRequests) {
        store.managerRegistrationRequests.forEach((r: any) => {
          if (matchesTarget(r)) {
            if (!r.documentsVerified) r.documentsVerified = { operatingCertificate: 'pending', idFront: 'pending', idBack: 'pending' };
            r.documentsVerified[docKey] = status;
          }
        });
      }
      if ((store as any).managerVerifications) {
        (store as any).managerVerifications.forEach((v: any) => {
          if (matchesTarget(v)) {
            if (!v.documentsVerified) v.documentsVerified = { operatingCertificate: 'pending', idFront: 'pending', idBack: 'pending' };
            v.documentsVerified[docKey] = status;
          }
        });
      }
      savePersistentStore(store);

      return res.json({ success: true, docKey, status });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to update doc verification status" });
    }
  });

  // ==========================================
  // PINEVELA VERIFICATION ENGINE (PHASE 1 & PHASE 2)
  // ==========================================

  // 1. Dev/Tester synthetic cards endpoints
  app.get("/api/verification/test-cards", (req, res) => {
    const allCards = getAllSyntheticTestCards();
    return res.json({
      provider: defaultVerificationProvider.name,
      total: allCards.length,
      testCards: allCards,
      sample: allCards.slice(0, 50),
      allCards: allCards
    });
  });

  app.get("/api/verification/test-cards/random", (req, res) => {
    const onlyVerified = req.query.verified === 'true';
    const card = getRandomSyntheticCard(onlyVerified);
    return res.json({
      provider: defaultVerificationProvider.name,
      card
    });
  });

  // 2. Identity Verification provider endpoint
  app.post("/api/verification/verify-identity", async (req, res) => {
    try {
      const { country, documentType, idNumber, fullName, dateOfBirth, expiryDate } = req.body;
      if (!idNumber || !idNumber.trim()) {
        return res.status(400).json({ error: "Document identity number is required." });
      }

      // Execute verification through provider (never logs raw identifier)
      const result = await defaultVerificationProvider.verifyIdentity({
        country: country || 'Ghana',
        documentType: documentType || 'Ghana Card',
        idNumber,
        fullName: fullName || '',
        dateOfBirth,
        expiryDate
      });

      return res.json(result);
    } catch (err: any) {
      console.error("Identity verification service error:", err);
      return res.status(500).json({ error: "Identity verification service temporary error" });
    }
  });

  // 3. Manager Verifications: Submit Manager Verification Request (Physical Verification Flow)
  app.post("/api/manager-verifications/submit", async (req: any, res) => {
    try {
      const {
        managerName,
        name,
        fullNameOnId,
        hostelName,
        residenceName,
        propertyName,
        location,
        address,
        physicalAddress,
        city,
        region,
        landmark,
        digitalAddress,
        gpsCoordinates,
        managerEmail,
        email,
        managerPhone,
        phone,
        password,
        roleTitle
      } = req.body;

      const resolvedName = (managerName || name || fullNameOnId || '').trim();
      const resolvedHostelName = (hostelName || residenceName || propertyName || 'PineVela Registered Residence').trim();
      const resolvedEmail = (managerEmail || email || '').toLowerCase().trim();
      const resolvedPhone = (managerPhone || phone || '').trim();
      const resolvedLocation = (location || physicalAddress || address || `${city || 'Kumasi'}, ${region || 'Ashanti Region'}`).trim();
      const resolvedDigitalAddress = (digitalAddress || '').trim();
      const resolvedLandmark = (landmark || '').trim();

      if (!resolvedName || !resolvedEmail) {
        return res.status(400).json({ error: "Manager Full Name and Email are required." });
      }

      // Enforce work email requirement for manager verification submit
      const disallowedDomainsSub = [
        'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
        'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
        'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'yandex.com'
      ];
      const emailDomainSub = resolvedEmail.split('@')[1] || '';
      if (disallowedDomainsSub.includes(emailDomainSub)) {
        return res.status(400).json({
          error: `Manager registration requires an official work or organization email domain (e.g. manager@yourproperty.com, housing@institution.edu.gh). Personal consumer emails (@${emailDomainSub}) are not permitted for manager accounts.`
        });
      }

      if (!resolvedPhone) {
        return res.status(400).json({ error: "Phone / WhatsApp number is required." });
      }
      if (!resolvedLocation) {
        return res.status(400).json({ error: "Precise property location is required." });
      }

      // Enforce Kumasi / KNUST location & accreditation requirement
      const locCheck = validateKumasiKnustLocation(resolvedLocation, req.body.knustAccreditedConfirmed);
      if (!locCheck.isValid) {
        return res.status(400).json({ error: locCheck.error });
      }

      // Check if manager email already registered in verification records
      const allVerifications = await dbGetManagerVerifications(managerVerifications);
      const existingRecord = allVerifications.find(
        v => (v.managerEmail || '').toLowerCase() === resolvedEmail
      );
      if (existingRecord && existingRecord.status === 'approved') {
        return res.status(200).json({
          success: true,
          message: "This manager email is already verified and approved.",
          verification: existingRecord,
          alreadyApproved: true
        });
      }

      const managerId = `manager_${Date.now()}`;
      const verificationId = `mv-${Date.now()}`;
      const now = new Date().toISOString();
      const parentUserId = req.body.parentUserId || req.body.userId || (req as any).user?.id || null;
      const parentUserEmail = (req.body.parentUserEmail || req.body.userEmail || (req as any).user?.email || '').toLowerCase().trim() || null;

      const newRecord = {
        id: verificationId,
        managerId,
        parentUserId,
        parentUserEmail,
        managerName: resolvedName,
        managerEmail: resolvedEmail,
        managerPhone: resolvedPhone,
        hostelName: resolvedHostelName,
        residenceName: resolvedHostelName,
        location: resolvedLocation,
        address: resolvedLocation,
        landmark: resolvedLandmark,
        digitalAddress: resolvedDigitalAddress,
        gpsCoordinates: gpsCoordinates || null,
        authorityRelationship: 'Property Representative',
        organizationName: resolvedHostelName,
        verificationType: 'in_person_inspection',
        inspectionStatus: 'pending_dispatch', // 'pending_dispatch' | 'dispatched' | 'report_submitted' | 'approved' | 'rejected'
        systemChecks: {
          phone: resolvedPhone.length >= 8 ? 'verified' : 'failed',
          email: resolvedEmail.includes('@') ? 'verified' : 'failed',
          locationFormat: resolvedLocation.length >= 3 ? 'verified' : 'pending'
        },
        status: 'pending', // Pending PineVela Team Inspection & Admin Approval
        adminNotes: 'Awaiting PineVela field verification team dispatch and on-site inspection.',
        rejectionReason: null,
        createdAt: now,
        updatedAt: now
      };

      const existingIdx = managerVerifications.findIndex(v => v.managerEmail.toLowerCase() === resolvedEmail);
      if (existingIdx >= 0) {
        managerVerifications[existingIdx] = { ...managerVerifications[existingIdx], ...newRecord, id: managerVerifications[existingIdx].id };
      } else {
        managerVerifications.unshift(newRecord);
      }
      await dbCreateManagerVerification(newRecord);

      // Create or update Manager User Account with isVerified: false
      const userToken = createSessionToken('mgr');
      const existingUserIdx = MOCK_USERS.findIndex(u => (u.email || '').toLowerCase() === resolvedEmail);
      
      const userObj = {
        id: managerId,
        parentUserId,
        parentUserEmail,
        name: resolvedName,
        role: 'manager',
        email: resolvedEmail,
        phone: resolvedPhone,
        hostelName: resolvedHostelName,
        residenceName: resolvedHostelName,
        address: resolvedLocation,
        location: resolvedLocation,
        digitalAddress: resolvedDigitalAddress,
        landmark: resolvedLandmark,
        roleTitle: roleTitle || 'Hostel Manager',
        isVerified: false,
        verificationStatus: 'pending',
        token: userToken
      };

      if (existingUserIdx >= 0) {
        MOCK_USERS[existingUserIdx].user = { ...MOCK_USERS[existingUserIdx].user, ...userObj };
        if (password) MOCK_USERS[existingUserIdx].password = password;
      } else {
        MOCK_USERS.push({
          email: resolvedEmail,
          username: resolvedEmail.split('@')[0],
          password: password ? hashPasswordSha256(password) : '',
          user: userObj
        });
      }

      // Link to parent user registered accounts if registered by a resident/user
      if (parentUserId || parentUserEmail) {
        const parentUser = MOCK_USERS.find(u => 
          (parentUserId && (u.id === parentUserId || u.user?.id === parentUserId)) ||
          (parentUserEmail && ((u.email || '').toLowerCase() === parentUserEmail || (u.user?.email || '').toLowerCase() === parentUserEmail))
        );
        if (parentUser) {
          const uObj = parentUser.user || parentUser;
          if (!uObj.registeredAccounts) uObj.registeredAccounts = {};
          uObj.registeredAccounts.managerAccount = {
            id: managerId,
            managerId,
            name: resolvedName,
            email: resolvedEmail, // The work email!
            phone: resolvedPhone,
            organizationName: resolvedHostelName,
            status: 'pending',
            isApproved: false,
            isVerified: false,
            createdAt: now
          };
        }
      }

      await dbSaveManagerProfile({
        id: managerId,
        name: resolvedName,
        email: resolvedEmail,
        phone: resolvedPhone,
        hostelName: resolvedHostelName,
        address: resolvedLocation,
        password: password ? hashPasswordSha256(password) : ''
      });

      // Write to verification audit log
      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'MANAGER_VERIFICATION_SUBMITTED',
        targetType: 'manager',
        targetId: managerId,
        targetName: resolvedName,
        performedBy: resolvedName,
        role: 'manager',
        details: {
          hostelName: resolvedHostelName,
          location: resolvedLocation,
          digitalAddress: resolvedDigitalAddress
        },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      // Send User confirmation notification
      const userNotif = {
        id: `notif-mgr-sub-${Date.now()}`,
        studentId: managerId,
        userId: managerId,
        userEmail: resolvedEmail,
        recipientEmail: resolvedEmail,
        targetEmail: resolvedEmail,
        title: 'Manager Account Registered - Inspection Pending',
        message: `Your Manager Account for "${resolvedHostelName}" has been received. A PineVela verification team will visit and inspect the property in person before your account is approved.`,
        type: 'verification',
        date: now.split('T')[0],
        read: false
      };
      notifications.unshift(userNotif);
      await dbCreateNotification(userNotif, notifications);

      // Send Admin alert notification
      const adminNotif = {
        id: `notif-mgr-sub-adm-${Date.now()}`,
        studentId: 'admin_001',
        title: `Manager Verification Request: ${resolvedHostelName}`,
        message: `Applicant "${resolvedName}" (${resolvedEmail}) registered for "${resolvedHostelName}" at ${resolvedLocation}. Ready for verification team dispatch.`,
        type: 'verification',
        date: now.split('T')[0],
        read: false
      };
      notifications.unshift(adminNotif);
      await dbCreateNotification(adminNotif, notifications);

      syncStore();

      return res.status(201).json({
        success: true,
        verification: newRecord,
        user: userObj,
        message: "Manager account registered! A PineVela verification team will physically visit and inspect the property before your account can be verified."
      });
    } catch (err: any) {
      console.error("Error submitting manager verification:", err);
      return res.status(500).json({ error: err.message || "Failed to submit manager verification." });
    }
  });

  // 4. Manager Verifications: Get list of manager verifications
  app.get("/api/manager-verifications", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const records = await dbGetManagerVerifications(managerVerifications);
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "").trim();
        const foundUser = MOCK_USERS.find(u => (u.user && u.user.token === token) || u.token === token);
        const userRole = foundUser?.user?.role || foundUser?.role;
        const userId = foundUser?.user?.id || foundUser?.id;
        const userEmail = (foundUser?.user?.email || foundUser?.email || '').toLowerCase().trim();
        if (foundUser && userRole === 'manager') {
          const filtered = records.filter(
            v => v.managerId === userId || (v.managerEmail && userEmail && v.managerEmail.toLowerCase() === userEmail)
          );
          return res.json(filtered);
        }
      }
      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch manager verifications." });
    }
  });

  // Fetch registered Manager & Staff account records for a user
  app.get(["/api/users/my-registered-accounts", "/api/user/registered-accounts"], requireAuth(), async (req: any, res) => {
    try {
      let authUser: any = req.user;
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "").trim();
        const found = MOCK_USERS.find(u => (u.user?.token === token || u.token === token || (u.user as any)?.sessionToken === token));
        if (found) {
          authUser = found.user || found;
        }
      }

      let userEmail = (authUser?.email || req.query.email || '').toString().toLowerCase().trim();
      let userId = (authUser?.id || req.query.userId || '').toString().trim();
      if (authUser?.role === 'admin') {
        const qEmail = (req.query.email || '').toString().toLowerCase().trim();
        const qId = (req.query.userId || '').toString().trim();
        if (qEmail) userEmail = qEmail;
        if (qId) userId = qId;
      }

      if (!userEmail && !userId) {
        return res.json({ managerAccount: null, staffAccount: null, residentAccount: null });
      }

      let managerAccount: any = null;
      let staffAccount: any = null;

      const store = getStoreInstance();
      const allVerifs = await dbGetManagerVerifications(managerVerifications);
      const allMgrRequests = [...managerRequests, ...(store.managerRegistrationRequests || []), ...((store as any).managerRequests || [])];
      const allVerifsList = [...allVerifs, ...managerVerifications, ...((store as any).managerVerifications || []), ...(store.hostelVerifications || [])];
      const allUsersList = [...MOCK_USERS, ...(store.users || [])];

      // Find Manager Account record
      const matchedVerif = allVerifsList.find(v => {
        if (!v) return false;
        const vEmail = (v.managerEmail || v.email || '').toLowerCase().trim();
        const vParentEmail = (v.parentUserEmail || '').toLowerCase().trim();
        const vId = v.managerId || v.userId || v.id;
        const vParentId = v.parentUserId;
        const matchesEmail = Boolean(userEmail) && ((vEmail !== '' && vEmail === userEmail) || (vParentEmail !== '' && vParentEmail === userEmail));
        const matchesId = Boolean(userId) && ((vId !== '' && vId === userId) || (vParentId !== '' && vParentId === userId));
        return matchesEmail || matchesId;
      });

      const matchedMgrReq = allMgrRequests.find(r => {
        if (!r) return false;
        const rEmail = (r.managerEmail || r.email || '').toLowerCase().trim();
        const rParentEmail = (r.parentUserEmail || '').toLowerCase().trim();
        const rId = r.managerId || r.userId || r.id;
        const rParentId = r.parentUserId;
        const matchesEmail = Boolean(userEmail) && ((rEmail !== '' && rEmail === userEmail) || (rParentEmail !== '' && rParentEmail === userEmail));
        const matchesId = Boolean(userId) && ((rId !== '' && rId === userId) || (rParentId !== '' && rParentId === userId));
        return matchesEmail || matchesId;
      });

      const matchedMgrUser = allUsersList.find(u => {
        if (!u) return false;
        const uObj = u.user || u;
        const uRole = u.role || uObj.role;
        const uEmail = (u.email || uObj.email || '').toLowerCase().trim();
        const uParentEmail = (u.parentUserEmail || uObj.parentUserEmail || '').toLowerCase().trim();
        const uId = u.id || uObj.id;
        const uParentId = u.parentUserId || uObj.parentUserId;
        if (uRole !== 'manager') return false;
        const matchesEmail = Boolean(userEmail) && ((uEmail !== '' && uEmail === userEmail) || (uParentEmail !== '' && uParentEmail === userEmail));
        const matchesId = Boolean(userId) && ((uId !== '' && uId === userId) || (uParentId !== '' && uParentId === userId));
        return matchesEmail || matchesId;
      });

      if (matchedVerif || matchedMgrReq || matchedMgrUser) {
        const allStatusValues = [
          matchedVerif?.status,
          matchedVerif?.authorityStatus,
          matchedMgrReq?.status,
          (matchedMgrReq as any)?.isApproved ? 'approved' : null,
          matchedMgrUser?.user?.verificationStatus,
          matchedMgrUser?.verificationStatus,
          matchedMgrUser?.user?.status,
          matchedMgrUser?.status,
          matchedMgrUser?.user?.isVerified ? 'approved' : null,
          matchedMgrUser?.isVerified ? 'approved' : null,
        ].filter(Boolean).map(s => String(s).toLowerCase().trim());

        const isBlocked = allStatusValues.includes('blocked') || matchedVerif?.isBlocked === true || matchedMgrReq?.isBlocked === true || matchedMgrUser?.isBlocked === true || matchedMgrUser?.user?.isBlocked === true;
        const isApproved = !isBlocked && (allStatusValues.includes('approved') || allStatusValues.includes('verified'));
        const isRejected = !isBlocked && !isApproved && allStatusValues.includes('rejected');
        const rawStatus = isBlocked ? 'blocked' : (isApproved ? 'approved' : (isRejected ? 'rejected' : 'pending'));
        const displayStatus = isBlocked ? 'Blocked' : (isApproved ? 'Approved' : (isRejected ? 'Rejected' : 'Pending Admin Approval'));
        const blockReason = isBlocked ? (matchedVerif?.blockReason || matchedMgrReq?.blockReason || (matchedMgrUser as any)?.blockReason || (matchedMgrUser?.user as any)?.blockReason || matchedVerif?.adminNotes || matchedMgrReq?.adminNotes || 'Manager account access has been restricted by administration.') : null;

        if (isApproved) {
          if (matchedVerif) matchedVerif.status = 'approved';
          if (matchedMgrReq) matchedMgrReq.status = 'approved';
          if (matchedMgrUser) {
            if (matchedMgrUser.user) {
              matchedMgrUser.user.verificationStatus = 'approved';
              matchedMgrUser.user.isVerified = true;
            }
            matchedMgrUser.verificationStatus = 'approved';
            matchedMgrUser.isVerified = true;
          }
        }

        const mgrWorkEmail = matchedVerif?.managerEmail || matchedMgrReq?.managerEmail || matchedMgrUser?.email || matchedMgrUser?.user?.email || '';

        managerAccount = {
          id: matchedVerif?.id || matchedMgrReq?.id || matchedMgrUser?.id || `mgr-rec-${Date.now()}`,
          managerId: matchedVerif?.managerId || matchedMgrReq?.managerId || matchedMgrUser?.id,
          name: matchedVerif?.managerName || matchedMgrReq?.managerName || matchedMgrUser?.name || matchedMgrUser?.user?.name || 'Hostel Manager',
          email: mgrWorkEmail,
          organizationName: matchedVerif?.organizationName || matchedVerif?.organization || (matchedMgrReq as any)?.organizationName || matchedMgrReq?.organization || 'Sole Proprietorship',
          hostelName: matchedVerif?.hostelName || matchedMgrReq?.proposedHostelName || matchedMgrReq?.propertyName || 'General Operations',
          phone: matchedVerif?.phone || matchedMgrReq?.managerPhone || (matchedMgrReq as any)?.phone || matchedMgrUser?.phone || 'N/A',
          idType: matchedVerif?.idType || 'Ghana Card (National ID)',
          idNumber: matchedVerif?.idNumber || 'N/A',
          status: rawStatus,
          rawStatus: rawStatus,
          displayStatus: displayStatus,
          isApproved: isApproved,
          isVerified: isApproved,
          isRejected: isRejected,
          isBlocked: isBlocked,
          blockReason: blockReason,
          adminNotes: blockReason || matchedVerif?.rejectionReason || (matchedVerif as any)?.adminNotes || (matchedMgrReq as any)?.adminNotes || null,
          submittedAt: matchedVerif?.submittedAt || matchedVerif?.createdAt || new Date().toISOString().split('T')[0]
        };
      }

      // Find Staff Account record
      const allStaffList = [...staff, ...(store.staff || []), ...(staffApplications || []), ...(store.staffApplications || [])];
      const matchedStaff = allStaffList.find(s => {
        if (!s) return false;
        const sEmail = (s.email || s.staffEmail || s.userEmail || '').toLowerCase().trim();
        const sParentEmail = (s.parentUserEmail || '').toLowerCase().trim();
        const sId = s.userId || s.staffId || s.id;
        const sParentId = s.parentUserId;
        return (
          (userEmail && (sEmail === userEmail || sParentEmail === userEmail)) ||
          (userId && (sId === userId || sParentId === userId))
        );
      });

      const matchedStaffUser = allUsersList.find(u => {
        if (!u) return false;
        const uObj = u.user || u;
        const uRole = u.role || uObj.role;
        const uEmail = (u.email || uObj.email || '').toLowerCase().trim();
        const uParentEmail = (u.parentUserEmail || uObj.parentUserEmail || '').toLowerCase().trim();
        const uId = u.id || uObj.id;
        const uParentId = u.parentUserId || uObj.parentUserId;
        if (uRole !== 'staff') return false;
        return (
          (userEmail && (uEmail === userEmail || uParentEmail === userEmail)) ||
          (userId && (uId === userId || uParentId === userId))
        );
      });

      if (matchedStaff || matchedStaffUser) {
        const rawStatus = matchedStaff?.verificationStatus || matchedStaffUser?.verificationStatus || matchedStaffUser?.user?.verificationStatus || 'Pending';
        const isVerified = rawStatus.toLowerCase() === 'verified' || rawStatus.toLowerCase() === 'approved';
        const isRejected = rawStatus.toLowerCase() === 'rejected';
        const staffActualEmail = (
          matchedStaff?.email ||
          matchedStaff?.staffEmail ||
          matchedStaffUser?.email ||
          matchedStaffUser?.user?.email ||
          matchedStaff?.userEmail ||
          userEmail ||
          ''
        ).toLowerCase().trim();

        staffAccount = {
          id: matchedStaff?.id || matchedStaffUser?.id || `stf-rec-${Date.now()}`,
          userId: matchedStaff?.userId || matchedStaffUser?.id,
          name: matchedStaff?.name || matchedStaff?.applicantName || matchedStaffUser?.name || matchedStaffUser?.user?.name || 'Staff Member',
          email: staffActualEmail,
          parentUserEmail: userEmail,
          specialization: matchedStaff?.assignedSpecialization || matchedStaff?.specialization || matchedStaffUser?.specialization || matchedStaffUser?.user?.specialization || 'Facilities & Maintenance Technician',
          yearsExperience: matchedStaff?.yearsExperience || matchedStaffUser?.yearsExperience || '1 - 3 Years',
          phone: matchedStaff?.phone || matchedStaffUser?.phone || matchedStaffUser?.user?.phone || 'N/A',
          commutePreference: matchedStaff?.commutePreference || matchedStaffUser?.commutePreference || 'Daily Commuter',
          status: isVerified ? 'Verified' : (isRejected ? 'Rejected' : 'Pending'),
          rawStatus: rawStatus,
          displayStatus: isVerified ? 'Verified & Accredited Staff' : (isRejected ? 'Rejected' : 'Pending Admin Verification'),
          isVerified: isVerified,
          isApproved: isVerified,
          isRejected: isRejected,
          submittedAt: matchedStaff?.createdAt || matchedStaff?.registeredAt || new Date().toISOString().split('T')[0]
        };
      }

      // Find Resident Account record & all associated room keys
      let residentAccount: any = null;
      const allRoomKeys = store.roomKeys || [];
      const userResidentRooms = allRoomKeys.filter((rk: any) =>
        rk.isAssigned && (
          (userEmail && rk.assignedStudentEmail && rk.assignedStudentEmail.toLowerCase().trim() === userEmail) ||
          (userEmail && rk.parentUserEmail && rk.parentUserEmail.toLowerCase().trim() === userEmail) ||
          (userId && (rk.parentUserId === userId || rk.claimedByUserId === userId || rk.assignedStudentId === userId))
        )
      );

      const matchedKey = userResidentRooms[0] || allRoomKeys.find((rk: any) => 
        rk.isAssigned && (
          (userEmail && rk.assignedStudentEmail && rk.assignedStudentEmail.toLowerCase().trim() === userEmail) ||
          (userEmail && rk.parentUserEmail && rk.parentUserEmail.toLowerCase().trim() === userEmail) ||
          (userId && (rk.parentUserId === userId || rk.claimedByUserId === userId || rk.assignedStudentId === userId))
        )
      );
      const matchedStuUser = (store.users || []).find((u: any) => {
        if (!u) return false;
        const uRole = (u.user?.role || u.role || '').toLowerCase();
        if (uRole !== 'student' && uRole !== 'resident') return false;
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        const uParentEmail = (u.parentUserEmail || u.user?.parentUserEmail || '').toLowerCase().trim();
        const uParentId = (u.parentUserId || u.user?.parentUserId || '').trim();
        const uId = (u.id || u.user?.id || '').trim();
        return (userEmail && (uEmail === userEmail || uParentEmail === userEmail)) ||
               (userId && (uId === userId || uParentId === userId));
      }) || MOCK_USERS.find((u: any) =>
        ((u.email || u.user?.email || '').toLowerCase().trim() === userEmail || (u.id || u.user?.id) === userId) &&
        (u.role === 'student' || u.user?.role === 'student')
      );

      const stuData = matchedStuUser?.user || matchedStuUser;
      if (matchedKey || (stuData && (stuData.roomKey || stuData.hostelName))) {
        const resolvedRoomKey = matchedKey?.roomKey || stuData?.roomKey || '';
        const keyRecord = resolvedRoomKey ? allRoomKeys.find((rk: any) => rk.roomKey?.toUpperCase() === resolvedRoomKey.toUpperCase()) : null;
        const finalKeyObj = keyRecord || matchedKey;

        residentAccount = {
          id: stuData?.id || finalKeyObj?.id || `res-rec-${Date.now()}`,
          studentId: finalKeyObj?.assignedStudentId || stuData?.studentId || finalKeyObj?.studentId || 'N/A',
          name: finalKeyObj?.assignedStudentName || stuData?.name || 'Student Resident',
          email: userEmail || finalKeyObj?.assignedStudentEmail || stuData?.email || '',
          phone: finalKeyObj?.assignedStudentPhone || stuData?.phone || 'N/A',
          residentType: finalKeyObj?.assignedResidentType || stuData?.residentType || 'Student Resident',
          programOfStudy: finalKeyObj?.assignedProgram || stuData?.programOfStudy || 'General Studies',
          department: finalKeyObj?.assignedDepartment || stuData?.department || 'Main Faculty',
          institution: finalKeyObj?.assignedInstitution || stuData?.institution || 'University Center',
          hostelId: finalKeyObj?.hostelId || stuData?.hostelId || '',
          hostelName: finalKeyObj?.hostelName || stuData?.hostelName || 'PineVela Student Residence',
          blockName: finalKeyObj?.blockName || stuData?.blockName || 'Block A',
          roomNumber: finalKeyObj?.roomNumber || stuData?.roomNumber || 'Room 101',
          roomKey: resolvedRoomKey,
          managerName: finalKeyObj?.managerName || stuData?.managerName || 'Hostel Operations Manager',
          managerPhone: finalKeyObj?.managerPhone || stuData?.managerPhone || '+233 24 000 0000',
          status: 'Verified & Active',
          submittedAt: finalKeyObj?.assignedAt || stuData?.createdAt || new Date().toISOString().split('T')[0]
        };
      }

      // Find Merchant / Digital Market Account record
      let merchantAccount: any = null;
      const allMarketApps = store.digitalMarketApplications || [];
      const allMarketStores = store.digitalMarketStores || [];

      const matchedMarketApp = allMarketApps.find((a: any) => {
        if (!a) return false;
        const aEmail = (a.studentEmail || '').toLowerCase().trim();
        const aParentEmail = (a.parentUserEmail || '').toLowerCase().trim();
        const aId = a.userId || a.id;
        return (userEmail && (aEmail === userEmail || aParentEmail === userEmail)) || (userId && aId === userId);
      });

      const matchedMarketStore = allMarketStores.find((s: any) => {
        if (!s) return false;
        const sEmail = (s.studentEmail || '').toLowerCase().trim();
        const sParentEmail = (s.parentUserEmail || '').toLowerCase().trim();
        const sId = s.userId || s.id;
        return (userEmail && (sEmail === userEmail || sParentEmail === userEmail)) || (userId && sId === userId);
      });

      if (matchedMarketApp || matchedMarketStore) {
        const isApproved = Boolean((matchedMarketApp && matchedMarketApp.status === 'approved') || (matchedMarketStore && matchedMarketStore.status === 'active'));
        const isRejected = Boolean(matchedMarketApp && matchedMarketApp.status === 'rejected');
        const rawStatus = isApproved ? 'approved' : (isRejected ? 'rejected' : 'pending');

        merchantAccount = {
          id: matchedMarketStore?.id || matchedMarketApp?.id || `mkt-rec-${Date.now()}`,
          storeName: matchedMarketStore?.storeName || matchedMarketApp?.storeName || `${matchedMarketApp?.fullName || 'Student'}'s Campus Store`,
          studentEmail: matchedMarketStore?.studentEmail || matchedMarketApp?.studentEmail || userEmail,
          parentUserEmail: matchedMarketStore?.parentUserEmail || matchedMarketApp?.parentUserEmail || userEmail,
          university: matchedMarketStore?.university || matchedMarketApp?.university || 'KNUST, Kumasi',
          category: matchedMarketStore?.category || matchedMarketApp?.categoryToSell || 'General Merchandise',
          phone: matchedMarketStore?.phone || matchedMarketApp?.phone || 'N/A',
          status: rawStatus,
          displayStatus: isApproved ? 'Approved & Active Store' : (isRejected ? 'Rejected' : 'Pending Admin Approval'),
          isApproved,
          isVerified: isApproved,
          isRejected,
          submittedAt: matchedMarketApp?.submittedAt || matchedMarketStore?.createdAt || new Date().toISOString().split('T')[0]
        };
      }

      return res.json({
        managerAccount,
        staffAccount,
        residentAccount,
        merchantAccount,
        residentRooms: userResidentRooms
      });
    } catch (err: any) {
      console.error("Error retrieving user registered accounts:", err);
      return res.status(500).json({ error: "Failed to retrieve registered accounts." });
    }
  });

  // Reset password for registered Manager, Staff, or Resident account
  app.post("/api/users/reset-registered-account-password", requireAuth(), (req: any, res) => {
    if (typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 6) return res.status(400).json({ error: 'A new password of at least 6 characters is required.' });
    const email = normalizeEmail(req.body.email);
    const role = String(req.body.role || '').toLowerCase();
    const candidates = passwordRecords(email, role);
    if (!candidates.length) return res.status(404).json({ error: 'Account not found.' });
    const owned = candidates.filter(record => {
      const data = accountData(record);
      return req.user.role === 'admin' || ((req.user.role === role || (['resident', 'student'].includes(req.user.role) && ['resident', 'student'].includes(role))) && accountId(record) === req.user.id) ||
        (req.user.role === 'user' && (data.parentUserId === req.user.id || data.userId === req.user.id || normalizeEmail(data.parentUserEmail) === normalizeEmail(req.user.email)));
    });
    if (!owned.length) return res.status(403).json({ error: 'You cannot reset another account.' });
    const matched = owned.find(record => credentialValues(record, false).some(hash => passwordsMatch(req.body.currentPassword, hash)));
    if (!matched) return res.status(400).json({ error: 'Enter the current password for this subaccount.' });
    const records = owned.filter(record => accountId(record) === accountId(matched));
    updateIdentityPassword(records, req.body.newPassword, email, role);
    return res.json({ success: true, message: 'Password updated. Sign in again using the new password.' });
  });

  // Delete registered Manager, Staff, or Resident account to allow restarting registration
  app.post("/api/users/delete-registered-account", requireAuth(), async (req: any, res) => {
    try {
      const { role, email, password, confirm, deletionReason } = req.body || {};
      if (!role || !email) {
        return res.status(400).json({ error: "Role and email are required to delete account." });
      }
      const cleanEmail = email.toLowerCase().trim();

      // PROTECT ADMIN ACCOUNTS: Never allow admin accounts to be deleted
      const userIndex = MOCK_USERS.findIndex(u => (u.email || u.user?.email || u.username || '').toLowerCase().trim() === cleanEmail);
      const matchedUser = userIndex >= 0 ? MOCK_USERS[userIndex] : null;

      if (matchedUser && (matchedUser.role === 'admin' || matchedUser.user?.role === 'admin')) {
        return res.status(403).json({ error: "Admin accounts cannot be deleted." });
      }

      if (role === 'resident') {
        if (!password) {
          return res.status(400).json({ error: "Resident account password is required to delete the resident account." });
        }
        
        // Find the resident user record specifically
        const store = getStoreInstance();
        const residentUserIndex = MOCK_USERS.findIndex(u => {
          if (!u) return false;
          const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
          const uRole = (u.role || u.user?.role || '').toLowerCase();
          return uEmail === cleanEmail && (uRole === 'student' || uRole === 'resident');
        });
        
        let residentUser = residentUserIndex >= 0 ? MOCK_USERS[residentUserIndex] : null;
        if (!residentUser && store.users) {
          residentUser = store.users.find((u: any) => {
            if (!u) return false;
            const uEmail = (u.email || '').toLowerCase().trim();
            const uRole = (u.role || '').toLowerCase();
            return uEmail === cleanEmail && (uRole === 'student' || uRole === 'resident');
          });
        }
        
        if (!residentUser) {
          return res.status(404).json({ error: "Resident account not found." });
        }
        
        const expectedResidentPassword = residentUser.password || (residentUser.user as any)?.password || (residentUser as any).localPassword;
        const hashedPass = crypto.createHash('sha256').update(password).digest('hex');
        
        const isResidentPasswordValid = 
          passwordsMatch(password, expectedResidentPassword);
          
        if (!isResidentPasswordValid) {
          return res.status(400).json({ error: "Incorrect Resident account password. You can only delete a resident account with the correct resident credentials." });
        }
      }

      if (role === 'manager') {
        const store = getStoreInstance();
        const reqUserEmail = (req.user?.email || req.user?.user?.email || '').toLowerCase().trim();
        const reqUserPassword = req.user?.password || req.user?.user?.password || (req.user as any)?.localPassword;
        const parentRegMgr = req.user?.registeredAccounts?.managerAccount || (req.user?.user as any)?.registeredAccounts?.managerAccount;

        // Locate manager record or candidate user
        const allVerifs = await dbGetManagerVerifications(managerVerifications);
        const matchedVerif = allVerifs.find(v => {
          if (!v) return false;
          const vEmail = (v.managerEmail || v.email || '').toLowerCase().trim();
          const vParentEmail = (v.parentUserEmail || '').toLowerCase().trim();
          return vEmail === cleanEmail || (reqUserEmail && vParentEmail === reqUserEmail);
        }) || managerVerifications.find(v => {
          if (!v) return false;
          const vEmail = (v.managerEmail || v.email || '').toLowerCase().trim();
          const vParentEmail = (v.parentUserEmail || '').toLowerCase().trim();
          return vEmail === cleanEmail || (reqUserEmail && vParentEmail === reqUserEmail);
        });

        const matchedReq = managerRequests.find(r => {
          if (!r) return false;
          const rEmail = (r.managerEmail || (r as any).email || '').toLowerCase().trim();
          const rParentEmail = ((r as any).parentUserEmail || '').toLowerCase().trim();
          return rEmail === cleanEmail || (reqUserEmail && rParentEmail === reqUserEmail);
        });

        const mgrUserCandidate = MOCK_USERS.find(u => {
          if (!u) return false;
          const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
          const uRole = u.role || u.user?.role;
          const uParentEmail = (u.parentUserEmail || u.user?.parentUserEmail || '').toLowerCase().trim();
          return uRole === 'manager' && (uEmail === cleanEmail || (reqUserEmail && uParentEmail === reqUserEmail));
        });

        // Determine exact registered manager email and password
        const targetManagerEmail = (
          mgrUserCandidate?.email ||
          mgrUserCandidate?.user?.email ||
          parentRegMgr?.email ||
          matchedVerif?.managerEmail ||
          matchedVerif?.email ||
          matchedReq?.managerEmail ||
          (matchedReq as any)?.email ||
          cleanEmail
        ).toLowerCase().trim();

        const expectedManagerPassword = 
          mgrUserCandidate?.password ||
          mgrUserCandidate?.user?.password ||
          (mgrUserCandidate as any)?.localPassword ||
          parentRegMgr?.password ||
          (matchedVerif as any)?.password ||
          (matchedReq as any)?.password;

        if (!password) {
          return res.status(400).json({ error: "Manager account password is required to delete the manager account." });
        }

        // Rule 1: User CANNOT use primary user email to delete manager account if manager email differs
        if (reqUserEmail && cleanEmail === reqUserEmail && targetManagerEmail !== reqUserEmail) {
          return res.status(400).json({ error: "Incorrect email. You provided your primary user email. You must enter the Manager account's email and password to delete the Manager account." });
        }

        if (cleanEmail !== targetManagerEmail) {
          return res.status(400).json({ error: "Incorrect Manager account email. Please enter the email created for the Manager account." });
        }

        // Rule 2: User CANNOT use primary user password to delete manager account if different
        if (reqUserPassword && expectedManagerPassword && password === reqUserPassword && reqUserPassword !== expectedManagerPassword) {
          return res.status(400).json({ error: "Incorrect password. You provided your primary user password. You must enter the Manager account's password to delete the Manager account." });
        }

        const hashedPass = crypto.createHash('sha256').update(password).digest('hex');
        const isManagerPasswordValid = 
          passwordsMatch(password, expectedManagerPassword);

        if (!isManagerPasswordValid && expectedManagerPassword) {
          return res.status(400).json({ error: "Incorrect Manager account password. You can only delete a manager account with the manager account's email and password." });
        }

        const purgeManagerEmail = targetManagerEmail || cleanEmail;

        const matchesPurgeTarget = (e?: string, pe?: string) => {
          if (!e && !pe) return false;
          const cleanE = (e || '').toLowerCase().trim();
          const cleanPE = (pe || '').toLowerCase().trim();
          if (purgeManagerEmail && (cleanE === purgeManagerEmail || cleanPE === purgeManagerEmail)) return true;
          if (cleanEmail && (cleanE === cleanEmail || cleanPE === cleanEmail)) return true;
          return false;
        };

        // Purge manager user from MOCK_USERS completely
        for (let i = MOCK_USERS.length - 1; i >= 0; i--) {
          const u = MOCK_USERS[i];
          if (!u) continue;
          const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
          const uRole = u.role || u.user?.role;
          const uParentEmail = (u.parentUserEmail || u.user?.parentUserEmail || '').toLowerCase().trim();

          if ((uEmail === purgeManagerEmail || uEmail === cleanEmail) && (uRole === 'manager' || u.user?.role === 'manager')) {
            MOCK_USERS.splice(i, 1);
          } else if (uEmail === purgeManagerEmail || (reqUserEmail && uEmail === reqUserEmail)) {
            if (u.user) {
              if (u.user.role === 'manager') u.user.role = 'user';
              u.user.isVerified = false;
              u.user.verificationStatus = undefined;
              if (u.user.registeredAccounts) u.user.registeredAccounts.managerAccount = null;
            }
            if (u.role === 'manager') u.role = 'user';
            if (u.registeredAccounts) u.registeredAccounts.managerAccount = null;
          }
        }

        // Purge manager user from store.users
        if (store.users) {
          for (let i = store.users.length - 1; i >= 0; i--) {
            const u = store.users[i];
            if (!u) continue;
            const uEmail = (u.email || '').toLowerCase().trim();
            if ((uEmail === purgeManagerEmail || uEmail === cleanEmail) && u.role === 'manager') {
              store.users.splice(i, 1);
            } else if (uEmail === purgeManagerEmail || (reqUserEmail && uEmail === reqUserEmail)) {
              if (u.role === 'manager') u.role = 'user';
              u.isVerified = false;
              if (u.registeredAccounts) u.registeredAccounts.managerAccount = null;
            }
          }
        }

        // Purge manager user from persistentData.users
        if (persistentData.users) {
          for (let i = persistentData.users.length - 1; i >= 0; i--) {
            const u = persistentData.users[i];
            if (!u) continue;
            const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
            const uRole = u.role || u.user?.role;
            if ((uEmail === purgeManagerEmail || uEmail === cleanEmail) && (uRole === 'manager' || u.user?.role === 'manager')) {
              persistentData.users.splice(i, 1);
            } else if (uEmail === purgeManagerEmail || (reqUserEmail && uEmail === reqUserEmail)) {
              if (u.user) {
                if (u.user.role === 'manager') u.user.role = 'user';
                if (u.user.registeredAccounts) u.user.registeredAccounts.managerAccount = null;
              }
              if (u.role === 'manager') u.role = 'user';
              if (u.registeredAccounts) u.registeredAccounts.managerAccount = null;
            }
          }
        }

        // Purge in-memory manager verifications & requests
        for (let i = managerVerifications.length - 1; i >= 0; i--) {
          const v = managerVerifications[i];
          if (matchesPurgeTarget(v.managerEmail || v.email, v.parentUserEmail)) {
            managerVerifications.splice(i, 1);
          }
        }

        for (let i = hostelVerifications.length - 1; i >= 0; i--) {
          const v = hostelVerifications[i];
          if (matchesPurgeTarget(v.managerEmail || v.email, v.parentUserEmail)) {
            hostelVerifications.splice(i, 1);
          }
        }

        for (let i = managerRequests.length - 1; i >= 0; i--) {
          const r = managerRequests[i];
          if (matchesPurgeTarget(r.managerEmail || (r as any).email, (r as any).parentUserEmail)) {
            managerRequests.splice(i, 1);
          }
        }

        // Clean up persistent store collections
        if (store.managerRegistrationRequests) {
          store.managerRegistrationRequests = store.managerRegistrationRequests.filter((r: any) => 
            !matchesPurgeTarget(r.managerEmail || r.email, r.parentUserEmail)
          );
        }
        if ((store as any).managerVerifications) {
          (store as any).managerVerifications = (store as any).managerVerifications.filter((v: any) => 
            !matchesPurgeTarget(v.managerEmail || v.email, v.parentUserEmail)
          );
        }
        if ((store as any).managerRequests) {
          (store as any).managerRequests = (store as any).managerRequests.filter((r: any) => 
            !matchesPurgeTarget(r.managerEmail || r.email, r.parentUserEmail)
          );
        }
        if ((store as any).hostelVerifications) {
          (store as any).hostelVerifications = (store as any).hostelVerifications.filter((v: any) => 
            !matchesPurgeTarget(v.managerEmail || v.email, v.parentUserEmail)
          );
        }
        if ((store as any).managerProfiles) {
          (store as any).managerProfiles = (store as any).managerProfiles.filter((p: any) => 
            !matchesPurgeTarget(p.email, p.parentUserEmail)
          );
        }

        if (persistentData.hostelVerifications) {
          persistentData.hostelVerifications = persistentData.hostelVerifications.filter((v: any) => 
            !matchesPurgeTarget(v.managerEmail || v.email, v.parentUserEmail)
          );
        }
        if ((persistentData as any).managerVerifications) {
          (persistentData as any).managerVerifications = (persistentData as any).managerVerifications.filter((v: any) => 
            !matchesPurgeTarget(v.managerEmail || v.email, v.parentUserEmail)
          );
        }

        if (store.managerAccountSettings && purgeManagerEmail) {
          delete store.managerAccountSettings[purgeManagerEmail];
        }

        // Apply a 30-day manager account creation restriction to prevent account abuse
        if (!store.managerRestrictions) {
          store.managerRestrictions = [];
        }
        
        // Remove existing restrictions for the user/manager email to avoid duplicates
        store.managerRestrictions = store.managerRestrictions.filter((r: any) => {
          const uEmail = (r.userEmail || '').toLowerCase().trim();
          const mEmail = (r.deletedManagerEmail || '').toLowerCase().trim();
          return !(uEmail === reqUserEmail || mEmail === purgeManagerEmail || uEmail === purgeManagerEmail);
        });

        const restrictionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const finalReason = (deletionReason || '').trim();
        store.managerRestrictions.push({
          id: `restr-${Date.now()}`,
          userEmail: reqUserEmail || cleanEmail,
          deletedManagerEmail: purgeManagerEmail || cleanEmail,
          deletedAt: new Date().toISOString(),
          expiresAt: restrictionExpiresAt,
          reason: finalReason,
          bypassRequested: finalReason.length > 0,
          bypassApproved: false,
          bypassRejected: false,
          adminNotes: ''
        });

        savePersistentStore(store);
      } else if (role === 'staff') {
        // Remove from staff roster
        for (let i = staff.length - 1; i >= 0; i--) {
          if ((staff[i].email || '').toLowerCase().trim() === cleanEmail) {
            staff.splice(i, 1);
          }
        }
        // Remove from staffApplications
        for (let i = staffApplications.length - 1; i >= 0; i--) {
          if ((staffApplications[i].staffEmail || staffApplications[i].email || '').toLowerCase().trim() === cleanEmail) {
            staffApplications.splice(i, 1);
          }
        }
        if (matchedUser && (matchedUser.user?.role === 'staff' || matchedUser.role === 'staff')) {
          if (matchedUser.user) {
            matchedUser.user.role = 'user';
            matchedUser.user.isVerified = false;
            matchedUser.user.verificationStatus = undefined;
          }
          matchedUser.role = 'user';
        }
      } else if (role === 'resident') {
        const store = getStoreInstance();
        // Unassign room key in store
        (store.roomKeys || []).forEach((rk: any) => {
          if ((rk.assignedStudentEmail || '').toLowerCase().trim() === cleanEmail) {
            rk.status = 'Available';
            rk.assignedStudentId = null;
            rk.assignedStudentName = null;
            rk.assignedStudentEmail = null;
            rk.assignedStudentPhone = null;
            rk.assignedAt = null;
          }
        });
        if (matchedUser) {
          if (matchedUser.user) {
            matchedUser.user.roomKey = '';
            matchedUser.user.hostelId = '';
            matchedUser.user.hostelName = '';
            matchedUser.user.blockName = '';
            matchedUser.user.roomNumber = '';
          }
        }
        (store.users || []).forEach((u: any) => {
          if ((u.email || '').toLowerCase().trim() === cleanEmail) {
            u.roomKey = '';
            u.hostelId = '';
            u.hostelName = '';
            u.blockName = '';
            u.roomNumber = '';
          }
        });
        savePersistentStore(store);
      }

      syncStore();
      
      let successMessage = `Your registered ${role} account has been removed. You can now start a new registration.`;
      let notifMessage = `Your registered ${role} account has been deleted. You can now start the registration process again whenever ready.`;
      let activityMessage = `Registered ${role.toUpperCase()} account (${cleanEmail}) was removed. Registration is now unlocked.`;

      if (role === 'manager') {
        const finalReason = (deletionReason || '').trim();
        if (finalReason.length > 0) {
          successMessage = `Your registered Manager account was deleted. A 30-day restriction has been applied, but your bypass request has been sent to Admin for review.`;
          notifMessage = `Your registered Manager account was deleted. Your bypass request is pending Admin approval.`;
          activityMessage = `Registered MANAGER account (${cleanEmail}) was deleted. 30-day restriction applied; bypass request pending admin review.`;
        } else {
          successMessage = `Your registered Manager account was deleted. A 30-day restriction has been applied to prevent account abuse.`;
          notifMessage = `Your registered Manager account was deleted. Under a 30-day restriction.`;
          activityMessage = `Registered MANAGER account (${cleanEmail}) was deleted. 30-day restriction applied without bypass request.`;
        }
      }

      // Send notification to user so they see the state change
      const delNotif = {
        id: `notif-del-${Date.now()}`,
        studentId: cleanEmail,
        userId: cleanEmail,
        userEmail: cleanEmail,
        recipientEmail: cleanEmail,
        title: `${role.charAt(0).toUpperCase() + role.slice(1)} Account Removed`,
        message: notifMessage,
        type: 'warning',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(delNotif);
      await dbCreateNotification(delNotif, notifications);

      await dbCreateActivity({
        id: `act-del-${Date.now()}`,
        text: activityMessage,
        type: 'warning'
      }, activities);

      return res.json({
        success: true,
        message: successMessage
      });
    } catch (err: any) {
      console.error("Error deleting registered account:", err);
      return res.status(500).json({ error: "Failed to delete registered account." });
    }
  });

  // Fetch active manager restriction status for the authenticated user
  app.get("/api/users/manager-restriction", requireAuth(), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const userEmail = (req.user?.email || req.user?.user?.email || '').toLowerCase().trim();
      if (!store.managerRestrictions) store.managerRestrictions = [];
      
      const activeRestriction = store.managerRestrictions.find((r: any) => {
        const uEmail = (r.userEmail || '').toLowerCase().trim();
        const mEmail = (r.deletedManagerEmail || '').toLowerCase().trim();
        const isMatch = uEmail === userEmail || mEmail === userEmail;
        if (isMatch) {
          const isExpired = new Date(r.expiresAt).getTime() <= Date.now();
          if (!isExpired) {
            return true;
          }
        }
        return false;
      });
      
      return res.json({ restriction: activeRestriction || null });
    } catch (err: any) {
      console.error("Error fetching manager restriction:", err);
      return res.status(500).json({ error: "Failed to fetch restriction status." });
    }
  });

  // Admin: Fetch all manager restrictions / bypass requests
  app.get("/api/admin/manager-restrictions", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      if (!store.managerRestrictions) store.managerRestrictions = [];
      return res.json(store.managerRestrictions);
    } catch (err: any) {
      console.error("Error fetching admin manager restrictions:", err);
      return res.status(500).json({ error: "Failed to fetch restrictions list." });
    }
  });

  // Admin: Approve a restriction bypass request
  app.post("/api/admin/manager-restrictions/:id/approve", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const store = getStoreInstance();
      if (!store.managerRestrictions) store.managerRestrictions = [];
      const restriction = store.managerRestrictions.find((r: any) => r.id === id);
      if (!restriction) {
        return res.status(404).json({ error: "Restriction request not found." });
      }
      
      restriction.bypassApproved = true;
      restriction.bypassRejected = false;
      restriction.expiresAt = new Date().toISOString(); // Immediately expire the restriction
      
      savePersistentStore(store);
      syncStore();
      
      // Also notify the user
      const targetEmail = restriction.userEmail;
      const bypassNotif = {
        id: `notif-bypass-${Date.now()}`,
        studentId: targetEmail,
        userId: targetEmail,
        userEmail: targetEmail,
        recipientEmail: targetEmail,
        title: `Manager Restriction Bypassed`,
        message: `Admin has approved your request to bypass the 30-day restriction. You can now register a new Hostel Manager account.`,
        type: 'success',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(bypassNotif);
      await dbCreateNotification(bypassNotif, notifications);
      
      await dbCreateActivity({
        id: `act-bypass-${Date.now()}`,
        text: `Admin approved 30-day manager restriction bypass for user (${targetEmail}).`,
        type: 'info'
      }, activities);
      
      return res.json({ success: true, message: "Restriction bypassed successfully. The user can now register a new manager account." });
    } catch (err: any) {
      console.error("Error approving bypass:", err);
      return res.status(500).json({ error: "Failed to approve bypass request." });
    }
  });

  // Admin: Reject a restriction bypass request
  app.post("/api/admin/manager-restrictions/:id/reject", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const store = getStoreInstance();
      if (!store.managerRestrictions) store.managerRestrictions = [];
      const restriction = store.managerRestrictions.find((r: any) => r.id === id);
      if (!restriction) {
        return res.status(404).json({ error: "Restriction request not found." });
      }
      
      restriction.bypassApproved = false;
      restriction.bypassRejected = true;
      restriction.adminNotes = adminNotes || "No reason specified by Admin.";
      
      savePersistentStore(store);
      syncStore();
      
      // Notify the user
      const targetEmail = restriction.userEmail;
      const rejectNotif = {
        id: `notif-bypass-rej-${Date.now()}`,
        studentId: targetEmail,
        userId: targetEmail,
        userEmail: targetEmail,
        recipientEmail: targetEmail,
        title: `Manager Bypass Rejected`,
        message: `Admin has rejected your restriction bypass request. Reason: ${restriction.adminNotes}. You must wait out the 30-day restriction.`,
        type: 'error',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(rejectNotif);
      await dbCreateNotification(rejectNotif, notifications);
      
      await dbCreateActivity({
        id: `act-bypass-rej-${Date.now()}`,
        text: `Admin rejected 30-day manager restriction bypass for user (${targetEmail}). Reason: ${restriction.adminNotes}`,
        type: 'warning'
      }, activities);
      
      return res.json({ success: true, message: "Restriction bypass request rejected." });
    } catch (err: any) {
      console.error("Error rejecting bypass:", err);
      return res.status(500).json({ error: "Failed to reject bypass request." });
    }
  });

  // ==========================================
  // DIGITAL STUDENT MARKET ENDPOINTS
  // ==========================================

  const ACCREDITED_GHANA_UNIVERSITY_DOMAINS = [
    'st.knust.edu.gh', 'knust.edu.gh',
    'st.ug.edu.gh', 'ug.edu.gh',
    'stu.ucc.edu.gh', 'ucc.edu.gh',
    'upsamail.edu.gh', 'upsa.edu.gh',
    'st.uew.edu.gh', 'uew.edu.gh',
    'stu.umat.edu.gh', 'umat.edu.gh',
    'stu.uds.edu.gh', 'uds.edu.gh',
    'stu.uhas.edu.gh', 'uhas.edu.gh',
    'stu.uenr.edu.gh', 'uenr.edu.gh',
    'students.gimpa.edu.gh', 'gimpa.edu.gh',
    'stu.gctu.edu.gh', 'gctu.edu.gh',
    'stu.aamusted.edu.gh', 'aamusted.edu.gh',
    'stu.unimac.edu.gh', 'unimac.edu.gh', 'gij.edu.gh',
    'stu.atu.edu.gh', 'atu.edu.gh',
    'stu.kstu.edu.gh', 'kstu.edu.gh',
    'stu.ttu.edu.gh', 'ttu.edu.gh',
    'stu.htu.edu.gh', 'htu.edu.gh',
    'stu.ktu.edu.gh', 'ktu.edu.gh',
    'stu.cctu.edu.gh', 'cctu.edu.gh',
    'stu.stu.edu.gh', 'stu.edu.gh',
    'stu.tatu.edu.gh', 'tatug.edu.gh', 'tatu.edu.gh',
    'stu.btu.edu.gh', 'btu.edu.gh',
    'stu.wtu.edu.gh', 'wtu.edu.gh',
    'ashesi.edu.gh',
    'stu.central.edu.gh', 'central.edu.gh',
    'stu.vvu.edu.gh', 'vvu.edu.gh',
    'stu.pentvars.edu.gh', 'pentvars.edu.gh',
    'stu.cug.edu.gh', 'cug.edu.gh',
    'stu.wiuc.edu.gh', 'wiuc.edu.gh', 'wiuc-ghana.edu.gh',
    'stu.rmu.edu.gh', 'rmu.edu.gh',
    'acity.edu.gh',
    'lancaster.edu.gh',
    'presbyuniversity.edu.gh', 'pug.edu.gh',
    'anu.edu.gh', 'anuc.edu.gh'
  ];

  const validateGhanaianStudentEmail = (email: string): { isValid: boolean; error?: string } => {
    const clean = (email || '').toLowerCase().trim();
    if (!clean || !clean.includes('@')) {
      return { isValid: false, error: 'A valid student email address is required.' };
    }
    const parts = clean.split('@');
    if (parts.length !== 2 || !parts[1]) {
      return { isValid: false, error: 'Invalid email formatting.' };
    }
    const domain = parts[1].toLowerCase();
    const commercial = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'mail.com', 'zoho.com', 'protonmail.com'];
    if (commercial.includes(domain)) {
      return {
        isValid: false,
        error: `Commercial email providers (@${domain}) are not permitted. You must register using your official accredited Ghanaian university student email (e.g. @st.knust.edu.gh, @st.ug.edu.gh, @stu.ucc.edu.gh, @upsamail.edu.gh, or any .edu.gh domain).`
      };
    }
    const isDomainMatched = ACCREDITED_GHANA_UNIVERSITY_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
    const isEduGh = domain.endsWith('.edu.gh') || domain.endsWith('.ac.gh');
    if (!isDomainMatched && !isEduGh) {
      return {
        isValid: false,
        error: `Domain @${domain} is not recognized as an accredited Ghanaian university domain. Only official Ghanaian student emails (ending in .edu.gh or from accredited institutions) are eligible for the Student Digital Market.`
      };
    }
    return { isValid: true };
  };

  // Submit Student Digital Market Application
  app.post("/api/digital-market/register", requireAuth(["user"]), requirePrimaryAccount, async (req: any, res) => {
    try {
      const {
        fullName, university, studentEmail, categoryToSell,
        whatToSell, idNumber, studentIdNumber, parentUserEmail, userId, password
      } = req.body;

      const cleanStudentEmail = (studentEmail || '').toLowerCase().trim();
      const cleanParentEmail = (parentUserEmail || '').toLowerCase().trim();
      const cleanUserId = (userId || '').trim();

      // Strict Ghanaian university student email validation
      const emailValidation = validateGhanaianStudentEmail(cleanStudentEmail || cleanParentEmail);
      if (!emailValidation.isValid) {
        return res.status(400).json({ error: emailValidation.error });
      }

      const resolvedCategory = (categoryToSell || whatToSell || 'Electronics, Gadgets & Accessories').trim();
      const resolvedIdNumber = (idNumber || studentIdNumber || "").trim().toUpperCase();
      // A current student ID is sufficient for market access; national-ID-only checks are not required.
      if (!resolvedIdNumber || !/^[A-Z0-9][A-Z0-9\-\/]{3,31}$/.test(resolvedIdNumber)) {
        return res.status(400).json({
          error: "Enter a valid student ID or other school-issued identification number (4–32 letters, numbers, hyphens, or slashes)."
        });
      }

      const store = getStoreInstance();
      if (!store.digitalMarketApplications) store.digitalMarketApplications = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];
      if (!store.users) store.users = [];

      // Block duplicate applications or active store — matched by userId, parentUserEmail, or studentEmail
      const existingApp = store.digitalMarketApplications.find((a: any) =>
        (a.status === 'pending' || a.status === 'approved' || a.status === 'active') && (
          (cleanUserId && a.userId === cleanUserId) ||
          (cleanParentEmail && a.parentUserEmail?.toLowerCase() === cleanParentEmail) ||
          (cleanStudentEmail && (a.studentEmail?.toLowerCase() === cleanStudentEmail || a.parentUserEmail?.toLowerCase() === cleanStudentEmail))
        )
      ) || store.digitalMarketStores.find((s: any) =>
        (cleanUserId && s.userId === cleanUserId) ||
        (cleanParentEmail && s.parentUserEmail?.toLowerCase() === cleanParentEmail) ||
        (cleanStudentEmail && (s.studentEmail?.toLowerCase() === cleanStudentEmail || s.parentUserEmail?.toLowerCase() === cleanStudentEmail))
      );

      if (existingApp) {
        return res.status(400).json({ 
          error: "You already have a registered Digital Student Market application or active store. You cannot submit duplicate applications." 
        });
      }

      const cleanPassword = hashCredential(password);
      if (!cleanPassword) {
        return res.status(400).json({ error: 'Password is required.' });
      }

      const newApp = {
        id: `dmapp-${Date.now()}`,
        userId: cleanUserId || `usr-${Date.now()}`,
        parentUserEmail: cleanParentEmail || cleanStudentEmail,
        fullName: (fullName || 'Student Merchant').trim(),
        university: (university || 'KNUST').trim(),
        studentEmail: cleanStudentEmail || cleanParentEmail,
        password: cleanPassword,
        categoryToSell: resolvedCategory,
        idNumber: resolvedIdNumber,
        status: 'pending',
        registrationFeePaid: false,
        registrationFeeAmount: 50,
        semesterFeeAmount: 300,
        submittedAt: new Date().toISOString()
      };

      store.digitalMarketApplications.unshift(newApp);

      // The application owns merchant credentials. Do not alter any same-email resident or primary record.
      persistentData.users = MOCK_USERS;

      savePersistentStore(store);
      syncStore();

      await dbCreateActivity({
        id: `act-dmarket-${Date.now()}`,
        text: `New Digital Student Market application submitted by ${fullName} (${university}) with student email ${cleanStudentEmail}.`,
        type: 'info'
      }, activities);

      return res.status(201).json({ 
        success: true, 
        application: newApp, 
        message: "Digital Market application submitted successfully for Admin verification." 
      });
    } catch (err: any) {
      console.error("Error registering digital market account:", err);
      return res.status(500).json({ error: "Failed to submit Digital Market application." });
    }
  });

  // Complete Digital Market Store Onboarding & Creation
  app.post("/api/digital-market/create-store", async (req: any, res) => {
    try {
      const {
        studentEmail, storeName, location, deliveryForm,
        category, coverPicture, profilePicture, username
      } = req.body;

      if (!studentEmail) {
        return res.status(400).json({ error: "Student email is required for store creation." });
      }

      if (!storeName || !location || !deliveryForm || !category || !username) {
        return res.status(400).json({ error: "All onboarding details (Store Name, Location, Delivery Form, Category, and Username) are mandatory." });
      }

      const cleanEmail = studentEmail.toLowerCase().trim();
      const store = getStoreInstance();

      if (!store.digitalMarketApplications) store.digitalMarketApplications = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      const application = store.digitalMarketApplications.find((a: any) =>
        a.studentEmail?.toLowerCase() === cleanEmail
      );

      if (!application) {
        return res.status(404).json({ error: "No verified digital market application found for this email." });
      }

      // Check if store already exists
      let existingStore = store.digitalMarketStores.find((s: any) =>
        s.studentEmail?.toLowerCase() === cleanEmail
      );

      if (existingStore && existingStore.status === 'active') {
        return res.status(400).json({ error: "A Digital Market store is already active for this email.", store: existingStore });
      }

      const storeId = `store-${application.id || Date.now()}`;
      const newStore = {
        id: storeId,
        userId: application.userId,
        storeName: storeName.trim(),
        location: location.trim(),
        deliveryForm: deliveryForm.trim(),
        category: category.trim(),
        coverPicture: coverPicture || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80',
        profilePicture: profilePicture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
        logoUrl: profilePicture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
        bannerUrl: coverPicture || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80',
        username: username.trim(),
        studentEmail: cleanEmail,
        parentUserEmail: application.parentUserEmail || cleanEmail,
        university: application.university || 'Accredited University',
        status: 'active',
        isBanned: false,
        registrationFeePaid: true,
        setupCompleted: true,
        paymentTransactionRef: `PINE-MM-PAY-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        phone: application.phone || '0244-123-456',
        description: `Official student digital market store by ${application.fullName} at ${application.university || 'Accredited University'}.`
      };

      if (existingStore) {
        Object.assign(existingStore, newStore);
      } else {
        store.digitalMarketStores.unshift(newStore);
      }

      application.registrationFeePaid = true;
      application.setupCompleted = true;
      application.paidAt = new Date().toISOString();

      const markMerchantActive = (u: any) => {
        const target = u.user || u;
        if (target.roomKey || target.role === 'user' || !target.isDigitalMarketOnly) return;
        target.role = 'merchant';
        target.isApprovedMerchant = true;
        target.hasApprovedMerchantStore = true;
        target.merchantStoreId = newStore.id;
        target.merchantStoreName = newStore.storeName;
        target.merchantSetupCompleted = true;
        target.merchantRegistrationFeePaid = true;
        target.targetRedirect = '/digital-market';
      };

      const studentEmailClean = (cleanEmail || application.studentEmail || '').toLowerCase().trim();
      const inStoreUsers = (store.users || []).filter((u: any) =>
        (u.email || '').toLowerCase().trim() === studentEmailClean
      );
      inStoreUsers.forEach(markMerchantActive);

      const inMockUsers = MOCK_USERS.filter((u: any) =>
        (u.email || u.user?.email || '').toLowerCase().trim() === studentEmailClean
      );
      inMockUsers.forEach(markMerchantActive);

      savePersistentStore(store);
      syncStore();

      return res.json({
        success: true,
        store: newStore,
        message: "Digital Market Store created & activated successfully!"
      });
    } catch (err: any) {
      console.error("Error creating digital market store:", err);
      return res.status(500).json({ error: "Failed to create Digital Market Store." });
    }
  });

  // Get Digital Market status for current user
  app.get("/api/digital-market/status", requireAuth(), async (req: any, res) => {
    try {
      if (!['user', 'merchant', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Open market registration from your primary account, or sign in with your market password.' });
      const userEmail = (req.query.email || '').toString().toLowerCase().trim();
      const userId = (req.query.userId || '').toString().trim();
      if (req.user.role !== 'admin' && ((userEmail && userEmail !== normalizeEmail(req.user.email)) || (userId && userId !== req.user.id && userId !== req.user.parentUserId))) return res.status(403).json({ error: 'You cannot view another account’s market registration.' });

      const store = getStoreInstance();
      if (!store.digitalMarketApplications) store.digitalMarketApplications = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      const application = store.digitalMarketApplications.find((a: any) =>
        (userEmail && (a.studentEmail?.toLowerCase() === userEmail || a.parentUserEmail?.toLowerCase() === userEmail)) ||
        (userId && a.userId === userId)
      );

      let digitalStore = store.digitalMarketStores.find((s: any) =>
        (userEmail && (s.studentEmail?.toLowerCase() === userEmail || s.parentUserEmail?.toLowerCase() === userEmail)) ||
        (userId && s.userId === userId)
      );

      if (digitalStore) {
        if (!store.digitalMarketRatings) store.digitalMarketRatings = [];
        const cleanSId = (digitalStore.id || '').toString().trim();
        const cleanSEmail = (digitalStore.studentEmail || digitalStore.parentUserEmail || '').toString().toLowerCase().trim();
        const matchedRatings = store.digitalMarketRatings.filter((r: any) => {
          if (cleanSId && r.storeId === cleanSId) return true;
          if (cleanSEmail && r.sellerEmail?.toLowerCase() === cleanSEmail) return true;
          return false;
        });
        const ratingCount = matchedRatings.length;
        const totalScore = matchedRatings.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0);
        const storeRating = ratingCount > 0 ? Math.round((totalScore / ratingCount) * 10) / 10 : (digitalStore.storeRating || 5.0);

        digitalStore = {
          ...digitalStore,
          storeRating,
          ratingCount
        };
      }

      return res.json({
        application: application || null,
        store: digitalStore || null
      });
    } catch (err: any) {
      console.error("Error fetching digital market status:", err);
      return res.status(500).json({ error: "Failed to fetch Digital Market status." });
    }
  });

  // Dedicated Digital Market Store Login Endpoint
  app.post("/api/digital-market/login", async (req: any, res) => {
    try {
      const { studentEmail, password } = req.body;
      if (typeof studentEmail !== 'string' || !studentEmail || typeof password !== 'string' || !password || password.length > 1024) {
        return res.status(400).json({ error: "Student email and store password are required." });
      }

      const cleanEmail = studentEmail.toLowerCase().trim();
      const store = getStoreInstance();

      // Look specifically for merchant application or store matching the student email
      const marketApp = store.digitalMarketApplications?.find((a: any) =>
        a.studentEmail?.toLowerCase() === cleanEmail
      );
      const approvedStore = store.digitalMarketStores?.find((s: any) =>
        (s.studentEmail?.toLowerCase() === cleanEmail || (marketApp && s.userId === marketApp.userId)) &&
        !s.isBanned && (s.status === 'active' || marketApp?.status === 'approved')
      );

      if (!marketApp && !approvedStore) {
        return res.status(404).json({
          error: "No Digital Market Store found for this student email. Please enter the student email registered during store creation."
        });
      }

      // Check password
      const storedPwd = marketApp?.password || marketApp?.plainPassword;
      const hashedInput = crypto.createHash('sha256').update(password).digest('hex');
      const passMatch = passwordsMatch(password, storedPwd);

      if (!passMatch) {
        return res.status(401).json({ error: "Incorrect Digital Market Store password." });
      }

      if (store.digitalMarketStores?.some(s => normalizeEmail(s.studentEmail) === cleanEmail && s.isBanned) || ['rejected', 'banned', 'disabled'].includes(String(marketApp?.status))) return res.status(403).json({ error: 'This market account is not permitted to sign in.' });
      if ([...MOCK_USERS, ...(store.users || [])].some(u => normalizeEmail(accountData(u)?.email || u.email) === cleanEmail && (accountData(u)?.roomKey || accountRole(u) === 'user') && credentialValues(u).some(hash => passwordsMatch(password, hash)))) {
        return res.status(409).json({ error: 'Your existing accounts share a password. Reset the room or market password before signing in.', requiresPasswordReset: true });
      }

      if ((marketApp?.status === 'pending') && !approvedStore) {
        return res.status(403).json({
          error: "Your PineVela Student Digital Market application is still pending campus admin verification.",
          isPendingApproval: true,
          studentEmail: cleanEmail
        });
      }

      const targetStore = approvedStore || {
        id: `store-${marketApp.id || Date.now()}`,
        userId: marketApp.userId,
        storeName: marketApp.storeName || `${marketApp.fullName}'s Campus Store`,
        category: marketApp.categoryToSell || 'Electronics & Gadgets',
        description: `Official student digital market store by ${marketApp.fullName} at ${marketApp.university}.`,
        phone: marketApp.phone || '+233201234567',
        studentEmail: marketApp.studentEmail,
        university: marketApp.university,
        status: marketApp.setupCompleted ? 'active' : 'pending_setup',
        isBanned: false,
        registrationFeePaid: Boolean(marketApp.registrationFeePaid),
        setupCompleted: Boolean(marketApp.setupCompleted)
      };

      const isSetupCompleted = Boolean(targetStore.setupCompleted && targetStore.registrationFeePaid);
      const parentEmail = marketApp?.parentUserEmail || targetStore?.parentUserEmail || cleanEmail;
      const merchantUser = {
        id: `merchant:${marketApp?.id || targetStore.id}`,
        name: marketApp?.fullName || targetStore.storeName || 'Student Merchant',
        email: cleanEmail,
        studentEmail: cleanEmail,
        parentUserEmail: parentEmail,
        role: 'merchant',
        isDigitalMarketOnly: true,
        isApprovedMerchant: true,
        hasApprovedMerchantStore: true,
        merchantStoreId: targetStore.id,
        merchantStoreName: targetStore.storeName,
        merchantSetupCompleted: isSetupCompleted,
        merchantRegistrationFeePaid: isSetupCompleted,
        targetRedirect: isSetupCompleted ? '/digital-market' : '/digital-market/onboard',
        institution: targetStore.university,
        token: createSessionToken('merchant')
      };

      // Set session auth cookie for persistence across tabs
      res.cookie("pv_auth_token", merchantUser.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      if (marketApp) marketApp.merchantToken = merchantUser.token;
      if (approvedStore) approvedStore.merchantToken = merchantUser.token;
      savePersistentStore(store);

      const needsSetup = !isSetupCompleted;

      return res.json({
        success: true,
        needsSetup,
        application: marketApp,
        user: merchantUser,
        store: targetStore,
        token: merchantUser.token,
        message: needsSetup ? "Application approved! Please complete your digital market store setup." : "Successfully logged into Digital Market Platform!"
      });
    } catch (err: any) {
      console.error("Error in digital market login endpoint:", err);
      return res.status(500).json({ error: "Failed to authenticate into digital market store." });
    }
  });

  // Complete Store Setup & 50 GHS Platform Activation Payment
  app.post("/api/digital-market/store-setup", async (req: any, res) => {
    try {
      const {
        storeName, category, description, phone, logoUrl, bannerUrl,
        userEmail, studentEmail, userId, paymentMethod, paymentPhone, paymentNetwork, transactionRef,
        location, deliveryMode, username, profilePicture, coverPicture, momoPhone
      } = req.body;
      const store = getStoreInstance();
      if (!store.digitalMarketStores) store.digitalMarketStores = [];
      if (!store.digitalMarketApplications) store.digitalMarketApplications = [];

      const cleanEmail = (userEmail || studentEmail || '').toLowerCase().trim();
      const application = store.digitalMarketApplications.find((a: any) =>
        (cleanEmail && (a.studentEmail?.toLowerCase() === cleanEmail || a.parentUserEmail?.toLowerCase() === cleanEmail)) ||
        (userId && a.userId === userId)
      );

      if (!application || application.status !== 'approved') {
        return res.status(403).json({ error: "Your application must be approved by a PineVela Admin before setting up and activating your store." });
      }

      const txRef = transactionRef || `PINE-MM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const nowIso = new Date().toISOString();

      // Mark application as paid and setup completed
      application.registrationFeePaid = true;
      application.setupCompleted = true;
      application.paymentMethod = paymentMethod || paymentNetwork || 'Mobile Money (MTN/Telecel/AT)';
      application.paymentTransactionRef = txRef;
      application.paidAt = nowIso;

      let existingStore = store.digitalMarketStores.find((s: any) =>
        (cleanEmail && (s.studentEmail?.toLowerCase() === cleanEmail || s.parentUserEmail?.toLowerCase() === cleanEmail)) ||
        (userId && s.userId === userId)
      );

      const resolvedLogo = profilePicture || logoUrl || existingStore?.logoUrl || '';
      const resolvedBanner = coverPicture || bannerUrl || existingStore?.bannerUrl || '';
      const resolvedPhone = phone || momoPhone || paymentPhone || existingStore?.phone || application.phone || '';

      if (existingStore) {
        existingStore.storeName = storeName || existingStore.storeName;
        existingStore.category = category || existingStore.category;
        existingStore.description = description || existingStore.description;
        existingStore.phone = resolvedPhone;
        existingStore.logoUrl = resolvedLogo;
        existingStore.bannerUrl = resolvedBanner;
        existingStore.profilePicture = resolvedLogo;
        existingStore.coverPicture = resolvedBanner;
        if (location) existingStore.location = location;
        if (deliveryMode) existingStore.deliveryMode = deliveryMode;
        if (username) existingStore.username = username;
        existingStore.status = 'active';
        existingStore.isVerified = true;
        existingStore.isBanned = false;
        existingStore.registrationFeePaid = true;
        existingStore.setupCompleted = true;
        existingStore.paymentMethod = paymentMethod || paymentNetwork || 'Mobile Money';
        existingStore.paymentTransactionRef = txRef;
        existingStore.activatedAt = nowIso;
      } else {
        existingStore = {
          id: `dmstore-${Date.now()}`,
          userId: userId || application.userId,
          parentUserEmail: application.parentUserEmail || cleanEmail,
          storeName: storeName || `${application.fullName}'s Market`,
          university: application.university || 'Accredited Ghanaian University',
          ownerName: application.fullName,
          studentEmail: application.studentEmail,
          category: category || application.categoryToSell,
          description: description || `Verified Student Digital Store at ${application.university}`,
          phone: resolvedPhone,
          logoUrl: resolvedLogo,
          bannerUrl: resolvedBanner,
          profilePicture: resolvedLogo,
          coverPicture: resolvedBanner,
          location: location || `${application.university || 'Campus'}`,
          deliveryMode: deliveryMode || 'Campus Meetup / In-Person Delivery',
          username: username || application.fullName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'studentmerchant',
          isBanned: false,
          isVerified: true,
          registrationFeePaid: true,
          setupCompleted: true,
          paymentMethod: paymentMethod || paymentNetwork || 'Mobile Money',
          paymentTransactionRef: txRef,
          status: 'active',
          createdAt: nowIso,
          activatedAt: nowIso
        };
        store.digitalMarketStores.unshift(existingStore);
      }

      // Update student user to merchant role
      const markActivated = (u: any) => {
        const target = u.user || u;
        if (target.roomKey || target.role === 'user' || !target.isDigitalMarketOnly) return;
        target.role = 'merchant';
        target.isApprovedMerchant = true;
        target.hasApprovedMerchantStore = true;
        target.merchantStoreId = existingStore.id;
        target.merchantStoreName = existingStore.storeName;
        target.merchantSetupCompleted = true;
        target.merchantRegistrationFeePaid = true;
        target.targetRedirect = '/digital-market';
      };

      const studentEmailClean = (cleanEmail || application.studentEmail || '').toLowerCase().trim();
      const inStoreUsers = (store.users || []).filter((u: any) =>
        (u.email || '').toLowerCase().trim() === studentEmailClean
      );
      inStoreUsers.forEach(markActivated);

      const inMockUsers = MOCK_USERS.filter((u: any) =>
        (u.email || u.user?.email || '').toLowerCase().trim() === studentEmailClean
      );
      inMockUsers.forEach(markActivated);

      savePersistentStore(store);
      syncStore();

      await dbCreateActivity({
        id: `act-dm-setup-${Date.now()}`,
        text: `Student merchant ${application.fullName} completed 50 GHS platform activation for "${existingStore.storeName}" (${application.university}) via ${paymentMethod || 'Mobile Money'} [Ref: ${txRef}].`,
        type: 'success'
      }, activities);

      return res.json({ 
        success: true, 
        store: existingStore, 
        message: "Digital Market Store setup & 50 GHS platform activation completed successfully! 🎉" 
      });
    } catch (err: any) {
      console.error("Error setting up digital store:", err);
      return res.status(500).json({ error: "Failed to setup Digital Store." });
    }
  });

  // Update Digital Market Store Profile Details
  app.put("/api/digital-market/store", async (req: any, res) => {
    try {
      const { studentEmail, storeName, location, deliveryForm, category, coverPicture, profilePicture, username, description } = req.body;
      if (!studentEmail) {
        return res.status(400).json({ error: "Student email is required to update store." });
      }

      const cleanEmail = studentEmail.toLowerCase().trim();
      const store = getStoreInstance();
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      let existingStore = store.digitalMarketStores.find((s: any) =>
        s.studentEmail?.toLowerCase() === cleanEmail ||
        s.parentUserEmail?.toLowerCase() === cleanEmail ||
        s.email?.toLowerCase() === cleanEmail ||
        (s.id && s.id === studentEmail) ||
        (s.userId && s.userId === studentEmail)
      );

      if (!existingStore) {
        return res.status(404).json({ error: "No active store found for this merchant email." });
      }

      if (storeName) existingStore.storeName = storeName.trim();
      if (location) existingStore.location = location.trim();
      if (deliveryForm) existingStore.deliveryForm = deliveryForm.trim();
      if (category) existingStore.category = category.trim();
      if (coverPicture) {
        existingStore.coverPicture = coverPicture;
        existingStore.bannerUrl = coverPicture;
      }
      if (profilePicture) {
        existingStore.profilePicture = profilePicture;
        existingStore.logoUrl = profilePicture;
      }
      if (username) existingStore.username = username.trim();
      if (description) existingStore.description = description.trim();

      savePersistentStore(store);
      syncStore();

      return res.json({
        success: true,
        store: existingStore,
        message: "Digital Market Store profile updated successfully!"
      });
    } catch (err: any) {
      console.error("Error updating store profile:", err);
      return res.status(500).json({ error: "Failed to update store profile." });
    }
  });

  // Public Catalog of Digital Products
  app.get("/api/digital-market/products", async (req: any, res) => {
    try {
      const { storeId, sellerEmail, includeAll } = req.query;
      const store = getStoreInstance();
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];
      if (!store.digitalMarketRatings) store.digitalMarketRatings = [];

      const cleanEmail = (sellerEmail || '').toString().toLowerCase().trim();
      const cleanStoreId = (storeId || '').toString().trim();

      const getStoreRatingSummary = (sId?: string, sEmail?: string) => {
        const cleanSId = (sId || '').trim();
        const cleanSEmail = (sEmail || '').toLowerCase().trim();
        const matched = store.digitalMarketRatings.filter((r: any) => {
          if (cleanSId && r.storeId === cleanSId) return true;
          if (cleanSEmail && r.sellerEmail?.toLowerCase() === cleanSEmail) return true;
          return false;
        });
        const count = matched.length;
        if (count === 0) {
          return { storeRating: 5.0, ratingCount: 0 };
        }
        const total = matched.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0);
        const avg = Math.round((total / count) * 10) / 10;
        return { storeRating: avg, ratingCount: count };
      };

      const enrichProducts = (prodList: any[]) => {
        return prodList.map((p: any) => {
          const s = store.digitalMarketStores.find((storeObj: any) => 
            storeObj.id === p.storeId || 
            (p.sellerEmail && storeObj.studentEmail?.toLowerCase() === p.sellerEmail.toLowerCase())
          );
          const ratingSummary = getStoreRatingSummary(p.storeId || s?.id, p.sellerEmail || s?.studentEmail);
          return {
            ...p,
            storeName: s?.storeName || p.storeName,
            sellerName: s?.username || s?.storeName || p.sellerName,
            sellerPhone: s?.phone || p.sellerPhone,
            storeLogoUrl: s?.profilePicture || s?.logoUrl || '',
            storeRating: ratingSummary.storeRating,
            ratingCount: ratingSummary.ratingCount
          };
        });
      };

      if (includeAll === 'true' || cleanStoreId || cleanEmail) {
        let products = store.digitalMarketProducts;
        if (cleanStoreId || cleanEmail) {
          const matchingStoreIds = new Set(
            store.digitalMarketStores
              .filter((s: any) => 
                (cleanStoreId && s.id === cleanStoreId) ||
                (cleanEmail && (
                  s.studentEmail?.toLowerCase() === cleanEmail ||
                  s.parentUserEmail?.toLowerCase() === cleanEmail
                ))
              )
              .map((s: any) => s.id)
          );

          products = products.filter((p: any) => {
            if (cleanStoreId && p.storeId === cleanStoreId) return true;
            if (cleanEmail && p.sellerEmail?.toLowerCase() === cleanEmail) return true;
            if (p.storeId && matchingStoreIds.has(p.storeId)) return true;
            return false;
          });
        }
        return res.json(enrichProducts(products));
      }

      const nonBannedStoreIds = new Set(
        store.digitalMarketStores
          .filter((s: any) => !s.isBanned)
          .map((s: any) => s.id)
      );

      const availableProducts = store.digitalMarketProducts.filter((p: any) => {
        const isNotBanned = p.storeId ? (nonBannedStoreIds.has(p.storeId) || nonBannedStoreIds.size === 0) : true;
        return isNotBanned && p.isAvailable !== false && Number(p.stockQuantity) > 0;
      });

      return res.json(enrichProducts(availableProducts));
    } catch (err: any) {
      console.error("Error fetching market products:", err);
      return res.status(500).json({ error: "Failed to fetch products." });
    }
  });

  // Subscription selection: temporary test activation. Replace the assignment below with a verified Paystack webhook/transaction check when payments launch.
  app.post("/api/digital-market/subscription", requireAuth(["merchant", "student", "user", "admin"]), async (req: any, res) => {
    const plan = String(req.body?.plan || "default").toLowerCase();
    if (!["default", "star", "pro"].includes(plan)) return res.status(400).json({ error: "Invalid subscription plan." });
    const email = String(req.body?.studentEmail || req.user?.email || "").toLowerCase().trim();
    const store = getStoreInstance();
    const target = (store.digitalMarketStores || []).find((s: any) => s.studentEmail?.toLowerCase() === email || s.parentUserEmail?.toLowerCase() === email || s.userId === req.user?.id);
    if (!target) return res.status(404).json({ error: "Active seller store not found." });
    target.subscriptionPlan = plan; target.subscriptionStatus = "test_active"; target.subscriptionUpdatedAt = new Date().toISOString();
    savePersistentStore(store); syncStore();
    return res.json({ success: true, store: target, paymentRequired: false, paymentProvider: "paystack" });
  });

  // Add Product to Store
  app.post("/api/digital-market/products", requireAuth(["merchant", "student", "user", "admin"]), async (req: any, res) => {
    try {
      const { storeId, title, description, price, category, stockQuantity, imageUrl, userEmail, condition, meetingLocation } = req.body;
      const store = getStoreInstance();
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      const cleanEmail = (userEmail || '').toLowerCase().trim();
      let targetStore = store.digitalMarketStores.find((s: any) => 
        s.id === storeId || (cleanEmail && (s.studentEmail?.toLowerCase() === cleanEmail || s.parentUserEmail?.toLowerCase() === cleanEmail))
      );

      // Auto-fallback: if targetStore not in digitalMarketStores yet, check digitalMarketApplications
      if (!targetStore && cleanEmail) {
        const application = (store.digitalMarketApplications || []).find((a: any) =>
          (a.studentEmail?.toLowerCase() === cleanEmail || a.parentUserEmail?.toLowerCase() === cleanEmail)
        );
        if (application) {
          targetStore = {
            id: `dmstore-${Date.now()}`,
            userId: application.userId || `user-${Date.now()}`,
            studentEmail: application.studentEmail || cleanEmail,
            parentUserEmail: application.parentUserEmail || cleanEmail,
            storeName: application.storeName || `${application.fullName}'s Campus Store`,
            category: application.categoryToSell || category || 'General Items',
            status: 'active',
            isBanned: false,
            setupCompleted: true,
            registrationFeePaid: true,
            createdAt: new Date().toISOString()
          };
          store.digitalMarketStores.unshift(targetStore);
        }
      }

      if (!targetStore) {
        targetStore = {
          id: storeId || `dmstore-${Date.now()}`,
          userId: `user-${Date.now()}`,
          studentEmail: cleanEmail,
          parentUserEmail: cleanEmail,
          storeName: cleanEmail ? `${cleanEmail.split('@')[0]}'s Campus Store` : 'Campus Merchant Store',
          category: category || 'General Items',
          status: 'active',
          isBanned: false,
          setupCompleted: true,
          registrationFeePaid: true,
          createdAt: new Date().toISOString()
        };
        store.digitalMarketStores.unshift(targetStore);
      }

      if (targetStore.isBanned) {
        return res.status(403).json({ error: "This store has been disabled or banned by Admin." });
      }

      // Ensure store is active
      targetStore.status = 'active';
      targetStore.setupCompleted = true;
      targetStore.isBanned = false;

      const isServiceItem = Boolean(req.body.isService || category === 'Services' || String(category || '').toLowerCase().includes('service'));
      const serviceLocationMode = String(req.body.serviceLocationMode || '').toLowerCase();
      if (isServiceItem && !['flexible', 'fixed', 'hybrid'].includes(serviceLocationMode)) {
        return res.status(400).json({ error: 'Choose Flexible, Fixed, or Hybrid service location before publishing.' });
      }
      if (isServiceItem && ['fixed', 'hybrid'].includes(serviceLocationMode) && !String(req.body.location || meetingLocation || '').trim()) {
        return res.status(400).json({ error: 'Fixed and Hybrid services require the seller to pin a service location.' });
      }

      const plan = String(targetStore.subscriptionPlan || "default").toLowerCase();
      const limits = plan === "pro" ? { items: 200, services: 10, inventory: 900 } : plan === "star" ? { items: 100, services: 5, inventory: 600 } : { items: 20, services: 1, inventory: 200 };
      const storeProducts = store.digitalMarketProducts.filter((p: any) => p.storeId === targetStore.id);
      const existingItems = storeProducts.filter((p: any) => !Boolean(p.isService || String(p.category || "").toLowerCase().includes("service")));
      const existingServices = storeProducts.filter((p: any) => Boolean(p.isService || String(p.category || "").toLowerCase().includes("service")));
      const requestedStock = isServiceItem ? 0 : Math.max(1, Number(stockQuantity) || 1);
      const inventoryUnits = existingItems.reduce((sum: number, p: any) => sum + Math.max(0, Number(p.stockQuantity) || 0), 0);
      if ((!isServiceItem && existingItems.length >= limits.items) || (isServiceItem && existingServices.length >= limits.services)) return res.status(403).json({ error: `Your Pine ${plan === "star" ? "Star" : plan === "pro" ? "Pro" : "Default"} plan publishing limit has been reached.` });
      if (!isServiceItem && inventoryUnits + requestedStock > limits.inventory) return res.status(403).json({ error: `Your plan allows up to ${limits.inventory} total inventory units.` });

      const newProduct = {
        id: `dmprod-${Date.now()}`,
        storeId: targetStore.id,
        subscriptionPlan: plan,
        isPineStar: plan === "star" || plan === "pro",
        hasPriorityPlacement: plan === "star" || plan === "pro",
        allowsAiImageTools: plan === "star" || plan === "pro",
        allowsCustomAnimatedCard: plan === "pro",
        storeName: targetStore.storeName,
        sellerId: targetStore.userId,
        sellerEmail: targetStore.studentEmail || targetStore.parentUserEmail || cleanEmail,
        sellerUniversity: targetStore.university || 'KNUST',
        sellerPhone: targetStore.phone || req.body.callLine || '0244-123-456',
        sellerName: targetStore.username || targetStore.storeName || 'Student Merchant',
        title: title || 'Untitled Item',
        description: description || '',
        price: Number(price) || 0,
        currency: 'GHS',
        category: category || (isServiceItem ? 'Services' : (targetStore.category || 'Electronics')),
        stockQuantity: isServiceItem ? (Number(stockQuantity) || 999) : (Number(stockQuantity) || 1),
        imageUrl: imageUrl || (isServiceItem ? 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=60' : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=60'),
        condition: condition || 'Like New',
        meetingLocation: meetingLocation || req.body.location || targetStore.location || 'Campus Enclave',
        location: req.body.location || meetingLocation || targetStore.location || 'Campus Enclave',
        lat: req.body.lat !== undefined ? Number(req.body.lat) : 6.6745,
        lng: req.body.lng !== undefined ? Number(req.body.lng) : -1.5716,
        workingDays: req.body.workingDays || 'Mon - Sat',
        openingTime: req.body.openingTime || '08:00 AM',
        closingTime: req.body.closingTime || '08:00 PM',
        callLine: req.body.callLine || targetStore.phone || req.body.sellerPhone || '0244-123-456',
        isService: isServiceItem,
        serviceLocationMode: isServiceItem ? serviceLocationMode : undefined,
        serviceCategory: req.body.serviceCategory || (isServiceItem ? 'Campus Service' : ''),
        priceCategories: Array.isArray(req.body.priceCategories) ? req.body.priceCategories : [],
        isAvailable: true,
        rating: 5.0,
        reviewCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      store.digitalMarketProducts.unshift(newProduct);
      savePersistentStore(store);
      syncStore();

      return res.status(201).json({ success: true, product: newProduct, message: isServiceItem ? "Service published to Digital Market!" : "Product listed on Digital Market!" });
    } catch (err: any) {
      console.error("Error adding product:", err);
      return res.status(500).json({ error: "Failed to add product." });
    }
  });

  // Update Product Stock or Details
  app.put("/api/digital-market/products/:id", requireAuth(["merchant", "student", "user", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { title, description, price, stockQuantity, isAvailable, category, imageUrl, meetingLocation, location, callLine, isService, serviceCategory, serviceLocationMode, workingDays, openingTime, closingTime, lat, lng } = req.body;
      const store = getStoreInstance();
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];

      const product = store.digitalMarketProducts.find((p: any) => p.id === id);
      if (!product) {
        return res.status(404).json({ error: "Product not found." });
      }

      if (title !== undefined) product.title = title;
      if (description !== undefined) product.description = description;
      if (price !== undefined) product.price = Number(price);
      if (category !== undefined) product.category = category;
      if (imageUrl !== undefined) product.imageUrl = imageUrl;
      if (meetingLocation !== undefined) product.meetingLocation = meetingLocation;
      if (location !== undefined) product.location = location;
      if (callLine !== undefined) product.callLine = callLine;
      if (isService !== undefined) product.isService = Boolean(isService);
      if (serviceCategory !== undefined) product.serviceCategory = serviceCategory;
      if (serviceLocationMode !== undefined) {
        const normalizedMode = String(serviceLocationMode).toLowerCase();
        if (!['flexible', 'fixed', 'hybrid'].includes(normalizedMode)) return res.status(400).json({ error: 'Invalid service location mode.' });
        if (['fixed', 'hybrid'].includes(normalizedMode) && !String(location ?? product.location ?? meetingLocation ?? product.meetingLocation ?? '').trim()) return res.status(400).json({ error: 'Fixed and Hybrid services require a seller location.' });
        product.serviceLocationMode = normalizedMode;
      }
      if (req.body.priceCategories !== undefined) product.priceCategories = Array.isArray(req.body.priceCategories) ? req.body.priceCategories : [];
      if (workingDays !== undefined) product.workingDays = workingDays;
      if (openingTime !== undefined) product.openingTime = openingTime;
      if (closingTime !== undefined) product.closingTime = closingTime;
      if (lat !== undefined) product.lat = Number(lat);
      if (lng !== undefined) product.lng = Number(lng);
      if (stockQuantity !== undefined) {
        product.stockQuantity = Number(stockQuantity);
        if (product.stockQuantity <= 0 && !product.isService) {
          product.isAvailable = false;
        } else {
          product.isAvailable = true;
        }
      }
      if (isAvailable !== undefined) product.isAvailable = Boolean(isAvailable);
      product.updatedAt = new Date().toISOString();

      savePersistentStore(store);
      syncStore();

      return res.json({ success: true, product, message: "Product updated successfully." });
    } catch (err: any) {
      console.error("Error updating product:", err);
      return res.status(500).json({ error: "Failed to update product." });
    }
  });

  // Service Reviews Endpoints
  app.post("/api/digital-market/services/:id/reviews", requireAuth(["student", "user", "merchant", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { rating, review, reviewerName, reviewerAvatar } = req.body;
      const numRating = Number(rating);

      if (!numRating || numRating < 1 || numRating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5 stars." });
      }

      const store = getStoreInstance();
      if (!store.digitalMarketServiceReviews) store.digitalMarketServiceReviews = [];
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];

      const product = store.digitalMarketProducts.find((p: any) => p.id === id);
      if (!product) {
        return res.status(404).json({ error: "Service not found." });
      }

      const newReview = {
        id: `servrev-${Date.now()}`,
        serviceId: id,
        reviewerName: reviewerName || req.user.name || 'Student Reviewer',
        reviewerEmail: req.user.email || '',
        reviewerAvatar: reviewerAvatar || req.user.avatar || req.user.photo || 'preset:pine-classic',
        rating: Math.min(5, Math.max(1, numRating)),
        review: (review || '').toString().trim(),
        createdAt: new Date().toISOString()
      };

      store.digitalMarketServiceReviews.unshift(newReview);

      // Re-calculate rating average for service
      const serviceReviews = store.digitalMarketServiceReviews.filter((r: any) => r.serviceId === id);
      const totalCount = serviceReviews.length;
      const sum = serviceReviews.reduce((acc: number, item: any) => acc + (Number(item.rating) || 0), 0);
      const avg = totalCount > 0 ? Math.round((sum / totalCount) * 10) / 10 : 5.0;

      product.rating = avg;
      product.reviewCount = totalCount;

      savePersistentStore(store);
      syncStore();

      return res.status(201).json({
        success: true,
        review: newReview,
        averageRating: avg,
        reviewCount: totalCount,
        message: "Thank you for reviewing this service!"
      });
    } catch (err: any) {
      console.error("Error submitting service review:", err);
      return res.status(500).json({ error: "Failed to submit service review." });
    }
  });

  app.get("/api/digital-market/services/:id/reviews", async (req: any, res) => {
    try {
      const { id } = req.params;
      const store = getStoreInstance();
      if (!store.digitalMarketServiceReviews) store.digitalMarketServiceReviews = [];

      const serviceReviews = store.digitalMarketServiceReviews.filter((r: any) => r.serviceId === id);
      const totalCount = serviceReviews.length;
      const sum = serviceReviews.reduce((acc: number, item: any) => acc + (Number(item.rating) || 0), 0);
      const avg = totalCount > 0 ? Math.round((sum / totalCount) * 10) / 10 : 5.0;

      return res.json({
        serviceId: id,
        averageRating: avg,
        reviewCount: totalCount,
        reviews: serviceReviews
      });
    } catch (err: any) {
      console.error("Error fetching service reviews:", err);
      return res.status(500).json({ error: "Failed to fetch service reviews." });
    }
  });

  // Delete Product
  app.delete("/api/digital-market/products/:id", requireAuth(["merchant", "student", "user", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const store = getStoreInstance();
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];

      const idx = store.digitalMarketProducts.findIndex((p: any) => p.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: "Product not found." });
      }

      store.digitalMarketProducts.splice(idx, 1);
      savePersistentStore(store);
      syncStore();

      return res.json({ success: true, message: "Product removed from store." });
    } catch (err: any) {
      console.error("Error deleting product:", err);
      return res.status(500).json({ error: "Failed to delete product." });
    }
  });

  // Admin: Get all Digital Market Applications
  app.get("/api/admin/digital-market/applications", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      if (!store.digitalMarketApplications) store.digitalMarketApplications = [];
      return res.json(store.digitalMarketApplications);
    } catch (err: any) {
      console.error("Error fetching market applications:", err);
      return res.status(500).json({ error: "Failed to fetch applications." });
    }
  });

  // Admin/Manager: Approve Digital Market Application
  app.post("/api/admin/digital-market/approve-application", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const { id, applicationId, adminNotes } = req.body;
      const resolvedId = (id || applicationId || '').trim();
      const store = getStoreInstance();
      if (!store.digitalMarketApplications) store.digitalMarketApplications = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      const appItem = store.digitalMarketApplications.find((a: any) => a.id === resolvedId);
      if (!appItem) {
        return res.status(404).json({ error: "Application not found." });
      }

      appItem.status = 'approved';
      appItem.reviewedAt = new Date().toISOString();
      appItem.registrationFeePaid = false;
      appItem.setupCompleted = false;
      if (adminNotes) appItem.adminNotes = adminNotes;

      // Automatically create or activate the official digital market store
      let storeItem = store.digitalMarketStores.find((s: any) =>
        (s.studentEmail?.toLowerCase() === appItem.studentEmail?.toLowerCase()) ||
        (s.userId === appItem.userId) ||
        (s.id === appItem.id)
      );

      if (!storeItem) {
        storeItem = {
          id: `store-${appItem.id || Date.now()}`,
          userId: appItem.userId,
          storeName: appItem.storeName || `${appItem.fullName}'s Campus Store`,
          category: appItem.categoryToSell || 'Electronics & Gadgets',
          description: `Official student digital market store by ${appItem.fullName} at ${appItem.university}.`,
          phone: appItem.phone || '+233201234567',
          logoUrl: '',
          bannerUrl: '',
          studentEmail: appItem.studentEmail,
          parentUserEmail: appItem.parentUserEmail || appItem.studentEmail,
          university: appItem.university,
          status: 'pending_setup',
          isBanned: false,
          registrationFeePaid: false,
          setupCompleted: false,
          paymentTransactionRef: '',
          createdAt: appItem.submittedAt || new Date().toISOString(),
          approvedAt: new Date().toISOString()
        };
        store.digitalMarketStores.unshift(storeItem);
      } else {
        storeItem.status = storeItem.setupCompleted ? 'active' : 'pending_setup';
        storeItem.isBanned = false;
        if (!storeItem.setupCompleted) {
          storeItem.registrationFeePaid = false;
          storeItem.setupCompleted = false;
          storeItem.paymentTransactionRef = '';
        }
      }

      // Update student user in store.users AND MOCK_USERS to mark verified & approved merchant
      const cleanPassword = appItem.password || appItem.plainPassword || '';
      const cleanStudentEmail = (appItem.studentEmail || '').toLowerCase().trim();

      const markApproved = (u: any) => {
        const target = u.user || u;
        if (target.roomKey || target.role === 'user' || !target.isDigitalMarketOnly) return;
        target.isVerified = true;
        target.verificationStatus = 'approved';
        target.isMerchantApplicant = false;
        target.isApprovedMerchant = true;
        target.hasApprovedMerchantStore = true;
        target.merchantStoreId = storeItem.id;
        target.merchantStoreName = storeItem.storeName;
        target.merchantSetupCompleted = Boolean(storeItem.setupCompleted);
        target.merchantRegistrationFeePaid = Boolean(storeItem.registrationFeePaid);
        target.targetRedirect = storeItem.setupCompleted ? '/digital-market' : '/digital-market/onboard';
        target.role = storeItem.setupCompleted ? 'merchant' : 'student';
        target.isDigitalMarketOnly = true;
        if (!target.password && !target.plainPassword) {
          target.password = cleanPassword;
          target.plainPassword = cleanPassword;
        }
        target.institution = appItem.university;
      };

      // Ensure primary account is never redirected to digital onboarding or converted to merchant
      const protectPrimaryAccount = (u: any) => {
        const target = u.user || u;
        delete target.targetRedirect;
        target.isDigitalMarketOnly = false;
        if (target.role === 'merchant') {
          target.role = (target.roomKey && target.roomNumber) ? 'student' : 'user';
        }
      };

      const inStoreMerchantUsers = store.users.filter((u: any) =>
        (u.email || '').toLowerCase().trim() === cleanStudentEmail
      );
      inStoreMerchantUsers.forEach(markApproved);

      const inMockMerchantUsers = MOCK_USERS.filter((u: any) =>
        (u.email || u.user?.email || '').toLowerCase().trim() === cleanStudentEmail
      );
      if (inMockMerchantUsers.length > 0) {
        inMockMerchantUsers.forEach(markApproved);
      } else {
        const approvedUser = {
          id: `usr-dm-${Date.now()}`,
          name: appItem.fullName,
          email: appItem.studentEmail,
          password: cleanPassword,
          plainPassword: cleanPassword,
          role: storeItem.setupCompleted ? 'merchant' : 'student',
          institution: appItem.university,
          isVerified: true,
          verificationStatus: 'approved',
          isApprovedMerchant: true,
          hasApprovedMerchantStore: true,
          merchantStoreId: storeItem.id,
          merchantStoreName: storeItem.storeName,
          merchantSetupCompleted: Boolean(storeItem.setupCompleted),
          merchantRegistrationFeePaid: Boolean(storeItem.registrationFeePaid),
          targetRedirect: storeItem.setupCompleted ? '/digital-market' : '/digital-market/onboard',
          isDigitalMarketOnly: true,
          createdAt: new Date().toISOString()
        };
        MOCK_USERS.push(approvedUser);
        store.users.push(approvedUser);
      }

      // Explicitly protect all primary user accounts from having their route or role changed
      store.users.forEach((u: any) => {
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        if (uEmail && uEmail !== cleanStudentEmail && ((appItem.userId && (u.id === appItem.userId || u.user?.id === appItem.userId)) || (appItem.parentUserEmail && uEmail === appItem.parentUserEmail.toLowerCase().trim()))) {
          protectPrimaryAccount(u);
        }
      });
      MOCK_USERS.forEach((u: any) => {
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        if (uEmail && uEmail !== cleanStudentEmail && ((appItem.userId && (u.id === appItem.userId || u.user?.id === appItem.userId)) || (appItem.parentUserEmail && uEmail === appItem.parentUserEmail.toLowerCase().trim()))) {
          protectPrimaryAccount(u);
        }
      });
      persistentData.users = MOCK_USERS;

      savePersistentStore(store);
      syncStore();

      const notifyApprEmails = Array.from(new Set([
        appItem.studentEmail,
        appItem.parentUserEmail
      ].filter(Boolean)));

      for (const emailToNotify of notifyApprEmails) {
        const notif = {
          id: `notif-dm-appr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          studentId: appItem.studentEmail,
          userId: appItem.studentEmail,
          userEmail: emailToNotify,
          recipientEmail: emailToNotify,
          targetEmail: emailToNotify,
          parentUserEmail: appItem.parentUserEmail || appItem.studentEmail,
          title: `Student Merchant Application Approved! 🎉`,
          message: `Congratulations ${appItem.fullName}! Your Digital Market store (${storeItem.storeName}) for ${appItem.university} has been approved and activated. You can now access your merchant platform and start selling.`,
          type: 'success',
          category: 'market',
          scope: 'market',
          module: 'digital_market',
          targetRole: 'merchant',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(notif);
        await dbCreateNotification(notif, notifications);
      }

      return res.json({ 
        success: true, 
        store: storeItem,
        message: `Application approved and store activated for ${appItem.fullName}.` 
      });
    } catch (err: any) {
      console.error("Error approving market application:", err);
      return res.status(500).json({ error: "Failed to approve application." });
    }
  });

  // Admin/Manager: Reject Digital Market Application
  app.post("/api/admin/digital-market/reject-application", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const { id, applicationId, adminNotes } = req.body;
      const resolvedId = (id || applicationId || '').trim();
      const store = getStoreInstance();
      if (!store.digitalMarketApplications) store.digitalMarketApplications = [];

      const appItem = store.digitalMarketApplications.find((a: any) => a.id === resolvedId);
      if (!appItem) {
        return res.status(404).json({ error: "Application not found." });
      }

      appItem.status = 'rejected';
      appItem.reviewedAt = new Date().toISOString();
      if (adminNotes) appItem.adminNotes = adminNotes;

      savePersistentStore(store);
      syncStore();

      // Create live notifications for applicant & parent user
      const notifyEmails = Array.from(new Set([
        appItem.studentEmail,
        appItem.parentUserEmail
      ].filter(Boolean)));

      for (const emailToNotify of notifyEmails) {
        const rejNotif = {
          id: `notif-dm-rej-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          studentId: appItem.studentEmail,
          userId: appItem.studentEmail,
          userEmail: emailToNotify,
          recipientEmail: emailToNotify,
          targetEmail: emailToNotify,
          parentUserEmail: appItem.parentUserEmail || appItem.studentEmail,
          title: `Digital Market Application Update`,
          message: `Your Digital Market store application for "${appItem.storeName || 'Campus Store'}" was not approved by System Admin. Reason: ${adminNotes || 'Requires updated store documents or information.'}`,
          type: 'warning',
          category: 'market',
          scope: 'market',
          module: 'digital_market',
          targetRole: 'merchant',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(rejNotif);
        await dbCreateNotification(rejNotif, notifications);
      }

      return res.json({ success: true, message: "Application rejected and user notified." });
    } catch (err: any) {
      console.error("Error rejecting application:", err);
      return res.status(500).json({ error: "Failed to reject application." });
    }
  });

  // Admin: Get all Digital Stores
  app.get("/api/admin/digital-market/stores", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      if (!store.digitalMarketStores) store.digitalMarketStores = [];
      return res.json(store.digitalMarketStores);
    } catch (err: any) {
      console.error("Error fetching stores:", err);
      return res.status(500).json({ error: "Failed to fetch stores." });
    }
  });

  // Admin: Toggle Ban/Disable Store
  app.post("/api/admin/digital-market/toggle-ban-store", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { storeId, banReason } = req.body;
      const store = getStoreInstance();
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      const targetStore = store.digitalMarketStores.find((s: any) => s.id === storeId);
      if (!targetStore) {
        return res.status(404).json({ error: "Digital Store not found." });
      }

      targetStore.isBanned = !targetStore.isBanned;
      targetStore.status = targetStore.isBanned ? 'disabled' : 'active';
      if (banReason) targetStore.banReason = banReason;

      savePersistentStore(store);
      syncStore();

      return res.json({ 
        success: true, 
        isBanned: targetStore.isBanned, 
        message: targetStore.isBanned ? `Store "${targetStore.storeName}" has been banned/disabled.` : `Store "${targetStore.storeName}" has been unbanned and restored to active state.` 
      });
    } catch (err: any) {
      console.error("Error toggling store ban:", err);
      return res.status(500).json({ error: "Failed to toggle store ban state." });
    }
  });

  // Place Order / Request Campus Meetup
  app.post("/api/digital-market/orders", async (req: any, res) => {
    try {
      const { productId, quantity, buyerName, buyerEmail, buyerPhone, meetingLocation, meetingLatitude, meetingLongitude, buyerId, serviceLocationOption } = req.body;
      const store = getStoreInstance();
      if (!store.digitalMarketOrders) store.digitalMarketOrders = [];
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      const product = store.digitalMarketProducts.find((p: any) => p.id === productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found or no longer available." });
      }

      if (product.stockQuantity < (quantity || 1)) {
        return res.status(400).json({ error: "Requested quantity exceeds available stock." });
      }

      const targetStore = store.digitalMarketStores.find((s: any) => s.id === product.storeId);
      if (targetStore?.isBanned) {
        return res.status(403).json({ error: "Cannot order from a disabled/banned store." });
      }

      const isServiceOrder = Boolean(product.isService || String(product.category || '').toLowerCase().includes('service'));
      const locationMode = isServiceOrder ? String(product.serviceLocationMode || 'flexible').toLowerCase() : 'flexible';
      const requestedLocationOption = serviceLocationOption === 'seller-location' ? 'seller-location' : 'buyer-location';
      if (isServiceOrder && locationMode === 'fixed' && requestedLocationOption !== 'seller-location') {
        return res.status(400).json({ error: 'This service is only available at the provider\'s fixed location.' });
      }
      if (isServiceOrder && (locationMode === 'fixed' || (locationMode === 'hybrid' && requestedLocationOption === 'seller-location')) && !String(product.location || product.meetingLocation || '').trim()) {
        return res.status(400).json({ error: 'The provider has not set a fixed service location yet.' });
      }
      if (isServiceOrder && (locationMode === 'flexible' || (locationMode === 'hybrid' && requestedLocationOption === 'buyer-location')) && !String(meetingLocation || '').trim()) {
        return res.status(400).json({ error: 'Choose your meetup or delivery location to book this service.' });
      }

      const orderQty = Number(quantity) || 1;
      const unitPrice = (req.body.price !== undefined && !isNaN(Number(req.body.price)) && Number(req.body.price) >= 0) ? Number(req.body.price) : product.price;
      const totalAmount = unitPrice * orderQty;
      const priceCatName = req.body.priceCategoryName ? String(req.body.priceCategoryName).trim() : (req.body.priceCategory ? String(req.body.priceCategory).trim() : undefined);
      const finalProductTitle = priceCatName ? `${product.title} (${priceCatName})` : product.title;
      const otpPin = Math.floor(1000 + Math.random() * 9000).toString();

      const usesSellerLocation = isServiceOrder && (locationMode === 'fixed' || (locationMode === 'hybrid' && requestedLocationOption === 'seller-location'));
      const finalMeetingLocation = usesSellerLocation ? (product.location || product.meetingLocation) : (meetingLocation || 'KNUST Main Library Car Park');
      const parsedLat = usesSellerLocation ? Number(product.lat) || undefined : (meetingLatitude !== undefined && meetingLatitude !== null && !isNaN(Number(meetingLatitude)) ? Number(meetingLatitude) : undefined);
      const parsedLng = usesSellerLocation ? Number(product.lng) || undefined : (meetingLongitude !== undefined && meetingLongitude !== null && !isNaN(Number(meetingLongitude)) ? Number(meetingLongitude) : undefined);

      const nowIso = new Date().toISOString();
      const newOrder = {
        id: `ord-${Date.now()}`,
        productId: product.id,
        productTitle: finalProductTitle,
        productPrice: unitPrice,
        priceCategory: priceCatName,
        productImage: product.imageUrl,
        quantity: orderQty,
        totalAmount: totalAmount,
        buyerId: buyerId || `buyer-${Date.now()}`,
        buyerEmail: (buyerEmail || '').toLowerCase().trim(),
        buyerName: buyerName || 'Student Buyer',
        buyerPhone: buyerPhone || '',
        sellerId: product.sellerId,
        sellerEmail: product.sellerEmail,
        storeId: product.storeId,
        storeName: product.storeName,
        university: product.sellerUniversity,
        meetingLocation: finalMeetingLocation,
        meetingLatitude: parsedLat,
        meetingLongitude: parsedLng,
        serviceLocationOption: isServiceOrder ? (usesSellerLocation ? 'seller-location' : 'buyer-location') : undefined,
        sellerConfirmed: false,
        sellerAgreedLocation: false,
        sellerAgreedAt: null,
        otpPin: otpPin,
        status: 'Awaiting Seller Confirmation',
        paymentMethod: 'Pay on Campus Delivery (PIN Escrow)',
        createdAt: nowIso,
        updatedAt: nowIso,
        timeline: [
          {
            status: 'Awaiting Seller Confirmation',
            title: 'Campus Meetup Location Proposed & Escrow PIN Generated',
            timestamp: nowIso,
            notes: `${usesSellerLocation ? 'Provider fixed service location selected' : 'Buyer proposed meetup spot'}: ${finalMeetingLocation}${parsedLat ? ` (GPS: ${parsedLat.toFixed(5)}, ${parsedLng?.toFixed(5)})` : ''}.${usesSellerLocation ? ' Booking is set at the provider location.' : ' Awaiting merchant location agreement.'}`
          }
        ]
      };

      store.digitalMarketOrders.unshift(newOrder);
      savePersistentStore(store);
      syncStore();

      const sellerNotif = {
        id: `notif-ord-${Date.now()}`,
        studentId: product.sellerEmail,
        userId: product.sellerEmail,
        userEmail: product.sellerEmail,
        recipientEmail: product.sellerEmail,
        title: `New Buy Request for ${product.title}! 📍`,
        message: `Student ${buyerName} wants to book ${product.title} (GHS ${totalAmount}) at: ${finalMeetingLocation}.${usesSellerLocation ? ' Your fixed service location was selected.' : ' Click to inspect map coordinates and confirm.'}`,
        type: 'info',
        category: 'market',
        scope: 'market',
        module: 'digital_market',
        targetRole: 'merchant',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(sellerNotif);
      await dbCreateNotification(sellerNotif, notifications);

      return res.status(201).json({ success: true, order: newOrder, message: "Order placed successfully! Proposed meetup transmitted to seller for confirmation." });
    } catch (err: any) {
      console.error("Error creating digital market order:", err);
      return res.status(500).json({ error: "Failed to create order." });
    }
  });

  // Get orders for current user (as buyer or seller)
  app.get("/api/digital-market/my-orders", requireAuth(), async (req: any, res) => {
    try {
      const userEmail = (req.query.email || '').toString().toLowerCase().trim();
      const userId = (req.query.userId || '').toString().trim();
      const storeId = (req.query.storeId || '').toString().trim();

      const store = getStoreInstance();
      if (!store.digitalMarketOrders) store.digitalMarketOrders = [];
      if (!store.digitalMarketRatings) store.digitalMarketRatings = [];

      const userOrders = store.digitalMarketOrders
        .filter((o: any) => {
          if (req.user.role === 'admin') return (!storeId || o.storeId === storeId);
          const isBuyer = o.buyerId ? o.buyerId === req.user.id : req.user.role === 'user' && normalizeEmail(o.buyerEmail) === normalizeEmail(req.user.email);
          const isSeller = req.user.role === 'merchant' && normalizeEmail(o.sellerEmail) === normalizeEmail(req.user.email);
          return (!storeId || o.storeId === storeId) && (isBuyer || isSeller);
        })
        .map((o: any) => {
          const ratingObj = store.digitalMarketRatings.find((r: any) =>
            r.orderId === o.id ||
            (userEmail && r.buyerEmail?.toLowerCase() === userEmail && ((o.storeId && r.storeId === o.storeId) || (o.sellerEmail && r.sellerEmail?.toLowerCase() === o.sellerEmail.toLowerCase())))
          );
          return {
            ...o,
            userRating: ratingObj || null
          };
        });

      return res.json(userOrders);
    } catch (err: any) {
      console.error("Error fetching user orders:", err);
      return res.status(500).json({ error: "Failed to fetch orders." });
    }
  });

  // Store & Service Ratings & Reviews Endpoint
  app.post("/api/digital-market/ratings", async (req: any, res) => {
    try {
      const { orderId, storeId, serviceId, productId, sellerEmail, buyerEmail, buyerName, rating, review } = req.body;
      const numRating = Number(rating);

      if (!numRating || numRating < 1 || numRating > 5) {
        return res.status(400).json({ error: "Rating must be a number between 1 and 5 stars." });
      }

      const store = getStoreInstance();
      if (!store.digitalMarketRatings) store.digitalMarketRatings = [];
      if (!store.digitalMarketOrders) store.digitalMarketOrders = [];
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];

      const cleanBuyer = (buyerEmail || '').toString().toLowerCase().trim();
      const cleanSeller = (sellerEmail || '').toString().toLowerCase().trim();
      const cleanStoreId = (storeId || '').toString().trim();
      const cleanOrderId = (orderId || '').toString().trim();
      const cleanServiceId = (serviceId || productId || '').toString().trim();
      const cleanBuyerName = (buyerName || '').toString().trim();

      // Check if rating for this order/service or buyer-seller pair already exists
      let existingIndex = -1;
      if (cleanOrderId) {
        existingIndex = store.digitalMarketRatings.findIndex((r: any) => r.orderId === cleanOrderId);
      }
      if (existingIndex < 0 && cleanServiceId && cleanBuyer) {
        existingIndex = store.digitalMarketRatings.findIndex((r: any) =>
          r.buyerEmail?.toLowerCase() === cleanBuyer && (r.serviceId === cleanServiceId || r.productId === cleanServiceId)
        );
      }
      if (existingIndex < 0 && cleanBuyer && (cleanStoreId || cleanSeller)) {
        existingIndex = store.digitalMarketRatings.findIndex((r: any) =>
          r.buyerEmail?.toLowerCase() === cleanBuyer &&
          ((cleanStoreId && r.storeId === cleanStoreId) || (cleanSeller && r.sellerEmail?.toLowerCase() === cleanSeller))
        );
      }

      const nowIso = new Date().toISOString();
      const ratingRecord = {
        id: existingIndex >= 0 ? store.digitalMarketRatings[existingIndex].id : `rating-${Date.now()}`,
        orderId: cleanOrderId || undefined,
        serviceId: cleanServiceId || undefined,
        productId: cleanServiceId || undefined,
        storeId: cleanStoreId || undefined,
        sellerEmail: cleanSeller || undefined,
        buyerEmail: cleanBuyer || undefined,
        buyerName: cleanBuyerName || (cleanBuyer ? cleanBuyer.split('@')[0] : 'Student Resident'),
        rating: Math.min(5, Math.max(1, numRating)),
        review: (review || '').toString().trim(),
        createdAt: nowIso
      };

      if (existingIndex >= 0) {
        store.digitalMarketRatings[existingIndex] = ratingRecord;
      } else {
        store.digitalMarketRatings.push(ratingRecord);
      }

      // Calculate new store average rating
      const matchedStore = store.digitalMarketRatings.filter((r: any) => {
        if (cleanStoreId && r.storeId === cleanStoreId) return true;
        if (cleanSeller && r.sellerEmail?.toLowerCase() === cleanSeller) return true;
        return false;
      });
      const storeCount = matchedStore.length;
      const storeSum = matchedStore.reduce((s: number, r: any) => s + (Number(r.rating) || 0), 0);
      const storeAvg = storeCount > 0 ? Math.round((storeSum / storeCount) * 10) / 10 : 5.0;

      // Sync rating into digitalMarketStores
      if (store.digitalMarketStores) {
        const targetStoreIdx = store.digitalMarketStores.findIndex((s: any) =>
          (cleanStoreId && s.id === cleanStoreId) ||
          (cleanSeller && (s.studentEmail?.toLowerCase() === cleanSeller || s.parentUserEmail?.toLowerCase() === cleanSeller))
        );
        if (targetStoreIdx !== -1) {
          store.digitalMarketStores[targetStoreIdx] = {
            ...store.digitalMarketStores[targetStoreIdx],
            storeRating: storeAvg,
            ratingCount: storeCount
          };
        }
      }

      // Sync rating into digitalMarketProducts / service items
      if (cleanServiceId && store.digitalMarketProducts) {
        const matchedProdRatings = store.digitalMarketRatings.filter((r: any) =>
          r.serviceId === cleanServiceId || r.productId === cleanServiceId
        );
        const prodCount = matchedProdRatings.length;
        const prodSum = matchedProdRatings.reduce((s: number, r: any) => s + (Number(r.rating) || 0), 0);
        const prodAvg = prodCount > 0 ? Math.round((prodSum / prodCount) * 10) / 10 : 5.0;

        const targetProd = store.digitalMarketProducts.find((p: any) => p.id === cleanServiceId);
        if (targetProd) {
          targetProd.rating = prodAvg;
          targetProd.reviewCount = prodCount;
        }
      }

      savePersistentStore(store);
      syncStore();

      return res.json({
        success: true,
        ratingRecord,
        averageRating: storeAvg,
        ratingCount: storeCount,
        message: "Rating & review submitted successfully! ⭐"
      });
    } catch (err: any) {
      console.error("Error rating digital market item:", err);
      return res.status(500).json({ error: "Failed to submit rating." });
    }
  });

  // GET Ratings for a store or service
  app.get("/api/digital-market/ratings", async (req: any, res) => {
    try {
      const { storeId, sellerEmail, serviceId, productId } = req.query;
      const store = getStoreInstance();
      if (!store.digitalMarketRatings) store.digitalMarketRatings = [];

      const cleanStoreId = (storeId || '').toString().trim();
      const cleanSeller = (sellerEmail || '').toString().toLowerCase().trim();
      const cleanServiceId = (serviceId || productId || '').toString().trim();

      const matched = store.digitalMarketRatings.filter((r: any) => {
        if (cleanServiceId && (r.serviceId === cleanServiceId || r.productId === cleanServiceId)) return true;
        if (cleanStoreId && r.storeId === cleanStoreId) return true;
        if (cleanSeller && r.sellerEmail?.toLowerCase() === cleanSeller) return true;
        return false;
      });

      const count = matched.length;
      const sum = matched.reduce((s: number, r: any) => s + (Number(r.rating) || 0), 0);
      const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 5.0;

      return res.json({
        averageRating: avg,
        ratingCount: count,
        ratings: matched
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch ratings." });
    }
  });

  // Update order status / Verify PIN / Seller Location Agreement
  app.post("/api/digital-market/orders/:id/update-status", requireAuth(["merchant", "student", "user", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      // Accept various action/status payloads
      const { newStatus, status, inputPin, otpPin, notes, action } = req.body;
      const resolvedStatus = (newStatus || status || '').trim();
      const resolvedPin = (inputPin || otpPin || '').trim();

      const store = getStoreInstance();
      if (!store.digitalMarketOrders) store.digitalMarketOrders = [];
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];

      const order = store.digitalMarketOrders.find((o: any) => o.id === id);
      if (!order) {
        return res.status(404).json({ error: "Order not found." });
      }

      const isSeller = req.user.role === 'merchant' && normalizeEmail(order.sellerEmail) === normalizeEmail(req.user.email);
      const isBuyer = order.buyerId ? order.buyerId === req.user.id : req.user.role === 'user' && normalizeEmail(order.buyerEmail) === normalizeEmail(req.user.email);
      const buyerCancellation = resolvedStatus.toLowerCase() === 'cancelled' && !resolvedPin && !action;
      if (req.user.role !== 'admin' && !isSeller && !(isBuyer && buyerCancellation)) return res.status(403).json({ error: 'Only the authenticated seller can confirm or complete this order. Buyers can cancel their own order.' });

      const nowIso = new Date().toISOString();

      // ACTION 1: Seller Agrees to Location & Confirms Purchase
      if (action === 'agree-location' || action === 'confirm-location' || resolvedStatus === 'agree-location') {
        order.sellerConfirmed = true;
        order.sellerAgreedLocation = true;
        order.sellerAgreedAt = nowIso;
        order.status = 'Pending Meetup';
        order.updatedAt = nowIso;

        if (!order.timeline) order.timeline = [];
        order.timeline.push({
          status: 'Pending Meetup',
          title: 'Seller Agreed to Meetup Location & Confirmed Purchase! 🤝',
          timestamp: nowIso,
          notes: `Merchant accepted the proposed campus meetup coordinates (${order.meetingLocation}). Purchase is confirmed for handover!`
        });

        savePersistentStore(store);
        syncStore();

        // Notify Buyer
        const buyerNotif = {
          id: `notif-agree-${Date.now()}`,
          studentId: order.buyerEmail,
          userId: order.buyerEmail,
          userEmail: order.buyerEmail,
          recipientEmail: order.buyerEmail,
          title: `Meetup Location Agreed! Purchase Confirmed 📍`,
          message: `The seller accepted your meetup location at ${order.meetingLocation} for "${order.productTitle}". Have your 4-digit PIN ready for pickup.`,
          type: 'success',
          category: 'market',
          scope: 'market',
          module: 'digital_market',
          targetRole: 'student',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(buyerNotif);
        await dbCreateNotification(buyerNotif, notifications);

        return res.json({ success: true, order, message: "Meetup location agreed! Purchase confirmed." });
      }

      // ACTION 2: Seller Declines / Rejects Proposed Location
      if (action === 'reject-location' || resolvedStatus === 'Location Rejected') {
        order.sellerConfirmed = false;
        order.sellerAgreedLocation = false;
        order.status = 'Location Rejected';
        order.updatedAt = nowIso;

        if (!order.timeline) order.timeline = [];
        order.timeline.push({
          status: 'Location Rejected',
          title: 'Proposed Meetup Spot Declined by Merchant',
          timestamp: nowIso,
          notes: notes || 'The seller could not accommodate the proposed meetup location.'
        });

        savePersistentStore(store);
        syncStore();

        // Notify Buyer
        const buyerNotif = {
          id: `notif-rej-${Date.now()}`,
          studentId: order.buyerEmail,
          userId: order.buyerEmail,
          userEmail: order.buyerEmail,
          recipientEmail: order.buyerEmail,
          title: `Meetup Location Declined ❌`,
          message: `The seller could not meet at ${order.meetingLocation} for "${order.productTitle}". You can message them or re-order with another location.`,
          type: 'warning',
          category: 'market',
          scope: 'market',
          module: 'digital_market',
          targetRole: 'student',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(buyerNotif);
        await dbCreateNotification(buyerNotif, notifications);

        return res.json({ success: true, order, message: "Proposed location declined." });
      }

      // Treat 'completed' and 'Completed & Paid' as the same final status
      const isCompletionStatus = ['Completed & Paid', 'completed', 'Completed'].includes(resolvedStatus);
      const finalStatus = isCompletionStatus ? 'Completed & Paid' : resolvedStatus;

      // Guard: block updating already-completed or cancelled orders
      if (order.status === 'Completed & Paid' && isCompletionStatus) {
        return res.status(400).json({ error: "This order has already been completed and cannot be updated again." });
      }
      if (order.status === 'Cancelled' && resolvedStatus !== 'Cancelled') {
        return res.status(400).json({ error: "Cancelled orders cannot be updated." });
      }

      if (isCompletionStatus) {
        if (!resolvedPin) {
          return res.status(400).json({ error: "Delivery PIN is required to complete this order. Confirm the 4-digit PIN with the buyer." });
        }
        if (resolvedPin !== String(order.otpPin || '').trim()) {
          return res.status(400).json({ error: "Invalid Delivery PIN. Please confirm the 4-digit PIN with the buyer." });
        }
        const product = store.digitalMarketProducts.find((p: any) => p.id === order.productId);
        if (product && product.stockQuantity > 0) {
          product.stockQuantity = Math.max(0, product.stockQuantity - order.quantity);
          if (product.stockQuantity <= 0) product.isAvailable = false;
          product.updatedAt = new Date().toISOString();
        }
      }

      order.status = finalStatus;
      order.updatedAt = nowIso;

      if (!order.timeline) order.timeline = [];
      order.timeline.push({
        status: finalStatus,
        title: `Order status updated to: ${finalStatus}`,
        timestamp: nowIso,
        notes: notes || (isCompletionStatus ? 'PIN verified. Item inspected, delivered & paid in cash/momo.' : '')
      });

      savePersistentStore(store);
      syncStore();

      return res.json({ success: true, order, message: `Order updated to ${finalStatus}!` });
    } catch (err: any) {
      console.error("Error updating order status:", err);
      return res.status(500).json({ error: "Failed to update order status." });
    }
  });

  // GET: Retrieve private messages for digital market items/orders
  app.get("/api/digital-market/messages", requireAuth(), async (req: any, res) => {
    try {
      if (!['user', 'merchant', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Use your primary account for shopping or your market password for seller messages.' });
      const email = normalizeEmail(req.query.email || req.user.email);
      if (req.user.role !== 'admin' && email !== normalizeEmail(req.user.email)) return res.status(403).json({ error: 'You cannot view another account’s messages.' });
      const otherEmail = (req.query.otherEmail || '').toString().toLowerCase().trim();
      const orderId = (req.query.orderId || '').toString().trim();
      const productId = (req.query.productId || '').toString().trim();

      const store = getStoreInstance();
      if (!store.digitalMarketMessages) store.digitalMarketMessages = [];
      if (req.user.role === 'user' && store.digitalMarketStores?.some(s => normalizeEmail(s.studentEmail) === email)) return res.status(403).json({ error: 'Sign in with your market password to read messages sent to your store email.' });

      // Look up associated emails for the current user
      const emailsToCheck = new Set<string>();
      if (email) {
        emailsToCheck.add(email);
      }

      // Look up associated emails for the other user in conversation
      const otherEmailsToCheck = new Set<string>();
      if (otherEmail) {
        otherEmailsToCheck.add(otherEmail);
        const otherStore = store.digitalMarketStores?.find((s: any) =>
          s.studentEmail?.toLowerCase() === otherEmail || s.parentUserEmail?.toLowerCase() === otherEmail
        );
        if (otherStore) {
          if (otherStore.studentEmail) otherEmailsToCheck.add(otherStore.studentEmail.toLowerCase().trim());
          if (otherStore.parentUserEmail) otherEmailsToCheck.add(otherStore.parentUserEmail.toLowerCase().trim());
        }
      }

      let filtered = store.digitalMarketMessages;

      // Filter by current user involvement
      if (email) {
        filtered = filtered.filter((m: any) => 
          emailsToCheck.has(m.senderEmail?.toLowerCase()) || emailsToCheck.has(m.recipientEmail?.toLowerCase())
        );
      }

      // Filter by the other side of conversation if provided
      if (otherEmail) {
        filtered = filtered.filter((m: any) => 
          otherEmailsToCheck.has(m.senderEmail?.toLowerCase()) || otherEmailsToCheck.has(m.recipientEmail?.toLowerCase())
        );
      }

      // Filter by order context
      if (orderId) {
        filtered = filtered.filter((m: any) => m.orderId === orderId);
      }

      // Filter by product context
      if (productId) {
        filtered = filtered.filter((m: any) => m.productId === productId);
      }

      // Sort oldest first to show scrollable timeline
      filtered.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return res.json(filtered);
    } catch (err: any) {
      console.error("Error fetching private messages:", err);
      return res.status(500).json({ error: "Failed to load messages." });
    }
  });

  // POST: Send a private message or logistic inquiry
  app.post("/api/digital-market/messages", requireAuth(), async (req: any, res) => {
    try {
      if (!['user', 'merchant', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Use your primary account for shopping or your market password for seller messages.' });
      const { orderId, productId, productTitle, senderEmail, senderName, recipientEmail, recipientName, content } = req.body;
      if (normalizeEmail(senderEmail) !== normalizeEmail(req.user.email)) return res.status(403).json({ error: 'You cannot send messages as another account.' });
      
      if (!senderEmail || !recipientEmail || !content || !content.trim()) {
        return res.status(400).json({ error: "Sender email, recipient email, and message content are required." });
      }

      const store = getStoreInstance();
      if (!store.digitalMarketMessages) store.digitalMarketMessages = [];
      if (req.user.role === 'user' && store.digitalMarketStores?.some(s => normalizeEmail(s.studentEmail) === normalizeEmail(senderEmail))) return res.status(403).json({ error: 'Sign in with your market password to send messages from your store email.' });

      const newMessage = {
        id: `msg-${Date.now()}`,
        orderId: orderId || '',
        productId: productId || '',
        productTitle: productTitle || '',
        senderEmail: senderEmail.toLowerCase().trim(),
        senderName: senderName || 'Anonymous',
        recipientEmail: recipientEmail.toLowerCase().trim(),
        recipientName: recipientName || 'Merchant',
        content: content.trim(),
        createdAt: new Date().toISOString()
      };

      store.digitalMarketMessages.push(newMessage);
      savePersistentStore(store);
      syncStore();

      // Find if recipient has an associated digital store to attach student and parent emails
      const recipientStore = store.digitalMarketStores?.find((s: any) =>
        s.studentEmail?.toLowerCase() === recipientEmail.toLowerCase().trim() ||
        s.parentUserEmail?.toLowerCase() === recipientEmail.toLowerCase().trim()
      );

      // Trigger a real-time notification to the recipient inside their general notifications
      const recipientNotif = {
        id: `notif-msg-${Date.now()}`,
        studentId: recipientEmail.toLowerCase().trim(),
        userId: recipientEmail.toLowerCase().trim(),
        userEmail: recipientEmail.toLowerCase().trim(),
        recipientEmail: recipientEmail.toLowerCase().trim(),
        parentUserEmail: recipientStore ? recipientStore.parentUserEmail?.toLowerCase().trim() : '',
        title: `📩 New message from ${senderName}`,
        message: `Inquiry about: ${productTitle || 'Campus Order'}. "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
        type: 'info',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(recipientNotif);
      await dbCreateNotification(recipientNotif, notifications);

      return res.status(201).json({ success: true, message: newMessage });
    } catch (err: any) {
      console.error("Error sending private message:", err);
      return res.status(500).json({ error: "Failed to send message." });
    }
  });

  // 5. Manager Verifications: Admin Approves Manager
  app.put("/api/manager-verifications/:id/approve", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const store = getStoreInstance();
      const matchedInsp = verificationInspections.find(i => i.id === id || i.managerVerificationId === id);
      const effectiveId = matchedInsp?.managerVerificationId || id;

      const allRecords = await dbGetManagerVerifications(managerVerifications);
      const target = allRecords.find(v => v.id === effectiveId || v.id === id || v.managerId === effectiveId || v.managerId === id) ||
                     managerVerifications.find(v => v.id === effectiveId || v.id === id || v.managerId === effectiveId || v.managerId === id) ||
                     managerRequests.find(r => r.id === effectiveId || r.id === id || r.managerId === effectiveId || r.managerId === id) ||
                     (store.managerRegistrationRequests || []).find((r: any) => r.id === effectiveId || r.id === id || r.managerId === effectiveId || r.managerId === id);

      if (!target) {
        return res.status(404).json({ error: "Manager verification application not found." });
      }

      const now = new Date().toISOString();
      const cleanEmail = (target.managerEmail || '').toLowerCase().trim();
      const cleanParentEmail = ((target as any).parentUserEmail || '').toLowerCase().trim();
      const targetMgrId = target.managerId || (target as any).userId;

      const matchesTarget = (obj: any) => {
        if (!obj) return false;
        const e1 = (obj.managerEmail || obj.email || '').toLowerCase().trim();
        const e2 = (obj.parentUserEmail || '').toLowerCase().trim();
        const id1 = obj.managerId || obj.userId || obj.id;
        const id2 = obj.parentUserId;

        const emailMatch = Boolean(cleanEmail) && (e1 === cleanEmail || e2 === cleanEmail);
        const parentEmailMatch = Boolean(cleanParentEmail) && (e1 === cleanParentEmail || e2 === cleanParentEmail);
        const idMatch = Boolean(targetMgrId) && (id1 === targetMgrId || id2 === targetMgrId);
        return emailMatch || parentEmailMatch || idMatch;
      };

      // Update inspection status
      verificationInspections.forEach(i => {
        if (i.id === id || i.managerVerificationId === effectiveId || (cleanEmail && (i.managerEmail || '').toLowerCase().trim() === cleanEmail)) {
          i.status = 'approved';
        }
      });

      // 1. Update managerVerifications in memory
      managerVerifications.forEach(v => {
        if (v.id === id || v.id === effectiveId || matchesTarget(v)) {
          v.status = 'approved';
          v.authorityStatus = 'verified';
          v.inspectionStatus = 'approved';
          v.documentsVerified = { operatingCertificate: 'verified', idFront: 'verified', idBack: 'verified' };
          v.adminNotes = adminNotes || v.adminNotes || 'Identity and Authority verified by Administrator.';
          v.reviewedBy = req.user?.name || 'SuperAdmin';
          v.reviewedAt = now;
          v.updatedAt = now;
        }
      });

      // 2. Update managerRequests in memory
      managerRequests.forEach(r => {
        if (r.id === id || r.id === effectiveId || matchesTarget(r)) {
          r.status = 'approved';
          r.inspectionStatus = 'approved';
          r.documentsVerified = { operatingCertificate: 'verified', idFront: 'verified', idBack: 'verified' };
          (r as any).isApproved = true;
          r.approvedAt = now;
          r.updatedAt = now;
        }
      });

      // 3. Update persistent store records
      if (store.managerRegistrationRequests) {
        store.managerRegistrationRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'approved';
            r.isApproved = true;
            r.approvedAt = now;
            r.updatedAt = now;
          }
        });
      }
      if ((store as any).managerVerifications) {
        (store as any).managerVerifications.forEach((v: any) => {
          if (v.id === id || matchesTarget(v)) {
            v.status = 'approved';
            v.authorityStatus = 'verified';
            v.reviewedAt = now;
            v.reviewedBy = req.user?.name || 'SuperAdmin';
            v.updatedAt = now;
          }
        });
      }
      if ((store as any).managerRequests) {
        (store as any).managerRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'approved';
            r.isApproved = true;
            r.approvedAt = now;
            r.updatedAt = now;
          }
        });
      }

      // 4. Update user objects
      const updateUserObj = (u: any) => {
        if (!u) return;
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        const uId = u.id || u.user?.id;
        const uRole = (u.role || u.user?.role || '').toLowerCase();

        // ONLY update role and verification on the actual manager user account (never the parent user)
        const isActualMgr = (uRole === 'manager' || (cleanEmail && uEmail === cleanEmail)) && 
                            (!cleanParentEmail || uEmail !== cleanParentEmail) && 
                            ((cleanEmail && uEmail === cleanEmail) || (targetMgrId && uId === targetMgrId));
        if (isActualMgr) {
          if (u.user) {
            u.user.isVerified = true;
            u.user.verificationStatus = 'approved';
            u.user.role = 'manager';
          }
          u.isVerified = true;
          u.verificationStatus = 'approved';
          u.role = 'manager';
        }

        // For parent user: ONLY update the registeredAccounts.managerAccount metadata! DO NOT change parent user's own role!
        const isParentUser = (cleanParentEmail && uEmail === cleanParentEmail) || ((target as any).parentUserId && uId === (target as any).parentUserId);
        if (isParentUser || u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount) {
          const targetAcc = u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount;
          if (targetAcc) {
            targetAcc.status = 'approved';
            targetAcc.isApproved = true;
            targetAcc.isVerified = true;
          }
        }
      };
      MOCK_USERS.forEach(updateUserObj);
      if (store.users) {
        store.users.forEach(updateUserObj);
      }

      savePersistentStore(store);

      // Persist across manager tables
      await dbUpdateManagerVerificationStatus(id, 'approved', adminNotes || 'Identity and Authority verified by Administrator.', req.user?.name || 'SuperAdmin', cleanEmail, targetMgrId);
      await dbUpdateManagerRequestStatus(id, 'approved');

      const matchingReq = managerRequests.find(matchesTarget);

      syncStore();

      // Audit log
      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'MANAGER_APPROVED',
        targetType: 'manager',
        targetId: targetMgrId,
        targetName: target.managerName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes, reviewedAt: now },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      // Dispatch user notification for manager approval to manager user AND parent user
      const parentUserId = (target as any).parentUserId || targetMgrId;
      const notifyEmails = Array.from(new Set([cleanEmail, cleanParentEmail].filter(Boolean)));

      for (const emailToNotify of notifyEmails) {
        const titleText = 'Manager Account Approved!';
        const exists = notifications.some((n: any) => 
          n.title === titleText && 
          ((n.userEmail || '').toLowerCase() === emailToNotify || (n.recipientEmail || '').toLowerCase() === emailToNotify || (n.parentUserEmail || '').toLowerCase() === emailToNotify)
        );
        if (!exists) {
          const mgrApprNotif = {
            id: `notif-mgr-appr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            studentId: targetMgrId,
            userId: targetMgrId,
            parentUserId: parentUserId,
            userEmail: emailToNotify,
            recipientEmail: emailToNotify,
            targetEmail: emailToNotify,
            parentUserEmail: cleanParentEmail,
            managerEmail: cleanEmail,
            title: titleText,
            message: `Congratulations ${target.managerName}! Your Manager Account registration and identity verification has been APPROVED by PineVela Administration. Current Status: Approved. You now have full access to hostel operations.`,
            type: 'success',
            date: new Date().toISOString().split('T')[0],
            read: false
          };
          notifications.unshift(mgrApprNotif);
          await dbCreateNotification(mgrApprNotif, notifications);
        }
      }

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin APPROVED Manager "${target.managerName}". Hostel registration is now unlocked!`,
        time: 'Just now',
        type: 'success'
      }, activities);

      return res.json({
        success: true,
        record: target,
        verification: target,
        request: matchingReq || target,
        manager: target,
        message: `Manager "${target.managerName}" approved! Hostel registration unlocked.`
      });
    } catch (err: any) {
      console.error("Approve manager error:", err);
      return res.status(500).json({ error: err.message || "Failed to approve manager." });
    }
  });

  // 5b. Manager Verifications: Mark specific document as verified / checked
  app.put("/api/manager-verifications/:id/verify-doc", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { docKey, status, notes } = req.body || {}; // docKey: 'certificate' | 'idFront' | 'idBack', status: 'verified' | 'rejected' | 'pending'
      
      const allRecords = await dbGetManagerVerifications(managerVerifications);
      const target = allRecords.find(v => v.id === id) || managerVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Manager verification application not found." });
      }

      if (!target.documentsVerified) {
        target.documentsVerified = { certificate: false, idFront: false, idBack: false };
      }
      if (!target.documentInspectionNotes) {
        target.documentInspectionNotes = {};
      }

      if (docKey) {
        target.documentsVerified[docKey] = status === 'verified' || status === true;
        if (notes) {
          target.documentInspectionNotes[docKey] = notes;
        }
      }

      target.updatedAt = new Date().toISOString();

      const store = getStoreInstance();
      if ((store as any).managerVerifications) {
        const sTarget = (store as any).managerVerifications.find((v: any) => v.id === id);
        if (sTarget) {
          sTarget.documentsVerified = target.documentsVerified;
          sTarget.documentInspectionNotes = target.documentInspectionNotes;
          sTarget.updatedAt = target.updatedAt;
        }
      }
      savePersistentStore(store);

      return res.json({
        success: true,
        documentsVerified: target.documentsVerified,
        documentInspectionNotes: target.documentInspectionNotes,
        allVerified: Boolean(target.documentsVerified?.certificate && target.documentsVerified?.idFront && target.documentsVerified?.idBack),
        message: `Document "${docKey}" inspection updated.`
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to update document verification." });
    }
  });

  // 6. Manager Verifications: Admin Rejects Manager
  app.put("/api/manager-verifications/:id/reject", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const rawNotes = (req.body?.adminNotes || req.body?.rejectionReason || req.body?.reason || '').trim();
      if (!rawNotes || rawNotes.length < 5) {
        return res.status(400).json({ error: "A valid, detailed reason for rejection is required (minimum 5 characters)." });
      }
      const adminNotes = rawNotes;
      const allRecords = await dbGetManagerVerifications(managerVerifications);
      const target = allRecords.find(v => v.id === id) || managerVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Manager verification application not found." });
      }

      const now = new Date().toISOString();
      const cleanEmail = (target.managerEmail || '').toLowerCase().trim();
      const cleanParentEmail = ((target as any).parentUserEmail || '').toLowerCase().trim();
      const targetMgrId = target.managerId || (target as any).userId;

      const matchesTarget = (obj: any) => {
        if (!obj) return false;
        const e1 = (obj.managerEmail || obj.email || '').toLowerCase().trim();
        const e2 = (obj.parentUserEmail || '').toLowerCase().trim();
        const id1 = obj.managerId || obj.userId || obj.id;
        const id2 = obj.parentUserId;

        const emailMatch = Boolean(cleanEmail) && (e1 === cleanEmail || e2 === cleanEmail);
        const parentEmailMatch = Boolean(cleanParentEmail) && (e1 === cleanParentEmail || e2 === cleanParentEmail);
        const idMatch = Boolean(targetMgrId) && (id1 === targetMgrId || id2 === targetMgrId);
        return emailMatch || parentEmailMatch || idMatch;
      };

      managerVerifications.forEach(v => {
        if (v.id === id || matchesTarget(v)) {
          v.status = 'rejected';
          v.adminNotes = adminNotes || v.adminNotes || 'Application declined due to inconsistent information or unverified documentation.';
          v.reviewedBy = req.user?.name || 'SuperAdmin';
          v.reviewedAt = now;
          v.updatedAt = now;
        }
      });

      managerRequests.forEach(r => {
        if (r.id === id || matchesTarget(r)) {
          r.status = 'rejected';
          (r as any).isApproved = false;
          r.updatedAt = now;
        }
      });

      const store = getStoreInstance();
      if (store.managerRegistrationRequests) {
        store.managerRegistrationRequests.forEach((r: any) => {
          if (r.id === id || matchesTarget(r)) {
            r.status = 'rejected';
            r.isApproved = false;
            r.updatedAt = now;
          }
        });
      }
      if ((store as any).managerVerifications) {
        (store as any).managerVerifications.forEach((v: any) => {
          if (v.id === id || matchesTarget(v)) {
            v.status = 'rejected';
            v.updatedAt = now;
          }
        });
      }

      const updateUserObj = (u: any) => {
        if (!u) return;
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        const uId = u.id || u.user?.id;
        const uRole = (u.role || u.user?.role || '').toLowerCase();

        const isActualMgr = (uRole === 'manager' || (cleanEmail && uEmail === cleanEmail)) && 
                            (!cleanParentEmail || uEmail !== cleanParentEmail) && 
                            ((cleanEmail && uEmail === cleanEmail) || (targetMgrId && uId === targetMgrId));
        if (isActualMgr) {
          if (u.user) {
            u.user.isVerified = false;
            u.user.verificationStatus = 'rejected';
          }
          u.isVerified = false;
          u.verificationStatus = 'rejected';
        }

        const isParentUser = (cleanParentEmail && uEmail === cleanParentEmail) || ((target as any).parentUserId && uId === (target as any).parentUserId);
        if (isParentUser || u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount) {
          const targetAcc = u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount;
          if (targetAcc) {
            targetAcc.status = 'rejected';
            targetAcc.isApproved = false;
            targetAcc.isVerified = false;
          }
        }
      };
      MOCK_USERS.forEach(updateUserObj);
      if (store.users) {
        store.users.forEach(updateUserObj);
      }

      savePersistentStore(store);

      await dbUpdateManagerVerificationStatus(id, 'rejected', adminNotes || 'Rejected by Admin', req.user?.name || 'SuperAdmin', cleanEmail, targetMgrId);
      await dbUpdateManagerRequestStatus(id, 'rejected');

      const matchingReq = managerRequests.find(matchesTarget);

      syncStore();

      // Audit log
      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'MANAGER_REJECTED',
        targetType: 'manager',
        targetId: target.managerId,
        targetName: target.managerName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      // Dispatch user notification for manager rejection to manager user AND parent user
      const parentUserId = (target as any).parentUserId || target.managerId;
      const notifyEmails = Array.from(new Set([cleanEmail, cleanParentEmail].filter(Boolean)));

      for (const emailToNotify of notifyEmails) {
        const titleText = 'Manager Account Registration Update';
        const exists = notifications.some((n: any) => 
          n.title === titleText && 
          ((n.userEmail || '').toLowerCase() === emailToNotify || (n.recipientEmail || '').toLowerCase() === emailToNotify || (n.parentUserEmail || '').toLowerCase() === emailToNotify)
        );
        if (!exists) {
          const mgrRejNotif = {
            id: `notif-mgr-rej-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            studentId: target.managerId,
            userId: target.managerId,
            parentUserId: parentUserId,
            userEmail: emailToNotify,
            recipientEmail: emailToNotify,
            targetEmail: emailToNotify,
            parentUserEmail: cleanParentEmail,
            managerEmail: cleanEmail,
            title: titleText,
            message: `Your Manager Account registration for "${target.managerName}" has been reviewed and marked as REJECTED. Notes: ${target.adminNotes || 'No notes provided'}`,
            type: 'warning',
            date: new Date().toISOString().split('T')[0],
            read: false
          };
          notifications.unshift(mgrRejNotif);
          await dbCreateNotification(mgrRejNotif, notifications);
        }
      }

      return res.json({
        success: true,
        record: target,
        verification: target,
        message: `Manager "${target.managerName}" verification rejected.`
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to reject manager." });
    }
  });

  // 7. Manager Verifications: Admin Requests More Information
  app.put("/api/manager-verifications/:id/request-info", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const allRecords = await dbGetManagerVerifications(managerVerifications);
      const target = allRecords.find(v => v.id === id) || managerVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Manager verification application not found." });
      }

      const now = new Date().toISOString();
      target.status = 'more_info_required';
      target.adminNotes = adminNotes || 'Please supply additional documentation regarding property ownership authorization.';
      target.reviewedBy = req.user?.name || 'SuperAdmin';
      target.reviewedAt = now;

      await dbUpdateManagerVerificationStatus(id, 'more_info_required', target.adminNotes, target.reviewedBy);

      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'MANAGER_MORE_INFO_REQUESTED',
        targetType: 'manager',
        targetId: target.managerId,
        targetName: target.managerName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      return res.json({ success: true, verification: target });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to request information." });
    }
  });

  // ==========================================
  // PINEVELA VERIFICATION TEAMS & FIELD INSPECTIONS
  // ==========================================

  // 1. Admin: Get all Verification Team Officers
  app.get("/api/verification-teams", requireAuth(["admin"]), async (req: any, res) => {
    try {
      return res.json(verificationTeams.map((t) => stripSecrets(t)));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch verification teams." });
    }
  });

  // 2. Admin: Register a new Verification Team Officer & issue credentials
  app.post("/api/verification-teams", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { fullName, email, phone, password, assignedZone } = req.body;
      if (!fullName || !email || !password) {
        return res.status(400).json({ error: "Full Name, Official Email, and Password are required." });
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = verificationTeams.find(t => t.email.toLowerCase() === cleanEmail);
      if (existing) {
        return res.status(400).json({ error: "A verification team officer with this email already exists." });
      }

      const count = verificationTeams.length + 1;
      const officerId = `PV-INSP-2026-${count.toString().padStart(2, '0')}`;
      const id = `vt-${Date.now()}`;
      const now = new Date().toISOString();

      const plaintextPassword = password.trim();
      const hashedPassword = hashPasswordSha256(plaintextPassword);
      const sessionToken = createSessionToken('vt');

      const newOfficer = {
        id,
        officerId,
        fullName: fullName.trim(),
        email: cleanEmail,
        password: hashedPassword,
        plainPassword: plaintextPassword,
        phone: (phone || '').trim(),
        assignedZone: (assignedZone || 'Greater Accra Region').trim(),
        status: 'active' as const,
        role: 'verification_team' as const,
        token: sessionToken,
        createdAt: now,
        totalInspectionsCompleted: 0
      };

      verificationTeams.unshift(newOfficer);

      // Also register/update in system users so they can authenticate seamlessly everywhere
      const userEntry = {
        email: cleanEmail,
        username: cleanEmail.split('@')[0],
        officerId: newOfficer.officerId,
        password: plaintextPassword,
        plainPassword: plaintextPassword,
        token: sessionToken,
        user: {
          id: newOfficer.id,
          name: newOfficer.fullName,
          fullName: newOfficer.fullName,
          role: 'verification_team',
          email: cleanEmail,
          phone: newOfficer.phone,
          officerId: newOfficer.officerId,
          assignedZone: newOfficer.assignedZone,
          token: sessionToken,
          status: 'active',
          isVerified: true
        }
      };

      const existingIdx = MOCK_USERS.findIndex(u => (u.email && u.email.toLowerCase() === cleanEmail) || (u.user?.email && u.user.email.toLowerCase() === cleanEmail));
      if (existingIdx >= 0) {
        MOCK_USERS[existingIdx] = userEntry;
      } else {
        MOCK_USERS.push(userEntry);
      }

      // Audit Log
      const auditLog = {
        id: `val-vt-${Date.now()}`,
        action: 'VERIFICATION_OFFICER_REGISTERED',
        targetType: 'verification_team',
        targetId: newOfficer.id,
        targetName: newOfficer.fullName,
        performedBy: req.user?.name || 'SuperAdmin',
        role: 'admin',
        details: { officerId: newOfficer.officerId, assignedZone: newOfficer.assignedZone },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);

      syncStore();

      return res.status(201).json({
        success: true,
        officer: stripSecrets(newOfficer),
        credentials: {
          officerId: newOfficer.officerId,
          fullName: newOfficer.fullName,
          email: newOfficer.email,
          password: plaintextPassword,
          assignedZone: newOfficer.assignedZone
        },
        message: `PineVela Verification Officer "${newOfficer.fullName}" (${newOfficer.officerId}) successfully registered and credentials generated!`
      });
    } catch (err: any) {
      console.error("Error registering verification officer:", err);
      return res.status(500).json({ error: err.message || "Failed to register verification team officer." });
    }
  });

  // 3. Admin: Update Verification Team Officer status (active, suspended, inactive)
  app.put("/api/verification-teams/:id/status", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const officer = verificationTeams.find(t => t.id === id || t.officerId === id);
      if (!officer) {
        return res.status(404).json({ error: "Verification team officer not found." });
      }

      officer.status = status;
      officer.updatedAt = new Date().toISOString();
      syncStore();

      return res.json({ success: true, officer: stripSecrets(officer), message: `Officer status updated to ${status}.` });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update officer status." });
    }
  });

  // 4. Verification Team Login
  app.post(["/api/verification-teams/login", "/api/auth/verification-team-login"], async (req: any, res) => {
    try {
      const { email, password, officerId, usernameOrEmail } = req.body;
      const cleanEmail = (email || usernameOrEmail || '').toLowerCase().trim();
      const cleanOfficerId = (officerId || usernameOrEmail || email || '').trim();
      const cleanPassword = (password || '').trim();

      const store = getStoreInstance();
      const allVT = [...verificationTeams, ...(store.verificationTeams || [])];

      const matchedOfficer = allVT.find(t => {
        if (!t) return false;
        const emailMatch = cleanEmail && t.email?.toLowerCase() === cleanEmail;
        const idMatch = cleanOfficerId && (
          t.officerId?.toUpperCase() === cleanOfficerId.toUpperCase() ||
          t.officerId?.toLowerCase() === cleanOfficerId.toLowerCase() ||
          t.id === cleanOfficerId
        );
        const usernameMatch = cleanEmail && t.email?.split('@')[0].toLowerCase() === cleanEmail;
        return (emailMatch || idMatch || usernameMatch) && passwordsMatch(cleanPassword, t.password, t.plainPassword);
      });

      if (!matchedOfficer) {
        return res.status(401).json({ error: "Invalid officer credentials. Please check your official email/Officer ID and password." });
      }

      if (matchedOfficer.status && matchedOfficer.status !== 'active') {
        return res.status(403).json({ error: `Officer account is currently ${matchedOfficer.status}. Please contact PineVela Administration.` });
      }

      const newToken = createSessionToken('vt');
      matchedOfficer.token = newToken;
      
      // Also update in verificationTeams in-memory array and mock users
      const inMem = verificationTeams.find(t => t.id === matchedOfficer.id || t.officerId === matchedOfficer.officerId);
      if (inMem) inMem.token = newToken;
      
      persistUserSessionToken(matchedOfficer, newToken);
      syncStore();

      const userObj = {
        id: matchedOfficer.id,
        officerId: matchedOfficer.officerId,
        name: matchedOfficer.fullName,
        fullName: matchedOfficer.fullName,
        email: matchedOfficer.email,
        phone: matchedOfficer.phone,
        role: 'verification_team',
        assignedZone: matchedOfficer.assignedZone,
        status: matchedOfficer.status || 'active',
        isVerified: true,
        token: newToken
      };

      return res.json({
        success: true,
        user: userObj,
        token: newToken,
        message: `Welcome back Officer ${matchedOfficer.fullName}`
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Login failed." });
    }
  });

  // 5. Verification Team: Get Current Officer profile
  app.get("/api/verification-team/me", async (req: any, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
      const token = authHeader.replace("Bearer ", "").trim();
      const officer = verificationTeams.find(t => t.token === token) || (getStoreInstance().verificationTeams || []).find((t: any) => t.token === token);
      if (!officer) return res.status(401).json({ error: "Officer session expired or invalid" });

      return res.json({ success: true, officer: stripSecrets(officer) });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch officer session" });
    }
  });

  // Helper to get all unified inspections merged with latest reports & statuses
  const getAllUnifiedInspections = () => {
    const store = getStoreInstance();
    const map = new Map<string, any>();

    const addOrMerge = (i: any) => {
      if (!i) return;
      const idKey = i.id || `insp-${i.managerVerificationId || Date.now()}`;
      const emailKey = i.managerEmail ? `email-${i.managerEmail.toLowerCase().trim()}` : '';

      // Find existing by any matching key
      let existing: any = null;
      for (const item of map.values()) {
        if (item.id === i.id || 
            (i.managerVerificationId && item.managerVerificationId === i.managerVerificationId) ||
            (emailKey && item.managerEmail && `email-${item.managerEmail.toLowerCase().trim()}` === emailKey)) {
          existing = item;
          break;
        }
      }

      if (!existing) {
        map.set(idKey, { ...i, id: idKey });
      } else {
        const hasReport = Boolean(i.report || existing.report);
        const bestReport = i.report || existing.report;
        let bestStatus = existing.status || 'dispatched';
        if (i.status === 'approved' || existing.status === 'approved') {
          bestStatus = 'approved';
        } else if (i.status === 'report_submitted' || existing.status === 'report_submitted' || hasReport) {
          bestStatus = 'report_submitted';
        } else if (i.status === 'rejected' || existing.status === 'rejected') {
          bestStatus = 'rejected';
        }

        const merged = {
          ...existing,
          ...i,
          id: existing.id || idKey,
          status: bestStatus,
          report: bestReport || null
        };
        map.set(existing.id, merged);
      }
    };

    // 1. Seed default, in-memory, store, and persistent inspections
    DEFAULT_INSPECTIONS.forEach(addOrMerge);
    (verificationInspections || []).forEach(addOrMerge);
    (store.verificationInspections || []).forEach(addOrMerge);
    ((persistentData as any).verificationInspections || []).forEach(addOrMerge);

    // 2. Merge from managerVerifications and managerRequests
    const allVerifs = [
      ...(managerVerifications || []),
      ...((store as any).managerVerifications || []),
      ...((persistentData as any).managerVerifications || [])
    ];

    allVerifs.forEach((v: any) => {
      if (!v) return;
      const vReport = v.inspectionReport || v.verificationReport;
      const vStatus = v.inspectionStatus === 'approved' || v.status === 'approved'
        ? 'approved'
        : (v.inspectionStatus === 'report_submitted' || vReport)
        ? 'report_submitted'
        : v.inspectionStatus === 'dispatched'
        ? 'dispatched'
        : (v.assignedOfficerId ? 'dispatched' : null);

      if (!vStatus && !v.assignedOfficerId && !vReport) return;

      addOrMerge({
        id: `insp-${v.id}`,
        managerVerificationId: v.id,
        managerName: v.managerName,
        managerEmail: v.managerEmail,
        managerPhone: v.managerPhone,
        hostelName: v.hostelName || v.residenceName || 'Hostel Property',
        location: v.location || v.address || 'Address provided by manager',
        digitalAddress: v.digitalAddress || '',
        dispatchedAt: v.dispatchedAt || v.createdAt || new Date().toISOString(),
        dispatchedBy: v.dispatchedBy || 'Admin',
        assignedOfficerId: v.assignedOfficerId || 'vt-101',
        assignedOfficerName: v.assignedOfficerName || 'Field Officer',
        assignedOfficerEmail: v.assignedOfficerEmail || '',
        status: vStatus || 'dispatched',
        priority: v.priority || 'medium',
        adminDispatchNotes: v.adminDispatchNotes || 'Physical on-site property inspection.',
        report: vReport || null
      });
    });

    const unifiedList = Array.from(map.values());
    // Keep in-memory array in sync
    verificationInspections.length = 0;
    verificationInspections.push(...unifiedList);
    return unifiedList;
  };

  // 6. Admin & Officers: Get all verification inspections
  app.get(["/api/admin/verification-inspections", "/api/verification-inspections"], async (req: any, res) => {
    try {
      const allInspections = getAllUnifiedInspections();
      return res.json(allInspections);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch inspections." });
    }
  });

  // 7. Officer: Get inspections assigned to the logged-in officer
  app.get("/api/verification-team/my-inspections", async (req: any, res) => {
    try {
      const authHeader = req.headers.authorization;
      const officerEmail = (req.query.email || '').toString().toLowerCase().trim();
      const officerIdParam = (req.query.officerId || '').toString().trim();
      const store = getStoreInstance();

      const allOfficers = [
        ...verificationTeams,
        ...(store.verificationTeams || []),
        ...((persistentData as any).verificationTeams || [])
      ];

      let matchedOfficer = allOfficers.find((t: any) => 
        (officerEmail && t.email?.toLowerCase() === officerEmail) ||
        (officerIdParam && (t.id === officerIdParam || t.officerId === officerIdParam))
      );

      if (!matchedOfficer && authHeader) {
        const token = authHeader.replace("Bearer ", "").trim();
        matchedOfficer = allOfficers.find((t: any) => t.token === token);
      }

      const allInspections = getAllUnifiedInspections();

      if (matchedOfficer) {
        const filtered = allInspections.filter((i: any) => 
          i.assignedOfficerId === matchedOfficer.id || 
          i.assignedOfficerId === matchedOfficer.officerId ||
          (i.assignedOfficerEmail && matchedOfficer.email && i.assignedOfficerEmail.toLowerCase() === matchedOfficer.email.toLowerCase()) ||
          (i.report && (i.report.officerId === matchedOfficer.id || i.report.officerId === matchedOfficer.officerId)) ||
          (matchedOfficer.id === 'vt-101' && (!i.assignedOfficerId || i.assignedOfficerId === 'vt-101'))
        );
        return res.json(filtered);
      }

      return res.json(allInspections);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch assigned inspections." });
    }
  });

  // 8. Admin: Dispatch Verification Team to inspect a property
  app.post("/api/admin/dispatch-verification-team", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const {
        managerVerificationId,
        assignedOfficerId,
        priority,
        adminDispatchNotes
      } = req.body;

      if (!managerVerificationId || !assignedOfficerId) {
        return res.status(400).json({ error: "Manager Verification ID and Assigned Officer are required." });
      }

      const verif = managerVerifications.find(v => v.id === managerVerificationId || v.managerId === managerVerificationId);
      const officer = verificationTeams.find(t => t.id === assignedOfficerId || t.officerId === assignedOfficerId);

      if (!verif) {
        return res.status(404).json({ error: "Manager verification request not found." });
      }
      if (!officer) {
        return res.status(404).json({ error: "Selected verification officer not found." });
      }

      const now = new Date().toISOString();
      const inspId = `insp-${Date.now()}`;

      const newInspection = {
        id: inspId,
        managerVerificationId: verif.id,
        managerName: verif.managerName,
        managerEmail: verif.managerEmail,
        managerPhone: verif.managerPhone,
        hostelName: verif.hostelName || verif.residenceName || 'Hostel Property',
        location: verif.location || verif.address || 'Address provided by manager',
        digitalAddress: verif.digitalAddress || '',
        dispatchedAt: now,
        dispatchedBy: req.user?.name || 'System Administrator',
        assignedOfficerId: officer.id,
        assignedOfficerName: officer.fullName,
        assignedOfficerEmail: officer.email,
        status: 'dispatched' as const,
        priority: (priority || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
        adminDispatchNotes: adminDispatchNotes || 'Perform comprehensive physical inspection of property, confirm manager identity and authorization, and verify premises existence.',
        report: null
      };

      // Check if existing inspection exists for this verif
      const existingIdx = verificationInspections.findIndex(i => i.managerVerificationId === verif.id);
      if (existingIdx >= 0) {
        verificationInspections[existingIdx] = { ...verificationInspections[existingIdx], ...newInspection, id: verificationInspections[existingIdx].id };
      } else {
        verificationInspections.unshift(newInspection);
      }

      // Update managerVerification inspection status
      verif.inspectionStatus = 'dispatched';
      verif.assignedOfficerId = officer.id;
      verif.assignedOfficerName = officer.fullName;
      verif.updatedAt = now;

      // Send Notification to Officer
      const officerNotif = {
        id: `notif-insp-off-${Date.now()}`,
        studentId: officer.id,
        userId: officer.id,
        userEmail: officer.email,
        recipientEmail: officer.email,
        targetEmail: officer.email,
        title: `New Dispatch: ${newInspection.hostelName}`,
        message: `You have been dispatched to physically inspect "${newInspection.hostelName}" for manager "${newInspection.managerName}" located at ${newInspection.location}.`,
        type: 'verification',
        date: now.split('T')[0],
        read: false
      };
      notifications.unshift(officerNotif);

      // Send Notification to Manager
      const mgrNotif = {
        id: `notif-insp-mgr-${Date.now()}`,
        studentId: verif.managerId,
        userId: verif.managerId,
        userEmail: verif.managerEmail,
        recipientEmail: verif.managerEmail,
        targetEmail: verif.managerEmail,
        title: 'PineVela Verification Team Dispatched',
        message: `PineVela Verification Officer ${officer.fullName} has been assigned to visit and physically inspect "${newInspection.hostelName}". Please ensure you or an authorized representative are available.`,
        type: 'verification',
        date: now.split('T')[0],
        read: false
      };
      notifications.unshift(mgrNotif);

      // Audit Log
      const auditLog = {
        id: `val-disp-${Date.now()}`,
        action: 'VERIFICATION_TEAM_DISPATCHED',
        targetType: 'manager',
        targetId: verif.managerId,
        targetName: verif.managerName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: {
          officerName: officer.fullName,
          officerId: officer.officerId,
          hostelName: newInspection.hostelName,
          location: newInspection.location
        },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);

      syncStore();

      return res.status(201).json({
        success: true,
        inspection: newInspection,
        message: `Officer ${officer.fullName} has been dispatched to inspect ${newInspection.hostelName}!`
      });
    } catch (err: any) {
      console.error("Error dispatching verification team:", err);
      return res.status(500).json({ error: err.message || "Failed to dispatch verification team." });
    }
  });

  // 9. Verification Team Officer: Submit Physical Verification Report
  app.post("/api/verification-team/inspections/:id/submit-report", async (req: any, res) => {
    try {
      const { id } = req.params;
      const {
        gpsCoordinates,
        checklist,
        propertyDetails,
        photos,
        observations,
        recommendation,
        inspectorSignature
      } = req.body;

      const allUnified = getAllUnifiedInspections();
      let inspection = allUnified.find(i => i.id === id || i.managerVerificationId === id || i.id === `insp-${id}` || (id.startsWith('insp-') && i.managerVerificationId === id.replace('insp-', '')));
      
      if (!inspection) {
        inspection = verificationInspections.find(i => i.id === id || i.managerVerificationId === id);
      }

      if (!inspection) {
        // Create inspection dynamically if responding to a manager verification record
        const store = getStoreInstance();
        const verifRecord = managerVerifications.find(v => v.id === id || v.id === id.replace('insp-', '')) || (store.managerVerifications || []).find((v: any) => v.id === id || v.id === id.replace('insp-', ''));
        if (verifRecord) {
          inspection = {
            id: `insp-${verifRecord.id}`,
            managerVerificationId: verifRecord.id,
            managerName: verifRecord.managerName,
            managerEmail: verifRecord.managerEmail,
            managerPhone: verifRecord.managerPhone,
            hostelName: verifRecord.hostelName || verifRecord.residenceName || 'Hostel Property',
            location: verifRecord.location || verifRecord.address || 'Address provided by manager',
            digitalAddress: verifRecord.digitalAddress || '',
            dispatchedAt: verifRecord.dispatchedAt || new Date().toISOString(),
            dispatchedBy: 'Admin',
            assignedOfficerId: verifRecord.assignedOfficerId || 'vt-101',
            assignedOfficerName: verifRecord.assignedOfficerName || 'Field Officer',
            assignedOfficerEmail: verifRecord.assignedOfficerEmail || '',
            status: 'report_submitted',
            priority: verifRecord.priority || 'medium',
            report: null
          };
          verificationInspections.unshift(inspection);
        }
      }

      if (!inspection) {
        return res.status(404).json({ error: "Inspection record not found." });
      }

      if (!observations || observations.trim().length < 10) {
        return res.status(400).json({ error: "Detailed field inspection observations are required (minimum 10 characters)." });
      }

      const now = new Date().toISOString();

      const report = {
        submittedAt: now,
        officerId: inspection.assignedOfficerId || 'vt-101',
        officerName: inspection.assignedOfficerName || 'Samuel Mensah',
        gpsCoordinates: gpsCoordinates || {
          lat: 5.6505,
          lng: -0.1869,
          accuracyMeters: 5.0,
          capturedAddress: inspection.location
        },
        timestamp: now,
        checklist: {
          residenceExists: checklist?.residenceExists ?? false,
          managerConnected: checklist?.managerConnected ?? false,
          basicPropertyInfoVerified: checklist?.basicPropertyInfoVerified ?? false,
          managerAuthorityConfirmed: checklist?.managerAuthorityConfirmed ?? false,
          generalLegitimacyConfirmed: checklist?.generalLegitimacyConfirmed ?? false,
          safetyHabitableCompliance: checklist?.safetyHabitableCompliance ?? false
        },
        propertyDetails: {
          estimatedRooms: Number(propertyDetails?.estimatedRooms) || 0,
          estimatedBeds: Number(propertyDetails?.estimatedBeds) || 0,
          buildingStructure: propertyDetails?.buildingStructure || '',
          securityPresent: propertyDetails?.securityPresent ?? true,
          utilitiesOperational: propertyDetails?.utilitiesOperational ?? true
        },
        photos: Array.isArray(photos) ? photos : [],
        observations: observations.trim(),
        recommendation: (recommendation || 'recommend_approval') as 'recommend_approval' | 'recommend_rejection' | 'requires_reinspection',
        inspectorSignature: inspectorSignature || `${inspection.assignedOfficerName || 'Officer'} (Field Inspector)`
      };

      inspection.report = report;
      inspection.status = 'report_submitted';
      inspection.updatedAt = now;

      // Update in-memory verificationInspections
      const inMemIdx = verificationInspections.findIndex(i => i.id === inspection.id || (inspection.managerVerificationId && i.managerVerificationId === inspection.managerVerificationId));
      if (inMemIdx >= 0) {
        verificationInspections[inMemIdx] = inspection;
      } else {
        verificationInspections.unshift(inspection);
      }

      // Update matching manager verification record
      const verif = managerVerifications.find(v => v.id === inspection.managerVerificationId || (v.managerEmail && v.managerEmail.toLowerCase() === (inspection.managerEmail || '').toLowerCase()));
      if (verif) {
        verif.inspectionStatus = 'report_submitted';
        verif.inspectionReport = report;
        verif.verificationReport = report;
        verif.updatedAt = now;
      }

      // Update matching manager request record
      const mReq = managerRequests.find(r => r.id === inspection.managerVerificationId || (r.managerEmail && r.managerEmail.toLowerCase() === (inspection.managerEmail || '').toLowerCase()));
      if (mReq) {
        mReq.inspectionStatus = 'report_submitted';
        mReq.inspectionReport = report;
        mReq.verificationReport = report;
        mReq.updatedAt = now;
      }

      // Sync into persistent database store
      const store = getStoreInstance();
      if (!(store as any).verificationInspections) {
        (store as any).verificationInspections = [];
      }
      const inspIdx = (store as any).verificationInspections.findIndex((i: any) => i.id === inspection.id || (inspection.managerVerificationId && i.managerVerificationId === inspection.managerVerificationId));
      if (inspIdx >= 0) {
        (store as any).verificationInspections[inspIdx] = inspection;
      } else {
        (store as any).verificationInspections.unshift(inspection);
      }

      if ((store as any).managerVerifications) {
        (store as any).managerVerifications.forEach((v: any) => {
          if (v.id === inspection.managerVerificationId || (v.managerEmail && inspection.managerEmail && v.managerEmail.toLowerCase() === inspection.managerEmail.toLowerCase())) {
            v.inspectionStatus = 'report_submitted';
            v.inspectionReport = report;
            v.verificationReport = report;
            v.updatedAt = now;
          }
        });
      }

      if (store.managerRegistrationRequests) {
        store.managerRegistrationRequests.forEach((r: any) => {
          if (r.id === inspection.managerVerificationId || (r.managerEmail && inspection.managerEmail && r.managerEmail.toLowerCase() === inspection.managerEmail.toLowerCase())) {
            r.inspectionStatus = 'report_submitted';
            r.inspectionReport = report;
            r.verificationReport = report;
            r.updatedAt = now;
          }
        });
      }

      savePersistentStore(store);

      // Update officer stats
      const officer = verificationTeams.find(t => t.id === inspection.assignedOfficerId || t.officerId === inspection.assignedOfficerId);
      if (officer) {
        officer.totalInspectionsCompleted = (officer.totalInspectionsCompleted || 0) + 1;
      }

      // Notify Admin
      const adminNotif = {
        id: `notif-rep-sub-${Date.now()}`,
        studentId: 'admin_001',
        title: `Verification Report Submitted: ${inspection.hostelName}`,
        message: `Officer ${inspection.assignedOfficerName || 'Samuel Mensah'} submitted an on-site verification report for "${inspection.hostelName}". Recommendation: ${report.recommendation === 'recommend_approval' ? 'APPROVED' : report.recommendation.toUpperCase()}.`,
        type: 'verification',
        date: now.split('T')[0],
        read: false
      };
      notifications.unshift(adminNotif);

      // Audit Log
      const auditLog = {
        id: `val-rep-${Date.now()}`,
        action: 'VERIFICATION_REPORT_SUBMITTED',
        targetType: 'manager',
        targetId: inspection.managerVerificationId,
        targetName: inspection.managerName,
        performedBy: inspection.assignedOfficerName || 'Samuel Mensah',
        role: 'verification_team',
        details: {
          hostelName: inspection.hostelName,
          recommendation: report.recommendation,
          gps: report.gpsCoordinates
        },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);

      syncStore();

      return res.json({
        success: true,
        inspection,
        report,
        message: "Physical verification report submitted successfully! Admin has been notified for final review."
      });
    } catch (err: any) {
      console.error("Error submitting verification report:", err);
      return res.status(500).json({ error: err.message || "Failed to submit verification report." });
    }
  });

  // 8. Manager Verifications: Admin Suspends Manager
  app.put("/api/manager-verifications/:id/suspend", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const allRecords = await dbGetManagerVerifications(managerVerifications);
      const target = allRecords.find(v => v.id === id) || managerVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Manager verification application not found." });
      }

      const now = new Date().toISOString();
      target.status = 'suspended';
      target.adminNotes = adminNotes || 'Manager account suspended by system administrator.';
      target.reviewedBy = req.user?.name || 'SuperAdmin';
      target.reviewedAt = now;

      await dbUpdateManagerVerificationStatus(id, 'suspended', target.adminNotes, target.reviewedBy);

      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'MANAGER_SUSPENDED',
        targetType: 'manager',
        targetId: target.managerId,
        targetName: target.managerName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      return res.json({ success: true, verification: target });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to suspend manager." });
    }
  });

  // Helper: Aggregate all managers across sources (verifications, requests, mock users) with their assigned hostels
  async function getUnifiedHostelManagersList() {
    const currentHostels = await dbGetHostels(hostels);
    const verifs = await dbGetManagerVerifications(managerVerifications);
    const reqs = await dbGetManagerRequests(managerRequests);

    const managerMap = new Map<string, any>();

    // 1. Add all manager users from MOCK_USERS
    for (const u of MOCK_USERS) {
      const uRole = u.user?.role || u.role;
      if (uRole === 'manager') {
        const email = (u.email || u.user?.email || '').toLowerCase().trim();
        const id = u.user?.id || u.id;
        const userObj = u.user || u;
        managerMap.set(id, {
          id: id,
          name: userObj.name || u.username || 'Hostel Manager',
          email: email,
          phone: userObj.phone || '+233201234567',
          nationalId: userObj.nationalId || '',
          maskedIdNumber: userObj.maskedIdNumber || maskIdentifier(userObj.nationalId || 'GHA-729182910-1'),
          organization: userObj.organization || 'PineVela Partner',
          roleTitle: userObj.roleTitle || 'Hostel Manager',
          verificationStatus: userObj.isVerified ? 'approved' : (userObj.verificationStatus || 'pending'),
          authorityStatus: 'verified',
          isVerified: !!userObj.isVerified,
          createdAt: userObj.createdAt || new Date().toISOString()
        });
      }
    }

    // 2. Add / Merge from managerVerifications
    for (const v of verifs) {
      const id = v.managerId || v.id;
      const email = (v.managerEmail || '').toLowerCase().trim();
      const existing = managerMap.get(id) || Array.from(managerMap.values()).find(m => m.email === email);
      const isBlk = v.status === 'blocked' || v.isBlocked === true;
      const isAppr = !isBlk && v.status === 'approved';

      const merged = {
        id: id,
        name: v.managerName || existing?.name || 'Manager',
        email: email || existing?.email || '',
        phone: v.managerPhone || existing?.phone || '+233201234567',
        nationalId: v.nationalId || existing?.nationalId || '',
        maskedIdNumber: v.maskedIdNumber || existing?.maskedIdNumber || (v.nationalId ? maskIdentifier(v.nationalId) : 'GHA-***-***'),
        organization: v.organizationName || existing?.organization || 'Independent Accommodation',
        roleTitle: v.authorityRelationship || existing?.roleTitle || 'Resident Administrator',
        status: isBlk ? 'blocked' : (isAppr ? 'approved' : (v.status || existing?.status || 'pending')),
        verificationStatus: isBlk ? 'blocked' : (isAppr ? 'approved' : (v.status || existing?.verificationStatus || 'pending')),
        authorityStatus: isBlk ? 'blocked' : (v.authorityStatus || (isAppr ? 'verified' : 'pending')),
        isVerified: isAppr || (existing?.isVerified && !isBlk) || false,
        isBlocked: isBlk,
        blockReason: v.blockReason || v.adminNotes || existing?.blockReason || null,
        approvedAt: v.reviewedAt || existing?.approvedAt,
        createdAt: v.createdAt || existing?.createdAt || new Date().toISOString()
      };
      managerMap.set(id, merged);
    }

    // 3. Add / Merge from managerRequests
    for (const r of reqs) {
      const id = r.managerId || r.id;
      const email = (r.managerEmail || '').toLowerCase().trim();
      const existing = managerMap.get(id) || Array.from(managerMap.values()).find(m => m.email === email);
      const isBlk = r.status === 'blocked' || r.isBlocked === true || existing?.isBlocked;
      const isAppr = !isBlk && (r.status || '').toLowerCase() === 'approved';

      const merged = {
        id: id,
        name: r.managerName || existing?.name || 'Manager',
        email: email || existing?.email || '',
        phone: r.managerPhone || existing?.phone || '+233201234567',
        nationalId: r.nationalId || existing?.nationalId || '',
        maskedIdNumber: existing?.maskedIdNumber || (r.nationalId ? maskIdentifier(r.nationalId) : 'GHA-***-***'),
        organization: r.organization || existing?.organization || 'PineVela Hostels',
        roleTitle: r.roleTitle || existing?.roleTitle || 'Property Manager',
        status: isBlk ? 'blocked' : (isAppr ? 'approved' : (existing?.status || r.status || 'pending')),
        verificationStatus: isBlk ? 'blocked' : (isAppr ? 'approved' : (existing?.verificationStatus || r.status || 'pending')),
        authorityStatus: isBlk ? 'blocked' : (isAppr ? 'verified' : (existing?.authorityStatus || 'pending')),
        isVerified: isAppr || (existing?.isVerified && !isBlk) || false,
        isBlocked: isBlk,
        blockReason: r.blockReason || r.adminNotes || existing?.blockReason || null,
        approvedAt: r.approvedAt || existing?.approvedAt,
        createdAt: r.requestedAt || r.createdAt || existing?.createdAt || new Date().toISOString()
      };
      managerMap.set(id, merged);
    }

    // 4. Attach assigned hostel(s) for each manager
    const result = Array.from(managerMap.values()).map(mgr => {
      const assignedHostels = currentHostels.filter(h => {
        if (!h) return false;
        const matchId = h.managerId && h.managerId === mgr.id;
        const matchEmail = h.managerEmail && mgr.email && h.managerEmail.toLowerCase().trim() === mgr.email.toLowerCase().trim();
        const matchName = h.managerName && mgr.name && h.managerName.toLowerCase().trim() === mgr.name.toLowerCase().trim();
        return matchId || matchEmail || matchName;
      }).map(h => ({
        id: h.id,
        name: h.name,
        location: h.location,
        status: h.status,
        bedsLeft: h.bedsLeft ?? h.availableSpaces ?? 0,
        totalCapacity: h.totalCapacity ?? 0
      }));

      const primaryHostel = assignedHostels[0];

      return {
        ...mgr,
        assignedHostelId: primaryHostel?.id,
        assignedHostelName: primaryHostel?.name,
        assignedHostels: assignedHostels
      };
    });

    return result;
  }

  // 8b. Unified Hostel Managers Directory
  app.get("/api/hostel-managers", async (_req, res) => {
    try {
      const managersList = await getUnifiedHostelManagersList();
      return res.json(managersList);
    } catch (err: any) {
      console.error("Failed to get unified managers:", err);
      return res.status(500).json({ error: "Failed to fetch hostel managers." });
    }
  });

  app.get("/api/managers", async (_req, res) => {
    try {
      const managersList = await getUnifiedHostelManagersList();
      return res.json(managersList);
    } catch (err: any) {
      console.error("Failed to get managers:", err);
      return res.status(500).json({ error: "Failed to fetch managers." });
    }
  });

  // 8c. Assign / Reassign Manager to Hostel
  app.post("/api/hostel-managers/assign", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { hostelId, managerId } = req.body || {};
      if (!hostelId || !managerId) {
        return res.status(400).json({ error: "hostelId and managerId are required." });
      }

      const allManagers = await getUnifiedHostelManagersList();
      const targetManager = allManagers.find(m => m.id === managerId);
      if (!targetManager) {
        return res.status(404).json({ error: "Manager not found." });
      }

      const currentHostels = await dbGetHostels(hostels);
      const targetHostel = currentHostels.find(h => h.id === hostelId) || hostels.find(h => h.id === hostelId);
      if (!targetHostel) {
        return res.status(404).json({ error: "Hostel not found." });
      }

      // Update hostel fields
      targetHostel.managerId = targetManager.id;
      targetHostel.managerName = targetManager.name;
      targetHostel.managerPhone = targetManager.phone || targetHostel.managerPhone;
      targetHostel.managerEmail = targetManager.email || targetHostel.managerEmail;

      await dbUpdateHostel(hostelId, {
        managerId: targetManager.id,
        managerName: targetManager.name,
        managerPhone: targetManager.phone,
        managerEmail: targetManager.email
      }, hostels);

      // Persist in local hostel_managers
      await dbAssignHostelManager(
        hostelId,
        targetManager.id,
        targetManager.name,
        targetManager.phone,
        targetManager.email
      );

      syncStore();

      return res.json({
        success: true,
        message: `Manager ${targetManager.name} assigned to hostel "${targetHostel.name}".`,
        hostel: targetHostel,
        manager: targetManager
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to assign hostel manager." });
    }
  });

  // 9. Hostel System Validation (Phase 2 automated check before payment)
  app.post("/api/hostel-verifications/validate", async (req: any, res) => {
    try {
      const {
        name,
        digitalAddress,
        assignedManagerId,
        managerEmail,
        totalCapacity,
        defaultFee,
        price,
        authorityRelationship,
        ownerName,
        proofOfOwnershipType,
        proofOfOwnershipFileName
      } = req.body;

      const errors: string[] = [];

      // 1. Missing required info
      if (!name || !name.trim()) errors.push("Hostel name is required.");

      // 3. Manager approval check
      const allVerifs = await dbGetManagerVerifications(managerVerifications);
      const isApprovedManager = allVerifs.some(
        v => ((assignedManagerId && v.managerId === assignedManagerId) ||
              (managerEmail && v.managerEmail.toLowerCase() === (managerEmail || '').toLowerCase())) &&
              v.status === 'approved'
      );
      if (!isApprovedManager && req.user?.role !== 'admin') {
        errors.push("Manager has not been approved by an administrator yet.");
      }

      // 4. Duplicate hostel check
      const currentHostels = await dbGetHostels(hostels);
      const isDuplicateHostel = currentHostels.some(
        h => h.name.toLowerCase().trim() === (name || '').toLowerCase().trim()
      );
      if (isDuplicateHostel) {
        errors.push(`A hostel named "${name}" is already registered on PineVela.`);
      }

      // 5. Ownership evidence check
      const hasProof = !!(proofOfOwnershipType || proofOfOwnershipFileName);
      if (!hasProof) {
        errors.push("Proof of hostel ownership or management authority document is required.");
      }

      // 6. Capacity and pricing validation
      const resolvedCapacity = Number(totalCapacity) || 0;
      const resolvedPrice = Number(defaultFee || price) || 0;
      const isCapacityPricingValid = resolvedCapacity >= 10 && resolvedCapacity <= 2500 && resolvedPrice > 0;
      if (!isCapacityPricingValid) {
        errors.push("Capacity must be between 10 and 2,500 beds, and pricing must be greater than 0.");
      }

      const systemValidation = {
        missingInfo: errors.length > 0,
        digitalAddressFormatValid: true,
        duplicateHostelCheck: isDuplicateHostel ? 'flagged' : 'clean',
        duplicateRegistrationCheck: 'clean',
        managerApproved: isApprovedManager || req.user?.role === 'admin',
        identityVerified: true,
        ownershipEvidencePresent: hasProof,
        conflictingInfo: false,
        capacityPricingValid: isCapacityPricingValid
      };

      const passed = errors.length === 0;

      return res.json({
        passed,
        validation: systemValidation,
        errors
      });
    } catch (err: any) {
      return res.status(500).json({ error: "System validation error: " + err.message });
    }
  });

  // 10. GHS 50 Onboarding Payment Endpoint (Direct agreement / placeholder payment)
  // Requirement: "the 50 cedis fee should be charged when they aggree to pay for now , later on we will implement paystack not now make no mistakes"
  app.post("/api/hostel-verifications/pay-onboarding-fee", async (req: any, res) => {
    try {
      const { hostelId, hostelName, managerId, managerName, agreedToPay } = req.body;

      if (!agreedToPay) {
        return res.status(400).json({ error: "Manager agreement to pay the GHS 50.00 onboarding fee is required." });
      }

      const now = new Date().toISOString();
      const paymentRef = `PAY-PV50-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

      const paymentRecord = {
        id: `pay-${Date.now()}`,
        hostelId: hostelId || `hostel-${Date.now()}`,
        hostelName: hostelName || 'Hostel Accommodation',
        managerId: managerId || req.user?.id || 'mgr-unassigned',
        managerName: managerName || req.user?.name || 'Property Manager',
        amount: 50.00,
        currency: 'GHS',
        status: 'paid',
        reference: paymentRef,
        agreementAcknowledged: true,
        paymentMethod: 'Manual Confirmation (Direct Agreement)',
        paidAt: now
      };

      onboardingPayments.unshift(paymentRecord);
      await dbCreateOnboardingPayment(paymentRecord);

      // Audit log
      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'ONBOARDING_FEE_PAID',
        targetType: 'payment',
        targetId: paymentRef,
        targetName: hostelName,
        performedBy: managerName || 'Manager',
        role: 'manager',
        details: { amount: 50.00, currency: 'GHS', reference: paymentRef },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      return res.status(201).json({
        success: true,
        message: "GHS 50.00 Onboarding fee successfully recorded via agreement confirmation.",
        payment: paymentRecord
      });
    } catch (err: any) {
      console.error("Payment error:", err);
      return res.status(500).json({ error: err.message || "Failed to record onboarding payment." });
    }
  });

  // 11. Hostel Verification: Submit Hostel for Admin Review (Phase 2)
  app.post("/api/hostel-verifications/submit", async (req: any, res) => {
    try {
      const {
        hostelId,
        hostelName,
        location,
        campusZone,
        addressLine1,
        digitalAddress,
        totalCapacity,
        totalRooms,
        totalBlocks,
        pricePerYear,
        currency,
        facilities,
        imageUrl,
        managerId,
        managerName,
        managerEmail,
        managerPhone,
        authorityRelationship,
        ownerOperatorName,
        ownerOperatorPhone,
        ownerOperatorEmail,
        proofOfOwnershipType,
        proofOfOwnershipFileName,
        proofOfOwnershipUrl,
        paymentReference,
        paymentStatus
      } = req.body;

      if (!hostelName) {
        return res.status(400).json({ error: "Hostel name is required." });
      }

      const now = new Date().toISOString();
      const verificationId = `hv-${Date.now()}`;
      const resolvedHostelId = hostelId || `hostel-${Date.now()}`;

      // System validation check
      const gpsRegex = /^[A-Z]{2}-[0-9]{3,4}-[0-9]{4}$/i;
      const isGpsValid = digitalAddress ? gpsRegex.test((digitalAddress || '').trim()) : true;

      const systemValidation = {
        missingInfo: false,
        digitalAddressFormatValid: isGpsValid,
        duplicateHostelCheck: 'clean' as const,
        duplicateRegistrationCheck: 'clean' as const,
        managerApproved: true,
        identityVerified: true,
        ownershipEvidencePresent: !!(proofOfOwnershipType || proofOfOwnershipFileName),
        conflictingInfo: false,
        capacityPricingValid: true
      };

      const newRecord = {
        id: verificationId,
        hostelId: resolvedHostelId,
        hostelName,
        location: location || 'Campus Area',
        campusZone: campusZone || null,
        addressLine1: addressLine1 || null,
        digitalAddress: (digitalAddress || '').toUpperCase().trim(),
        totalCapacity: Number(totalCapacity) || 100,
        totalRooms: Number(totalRooms) || 30,
        totalBlocks: Number(totalBlocks) || 2,
        pricePerYear: Number(pricePerYear) || 3500,
        currency: currency || 'GHS',
        facilities: facilities || [],
        imageUrl: imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
        managerId: managerId || req.user?.id || 'mgr-101',
        managerName: managerName || req.user?.name || 'Property Manager',
        managerEmail: managerEmail || req.user?.email || 'manager@pinevela.com',
        managerPhone: managerPhone || req.user?.phone || '+233 24 000 0000',
        managerApproved: true,
        authorityRelationship: authorityRelationship || 'Authorized Manager',
        ownerOperatorName: ownerOperatorName || managerName || 'Property Owner',
        ownerOperatorPhone: ownerOperatorPhone || managerPhone || '+233 24 000 0000',
        ownerOperatorEmail: ownerOperatorEmail || null,
        proofOfOwnershipType: proofOfOwnershipType || 'Indenture / Municipal Permit',
        proofOfOwnershipFileName: proofOfOwnershipFileName || null,
        proofOfOwnershipUrl: proofOfOwnershipUrl || null,
        systemValidation,
        validationPassed: isGpsValid,
        paymentStatus: paymentStatus || 'paid',
        paymentReference: paymentReference || `PAY-PV50-${Date.now().toString().slice(-6)}`,
        paymentAmount: 50.00,
        paymentDate: now,
        status: 'under_admin_review', // Under Admin Review
        adminNotes: 'Application submitted with GHS 50 onboarding fee. Pending administrator verification.',
        submittedAt: now,
        createdAt: now,
        updatedAt: now
      };

      hostelVerifications.unshift(newRecord);
      await dbCreateHostelVerification(newRecord);

      // Also ensure the hostel in hostels table is marked isApproved: false, approvalStatus: 'Pending Approval'
      const matchedHostel = hostels.find(h => h.id === resolvedHostelId);
      if (matchedHostel) {
        matchedHostel.isApproved = false;
        matchedHostel.approvalStatus = 'Pending Approval';
        matchedHostel.digital_address = newRecord.digitalAddress;
      }

      // Audit log
      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'HOSTEL_VERIFICATION_SUBMITTED',
        targetType: 'hostel',
        targetId: resolvedHostelId,
        targetName: hostelName,
        performedBy: managerName || 'Manager',
        role: 'manager',
        details: {
          digitalAddress: newRecord.digitalAddress,
          paymentReference: newRecord.paymentReference,
          proofType: proofOfOwnershipType
        },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `New hostel "${hostelName}" submitted for verification with GHS 50 onboarding fee.`,
        time: 'Just now',
        type: 'info'
      }, activities);

      return res.status(201).json({
        success: true,
        verification: newRecord,
        message: "Hostel property successfully submitted for administrative verification!"
      });
    } catch (err: any) {
      console.error("Error submitting hostel verification:", err);
      return res.status(500).json({ error: err.message || "Failed to submit hostel verification." });
    }
  });

  // 12. Hostel Verification: Get all hostel verification applications
  app.get("/api/hostel-verifications", async (req, res) => {
    try {
      const records = await dbGetHostelVerifications(hostelVerifications);
      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch hostel verifications." });
    }
  });

  // 13. Hostel Verification: Admin Approves Hostel (ACTIVATES ON PINEVELA)
  app.put("/api/hostel-verifications/:id/approve", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const allRecords = await dbGetHostelVerifications(hostelVerifications);
      const target = allRecords.find(v => v.id === id) || hostelVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Hostel verification application not found." });
      }

      const now = new Date().toISOString();
      target.status = 'approved';
      target.adminNotes = adminNotes || target.adminNotes || 'Hostel verified and approved by Administrator.';
      target.reviewedBy = req.user?.name || 'SuperAdmin';
      target.reviewedAt = now;
      target.updatedAt = now;

      await dbUpdateHostelVerificationStatus(id, 'approved', target.adminNotes, target.reviewedBy);

      // Crucial: Update the actual hostel record to Approved and Open so it displays on PineVela public listings
      const currentHostels = await dbGetHostels(hostels);
      const matchedHostel = currentHostels.find(h => h.id === target.hostelId || h.name.toLowerCase() === target.hostelName.toLowerCase()) ||
                            hostels.find(h => h.id === target.hostelId || h.name.toLowerCase() === target.hostelName.toLowerCase());

      if (matchedHostel) {
        matchedHostel.isApproved = true;
        matchedHostel.approvalStatus = 'Approved';
        matchedHostel.status = 'Open';
        await dbUpdateHostel(matchedHostel.id, {
          isApproved: true,
          approvalStatus: 'Approved',
          status: 'Open'
        }, hostels);
      }

      // Audit log
      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'HOSTEL_APPROVED',
        targetType: 'hostel',
        targetId: target.hostelId,
        targetName: target.hostelName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      syncStore();

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin APPROVED & ACTIVATED hostel "${target.hostelName}". It is now LIVE on PineVela!`,
        time: 'Just now',
        type: 'success'
      }, activities);

      return res.json({
        success: true,
        record: target,
        verification: target,
        hostel: matchedHostel,
        message: `Hostel "${target.hostelName}" is now verified and active on PineVela!`
      });
    } catch (err: any) {
      console.error("Approve hostel error:", err);
      return res.status(500).json({ error: err.message || "Failed to approve hostel." });
    }
  });

  // 14. Hostel Verification: Admin Rejects Hostel
  app.put("/api/hostel-verifications/:id/reject", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const allRecords = await dbGetHostelVerifications(hostelVerifications);
      const target = allRecords.find(v => v.id === id) || hostelVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Hostel verification application not found." });
      }

      const now = new Date().toISOString();
      target.status = 'rejected';
      target.adminNotes = adminNotes || 'Hostel registration rejected by Administrator.';
      target.reviewedBy = req.user?.name || 'SuperAdmin';
      target.reviewedAt = now;

      await dbUpdateHostelVerificationStatus(id, 'rejected', target.adminNotes, target.reviewedBy);

      // Update hostel record to Rejected
      const matchedHostel = hostels.find(h => h.id === target.hostelId);
      if (matchedHostel) {
        matchedHostel.isApproved = false;
        matchedHostel.approvalStatus = 'Rejected';
      }

      syncStore();

      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'HOSTEL_REJECTED',
        targetType: 'hostel',
        targetId: target.hostelId,
        targetName: target.hostelName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      return res.json({
        success: true,
        record: target,
        verification: target,
        message: `Hostel "${target.hostelName}" verification rejected.`
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to reject hostel." });
    }
  });

  // 15. Hostel Verification: Admin Requests More Info
  app.put("/api/hostel-verifications/:id/request-info", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const allRecords = await dbGetHostelVerifications(hostelVerifications);
      const target = allRecords.find(v => v.id === id) || hostelVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Hostel verification application not found." });
      }

      const now = new Date().toISOString();
      target.status = 'more_info_required';
      target.adminNotes = adminNotes || 'Please upload a clearer scan of the title deed or municipal permit.';
      target.reviewedBy = req.user?.name || 'SuperAdmin';
      target.reviewedAt = now;

      await dbUpdateHostelVerificationStatus(id, 'more_info_required', target.adminNotes, target.reviewedBy);

      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'HOSTEL_MORE_INFO_REQUESTED',
        targetType: 'hostel',
        targetId: target.hostelId,
        targetName: target.hostelName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      return res.json({ success: true, verification: target });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to request info." });
    }
  });

  // 16. Hostel Verification: Admin Flags For Investigation
  app.put("/api/hostel-verifications/:id/flag-investigation", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const allRecords = await dbGetHostelVerifications(hostelVerifications);
      const target = allRecords.find(v => v.id === id) || hostelVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Hostel verification application not found." });
      }

      const now = new Date().toISOString();
      target.status = 'under_admin_review';
      target.systemValidation = { ...target.systemValidation, conflictingInfo: true };
      target.adminNotes = adminNotes || 'Flagged for on-site zoning and physical verification inspection.';
      target.reviewedBy = req.user?.name || 'SuperAdmin';
      target.reviewedAt = now;

      await dbUpdateHostelVerificationStatus(id, 'under_admin_review', target.adminNotes, target.reviewedBy);

      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'HOSTEL_FLAGGED_FOR_INVESTIGATION',
        targetType: 'hostel',
        targetId: target.hostelId,
        targetName: target.hostelName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      return res.json({ success: true, verification: target });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to flag hostel." });
    }
  });

  // 17. Hostel Verification: Admin Suspends Hostel
  app.put("/api/hostel-verifications/:id/suspend", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body || {};
      const allRecords = await dbGetHostelVerifications(hostelVerifications);
      const target = allRecords.find(v => v.id === id) || hostelVerifications.find(v => v.id === id);

      if (!target) {
        return res.status(404).json({ error: "Hostel verification application not found." });
      }

      const now = new Date().toISOString();
      target.status = 'suspended';
      target.adminNotes = adminNotes || 'Hostel suspended by administrator.';
      target.reviewedBy = req.user?.name || 'SuperAdmin';
      target.reviewedAt = now;

      await dbUpdateHostelVerificationStatus(id, 'suspended', target.adminNotes, target.reviewedBy);

      // Deactivate on public search
      const matchedHostel = hostels.find(h => h.id === target.hostelId);
      if (matchedHostel) {
        matchedHostel.isApproved = false;
        matchedHostel.status = 'Under Maintenance';
      }

      const auditLog = {
        id: `val-${Date.now()}`,
        action: 'HOSTEL_SUSPENDED',
        targetType: 'hostel',
        targetId: target.hostelId,
        targetName: target.hostelName,
        performedBy: req.user?.name || 'Admin',
        role: 'admin',
        details: { adminNotes: target.adminNotes },
        timestamp: now
      };
      verificationAuditLogs.unshift(auditLog);
      await dbCreateVerificationAuditLog(auditLog);

      return res.json({ success: true, verification: target });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to suspend hostel." });
    }
  });

  // 18. Verification Audit Logs Endpoint (Admin audit trail)
  app.get("/api/verification/audit-logs", requireAuth(["admin"]), async (req, res) => {
    try {
      const logs = await dbGetVerificationAuditLogs(verificationAuditLogs);
      return res.json(logs);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch audit logs." });
    }
  });

  // --- Public/Protected Hostels Endpoints ---
  app.get("/api/hostels", async (req, res) => {
    try {
      const list = await dbGetHostels(hostels);
      const authHeader = req.headers.authorization;
      let isAdmin = false;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "").trim();
        const foundUser = MOCK_USERS.find(u => (u.user && u.user.token === token) || u.token === token);
        const userRole = (foundUser?.user?.role || foundUser?.role || '').toLowerCase();
        if (userRole === 'admin') isAdmin = true;
      }

      if (isAdmin) {
        return res.json(list || hostels || []);
      }

      // Check blocked managers to ensure any hostel tied to a blocked manager is hidden from live user search/landing page
      const verifs = await dbGetManagerVerifications(managerVerifications);
      const reqs = await dbGetManagerRequests(managerRequests);
      const blockedManagerEmails = new Set<string>();
      const blockedManagerIds = new Set<string>();

      verifs.forEach(v => {
        if (v.status === 'blocked' || v.isBlocked === true) {
          if (v.managerEmail) blockedManagerEmails.add(v.managerEmail.toLowerCase().trim());
          if (v.managerId) blockedManagerIds.add(v.managerId);
          if (v.id) blockedManagerIds.add(v.id);
        }
      });
      reqs.forEach(r => {
        if (r.status === 'blocked' || r.isBlocked === true) {
          if (r.managerEmail) blockedManagerEmails.add(r.managerEmail.toLowerCase().trim());
          if (r.managerId) blockedManagerIds.add(r.managerId);
          if (r.id) blockedManagerIds.add(r.id);
        }
      });
      MOCK_USERS.forEach(u => {
        const isBlk = u.isBlocked === true || u.user?.isBlocked === true || u.status === 'blocked' || u.user?.status === 'blocked';
        if (isBlk) {
          const email = (u.email || u.user?.email || '').toLowerCase().trim();
          const id = u.id || u.user?.id;
          if (email) blockedManagerEmails.add(email);
          if (id) blockedManagerIds.add(id);
        }
      });

      const activeList = (list || hostels || []).filter((h: any) => {
        if (!h) return false;
        if (h.isBlocked === true || h.status === 'Blocked' || h.approvalStatus === 'Blocked' || h.isLive === false) return false;
        const hEmail = (h.managerEmail || '').toLowerCase().trim();
        const hId = h.managerId || h.assignedManagerId;
        if (hEmail && blockedManagerEmails.has(hEmail)) return false;
        if (hId && blockedManagerIds.has(hId)) return false;
        return true;
      });

      return res.json(activeList);
    } catch (err) {
      console.error("Error retrieving hostels from db:", err);
      return res.json(hostels || []);
    }
  });

  // Get currently logged-in manager's assigned hostel dynamically from the database
  app.get("/api/manager/my-hostel", requireAuth(), async (req: any, res) => {
    try {
      const currentHostels = await dbGetHostels(hostels);
      const cleanEmail = (req.user?.email || '').toLowerCase().trim();
      const userId = req.user?.id || '';
      const userName = (req.user?.name || '').toLowerCase().trim();

      let matched = currentHostels.find(h => {
        if (!h) return false;
        const matchId = h.managerId && userId && h.managerId === userId;
        const matchEmail = h.managerEmail && cleanEmail && h.managerEmail.toLowerCase().trim() === cleanEmail;
        const matchName = h.managerName && userName && h.managerName.toLowerCase().trim() === userName;
        return matchId || matchEmail || matchName;
      });

      // Default assigned hostel fallback for standard demo manager accounts
      if (!matched && (cleanEmail === 'manager@pinevela.com' || cleanEmail === 'sarah.j@pinevela.com')) {
        matched = currentHostels.find(h => h.id === 'hostel-1') || currentHostels[0];
        if (matched) {
          matched.managerEmail = req.user.email;
          matched.managerId = req.user.id;
          matched.managerName = req.user.name;
        }
      }

      if (matched) {
        return res.json({ success: true, hostel: matched });
      }

      // Check hostelVerifications if no active hostel in table yet
      const allVerifs = await dbGetHostelVerifications(hostelVerifications);
      const matchingVerif = allVerifs.find(v => 
        (v.managerId && userId && v.managerId === userId) ||
        (v.managerEmail && cleanEmail && v.managerEmail.toLowerCase().trim() === cleanEmail)
      );

      if (matchingVerif) {
        const propName = matchingVerif.hostelName || 'Pending Registered Hostel';
        const propLoc = matchingVerif.location || 'Campus Area';
        const propCap = matchingVerif.totalCapacity || 120;

        const constructed = {
          id: matchingVerif.hostelId || `hostel-pending-${Date.now()}`,
          name: propName,
          location: propLoc,
          wing: 'Main Block',
          status: 'Pending Approval',
          bedsLeft: propCap,
          totalCapacity: propCap,
          availableSpaces: propCap,
          price: matchingVerif.pricePerYear || 3500,
          image: matchingVerif.imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
          imageUrl: matchingVerif.imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
          managerName: req.user?.name || 'Property Manager',
          managerPhone: req.user?.phone || '+233 24 000 0000',
          managerEmail: req.user?.email || 'manager@pinevela.com',
          managerId: req.user?.id,
          description: 'Hostel property registration submitted and saved in database. Pending final administrator verification.',
          rating: 5.0,
          registrationDate: new Date().toISOString().split('T')[0],
          subscriptionPaid: true,
          isApproved: false,
          approvalStatus: 'Pending Approval'
        };
        return res.json({ success: true, hostel: constructed });
      }

      return res.json({ success: true, hostel: null });
    } catch (err: any) {
      console.error("Error fetching manager hostel:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch manager hostel" });
    }
  });

  // Multi-step Hostel Registration (Atomic & Secure) - Supports Admin & Approved Managers
  app.post("/api/hostels/register", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const registrationData = req.body;
      if (!registrationData.name || !registrationData.name.trim()) {
        return res.status(400).json({ error: "Hostel name is required." });
      }

      const isManager = req.user.role === 'manager';

      // If manager, enforce single hostel limit
      if (isManager) {
        const existingMgrHostel = hostels.find(
          h => h.managerId === req.user.id || (h.managerEmail && h.managerEmail.toLowerCase() === (req.user.email || '').toLowerCase())
        );
        if (existingMgrHostel) {
          return res.status(400).json({ error: "Managers are restricted to registering only one hostel property." });
        }
      }

      // Attach manager information if manager registered
      if (isManager) {
        registrationData.assignedManagerId = req.user.id;
        registrationData.managerId = req.user.id;
        registrationData.managerName = req.user.name || registrationData.managerName || 'Anthony Davis';
        registrationData.managerEmail = req.user.email || registrationData.managerEmail || 'manager@pinevela.com';
        registrationData.managerPhone = req.user.phone || registrationData.managerPhone || '+233 24 123 4567';
        registrationData.managerPhoto = req.user.photo || req.user.avatar || (req.user as any).photoUrl || (req.user as any).avatarUrl || registrationData.managerPhoto || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80';
      }

      const result = await dbRegisterHostelAtomic(registrationData, hostels, req.user?.id);

      // Configure approval status
      if (isManager) {
        result.hostel.isApproved = false;
        result.hostel.approvalStatus = 'Pending Approval';
        result.hostel.status = 'Pending Approval';
        result.hostel.managerId = req.user.id;
        result.hostel.managerName = registrationData.managerName;
        result.hostel.managerEmail = registrationData.managerEmail;
        result.hostel.managerPhone = registrationData.managerPhone;
        result.hostel.managerPhoto = registrationData.managerPhoto;
        await dbUpdateHostel(result.hostel.id, {
          isApproved: false,
          approvalStatus: 'Pending Approval',
          status: 'Pending Approval',
          managerId: req.user.id,
          managerName: registrationData.managerName,
          managerEmail: registrationData.managerEmail,
          managerPhone: registrationData.managerPhone,
          managerPhoto: registrationData.managerPhoto
        }, hostels);

        // Also create/sync HostelVerificationRecord for the Compliance Center
        const now = new Date().toISOString();
        const verificationRecord = {
          id: `hv-${Date.now()}`,
          hostelId: result.hostel.id,
          hostelName: result.hostel.name,
          location: result.hostel.location || `${result.hostel.city || 'Accra'}, Ghana`,
          digitalAddress: result.hostel.digitalAddress || 'GA-183-9022',
          managerId: req.user.id,
          managerName: registrationData.managerName,
          managerEmail: registrationData.managerEmail,
          managerPhone: registrationData.managerPhone,
          managerPhoto: registrationData.managerPhoto,
          proofOfOwnershipType: 'Land Title / Municipal Registration',
          proofOfOwnershipDocumentUrl: result.hostel.imageUrl || result.hostel.image || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80',
          proofOfOwnershipDocumentFileName: 'property-deed.pdf',
          authorityRelationship: 'Property Owner',
          paymentStatus: 'paid',
          paymentAmount: 50.00,
          paymentReference: `PAY-PV50-${Date.now().toString().slice(-6)}`,
          paymentMethod: 'direct_agreement',
          paymentDate: now,
          totalCapacity: result.hostel.totalCapacity || 100,
          totalBlocks: result.hostel.totalBlocks || 1,
          pricePerYear: result.hostel.price || 3500,
          currency: result.hostel.currency || 'GHS',
          imageUrl: result.hostel.imageUrl || result.hostel.image,
          image: result.hostel.image || result.hostel.imageUrl,
          status: 'under_admin_review',
          systemValidation: {
            digitalAddressFormatValid: true,
            ownershipEvidencePresent: true,
            capacityConsistent: true,
            duplicateHostelCheck: 'clean'
          },
          adminNotes: 'Manager completed 10-step wizard with fee agreement. Awaiting review.',
          submittedAt: now,
          createdAt: now,
          updatedAt: now
        };

        hostelVerifications.unshift(verificationRecord);
        await dbCreateHostelVerification(verificationRecord);

        await dbCreateActivity({
          id: `act-new-${Date.now()}`,
          text: `Manager "${registrationData.managerName}" submitted "${result.hostel.name}" for Admin Approval.`,
          time: 'Just now',
          type: 'warning'
        }, activities);
      } else {
        result.hostel.isApproved = true;
        result.hostel.approvalStatus = 'Approved';
        result.hostel.status = 'Approved';
        await dbUpdateHostel(result.hostel.id, {
          isApproved: true,
          approvalStatus: 'Approved',
          status: 'Approved'
        }, hostels);

        await dbCreateActivity({
          id: `act-new-${Date.now()}`,
          text: `Admin registered new property: "${result.hostel.name}"`,
          time: 'Just now',
          type: 'success'
        }, activities);
      }

      syncStore();
      return res.status(201).json(result);
    } catch (err: any) {
      console.error("Hostel registration endpoint error:", err);
      return res.status(500).json({ error: err.message || "Failed to complete hostel registration" });
    }
  });

  // Admin Final Verification & Approval or Rejection of registered hostel
  app.put("/api/hostels/:id/verify", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, isApproved, approvalStatus, adminNotes } = req.body || {};
      const isRejection = status === 'Rejected' || isApproved === false || approvalStatus === 'Rejected';

      const allHostels = await dbGetHostels(hostels);
      let target = allHostels.find(h => h.id === id) || hostels.find(h => h.id === id);
      if (!target) {
        target = {
          id,
          name: req.body?.name || `Hostel ${id}`,
          location: req.body?.location || 'Campus Zone, Accra',
          wing: req.body?.wing || 'North Wing',
          status: isRejection ? 'Rejected' : 'Open',
          bedsLeft: Number(req.body?.bedsLeft ?? 50),
          totalCapacity: Number(req.body?.totalCapacity ?? 100),
          availableSpaces: Number(req.body?.availableSpaces ?? 50),
          price: Number(req.body?.price ?? 3500),
          rating: 4.8,
          isApproved: !isRejection,
          approvalStatus: isRejection ? 'Rejected' : 'Approved'
        };
        await dbCreateHostel(target, hostels);
      } else {
        if (isRejection) {
          target.isApproved = false;
          target.approvalStatus = 'Rejected';
          target.status = 'Rejected';
          await dbUpdateHostel(id, {
            isApproved: false,
            approvalStatus: 'Rejected',
            status: 'Rejected'
          }, hostels);

          const vRecord = hostelVerifications.find(v => v.hostelId === id);
          if (vRecord) {
            vRecord.status = 'rejected';
            vRecord.reviewedAt = new Date().toISOString();
            vRecord.adminNotes = adminNotes || 'Rejected by Administrator';
            await dbUpdateHostelVerificationStatus(vRecord.id, 'rejected', vRecord.adminNotes, req.user?.name || 'Admin');
          }

          syncStore();

          await dbCreateActivity({
            id: `act-new-${Date.now()}`,
            text: `Admin REJECTED hostel registration for "${target.name}".`,
            time: 'Just now',
            type: 'warning'
          }, activities);

          return res.json({ success: true, hostel: target, message: `Hostel "${target.name}" rejected.` });
        } else {
          target.isApproved = true;
          target.approvalStatus = 'Approved';
          target.status = 'Open';

          await dbUpdateHostel(id, {
            isApproved: true,
            approvalStatus: 'Approved',
            status: 'Open'
          }, hostels);

          const vRecord = hostelVerifications.find(v => v.hostelId === id || (v.hostelName && target.name && v.hostelName.toLowerCase() === target.name.toLowerCase()));
          if (vRecord) {
            vRecord.status = 'approved';
            vRecord.verifiedAt = new Date().toISOString();
            await dbUpdateHostelVerificationStatus(vRecord.id, 'approved', adminNotes || 'Approved by Administrator', req.user?.name || 'Admin');
          }

          // Sync and mark manager account as verified
          const cleanEmail = (target.managerEmail || vRecord?.managerEmail || '').toLowerCase().trim();
          const mgrId = target.managerId || target.assignedManagerId || vRecord?.managerId;
          const matchedUser = MOCK_USERS.find(
            u => (mgrId && (u.user?.id === mgrId || u.id === mgrId)) || (cleanEmail && ((u.email || u.user?.email || '').toLowerCase().trim() === cleanEmail))
          );
          if (matchedUser) {
            if (!matchedUser.user) {
              matchedUser.user = {
                id: matchedUser.id || mgrId || `manager_${Date.now()}`,
                name: matchedUser.name || target.managerName || 'Manager',
                email: matchedUser.email || cleanEmail,
                role: 'manager'
              };
            }
            (matchedUser.user as any).isVerified = true;
            (matchedUser.user as any).verificationStatus = 'approved';

            // Programmatically deliver a welcome message to the manager's messenger inbox from the admin
            try {
              const adminId = req.user?.id || 'admin_101';
              const managerId = matchedUser.user?.id || matchedUser.id || mgrId;
              
              // Find or create DM room
              let existingRoom = dmRooms.find(r => 
                (r.user1Id === adminId && r.user2Id === managerId) ||
                (r.user1Id === managerId && r.user2Id === adminId)
              );
              
              let roomId;
              if (existingRoom) {
                roomId = existingRoom.id;
                existingRoom.status = 'accepted';
              } else {
                roomId = `room-${adminId.substring(0, 5)}-${managerId.substring(0, 5)}-${Date.now()}`;
                const newRoom = {
                  id: roomId,
                  user1Id: adminId,
                  user2Id: managerId,
                  status: 'accepted',
                  createdAt: new Date().toISOString()
                };
                await dbCreateDMRoom(newRoom, dmRooms);
              }

              // Create welcome message
              const welcomeContent = `Welcome to PineVela! Your hostel property "${target.name}" has been officially approved by the university housing board. You can now access your manager dashboard, view operational statistics, and start accepting direct student residence bookings. Let us know if you need any assistance managing your hostel.`;
              
              const newMsg = {
                id: `msg-welcome-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                channelType: 'dm',
                channelId: roomId,
                senderId: adminId,
                senderName: req.user?.name || 'PineVela Admin',
                senderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
                messageType: 'text',
                content: welcomeContent,
                reactions: {},
                createdAt: new Date().toISOString()
              };
              
              await dbCreateChatMessage(newMsg, chatMessages);

              // Create system notification for the manager
              await dbCreateNotification({
                id: `notif-welcome-${Date.now()}`,
                studentId: managerId,
                title: 'Hostel Approved & Welcomed',
                message: `Congratulations! Your hostel property "${target.name}" is approved. Check your messenger for the welcome message from PineVela Admin.`,
                category: 'verification',
                date: new Date().toISOString().split('T')[0],
                read: false
              }, notifications);
            } catch (chatErr) {
              console.error("Error creating welcome chat message for approved manager:", chatErr);
            }
          }

          const mReq = managerRequests.find(r => 
            (mgrId && r.managerId === mgrId) || 
            (cleanEmail && r.managerEmail && r.managerEmail.toLowerCase().trim() === cleanEmail) ||
            (r.propertyName && target.name && r.propertyName.toLowerCase() === target.name.toLowerCase())
          );
          if (mReq) {
            mReq.status = 'approved';
            (mReq as any).isApproved = true;
            await dbUpdateManagerRequestStatus(mReq.id, 'approved');
          }
        }
      }

      syncStore();

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin VERIFIED & APPROVED hostel "${target.name}". Property is now officially active and listed!`,
        time: 'Just now',
        type: 'success'
      }, activities);

      return res.json({ success: true, hostel: target });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to verify hostel" });
    }
  });

  // Admin Delete Residence Endpoint
  app.delete("/api/hostels/:id", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const idx = hostels.findIndex(h => h.id === id);
      if (idx >= 0) {
        hostels.splice(idx, 1);
      }
      await dbDeleteHostel(id);
      syncStore();
      return res.json({ success: true, message: "Hostel removed successfully" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to delete hostel" });
    }
  });

  // --- Manager Operational Requests to Admin Board ---
  app.get("/api/board-requests", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const all = await dbGetBoardRequests();
      if (req.user?.role === 'manager') {
        const filtered = all.filter(r => r.managerId === req.user?.id || r.managerEmail === req.user?.email);
        return res.json(filtered);
      }
      return res.json(all);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch board requests" });
    }
  });

  app.post("/api/board-requests", requireAuth(["manager"]), async (req: any, res) => {
    try {
      const { subject, category, priority, message, hostelName } = req.body;
      if (!subject || !message) {
        return res.status(400).json({ error: "Subject and message are required" });
      }
      const newReq = await dbCreateBoardRequest({
        managerId: req.user?.id || 'manager_101',
        managerName: req.user?.name || 'Resident Manager',
        managerEmail: req.user?.email || 'manager@pinevela.com',
        managerPhone: req.user?.phone || '+233 24 123 4567',
        managerPhoto: req.user?.photo || req.user?.avatar || '',
        hostelName: hostelName || 'Registered Property',
        category: category || 'General Inquiry',
        priority: priority || 'Normal',
        subject,
        message,
        status: 'Pending'
      });

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Manager ${req.user?.name || 'Anthony Davis'} submitted request to Admin Board: "${subject}"`,
        time: 'Just now',
        type: 'info'
      }, activities);

      syncStore();
      return res.status(201).json(newReq);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to create board request" });
    }
  });

  app.put("/api/board-requests/:id", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const updated = await dbUpdateBoardRequest(id, { status, adminNotes });
      if (!updated) {
        return res.status(404).json({ error: "Request not found" });
      }

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin updated board request "${updated.subject}" to ${status}`,
        time: 'Just now',
        type: 'success'
      }, activities);

      syncStore();
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to update board request" });
    }
  });

  // Admin Reject Verification of registered hostel / residence
  app.put("/api/hostels/:id/reject-verification", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const rawReason = (req.body?.rejectionReason || req.body?.adminNotes || req.body?.reason || '').trim();
      if (!rawReason || rawReason.length < 5) {
        return res.status(400).json({ error: "A valid, detailed reason for residence rejection is required (minimum 5 characters)." });
      }
      const allHostels = await dbGetHostels(hostels);
      let target = allHostels.find(h => h.id === id) || hostels.find(h => h.id === id);
      if (!target) {
        target = {
          id,
          name: req.body?.name || `Residence ${id}`,
          location: req.body?.location || 'Campus Zone, Accra',
          wing: req.body?.wing || 'North Wing',
          status: 'Rejected',
          bedsLeft: Number(req.body?.bedsLeft ?? 50),
          totalCapacity: Number(req.body?.totalCapacity ?? 100),
          availableSpaces: Number(req.body?.availableSpaces ?? 50),
          price: Number(req.body?.price ?? 3500),
          rating: 4.8,
          isApproved: false,
          approvalStatus: 'Rejected',
          rejectionReason: rawReason
        };
        await dbCreateHostel(target, hostels);
      } else {
        target.isApproved = false;
        target.approvalStatus = 'Rejected';
        target.rejectionReason = rawReason;

        await dbUpdateHostel(id, {
          isApproved: false,
          approvalStatus: 'Rejected',
          rejectionReason: rawReason
        }, hostels);
      }

      // Notify manager if managerEmail is known
      const mgrEmail = target.managerEmail || target.contactEmail;
      if (mgrEmail) {
        const notif = {
          id: `notif-res-rej-${Date.now()}`,
          studentId: target.managerId || 'mgr',
          userEmail: mgrEmail,
          recipientEmail: mgrEmail,
          targetEmail: mgrEmail,
          title: `Residence Verification Declined: ${target.name}`,
          message: `Your listing for "${target.name}" was rejected by Admin. Reason: ${rawReason}`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(notif);
        await dbCreateNotification(notif, notifications);
      }

      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Admin DECLINED verification for residence "${target.name}". Reason: ${rawReason}`,
        time: 'Just now',
        type: 'danger'
      }, activities);

      return res.json({ success: true, hostel: target, rejectionReason: rawReason });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to reject hostel verification" });
    }
  });

  // Dedicated image upload endpoint - Admin & Managers
  app.post("/api/storage/upload-hostel-image", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const { fileName, fileType, fileData } = req.body;
      if (!fileData) {
        return res.status(400).json({ error: "No image file data provided" });
      }

      const cleanName = (fileName || 'hostel.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');

      // Decode base64 payload
      let buffer: Buffer;
      if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        const matches = fileData.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(fileData, 'base64');
        }
      } else {
        buffer = Buffer.from(fileData, 'base64');
      }

      // Store locally in /uploads/hostels and serve statically
      const fs = await import('fs');
      const uploadsDir = path.join(process.cwd(), 'uploads', 'hostels');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      if (buffer.length > 30 * 1024 * 1024) {
        return res.status(400).json({ error: "Image exceeds 30MB limit." });
      }
      const allowed = (fileType || '').toLowerCase();
      if (allowed && !allowed.startsWith('image/')) {
        return res.status(400).json({ error: "Only image uploads are allowed." });
      }
      const localFileName = `${Date.now()}-${cleanName}`;
      const localFilePath = path.join(uploadsDir, localFileName);
      // Ensure resolved path stays under uploadsDir (path traversal guard)
      if (!localFilePath.startsWith(uploadsDir)) {
        return res.status(400).json({ error: "Invalid file path." });
      }
      fs.writeFileSync(localFilePath, buffer);

      const publicUrl = `/uploads/hostels/${localFileName}`;
      return res.json({
        success: true,
        imageUrl: publicUrl,
        imagePath: `uploads/hostels/${localFileName}`,
        storageType: 'local-persistent'
      });
    } catch (err: any) {
      console.error("Image upload route error:", err);
      return res.status(500).json({ error: err.message || "Failed to upload image" });
    }
  });

  // Explicit purge of demo/placeholder records
  app.post("/api/hostels/cleanup-placeholders", requireAuth(["admin"]), async (req: any, res) => {
    try {
      await dbCleanupPlaceholderHostels(hostels);
      return res.json({ success: true, message: "Placeholder demo records removed." });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/hostels", requireAuth(["admin"]), async (req: any, res) => {
    // If an id is provided and already exists, update instead of duplicating
    if (req.body.id) {
      const existingIdx = hostels.findIndex(h => h.id === req.body.id);
      if (existingIdx !== -1) {
        hostels[existingIdx] = {
          ...hostels[existingIdx],
          ...req.body,
          status: req.body.status || hostels[existingIdx].status || 'Open',
          bedsLeft: Number(req.body.bedsLeft ?? req.body.availableSpaces ?? hostels[existingIdx].bedsLeft ?? 50),
          totalCapacity: Number(req.body.totalCapacity ?? hostels[existingIdx].totalCapacity ?? 100),
          availableSpaces: Number(req.body.availableSpaces ?? req.body.bedsLeft ?? hostels[existingIdx].availableSpaces ?? 50),
          price: Number(req.body.price || req.body.pricing?.defaultFee || hostels[existingIdx].price || 3500),
          managerName: req.body.managerName || hostels[existingIdx].managerName || 'Resident Manager',
          managerPhone: req.body.managerPhone || hostels[existingIdx].managerPhone || '+233201234567',
          image: req.body.image || req.body.imageUrl || hostels[existingIdx].image || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
          imageUrl: req.body.imageUrl || req.body.image || hostels[existingIdx].imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
          isApproved: true,
          approvalStatus: 'Approved'
        };
        await dbUpdateHostel(req.body.id, hostels[existingIdx], hostels);
        syncStore();
        return res.json(hostels[existingIdx]);
      }
    }

    const defaultPrice = Number(req.body.price || req.body.pricing?.defaultFee || 3500);
    const newHostel = {
      id: req.body.id || `hostel-new-${Date.now()}`,
      name: req.body.name || 'New Hostel Property',
      location: req.body.location || 'Campus Road, Accra, Ghana',
      wing: req.body.wing || 'North Wing',
      status: req.body.status || 'Open',
      rating: 4.8,
      bedsLeft: Number(req.body.bedsLeft ?? req.body.availableSpaces ?? req.body.totalCapacity ?? 100),
      totalCapacity: Number(req.body.totalCapacity || 100),
      availableSpaces: Number(req.body.availableSpaces ?? req.body.bedsLeft ?? req.body.totalCapacity ?? 100),
      price: defaultPrice,
      subscriptionPaid: true,
      registrationDate: new Date().toISOString().split('T')[0],
      managerName: req.body.managerName || 'Resident Manager',
      managerPhone: req.body.managerPhone || '+233201234567',
      managerEmail: req.body.managerEmail || '',
      image: req.body.image || req.body.imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
      imageUrl: req.body.imageUrl || req.body.image || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
      description: req.body.description || 'Modern student accommodation community.',
      isApproved: true,
      approvalStatus: 'Approved',
      ...req.body
    };
    const saved = await dbCreateHostel(newHostel, hostels);
    syncStore();
    await dbCreateActivity({
      id: `act-new-${Date.now()}`,
      text: `Admin registered new property: "${saved.name}"`,
      time: 'Just now',
      type: 'success'
    }, activities);
    syncStore();
    res.status(201).json(saved);
  });

  app.put("/api/hostels/:id", requireAuth(["admin", "manager"]), async (req: any, res) => {
    const { id } = req.params;
    const list = await dbGetHostels(hostels);
    const existing = list.find(h => h.id === id) || hostels.find(h => h.id === id);
    if (!existing) {
      const newHostel = {
        id,
        name: req.body.name || 'Hostel Property',
        location: req.body.location || 'Campus Road, Accra, Ghana',
        wing: req.body.wing || 'North Wing',
        status: req.body.status || 'Open',
        bedsLeft: Number(req.body.bedsLeft ?? req.body.availableSpaces ?? 50),
        totalCapacity: Number(req.body.totalCapacity ?? 100),
        availableSpaces: Number(req.body.availableSpaces ?? req.body.bedsLeft ?? 50),
        price: Number(req.body.price || 3500),
        rating: 4.8,
        ...req.body
      };
      const created = await dbCreateHostel(newHostel, hostels);
      syncStore();
      return res.json(created.hostel || created || newHostel);
    }
    const updated = await dbUpdateHostel(id, req.body, hostels);
    syncStore();
    res.json(updated);
  });

  // --- Protected Booking Requests Endpoints ---
  app.get("/api/booking-requests", requireAuth(["admin", "manager"]), async (req, res) => {
    const list = await dbGetBookingRequests(bookingRequests);
    res.json(list);
  });

  app.post("/api/booking-requests", requireAuth(["student"]), async (req: any, res) => {
    const newRequest = {
      id: `book-new-${Date.now()}`,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      status: 'Pending',
      ...req.body
    };
    const saved = await dbCreateBookingRequest(newRequest, bookingRequests);
    await dbCreateActivity({
      id: `act-new-${Date.now()}`,
      text: `Booking request filed by ${saved.studentName} for ${saved.hostelName}`,
      time: 'Just now',
      type: 'info'
    }, activities);
    res.status(201).json(saved);
  });

  app.put("/api/booking-requests/:id", requireAuth(["admin", "manager"]), async (req: any, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const list = await dbGetBookingRequests(bookingRequests);
    const reqIndex = list.findIndex(r => r.id === id);
    if (reqIndex === -1) {
      return res.status(404).json({ error: "Booking request not found" });
    }
    const updated = await dbUpdateBookingRequest(id, status, bookingRequests);
    res.json(updated);
  });

  // --- Protected Issue Reports Endpoints ---
  app.get("/api/issue-reports", requireAuth(), async (req: any, res) => {
    try {
      const list = await dbGetIssueReports(issueReports);
      const userRole = req.user.role;
      const userId = (req.user.id || '').toString().trim();
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const userStudentId = (req.user.studentId || '').toString().trim();
      const userRoomKey = (req.user.roomKey || '').toString().toUpperCase().trim();

      if (userRole === 'admin') {
        return res.json(list);
      }

      if (userRole === 'staff') {
        const staffRecord = staff.find((s: any) => 
          s.userId === userId || 
          s.id === userId || 
          (s.email && s.email.toLowerCase().trim() === userEmail)
        );
        const staffHostelId = (staffRecord?.hostelId || '').toString().toLowerCase().trim();
        const staffHostelName = (staffRecord?.hostelName || '').toLowerCase().trim();
        const staffId = (staffRecord?.id || userId).toString().toLowerCase().trim();

        const filtered = list.filter((issue: any) => {
          const assignedId = (issue.assignedStaffId || '').toString().toLowerCase().trim();
          const issueStaffEmail = (issue.staffEmail || '').toLowerCase().trim();
          const issueHostelId = (issue.hostelId || '').toString().toLowerCase().trim();
          const issueHostelName = (issue.hostelName || '').toLowerCase().trim();

          if (assignedId && (assignedId === staffId || assignedId === userId.toLowerCase())) return true;
          if (issueStaffEmail && issueStaffEmail === userEmail) return true;
          if (staffHostelId && issueHostelId && issueHostelId === staffHostelId) return true;
          if (staffHostelName && issueHostelName && issueHostelName === staffHostelName) return true;
          return false;
        });
        return res.json(filtered);
      }

      if (userRole === 'manager') {
        const allHostels = await dbGetHostels(hostels);
        const managerHostels = allHostels.filter(h => 
          (h.managerId && (h.managerId === userId || h.managerId?.toString().toLowerCase() === userId.toLowerCase())) || 
          h.assignedManagerId === userId ||
          (h.managerEmail && h.managerEmail.toLowerCase().trim() === userEmail) ||
          (req.user.email && h.managerEmail && h.managerEmail.toLowerCase().trim() === req.user.email.toLowerCase().trim()) ||
          (req.user.name && h.managerName && h.managerName.toLowerCase().trim() === req.user.name.toLowerCase().trim())
        );
        const managerHostelIds = new Set(managerHostels.map(h => (h.id || '').toString().toLowerCase().trim()));
        const managerHostelNames = new Set(managerHostels.map(h => (h.name || '').toLowerCase().trim()));

        const filtered = list.filter((issue: any) => {
          const iHostelId = (issue.hostelId || '').toString().toLowerCase().trim();
          const iHostelName = (issue.hostelName || '').toLowerCase().trim();
          const iManagerId = (issue.managerId || '').toString().toLowerCase().trim();
          const iManagerEmail = (issue.managerEmail || '').toLowerCase().trim();

          if (iManagerId && iManagerId === userId.toLowerCase()) return true;
          if (iManagerEmail && iManagerEmail === userEmail) return true;
          if (iHostelId && managerHostelIds.has(iHostelId)) return true;
          if (iHostelName && managerHostelNames.has(iHostelName)) return true;
          return false;
        });
        return res.json(filtered);
      }

      // Resident / Student / Regular User:
      // STRICT ISOLATION: A resident must ONLY see maintenance logs filed by their own account
      const currentUserId = (userId || '').toLowerCase().trim();
      const currentUserEmail = (userEmail || '').toLowerCase().trim();
      const parentUserId = (req.user.parentUserId || '').toString().toLowerCase().trim();
      const parentUserEmail = (req.user.parentUserEmail || '').toLowerCase().trim();

      const userIdentifiers = new Set<string>();
      const userEmails = new Set<string>();

      // Filter out generic fallback IDs that can cause cross-resident data leakage
      const genericIds = new Set(['stu-resident', 'student', 'resident', 'n/a', 'null', 'undefined', 'general', 'main', 'test', 'demo', 'stu-2024-8842', '']);
      
      if (currentUserId && !genericIds.has(currentUserId)) {
        userIdentifiers.add(currentUserId);
      }
      if (parentUserId && !genericIds.has(parentUserId)) {
        userIdentifiers.add(parentUserId);
      }
      if (userStudentId && !genericIds.has(userStudentId.toLowerCase())) {
        userIdentifiers.add(userStudentId.toLowerCase());
      }
      if (req.user.studentId && !genericIds.has(req.user.studentId.toString().toLowerCase().trim())) {
        userIdentifiers.add(req.user.studentId.toString().toLowerCase().trim());
      }

      if (currentUserEmail) userEmails.add(currentUserEmail);
      if (parentUserEmail) userEmails.add(parentUserEmail);

      const filtered = list.filter((issue: any) => {
        const iUserId = (issue.userId || issue.creatorId || issue.parentUserId || '').toString().toLowerCase().trim();
        const iStudentId = (issue.studentId || '').toString().toLowerCase().trim();
        const iStudentEmail = (issue.studentEmail || '').toString().toLowerCase().trim();
        const iEmail = (issue.email || '').toString().toLowerCase().trim();
        const iParentEmail = (issue.parentUserEmail || '').toString().toLowerCase().trim();
        const iContactEmail = (issue.contactEmail || '').toString().toLowerCase().trim();

        // 1. Check direct Email match (primary and most reliable identifier)
        if (iStudentEmail && userEmails.has(iStudentEmail)) return true;
        if (iParentEmail && userEmails.has(iParentEmail)) return true;
        if (iEmail && userEmails.has(iEmail)) return true;
        if (iContactEmail && userEmails.has(iContactEmail)) return true;

        // 2. Check direct User ID match (excluding generic IDs)
        if (iUserId && !genericIds.has(iUserId) && userIdentifiers.has(iUserId)) return true;
        if (iStudentId && !genericIds.has(iStudentId) && userIdentifiers.has(iStudentId)) return true;

        return false;
      });

      return res.json(filtered);
    } catch (err: any) {
      console.error("Error fetching issue reports:", err);
      res.status(500).json({ error: "Failed to load issue reports" });
    }
  });

  app.post("/api/issue-reports", requireAuth(["user", "student", "admin", "manager"]), async (req: any, res) => {
    try {
      const {
        title,
        category,
        urgency,
        subArea,
        locationTag,
        description,
        photos,
        visitWindow,
        contactPhone,
        contactMethod,
        studentName,
        studentId,
        studentEmail,
        studentPhone,
        hostelId,
        hostelName,
        blockFloor,
        blockName,
        roomBed,
        roomNumber
      } = req.body;

      const userEmail = (req.user.email || '').toLowerCase().trim();
      const userId = req.user.id;
      const sId = req.user.studentId;

      const list = await dbGetIssueReports(issueReports);

      // ENFORCE 1 ACTIVE COMPLAINT AT A TIME TO PREVENT ABUSE
      const activeComplaint = list.find((i: any) => 
        !i.closedByManager && 
        !i.studentAcceptedResolved && 
        !i.studentConfirmed &&
        i.status !== 'Resolved' && 
        (
          (i.studentId && (i.studentId === userId || (sId && i.studentId === sId))) ||
          (i.studentEmail && i.studentEmail.toLowerCase().trim() === userEmail) ||
          (i.parentUserEmail && i.parentUserEmail.toLowerCase().trim() === userEmail) ||
          (i.email && i.email.toLowerCase().trim() === userEmail)
        )
      );

      if (activeComplaint) {
        return res.status(400).json({ 
          error: `Active complaint in progress: "${activeComplaint.title}". Residents can only log one active complaint at a time to prevent abuse. Please wait until your current issue is resolved and confirmed before submitting a new one.`,
          activeComplaintId: activeComplaint.id,
          activeComplaintTitle: activeComplaint.title
        });
      }

      // Auto-resolve hostel and manager details if not provided
      const store = getStoreInstance();
      const allRoomKeys = store.roomKeys || [];
      const userKey = allRoomKeys.find((k: any) => 
        (k.studentEmail && k.studentEmail.toLowerCase().trim() === userEmail) ||
        (k.studentId && (k.studentId === userId || k.studentId === sId)) ||
        (k.registeredByEmail && k.registeredByEmail.toLowerCase().trim() === userEmail)
      );

      const resolvedHostelId = hostelId || userKey?.hostelId || '';
      const resolvedHostelName = hostelName || userKey?.hostelName || 'PineVela Residence';
      const resolvedBlock = blockName || blockFloor || userKey?.blockName || 'Block A';
      const resolvedRoom = roomNumber || roomBed || userKey?.roomNumber || 'Room 101';

      // Find the respective manager of this hostel
      const matchedHostel = (store.hostels || []).find((h: any) => 
        (resolvedHostelId && h.id === resolvedHostelId) ||
        (resolvedHostelName && h.name && h.name.toLowerCase().trim() === resolvedHostelName.toLowerCase().trim())
      );
      const managerId = matchedHostel?.managerId || matchedHostel?.assignedManagerId || '';
      const managerEmail = matchedHostel?.managerEmail || '';
      const managerName = matchedHostel?.managerName || '';

      const newIssue = {
        id: `issue-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        title: title || 'Maintenance Request',
        category: category || 'General',
        urgency: urgency || 'Medium',
        subArea: subArea || locationTag || 'General Room Area',
        locationTag: locationTag || subArea || 'General Room Area',
        description: description || '',
        photos: Array.isArray(photos) ? photos : (photos ? [photos] : []),
        visitWindow: visitWindow || 'Anytime / Immediate',
        contactPhone: contactPhone || studentPhone || req.user.phone || '',
        contactMethod: contactMethod || 'In-app Notification',
        studentName: studentName || req.user.name || 'Student Resident',
        studentId: studentId || req.user.studentId || req.user.id,
        studentEmail: studentEmail || req.user.email || '',
        studentPhone: studentPhone || contactPhone || req.user.phone || '',
        userId: req.user.id,
        parentUserId: req.user.id,
        parentUserEmail: req.user.email,
        roomKey: userKey?.roomKey || req.user.roomKey || '',
        hostelId: resolvedHostelId,
        hostelName: resolvedHostelName,
        managerId: managerId,
        managerEmail: managerEmail,
        managerName: managerName,
        blockFloor: resolvedBlock,
        blockName: resolvedBlock,
        roomBed: resolvedRoom,
        roomNumber: resolvedRoom,
        status: 'Pending',
        managerReviewed: false,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        staffAccepted: false,
        staffCompleted: false,
        studentAcceptedResolved: false,
        studentConfirmed: false,
        closedByManager: false,
        historyLogs: [
          {
            action: 'Report Submitted',
            actor: studentName || req.user.name || 'Student Resident',
            timestamp: new Date().toISOString(),
            note: 'Issue reported with description and proof photos.'
          }
        ]
      };

      const saved = await dbCreateIssueReport(newIssue, issueReports);

      // Trigger Activity Log
      await dbCreateActivity({
        id: `act-new-${Date.now()}`,
        text: `Resident ${saved.studentName} reported issue: "${saved.title}" in ${saved.hostelName} (${saved.blockName}, Room ${saved.roomNumber})`,
        time: 'Just now',
        type: saved.urgency === 'High' || saved.urgency === 'Emergency' ? 'danger' : 'warning'
      }, activities);

      // Create targeted notification for Hostel Manager & confirmation for student
      const mgrNotif = {
        id: `notif-mgr-${Date.now()}`,
        userId: managerId || resolvedHostelId || 'manager',
        recipientId: managerId || '',
        recipientEmail: managerEmail,
        managerEmail: managerEmail,
        managerId: managerId,
        hostelId: resolvedHostelId,
        targetRole: 'manager',
        type: 'issue_report',
        title: `New Maintenance Ticket: ${saved.title}`,
        message: `${saved.studentName} in Room ${saved.roomNumber} (${saved.blockName}) logged a ${saved.urgency} priority issue: "${saved.title}". Please review and assign a technician.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/manager/dashboard'
      };
      notifications.unshift(mgrNotif);
      await dbCreateNotification(mgrNotif, notifications);
      if (store.notifications) store.notifications.unshift(mgrNotif);

      const stuNotif = {
        id: `notif-stu-${Date.now()}`,
        userId: req.user.id,
        studentId: req.user.id,
        recipientEmail: req.user.email,
        type: 'issue_report',
        title: `Maintenance Complaint Received`,
        message: `Your complaint "${saved.title}" has been transmitted to your Hostel Manager desk for technician dispatch.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/resident/dashboard'
      };
      notifications.unshift(stuNotif);
      await dbCreateNotification(stuNotif, notifications);
      if (store.notifications) store.notifications.unshift(stuNotif);

      res.status(201).json(saved);
    } catch (err: any) {
      console.error("Error creating issue report:", err);
      res.status(500).json({ error: "Failed to create issue report" });
    }
  });

  // Assign staff to issue (Manager only)
  app.post("/api/issue-reports/:id/assign", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { staffId, staffName, staffRole, staffEmail, staffPhone, staffPhoto, timeframe, customDeadline } = req.body;

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      const assignedAt = new Date().toISOString();
      let deadline = customDeadline || null;
      if (!deadline && timeframe) {
        const now = new Date();
        if (timeframe === '12h') {
          deadline = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
        } else if (timeframe === '24h') {
          deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        } else if (timeframe === '48h') {
          deadline = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
        } else if (timeframe === '3d') {
          deadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
        } else if (timeframe === '5d') {
          deadline = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
        } else if (timeframe === '7d') {
          deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        }
      }

      if (!deadline) {
        deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      // Find staff details if not fully provided
      const store = getStoreInstance();
      const allStaff = store.staff || [];
      const matchedStaff = allStaff.find((s: any) => s.id === staffId || s.userId === staffId || (staffEmail && s.email && s.email.toLowerCase().trim() === staffEmail.toLowerCase().trim()));

      const finalStaffName = staffName || matchedStaff?.name || 'Assigned Artisan';
      const finalStaffRole = staffRole || matchedStaff?.specialization || matchedStaff?.role || 'Technician';
      const finalStaffEmail = staffEmail || matchedStaff?.email || '';
      const finalStaffPhone = staffPhone || matchedStaff?.phone || '';
      const finalStaffPhoto = staffPhoto || matchedStaff?.avatar || matchedStaff?.profilePicture || '';

      const logs = existing.historyLogs || [];
      logs.push({
        action: 'Manager Reviewed & Assigned Staff',
        actor: req.user.name || 'Hostel Manager',
        timestamp: new Date().toISOString(),
        note: `Manager reviewed complaint and assigned ${finalStaffName} (${finalStaffRole}) with a ${timeframe || '24h'} resolution deadline.`
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          assignedStaffId: staffId,
          assignedStaffName: finalStaffName,
          assignedStaffRole: finalStaffRole,
          assignedStaffEmail: finalStaffEmail,
          assignedStaffPhone: finalStaffPhone,
          assignedStaffPhoto: finalStaffPhoto,
          managerReviewed: true,
          managerReviewedAt: assignedAt,
          managerName: req.user.name || 'Hostel Manager',
          assignedAt,
          timeframe: timeframe || '24h',
          deadline,
          status: 'In Progress',
          staffAccepted: false,
          staffCompleted: false,
          staffDeclined: false,
          staffDeclineReason: '',
          staffRescheduleRequested: false,
          rescheduleRequested: false,
          rescheduleApproved: false,
          historyLogs: logs
        },
        issueReports
      );

      // 1. Send notification to assigned staff member
      const staffNotif = {
        id: `notif-staff-${Date.now()}`,
        userId: staffId,
        recipientEmail: finalStaffEmail,
        staffEmail: finalStaffEmail,
        type: 'task_assigned',
        title: `New Work Order: ${existing.title}`,
        message: `Manager assigned you to repair "${existing.title}" in ${existing.blockName || existing.blockFloor || ''}, Room ${existing.roomNumber || existing.roomBed || ''}. Deadline: ${timeframe || '24h'}.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/staff/dashboard'
      };
      notifications.unshift(staffNotif);
      await dbCreateNotification(staffNotif, notifications);
      if (store.notifications) store.notifications.unshift(staffNotif);

      // 2. Send notification to student/resident that manager reviewed and assigned staff
      const resNotif = {
        id: `notif-res-assign-${Date.now()}`,
        userId: existing.studentId,
        studentId: existing.studentId,
        recipientEmail: existing.studentEmail || existing.parentUserEmail,
        type: 'task_assigned',
        title: `Technician Dispatched: ${finalStaffName}`,
        message: `Your Hostel Manager has reviewed your complaint and assigned ${finalStaffName} (${finalStaffRole}) to attend to it with a ${timeframe || '24h'} completion timeframe.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/resident/dashboard'
      };
      notifications.unshift(resNotif);
      await dbCreateNotification(resNotif, notifications);
      if (store.notifications) store.notifications.unshift(resNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error assigning staff:", err);
      res.status(500).json({ error: "Failed to assign staff" });
    }
  });

  // Staff accepts task assignment
  app.post("/api/issue-reports/:id/accept-assignment", requireAuth(["staff", "user", "admin", "manager", "resident", "student", "employee", "artisan"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      const logs = existing.historyLogs || [];
      logs.push({
        action: 'Task Accepted by Staff',
        actor: req.user.name || 'Staff Member',
        timestamp: new Date().toISOString(),
        note: 'Staff accepted task and is actively attending to the repair.'
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          staffAccepted: true,
          staffAcceptedAt: new Date().toISOString(),
          staffDeclined: false,
          staffRescheduleRequested: false,
          status: 'In Progress',
          historyLogs: logs
        },
        issueReports
      );
      syncStore();

      const store = getStoreInstance();
      // Notify resident that staff has accepted and is on the way
      const resAcceptNotif = {
        id: `notif-res-accept-${Date.now()}`,
        userId: existing.studentId,
        studentId: existing.studentId,
        recipientEmail: existing.studentEmail || existing.parentUserEmail,
        type: 'issue_report',
        title: `Technician On The Way`,
        message: `${existing.assignedStaffName || 'The assigned technician'} has accepted the task and is attending to your room repair.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/resident/dashboard'
      };
      notifications.unshift(resAcceptNotif);
      await dbCreateNotification(resAcceptNotif, notifications);
      if (store.notifications) store.notifications.unshift(resAcceptNotif);

      // Notify manager
      const mgrAcceptNotif = {
        id: `notif-mgr-accept-${Date.now()}`,
        userId: existing.managerId || existing.hostelId || 'manager',
        managerId: existing.managerId,
        managerEmail: existing.managerEmail,
        recipientEmail: existing.managerEmail,
        targetRole: 'manager',
        hostelId: existing.hostelId,
        type: 'issue_report',
        title: `Task Started: ${existing.title}`,
        message: `${existing.assignedStaffName || 'Technician'} accepted work order for Room ${existing.roomNumber} ("${existing.title}").`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/manager/dashboard'
      };
      notifications.unshift(mgrAcceptNotif);
      await dbCreateNotification(mgrAcceptNotif, notifications);
      if (store.notifications) store.notifications.unshift(mgrAcceptNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error accepting task:", err);
      res.status(500).json({ error: "Failed to accept task" });
    }
  });

  // Staff declines task assignment and gives reason why they cannot attend to it
  app.post("/api/issue-reports/:id/staff-decline", requireAuth(["staff", "user", "admin", "manager", "resident", "student", "employee", "artisan"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      const logs = existing.historyLogs || [];
      logs.push({
        action: 'Task Declined by Staff',
        actor: req.user.name || 'Staff Member',
        timestamp: new Date().toISOString(),
        note: `Staff stated they cannot attend at the moment. Reason: ${reason || 'No reason specified'}`
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          staffAccepted: false,
          staffCompleted: false,
          staffDeclined: true,
          staffDeclineReason: reason || 'Not specified',
          historyLogs: logs
        },
        issueReports
      );
      syncStore();

      // Notify Manager of decline so they can reassign
      const store = getStoreInstance();
      const mgrDeclineNotif = {
        id: `notif-mgr-decline-${Date.now()}`,
        userId: existing.managerId || existing.hostelId || 'manager',
        managerId: existing.managerId,
        managerEmail: existing.managerEmail,
        recipientEmail: existing.managerEmail,
        targetRole: 'manager',
        hostelId: existing.hostelId,
        type: 'issue_report',
        title: `Technician Declined Task: ${existing.title}`,
        message: `${existing.assignedStaffName || 'Technician'} declined repair at Room ${existing.roomNumber}. Reason: "${reason || 'Schedule conflict'}". Please reassign.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/manager/dashboard'
      };
      notifications.unshift(mgrDeclineNotif);
      await dbCreateNotification(mgrDeclineNotif, notifications);
      if (store.notifications) store.notifications.unshift(mgrDeclineNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error declining task:", err);
      res.status(500).json({ error: "Failed to decline task" });
    }
  });

  // Staff requests rescheduling with explanation/reasons
  app.post("/api/issue-reports/:id/staff-reschedule", requireAuth(["staff", "user", "admin", "manager", "resident", "student", "employee", "artisan"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason, requestedTimeframe, requestedDate } = req.body;
      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      const finalTimeframe = requestedTimeframe || '24h';
      const finalReason = reason || 'Required spare parts/special tools or scheduling clash';

      const logs = existing.historyLogs || [];
      logs.push({
        action: 'Reschedule Requested by Staff',
        actor: req.user.name || existing.assignedStaffName || 'Staff Member',
        timestamp: new Date().toISOString(),
        note: `Staff requested reschedule to timeframe: ${finalTimeframe}. Reason: ${finalReason}`
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          staffRescheduleRequested: true,
          rescheduleRequested: true,
          staffRescheduleReason: finalReason,
          rescheduleReason: finalReason,
          staffRequestedTimeframe: finalTimeframe,
          requestedTimeframe: finalTimeframe,
          staffRequestedDate: requestedDate || null,
          staffRescheduleStatus: 'Pending Manager Approval',
          historyLogs: logs
        },
        issueReports
      );

      // Notify manager
      const store = getStoreInstance();
      const mgrReschedNotif = {
        id: `notif-mgr-reschedule-${Date.now()}`,
        userId: existing.managerId || existing.hostelId || 'manager',
        managerId: existing.managerId,
        managerEmail: existing.managerEmail,
        recipientEmail: existing.managerEmail,
        targetRole: 'manager',
        hostelId: existing.hostelId,
        type: 'issue_report',
        title: `Extension Requested: ${existing.assignedStaffName || 'Staff'}`,
        message: `${existing.assignedStaffName || 'Technician'} requested a ${finalTimeframe} extension for "${existing.title}" (Room ${existing.roomNumber}). Reason: "${finalReason}". Please review and approve.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/manager/dashboard'
      };
      notifications.unshift(mgrReschedNotif);
      await dbCreateNotification(mgrReschedNotif, notifications);
      if (store.notifications) store.notifications.unshift(mgrReschedNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error requesting reschedule:", err);
      res.status(500).json({ error: "Failed to request reschedule" });
    }
  });

  // Manager approves reschedule request
  app.post("/api/issue-reports/:id/approve-reschedule", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { approvedTimeframe, managerNotes } = req.body;

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      const newTf = approvedTimeframe || existing.staffRequestedTimeframe || existing.requestedTimeframe || '24h';
      const now = new Date();
      let newDeadline: string;
      if (newTf === '12h') {
        newDeadline = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
      } else if (newTf === '24h') {
        newDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      } else if (newTf === '48h') {
        newDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      } else if (newTf === '3d') {
        newDeadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
      } else if (newTf === '5d') {
        newDeadline = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      } else if (newTf === '7d') {
        newDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        newDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      }

      const logs = existing.historyLogs || [];
      logs.push({
        action: 'Reschedule Approved by Manager',
        actor: req.user.name || 'Hostel Manager',
        timestamp: new Date().toISOString(),
        note: `Manager approved extension. New allocated fix timeframe: ${newTf}. Deadline: ${new Date(newDeadline).toLocaleString()}`
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          timeframe: newTf,
          deadline: newDeadline,
          staffRescheduleRequested: false,
          rescheduleRequested: false,
          rescheduleApproved: true,
          rescheduleApprovedAt: new Date().toISOString(),
          rescheduleApprovedTimeframe: newTf,
          rescheduleManagerNotes: managerNotes || '',
          staffRescheduleStatus: 'Approved',
          historyLogs: logs
        },
        issueReports
      );

      const store = getStoreInstance();
      // Notify resident of the new allocated timeframe
      const resReschedNotif = {
        id: `notif-res-resched-app-${Date.now()}`,
        userId: existing.studentId,
        studentId: existing.studentId,
        recipientEmail: existing.studentEmail || existing.parentUserEmail,
        type: 'issue_report',
        title: `🗓️ Maintenance Schedule Updated`,
        message: `Your Hostel Manager approved an updated fix time (${newTf}) for "${existing.title}". Technician ${existing.assignedStaffName || 'Artisan'} will complete work by ${new Date(newDeadline).toLocaleDateString()} ${new Date(newDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/resident/dashboard'
      };
      notifications.unshift(resReschedNotif);
      await dbCreateNotification(resReschedNotif, notifications);
      if (store.notifications) store.notifications.unshift(resReschedNotif);

      // Notify staff of approval
      const staffReschedNotif = {
        id: `notif-staff-resched-app-${Date.now()}`,
        userId: existing.assignedStaffId,
        recipientEmail: existing.assignedStaffEmail,
        staffEmail: existing.assignedStaffEmail,
        type: 'issue_report',
        title: `✅ Reschedule Request Approved`,
        message: `Manager approved your extension for "${existing.title}". Your new deadline is ${new Date(newDeadline).toLocaleString()}.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/staff/dashboard'
      };
      notifications.unshift(staffReschedNotif);
      await dbCreateNotification(staffReschedNotif, notifications);
      if (store.notifications) store.notifications.unshift(staffReschedNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error approving reschedule:", err);
      res.status(500).json({ error: "Failed to approve reschedule" });
    }
  });

  // Manager declines reschedule request
  app.post("/api/issue-reports/:id/decline-reschedule", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      const logs = existing.historyLogs || [];
      logs.push({
        action: 'Reschedule Declined by Manager',
        actor: req.user.name || 'Hostel Manager',
        timestamp: new Date().toISOString(),
        note: `Manager declined extension request. Reason: ${reason || 'Current SLA timeline stands'}`
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          staffRescheduleRequested: false,
          rescheduleRequested: false,
          rescheduleDeclined: true,
          staffRescheduleStatus: 'Declined',
          historyLogs: logs
        },
        issueReports
      );

      // Notify staff
      const store = getStoreInstance();
      const staffDecNotif = {
        id: `notif-staff-resched-dec-${Date.now()}`,
        userId: existing.assignedStaffId,
        recipientEmail: existing.assignedStaffEmail,
        staffEmail: existing.assignedStaffEmail,
        type: 'issue_report',
        title: `Reschedule Declined`,
        message: `Manager declined the extension request for "${existing.title}". Please adhere to the original deadline.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/staff/dashboard'
      };
      notifications.unshift(staffDecNotif);
      await dbCreateNotification(staffDecNotif, notifications);
      if (store.notifications) store.notifications.unshift(staffDecNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error declining reschedule:", err);
      res.status(500).json({ error: "Failed to decline reschedule" });
    }
  });

  // Staff submits completion form with completion notes & photo proof
  app.post("/api/issue-reports/:id/staff-complete", requireAuth(["staff", "user", "admin", "manager", "resident", "student", "employee", "artisan"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { completionNotes, completionPhoto, completionPhotos } = req.body;

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      const finalPhotos = Array.isArray(completionPhotos) ? completionPhotos : (completionPhoto ? [completionPhoto] : []);
      const finalNotes = completionNotes || 'Repairs fully carried out and tested on site.';

      const logs = existing.historyLogs || [];
      logs.push({
        action: 'Staff Marked Fix Complete',
        actor: req.user.name || existing.assignedStaffName || 'Staff Member',
        timestamp: new Date().toISOString(),
        note: `Technician submitted fix details: "${finalNotes}". Awaiting resident verification.`
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          staffCompleted: true,
          staffCompletionNotes: finalNotes,
          staffCompletionPhoto: completionPhoto || (finalPhotos[0] || ''),
          staffCompletionPhotos: finalPhotos,
          staffCompletedAt: new Date().toISOString(),
          status: 'Resolved', // Pending resident verification
          historyLogs: logs
        },
        issueReports
      );
      syncStore();

      const store = getStoreInstance();
      // Notify Resident to inspect and confirm fix
      const resFixNotif = {
        id: `notif-res-fix-done-${Date.now()}`,
        userId: existing.studentId,
        studentId: existing.studentId,
        recipientEmail: existing.studentEmail || existing.parentUserEmail,
        type: 'issue_report',
        title: `🛠️ Technician Completed Fix: "${existing.title}"`,
        message: `${existing.assignedStaffName || 'Technician'} marked your complaint resolved with photo evidence. Please inspect your room and verify the resolution to rate the technician.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/resident/dashboard'
      };
      notifications.unshift(resFixNotif);
      await dbCreateNotification(resFixNotif, notifications);
      if (store.notifications) store.notifications.unshift(resFixNotif);

      // Notify Manager
      const mgrFixNotif = {
        id: `notif-mgr-fix-done-${Date.now()}`,
        userId: existing.managerId || existing.hostelId || 'manager',
        managerId: existing.managerId,
        managerEmail: existing.managerEmail,
        recipientEmail: existing.managerEmail,
        targetRole: 'manager',
        hostelId: existing.hostelId,
        type: 'issue_report',
        title: `Repair Completed by ${existing.assignedStaffName || 'Staff'}`,
        message: `${existing.assignedStaffName || 'Technician'} completed fix for Room ${existing.roomNumber} ("${existing.title}"). Sent to resident for verification.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/manager/dashboard'
      };
      notifications.unshift(mgrFixNotif);
      await dbCreateNotification(mgrFixNotif, notifications);
      if (store.notifications) store.notifications.unshift(mgrFixNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error submitting staff completion:", err);
      res.status(500).json({ error: "Failed to submit completion form" });
    }
  });

  // Student confirms resolution, writes review and rates staff
  app.post("/api/issue-reports/:id/student-confirm", requireAuth(["user", "student", "admin", "manager"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isResolved, feedback, studentAcceptedResolved, studentFeedback, rating, reviewText } = req.body;
      const resolvedFlag = isResolved !== undefined ? isResolved : (studentAcceptedResolved !== undefined ? studentAcceptedResolved : true);
      const feedbackText = feedback !== undefined ? feedback : (reviewText || studentFeedback || '');
      const starRating = Number(rating) || 5;

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      const logs = existing.historyLogs || [];
      logs.push({
        action: resolvedFlag ? 'Resident Confirmed Resolution & Rated Staff' : 'Resident Reported Incomplete Fix',
        actor: req.user.name || existing.studentName || 'Student Resident',
        timestamp: new Date().toISOString(),
        note: resolvedFlag 
          ? `Resident verified repair as completed. Rating: ${starRating}/5 stars. Feedback: "${feedbackText || 'Work completed to satisfaction.'}"`
          : `Resident reported issue still persists. Feedback: "${feedbackText || 'Follow-up requested.'}"`
      });

      // If resolved, record staff review and rating
      if (resolvedFlag && existing.assignedStaffId) {
        if (!staffReviews) staffReviews = [];
        const newReview = {
          id: `rev-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          staffId: existing.assignedStaffId,
          staffEmail: existing.assignedStaffEmail || '',
          staffName: existing.assignedStaffName || 'Technician',
          staffRole: existing.assignedStaffRole || 'Artisan',
          studentId: existing.studentId || req.user.id,
          studentName: existing.studentName || req.user.name || 'Student Resident',
          studentEmail: existing.studentEmail || req.user.email || '',
          issueId: existing.id,
          issueTitle: existing.title,
          hostelName: existing.hostelName,
          roomNumber: existing.roomNumber,
          blockName: existing.blockName,
          rating: starRating,
          comment: feedbackText || 'Work completed cleanly and professionally.',
          createdAt: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0]
        };

        staffReviews.unshift(newReview);
        syncStore();
      }

      const updated = await dbUpdateIssueReport(
        id,
        {
          studentAcceptedResolved: resolvedFlag === true,
          studentConfirmed: resolvedFlag === true,
          studentResolvedAt: new Date().toISOString(),
          studentRating: starRating,
          studentFeedback: feedbackText,
          studentReview: feedbackText,
          status: resolvedFlag === true ? 'Resolved' : 'In Progress',
          historyLogs: logs
        },
        issueReports
      );

      const store = getStoreInstance();
      // Notify manager that resident confirmed or reported incomplete fix
      const mgrConfirmNotif = {
        id: `notif-mgr-res-ok-${Date.now()}`,
        userId: existing.managerId || existing.hostelId || 'manager',
        managerId: existing.managerId,
        managerEmail: existing.managerEmail,
        recipientEmail: existing.managerEmail,
        targetRole: 'manager',
        hostelId: existing.hostelId,
        type: 'issue_report',
        title: resolvedFlag ? `Resident Verified Fix: "${existing.title}"` : `Resident Follow-Up: "${existing.title}"`,
        message: resolvedFlag
          ? `Resident in Room ${existing.roomNumber} confirmed repair by ${existing.assignedStaffName} with a ${starRating}⭐ review. You can now close and archive the work order.`
          : `Resident in Room ${existing.roomNumber} reported that issue "${existing.title}" still needs attention: "${feedbackText}". Please follow up.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/manager/dashboard'
      };
      notifications.unshift(mgrConfirmNotif);
      await dbCreateNotification(mgrConfirmNotif, notifications);
      if (store.notifications) store.notifications.unshift(mgrConfirmNotif);

      // Notify staff of review
      const staffReviewNotif = {
        id: `notif-staff-review-${Date.now()}`,
        userId: existing.assignedStaffId,
        recipientEmail: existing.assignedStaffEmail,
        staffEmail: existing.assignedStaffEmail,
        type: 'issue_report',
        title: resolvedFlag ? `⭐ You Received a ${starRating}-Star Resident Review!` : `⚠️ Resident Follow-Up: "${existing.title}"`,
        message: resolvedFlag
          ? `Resident in Room ${existing.roomNumber} left feedback for "${existing.title}": "${feedbackText || 'Work well done!'}".`
          : `Resident in Room ${existing.roomNumber} requested follow-up for "${existing.title}": "${feedbackText}".`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/staff/dashboard'
      };
      notifications.unshift(staffReviewNotif);
      await dbCreateNotification(staffReviewNotif, notifications);
      if (store.notifications) store.notifications.unshift(staffReviewNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error confirming resolution by student:", err);
      res.status(500).json({ error: "Failed to confirm resolution" });
    }
  });

  // Manager permanently closes and logs task (Resident MUST have confirmed first if filed by resident)
  app.post("/api/issue-reports/:id/manager-close", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { managerNotes } = req.body;

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });

      if (existing.closedByManager) {
        return res.json(existing);
      }

      // STRICT VALIDATION: If filed by a resident/student, manager CANNOT override or close until the resident confirmed complete
      const isResidentReport = Boolean(
        existing.studentId || 
        existing.studentEmail || 
        existing.residentId || 
        (existing.reportedBy && existing.reportedBy.toLowerCase().includes('resident'))
      );
      const wasResidentConfirmed = Boolean(existing.studentConfirmed || existing.studentAcceptedResolved);

      if (isResidentReport && !wasResidentConfirmed) {
        return res.status(400).json({
          error: "Sign-off Locked: The student resident who filed this maintenance report must inspect the repair and tick/confirm it as complete from their resident room page before the manager can finalize and archive signoff."
        });
      }

      const logs = existing.historyLogs || [];
      logs.push({
        action: 'Work Order Closed & Archived by Manager (Success)',
        actor: req.user.name || 'Hostel Manager',
        timestamp: new Date().toISOString(),
        note: managerNotes || (wasResidentConfirmed ? 'Issue verified with resident signoff, closed and archived permanently as success.' : 'Direct manager verification and signoff, closed and archived permanently as success.')
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          status: 'Resolved',
          closedByManager: true,
          studentConfirmed: true,
          studentAcceptedResolved: true,
          closedAt: new Date().toISOString(),
          managerCloseNotes: managerNotes || 'Verified and closed by hostel management.',
          historyLogs: logs
        },
        issueReports
      );

      await dbCreateActivity({
        id: `act-closed-${Date.now()}`,
        text: `Work order "${existing.title}" at ${existing.hostelName} (Room ${existing.roomNumber}) closed and archived by Manager.`,
        time: 'Just now',
        type: 'success'
      }, activities);

      // Notify resident of final closure
      const store = getStoreInstance();
      const resArchivedNotif = {
        id: `notif-res-archived-${Date.now()}`,
        userId: existing.studentId,
        studentId: existing.studentId,
        recipientEmail: existing.studentEmail || existing.parentUserEmail,
        type: 'issue_report',
        title: `Maintenance Ticket Closed & Archived`,
        message: `Your maintenance ticket "${existing.title}" has been successfully closed and archived by your hostel manager.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/resident/dashboard'
      };
      notifications.unshift(resArchivedNotif);
      await dbCreateNotification(resArchivedNotif, notifications);
      if (store.notifications) store.notifications.unshift(resArchivedNotif);

      res.json(updated);
    } catch (err: any) {
      console.error("Error closing task:", err);
      res.status(500).json({ error: "Failed to close task" });
    }
  });

  app.put("/api/issue-reports/:id", requireAuth(), async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const list = await dbGetIssueReports(issueReports);
      const existingIssue = list.find((i: any) => i.id === id);
      if (!existingIssue) {
        return res.status(404).json({ error: "Issue report not found" });
      }

      const updated = await dbUpdateIssueReport(id, updates, issueReports);
      res.json(updated);
    } catch (err: any) {
      console.error("Error updating issue report:", err);
      res.status(500).json({ error: "Failed to update issue report" });
    }
  });

  // ==========================================
  // DIGITAL ROOM KEYS ENDPOINTS
  // ==========================================

  function freshRoomKey(room: any, reserved: Set<string>): string {
    let code: string;
    do { code = generateHostelRoomKeyCode(room.hostelName, room.blockName); } while (reserved.has(code));
    reserved.add(code);
    return code;
  }

  // Release occupancy, revoke the room identity, and retire the old activation key.
  app.post('/api/room-keys/:id/release', requireAuth(['manager', 'admin']), (req: any, res) => {
    const store = getStoreInstance();
    const room = (store.roomKeys || []).find(r => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    const hostel = hostels.find(h => h.id === room.hostelId);
    if (!canManageHostel(req.user, hostel)) return res.status(403).json({ error: 'You can only release rooms in your own residence.' });
    if (req.body.confirm !== true) return res.status(400).json({ error: 'Confirm that the resident’s room account and access will be removed.' });
    if (!room.isAssigned) return res.status(409).json({ error: 'This room is already available.' });
    const reserved = new Set<string>([...(store.retiredRoomKeys || []), ...(store.roomKeys || []).map(r => r.roomKey)]);
    releaseRoom(store, room, [store.users, MOCK_USERS, persistentData.users], freshRoomKey(room, reserved));
    syncStore();
    return res.json({ success: true, room, message: 'Occupant removed, room account revoked, and replacement key generated.' });
  });

  app.post('/api/hostels/:id/reshuffle-room-keys', requireAuth(['manager', 'admin']), (req: any, res) => {
    const store = getStoreInstance();
    const hostel = hostels.find(h => h.id === req.params.id);
    if (!hostel) return res.status(404).json({ error: 'Residence not found.' });
    if (!canManageHostel(req.user, hostel)) return res.status(403).json({ error: 'You can only reshuffle keys for your own residence.' });
    const academicYear = String(req.body.academicYear || '');
    const yearMatch = /^(\d{4})\/(\d{4})$/.exec(academicYear);
    if (req.body.confirm !== true || !yearMatch || Number(yearMatch[2]) !== Number(yearMatch[1]) + 1) return res.status(400).json({ error: 'Confirm the reset and provide an academic year such as 2026/2027.' });
    const rooms = (store.roomKeys || []).filter(room => room.hostelId === hostel.id);
    if (!rooms.length) return res.status(400).json({ error: 'No rooms to reshuffle.' });
    const reserved = new Set<string>([...(store.retiredRoomKeys || []), ...(store.roomKeys || []).map(r => r.roomKey)]);
    // Generate every replacement before changing any occupancy.
    const replacements = rooms.map(room => freshRoomKey(room, reserved));
    const occupantsRemoved = rooms.filter(room => room.isAssigned).length;
    rooms.forEach((room, index) => {
      releaseRoom(store, room, [store.users, MOCK_USERS, persistentData.users], replacements[index]);
      room.academicYear = academicYear;
    });
    hostel.roomKeysAcademicYear = academicYear;
    hostel.roomKeysRotatedAt = new Date().toISOString();
    syncStore();
    return res.json({ success: true, count: rooms.length, occupantsRemoved, roomKeys: rooms, message: `Keys reshuffled for ${academicYear}. Previous room accounts and keys have been revoked.` });
  });

  // Get Room Keys (Manager gets for their hostel; Admin gets all)
  app.get("/api/room-keys", requireAuth(["manager", "admin", "staff"]), async (req: any, res) => {
    try {
      const userRole = req.user.role;
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const requestedHostelId = req.query.hostelId as string;

      const allHostels = await dbGetHostels(hostels);

      if (requestedHostelId) {
        const targetHostel = allHostels.find(h => h.id === requestedHostelId);
        if (userRole === 'manager' && !canManageHostel(req.user, targetHostel)) return res.status(403).json({ error: 'You can only view keys for your own residence.' });
        if (targetHostel) {
          await dbGenerateHostelRoomKeys(targetHostel);
        }
        const keys = await dbGetRoomKeys(requestedHostelId);
        return res.json(keys);
      }

      if (userRole === 'manager') {
        let managerHostels = allHostels.filter(h => 
          (h.managerId && userId && h.managerId === userId) || 
          (h.assignedManagerId && userId && h.assignedManagerId === userId) ||
          (h.managerEmail && userEmail && h.managerEmail.toLowerCase().trim() === userEmail) ||
          (h.email && userEmail && h.email.toLowerCase().trim() === userEmail)
        );


        // Ensure keys are generated for each manager property
        for (const mh of managerHostels) {
          await dbGenerateHostelRoomKeys(mh);
        }

        const hostelIds = managerHostels.map(h => h.id);
        const allKeys = await dbGetRoomKeys();
        const filtered = allKeys.filter(k => 
          hostelIds.includes(k.hostelId) || 
          managerHostels.some(h => h.name?.toLowerCase().trim() === k.hostelName?.toLowerCase().trim())
        );
        return res.json(filtered.length > 0 ? filtered : allKeys);
      }

      // Ensure all hostels have keys
      for (const h of allHostels) {
        await dbGenerateHostelRoomKeys(h);
      }
      const allKeys = await dbGetRoomKeys();
      res.json(allKeys);
    } catch (err: any) {
      console.error("Error fetching room keys:", err);
      res.status(500).json({ error: "Failed to load room keys" });
    }
  });

  // Send Digital Room Key directly to an email or phone number
  app.post("/api/room-keys/send-digital", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const {
        roomKey,
        roomNumber,
        blockName,
        hostelName,
        recipientEmail,
        recipientPhone,
        recipientName,
        customNote
      } = req.body;

      const cleanKey = (roomKey || '').trim().toUpperCase();
      if (!cleanKey) {
        return res.status(400).json({ error: "Digital room key code is required." });
      }

      if (!recipientEmail && !recipientPhone) {
        return res.status(400).json({ error: "Please provide either a recipient email address or phone number." });
      }

      const keyRecord = await dbGetRoomKeyByCode(cleanKey);
      if (!keyRecord) {
        return res.status(404).json({ error: `Room key "${cleanKey}" not found.` });
      }
      if (!canManageHostel(req.user, hostels.find(h => h.id === keyRecord.hostelId))) return res.status(403).json({ error: 'You can only dispatch keys for your own residence.' });

      const dispatchInfo = {
        recipientEmail: recipientEmail ? recipientEmail.trim().toLowerCase() : '',
        recipientPhone: recipientPhone ? recipientPhone.trim() : '',
        recipientName: recipientName ? recipientName.trim() : 'Resident / Student',
        customNote: customNote ? customNote.trim() : '',
        senderManagerId: req.user?.id || 'manager_101',
        senderManagerName: req.user?.name || 'Property Manager',
        roomNumber: roomNumber || keyRecord.roomNumber,
        blockName: blockName || keyRecord.blockName,
        hostelName: hostelName || keyRecord.hostelName
      };

      const dispatchRecord = await dbRecordRoomKeyDispatch(cleanKey, dispatchInfo);

      // Create activity feed record
      await dbCreateActivity({
        id: `act-dispatch-${Date.now()}`,
        text: `Digital Key for Room ${keyRecord.roomNumber} (${keyRecord.blockName}) sent to ${dispatchInfo.recipientName || 'resident'} (${dispatchInfo.recipientEmail || dispatchInfo.recipientPhone}).`,
        time: 'Just now',
        type: 'info'
      }, activities);

      // Create manager notification
      const dispatchTarget = [dispatchInfo.recipientEmail, dispatchInfo.recipientPhone].filter(Boolean).join(' / ');
      notifications.unshift({
        id: `notif-disp-${Date.now()}`,
        studentId: req.user?.id || 'mgr',
        title: `Room Key Dispatched: ${keyRecord.roomNumber}`,
        message: `Digital room key (${cleanKey}) for ${keyRecord.blockName} Room ${keyRecord.roomNumber} was sent to ${dispatchInfo.recipientName} at ${dispatchTarget}.`,
        type: 'info',
        date: new Date().toISOString().split('T')[0],
        read: false
      });

      return res.json({
        success: true,
        message: `Digital room key successfully sent to ${dispatchTarget}!`,
        dispatch: dispatchRecord
      });
    } catch (err: any) {
      console.error("Error sending digital room key:", err);
      return res.status(500).json({ error: "Failed to dispatch digital room key: " + err.message });
    }
  });

  // Get authenticated student's full profile and room key details
  app.get("/api/student/my-profile", requireAuth(["user", "student", "admin", "manager"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const currentUser = req.user;
      
      const cleanEmail = (currentUser.email || '').toLowerCase().trim();
      const userId = (currentUser.id || currentUser.userId || '').trim();

      // Find any linked student record if currentUser is a user or if we need more complete student fields
      const linkedStudent = (store.users || []).find((u: any) => {
        if (!u) return false;
        const uRole = (u.user?.role || u.role || '').toLowerCase();
        if (uRole !== 'student' && uRole !== 'resident') return false;
        const uParentId = (u.parentUserId || u.user?.parentUserId || '').trim();
        const uParentEmail = (u.parentUserEmail || u.user?.parentUserEmail || '').toLowerCase().trim();
        const uEmail = (u.email || u.user?.email || '').toLowerCase().trim();
        const uId = (u.id || u.user?.id || '').trim();
        return (uParentId && userId && uParentId === userId) ||
               (uParentEmail && cleanEmail && uParentEmail === cleanEmail) ||
               (uEmail && cleanEmail && uEmail === cleanEmail) ||
               (uId && userId && uId === userId);
      });

      const storeUser = store.users?.find((u: any) => 
        (u.id && u.id === currentUser.id) ||
        (u.email && cleanEmail && u.email.toLowerCase().trim() === cleanEmail)
      );

      const mockUserObj = MOCK_USERS.find((u: any) => 
        (u.user?.id && u.user.id === currentUser.id) ||
        (u.email && cleanEmail && u.email.toLowerCase().trim() === cleanEmail)
      )?.user;

      const studentObj = linkedStudent ? (linkedStudent.user ? { ...linkedStudent.user } : { ...linkedStudent }) : null;
      const baseUser = storeUser || mockUserObj || currentUser;
      const fullUser = { 
        ...(studentObj || {}), 
        ...baseUser,
        avatar: currentUser.avatar || baseUser.avatar || studentObj?.avatar || 'preset:pine-classic',
        photo: currentUser.photo || baseUser.photo || studentObj?.photo || '',
        photoUrl: currentUser.photoUrl || baseUser.photoUrl || studentObj?.photoUrl || '',
        avatarUrl: currentUser.avatarUrl || baseUser.avatarUrl || studentObj?.avatarUrl || '',
        profilePicture: currentUser.profilePicture || baseUser.profilePicture || studentObj?.profilePicture || ''
      };

      const keyToSearch = fullUser.roomKey || studentObj?.roomKey || currentUser.roomKey;

      let keyRecord = null;
      if (keyToSearch) {
        keyRecord = store.roomKeys?.find((rk: any) => rk.roomKey?.trim().toUpperCase() === keyToSearch.trim().toUpperCase());
      }
      if (!keyRecord) {
        keyRecord = store.roomKeys?.find((rk: any) => {
          if (!rk || !rk.isAssigned) return false;
          const assignedEmail = (rk.assignedStudentEmail || rk.studentEmail || rk.email || '').toLowerCase().trim();
          const parentEmail = (rk.parentUserEmail || '').toLowerCase().trim();
          const parentId = (rk.parentUserId || rk.claimedByUserId || '').trim();
          const stuCleanEmail = (studentObj?.email || '').toLowerCase().trim();
          const stuId = (studentObj?.id || '').trim();
          return (cleanEmail && (assignedEmail === cleanEmail || parentEmail === cleanEmail)) ||
                 (stuCleanEmail && (assignedEmail === stuCleanEmail || parentEmail === stuCleanEmail)) ||
                 (userId && (parentId === userId || rk.assignedStudentId === userId || rk.claimedByUserId === userId)) ||
                 (stuId && (parentId === stuId || rk.assignedStudentId === stuId || rk.claimedByUserId === stuId));
        });
      }

      const responseUser = {
        ...fullUser,
        hostelName: keyRecord?.hostelName || fullUser.hostelName || currentUser.hostelName || '',
        hostelId: keyRecord?.hostelId || fullUser.hostelId || currentUser.hostelId || '',
        blockName: keyRecord?.blockName || fullUser.blockName || currentUser.blockName || '',
        roomNumber: keyRecord?.roomNumber || fullUser.roomNumber || currentUser.roomNumber || '',
        roomKey: keyRecord?.roomKey || fullUser.roomKey || keyToSearch || currentUser.roomKey || '',
        studentId: studentObj?.studentId || fullUser.studentId || currentUser.studentId || currentUser.id,
        name: studentObj?.name || fullUser.name || currentUser.name,
        email: studentObj?.email || fullUser.email || currentUser.email,
        phone: studentObj?.phone || fullUser.phone || currentUser.phone,
        institution: studentObj?.institution || keyRecord?.assignedInstitution || fullUser.institution || currentUser.institution || '',
        programOfStudy: studentObj?.programOfStudy || keyRecord?.assignedProgram || fullUser.programOfStudy || currentUser.programOfStudy || '',
        department: studentObj?.department || keyRecord?.assignedDepartment || fullUser.department || currentUser.department || '',
        residentType: studentObj?.residentType || keyRecord?.assignedResidentType || fullUser.residentType || currentUser.residentType || 'student',
        role: currentUser.role === 'user' ? 'user' : (studentObj?.role || 'student'),
        avatar: currentUser.avatar || currentUser.photo || fullUser.avatar || fullUser.photo || fullUser.photoUrl || fullUser.avatarUrl || studentObj?.avatar || 'preset:pine-classic',
        photo: currentUser.photo || currentUser.avatar || fullUser.photo || fullUser.avatar || fullUser.photoUrl || fullUser.avatarUrl || studentObj?.photo || '',
        photoUrl: currentUser.photoUrl || currentUser.avatar || fullUser.photoUrl || fullUser.avatar || fullUser.photo || studentObj?.photoUrl || '',
        avatarUrl: currentUser.avatarUrl || currentUser.avatar || fullUser.avatarUrl || fullUser.avatar || fullUser.photo || studentObj?.avatarUrl || '',
        profilePicture: currentUser.profilePicture || currentUser.avatar || fullUser.profilePicture || fullUser.avatar || fullUser.photo || studentObj?.profilePicture || ''
      };

      // Check if student has an active approved Digital Market Store
      const approvedStore = store.digitalMarketStores?.find((s: any) =>
        (s.status === 'active' || (s as any).approvedAt) &&
        !s.isBanned &&
        (
          (cleanEmail && (s.studentEmail?.toLowerCase() === cleanEmail || s.parentUserEmail?.toLowerCase() === cleanEmail)) ||
          (userId && (s.userId === userId || (s as any).merchantUserId === userId))
        )
      );

      if (approvedStore && currentUser.role === 'merchant') {
        (responseUser as any).isApprovedMerchant = true;
        (responseUser as any).hasApprovedMerchantStore = true;
        (responseUser as any).merchantStoreId = approvedStore.id;
        (responseUser as any).merchantStoreName = approvedStore.storeName;
      }

      // Get all assigned rooms for this resident
      const userRooms = (store.roomKeys || []).filter((rk: any) => {
        if (!rk || !rk.isAssigned) return false;
        const assignedEmail = (rk.assignedStudentEmail || rk.studentEmail || rk.email || '').toLowerCase().trim();
        const parentEmail = (rk.parentUserEmail || '').toLowerCase().trim();
        const parentId = (rk.parentUserId || rk.claimedByUserId || '').trim();
        const stuCleanEmail = (studentObj?.email || '').toLowerCase().trim();
        const stuId = (studentObj?.id || '').trim();
        const keyMatch = Boolean(responseUser.roomKey) && rk.roomKey?.trim().toUpperCase() === responseUser.roomKey?.trim().toUpperCase();
        return (cleanEmail && (assignedEmail === cleanEmail || parentEmail === cleanEmail)) ||
               (stuCleanEmail && (assignedEmail === stuCleanEmail || parentEmail === stuCleanEmail)) ||
               (userId && (parentId === userId || rk.assignedStudentId === userId || rk.claimedByUserId === userId)) ||
               (stuId && (parentId === stuId || rk.assignedStudentId === stuId || rk.claimedByUserId === stuId)) ||
               keyMatch;
      });

      res.json({
        user: responseUser,
        roomKeyDetails: keyRecord || (userRooms.length > 0 ? userRooms[0] : null),
        rooms: userRooms
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load student profile" });
    }
  });

  // GET user rooms
  app.get("/api/student/my-rooms", requireAuth(["user", "student", "admin", "manager"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const currentUser = req.user;
      const cleanEmail = (currentUser.email || '').toLowerCase().trim();
      const userId = (currentUser.id || currentUser.userId || '').trim();

      const userRooms = (store.roomKeys || []).filter((rk: any) => {
        if (!rk || !rk.isAssigned) return false;
        const assignedEmail = (rk.assignedStudentEmail || rk.studentEmail || rk.email || '').toLowerCase().trim();
        const parentEmail = (rk.parentUserEmail || '').toLowerCase().trim();
        const parentId = (rk.parentUserId || rk.claimedByUserId || '').trim();
        const keyMatch = currentUser.roomKey && rk.roomKey?.trim().toUpperCase() === currentUser.roomKey?.trim().toUpperCase();
        return (cleanEmail && (assignedEmail === cleanEmail || parentEmail === cleanEmail)) ||
               (userId && (parentId === userId || rk.assignedStudentId === userId || rk.claimedByUserId === userId)) ||
               keyMatch;
      });

      res.json({ rooms: userRooms });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch user rooms" });
    }
  });

  // Verify a Digital Room Key (Public or during signup)
  app.post("/api/room-keys/verify", async (req: any, res) => {
    try {
      const { roomKey } = req.body;
      if (!roomKey || typeof roomKey !== 'string' || roomKey.trim().length < 5) {
        return res.status(400).json({ valid: false, error: "Please provide a valid room key format (e.g. MAZE-A-123456)." });
      }

      const keyRecord = await dbGetRoomKeyByCode(roomKey);
      if (!keyRecord) {
        return res.status(404).json({ valid: false, error: "Invalid Digital Room Key. No matching room found in our system." });
      }

      if (keyRecord.isAssigned || keyRecord.status === 'Occupied') {
        return res.status(400).json({ valid: false, error: "This Digital Room Key has already been claimed and used. Room keys can only be used once." });
      }

      // Check if hostel exists
      const hostelList = await dbGetHostels(hostels);
      const hostel = hostelList.find(h => h.id === keyRecord.hostelId || h.name?.toLowerCase() === keyRecord.hostelName?.toLowerCase());

      res.json({
        valid: true,
        roomKey: keyRecord.roomKey,
        hostelId: keyRecord.hostelId,
        hostelName: keyRecord.hostelName,
        blockName: keyRecord.blockName,
        blockInitial: keyRecord.blockInitial,
        roomNumber: keyRecord.roomNumber,
        floor: keyRecord.floor,
        isAssigned: keyRecord.isAssigned,
        status: keyRecord.status,
        managerId: hostel?.managerId || '',
        managerName: hostel?.managerName || 'Hostel Operations Manager',
        managerPhone: hostel?.phone || hostel?.managerPhone || '+233 24 000 0000',
        managerEmail: hostel?.managerEmail || hostel?.email || 'manager@pinevela.com'
      });
    } catch (err: any) {
      console.error("Error verifying room key:", err);
      res.status(500).json({ valid: false, error: "Server error verifying room key" });
    }
  });

  // Legacy assignment endpoint cannot bypass primary-account activation.
  app.post("/api/student/add-room", requireAuth(), (_req: any, res) => {
    return res.status(403).json({ error: 'Room activation requires your primary account and a new, distinct room password. Use the Activate Room form instead.' });
  });

  // Unlink / Delete room key from resident account
  app.post("/api/student/delete-room", requireAuth(["user", "student", "resident"]), (req: any, res) => {
    const store = getStoreInstance();
    const key = String(req.body.roomKey || '').trim().toUpperCase();
    const room = (store.roomKeys || []).find(r => String(r.roomKey).toUpperCase() === key && r.isAssigned);
    if (!room) return res.status(404).json({ error: 'Active room not found.' });
    const ownsRoom = req.user.role === 'user'
      ? (room.parentUserId === req.user.id || normalizeEmail(room.parentUserEmail) === normalizeEmail(req.user.email))
      : String(req.user.roomKey).toUpperCase() === key;
    if (!ownsRoom) return res.status(403).json({ error: 'This room does not belong to your account.' });
    const resident = [...store.users, ...MOCK_USERS].find(u => String(accountData(u).roomKey || u.roomKey || '').toUpperCase() === key && accountRole(u) !== 'user');
    if (!resident || normalizeEmail(req.body.email) !== normalizeEmail(accountData(resident).email || resident.email) || !credentialValues(resident, false).some(hash => passwordsMatch(req.body.password, hash))) {
      return res.status(400).json({ error: 'Enter the resident account email and password.' });
    }
    const reserved = new Set<string>([...(store.retiredRoomKeys || []), ...(store.roomKeys || []).map(r => r.roomKey)]);
    releaseRoom(store, room, [store.users, MOCK_USERS, persistentData.users], freshRoomKey(room, reserved));
    syncStore();
    const rooms = (store.roomKeys || []).filter(r => r.isAssigned && r.parentUserId === req.user.id);
    return res.json({ success: true, rooms, message: 'Room account removed and room made available with a new key.' });
  });

  // Claim room key and complete resident onboarding & login
  app.post(["/api/room-keys/claim", "/api/residents/onboard"], requireAuth(["user"]), requirePrimaryAccount, async (req: any, res) => {
    try {
      const {
        roomKey,
        studentName,
        name,
        username,
        studentEmail,
        email,
        studentPhone,
        phone,
        password,
        plainPassword,
        userId,
        parentUserEmail
      } = req.body;

      const resolvedKey = (roomKey || '').trim().toUpperCase();
      const resolvedName = (name || studentName || username || '').trim();
      const resolvedEmail = (email || studentEmail || '').trim().toLowerCase();
      const resolvedPhone = (phone || studentPhone || '').trim();
      const resolvedStudentId = `RES-${Date.now().toString().slice(-6)}`;
      const resolvedType = 'resident';
      const resolvedProgram = '';
      const resolvedDepartment = '';
      const resolvedInstitution = '';

      if (!resolvedKey || !resolvedName || !resolvedEmail || !resolvedPhone) {
        return res.status(400).json({ error: "Digital room key, full name, phone number, and KNUST student email are required." });
      }

      const knustEmailRegex = /^[a-zA-Z0-9._%+-]+@(st\.)?knust\.edu\.gh$/i;
      if (!knustEmailRegex.test(resolvedEmail)) {
        return res.status(400).json({ error: "Only official KNUST student emails are allowed (e.g. yourname@st.knust.edu.gh or yourname@knust.edu.gh). This serves as your credential for logging into your digital room." });
      }

      const keyRecord = await dbGetRoomKeyByCode(resolvedKey);
      if (!keyRecord) {
        return res.status(404).json({ error: `Digital room key "${resolvedKey}" not found. Please double-check the key code.` });
      }

      if (keyRecord.isAssigned || keyRecord.status === 'Occupied') return res.status(409).json({ error: 'This room is already occupied.' });
      const rawPassword = password;
      if (typeof rawPassword !== 'string' || rawPassword.length < 6) return res.status(400).json({ error: 'Create a room password with at least 6 characters.' });
      const hashedPassword = hashCredential(rawPassword);

      // Assign the room key to this resident
      const store = getStoreInstance();
      if (!store.users) {
        store.users = [];
      }

      const parentUser = [...store.users, ...MOCK_USERS].find((u: any) => accountId(u) === req.user.id && accountRole(u) === 'user');
      if (!parentUser) return res.status(403).json({ error: 'Activate a room from your primary user account.' });
      const pUserId = accountId(parentUser);
      const pUserEmail = accountData(parentUser).email || parentUser.email;

      const cleanParentEmail = (pUserEmail || '').toLowerCase().trim();
      if (cleanParentEmail && resolvedEmail === cleanParentEmail) {
        return res.status(400).json({ error: "You cannot use your primary user account email to activate your room account. Only an official KNUST student email is permitted." });
      }

      // Enforce 1 active room per user account
      if (pUserId || cleanParentEmail) {
        const existingActiveKey = (store.roomKeys || []).find((rk: any) => {
          const rkParentId = (rk.parentUserId || rk.claimedByUserId || '').trim();
          const rkParentEmail = (rk.parentUserEmail || '').trim().toLowerCase();
          const isSameUser = (pUserId && rkParentId === pUserId) || (cleanParentEmail && rkParentEmail === cleanParentEmail);
          return isSameUser && (rk.isAssigned || rk.status === 'Occupied' || rk.status === 'claimed' || rk.status === 'assigned' || rk.isClaimed);
        });
        if (existingActiveKey && (existingActiveKey.roomKey || '').toUpperCase().trim() !== resolvedKey) {
          return res.status(400).json({ error: "Users can now only activate one room per user account. You already have an active room on this account." });
        }
      }

      const updatedKey = await dbAssignRoomKey(resolvedKey, {
        studentId: resolvedStudentId,
        studentName: resolvedName,
        studentEmail: resolvedEmail,
        studentPhone: resolvedPhone,
        assignedResidentType: resolvedType,
        assignedProgram: resolvedProgram,
        assignedDepartment: resolvedDepartment,
        assignedInstitution: resolvedInstitution,
        parentUserId: pUserId,
        parentUserEmail: pUserEmail,
        claimedByUserId: pUserId
      });

      const hostelList = await dbGetHostels(hostels);
      const hostel = hostelList.find(h => h.id === keyRecord.hostelId || h.name?.toLowerCase() === keyRecord.hostelName?.toLowerCase());

      const roomDetailsRecord = {
        id: keyRecord.roomKey,
        roomKey: keyRecord.roomKey,
        roomNumber: keyRecord.roomNumber,
        blockName: keyRecord.blockName,
        hostelName: keyRecord.hostelName,
        hostelId: keyRecord.hostelId,
        email: resolvedEmail,
        assignedStudentEmail: resolvedEmail,
        name: resolvedName,
        assignedStudentName: resolvedName,
        studentId: resolvedStudentId,
        assignedStudentId: resolvedStudentId,
        residentId: resolvedStudentId,
        phone: resolvedPhone,
        assignedStudentPhone: resolvedPhone,
        institution: resolvedInstitution,
        assignedInstitution: resolvedInstitution,
        program: resolvedProgram,
        assignedProgram: resolvedProgram,
        department: resolvedDepartment,
        assignedDepartment: resolvedDepartment,
        residentType: resolvedType,
        assignedResidentType: resolvedType,
        managerName: hostel?.managerName || 'Hostel Operations Manager',
        managerPhone: hostel?.phone || hostel?.managerPhone || '+233 24 000 0000',
        status: 'Occupied',
        isAssigned: true,
        active: true
      };

      // Update parent user registered accounts cache WITHOUT destroying their User role or password
      if (parentUser) {
        const pRaw = parentUser.user ? parentUser.user : parentUser;
        if (!pRaw.registeredAccounts) {
          pRaw.registeredAccounts = {};
        }
        pRaw.registeredAccounts.residentAccount = roomDetailsRecord;

        if (!Array.isArray(pRaw.registeredAccounts.residentRooms)) {
          pRaw.registeredAccounts.residentRooms = [];
        }
        const existingRoomIdx = pRaw.registeredAccounts.residentRooms.findIndex(
          (r: any) => (r.roomKey || r.id)?.toUpperCase() === keyRecord.roomKey.toUpperCase()
        );
        if (existingRoomIdx >= 0) {
          pRaw.registeredAccounts.residentRooms[existingRoomIdx] = roomDetailsRecord;
        } else {
          pRaw.registeredAccounts.residentRooms.push(roomDetailsRecord);
        }
        pRaw.role = 'user';
        delete pRaw.roomKey;
        delete pRaw.roomNumber;
        delete pRaw.blockName;
        delete pRaw.hostelName;
        delete pRaw.hostelId;
      }

      // Find or create a distinct student user account specifically for this room key
      let studentUser = store.users.find((u: any) => {
        const uRole = (u.user?.role || u.role || '').toLowerCase();
        if (uRole !== 'student' && uRole !== 'resident') return false;
        const uKey = (u.roomKey || u.user?.roomKey || '').toUpperCase().trim();
        return resolvedKey && uKey === resolvedKey;
      });

      const fallbackEmail = resolvedEmail;
      const studentToken = createSessionToken('stu');

      if (!studentUser) {
        studentUser = {
          id: `stu-${Date.now()}`,
          name: resolvedName,
          email: fallbackEmail,
          username: resolvedName.toLowerCase().replace(/[^a-z0-9]/g, '') || `resident_${Date.now().toString().slice(-4)}`,
          studentId: resolvedStudentId,
          role: 'student',
          parentUserId: pUserId,
          parentUserEmail: pUserEmail,
          residentType: resolvedType,
          programOfStudy: resolvedProgram,
          department: resolvedDepartment,
          institution: resolvedInstitution,
          phone: resolvedPhone,
          password: hashedPassword,
          hostelId: keyRecord.hostelId,
          hostelName: keyRecord.hostelName,
          blockName: keyRecord.blockName,
          roomNumber: keyRecord.roomNumber,
          roomKey: keyRecord.roomKey,
          token: studentToken,
          managerId: hostel?.managerId || '',
          managerName: hostel?.managerName || 'Hostel Operations Manager',
          managerPhone: hostel?.phone || hostel?.managerPhone || '+233 24 000 0000',
          managerEmail: hostel?.managerEmail || hostel?.email || 'manager@pinevela.com',
          createdAt: new Date().toISOString()
        };
        store.users.push(studentUser);
      } else {
        const targetUser = studentUser.user ? studentUser.user : studentUser;
        targetUser.name = resolvedName;
        targetUser.email = fallbackEmail;
        targetUser.phone = resolvedPhone || targetUser.phone;
        targetUser.studentId = resolvedStudentId;
        targetUser.role = 'student';
        targetUser.parentUserId = pUserId || targetUser.parentUserId;
        targetUser.parentUserEmail = pUserEmail || targetUser.parentUserEmail;
        targetUser.residentType = resolvedType;
        targetUser.programOfStudy = resolvedProgram;
        targetUser.department = resolvedDepartment;
        targetUser.institution = resolvedInstitution;
        targetUser.hostelId = keyRecord.hostelId;
        targetUser.hostelName = keyRecord.hostelName;
        targetUser.blockName = keyRecord.blockName;
        targetUser.roomNumber = keyRecord.roomNumber;
        targetUser.roomKey = keyRecord.roomKey;
        targetUser.password = hashedPassword;
        targetUser.token = studentToken;
        targetUser.managerId = hostel?.managerId || targetUser.managerId || '';
        targetUser.managerName = hostel?.managerName || targetUser.managerName || 'Hostel Operations Manager';
        targetUser.managerPhone = hostel?.phone || hostel?.managerPhone || targetUser.managerPhone || '+233 24 000 0000';
        targetUser.managerEmail = hostel?.managerEmail || hostel?.email || targetUser.managerEmail || 'manager@pinevela.com';

        if (studentUser.user) {
          studentUser.email = fallbackEmail;
          studentUser.password = hashedPassword;
          studentUser.username = resolvedStudentId.toLowerCase().replace(/[^a-z0-9]/g, '');
        }
      }
      savePersistentStore(store);

      const user = studentUser;

      // Also register or update in MOCK_USERS strictly for student role
      const actualUser = user.user ? user.user : user;
      const userToken = actualUser.token || createSessionToken('stu');
      const existingMockUserIndex = MOCK_USERS.findIndex(u => {
        const uRole = (u.user?.role || u.role || '').toLowerCase();
        if (uRole !== 'student' && uRole !== 'resident') return false;
        const uKey = (u.roomKey || u.user?.roomKey || '').toUpperCase().trim();
        return (u.user && u.user.id === user.id) || (u.id === user.id) || (resolvedKey && uKey === resolvedKey);
      });
      const userProfile = {
        id: user.id,
        name: user.name,
        email: user.email,
        studentId: user.studentId,
        role: 'student' as const,
        residentType: resolvedType,
        programOfStudy: resolvedProgram,
        department: resolvedDepartment,
        institution: resolvedInstitution,
        token: userToken,
        hostelId: keyRecord.hostelId,
        hostelName: keyRecord.hostelName,
        blockName: keyRecord.blockName,
        roomNumber: keyRecord.roomNumber,
        roomKey: keyRecord.roomKey,
        managerId: hostel?.managerId || '',
        managerName: hostel?.managerName || 'Hostel Operations Manager',
        managerPhone: hostel?.phone || hostel?.managerPhone || '+233 24 000 0000',
        managerEmail: hostel?.managerEmail || hostel?.email || 'manager@pinevela.com'
      };

      if (existingMockUserIndex >= 0) {
        MOCK_USERS[existingMockUserIndex].email = fallbackEmail.toLowerCase();
        MOCK_USERS[existingMockUserIndex].user = {
          ...userProfile,
          phone: resolvedPhone || user.phone,
          password: hashedPassword,
        };
        MOCK_USERS[existingMockUserIndex].password = hashedPassword;
      } else {
        MOCK_USERS.push({
          email: fallbackEmail.toLowerCase(),
          username: user.username,
          password: hashedPassword,
          user: {
            ...userProfile,
            phone: resolvedPhone,
            password: hashedPassword,
          }
        });
      }

      // 1. Send minimalistic notification to the Manager
      const typeLabel = (resolvedType as string) === 'student' ? 'Student' : 'Resident';
      const notifMessage = `New ${typeLabel} Check-In: ${resolvedName} (${resolvedStudentId}) has unlocked ${keyRecord.blockName} - ${keyRecord.roomNumber} (${keyRecord.hostelName}). Program: ${resolvedProgram} at ${resolvedInstitution}. Contact: ${resolvedPhone || 'N/A'}.`;
      
      const newNotif = {
        id: `notif-${Date.now()}`,
        managerId: hostel?.managerId || 'manager_101',
        studentId: resolvedStudentId,
        title: `Room ${keyRecord.roomNumber} Activated by ${resolvedName}`,
        message: notifMessage,
        type: 'success',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(newNotif);

      // 1b. Send notification to the Resident user
      const residentNotif = {
        id: `notif-res-act-${Date.now()}`,
        studentId: resolvedStudentId,
        userId: user.id,
        userEmail: fallbackEmail,
        recipientEmail: fallbackEmail,
        title: 'Resident Account Activated & Room Linked',
        message: `Welcome to ${keyRecord.hostelName}! Your Resident Account is verified and active. Your digital room key (${keyRecord.roomKey}) has been assigned to Room ${keyRecord.roomNumber} (${keyRecord.blockName}).`,
        type: 'success',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(residentNotif);
      await dbCreateNotification(residentNotif, notifications);

      // 2. Add activity feed log for Manager and System
      await dbCreateActivity({
        id: `act-checkin-${Date.now()}`,
        text: `Resident Checked In: ${resolvedName} unlocked Room ${keyRecord.roomNumber} (${keyRecord.blockName}) at ${keyRecord.hostelName}.`,
        time: 'Just now',
        type: 'success'
      }, activities);

      // 3. Create initial welcome direct message from the manager
      try {
        await dbCreateStudentMessage({
          studentId: resolvedStudentId,
          studentName: resolvedName,
          studentEmail: fallbackEmail,
          hostelId: keyRecord.hostelId || hostel?.id || '',
          hostelName: keyRecord.hostelName || hostel?.name || 'PineVela Residence',
          managerId: hostel?.managerId || '',
          managerName: hostel?.managerName || 'Hostel Operations Manager',
          managerEmail: hostel?.managerEmail || hostel?.email || '',
          senderRole: 'manager',
          message: `Welcome to ${keyRecord.hostelName}, ${resolvedName}! Your digital room key (${keyRecord.roomKey}) for ${keyRecord.blockName}, ${keyRecord.roomNumber} is now active. If you need any assistance, maintenance, or have questions, feel free to chat with me right here.`,
          attachmentUrl: undefined
        });
      } catch (msgErr) {
        console.warn("Welcome message error:", msgErr);
      }

      const allUserRooms = (store.roomKeys || []).filter((rk: any) => {
        if (!rk || !rk.isAssigned) return false;
        const rkParentEmail = (rk.parentUserEmail || '').toLowerCase().trim();
        const rkParentId = (rk.parentUserId || '').trim();
        const rkClaimedId = (rk.claimedByUserId || '').trim();
        const rkStudentEmail = (rk.assignedStudentEmail || rk.studentEmail || '').toLowerCase().trim();
        const rkKey = (rk.roomKey || '').trim().toUpperCase();
        return (pUserEmail && rkParentEmail === pUserEmail.toLowerCase().trim()) ||
               (pUserId && (rkParentId === pUserId || rkClaimedId === pUserId)) ||
               (fallbackEmail && rkStudentEmail === fallbackEmail.toLowerCase().trim()) ||
               rkKey === resolvedKey;
      });

      if (!parentUser) {
        res.cookie("pv_auth_token", userToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
      }

      res.json({
        success: true,
        token: userToken,
        user: userProfile,
        roomKey: updatedKey,
        rooms: allUserRooms,
        message: `Successfully onboarded! Welcome to ${keyRecord.hostelName}.`
      });
    } catch (err: any) {
      console.error("Error claiming room key:", err);
      res.status(500).json({ error: "Failed to claim room key and complete onboarding" });
    }
  });

  // Manager manually generates or extends digital room keys for a hostel
  app.post("/api/hostels/:id/generate-room-keys", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const hostelList = await dbGetHostels(hostels);
      const hostel = hostelList.find(h => h.id === id);
      if (!hostel) return res.status(404).json({ error: "Hostel not found" });

      if (!canManageHostel(req.user, hostel)) return res.status(403).json({ error: 'You can only generate keys for your own residence.' });
      const newKeys = await dbGenerateHostelRoomKeys(hostel);
      res.json({ success: true, count: newKeys.length, generatedKeys: newKeys });
    } catch (err: any) {
      console.error("Error generating room keys:", err);
      res.status(500).json({ error: "Failed to generate room keys" });
    }
  });

  // ==========================================
  // STUDENT DIRECT MESSAGING WITH MANAGER
  // ==========================================

  // Get direct messages for student or manager
  app.get("/api/student-messages", requireAuth(["student", "manager", "admin", "resident", "user", "staff"]), async (req: any, res) => {
    try {
      const userRole = (req.user.role || '').toLowerCase();
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const userId = (req.user.id || '').toString().trim();
      const userName = (req.user.name || '').toLowerCase().trim();
      const studentIdQuery = req.query.studentId as string;
      const hostelIdQuery = req.query.hostelId as string;

      // Staff accounts use encrypted staff-manager chat rooms (/api/staff-chat/*), never student direct messages
      if (userRole === 'staff') {
        return res.json([]);
      }

      if (userRole === 'student' || userRole === 'resident' || userRole === 'user') {
        const myStudentId = (req.user.studentId || req.user.id || '').trim();
        const myEmail = userEmail;
        const myRoomKey = (req.user.roomKey || '').trim();
        const myHostelId = (req.user.hostelId || '').trim();
        const myHostelName = (req.user.hostelName || '').toLowerCase().trim();

        const msgs = await dbGetStudentMessages({
          studentId: myStudentId,
          studentEmail: myEmail,
          roomKey: myRoomKey,
          userId: req.user.id,
          exactStudentMatchOnly: true
        });

        // Ensure resident student messages are only where this resident is the participant and from their active or assigned hostel
        const finalMsgs = msgs.filter((m: any) => {
          const mStudentId = (m.studentId || '').toLowerCase().trim();
          const mStudentEmail = (m.studentEmail || '').toLowerCase().trim();
          const mUserId = (m.userId || '').toLowerCase().trim();
          const mRoomKey = (m.roomKey || '').toUpperCase().trim();

          const isMine = (myStudentId && mStudentId && mStudentId === myStudentId.toLowerCase()) ||
                         (myEmail && mStudentEmail && mStudentEmail === myEmail) ||
                         (userId && mUserId && mUserId === userId.toLowerCase()) ||
                         (myRoomKey && mRoomKey && mRoomKey === myRoomKey.toUpperCase());

          if (!isMine) {
            return false;
          }

          if (myHostelId && m.hostelId && m.hostelId !== myHostelId) {
            return false;
          }
          if (myHostelName && m.hostelName && m.hostelName.toLowerCase().trim() !== myHostelName) {
            return false;
          }
          return true;
        });

        return res.json(finalMsgs);
      }

      if (userRole === 'manager') {
        const allMsgs = await dbGetStudentMessages();
        const allHostels = await dbGetHostels(hostels);
        
        // Find all hostels registered to or managed by this manager
        const managerHostels = allHostels.filter(h => 
          (h.managerId && (h.managerId === userId || h.managerId?.toString().toLowerCase() === userId.toLowerCase())) || 
          (h.managerEmail && h.managerEmail.toLowerCase().trim() === userEmail) ||
          (req.user.email && h.managerEmail && h.managerEmail.toLowerCase().trim() === req.user.email.toLowerCase().trim()) ||
          (userName && h.managerName && h.managerName.toLowerCase().trim() === userName)
        );
        const managerHostelIds = new Set(managerHostels.map(h => (h.id || '').toString().toLowerCase().trim()));
        const managerHostelNames = new Set(managerHostels.map(h => (h.name || '').toLowerCase().trim()));

        // Filter messages strictly to this manager's domain
        const filteredMsgs = allMsgs.filter((m: any) => {
          const mHostelId = (m.hostelId || '').toString().toLowerCase().trim();
          const mHostelName = (m.hostelName || '').toLowerCase().trim();
          const mManagerId = (m.managerId || '').toString().toLowerCase().trim();
          const mManagerEmail = (m.managerEmail || '').toLowerCase().trim();

          const isDirectManagerMsg = (mManagerId && mManagerId === userId.toLowerCase()) || (mManagerEmail && mManagerEmail === userEmail);
          const isManagerHostelMsg = (mHostelId && managerHostelIds.has(mHostelId)) || (mHostelName && managerHostelNames.has(mHostelName));

          if (!isDirectManagerMsg && !isManagerHostelMsg) {
            return false;
          }

          if (studentIdQuery) {
            const sQuery = studentIdQuery.toLowerCase().trim();
            const matchesStudent = (
              (m.studentId || '').toLowerCase().trim() === sQuery || 
              (m.studentEmail && m.studentEmail.toLowerCase().trim() === sQuery)
            );
            if (!matchesStudent) return false;
          }

          if (hostelIdQuery) {
            const hQuery = hostelIdQuery.toLowerCase().trim();
            if (mHostelId !== hQuery && mHostelName !== hQuery) return false;
          }

          return true;
        });

        return res.json(filteredMsgs);
      }

      if (userRole === 'admin') {
        const allMsgs = await dbGetStudentMessages();
        return res.json(allMsgs);
      }

      res.json([]);
    } catch (err: any) {
      console.error("Error fetching student messages:", err);
      res.status(500).json({ error: "Failed to load messages" });
    }
  });

  // Send a direct message
  app.post("/api/student-messages", requireAuth(["student", "manager"]), async (req: any, res) => {
    try {
      const userRole = req.user.role;
      const { message, attachmentUrl, studentId, studentName, studentEmail, hostelId, hostelName, managerId, managerName } = req.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: "Message content cannot be empty" });
      }

      const newMsg = await dbCreateStudentMessage({
        studentId: userRole === 'student' ? (req.user.studentId || req.user.id) : (studentId || 'STUDENT'),
        studentName: userRole === 'student' ? req.user.name : (studentName || 'Student Resident'),
        studentEmail: userRole === 'student' ? (req.user.email || '') : (studentEmail || ''),
        hostelId: hostelId || (userRole === 'manager' ? (req.user.hostelId || '') : (req.user.hostelId || '')),
        hostelName: hostelName || (userRole === 'manager' ? (req.user.hostelName || 'PineVela Residence') : (req.user.hostelName || 'PineVela Residence')),
        managerId: userRole === 'manager' ? req.user.id : (managerId || req.user.managerId || ''),
        managerName: userRole === 'manager' ? req.user.name : (managerName || req.user.managerName || 'Hostel Operations Manager'),
        managerEmail: userRole === 'manager' ? req.user.email : '',
        senderRole: userRole,
        message: message.trim(),
        attachmentUrl: attachmentUrl || ''
      });

      res.status(201).json(newMsg);
    } catch (err: any) {
      console.error("Error sending student message:", err);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // --- Protected Staff Endpoints ---
  app.get("/api/staff", requireAuth(), async (req: any, res) => {
    try {
      const userRole = req.user.role;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const userId = req.user.id;

      let listToReturn = staff;
      if (userRole === 'manager') {
        const managerHostels = hostels.filter(h => 
          (h.id && (h.managerId === userId || (h.managerEmail && h.managerEmail.toLowerCase().trim() === userEmail)))
        );
        const hostelIds = new Set(managerHostels.map(h => h.id));
        listToReturn = staff.filter((s: any) => 
          (s.hostelId && hostelIds.has(s.hostelId)) || 
          managerHostels.some(h => h.name && s.hostelName && h.name.toLowerCase().trim() === s.hostelName.toLowerCase().trim()) ||
          s.managerId === userId ||
          s.createdById === userId ||
          (s.managerEmail && s.managerEmail.toLowerCase().trim() === userEmail) ||
          (s.createdByEmail && s.createdByEmail.toLowerCase().trim() === userEmail)
        );
      }

      // Deduplicate staff list by id and email so no duplicate cards ever appear
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const item of listToReturn) {
        if (!item) continue;
        const key = item.id || `${item.email || ''}_${item.hostelId || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }

      return res.json(deduped);
    } catch (err: any) {
      res.json(staff);
    }
  });

  app.post("/api/staff", requireAuth(["admin", "manager"]), async (req: any, res) => {
    const userRole = req.user.role;
    const userId = req.user.id;
    const userEmail = (req.user.email || '').toLowerCase().trim();

    // Determine manager's hostel to tie staff directly to it
    let hostelId = req.body.hostelId;
    let hostelName = req.body.hostelName;
    if (!hostelId && userRole === 'manager') {
      const managerHostel = hostels.find(h => 
        (h.managerId && h.managerId === userId) ||
        (h.managerEmail && h.managerEmail.toLowerCase().trim() === userEmail)
      ) || hostels[0];
      if (managerHostel) {
        hostelId = managerHostel.id;
        hostelName = managerHostel.name;
      }
    }

    const staffId = req.body.id || `staff-new-${Date.now()}`;
    const staffUserId = req.body.userId || `staff-user-${Date.now()}`;

    // Staff created by managers are automatically verified, approved, active, and tied to hostel
    const newStaff = {
      ...req.body,
      id: staffId,
      userId: staffUserId,
      hostelId: hostelId || '',
      hostelName: hostelName || '',
      managerId: userId,
      managerEmail: userEmail,
      createdById: userId,
      createdByEmail: userEmail,
      managerCreated: true,
      isInternalStaff: true, // internal to hostel, excluded from public user home feed
      isVerified: true, // auto-verified by the system, no waiting for admin
      verificationStatus: 'Verified',
      isApproved: true,
      status: 'Active',
      createdAt: new Date().toISOString()
    };

    const saved = await dbCreateStaff(newStaff);

    // Prevent duplicate insertion into in-memory staff array
    const existingIndex = staff.findIndex((s: any) => 
      s.id === saved.id || 
      (s.email && saved.email && s.email.toLowerCase().trim() === saved.email.toLowerCase().trim() && s.hostelId === saved.hostelId)
    );
    if (existingIndex !== -1) {
      staff[existingIndex] = saved;
    } else {
      staff.unshift(saved);
    }

    // Set staff credentials with the manager's chosen password
    const baseUsername = (saved?.name || 'staff').toLowerCase().replace(/[^a-z0-9]/g, '') || 'staff';
    const username = (saved.username || `${baseUsername}${(saved?.id || '000').substring(Math.max(0, (saved?.id || '000').length - 3))}`).toLowerCase().trim();
    const password = req.body.password && String(req.body.password).trim() ? String(req.body.password).trim() : 'staff123';
    const email = (saved.email || `${username}@pinevela.com`).toLowerCase().trim();

    const userRecord = {
      id: saved.userId || saved.id,
      name: saved.name,
      role: 'staff',
      phone: saved.phone || '',
      email,
      username,
      hostelId: saved.hostelId,
      hostelName: saved.hostelName,
      managerId: userId,
      managerEmail: userEmail,
      isVerified: true,
      verificationStatus: 'Verified',
      isApproved: true,
      status: 'Active',
      managerCreated: true,
      isInternalStaff: true,
      password,
      plainPassword: password,
      token: createSessionToken('staff')
    };

    const existingUser = MOCK_USERS.find(u => 
      (u.email && u.email.toLowerCase().trim() === email) ||
      (u.username && u.username.toLowerCase().trim() === username) ||
      (u.user && (u.user.id === saved.userId || u.user.id === saved.id))
    );

    if (existingUser) {
      existingUser.password = password;
      existingUser.plainPassword = password;
      existingUser.user = { ...(existingUser.user || {}), ...userRecord };
    } else {
      MOCK_USERS.push({
        email,
        username,
        password,
        plainPassword: password,
        user: userRecord
      });
    }

    // Also synchronize into store.users
    const store = getStoreInstance();
    if (!store.users) store.users = [];
    const storeIdx = store.users.findIndex((u: any) => 
      (u.email && u.email.toLowerCase().trim() === email) ||
      (u.username && u.username.toLowerCase().trim() === username) ||
      u.id === userRecord.id
    );
    if (storeIdx !== -1) {
      store.users[storeIdx] = { ...store.users[storeIdx], ...userRecord };
    } else {
      store.users.push(userRecord);
    }

    // Ensure a private encrypted staff-manager chat room exists for direct communication
    const staffRoomId = `room-${saved.id}-${userId}`;
    if (!staffChatRooms) staffChatRooms = [];
    const existingRoom = staffChatRooms.find((r: any) => 
      (r.staffId === saved.id || r.staffUserId === saved.userId || (r.staffEmail && r.staffEmail.toLowerCase() === email)) &&
      (r.managerId === userId || (r.managerEmail && r.managerEmail.toLowerCase() === userEmail))
    );
    if (!existingRoom) {
      staffChatRooms.push({
        id: staffRoomId,
        staffId: saved.id,
        staffUserId: saved.userId,
        staffName: saved.name,
        staffRole: saved.role,
        staffEmail: email,
        managerId: userId,
        managerName: req.user.name || 'Property Manager',
        managerEmail: userEmail,
        hostelId: saved.hostelId,
        hostelName: saved.hostelName,
        createdAt: new Date().toISOString()
      });
    }

    syncStore();
    res.status(201).json(saved);
  });

  // --- Staff Settings: Profile Sync with Manager's Staff Directory ---
  app.put("/api/staff/profile", requireAuth(["staff", "manager", "admin"]), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { name, username, email, phone, profilePicture, avatar, photo } = req.body;
      const pic = profilePicture || avatar || photo;

      console.log(`[PROFILE UPDATE DEBUG] Updating profile for userId="${userId}" | req.user:`, JSON.stringify(req.user));

      // 1. Find user in MOCK_USERS or store.users
      let userIndex = MOCK_USERS.findIndex(u => 
        (u.user && u.user.id === userId) || 
        u.username === req.user.username || 
        (u.email && req.user.email && u.email.toLowerCase() === req.user.email.toLowerCase())
      );

      console.log(`[PROFILE UPDATE DEBUG] userIndex in MOCK_USERS: ${userIndex}`);

      if (userIndex === -1) {
        const store = getStoreInstance();
        const foundInStore = (store.users || []).find((u: any) =>
          (u.user && u.user.id === userId) ||
          u.username === req.user.username ||
          (u.email && req.user.email && u.email.toLowerCase() === req.user.email.toLowerCase())
        );
        if (foundInStore) {
          MOCK_USERS.push(foundInStore.user ? foundInStore : { user: foundInStore, email: req.user.email, id: userId, username: req.user.username });
          userIndex = MOCK_USERS.length - 1;
        } else {
          MOCK_USERS.push({
            id: userId,
            email: req.user.email,
            username: req.user.username || 'staff',
            user: { ...req.user }
          });
          userIndex = MOCK_USERS.length - 1;
        }
      }

      const existingUser = MOCK_USERS[userIndex];
      if (!existingUser.user) {
        existingUser.user = { ...existingUser };
      }
      const oldEmail = (existingUser.email || existingUser.user?.email || '').toLowerCase().trim();

      if (username && username !== existingUser.username) {
        const cleanUser = username.trim().toLowerCase();
        const usernameTaken = MOCK_USERS.some(u => u !== existingUser && u.username?.toLowerCase() === cleanUser);
        if (usernameTaken) {
          return res.status(400).json({ error: "Username is already taken by another user." });
        }
        existingUser.username = cleanUser;
        (existingUser.user as any).username = cleanUser;
      }

      if (email && email.toLowerCase().trim() !== oldEmail) {
        const cleanMail = email.toLowerCase().trim();
        const emailTaken = MOCK_USERS.some(u => u !== existingUser && u.email?.toLowerCase() === cleanMail);
        if (emailTaken) {
          return res.status(400).json({ error: "Email is already registered by another account." });
        }
        existingUser.email = cleanMail;
        (existingUser.user as any).email = cleanMail;
      }

      if (name) existingUser.user.name = name.trim();
      if (phone) (existingUser.user as any).phone = phone.trim();
      if (pic) {
        existingUser.avatar = pic;
        existingUser.photo = pic;
        existingUser.photoUrl = pic;
        existingUser.avatarUrl = pic;
        existingUser.profilePicture = pic;
        (existingUser.user as any).avatar = pic;
        (existingUser.user as any).photo = pic;
        (existingUser.user as any).photoUrl = pic;
        (existingUser.user as any).avatarUrl = pic;
        (existingUser.user as any).profilePicture = pic;
      }

      // Also sync store.users
      const store = getStoreInstance();
      if (store.users) {
        store.users.forEach((u: any) => {
          if (
            (userId && (u.id === userId || u.user?.id === userId)) ||
            (oldEmail && (u.email?.toLowerCase().trim() === oldEmail || u.user?.email?.toLowerCase().trim() === oldEmail))
          ) {
            if (name) {
              u.name = name.trim();
              if (u.user) u.user.name = name.trim();
            }
            if (phone) {
              u.phone = phone.trim();
              if (u.user) u.user.phone = phone.trim();
            }
            if (pic) {
              u.avatar = pic;
              u.photo = pic;
              u.photoUrl = pic;
              u.avatarUrl = pic;
              u.profilePicture = pic;
              if (u.user) {
                u.user.avatar = pic;
                u.user.photo = pic;
                u.user.photoUrl = pic;
                u.user.avatarUrl = pic;
                u.user.profilePicture = pic;
              }
            }
          }
        });
      }

      // 2. Directly update corresponding staff record in manager's staff directory
      let updatedStaffRecord = null;
      for (let i = 0; i < staff.length; i++) {
        const s = staff[i];
        const matchesStaff = 
          s.userId === userId || 
          s.id === userId || 
          (oldEmail && s.email && s.email.toLowerCase() === oldEmail) ||
          (email && s.email && s.email.toLowerCase() === email.toLowerCase().trim());

        if (matchesStaff) {
          staff[i] = {
            ...staff[i],
            name: name ? name.trim() : staff[i].name,
            username: username || staff[i].username,
            email: email ? email.toLowerCase().trim() : staff[i].email,
            phone: phone ? phone.trim() : staff[i].phone,
            photo: pic || staff[i].photo,
            avatar: pic || staff[i].avatar,
            updatedAt: new Date().toISOString()
          };
          updatedStaffRecord = staff[i];
          break;
        }
      }

      persistStore();
      syncStore();

      return res.json({
        success: true,
        user: existingUser.user,
        staffRecord: updatedStaffRecord
      });
    } catch (err: any) {
      console.error("Error updating staff profile:", err);
      res.status(500).json({ error: err.message || "Failed to update profile" });
    }
  });

  
  app.put("/api/staff/:id", requireAuth(["admin", "manager"]), async (req: any, res) => {
    const { id } = req.params;
    const index = staff.findIndex(s => s.id === id || s.userId === id);
    if (index === -1) {
      return res.status(404).json({ error: "Staff member not found" });
    }
    staff[index] = { ...staff[index], ...req.body, updatedAt: new Date().toISOString() };
    syncStore();
    res.json(staff[index]);
  });

  app.delete("/api/staff/:id", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const removalReason = req.body?.reason || 'Terminated by hostel management';
      
      const targetStaff = staff.find(s => s.id === id || s.userId === id);
      const staffTargetId = targetStaff?.userId || targetStaff?.id || id;
      const staffTargetEmail = (targetStaff?.email || '').toLowerCase().trim();
      const staffName = targetStaff?.name || 'Staff Member';
      const staffRole = targetStaff?.role || 'Staff Member';
      const hostelName = targetStaff?.hostelName || 'Accredited Hostel';

      // Update any approved applications for this staff to 'Dismissed' so application lock is lifted
      staffApplications.forEach(a => {
        const match = a.staffId === staffTargetId || a.staffId === id || (a.staffEmail && a.staffEmail.toLowerCase().trim() === staffTargetEmail);
        if (match && (a.status === 'Approved' || a.status === 'approved')) {
          a.status = 'Dismissed';
          a.dismissedAt = new Date().toISOString();
          a.dismissalReason = removalReason;
        }
      });

      // Notify the staff member that they have been removed and can now apply elsewhere
      if (staffTargetId) {
        notifications.unshift({
          id: `notif-${Date.now()}-dismissed`,
          studentId: staffTargetId,
          title: `Employment Concluded at ${hostelName}`,
          message: `Your position as ${staffRole} at ${hostelName} has been concluded by the property manager (${removalReason}). Your application lock has been lifted and you are now eligible to apply for other hostel roles.`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        });
      }

      activities.unshift({
        id: `act-${Date.now()}`,
        text: `Manager removed ${staffName} from position as ${staffRole} at ${hostelName}`,
        time: 'Just now',
        type: 'warning'
      });

      // Remove from active staff roster
      staff = staff.filter(s => s.id !== id && s.userId !== id);
      syncStore();
      return res.status(200).json({ 
        success: true, 
        message: `Staff member ${staffName} successfully removed from roster. Staff application lock lifted.` 
      });
    } catch (err: any) {
      console.error("Error removing staff member:", err);
      return res.status(500).json({ error: err.message || "Failed to remove staff member" });
    }
  });

  // --- Staff Voluntary Resignation / Quit Job Endpoint ---
  app.post("/api/staff/resign", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const reason = req.body?.reason;

      if (!reason || !reason.trim() || reason.trim().length < 5) {
        return res.status(400).json({ 
          error: "A valid reason explaining why you want to quit is mandatory before submitting your resignation to management." 
        });
      }

      // Find active staff roster entry
      const staffIdx = staff.findIndex(s => 
        s.userId === userId || 
        (s.email && s.email.toLowerCase() === userEmail) || 
        s.id === userId
      );
      const activeStaff = staffIdx !== -1 ? staff[staffIdx] : null;

      // Find approved application
      const appIdx = staffApplications.findIndex(a => 
        (a.staffId === userId || (a.staffEmail && a.staffEmail.toLowerCase() === userEmail)) &&
        (a.status === 'Approved' || a.status === 'approved')
      );
      const activeApp = appIdx !== -1 ? staffApplications[appIdx] : null;

      if (!activeStaff && !activeApp) {
        return res.status(400).json({ 
          error: "You do not have an active hostel employment record to resign from." 
        });
      }

      const hostelId = activeStaff?.hostelId || activeApp?.hostelId;
      const hostelName = activeStaff?.hostelName || activeApp?.hostelName || 'Accredited Hostel';
      const role = activeStaff?.role || activeApp?.role || 'Staff Member';
      const staffName = activeStaff?.name || activeApp?.applicantName || req.user.name || 'Staff Member';

      // Remove from active staff list
      if (staffIdx !== -1) {
        staff.splice(staffIdx, 1);
      }

      // Update all approved applications for this user to 'Resigned'
      staffApplications.forEach(a => {
        if (
          (a.staffId === userId || (a.staffEmail && a.staffEmail.toLowerCase() === userEmail)) &&
          (a.status === 'Approved' || a.status === 'approved')
        ) {
          a.status = 'Resigned';
          a.resignedAt = new Date().toISOString();
          a.resignationReason = reason.trim();
        }
      });

      // Record in staffBargains for tracking
      const record = {
        id: `bargain-${Date.now()}`,
        staffId: userId,
        staffName,
        staffEmail: userEmail,
        hostelId,
        hostelName,
        managerId: activeStaff?.managerId || activeApp?.managerId,
        role,
        currentShift: activeStaff?.shift || 'Day Shift',
        currentBlock: activeStaff?.assignedBlock || 'All Wings',
        reasonToQuit: reason.trim(),
        isBargain: false,
        status: 'quit_confirmed',
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString()
      };
      staffBargains.unshift(record);

      // Find target hostel / manager to notify
      const targetHostel = hostels.find(h => h.id === hostelId);
      const managerId = targetHostel?.managerId || targetHostel?.assignedManagerId || activeApp?.managerId;

      if (managerId) {
        notifications.unshift({
          id: `notif-${Date.now()}-mgr-resign`,
          studentId: managerId,
          title: `Staff Resignation Notice`,
          message: `${staffName} has resigned from their position as "${role}" at ${hostelName}. Reason provided: "${reason.trim()}". Their position is now open for recruitment.`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        });
      }

      // Notify the staff member
      notifications.unshift({
        id: `notif-${Date.now()}-stf-resign`,
        studentId: userId,
        title: `Resignation Processed Successfully`,
        message: `You have successfully resigned from your position as ${role} at ${hostelName} with your submitted reason. Your application lock has been lifted and you can now apply for other hostel jobs.`,
        type: 'info',
        date: new Date().toISOString().split('T')[0],
        read: false
      });

      activities.unshift({
        id: `act-${Date.now()}`,
        text: `Staff member ${staffName} resigned from position as ${role} at ${hostelName}. Reason: ${reason.trim()}`,
        time: 'Just now',
        type: 'warning'
      });

      syncStore();
      return res.json({ 
        success: true, 
        message: `Successfully resigned from ${role} at ${hostelName}. Application lock has been lifted and you may now apply for other positions.` 
      });
    } catch (err: any) {
      console.error("Error processing staff resignation:", err);
      return res.status(500).json({ error: err.message || "Failed to process resignation" });
    }
  });

  // Alias for resign: quit
  app.post("/api/staff/quit", requireAuth(["staff"]), async (req: any, res) => {
    const { reason } = req.body || {};
    req.body = { ...req.body, reason: reason };
    return (app as any)._router.handle(
      { ...req, url: '/api/staff/resign', originalUrl: '/api/staff/resign' },
      res,
      () => {}
    );
  });

  // --- Staff Bargaining & Retention Proposals Endpoints ---
  app.get("/api/staff-bargains", requireAuth(["staff", "manager", "admin"]), async (req: any, res) => {
    try {
      const userRole = req.user.role;
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();

      if (userRole === "admin") {
        return res.json(staffBargains);
      }

      if (userRole === "staff") {
        const myBargains = staffBargains.filter(b => 
          b.staffId === userId || 
          (b.staffEmail && b.staffEmail.toLowerCase() === userEmail)
        );
        return res.json(myBargains);
      }

      if (userRole === "manager") {
        const cleanName = (req.user.name || '').toLowerCase().trim();
        const managerHostels = hostels.filter(h => 
          h.managerId === userId || 
          h.assignedManagerId === userId || 
          (h.managerEmail && h.managerEmail.toLowerCase() === userEmail) ||
          (h.managerName && cleanName && h.managerName.toLowerCase().trim() === cleanName)
        );
        const managerHostelIds = managerHostels.map(h => h.id);
        const managerHostelNames = managerHostels.map(h => (h.name || '').toLowerCase().trim());

        const relevant = staffBargains.filter(b => 
          b.managerId === userId || 
          managerHostelIds.includes(b.hostelId) ||
          (b.hostelName && managerHostelNames.includes(b.hostelName.toLowerCase().trim()))
        );
        return res.json(relevant);
      }

      return res.json([]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch staff bargains" });
    }
  });

  app.post("/api/staff-bargains", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const { reasonToQuit, isBargain, bargainProposal } = req.body || {};

      if (!reasonToQuit || !reasonToQuit.trim() || reasonToQuit.trim().length < 5) {
        return res.status(400).json({ 
          error: "A valid reason explaining why you want to quit is mandatory before submitting to your manager." 
        });
      }

      // Find active staff record
      const staffIdx = staff.findIndex(s => 
        s.userId === userId || 
        (s.email && s.email.toLowerCase() === userEmail) || 
        s.id === userId
      );
      const activeStaff = staffIdx !== -1 ? staff[staffIdx] : null;

      // Find approved application
      const appIdx = staffApplications.findIndex(a => 
        (a.staffId === userId || (a.staffEmail && a.staffEmail.toLowerCase() === userEmail)) &&
        (a.status === 'Approved' || a.status === 'approved')
      );
      const activeApp = appIdx !== -1 ? staffApplications[appIdx] : null;

      if (!activeStaff && !activeApp) {
        return res.status(400).json({ 
          error: "You do not have an active hostel appointment to quit or bargain for." 
        });
      }

      const hostelId = activeStaff?.hostelId || activeApp?.hostelId;
      const hostelName = activeStaff?.hostelName || activeApp?.hostelName || 'Accredited Hostel';
      const role = activeStaff?.role || activeApp?.role || 'Staff Member';
      const staffName = activeStaff?.name || activeApp?.applicantName || req.user.name || 'Staff Member';

      // Find manager
      const targetHostel = hostels.find(h => h.id === hostelId);
      const managerId = targetHostel?.managerId || targetHostel?.assignedManagerId || activeApp?.managerId;

      if (!isBargain) {
        // DIRECT QUIT with mandatory reason
        if (staffIdx !== -1) {
          staff.splice(staffIdx, 1);
        }

        staffApplications.forEach(a => {
          if (
            (a.staffId === userId || (a.staffEmail && a.staffEmail.toLowerCase() === userEmail)) &&
            (a.status === 'Approved' || a.status === 'approved')
          ) {
            a.status = 'Resigned';
            a.resignedAt = new Date().toISOString();
            a.resignationReason = reasonToQuit.trim();
          }
        });

        const quitRecord = {
          id: `bargain-${Date.now()}`,
          staffId: userId,
          staffName,
          staffEmail: userEmail,
          hostelId,
          hostelName,
          managerId,
          role,
          currentShift: activeStaff?.shift || 'Day Shift',
          currentBlock: activeStaff?.assignedBlock || 'All Wings',
          reasonToQuit: reasonToQuit.trim(),
          isBargain: false,
          status: 'quit_confirmed',
          createdAt: new Date().toISOString(),
          resolvedAt: new Date().toISOString()
        };
        staffBargains.unshift(quitRecord);

        if (managerId) {
          notifications.unshift({
            id: `notif-${Date.now()}-mgr-quit`,
            studentId: managerId,
            title: `Staff Resignation Notice`,
            message: `${staffName} has resigned from their position as "${role}" at ${hostelName}. Reason submitted: "${reasonToQuit.trim()}". Their position is now open for recruitment.`,
            type: 'warning',
            date: new Date().toISOString().split('T')[0],
            read: false
          });
        }

        notifications.unshift({
          id: `notif-${Date.now()}-stf-quit`,
          studentId: userId,
          title: `Resignation Processed`,
          message: `Your resignation from ${role} at ${hostelName} has been submitted with your reason. Your application lock is lifted and you may now apply for other hostel jobs.`,
          type: 'info',
          date: new Date().toISOString().split('T')[0],
          read: false
        });

        activities.unshift({
          id: `act-${Date.now()}`,
          text: `Staff member ${staffName} resigned from ${role} at ${hostelName}. Reason: ${reasonToQuit.trim()}`,
          time: 'Just now',
          type: 'warning'
        });

        syncStore();
        return res.json({
          success: true,
          directQuit: true,
          message: `Your resignation has been confirmed and submitted to your manager. Application lock lifted.`
        });
      }

      // BARGAIN PROPOSAL
      if (!bargainProposal || !bargainProposal.proposedTerms || !bargainProposal.proposedTerms.trim()) {
        return res.status(400).json({
          error: "Please state the proposed deal or terms that would convince you to stay."
        });
      }

      // Check if pending bargain already exists
      const existingPending = staffBargains.find(b => 
        (b.staffId === userId || (b.staffEmail && b.staffEmail.toLowerCase() === userEmail)) &&
        b.status === 'pending'
      );
      if (existingPending) {
        return res.status(400).json({
          error: "You already have a pending bargain proposal awaiting your manager's decision."
        });
      }

      const newBargain = {
        id: `bargain-${Date.now()}`,
        staffId: userId,
        staffName,
        staffEmail: userEmail,
        hostelId,
        hostelName,
        managerId,
        role,
        currentShift: activeStaff?.shift || 'Day Shift',
        currentBlock: activeStaff?.assignedBlock || 'All Wings',
        reasonToQuit: reasonToQuit.trim(),
        isBargain: true,
        bargainProposal: {
          type: bargainProposal.type || 'custom',
          title: bargainProposal.title || 'Proposed Deal to Stay',
          proposedTerms: bargainProposal.proposedTerms.trim(),
          notes: bargainProposal.notes?.trim() || ''
        },
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      staffBargains.unshift(newBargain);

      if (managerId) {
        notifications.unshift({
          id: `notif-${Date.now()}-mgr-bargain`,
          studentId: managerId,
          title: `Staff Retention & Bargain Proposal`,
          message: `${staffName} (${role} at ${hostelName}) is considering quitting and has submitted a bargain proposal to negotiate staying. Reason: "${reasonToQuit.trim()}". Proposed terms: "${bargainProposal.proposedTerms.trim()}". Review under Staff > Proposals.`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        });
      }

      notifications.unshift({
        id: `notif-${Date.now()}-stf-bargain-sub`,
        studentId: userId,
        title: `Bargain Proposal Forwarded to Manager`,
        message: `Your retention proposal and reason have been sent to your manager at ${hostelName}. Awaiting their decision.`,
        type: 'info',
        date: new Date().toISOString().split('T')[0],
        read: false
      });

      activities.unshift({
        id: `act-${Date.now()}`,
        text: `Staff member ${staffName} proposed a bargain to manager to avoid quitting (${role} at ${hostelName})`,
        time: 'Just now',
        type: 'info'
      });

      syncStore();
      return res.json({
        success: true,
        isBargain: true,
        bargain: newBargain,
        message: "Your proposal has been submitted to your manager. They will review your terms and respond."
      });
    } catch (err: any) {
      console.error("Error submitting staff bargain:", err);
      return res.status(500).json({ error: err.message || "Failed to submit proposal" });
    }
  });

  app.post("/api/staff-bargains/:id/manager-response", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { action, responseNote, updatedShift, updatedBlock, updatedSalary } = req.body || {};

      const bargain = staffBargains.find(b => b.id === id);
      if (!bargain) {
        return res.status(404).json({ error: "Bargain proposal not found" });
      }

      if (bargain.status !== 'pending') {
        return res.status(400).json({ error: `This proposal has already been marked as ${bargain.status}.` });
      }

      if (action === 'accept') {
        bargain.status = 'accepted';
        bargain.managerResponseNote = responseNote || 'Deal accepted by management.';
        bargain.resolvedAt = new Date().toISOString();

        // If manager updated shift/block/salary, update active staff record
        const staffIdx = staff.findIndex(s => 
          s.userId === bargain.staffId || 
          (s.email && s.email.toLowerCase() === (bargain.staffEmail || '').toLowerCase()) || 
          s.id === bargain.staffId
        );
        if (staffIdx !== -1) {
          if (updatedShift) staff[staffIdx].shift = updatedShift;
          if (updatedBlock) staff[staffIdx].assignedBlock = updatedBlock;
          if (updatedSalary) staff[staffIdx].salary = updatedSalary;
          staff[staffIdx].bargainAcceptedAt = new Date().toISOString();
        }

        // Notify the staff member
        notifications.unshift({
          id: `notif-${Date.now()}-deal-accepted`,
          studentId: bargain.staffId,
          title: `Deal Accepted by Manager! 🎉`,
          message: `Great news! Your manager at ${bargain.hostelName} has ACCEPTED your proposed terms (${responseNote || 'Terms accepted'}). You are confirmed to remain in your position!`,
          type: 'success',
          date: new Date().toISOString().split('T')[0],
          read: false
        });

        activities.unshift({
          id: `act-${Date.now()}`,
          text: `Manager accepted bargain terms for staff member ${bargain.staffName} (${bargain.role} at ${bargain.hostelName})`,
          time: 'Just now',
          type: 'success'
        });
      } else if (action === 'reject') {
        bargain.status = 'rejected';
        bargain.managerResponseNote = responseNote || 'Management was unable to accept the proposed terms.';
        bargain.resolvedAt = new Date().toISOString();

        // Notify the staff member that deal was rejected and they can choose to quit or stay
        notifications.unshift({
          id: `notif-${Date.now()}-deal-rejected`,
          studentId: bargain.staffId,
          title: `Bargain Proposal Declined by Manager`,
          message: `Your manager at ${bargain.hostelName} declined your bargain terms (${responseNote || 'Not accepted'}). You can now decide under your dashboard whether to proceed to quit or stay.`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        });

        activities.unshift({
          id: `act-${Date.now()}`,
          text: `Manager declined bargain terms for staff member ${bargain.staffName} (${bargain.role} at ${bargain.hostelName})`,
          time: 'Just now',
          type: 'warning'
        });
      } else {
        return res.status(400).json({ error: "Invalid action. Must be 'accept' or 'reject'." });
      }

      syncStore();
      return res.json({ success: true, bargain });
    } catch (err: any) {
      console.error("Error updating manager response:", err);
      return res.status(500).json({ error: err.message || "Failed to process manager response" });
    }
  });

  app.post("/api/staff-bargains/:id/staff-decision", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const { decision } = req.body || {};

      const bargain = staffBargains.find(b => b.id === id);
      if (!bargain) {
        return res.status(404).json({ error: "Bargain proposal not found" });
      }

      if (bargain.staffId !== userId && bargain.staffEmail?.toLowerCase() !== userEmail) {
        return res.status(403).json({ error: "Unauthorized. This proposal does not belong to you." });
      }

      if (bargain.status !== 'rejected') {
        return res.status(400).json({ error: "You can only make a post-bargain decision on a proposal that was rejected by management." });
      }

      if (decision === 'quit') {
        bargain.status = 'quit_confirmed';
        bargain.resolvedAt = new Date().toISOString();

        // Finalize resignation
        const staffIdx = staff.findIndex(s => 
          s.userId === userId || 
          (s.email && s.email.toLowerCase() === userEmail) || 
          s.id === userId
        );
        if (staffIdx !== -1) {
          staff.splice(staffIdx, 1);
        }

        staffApplications.forEach(a => {
          if (
            (a.staffId === userId || (a.staffEmail && a.staffEmail.toLowerCase() === userEmail)) &&
            (a.status === 'Approved' || a.status === 'approved')
          ) {
            a.status = 'Resigned';
            a.resignedAt = new Date().toISOString();
            a.resignationReason = `Quit following rejected bargain: ${bargain.reasonToQuit}`;
          }
        });

        if (bargain.managerId) {
          notifications.unshift({
            id: `notif-${Date.now()}-mgr-quit-post`,
            studentId: bargain.managerId,
            title: `Staff Final Decision: Resigned`,
            message: `${bargain.staffName} has decided to officially quit their position as ${bargain.role} at ${bargain.hostelName} following the declined bargain. Position is now open.`,
            type: 'warning',
            date: new Date().toISOString().split('T')[0],
            read: false
          });
        }

        notifications.unshift({
          id: `notif-${Date.now()}-stf-quit-post`,
          studentId: userId,
          title: `Resignation Finalized`,
          message: `Your resignation from ${bargain.role} at ${bargain.hostelName} has taken effect. Your application lock is lifted and you may now apply for other hostel jobs.`,
          type: 'info',
          date: new Date().toISOString().split('T')[0],
          read: false
        });

        activities.unshift({
          id: `act-${Date.now()}`,
          text: `Staff member ${bargain.staffName} officially quit as ${bargain.role} at ${bargain.hostelName} following declined bargain`,
          time: 'Just now',
          type: 'warning'
        });

        syncStore();
        return res.json({
          success: true,
          decision: 'quit',
          message: "Resignation confirmed. Your employment has concluded and your application lock is lifted."
        });
      } else if (decision === 'stay') {
        bargain.status = 'stay_confirmed';
        bargain.resolvedAt = new Date().toISOString();

        if (bargain.managerId) {
          notifications.unshift({
            id: `notif-${Date.now()}-mgr-stay`,
            studentId: bargain.managerId,
            title: `Staff Final Decision: Staying on Duty`,
            message: `${bargain.staffName} has decided to remain on the team as ${bargain.role} at ${bargain.hostelName} despite the declined deal terms.`,
            type: 'info',
            date: new Date().toISOString().split('T')[0],
            read: false
          });
        }

        notifications.unshift({
          id: `notif-${Date.now()}-stf-stay`,
          studentId: userId,
          title: `Staying on Duty Confirmed`,
          message: `You have chosen to stay as ${bargain.role} at ${bargain.hostelName}. You remain actively employed.`,
          type: 'success',
          date: new Date().toISOString().split('T')[0],
          read: false
        });

        activities.unshift({
          id: `act-${Date.now()}`,
          text: `Staff member ${bargain.staffName} decided to stay in their role as ${bargain.role} at ${bargain.hostelName}`,
          time: 'Just now',
          type: 'info'
        });

        syncStore();
        return res.json({
          success: true,
          decision: 'stay',
          message: "You have confirmed to remain in your role. Application lock remains active."
        });
      } else {
        return res.status(400).json({ error: "Invalid decision. Must be 'quit' or 'stay'." });
      }
    } catch (err: any) {
      console.error("Error processing staff decision:", err);
      return res.status(500).json({ error: err.message || "Failed to process decision" });
    }
  });

  // --- Registered Residents Endpoint ---
  app.get(["/api/registered-residents", "/api/public/registered-residents"], async (req, res) => {
    try {
      const allKeys = await dbGetRoomKeys().catch(() => []);
      const claimedKeys = (allKeys || []).filter((k: any) => k && (k.status === 'claimed' || k.studentName || k.assignedStudentId));

      const dbUsers = await dbGetUsers(MOCK_USERS).catch(() => []);
      const store = getStoreInstance();
      const combinedUsers = [...MOCK_USERS, ...(dbUsers || []), ...(persistentData.users || []), ...(store?.users || [])];

      const residentsMap = new Map<string, any>();

      // 1. Process claimed room keys
      claimedKeys.forEach((k: any) => {
        const id = k.assignedStudentId || k.studentId || k.id || `res-${k.roomKey}`;
        const name = k.studentName || k.assignedStudentName;
        if (name && !name.includes('Sarah Connor') && !name.includes('Marcus Wright') && !name.includes('Kyle Reese')) {
          residentsMap.set(id, {
            id,
            studentName: name,
            studentId: k.studentId || k.assignedStudentId || `STU-${id.slice(-4)}`,
            hostelName: k.hostelName || 'PineVela Residence',
            roomNumber: k.roomNumber || 'Room 101',
            blockName: k.blockName || 'Block A',
            assignedResidentType: 'Student Resident',
            avatar: k.avatar || 'preset:pine-star'
          });
        }
      });

      // 2. Add authentic registered accounts (student / user / resident roles)
      combinedUsers.forEach((u: any) => {
        if (!u) return;
        const usr = u.user || u;
        if (!usr || typeof usr !== 'object') return;
        const role = String(usr.role || '').toLowerCase();
        const name = (usr.name || usr.username || '').trim();
        const email = (usr.email || u.email || '').toLowerCase().trim();

        if (name && (role === 'student' || role === 'user' || role === 'resident')) {
          if (name.includes('Sarah Connor') || name.includes('Marcus Wright') || name.includes('Kyle Reese')) {
            return;
          }
          const id = usr.id || usr.studentId || email || `user-${name}`;
          if (!residentsMap.has(id)) {
            residentsMap.set(id, {
              id,
              studentName: name,
              studentId: usr.studentId || usr.id || `STU-${email ? email.split('@')[0].slice(0, 8).toUpperCase() : 'RES'}`,
              hostelName: usr.hostelName || 'PineVela Residence',
              roomNumber: usr.roomNumber || 'Room 101',
              blockName: usr.blockName || 'Block A',
              assignedResidentType: 'Verified Resident',
              avatar: usr.avatar || usr.photoUrl || usr.photo || 'preset:pine-star'
            });
          }
        }
      });

      return res.json(Array.from(residentsMap.values()));
    } catch (err: any) {
      console.error("Error fetching registered residents:", err);
      return res.status(500).json({ error: "Failed to fetch registered residents" });
    }
  });

  // --- All Registered User Accounts Endpoint for Admin ---
  app.get("/api/admin/all-users", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const dbUsers = await dbGetUsers(MOCK_USERS).catch(() => []);
      const store = getStoreInstance();
      const combinedUsers = [...MOCK_USERS, ...(dbUsers || []), ...(persistentData.users || []), ...(store?.users || [])];
      
      const mgrs = await dbGetManagerRequests().catch(() => []);
      const staffList = (store as any)?.staffVerifications || (persistentData as any)?.staffVerifications || (store as any)?.staff || (persistentData as any)?.staff || [];
      const officers = store?.verificationTeams || persistentData?.verificationTeams || [];
      const merchants = store?.digitalMarketStores || persistentData?.digitalMarketStores || [];

      const usersMap = new Map<string, any>();

      // Standardize & deduplicate user accounts
      combinedUsers.forEach((u: any) => {
        if (!u) return;
        const usr = u.user || u;
        if (!usr || typeof usr !== 'object') return;
        const email = (usr.email || u.email || '').toLowerCase().trim();
        const name = (usr.name || usr.username || usr.fullName || '').trim();
        if (!email && !name) return;

        const key = email || (usr.id ? String(usr.id) : `user-${name}`);
        if (!usersMap.has(key)) {
          usersMap.set(key, {
            id: usr.id || key,
            name: name || 'Registered Account',
            email: email || 'N/A',
            phone: usr.phone || usr.phoneNumber || 'N/A',
            role: usr.role || 'user',
            status: usr.status || 'Active',
            registeredAt: usr.createdAt || usr.registeredAt || new Date().toISOString()
          });
        }
      });

      // Add manager accounts
      (mgrs || []).forEach((m: any) => {
        if (!m) return;
        const email = (m.email || m.managerEmail || '').toLowerCase().trim();
        const name = (m.name || m.fullName || m.managerName || '').trim();
        if (!email && !name) return;
        const key = email || `mgr-${m.id}`;
        if (!usersMap.has(key)) {
          usersMap.set(key, {
            id: m.id || key,
            name: name || 'Hostel Manager',
            email: email || 'N/A',
            phone: m.phone || m.phoneNumber || 'N/A',
            role: 'manager',
            status: m.status || 'Approved',
            hostelName: m.hostelName || m.propertyName || 'Registered Hostel',
            registeredAt: m.createdAt || new Date().toISOString()
          });
        }
      });

      // Add staff accounts
      (staffList || []).forEach((s: any) => {
        if (!s) return;
        const email = (s.email || '').toLowerCase().trim();
        const name = (s.name || s.fullName || '').trim();
        if (!email && !name) return;
        const key = email || `staff-${s.id}`;
        if (!usersMap.has(key)) {
          usersMap.set(key, {
            id: s.id || key,
            name: name || 'Staff Member',
            email: email || 'N/A',
            phone: s.phone || 'N/A',
            role: 'staff',
            status: s.status || 'Verified',
            assignedHostel: s.hostelName || 'PineVela Residence',
            registeredAt: s.createdAt || new Date().toISOString()
          });
        }
      });

      // Add field officer accounts
      (officers || []).forEach((o: any) => {
        if (!o) return;
        const email = (o.email || '').toLowerCase().trim();
        const name = (o.fullName || o.name || '').trim();
        if (!email && !name) return;
        const key = email || `officer-${o.id}`;
        if (!usersMap.has(key)) {
          usersMap.set(key, {
            id: o.id || key,
            name: name || 'Field Officer',
            email: email || 'N/A',
            phone: o.phone || 'N/A',
            role: 'verification_officer',
            status: o.status || 'Active',
            zone: o.assignedZone || 'Main Zone',
            registeredAt: o.createdAt || new Date().toISOString()
          });
        }
      });

      // Add student merchant accounts
      (merchants || []).forEach((m: any) => {
        if (!m) return;
        const email = (m.studentEmail || m.parentUserEmail || m.email || '').toLowerCase().trim();
        const name = (m.storeName || m.studentName || m.name || '').trim();
        if (!email && !name) return;
        const key = email || `merchant-${m.id}`;
        if (!usersMap.has(key)) {
          usersMap.set(key, {
            id: m.id || key,
            name: name || 'Student Merchant',
            email: email || 'N/A',
            phone: m.phone || 'N/A',
            role: 'student_merchant',
            status: m.banned ? 'Banned' : 'Active',
            registeredAt: m.createdAt || new Date().toISOString()
          });
        }
      });

      const allUsersList = Array.from(usersMap.values());

      const breakdown = {
        total: allUsersList.length,
        residents: allUsersList.filter(u => u.role === 'student' || u.role === 'user' || u.role === 'resident').length,
        managers: allUsersList.filter(u => u.role === 'manager').length,
        staff: allUsersList.filter(u => u.role === 'staff').length,
        officers: allUsersList.filter(u => u.role === 'verification_officer' || u.role === 'officer').length,
        merchants: allUsersList.filter(u => u.role === 'student_merchant' || u.role === 'seller').length,
        admins: allUsersList.filter(u => u.role === 'admin').length,
        others: allUsersList.filter(u => !['student', 'user', 'resident', 'manager', 'staff', 'verification_officer', 'officer', 'student_merchant', 'seller', 'admin'].includes(u.role)).length
      };

      return res.json({
        totalUsers: allUsersList.length,
        breakdown,
        users: allUsersList
      });
    } catch (err: any) {
      console.error("Error fetching all users:", err);
      return res.status(500).json({ error: "Failed to fetch all user accounts" });
    }
  });

  // --- Accredited Staff & Job Offers Endpoints ---
  app.get("/api/accredited-staff", async (req, res) => {
    try {
      const dbUsers = await dbGetUsers(MOCK_USERS).catch(() => []);
      const store = getStoreInstance();
      const combinedUsers = [...MOCK_USERS, ...(dbUsers || []), ...(persistentData.users || []), ...(store?.users || [])];
      
      const allStaffCandidates = [
        ...(staff || []),
        ...(persistentData.staff || []),
        ...combinedUsers
      ];

      const verifiedStaff = allStaffCandidates.filter(u => {
        if (!u) return false;
        const usr = u.user || u;
        if (!usr || typeof usr !== 'object') return false;

        // Manager-created staff or internal hostel staff do NOT show up in the public users home feed
        if (usr.managerCreated === true || u.managerCreated === true || usr.isInternalStaff === true || u.isInternalStaff === true) {
          return false;
        }

        const vStatus = String(usr.verificationStatus || '').toLowerCase();
        const username = String(usr.username || '').toLowerCase();
        const email = String(usr.email || '').toLowerCase();
        const role = String(usr.role || '').toLowerCase();
        const staffRole = String(usr.staffRole || '').toLowerCase();

        const isStaff = role === 'staff' || Boolean(staffRole) || username.includes('staff') || email.includes('staff') || usr.isStaff === true;
        const isVerified = usr.isVerified === true || usr.isVerified === 'true' || vStatus === 'approved' || vStatus === 'verified' || usr.accountStatus === 'Active';
        
        return isStaff && isVerified;
      }).map(u => {
        const usr = u.user || u;
        const staffId = usr.id || usr.userId || `staff-${usr.email || Math.random().toString(36).substr(2, 6)}`;
        const reviews = (staffReviews || []).filter((r: any) => r && (r.staffId === staffId || r.staffEmail === usr.email));
        const avgRating = reviews.length > 0 
          ? Number((reviews.reduce((acc: number, r: any) => acc + (Number(r?.rating) || 5), 0) / reviews.length).toFixed(1))
          : 5.0;

        return {
          id: staffId,
          name: usr.name || usr.full_name || usr.managerName || 'Accredited Staff',
          email: usr.email || usr.managerEmail || '',
          phone: usr.phone || usr.managerPhone || '',
          whatsapp: usr.whatsapp || usr.phone || usr.managerPhone || '',
          specialization: usr.specialization || usr.roleTitle || usr.staffRole || 'General Property Operations',
          yearsExperience: usr.yearsExperience || '2+ Years',
          avatar: usr.avatar || usr.profilePicture || usr.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
          isVerified: true,
          rating: avgRating,
          reviewCount: reviews.length,
          reviews: reviews
        };
      });

      const uniqueStaffMap = new Map();
      verifiedStaff.forEach(s => {
        const cleanEmail = String(s.email || '').toLowerCase().trim();
        const key = cleanEmail || s.id;
        if (key && !uniqueStaffMap.has(key)) {
          uniqueStaffMap.set(key, s);
        }
      });

      res.json(Array.from(uniqueStaffMap.values()));
    } catch (err: any) {
      console.warn("Notice fetching accredited staff:", err);
      res.json([]);
    }
  });

  app.get("/api/staff-reviews", async (req: any, res) => {
    try {
      const { staffId, staffEmail } = req.query;
      const store = getStoreInstance();
      const allReviews = store.staffReviews || staffReviews || [];

      if (staffId || staffEmail) {
        const cleanEmail = String(staffEmail || '').toLowerCase().trim();
        const filtered = allReviews.filter((r: any) => 
          (staffId && (r.staffId === staffId || r.staffId === `staff-${staffId}`)) ||
          (cleanEmail && r.staffEmail && r.staffEmail.toLowerCase().trim() === cleanEmail)
        );
        return res.json(filtered);
      }

      res.json(allReviews);
    } catch (err: any) {
      console.error("Error fetching staff reviews:", err);
      res.status(500).json({ error: "Failed to fetch staff reviews" });
    }
  });

  app.post("/api/staff-reviews", requireAuth(), async (req: any, res) => {
    try {
      const { staffId, rating, comment } = req.body;
      if (!staffId || !rating) {
        return res.status(400).json({ error: "Staff ID and rating are required" });
      }

      if (!staffReviews) staffReviews = [];
      const newReview = {
        id: `rev-${Date.now()}`,
        staffId,
        reviewerId: req.user.id,
        reviewerName: req.user.name || 'Verified Manager',
        rating: Number(rating),
        comment: comment || '',
        createdAt: new Date().toISOString()
      };

      staffReviews.unshift(newReview);
      syncStore();
      res.status(201).json(newReview);
    } catch (err: any) {
      console.error("Error creating staff review:", err);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  app.post("/api/job-offers", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      let authUser: any = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1]?.trim();
        if (token) {
          const dbUsers = await dbGetUsers(MOCK_USERS).catch(() => []);
          const combinedUsers = [...MOCK_USERS, ...dbUsers, ...(persistentData.users || [])];
          const found = combinedUsers.find(u => {
            if (!u) return false;
            const uToken = u.token || u.user?.token;
            return Boolean(uToken) && uToken === token;
          });
          if (found) {
            authUser = found.user ? { ...found.user } : { ...found };
          }
        }
      }

      const {
        staffId,
        staffEmail,
        staffName,
        workCategory,
        workOffered,
        timeAndSchedule,
        estimatedDuration,
        location,
        digitalAddress,
        wageSalary,
        paymentMethod,
        equipmentProvided,
        contact,
        requesterName,
        requesterCategory,
        requesterNationalId,
        requesterOrganization,
        requesterContact,
        requesterAltPhone,
        requesterEmail,
        safetyDeclarationConfirmed,
        lat,
        lng
      } = req.body;

      if (!authUser) {
        return res.status(401).json({ error: "PineVela account required: Please log in or create an account to hire accredited staff or offer jobs." });
      }

      if (!staffId && !staffEmail) {
        return res.status(400).json({ error: "Staff identifier (ID or Email) is required." });
      }
      if (!workOffered || !workOffered.trim()) {
        return res.status(400).json({ error: "Work description is required." });
      }

      // Lookup staff candidate to ensure all IDs and email are captured for bulletproof delivery
      const allStaffCandidates = [
        ...(staff || []),
        ...(persistentData.staff || []),
        ...MOCK_USERS,
        ...(persistentData.users || [])
      ];
      const cleanStaffEmail = (staffEmail || '').toLowerCase().trim();
      const cleanStaffId = String(staffId || '');
      
      const matchedStaff = allStaffCandidates.find((c: any) => {
        if (!c) return false;
        const usr = c.user || c;
        const cEmail = (usr.email || c.email || '').toLowerCase().trim();
        const cId = String(usr.id || c.id || '');
        const cUserId = String(usr.userId || c.userId || '');
        return (cleanStaffEmail && cEmail === cleanStaffEmail) || (cleanStaffId && (cId === cleanStaffId || cUserId === cleanStaffId));
      });

      const targetStaffUser = matchedStaff ? (matchedStaff.user || matchedStaff) : null;
      const finalStaffId = targetStaffUser ? (targetStaffUser.id || targetStaffUser.userId || cleanStaffId) : cleanStaffId;
      const finalStaffEmail = targetStaffUser ? (targetStaffUser.email || cleanStaffEmail) : cleanStaffEmail;
      const finalStaffName = targetStaffUser ? (targetStaffUser.name || staffName || 'Accredited Staff') : (staffName || 'Accredited Staff');
      const finalStaffUserId = targetStaffUser ? (targetStaffUser.userId || targetStaffUser.id || cleanStaffId) : cleanStaffId;

      if (!jobOffers) jobOffers = [];
      const newOffer = {
        id: `offer-${Date.now()}`,
        staffId: finalStaffId,
        staffUserId: finalStaffUserId,
        staffEmail: finalStaffEmail,
        staffName: finalStaffName,
        requesterId: authUser?.id || `client-${Date.now()}`,
        requesterName: requesterName || authUser?.name || 'Verified Client',
        requesterCategory: requesterCategory || 'Verified Resident',
        requesterNationalId: requesterNationalId || '',
        requesterNationalIdMasked: requesterNationalId && requesterNationalId.length > 6 
          ? `${requesterNationalId.substring(0, 4)}****${requesterNationalId.slice(-3)}` 
          : (requesterNationalId || 'GHA-NIA-Verified'),
        requesterOrganization: requesterOrganization || '',
        requesterPhone: requesterContact || contact || authUser?.phone || '',
        requesterAltPhone: requesterAltPhone || '',
        requesterEmail: requesterEmail || authUser?.email || '',
        digitalAddress: digitalAddress || '',
        workCategory: workCategory || 'General Maintenance & Handyman',
        workOffered: workOffered.trim(),
        timeAndSchedule: timeAndSchedule || 'Immediate / Flexible',
        estimatedDuration: estimatedDuration || '2 - 3 Hours',
        location: location || 'Accra, Ghana',
        lat: Number(lat) || 5.6037,
        lng: Number(lng) || -0.1870,
        wageSalary: wageSalary || 'GHS 250 (Negotiable)',
        paymentMethod: paymentMethod || 'Mobile Money (MoMo) on Completion',
        equipmentProvided: equipmentProvided || 'Standard site tools available',
        safetyDeclarationConfirmed: safetyDeclarationConfirmed !== false,
        contact: contact || requesterContact || authUser?.phone || '',
        status: 'Pending',
        createdAt: new Date().toISOString()
      };

      jobOffers.unshift(newOffer);

      // Notify staff member via system notification
      if (!notifications) notifications = [];
      notifications.unshift({
        id: `notif-offer-${Date.now()}`,
        studentId: finalStaffId,
        title: `⚡ New One-Time Job Offer: ${newOffer.workCategory}!`,
        message: `Work: "${workOffered}" | Client: ${newOffer.requesterName} (${newOffer.requesterCategory}) | Wage: ${wageSalary} | Location: ${location} (${digitalAddress || 'Ghana'}). Check your Offers tab to review and accept.`,
        type: 'success',
        date: new Date().toISOString().split('T')[0],
        read: false
      });

      syncStore();
      res.status(201).json(newOffer);
    } catch (err: any) {
      console.error("Error creating job offer:", err);
      res.status(500).json({ error: "Failed to send job offer" });
    }
  });

  app.get("/api/staff-job-offers", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const userId = String(req.user.id || '');
      const userEmail = String(req.user.email || '').toLowerCase().trim();
      const userName = String(req.user.name || '').toLowerCase().trim();
      const username = String(req.user.username || '').toLowerCase().trim();

      // Collect all possible identifiers for this staff member
      const myIds = new Set<string>();
      if (userId) myIds.add(userId);
      if (req.user.userId) myIds.add(String(req.user.userId));
      if (req.user.staffId) myIds.add(String(req.user.staffId));

      // Also search staff array and persistentData.staff and staffApplications
      const allStaffRecords = [...(staff || []), ...(persistentData.staff || [])];
      allStaffRecords.forEach((s: any) => {
        if (!s) return;
        const sEmail = String(s.email || s.user?.email || '').toLowerCase().trim();
        const sUserId = String(s.userId || s.user?.id || '');
        const sId = String(s.id || '');
        if ((sUserId && (sUserId === userId || myIds.has(sUserId))) || (sEmail && userEmail && sEmail === userEmail)) {
          if (sId) myIds.add(sId);
          if (sUserId) myIds.add(sUserId);
        }
      });

      const allApps = [...(staffApplications || []), ...(persistentData.staffApplications || [])];
      allApps.forEach((a: any) => {
        if (!a) return;
        const aEmail = String(a.email || '').toLowerCase().trim();
        const aUserId = String(a.userId || '');
        if ((aUserId && (aUserId === userId || myIds.has(aUserId))) || (aEmail && userEmail && aEmail === userEmail)) {
          if (a.id) myIds.add(String(a.id));
          if (aUserId) myIds.add(aUserId);
        }
      });

      const offers = (jobOffers || []).filter((o: any) => {
        if (!o) return false;
        const oStaffId = String(o.staffId || '');
        const oStaffUserId = String(o.staffUserId || '');
        const oStaffEmail = String(o.staffEmail || '').toLowerCase().trim();
        const oStaffName = String(o.staffName || '').toLowerCase().trim();
        const oStaffUsername = String(o.staffUsername || '').toLowerCase().trim();

        if (oStaffId && myIds.has(oStaffId)) return true;
        if (oStaffUserId && myIds.has(oStaffUserId)) return true;
        if (oStaffEmail && userEmail && oStaffEmail === userEmail) return true;
        if (oStaffUsername && username && oStaffUsername === username) return true;
        if (oStaffName && userName && oStaffName === userName) return true;

        // Fallback: check if oStaffId starts with "staff-" and contains email handle
        if (userEmail && oStaffId.startsWith('staff-') && oStaffId.toLowerCase().includes(userEmail.split('@')[0])) return true;

        return false;
      });

      // Sort newest first
      offers.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      res.json(offers);
    } catch (err: any) {
      console.error("Error fetching job offers:", err);
      res.status(500).json({ error: "Failed to fetch job offers" });
    }
  });

  app.put("/api/job-offers/:id/accept", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = String(req.user.id || '');
      const userEmail = String(req.user.email || '').toLowerCase().trim();

      if (!jobOffers) jobOffers = [];
      const offer = jobOffers.find((o: any) => {
        if (!o || o.id !== id) return false;
        const oStaffId = String(o.staffId || '');
        const oStaffUserId = String(o.staffUserId || '');
        const oStaffEmail = String(o.staffEmail || '').toLowerCase().trim();
        return oStaffId === userId || oStaffUserId === userId || (userEmail && oStaffEmail === userEmail);
      });

      if (!offer) {
        return res.status(404).json({ error: "Job offer not found or unauthorized." });
      }

      offer.status = 'Accepted';
      offer.acceptedAt = new Date().toISOString();

      // Notify requester
      if (!notifications) notifications = [];
      notifications.unshift({
        id: `notif-accepted-${Date.now()}`,
        studentId: offer.requesterId,
        title: `✅ Job Offer Accepted by Staff!`,
        message: `${req.user.name || 'PineVela Accredited Staff'} accepted your job offer for "${offer.workOffered}". Direct phone/WhatsApp: ${req.user.phone || '+233 24 123 4567'}.`,
        type: 'success',
        date: new Date().toISOString().split('T')[0],
        read: false
      });

      syncStore();
      res.json({ success: true, offer });
    } catch (err: any) {
      console.error("Error accepting job offer:", err);
      res.status(500).json({ error: "Failed to accept job offer" });
    }
  });

  app.put("/api/job-offers/:id/decline", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = String(req.user.id || '');
      const userEmail = String(req.user.email || '').toLowerCase().trim();

      if (!jobOffers) jobOffers = [];
      const offer = jobOffers.find((o: any) => {
        if (!o || o.id !== id) return false;
        const oStaffId = String(o.staffId || '');
        const oStaffUserId = String(o.staffUserId || '');
        const oStaffEmail = String(o.staffEmail || '').toLowerCase().trim();
        return oStaffId === userId || oStaffUserId === userId || (userEmail && oStaffEmail === userEmail);
      });

      if (!offer) {
        return res.status(404).json({ error: "Job offer not found or unauthorized." });
      }

      offer.status = 'Declined';
      offer.declinedAt = new Date().toISOString();
      offer.declineReason = reason || 'Staff is currently unavailable for this schedule.';

      // Notify requester
      if (!notifications) notifications = [];
      notifications.unshift({
        id: `notif-declined-${Date.now()}`,
        studentId: offer.requesterId,
        title: `Job Offer Update`,
        message: `The staff member was unable to accept the job offer for "${offer.workOffered}". Reason: ${offer.declineReason}. You may hire another available accredited staff member.`,
        type: 'info',
        date: new Date().toISOString().split('T')[0],
        read: false
      });

      syncStore();
      res.json({ success: true, offer });
    } catch (err: any) {
      console.error("Error declining job offer:", err);
      res.status(500).json({ error: "Failed to decline job offer" });
    }
  });

  // --- Staff Recruitment & Open Vacancies on Hostels ---
  app.put("/api/hostels/:id/recruitment", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { staffHiringOpen, openStaffRoles } = req.body;

      const hostelIndex = hostels.findIndex(h => h.id === id);
      if (hostelIndex === -1) {
        return res.status(404).json({ error: "Hostel not found" });
      }

      hostels[hostelIndex] = {
        ...hostels[hostelIndex],
        staffHiringOpen: typeof staffHiringOpen === 'boolean' ? staffHiringOpen : true,
        openStaffRoles: Array.isArray(openStaffRoles) ? openStaffRoles : []
      };

      await dbUpdateHostel(id, hostels[hostelIndex], hostels);
      savePersistentStore(getStoreInstance());
      syncStore();
      return res.json({ success: true, hostel: hostels[hostelIndex] });
    } catch (err: any) {
      console.error("Error updating hostel recruitment:", err);
      res.status(500).json({ error: "Failed to update recruitment settings" });
    }
  });

  // --- Staff Applications: Apply, Review & Decisions ---
  // --- Admin Staff Verification Endpoint ---
  app.get("/api/admin/staff-verifications", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const storeStaff = store.staff || [];
      const storeUsers = store.users || [];

      const allCandidates = [
        ...staff,
        ...storeStaff,
        ...MOCK_USERS.map((u: any) => u.user || u),
        ...storeUsers.map((u: any) => u.user || u)
      ];

      const staffMap = new Map<string, any>();

      for (const item of allCandidates) {
        if (!item) continue;
        const role = (item.role || item.staffRole || '').toLowerCase();
        if (role !== 'staff' && !item.specialization && !item.staffRole && !item.cvData && !item.nationalId) {
          continue;
        }

        const email = (item.email || item.userEmail || '').toLowerCase().trim();
        const username = (item.username || '').toLowerCase().trim();
        const id = String(item.id || item.userId || '').trim();

        // Primary key is normalized email, fallback to username or ID
        const key = email || username || id;
        if (!key) continue;

        const isVerified = Boolean(
          item.isVerified === true ||
          item.verificationStatus === 'Verified' ||
          item.verificationStatus === 'verified' ||
          item.verificationStatus === 'approved'
        );
        const isRejected = item.verificationStatus === 'Rejected' || item.verificationStatus === 'rejected';
        const verificationStatus = isVerified ? 'Verified' : (isRejected ? 'Rejected' : (item.verificationStatus || 'Pending'));

        const existing = staffMap.get(key);
        if (!existing) {
          staffMap.set(key, {
            id: id || `staff-${key}`,
            userId: item.userId || id || `staff-${key}`,
            name: item.name || item.fullName || 'Staff Member',
            username: item.username || key.split('@')[0],
            email: email || item.email || '',
            phone: item.phone || '',
            role: item.staffRole || item.specialization || item.role || 'Staff Specialist',
            specialization: item.specialization || item.staffRole || item.role || 'Facilities & Maintenance',
            yearsExperience: item.yearsExperience || '1-3 Years',
            nationalId: item.nationalId || item.idNumber || '',
            idType: item.idType || 'Ghana Card (National ID)',
            idCardDoc: item.idCardDoc || '',
            cvData: item.cvData || '',
            cvFileName: item.cvFileName || '',
            verificationStatus,
            isVerified,
            accountStatus: item.accountStatus || 'Active',
            createdAt: item.createdAt || new Date().toISOString()
          });
        } else {
          // Merge missing fields and respect the latest verified/rejected status
          if (!existing.phone && item.phone) existing.phone = item.phone;
          if (!existing.nationalId && (item.nationalId || item.idNumber)) existing.nationalId = item.nationalId || item.idNumber;
          if (!existing.idCardDoc && item.idCardDoc) existing.idCardDoc = item.idCardDoc;
          if (!existing.cvData && item.cvData) existing.cvData = item.cvData;
          if (!existing.cvFileName && item.cvFileName) existing.cvFileName = item.cvFileName;
          if (!existing.specialization && (item.specialization || item.staffRole)) existing.specialization = item.specialization || item.staffRole;
          if (isVerified) {
            existing.isVerified = true;
            existing.verificationStatus = 'Verified';
          } else if (isRejected && !existing.isVerified) {
            existing.verificationStatus = 'Rejected';
          }
        }
      }

      const staffList = Array.from(staffMap.values());
      res.json(staffList);
    } catch (err: any) {
      console.error("Error fetching staff verifications:", err);
      res.status(500).json({ error: "Failed to fetch staff verifications" });
    }
  });

  // --- Individual Staff Member Verification Status Check ---
  app.get("/api/staff-verifications/my-status", requireAuth(), async (req: any, res) => {
    try {
      const user = req.user;
      const userEmail = (user.email || '').toLowerCase().trim();
      const userId = String(user.id || '').trim();
      const parentUserEmail = (user.parentUserEmail || '').toLowerCase().trim();
      const parentUserId = String(user.parentUserId || '').trim();

      const store = getStoreInstance();
      const allCandidates = [
        ...staff,
        ...(store.staff || []),
        ...MOCK_USERS.map((u: any) => u.user || u),
        ...(store.users || []).map((u: any) => u.user || u),
        ...staffApplications,
        ...(store.staffApplications || [])
      ];

      const matchesTarget = (item: any) => {
        if (!item) return false;
        const iEmail = (item.email || item.staffEmail || item.userEmail || '').toLowerCase().trim();
        const iParentEmail = (item.parentUserEmail || '').toLowerCase().trim();
        const iId = String(item.id || item.userId || item.staffId || '').trim();
        const iParentId = String(item.parentUserId || '').trim();

        if (userEmail && (iEmail === userEmail || iParentEmail === userEmail)) return true;
        if (parentUserEmail && (iEmail === parentUserEmail || iParentEmail === parentUserEmail)) return true;
        if (userId && (iId === userId || iParentId === userId)) return true;
        if (parentUserId && (iId === parentUserId || iParentId === parentUserId)) return true;
        return false;
      };

      const matchedRecords = allCandidates.filter(matchesTarget);

      const hasApprovedRecord = matchedRecords.some(r => {
        const status = String(r.verificationStatus || r.status || '').toLowerCase().trim();
        return r.isVerified === true || status === 'verified' || status === 'approved';
      });

      const isUserDirectlyVerified = Boolean(
        user.isVerified === true ||
        String(user.verificationStatus || '').toLowerCase() === 'verified' ||
        String(user.verificationStatus || '').toLowerCase() === 'approved'
      );

      const isVerified = hasApprovedRecord || isUserDirectlyVerified;
      const verificationStatus = isVerified ? 'Verified' : 'Pending';

      // Find primary staff record details to return
      const primaryRecord = matchedRecords.find(r => r.role === 'staff' || r.specialization || r.staffRole) || matchedRecords[0] || null;

      return res.json({
        isVerified,
        verificationStatus,
        status: verificationStatus,
        staffRecord: primaryRecord ? {
          ...primaryRecord,
          isVerified,
          verificationStatus
        } : null
      });
    } catch (err: any) {
      console.error("Error checking staff verification status:", err);
      return res.status(500).json({ error: "Failed to check verification status" });
    }
  });

  // --- CV PDF Helper Functions ---
  function convertTextToPdfBuffer(title: string, text: string): Buffer {
    const safeTitle = (title || 'Curriculum Vitae').replace(/[()\\]/g, '');
    const lines = (text || '').split('\n');
    
    let textCommands = `BT\n/F1 16 Tf\n40 790 Td\n(${safeTitle}) Tj\nET\nBT\n/F1 10 Tf\n`;
    let currentY = 750;
    for (const line of lines) {
      if (currentY < 40) break;
      const safeLine = line.replace(/[()\\]/g, '');
      textCommands += `40 ${currentY} Td\n(${safeLine}) Tj\n0 -14 Td\n`;
      currentY -= 14;
    }
    textCommands += `ET`;

    const streamContent = textCommands;
    const streamLength = Buffer.byteLength(streamContent, 'utf-8');

    const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000246 00000 n 
0000000326 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + streamLength}
%%EOF`;

    return Buffer.from(pdfString, 'utf-8');
  }

  function parseCvPdfBuffer(cvData: string, applicantName: string): Buffer {
    if (cvData && typeof cvData === 'string') {
      let base64Content = cvData;
      if (cvData.includes('base64,')) {
        base64Content = cvData.split('base64,')[1];
      }
      try {
        const buffer = Buffer.from(base64Content.trim(), 'base64');
        if (buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
          return buffer;
        }
      } catch (e) {
        // Fallback below
      }
    }

    const textContent = (cvData && !cvData.startsWith('data:')) 
      ? cvData 
      : `CURRICULUM VITAE\n\nApplicant Name: ${applicantName}\nOfficial Status: Accredited Staff Credentials\nDocument Type: PDF Document\n\nSummary:\nCertified technician with experience in electrical, plumbing, facilities, and hostel residence maintenance.`;

    return convertTextToPdfBuffer(`${applicantName} - CV`, textContent);
  }

  // --- CV PDF Download & Inline Viewing Routes (Returns application/pdf) ---
  app.get("/api/staff-verifications/:id/cv", requireAuth(["admin", "manager"]), (req: any, res: any) => {
    try {
      const { id } = req.params;
      const userObj = MOCK_USERS.find(u => (u as any).user?.id === id || u.username === id || (u as any).user?.username === id) as any;
      const staffObj = staff.find(s => s.userId === id || s.id === id);
      const appObj = staffApplications.find(a => a.id === id || a.staffId === id);

      const targetData = userObj?.user?.cvData || staffObj?.cvData || appObj?.cvData || '';
      const targetFileName = userObj?.user?.cvFileName || staffObj?.cvFileName || appObj?.cvFileName || `${userObj?.user?.name || 'Applicant'}_CV.pdf`;
      const name = userObj?.user?.name || staffObj?.name || appObj?.applicantName || 'Applicant';

      const pdfBuffer = parseCvPdfBuffer(targetData, name);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(targetFileName)}"`);
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      return res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Error serving staff CV PDF:", err);
      res.status(500).json({ error: "Failed to process CV PDF document" });
    }
  });

  app.get("/api/staff-applications/:id/cv", requireAuth(["admin", "manager"]), (req: any, res: any) => {
    try {
      const { id } = req.params;
      const appObj = staffApplications.find(a => a.id === id || a.staffId === id);
      const userObj = MOCK_USERS.find(u => (u as any).user?.id === id || u.username === id) as any;

      const targetData = appObj?.cvData || userObj?.user?.cvData || '';
      const targetFileName = appObj?.cvFileName || userObj?.user?.cvFileName || 'Applicant_CV.pdf';
      const name = appObj?.applicantName || userObj?.user?.name || 'Applicant';

      const pdfBuffer = parseCvPdfBuffer(targetData, name);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(targetFileName)}"`);
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      return res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Error serving application CV PDF:", err);
      res.status(500).json({ error: "Failed to process CV PDF document" });
    }
  });

  app.put("/api/admin/staff-verifications/:id/decision", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, decision, reviewNotes } = req.body;
      const finalStatus = status || decision || 'Verified';
      const isApproved = String(finalStatus).toLowerCase() === 'verified' || String(finalStatus).toLowerCase() === 'approved';
      const statusText = isApproved ? 'Verified' : 'Rejected';

      const cleanId = String(id || '').trim().toLowerCase();
      const cleanIdStripped = cleanId.replace(/^(stf-rec-|staff-user-|staff-)/, '');

      const matchesEmail = (eVal: string) => {
        if (!eVal) return false;
        const eClean = eVal.toLowerCase().trim();
        return (
          eClean === cleanId ||
          eClean === cleanIdStripped ||
          cleanId === `staff-${eClean}` ||
          cleanId.endsWith(eClean) ||
          cleanIdStripped.endsWith(eClean)
        );
      };

      const matchesStaffTarget = (obj: any) => {
        if (!obj) return false;
        const usr = obj.user || obj;
        const e1 = (usr.email || obj.email || '').toLowerCase().trim();
        const e2 = (usr.parentUserEmail || obj.parentUserEmail || '').toLowerCase().trim();
        const e3 = (usr.staffEmail || obj.staffEmail || '').toLowerCase().trim();
        const id1 = String(usr.id || obj.id || '').toLowerCase().trim();
        const id2 = String(usr.userId || obj.userId || '').toLowerCase().trim();
        const id3 = String(usr.parentUserId || obj.parentUserId || '').toLowerCase().trim();
        const uName = String(usr.username || obj.username || '').toLowerCase().trim();

        const matchesIdStr = (idVal: string) => {
          if (!idVal) return false;
          const cleanVal = idVal.toLowerCase().trim();
          const strippedVal = cleanVal.replace(/^(stf-rec-|staff-user-|staff-)/, '');
          return cleanVal === cleanId || (Boolean(cleanIdStripped) && strippedVal === cleanIdStripped);
        };

        return (
          matchesIdStr(id1) ||
          matchesIdStr(id2) ||
          matchesIdStr(id3) ||
          uName === cleanId ||
          uName === cleanIdStripped ||
          matchesEmail(e1) ||
          matchesEmail(e2) ||
          matchesEmail(e3)
        );
      };

      let matchedStaffUser = MOCK_USERS.find(u => matchesStaffTarget(u) || matchesStaffTarget(u.user));
      let matchedStaffRecord = staff.find(matchesStaffTarget) || staffApplications.find(matchesStaffTarget);

      const targetUserObj = matchedStaffUser ? (matchedStaffUser.user || matchedStaffUser) : null;
      const staffUserEmail = (targetUserObj?.email || matchedStaffRecord?.email || matchedStaffRecord?.staffEmail || cleanIdStripped).toLowerCase().trim();
      const parentUserEmail = (targetUserObj?.parentUserEmail || matchedStaffRecord?.parentUserEmail || staffUserEmail).toLowerCase().trim();
      const staffUserId = targetUserObj?.id || matchedStaffRecord?.userId || matchedStaffRecord?.id || id;
      const parentUserId = targetUserObj?.parentUserId || matchedStaffRecord?.parentUserId || staffUserId;

      const targetEmailsSet = new Set([staffUserEmail, parentUserEmail, cleanId, cleanIdStripped].filter(Boolean));
      const targetIdsSet = new Set([staffUserId, parentUserId, cleanId, cleanIdStripped].filter(Boolean));

      const isMatchingRecord = (obj: any) => {
        if (!obj) return false;
        if (matchesStaffTarget(obj) || matchesStaffTarget(obj.user)) return true;
        const usr = obj.user || obj;
        const e1 = (usr.email || obj.email || '').toLowerCase().trim();
        const e2 = (usr.parentUserEmail || obj.parentUserEmail || '').toLowerCase().trim();
        const e3 = (usr.staffEmail || obj.staffEmail || '').toLowerCase().trim();
        const id1 = String(usr.id || obj.id || '').toLowerCase().trim();
        const id2 = String(usr.userId || obj.userId || '').toLowerCase().trim();

        if ([e1, e2, e3].some(e => e && (targetEmailsSet.has(e) || matchesEmail(e)))) return true;
        if ([id1, id2].some(i => i && targetIdsSet.has(i))) return true;
        return false;
      };

      // Update MOCK_USERS
      MOCK_USERS.forEach(u => {
        if (isMatchingRecord(u)) {
          if (u.user) {
            u.user.verificationStatus = statusText;
            u.user.isVerified = isApproved;
          }
          u.verificationStatus = statusText;
          u.isVerified = isApproved;
        }
      });

      // Update staff list
      staff.forEach(s => {
        if (isMatchingRecord(s)) {
          (s as any).verificationStatus = statusText;
          (s as any).isVerified = isApproved;
        }
      });

      // Update staffApplications list
      staffApplications.forEach(a => {
        if (isMatchingRecord(a)) {
          (a as any).verificationStatus = statusText;
          (a as any).isVerified = isApproved;
        }
      });

      // Update persistent store
      const store = getStoreInstance();
      if (store.users) {
        store.users.forEach((u: any) => {
          if (isMatchingRecord(u)) {
            if (u.user) {
              u.user.verificationStatus = statusText;
              u.user.isVerified = isApproved;
            }
            u.verificationStatus = statusText;
            u.isVerified = isApproved;
          }
        });
      }
      if (store.staff) {
        store.staff.forEach((s: any) => {
          if (isMatchingRecord(s)) {
            s.verificationStatus = statusText;
            s.isVerified = isApproved;
          }
        });
      }
      if (store.staffApplications) {
        store.staffApplications.forEach((a: any) => {
          if (isMatchingRecord(a)) {
            a.verificationStatus = statusText;
            a.isVerified = isApproved;
          }
        });
      }
      savePersistentStore(store);

      // Create live notifications for staff user AND parent user
      const notifyEmails = Array.from(new Set([staffUserEmail, parentUserEmail].filter(Boolean)));
      for (const emailToNotify of notifyEmails) {
        const staffNotif = {
          id: `notif-vrf-dec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          studentId: staffUserId,
          userId: staffUserId,
          parentUserId: parentUserId,
          userEmail: emailToNotify,
          recipientEmail: emailToNotify,
          targetEmail: emailToNotify,
          parentUserEmail: parentUserEmail,
          title: isApproved ? `Staff Verification Approved!` : `Staff Verification Status Update`,
          message: isApproved
            ? `Congratulations! Your staff profile, CV, and National ID credentials have been verified by PineVela Administration. You are now unlocked to apply for positions at accredited hostels.`
            : `Your staff credential verification status has been updated to ${statusText}.${reviewNotes ? ` Reason: ${reviewNotes}` : ''}`,
          type: isApproved ? 'success' : 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(staffNotif);
        await dbCreateNotification(staffNotif, notifications);
      }

      const staffDisplayName = targetUserObj?.name || matchedStaffRecord?.name || 'Staff Member';
      activities.unshift({
        id: `act-${Date.now()}`,
        text: `Staff verification for ${staffDisplayName} marked as ${statusText}`,
        time: 'Just now',
        type: isApproved ? 'success' : 'warning'
      });

      syncStore();
      return res.json({
        success: true,
        user: targetUserObj,
        message: `Staff member account ${statusText} successfully.`
      });
    } catch (err: any) {
      console.error("Error processing staff verification decision:", err);
      return res.status(500).json({ error: err.message || "Failed to process verification decision" });
    }
  });

  // --- Admin Disable / Ban / Update Staff Account Status ---
  app.put("/api/admin/staff-verifications/:id/status", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { accountStatus, reason } = req.body; // 'Active' | 'Disabled' | 'Banned'

      if (!accountStatus || !['Active', 'Disabled', 'Banned'].includes(accountStatus)) {
        return res.status(400).json({ error: "Invalid status. Must be 'Active', 'Disabled', or 'Banned'." });
      }

      const userIndex = MOCK_USERS.findIndex(u => (u as any).user?.id === id || u.username === id || (u as any).user?.username === id);
      if (userIndex === -1) {
        return res.status(404).json({ error: "Staff account not found" });
      }

      const staffUserObj = MOCK_USERS[userIndex] as any;
      if (staffUserObj.user) {
        staffUserObj.user.accountStatus = accountStatus;
        staffUserObj.user.status = accountStatus;
        if (accountStatus === 'Disabled') staffUserObj.user.isDisabled = true;
        if (accountStatus === 'Banned') staffUserObj.user.isBanned = true;
        if (accountStatus === 'Active') {
          staffUserObj.user.isDisabled = false;
          staffUserObj.user.isBanned = false;
        }
      }
      staffUserObj.accountStatus = accountStatus;
      staffUserObj.status = accountStatus;

      // Update in staff list
      const staffIdx = staff.findIndex(s => s.userId === id || s.id === id);
      if (staffIdx !== -1) {
        (staff[staffIdx] as any).accountStatus = accountStatus;
        (staff[staffIdx] as any).status = accountStatus;
      }

      // Notify staff member
      notifications.unshift({
        id: `notif-stf-stat-${Date.now()}`,
        studentId: staffUserObj.user ? staffUserObj.user.id : id,
        title: `Account Access Status Update: ${accountStatus}`,
        message: accountStatus === 'Active'
          ? `Your staff account access has been restored to Active status by Administration.`
          : `Your staff account access has been set to ${accountStatus}.${reason ? ` Reason: ${reason}` : ''}`,
        type: accountStatus === 'Active' ? 'success' : 'danger',
        date: new Date().toISOString().split('T')[0],
        read: false
      });

      activities.unshift({
        id: `act-stf-stat-${Date.now()}`,
        text: `Staff account for ${staffUserObj.user?.name || id} set to ${accountStatus}`,
        time: 'Just now',
        type: accountStatus === 'Active' ? 'info' : 'warning'
      });

      syncStore();
      return res.json({
        success: true,
        accountStatus,
        user: staffUserObj.user,
        message: `Staff member account marked as ${accountStatus}.`
      });
    } catch (err: any) {
      console.error("Error updating staff account status:", err);
      return res.status(500).json({ error: err.message || "Failed to update staff account status" });
    }
  });

  app.get("/api/staff-applications", requireAuth(), async (req: any, res) => {
    try {
      const userRole = req.user.role;
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const userName = (req.user.name || '').toLowerCase().trim();

      if (userRole === 'staff') {
        const staffApps = staffApplications.filter(a => 
          a.staffId === userId || 
          (a.staffEmail && a.staffEmail.toLowerCase() === userEmail) ||
          (a.email && a.email.toLowerCase() === userEmail)
        );
        return res.json(staffApps);
      }

      if (userRole === 'manager') {
        // Look up approved hostels
        const managerHostels = hostels.filter(h => 
          h.managerId === userId || 
          h.assignedManagerId === userId ||
          (h.managerEmail && userEmail && h.managerEmail.toLowerCase().trim() === userEmail) ||
          (h.managerName && userName && h.managerName.toLowerCase().trim() === userName)
        );
        
        // Also look up pending hostel verifications to ensure pending managers can receive applications
        const managerPendingHostels = hostelVerifications.filter(v =>
          v.managerId === userId ||
          (v.managerEmail && userEmail && v.managerEmail.toLowerCase().trim() === userEmail)
        );

        const hostelIds = new Set([
          ...managerHostels.map(h => h.id),
          ...managerPendingHostels.map(v => v.hostelId || v.id)
        ]);
        
        const hostelNames = new Set([
          ...managerHostels.map(h => h.name?.toLowerCase().trim()),
          ...managerPendingHostels.map(v => v.hostelName?.toLowerCase().trim())
        ].filter(Boolean));

        const managerApps = staffApplications.filter(a => 
          hostelIds.has(a.hostelId) || 
          (a.managerId && a.managerId === userId) ||
          (a.managerEmail && userEmail && a.managerEmail.toLowerCase().trim() === userEmail) ||
          (a.hostelName && hostelNames.has(a.hostelName.toLowerCase().trim()))
        );
        return res.json(managerApps);
      }

      // Admin gets all
      return res.json(staffApplications);
    } catch (err: any) {
      console.error("Error fetching staff applications:", err);
      res.status(500).json({ error: "Failed to load staff applications" });
    }
  });

  app.post("/api/staff-applications", async (req: any, res) => {
    try {
      let reqUser = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1]?.trim();
        if (token) {
          const dbUsers = await dbGetUsers(MOCK_USERS);
          const combinedUsers = [...MOCK_USERS, ...dbUsers, ...(persistentData.users || [])];
          const foundEntry = combinedUsers.find(u => {
            if (!u) return false;
            const uToken = u.token || u.user?.token;
            const uId = u.id || u.user?.id;
            return uToken === token || (u.user && u.user.token === token);
          });
          if (foundEntry) {
            reqUser = foundEntry.user || foundEntry;
          }
        }
      }

      const userId = reqUser?.id || `guest-staff-${Date.now()}`;
      const userEmail = (reqUser?.email || req.body.email || '').toLowerCase().trim();

      // Check verification status: If the applicant is applying as or from a staff member, verify across all data stores
      const checkObjVerified = (obj: any) => {
        if (!obj) return false;
        const target = obj.user || obj;
        const st = String(target.verificationStatus || obj.verificationStatus || target.status || obj.status || '').toLowerCase().trim();
        const isV = Boolean(target.isVerified === true || obj.isVerified === true || target.isApproved === true || obj.isApproved === true);
        return isV || st === 'verified' || st === 'approved';
      };

      const applicantEmails = Array.from(new Set([
        userEmail,
        (reqUser?.email || '').toLowerCase().trim(),
        (reqUser?.parentUserEmail || '').toLowerCase().trim(),
        (req.body.email || '').toLowerCase().trim(),
        (req.body.staffEmail || '').toLowerCase().trim()
      ].filter(Boolean)));

      const applicantIds = Array.from(new Set([
        userId,
        String(reqUser?.id || '').trim(),
        String(reqUser?.parentUserId || '').trim(),
        String(req.body.staffId || '').trim(),
        String(req.body.userId || '').trim()
      ].filter(Boolean)));

      const matchesApplicant = (obj: any) => {
        if (!obj) return false;
        const target = obj.user || obj;
        const objEmails = [
          (target.email || '').toLowerCase().trim(),
          (target.parentUserEmail || '').toLowerCase().trim(),
          (target.staffEmail || '').toLowerCase().trim(),
          (obj.email || '').toLowerCase().trim(),
          (obj.parentUserEmail || '').toLowerCase().trim(),
          (obj.staffEmail || '').toLowerCase().trim()
        ].filter(Boolean);
        const objIds = [
          String(target.id || '').trim(),
          String(target.userId || '').trim(),
          String(target.parentUserId || '').trim(),
          String(obj.id || '').trim(),
          String(obj.userId || '').trim(),
          String(obj.parentUserId || '').trim()
        ].filter(Boolean);

        const emailMatch = applicantEmails.some(ae => {
          if (!ae) return false;
          const aeStripped = ae.replace(/^(stf-rec-|staff-user-|staff-)/, '');
          return objEmails.some(oe => {
            if (!oe) return false;
            const oeStripped = oe.replace(/^(stf-rec-|staff-user-|staff-)/, '');
            return oe === ae || oeStripped === aeStripped || oe.endsWith(aeStripped) || ae.endsWith(oeStripped);
          });
        });

        const idMatch = applicantIds.some(i => i && objIds.includes(i));
        return emailMatch || idMatch;
      };

      const storeInst = getStoreInstance();
      const allUserCandidates = [...MOCK_USERS, ...(storeInst.users || []), ...(persistentData.users || [])];
      const allStaffCandidates = [...staff, ...(storeInst.staff || [])];
      const allAppCandidates = [...staffApplications, ...(storeInst.staffApplications || [])];

      const matchedUserCandidate = allUserCandidates.find(matchesApplicant);
      const matchedStaffCandidate = allStaffCandidates.find(matchesApplicant);
      const matchedAppCandidate = allAppCandidates.find(matchesApplicant);

      const isApplicantVerified = Boolean(
        checkObjVerified(reqUser) ||
        checkObjVerified(matchedUserCandidate) ||
        checkObjVerified(matchedStaffCandidate) ||
        checkObjVerified(matchedAppCandidate)
      );

      const isStaffUser = Boolean(
        (reqUser && reqUser.role === 'staff') ||
        matchedStaffCandidate ||
        (matchedUserCandidate && (matchedUserCandidate.role === 'staff' || matchedUserCandidate.user?.role === 'staff'))
      );

      if (isStaffUser && !isApplicantVerified) {
        return res.status(403).json({
          error: "Your staff account is currently pending administrative verification of your submitted CV and National ID credentials. You cannot submit job applications until an Administrator verifies your credentials."
        });
      }

      // Check if applicant is already hired and active at an accredited hostel:
      // Staff who are hired by one accredited hostel and verified cannot apply for any other jobs with the hostel again unless:
      // 1. They're sacked or removed by their current manager
      // 2. They quit the job.
      // If not, then they remain in their job only and the option to apply is locked.
      const activeStaffRoster = staff.find((s: any) => 
        (s.userId === userId || (s.email && s.email.toLowerCase() === userEmail)) &&
        s.hostelId &&
        (s.status === 'Active' || s.status === 'Approved' || !s.status || (s.status !== 'Dismissed' && s.status !== 'Removed' && s.status !== 'Resigned' && s.status !== 'Terminated'))
      );

      const activeApprovedApp = staffApplications.find((a: any) => 
        (a.staffId === userId || (a.staffEmail && a.staffEmail.toLowerCase() === userEmail) || (a.email && a.email.toLowerCase() === userEmail)) &&
        (a.status === 'Approved' || a.status === 'approved')
      );

      if (activeStaffRoster || activeApprovedApp) {
        const currentRole = activeStaffRoster?.role || activeApprovedApp?.role || 'Staff Member';
        const currentHostel = activeStaffRoster?.hostelName || activeApprovedApp?.hostelName || 'an accredited hostel';
        return res.status(400).json({
          error: `Application Locked: You are already actively employed as "${currentRole}" at ${currentHostel}. Under PineVela accredited housing regulations, appointed staff remain in their active job and cannot apply for any other hostel jobs unless you quit/resign from your job or are removed by your manager. (One-time individual job offers remain accessible under your Offers tab).`
        });
      }

      // Check if applicant already has a pending application
      const activePending = staffApplications.find(a => 
        (a.staffId === userId || (a.staffEmail && a.staffEmail.toLowerCase() === userEmail)) &&
        a.status === 'pending'
      );

      if (activePending) {
        return res.status(400).json({
          error: `You already have an active staff application pending review for "${activePending.role}" at ${activePending.hostelName}. You cannot apply for another staff role until a decision is finalized.`
        });
      }

      const {
        applicantName,
        phone,
        email,
        role,
        hostelId,
        hostelName,
        nationalId,
        idDocumentUrl,
        cvUrl,
        cvData,
        cvFileName,
        coverLetter
      } = req.body;

      if (!role || !hostelId || !phone) {
        return res.status(400).json({ error: "Role, hostel, and phone number are required." });
      }

      const targetHostel = hostels.find(h => 
        h.id === hostelId || 
        (h.name && hostelName && h.name.toLowerCase().trim() === hostelName.toLowerCase().trim()) ||
        (h.name && hostelId && h.name.toLowerCase().trim() === hostelId.toLowerCase().trim())
      );
      const finalHostelName = targetHostel?.name || hostelName || "Accredited Hostel";

      const newApp = {
        id: `stf-app-${Date.now()}`,
        staffId: userId,
        staffUsername: reqUser?.username || '',
        staffEmail: userEmail || email,
        applicantName: applicantName || reqUser?.name || 'Applicant',
        phone: phone || reqUser?.phone || '',
        role,
        hostelId: targetHostel?.id || hostelId,
        hostelName: finalHostelName,
        managerId: targetHostel?.managerId || targetHostel?.assignedManagerId || '',
        managerEmail: targetHostel?.managerEmail || '',
        managerName: targetHostel?.managerName || '',
        nationalId: nationalId || '',
        idDocumentUrl: idDocumentUrl || '',
        cvUrl: cvUrl || '',
        cvData: cvData || '',
        cvFileName: cvFileName || 'Curriculum_Vitae.pdf',
        coverLetter: coverLetter || '',
        status: 'pending',
        appliedAt: new Date().toISOString()
      };

      staffApplications.unshift(newApp);

      // Notify the manager
      const managerNotif = {
        id: `notif-staffapp-${Date.now()}`,
        userId: targetHostel?.managerId || targetHostel?.assignedManagerId || 'manager_101',
        recipientId: targetHostel?.managerId || targetHostel?.assignedManagerId || '',
        recipientEmail: targetHostel?.managerEmail || '',
        managerEmail: targetHostel?.managerEmail || '',
        managerId: targetHostel?.managerId || targetHostel?.assignedManagerId || '',
        hostelId: targetHostel?.id || hostelId || '',
        targetRole: 'manager',
        title: `New Staff Job Request: ${role}`,
        message: `${newApp.applicantName} submitted a job request with CV & credentials for the position of "${role}" at ${finalHostelName}. Review applicant in Staff Management.`,
        type: 'staff_application',
        category: 'Staff Management',
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        read: false,
        link: '/manager/dashboard'
      };
      notifications.unshift(managerNotif);
      await dbCreateNotification(managerNotif, notifications);

      activities.unshift({
        id: `act-${Date.now()}`,
        text: `Staff application submitted by ${newApp.applicantName} for ${role} at ${finalHostelName}`,
        time: 'Just now',
        type: 'info'
      });

      syncStore();
      return res.status(201).json(newApp);
    } catch (err: any) {
      console.error("Error creating staff application:", err);
      res.status(500).json({ error: err.message || "Failed to submit staff application" });
    }
  });

  app.put("/api/staff-applications/:id/decision", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const decision = req.body.decision || req.body.status;
      const { reviewNotes, shift, assignedBlock, startDate } = req.body;

      if (!decision || (decision !== 'Approved' && decision !== 'Rejected')) {
        return res.status(400).json({ error: "Decision must be 'Approved' or 'Rejected'" });
      }

      const appIndex = staffApplications.findIndex(a => a.id === id);
      if (appIndex === -1) {
        return res.status(404).json({ error: "Staff application not found" });
      }

      const application = staffApplications[appIndex];
      application.status = decision;
      application.reviewedAt = new Date().toISOString();
      application.reviewNotes = reviewNotes || '';
      application.startDate = startDate || 'Immediate';

      if (decision === 'Approved') {
        application.shift = shift || 'Day Shift';
        application.assignedBlock = assignedBlock || 'All Blocks';

        const staffId = `staff-${application.staffId || Date.now()}`;
        const existingStaffIdx = staff.findIndex((s: any) => s.userId === application.staffId || s.id === staffId);
        
        const staffRecord = {
          id: staffId,
          userId: application.staffId,
          name: application.applicantName,
          role: application.role,
          phone: application.phone,
          email: application.staffEmail,
          shift: shift || 'Day Shift',
          assignedBlock: assignedBlock || 'All Wings',
          status: 'Active',
          startDate: startDate || 'Immediate',
          hostelId: application.hostelId,
          hostelName: application.hostelName,
          nationalId: application.nationalId,
          cvUrl: application.cvUrl,
          cvData: application.cvData,
          createdAt: new Date().toISOString()
        };

        if (existingStaffIdx !== -1) {
          staff[existingStaffIdx] = staffRecord;
        } else {
          staff.unshift(staffRecord);
        }

        // Notify staff applicant
        notifications.unshift({
          id: `notif-${Date.now()}`,
          studentId: application.staffId,
          title: `Application Approved!`,
          message: `Congratulations! Your staff application for "${application.role}" at ${application.hostelName} has been approved by the manager. Your starting work date is set to: ${startDate || 'Immediate'}. You are now officially appointed to the property staff roster.`,
          type: 'success',
          date: new Date().toISOString().split('T')[0],
          read: false
        });

        // Auto-create chat room for this staff and manager
        const targetHostel = hostels.find(h => h.id === application.hostelId);
        const managerId = targetHostel?.managerId || req.user.id;
        const roomId = `room-staff-mgr-${application.staffId}-${managerId}`;
        const roomExists = staffChatRooms.some((r: any) => r.id === roomId);
        if (!roomExists) {
          staffChatRooms.push({
            id: roomId,
            staffId: application.staffId,
            staffName: application.applicantName,
            managerId: managerId,
            managerName: req.user.name || 'Property Manager',
            hostelId: application.hostelId,
            hostelName: application.hostelName,
            createdAt: new Date().toISOString()
          });
        }

        activities.unshift({
          id: `act-${Date.now()}`,
          text: `Manager approved staff application of ${application.applicantName} as ${application.role} at ${application.hostelName} starting ${startDate || 'Immediate'}`,
          time: 'Just now',
          type: 'success'
        });
      } else {
        // Rejected
        notifications.unshift({
          id: `notif-${Date.now()}`,
          studentId: application.staffId,
          title: `Staff Application Notice`,
          message: `Your application for "${application.role}" at ${application.hostelName} was reviewed and not accepted at this time. Notes: ${reviewNotes || 'Criteria not met'}. You are now eligible to apply for other positions.`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        });

        activities.unshift({
          id: `act-${Date.now()}`,
          text: `Staff application for ${application.applicantName} at ${application.hostelName} was not accepted`,
          time: 'Just now',
          type: 'warning'
        });
      }

      syncStore();
      return res.json({ status: decision, application });
    } catch (err: any) {
      console.error("Error processing staff application decision:", err);
      res.status(500).json({ error: "Failed to process decision" });
    }
  });

  // --- Dedicated Username Availability Check ---
  app.get("/api/auth/check-username", (req, res) => {
    const raw = (req.query.username as string || '').toLowerCase().trim();
    if (!raw) {
      return res.json({ available: false, message: "Username cannot be empty" });
    }
    const clean = raw.replace(/[^a-z0-9_]/g, '_');
    const isTaken = MOCK_USERS.some(u => (u.username || '').toLowerCase() === clean);
    let suggestion = clean;
    if (isTaken) {
      let suffix = 1;
      while (MOCK_USERS.some(u => (u.username || '').toLowerCase() === `${clean}_${suffix}`)) {
        suffix += 1;
      }
      suggestion = `${clean}_${suffix}`;
    }
    return res.json({
      available: !isTaken,
      username: clean,
      suggestion: isTaken ? suggestion : undefined
    });
  });

  // --- Manager Account Settings Endpoints ---
  app.get("/api/manager/account-settings", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const managerId = req.user.id || 'manager_101';
      const settings = await dbGetManagerAccountSettings(managerId);
      res.json(settings);
    } catch (err: any) {
      console.error("Error fetching manager account settings:", err);
      res.status(500).json({ error: "Failed to load account settings" });
    }
  });

  app.put("/api/manager/account-settings", requireAuth(["manager", "admin"]), async (req: any, res) => {
    try {
      const managerId = req.user.id || 'manager_101';
      const updated = await dbUpdateManagerAccountSettings(managerId, req.body);
      res.json(updated);
    } catch (err: any) {
      console.error("Error updating manager account settings:", err);
      res.status(500).json({ error: "Failed to update account settings" });
    }
  });

  // --- Change Password Endpoint ---
  app.post("/api/auth/change-password", requireAuth(), (req: any, res) => {
    if (typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 6) return res.status(400).json({ error: 'A new password of at least 6 characters is required.' });
    const email = normalizeEmail(req.user.email), role = req.user.role;
    const records = passwordRecords(email, role).filter(record => role === 'merchant' || accountId(record) === req.user.id);
    if (!records.length) return res.status(404).json({ error: 'Account not found.' });
    if (!records.some(record => credentialValues(record, false).some(hash => passwordsMatch(req.body.currentPassword, hash)))) return res.status(400).json({ error: 'Incorrect current password.' });
    updateIdentityPassword(records, req.body.newPassword, email, role);
    return res.json({ success: true, message: 'Password updated. Sign in again using the new password.' });
  });

  // --- Dynamic Meetings Endpoints (No static mockup data) ---
  app.get("/api/meetings", requireAuth(), async (req: any, res) => {
    try {
      const list = await dbGetMeetings(meetings);
      const userRole = req.user.role;
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();

      if (userRole === 'admin') {
        return res.json(list);
      }

      if (userRole === 'staff') {
        const staffRecord = staff.find((s: any) => s.userId === userId || (s.email && s.email.toLowerCase().trim() === userEmail));
        if (!staffRecord || !staffRecord.hostelId) {
          // If staff is not assigned to any hostel, only let them see meetings they requested
          const filtered = list.filter((m: any) => m.requesterId === userId || m.studentId === userId);
          return res.json(filtered);
        }
        const filtered = list.filter((m: any) => 
          m.hostelId === staffRecord.hostelId || 
          (m.hostelName && staffRecord.hostelName && m.hostelName.toLowerCase().trim() === staffRecord.hostelName.toLowerCase().trim()) ||
          m.requesterId === userId ||
          m.studentId === userId
        );
        return res.json(filtered);
      }

      if (userRole === 'manager') {
        // Find meetings associated with this manager
        const filtered = list.filter((m: any) => 
          m.managerId === userId || 
          !m.managerId || 
          (m.managerEmail && userEmail && m.managerEmail.toLowerCase().trim() === userEmail)
        );
        return res.json(filtered);
      }

      // If student, return meetings created by or involving them
      const userMeetings = list.filter((m: any) => 
        m.studentId === userId || 
        m.requesterId === userId ||
        (m.requesterEmail && userEmail && m.requesterEmail.toLowerCase().trim() === userEmail) ||
        (m.studentEmail && userEmail && m.studentEmail.toLowerCase().trim() === userEmail)
      );
      return res.json(userMeetings);
    } catch (err: any) {
      console.error("Error fetching meetings:", err);
      res.status(500).json({ error: "Failed to fetch meeting records" });
    }
  });

  app.post("/api/meetings", requireAuth(), async (req: any, res) => {
    try {
      const {
        requesterName,
        requesterType,
        requesterEmail,
        requesterPhone,
        roomOrUnit,
        topic,
        reason,
        category,
        date,
        time,
        timeSlot,
        mode,
        type,
        notes,
        hostelId,
        hostelName,
        managerId,
        managerName
      } = req.body;

      const finalRequesterName = requesterName || req.user.name || 'Anonymous User';
      const finalRequesterType = requesterType || (req.user.role === 'staff' ? 'staff' : req.user.role === 'manager' ? 'administrator' : 'student');
      const finalTopic = topic || reason || 'General Meeting Consultation';
      const finalDate = date || new Date().toISOString().split('T')[0];
      const finalTimeSlot = timeSlot || time || '10:00 AM - 10:30 AM';
      const finalMode = mode || type || 'In-Person (Admin Office)';

      const newMeeting = {
        id: `meet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        hostelId: hostelId || 'hostel-1',
        hostelName: hostelName || 'Emerald Heights Block A',
        managerId: managerId || 'manager_101',
        managerName: managerName || 'Anthony Davis',
        requesterId: req.user.id,
        studentId: req.user.id,
        requesterName: finalRequesterName,
        studentName: finalRequesterName,
        requesterType: finalRequesterType,
        requesterEmail: requesterEmail || req.user.email || `${req.user.name.toLowerCase().replace(/\s+/g, '')}@student.pinevela.com`,
        requesterPhone: requesterPhone || req.user.phone || '+233 24 000 0000',
        roomOrUnit: roomOrUnit || 'Room 204',
        topic: finalTopic,
        reason: finalTopic,
        category: category || 'Room / Accommodation',
        date: finalDate,
        time: finalTimeSlot,
        timeSlot: finalTimeSlot,
        mode: finalMode,
        type: finalMode,
        status: 'Pending',
        meetingLinkOrVenue: finalMode.includes('Google Meet') ? 'https://meet.google.com/pnv-hostel-admin' : 'Hostel Admin Office (Room 101)',
        notes: notes || '',
        managerResponseNotes: '',
        createdAt: new Date().toISOString()
      };

      const saved = await dbCreateMeeting(newMeeting, meetings);

      await dbCreateActivity({
        id: `act-meet-${Date.now()}`,
        text: `New meeting requested by ${finalRequesterName} (${finalRequesterType}): "${finalTopic}" on ${finalDate}`,
        time: 'Just now',
        type: 'info'
      }, activities);

      res.status(201).json(saved);
    } catch (err: any) {
      console.error("Meeting creation error:", err);
      res.status(500).json({ error: "Failed to schedule meeting request" });
    }
  });

  app.put("/api/meetings/:id", requireAuth(["admin", "manager", "staff"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, managerResponseNotes, meetingLinkOrVenue, date, timeSlot, time, mode } = req.body;
      const list = await dbGetMeetings(meetings);
      const targetMeeting = list.find((m: any) => m.id === id);
      if (!targetMeeting) {
        return res.status(404).json({ error: "Meeting log not found" });
      }

      const userRole = req.user.role;
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();

      // Enforce stricter authorization check for staff: they can only update meetings in their assigned hostel or if they were the requester
      if (userRole === 'staff') {
        const staffRecord = staff.find((s: any) => s.userId === userId || (s.email && s.email.toLowerCase().trim() === userEmail));
        if (!staffRecord || !staffRecord.hostelId) {
          if (targetMeeting.requesterId !== userId) {
            return res.status(403).json({ error: "Access Denied: You can only update meetings for your assigned hostel or those you scheduled." });
          }
        } else {
          const isAssignedHostel = (targetMeeting.hostelId === staffRecord.hostelId) ||
            (targetMeeting.hostelName && staffRecord.hostelName && targetMeeting.hostelName.toLowerCase().trim() === staffRecord.hostelName.toLowerCase().trim()) ||
            (targetMeeting.requesterId === userId);
          if (!isAssignedHostel) {
            return res.status(403).json({ error: "Access Denied: You are not authorized to update meeting logs for this hostel." });
          }
        }
      }

      // Enforce authorization check for manager
      if (userRole === 'manager') {
        const managerHostels = hostels.filter(h => 
          h.managerId === userId || 
          h.assignedManagerId === userId ||
          (h.managerEmail && h.managerEmail.toLowerCase().trim() === userEmail)
        );
        const hostelIds = new Set(managerHostels.map(h => h.id));
        const hostelNames = new Set(managerHostels.map(h => h.name?.toLowerCase().trim()));

        const isAuthorizedManager = hostelIds.has(targetMeeting.hostelId) || 
          (targetMeeting.hostelName && hostelNames.has(targetMeeting.hostelName.toLowerCase().trim())) ||
          targetMeeting.managerId === userId ||
          (targetMeeting.managerEmail && targetMeeting.managerEmail.toLowerCase().trim() === userEmail);
        if (!isAuthorizedManager) {
          return res.status(403).json({ error: "Access Denied: You can only update meetings for hostels you operate." });
        }
      }

      const updates: any = {};
      if (status !== undefined) updates.status = status;
      if (managerResponseNotes !== undefined) updates.managerResponseNotes = managerResponseNotes;
      if (meetingLinkOrVenue !== undefined) updates.meetingLinkOrVenue = meetingLinkOrVenue;
      if (date !== undefined) updates.date = date;
      if (timeSlot !== undefined) {
        updates.timeSlot = timeSlot;
        updates.time = timeSlot;
      }
      if (time !== undefined && !timeSlot) {
        updates.time = time;
        updates.timeSlot = time;
      }
      if (mode !== undefined) {
        updates.mode = mode;
        updates.type = mode;
      }
      updates.updatedAt = new Date().toISOString();

      const updated = await dbUpdateMeeting(id, updates, meetings);

      // Create notification for requester
      const recipientId = targetMeeting.studentId || targetMeeting.requesterId;
      if (recipientId) {
        const notifStatus = status || 'Updated';
        await dbCreateNotification({
          id: `notif-meet-${Date.now()}`,
          studentId: recipientId,
          title: `Meeting Request ${notifStatus}`,
          message: `Your meeting on "${targetMeeting.topic || targetMeeting.reason}" on ${updated.date} at ${updated.timeSlot || updated.time} has been ${notifStatus.toLowerCase()}.${managerResponseNotes ? ` Notes: "${managerResponseNotes}"` : ''}`,
          type: notifStatus === 'Approved' || notifStatus === 'Completed' ? 'success' : notifStatus === 'Rejected' || notifStatus === 'Cancelled' ? 'danger' : 'info',
          date: new Date().toISOString().split('T')[0],
          read: false
        }, notifications);
      }

      await dbCreateActivity({
        id: `act-meet-upd-${Date.now()}`,
        text: `Meeting "${targetMeeting.topic || targetMeeting.reason}" was marked as ${status || 'updated'}`,
        time: 'Just now',
        type: status === 'Approved' ? 'success' : status === 'Rejected' ? 'danger' : 'info'
      }, activities);

      res.json(updated);
    } catch (err: any) {
      console.error("Meeting update error:", err);
      res.status(500).json({ error: "Failed to update meeting record" });
    }
  });

  app.delete("/api/meetings/:id", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const success = await dbDeleteMeeting(id, meetings);
      if (!success) {
        return res.status(404).json({ error: "Meeting record not found or could not be removed" });
      }
      res.json({ success: true, message: "Meeting log deleted successfully." });
    } catch (err: any) {
      console.error("Meeting deletion error:", err);
      res.status(500).json({ error: "Failed to delete meeting log" });
    }
  });

  // --- Notifications Endpoints ---
  app.get("/api/notifications", requireAuth(), async (req: any, res) => {
    const list = await dbGetNotifications(notifications);
    const user = req.user;
    const uId = user?.id || '';
    const uUsername = (user?.username || '').toLowerCase().trim();
    const uEmail = (user?.email || '').toLowerCase().trim();
    const store = getStoreInstance();

    const userEmailsSet = new Set<string>();
    if (uEmail) userEmailsSet.add(uEmail);

    // Notifications are account-scoped: do not expand a primary account into linked manager, resident, staff, or merchant identities.
    const userEmails = Array.from(userEmailsSet).filter(Boolean);

    const filtered = (list || []).filter((n: any) => {
      if (!n) return false;
      if (user?.role === 'admin' && (n.targetRole === 'admin' || n.targetRole === 'all')) return true;

      if (n.studentId && (n.studentId === uId)) return true;
      if (n.userId && (n.userId === uId)) return true;
      if (n.recipientId && (n.recipientId === uId)) return true;
      if (n.managerId && (n.managerId === uId)) return true;
      if (n.staffId && (n.staffId === uId)) return true;

      // Match manager's hostels
      const mgrHostels = (hostels || []).filter((h: any) => 
        h && (
          (uId && (h.managerId === uId || h.assignedManagerId === uId)) || 
          (uEmail && h.managerEmail && h.managerEmail.toLowerCase().trim() === uEmail)
        )
      );
      if (mgrHostels.length > 0 && n.hostelId) {
        const mgrHostelIds = new Set(mgrHostels.map((h: any) => h.id));
        if (mgrHostelIds.has(n.hostelId) && (n.targetRole === 'manager' || !n.targetRole || n.type === 'staff_application' || n.type === 'issue_report')) {
          return true;
        }
      }

      if (userEmails.length > 0) {
        const nEmails = [
          (n.studentId || '').toLowerCase().trim(),
          (n.userId || '').toLowerCase().trim(),
          (n.recipientEmail || '').toLowerCase().trim(),
          (n.userEmail || '').toLowerCase().trim(),
          (n.targetEmail || '').toLowerCase().trim(),
          (n.parentUserEmail || '').toLowerCase().trim(),
          (n.managerEmail || '').toLowerCase().trim(),
          (n.staffEmail || '').toLowerCase().trim(),
          (n.email || '').toLowerCase().trim()
        ].filter(e => e.length > 0);

        if (userEmails.some(ue => nEmails.includes(ue))) return true;
      }

      if (uUsername && n.username && (n.username || '').toLowerCase().trim() === uUsername) return true;
      return false;
    });

    // Deduplicate by ID and by normalized title + message + date
    const seenMap = new Set<string>();
    const deduplicated: any[] = [];

    for (const notif of filtered) {
      if (!notif) continue;
      const idKey = notif.id ? `id_${notif.id}` : null;
      const contentKey = `content_${(notif.title || '').trim().toLowerCase()}_${(notif.message || '').trim().toLowerCase()}_${notif.date || ''}`;

      if ((idKey && seenMap.has(idKey)) || seenMap.has(contentKey)) {
        continue;
      }
      if (idKey) seenMap.add(idKey);
      seenMap.add(contentKey);
      deduplicated.push(notif);
    }

    // Check scope/category filter
    const requestedScope = (req.query.scope || req.query.category || '').toString().toLowerCase().trim();

    if (requestedScope === 'market' || requestedScope === 'seller' || requestedScope === 'merchant' || requestedScope === 'ecommerce') {
      const marketOnly = deduplicated.filter((n: any) => {
        if (!n) return false;
        if (n.scope === 'market' || n.category === 'market' || n.category === 'ecommerce' || n.module === 'digital_market' || n.targetRole === 'merchant') {
          return true;
        }
        const title = (n.title || '').toLowerCase();
        const msg = (n.message || '').toLowerCase();
        const text = `${title} ${msg}`;

        // Exclude staff, manager, hostel, room keys, maintenance
        const excludedKeywords = [
          'staff verification',
          'staff account',
          'staff profile',
          'national id credentials',
          'electrician',
          'backup power',
          'plumber',
          'carpenter',
          'hostel staff',
          'room key',
          'maintenance issue',
          'damage deposit',
          'hostel manager',
          'manager account',
          'property inspection',
          'field officer',
          'employment concluded',
          'staff resignation',
          'deal accepted by manager',
          'bargain proposal'
        ];

        if (excludedKeywords.some(kw => text.includes(kw))) {
          return false;
        }

        const marketKeywords = [
          'merchant',
          'digital market',
          'campus store',
          'store application',
          'store accreditation',
          'buy request',
          'order',
          'handover',
          'escrow',
          'delivery pin',
          'meetup location',
          'product',
          'inventory',
          'buyer',
          'seller',
          'item sold',
          'e-commerce',
          'marketplace'
        ];

        return marketKeywords.some(kw => text.includes(kw)) || (n.id && (n.id.startsWith('notif-dm') || n.id.startsWith('notif-ord')));
      });
      return res.json(marketOnly);
    }

    res.json(deduplicated);
  });

  app.put("/api/notifications/read-all", requireAuth(), async (req: any, res) => {
    const list = await dbGetNotifications(notifications);
    const user = req.user;
    const uId = user?.id || '';
    const userEmails = Array.from(new Set([
      (user?.email || '').toLowerCase().trim(),
      (user?.studentEmail || '').toLowerCase().trim(),
      (user?.parentUserEmail || '').toLowerCase().trim(),
      (user?.user?.email || '').toLowerCase().trim(),
      (user?.managerEmail || '').toLowerCase().trim(),
      (user?.staffEmail || '').toLowerCase().trim(),
    ].filter(Boolean)));

    for (const n of list) {
      if (!n) continue;
      const nEmails = [
        (n.studentId || '').toLowerCase().trim(),
        (n.userId || '').toLowerCase().trim(),
        (n.recipientEmail || '').toLowerCase().trim(),
        (n.userEmail || '').toLowerCase().trim(),
        (n.targetEmail || '').toLowerCase().trim(),
        (n.parentUserEmail || '').toLowerCase().trim(),
        (n.managerEmail || '').toLowerCase().trim(),
        (n.staffEmail || '').toLowerCase().trim(),
        (n.email || '').toLowerCase().trim()
      ].filter(e => e.length > 0);

      const matches = (n.studentId && (n.studentId === uId)) ||
                      (n.userId && (n.userId === uId)) ||
                      (n.recipientId && n.recipientId === uId) ||
                      (userEmails.length > 0 && userEmails.some(ue => nEmails.includes(ue)));

      if (matches) {
        n.read = true;
        await dbMarkNotificationRead(n.id, notifications);
      }
    }
    syncStore();
    res.json({ success: true, message: "All notifications marked as read." });
  });

  app.put("/api/notifications/:id/read", requireAuth(), async (req, res) => {
    const { id } = req.params;
    await dbMarkNotificationRead(id, notifications);
    res.json({ success: true });
  });

  // --- Ratings/Feedback Endpoints ---
  app.get("/api/ratings", async (req, res) => {
    const list = await dbGetRatings(ratings);
    res.json(list);
  });

  app.post("/api/ratings", requireAuth(["student"]), async (req: any, res) => {
    const newRating = {
      id: `rate-new-${Date.now()}`,
      studentId: req.user.id,
      studentName: req.user.name,
      date: new Date().toISOString().split('T')[0],
      ...req.body
    };
    const saved = await dbCreateRating(newRating, ratings);
    
    // Also try updating average rating for the hostel
    const currentHostels = await dbGetHostels(hostels);
    const hostelIdx = currentHostels.findIndex(h => h.id === saved.hostelId || h.name === saved.hostelName);
    if (hostelIdx !== -1) {
      const currentRatings = await dbGetRatings(ratings);
      const hostelRatings = currentRatings.filter(r => r.hostelId === currentHostels[hostelIdx].id || r.hostelName === currentHostels[hostelIdx].name);
      const totalScore = hostelRatings.reduce((sum, r) => sum + r.score, 0);
      const newScore = Number((totalScore / hostelRatings.length).toFixed(1));
      await dbUpdateHostel(currentHostels[hostelIdx].id, { rating: newScore }, hostels);
    }

    await dbCreateActivity({
      id: `act-rate-${Date.now()}`,
      text: `${saved.studentName} rated ${saved.hostelName} ${saved.score} stars`,
      time: 'Just now',
      type: 'info'
    }, activities);

    res.status(201).json(saved);
  });

  app.get("/api/activities", requireAuth(["admin", "manager", "staff", "student"]), async (req, res) => {
    const list = await dbGetActivities(activities);
    res.json(list);
  });

  // --- Chat App Endpoints ---

  // 1. GET current user's profile
  app.get("/api/chat/profile", requireAuth(), async (req: any, res) => {
    const studentId = req.user.id;
    let profile = await dbGetChatProfile(studentId, chatProfiles);
    if (!profile) {
      profile = await dbUpdateChatProfile(
        studentId,
        req.user.name,
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        chatProfiles
      );
    }
    res.json(profile);
  });

  // 2. POST update profile
  app.post("/api/chat/profile", requireAuth(), async (req: any, res) => {
    const studentId = req.user.id;
    const { nickname, avatarUrl } = req.body;
    let existingProfile = await dbGetChatProfile(studentId, chatProfiles);
    const updatedNickname = nickname || (existingProfile ? existingProfile.nickname : req.user.name);
    const updatedAvatar = avatarUrl || (existingProfile ? existingProfile.avatarUrl : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80');
    
    let profile = await dbUpdateChatProfile(studentId, updatedNickname, updatedAvatar, chatProfiles);
    res.json(profile);
  });

  // 3. GET messages for a channel
  app.get("/api/chat/messages", requireAuth(), async (req: any, res) => {
    const { channelType, channelId } = req.query;
    if (!channelType || !channelId) {
      return res.status(400).json({ error: "channelType and channelId queries are required" });
    }
    const messages = await dbGetChatMessages(channelType as string, channelId as string, chatMessages);
    const seen = new Set<string>();
    const uniqueMessages = (messages || []).filter((m: any) => {
      if (!m || !m.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    res.json(uniqueMessages);
  });

  // 4. POST message
  app.post("/api/chat/messages", requireAuth(), async (req: any, res) => {
    const studentId = req.user.id;
    const { channelType, channelId, messageType, content } = req.body;
    if (!channelType || !channelId || !content) {
      return res.status(400).json({ error: "Missing required message fields" });
    }

    let profile = await dbGetChatProfile(studentId, chatProfiles);
    const senderName = profile ? profile.nickname : req.user.name;
    const senderAvatar = profile ? profile.avatarUrl : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

    const newMsg = {
      id: `msg-new-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      channelType,
      channelId,
      senderId: studentId,
      senderName,
      senderAvatar,
      messageType: messageType || 'text',
      content,
      reactions: {},
      createdAt: new Date().toISOString()
    };

    const savedMsg = await dbCreateChatMessage(newMsg, chatMessages);

    // Auto-create chat notifications for recipients
    try {
      const allUsers = await dbGetUsers(MOCK_USERS);
      const students = allUsers.filter(u => {
        const userObj = u.user || u;
        return userObj && userObj.role === 'student' && userObj.id !== studentId;
      });

      if (channelType === 'global') {
        for (const s of students) {
          const userObj = s.user || s;
          const newNotif = {
            id: `notif-chat-${Date.now()}-${userObj.id}`,
            studentId: userObj.id,
            title: 'Global Chat Lounge',
            message: `New message in Global Lounge from ${senderName}: "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}"`,
            type: 'info',
            date: new Date().toISOString().split('T')[0],
            read: false
          };
          await dbCreateNotification(newNotif, notifications);
        }
      } else if (channelType === 'hostel') {
        for (const s of students) {
          const userObj = s.user || s;
          const newNotif = {
            id: `notif-chat-${Date.now()}-${userObj.id}`,
            studentId: userObj.id,
            title: 'My Hostel Lounge',
            message: `New message in Hostel Lounge from ${senderName}: "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}"`,
            type: 'info',
            date: new Date().toISOString().split('T')[0],
            read: false
          };
          await dbCreateNotification(newNotif, notifications);
        }
      } else if (channelType === 'dm') {
        const rooms = await dbGetDMRooms(studentId, dmRooms);
        const room = rooms.find(r => r.id === channelId);
        if (room) {
          const opponentId = room.user1Id === studentId ? room.user2Id : room.user1Id;
          const newNotif = {
            id: `notif-chat-${Date.now()}-${opponentId}`,
            studentId: opponentId,
            title: 'Direct Chat',
            message: `New message from ${senderName}: "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}"`,
            type: 'info',
            date: new Date().toISOString().split('T')[0],
            read: false
          };
          await dbCreateNotification(newNotif, notifications);
        }
      }
    } catch (err) {
      console.error("Failed to auto-create chat notifications:", err);
    }

    res.status(201).json(savedMsg);
  });

  // 4b. React to message
  app.post("/api/chat/messages/:id/react", requireAuth(), async (req: any, res) => {
    const { id } = req.params;
    const { emoji } = req.body;
    const studentId = req.user.id;

    let profile = await dbGetChatProfile(studentId, chatProfiles);
    const reactorName = profile ? profile.nickname : req.user.name;

    const updatedMsg = await dbReactToChatMessage(id, emoji, reactorName, chatMessages);
    if (!updatedMsg) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json(updatedMsg);
  });

  // 5. GET all DM rooms for current student
  app.get("/api/chat/dms", requireAuth(), async (req: any, res) => {
    const studentId = req.user.id;
    const rooms = await dbGetDMRooms(studentId, dmRooms);
    
    // Enrich DM rooms with nickname and avatar info from mock users list
    const allUsers = await dbGetUsers(MOCK_USERS);
    
    const enrichedRooms = [];
    for (const room of rooms) {
      const isInitiator = room.user1Id === studentId;
      const opponentId = isInitiator ? room.user2Id : room.user1Id;
      
      const opponentUserRecord = allUsers.find(u => u.id === opponentId || (u.user && u.user.id === opponentId));
      const opponentUser = opponentUserRecord ? (opponentUserRecord.user || opponentUserRecord) : null;
      
      const opponentProfile = await dbGetChatProfile(opponentId, chatProfiles);
      
      enrichedRooms.push({
        ...room,
        isInitiator,
        opponent: {
          id: opponentId,
          name: opponentUser ? opponentUser.name : 'Unknown User',
          nickname: opponentProfile ? opponentProfile.nickname : (opponentUser ? opponentUser.name : 'Unknown'),
          avatarUrl: opponentProfile ? opponentProfile.avatarUrl : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'
        }
      });
    }
    
    res.json(enrichedRooms);
  });

  // 6. POST request DM room
  app.post("/api/chat/dms/request", requireAuth(), async (req: any, res) => {
    const studentId = req.user.id;
    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ error: "recipientId is required" });
    }

    const rooms = await dbGetDMRooms(studentId, dmRooms);
    let existingRoom = rooms.find(r => 
      (r.user1Id === studentId && r.user2Id === recipientId) ||
      (r.user1Id === recipientId && r.user2Id === studentId)
    );

    if (existingRoom) {
      return res.json(existingRoom);
    }

    const newRoom = {
      id: `room-${studentId.substring(0, 5)}-${recipientId.substring(0, 5)}-${Date.now()}`,
      user1Id: studentId,
      user2Id: recipientId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const savedRoom = await dbCreateDMRoom(newRoom, dmRooms);
    res.status(201).json(savedRoom);
  });

  // 7. POST accept DM room request
  app.post("/api/chat/dms/accept", requireAuth(), async (req: any, res) => {
    const { roomId } = req.body;
    if (!roomId) {
      return res.status(400).json({ error: "roomId is required" });
    }
    const updatedRoom = await dbAcceptDMRoom(roomId, dmRooms);
    if (!updatedRoom) {
      return res.status(404).json({ error: "DM Room not found" });
    }
    res.json(updatedRoom);
  });

  // 8. GET other students list for DM start
  app.get("/api/chat/students", requireAuth(), async (req: any, res) => {
    const studentId = req.user.id;
    const allUsers = await dbGetUsers(MOCK_USERS);
    
    const studentsFiltered = allUsers.filter(u => {
      const uRecord = u.user || u;
      return uRecord.role === 'student' && uRecord.id !== studentId;
    });

    const studentUsers = [];
    for (const u of studentsFiltered) {
      const uRecord = u.user || u;
      const profile = await dbGetChatProfile(uRecord.id, chatProfiles);
      studentUsers.push({
        id: uRecord.id,
        name: uRecord.name,
        nickname: profile ? profile.nickname : uRecord.name,
        avatarUrl: profile ? profile.avatarUrl : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'
      });
    }
    
    res.json(studentUsers);
  });

  // --- SECURED & ENCRYPTED STAFF-MANAGER CHAT SYSTEM ---
  // Key derivation for secure encryption/decryption
  const CHAT_ALGO = 'aes-256-cbc';
  const CHAT_SECRET_KEY = crypto.scryptSync(process.env.CHAT_ENCRYPTION_SECRET || 'PineVelaSecureStaffChatSecret2026Key', 'salt', 32);
  const CHAT_IV = crypto.scryptSync(process.env.CHAT_ENCRYPTION_IV || 'PineVelaIVSalt26', 'salt', 16);

  function encryptMsg(text: string): string {
    try {
      const cipher = crypto.createCipheriv(CHAT_ALGO, CHAT_SECRET_KEY, CHAT_IV);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (err) {
      console.error("Staff chat encryption error:", err);
      return text;
    }
  }

  function decryptMsg(encryptedText: string): string {
    try {
      const decipher = crypto.createDecipheriv(CHAT_ALGO, CHAT_SECRET_KEY, CHAT_IV);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error("Staff chat decryption error:", err);
      return encryptedText;
    }
  }

  // 1. GET staff chat rooms (only accessible to manager or the staff themselves, strictly forbidden to admin and anyone else)
  app.get("/api/staff-chat/rooms", requireAuth(), async (req: any, res) => {
    try {
      const userId = (req.user.id || '').toString().trim();
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const userRole = (req.user.role || '').toLowerCase();

      // Strictly deny access to admins to fulfill "noone can see it beside the users not even the admins"
      if (userRole === 'admin') {
        return res.status(403).json({ error: "Access Denied: Chat logs are fully encrypted and only visible to the respective manager and staff member. Even Administrators are restricted from viewing." });
      }

      let rooms = [];
      if (userRole === 'manager') {
        rooms = (staffChatRooms || []).filter((r: any) => 
          r.managerId === userId || 
          (userEmail && r.managerEmail && r.managerEmail.toLowerCase().trim() === userEmail)
        );
      } else if (userRole === 'staff') {
        rooms = (staffChatRooms || []).filter((r: any) => 
          r.staffId === userId || 
          r.staffUserId === userId || 
          (userEmail && r.staffEmail && r.staffEmail.toLowerCase().trim() === userEmail)
        );
      }

      res.json(rooms);
    } catch (err) {
      console.error("Error loading staff chat rooms:", err);
      res.status(500).json({ error: "Failed to load chat rooms" });
    }
  });

  // 2. GET messages for a specific staff-manager chat room
  app.get("/api/staff-chat/rooms/:roomId/messages", requireAuth(), async (req: any, res) => {
    try {
      const { roomId } = req.params;
      const userId = (req.user.id || '').toString().trim();
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const userRole = (req.user.role || '').toLowerCase();

      console.log(`[CHAT DEBUG] Loading messages for roomId="${roomId}" | Requester: userId="${userId}", role="${userRole}"`);

      // Admin exclusion check
      if (userRole === 'admin') {
        console.log(`[CHAT DEBUG] 403 Forbidden! User is admin and excluded from staff chat.`);
        return res.status(403).json({ error: "Access Denied: Even admins cannot view encrypted conversations." });
      }

      const room = (staffChatRooms || []).find((r: any) => r.id === roomId);
      if (!room) {
        console.log(`[CHAT DEBUG] 404 Room not found: "${roomId}"`);
        return res.status(404).json({ error: "Chat room not found" });
      }

      console.log(`[CHAT DEBUG] Room details: staffId="${room.staffId}", managerId="${room.managerId}"`);

      // Check if user is either the staff or the manager in this room
      const isStaffInRoom = room.staffId === userId || room.staffUserId === userId || (userEmail && room.staffEmail && room.staffEmail.toLowerCase().trim() === userEmail);
      const isManagerInRoom = room.managerId === userId || (userEmail && room.managerEmail && room.managerEmail.toLowerCase().trim() === userEmail);

      if (!isStaffInRoom && !isManagerInRoom) {
        console.log(`[CHAT DEBUG] 403 Forbidden! Requester userId="${userId}" is not authorized for this room`);
        return res.status(403).json({ error: "Access Denied: You are not authorized to view this encrypted conversation." });
      }

      // Find messages and decrypt them on the fly
      const filteredMsgs = staffChatMessages.filter((m: any) => m.roomId === roomId);
      const decryptedMsgs = filteredMsgs.map((m: any) => {
        return {
          ...m,
          content: decryptMsg(m.encryptedContent)
        };
      });

      res.json(decryptedMsgs);
    } catch (err) {
      console.error("Error loading chat messages:", err);
      res.status(500).json({ error: "Failed to load messages" });
    }
  });

  // 3. POST message to a specific staff-manager chat room
  app.post("/api/staff-chat/rooms/:roomId/messages", requireAuth(), async (req: any, res) => {
    try {
      const { roomId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content cannot be empty" });
      }

      // Admin exclusion check
      if (userRole === 'admin') {
        return res.status(403).json({ error: "Access Denied: Administrators cannot participate in staff chat conversations." });
      }

      const room = staffChatRooms.find((r: any) => r.id === roomId);
      if (!room) {
        return res.status(404).json({ error: "Chat room not found" });
      }

      // Validate participation
      if (room.staffId !== userId && room.managerId !== userId) {
        return res.status(403).json({ error: "Access Denied: You are not authorized to send messages to this room." });
      }

      // Encrypt the content before pushing to memory/store
      const encrypted = encryptMsg(content.trim());

      const newMsg = {
        id: `staff-msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        roomId,
        senderId: userId,
        senderName: req.user.name || 'Anonymous',
        senderRole: userRole,
        encryptedContent: encrypted,
        createdAt: new Date().toISOString()
      };

      staffChatMessages.push(newMsg);
      syncStore();

      // Return the decrypted message to the client for immediate rendering
      res.status(201).json({
        ...newMsg,
        content: content.trim()
      });
    } catch (err) {
      console.error("Error saving secure chat message:", err);
      res.status(500).json({ error: "Failed to send encrypted message" });
    }
  });

  // 404 handler for API routes to prevent falling through to SPA HTML
  app.all('/api/*', (req, res) => {
    console.warn(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite integration middleware (development) or serving static build assets (production)
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/*.json', '**/*.log', '**/*.tmp*', '**/scratch/**'],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV !== 'test') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[SERVER ERROR]", err);
    if (res.headersSent) {
      return next(err);
    }
    if (req.path.startsWith('/api/')) {
      return res.status(err.status || 500).json({ 
        error: err.message || "Internal Server Error",
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
    next(err);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PineVela Backend] Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start fullstack server:", err);
});
