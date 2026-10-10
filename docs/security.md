# PineVela Security

## Account approval review boundary (Supabase replacement)

The verified active administrator portal and its own current approval-key version
authorize account proposals, votes and founder final rejection. Settings/other-admin
keys, client ownership fields and stale expected-context headers confer no authority.
Private-key failure counters commit before denial. SQL requires five current keyed
administrators, immutable votes/evidence and current roster/lifecycle revisions.
Reversing lifecycle or roster changes does not revive prior consent. Administrator
targets require their separate membership protocol. Browser/backend roles cannot
write reviews or call private review helpers. Invoker lifecycle triggers can advance
the private revision under a guarded column grant; direct writes cannot forge it.

Approval, rejection and closure notifications belong to the exact reviewed active
admin portals and the Approvals module. Mutations, notices and audits are atomic.
Final policy application/deletion remains disabled, including native SQL transitions
to executed. Auth/API/RLS enforcement, inherited policies and public seller visibility
must be verified before enabling execution; deletion also needs reviewed dependencies
and database plus Storage-byte backup/cleanup. Real signed-in browser acceptance and
the elapsed 24-hour expiry journey remain verification gates.

## Administrator announcement gateway (Supabase replacement)

Directory, preview and send require a live account-bound administrator session and
active membership, rechecked inside the transaction. Client sender/owner aliases and
unsupported fields are rejected. A private, sender-bound 15-minute preview stores the
normalized group/explicit-account selection and actual active recipient portals.
Sending re-resolves current eligibility and locks recipients; changed selections need
a new preview. A completed token accepts only identical content and returns the saved
receipt, including after concurrent requests or reconnects. Notification, recipients,
completion and private audit commit together. SQL guards defend immutable delivery
snapshots, sender identity, message bodies and final fanout. These are one-way notices,
not general chat. Sending preserves the existing admin authority rule; it does not
change settings or destructive approval-key requirements.

Recipient RLS binds each inbox/popup acknowledgement to its exact current context.
Parent ownership and a shared Auth identity do not expose another portal's notification
or dismissal. The seller market filter includes received admin announcements. Popup
dismissal leaves the notification and its read state intact. Context headers check stale
requests only; the session remains the source of authority. Frontend account changes
remount gateway/popup state and ignore late responses. Provider-authenticated HTTP and
browser journeys remain acceptance checks; isolated tests send no live announcements.

## Administrator settings credentials (Supabase replacement)

Active administrator membership and a live account-bound Auth session are required.
Settings keys use salted scrypt with the administrator context and `settings` purpose;
approval keys cannot authorize settings. Enrollment is one-time and requires an actual
Auth session created within five minutes. Session refresh does not extend that window.
SQL independently enforces ownership, fresh enrollment and immutable key metadata.
Reviewed recovery now uses two other active administrators' separate approval keys.
The proposer counts once, the target cannot vote, and either key can be recovered.
Immutable consent expires after 24 hours; monotonic roster/key revisions invalidate
outstanding reviews. The second approval atomically clears only the selected key,
rotates its version, invalidates older administrator sessions, and commits audit and
exact active-administrator notices. Refresh does not produce a new Auth session.
The target must sign in again with the actual provider and enroll a replacement key.
The founder's key can be recovered without removing founder membership. Wipe workflows still await migration.

Suspension/restoration require the active founder's current approval-key grant, with
server-derived session/role checks repeated after the shared settings lock. SQL guards
protect the founder, immutable membership ownership and timestamps, and reject generic
administrator context deletion or status changes. Each transition advances a membership
session epoch; old sessions remain denied after restoration, including direct RLS and
account switching. Keys, identities and governance history are preserved. Notifications
include only active administrators, the affected admin and its primary account.

Permanent administrator removal requires founder-keyed proposal, exactly four distinct
eligible approvals excluding the target, a fresh 24-hour appeal window and a separate
founder-keyed final confirmation. Appeal text/decision reasons are in a private RLS table
with no browser/backend grants and are projected only to the founder and target.
Submitted appeals cannot expire into execution: the founder must accept or reject them.
Accepted appeals revoke authority without deleting historic votes. Roster/key revisions
invalidate unfinished reviews. SQL separately enforces proposal/vote/appeal transitions,
immutable snapshots, server deadlines, quorum and exact confirmation. Removed contexts
and memberships remain as immutable history; keys are deleted and portal access is
revoked. Auth/primary identities are preserved. Slot reuse excludes removed memberships.
All authenticated administrator transactions take the settings lock before actor row
locks to prevent a target request deadlock during context closure. Failed execution rolls
back keys, context, membership, audit and notifications together. Actual authenticated
provider HTTP/UI journeys and the elapsed 24-hour no-appeal path remain acceptance gates.

