import crypto from 'node:crypto';
import { canManageHostel } from './accountSecurity.js';
import { managerIsApproved, managerRecordMatches } from './managerApprovalSecurity.js';

export class OnboardingSubmissionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** The property is registered first; this endpoint submits its manager's evidence for review. */
export function hostelVerificationSubmission(actor: any, body: any, store: any) {
  if (actor?.role !== 'manager' || !managerIsApproved(actor, store)) throw new OnboardingSubmissionError('An approved manager account is required.', 403);
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.hostelId !== 'string' || !body.hostelId.trim()) throw new OnboardingSubmissionError('Choose your registered residence.');
  const hostel = (store.hostels || []).find((h: any) => h.id === body.hostelId);
  if (!hostel || !canManageHostel(actor, hostel)) throw new OnboardingSubmissionError('You can only submit verification for your own residence.', 403);
  if (hostel.isApproved === true) throw new OnboardingSubmissionError('This residence is already approved.', 409);
  const pending = (store.hostelVerifications || []).some((v: any) => v.hostelId === hostel.id && !['rejected', 'cancelled'].includes(v.status));
  if (pending) throw new OnboardingSubmissionError('A verification request already exists for this residence.', 409);
  const text = (key: string, maximum = 2000) => {
    const value = body[key];
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string' || value.length > maximum) throw new OnboardingSubmissionError(`Invalid ${key}.`);
    return value.trim();
  };
  const digitalAddress = text('digitalAddress', 32).toUpperCase();
  if (digitalAddress && !/^[A-Z]{2}-\d{3,4}-\d{4}$/.test(digitalAddress)) throw new OnboardingSubmissionError('Invalid digital address.');
  const fields = ['campusZone', 'addressLine1', 'authorityRelationship', 'ownerOperatorName', 'ownerOperatorPhone', 'ownerOperatorEmail', 'proofOfOwnershipType', 'proofOfOwnershipFileName', 'proofOfOwnershipUrl', 'paymentReference'] as const;
  const evidence = Object.fromEntries(fields.map(key => [key, text(key)])) as Record<typeof fields[number], string>;
  const dossiers = [...(store.managerVerifications || []), ...(store.managerRegistrationRequests || [])]
    .filter(v => managerRecordMatches(v, actor, store.users || []));
  const identityVerified = dossiers.some(v => v.status === 'approved' && v.documentsVerified?.idFront === 'verified' && v.documentsVerified?.idBack === 'verified');
  const capacityValid = [hostel.totalCapacity, hostel.totalRooms, hostel.totalBlocks].every(value => value === undefined || typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
  const pricingValid = hostel.pricePerYear === undefined || typeof hostel.pricePerYear === 'number' && Number.isFinite(hostel.pricePerYear) && hostel.pricePerYear >= 0;
  const paidTransaction = (store.paymentTransactions || []).find((t: any) => t.hostelId === hostel.id && t.purpose === 'housing' && t.status === 'fulfilled' && (process.env.NODE_ENV !== 'production' || t.mode !== 'test'));
  const now = new Date().toISOString();
  const systemValidation = {
    missingInfo: !hostel.name || !hostel.location, digitalAddressFormatValid: true,
    duplicateHostelCheck: 'clean', duplicateRegistrationCheck: 'clean', managerApproved: true,
    identityVerified, ownershipEvidencePresent: Boolean(evidence.proofOfOwnershipUrl),
    conflictingInfo: Boolean(body.hostelName && body.hostelName !== hostel.name), capacityPricingValid: capacityValid && pricingValid
  };
  return {
    ...evidence, id: crypto.randomUUID(), hostelId: hostel.id, hostelName: hostel.name,
    location: hostel.location || '', digitalAddress, totalCapacity: hostel.totalCapacity,
    totalRooms: hostel.totalRooms, totalBlocks: hostel.totalBlocks, pricePerYear: hostel.pricePerYear,
    currency: hostel.currency || 'GHS', facilities: hostel.facilities || [], imageUrl: hostel.imageUrl || '',
    managerId: actor.id, managerName: actor.name, managerEmail: actor.email, managerPhone: actor.phone || '',
    managerApproved: true, systemValidation,
    validationPassed: !systemValidation.missingInfo && !systemValidation.conflictingInfo && systemValidation.capacityPricingValid && identityVerified && systemValidation.ownershipEvidencePresent,
    // A submitted receipt reference is evidence for review, never proof of payment.
    paymentStatus: paidTransaction ? 'paid' : 'unpaid', paymentAmount: 50, paymentDate: paidTransaction?.fulfilledAt || null, paymentReference: paidTransaction?.reference || evidence.paymentReference,
    status: 'under_admin_review', adminNotes: '', submittedAt: now, createdAt: now, updatedAt: now
  };
}
