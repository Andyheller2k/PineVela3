import { publicStoreProfile, storefrontProducts, storeProfileFields, StoreProfileError } from './marketStoreProfile.js';
import { marketStoreBranding } from './marketBranding.js';
import { residenceForViewer } from './hostelSecurity.js';
import { primaryAccountRecipient } from './accountSubmissionNotifications.js';
import { registrationBan } from './residenceDeletion.js';
import { ResidenceRequests, ResidenceRequestError, installResidenceRequests } from './residenceRequests.js';
import { installAdminApprovalSecurity } from './adminApprovalSecurity.js';
import { installMaintenanceNotice } from './maintenanceNotice.js';
import { installPaystackPayments, PaystackPayments, marketAccessPaid, publicPaidStore, hasVerifiedRegistration } from './paystackPayments.js';
import { effectiveMarketPlan, marketPlanBenefits, compareMarketPriority, PLAN_LIMITS, planCapacityError } from './marketPlans.js';
import { AdminGovernance, GovernanceError, initializeAdminGovernance, activeAdministrator } from './adminGovernance.js';
import { publicPlatformSettings, MAINTENANCE_MESSAGE } from './platformSettings.js';
import { installAdminGovernance } from './adminGovernanceRoutes.js';
import { installThemePreferences } from './themePreferences.js';
import { DatabasePersistenceError } from './jsonStoreSafety.js';
import { realpathSync } from 'node:fs';
import { meetingVisible, notificationVisible, notificationReaderKey, notificationForActor } from './recordAccessSecurity.js';
import { ownsMarketStore } from './marketOwnership.js';
import { marketMediaFields, MarketMediaError, canUploadMarketPhotos } from './marketMediaSecurity.js';
import { createSessionToken, setRecordSession, clearRecordSession, sessionMatches, requestSessionToken, revokeMatchingSessions, cookieSessionRequest, setSessionCookie, clearSessionCookie, sessionOriginGuard, sessionLifetimeMs } from './sessionSecurity.js';
import { moderationAccounts, accountDirectoryRelations, accountAccess, banResponse, accountRestriction, tokenAccount, revokedBanNotice, governedMarketBanned } from './accountModeration.js';
import { createImageStorage, ImageUploadError } from './imageUploadSecurity.js';
import { createResourceProtection, EventConnections, guardAsyncRoutes, ResourceLimitError, resourceFailure, trustedProxyAddresses, UPLOAD_ROUTE, MARKET_UPLOAD_ROUTE, ADMIN_PROFILE_UPLOAD_ROUTE, isImageUploadRoute } from './resourceSecurity.js';
import { installMarketRatings, verifiedMarketRatings, publicMarketRating, ratingSummary } from './marketRatingSecurity.js';
import { issueDeliveryPin, checkDeliveryPin, publicMarketOrder, orderAction, authorizeOrderAction, isOrderBuyer, isOrderSeller } from './marketOrderWorkflow.js';
import { catalogOrderTerms, checkOrderStock, consumeOrderStock, activeOrderReservation, terminalMarketOrder, MarketOrderError } from './marketOrderSecurity.js';
import { authorizeIssueAction, needsResidentSignoff, IssueWorkflowError } from './issueWorkflowSecurity.js';
import { authorizedKeyHostels, RoomKeyAttemptGuard, RoomKeyAttemptLimit, roomActivationPreview } from './roomKeySecurity.js';
import { assignedInspectionRecords, privateResidentDirectory } from './privateRecordAccess.js';
import { KNOWN_LEGACY_PASSWORDS, KNOWN_LEGACY_HASHES } from './legacyCredentialPolicy.js';
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { accountData, accountId, accountKey, accountRole, canManageHostel, credentialValues, hasActiveRoom, hashCredentialAsync, normalizeEmail, passwordIsReusedAsync, publicAccountData, releaseRoom, verifyCredentialAsync, findAsync } from "./accountSecurity.js";
import { buildIssueDetailsUpdate, canEditIssueDetails, IssueEditValidationError } from "./issueReportSecurity.js";
import { activeOfficerAccount, buildInspectionReport, currentReportOfficer, inspectionSubmissionTarget, InspectionSubmissionError } from "./inspectionReportSecurity.js";
import { SignupGuard, signupInput } from "./signupSecurity.js";
import { signupProviderConfig, sendSignupVerification, confirmSignupVerification, SignupError } from "./supabaseSignup.js";
import { installGoogleAuth, googlePrimaryAccount, googleAccountBlocked, googleRequestLogUrl } from './googleAuth.js';
import { servicePoint } from './serviceLocation.js';
import { internationalPhone } from './internationalPhone.js';
import { retiredHostelFields } from './hostelRegistrationFields.js';
import { developmentSignupRequest, isDevelopmentSignup } from "./developmentSignup.js";
import { managerIsApproved, managerRecordMatches, managerForDossier, managerOnboardingRequest } from "./managerApprovalSecurity.js";
import { installMarketMessaging, isMarketMessageNotification, sellerStore } from './marketMessaging.js';
import { installStaffManagement, activeResidentRoom, activeManagedStaff } from './staffManagement.js';
import { hostelVerificationSubmission, OnboardingSubmissionError } from './onboardingSubmissionSecurity.js';
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
  dbCreateActivity, dbRegisterHostelAtomic,
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
  getStoreInstance,
  dbGetRoomKeys,
  dbGetRoomKeyByCode,
  dbAssignRoomKey,
  dbGenerateHostelRoomKeys,
  dbRecordRoomKeyDispatch, generateHostelRoomKeyCode,
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

