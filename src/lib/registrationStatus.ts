import type { DigitalMarketApplication, DigitalMarketStore } from '../types';

export type RegistrationStatus = 'unregistered' | 'pending' | 'approved' | 'active' | 'rejected' | 'disabled' | 'suspended' | 'restricted' | 'more_info_required';

export interface ManagerRegistration {
  id?: string;
  managerId?: string;
  name?: string;
  email?: string;
  phone?: string;
  organizationName?: string;
  hostelName?: string;
  idNumber?: string;
  submittedAt?: string;
  createdAt?: string;
  status?: string;
  isApproved?: boolean;
  isVerified?: boolean;
  isRejected?: boolean;
  isBlocked?: boolean;
  isRestricted?: boolean;
  restrictionReason?: string;
  blockReason?: string;
  adminNotes?: string;
}

export function managerRegistrationStatus(account: ManagerRegistration | null): RegistrationStatus {
  if (!account || account.status?.toLowerCase() === 'deleted') return 'unregistered';
  const status = account.status?.toLowerCase();
  if (account.isBlocked || ['blocked', 'disabled', 'banned'].includes(status || '')) return 'disabled';
  if (status === 'suspended') return 'suspended';
  if (status === 'rejected' || account.isRejected) return 'rejected';
  if (status === 'more_info_required') return 'more_info_required';
  if (account.isRestricted) return 'restricted';
  if (['approved', 'verified', 'active'].includes(status || '') || account.isApproved || account.isVerified) return 'approved';
  return 'pending';
}

export function merchantRegistrationStatus(application: DigitalMarketApplication | null, store: DigitalMarketStore | null): RegistrationStatus {
  if (!application && !store) return 'unregistered';
  if (application?.accountStatus === 'disabled' || store?.isBanned || store?.status === 'disabled') return 'disabled';
  if (store?.accountStatus === 'restricted' || application?.accountStatus === 'restricted') return 'restricted';
  if (store?.status === 'active' && store.setupCompleted && store.registrationFeePaid) return 'active';
  if (application?.status === 'rejected') return 'rejected';
  if (application?.status === 'approved' || store?.status === 'pending_setup' || store?.status === 'active') return 'approved';
  return 'pending';
}

export const registrationStatusLabels: Record<RegistrationStatus, string> = {
  unregistered: 'Not registered',
  pending: 'Pending Approval',
  approved: 'Approved',
  active: 'Verified & Active',
  rejected: 'Registration Rejected',
  disabled: 'Account Disabled',
  suspended: 'Account Suspended',
  restricted: 'Account Restricted',
  more_info_required: 'More Information Required',
};
