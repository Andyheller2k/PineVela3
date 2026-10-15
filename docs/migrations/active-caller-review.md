# Current caller review — 14 October 2026

Reviewed after migration 67. This is a source/API checkpoint, not final product
acceptance or permission to remove JSON. No schema, live account, release gate or
default backend changed in this round.

## Corrected route inventory

The earlier 195-entry inventory missed 31 legacy routes declared using constant
prefixes or finite loops. It also incorrectly left three supported endpoints
pending: the shared Google callback, the storefront (`:storeId` versus `:id`) and
administrator invitation acceptance. All three have installed replacements.

The source inventory now contains **226 legacy endpoints: 178 with replacement
route evidence, 14 explicitly retired, and 34 unmatched legacy contracts**. This
change measures the scanner's coverage, not newly implemented business features.
Each entry includes replacement source locations and frontend references. HTTP
methods remain distinct; a frontend GET is not evidence of a POST caller.

The scanner follows the replacement API and both workers' static imports (97
modules), including shared root helpers. It expands finite route loops and local
constant prefixes and normalizes parameter names. It does not execute application
code, inspect records, grant access or prove that every function is mounted.
Frontend references are source text, including inactive code; this is not a
complete call graph or proof of UI reachability. Dynamic URLs, external consumers,
method/body contracts and genuine role-specific journeys still need acceptance.

## Seven remaining entries with frontend references

| Legacy contract | Current caller review | Supported behavior to preserve |
| --- | --- | --- |
| `GET /api/verification/test-cards` | `PageUnifiedLogin` effect returns immediately in Supabase mode. | Genuine verified identity; do not port synthetic identity records. |
| `GET /api/verification/test-cards/random` | Only used by the old manager modal; `showRegModal` starts false and has no true setter. | Current manager work-email enrollment and physical inspection. |
| `POST /api/admin/manager-restrictions/:id/approve` | Its button is inside `!usesSupabasePersistence`. | Native reviewed registration bans and their saved expiry. |
| `POST /api/admin/manager-restrictions/:id/reject` | Same legacy-only cooldown branch. | Current administrator restriction read, without a one-admin waiver. |
| `PUT /api/manager-requests/:id/verify-doc` | The only button requires `activeRequest`; the document viewer sets it to `null`. | Current assigned-officer report and administrator manager decision. |
| `PUT /api/manager-verifications/:id/verify-doc` | Same unreachable document action and its legacy fallback. | Do not invent a document-status model absent from current registration. |
| `POST /api/student/add-room` | Modal starts false and has no true setter. Legacy endpoint itself refuses activation. | Verified room activation; one active allocation per primary owner. |

Evidence: `src/components/PageUnifiedLogin.tsx`, `PageAdminDashboard.tsx` and
`PageUserDashboard.tsx`; corresponding native workflows in `supabase/enrollment.ts`,
`managerRegistration.ts`, `inspections.ts`, `registrationRestrictions.ts` and
`adminStoreOverview.ts`. No unreachable modal was reopened for testing.

## Twenty-seven entries without current frontend references

These are not automatically new product requirements, nor declared retired just
because no current UI calls them. Keep them listed for final residual review;
check any external consumers before removing the legacy runtime.

| Group | Unmatched legacy contracts | Current replacement/product boundary |
| --- | --- | --- |
| Legacy identity creation and reset (7) | `GET /api/auth/check-username`; `POST /api/admin/reset-user-password`; `POST /api/auth/quick-manager-login`; `POST /api/auth/quick-merchant-login`; `POST /api/auth/quick-resident-login`; `POST /api/auth/quick-staff-login`; `POST /api/users/register` | Supabase verified signup/sign-in, credential recovery and authorized sub-account enrollment. Do not restore quick login or arbitrary role creation. |
| Legacy identity-verification engine (2) | `GET /api/verification/audit-logs`; `POST /api/verification/verify-identity` | Current genuine identity/provider verification and private native audit history. |
| Old directories (4) | `GET /api/hostel-managers`; `GET /api/managers`; `GET /api/public/registered-residents`; `GET /api/registered-residents` | Current admin account directory and authorized housing projections. Do not expose a public resident identity directory. |
| Old manager preferences (2) | `GET /api/manager/account-settings`; `PUT /api/manager/account-settings` | Current Manager Profile Settings uses the authenticated profile controls. |
| Old generic housing ratings (2) | `GET /api/ratings`; `POST /api/ratings` | No current caller. Preserve the separate active resident/staff repair and staff-review workflows; do not infer a new generic rating requirement. |
| Old governance shapes (2) | `POST /api/admin/governance/accounts/preview`; `POST /api/admin/governance/members/:id/status` | Current account proposals and `/members/:id/active`; native own-key, roster and final-approval rules remain authoritative. |
| Old housing/registration mutations (8) | `POST /api/hostel-verifications/submit`; `POST /api/hostel-verifications/validate`; `POST /api/hostels/cleanup-placeholders`; `POST /api/manager-requests`; `PUT /api/hostel-verifications/:id/flag-investigation`; `PUT /api/hostel-verifications/:id/suspend`; `PUT /api/hostels/:id`; `PUT /api/hostels/:id/reject-verification` | Current verified registration, inspection, account-policy and reviewed residence-change flows. No placeholder cleanup or unreviewed ownership/status edits are required by a current caller. |

## Verification and next work

- **23 source assertions passed** against actual current files: installed helper
  discovery, parameter-name aliases, finite loops, constant prefixes, method
  separation, generated evidence and rejection of JSON import roots.
- **22 real HTTP assertions passed** against the Supabase preview: absent OAuth
  flow rejection, unavailable storefront lookup, installed protected invitation,
  store setup and governance routes, no guest login cookie and hostile-origin
  denials. No provider exchange or domain mutation was requested.
- TypeScript and final diff whitespace checks passed. Existing schema/RLS and
  application runtime code were not modified.
- Reproduce the source checks with `node --import tsx scripts/audit-supabase-cutover.ts`
  then `node --import tsx scripts/verify-supabase-cutover-audit.ts`. Guest route checks:
  `node --import tsx scripts/verify-supabase-cutover-routes-http.ts` (Supabase preview on port 3001).
- The existing signed-in-browser verifier attached but its evaluation failed. A
  follow-up in a separate task tab received `Runtime.evaluate` protocol error
  `-32000`; only that task tab was closed. No authenticated acceptance is claimed
  from these attempts; no private credentials were extracted. The API health and
  guest route checks were successful. Recheck the browser execution context before
  assuming a sign-in or database problem.

No active missing business workflow was established from these 34 old contracts.
This is narrower than proving all current client paths work. Next run the genuine
Google/email and role-specific browser journeys listed in the continuation file,
including native authority denials and continuation/recovery. Positive payment
callback acceptance still needs a public HTTPS origin. Only then perform the
reviewed reset, fresh database/Storage backups and restore checks, default switch
and JSON removal. Express replacement remains a later separate phase.
