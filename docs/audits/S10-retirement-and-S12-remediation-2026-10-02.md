# S10 retirement and S12 remediation — 2026-10-02

S10 is resolved by retiring housing booking applications. S12 is fixed and verified locally. These changes have not been pushed or deployed.

## Housing application retirement

Removed the housing-application GET/POST/PUT endpoints, database helpers, active persistence model, types, empty seed export, manager dashboard fetch/query data, cache invalidation branch, notification setting, health/debug counts and product copy advertising housing booking applications. Historical housing-application notifications are suppressed. Meeting appointments and marketplace service bookings remain supported; room activation is unchanged.

Previously stored housing applications are moved into the private `retiredFeatureRecords.housingApplications` archive when persistence loads and saves. The archive has no application API or workflow. This prevents data destruction during the database migration period while removing the active feature. Historical audit evidence remains in the audit files. Legacy field references remain only in the archive converter and retirement regression tests.

## Maintenance action policy

`issueWorkflowSecurity.ts` centralizes authorization, allowed request fields and state validation for all nine workflow endpoints. Each handler applies the policy immediately after reading the current issue and before modifying records or sending notifications.

| Action | Actor and relationship | Required state |
| --- | --- | --- |
| Assign/reassign | Responsible residence manager or administrator; selected active staff belong to the same residence | Open/pending/in-progress, not completed, confirmed or closed |
| Accept assignment | Active assigned staff account in the issue's residence | Unaccepted active assignment, not declined or awaiting reschedule approval |
| Decline task | Active assigned staff account | Active task, not completed/declined or awaiting reschedule approval |
| Request reschedule | Active assigned staff account | Active task with no pending reschedule decision |
| Approve/decline reschedule | Responsible residence manager or administrator | Active task with a pending reschedule request |
| Complete repair | Active assigned staff account | Accepted active task, not declined or awaiting reschedule approval |
| Resident sign-off/follow-up | Exact reporting account ID, with active room access in the issue's residence | Staff-completed repair awaiting resident confirmation |
| Close/archive | Responsible residence manager or administrator | Staff completion and, for resident/primary-user reports, reporting-resident confirmation |

Administrators cannot impersonate staff or residents for acceptance, completion or resident confirmation. Manager authority is resolved through the actual property; explicit hostel IDs take precedence over display names and explicit manager IDs over shared email. Staff authority comes from the manager-created active roster, not supplied staff names/emails. Assignment identity and contact metadata are derived from the stored staff record. Unknown fields cannot change ownership, assignment, status, sign-off or audit fields.

Closed records reject further transitions. Repeated resident confirmation is rejected, preventing duplicate reviews. An authorized manager's repeated closure is idempotent. A resident reporting an incomplete repair returns it to active work and clears completion/sign-off flags so staff can perform and submit a follow-up repair. Direct manager reports do not manufacture resident confirmation on closure. Generic details updates retain the S02 protected-field allowlist.

Legacy reports lacking a trusted reporting-account ID do not gain resident sign-off through shared email or display identifiers. Workflow validation does not rewrite historical report ownership.

## UI changes

Staff can acknowledge newly assigned in-progress tasks and must accept before the completion controls appear. The manager reschedule request uses the backend's `approvedTimeframe` field. Manager closure updates the visible issue only after server success; a rejected closure displays the server error instead of a success message.

## Verification

All tests used disposable databases, not operational occupants or accounts.

- Full security suite: **48 tests passed**.
- S10 retirement: GET/POST/PUT housing-application requests return HTTP 404 across unauthenticated, primary, resident, manager and administrator requests. Notification settings and historical housing-application notices no longer expose the retired feature. The inactive archive survives save/restart without duplicate records.
- S12: every action rejects unauthenticated and wrong-account requests. Foreign managers, same-residence unassigned staff, foreign staff, primary users, other residents sharing the reporter's email, and administrator impersonation are blocked. Rejected requests leave issues, audit history, notifications and reviews unchanged.
- Every workflow rejects forged assignment/sign-off fields. Assignment cannot select foreign/missing staff and ignores supplied staff contact/name impersonation in favor of stored details.
- Authorized assignment, acceptance, decline, rescheduling, completion, resident confirmation, follow-up and closure succeed. Bodyless staff acceptance matches the actual UI request. Premature, duplicate, closed-state and pending-reschedule actions fail as appropriate.
- A complete lifecycle survives restart. Two simultaneous resident confirmations produce one success, one conflict and exactly one review.
- Existing S02 generic-update and room lifecycle/activation/security regressions pass.
- TypeScript, production build, private-data and whitespace checks passed. The build retains its bundle-size advisory. Verification used direct HTTP and compilation/build checks; no new browser session was run for this change.

Files include `issueWorkflowSecurity.ts`, `server.ts`, `localDb.ts`, `persistentDb.ts`, affected frontend components/types/query handling, `package.json` and `tests/issueWorkflowSecurity.integration.test.ts`. Other audit items remain outside this remediation.
