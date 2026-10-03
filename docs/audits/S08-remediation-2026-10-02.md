# S08 remediation — 2026-10-02

S08 is fixed and verified in the local checkout. Historical public-access evidence remains in the original audit. These changes have not been deployed or pushed.

## Access policy

| Endpoint | Permitted access |
| --- | --- |
| `/api/admin/verification-inspections`, `/api/verification-inspections` | Authenticated administrators |
| `/api/verification-team/my-inspections` | Active registered officer with a current matching session; only explicitly assigned stored inspections/verification records |
| `/api/hostel-verifications` | Authenticated administrators |
| `/api/registered-residents`, `/api/public/registered-residents` | Administrators; approved managers limited to their authorized residences |

The `public` directory path remains a protected compatibility alias. There is no public resident identity directory. No frontend currently consumes that alias. Public residence browsing is unchanged.

Officer identity is derived from the session and rechecked against the current officer roster. Email/ID query parameters, report authorship, default officers and display-list merging confer no access. Legacy inspections with explicit officer-code assignments remain readable; unassigned and conflicting assignments do not. An officer with no assignments receives an empty list. Administrators use their separate list endpoint.

Resident results come from assigned rooms linked to authorized hostels. Primary accounts and unallocated records are excluded. The response has a small field allowlist and no contact email, activation key, credential or session fields. Fabricated student identifiers and default room/block/residence labels were removed. Stored operational data is preserved.

Verification responses strip credential/session fields recursively, and successful private responses use `Cache-Control: private, no-store`. The officer portal now requests its list with a bearer token alone.

## Verification

Direct HTTP tests against disposable databases passed for all six URL variants:

- No token and random invalid token: HTTP 401.
- Primary users, residents, staff and pending managers: HTTP 403.
- Admin verification lists: HTTP 200; manager/officer access rejected.
- Active officers receive only their assigned records, including completed and explicitly assigned legacy records. Query spoofing, email matches, report-author matches and assignment conflicts do not grant access.
- Inactive officers, stale copied officer tokens and suspended officers with surviving user copies are rejected. Officers without assignments receive an empty list.
- Directory administrators see assigned residents; managers see only their own residence, including when managers share an email or spoof another residence/manager ID. Unassigned rooms and primary/unallocated accounts are excluded.
- Successful reads do not modify stored records. Access boundaries persist after server restart.

The S08 integration test and the existing S04 report-submission integration regression both passed. TypeScript, production build, private-data and whitespace checks passed. The production build emits its existing bundle-size advisory.

Relevant files: `server.ts`, `privateRecordAccess.ts`, `src/components/PageVerificationTeamPortal.tsx`, `tests/privateRecordAccess.integration.test.ts`, `tests/inspectionReportSecurity.integration.test.ts` and the security test command in `package.json`.

This remediation targets the listed read endpoints. The broader session-revocation finding and document/upload access policies are separate audit items; this work does not claim those resolved or implement the future Supabase/RLS migration.
