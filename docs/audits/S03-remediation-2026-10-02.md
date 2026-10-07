# S03 remediation — 2026-10-02

Status: implemented and verified locally for `PUT /api/hostels/:id`, with database-update hardening. This report covers S03 only. Running and separately deployed servers must load the changes before being treated as remediated.

## Change

The generic hostel update route now loads the existing authoritative record and checks the actual authenticated session against its current manager assignment. It constructs a permitted patch before calling the database updater.

| Actor | Permitted operation |
|---|---|
| Assigned manager | Edit valid property details on their own hostel |
| Unassigned manager | None on the target hostel |
| Administrator | Edit existing records, including approval and manager assignment |
| User, student, staff, merchant or verification officer | None through this route |

Manager and assigned-manager IDs take precedence over matching email or display names. Legacy assignments without IDs use the explicit `managerEmail`; a property's general contact email does not confer managerial authority. A related approved manager record does not upgrade a user or merchant session into a manager session for this handler.

Managers can edit listing details such as name, description, address, images, capacity, pricing, amenities, block configuration, map coordinates and property rules. The policy explicitly lists permitted fields and validates their top-level types. Numeric capacity and price values must be finite and nonnegative; map coordinates must be in range or null.

Manager edits cannot change ownership, manager identity/contact metadata, approval flags or status, lifecycle/visibility flags, subscription/payment state, rating, administrative notes, registration dates or timestamps. Unknown fields are rejected. A mixed permitted/protected request fails in full without changing the record. `status` is administrator-only because it is also used for approval and blocking.

The existing administrator full-record editor remains supported. Hostel IDs are immutable, and unsafe top-level prototype keys are rejected for every actor. When an administrator changes one manager-ID alias, both `managerId` and `assignedManagerId` are synchronized so the old assignment cannot retain access. Conflicting submitted assignment IDs are rejected; removing IDs clears the old manager-email fallback unless the administrator explicitly supplies one.

The HTTP update route returns 404 for missing hostels instead of creating them. `dbUpdateHostel` also returns null for missing records and preserves the original ID on existing records. Explicit creation and registration functions remain separate.

Successful HTTP edits receive a server-generated `updatedAt`. The route synchronizes the authoritative updated hostel list before `syncStore`, preserving the change on disk instead of overwriting it with a stale list.

Files: `hostelSecurity.ts`, `server.ts`, `localDb.ts`, both `tests/hostelSecurity*` files and the security-test command in `package.json`.

## Verification

The integration tests use the real HTTP server, bearer-session authentication and JSON database in disposable private directories. No application data or authentication handlers are mocked, and operational accounts or hostel records are not modified. Test identities and records are confined to those directories and removed afterward.

| Check | Result |
|---|---|
| Missing or invalid bearer session | HTTP 401 |
| Foreign manager sharing the assigned manager's email and display name | HTTP 403 for detail edits and combined takeover/self-approval attempts |
| User, student, staff and merchant with valid sessions and related approved manager metadata | HTTP 403 |
| Assigned manager submitting protected or unknown fields | HTTP 400; 23 fields checked, each mixed with an otherwise permitted edit |
| Rejected requests | Stored hostel records remain unchanged |
| Invalid manager detail values | HTTP 400 |
| Attempted ID change by manager or administrator | HTTP 400 |
| Missing-hostel updates by manager or administrator | HTTP 404; no record created |
| Direct database update of a missing hostel | Returns null; no insertion |
| Direct database update attempting to replace an existing ID | Original ID retained |
| Assigned manager editing permitted details | HTTP 200; protected fields and other hostel unchanged |
| Administrator full-record edit and approval | HTTP 200; saved record verified on disk |
| Dedicated administrator verification | HTTP 200; manager denied with HTTP 403 |
| Administrator manager transfer | Both ID aliases updated; old manager denied, new manager allowed |
| Restart persistence | Edits and transfer retained; old manager and self-approval attempts still denied |
| Unit policy coverage | Five S03 policy tests passed, including general-email rejection and assignment clearing |
| Security regression suite | `npm run test:security`: all 19 tests passed, including S01 and S02 regressions |
| Production build | `npm run build`: passed on final code; existing bundle-size warning |
| Private-data guard | `npm run check:private-data`: passed |
| Project TypeScript | `npm run lint`: existing TS2367 at `src/components/PageDigitalMarket.tsx:3536`; no new diagnostics |
| Focused TypeScript | New S03 policy and test files passed with `tsc --noEmit` |

## Scope and activation

The change covers the reported generic PUT vulnerability and its database updater. Other audit findings and their distinct endpoints remain separate. Existing creation, registration, recruitment and verification workflows were not broadly rewritten.

Restart the application server to load this fix, and apply it to each deployed instance. No S03 commit, push or remote deployment was performed.

2026-10-07 update: facilities, amenities and property-policy fields are retired. The current
update allowlist rejects new/changed values for these fields; unchanged historical fields
are ignored in full-record saves. Primary contact changes require country-aware validation.
