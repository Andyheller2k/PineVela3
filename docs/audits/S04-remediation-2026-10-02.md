# S04 remediation — 2026-10-02

Status: implemented and verified locally for `POST /api/verification-team/inspections/:id/submit-report`. Running and deployed servers must load these changes before being treated as remediated. This report covers S04 only.

## Change

The report-submission route now requires bearer authentication with an actual `verification_team` session. It then rechecks the registered officer record: the stable account ID must match, the current token must match, and status must explicitly be `active`. A stale user-account copy, inactive or suspended officer, unrelated role, or administrator session cannot submit an officer report.

Assignment is checked using the stored officer account ID or registered officer code. Email, display name, submitted author fields and synthetic/default display assignments do not establish authority. If both inspection and linked verification records contain assignments, both must authorize the officer. Ambiguous or conflicting assignments fail closed.

Stored inspection IDs, linked manager-verification IDs and the existing `insp-` verification-ID alias remain supported. A legacy manager-verification record can produce an inspection only when it actually has an explicit assignment to the authenticated officer. Missing IDs return 404; unassigned records cannot be turned into report submissions. Administrator-finalized inspections cannot be overwritten by the officer submission route.

The report's officer ID, registered officer code, name, email, signature and timestamps are generated from the current officer record and server time. Submitted author/signature/timestamp values cannot replace these fields. The signature field in the officer portal is now read-only to match that behavior. Assignment and administrator-dispatch metadata are preserved.

Report content is constructed from permitted fields and validated before mutation. Recommendations must be explicitly selected from supported values; malformed observations, coordinates, checklist values, property details or photos are rejected. Missing GPS remains null instead of receiving invented coordinates.

Related verification records are updated by their stable IDs. Manager requests require an explicit link or a unique stable manager-ID relationship; sharing a manager email alone cannot make another record receive the report. Report audit entries identify the authenticated officer by ID, and notifications target real registered administrator IDs.

The inspection-list display helper no longer rewrites the authoritative inspection array while merging display records. This prevents list reads from changing the assignments used by submission authorization. The lists' existing public access is a separate finding and was not changed.

Files: `inspectionReportSecurity.ts`, the submission handler and display-helper synchronization in `server.ts`, the signature input in `src/components/PageVerificationTeamPortal.tsx`, the two new `tests/inspectionReportSecurity*` files, and the security-test command in `package.json`.

## Verification

Tests run the actual HTTP server, session middleware and persistence in disposable private directories. No operational account is disabled, no operational report is changed, and no mocked authentication handler or placeholder application data is introduced. Test records and sessions are confined to disposable databases and removed afterward.

| Check | Result |
|---|---|
| No session or invalid token | HTTP 401 for inspection ID, verification ID and prefixed verification-ID aliases |
| Wrong officer with the same display name and matching inspection email metadata | HTTP 403 |
| Inactive officer, stale session copy, user, manager or administrator | HTTP 403 |
| Unassigned verification or another officer's verification | HTTP 403; no inspection or report created |
| Missing target | HTTP 404 |
| Malformed observations, recommendation, coordinates, checklist or photos | HTTP 400 |
| Rejected requests | Inspection, verification, request, officer-counter, notification and audit records remain unchanged |
| Assigned active officer | HTTP 200; report saved with registered author, server signature and timestamps |
| Client author, signature, timestamp, status and assignment spoofing | Server-bound author retained; submission status fixed to `report_submitted`; assignment unchanged |
| Linked records and other records sharing manager email | Correct verification/request updated; unrelated records unchanged |
| Administrator notification and audit entry | Actual administrator ID and submitting officer ID verified |
| Existing route aliases and explicitly assigned legacy verification | HTTP 200 |
| Public inspection-list read before submission | Valid stored assignment remains usable; unrelated officer remains denied |
| Restart persistence | Submitted records retained; unauthenticated and wrong-officer requests still rejected |
| Administrative suspension with retained token | Submission denied immediately and after restart |
| S04 policy tests | Five passed, including finalized/ambiguous assignment checks and missing-GPS behavior |
| Full security regression suite | `npm run test:security`: all 25 tests passed, including S01, S02 and S03 regressions |
| Production build | `npm run build`: passed; existing bundle-size warning |
| Focused TypeScript | New S04 policy and test files passed with `tsc --noEmit` |
| Project TypeScript | `npm run lint`: existing TS2367 at `src/components/PageDigitalMarket.tsx:3536`; no new diagnostics |
| Private-data guard | `npm run check:private-data`: passed |

## Scope and activation

S08 remains open for public verification-record/directory access. S22 remains open for general officer/staff session revocation and other endpoints; the active-status check here protects this report-submission action specifically. Those broader findings were not remediated as part of S04.

Restart the application server to load the change and apply it to each deployed instance. No S04 Git commit, push or remote deployment was performed.
