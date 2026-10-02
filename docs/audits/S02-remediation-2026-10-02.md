# S02 remediation — 2026-10-02

Status: implemented and verified locally for `PUT /api/issue-reports/:id`. This report covers S02 only; it does not establish that a separately running or deployed server has loaded the changes.

## Change

The generic maintenance-report update route now authorizes the authenticated actor against the existing report before constructing a permitted update. It no longer passes the request body directly to `dbUpdateIssueReport`.

| Actor | Permitted generic action |
|---|---|
| User, student or resident | Edit details of the report owned by that exact account ID |
| Manager | Edit details of reports at a hostel currently assigned to that manager |
| Administrator | Edit report details |
| Staff, merchant, verification officer or unrelated account | None |

Report-owner IDs take precedence over alternate student IDs, parent links and shared emails. A report with no usable owner ID is not editable by a resident based on email alone. Managers use the current hostel assignment rather than report-supplied manager names, IDs or emails. A hostel ID never falls back to a matching display name; legacy name-only reports require a unique hostel match.

Allowed details are `title`, `category`, `urgency`, `subArea`, `locationTag`, `description`, `photos`, `visitWindow`, `contactPhone` and `contactMethod`. Text fields require strings and photos require an array of strings.

All other fields are rejected, including owner and resident identities, hostel and room associations, staff assignments, manager metadata, status, sign-off flags, deadlines, timestamps and history. Rejection applies to the entire request, including a request mixing permitted and protected fields. Workflow operations must use their dedicated action endpoints.

Successful detail edits receive a server-generated `updatedAt` and append a history entry containing the authenticated actor's ID, role, timestamp and edited field names. Existing history and workflow state are preserved.

Implementation: `issueReportSecurity.ts` and the generic PUT handler in `server.ts`. The low-level database updater remains available for trusted patches built by dedicated workflow handlers; it is no longer fed arbitrary request fields by this route.

## Verification

The HTTP regression test launches the actual server against a disposable temporary database, exercises real bearer-session authentication and disk persistence, then restarts that server. Test identities and reports exist only in the disposable test database; operational application data is not changed.

| Check | Result |
|---|---|
| Missing or invalid session | HTTP 401 |
| Different resident with the same email and matching alternate student ID | HTTP 403 |
| Linked primary account attempting to edit another identity's report | HTTP 403 |
| Foreign manager sharing the responsible manager's email, and named as manager in the report | HTTP 403 |
| Assigned staff and same-email merchant | HTTP 403 despite valid sessions |
| Protected-field edits by owner, responsible manager and administrator | HTTP 400; 32 fields checked for each actor |
| Invalid detail values and empty updates | HTTP 400 |
| Missing report | HTTP 404 |
| Owner, responsible manager and administrator editing permitted details | HTTP 200; protected fields unchanged; authenticated audit entry appended |
| Primary user editing their own report | HTTP 200 |
| Rejected requests | Stored report remains unchanged |
| Restart persistence | Successful edits retained; cross-account and sign-off attacks still rejected |
| Security regression suite | `npm run test:security`: all 12 tests passed |
| Production build | `npm run build`: passed; existing bundle-size warning |
| Private-data guard | `npm run check:private-data`: passed |
| TypeScript | `npm run lint`: fails on the existing TS2367 at `src/components/PageDigitalMarket.tsx:3536`; no new diagnostics |

The first sandboxed integration attempt could not open a local port (`listen EPERM`). The integration test and complete security suite were subsequently run with local-server access and passed.

## Scope and activation

S12 remains open: record-level authorization on dedicated assignment, staff completion, resident confirmation and manager closure endpoints is a separate finding. These endpoints were not changed by this S02 remediation. The generic PUT can no longer set their protected fields directly.

Restart the application server to load the change, and apply it to each deployed instance before treating those instances as remediated. No Git commit, push or remote deployment was performed for S02.
