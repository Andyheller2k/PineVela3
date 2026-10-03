import { canManageHostel } from './accountSecurity.js';

const TEXT_FIELDS = new Set([
  'name', 'description', 'location', 'wing', 'hostel_type', 'type', 'gender',
  'contact_email', 'contact_phone', 'alternative_phone', 'website',
  'address_line_1', 'address_line_2', 'city', 'region', 'country', 'postal_code',
  'digitalAddress', 'digital_address', 'landmark', 'formattedAddress',
  'campusProximity', 'campusProximityDetails', 'image', 'imageUrl', 'image_url',
  'imagePath', 'image_path', 'exteriorPhotoUrl', 'paymentFrequency',
  'billingFrequency', 'frequency', 'currency', 'curfew', 'minStay', 'maxStay',
  'visitorPolicy', 'guestPolicy', 'smokingPolicy', 'petPolicy', 'noisePolicy',
  'cancellationPolicy', 'checkInTime', 'checkOutTime'
]);
const NUMBER_FIELDS = new Set([
  'price', 'securityDeposit', 'applicationFee', 'totalCapacity', 'capacity',
  'totalBlocks', 'totalFloors', 'totalRooms', 'totalBeds', 'bedsLeft',
  'availableSpaces', 'year_established'
]);
const STRING_ARRAY_FIELDS = new Set(['amenities', 'facilities', 'gallery', 'customRules']);
const ARRAY_FIELDS = new Set(['blocks', 'blocksList', 'pricingTiers']);
const OBJECT_FIELDS = new Set(['pricing', 'rules']);
const UNSAFE_FIELDS = new Set(['__proto__', 'constructor', 'prototype']);

export function canUpdateHostel(actor: any, hostel: any): boolean {
  if (!actor?.id || !hostel) return false;
  // A property's general contact email is not a manager assignment.
  return canManageHostel(actor, {
    managerId: hostel.managerId,
    assignedManagerId: hostel.assignedManagerId,
    managerEmail: hostel.managerEmail
  });
}
export class HostelUpdateValidationError extends Error {}

function validManagerDetail(field: string, value: unknown): boolean {
  if (TEXT_FIELDS.has(field)) return typeof value === 'string';
  if (NUMBER_FIELDS.has(field)) return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (STRING_ARRAY_FIELDS.has(field)) return Array.isArray(value) && value.every(item => typeof item === 'string');
  if (ARRAY_FIELDS.has(field)) return Array.isArray(value) && value.every(item => item && typeof item === 'object' && !Array.isArray(item));
  if (OBJECT_FIELDS.has(field)) return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  if (field === 'latitude' || field === 'longitude') {
    const limit = field === 'latitude' ? 90 : 180;
    return value === null || typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
  }
  return false;
}

/** Managers edit listing details; approval, ownership and lifecycle remain admin operations. */
export function buildHostelUpdate(body: unknown, actor: any, hostel: any): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
    throw new HostelUpdateValidationError('Hostel updates must be a non-empty JSON object');
  }
  if (!['admin', 'manager'].includes(actor?.role)) {
    throw new HostelUpdateValidationError('A manager or administrator session is required');
  }
  const updates: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(body)) {
    if (UNSAFE_FIELDS.has(field)) throw new HostelUpdateValidationError('Invalid hostel field');
    if (field === 'id') {
      if (value !== hostel.id) throw new HostelUpdateValidationError('Hostel identity cannot be changed');
      continue; // Existing full-record administrator saves include this immutable ID.
    }
    if (actor.role === 'manager' && !validManagerDetail(field, value)) {
      throw new HostelUpdateValidationError('Managers may edit valid property details only; ownership, approval and lifecycle fields are protected');
    }
    updates[field] = value;
  }
  if (!Object.keys(updates).length) throw new HostelUpdateValidationError('No hostel changes supplied');

  // Both aliases participate in authorization. Changing only one must not leave
  // the previous manager authorized through the other alias.
  if (actor.role === 'admin' && ('managerId' in updates || 'assignedManagerId' in updates)) {
    const ids = ['managerId', 'assignedManagerId'].filter(field => field in updates).map(field => updates[field]);
    if (ids.some(id => id !== null && typeof id !== 'string') || ids.some(id => id !== ids[0])) {
      throw new HostelUpdateValidationError('Manager assignment IDs must agree');
    }
    updates.managerId = ids[0];
    updates.assignedManagerId = ids[0];
    if (!ids[0] && !('managerEmail' in updates)) updates.managerEmail = '';
  }
  updates.updatedAt = new Date().toISOString();
  return updates;
}
