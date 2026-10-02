# S06 remediation — 2026-10-02

Status: implemented and verified locally. Restart running application servers to load these changes. This report covers manager onboarding and approval enforcement; it does not close unrelated audit findings.

## Change

The legacy `POST /api/auth/register-manager` and `POST /api/users/register` manager alias now share the dedicated manager-account registration handler. They create a pending manager and pending dossiers, without a session or an automatically approved hostel. Browser-provided verification, approval and payment flags cannot grant access. The document-submission flow also creates pending accounts without sessions, binds the primary owner to the authenticated account, and preserves the existing manager ID on authorized resubmission. A manager can submit documents only for its own identity.

Manager login checks approval before saving a session. `requireAuth` rechecks current manager approval on every authenticated request, including routes that call it without a role list. Old pending-manager tokens cannot perform management operations. They can access only the narrowly specified own-onboarding endpoints. Pending, rejected, blocked and suspended records override stale profile verification flags. Administrator blocking removes management access immediately and after restart.

Approval belongs to the actual canonical manager ID. Parent identities, shared names and sibling accounts cannot borrow it. Explicit record IDs override email; email matching is limited to unambiguous legacy dossiers. Managers with no dossier must have explicit canonical `isVerified=true` and `verificationStatus=approved`; default flags and hardcoded special addresses do not qualify. Existing explicit historical approvals are preserved rather than automatically rewriting operational data.

The active administrator approval handler updates only the selected manager's associated records and matching parent-account metadata. It leaves the parent role and sibling managers unchanged. Approving a manager account no longer automatically approves or reassigns a hostel. Manager registration-list reads construct display copies without mutating authoritative approval records.

An approved manager's property registration assigns its authenticated manager ID and writes pending approval and unpaid subscription fields before the first database save. Existing property IDs cannot be overwritten through registration. Its compliance record starts with payment pending; the handler no longer invents a paid receipt, ownership document or successful validation checks. Hostel approval remains a separate administrator action. Other payment endpoints and payment-provider verification are outside S06.

Files: `managerApprovalSecurity.ts`, the manager registration/login/authentication/approval and property-registration handlers in `server.ts`, the create-only atomic registration function in `localDb.ts`, the two `tests/managerApprovalSecurity*` files and the security-test command in `package.json`. Existing security test managers now explicitly declare their approved fixture state.

## Verification

Tests use the real HTTP server and persistence with disposable isolated records and databases, removed afterward. No operational manager, hostel or credential was changed by these tests.

| Check | Result |
|---|---|
| All four manager account/document registration paths without authentication | HTTP 401 |
| Primary-account registration with forged approval, verification, payment and parent fields | HTTP 201, pending; no session or hostel created; actual primary owner retained |
| Pending-manager login | HTTP 403; no session saved |
| Existing token with pending dossier and stale verified profile | Management and property operations return HTTP 403 |
| Primary account attempts manager property registration | HTTP 403 |
| Pending manager's registration-list read | Only its own stable manager-ID records returned |
| Own primary submits additional manager documents | Same manager ID retained; account stays pending without a token |
| Approval without a session or by a primary account | HTTP 401 / 403 |
| Administrator approves selected manager | Login and authorized management operations succeed |
| Sibling manager, primary role and unrelated same-name hostel | Remain unchanged; sibling login still denied |
| Manager submits another property's ID through registration | HTTP 409; existing property untouched |
| Approved manager forges property ownership/approval/payment flags | Actual manager assigned; property pending and unpaid; compliance records not marked paid |
| Approval and pending denials after restart | Persist correctly |
| Administrator blocks a manager with a retained session | Management denied immediately and after restart |
| Security regressions | `npm run test:security`: 42 passed, 0 failed |
| TypeScript | `npm run lint`: passed; previously reported market TS2367 also fixed |
| Production build | `npm run build`: passed; existing bundle-size warning |
| Private-data guard | Passed; runtime data and local secrets remain untracked |

No commit, push or deployment was performed. Production behavior depends on loading the patched server; test results do not certify every remaining audit finding.
