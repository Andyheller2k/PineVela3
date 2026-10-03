export interface BlockRoomTypeConfig {
  id: string;
  typeName: string; // e.g. "1 in 1 (Single)", "2 in 1 (Double)", "3 in 1 (Triple)", "4 in 1 (Quad)", "Executive Suite"
  bedsPerRoom: number; // 1, 2, 3, 4, etc.
  totalRooms: number; // Number of rooms of this type in this block
  pricePerBed?: number; // Price per bedspace
}

export interface HostelBlockConfig {
  id: string;
  name: string;
  gender?: 'Male' | 'Female' | 'Mixed';
  floors: number;
  totalRooms: number;
  roomPrefix: string;
  startNum: number;
  bedsPerRoom?: number;
  pricePerBlock?: number;
  price?: number;
  roomTypes?: BlockRoomTypeConfig[];
}

export interface HostelRegistrationDraft {
  // Step 1: Basic Information
  name: string;
  description: string;
  hostelType: string;
  customHostelType?: string;
  genderCategory: 'Male' | 'Female' | 'Mixed';
  status: 'Open' | 'Full' | 'Under Maintenance';
  yearEstablished: number;
  contactEmail: string;
  contactPhone: string;
  alternativePhone: string;
  website: string;
  wing: string;

  // Step 2: Address Details
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  customRegion?: string;
  district: string;
  country: string;
  postalCode: string;
  digitalAddress: string; // GhanaPost GPS (e.g. GA-183-9024)
  landmark: string;
  campusProximity?: string; // e.g. "5-10 Mins Walk"
  campusProximityDetails?: string; // e.g. "Shuttle & walking routes"

  // Step 3: Map Location
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  isLocationConfirmed: boolean;

  // Step 4: Hostel Image
  imageFile?: File | null;
  imageUrl: string;
  imagePreviewUrl?: string;
  imagePath?: string;
  imageStorageType?: 'local' | 'external';
  gallery?: string[];

  // Step 5: Capacity & Structure
  totalBlocks: number;
  totalFloors: number;
  totalRooms: number;
  totalBeds: number;
  maximumCapacity: number;
  blocksList: HostelBlockConfig[];

  // Step 6: Facilities & Amenities
  facilities: string[];
  customFacilities: string[];

  // Step 7: Rules & Policies
  checkInTime: string;
  checkOutTime: string;
  minStay: string;
  maxStay: string;
  guestPolicy: string;
  curfew: string;
  smokingPolicy: 'Strictly Non-Smoking' | 'Designated Areas Only' | 'Prohibited';
  petPolicy: 'No Pets' | 'Service Animals Only' | 'Allowed with Approval';
  noisePolicy: string;
  cancellationPolicy: string;
  customRules: string[];

  // Stay cycle; optional monetary fields retained for legacy stored drafts only.
  defaultFee?: number;
  paymentFrequency: 'Per Academic Year' | 'Per Semester' | 'Monthly' | 'Quarterly' | 'Per Night' | 'Per Day' | 'Per Week' | 'Per Year' | 'Bi-Annually' | 'Weekend Package' | string;
  securityDeposit?: number;
  applicationFee?: number;
  currency?: 'GHS' | 'USD' | 'EUR' | 'GBP';

  // Step 9: Manager Assignment
  assignedManagerId?: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  managerPhoto?: string;
  isNewManager: boolean;

  // Verification & Authority Ownership
  authorityRelationship?: 'Property Owner' | 'Authorized Manager' | 'Company/Organization Representative' | 'Other';
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  proofOfOwnershipType?: string;
  proofOfOwnershipFileName?: string;
  proofOfOwnershipUrl?: string;
  onboardingPaymentStatus?: 'Pending' | 'Paid';
  onboardingPaymentReference?: string;
  onboardingPaymentAmount?: number;

  // Step 10: Review, Confirmation & Draft State
  agreeTerms: boolean;
  accuracyCertified: boolean;
  lastDraftSavedAt?: string;
}

export interface Hostel {
  id: string;
  name: string;
  location: string;
  wing: string;
  status: 'Open' | 'Full' | 'Under Maintenance';
  bedsLeft: number;
  totalCapacity: number;
  availableSpaces: number;
  image: string;
  imageUrl?: string;
  price?: number;
  totalBlocks?: number;
  managerName: string;
  managerPhone: string;
  managerEmail: string;
  managerPhoto?: string;
  managerId?: string;
  description: string;
  rating?: number;
  registrationDate?: string;
  subscriptionPaid?: boolean;
  isApproved?: boolean;
  approvalStatus?: 'Approved' | 'Pending Approval' | 'Rejected';
  isDeleted?: boolean;
  blocks?: any[];
  amenities?: string[];
  facilities?: string[];
  hostel_type?: string;
  gender?: string;
  year_established?: number;
  contact_email?: string;
  contact_phone?: string;
  alternative_phone?: string;
  website?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  region?: string;
  country?: string;
  postal_code?: string;
  digital_address?: string;
  landmark?: string;
  latitude?: number | null;
  longitude?: number | null;
  image_url?: string;
  image_path?: string;
  capacity?: number;
  rules?: any;
  pricing?: any;
  campusProximity?: string;
  campusProximityDetails?: string;
  gallery?: string[];
}

