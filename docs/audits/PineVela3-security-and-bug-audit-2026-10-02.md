# PineVela3 security, vulnerability and bug audit

Date: 2026-10-02. Checkout: `/home/wyse/Documents/PineVela3`.

**Conclusion: this checkout is not ready for production with real user data or payments.** The most urgent issues are committed credentials, cross-account maintenance modification, cross-hostel takeover, unauthenticated inspection report submission, and unsafe marketplace orders.

This is an audit report, not a remediation patch. No application source or operational database was edited by the audit. Build outputs were generated. All mutation probes ran against synthetic data in temporary folders and an audit-only server copy; no real account, order, inspection, upload or payment was mutated. Existing uncommitted project changes were preserved.

## Coverage and evidence boundaries

The review inventoried server routes and examined authentication/authorization middleware, registration, account isolation, residence/room keys, maintenance, bookings, marketplace and order states, ratings, documents/uploads, verification, chat, notifications, persistence, front-end/server contracts, and build/dependency checks. Front-end examination focused on these flows rather than exhaustively executing every dashboard interaction. Production infrastructure, a real identity/payment provider, external storage policies, full browser accessibility, multi-worker behavior and destructive load tests were not available or exercised. No audit can guarantee that all latent defects have been found.

Evidence labels distinguish live local read-only requests, isolated request-handler probes, confirmed source behavior, and risks whose full exploit/deployment effects remain untested. In-process probes used the current server source bundled into `/tmp`, with only the listen/start invocation adapted to return an Express app; requests ran through Express middleware and route handlers using synthetic request/response objects. The source under audit was unchanged. This validates handler behavior, not reverse-proxy/TLS/socket behavior.

## Checks

- `npm audit --json`: **0 known advisories**, 377 reported dependency entries. This does not validate application access controls or business logic.
- `npm run build`: **passed**, including front-end bundle and server bundle. Existing chunk-size warning remains.
- `npm run lint`: **failed**, TS2367 at `src/components/PageDigitalMarket.tsx:3536`.
- Direct `node --import tsx --test tests/accountSecurity.test.ts`: **passed**, exit 0.
- Standard `npm run test:security`: **not completed**. Automatic elevated execution approval timed out twice; sandbox execution then failed with EPERM while creating the tsx IPC socket. This is an execution limitation, not proof that the integration assertions fail. Socket-free isolated probes were used instead.
- 36 primary isolated probe cases plus targeted staff probes completed. Results: `/tmp/pinevela-audit-probe-results.json` and `/tmp/pinevela-audit-staff-results.json`. These summaries contain synthetic outcomes, not real credentials.
- Live unauthenticated GETs confirmed public exposure and verified that `/api/users/my-registered-accounts` and `/api/digital-market/status` now return **401**. The earlier public registered-account finding should not be carried forward as an unchanged current defect.

## Finding counts

| Severity | Findings |
|---|---:|
| Critical | 4 |
| High | 25 |
| Medium | 16 |
| Low | 3 |

**48 findings total: 35 security/control findings and 13 bug/operational findings.** Some findings describe different consequences of a shared root cause; the count is not a count of independent attack chains.

## All findings

### S01 — Critical: Credentials and sessions are committed to Git

