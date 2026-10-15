import { accountData, accountId, accountRole, canManageHostel, hasActiveRoom } from './accountSecurity.js';
import { officerIsAssigned } from './inspectionReportSecurity.js';

/** Read assignments from stored records, never from display merges, email or report authorship. */
export function assignedInspectionRecords(officer: any, inspections: any[], verifications: any[]): any[] {
  const result: any[] = [];
  const linkedIds = new Set<string>();
  for (const inspection of inspections) {
    if (!inspection?.id || inspections.filter(i => i?.id === inspection.id).length !== 1) continue;
    if (inspection.managerVerificationId) linkedIds.add(inspection.managerVerificationId);
    const linked = verifications.filter(v => v?.id === inspection.managerVerificationId);
    if (!officerIsAssigned(officer, inspection) || linked.length > 1 ||
        linked[0]?.assignedOfficerId && !officerIsAssigned(officer, linked[0])) continue;
    result.push({ ...inspection });
  }
  for (const verification of verifications) {
    if (!verification?.id || linkedIds.has(verification.id) ||
        verifications.filter(v => v?.id === verification.id).length !== 1 ||
        !officerIsAssigned(officer, verification)) continue;
    result.push({
      id: `insp-${verification.id}`, managerVerificationId: verification.id,
      managerName: verification.managerName, managerEmail: verification.managerEmail,
      managerPhone: verification.managerPhone,
      hostelName: verification.hostelName || verification.residenceName,
      location: verification.location || verification.address,
      dispatchedAt: verification.dispatchedAt, dispatchedBy: verification.dispatchedBy,
      assignedOfficerId: verification.assignedOfficerId,
      assignedOfficerName: officer.fullName, assignedOfficerEmail: officer.email,
      status: verification.inspectionStatus || verification.status,
      priority: verification.priority, adminDispatchNotes: verification.adminDispatchNotes,
      report: verification.inspectionReport || verification.verificationReport || null
    });
  }
  return result;
}

/** A private allocation directory. Unallocated primary accounts are not residents. */
export function privateResidentDirectory(actor: any, hostels: any[], rooms: any[], users: any[]): any[] {
  if (!['admin', 'manager'].includes(actor?.role)) return [];
  const visibleHostels = hostels.filter(hostel => hostel?.id && canManageHostel(actor, hostel));
  const residents = new Map<string, any>();
  for (const room of rooms) {
    if (!room?.isAssigned || !room.hostelId) continue;
    const hostel = visibleHostels.find(h => h.id === room.hostelId);
    if (!hostel) continue;
    const account = users.find(entry => ['student', 'resident'].includes(accountRole(entry)) &&
      hasActiveRoom(entry, [room]) && (!room.assignedStudentId ||
        [accountId(entry), accountData(entry)?.studentId].includes(room.assignedStudentId)));
    const data = accountData(account);
    const id = room.assignedStudentId || room.studentId || accountId(account) || room.id;
    const name = room.studentName || room.assignedStudentName || data?.name;
    if (!id || !name) continue;
    residents.set(`${room.hostelId}:${id}`, {
      id, studentName: name,
      studentId: room.studentId || data?.studentId || room.assignedStudentId,
      hostelName: hostel.name || room.hostelName,
      roomNumber: room.roomNumber, blockName: room.blockName,
      assignedResidentType: room.assignedResidentType || data?.residentType,
      avatar: room.avatar || data?.avatar || data?.photoUrl
    });
  }
  return Array.from(residents.values());
}