export interface HostelManager {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  nationalId?: string;
  maskedIdNumber?: string;
  idDocumentType?: string;
  organization?: string;
  roleTitle?: string;
  experienceYears?: number;
  verificationStatus: 'approved' | 'pending' | 'rejected' | 'suspended' | 'verified';
  authorityStatus?: string;
  isVerified?: boolean;
  isApproved?: boolean;
  hostelId?: string;
  assignedHostelId?: string;
  assignedHostelName?: string;
  assignedHostelLocation?: string;
  totalBeds?: number;
  assignedHostels?: Array<{
    id: string;
    name: string;
    location?: string;
    status?: string;
    bedsLeft?: number;
    totalCapacity?: number;
  }>;
  approvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ManagerRegistrationRequest {
  id: string;
  managerId: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  nationalId: string;
  organization: string;
  roleTitle: string;
  experienceYears?: number;
  propertyName?: string;
  proposedHostelName?: string;
  proposedLocation?: string;
  proposedCapacity?: number;
  reason?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'Pending' | 'Approved' | 'Rejected';
  requestedAt?: string;
  createdAt?: string;
  approvedAt?: string;
}

export interface HostelRoomKey {
  id: string;
  hostelId: string;
  hostelName: string;
  managerId?: string;
  managerName?: string;
  managerPhone?: string;
  managerEmail?: string;
  blockName: string;
  blockInitial: string;
  roomNumber: string;
  floor?: number;
  roomKey: string; // e.g. "MAZE-A-729104"
  isAssigned: boolean;
  assignedStudentId?: string;
  assignedStudentName?: string;
  assignedStudentEmail?: string;
  assignedStudentPhone?: string;
  assignedResidentType?: string;
  assignedProgram?: string;
  assignedDepartment?: string;
  assignedInstitution?: string;
  assignedAt?: string;
  status: 'Available' | 'Occupied' | 'Reserved';
  createdAt: string;
}

export interface ResidentOnboardingData {
  residentType: 'student' | 'resident' | 'other';
  customResidentType?: string;
  name: string;
  studentId: string;
  email: string;
  phone: string;
  programOfStudy: string;
  department: string;
  institution: string;
  roomKey: string;
  password?: string;
}

export interface IssueReport {
  id: string;
  title: string;
  category: string;
  urgency: 'Low' | 'Medium' | 'High' | 'Emergency';
  subArea?: string;
  locationTag?: string;
  visitWindow?: string;
  contactPhone?: string;
  parentUserEmail?: string;
  description: string;
  photos: string[];
  contactMethod: 'In-app Notification' | 'Phone Call' | 'Email';
  studentName: string;
  studentId: string;
  studentEmail?: string;
  studentPhone?: string;
  hostelId?: string;
  hostelName: string;
  managerId?: string;
  blockFloor: string;
  blockName?: string;
  roomBed: string;
  roomNumber?: string;
  status: 'Pending' | 'In Progress' | 'Resolved';
  date: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  assignedStaffRole?: string;
  assignedStaffPhone?: string;
  assignedStaffEmail?: string;
  assignedAt?: string;
  timeframe?: string;
  deadline?: string;
  staffAccepted?: boolean;
  staffAcceptedAt?: string;
  staffDeclineRequested?: boolean;
  staffDeclineReason?: string;
  rescheduleRequested?: boolean;
  rescheduleReason?: string;
  requestedTimeframe?: string;
  staffRescheduleRequested?: boolean;
  staffRescheduleReason?: string;
  staffRequestedTimeframe?: string;
  rescheduleApproved?: boolean;
  rescheduleApprovedAt?: string;
  staffCompleted?: boolean;
  staffCompletionNotes?: string;
  staffCompletionPhoto?: string;
  staffCompletedAt?: string;
  studentConfirmed?: boolean;
  studentAcceptedResolved?: boolean;
  studentResolvedAt?: string;
  studentFeedback?: string;
  studentRating?: number;
  studentReview?: string;
  closedByManager?: boolean;
  closedAt?: string;
  historyLogs?: Array<{
    action: string;
    actor: string;
    timestamp: string;
    note?: string;
  }>;
}

export interface MeetingRequest {
  id: string;
  studentId: string;
  studentName: string;
  hostelName: string;
  type: 'Video Call' | 'In-Person';
  date: string;
  time: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Declined';
  roomNumber?: string;
}

export interface Notification {
  id: string;
  studentId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  date: string;
  read: boolean;
}

export interface HostelRating {
  id: string;
  studentId: string;
  studentName: string;
  hostelId: string;
  hostelName: string;
  score: number; // 1-5
  review: string;
  date: string;
}

export interface MaintenanceStatus {
  electricity: 'Stable' | 'Intermittent' | 'Critical';
  wifi: 'Stable' | 'Intermittent' | 'Critical';
  water: 'Active' | 'Intermittent' | 'Critical';
}

export interface OpenStaffRole {
  role: string;
  vacancies: number;
  shift?: string;
  monthlyAllowance?: string;
  description?: string;
}

export interface Staff {
  id: string;
  userId?: string;
  name: string;
  role: string;
  phone: string;
  contactMethod?: 'WhatsApp' | 'Email';
  email?: string;
  username?: string;
  photo?: string;
  avatar?: string;
  hostelId: string;
  hostelName?: string;
  shift?: string;
  assignedBlock?: string;
  status?: string;
  nationalId?: string;
  cvUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ActiveScreen =
  | 'public-browse'        // Page 1
  | 'student-login'        // Page 3
  | 'student-submitted'    // Page 4
  | 'student-dashboard'    // Page 5
  | 'student-report-issue' // Page 6
  | 'manager-login'        // Page 7
  | 'manager-dashboard'    // Page 8
  | 'manager-configure'    // Page 9
  | 'manager-hostel-dashboard' // Page 10 (Single Hostel Manager Dashboard)
  | 'staff-dashboard' // New Staff Dashboard Screen
;

// ==========================================
// PINEVELA VERIFICATION & ONBOARDING SYSTEM
// ==========================================

export interface ManagerVerificationRecord {
  id: string;
  managerId: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  country: string;
  idDocumentType: 'Ghana Card' | 'Passport' | "Driver's License" | 'Voter ID';
  hashedIdNumber: string; // SHA-256 hashed test identifier
  maskedIdNumber: string; // e.g. GHA-*****001-1
  fullNameOnId: string;
  dateOfBirth?: string;
  idExpiryDate?: string;
  idVerificationStatus: 'verified' | 'invalid' | 'already_verified' | 'suspended';
  
