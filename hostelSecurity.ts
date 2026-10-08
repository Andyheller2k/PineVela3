import { retiredHostelFields } from './hostelRegistrationFields.js';
import { canManageHostel, accountData, accountId, accountRole, normalizeEmail } from './accountSecurity.js';

/** Assignment check for request submission; direct property writes are retired. */
export function canRequestResidence(actor: any, hostel: any): boolean {
  if (!actor?.id || !hostel) return false;
  // A property's general contact email is not a manager assignment.
  return canManageHostel(actor, {
    managerId: hostel.managerId,
    assignedManagerId: hostel.assignedManagerId,
    managerEmail: hostel.managerEmail
  });
}

const privateCapacityFields = new Set(['totalCapacity', 'maximumCapacity', 'capacity', 'totalBeds', 'bedsLeft', 'availableSpaces', 'bedsPerRoom', 'totalRooms', 'roomCount', 'beds', 'bedspaces', 'openBedspaces']);
/** Public cards retain stable routing IDs, but never expose operational bed counts. */
export function residenceForViewer(hostel: any, actor?: any, store?: any): any {
  if (actor?.role === 'admin' || assignedResidences(actor, store || { hostels: [] }).some(h => h.id === hostel.id)) return hostel;
  const redact = (value: any): any => Array.isArray(value) ? value.map(redact) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !privateCapacityFields.has(key) && !retiredHostelFields.has(key)).map(([key, child]) => [key, redact(child)])) : value;
  return redact(hostel);
}


/** Legacy email assignments are usable only when they resolve to one manager identity. */
export function assignedResidences(actor: any, store: any): any[] {
  if (actor?.role !== 'manager') return [];
  return (store.hostels || []).filter((hostel: any) => {
    if (!canRequestResidence(actor, hostel)) return false;
    if (hostel.managerId || hostel.assignedManagerId) return true;
    const matching = (store.users || []).filter((entry: any) => accountRole(entry) === 'manager' && normalizeEmail(accountData(entry)?.email || entry.email) === normalizeEmail(hostel.managerEmail));
    return new Set(matching.map(accountId)).size === 1 && accountId(matching[0]) === actor.id;
  });
}