**Remediation update (2026-10-02):** Local credential/session containment is verified; historical cleanup and separately deployed instances remain pending. See [S01 implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/S01-remediation-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Current and committed data inspected; no credential values printed.

The tracked database in HEAD contains 25 password fields, 8 plaintext-password aliases, 27 token fields and 4 identity-number fields. The current file still contains 25 password fields and 23 token fields. Nine distinct committed session tokens are unchanged in the current database. Credential cleanup in current code does not remove historical exposure. A leaked bearer token can authorize requests without knowing a password; production validity of those particular tokens was not tested.

**Locations:** [data/pinevela_store.json:1](/home/wyse/Documents/PineVela3/data/pinevela_store.json:1), [.gitignore:1](/home/wyse/Documents/PineVela3/.gitignore:1), [server.ts:2403](/home/wyse/Documents/PineVela3/server.ts:2403).

**Remediation direction, not applied:** Treat committed credentials and sessions as exposed; rotate/revoke them and keep operational data outside version control. No rotation was performed.

### S02 — Critical: Any authenticated user can overwrite another maintenance issue

**Remediation status, 2026-10-02:** Fixed and verified locally for the generic PUT route. See [S02 remediation and test results](S02-remediation-2026-10-02.md). The evidence below describes the original audit state. S12's separate workflow endpoints remain open.

**Evidence:** Confirmed in isolated Express-handler probe: HTTP 200.

PUT /api/issue-reports/:id checks only that a session exists and that the record exists. It passes the entire body to Object.assign through dbUpdateIssueReport. A synthetic user changed another user’s issue owner and status. Ownership, assigned staff, sign-off flags, timestamps and audit fields are not protected by an allowlist.

**Locations:** [server.ts:11054](/home/wyse/Documents/PineVela3/server.ts:11054), [localDb.ts:272](/home/wyse/Documents/PineVela3/localDb.ts:272).

**Remediation direction, not applied:** Authorize the actor against the specific issue and allow only permitted fields for each action.

### S03 — Critical: Managers can take over and self-approve other hostels

**Remediation status, 2026-10-02:** Fixed and verified locally for the generic hostel PUT route and database updater. See [S03 remediation and test results](S03-remediation-2026-10-02.md). The evidence below describes the original audit state.

**Evidence:** Confirmed in isolated probe: HTTP 200; managerId and isApproved changed.

PUT /api/hostels/:id has a role check but no residence ownership check. It merges arbitrary request fields, including managerId, isApproved and approvalStatus. It also creates a hostel when the supplied ID does not exist. A manager can replace another hostel’s manager and bypass administrator approval.

**Locations:** [server.ts:9928](/home/wyse/Documents/PineVela3/server.ts:9928), [localDb.ts:202](/home/wyse/Documents/PineVela3/localDb.ts:202).

**Remediation direction, not applied:** Enforce residence ownership and protect approval/ownership fields with administrator-only operations.

### S04 — Critical: Inspection reports can be forged without authentication

**Remediation status, 2026-10-02:** Fixed and verified locally for report submission, with active-officer and assignment checks plus server-bound authorship. See [S04 remediation and test results](S04-remediation-2026-10-02.md). The evidence below describes the original audit state. S08 read access has since been remediated; the broader S22 session-revocation finding remains open.

**Evidence:** Confirmed in isolated probe: unauthenticated submission returned HTTP 200.

POST /api/verification-team/inspections/:id/submit-report has neither requireAuth nor officer-assignment validation. Knowing an inspection or manager-verification ID is sufficient to replace its report, change its status and produce an officer-attributed recommendation. The ID can be obtained from the public inspection lists.

**Locations:** [server.ts:8197](/home/wyse/Documents/PineVela3/server.ts:8197), [server.ts:8245](/home/wyse/Documents/PineVela3/server.ts:8245).

**Remediation direction, not applied:** Require an active officer session, verify assignment, and bind the report author to that session.

### S05 — High: Email verification is bypassable in two registration paths

**Remediation update (2026-10-02):** Production primary signup uses Supabase confirmation with persistent expiry/attempt limits. At the operator's request, generated codes are temporarily enabled only for local source-server development; resulting accounts remain email-unverified and cannot authenticate outside that mode. All 42 security tests, TypeScript and production build passed. Real inbox activation remains unverified and deferred until domain/Resend setup; an earlier fresh email was blocked by Supabase HTTP 429. Historical evidence below is retained. Details: [S05 remediation](/home/wyse/Documents/PineVela3/docs/audits/S05-remediation-2026-10-02.md).

**Evidence:** Confirmed in isolated probe: direct user registration returned 201 and isVerified=true; code-return behavior confirmed in source.

register-unified returns the verification code to the requesting browser and logs it instead of proving inbox access. /api/users/register with role=user creates an already-verified account directly, without the unified verification step. The code is generated with Math.random and pending registrations have no attempt limit or automatic expiry cleanup. This proves no ownership of the supplied email address.

**Locations:** [server.ts:1857](/home/wyse/Documents/PineVela3/server.ts:1857), [server.ts:1940](/home/wyse/Documents/PineVela3/server.ts:1940), [server.ts:1961](/home/wyse/Documents/PineVela3/server.ts:1961).

**Remediation direction, not applied:** Use actual out-of-band verification, cryptographic challenges, attempt limits, and one enforced registration policy across aliases.

### S06 — High: Manager registration bypasses the intended approval process

**Remediation update (2026-10-02):** Manager registrations create pending accounts without sessions or approved hostels. Current administrator approval is required for authenticated manager operations, including old sessions. Approval is bound to the manager ID; property approval is separate. All 42 security tests, TypeScript and production build passed, including restart persistence and sibling isolation. Historical evidence below is retained. Details: [S06 remediation](/home/wyse/Documents/PineVela3/docs/audits/S06-remediation-2026-10-02.md).

**Evidence:** Confirmed in isolated probe: primary account created an immediately approved hostel, HTTP 201.

The legacy /api/auth/register-manager route is protected by the creation middleware’s primary-account requirement, but then creates a manager and hostel with isApproved=true, approvalStatus=Approved and subscriptionPaid=true. Other manager registrations return manager sessions while verification is pending; requireAuth does not generally enforce manager verification status before manager-only actions.

**Locations:** [server.ts:960](/home/wyse/Documents/PineVela3/server.ts:960), [server.ts:1749](/home/wyse/Documents/PineVela3/server.ts:1749), [server.ts:2403](/home/wyse/Documents/PineVela3/server.ts:2403).

**Remediation direction, not applied:** Make approval a server-enforced prerequisite and remove conflicting legacy onboarding behavior.

### S07 — High: Staff accounts have a fixed fallback password

**Feature-retirement update (2026-10-02):** Resolved in the current checkout: manager-created staff require explicit credentials; fixed fallback passwords are removed. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probes: staff creation without a password returned 201; login with the source-code fallback returned 200 as staff.

POST /api/staff uses a fixed fallback password when a password is omitted. The password-creation middleware skips validation when no password field is supplied, so the fallback remains usable. Hashing that fallback does not make it secret. The probe used an administrator fixture, because manager staff creation is separately blocked by conflicting middleware.

**Locations:** [server.ts:12118](/home/wyse/Documents/PineVela3/server.ts:12118), [server.ts:12123](/home/wyse/Documents/PineVela3/server.ts:12123), [server.ts:985](/home/wyse/Documents/PineVela3/server.ts:985).

**Remediation direction, not applied:** Require a unique initial credential or secure invitation and eliminate default passwords.

### S08 — High: Verification records and the resident directory are public

**Remediation status, 2026-10-02:** Fixed and verified locally. Verification lists require administrator access, officer lists are limited to active authenticated assignees, and resident directories require administrator or residence-scoped manager access. See [S08 remediation and test results](S08-remediation-2026-10-02.md). The evidence below describes the original audit state.

**Evidence:** Confirmed by live unauthenticated GETs; only field names and counts recorded.

The admin inspection endpoint and officer my-inspections endpoint returned 200 with two records each; officer my-inspections falls back to all inspections without a valid officer. /api/hostel-verifications returned 200 with two records, including manager contact details, ownership-document references and admin notes. /api/public/registered-residents returned 200 with eight records containing names, student identifiers and room/block/residence information. Synthetic/demo provenance of some records does not eliminate the exposure when real records are added.

**Locations:** [server.ts:8019](/home/wyse/Documents/PineVela3/server.ts:8019), [server.ts:8029](/home/wyse/Documents/PineVela3/server.ts:8029), [server.ts:8920](/home/wyse/Documents/PineVela3/server.ts:8920), [server.ts:13017](/home/wyse/Documents/PineVela3/server.ts:13017).

**Remediation direction, not applied:** Separate public directory data from private records and require appropriate authorization for verification and resident information.

### S09 — High: Room activation keys leak across residences

**Remediation status, 2026-10-02:** Fixed and verified locally. Key listing/generation is residence-scoped, verification requires a primary-account session and a minimal preview, and verification/activation share persistent attempt limits. See [S09 remediation and test results](S09-remediation-2026-10-02.md). The evidence below describes the original audit state.

**Evidence:** Confirmed in isolated probes: manager with no property received all keys; staff received keys across properties.

GET /api/room-keys returns allKeys when a manager’s filtered result is empty. The staff branch generates/returns keys across all hostels without checking staff residence membership. These are activation secrets, not ordinary directory information. The public verify endpoint supplies detailed information for a guessed key and has no rate limit; key digits are cryptographically generated now, but the exposed key collection defeats that protection.

**Locations:** [server.ts:11124](/home/wyse/Documents/PineVela3/server.ts:11124), [server.ts:11411](/home/wyse/Documents/PineVela3/server.ts:11411), [localDb.ts:1009](/home/wyse/Documents/PineVela3/localDb.ts:1009).

**Remediation direction, not applied:** Scope key access to owned/assigned residences and return an empty result when no authorized keys exist.

### S10 — High: Bookings lack tenant ownership and trusted identity

**Remediation status, 2026-10-02:** Resolved by feature retirement: housing booking applications and their active APIs/models/UI integrations were removed; historical records are preserved privately in an inactive archive. See [implementation and verification report](S10-retirement-and-S12-remediation-2026-10-02.md). The evidence below describes the original audit state.

**Evidence:** Confirmed in isolated probes: foreign booking read/change returned 200; forged booking creation returned 201.

All managers can list all bookings and update a booking identified by its ID. Creation spreads req.body after server defaults, allowing a caller to override id, status and the represented student. The synthetic primary user submitted an Approved booking attributed to another user.

**Locations:** [server.ts:9956](/home/wyse/Documents/PineVela3/server.ts:9956), [server.ts:9961](/home/wyse/Documents/PineVela3/server.ts:9961), [server.ts:9978](/home/wyse/Documents/PineVela3/server.ts:9978).

**Remediation direction, not applied:** Bind booking identity/status to the session and authorize each manager against the booked property.

### S11 — High: Staff management and CV access lack tenant boundaries

**Feature-retirement update (2026-10-02):** Retired application, CV and job-offer routes were removed; active staff creation, updates, deletion and roster reads now enforce residence/account ownership. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probes: foreign staff edit, application rejection and CV retrieval returned 200.

PUT/DELETE /api/staff/:id, staff application decisions and CV endpoints use role checks without checking that the target belongs to the manager’s residence. Staff creation also accepts a supplied hostelId without verifying ownership and falls back to hostels[0] when it cannot locate a manager’s property. CV routes expose documents to any permitted manager who knows a target ID.

**Locations:** [server.ts:12063](/home/wyse/Documents/PineVela3/server.ts:12063), [server.ts:12363](/home/wyse/Documents/PineVela3/server.ts:12363), [server.ts:12374](/home/wyse/Documents/PineVela3/server.ts:12374), [server.ts:13901](/home/wyse/Documents/PineVela3/server.ts:13901), [server.ts:13924](/home/wyse/Documents/PineVela3/server.ts:13924), [server.ts:14492](/home/wyse/Documents/PineVela3/server.ts:14492).

**Remediation direction, not applied:** Use the target residence and application ownership in all employment/document authorization decisions.

### S12 — High: Maintenance workflow actions do not verify the actor’s relationship to the issue

**Remediation status, 2026-10-02:** Fixed and verified locally: all maintenance workflow actions enforce issue-specific actor authorization, allowed fields and state transitions, including exact reporting-resident sign-off. See [implementation and verification report](S10-retirement-and-S12-remediation-2026-10-02.md). The evidence below describes the original audit state.

**Evidence:** Confirmed in isolated probes: an unassigned primary user accepted a staff task and a non-owner confirmed a resident resolution, both HTTP 200.

accept-assignment and student-confirm allow actions on a guessed issue ID without checking assignedStaffId or the actual reporting resident. assign, decline/reschedule/complete and manager-close handlers similarly need record-level authorization; the reviewed workflow handlers rely primarily on role and record existence. The generic PUT vulnerability makes protected sign-off flags writable even where a workflow performs a state check.

**Locations:** [server.ts:10294](/home/wyse/Documents/PineVela3/server.ts:10294), [server.ts:10417](/home/wyse/Documents/PineVela3/server.ts:10417), [server.ts:10772](/home/wyse/Documents/PineVela3/server.ts:10772), [server.ts:10855](/home/wyse/Documents/PineVela3/server.ts:10855), [server.ts:10971](/home/wyse/Documents/PineVela3/server.ts:10971).

**Remediation direction, not applied:** Apply an explicit actor and state transition policy to every maintenance action, including resident sign-off.

### S13 — High: Orders can be created anonymously under another buyer’s identity

**Remediation update (2026-10-02):** Securing S16 PIN creation requires a primary buyer session and session-derived buyer ID/name/email. Supplied identities cannot receive another buyer’s PIN or order access. See [S16/S17 report](/home/wyse/Documents/PineVela3/docs/audits/S16-S17-remediation-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: HTTP 201 without a token using a different buyerId/email.

POST /api/digital-market/orders has no authentication middleware; buyerId, buyerEmail, buyerName and contact information come from the caller. This creates fake orders/notifications, spoofs buyers, and contaminates account-linked order history.

**Locations:** [server.ts:6627](/home/wyse/Documents/PineVela3/server.ts:6627), [server.ts:6694](/home/wyse/Documents/PineVela3/server.ts:6694).

**Remediation direction, not applied:** Require a buyer session and derive buyer identity from it.

### S14 — High: The client controls order price

**Remediation update (2026-10-02):** Fixed in the current checkout. Server catalog prices/category metadata and strict quantities are enforced, and completion checks/consumes current stock synchronously. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/S14-S15-remediation-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: a product priced at 100 was ordered at a supplied unit price of 1.

The order endpoint accepts req.body.price whenever it is numeric and non-negative, including zero. It does not resolve a selected price category against the product’s stored category list. A legitimate-looking order can therefore contain an arbitrary price.

**Locations:** [server.ts:6664](/home/wyse/Documents/PineVela3/server.ts:6664).

**Remediation direction, not applied:** Derive price and price-category metadata exclusively from the server-side product record.

### S15 — High: Negative quantities corrupt totals and inventory

**Remediation update (2026-10-02):** Fixed in the current checkout. Server catalog prices/category metadata and strict quantities are enforced, and completion checks/consumes current stock synchronously. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/S14-S15-remediation-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probes: quantity=-2 produced totalAmount=-2; completion increased stock from 2 to 4.

The stock comparison and Number(quantity) || 1 conversion accept negative quantities, fractions and problematic numeric coercions. Completion subtracts order.quantity from stock, so negative quantities add inventory. Inputs are not constrained to finite positive integers.

**Locations:** [server.ts:6639](/home/wyse/Documents/PineVela3/server.ts:6639), [server.ts:6663](/home/wyse/Documents/PineVela3/server.ts:6663), [server.ts:7057](/home/wyse/Documents/PineVela3/server.ts:7057).

**Remediation direction, not applied:** Require a finite positive integer quantity and validate stock atomically.

### S16 — High: Delivery PINs are exposed to the sellers who verify them

**Remediation update (2026-10-02):** Fixed in the current checkout: buyer-only PIN projection, six cryptographic digits, 24-hour expiry, persistent five-attempt lockout and owner-only renewal. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/S16-S17-remediation-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: seller my-orders response included otpPin.

my-orders spreads the complete order object for both buyers and sellers. The order-update response also returns the whole order. A seller can read the secret delivery PIN and complete the order without obtaining it from the buyer. PINs are four digits, generated with Math.random, and have no attempt counter or expiry. This defeats the stated buyer-inspection/PIN guarantee.

**Locations:** [server.ts:6668](/home/wyse/Documents/PineVela3/server.ts:6668), [server.ts:6746](/home/wyse/Documents/PineVela3/server.ts:6746), [server.ts:6773](/home/wyse/Documents/PineVela3/server.ts:6773), [server.ts:6931](/home/wyse/Documents/PineVela3/server.ts:6931).

**Remediation direction, not applied:** Keep PIN material out of seller responses and enforce expiry, cryptographic generation and attempt limits.

### S17 — High: Order terminal states can be reopened and completion is not stock-safe

**Remediation update (2026-10-02):** Fixed in the current single-process JSON backend: a closed actor/state policy, terminal guards before every action, 24-hour stock reservations and serialized stock consumption. Rejection, cancellation and expiry release reservations. Supabase migration still requires database transactions/row locking. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/S16-S17-remediation-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probes: a completed order was reopened to Pending Meetup and completed again.

agree-location/reject-location handlers run before completed/cancelled guards. A seller can reopen an order and complete it twice, repeating the inventory subtraction. The generic status path accepts arbitrary status strings. Stock is not reserved at order creation, and completion clamps stock to zero instead of rejecting insufficient stock, so concurrent outstanding orders can overcommit the same units. The last condition is source-confirmed, not a load-test result.

**Locations:** [server.ts:6962](/home/wyse/Documents/PineVela3/server.ts:6962), [server.ts:7002](/home/wyse/Documents/PineVela3/server.ts:7002), [server.ts:7043](/home/wyse/Documents/PineVela3/server.ts:7043), [server.ts:7057](/home/wyse/Documents/PineVela3/server.ts:7057).

**Remediation direction, not applied:** Use a closed transition graph, guard terminal states before actions, and reserve/consume stock transactionally.

### S18 — High: Marketplace ratings can be forged and overwritten anonymously

**Remediation update (2026-10-02):** Fixed in the current checkout: both review submission routes require the exact authenticated buyer of a completed order; identity fields are server-owned and only that buyer can edit. Public reputation uses purchase-verified reviews only, with legacy unverified records retained privately. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/S18-remediation-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: unauthenticated impersonated rating returned 200.

POST /api/digital-market/ratings trusts buyerEmail, buyerName, orderId, sellerEmail and storeId. It does not require a session, purchase completion or order ownership. Existing ratings can be replaced by supplying the same order or buyer/store pairing, allowing reputation manipulation and impersonation.

**Locations:** [server.ts:6782](/home/wyse/Documents/PineVela3/server.ts:6782), [server.ts:6808](/home/wyse/Documents/PineVela3/server.ts:6808).

**Remediation direction, not applied:** Bind reviews to an authenticated completed purchase and require ownership for edits.

### S19 — High: Image uploads accept active content on the application origin

**Remediation update (2026-10-02):** The current checkout validates and re-encodes raster uploads,
removes raw static serving, sanitizes legacy photo responses and supports a distinct media
origin. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/S19-remediation-2026-10-02.md).
The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: benign HTML bytes with an .html filename and image/png claim were accepted. Script execution was not attempted.

The upload endpoint trusts fileType, allows it to be omitted, does not inspect content, accepts all image/* types including SVG, and preserves arbitrary filename extensions. Files are served publicly under /uploads on the application origin. This provides a credible stored-XSS path if a user opens a malicious uploaded HTML/SVG document. The actual upload acceptance is proven; exploit execution and production headers were not tested.

**Locations:** [server.ts:9800](/home/wyse/Documents/PineVela3/server.ts:9800), [server.ts:1026](/home/wyse/Documents/PineVela3/server.ts:1026).

**Remediation direction, not applied:** Validate decoded image content and safe formats, re-encode images, and isolate untrusted uploads from the app origin.

### S20 — High: Staff chat encryption uses public defaults and a repeated IV

**Feature-retirement update (2026-10-02):** Retired: the staff/manager chat system, encryption helpers and configuration were removed. Historical stored messages have not been deleted. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in source; no real messages decrypted.

The server derives AES-256-CBC key and IV from hard-coded defaults when environment configuration is absent. One IV is reused for every message and there is no authentication tag. Anyone with database access and those defaults can decrypt stored messages; repeated IVs leak patterns and unauthenticated CBC permits ciphertext manipulation. Encryption exceptions return plaintext, silently removing encryption. This is server-side encryption, so an operator with runtime/key access can decrypt even though the admin API denies access.

**Locations:** [server.ts:15394](/home/wyse/Documents/PineVela3/server.ts:15394), [server.ts:15398](/home/wyse/Documents/PineVela3/server.ts:15398), [server.ts:15404](/home/wyse/Documents/PineVela3/server.ts:15404).

**Remediation direction, not applied:** Use enforced secret configuration and authenticated encryption with a fresh nonce per message; fail closed.

### S21 — High: Sessions have no server-enforced expiry or logout revocation

**Remediation update (2026-10-02):** Fixed in the current checkout: absolute server-enforced expiry, hashed session storage, persistent logout revocation and HttpOnly cookie browser authentication. Historical indefinite tokens require fresh login. Cookie and bearer lookups share expiry and account authorization. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/S21-remediation-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in source and route inventory.

requireAuth compares persistent bearer tokens without checking an expiry timestamp. AuthContext.logout removes three browser storage keys and never calls a server revocation endpoint; no logout route exists. Tokens are stored in localStorage and persisted raw in JSON. HttpOnly cookies are set in some flows, but the API authenticates via the JavaScript-held Authorization bearer token. A copied token can remain usable after the user logs out.

**Locations:** [server.ts:2403](/home/wyse/Documents/PineVela3/server.ts:2403), [server.ts:2031](/home/wyse/Documents/PineVela3/server.ts:2031), [src/context/AuthContext.tsx:236](/home/wyse/Documents/PineVela3/src/context/AuthContext.tsx:236), [src/context/AuthContext.tsx:265](/home/wyse/Documents/PineVela3/src/context/AuthContext.tsx:265).

**Remediation direction, not applied:** Implement expiring server-side sessions, hashed token storage and explicit revocation; reduce browser token exposure.

### S22 — High: Disabled officer and dismissed staff sessions are not consistently revoked

**Remediation update (2026-10-03):** Current officer status/session and active staff employment are enforced on authenticated requests. Status changes, staff removal and resignation clear sessions; reactivation requires fresh login. See [S22/S26 implementation and verification](S22-S26-remediation-2026-10-03.md). Historical evidence follows.

**Evidence:** Confirmed in source; no real account was disabled for testing.

The officer status endpoint changes status without clearing issued tokens. requireAuth’s officer fallback and /verification-team/me accept a matching officer token without checking active status, although officer login does check it. Staff dismissal removes roster records without revoking the matching account/session, while requireAuth still accepts the staff role. Previously issued sessions can retain access after administrative removal.

**Locations:** [server.ts:2460](/home/wyse/Documents/PineVela3/server.ts:2460), [server.ts:7818](/home/wyse/Documents/PineVela3/server.ts:7818), [server.ts:7867](/home/wyse/Documents/PineVela3/server.ts:7867), [server.ts:7904](/home/wyse/Documents/PineVela3/server.ts:7904), [server.ts:12374](/home/wyse/Documents/PineVela3/server.ts:12374).

**Remediation direction, not applied:** Revoke sessions on status changes and recheck active employment/officer status during authorization.

### S23 — High: No attempt or resource limits protect expensive/public routes

**Remediation update (2026-10-03):** Pre-body traffic/concurrency limits, shared persistent login budgets, bounded asynchronous credential/image work, daily write/upload quotas, physical photo-storage caps and bounded SSE connections are implemented. Existing challenge limits remain enforced. See [policy and verification report](/home/wyse/Documents/PineVela3/docs/audits/S23-remediation-2026-10-03.md). The evidence below records the original audit state; deployment and single-process JSON limits are documented in the report.

**Evidence:** Source-confirmed risk; no brute force, flood or destructive load test performed.

There is no application rate limiter, login lockout or challenge attempt cap. Login and password reuse paths use synchronous scrypt; body parsing permits 30 MB before authorization; JSON persistence and upload writes are synchronous; public SSE connections are unbounded. Password/PIN/key guessing and CPU/memory/disk exhaustion can affect the whole single-process app.

**Locations:** [server.ts:900](/home/wyse/Documents/PineVela3/server.ts:900), [server.ts:960](/home/wyse/Documents/PineVela3/server.ts:960), [server.ts:1036](/home/wyse/Documents/PineVela3/server.ts:1036), [accountSecurity.ts:33](/home/wyse/Documents/PineVela3/accountSecurity.ts:33), [persistentDb.ts:166](/home/wyse/Documents/PineVela3/persistentDb.ts:166).

**Remediation direction, not applied:** Use per-actor/IP limits, challenge counters, pre-auth request limits, quotas and bounded background work.

### S24 — High: The identity verification service is an ungated mock

**Evidence:** Confirmed in isolated probe: a fabricated non-Ghana passport identifier returned verified.

defaultVerificationProvider is always MockNiaVerificationProvider. Arbitrary non-Ghana passport identifiers of sufficient length pass as verified, while Ghana identity validation uses a publicly listed synthetic registry. Name and real identity ownership are not verified by a production provider. These endpoints are not restricted to development/test.

**Locations:** [verificationService.ts:121](/home/wyse/Documents/PineVela3/verificationService.ts:121), [verificationService.ts:205](/home/wyse/Documents/PineVela3/verificationService.ts:205), [verificationService.ts:223](/home/wyse/Documents/PineVela3/verificationService.ts:223), [server.ts:4099](/home/wyse/Documents/PineVela3/server.ts:4099), [server.ts:4120](/home/wyse/Documents/PineVela3/server.ts:4120).

**Remediation direction, not applied:** Gate the sandbox to non-production and require a genuine verification provider before presenting identities as verified.

### S25 — High: Payment and subscription flags are self-attested development features

**Evidence:** Confirmed in isolated probe: anonymous agreedToPay request returned paid=true. Other paths confirmed in source.

pay-onboarding-fee records paid solely from agreedToPay. Hostel submissions accept paymentStatus/paymentReference from the client. store-setup marks registrationFeePaid and setupCompleted without provider validation. subscription activates any plan as test_active without payment; there is no production-mode guard. The code explicitly identifies some of these as intentional temporary features. They are release blockers for real payment/accounting, not evidence that an implemented payment gateway was compromised.

**Locations:** [server.ts:8720](/home/wyse/Documents/PineVela3/server.ts:8720), [server.ts:8776](/home/wyse/Documents/PineVela3/server.ts:8776), [server.ts:5742](/home/wyse/Documents/PineVela3/server.ts:5742), [server.ts:6024](/home/wyse/Documents/PineVela3/server.ts:6024).

**Remediation direction, not applied:** Keep test/manual flows explicitly segregated and verify payment evidence server-side before real paid access.

### S26 — Medium: Anonymous onboarding submissions can impersonate managers

**Remediation update (2026-10-03):** Manager submissions bind identity to the session. Hostel verification requires an approved manager and an existing owned residence; author/property/validation fields are server-derived and duplicate/foreign submissions are rejected. Staff applications remain retired. See [S22/S26 implementation and verification](S22-S26-remediation-2026-10-03.md). Historical evidence follows.

**Evidence:** Confirmed in source; live mutation endpoints were not exercised.

/api/manager-requests and /api/hostel-verifications/submit do not require authentication. They accept caller-supplied manager IDs, names, emails and property/ownership metadata. The latter fills managerApproved and identityVerified with true. /staff-applications also permits guest submissions and uses supplied identity metadata. This allows spam and false attribution in administrative queues.

**Locations:** [server.ts:3067](/home/wyse/Documents/PineVela3/server.ts:3067), [server.ts:8776](/home/wyse/Documents/PineVela3/server.ts:8776), [server.ts:14257](/home/wyse/Documents/PineVela3/server.ts:14257).

**Remediation direction, not applied:** Require authenticated submission and bind identity/validation fields to server results.

### S27 — High: General chat does not enforce channel/DM participation

**Feature-retirement update (2026-10-02):** Retired: general/public chat and room DMs have no active routes, UI or database helpers. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probes: a user posted into someone else’s DM and accepted that DM request.

/api/chat/messages accepts arbitrary channelType/channelId without checking membership. The read and reaction routes also lack participation checks; DM accept uses only roomId. Current adapter bugs prevent some legitimate reads, but do not constitute authorization controls and should not be relied on to protect older roomId-shaped messages or future repaired reads.

**Locations:** [server.ts:15171](/home/wyse/Documents/PineVela3/server.ts:15171), [server.ts:15187](/home/wyse/Documents/PineVela3/server.ts:15187), [server.ts:15274](/home/wyse/Documents/PineVela3/server.ts:15274), [server.ts:15354](/home/wyse/Documents/PineVela3/server.ts:15354), [localDb.ts:656](/home/wyse/Documents/PineVela3/localDb.ts:656).

**Remediation direction, not applied:** Authorize membership on every read/write/reaction and restrict DM acceptance to the intended recipient.

### S28 — Medium: Managers can delete other managers’ meetings

**Evidence:** Confirmed in isolated probe: foreign meeting DELETE returned 200.

Meeting updates contain ownership checks, but DELETE /api/meetings/:id does not. GET meetings additionally exposes meetings without managerId to every manager. The deletion path does not use the more restrictive update policy.

**Locations:** [server.ts:14892](/home/wyse/Documents/PineVela3/server.ts:14892), [server.ts:14696](/home/wyse/Documents/PineVela3/server.ts:14696).

**Remediation direction, not applied:** Reuse the same ownership policy for list, update and delete operations.

### S29 — Medium: Notification read state can be changed for another user

**Evidence:** Confirmed in isolated probe: foreign notification update returned 200.

PUT /api/notifications/:id/read requires authentication but does not check recipient identity. dbMarkNotificationRead mutates the record directly. A caller with a notification ID can hide/unread-state suppress another user’s alert.

**Locations:** [server.ts:15093](/home/wyse/Documents/PineVela3/server.ts:15093), [localDb.ts:529](/home/wyse/Documents/PineVela3/localDb.ts:529).

**Remediation direction, not applied:** Check the authenticated recipient before updating notification state.

### S30 — Medium: Public includeAll bypasses marketplace visibility rules

**Evidence:** Live unauthenticated includeAll request returned 200 with twelve records; filtering behavior confirmed in source.

products?includeAll=true, storeId or sellerEmail requests bypass normal availability and banned-store filters. The user dashboard requests includeAll=true and then filters only availability/stock, so banned-store products can remain displayed. Even the normal catalog treats nonBannedStoreIds.size===0 as permitting products, so the all-stores-banned case fails open.

**Locations:** [server.ts:5933](/home/wyse/Documents/PineVela3/server.ts:5933), [server.ts:5988](/home/wyse/Documents/PineVela3/server.ts:5988), [server.ts:6009](/home/wyse/Documents/PineVela3/server.ts:6009), [src/components/PageUserDashboard.tsx:1300](/home/wyse/Documents/PineVela3/src/components/PageUserDashboard.tsx:1300).

**Remediation direction, not applied:** Keep public listing visibility enforced server-side and protect seller-only inventory access.

### S31 — Medium: Rating endpoints permit identity/score manipulation

**Evidence:** Confirmed in isolated probe: hostel rating score 99 and another user’s studentId were accepted.

Hostel rating creation spreads req.body after server-bound studentId/name and performs no range validation or residence ownership check. Staff review creation does not require a completed relationship or limit a score to 1–5. Resident-confirm ratings similarly accept arbitrary numeric values. Public output and aggregate ratings can become misleading or corrupted.

**Locations:** [server.ts:15105](/home/wyse/Documents/PineVela3/server.ts:15105), [server.ts:13321](/home/wyse/Documents/PineVela3/server.ts:13321), [server.ts:10855](/home/wyse/Documents/PineVela3/server.ts:10855).

**Remediation direction, not applied:** Allowlist rating input, bind identity to the session and validate eligibility, uniqueness and score bounds.

### S32 — Medium: Role authorization relies on permissive identity matching

**Evidence:** Confirmed in source; additional exploit paths not dynamically exercised.

requireAuth treats student/user/resident as equivalent and can authorize manager/staff operations using related records instead of the issued role. Staff equivalence includes pending applications and assignedStaffName matching the caller’s name. Duplicate names or inappropriate pending records can grant unintended capabilities. Endpoints that branch on the original req.user.role may then apply inconsistent policies.

**Locations:** [server.ts:2541](/home/wyse/Documents/PineVela3/server.ts:2541), [server.ts:2550](/home/wyse/Documents/PineVela3/server.ts:2550), [server.ts:2565](/home/wyse/Documents/PineVela3/server.ts:2565).

**Remediation direction, not applied:** Use explicit approved account capabilities and stable IDs, avoiding display-name and pending-record authorization.

### S33 — Medium: Application security headers are missing

**Evidence:** Confirmed by live local response headers; production proxy configuration not available.

The local server sends X-Powered-By: Express and no Content-Security-Policy, X-Content-Type-Options or X-Frame-Options. No equivalent middleware was found. This increases clickjacking and active-upload/XSS impact. HTTPS/HSTS at a production reverse proxy could not be verified, so absence of external TLS enforcement is not asserted.

**Locations:** [server.ts:897](/home/wyse/Documents/PineVela3/server.ts:897), [server.ts:1026](/home/wyse/Documents/PineVela3/server.ts:1026).

**Remediation direction, not applied:** Set an appropriate CSP, frame restrictions and MIME protections; verify transport headers in deployment.

### S34 — Medium: Public staff review output includes resident context

**Feature-retirement update (2026-10-02):** Resolved in the current checkout: public staff directory/review feeds were removed; active reviews require authenticated residence relationships. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in source; no private review bodies were printed.

/api/staff-reviews returns whole review records without authentication and accredited-staff embeds the same records. Maintenance-generated reviews include student names/emails, room/block/residence information and issue titles. A public reputation feed can therefore reveal private accommodation and maintenance context.

**Locations:** [server.ts:10883](/home/wyse/Documents/PineVela3/server.ts:10883), [server.ts:13279](/home/wyse/Documents/PineVela3/server.ts:13279), [server.ts:13299](/home/wyse/Documents/PineVela3/server.ts:13299).

**Remediation direction, not applied:** Publish a deliberately minimized review representation and keep private incident/resident fields restricted.

### S35 — Low: Unauthenticated SSE discloses operation metadata and has no connection bound

**Evidence:** Confirmed in source; no connection exhaustion test performed.

Anyone can subscribe to /api/sync/events. Successful mutations broadcast API paths and methods to all subscribers, potentially revealing resource IDs and administrative activity timing. The stream also contributes to unbounded connection use. It does not broadcast full request bodies in the reviewed implementation.

**Locations:** [server.ts:1036](/home/wyse/Documents/PineVela3/server.ts:1036), [server.ts:1060](/home/wyse/Documents/PineVela3/server.ts:1060), [server.ts:1071](/home/wyse/Documents/PineVela3/server.ts:1071).

**Remediation direction, not applied:** Restrict subscribers and minimize event metadata; cap connections and timeouts.

### B01 — High: Restart discards four persisted collections

**Evidence:** Confirmed with pre-seeded temporary database and startup snapshot.

loadPersistentStore reconstructs a fixed object and omits ratings, staffBargains, digitalMarketServiceReviews and onboardingPayments. Startup persistence then writes the reconstructed store, removing the previously saved records. Existing hostel ratings, employment negotiations, service reviews and onboarding payment records can disappear on restart.

**Locations:** [persistentDb.ts:109](/home/wyse/Documents/PineVela3/persistentDb.ts:109), [server.ts:696](/home/wyse/Documents/PineVela3/server.ts:696), [server.ts:815](/home/wyse/Documents/PineVela3/server.ts:815).

**Remediation direction, not applied:** Preserve every supported collection and add a persistence round-trip test.

### B02 — High: General chat GET does not retrieve the messages POST stores

**Feature-retirement update (2026-10-02):** Retired: the affected general-chat GET/POST implementation was removed. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probes: POST returned 201, subsequent valid-channel GET returned an empty array.

The server stores channelType/channelId and calls dbGetChatMessages(channelType, channelId, ...). The adapter treats the first argument as roomId and filters m.roomId, ignoring channelId. Newly posted chat messages are therefore not retrieved under the matching channel.

**Locations:** [server.ts:15176](/home/wyse/Documents/PineVela3/server.ts:15176), [server.ts:15202](/home/wyse/Documents/PineVela3/server.ts:15202), [localDb.ts:605](/home/wyse/Documents/PineVela3/localDb.ts:605).

**Remediation direction, not applied:** Align adapter and route schemas and test a send/read round trip.

### B03 — Medium: DM room participant schemas do not match

**Feature-retirement update (2026-10-02):** Retired: the affected room-DM implementation was removed. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: participant received an empty DM list.

DM requests create user1Id/user2Id, but dbGetDMRooms filters senderId/receiverId. Participants do not see their rooms, duplicate-room checks fail and DM notifications can miss their target.

**Locations:** [server.ts:15344](/home/wyse/Documents/PineVela3/server.ts:15344), [localDb.ts:638](/home/wyse/Documents/PineVela3/localDb.ts:638).

**Remediation direction, not applied:** Use one DM participant schema consistently.

### B04 — Medium: Chat profile updates spread nickname characters into object properties

**Feature-retirement update (2026-10-02):** Retired: chat-profile editing was removed. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: response had numeric properties and no nickname.

dbUpdateChatProfile expects an object as its second parameter, but the route passes nickname/name as a string and avatar as a separate ignored argument. Spreading that string creates character-indexed properties instead of setting nickname and avatarUrl.

**Locations:** [server.ts:15148](/home/wyse/Documents/PineVela3/server.ts:15148), [server.ts:15166](/home/wyse/Documents/PineVela3/server.ts:15166), [localDb.ts:590](/home/wyse/Documents/PineVela3/localDb.ts:590).

**Remediation direction, not applied:** Pass the profile fields as the adapter’s expected object.

### B05 — Medium: Message reactions throw and leave requests hanging

**Feature-retirement update (2026-10-02):** Retired: general-chat message reactions were removed. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: request timed out after five seconds.

Messages start with reactions={}, while dbReactToChatMessage assumes an array and calls .push. Express 4 does not automatically forward rejected async handler promises; this route lacks a try/catch or async wrapper. The process-level unhandled rejection logger does not finish the response, so the client waits rather than receiving a controlled error.

**Locations:** [server.ts:15210](/home/wyse/Documents/PineVela3/server.ts:15210), [server.ts:15274](/home/wyse/Documents/PineVela3/server.ts:15274), [localDb.ts:623](/home/wyse/Documents/PineVela3/localDb.ts:623), [server.ts:157](/home/wyse/Documents/PineVela3/server.ts:157).

**Remediation direction, not applied:** Unify the reaction schema and consistently forward async errors to the Express error handler.

### B06 — Medium: Manager staff creation is rejected by conflicting middleware

**Feature-retirement update (2026-10-02):** Resolved in the current checkout: an approved manager can create staff for their own approved residence; primary/admin/foreign-manager creation is denied. See [implementation and verification report](/home/wyse/Documents/PineVela3/docs/audits/retired-features-and-marketplace-messaging-2026-10-02.md). The evidence below records the original audit state.

**Evidence:** Confirmed in isolated probe: manager POST /api/staff returned 403 before the route.

The route permits manager/admin and the manager dashboard calls it, but account-creation middleware denies creating accounts from all subaccounts except admin on /api/staff. This contradicts the documented manager-created staff flow and prevents legitimate use.

**Locations:** [server.ts:976](/home/wyse/Documents/PineVela3/server.ts:976), [server.ts:12063](/home/wyse/Documents/PineVela3/server.ts:12063), [src/components/PageManagerDashboard.tsx:676](/home/wyse/Documents/PineVela3/src/components/PageManagerDashboard.tsx:676).

**Remediation direction, not applied:** Resolve the capability policy across middleware and route while preserving residence ownership checks.

### B07 — Medium: TypeScript check fails

**Remediation update (2026-10-02):** Fixed at the operator's request: the Fixed/Hybrid-only location input now uses `required` directly. `npm run lint` passes. The original audit evidence below is retained.

**Evidence:** Confirmed: npm run lint exited 2.

PageDigitalMarket.tsx:3536 compares servLocationMode against flexible inside a branch where the type is already fixed | hybrid. TypeScript reports TS2367. The production bundler still builds because it does not run the type checker.

**Locations:** [src/components/PageDigitalMarket.tsx:3536](/home/wyse/Documents/PineVela3/src/components/PageDigitalMarket.tsx:3536), [package.json:12](/home/wyse/Documents/PineVela3/package.json:12).

**Remediation direction, not applied:** Resolve the narrowed-type comparison and include type checking in release checks.

### B08 — Low: Duplicate route definitions leave later handlers unreachable

**Evidence:** Confirmed in source route inventory.

Manager verification approve, reject, verify-doc and suspend aliases are registered earlier, then registered again later. The earlier handlers terminate the response, so later implementations do not run. Policy changes in the later block can appear implemented while having no effect.

**Locations:** [server.ts:3172](/home/wyse/Documents/PineVela3/server.ts:3172), [server.ts:3410](/home/wyse/Documents/PineVela3/server.ts:3410), [server.ts:4031](/home/wyse/Documents/PineVela3/server.ts:4031), [server.ts:7218](/home/wyse/Documents/PineVela3/server.ts:7218), [server.ts:7437](/home/wyse/Documents/PineVela3/server.ts:7437), [server.ts:7489](/home/wyse/Documents/PineVela3/server.ts:7489), [server.ts:8403](/home/wyse/Documents/PineVela3/server.ts:8403).

**Remediation direction, not applied:** Keep a single handler per route/alias and verify route-policy coverage.

### B09 — High: Malformed database recovery can overwrite operational data with defaults

**Evidence:** Source-confirmed risk; the real database was not corrupted.

loadPersistentStore catches parse/read errors and returns defaultStore. Startup subsequently saves the active store. An unreadable or corrupted operational JSON file can therefore be replaced with default/empty data instead of failing safely and preserving the bad file for recovery. Atomic rename reduces partial-write exposure but does not address corrupt input handling.

**Locations:** [persistentDb.ts:158](/home/wyse/Documents/PineVela3/persistentDb.ts:158), [server.ts:709](/home/wyse/Documents/PineVela3/server.ts:709), [server.ts:891](/home/wyse/Documents/PineVela3/server.ts:891).

**Remediation direction, not applied:** Fail closed or quarantine corrupt data and restore from a validated backup rather than silently overwriting it.

### B10 — Medium: Whole-store synchronous persistence is unsuitable for concurrent workers

**Evidence:** Architecture risk confirmed in source; no multi-worker or load test performed.

Every save serializes and synchronously writes the full JSON database. Each process holds its own snapshot; there is no interprocess lock, transaction boundary or merge/version check. Multiple instances can overwrite each other, and large data/credential migrations block all requests in one process. Atomic rename protects file replacement, not transaction correctness.

**Locations:** [persistentDb.ts:166](/home/wyse/Documents/PineVela3/persistentDb.ts:166), [localDb.ts:10](/home/wyse/Documents/PineVela3/localDb.ts:10), [server.ts:817](/home/wyse/Documents/PineVela3/server.ts:817).

**Remediation direction, not applied:** Use transactional storage or a clearly constrained single-writer design with tested backup/recovery limits.

### B11 — Medium: Database diagnostics claim TLS security without checking it

**Evidence:** Confirmed in source.

/api/database/status returns tlsSecured:true and a secure-storage assurance regardless of transport or configuration. The server itself listens using plain HTTP on 0.0.0.0; TLS may exist at a proxy, but the diagnostic does not verify that. Operators can be shown a false assurance.

**Locations:** [server.ts:1148](/home/wyse/Documents/PineVela3/server.ts:1148), [server.ts:1165](/home/wyse/Documents/PineVela3/server.ts:1165), [server.ts:15598](/home/wyse/Documents/PineVela3/server.ts:15598).

**Remediation direction, not applied:** Report measured deployment capabilities rather than hard-coded security claims.

### B12 — Medium: User dashboard popups lack modal keyboard/focus behavior

**Evidence:** Confirmed in source; visual layering checks previously passed, but this audit did not run a fresh assistive-technology session.

DashboardOverlay portals a div above the navigation but has no dialog semantics, focus trap, background inertness, Escape handling or focus restoration. The dashboard popup implementations do not supply a shared equivalent. Visual blur does not prevent keyboard navigation to background controls. CompanyStory uses a native dialog and has separate focus logic; that distinction was preserved.

**Locations:** [src/components/DashboardOverlay.tsx:1](/home/wyse/Documents/PineVela3/src/components/DashboardOverlay.tsx:1), [src/components/PageUserDashboard.tsx:5960](/home/wyse/Documents/PineVela3/src/components/PageUserDashboard.tsx:5960), [src/components/CompanyStory.tsx:83](/home/wyse/Documents/PineVela3/src/components/CompanyStory.tsx:83).

**Remediation direction, not applied:** Add shared dialog semantics, keyboard containment and focus restoration without changing popup actions.

### B13 — Low: Large initial JavaScript bundle creates a performance risk

**Evidence:** Confirmed production build measurement; no field performance test performed.

The build emits one main JavaScript bundle of approximately 2.62 MB, about 646 KB gzip, and reports a chunk-size warning. App imports dashboard pages eagerly. Users can pay the download/parse cost for portals they do not open; lower-end mobile responsiveness should be measured before release.

**Locations:** [src/App.tsx:1](/home/wyse/Documents/PineVela3/src/App.tsx:1), [vite.config.ts:1](/home/wyse/Documents/PineVela3/vite.config.ts:1).

**Remediation direction, not applied:** Measure mobile load performance and split routes/heavy optional features where beneficial.

## Current safeguards confirmed

The code now uses cryptographically random session tokens and salted scrypt credential storage, strips passwords/session material from most API responses, rejects known legacy defaults, disables quick-login routes, and has explicit primary/subaccount and merchant ownership controls. The registered-account and market-status endpoints now require authentication. Room release/reshuffle/dispatch paths use residence ownership checks. Market order reads and merchant management have improved identity checks. Profile email changes are rejected instead of allowing unverified email replacement. These controls are meaningful but do not protect the separate vulnerable routes listed above.

No direct `dangerouslySetInnerHTML`, `eval`, or server shell-command execution sink was found in the reviewed application search. A SQL injection finding is not asserted: the active storage implementation is local JSON. A classic cookie-based CSRF flaw is not asserted either: protected routes use Authorization bearer headers rather than authenticating the issued cookie. The missing header and upload findings should be assessed on their actual data paths, not treated as proof of every XSS/CSRF variant.

## Additional release/configuration notes

Contact social URLs and the WhatsApp number in `companyStoryContent.ts` are intentionally empty per the user’s earlier instruction, so the cards are currently non-links. This is pending configuration, not an invented-account bug. Public staff UI is disabled by `publicStaffFeaturesEnabled=false`; an old staff-offer API path only permits manager/admin even though dormant user-page code calls it. The legacy additional-room modal still calls `/api/student/add-room`, which now intentionally returns 403, but no current `setShowAddRoomModal(true)` caller was found in this component. These dormant paths need cleanup/reconnection before activation, not claims that users can currently exploit them from visible buttons.

API requests and some audit/activity fields log identifying metadata. Retention, consent, access policy, backups, actual filesystem permissions and deployment logs were not assessed. A production reverse proxy may supply TLS or headers absent on the local server; its configuration was not provided. Uploaded hostel files are tracked in Git along with the database; no real upload bytes were opened during the audit.

## Suggested remediation sequence, for a later authorized task

1. Revoke exposed credentials/sessions and remove operational secrets/data from Git history and future commits.
2. Close unauthenticated writes and enforce tenant/record ownership on maintenance, hostels, bookings, staff/documents, chat and verification.
3. Make buyer identity, prices, quantities, PIN secrecy, order transitions and stock server-authoritative.
4. Enforce approval/identity/payment boundaries, safe uploads, session revocation and resource limits.
5. Repair persistence/data-loss defects and chat contracts, then resolve type checking and accessibility/release checks.

Nothing in this sequence has been implemented by this audit.
