export type PortalRole = 'student' | 'manager' | 'admin' | 'staff' | 'user' | 'merchant' | 'verification_team' | 'officer' | 'field_officer';
type Portal = 'primary' | 'resident' | 'manager' | 'staff' | 'seller' | 'administrator' | 'student-alias';
const roles: Record<Portal, PortalRole[]> = {
  primary: ['user'], resident: ['student'], manager: ['manager'], staff: ['staff'],
  seller: ['merchant'], administrator: ['admin'], 'student-alias': ['user', 'student', 'merchant'],
};

/** Navigation eligibility only. Every API still derives authority server-side. */
export function portalRoles(portal: Portal): PortalRole[] {
  return roles[portal];
}