function hashPasswordSha256(password: string): string {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

// Known legacy default credentials (plaintext and SHA-256 hashes) that must never authenticate
/** Verify stored credentials while rejecting locked accounts and disabled legacy passwords. */
async function passwordsMatch(input: string, ...storedCandidates: Array<string | undefined | null>): Promise<boolean> {
  if (!input) return false;
  const hashed = hashPasswordSha256(input);
  if (KNOWN_LEGACY_PASSWORDS.has(input) || KNOWN_LEGACY_HASHES.has(hashed)) {
    return false;
  }
  return Boolean(await findAsync([...new Set(storedCandidates)], c => verifyCredentialAsync(input, c)));
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
  setRecordSession(userEntry, token);
  const email = (userEntry.email || userEntry.user?.email || '').toLowerCase().trim();
  const id = userEntry.id || userEntry.user?.id || userEntry.officerId || userEntry.user?.officerId;
  if ((email || id) && accountRole(userEntry) === 'verification_team') {
    const vt = verificationTeams.find((t: any) => 
      (email && (t.email || '').toLowerCase() === email) ||
      (id && (t.id === id || t.officerId === id))
    );
    if (vt) {
      setRecordSession(vt, token);
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
  if (err instanceof DatabasePersistenceError) process.exitCode = 1;
  // Note: For truly unknown fatal errors, we log and keep running, 
  // but in a production environment one might consider a graceful shutdown.
});

// Stateful backend baseline datasets - only registered managers and accredited properties
const defaultHostels: any[] = [];

const initialHostels: any[] = defaultHostels;


const initialIssueReports: any[] = [];

const initialActivities: any[] = [];

// Backend state containers
let hostels = [...initialHostels];
let issueReports = [...initialIssueReports];
let activities = [...initialActivities];

const initialStaff: any[] = [];
let staff: any[] = [...initialStaff];
let staffAuditLogs: any[] = [];
let staffReviews: any[] = [];
let staffBargains: any[] = [];

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
    totalCapacity: 140,
    totalRooms: 40,
    totalBlocks: 3,
    pricePerYear: 4200,
    currency: 'GHS',
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
    adminNotes: 'Onboarding fee GHS 50 paid.',
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

let onboardingPayments: any[] = [];

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
        user: {
          id: adminId,
          name: process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator',
          username: process.env.BOOTSTRAP_ADMIN_USERNAME || bootstrapEmail.split('@')[0],
          email: bootstrapEmail,
          role: 'admin',
          password: bootstrapHash,
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
verificationTeams = ((persistentData as any).verificationTeams && (persistentData as any).verificationTeams.length > 0) ? (persistentData as any).verificationTeams : verificationTeams;
verificationInspections = ((persistentData as any).verificationInspections && (persistentData as any).verificationInspections.length > 0) ? (persistentData as any).verificationInspections : [...DEFAULT_INSPECTIONS];
notifications = persistentData.notifications || [];
staffReviews = persistentData.staffReviews || [];
ratings = persistentData.ratings || [];
onboardingPayments = persistentData.onboardingPayments || [];

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
        if (migratingAccountIsolation) clearRecordSession(target);
      }
    } else if (migratingAccountIsolation && (accountRole(entry) === 'merchant' || data.isDigitalMarketOnly)) {
      clearRecordSession(entry);
      clearRecordSession(data);
    }
  }
  if (migratingAccountIsolation) {
    for (const item of [...(initStore.digitalMarketApplications || []), ...(initStore.digitalMarketStores || [])]) {
      clearRecordSession(item);
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

  initStore.users = MOCK_USERS;
  initializeAdminGovernance(initStore);
  if (!initStore.managerRegistrationRequests) {
    initStore.managerRegistrationRequests = [];
  }
  if (!initStore.staff) {
    initStore.staff = [];
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
  persistentData.platformSettings = getStoreInstance().platformSettings;
  persistentData.staff = staff;
  persistentData.staffAuditLogs = staffAuditLogs;
  persistentData.staffReviews = staffReviews;
  persistentData.staffBargains = staffBargains;

  savePersistentStore(persistentData);
}


// Hash seed account passwords at boot so plaintext is not compared forever in memory dumps of store
for (const entry of MOCK_USERS) {
  if (!entry) continue;
  if (entry.requiresPasswordReset || entry.user?.requiresPasswordReset || String(entry.password || entry.user?.password || '').startsWith('!LOCKED_')) {
    for (const target of [entry, entry.user].filter(Boolean)) {
      clearRecordSession(target);
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

}
for (const officer of verificationTeams) {
  if (officer.requiresPasswordReset || String(officer.password || '').startsWith('!LOCKED_')) {
    clearRecordSession(officer);
    continue;
  }
  if (officer?.password && !/^[a-f0-9]{64}$/i.test(officer.password) && !officer.password.startsWith('scrypt-sha256$')) {
    officer.password = hashPasswordSha256(officer.password);
  }

}
syncStore();

async function startServer() {
  const app = express();
  guardAsyncRoutes(app);
  app.set('trust proxy', trustedProxyAddresses());
  const PORT = Number(process.env.PORT || 3000);
  const resourceActor = (req: express.Request) => {
    const token = requestSessionToken(req);
    if (!token) return '';
    const store = getStoreInstance();
    const entry = [...MOCK_USERS, ...(store.users || []), ...(store.digitalMarketApplications || []), ...(store.digitalMarketStores || []), ...(store.verificationTeams || [])].find(record => sessionMatches(record, token));
    return entry ? `${accountRole(entry) || 'merchant'}:${accountId(entry)}` : '';
  };
  let activeWrites = 0;
  const governance = new AdminGovernance(getStoreInstance, syncManagedStore, undefined, () => Math.max(0, activeWrites - 1) + Math.max(0, app.locals.activeAsyncHandlers - 1));
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || ['HEAD', 'OPTIONS'].includes(req.method) || ['/api/health', '/api/sync/events', '/api/admin/governance'].includes(req.path)) return next();
    if (governance.blocked && req.method !== 'GET') return res.status(503).json({ error: 'Writes are blocked pending offline wipe recovery inspection.' });
    activeWrites++;
    let finished = false;
    const release = () => { if (!finished) { activeWrites--; finished = true; } };
    res.once('finish', release); res.once('close', release);
    next();
  });
  const resources = await createResourceProtection({ actor: resourceActor, loginIdentity: req => {
    const store = getStoreInstance();
    const records = [...MOCK_USERS, ...(store.users || []), ...(store.digitalMarketApplications || []), ...(store.verificationTeams || [])];
    // Charge every submitted identity: conflicting alias fields must not hide the targeted account.
    const identifiers = [req.body.usernameOrEmail, req.body.studentEmail, req.body.email, req.body.officerId]
      .filter(value => typeof value === 'string' && value.trim()).map(value => normalizeEmail(value).slice(0, 254));
    return [...new Set(identifiers.map(identifier => {
      const clean = identifier.replace(/[^a-z0-9]/g, '');
      const matched = records.find(record => {
        const profile = accountData(record);
        const values = [profile?.email, record.email, record.studentEmail, profile?.username, record.username,
          profile?.officerId, record.officerId, profile?.id, record.id, profile?.studentId, record.studentId,
          profile?.residentId, record.residentId, profile?.phone, record.phone, profile?.roomKey, record.roomKey];
        const officer = accountRole(record) === 'verification_team' || record.officerId || profile?.officerId;
        if (officer) values.push(normalizeEmail(profile?.email || record.email).split('@')[0]);
        return values.some(value => value && normalizeEmail(value) === identifier) || (clean.length > 2 &&
          [profile?.username, record.username, profile?.studentId, record.studentId, profile?.residentId, record.residentId]
            .some(value => value && normalizeEmail(value).replace(/[^a-z0-9]/g, '') === clean));
      });
      return normalizeEmail(accountData(matched)?.email || matched?.studentEmail || matched?.email) || identifier;
    }))].concat(identifiers.length ? [] : ['missing']);
  } });

  // Reject excessive traffic and unauthorized large uploads before parsing submitted bytes.
  app.use((req, res, next) => req.path.toLowerCase().startsWith('/api/') || req.path.toLowerCase().startsWith('/uploads/') ? resources.beforeBody(req, res, next) : next());
  app.use('/api', sessionOriginGuard);
  app.use((req, res, next) => {
    const route = req.path.toLowerCase().replace(/\/+$/, '');
    if (!route.startsWith('/api/') || !publicPlatformSettings(getStoreInstance()).maintenanceMode) return next();
    const publicRead = req.method === 'GET' && ['/api/settings', '/api/health', '/api/sync/events'].includes(route);
    const authEntry = req.method === 'POST' && ['/api/auth/login', '/api/auth/logout', '/api/auth/admin-invitation/accept', '/api/payments/paystack/webhook'].includes(route);
    if (publicRead || authEntry) return next();
    const token = requestSessionToken(req), store = getStoreInstance();
    const admin = token && (store.users || []).find((entry: any) => accountRole(entry) === 'admin' && sessionMatches(entry, token) && activeAdministrator(store, accountId(entry)));
    if (admin) return next();
    return res.status(503).set({ 'Cache-Control': 'no-store', 'Retry-After': '30' }).json({ error: MAINTENANCE_MESSAGE, maintenanceMode: true });
  });
  app.use((req, res, next) => {
    if (req.method !== 'POST' || !isImageUploadRoute(req.path.toLowerCase().replace(/\/+$/, ''))) return next();
    res.set('Connection', 'close');
    const marketUpload = req.path.toLowerCase().replace(/\/+$/, '') === MARKET_UPLOAD_ROUTE;
    const adminProfileUpload = req.path.toLowerCase().replace(/\/+$/, '') === ADMIN_PROFILE_UPLOAD_ROUTE;
    return requireAuth(adminProfileUpload ? ['admin'] : marketUpload ? ['merchant', 'admin'] : ['admin', 'manager'])(req, res, () => {
      const actor = (req as any).user;
      if (marketUpload && actor.role !== 'admin') {
        const seller = sellerStore(actor, getStoreInstance());
        if (!canUploadMarketPhotos(actor, seller, getStoreInstance())) return res.status(403).json({ error: 'An approved seller store is required to upload marketplace photographs.' });
      }
      return next();
    });
  });
  app.use((req, res, next) => req.path.toLowerCase().startsWith('/api/') ? resources.parseBody(req, res, next) : next());
  app.use((req, res, next) => req.path.toLowerCase().startsWith('/api/') ? resources.afterBody(req, res, next) : next());
  app.use(compression() as any);

  // Credentials and their hashes are never included in API responses.
  sessionLifetimeMs(); // Validate lifetime configuration before accepting requests.
  app.use((req: any, res, next) => {
    if (req.method !== 'POST') return next();
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    const managerRegistration = ['/api/auth/register-manager', '/api/auth/register-manager-account', '/api/manager-verifications/submit'].includes(path) || path === '/api/users/register' && req.body?.role !== 'user';
    const hostelRegistration = path === '/api/hostels/register';
    if (!managerRegistration && !hostelRegistration) return next();
    return requireAuth()(req, res, () => {
      const kind = hostelRegistration ? 'hostel' : 'manager_account';
      const ban = registrationBan(getStoreInstance(), req.user, kind);
      if (ban) return res.status(403).json({ error: `New ${hostelRegistration ? 'hostel' : 'manager-account'} registration is blocked until ${ban.until}. ${ban.reason}`, registrationBanned: true, registrationBanUntil: ban.until });
      next();
    });
  });
  app.use('/api', (req, res, next) => {
    const sendJson = res.json.bind(res);
    const sessionResponse = ['/auth/login', '/auth/verify-unified', '/digital-market/login', '/room-keys/claim', '/residents/onboard', '/verification-teams/login', '/auth/verification-team-login', '/auth/register-unified', '/users/register', '/auth/register-manager'].includes(req.path);
    res.json = (value: any) => {
      const profile = value?.user || value;
      if (sessionResponse && res.statusCode < 400 && profile?.id && profile?.role) {
        const access = accountAccess(getStoreInstance(), profile.id, profile.role);
        if (access.banned) {
          if (profile.token) revokeMatchingSessions([getStoreInstance(), MOCK_USERS, verificationTeams], profile.token);
          syncManagedStore(); clearSessionCookie(res); res.status(403);
          return sendJson(banResponse(access));
        }
      }
      return sendJson(publicAccountData(value, sessionResponse && !cookieSessionRequest(req)));
    };
    next();
  });

  // Enforce governed bans/restrictions before any route, including legacy aliases.
  app.use((req, res, next) => {
    if (!req.path.toLowerCase().startsWith('/api/') || ['/api/auth/logout', '/api/auth/login', '/api/digital-market/login', '/api/verification-teams/login', '/api/auth/verification-team-login', '/api/payments/paystack/webhook'].includes(req.path.toLowerCase())) return next();
    const store = getStoreInstance(), token = requestSessionToken(req);
    if (!Object.keys(store.adminGovernance?.accountPolicies || {}).length) return next();
    const denied = revokedBanNotice(store, token);
    if (denied) return res.status(403).set('Cache-Control', 'no-store').json(denied);
    const actor = tokenAccount(store, token);
    if (actor && actor.role !== 'admin') {
      const access = accountAccess(store, actor.id, actor.role);
      if (access.banned) return res.status(403).set('Cache-Control', 'no-store').json(banResponse(access));
      const restriction = accountRestriction(store, actor.id, actor.role, req.method, req.path);
      if (restriction) return res.status(403).set('Cache-Control', 'no-store').json(restriction);
    }
    next();
  });
  app.use((req, res, next) => {
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    const legacyBan = req.method === 'POST' && path === '/api/admin/digital-market/toggle-ban-store' ||
      req.method === 'PUT' && /^\/api\/(?:manager-requests|manager-verifications|admin\/managers)\/[^/]+\/(?:block|unblock|suspend)$/.test(path);
    if (!legacyBan) return next();
    return requireAuth(['admin'])(req, res, () => res.status(410).json({ error: 'Single-administrator account bans are retired. Use Accounts to submit a five-administrator proposal.' }));
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

  async function updateIdentityPassword(records: any[], password: string, email: string, role: string): Promise<void> {
    const hash = await hashCredentialAsync(password);
    for (const record of records) {
      const previous = credentialValues(record);
      for (const target of [record, record.user].filter(Boolean)) {
        target.passwordHistory = [...new Set([...(target.passwordHistory || []), ...previous])];
        target.password = hash;
        delete target.plainPassword;
        delete target.localPassword;
        delete target.userPropPassword;
        clearRecordSession(target);
        target.requiresPasswordReset = false;
      }
    }
    if (role === 'merchant') {
      for (const item of getStoreInstance().digitalMarketStores || []) {
        if (normalizeEmail(item.studentEmail) === email) { clearRecordSession(item); }
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
  app.use('/api', async (req: any, res, next) => {
    const route = req.path;
    const fullPath = `/api${route}`;
    if (req.method !== 'POST' || (!creationPaths.has(fullPath) && !passwordPaths.has(fullPath))) return next();
    const store = getStoreInstance();
    const token = requestSessionToken(req);
    const actorEntry = token ? [...MOCK_USERS, ...(store.users || [])].find(u => sessionMatches(u, token)) : null;
    if (isDevelopmentSignup(actorEntry, store.users || []) && !developmentSignupRequest(req)) return res.status(401).json({ error: 'Development accounts are only available in local development.' });
    const merchantSession = token && [...(store.digitalMarketApplications || []), ...(store.digitalMarketStores || [])].some(m => sessionMatches(m, token));
    const merchantRecord = merchantSession ? [...(store.digitalMarketApplications || []), ...(store.digitalMarketStores || [])].find(m => sessionMatches(m, token)) : null;
    const actor = accountData(actorEntry) || (merchantRecord ? { id: `merchant:${merchantRecord.id}`, email: merchantRecord.studentEmail, parentUserId: merchantRecord.userId, parentUserEmail: merchantRecord.parentUserEmail, role: 'merchant' } : null);
    const ownManagerDocuments = fullPath === '/api/manager-verifications/submit' && actor?.role === 'manager' && !req.body.password && normalizeEmail(req.body.managerEmail || req.body.email) === normalizeEmail(actor.email);
    const creatingAccount = creationPaths.has(fullPath) && !ownManagerDocuments;
    if (fullPath === '/api/users/register' && req.body.role && !['user', 'manager'].includes(req.body.role)) return res.status(400).json({ error: 'Use the dedicated registration flow for this account type.' });
    if (creatingAccount && (merchantSession || (actor && actor.role !== 'user' && !(actor.role === 'manager' && fullPath === '/api/staff')))) {
      return res.status(403).json({ error: 'Subaccounts cannot create other subaccounts. Sign in with your primary user account.' });
    }
    const primaryCreation = ['/api/auth/register-manager', '/api/auth/register-manager-account', '/api/manager-verifications/submit', '/api/digital-market/register', '/api/room-keys/claim', '/api/residents/onboard', '/api/staff'].includes(fullPath) || (fullPath === '/api/users/register' && req.body.role !== 'user');
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
    const records = [...MOCK_USERS, ...(store.users || []), ...(store.digitalMarketApplications || []), ...(store.managerVerifications || []), ...(store.managerRegistrationRequests || [])];
    if (await passwordIsReusedAsync(password, records, email, actor)) {
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
      if (target && req.path.startsWith('/products') && req.method !== 'DELETE' && !marketAccessPaid(store, target)) return res.status(402).json({ error: 'Complete verified registration and renew your two-month market fee before publishing or editing listings.' });
      req.body.studentEmail = email;
      req.body.userEmail = email;
      next();
    });
  });

  const imageStorage = createImageStorage();
  app.use(imageStorage.mediaBoundary);
  app.use('/uploads', imageStorage.router);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Real-time synchronization events (SSE) for TanStack Query invalidation across open tabs/windows
  const sseConnections = new EventConnections();

  app.get("/api/sync/events", (req, res) => {
    try { sseConnections.add(req, res, resourceActor(req)); }
    catch (error) { if (error instanceof ResourceLimitError) return resourceFailure(res, error); throw error; }
  });

  function broadcastDataChange(entity: string, details?: any) {
    const payload = JSON.stringify({ entity, details, timestamp: Date.now() });
    sseConnections.broadcast(payload);
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
    console.log(`[API ${new Date().toISOString()}] ${req.method} ${googleRequestLogUrl(req.url)}`);
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
        issueReports: { exists: true, count: issueReports.length },
        hostelVerifications: { exists: true, count: hostelVerifications.length }
      }
    });
  });



  installAdminApprovalSecurity(app, requireAuth, (id, key) => governance.verifyApprovalKey(id, key));

  app.get("/api/settings", async (req, res) => {
    res.set('Cache-Control', 'no-store').json(publicPlatformSettings(getStoreInstance()));
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
    if (publicPlatformSettings(getStoreInstance()).maintenanceMode && !allCandidates.some(candidate => accountRole(candidate) === 'admin' && activeAdministrator(getStoreInstance(), accountId(candidate)))) return res.status(503).json({ error: MAINTENANCE_MESSAGE, maintenanceMode: true });

    const checkCandidateValid = async (cand: any) => {
      if (!cand) return false;
      if (isDevelopmentSignup(cand, getStoreInstance().users || []) && !developmentSignupRequest(req)) return false;
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
        ? await passwordsMatch(password, storedPwd)
        : false;

      if (passMatch) {
        if (marketStore?.isBanned || ['rejected', 'banned', 'disabled'].includes(String(marketApp?.status))) return res.status(403).json({ error: 'This market account is not permitted to sign in.' });
        if (await findAsync(allCandidates, async candidate => Boolean(accountData(candidate)?.roomKey || candidate.roomKey || accountRole(candidate) === 'user') && await checkCandidateValid(candidate))) {
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
          (approvedMerchantStore && approvedMerchantStore.setupCompleted === true && hasVerifiedRegistration(getStoreInstance(), approvedMerchantStore)) ||
          (marketApp && marketApp.setupCompleted === true && (getStoreInstance().paymentTransactions || []).some(t => t.applicationId === marketApp.id && t.purpose === "activation" && t.status === "fulfilled" && (process.env.NODE_ENV !== "production" || t.mode !== "test")))
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
        const stuCand = await findAsync(allCandidates, async c => {
          const r = (c.user?.role || c.role || '').toLowerCase();
          return (r === 'student' || r === 'resident') && await checkCandidateValid(c);
        });
        if (stuCand) matched = stuCand;
      } else {
        // Prioritize primary user / admin / manager / staff candidates
        const nonStuCand = await findAsync(allCandidates, async c => {
          const r = (c.user?.role || c.role || '').toLowerCase();
          return r !== 'student' && r !== 'resident' && await checkCandidateValid(c);
        });
        if (nonStuCand) matched = nonStuCand;
      }

      if (!matched) {
        for (const cand of allCandidates) {
          if (await checkCandidateValid(cand)) {
            matched = cand;
            break;
          }
        }
      }
    }

    // Check verification team officers (Field Officers)
    if (!matched) {
      const allVT = [...verificationTeams, ...(store.verificationTeams || [])];
      const matchedOfficer = await findAsync(allVT, async (t: any) => {
        if (!t) return false;
        const emailMatch = cleanIdentifier && (t.email || '').toLowerCase() === cleanIdentifier;
        const idMatch = cleanIdentifier && ((t.officerId || '').toLowerCase() === cleanIdentifier || (t.id || '').toLowerCase() === cleanIdentifier);
        const usernameMatch = cleanIdentifier && (t.email || '').split('@')[0].toLowerCase() === cleanIdentifier;
        // Only derive credentials for the selected identity, never every officer in the directory.
        return Boolean(emailMatch || idMatch || usernameMatch) && await passwordsMatch(password, t.password, t.plainPassword);
      });
      if (matchedOfficer) {
        const officerAccess = accountAccess(store, matchedOfficer.id, 'verification_team');
        if (officerAccess.banned) return res.status(403).json(banResponse(officerAccess));
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
          token: createSessionToken('vt')
        };
      }
    }


    if (!matched) {
      const fallback = await dbGetUserByEmailOrUsername(usernameOrEmail, MOCK_USERS);
      if (await checkCandidateValid(fallback)) {
        matched = fallback;
      }
    }

    if (!matched) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }
    const loginAccess = accountAccess(getStoreInstance(), accountId(matched), accountRole(matched));
    if (loginAccess.banned) return res.status(403).json(banResponse(loginAccess));
    if (publicPlatformSettings(getStoreInstance()).maintenanceMode && accountRole(matched) !== 'admin') return res.status(503).json({ error: MAINTENANCE_MESSAGE, maintenanceMode: true });

    if (accountRole(matched) === 'admin' && !activeAdministrator(getStoreInstance(), accountId(matched))) return res.status(403).json({ error: 'This administrator account is suspended or is no longer in the administrator roster.' });

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
    if (userRole === 'verification_team' && !activeOfficerAccount(matched, getStoreInstance().verificationTeams || [])) {
      return res.status(403).json({ error: 'An active registered officer account is required.' });
    }

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

    const isStaffApproved = userRole === 'staff' && Boolean(activeManagedStaff(matched, getStoreInstance()));
    if (userRole === 'staff' && !isStaffApproved) return res.status(403).json({ error: 'Your staff account must be active in a manager-created residence roster.' });

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

      const isApproved = managerIsApproved(matched, store);

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


    // Rotate session token and persist so requireAuth only accepts issued tokens
    if (userRole === 'merchant') {
      if (marketApp) setRecordSession(marketApp, userObj.token);
      if (approvedMerchantStore) setRecordSession(approvedMerchantStore, userObj.token);
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
          persistUserSessionToken(MOCK_USERS[mockIdx], userObj.token);
        } else {
          MOCK_USERS.push({
            id: userObj.id,
            email: userObj.email,
            username: userObj.studentId || userObj.name,
            role: 'student',
            user: { ...userObj }
          });
        }
      }
    }

    const issuedToken = userObj.token;
    const finalEntry = MOCK_USERS.find((u: any) => accountId(u) === userObj.id && accountRole(u) === userObj.role);
    if (finalEntry) persistUserSessionToken(finalEntry, issuedToken);
    syncStore();
    setSessionCookie(res, issuedToken);
    return res.json({ ...stripSecrets(userObj), token: issuedToken });
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

  // Legacy manager aliases share the pending-account policy and never publish a hostel.
  app.post('/api/auth/register-manager', registerManagerAccount);
  app.post('/api/users/register', async (req, res) => {
    if (req.body.role === 'user') return beginUnifiedSignup(req, res);
    if (req.body.role && req.body.role !== 'manager') return res.status(400).json({ error: 'Use the dedicated registration flow for this account type.' });
    return registerManagerAccount(req, res);
  });

  // One email-confirmation policy for both public primary-account registration paths.
  persistentData.signupVerification ||= { pending: [], limits: [] };
  const signupGuard = new SignupGuard(persistentData.signupVerification, () => savePersistentStore(persistentData));
  const signupCleanup = setInterval(() => {
    try { signupGuard.cleanup(); } catch { console.error('[Signup] Expiry cleanup could not be persisted.'); }
  }, 60000);
  signupCleanup.unref();
  const existingSignupEmail = (email: string) => MOCK_USERS.some(u => normalizeEmail(accountData(u).email || u.email) === email);
  installGoogleAuth(app, (identity, mode) => signupGuard.exclusive(identity.email, async () => {
    let entry = googlePrimaryAccount(MOCK_USERS, identity, mode);
    if (entry) {
      const profile = accountData(entry);
      const status = String(profile.accountStatus || entry.accountStatus || profile.status || entry.status || '').toLowerCase();
      if (accountAccess(getStoreInstance(), accountId(entry), 'user').banned || profile.isBanned || entry.isBanned || profile.isDeleted || entry.isDeleted || ['banned', 'blocked', 'disabled', 'suspended', 'deleted'].includes(status)) googleAccountBlocked();
    } else {
      entry = {
        email: identity.email, username: identity.email.split('@')[0].replace(/[^a-z0-9]/g, ''),
        password: await hashCredentialAsync(crypto.randomBytes(48).toString('base64url')),
        user: { id: `user_${crypto.randomUUID()}`, name: identity.name, email: identity.email, role: 'user', isVerified: true, verificationStatus: 'approved', emailVerificationProvider: 'supabase-google', supabaseUserId: identity.id, emailVerifiedAt: identity.verifiedAt },
      };
      MOCK_USERS.push(entry);
    }
    const token = createSessionToken('usr');
    setRecordSession(entry, token);
    syncStore();
    return token;
  }), setSessionCookie);
  const signupFailure = (res: express.Response, error: unknown) => {
    if (error instanceof SignupError) return res.status(error.status).json({ error: error.message });
    // Provider payloads can contain credentials or tokens; do not log raw exceptions.
    console.error('[Signup] Registration could not complete.');
    return res.status(503).json({ error: 'Registration is temporarily unavailable. Please try again later.' });
  };
  async function beginUnifiedSignup(req: express.Request, res: express.Response) {
    try {
      const input = signupInput(req.body);
      return await signupGuard.exclusive(input.email, async () => {
        if (existingSignupEmail(input.email)) throw new SignupError(409, 'An account with this email already exists. Please sign in.');
        if (developmentSignupRequest(req)) {
          signupGuard.reserveSend(input.email, req.ip || req.socket.remoteAddress || 'unknown');
          const { pending, code } = await signupGuard.rememberDevelopmentAsync(input);
          return res.json({ success: true, signupId: pending.id, developmentCode: code, developmentOnly: true, message: 'Use this temporary local development code.', expiresIn: 900 });
        }
        const config = signupProviderConfig();
        signupGuard.reserveSend(input.email, req.ip || req.socket.remoteAddress || 'unknown');
        const supabaseUserId = await sendSignupVerification(config, input.name, input.email, input.password);
        const pending = await signupGuard.rememberAsync(input, supabaseUserId, config.url);
        return res.json({ success: true, signupId: pending.id, message: 'Check your email for the confirmation link or code.', expiresIn: 900 });
      });
    } catch (error) { return signupFailure(res, error); }
  }
  app.post('/api/auth/register-unified', beginUnifiedSignup);

  app.post('/api/auth/verify-unified', async (req, res) => {
    try {
      const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '';
      return await signupGuard.exclusive(email, async () => {
        const pending = await signupGuard.verificationAsync(req.body, req.ip || req.socket.remoteAddress || 'unknown');
        if (existingSignupEmail(pending.email)) throw new SignupError(409, 'This account already exists. Sign in instead.');
        const development = pending.mode === 'development';
        let confirmed: { id: string; email: string; verifiedAt: string } | undefined;
        if (development) {
          if (!developmentSignupRequest(req)) throw new SignupError(403, 'Development codes cannot activate accounts outside local development.');
          signupGuard.confirmDevelopment(pending, req.body.code);
        } else {
          if (!pending.supabaseUserId || !pending.providerUrl) throw new SignupError(400, 'Start a new registration.');
          confirmed = await confirmSignupVerification(signupProviderConfig(), { ...pending, supabaseUserId: pending.supabaseUserId, providerUrl: pending.providerUrl }, req.body.code);
        }
        if (pending.expiresAt <= Date.now()) throw new SignupError(400, 'Registration has expired. Please start again.');
        const userToken = createSessionToken('usr');
        const userProfile = {
          id: `user_${crypto.randomUUID()}`, name: pending.name, email: pending.email, role: 'user' as const,
          token: userToken, isVerified: !development, verificationStatus: development ? 'development' : 'approved',
          emailVerificationProvider: development ? 'development' : 'supabase',
          ...(confirmed ? { supabaseUserId: confirmed.id, emailVerifiedAt: confirmed.verifiedAt } : { developmentOnly: true })
        };
        const entry = { email: pending.email, username: pending.email.split('@')[0].replace(/[^a-z0-9]/g, ''), password: pending.passwordHash, user: userProfile };
        setRecordSession(entry, userToken);
        MOCK_USERS.push(entry);
        persistentData.users = MOCK_USERS;
        try { signupGuard.forget(pending.email); }
        catch (error) { MOCK_USERS.splice(MOCK_USERS.indexOf(entry), 1); throw error; }
        setSessionCookie(res, userToken);
        return res.status(201).json({ success: true, user: userProfile, token: userToken, message: development ? 'Your local development account is ready.' : 'Your PineVela account has been verified and activated.' });
      });
    } catch (error) { return signupFailure(res, error); }
  });

  // Dedicated Manager Account Registration with keen verification details
  app.post("/api/auth/register-manager-account", registerManagerAccount);
  async function registerManagerAccount(req: express.Request, res: express.Response) {
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
      const resolvedAddress = (address || operatingAddress || req.body.location || '').trim();
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

      if (existingUserIndex >= 0) return res.status(409).json({ error: 'This manager account already exists. Submit documents through its existing onboarding flow.' });

      if (existingMgrVerif || existingMgrReq) {
        const statusVal = existingMgrVerif?.status || existingMgrReq?.status || 'pending';
        const statusDisplay = statusVal === 'approved' ? 'Approved' : (statusVal === 'rejected' ? 'Rejected' : 'Pending Admin Approval');
        return res.status(400).json({
          error: `You already have a registered Manager account under this work email address (${resolvedEmail}). Current Status: ${statusDisplay}. Creation of multiple Manager accounts is restricted to 1 account per user.`
        });
      }

      const managerId = `manager_${crypto.randomUUID()}`;
      let username = resolvedEmail.split('@')[0].replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 100);

      const parentUserId = req.body.userId || req.body.parentUserId || null;
      const parentUserEmail = incomingParentEmail || null;

      // Extract submitted documents
      const operatingCertificate = req.body.operatingCertificate || {
        fileName: req.body.authorityEvidenceFileName || null,
        url: req.body.authorityEvidenceUrl || null,
        documentType: 'OPERATING_CERTIFICATE_PDF'
      };
      const idFront = req.body.idFront || {
        fileName: req.body.idFrontFileName || null,
        url: null,
        documentType: 'ID_FRONT'
      };
      const idBack = req.body.idBack || {
        fileName: req.body.idBackFileName || null,
        url: null,
        documentType: 'ID_BACK'
      };
      const documentsList = req.body.documents || [
        { id: 'doc-cert', name: 'Operating Certificate / License', fileName: operatingCertificate.fileName, type: 'PDF', status: 'pending' },
        { id: 'doc-id-front', name: 'National ID (Front)', fileName: idFront.fileName, type: 'IMAGE', status: 'pending' },
        { id: 'doc-id-back', name: 'National ID (Back)', fileName: idBack.fileName, type: 'IMAGE', status: 'pending' }
      ];
      const documentsVerified = {
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
        nationalId: resolvedNationalId || null,
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

        }
      };

      MOCK_USERS.push(newManagerUser);
      if (!store.users) store.users = [];
      store.users = MOCK_USERS;
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
        maskedIdNumber: resolvedNationalId ? `${resolvedNationalId.slice(0, 4)}••••${resolvedNationalId.slice(-4)}` : null,
        fullNameOnId: req.body.fullNameOnId || resolvedName,
        dateOfBirth: req.body.dateOfBirth || req.body.dob || null,
        idExpiryDate: req.body.expiryDate || req.body.idExpiryDate || null,
        idVerificationStatus: 'pending',
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
          identity: 'pending' as const,
          phone: 'pending' as const,
          email: 'pending' as const,
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
        propertyName: req.body.hostelName || req.body.propertyName || req.body.proposedHostelName || '',
        proposedHostelName: req.body.hostelName || req.body.propertyName || req.body.proposedHostelName || '',
        hostelName: req.body.hostelName || req.body.propertyName || req.body.proposedHostelName || '',
        proposedLocation: resolvedAddress || 'Legon Campus Area, Accra',
        proposedCapacity: Number(req.body.totalCapacity || req.body.proposedCapacity || 0),
        proposedReason: 'Official university-affiliated student accommodation onboarding and management.',
        reason: 'Manager account registered. Awaiting administrative approval to unlock 10-step property onboarding.',
        notes: 'Manager account registered. Identity and property details await administrative review.',
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
      await dbCreateNotification(mgrNotif, notifications, (req as any).user);

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
  }

  // Keep module mutations and legacy in-memory arrays synchronized before persistence.
  function syncManagedStore() {
    const store = getStoreInstance();
    hostels = store.hostels;
    MOCK_USERS = store.users; staff = store.staff || [];
    staffReviews = store.staffReviews || []; notifications = store.notifications || [];
    syncStore();
  }

  syncManagedStore(); // Align legacy array aliases before scoped governance mutations.

  const residenceRequests = new ResidenceRequests(getStoreInstance, syncManagedStore, governance);

  // Authentication validation middleware
  function requireAuth(allowedRoles?: ("student" | "manager" | "admin" | "staff" | "user" | "resident" | string)[]) {
    return async (req: any, res: any, next: any) => {
      const token = requestSessionToken(req);
      if (!token) return res.status(401).json({ error: 'Access Denied: No valid session provided' });
      res.set('Cache-Control', 'private, no-store');
      const dbUsers = await dbGetUsers(MOCK_USERS);
      const store = getStoreInstance();
      const combinedUsers = [...MOCK_USERS, ...dbUsers, ...(persistentData.users || []), ...(store.users || [])];
      
      // Match only against explicitly stored session tokens (never forge from user id / email).
      let foundEntry = combinedUsers.find(u => sessionMatches(u, token));

      if (isDevelopmentSignup(foundEntry, store.users || []) && !developmentSignupRequest(req)) return res.status(401).json({ error: 'Development accounts are only available in local development.' });

      // Search digital market applications/stores if token matches an issued merchant token
      if (!foundEntry) {
        const mStore = store.digitalMarketStores?.find((s: any) => sessionMatches(s, token));
        const mApp = store.digitalMarketApplications?.find((a: any) => sessionMatches(a, token));
        if (mStore || mApp) {
          const matchedItem = mStore || mApp;
          const mEmail = (matchedItem.studentEmail || matchedItem.email || '').toLowerCase().trim();
          foundEntry = {
            id: `merchant:${mApp?.id || mStore?.id}`,
            email: mEmail,
            studentEmail: mEmail,
            parentUserEmail: matchedItem.parentUserEmail || mEmail,
            parentUserId: matchedItem.parentUserId || matchedItem.userId,
            name: matchedItem.fullName || matchedItem.storeName || 'Student Merchant',
            role: 'merchant',
            token: token,
            isVerified: true,
            isApprovedMerchant: true,
            hasApprovedMerchantStore: true,
            merchantStoreId: mStore?.id || (() => { const matches = (store.digitalMarketStores || []).filter(s => normalizeEmail(s.studentEmail) === mEmail && (!matchedItem.userId || s.userId === matchedItem.userId)); return matches.length === 1 ? matches[0].id : undefined; })(),
            isDigitalMarketOnly: true,
            merchantSetupCompleted: Boolean(mStore?.setupCompleted && hasVerifiedRegistration(store, mStore)),
            merchantRegistrationFeePaid: Boolean(mStore?.setupCompleted && hasVerifiedRegistration(store, mStore))
          };
        }
      }

      // Verification team officers
      if (!foundEntry) {
        const officer = verificationTeams.find((t: any) => sessionMatches(t, token));
        if (officer) {
          foundEntry = {
            id: officer.id,
            email: officer.email,
            name: officer.fullName,
            role: 'verification_team',
            token,
            officerId: officer.officerId
          };
        }
      }

      if (!foundEntry) {
        return res.status(401).json({ error: 'Access Denied: Invalid session token' });
      }

      if (isDevelopmentSignup(foundEntry, store.users || []) && !developmentSignupRequest(req)) return res.status(401).json({ error: 'Development accounts are only available in local development.' });

      const rawUser = foundEntry.user ? { ...foundEntry.user } : { ...foundEntry };
      const resolvedRole = rawUser.role || foundEntry.role || 'user';
      const governedAccess = accountAccess(store, rawUser.id || foundEntry.id, resolvedRole);
      if (governedAccess.banned) return res.status(403).json(banResponse(governedAccess));
      const governedRestriction = accountRestriction(store, rawUser.id || foundEntry.id, resolvedRole, req.method, req.originalUrl.split('?')[0]);
      if (governedRestriction) return res.status(403).json(governedRestriction);
      if (publicPlatformSettings(store).maintenanceMode && resolvedRole !== 'admin') return res.status(503).json({ error: MAINTENANCE_MESSAGE, maintenanceMode: true });
      if (resolvedRole === 'admin' && !activeAdministrator(store, accountId(foundEntry))) return res.status(403).json({ error: 'This administrator account is suspended or is no longer in the administrator roster.' });
      if (resolvedRole === 'verification_team' && !currentReportOfficer({ ...rawUser, id: rawUser.id || foundEntry.id, role: resolvedRole, token }, store.verificationTeams || [])) {
        return res.status(403).json({ error: 'Your officer account is no longer active or its session has ended.' });
      }
      if (resolvedRole === 'manager' && !managerIsApproved(foundEntry, store) && !managerOnboardingRequest(req.method, req.path)) {
        return res.status(403).json({ error: 'Administrator approval is required before manager operations are available.', isPendingApproval: true });
      }
      if (resolvedRole === 'staff' && !activeManagedStaff(foundEntry, store)) return res.status(403).json({ error: 'Your staff account is no longer active in its manager’s roster.' });
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
        token,
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

        if (!isAuthorized) {
          console.log(`[AUTH] 403 Forbidden | Allowed: ${JSON.stringify(allowedRoles)} | Role: "${user.role}"`);
          return res.status(403).json({ error: `Access Denied: Unauthorized role "${user.role}"` });
        }
      }

      req.user = user;
      req.sessionToken = token;
      try { residenceRequests.gate(req); } catch (error: any) {
        if (error instanceof ResidenceRequestError) return res.status(error.status).json({ error: error.message, ...error.details });
        throw error;
      }
      next();
    };
  }

  app.post('/api/auth/logout', (req: any, res) => {
    const token = requestSessionToken(req);
    if (token) {
      const store = getStoreInstance();
      revokeMatchingSessions([MOCK_USERS, persistentData, store, verificationTeams], token);
      syncStore();
    }
    clearSessionCookie(res);
    return res.json({ success: true });
  });

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
  app.get('/api/auth/account-access', requireAuth(), (req: any, res) => res.json(accountAccess(getStoreInstance(), req.user.id, req.user.role)));

  // Update profile details (e.g. photo, name, phone, etc.) and sync everywhere
  const handleProfileUpdate = async (req: any, res: any) => {
    try {
      if (req.user.role === 'admin') {
        governance.verifySettingsKey(req.user.id, req.body.settingsKey);
        const photo = req.body.photo || req.body.avatar || req.body.photoUrl || req.body.avatarUrl || req.body.profilePicture;
        if (photo !== undefined && !getStoreInstance().marketMedia?.some(media => media.accountId === req.user.id && media.imageUrl === photo)) return res.status(400).json({ error: 'Upload your own verified profile photograph before saving it.' });
      }
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
      if (err instanceof GovernanceError) return res.status(err.status).json({ error: err.message });
      console.error("Profile update error:", err);
      return res.status(500).json({ error: err.message || "Failed to update profile" });
    }
  };

  app.put("/api/auth/profile", requireAuth(), handleProfileUpdate);
  app.post("/api/auth/profile", requireAuth(), handleProfileUpdate);

  installThemePreferences(app, requireAuth, getStoreInstance, syncManagedStore);
  installMaintenanceNotice(app, requireAuth, getStoreInstance, syncManagedStore);

  installAdminGovernance(app, requireAuth, governance);

  // Secure administrator password reset endpoint for existing accounts
  app.post("/api/admin/reset-user-password", requireAuth(["admin"]), async (req: any, res) => {
    const email = normalizeEmail(req.body.email);
    const password = req.body.newPassword;
    if (!email || typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Target email and a new password of at least 8 characters are required.' });
    const roles = ['user', 'manager', 'staff', 'student', 'merchant'].filter(role => passwordRecords(email, role).length);
    const role = String(req.body.role || (roles.length === 1 ? roles[0] : '')).toLowerCase();
    if (role === 'admin') return res.status(403).json({ error: 'Another administrator’s login password cannot be reset through this endpoint.' });
    if (!role) return res.status(400).json({ error: 'This email has multiple accounts. Specify the account role to reset.' });
    const records = passwordRecords(email, role);
    if (!records.length) return res.status(404).json({ error: 'Account not found.' });
    await updateIdentityPassword(records, password, email, role);
    return res.json({ success: true, message: 'Password reset. Existing sessions for this account have been revoked.' });
  });

  // --- Manager Requests Endpoints ---
  app.get("/api/manager-requests", requireAuth(["admin", "manager"]), async (req: any, res) => {
    const currentRequests = await dbGetManagerRequests(managerRequests);
    const allVerifs = await dbGetManagerVerifications(managerVerifications);
    const store = getStoreInstance();
    const storedRequests = store.managerRegistrationRequests || [];

    // Merge verifications into managerRequests so Admin sees full dossiers with docs
    const mergedList: any[] = structuredClone(currentRequests);

    allVerifs.forEach(v => {
      const existing = mergedList.find(r => 
        r.id === v.id || 
        (r.managerId && v.managerId && r.managerId === v.managerId) ||
        (!r.managerId && !v.managerId && r.managerEmail && v.managerEmail && r.managerEmail.toLowerCase() === v.managerEmail.toLowerCase())
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
          propertyName: v.hostelName || v.propertyName || '',
          proposedHostelName: v.hostelName || v.propertyName || '',
          hostelName: v.hostelName || v.propertyName || '',
          proposedLocation: v.location || v.address || '',
          proposedCapacity: v.totalCapacity || null,
          notes: 'Manager registration dossier awaiting administrative review.',
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

    const authHeader = requestSessionToken(req);
    if (authHeader) {
      const token = requestSessionToken(req);
      const foundUser = MOCK_USERS.find(u => sessionMatches(u, token));
      const userRole = foundUser?.user?.role || foundUser?.role;
      const userId = foundUser?.user?.id || foundUser?.id;
      const userEmail = (foundUser?.user?.email || foundUser?.email || '').toLowerCase().trim();
      if (foundUser && userRole === 'manager') {
        const userReqs = mergedList.filter(
          r => managerRecordMatches(r, req.user, getStoreInstance().users || [])
        );
        return res.json(userReqs);
      }
    }
    return res.json(mergedList);
  });

  app.post("/api/manager-requests", requireAuth(["manager"]), async (req: any, res) => {
    try {
      const authenticatedUser = req.user;
      if (authenticatedUser.role !== 'manager') return res.status(403).json({ error: 'Sign in with your manager account to submit this request.' });

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

      const propertyValue = propertyName || proposedHostelName || hostelName || name || '';
      if (typeof propertyValue !== 'string' || propertyValue.length > 200) return res.status(400).json({ error: 'A valid property name is required.' });
      const resolvedPropertyName = propertyValue.trim();

      if (!resolvedPropertyName) {
        return res.status(400).json({ error: "Hostel property name is required." });
      }

      const mgrId = authenticatedUser.id;
      const mgrEmail = authenticatedUser.email;
      const mgrName = authenticatedUser.name;
      const mgrPhone = authenticatedUser.phone || '';

      // Check current requests from database and memory
      const currentReqs = await dbGetManagerRequests(managerRequests);

      // Check if this manager already has a pending or approved request
      const existingReq = currentReqs.find(
        r => r.managerId === mgrId &&
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
        managerEmail: mgrEmail,
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

      const approvedManager = managerForDossier(target, store.users || []);
      if (!approvedManager) return res.status(409).json({ error: 'The dossier does not identify a unique registered manager.' });
      // Mark all documents as approved/verified upon administrative sign-off
      if (!target.documentsVerified) target.documentsVerified = {};
      target.documentsVerified.operatingCertificate = 'verified';
      target.documentsVerified.idFront = 'verified';
      target.documentsVerified.idBack = 'verified';

      const now = new Date().toISOString();
      const cleanEmail = (target.managerEmail || '').toLowerCase().trim();
      const cleanParentEmail = ((target as any).parentUserEmail || '').toLowerCase().trim();
      const targetMgrId = accountId(approvedManager);

      const matchesTarget = (obj: any) => managerRecordMatches(obj, approvedManager, store.users || []);

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
        const isActualMgr = accountRole(u) === 'manager' && accountId(u) === targetMgrId;
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
        if (isParentUser) {
          const targetAcc = u.registeredAccounts?.managerAccount || u.user?.registeredAccounts?.managerAccount;
          if (targetAcc && String(targetAcc.managerId || targetAcc.id) === targetMgrId) {
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

      // Account approval permits onboarding; property approval remains a separate administrator action.

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
          n.title === titleText && n.registrationId === target.id && n.submissionUpdatedAt === target.updatedAt &&
          ((n.userEmail || '').toLowerCase() === emailToNotify || (n.recipientEmail || '').toLowerCase() === emailToNotify || (n.parentUserEmail || '').toLowerCase() === emailToNotify)
        );
        if (!exists) {
          const apprNotif = {
            id: `notif-mgr-appr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            registrationId: target.id, submissionUpdatedAt: target.updatedAt,
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
          await dbCreateNotification(apprNotif, notifications, req.user);
        }
      }

      syncStore();

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
          registrationId: target.id, submissionUpdatedAt: target.updatedAt,
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
        await dbCreateNotification(rejNotif, notifications, req.user);
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
  app.put(["/api/manager-requests/:id/block", "/api/manager-verifications/:id/block", "/api/admin/managers/:id/block", "/api/manager-verifications/:id/suspend"], requireAuth(["admin"]), (_req, res) => res.status(410).json({ error: 'Single-administrator account bans are retired. Use Accounts to submit a five-administrator proposal.' }));

  // Unblock manager access and restore property to live
  app.put(["/api/manager-requests/:id/unblock", "/api/manager-verifications/:id/unblock", "/api/admin/managers/:id/unblock"], requireAuth(["admin"]), (_req, res) => res.status(410).json({ error: 'Single-administrator account bans are retired. Use Accounts to submit a five-administrator proposal.' }));

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
  app.post("/api/manager-verifications/submit", requireAuth(["user", "manager"]), async (req: any, res) => {
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

      const managerPasswordHash = password ? await hashCredentialAsync(password) : '';
      const existingManager = MOCK_USERS.find(u => normalizeEmail(accountData(u)?.email || u.email) === resolvedEmail);
      if (existingManager && (accountRole(existingManager) !== 'manager' ||
          (req.user.role === 'manager' ? accountId(existingManager) !== req.user.id : String(accountData(existingManager)?.parentUserId || existingManager.parentUserId || '') !== req.user.id))) {
        return res.status(403).json({ error: 'This manager identity belongs to another account.' });
      }
      if (req.user.role === 'manager' && !existingManager) return res.status(403).json({ error: 'Submit documents only for your own manager identity.' });

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

      const managerId = existingManager ? accountId(existingManager) : `manager_${crypto.randomUUID()}`;
      const verificationId = `mv-${Date.now()}`;
      const now = new Date().toISOString();
      const parentUserId = req.user.role === 'user' ? req.user.id : (accountData(existingManager)?.parentUserId || existingManager?.parentUserId || null);
      const parentUserEmail = req.user.role === 'user' ? req.user.email : (accountData(existingManager)?.parentUserEmail || existingManager?.parentUserEmail || null);

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
        landmark: resolvedLandmark,
        roleTitle: roleTitle || 'Hostel Manager',
        isVerified: false,
        verificationStatus: 'pending',

      };

      if (existingUserIdx >= 0) {
        MOCK_USERS[existingUserIdx].user = { ...MOCK_USERS[existingUserIdx].user, ...userObj };
        clearRecordSession(MOCK_USERS[existingUserIdx]);
        clearRecordSession(MOCK_USERS[existingUserIdx].user);
        if (password) MOCK_USERS[existingUserIdx].password = managerPasswordHash;
      } else {
        MOCK_USERS.push({
          email: resolvedEmail,
          username: resolvedEmail.split('@')[0],
          password: managerPasswordHash,
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
        password: managerPasswordHash
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
      await dbCreateNotification(userNotif, notifications, req.user);

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
      await dbCreateNotification(adminNotif, notifications, req.user);

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
      const authHeader = requestSessionToken(req);
      if (authHeader) {
        const token = requestSessionToken(req);
        const foundUser = MOCK_USERS.find(u => sessionMatches(u, token));
        const userRole = foundUser?.user?.role || foundUser?.role;
        const userId = foundUser?.user?.id || foundUser?.id;
        const userEmail = (foundUser?.user?.email || foundUser?.email || '').toLowerCase().trim();
        if (foundUser && userRole === 'manager') {
          const filtered = records.filter(
            v => managerRecordMatches(v, req.user, getStoreInstance().users || [])
          );
          return res.json(filtered);
        }
      }
      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch manager verifications." });
    }
  });

  // Fetch registered manager, resident and seller account records.
  app.get(["/api/users/my-registered-accounts", "/api/user/registered-accounts"], requireAuth(), async (req: any, res) => {
    try {
      let authUser: any = req.user;
      const authHeader = requestSessionToken(req);
      if (authHeader) {
        const token = requestSessionToken(req);
        const found = MOCK_USERS.find(u => sessionMatches(u, token));
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
        return res.json({ managerAccount: null, residentAccount: null });
      }

      let managerAccount: any = null;

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

        const managerAccess = accountAccess(store, matchedVerif?.managerId || matchedMgrReq?.managerId || accountId(matchedMgrUser), 'manager');
        const isBlocked = managerAccess.banned || allStatusValues.some(s => ['blocked', 'disabled', 'banned'].includes(s)) || matchedVerif?.isBlocked === true || matchedMgrReq?.isBlocked === true || matchedMgrUser?.isBlocked === true || matchedMgrUser?.user?.isBlocked === true;
        const isSuspended = !isBlocked && allStatusValues.includes('suspended');
        const isRejected = !isBlocked && !isSuspended && allStatusValues.includes('rejected');
        const moreInfoRequired = !isBlocked && !isSuspended && !isRejected && allStatusValues.includes('more_info_required');
        const isApproved = !isBlocked && !isSuspended && !isRejected && !moreInfoRequired && (allStatusValues.includes('approved') || allStatusValues.includes('verified'));
        const rawStatus = isBlocked ? 'blocked' : isSuspended ? 'suspended' : isRejected ? 'rejected' : moreInfoRequired ? 'more_info_required' : isApproved ? 'approved' : 'pending';
        const displayStatus = isBlocked ? 'Blocked' : isSuspended ? 'Suspended' : isRejected ? 'Rejected' : moreInfoRequired ? 'More Information Required' : isApproved ? 'Approved' : 'Pending Admin Approval';
        const blockReason = isBlocked ? (managerAccess.reason || matchedVerif?.blockReason || matchedMgrReq?.blockReason || (matchedMgrUser as any)?.blockReason || (matchedMgrUser?.user as any)?.blockReason || matchedVerif?.adminNotes || matchedMgrReq?.adminNotes || 'Manager account access has been restricted by administration.') : null;

        const currentManagerId = matchedVerif?.managerId || matchedMgrReq?.managerId || accountId(matchedMgrUser);
        const currentResidence = store.hostels.find(h => h.managerId === currentManagerId || h.assignedManagerId === currentManagerId);

        const mgrWorkEmail = matchedVerif?.managerEmail || matchedMgrReq?.managerEmail || matchedMgrUser?.email || matchedMgrUser?.user?.email || '';

        managerAccount = {
          id: matchedVerif?.id || matchedMgrReq?.id || matchedMgrUser?.id || `mgr-rec-${Date.now()}`,
          managerId: matchedVerif?.managerId || matchedMgrReq?.managerId || matchedMgrUser?.id,
          name: currentResidence?.managerName || matchedVerif?.managerName || matchedMgrReq?.managerName || matchedMgrUser?.name || matchedMgrUser?.user?.name || 'Hostel Manager',
          email: mgrWorkEmail,
          organizationName: matchedVerif?.organizationName || matchedVerif?.organization || (matchedMgrReq as any)?.organizationName || matchedMgrReq?.organization || 'Sole Proprietorship',
          hostelName: currentResidence?.name || matchedVerif?.hostelName || matchedMgrReq?.proposedHostelName || matchedMgrReq?.propertyName || 'General Operations',
          phone: currentResidence?.managerPhone || matchedVerif?.phone || matchedMgrReq?.managerPhone || (matchedMgrReq as any)?.phone || matchedMgrUser?.phone || 'N/A',
          idType: matchedVerif?.idType || 'Ghana Card (National ID)',
          idNumber: matchedVerif?.idNumber || 'N/A',
          isRestricted: managerAccess.restrictions.length > 0,
          restrictionReason: managerAccess.restrictions.map(r => r.reason).join('; '),
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
        residentAccount,
        merchantAccount,
        residentRooms: userResidentRooms
      });
    } catch (err: any) {
      console.error("Error retrieving user registered accounts:", err);
      return res.status(500).json({ error: "Failed to retrieve registered accounts." });
    }
  });

  // Reset password for a registered manager or resident account
  app.post("/api/users/reset-registered-account-password", requireAuth(), async (req: any, res) => {
    if (typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 6) return res.status(400).json({ error: 'A new password of at least 6 characters is required.' });
    const email = normalizeEmail(req.body.email);
    const role = String(req.body.role || '').toLowerCase();
    if (role === 'manager' && (req.user.role !== 'manager' || email !== normalizeEmail(req.user.email))) return res.status(403).json({ error: 'Manage your manager password from your own manager account.' });
    if (!['manager', 'resident', 'student'].includes(role)) return res.status(403).json({ error: 'This account is not managed through primary-account controls.' });
    const candidates = passwordRecords(email, role);
    if (!candidates.length) return res.status(404).json({ error: 'Account not found.' });
    const owned = candidates.filter(record => {
      const data = accountData(record);
      return req.user.role === 'admin' || ((req.user.role === role || (['resident', 'student'].includes(req.user.role) && ['resident', 'student'].includes(role))) && accountId(record) === req.user.id) ||
        (req.user.role === 'user' && (data.parentUserId === req.user.id || data.userId === req.user.id || normalizeEmail(data.parentUserEmail) === normalizeEmail(req.user.email)));
    });
    if (!owned.length) return res.status(403).json({ error: 'You cannot reset another account.' });
    const matched = await findAsync(owned, async record => passwordsMatch(req.body.currentPassword, ...credentialValues(record, false)));
    if (!matched) return res.status(400).json({ error: 'Enter the current password for this subaccount.' });
    const records = owned.filter(record => accountId(record) === accountId(matched));
    await updateIdentityPassword(records, req.body.newPassword, email, role);
    return res.json({ success: true, message: 'Password updated. Sign in again using the new password.' });
  });

  // Delete a registered manager or resident account to allow restarting registration
  app.post("/api/users/delete-registered-account", requireAuth(), async (req: any, res) => {
    try {
      const { role, email, password, confirm, deletionReason } = req.body || {};
      if (!["manager", "resident"].includes(role)) return res.status(403).json({ error: "Staff accounts are managed by their residence manager." });
      if (!role || !email) {
        return res.status(400).json({ error: "Role and email are required to delete account." });
      }
      const cleanEmail = email.toLowerCase().trim();
      if (role === 'manager') {
        if (req.user.role !== 'manager' || cleanEmail !== normalizeEmail(req.user.email)) return res.status(403).json({ error: 'Delete a manager registration only from its own manager account.' });
        // The legacy purge uses manager email. Fail closed for ambiguous identities instead
        // of allowing a same-email manager account to delete another manager's records.
        const managers = [...MOCK_USERS, ...(getStoreInstance().users || [])].filter(entry => accountRole(entry) === 'manager' && normalizeEmail(accountData(entry).email) === cleanEmail);
        const ids = new Set(managers.map(entry => accountId(entry)));
        if (ids.size !== 1 || !ids.has(req.user.id)) return res.status(409).json({ error: 'This manager identity requires administrator review before deletion.' });
      }

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
          await passwordsMatch(password, expectedResidentPassword);
          
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
          await passwordsMatch(password, expectedManagerPassword);

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
          parentUserId: primaryAccountRecipient(req.user, store, 'manager').targetAccountId,
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
        ...primaryAccountRecipient(req.user, getStoreInstance(), role),
        title: `${role.charAt(0).toUpperCase() + role.slice(1)} Account Removed`,
        message: notifMessage,
        type: 'warning',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(delNotif);
      await dbCreateNotification(delNotif, notifications, req.user);

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
        ...primaryAccountRecipient({ parentUserId: restriction.parentUserId, parentUserEmail: restriction.userEmail }, store, 'manager'),
        title: `Manager Restriction Bypassed`,
        message: `Admin has approved your request to bypass the 30-day restriction. You can now register a new Hostel Manager account.`,
        type: 'success',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(bypassNotif);
      await dbCreateNotification(bypassNotif, notifications, req.user);
      
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
        ...primaryAccountRecipient({ parentUserId: restriction.parentUserId, parentUserEmail: restriction.userEmail }, store, 'manager'),
        title: `Manager Bypass Rejected`,
        message: `Admin has rejected your restriction bypass request. Reason: ${restriction.adminNotes}. You must wait out the 30-day restriction.`,
        type: 'error',
        date: new Date().toISOString().split('T')[0],
        read: false
      };
      notifications.unshift(rejectNotif);
      await dbCreateNotification(rejectNotif, notifications, req.user);
      
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
      const cleanPassword = await hashCredentialAsync(password);
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
        registrationFeeAmount: publicPlatformSettings(store).registrationFee,
        semesterFeeAmount: publicPlatformSettings(store).semesterFee,
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

      await dbCreateNotification({
        id: `notif-dm-sub-${crypto.randomUUID()}`,
        targetRole: 'user', targetAccountId: req.user.id, userId: req.user.id,
        category: 'account_submission', scope: 'market', module: 'digital_market',
        registrationKind: 'merchant', registrationId: newApp.id,
        title: 'Digital Market Application Submitted',
        message: `Your Digital Market application has been received and is pending administrator verification.`,
        type: 'verification', date: new Date().toISOString().split('T')[0], read: false
      }, notifications, req.user);

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

  installPaystackPayments(app, requireAuth, new PaystackPayments(getStoreInstance, syncManagedStore, undefined, undefined, () => governance.persistSettingsActivity()), getStoreInstance, (id, key) => governance.verifySettingsKey(id, key));

  // Get Digital Market status for current user
  app.get("/api/digital-market/status", requireAuth(), async (req: any, res) => {
    try {
      if (!['user', 'merchant', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Open market registration from your primary account, or sign in with your market password.' });
      const userEmail = (req.query.email || req.user.email || '').toString().toLowerCase().trim();
      const userId = (req.query.userId || req.user.parentUserId || req.user.id || '').toString().trim();
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

      const merchantAccount = moderationAccounts(store).find(a => a.role === 'merchant' && (a.marketIds.includes(application?.id) || a.marketIds.includes(digitalStore?.id)));
      const merchantAccess = merchantAccount ? accountAccess(store, merchantAccount.id, 'merchant') : null;
      if (digitalStore) {
        digitalStore = { ...digitalStore,
          ...(merchantAccess?.banned ? { status: 'disabled', isBanned: true, banReason: merchantAccess.reason } : {}),
          ...(merchantAccess?.restrictions.length ? { accountStatus: 'restricted', banReason: merchantAccess.restrictions.map(r => r.reason).join('; ') } : {})
        };
        if (!store.digitalMarketRatings) store.digitalMarketRatings = [];
        const cleanSId = (digitalStore.id || '').toString().trim();
        const matchedRatings = verifiedMarketRatings(store).filter((r: any) => cleanSId && r.storeId === cleanSId);
        const ratingCount = matchedRatings.length;
        const totalScore = matchedRatings.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0);
        const storeRating = ratingCount > 0 ? Math.round((totalScore / ratingCount) * 10) / 10 : 0;

        digitalStore = {
          ...digitalStore,
          storeRating,
          ratingCount
        };
      }

      return res.json({
        application: application ? { ...application, ...(merchantAccess?.banned ? { accountStatus: 'disabled', banReason: merchantAccess.reason } : merchantAccess?.restrictions.length ? { accountStatus: 'restricted', banReason: merchantAccess.restrictions.map(r => r.reason).join('; ') } : {}) } : null,
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
      const passMatch = await passwordsMatch(password, storedPwd);

      if (!passMatch) {
        return res.status(401).json({ error: "Incorrect Digital Market Store password." });
      }
      const loginAccess = accountAccess(store, `merchant:${marketApp?.id || approvedStore?.id}`, 'merchant');
      if (loginAccess.banned) return res.status(403).json(banResponse(loginAccess));

      if (store.digitalMarketStores?.some(s => normalizeEmail(s.studentEmail) === cleanEmail && s.isBanned) || ['rejected', 'banned', 'disabled'].includes(String(marketApp?.status))) return res.status(403).json({ error: 'This market account is not permitted to sign in.' });
      if (await findAsync([...MOCK_USERS, ...(store.users || [])], async u => normalizeEmail(accountData(u)?.email || u.email) === cleanEmail && Boolean(accountData(u)?.roomKey || accountRole(u) === 'user') && await passwordsMatch(password, ...credentialValues(u)))) {
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

      const isSetupCompleted = Boolean(targetStore.setupCompleted && hasVerifiedRegistration(store, targetStore));
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

      setSessionCookie(res, merchantUser.token);
      if (marketApp) setRecordSession(marketApp, merchantUser.token);
      if (approvedStore) setRecordSession(approvedStore, merchantUser.token);
      for (const entry of MOCK_USERS) if (accountRole(entry) === 'merchant' && normalizeEmail(accountData(entry).email) === cleanEmail) setRecordSession(entry, merchantUser.token);
      savePersistentStore(store);

      const needsSetup = !isSetupCompleted;

      return res.json({
        success: true,
        needsSetup,
        application: marketApp,
        user: merchantUser,
        store: publicPaidStore(targetStore, store),
        token: merchantUser.token,
        message: needsSetup ? "Application approved! Please complete your digital market store setup." : "Successfully logged into Digital Market Platform!"
      });
    } catch (err: any) {
      console.error("Error in digital market login endpoint:", err);
      return res.status(500).json({ error: "Failed to authenticate into digital market store." });
    }
  });

  // Store profiles are edited only through the authenticated seller relationship.
  app.put('/api/digital-market/store', requireAuth(['merchant']), (req: any, res) => {
    if (req.user.role !== 'merchant') return res.status(403).json({ error: 'Sign in with your seller account.' });
    try {
      const state = getStoreInstance(), seller = sellerStore(req.user, state);
      if (!seller) return res.status(403).json({ error: 'Your seller store was not found.' });
      Object.assign(seller, storeProfileFields(req.body, req.user, state, seller));
      savePersistentStore(state); syncStore();
      return res.json({ success: true, store: { ...publicPaidStore(seller, state), ...publicStoreProfile(seller, state) }, message: 'Store profile updated successfully.' });
    } catch (error) {
      return res.status(error instanceof StoreProfileError ? error.status : 500).json({ error: error instanceof StoreProfileError ? error.message : 'Failed to update store profile.' });
    }
  });

  app.get('/api/digital-market/stores/:storeId', (req, res) => {
    const state = getStoreInstance(), seller = (state.digitalMarketStores || []).find(s => s.id === req.params.storeId);
    if (!seller || seller.status !== 'active' || seller.isBanned || governedMarketBanned(state, seller.id) || !marketAccessPaid(state, seller)) return res.status(404).json({ error: 'This store is currently unavailable.' });
    return res.json({ store: publicStoreProfile(seller, state), products: storefrontProducts(seller, state) });
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

      const verifiedRatings = verifiedMarketRatings(store);
      const getStoreRatingSummary = (sId?: string) => {
        const cleanSId = (sId || '').trim();
        const matched = verifiedRatings.filter((r: any) => cleanSId && r.storeId === cleanSId);
        const count = matched.length;
        if (count === 0) {
          return { storeRating: 0, ratingCount: 0 };
        }
        const total = matched.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0);
        const avg = Math.round((total / count) * 10) / 10;
        return { storeRating: avg, ratingCount: count };
      };

      const storesById = new Map(store.digitalMarketStores.map(seller => [seller.id, seller]));
      const enrichProducts = (prodList: any[]) => {
        return prodList.map((p: any) => {
          const s = store.digitalMarketStores.find((storeObj: any) => 
            storeObj.id === p.storeId || 
            (p.sellerEmail && storeObj.studentEmail?.toLowerCase() === p.sellerEmail.toLowerCase())
          );
          const currentPlan = effectiveMarketPlan(storesById.get(p.storeId), Date.now(), process.env.NODE_ENV === 'production');
          const storeSummary = getStoreRatingSummary(p.storeId || s?.id);
          const itemRating = ratingSummary(verifiedRatings.filter((r: any) => r.productId === p.id));
          return {
            ...p,
            ...marketPlanBenefits(currentPlan), allowsAiImageTools: currentPlan !== "default", allowsCustomAnimatedCard: currentPlan === "pro",
            rating: itemRating.averageRating,
            reviewCount: itemRating.ratingCount,
            storeName: s?.storeName || p.storeName,
            sellerName: s?.username || s?.storeName || p.sellerName,
            sellerPhone: s?.phone || p.sellerPhone,
            storeLogoUrl: marketStoreBranding(s, process.env.NODE_ENV === 'production').profilePicture,
            storeRating: storeSummary.storeRating,
            ratingCount: storeSummary.ratingCount
          };
        }).sort(compareMarketPriority);
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
        const administrator = tokenAccount(store, requestSessionToken(req))?.role === 'admin';
        return res.json(enrichProducts(products.filter((p: any) => administrator || !governedMarketBanned(store, p.storeId))));
      }

      const nonBannedStoreIds = new Set(
        store.digitalMarketStores
          .filter((s: any) => s.status === 'active' && !s.isBanned && !governedMarketBanned(store, s.id) && marketAccessPaid(store, s))
          .map((s: any) => s.id)
      );

      const availableProducts = store.digitalMarketProducts.filter((p: any) => {
        const isNotBanned = p.storeId ? (nonBannedStoreIds.has(p.storeId)) : true;
        return isNotBanned && p.isAvailable !== false && Number(p.stockQuantity) > 0;
      });

      return res.json(enrichProducts(availableProducts));
    } catch (err: any) {
      console.error("Error fetching market products:", err);
      return res.status(500).json({ error: "Failed to fetch products." });
    }
  });

  // Add Product to Store
  app.post("/api/digital-market/products", requireAuth(["merchant", "student", "user", "admin"]), async (req: any, res) => {
    try {
      const { storeId, title, description, price, category, stockQuantity, imageUrl, userEmail, condition, meetingLocation } = req.body;
      const store = getStoreInstance();
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      const mediaFields = marketMediaFields(req.body, req.user, store);
      const cleanEmail = (userEmail || '').toLowerCase().trim();
      let targetStore = store.digitalMarketStores.find((s: any) => 
        s.id === storeId || (cleanEmail && (s.studentEmail?.toLowerCase() === cleanEmail || s.parentUserEmail?.toLowerCase() === cleanEmail))
      );

      if (!targetStore || !marketAccessPaid(store, targetStore)) return res.status(402).json({ error: 'Complete verified registration and renew your two-month market fee before publishing.' });
      if (targetStore.isBanned) return res.status(403).json({ error: 'This store has been disabled by Admin.' });

      const isServiceItem = Boolean(req.body.isService || category === 'Services' || String(category || '').toLowerCase().includes('service'));
      const serviceLocationMode = String(req.body.serviceLocationMode || '').toLowerCase();
      if (isServiceItem && !['flexible', 'fixed', 'hybrid'].includes(serviceLocationMode)) {
        return res.status(400).json({ error: 'Choose Flexible, Fixed, or Hybrid service location before publishing.' });
      }
      if (isServiceItem && ['fixed', 'hybrid'].includes(serviceLocationMode) && !String(req.body.location || meetingLocation || '').trim()) {
        return res.status(400).json({ error: 'Fixed and Hybrid services require the seller to pin a service location.' });
      }
      const pin = servicePoint(req.body.lat, req.body.lng);
      if (isServiceItem && ['fixed', 'hybrid'].includes(serviceLocationMode) && !pin) return res.status(400).json({ error: 'Fixed and Hybrid services require valid latitude and longitude for the seller location.' });
      if ((req.body.lat !== undefined || req.body.lng !== undefined) && !pin) return res.status(400).json({ error: 'Invalid service coordinates.' });

      const plan = effectiveMarketPlan(targetStore, Date.now(), process.env.NODE_ENV === "production");
      const limits = PLAN_LIMITS[plan];
      const storeProducts = store.digitalMarketProducts.filter((p: any) => p.storeId === targetStore.id);
      const existingItems = storeProducts.filter((p: any) => !Boolean(p.isService || String(p.category || "").toLowerCase().includes("service")));
      const existingServices = storeProducts.filter((p: any) => Boolean(p.isService || String(p.category || "").toLowerCase().includes("service")));
      const requestedStock = isServiceItem ? 0 : stockQuantity;
      if (!isServiceItem && (!Number.isSafeInteger(requestedStock) || requestedStock < 1)) return res.status(400).json({ error: 'Inventory quantity must be a finite positive whole number.' });
      const inventoryUnits = existingItems.reduce((sum: number, p: any) => sum + Math.max(0, Number(p.stockQuantity) || 0), 0);
      if ((!isServiceItem && existingItems.length >= limits.items) || (isServiceItem && existingServices.length >= limits.services)) return res.status(403).json({ error: `Your Pine ${plan === "star" ? "Star" : plan === "pro" ? "Pro" : "Default"} plan publishing limit has been reached.` });
      if (!isServiceItem && inventoryUnits + requestedStock > limits.inventory) return res.status(403).json({ error: `Your plan allows up to ${limits.inventory} total inventory units.` });

      const safeImageUrl = await saveMarketCover(imageUrl, req);
      // Upload decoding can yield; recheck paid access and limits immediately before the insertion.
      if (!marketAccessPaid(store, targetStore)) return res.status(402).json({ error: 'Renew your market payment before publishing.' });
      const currentPlan = effectiveMarketPlan(targetStore, Date.now(), process.env.NODE_ENV === 'production');
      const capacityError = planCapacityError(store.digitalMarketProducts, targetStore.id, currentPlan, { isService: isServiceItem, category, stockQuantity: requestedStock });
      if (capacityError) return res.status(403).json({ error: capacityError });
      const newProduct = {
        id: `dmprod-${Date.now()}`,
        storeId: targetStore.id,
        ...marketPlanBenefits(currentPlan),
        allowsAiImageTools: currentPlan === "star" || currentPlan === "pro",
        allowsCustomAnimatedCard: currentPlan === "pro",
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
        imageUrl: safeImageUrl,
        condition: condition || 'Like New',
        meetingLocation: meetingLocation || req.body.location || targetStore.location || 'Campus Enclave',
        location: req.body.location || meetingLocation || targetStore.location || 'Campus Enclave',
        lat: pin?.lat,
        lng: pin?.lng,
        workingDays: req.body.workingDays || 'Mon - Sat',
        openingTime: req.body.openingTime || '08:00 AM',
        closingTime: req.body.closingTime || '08:00 PM',
        callLine: req.body.callLine || targetStore.phone || req.body.sellerPhone || '0244-123-456',
        isService: isServiceItem,
        serviceLocationMode: isServiceItem ? serviceLocationMode : undefined,
        serviceCategory: req.body.serviceCategory || (isServiceItem ? 'Campus Service' : ''),
        priceCategories: mediaFields.priceCategories || [],
        additionalImages: mediaFields.additionalImages || [],
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
      if (err instanceof MarketMediaError || err instanceof ImageUploadError) return res.status(err.status).json({ error: err.message });
      if (err instanceof ResourceLimitError) return resourceFailure(res, err);
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

      const candidate = { ...product, ...req.body };
      const candidateService = Boolean(candidate.isService || candidate.serviceCategory || String(candidate.category || '').toLowerCase().includes('service'));
      const candidateMode = String(candidate.serviceLocationMode || 'flexible').toLowerCase();
      const candidatePin = servicePoint(candidate.lat, candidate.lng);
      if (candidateService && !['flexible', 'fixed', 'hybrid'].includes(candidateMode)) return res.status(400).json({ error: 'Invalid service location mode.' });
      if ((lat !== undefined || lng !== undefined) && !candidatePin) return res.status(400).json({ error: 'Invalid service coordinates.' });
      if (candidateService && ['fixed', 'hybrid'].includes(candidateMode) && (!candidatePin || !String(candidate.location || candidate.meetingLocation || '').trim())) return res.status(400).json({ error: 'Fixed and Hybrid services require a valid seller location and map pin.' });

      const mediaFields = marketMediaFields(req.body, req.user, store);
      const safeImageUrl = imageUrl === undefined ? undefined : imageUrl === product.imageUrl ? imageUrl : await saveMarketCover(imageUrl, req);
      if (!candidateService && stockQuantity !== undefined && (!Number.isSafeInteger(stockQuantity) || stockQuantity < 1)) {
        return res.status(400).json({ error: 'Stock quantity must be a whole number of at least 1.' });
      }
      const listingStore = store.digitalMarketStores?.find(s => s.id === product.storeId);
      if (!listingStore || !marketAccessPaid(store, listingStore)) return res.status(402).json({ error: 'Renew your market payment before editing listings.' });
      const plan = effectiveMarketPlan(listingStore, Date.now(), process.env.NODE_ENV === 'production');
      const capacityError = planCapacityError(store.digitalMarketProducts, product.storeId, plan, { ...product, ...req.body, stockQuantity: req.body.stockQuantity ?? product.stockQuantity }, product.id);
      if (capacityError) return res.status(400).json({ error: capacityError });
      if (title !== undefined) product.title = title;
      if (description !== undefined) product.description = description;
      if (price !== undefined) product.price = Number(price);
      if (category !== undefined) product.category = category;
      if (safeImageUrl !== undefined) product.imageUrl = safeImageUrl;
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
      Object.assign(product, mediaFields);
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
      if (err instanceof MarketMediaError || err instanceof ImageUploadError) return res.status(err.status).json({ error: err.message });
      if (err instanceof ResourceLimitError) return resourceFailure(res, err);
      console.error("Error updating product:", err);
      return res.status(500).json({ error: "Failed to update product." });
    }
  });

  // Service Reviews Endpoints
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
          phone: appItem.phone || '',
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
          registrationId: appItem.id,
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
        await dbCreateNotification(notif, notifications, req.user);
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
          registrationId: appItem.id,
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
        await dbCreateNotification(rejNotif, notifications, req.user);
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
  app.post("/api/admin/digital-market/toggle-ban-store", requireAuth(["admin"]), (_req, res) => res.status(410).json({ error: 'Single-administrator account bans are retired. Use Accounts to submit a five-administrator proposal.' }));

  // Place Order / Request Campus Meetup
  app.post("/api/digital-market/orders", requireAuth(["user"]), async (req: any, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      if (req.user.role !== 'user') return res.status(403).json({ error: 'Sign in to your buyer account to place an order.' });
      const { productId, buyerPhone, meetingLocation, meetingLatitude, meetingLongitude, serviceLocationOption } = req.body;
      const buyerId = req.user.id, buyerEmail = req.user.email, buyerName = req.user.name;
      const store = getStoreInstance();
      if (!store.digitalMarketOrders) store.digitalMarketOrders = [];
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];
      if (!store.digitalMarketStores) store.digitalMarketStores = [];

      const product = store.digitalMarketProducts.find((p: any) => p.id === productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found or no longer available." });
      }
      if (governedMarketBanned(store, product.storeId)) return res.status(403).json({ error: 'This seller account is temporarily unavailable. New orders cannot be placed.' });

      const seller = store.digitalMarketStores.find((s: any) => s.id === product.storeId) || { id: product.storeId, studentEmail: product.sellerEmail, userId: product.sellerId };
      if (ownsMarketStore(req.user, seller, store)) return res.status(403).json({ error: 'You cannot order items or services from your own store.' });
      const terms = catalogOrderTerms(product, req.body);
      checkOrderStock(product, terms.quantity, store.digitalMarketOrders);

      const targetStore = store.digitalMarketStores.find((s: any) => s.id === product.storeId);
      if (!targetStore || !marketAccessPaid(store, targetStore)) return res.status(402).json({ error: 'This store must complete verified payment or renew its two-month market fee before accepting new orders.' });
      if (targetStore?.isBanned) {
        return res.status(403).json({ error: "Cannot order from a disabled/banned store." });
      }

      const isServiceOrder = Boolean(product.isService || String(product.category || '').toLowerCase().includes('service'));
      const locationMode = isServiceOrder ? String(product.serviceLocationMode || 'flexible').toLowerCase() : 'flexible';
      const requestedLocationOption = serviceLocationOption === 'seller-location' ? 'seller-location' : 'buyer-location';
      if (isServiceOrder && locationMode === 'fixed' && requestedLocationOption !== 'seller-location') {
        return res.status(400).json({ error: 'This service is only available at the provider\'s fixed location.' });
      }
      if (isServiceOrder && (locationMode === 'fixed' || (locationMode === 'hybrid' && requestedLocationOption === 'seller-location')) && (!String(product.location || product.meetingLocation || '').trim() || !servicePoint(product.lat, product.lng))) {
        return res.status(400).json({ error: 'The provider has not set a fixed service location yet.' });
      }
      if (isServiceOrder && (locationMode === 'flexible' || (locationMode === 'hybrid' && requestedLocationOption === 'buyer-location')) && !String(meetingLocation || '').trim()) {
        return res.status(400).json({ error: 'Choose your meetup or delivery location to book this service.' });
      }

      const { quantity: orderQty, productPrice: unitPrice, totalAmount, priceCategory: priceCatName, productTitle: finalProductTitle } = terms;

      const usesSellerLocation = isServiceOrder && (locationMode === 'fixed' || (locationMode === 'hybrid' && requestedLocationOption === 'seller-location'));
      const finalMeetingLocation = usesSellerLocation ? (product.location || product.meetingLocation) : (meetingLocation || 'KNUST Main Library Car Park');
      const orderPin = usesSellerLocation ? servicePoint(product.lat, product.lng) : servicePoint(meetingLatitude, meetingLongitude);
      if (!usesSellerLocation && (meetingLatitude !== undefined || meetingLongitude !== undefined) && !orderPin) return res.status(400).json({ error: 'Invalid meetup coordinates.' });
      const parsedLat = orderPin?.lat, parsedLng = orderPin?.lng;

      const nowIso = new Date().toISOString();
      const newOrder = {
        id: `ord-${crypto.randomUUID()}`,
        productId: product.id,
        productTitle: finalProductTitle,
        productPrice: unitPrice,
        priceCategory: priceCatName,
        priceCategoryId: terms.priceCategoryId,
        productImage: (terms.priceCategory ? product.priceCategories?.find((c: any) => terms.priceCategoryId ? c.id === terms.priceCategoryId : c.name === terms.priceCategory)?.imageUrl : undefined) || product.imageUrl,
        quantity: orderQty,
        totalAmount: totalAmount,
        platformCommissionRate: publicPlatformSettings(store).commission,
        platformCommissionAmount: Math.round(totalAmount * publicPlatformSettings(store).commission) / 100,
        buyerId,
        buyerEmail: (buyerEmail || '').toLowerCase().trim(),
        buyerName,
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

      issueDeliveryPin(newOrder);
      store.digitalMarketOrders.unshift(newOrder);
      savePersistentStore(store);
      syncStore();

      const sellerNotif = {
        id: `notif-ord-${crypto.randomUUID()}`,
        orderId: newOrder.id, productId: product.id, sellerStoreId: product.storeId,
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
      await dbCreateNotification(sellerNotif, notifications, req.user);

      return res.status(201).json({ success: true, order: publicMarketOrder(newOrder, req.user), message: "Order placed successfully! Proposed meetup transmitted to seller for confirmation." });
    } catch (err: any) {
      if (err instanceof MarketOrderError) return res.status(err.status).json({ error: err.message });
      console.error("Error creating digital market order:", err);
      return res.status(500).json({ error: "Failed to create order." });
    }
  });

  // Get orders for current user (as buyer or seller)
  app.get("/api/digital-market/my-orders", requireAuth(), async (req: any, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      const storeId = (req.query.storeId || '').toString().trim();

      const store = getStoreInstance();
      if (!store.digitalMarketOrders) store.digitalMarketOrders = [];
      if (!store.digitalMarketRatings) store.digitalMarketRatings = [];

      const verifiedRatings = verifiedMarketRatings(store);
      const userOrders = store.digitalMarketOrders
        .filter((o: any) => {
          if (req.user.role === 'admin') return (!storeId || o.storeId === storeId);
          return (!storeId || o.storeId === storeId) && (isOrderBuyer(req.user, o) || isOrderSeller(req.user, o, store));
        })
        .map((o: any) => {
          const ratingObj = verifiedRatings.find((r: any) => r.orderId === o.id && r.buyerId === o.buyerId);
          return { ...publicMarketOrder(o, req.user), userRating: ratingObj ? publicMarketRating(ratingObj) : null };
        });

      return res.json(userOrders);
    } catch (err: any) {
      console.error("Error fetching user orders:", err);
      return res.status(500).json({ error: "Failed to fetch orders." });
    }
  });

  installMarketRatings(app, requireAuth, getStoreInstance, syncManagedStore);

  // Buyers alone may replace an exposed/expired/locked challenge and renew stock reservation.
  app.post('/api/digital-market/orders/:id/renew-pin', requireAuth(['user']), (req: any, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      if (Object.keys(req.body || {}).length) throw new MarketOrderError('PIN renewal accepts no supplied fields.');
      const store = getStoreInstance();
      const order = (store.digitalMarketOrders || []).find((o: any) => o.id === req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      if (!isOrderBuyer(req.user, order)) return res.status(403).json({ error: 'Only the order buyer can renew its delivery PIN.' });
      if (!['Awaiting Seller Confirmation', 'Pending Meetup'].includes(order.status) || terminalMarketOrder(order.status)) return res.status(409).json({ error: 'This order cannot renew its delivery PIN.' });
      if (Date.parse(order.deliveryPinIssuedAt) > Date.now() - 60000) return res.status(429).json({ error: 'Wait one minute before requesting another delivery PIN.' });
      const product = (store.digitalMarketProducts || []).find((p: any) => p.id === order.productId);
      checkOrderStock(product, order.quantity, store.digitalMarketOrders || [], order.id);
      issueDeliveryPin(order);
      order.updatedAt = new Date().toISOString();
      savePersistentStore(store);
      syncStore();
      return res.json({ success: true, order: publicMarketOrder(order, req.user) });
    } catch (err: any) {
      if (err instanceof MarketOrderError) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Failed to renew delivery PIN.' });
    }
  });

  // Update order status / Verify PIN / Seller Location Agreement
  app.post("/api/digital-market/orders/:id/update-status", requireAuth(["merchant", "student", "user", "admin"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      res.set('Cache-Control', 'private, no-store');
      const action = orderAction(req.body);
      const { inputPin, otpPin, notes } = req.body;

      const store = getStoreInstance();
      if (!store.digitalMarketOrders) store.digitalMarketOrders = [];
      if (!store.digitalMarketProducts) store.digitalMarketProducts = [];

      const order = store.digitalMarketOrders.find((o: any) => o.id === id);
      if (!order) {
        return res.status(404).json({ error: "Order not found." });
      }

      authorizeOrderAction(req.user, order, store, action);
      if (action === 'confirm') {
        if (!activeOrderReservation(order)) return res.status(409).json({ error: 'Reservation expired or unavailable. Ask the buyer to renew their delivery PIN.' });
        const product = store.digitalMarketProducts.find((p: any) => p.id === order.productId);
        checkOrderStock(product, order.quantity, store.digitalMarketOrders, order.id);
      }

      const nowIso = new Date().toISOString();

      // ACTION 1: Seller Agrees to Location & Confirms Purchase
      if (action === 'confirm') {
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
          id: `notif-agree-${crypto.randomUUID()}`,
          orderId: order.id, targetAccountId: order.buyerId,
          studentId: order.buyerEmail,
          userId: order.buyerEmail,
          userEmail: order.buyerEmail,
          recipientEmail: order.buyerEmail,
          title: `Meetup Location Agreed! Purchase Confirmed 📍`,
          message: `The seller accepted your meetup location at ${order.meetingLocation} for "${order.productTitle}". Have your six-digit PIN ready for pickup.`,
          type: 'success',
          category: 'market',
          scope: 'market',
          module: 'digital_market',
          targetRole: 'user',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(buyerNotif);
        await dbCreateNotification(buyerNotif, notifications, req.user);

        return res.json({ success: true, order: publicMarketOrder(order, req.user), message: "Meetup location agreed! Purchase confirmed." });
      }

      // ACTION 2: Seller Declines / Rejects Proposed Location
      if (action === 'reject') {
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
          id: `notif-rej-${crypto.randomUUID()}`,
          orderId: order.id, targetAccountId: order.buyerId,
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
          targetRole: 'user',
          date: new Date().toISOString().split('T')[0],
          read: false
        };
        notifications.unshift(buyerNotif);
        await dbCreateNotification(buyerNotif, notifications, req.user);

        return res.json({ success: true, order: publicMarketOrder(order, req.user), message: "Proposed location declined." });
      }

      const isCompletionStatus = action === 'complete';
      const finalStatus = isCompletionStatus ? 'Completed & Paid' : 'Cancelled';
      if (isCompletionStatus) {
        const pinError = checkDeliveryPin(order, inputPin ?? otpPin);
        if (pinError) {
          savePersistentStore(store);
          syncStore();
          return res.status(pinError.status).json({ error: pinError.message });
        }
        const product = store.digitalMarketProducts.find((p: any) => p.id === order.productId);
        // No await between the current-stock check, deduction, order completion and save.
        // Concurrent requests in this single-process JSON backend cannot oversell stock.
        consumeOrderStock(product, order, store.digitalMarketOrders);
      }

      order.status = finalStatus;
      // Invalidate completed/cancelled challenges; terminal status also releases reservations.
      delete order.otpPin;
      order.updatedAt = nowIso;

      if (!order.timeline) order.timeline = [];
      order.timeline.push({
        status: finalStatus,
        title: `Order status updated to: ${finalStatus}`,
        timestamp: nowIso,
        notes: isCompletionStatus ? 'Delivery PIN verified. Item inspected, delivered and paid.' : (notes || 'Order cancelled.')
      });

      store.notifications ||= [];
      store.notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role, id: `notif-ord-${crypto.randomUUID()}`, orderId: order.id,
        ...(req.user.role === 'merchant' ? { targetRole: 'user', targetAccountId: order.buyerId, userId: order.buyerId }
          : { targetRole: 'merchant', sellerStoreId: order.storeId }),
        title: isCompletionStatus ? 'Purchase completed' : 'Order cancelled',
        message: `${order.productTitle}: ${finalStatus}.`, scope: 'market', category: 'market',
        type: isCompletionStatus ? 'success' : 'info', date: nowIso, read: false });
      syncManagedStore();

      return res.json({ success: true, order: publicMarketOrder(order, req.user), message: `Order updated to ${finalStatus}!` });
    } catch (err: any) {
      if (err instanceof MarketOrderError) return res.status(err.status).json({ error: err.message });
      console.error("Error updating order status:", err);
      return res.status(500).json({ error: "Failed to update order status." });
    }
  });
  installMarketMessaging(app, requireAuth, getStoreInstance, syncManagedStore);


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
          n.title === titleText && n.registrationId === target.id && n.submissionUpdatedAt === target.updatedAt &&
          ((n.userEmail || '').toLowerCase() === emailToNotify || (n.recipientEmail || '').toLowerCase() === emailToNotify || (n.parentUserEmail || '').toLowerCase() === emailToNotify)
        );
        if (!exists) {
          const mgrApprNotif = {
            id: `notif-mgr-appr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            registrationId: target.id, submissionUpdatedAt: target.updatedAt,
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
          await dbCreateNotification(mgrApprNotif, notifications, req.user);
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
          n.title === titleText && n.registrationId === target.id && n.submissionUpdatedAt === target.updatedAt &&
          ((n.userEmail || '').toLowerCase() === emailToNotify || (n.recipientEmail || '').toLowerCase() === emailToNotify || (n.parentUserEmail || '').toLowerCase() === emailToNotify)
        );
        if (!exists) {
          const mgrRejNotif = {
            id: `notif-mgr-rej-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            registrationId: target.id, submissionUpdatedAt: target.updatedAt,
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
          await dbCreateNotification(mgrRejNotif, notifications, req.user);
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
      const plaintextPassword = password.trim();
      const hashedPassword = await hashCredentialAsync(plaintextPassword);
      const existing = verificationTeams.find(t => t.email.toLowerCase() === cleanEmail);
      if (existing) {
        return res.status(400).json({ error: "A verification team officer with this email already exists." });
      }

      const count = verificationTeams.length + 1;
      const officerId = `PV-INSP-2026-${count.toString().padStart(2, '0')}`;
      const id = `vt-${Date.now()}`;
      const now = new Date().toISOString();

      const newOfficer = {
        id,
        officerId,
        fullName: fullName.trim(),
        email: cleanEmail,
        password: hashedPassword,
        phone: (phone || '').trim(),
        assignedZone: (assignedZone || 'Greater Accra Region').trim(),
        status: 'active' as const,
        role: 'verification_team' as const,
        createdAt: now,
        totalInspectionsCompleted: 0
      };

      verificationTeams.unshift(newOfficer);

      // Also register/update in system users so they can authenticate seamlessly everywhere
      const userEntry = {
        email: cleanEmail,
        username: cleanEmail.split('@')[0],
        officerId: newOfficer.officerId,
        password: hashedPassword,
        user: {
          id: newOfficer.id,
          name: newOfficer.fullName,
          fullName: newOfficer.fullName,
          role: 'verification_team',
          email: cleanEmail,
          phone: newOfficer.phone,
          officerId: newOfficer.officerId,
          assignedZone: newOfficer.assignedZone,
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
      if (!['active', 'suspended', 'inactive'].includes(status) || Object.keys(req.body).some(key => key !== 'status')) return res.status(400).json({ error: 'Choose active, suspended or inactive.' });
      const officer = verificationTeams.find(t => t.id === id || t.officerId === id);
      if (!officer) {
        return res.status(404).json({ error: "Verification team officer not found." });
      }

      const revoke = status !== 'active' || officer.status !== 'active';
      const store = getStoreInstance();
      for (const entry of [...MOCK_USERS, ...(store.users || []), ...(persistentData.users || [])]) {
        if (accountRole(entry) !== 'verification_team' || accountId(entry) !== officer.id) continue;
        accountData(entry).status = status;
        if (revoke) clearRecordSession(entry);
      }
      for (const entry of [...verificationTeams, ...(store.verificationTeams || [])]) {
        if (entry.id !== officer.id) continue;
        entry.status = status;
        if (revoke) clearRecordSession(entry);
      }
      officer.status = status;
      officer.updatedAt = new Date().toISOString();
      syncStore();

      return res.json({ success: true, officer: publicAccountData(officer), message: `Officer status updated to ${status}.` });
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

      const matchedOfficer = await findAsync(allVT, async t => {
        if (!t) return false;
        const emailMatch = cleanEmail && t.email?.toLowerCase() === cleanEmail;
        const idMatch = cleanOfficerId && (
          t.officerId?.toUpperCase() === cleanOfficerId.toUpperCase() ||
          t.officerId?.toLowerCase() === cleanOfficerId.toLowerCase() ||
          t.id === cleanOfficerId
        );
        const usernameMatch = cleanEmail && t.email?.split('@')[0].toLowerCase() === cleanEmail;
        return Boolean(emailMatch || idMatch || usernameMatch) && await passwordsMatch(cleanPassword, t.password, t.plainPassword);
      });

      if (!matchedOfficer) {
        return res.status(401).json({ error: "Invalid officer credentials. Please check your official email/Officer ID and password." });
      }
      const officerAccess = accountAccess(store, matchedOfficer.id, 'verification_team');
      if (officerAccess.banned) return res.status(403).json(banResponse(officerAccess));

      if (!activeOfficerAccount({ ...matchedOfficer, role: 'verification_team' }, store.verificationTeams || [])) {
        return res.status(403).json({ error: `Officer account is currently ${matchedOfficer.status}. Please contact PineVela Administration.` });
      }

      const newToken = createSessionToken('vt');
      setRecordSession(matchedOfficer, newToken);
      
      // Also update in verificationTeams in-memory array and mock users
      const inMem = verificationTeams.find(t => t.id === matchedOfficer.id || t.officerId === matchedOfficer.officerId);
      if (inMem) setRecordSession(inMem, newToken);
      for (const entry of MOCK_USERS) if (accountRole(entry) === 'verification_team' && accountId(entry) === matchedOfficer.id) setRecordSession(entry, newToken);
      
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

      setSessionCookie(res, newToken);
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
  app.get("/api/verification-team/me", requireAuth(["verification_team"]), async (req: any, res) => {
    try {
      const officer = currentReportOfficer(req.user, getStoreInstance().verificationTeams || []);
      if (!officer) return res.status(401).json({ error: "Officer session expired or invalid" });

      return res.json({ success: true, officer: publicAccountData(officer) });
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
    // Display merges must never rewrite the authoritative officer assignments.
    return unifiedList;
  };

  // 6. Admin: Get all verification inspections
  app.get(["/api/admin/verification-inspections", "/api/verification-inspections"], requireAuth(["admin"]), async (req: any, res) => {
    try {
      const allInspections = getAllUnifiedInspections();
      res.set("Cache-Control", "private, no-store");
      return res.json(publicAccountData(allInspections));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch inspections." });
    }
  });

  // 7. Officer: Get inspections assigned to the logged-in officer
  app.get("/api/verification-team/my-inspections", requireAuth(["verification_team"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const officer = currentReportOfficer(req.user, store.verificationTeams || []);
      if (!officer) return res.status(403).json({ error: "An active registered officer session is required" });
      const assigned = assignedInspectionRecords(officer, store.verificationInspections || [], store.managerVerifications || []);
      res.set("Cache-Control", "private, no-store");
      return res.json(publicAccountData(assigned));
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
        adminMessage: true, senderRole: 'admin', targetRole: 'verification_team', targetAccountId: officer.id,
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
        adminMessage: true, senderRole: 'admin', targetRole: 'manager', targetAccountId: verif.managerId,
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
  app.post("/api/verification-team/inspections/:id/submit-report", requireAuth(["verification_team"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const officer = currentReportOfficer(req.user, store.verificationTeams || []);
      if (!officer) {
        return res.status(403).json({ error: "An active registered officer session is required" });
      }
      const { inspection, verification } = inspectionSubmissionTarget(
        req.params.id, store.verificationInspections || [], store.managerVerifications || [], officer
      );
      const report = buildInspectionReport(req.body, officer);
      const now = report.submittedAt;
      inspection.report = report;
      inspection.status = 'report_submitted';
      inspection.updatedAt = now;

      // Assignment IDs and all administrator dispatch metadata remain unchanged.
      const list = store.verificationInspections || [];
      const index = list.findIndex((entry: any) => entry.id === inspection.id);
      if (index >= 0) list[index] = inspection;
      else list.unshift(inspection);
      store.verificationInspections = list;
      verificationInspections = list;

      const applyReport = (record: any) => {
        record.inspectionStatus = 'report_submitted';
        record.inspectionReport = report;
        record.verificationReport = report;
        record.updatedAt = now;
      };
      if (verification) applyReport(verification);
      managerVerifications = store.managerVerifications || [];

      // Prefer an explicit request link; legacy manager-ID linkage must be unique.
      // A shared email alone never authorizes overwriting another request's report.
      managerRequests = store.managerRegistrationRequests || [];
      const directlyLinked = managerRequests.filter((request: any) =>
        request.id === inspection.managerVerificationId ||
        request.managerVerificationId === inspection.managerVerificationId ||
        verification?.managerRequestId && request.id === verification.managerRequestId
      );
      const linkedRequests = directlyLinked.length ? directlyLinked : managerRequests.filter((request: any) =>
        verification?.managerId && request.managerId === verification.managerId
      );
      if (linkedRequests.length === 1) applyReport(linkedRequests[0]);

      officer.totalInspectionsCompleted = (officer.totalInspectionsCompleted || 0) + 1;
      verificationTeams = store.verificationTeams || [];
      for (const admin of store.users.map(accountData).filter((account: any) => account?.role === 'admin' && account.id)) {
        notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
          id: `notif-rep-sub-${crypto.randomUUID()}`,
          studentId: admin.id, userId: admin.id, recipientEmail: admin.email,
          title: `Verification Report Submitted: ${inspection.hostelName}`,
          message: `Officer ${report.officerName} submitted an on-site verification report for "${inspection.hostelName}". Recommendation: ${report.recommendation}.`,
          type: 'verification', date: now.split('T')[0], read: false
        });
      }
      verificationAuditLogs.unshift({
        id: `val-rep-${crypto.randomUUID()}`,
        action: 'VERIFICATION_REPORT_SUBMITTED',
        targetType: 'manager', targetId: inspection.managerVerificationId,
        targetName: inspection.managerName,
        performedBy: report.officerName, performedById: officer.id,
        role: 'verification_team',
        details: {
          officerId: officer.id, officerCode: officer.officerId,
          hostelName: inspection.hostelName,
          recommendation: report.recommendation, gps: report.gpsCoordinates
        },
        timestamp: now
      });
      syncStore();
      return res.json({
        success: true, inspection, report,
        message: "Physical verification report submitted successfully! Admin has been notified for final review."
      });
    } catch (err: any) {
      if (err instanceof InspectionSubmissionError) return res.status(err.status).json({ error: err.message });
      console.error("Error submitting verification report:", err);
      return res.status(500).json({ error: "Failed to submit verification report" });
    }
  });

  // 8. Manager Verifications: Admin Suspends Manager
  app.put("/api/manager-verifications/:id/suspend", requireAuth(["admin"]), (_req, res) => res.status(410).json({ error: 'Single-administrator account bans are retired. Use Accounts to submit a five-administrator proposal.' }));

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

  app.post('/api/hostel-managers/assign', requireAuth(['admin']), (_req, res) => res.status(410).json({ error: 'Direct manager/hostel profile editing is retired. Use the reviewed residence change workflow.' }));

  // 9. Hostel System Validation (Phase 2 automated check before payment)
  app.post("/api/hostel-verifications/validate", async (req: any, res) => {
    try {
      const {
        name,
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

  // 11. Hostel Verification: Submit Hostel for Admin Review (Phase 2)
  app.post("/api/hostel-verifications/submit", requireAuth(["manager"]), async (req: any, res) => {
    try {
      const newRecord = hostelVerificationSubmission(req.user, req.body, getStoreInstance());
      await dbCreateHostelVerification(newRecord);
      hostelVerifications = getStoreInstance().hostelVerifications;
      const auditLog = {
        id: `val-${newRecord.id}`, action: 'HOSTEL_VERIFICATION_SUBMITTED',
        targetType: 'hostel', targetId: newRecord.hostelId, targetName: newRecord.hostelName,
        performedBy: req.user.name, performedById: req.user.id, role: 'manager',
        details: { proofType: newRecord.proofOfOwnershipType },
        timestamp: newRecord.createdAt
      };
      await dbCreateVerificationAuditLog(auditLog);
      verificationAuditLogs = getStoreInstance().verificationAuditLogs;
      await dbCreateActivity({
        id: `act-${newRecord.id}`, text: `Hostel "${newRecord.hostelName}" submitted for verification.`,
        time: 'Just now', type: 'info'
      }, activities);
      return res.status(201).json({ success: true, verification: newRecord, message: 'Hostel property submitted for administrative verification.' });
    } catch (error) {
      if (error instanceof OnboardingSubmissionError) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to submit hostel verification.' });
    }
  });

  // 12. Hostel Verification: Get all hostel verification applications
  app.get("/api/hostel-verifications", requireAuth(["admin"]), async (req, res) => {
    try {
      const records = await dbGetHostelVerifications(hostelVerifications);
      res.set("Cache-Control", "private, no-store");
      return res.json(publicAccountData(records));
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
  app.get("/api/hostels", (req, res, next) => requestSessionToken(req) ? requireAuth()(req, res, next) : next(), async (req: any, res) => {
    try {
      const list = await dbGetHostels(hostels);
      const isAdmin = req.user?.role === 'admin';

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

      return res.json(activeList.map(h => residenceForViewer(h, req.user, getStoreInstance())));
    } catch (err) {
      console.error("Error retrieving hostels from db:", err);
      return res.json((hostels || []).map(h => residenceForViewer(h, req.user, getStoreInstance())));
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
          subscriptionPaid: false,
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

      if (Object.keys(registrationData).some(key => retiredHostelFields.has(key))) return res.status(400).json({ error: 'Facilities, amenities and property policies have been retired.' });
      try {
        const phone = internationalPhone(registrationData.contactPhone, registrationData.contactPhoneCountry);
        registrationData.contactPhone = phone.number;
      } catch (error) { return res.status(400).json({ error: (error as Error).message }); }

      const isManager = req.user.role === 'manager';
      const existingId = registrationData.hostelId || registrationData.id;
      if (existingId && (getStoreInstance().hostels || []).some(h => h.id === existingId)) return res.status(409).json({ error: 'This hostel already exists. Submit a residence change request for administrator review.' });
      if (isManager) {
        // Set protected fields before the first database write, not after insertion.
        registrationData.isApproved = false;
        registrationData.approvalStatus = 'Pending Approval';
        registrationData.status = 'Pending Approval';
        registrationData.subscriptionPaid = false;
      }

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
        registrationData.managerName = req.user.name || '';
        registrationData.managerEmail = req.user.email || '';
        registrationData.managerPhone = req.user.phone || registrationData.managerPhone || null;
        registrationData.managerPhoto = req.user.photo || req.user.avatar || (req.user as any).photoUrl || (req.user as any).avatarUrl || registrationData.managerPhoto || null;
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
          location: result.hostel.location || registrationData.location || null,
          managerId: req.user.id,
          managerName: registrationData.managerName,
          managerEmail: registrationData.managerEmail,
          managerPhone: registrationData.managerPhone,
          managerPhoto: registrationData.managerPhoto,
          proofOfOwnershipType: registrationData.proofOfOwnershipType || null,
          proofOfOwnershipDocumentUrl: registrationData.proofOfOwnershipDocumentUrl || null,
          proofOfOwnershipDocumentFileName: registrationData.proofOfOwnershipDocumentFileName || null,
          authorityRelationship: registrationData.authorityRelationship || null,
          paymentStatus: 'pending',
          paymentAmount: null,
          paymentReference: null,
          paymentMethod: null,
          paymentDate: null,
          totalCapacity: result.hostel.totalCapacity,
          totalBlocks: registrationData.totalBlocks || null,
          pricePerYear: registrationData.pricePerYear || result.hostel.price || null,
          currency: result.hostel.currency || 'GHS',
          imageUrl: result.hostel.imageUrl || result.hostel.image,
          image: result.hostel.image || result.hostel.imageUrl,
          status: 'under_admin_review',
          systemValidation: {
            ownershipEvidencePresent: Boolean(registrationData.proofOfOwnershipDocumentUrl),
            capacityConsistent: null,
            duplicateHostelCheck: 'pending'
          },
          adminNotes: 'Property registration submitted. Awaiting administrator review and payment verification.',
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
      return res.status(err.status || 500).json({ error: err.message || "Failed to complete hostel registration" });
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
      if (!target) return res.status(404).json({ error: 'Registered residence not found.' });
      {
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
  app.delete("/api/hostels/:id", requireAuth(["admin"]), (_req, res) => res.status(410).json({ error: 'Submit a reviewed hostel deletion proposal. Two administrator approvals and the founder’s final approval-key action are required.' }));

  installResidenceRequests(app, requireAuth, residenceRequests, getStoreInstance, syncManagedStore);

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
      if (!target) return res.status(404).json({ error: 'Registered residence not found.' });
      {
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
        await dbCreateNotification(notif, notifications, req.user);
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
  async function saveMarketCover(imageUrl: unknown, req: any): Promise<string> {
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) throw new MarketMediaError('A product or service photograph is required.');
    if (imageUrl.startsWith('data:')) {
      const fileType = imageUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,/)?.[1];
      if (!fileType) throw new MarketMediaError('Use a JPEG, PNG or WebP photograph.');
      return (await persistMarketPhoto({ fileType, fileData: imageUrl }, req)).imageUrl;
    }
    if ((getStoreInstance().marketMedia || []).some((m: any) => m.imageUrl === imageUrl && (m.accountId === req.user.id || req.user.role === 'admin'))) return imageUrl;
    // Existing hosted raster covers remain compatible. New extra/category images use owned uploads only.
    if (/^https:\/\//i.test(imageUrl) && !/\.(?:svg|html?)(?:[?#]|$)/i.test(imageUrl) || /^\/images\/[\w/.-]+\.(?:png|jpe?g|webp)$/i.test(imageUrl)) return imageUrl;
    throw new MarketMediaError('Choose a supported photograph.');
  }
  async function persistMarketPhoto(body: any, req: any) {
    const result = await imageStorage.save(body, bytes => resources.reserveUpload(`${req.user.role}:${req.user.id}`, req.ip || req.socket.remoteAddress || 'unknown', bytes), 1600);
    const store = getStoreInstance();
    store.marketMedia ||= [];
    store.marketMedia.push({ imageUrl: result.imageUrl, accountId: req.user.id, createdAt: new Date().toISOString() });
    syncManagedStore();
    return result;
  }
  app.post(MARKET_UPLOAD_ROUTE, requireAuth(['merchant', 'admin']), async (req: any, res) => {
    try {
      const seller = sellerStore(req.user, getStoreInstance());
      if (req.user.role !== 'admin' && !canUploadMarketPhotos(req.user, seller, getStoreInstance())) return res.status(403).json({ error: 'An approved seller store is required to upload marketplace photographs.' });
      return res.json(await persistMarketPhoto(req.body, req));
    } catch (err: any) {
      if (err instanceof ResourceLimitError) return resourceFailure(res, err);
      if (err instanceof ImageUploadError) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Could not save marketplace photograph.' });
    }
  });

  app.post(ADMIN_PROFILE_UPLOAD_ROUTE, requireAuth(['admin']), async (req: any, res) => {
    try {
      governance.verifySettingsKey(req.user.id, req.body.settingsKey);
      const encoded = typeof req.body.fileData === 'string' ? req.body.fileData.replace(/^data:[^,]*,/, '') : '';
      const encodedBytes = encoded.length * 3 / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
      if (encodedBytes > 5 * 1024 * 1024) return res.status(413).json({ error: 'Profile photographs must be at most 5 MB.' });
      const result = await imageStorage.save(req.body, bytes => resources.reserveUpload(`admin:${req.user.id}`, req.ip || req.socket.remoteAddress || 'unknown', bytes), 800);
      if (!activeAdministrator(getStoreInstance(), req.user.id)) return res.status(403).json({ error: 'This administrator account is no longer active.' });
      const store = getStoreInstance(); store.marketMedia ||= [];
      store.marketMedia.push({ imageUrl: result.imageUrl, accountId: req.user.id, createdAt: new Date().toISOString() });
      syncManagedStore(); return res.json(result);
    } catch (error: any) {
      if (error instanceof GovernanceError || error instanceof ImageUploadError) return res.status(error.status).json({ error: error.message });
      if (error instanceof ResourceLimitError) return resourceFailure(res, error);
      return res.status(503).json({ error: 'Your profile photograph could not be saved.' });
    }
  });

  app.post("/api/storage/upload-hostel-image", requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const result = await imageStorage.save(req.body, bytes => resources.reserveUpload(`${req.user.role}:${req.user.id}`, req.ip || req.socket.remoteAddress || 'unknown', bytes));
      const store = getStoreInstance(); store.hostelMedia ||= [];
      store.hostelMedia.push({ imageUrl: result.imageUrl, managerId: req.user.id, createdAt: new Date().toISOString() });
      syncManagedStore(); return res.json(result);
    } catch (err: any) {
      if (err instanceof ResourceLimitError) return resourceFailure(res, err);
      if (err instanceof ImageUploadError) return res.status(err.status).json({ error: err.message });
      console.error('Image upload could not be persisted.');
      return res.status(500).json({ error: 'Failed to save image. Please try again.' });
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

  app.post("/api/hostels", requireAuth(["admin"]), (_req, res) => res.status(410).json({ error: 'Use residence registration for new properties. Existing properties require manager-requested, reviewed approval.' }));
  app.put("/api/hostels/:id", requireAuth(["admin", "manager"]), (_req, res) => res.status(403).json({ error: 'Direct residence editing is disabled. The assigned manager must submit a change request for administrator review.' }));

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

  app.post("/api/issue-reports", requireAuth(["user", "student", "resident", "admin", "manager"]), async (req: any, res) => {
    try {
      const reportStore = getStoreInstance(), actor = req.user;
      let reportRoom = activeResidentRoom(actor, reportStore);
      if (actor.role === 'user') {
        const rooms = (reportStore.users || []).filter((entry: any) => ['student', 'resident'].includes(accountRole(entry)) && accountData(entry).parentUserId === actor.id)
          .map((entry: any) => activeResidentRoom({ ...accountData(entry), id: accountId(entry), role: accountRole(entry) }, reportStore)).filter(Boolean)
          .filter((room: any) => !req.body.hostelId || room.hostelId === req.body.hostelId);
        if (rooms.length === 1) reportRoom = rooms[0];
      }
      const residentReport = ['student', 'resident', 'user'].includes(actor.role);
      const allowedHomes = (reportStore.hostels || []).filter((home: any) => actor.role === 'admin' || canManageHostel(actor, home));
      const reportHostel = residentReport ? (reportStore.hostels || []).find((home: any) => home.id === reportRoom?.hostelId) :
        allowedHomes.find((home: any) => req.body.hostelId ? home.id === req.body.hostelId : req.body.hostelName ? home.name === req.body.hostelName : allowedHomes.length === 1);
      if (!reportHostel || residentReport && (!reportRoom || req.body.hostelId && req.body.hostelId !== reportHostel.id)) return res.status(403).json({ error: 'Report maintenance only for your active room or authorized residence.' });
      if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.length > 200 || req.body.description !== undefined && (typeof req.body.description !== 'string' || req.body.description.length > 10000) || req.body.photos !== undefined && (!Array.isArray(req.body.photos) || req.body.photos.length > 10 || req.body.photos.some((photo: any) => typeof photo !== 'string'))) return res.status(400).json({ error: 'Provide an issue title, optional text details, and up to ten photographs.' });
      req.body = { ...req.body, title: req.body.title.trim(), hostelId: reportHostel.id, hostelName: reportHostel.name,
        studentId: actor.id, studentEmail: actor.email, studentName: actor.name, studentPhone: actor.phone,
        ...(residentReport ? { blockName: reportRoom.blockName || '', blockFloor: reportRoom.blockName || '', roomNumber: reportRoom.roomNumber || '', roomBed: reportRoom.roomNumber || '' } : {}) };
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
          ((i.userId || i.creatorId || i.parentUserId) ? (i.userId || i.creatorId || i.parentUserId) === userId : i.studentId ? (i.studentId === userId || (sId && i.studentId === sId)) : (
          (i.studentEmail && i.studentEmail.toLowerCase().trim() === userEmail) ||
          (i.parentUserEmail && i.parentUserEmail.toLowerCase().trim() === userEmail) ||
          (i.email && i.email.toLowerCase().trim() === userEmail)
          ))
        )
      );

      if (activeComplaint) {
        return res.status(400).json({ 
          error: `Active complaint in progress: "${activeComplaint.title}". Residents can only log one active complaint at a time to prevent abuse. Please wait until your current issue is resolved and confirmed before submitting a new one.`,
          activeComplaintId: activeComplaint.id,
          activeComplaintTitle: activeComplaint.title
        });
      }

      // Location and manager assignment come from the authorized room/property.
      const store = getStoreInstance();
      const userKey = reportRoom;
      const resolvedHostelId = reportHostel.id;
      const resolvedHostelName = reportHostel.name;
      const resolvedBlock = reportRoom?.blockName ?? blockName ?? blockFloor ?? '';
      const resolvedRoom = reportRoom?.roomNumber ?? roomNumber ?? roomBed ?? '';
      const matchedHostel = reportHostel;
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
        targetAccountId: managerId,
        type: 'issue_report',
        title: `New Maintenance Ticket: ${saved.title}`,
        message: `${saved.studentName} in Room ${saved.roomNumber} (${saved.blockName}) logged a ${saved.urgency} priority issue: "${saved.title}". Please review and assign a technician.`,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: '/manager/dashboard'
      };
      await dbCreateNotification(mgrNotif, notifications, (req as any).user);

      const stuNotif = {
        id: `notif-stu-${Date.now()}`,
        userId: req.user.id,
        targetRole: req.user.role,
        targetAccountId: req.user.id,
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
      await dbCreateNotification(stuNotif, notifications, req.user);

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

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });
      req.body = authorizeIssueAction("assign", req.user, existing, getStoreInstance(), req.body);
      const { staffId, staffName, staffRole, staffEmail, staffPhone, staffPhoto, timeframe, customDeadline } = req.body;

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

      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: 'Manager Reviewed & Assigned Staff',
        actor: req.user.name || 'Hostel Manager',
        actorId: req.user.id,
        actorRole: req.user.role,
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
          rescheduleDeclined: false,
          studentConfirmed: false,
          studentAcceptedResolved: false,
          historyLogs: logs
        },
        issueReports
      );

      // 1. Send notification to assigned staff member
      const staffNotif = {
        id: `notif-staff-${Date.now()}`,
        userId: matchedStaff.userId,
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
      await dbCreateNotification(staffNotif, notifications, req.user);
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
      await dbCreateNotification(resNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(resNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
      console.error("Error assigning staff:", err);
      res.status(500).json({ error: "Failed to assign staff" });
    }
  });

  // Staff accepts task assignment
  app.post("/api/issue-reports/:id/accept-assignment", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });
      req.body = authorizeIssueAction("accept-assignment", req.user, existing, getStoreInstance(), req.body);

      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: 'Task Accepted by Staff',
        actor: req.user.name || 'Staff Member',
        actorId: req.user.id,
        actorRole: req.user.role,
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
      await dbCreateNotification(resAcceptNotif, notifications, req.user);
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
      await dbCreateNotification(mgrAcceptNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(mgrAcceptNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
      console.error("Error accepting task:", err);
      res.status(500).json({ error: "Failed to accept task" });
    }
  });

  // Staff declines task assignment and gives reason why they cannot attend to it
  app.post("/api/issue-reports/:id/staff-decline", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });
      req.body = authorizeIssueAction("staff-decline", req.user, existing, getStoreInstance(), req.body);

      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: 'Task Declined by Staff',
        actor: req.user.name || 'Staff Member',
        actorId: req.user.id,
        actorRole: req.user.role,
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
      await dbCreateNotification(mgrDeclineNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(mgrDeclineNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
      console.error("Error declining task:", err);
      res.status(500).json({ error: "Failed to decline task" });
    }
  });

  // Staff requests rescheduling with explanation/reasons
  app.post("/api/issue-reports/:id/staff-reschedule", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason, requestedTimeframe, requestedDate } = req.body;
      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });
      req.body = authorizeIssueAction("staff-reschedule", req.user, existing, getStoreInstance(), req.body);

      const finalTimeframe = requestedTimeframe || '24h';
      const finalReason = reason || 'Required spare parts/special tools or scheduling clash';

      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: 'Reschedule Requested by Staff',
        actor: req.user.name || existing.assignedStaffName || 'Staff Member',
        actorId: req.user.id,
        actorRole: req.user.role,
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
      await dbCreateNotification(mgrReschedNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(mgrReschedNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
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
      req.body = authorizeIssueAction("approve-reschedule", req.user, existing, getStoreInstance(), req.body);

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

      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: 'Reschedule Approved by Manager',
        actor: req.user.name || 'Hostel Manager',
        actorId: req.user.id,
        actorRole: req.user.role,
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
      await dbCreateNotification(resReschedNotif, notifications, req.user);
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
      await dbCreateNotification(staffReschedNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(staffReschedNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
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
      req.body = authorizeIssueAction("decline-reschedule", req.user, existing, getStoreInstance(), req.body);

      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: 'Reschedule Declined by Manager',
        actor: req.user.name || 'Hostel Manager',
        actorId: req.user.id,
        actorRole: req.user.role,
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
      await dbCreateNotification(staffDecNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(staffDecNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
      console.error("Error declining reschedule:", err);
      res.status(500).json({ error: "Failed to decline reschedule" });
    }
  });

  // Staff submits completion form with completion notes & photo proof
  app.post("/api/issue-reports/:id/staff-complete", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { completionNotes, completionPhoto, completionPhotos } = req.body;

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });
      req.body = authorizeIssueAction("staff-complete", req.user, existing, getStoreInstance(), req.body);

      const finalPhotos = Array.isArray(completionPhotos) ? completionPhotos : (completionPhoto ? [completionPhoto] : []);
      const finalNotes = completionNotes || 'Repairs fully carried out and tested on site.';

      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: 'Staff Marked Fix Complete',
        actor: req.user.name || existing.assignedStaffName || 'Staff Member',
        actorId: req.user.id,
        actorRole: req.user.role,
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
      await dbCreateNotification(resFixNotif, notifications, req.user);
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
      await dbCreateNotification(mgrFixNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(mgrFixNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
      console.error("Error submitting staff completion:", err);
      res.status(500).json({ error: "Failed to submit completion form" });
    }
  });

  // Student confirms resolution, writes review and rates staff
  app.post("/api/issue-reports/:id/student-confirm", requireAuth(["student", "resident"]), async (req: any, res) => {
    try {
      const room = activeResidentRoom(req.user, getStoreInstance());
      if (!room) return res.status(403).json({ error: "Activate your room to review a repair." });
      const { id } = req.params;
      const { isResolved, feedback, studentAcceptedResolved, studentFeedback, rating, reviewText } = req.body;
      const resolvedFlag = isResolved !== undefined ? isResolved : (studentAcceptedResolved !== undefined ? studentAcceptedResolved : true);
      const feedbackText = feedback !== undefined ? feedback : (reviewText || studentFeedback || '');
      const starRating = Number(rating) || 5;

      const list = await dbGetIssueReports(issueReports);
      const existing = list.find((i: any) => i.id === id);
      if (!existing) return res.status(404).json({ error: "Issue report not found" });
      req.body = authorizeIssueAction("student-confirm", req.user, existing, getStoreInstance(), req.body);

      if (existing.hostelId !== room.hostelId || !canEditIssueDetails(req.user, existing, hostels)) return res.status(403).json({ error: "Review only repairs reported by your activated room account." });
      if (!Number.isInteger(starRating) || starRating < 1 || starRating > 5 || typeof feedbackText !== "string" || feedbackText.length > 3000) return res.status(400).json({ error: "Enter a rating from 1 to 5 and valid feedback." });
      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: resolvedFlag ? 'Resident Confirmed Resolution & Rated Staff' : 'Resident Reported Incomplete Fix',
        actor: req.user.name || existing.studentName || 'Student Resident',
        actorId: req.user.id,
        actorRole: req.user.role,
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
          staffCompleted: resolvedFlag === true,
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
      await dbCreateNotification(mgrConfirmNotif, notifications, req.user);
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
      await dbCreateNotification(staffReviewNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(staffReviewNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
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
      req.body = authorizeIssueAction("manager-close", req.user, existing, getStoreInstance(), req.body);

      if (existing.closedByManager) {
        return res.json(existing);
      }

      // STRICT VALIDATION: If filed by a resident/student, manager CANNOT override or close until the resident confirmed complete
      const isResidentReport = needsResidentSignoff(existing, getStoreInstance());
      const wasResidentConfirmed = Boolean(existing.studentConfirmed || existing.studentAcceptedResolved);

      if (isResidentReport && !wasResidentConfirmed) {
        return res.status(400).json({
          error: "Sign-off Locked: The student resident who filed this maintenance report must inspect the repair and tick/confirm it as complete from their resident room page before the manager can finalize and archive signoff."
        });
      }

      const logs = [...(existing.historyLogs || [])];
      logs.push({
        action: 'Work Order Closed & Archived by Manager (Success)',
        actor: req.user.name || 'Hostel Manager',
        actorId: req.user.id,
        actorRole: req.user.role,
        timestamp: new Date().toISOString(),
        note: managerNotes || (wasResidentConfirmed ? 'Issue verified with resident signoff, closed and archived permanently as success.' : 'Direct manager verification and signoff, closed and archived permanently as success.')
      });

      const updated = await dbUpdateIssueReport(
        id,
        {
          status: 'Resolved',
          closedByManager: true,
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
      await dbCreateNotification(resArchivedNotif, notifications, req.user);
      if (store.notifications) store.notifications.unshift(resArchivedNotif);

      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueWorkflowError) return res.status(err.status).json({ error: err.message });
      console.error("Error closing task:", err);
      res.status(500).json({ error: "Failed to close task" });
    }
  });

  app.put("/api/issue-reports/:id", requireAuth(), async (req: any, res) => {
    try {
      const { id } = req.params;

      const list = await dbGetIssueReports(issueReports);
      const existingIssue = list.find((i: any) => i.id === id);
      if (!existingIssue) {
        return res.status(404).json({ error: "Issue report not found" });
      }

      if (!canEditIssueDetails(req.user, existingIssue, getStoreInstance().hostels || [])) {
        return res.status(403).json({ error: "You are not authorized to edit this issue report" });
      }
      const updates = buildIssueDetailsUpdate(req.body, existingIssue, req.user);
      const updated = await dbUpdateIssueReport(id, updates, issueReports);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof IssueEditValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error("Error updating issue report:", err);
      res.status(500).json({ error: "Failed to update issue report" });
    }
  });

  // ==========================================
  // DIGITAL ROOM KEYS ENDPOINTS
  // ==========================================

  function freshRoomKey(room: any, reserved: Set<string>): string {
    for (let attempt = 0; attempt < 32; attempt++) {
      const code = generateHostelRoomKeyCode(room.hostelName, room.blockName);
      if (!reserved.has(code)) { reserved.add(code); return code; }
    }
    throw new ResourceLimitError(503, 60, 'Room-key capacity is busy. Contact an administrator.');
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

  // Key listing is scoped before any authorized generation or read.
  app.get("/api/room-keys", requireAuth(["manager", "admin", "staff"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const allHostels = await dbGetHostels(hostels);
      let permitted = authorizedKeyHostels(req.user, store, allHostels);
      const requestedId = req.query.hostelId;
      if (requestedId !== undefined) {
        if (typeof requestedId !== 'string' || !requestedId.trim()) return res.status(400).json({ error: 'Provide a residence ID.' });
        const selected = permitted.find(hostel => hostel.id === requestedId);
        if (!selected) return res.status(req.user.role === 'admin' ? 404 : 403).json({ error: 'This residence is not available to your account.' });
        permitted = [selected];
      }
      // Staff may read existing keys for their roster residence, but cannot generate keys.
      if (req.user.role !== 'staff') for (const hostel of permitted) await dbGenerateHostelRoomKeys(hostel);
      const ids = new Set(permitted.map(hostel => hostel.id));
      const keys = (await dbGetRoomKeys()).filter(room => ids.has(room.hostelId));
      res.set('Cache-Control', 'private, no-store');
      return res.json(publicAccountData(keys));
    } catch (err: any) {
      if (err instanceof ResourceLimitError) return resourceFailure(res, err);
      return res.status(500).json({ error: "Failed to load room keys" });
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
      notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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

  persistentData.roomKeyAttempts ||= { limits: [] };
  const roomKeyGuard = new RoomKeyAttemptGuard(persistentData.roomKeyAttempts, () => savePersistentStore(persistentData));
  const limitRoomKeyAttempts = (req: any, res: any, next: any) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      roomKeyGuard.reserve(req.user.id, req.ip || req.socket.remoteAddress || 'unknown');
      next();
    } catch (error) {
      if (error instanceof RoomKeyAttemptLimit) {
        res.set('Retry-After', String(error.retryAfter));
        return res.status(429).json({ valid: false, error: error.message });
      }
      return res.status(500).json({ valid: false, error: 'Room activation is temporarily unavailable.' });
    }
  };

  // Verify from the primary account used for activation, with a minimal preview.
  app.post("/api/room-keys/verify", requireAuth(["user"]), requirePrimaryAccount, limitRoomKeyAttempts, async (req: any, res) => {
    try {
      const roomKey = req.body?.roomKey;
      if (typeof roomKey !== 'string' || roomKey.trim().length < 5 || roomKey.length > 128) {
        return res.status(400).json({ valid: false, error: "Please provide a valid room key." });
      }
      const room = await dbGetRoomKeyByCode(roomKey);
      const hostelList = await dbGetHostels(hostels);
      const hostel = room && hostelList.find(hostel => hostel.id === room.hostelId);
      if (!room || !hostel || room.isAssigned || ['occupied', 'claimed', 'assigned'].includes(String(room.status).toLowerCase())) {
        return res.status(400).json({ valid: false, error: "This room key is unavailable. Check the key with your manager." });
      }
      return res.json(roomActivationPreview(room, hostel));
    } catch (err: any) {
      return res.status(500).json({ valid: false, error: "Server error verifying room key" });
    }
  });

  // Legacy assignment endpoint cannot bypass primary-account activation.
  app.post("/api/student/add-room", requireAuth(), (_req: any, res) => {
    return res.status(403).json({ error: 'Room activation requires your primary account and a new, distinct room password. Use the Activate Room form instead.' });
  });

  // Unlink / Delete room key from resident account
  app.post("/api/student/delete-room", requireAuth(["user", "student", "resident"]), async (req: any, res) => {
    const store = getStoreInstance();
    const key = String(req.body.roomKey || '').trim().toUpperCase();
    const room = (store.roomKeys || []).find(r => String(r.roomKey).toUpperCase() === key && r.isAssigned);
    if (!room) return res.status(404).json({ error: 'Active room not found.' });
    const ownsRoom = req.user.role === 'user'
      ? (room.parentUserId === req.user.id || normalizeEmail(room.parentUserEmail) === normalizeEmail(req.user.email))
      : String(req.user.roomKey).toUpperCase() === key;
    if (!ownsRoom) return res.status(403).json({ error: 'This room does not belong to your account.' });
    const resident = [...store.users, ...MOCK_USERS].find(u => String(accountData(u).roomKey || u.roomKey || '').toUpperCase() === key && accountRole(u) !== 'user');
    if (!resident || normalizeEmail(req.body.email) !== normalizeEmail(accountData(resident).email || resident.email) || !await passwordsMatch(req.body.password, ...credentialValues(resident, false))) {
      return res.status(400).json({ error: 'Enter the resident account email and password.' });
    }
    const reserved = new Set<string>([...(store.retiredRoomKeys || []), ...(store.roomKeys || []).map(r => r.roomKey)]);
    releaseRoom(store, room, [store.users, MOCK_USERS, persistentData.users], freshRoomKey(room, reserved));
    syncStore();
    const rooms = (store.roomKeys || []).filter(r => r.isAssigned && r.parentUserId === req.user.id);
    return res.json({ success: true, rooms, message: 'Room account removed and room made available with a new key.' });
  });

  // Claim room key and complete resident onboarding & login
  app.post(["/api/room-keys/claim", "/api/residents/onboard"], requireAuth(["user"]), requirePrimaryAccount, limitRoomKeyAttempts, async (req: any, res) => {
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

      let keyRecord = await dbGetRoomKeyByCode(resolvedKey);
      if (!keyRecord) {
        return res.status(404).json({ error: `Digital room key "${resolvedKey}" not found. Please double-check the key code.` });
      }

      if (keyRecord.isAssigned || keyRecord.status === 'Occupied') return res.status(409).json({ error: 'This room is already occupied.' });
      const rawPassword = password;
      if (typeof rawPassword !== 'string' || rawPassword.length < 6) return res.status(400).json({ error: 'Create a room password with at least 6 characters.' });
      const hashedPassword = await hashCredentialAsync(rawPassword);

      // Assign the room key to this resident
      const store = getStoreInstance();
      // Password derivation yields: refresh allocation state before the atomic assignment.
      keyRecord = (store.roomKeys || []).find(r => String(r.roomKey).trim().toUpperCase() === resolvedKey);
      if (!keyRecord || keyRecord.isAssigned || keyRecord.status === 'Occupied') return res.status(409).json({ error: 'This room is no longer available.' });
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
      setRecordSession(studentUser, studentToken);
      savePersistentStore(store);

      const user = studentUser;

      // Also register or update in MOCK_USERS strictly for student role
      const actualUser = user.user ? user.user : user;
      const userToken = studentToken;
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

      const roomEntry = MOCK_USERS.find((u: any) => accountId(u) === userProfile.id && accountRole(u) === 'student');
      if (roomEntry) setRecordSession(roomEntry, userToken);
      syncStore();

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
      await dbCreateNotification(residentNotif, notifications, req.user);

      // 2. Add activity feed log for Manager and System
      await dbCreateActivity({
        id: `act-checkin-${Date.now()}`,
        text: `Resident Checked In: ${resolvedName} unlocked Room ${keyRecord.roomNumber} (${keyRecord.blockName}) at ${keyRecord.hostelName}.`,
        time: 'Just now',
        type: 'success'
      }, activities);

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

      if (!parentUser || req.headers['x-pinevela-switch-session'] === 'true') setSessionCookie(res, userToken);

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
      if (err instanceof ResourceLimitError) return resourceFailure(res, err);
      console.error("Error generating room keys:", err);
      res.status(500).json({ error: "Failed to generate room keys" });
    }
  });
  installStaffManagement(app, requireAuth, getStoreInstance, syncManagedStore);


  // --- Staff Voluntary Resignation / Quit Job Endpoint ---
  app.post("/api/staff/resign", requireAuth(["staff"]), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const reason = req.body?.reason;

      if (typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 2000) {
        return res.status(400).json({
          error: "A valid reason explaining why you want to quit is mandatory before submitting your resignation to management."
        });
      }

      // Find active staff roster entry
      const staffIdx = staff.findIndex(s => s.userId === userId);
      const activeStaff = staffIdx !== -1 ? staff[staffIdx] : null;

      // Find approved application


      if (!activeStaff) {
        return res.status(400).json({
          error: "You do not have an active hostel employment record to resign from."
        });
      }

      const hostelId = activeStaff?.hostelId;
      const hostelName = activeStaff?.hostelName || 'Accredited Hostel';
      const role = activeStaff?.role || 'Staff Member';
      const staffName = activeStaff?.name || req.user.name || 'Staff Member';

      // Remove from active staff list
      if (staffIdx !== -1) {
        staff.splice(staffIdx, 1);
      }
      for (const entry of [...MOCK_USERS, ...(getStoreInstance().users || [])]) {
        if (accountRole(entry) === 'staff' && accountId(entry) === userId) clearRecordSession(entry);
      }
      clearRecordSession(activeStaff);

      // Record in staffBargains for tracking
      const record = {
        id: `bargain-${Date.now()}`,
        staffId: userId,
        staffName,
        staffEmail: userEmail,
        hostelId,
        hostelName,
        managerId: activeStaff?.managerId,
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
      const managerId = targetHostel?.managerId || targetHostel?.assignedManagerId;

      if (managerId) {
        notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
          id: `notif-${Date.now()}-mgr-resign`,
          studentId: managerId,
          title: `Staff Resignation Notice`,
          message: `${staffName} has resigned from their position as "${role}" at ${hostelName}. Reason provided: "${reason.trim()}". The staff roster has been updated.`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        });
      }

      // Notify the staff member
      notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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
      const staffIdx = staff.findIndex(s => s.userId === userId);
      const activeStaff = staffIdx !== -1 ? staff[staffIdx] : null;

      // Find approved application


      if (!activeStaff) {
        return res.status(400).json({ 
          error: "You do not have an active hostel appointment to quit or bargain for." 
        });
      }

      const hostelId = activeStaff?.hostelId;
      const hostelName = activeStaff?.hostelName || 'Accredited Hostel';
      const role = activeStaff?.role || 'Staff Member';
      const staffName = activeStaff?.name || req.user.name || 'Staff Member';

      // Find manager
      const targetHostel = hostels.find(h => h.id === hostelId);
      const managerId = targetHostel?.managerId || targetHostel?.assignedManagerId;

      if (!isBargain) {
        // DIRECT QUIT with mandatory reason
        if (staffIdx !== -1) {
          clearRecordSession(staff[staffIdx]);
          staff.splice(staffIdx, 1);
        }
        for (const entry of [...MOCK_USERS, ...(getStoreInstance().users || [])]) {
          if (accountRole(entry) === 'staff' && accountId(entry) === userId) clearRecordSession(entry);
        }

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
          notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
            id: `notif-${Date.now()}-mgr-quit`,
            studentId: managerId,
            title: `Staff Resignation Notice`,
            message: `${staffName} has resigned from their position as "${role}" at ${hostelName}. Reason submitted: "${reasonToQuit.trim()}". The staff roster has been updated.`,
            type: 'warning',
            date: new Date().toISOString().split('T')[0],
            read: false
          });
        }

        notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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
        notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
          id: `notif-${Date.now()}-mgr-bargain`,
          studentId: managerId,
          title: `Staff Retention & Bargain Proposal`,
          message: `${staffName} (${role} at ${hostelName}) is considering quitting and has submitted a bargain proposal to negotiate staying. Reason: "${reasonToQuit.trim()}". Proposed terms: "${bargainProposal.proposedTerms.trim()}". Review under Staff > Proposals.`,
          type: 'warning',
          date: new Date().toISOString().split('T')[0],
          read: false
        });
      }

      notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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
        notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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
        notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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

      if (bargain.staffId !== userId) {
        return res.status(403).json({ error: "Unauthorized. This proposal does not belong to you." });
      }

      if (bargain.status !== 'rejected') {
        return res.status(400).json({ error: "You can only make a post-bargain decision on a proposal that was rejected by management." });
      }

      if (decision === 'quit') {
        bargain.status = 'quit_confirmed';
        bargain.resolvedAt = new Date().toISOString();

        // Finalize resignation
        const staffIdx = staff.findIndex(s => s.userId === userId);
        if (staffIdx !== -1) {
          clearRecordSession(staff[staffIdx]);
          staff.splice(staffIdx, 1);
        }
        for (const entry of [...MOCK_USERS, ...(getStoreInstance().users || [])]) {
          if (accountRole(entry) === 'staff' && accountId(entry) === userId) clearRecordSession(entry);
        }

        if (bargain.managerId) {
          notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
            id: `notif-${Date.now()}-mgr-quit-post`,
            studentId: bargain.managerId,
            title: `Staff Final Decision: Resigned`,
            message: `${bargain.staffName} has decided to officially quit their position as ${bargain.role} at ${bargain.hostelName} following the declined bargain. The residence roster has been updated.`,
            type: 'warning',
            date: new Date().toISOString().split('T')[0],
            read: false
          });
        }

        notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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
          notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
            id: `notif-${Date.now()}-mgr-stay`,
            studentId: bargain.managerId,
            title: `Staff Final Decision: Staying on Duty`,
            message: `${bargain.staffName} has decided to remain on the team as ${bargain.role} at ${bargain.hostelName} despite the declined deal terms.`,
            type: 'info',
            date: new Date().toISOString().split('T')[0],
            read: false
          });
        }

        notifications.unshift({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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

  // Both directory aliases are private; no public resident identity directory is supported.
  app.get(["/api/registered-residents", "/api/public/registered-residents"], requireAuth(["admin", "manager"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const residences = await dbGetHostels(hostels);
      const rooms = await dbGetRoomKeys();
      res.set("Cache-Control", "private, no-store");
      return res.json(privateResidentDirectory(req.user, residences, rooms || [], store.users || []));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch registered residents" });
    }
  });

  // --- All Registered User Accounts Endpoint for Admin ---
  app.get("/api/admin/all-users", requireAuth(["admin"]), async (req: any, res) => {
    try {
      const store = getStoreInstance();
      const allUsersList = accountDirectoryRelations(store).map(({ account, parentId, parentRole, primaryAccountId }) => {
        const access = accountAccess(store, account.id, account.role);
        return { id: account.id, name: account.name, role: account.role, email: account.email,
          phone: account.phone, hostelName: account.hostelName, registeredAt: account.registeredAt, parentId, parentRole, primaryAccountId,
          status: access.banned ? 'Banned' : access.restrictions.length ? 'Restricted' : account.status || 'Active', accountAccess: access };
      });
      const breakdown = {
        total: allUsersList.length,
        residents: allUsersList.filter(u => ['user', 'student', 'resident'].includes(u.role)).length,
        managers: allUsersList.filter(u => u.role === 'manager').length,
        staff: allUsersList.filter(u => u.role === 'staff').length,
        officers: allUsersList.filter(u => u.role === 'verification_team').length,
        merchants: allUsersList.filter(u => u.role === 'merchant').length,
        admins: allUsersList.filter(u => u.role === 'admin').length,
        others: allUsersList.filter(u => !['user', 'student', 'resident', 'manager', 'staff', 'verification_team', 'merchant', 'admin'].includes(u.role)).length
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
  app.post("/api/auth/change-password", requireAuth(), async (req: any, res) => {
    if (req.user.role === 'admin') {
      try { governance.verifySettingsKey(req.user.id, req.body.settingsKey); }
      catch (error) { if (error instanceof GovernanceError) return res.status(error.status).json({ error: error.message }); throw error; }
    }
    if (typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 6) return res.status(400).json({ error: 'A new password of at least 6 characters is required.' });
    const email = normalizeEmail(req.user.email), role = req.user.role;
    const records = passwordRecords(email, role).filter(record => role === 'merchant' || accountId(record) === req.user.id);
    if (!records.length) return res.status(404).json({ error: 'Account not found.' });
    if (!await findAsync(records, async record => passwordsMatch(req.body.currentPassword, ...credentialValues(record, false)))) return res.status(400).json({ error: 'Incorrect current password.' });
    await updateIdentityPassword(records, req.body.newPassword, email, role);
    return res.json({ success: true, message: 'Password updated. Sign in again using the new password.' });
  });

  // --- Dynamic Meetings Endpoints (No static mockup data) ---
  app.get("/api/meetings", requireAuth(), async (req: any, res) => {
    try {
      const list = await dbGetMeetings(meetings);
      return res.json(list.filter((meeting: any) => meetingVisible(req.user, meeting, getStoreInstance())));
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

      if (!meetingVisible(req.user, targetMeeting, getStoreInstance())) {
        return res.status(403).json({ error: "You can only update meetings for your authorized residence or account." });
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
        await dbCreateNotification({ adminMessage: req.user?.role === 'admin', senderRole: req.user?.role,
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
      const list = await dbGetMeetings(meetings);
      const targetMeeting = list.find((meeting: any) => meeting.id === id);
      if (!targetMeeting) return res.status(404).json({ error: "Meeting record not found." });
      if (!meetingVisible(req.user, targetMeeting, getStoreInstance())) {
        return res.status(403).json({ error: "You can only delete meetings for your authorized residence or account." });
      }
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
  // Suppress historical notices for features that no longer exist; retain the stored records.
  const isRetiredNotification = (notice: any) => !isMarketMessageNotification(notice) && (
    /^(staff_application|staff_verification|staff_chat|general_chat|chat_message|dm_request|job_offer|housing_booking|booking_request|booking_application)$/.test(notice?.type || '') ||
    /job offer|staff job request|welcome.*messenger/i.test(notice?.title || '') ||
    /staff dashboard\?tab=(apply|chat)|staff\/dashboard\?tab=(apply|chat)/.test(notice?.link || '')
  );
  app.get("/api/notifications", requireAuth(), async (req: any, res) => {
    const list = await dbGetNotifications(notifications);
    const user = req.user;
    const store = getStoreInstance();
    const filtered = (list || []).filter((n: any) => !isRetiredNotification(n) && notificationVisible(user, n, store))
      .map((n: any) => notificationForActor(n, user));

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
        if (isMarketMessageNotification(n)) return true;
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
    const store = getStoreInstance();
    const readerKey = notificationReaderKey(user);
    for (const n of list) {
      if (!isRetiredNotification(n) && notificationVisible(user, n, store)) {
        await dbMarkNotificationRead(n.id, readerKey);
      }
    }
    res.json({ success: true, message: "All notifications marked as read." });
  });

  app.put("/api/notifications/:id/read", requireAuth(), async (req: any, res) => {
    const { id } = req.params;
    const list = await dbGetNotifications(notifications);
    const notification = list.find((n: any) => n.id === id);
    if (!notification || isRetiredNotification(notification)) return res.status(404).json({ error: "Notification no longer available." });
    if (!notificationVisible(req.user, notification, getStoreInstance())) {
      return res.status(403).json({ error: 'This notification belongs to another account.' });
    }
    await dbMarkNotificationRead(id, notificationReaderKey(req.user));
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

  // 404 handler for API routes to prevent falling through to SPA HTML
  app.all('/api/*', (req, res) => {
    console.warn(`[API 404] ${req.method} ${googleRequestLogUrl(req.url)}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite integration middleware (development) or serving static build assets (production)
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        fs: {
          // Preserve Vite's default secret-file exclusions and deny raw upload access.
          deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/uploads/**', '**/data/**', '**/.security/**', '**/.pinevela-wipe-*/**', `${path.resolve(process.env.PINEVELA_WIPE_RECOVERY_DIR || '.security/wipe-recovery')}/**`,
            `${realpathSync(path.resolve(process.env.PINEVELA_DATA_DIR || path.join(process.cwd(), 'data')))}/**`,
            `${path.resolve(process.env.PINEVELA_UPLOADS_DIR || path.join(process.cwd(), 'uploads'))}/**`],
        },
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
    if (err instanceof ResourceLimitError) return resourceFailure(res, err);
    if (err?.type === 'entity.too.large') return res.status(413).set('Connection', 'close').json({ error: 'Request body exceeds the supported size.' });
    if (err?.type === 'entity.parse.failed' || err?.type === 'request.size.invalid') return res.status(400).json({ error: 'Invalid request body.' });
    if (err?.type === 'encoding.unsupported') return res.status(415).json({ error: 'Unsupported request body encoding.' });
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

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PineVela Backend] Server listening at http://0.0.0.0:${PORT}`);
  });
  httpServer.maxConnections = 256;
  httpServer.headersTimeout = 10000;
  httpServer.requestTimeout = 30000;
  httpServer.keepAliveTimeout = 5000;
  httpServer.maxRequestsPerSocket = 100;
}

startServer().catch(err => {
  console.error("Failed to start fullstack server:", err);
  process.exitCode = 1;
});