  // Authority Claim
  authorityRelationship: 'Property Owner' | 'Authorized Manager' | 'Company/Organization Representative' | 'Other';
  claimedOwnerName?: string;
  claimedOwnerPhone?: string;
  claimedOwnerEmail?: string;
  organizationName?: string;
  organizationRegNumber?: string;
  authorityEvidenceDescription?: string;
  authorityEvidenceFileName?: string;
  authorityEvidenceUrl?: string;
  authorityStatus: 'pending' | 'verified' | 'flagged' | 'missing_evidence';

  // System Validation Checks
  systemChecks: {
    identity: 'verified' | 'failed';
    phone: 'verified' | 'failed';
    email: 'verified' | 'failed';
    authorityEvidence: 'submitted' | 'missing';
    informationConsistency: 'passed' | 'flagged';
    duplicateManager: 'clean' | 'flagged';
    previousHistory: 'clean' | 'flagged';
  };

  status: 'pending' | 'approved' | 'rejected' | 'more_info_required' | 'suspended';
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface HostelVerificationRecord {
  id: string;
  hostelId: string;
  hostelName: string;
  location: string;
  campusZone?: string;
  addressLine1?: string;
  digitalAddress: string; // GhanaPost GPS (e.g. GA-183-9024)
  totalCapacity: number;
  totalRooms: number;
  totalBlocks: number;
  pricePerYear: number;
  currency: string;
  facilities: string[];
  imageUrl?: string;

  // Manager details
  managerId: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  managerApproved: boolean;

  // Ownership & Authority
  authorityRelationship: 'Property Owner' | 'Authorized Manager' | 'Company/Organization Representative' | 'Other';
  ownerOperatorName: string;
  ownerOperatorPhone: string;
  ownerOperatorEmail?: string;
  proofOfOwnershipType: string;
  proofOfOwnershipFileName?: string;
  proofOfOwnershipUrl?: string;

  // System validation
  systemValidation: {
    missingInfo: boolean;
    digitalAddressFormatValid: boolean;
    duplicateHostelCheck: 'clean' | 'flagged';
    duplicateRegistrationCheck: 'clean' | 'flagged';
    managerApproved: boolean;
    identityVerified: boolean;
    ownershipEvidencePresent: boolean;
    conflictingInfo: boolean;
    capacityPricingValid: boolean;
  };
  validationPassed: boolean;

  // GHS 50 Onboarding Payment
  paymentStatus: 'pending' | 'paid' | 'exempt';
  paymentReference?: string;
  paymentAmount: number; // 50.00
  paymentDate?: string;

  status: 'draft' | 'submitted' | 'system_validation' | 'payment_required' | 'payment_confirmed' | 'under_admin_review' | 'approved' | 'more_info_required' | 'rejected' | 'suspended';
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt: string;
  createdAt: string;
  updatedAt?: string;
}

export interface VerificationDocument {
  id: string;
  ownerType: 'manager' | 'hostel';
  ownerId: string;
  documentType: string;
  fileName: string;
  filePath: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  isSensitive: boolean;
  uploadedAt: string;
}

export interface VerificationAuditLog {
  id: string;
  action: string;
  targetType: 'manager' | 'hostel' | 'payment';
  targetId: string;
  targetName?: string;
  performedBy: string;
  role: string;
  details: Record<string, any>;
  ipAddress?: string;
  timestamp: string;
}

export interface OnboardingPaymentRecord {
  id: string;
  hostelId: string;
  hostelName: string;
  managerId: string;
  managerName: string;
  amount: number; // 50.00
  currency: 'GHS';
  status: 'pending' | 'paid' | 'refunded';
  reference: string;
  agreementAcknowledged: boolean;
  paymentMethod: 'Manual Confirmation (Direct Agreement)';
  paidAt: string;
}

export interface MeetingLog {
  id: string;
  hostelId?: string;
  hostelName?: string;
  managerId: string;
  managerName: string;
  requesterId?: string;
  requesterName: string;
  requesterType: 'student' | 'staff' | 'external' | 'administrator';
  requesterEmail: string;
  requesterPhone: string;
  roomOrUnit?: string;
  topic: string;
  category: 'Room / Accommodation' | 'Maintenance Follow-up' | 'Payment / Billing' | 'Staff Operational Shift' | 'Disciplinary / Grievance' | 'General Consultation';
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "10:00 AM - 10:30 AM"
  mode: 'In-Person (Admin Office)' | 'Google Meet / Video' | 'Phone Call';
  status: 'Pending' | 'Approved' | 'Completed' | 'Rejected' | 'Rescheduled' | 'Cancelled';
  meetingLinkOrVenue?: string;
  notes?: string;
  managerResponseNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ManagerAccountSettings {
  managerId: string;
  notifications: {
    emailAlerts: boolean;
    smsAlerts: boolean;
    maintenanceTicketAlerts: boolean;
    meetingRequestAlerts: boolean;
  };
  security: {
    twoFactorAuth: boolean;
    sessionTimeoutMinutes: number;
    requirePasswordForPayouts: boolean;
  };
  meetingAvailability: {
    allowStudentBookings: boolean;
    allowStaffBookings: boolean;
    workingDays: string[];
    officeHoursStart: string;
    officeHoursEnd: string;
    slotDurationMinutes: number;
    meetingModes: string[];
    autoConfirmMeetings: boolean;
    officeLocation: string;
  };
  emergencyContact: {
    contactName: string;
    contactPhone: string;
    contactRelation: string;
  };
}

export interface VerificationTeamMember {
  id: string;
  officerId: string;
  fullName: string;
  email: string;
  password?: string;
  phone: string;
  assignedZone: string;
  status: 'active' | 'inactive';
  role: 'verification_team';
  token?: string;
  createdAt: string;
  totalInspectionsCompleted: number;
}

export interface VerificationReportChecklist {
  residenceExists: boolean; // Residence actually exists
  managerConnected: boolean; // Manager is genuinely connected to it
  basicPropertyInfoVerified: boolean; // Basic property info confirmed
  managerAuthorityConfirmed: boolean; // Manager's identity & authority verified
  generalLegitimacyConfirmed: boolean; // General legitimacy of operation
  safetyHabitableCompliance: boolean; // Safety & habitable compliance
}

export interface VerificationReport {
  submittedAt: string;
  officerId: string;
  officerName: string;
  gpsCoordinates: {
    lat: number;
    lng: number;
    accuracyMeters?: number;
    capturedAddress?: string;
  };
  timestamp: string;
  checklist: VerificationReportChecklist;
  propertyDetails: {
    estimatedRooms?: number;
    estimatedBeds?: number;
    buildingStructure?: string;
    securityPresent?: boolean;
    utilitiesOperational?: boolean;
  };
  photos: Array<{
    title: string;
    url: string;
    capturedAt: string;
  }>;
  observations: string;
  recommendation: 'recommend_approval' | 'recommend_rejection' | 'requires_followup';
  inspectorSignature: string;
}

export interface VerificationInspection {
  id: string;
  managerVerificationId: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  hostelName: string;
  location: string;
  digitalAddress?: string;
  dispatchedAt: string;
  dispatchedBy: string;
  assignedOfficerId: string;
  assignedOfficerName: string;
  assignedOfficerEmail: string;
  status: 'dispatched' | 'in_progress' | 'report_submitted' | 'approved' | 'rejected';
  priority: 'normal' | 'urgent' | 'high';
  adminDispatchNotes?: string;
  report?: VerificationReport;
  adminDecision?: {
    decidedAt: string;
    decidedBy: string;
    decision: 'approved' | 'rejected';
    reason?: string;
  };
}

export interface DigitalMarketApplication {
  id: string;
  userId: string;
  parentUserEmail: string;
  fullName: string;
  university: string;
  studentEmail: string;
  storeName?: string;
  phone?: string;
  password?: string;
  categoryToSell: string;
  idNumber: string;
  idPhotoUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  registrationFeePaid: boolean;
  setupCompleted?: boolean;
  registrationFeeAmount: number; // 50 GHS
  semesterFeeAmount: number; // 300 GHS
  paymentMethod?: string;
  paymentTransactionRef?: string;
  paidAt?: string;
  submittedAt: string;
  reviewedAt?: string;
  adminNotes?: string;
}

export interface DigitalMarketStore {
  id: string;
  userId: string;
  parentUserEmail: string;
  storeName: string;
  university: string;
  ownerName: string;
  studentEmail: string;
  category: string;
  description: string;
  logoUrl?: string;
  bannerUrl?: string;
  phone: string;
  isBanned: boolean;
  isVerified: boolean;
  registrationFeePaid?: boolean;
  setupCompleted?: boolean;
  paymentMethod?: string;
  paymentTransactionRef?: string;
  status: 'active' | 'disabled' | 'pending' | 'pending_setup';
  createdAt: string;
  activatedAt?: string;
}

export interface ServicePriceCategory {
  imageUrl?: string;
  id: string;
  name: string; // e.g. "Indomie Assorted"
  price: number; // in Cedis, e.g. 50
  description?: string;
}

export interface DigitalMarketProduct {
  id: string;
  storeId: string;
  storeName: string;
  sellerId: string;
  sellerEmail: string;
  sellerUniversity: string;
  sellerName?: string;
  sellerPhone?: string;
  title: string;
  description: string;
  price: number; // GHS (Cedis)
  currency: string;
  category: string;
  stockQuantity: number;
  imageUrl: string;
  isAvailable: boolean;
  isService?: boolean;
  /** Required for newly published services; legacy services behave as flexible. */
  serviceLocationMode?: 'flexible' | 'fixed' | 'hybrid';
  serviceCategory?: string;
  priceCategories?: ServicePriceCategory[];
  additionalImages?: string[];
  callLine?: string;
  location?: string;
  meetingLocation?: string;
  workingDays?: string;
  openingTime?: string;
  closingTime?: string;
  isOpen247?: boolean;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DigitalMarketOrderTimeline {
  status: string;
  title: string;
  timestamp: string;
  notes?: string;
}

export interface DigitalMarketOrder {
  id: string;
  productId: string;
  productTitle: string;
  productPrice: number;
  priceCategory?: string;
  priceCategoryId?: string;
  productImage: string;
  quantity: number;
  totalAmount: number;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  buyerPhone: string;
  sellerId: string;
  sellerEmail: string;
  storeId: string;
  storeName: string;
  university: string;
  meetingLocation: string;
  meetingLatitude?: number;
  meetingLongitude?: number;
  /** How the service appointment will be fulfilled. */
  serviceLocationOption?: 'seller-location' | 'buyer-location';
  sellerConfirmed?: boolean;
  sellerAgreedLocation?: boolean;
  sellerAgreedAt?: string;
  otpPin?: string; // Present only in the authenticated buyer's active challenge response.
  deliveryPinState?: 'active' | 'expired' | 'locked' | 'unavailable';
  deliveryPinExpiresAt?: string;
  status: 'Awaiting Seller Confirmation' | 'Pending Meetup' | 'Completed & Paid' | 'Cancelled' | 'Location Rejected' | 'Rejected by Seller';
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
  timeline: DigitalMarketOrderTimeline[];
}
