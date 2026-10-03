import { canManageHostel } from './accountSecurity.js';

const DETAIL_FIELDS = new Set([
  'title', 'category', 'urgency', 'subArea', 'locationTag', 'description',
  'photos', 'visitWindow', 'contactPhone', 'contactMethod'
]);

/** Authorize the actual session identity, never client-supplied owner/manager aliases. */
export function canEditIssueDetails(actor: any, issue: any, hostels: any[]): boolean {
  if (!actor?.id || !issue) return false;
  if (actor.role === 'admin') return true;
  if (actor.role === 'manager') {
    // A stale/foreign ID must not fall back to a matching display name.
    const matches = issue.hostelId
      ? hostels.filter(hostel => hostel.id === issue.hostelId)
      : hostels.filter(hostel => typeof issue.hostelName === 'string' &&
          typeof hostel.name === 'string' &&
          hostel.name.trim().toLowerCase() === issue.hostelName.trim().toLowerCase());
    return matches.length === 1 && canManageHostel(actor, matches[0]);
  }
  if (!['user', 'student', 'resident'].includes(actor.role)) return false;
  // Prefer the creator's account ID. Shared emails, room numbers and student IDs
  // do not prove ownership of another account's report. ID-less legacy reports
  // remain editable by their responsible manager or an administrator.
  const ownerId = issue.userId || issue.creatorId || issue.parentUserId;
  return typeof ownerId === 'string' && ownerId === actor.id;
}

export class IssueEditValidationError extends Error {}

/** The generic details action cannot invoke assignment, sign-off or closure. */
export function buildIssueDetailsUpdate(body: unknown, issue: any, actor: any): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new IssueEditValidationError('Issue details must be a JSON object');
  }
  const entries = Object.entries(body);
  if (!entries.length) throw new IssueEditValidationError('No issue details supplied');
  const updates: Record<string, unknown> = {};
  for (const [field, value] of entries) {
    if (!DETAIL_FIELDS.has(field)) {
      throw new IssueEditValidationError('Only report details can be edited here; ownership, workflow and audit fields are protected');
    }
    if (field === 'photos' ? !Array.isArray(value) || value.some(photo => typeof photo !== 'string') : typeof value !== 'string') {
      throw new IssueEditValidationError(`Invalid value for ${field}`);
    }
    updates[field] = field === 'photos' ? [...value as string[]] : value;
  }
  const timestamp = new Date().toISOString();
  updates.updatedAt = timestamp;
  updates.historyLogs = [
    ...(Array.isArray(issue.historyLogs) ? issue.historyLogs : []),
    {
      action: 'Report Details Updated',
      actor: actor.name || actor.id,
      actorId: actor.id,
      actorRole: actor.role,
      timestamp,
      note: `Updated details: ${entries.map(([field]) => field).join(', ')}`
    }
  ];
  return updates;
}
