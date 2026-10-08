# PineVela Security

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
