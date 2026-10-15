import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { residenceChangeRows } from './residenceChanges.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
const issueStatuses:Record<string,string> = {reported:'Pending',assigned:'Assigned',accepted:'In Progress',reschedule_requested:'Pending',staff_completed:'Resolved',resident_confirmed:'Resolved',follow_up:'In Progress',closed:'Closed'};
export function issueRow(r:any) {
  return {
    id:r.id,hostelId:r.residence_id,hostelName:r.residence_name,roomId:r.room_id,roomNumber:r.room_number || '',blockName:r.block_name || '',
    studentId:r.reporter_context_id,userId:r.reporter_context_id,studentName:r.reporter_name,title:r.title,description:r.details,details:r.details,category:r.category || '',
    urgency:r.urgency,photos:r.photo_paths,imageUrl:r.photo_paths[0] || '',assignedStaffId:r.assigned_staff_id,assignedStaffName:r.staff_name,
    assignedStaffEmail:r.staff_email,assignedStaffPhone:r.staff_phone,assignedAt:r.assigned_at,staffAccepted:Boolean(r.accepted_at),staffAcceptedAt:r.accepted_at,
    staffDeclined:Boolean(r.declined_at),staffDeclineRequested:Boolean(r.declined_at),staffDeclineReason:r.decline_reason,
    status:r.withdrawn_by_wipe_id?'Withdrawn':issueStatuses[r.status],workflowState:r.withdrawn_by_wipe_id?'withdrawn':r.status,withdrawn:Boolean(r.withdrawn_by_wipe_id),
    reportedAt:r.created_at,createdAt:r.created_at,updatedAt:r.updated_at,closedAt:r.closed_at,closedByManager:r.status === 'closed',
    staffCompleted:['staff_completed','resident_confirmed','closed'].includes(r.status),staffCompletedAt:r.completed_at,
    staffCompletionNotes:r.completion_notes,staffCompletionPhoto:r.completion_paths?.[0] || '',staffCompletionPhotos:r.completion_paths || [],
    requiresResidentSignoff:Boolean(r.allocation_id),residentVerified:Boolean(r.confirmed_at),studentConfirmed:Boolean(r.confirmed_at),studentAcceptedResolved:Boolean(r.confirmed_at),
    studentResolvedAt:r.confirmed_at,studentRating:r.repair_rating,studentFeedback:r.resident_feedback,studentReview:r.resident_feedback,
    rescheduleRequested:r.status === 'reschedule_requested',staffRescheduleRequested:r.status === 'reschedule_requested',
    staffRescheduleReason:r.reschedule_reason,staffRequestedTimeframe:r.requested_timeframe,requestedTimeframe:r.requested_timeframe,rescheduleReason:r.reschedule_reason,staffRequestedDate:r.requested_deadline,
    timeframe:r.timeframe,deadline:r.deadline,subArea:r.location_tag,locationTag:r.location_tag,visitWindow:r.visit_window,
    contactPhone:r.contact_phone,contactMethod:r.contact_method,managerCloseNotes:r.manager_close_notes,historyLogs:r.history_logs || []
  };
}
/** The caller runs this client under db.actor's live, non-BYPASSRLS role. All
 * views apply the same verified portal boundary to direct REST/SQL reads. */
export async function housingDashboardRows(client:PoolClient,kind:'staff'|'issues'|'bargains'|'board'|'activities') {
  if (kind === 'staff') return (await client.query('select * from private.housing_staff_directory where ended_at is null order by created_at desc limit 1000')).rows.map(r => ({
    id:r.id,userId:r.staff_context_id,staffId:r.staff_context_id,name:r.display_name,email:r.email,phone:r.phone,
    avatar:r.avatar_path,hostelId:r.residence_id,hostelName:r.residence_name,assignedBlockId:r.assigned_block_id,
    assignedBlock:r.block_name || 'All Blocks',role:r.job_role,shift:r.shift,status:r.status === 'active' ? 'Active' : r.status === 'suspended' ? 'Suspended' : r.status,createdAt:r.created_at,endedAt:r.ended_at,endReason:r.end_reason}));
  if (kind === 'issues') return (await client.query('select * from private.housing_issue_details order by created_at desc limit 1000')).rows.map(issueRow);
  if (kind === 'bargains') return (await client.query('select * from private.housing_bargain_details order by created_at desc limit 1000')).rows.map(r => ({
    id:r.id,staffId:r.staff_context_id,staffAssignmentId:r.staff_assignment_id,staffName:r.staff_name,staffEmail:r.staff_email,
    staffPhone:r.staff_phone,managerId:r.manager_context_id,hostelId:r.residence_id,hostelName:r.residence_name,
    proposedTerms:r.proposed_terms,bargainProposal:r.proposed_terms,isBargain:true,reasonToQuit:r.reason_to_quit,role:r.original_role,
    currentShift:r.original_shift,currentBlock:r.original_block_name || 'All Blocks',managerResponseNote:r.response_note,
    status:r.status === 'proposed' ? 'pending' : r.status === 'declined' ? 'rejected' : r.status,
    createdAt:r.created_at,updatedAt:r.updated_at,resolvedAt:r.decided_at,staffDecidedAt:r.staff_decided_at}));
  if (kind === 'board') return residenceChangeRows(client);
  return (await client.query('select * from private.account_activity_feed order by occurred_at desc limit 100')).rows.map(r => ({
    id:r.id,text:r.event_type.replace(/_/g,' '),time:r.occurred_at,createdAt:r.occurred_at,eventType:r.event_type,
    resourceType:r.resource_type,resourceId:r.resource_id}));
}
export function installDashboardReads(app:Express,auth:SupabaseAuth) {
  const route = (kind:Parameters<typeof housingDashboardRows>[1]):RequestHandler => (req,res,next) => {
    auth.db.readActor((req as AuthRequest).actor,c => housingDashboardRows(c,kind)).then(rows => res.json(rows)).catch(next);
  };
  app.get('/api/staff',auth.require(['admin','manager','staff','resident']),route('staff'));
  app.get('/api/issue-reports',auth.require(['admin','manager','staff','resident']),route('issues'));
  app.get('/api/staff-bargains',auth.require(['admin','manager','staff']),route('bargains'));
  app.get('/api/board-requests',auth.require(['admin','manager']),route('board'));
  app.get('/api/activities',auth.require(['admin','manager','staff','resident']),route('activities'));
}
