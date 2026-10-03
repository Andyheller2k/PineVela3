import { accountData, accountId, accountRole, canManageHostel } from './accountSecurity.js';
import { managerRecordMatches } from './managerApprovalSecurity.js';
import { activeResidentRoom, activeManagedStaff } from './staffManagement.js';

export type IssueAction = 'assign' | 'accept-assignment' | 'staff-decline' | 'staff-reschedule' | 'approve-reschedule' | 'decline-reschedule' | 'staff-complete' | 'student-confirm' | 'manager-close';
export class IssueWorkflowError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const TIMEFRAMES = new Set(['12h', '24h', '48h', '3d', '5d', '7d']);
const FIELDS: Record<IssueAction, string[]> = {
  assign: ['staffId', 'staffName', 'staffRole', 'staffEmail', 'staffPhone', 'staffPhoto', 'timeframe', 'customDeadline'],
  'accept-assignment': [], 'staff-decline': ['reason'],
  'staff-reschedule': ['reason', 'requestedTimeframe', 'requestedDate'],
  'approve-reschedule': ['approvedTimeframe', 'managerNotes'], 'decline-reschedule': ['reason'],
  'staff-complete': ['completionNotes', 'completionPhoto', 'completionPhotos'],
  'student-confirm': ['isResolved', 'feedback', 'studentAcceptedResolved', 'studentFeedback', 'rating', 'reviewText'],
  'manager-close': ['managerNotes']
};
const fail = (status: number, message: string): never => { throw new IssueWorkflowError(status, message); };
export function workflowHostel(issue: any, store: any) {
  const matches = (store.hostels || []).filter((h: any) => issue.hostelId ? h.id === issue.hostelId :
    typeof issue.hostelName === 'string' && h.name?.trim().toLowerCase() === issue.hostelName.trim().toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}
export function needsResidentSignoff(issue: any, store: any) {
  const ownerId = issue.userId || issue.creatorId || issue.parentUserId;
  const owner = (store.users || []).find((u: any) => accountId(u) === ownerId);
  if (owner) return ['student', 'resident', 'user'].includes(accountRole(owner));
  return Boolean(issue.studentId || issue.studentEmail || issue.residentId || /resident/i.test(issue.reportedBy || ''));
}
function assignedMember(issue: any, store: any) {
  const matches = (store.staff || []).filter((s: any) => s.id === issue.assignedStaffId || s.userId === issue.assignedStaffId);
  return matches.length === 1 ? matches[0] : undefined;
}
/** Validate immediately after reading the current issue, before any mutation or notification. */
export function authorizeIssueAction(action: IssueAction, actor: any, issue: any, store: any, input: any): any {
  const hostel = workflowHostel(issue, store);
  const managerAction = ['assign', 'approve-reschedule', 'decline-reschedule', 'manager-close'].includes(action);
  if (managerAction) {
    if (!hostel || !(actor.role === 'admin' || actor.role === 'manager' && canManageHostel(actor, hostel) &&
        (hostel.managerId || hostel.assignedManagerId || managerRecordMatches({ ...hostel, managerEmail: hostel.managerEmail || hostel.email }, actor, store.users || [])))) fail(403, 'Manage only maintenance in your authorized residence.');
  } else if (action === 'student-confirm') {
    const room = activeResidentRoom(actor, store);
    const ownerId = issue.userId || issue.creatorId || issue.parentUserId;
    if (!room || !ownerId || ownerId !== actor.id || room.hostelId !== hostel?.id ||
        issue.roomKey && String(issue.roomKey).toUpperCase() !== String(room.roomKey).toUpperCase()) fail(403, 'Only the reporting resident with active room access may confirm this repair.');
  } else {
    const member = activeManagedStaff(actor, store), assigned = assignedMember(issue, store);
    if (!hostel || !member || !assigned || assigned.id !== member.id || member.hostelId !== hostel.id) fail(403, 'Only the active assigned staff member may perform this action.');
  }
  if (action === 'manager-close' && issue.closedByManager) return input;
  if (issue.closedByManager || issue.isClosed || ['closed', 'archived'].includes(String(issue.status).toLowerCase())) fail(409, 'This maintenance issue is closed.');
  const pendingReschedule = issue.staffRescheduleRequested === true || issue.rescheduleRequested === true;
  const confirmed = issue.studentConfirmed === true || issue.studentAcceptedResolved === true;
  const active = ['Pending', 'Open', 'In Progress'].includes(issue.status);
  if (action === 'student-confirm') {
    if (issue.staffCompleted !== true || issue.status !== 'Resolved' || confirmed) fail(409, 'Confirm a completed repair once, before manager closure.');
  } else if (action === 'manager-close') {
    if (issue.staffCompleted !== true || issue.status !== 'Resolved' || needsResidentSignoff(issue, store) && !confirmed) fail(409, 'Staff completion and reporting-resident sign-off are required before closure.');
  } else if (!active || issue.staffCompleted || confirmed) fail(409, 'This action is unavailable in the current maintenance state.');
  if (action === 'accept-assignment' && (issue.staffAccepted || issue.staffDeclined || pendingReschedule)) fail(409, 'This assignment cannot be accepted in its current state.');
  if (['staff-decline', 'staff-reschedule', 'staff-complete'].includes(action) && (issue.staffDeclined || pendingReschedule)) fail(409, 'Wait for manager review or reassignment.');
  if (action === 'staff-complete' && issue.staffAccepted !== true) fail(409, 'Accept the assignment before completing it.');
  if (['approve-reschedule', 'decline-reschedule'].includes(action) && !pendingReschedule) fail(409, 'There is no pending reschedule request.');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !FIELDS[action].includes(key))) fail(400, 'Unsupported maintenance action fields.');
  for (const field of ['reason', 'completionNotes', 'managerNotes', 'feedback', 'reviewText', 'studentFeedback']) {
    if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > 5000)) fail(400, 'Invalid maintenance notes.');
  }
  for (const field of ['timeframe', 'requestedTimeframe', 'approvedTimeframe']) if (input[field] !== undefined && !TIMEFRAMES.has(input[field])) fail(400, 'Invalid repair timeframe.');
  for (const field of ['customDeadline', 'requestedDate']) if (input[field] != null && (typeof input[field] !== 'string' || !Number.isFinite(Date.parse(input[field])) || Date.parse(input[field]) <= Date.now())) fail(400, 'Choose a future repair date.');
  if (['staff-decline', 'staff-reschedule', 'decline-reschedule'].includes(action) && !input.reason?.trim()) fail(400, 'Provide a reason for this action.');
  if (action === 'staff-complete') {
    if (!input.completionNotes?.trim()) fail(400, 'Provide repair completion notes.');
    if (input.completionPhoto !== undefined && typeof input.completionPhoto !== 'string' || input.completionPhotos !== undefined && (!Array.isArray(input.completionPhotos) || input.completionPhotos.length > 12 || input.completionPhotos.some((p: any) => typeof p !== 'string'))) fail(400, 'Invalid completion photos.');
  }
  if (action === 'student-confirm') {
    const flags = [input.isResolved, input.studentAcceptedResolved].filter(flag => flag !== undefined);
    if (!flags.length || flags.some(flag => typeof flag !== 'boolean') || flags.length === 2 && flags[0] !== flags[1]) fail(400, 'Explicitly confirm whether the repair is resolved.');
    if (input.rating !== undefined && (typeof input.rating !== 'number' || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) fail(400, 'Enter a rating from 1 to 5.');
  }
  if (action === 'assign') {
    if (typeof input.staffId !== 'string' || !input.staffId) fail(400, 'Choose an active staff account.');
    const matches = (store.staff || []).filter((s: any) => s.id === input.staffId || s.userId === input.staffId);
    const member = matches.length === 1 ? matches[0] : undefined;
    const account = member && (store.users || []).find((u: any) => accountRole(u) === 'staff' && accountId(u) === member.userId);
    if (!account || member.hostelId !== hostel.id || activeManagedStaff(account, store)?.id !== member.id) fail(403, 'Assign active staff from this issue’s residence.');
    return { ...input, staffId: member.id, staffName: member.name, staffRole: member.specialization || member.role,
      staffEmail: member.email || accountData(account).email, staffPhone: member.phone,
      staffPhoto: member.avatar || member.profilePicture };
  }
  return input;
}