Five failed settings-key attempts lock that administrator's settings access for 15 minutes.
Denials commit before the HTTP error, so counters survive restart. Approval attempts
remain separate and have their own five-attempt, 15-minute persisted lockout. Receiving-account changes recheck the session, active membership,
key version and lockout after the real Paystack read. Browser/backend roles cannot read
key hashes or write private configuration. Destination changes retain other settings
and preserve existing immutable payment quotes; audit and administrator notifications
commit together. Paystack accounts must be active, verified, GHS and in the configured
environment. Only the last four bank-account digits are returned.

See [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) and
[Paystack subaccounts](https://paystack.com/docs/api/subaccount/). An actual fresh Google
administrator enrollment and selecting a verified non-default provider subaccount
remain acceptance checks; no Auth sessions or provider accounts are fabricated.

## Verified administrator invitations (Supabase replacement)

Only active administrator #1 with their current approval key may reserve or cancel an
invitation. The private token is shown once and stored as SHA-256, with an exact 24-hour
deadline and immutable mailbox, slot, issuer key version and existing Auth UUID binding.
An actual Google/email-verified primary session, mailbox ownership and token are all
required. Existing non-primary portals are excluded. Membership insertion independently
requires the same grant in SQL; token possession or client identity fields alone cannot
promote an account. Issuer key/status changes immediately close invitations, including
later reversals. Acceptance creates empty private credentials and commits audit/notices
atomically. It does not generate a password, Auth user or administrator key.

Private invitation redirects allow only their exact route and a valid token, rejecting
foreign origins, fragments and added parameters. Tokens remain in URL/OAuth state rather
than browser storage, are removed from the route after acceptance, and are excluded from
roster/history responses. Browser/backend roles cannot read the table or invoke its
privileged functions. Real provider sign-in and authenticated invitation UI remain gates.

## Shared pricing approvals (Supabase replacement)

Pricing proposals require three distinct active administrators' settings-key approvals.
The proposer contributes one approval; administrator #1 must make the final keyed push,
even if other administrators supplied all three votes. The server derives every actor
from the live account binding and rechecks the credential version and lockout inside
the write transaction. Failed guesses commit separately before returning a denial.

Immutable proposals expire after 24 hours. Membership, key and price revisions invalidate
outstanding proposals, including changes subsequently reversed. Final execution serializes
with other pricing/settings writes and locks the actual memberships and keys. Competing
final pushes cannot both apply the same baseline. Audit, exact active-administrator notices
and the saved execution commit with the prices; a vote alone never updates live pricing.

Browser and ordinary backend roles cannot write private settings or invoke the privileged
pricing function. The application pricing writer requires the approved-proposal protocol.
Trusted PostgreSQL-owner configuration changes remain possible and invalidate outstanding
reviews; those operator privileges are not granted to client requests. Settings-key enrollment
and receiving-account writes acquire the same settings advisory lock before credential locks.
Future key and membership lifecycle ports must preserve compatible transaction lock ordering.
See PostgreSQL [transaction locks](https://www.postgresql.org/docs/18/explicit-locking.html).
Positive provider-authenticated pricing HTTP/UI journeys remain an acceptance gate.

Keyed public-setting requests accept contact details, announcement text, boolean maintenance
state and restoration message text. They reject pricing, actor/ownership assertions and unknown fields. Social links
must use HTTPS on supported social domains without credentials or custom ports; WhatsApp
uses normalized country-code digits. Live membership, session and key version are
rechecked inside the same locked write transaction. Identical retries create no repeated
notices; changed announcements target active non-admin portals rather than administrator
accounts. The private configuration ACLs and notification recipient RLS remain unchanged.

## Platform maintenance (Supabase replacement)

Only an active administrator with their separate settings key may change maintenance state.
Ordinary actor transactions and public invitation/catalog reads hold a shared maintenance
advisory lock before session/record locks; transitions take the exclusive lock first.
Activation waits for those in-flight database transactions. Both privileged actor lifecycle
writes and backend RLS transactions then reject non-admin operations with HTTP 503.
Restrictive policies cover every current public table; existing explicit projection views
also check maintenance access. New public tables and projections must preserve this boundary.
Direct Storage reads continue to require the current bound context, which maintenance hides.

The request guard runs before upload and JSON parsing. Health/public settings, logout and
administrator authentication remain available. Password/Google binding verifies the actual
selected context before saving a session; rejected provider sessions are signed out. An
administrator cannot switch to a paused ordinary portal. Signed payment webhooks remain
available to reconcile financial evidence; they still authenticate and reverify payments.
Provider authentication callbacks already underway may confirm an Auth identity; application
portal binding still refuses non-admin access. Provider signup/delivery acceptance needs real testing.
External transfers already started cannot be rolled back with PostgreSQL. Upload failure
cleanup and provider-result recording retain their narrowly scoped system writes.

Restoration requires nonblank message text and atomically records a 24-hour notice, its
exact existing active non-admin recipient contexts, audit and active-admin notifications.
Private notice tables have RLS and no browser grants. The backend reads only the latest
eligible notice and updates only its own recipient's dismissal column. SQL stamps dismissal
and prevents resetting it, changing recipients or acknowledging expired/old notices.
No client identity or timestamp establishes eligibility. Later contexts are excluded from
the saved audience. Positive fresh provider login and authenticated UI remain acceptance gates.

## Verified payment boundary (Supabase replacement)

Checkout prices, payer email and ownership come from the verified session and saved
relationships. Actor-scoped request UUIDs preserve immutable quotes; store/residence
locks serialize fulfillment. Raw-body webhooks authenticate with Paystack HMAC-SHA512
before parsing and reverify the transaction server-side. Redirects and initialization
responses never grant access. Verified status, reference, amount, GHS currency, live
environment, payer and configured receiving account must match the saved quote.

Access, payment audit and exact account notifications commit together. If eligibility
changes after a genuine payment, retain its evidence for review without granting access.
Browser roles cannot read private provider evidence or mutate payments/access intervals.
Payment requests and provider concurrency are bounded; ambiguous checkout initialization
retains its reference for verification rather than submitting another charge.

Public callback origins must be explicitly configured HTTPS URLs; local loopback is
allowed for local checks. No wallet PIN, card authorization or server key is exposed.
Actual paid checkout/webhook delivery, refunds and reviewed payment resolution remain
release gates. See [Paystack verification](https://paystack.com/docs/payments/verify-payments/)
and [webhook authentication](https://paystack.com/docs/payments/webhooks/).

## Supabase replacement boundary

The independent migration backend verifies tokens with Supabase Auth, checks the live
Auth session and trusted account binding, and assumes a non-BYPASSRLS database role for
request transactions. Client ownership/role fields never populate this binding. Revoked
sessions fail RLS before JWT expiry. Primary-owner links do not permit signing into a
sub-account: its student/work identity must be verified and authenticated. Shared student
identities also require the selected portal's access PIN; RLS checks the accepted key
version and changing a PIN invalidates earlier proof. Failed PIN attempts are serialized
and persist before returning a denial; five failures lock that portal for 15 minutes.
Private enrollment, keys and founder provisioning remain server controlled. The running
JSON backend has not yet been replaced; see [migration status](migrations/supabase-implementation-status.md).

The replacement manager operation guard preserves separate secret-key authorization.
Only salted scrypt hashes are stored; five wrong attempts lock the key for 15 minutes.
Accepted key versions are checked again inside the mutation transaction, so reset invalidates
earlier proof. First issuance is shown once; recovery requires an administrator-reviewed
petition and the pending settings-key decision port. Narrow first-property bootstrap paths
remain exempt only when the manager has no active residence assignment.

Replacement photos use private Supabase Storage and an immutable portal/Auth-owned registry.
Uploads authenticate before the 28MB parser, decode actual raster pixels, strip metadata,
resize to 2048px and cap output at 6MB. Daily account/global quotas serialize in PostgreSQL;
IP admission and worker limits are bounded per process. Browser writes are denied. Attachment
triggers enforce account, purpose and inspection relationships. Image responses check current
publication/plan or private account access and verify digest/size, with no-store and a sandbox
CSP. Failed transfers are reconciled through Storage APIs; ready assets are never removed by
the stale-upload cleanup command. Ordinary replacement JSON bodies are 1MB. Distributed IP
limits, operational object deletion and byte backups remain launch gates. Owned avatar media
is ported in migration 35, with authenticated provider/browser acceptance still required. Maintenance
report photographs use the original resident allocation or reporting manager residence;
repair photographs use the exact accepted staff assignment and ticket. Related readers
are the reporter, assigned managers and exact active assigned staff. Parent portals and
unassigned staff receive no access. All transitions recheck saved relationships under
transaction locks; completion needs acceptance, and resident reports need original active
allocation sign-off before closure. Generic edits cannot change ownership or workflow.

Replacement order writes derive the primary buyer or exact seller from the live verified
session and saved store relationship. Client prices, emails, owner IDs, PINs and commissions
cannot assert order ownership or terms. Stock and request UUID checks serialize in PostgreSQL;
browser roles cannot write raw orders, access private history or read PIN ciphertext. Only
the exact buyer receives an active decrypted challenge. Five failed handover attempts commit
before returning denial and lock the challenge; buyer renewal has a one-minute cooldown,
rechecks current stock/plan eligibility, rotates the challenge and invalidates the previous PIN.
Wrong/missing encryption keys fail closed. Completion history never stores the submitted PIN.
The private server key is encrypted in checkpoint backups and is never a browser environment
variable. Revocation and duplicate/completion races have been tested with committed transactions
in an isolated real backup restore; authenticated provider/API/browser journeys remain gates.

Replacement chat reads and writes require the exact primary buyer or approved seller portal.
Client-supplied emails, names, sender identity and listing titles are rejected; store/buyer/item
selectors are checked against saved relationships. A seller cannot initiate unsolicited chat,
and admins and linked parent accounts have no private conversation access. Messages are
append-only in PostgreSQL, with sender-scoped idempotency and transactional recipient notices.
Reviews require the exact buyer's completed, handover-verified receipt. SQL rejects receipt
reassignment; raw browser writes are denied. Public review projections expose purchase display
names and feedback without private email, account or order IDs. Late inbox/review responses
are discarded after account changes; unchanged message retries retain their request UUID.

## Officer and Staff Lifecycle

Officer authorization requires the current active registry entry and its matching session,
including when a cached user copy contains an older token. Disabling an officer or suspending,
removing or resigning staff revokes associated sessions. Reactivation requires a new login.
Staff access additionally requires explicitly active employment in the manager's residence.

## Onboarding Submissions

Manager requests derive identity from the manager session. Hostel verification submissions
require an approved manager and an existing owned residence; record identity, property fields,
validation results and audit authorship come from server records. Duplicate outstanding or
already-approved submissions are rejected. Payment references are evidence, not confirmation.
See [S22/S26 verification](audits/S22-S26-remediation-2026-10-03.md).

## Attempt and Resource Budgets

API/upload traffic is bounded before parsing. Photo uploads require an administrator or
approved manager for housing photos, or a merchant for marketplace photos, before accepting their large JSON body. General bodies are 4MB; login,
password and simple signup bodies are 256KB; authenticated photo JSON is 28MB. Compressed
bodies and excessive nesting are rejected. Login variants share durable identity/IP budgets
(20/account identity, 30/IP per 15 minutes); successful attempts also count. Valid authenticated
reads remain available while login is throttled. Signup/PIN/room-key challenge guards remain
additional boundaries.

Request-time scrypt and image processing use bounded asynchronous pools. Writes, body bytes,
daily uploads, physical photo-directory usage and live SSE connections have separate limits.
Room generation is bounded and idempotent generation does not rewrite JSON. Login/daily
quotas persist in private `request-limits.json`; do not delete it to restart/reset limits.
Forwarded client IPs are ignored by default. Configure only actual proxy IPs/CIDRs in
`PINEVELA_TRUST_PROXY`, with ingress controls at the proxy as well.

The current JSON backend/limiter supports one server process. Preserve atomic order writes;
multiple workers require transactional PostgreSQL and shared rate/connection limits.
See [S23 policy and verification](audits/S23-remediation-2026-10-03.md) for precise budgets,
expiry behavior and deployment limits.

## Photograph Uploads

`POST /api/storage/upload-hostel-image` requires an administrator or approved manager.
It accepts only explicitly declared JPEG, PNG or WebP, strict base64, and matching raster
signatures. A full pixel decode and lossless PNG encoding strip original metadata and
appended bytes; SVG and document formats never reach the decoder. Limits are 20MB input,
25 million pixels, 16,384 pixels per dimension, 100MB output and five seconds of processing.
`POST /api/storage/upload-market-image` applies the same decoder, pre-auth size limits,
worker limits, persistent daily quotas, disk capacity and safe serving policy to active seller
uploads. Marketplace photos are resized to at most 1600 pixels per side. New extra and
price-option images must reference the publishing account's saved uploads; another seller's
upload, arbitrary URL or inline active content is rejected. Image ownership records persist
in `marketMedia` during the JSON migration period.

Generated UUID `.png` names replace all submitted filenames. Failed uploads stop property
registration rather than silently using an unvalidated preview.

`/uploads` is not a static directory. Only photograph paths are public, with decoded PNG
responses, `nosniff`, a sandbox CSP without script/same-origin permissions, and no-store.
Existing photograph paths pass the same decoding policy; unsafe historical files stay on
disk but cannot be served. Path escapes/symlinks outside the storage root are blocked.
Vite also denies direct raw-file access to upload storage in development.

Optional `PINEVELA_MEDIA_ORIGIN` must differ from `PINEVELA_PUBLIC_ORIGIN` and use HTTPS in
production. Route that media host's `/uploads/*` to this backend through the deployment
proxy. Upload responses then use the media origin, app-host image requests redirect there,
and the media hostname serves no API or application pages. App host-only authentication
cookies must not be widened to that hostname. Without a configured media origin, local
development serves only sanitized PNGs with the sandbox policy; raw originals are never
public. `PINEVELA_UPLOADS_DIR` optionally relocates storage without modifying the JSON data.

## Marketplace Purchase Reviews

Both review submission endpoints require the primary buyer's authenticated session and
an exact buyer-ID relationship to a stored `Completed & Paid` order. Bodies accept only
`orderId`, integer `rating` (1–5) and optional `review` (at most 4,000 characters).
Buyer attribution comes from the session; seller, store and item come from the order.
The service URL must match that order's item. One review belongs to one purchase; only
its buyer can edit it, without changing its identity or original creation time.

Public listings, catalog scores, seller status and order review attachments use only
purchase-verified records with consistent receipt ownership. Legacy unverified reviews
remain privately stored and do not count toward reputation. Public review responses omit
buyer email/account IDs and order IDs. Sellers can read reviews, but cannot submit or edit
on a buyer's behalf. Review writes and aggregate updates save synchronously in the current
single-process JSON backend. PostgreSQL migration needs a unique order constraint,
transactional upserts and RLS preserving the same completed-purchase/ownership policy.

## Marketplace Order Prices and Quantities

Own-store purchase/review rejection uses persisted store, application and linked merchant
relationships. Client-supplied identity is never proof of ownership. Notification recipients
for new marketplace messages, reviews and status changes are exact accounts or seller stores.

Order prices, totals and category snapshots come from the stored product, never a browser
price. Optional category selectors must identify exactly one stored category; an ID/name
pair must agree. Prices use integer pesewas for total calculations. Quantities must be
JSON numbers that are positive safe integers. Invalid catalog prices, inventory and totals
fail closed, including corrupt historical orders at completion.

Orders reserve quantity for 24 hours at creation. Active reservations reduce available
capacity; rejection, cancellation, completion and expiry release the reservation. Completion
rechecks stock against other reservations, deducts physical stock, marks the order complete
and saves synchronously, without an intervening await. Terminal orders cannot be reopened.
This provides serialized reservations and consumption in the current single-process
JSON backend; multiple server processes sharing that JSON file are unsupported. Migration
must put the stock predicate, deduction and order transition in one PostgreSQL transaction
with row locking or a conditional update, while preserving authorization and RLS.

Marketplace orders require the primary buyer's session. Buyer ID, email and name come
from that session. Seller authority uses the current seller account's exact store, not a
matching buyer or parent email. Only the assigned seller can confirm, reject or complete;
the buyer may cancel their own active order. Administrators cannot impersonate either actor.

Allowed transitions: Awaiting Seller Confirmation → Pending Meetup, Location Rejected or
Cancelled; Pending Meetup → Completed & Paid or Cancelled. Completion requires both seller
agreement and the buyer's valid PIN. Unsupported/conflicting actions and protected request
fields fail before mutation.

Delivery PINs use six cryptographic digits, expire after 24 hours and lock after five failed
attempts. Attempt counters persist synchronously, including concurrent requests and restart.
All order responses use a field allowlist; PINs appear only for the exact authenticated buyer
while active. Seller/admin responses exclude PIN material, counters and reservation internals.
Completion notes never record a submitted PIN, and private order responses cannot be cached.
Only the buyer can renew a PIN and reservation, with a one-minute renewal cooldown and a
fresh stock check. Previously exposed/unversioned PINs cannot complete orders; buyers must
renew them. Orders without a trustworthy buyer ID cannot obtain a PIN through an email alias.

## Security Boundary

The browser is untrusted.

Local sessions carry only a hashed secret and server-owned absolute expiry in persistent
account records. All token lookups, including officer checks and account-creation/list
middleware, must enforce that expiry. Cookie and bearer transport must apply identical
actor and relationship policies. Logout revokes only the presented session, persists before
success and cannot target another account through request fields. Never return session
hashes/metadata in API projections or raw credentials from session-profile endpoints.

Browser cookies are HttpOnly, SameSite=Strict and Secure in production. API fetches use
same-origin cookies; legacy browser token caches are cleared. Cookie writes must reject
foreign origins and cross-site requests. Session expiry clears stale browser identity and
queries. Browser logout confirms server revocation before navigation and clears other
open tabs through a logout event.

Never assume that:

* a hidden button prevents access
* a disabled form prevents access
* a client-provided role is correct
* a client-provided user ID is correct
* a client-provided hostel ID is authorized

All sensitive operations require server-side authorization.

---

## Authentication

Authentication establishes identity.

Authentication does not automatically establish authorization.

After authentication, the server must determine what the authenticated user is permitted to access.

---

## Authorization

Authorization should use server-side relationships.

Example:

```text
session user
    ↓
profile
    ↓
manager assignment
    ↓
hostel
```

Do not trust:

```text
request.body.managerId
request.body.hostelId
request.body.userId
```

as authorization evidence.

---

## IDOR / BOLA

Every endpoint accepting an object identifier must verify that the authenticated user is authorized to access that specific object.

Example:

```text
GET /api/hostels/:hostelId
```

must not simply check:

```text
user is authenticated
```

It must determine whether that user is authorized to access the specified hostel.

---

## Privilege Escalation

Prevent users from changing their own:

* role
* ownership
* manager assignment
* hostel assignment
* staff assignment
* payment ownership
* allocation ownership

through client-controlled fields.

---

## Cross-Hostel Isolation

A manager assigned to Hostel A must not be able to:

* read Hostel B's private management data
* create staff for Hostel B
* modify Hostel B's rooms
* modify Hostel B's allocations
* access Hostel B's private records

---

## Database Security

Supabase Row Level Security should enforce appropriate data boundaries.

Do not disable RLS simply because an application query is inconvenient.

If privileged server-side access is necessary, document why and ensure the server performs the required authorization checks first.

---

## Sensitive Credentials

Never commit:

* service-role keys
* API keys
* SMTP credentials
* payment secrets
* private signing keys
* production passwords

Use environment variables or the appropriate secret-management mechanism.

---

## Security Testing

Security-sensitive endpoints should test:

1. Unauthenticated access
2. Authenticated unauthorized user
3. Authorized user
4. Cross-user access
5. Cross-hostel access
6. Identifier spoofing
7. Role manipulation
8. Ownership manipulation

Passing the UI flow is not sufficient evidence of authorization correctness.


## Private Verification and Resident Records

Verification inspection lists and hostel verification applications are administrator-only.
An active verification officer may read only explicitly assigned inspections, using the
current server-side officer record and session. Query IDs, matching email addresses and
report authorship do not grant access.

Resident directories are private. Administrators may view assigned residents; approved
managers may view assigned residents only within their authorized residences. Primary
accounts and unallocated records are excluded, and directory responses must not include
contact emails, room activation keys or credentials. The legacy `/api/public/registered-residents`
URL is a protected alias, not a public directory. Private list responses must not be cached.


## Room Activation Keys

Room keys are activation secrets. Administrators may access residence keys; approved
managers may access keys only for their authorized residences, and active manager-created
staff may read existing keys only for their roster residence. An empty authorized result
must remain empty. Explicit ownership IDs take precedence over email and residence names.
Authorize the residence before generating keys; database reads must not generate keys.

Verification and activation require a primary-account session. Verification exposes only
the minimal room preview needed for onboarding, excluding occupant and manager contact
records. Verification and activation aliases share persistent account/IP attempt limits
and return HTTP 429 with `Retry-After` when exhausted. Private key responses must not be cached.


## Maintenance Actions

New report creation resolves the resident's active room and property on the server.
Form-supplied resident identity cannot impersonate another account; a supplied hostel ID
must match that relationship. Managers may report only within their assigned residences.

Every maintenance workflow endpoint must authorize the actor against the current issue
and enforce its state transition before mutation, audit updates or notifications. Property
ownership, active staff assignment and the exact reporting resident's active room relationship
are server-side authority. Supplied staff contacts/names and shared emails cannot grant access.
Generic detail updates cannot write workflow fields. Resident sign-off requires staff completion;
manager closure of resident reports requires that sign-off. Concurrent confirmation must not
create duplicate repair reviews. Administrator management access does not permit staff or
resident impersonation.


## Meeting and Notification Record Access

Meeting list, update and delete share one record policy. Managers access meetings for
currently assigned residences; explicit residence IDs take precedence over stored manager
names or contact emails. Direct manager-only meetings require their exact manager ID or
an unambiguous legacy manager email. Meetings without a resolvable manager or residence
are excluded from manager lists; administrators can manage them.
Active managed staff retain access to meetings for their residence or their own requests;
requesters can list their own meetings. Route role restrictions still apply to mutations.

Notification list, individual read and bulk read use the same recipient policy. Explicit
account IDs, target roles and seller store IDs take precedence over contact aliases.
Legacy staff roster IDs resolve through the current active roster/account relationship.
Email-only legacy recipients must resolve unambiguously within the specified role;
linked accounts do not inherit alerts from another role. A notification is not an
administrator-accessible private record merely because the actor is an administrator.

Read acknowledgements are persisted per `(role, account ID)` in `readBy`, including for
shared administrator alerts. API responses omit `readBy` and expose only the current
account's `read`/`isRead`. Historical global read flags are preserved. Browser read/toast
caches are scoped by account; UI read state follows successful server acknowledgement.


## JSON Storage Safety During Migration

Corrupt/unreadable existing databases fail startup; default initialization is only for a
new database with no recovery artifacts. Database/backup errors must not log record contents.
A kernel writer lease, digest fencing, structural validation and a configurable size bound
protect the single local JSON snapshot. Offline tools take the same lease. Vite must deny
the real data directory, including configured custom directories and recovery artifacts.
Backup restoration is offline, preserves the original, and revokes restored sessions and
pending challenges rather than silently reviving old credentials. PostgreSQL transactions
and recipient/ownership RLS remain required for future multi-worker deployments.

## Administrator destructive operations

System wipes require exactly five active, independently enrolled administrator approvals
bound to an immutable, expiring proposal and server-derived deletion preview. Administrator
#1 explicitly executes after quorum; single-password wipe routes are retired. Membership
changes invalidate proposals. Administrator removal needs four approvals excluding the target, followed by a 24-hour
plea window and main-administrator confirmation. Key recovery needs independent approval. Active admin
status is checked on every request, and generic resets cannot take over another admin.
Encrypted verified recovery and an external audit precede deletion; partial execution fails
closed across restart. See [setup, boundaries and recovery](admin-governance.md).


Administrator platform settings and profile changes additionally require a separate,
owner-bound settings key. Pricing changes require three to five distinct administrator
approvals and a final application by administrator #1; direct settings writes cannot bypass
this, and no vote alone changes prices. Immutable pricing proposals expire after 24 hours
and invalidate on roster/key or live-price changes. Announcement and maintenance changes
retain their single-actor settings-key policy. Every pricing vote/final push uses the
settings key rather than the wipe approval key.

Wipe keys cannot authorize settings/profile changes. Key/password attempts are
limited and lost-key resets require two other administrators. Maintenance authorization
is server-enforced for all non-admin roles and existing sessions, with administrators
retaining access to restore service. See [administrator setup](admin-governance.md).

Service discovery uses the existing public live catalogue. Seller coordinates must be finite
latitude/longitude pairs in geographic bounds; Fixed and Hybrid publication requires an
explicit seller pin. Listing updates keep authenticated ownership checks, and bookings at
the seller location derive coordinates from the stored listing, ignoring buyer overrides.
Device location is a discovery hint, not proof of identity, proximity, ownership or authority.
PineVela neither stores it nor accepts it as an authorization boundary. Browser location
can be spoofed; authenticated seller coordinates do not attest physical presence.
OpenStreetMap receives map tile requests; selected directions and waypoint coordinates
are shared with Google only when opening the external directions link. Profile pin labels
use DOM text and profile images use permitted local/public-storage URLs.


## Reviewed Residence Changes and Manager Operation Keys

Direct hostel PUT/upsert and the legacy manager-assignment editing route cannot modify
properties. Structured requests derive manager identity from the session and validate current
residence assignment; allowed fields are enforced before storing a request. New image
references must belong to that manager’s validated hostel uploads. Review receipts are
bound to the administrator, request fingerprint and a 30-minute expiry. Approval/rejection
requires the approval key; manager-key resets require the independent settings key.

Manager operation keys contain 256 bits of random entropy and are stored only as a
purpose/account-bound SHA-256 digest. Constant-time comparison and persistent five-attempt,
15-minute limits protect verification. The authenticated middleware checks every manager
mutation, including uploads, staff and room operations. Initial residence onboarding,
key issue/recovery and server popup delivery receipts are explicit lifecycle exceptions.
Keys cannot be retrieved after issuance. Reset removes the old digest; only that manager
receives the replacement. Business changes, notices and cooldown timestamps persist across
restart. Popup acknowledgement does not delete a notice or mark it read.

Approved merchants may upload account-owned branding while their store is in
`pending_setup`. Pending applicants and other roles cannot use this exception.
Public storefront visibility, listing publication and order acceptance continue
to require active paid market access; draft photos never grant those capabilities.

Residence setup in the replacement backend resolves ownership from the live manager
assignment and previously approved physical dossier. Property identity/map changes,
unowned media, active registration bans and conflicting retries are rejected. Full
submission writes hierarchy, case, notices and audit atomically. Public shell/photo
visibility and room activation cannot be enabled merely by manager-account approval.

Residence review approval rechecks the saved active manager assignment, accepted physical
report, actual room/bed layout and ready photo ownership. Case decisions are idempotent
and immutable after final approval/rejection; property rejection does not revoke its manager
identity. The private administrator residence roster is unavailable to other portal roles.

## Supabase Transport Failures

The replacement caps server SQL statements at 15 seconds and client reads at 30
seconds. Client transport errors have a sanitized listener, including while checked out.
Interrupted or timed-out transactions discard their connection and return a temporary
error. They never automatically replay writes; a lost commit response can be ambiguous,
so callers must refresh saved state before retrying. Certificate verification stays enabled.


## Supabase staff invitations

Staff invitation creation, renewal, cancellation and roster edits require the verified
manager portal, current operation key and a live assignment to the target residence.
Creation and activation also require approved residence setup. The staff signup trigger
rejects wrong/expired nonces, revoked managers and mismatched mailboxes. Public staff
invitation endpoints require the private invitation token in the request body, obey
origin checks and the authentication IP budget, and grant no access before confirmed
provider identity proof. Raw tokens appear only when issued to the authorized manager;
passwords and token secrets are never saved in enrollment fields or notifications.

Ending or suspending employment removes its saved portal bindings. Retained Auth
identities, maintenance tickets and evidence do not grant departed staff access. Contact
updates cannot change login email, ownership, role, residence or arbitrary avatar paths.
Mailbox signup/delivery and positive authenticated provider/browser journeys still need
end-to-end verification before cutover; transactional SQL checks do not prove them.

## Staff retention and private review boundary

Only the exact active staff employment may submit retention proposals or choose whether
to stay/resign after rejection. The recipient is the saved creating manager with an
active residence grant. Decisions require that manager’s verified portal and operation
key; administrators cannot substitute for the employment manager. Original proposal
terms, relationship IDs and completed decisions are immutable. Ending employment revokes
portal bindings, cancels unresolved proposals and preserves review/repair evidence.

Resident staff review authors and allocation IDs come from their verified activated portal.
Staff must be active in that same residence. Body ownership fields, foreign assignments
and non-integer/out-of-range ratings are rejected. Private views and raw-table RLS deny
other portals/residences and departed staff or residents; assigned managers retain history.
No public staff reviews or automatic maintenance-generated staff reviews are supported.

## Meeting appointment boundary

The server derives creators and recipients from verified portal relationships. Internal
contacts come from the actual active allocation/employment in the manager's residence;
body name/email/phone aliases cannot override them. External contacts have no account
access. Participant views do not expose a same-residence contact directory to staff.
Raw appointment RLS denies uninvited staff, other portals and foreign residences.

Only the saved manager with an active grant and current operation key may decide or
remove appointments. Participants can only cancel their own appointment. Approval and
rescheduling recheck the original active allocation/employment. Final decisions,
original identity/contact snapshots and history survive removal and cannot be reopened.
SQL triggers protect relationships and lifecycle independently of request validation.

## Seller registration review

Only the primary owner of the exact verified seller enrollment may submit or resubmit
its application. The saved enrollment and subject must still be eligible; profile,
owner and context relationships are rechecked under locks. Application bodies cannot
provide login credentials or override identity/ownership. Raw application writes remain
unavailable to browser roles. A scoped status view exposes only the saved owner/seller
or active administrator, and revoked administrators lose review access.

Housing managers cannot approve sellers. An active administrator decides a pending
application; rejection needs actual feedback. Rejection can be revised through a new
submission version with the earlier full record retained in private audit. Final review
cannot be silently rewritten. Registration bans are checked at submission and approval
in both SQL and the API. Approval creates an unpaid, unpublished pending store.
## Store profile authorization

The Supabase setup/edit APIs resolve the saved approved store from the authenticated
seller context and recheck the live session. Submitted store/owner IDs, student email,
payment status and plan assertions are rejected. Metadata, owned-media checks, private
audit and seller-only lifecycle notifications commit together. Browser database roles
cannot directly modify store profiles or payment/subscription records.

## Inventory authorization

The private inventory endpoint and listing mutations require the live approved seller
context and saved store relationship. Store/user/email/plan/rating assertions from a
request never establish ownership or benefits. Public catalog reads cannot become
private reads through query parameters. Listing IDs select a resource only after
the store is resolved; another active paid seller still cannot edit it.

Manual stock and gallery/price-option limits are checked server-side. SQL independently
protects immutable store/type/attachment links, required owned cover photographs,
paid publication, reserved stock and retired evidence. Retiring preserves purchase
history rather than cascading through orders. Browser roles cannot perform raw writes.
Seller reads, form drafts and upload results discard responses after account changes;
cropped covers upload through private Storage before becoming listing references.


## Personal avatar boundary (migration 35)

Profile saves reject client identity/ownership/role fields, changed credential email,
conflicting picture aliases, external URLs, inline pixels and other identities' media.
Custom pictures require an owned ready `avatar` asset and exact restrictive FK/path pairing.
The server rechecks the live portal at reservation, finalization and profile commit. An
optional expected-context header only rejects stale requests; it never supplies identity.
Administrator profile/upload writes require the current settings-key version; primary
access to the same identity cannot bypass it. Browser roles retain no direct profile/media
write grants, and the backend role retains owner RLS without BYPASSRLS.

Avatar read access is separate from catalog media and generic administrator media access.
Private helpers return only authorization booleans, verify the actual Auth subject/current
portal, use an empty search path and revoke public execution. Only the current portrait of
active staff is visible through existing authorized housing directory relationships. Owner
sharing uses exact Auth UUID equality; primary-owner links confer no personal media access.
SQL prevents removal/state retirement while a profile references the asset. Operational
account deletion must detach references and use Storage deletion, with separate encrypted
byte backups once permanent objects exist. No Storage metadata is deleted directly in SQL.
