/** Navigation policies only. Role strings are contract inputs, not accounts. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portalRoles, type PortalRole } from '../src/lib/portalRoles.js';

const roles: PortalRole[] = ['user', 'student', 'merchant', 'manager', 'staff', 'admin', 'verification_team', 'officer', 'field_officer'];
test('workspaces admit only their corresponding server-projected role', () => {
  for (const [portal, expected] of [
    ['primary', 'user'], ['resident', 'student'], ['seller', 'merchant'],
    ['manager', 'manager'], ['staff', 'staff'], ['administrator', 'admin'],
  ] as const) {
    for (const role of roles) {
      assert.equal(portalRoles(portal).includes(role), role === expected,
        `${role} must ${role === expected ? '' : 'not '}enter ${portal}`);
    }
  }
});

test('the student alias intentionally routes only primary, resident and seller accounts', () => {
  const admitted = portalRoles('student-alias');
  for (const role of roles) assert.equal(admitted.includes(role), ['user', 'student', 'merchant'].includes(role));
});

