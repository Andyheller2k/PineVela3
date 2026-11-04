type ReadDashboardPath = (path: string, options: { signal?: AbortSignal }) => Promise<any>;

const secondarySections = [
  ['/api/issue-reports', 'maintenance'],
  ['/api/staff', 'staff'],
  ['/api/staff/invitations', 'staff invitations'],
  ['/api/staff-bargains', 'staff requests'],
  ['/api/board-requests', 'board requests'],
  ['/api/activities', 'activity'],
  ['/api/room-keys', 'room keys'],
] as const;

/** The private assigned-residence response is the only source of manager ownership.
 * Secondary widgets recover independently so a transient read cannot lock the portal. */
export async function loadManagerDashboardData(read: ReadDashboardPath, signal?: AbortSignal) {
  const assigned = await read('/api/manager/my-hostel', { signal });
  const managerProperties: any[] = assigned?.hostel ? [assigned.hostel] : [];
  const settled = await Promise.allSettled(secondarySections.map(([path]) => read(path, { signal })));
  if (signal?.aborted) throw signal.reason || new Error('Dashboard request cancelled.');
  const failedSections: string[] = [];
  const rows = settled.map((result, index) => {
    if (result.status === 'fulfilled') return Array.isArray(result.value) ? result.value : [];
    if ([401, 403].includes(result.reason?.status)) throw result.reason;
    failedSections.push(secondarySections[index][1]);
    return [];
  });
  const [issues, staffList, invitations, staffBargains, boardRequests, activities, roomKeys] = rows;
  const mappedIssues = managerProperties.length
    ? issues.filter((issue: any) => !issue.hostelName || managerProperties.some(property =>
      property.id === issue.hostelId || property.name?.toLowerCase() === issue.hostelName?.toLowerCase()))
    : issues;
  return {
    managerProperties, mappedIssues, staffList, invitations, staffBargains, boardRequests,
    activities: activities.slice(0, 10), roomKeys, failedSections,
  };
}
