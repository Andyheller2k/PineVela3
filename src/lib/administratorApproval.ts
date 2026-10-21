export function needsApprovalKey(method: string, route: string, body: any): boolean {
  if (!['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) return false;
  const path = route.toLowerCase().replace(/\/+$/, '');
  if (/^\/api\/admin\/payments\/[^/]+\/reversal-review$/.test(path)) return true;
  if (/^\/api\/(manager-requests|manager-verifications|hostel-verifications)\/[^/]+\/approve$/.test(path) || path === '/api/admin/digital-market/approve-application') return true;
  if (/^\/api\/hostels\/[^/]+\/verify$/.test(path)) return !(body?.isApproved === false || body?.status === 'Rejected' || body?.approvalStatus === 'Rejected');
  return false; // Direct residence edits are retired; change decisions verify their own approval key.
}
