import crypto from 'node:crypto';
import { canManageHostel } from './accountSecurity.js';
import { managerRecordMatches } from './managerApprovalSecurity.js';
import { activeManagedStaff } from './staffManagement.js';

export function authorizedKeyHostels(actor: any, store: any, hostels: any[]): any[] {
  if (actor?.role === 'admin') return hostels;
  if (actor?.role === 'manager') return hostels.filter(hostel => canManageHostel(actor, hostel) &&
    (hostel.managerId || hostel.assignedManagerId || managerRecordMatches({ ...hostel, managerEmail: hostel.managerEmail || hostel.email }, actor, store.users || [])));
  if (actor?.role === 'staff') {
    const member = activeManagedStaff(actor, store);
    return member ? hostels.filter(hostel => hostel.id === member.hostelId) : [];
  }
  return [];
}

export type RoomKeyLimitState = { limits: { key: string; count: number; expiresAt: number }[] };
export const ROOM_KEY_WINDOW_MS = 15 * 60 * 1000;
export class RoomKeyAttemptLimit extends Error {
  constructor(public retryAfter: number) { super('Too many room activation attempts. Please wait before trying again.'); }
}

/** Shared verification/activation budgets survive restart; keys and raw IPs are never stored. */
export class RoomKeyAttemptGuard {
  constructor(private state: RoomKeyLimitState, private persist: () => void, private now = Date.now) {}
  reserve(actorId: string, ip: string) {
    const now = this.now();
    this.state.limits = this.state.limits.filter(limit => limit.expiresAt > now);
    const budgets = [['account', actorId, 20], ['ip', ip, 60]] as const;
    const slots = budgets.map(([scope, value, maximum]) => {
      const key = crypto.createHash('sha256').update(`${scope}:${value}`).digest('hex');
      const existing = this.state.limits.find(limit => limit.key === key);
      if (existing && existing.count >= maximum) throw new RoomKeyAttemptLimit(Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)));
      return { key, existing };
    });
    if (this.state.limits.length + slots.filter(slot => !slot.existing).length > 4000) throw new RoomKeyAttemptLimit(900);
    for (const { key, existing } of slots) {
      if (existing) existing.count++;
      else this.state.limits.push({ key, count: 1, expiresAt: now + ROOM_KEY_WINDOW_MS });
    }
    this.persist();
  }
}

/** Preview only the room being activated; never disclose occupant or manager records. */
export function roomActivationPreview(room: any, hostel: any) {
  return {
    valid: true, roomKey: room.roomKey, hostelId: room.hostelId,
    hostelName: hostel.name || room.hostelName,
    blockName: room.blockName, roomNumber: room.roomNumber, floor: room.floor,
    status: room.status
  };
}
