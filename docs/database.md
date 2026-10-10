# PineVela Database Model

## Account approval reviews (migration 37)

Account review evidence/votes reuse `admin_proposals` and `admin_votes`, with five-admin
quorum, 24-hour server-stamped lifetime and immutable founder final-rejection metadata.
The target is a saved non-administrator context. Directory relationships use saved
primary ownership and current staff-manager assignments; email never supplies a link.

`private.account_review_state` holds only a monotonic lifecycle revision. Invoker
triggers advance it for context, parent, assignment and allocation changes, so a
change followed by reversal cannot revive old consent. Invalidation is conservatively
global for these lifecycle changes. Its backend SELECT/column-UPDATE grants exist only
for invoker lifecycle triggers; a nested-trigger guard denies direct revision writes.
Browser roles have no grants, and new helper functions have no public execution.
Roster/key revision and exact review snapshots are independently checked by SQL.
Reviews create no active account policy and enable no destructive execution.

## Supabase replacement status

The normalized Supabase schema and RLS have been created without importing disposable
accounts. The running backend still uses JSON while workflows are ported. Verified
resident/manager/seller identities are separate from their primary owner; resident and
seller may share their verified student identity with different portal PINs. Saved foreign
keys and private enrollment challenges establish relationships. The primary owner,
room and bed each allow only one active allocation. See the [implementation status](migrations/supabase-implementation-status.md)
and [schema design](migrations/schema-design.md). Preserve JSON and uploads until cutover
verification succeeds.

Migration 36 reuses `notifications` and `notification_recipients` for one-way admin
announcements. `admin_message_type` preserves the selected severity independently of
the recipient-scoped category. `private.admin_message_deliveries` keeps the issuing
admin, normalized selection digest, immutable sorted portal-ID snapshot/counts,
15-minute expiry and the single completed notification/content digest. The ID snapshot
is review evidence, not an authorization relationship: send resolves and locks current
account rows again. Sender/notification foreign keys preserve delivery history.
Private preview rows have RLS and no browser/backend grants. Invoker triggers enforce
the active sender, valid initial snapshot, one completion, exact saved recipients and
immutable message bodies; a retry returns the original receipt without new notices.
Unsent expired previews remain historical records; reviewed operational cleanup is
separate from delivery. No additional chat schema or retired account type is created.

`private.admin_secrets` stores independent settings-key versions, failed-attempt windows
and lockout timestamps alongside the separate approval credential. Migration 28 adds
fresh-session enrollment and immutable ownership/metadata guards without creating any
accounts. Private platform payment-destination updates lock the saved settings row,
preserve all unrelated values and leave existing `payment_checkouts` unchanged. Raw
browser/backend access to administrator secrets and private settings remains revoked.

Migration 29 uses the existing `admin_proposals` and `admin_votes` for pricing reviews.
Their saved prices, roster identities, proposer, deadline and distinct votes are immutable.
`private.admin_pricing_state` tracks monotonic roster/key and price revisions, so changing
a baseline and restoring its old value cannot revive earlier approvals. Display-name,
contact and receiving-account changes preserve pricing approvals. The final transaction
checks current membership, keys and baseline, applies only the reviewed price fields,
records execution and commits administrator notices and audit together. Existing checkout
quotes retain their original prices. Public-table RLS and private configuration ACLs remain
enforced; no accounts or operational proposal data are seeded.

Public contact details and announcements share the existing private platform configuration
row. Keyed server writes merge only those fields while holding the settings lock; audit
and exact recipient notifications commit with the update. Announcement history remains
in the existing `notifications` and `notification_recipients` tables. No additional public
table, seed record or browser write policy is introduced.

Maintenance state stays in the private platform row. Migration 30 adds private
`maintenance_recovery_notices` and `maintenance_recovery_recipients`: an actual administrator
restores service with a message, PostgreSQL records one creation time and exactly 24 hours
of visibility, and the transaction snapshots existing active non-admin account contexts.
The recipient composite key prevents duplicate delivery. Dismissal is server stamped,
account scoped and permanent for that notice. Browser roles have no table grants; the
backend can read through RLS and update only its own dismissal column. State transitions
also commit administrator settings notifications and audit. There are no seeded notices.
Restrictive public-table policies and existing projection predicates enforce maintenance;
session/role/PIN checks remain in the internal bound-context lookup.

Migration 31 reuses `admin_proposals` and `admin_votes` for independent key recovery.
`private.admin_secrets` adds an approval-key version, attempt window and server-controlled
session invalidation timestamp. `admin_proposals.recovery_roster_revision` binds each
24-hour review to the existing monotonic roster/key revision. The proposer contributes
one vote; another administrator's approval clears the selected key and completes the
proposal in one transaction. The target cannot vote. Immutable history, current roster,
credential grants and quorum are independently checked by SQL triggers. Actor binding,
context switching and browser RLS reject older administrator Auth sessions after recovery;
no Auth users or provider session timestamps are fabricated or altered by this migration.
New private functions have no browser/backend execution grants. Other governance commands
remain unavailable in the opt-in backend until ported.

Migration 32 extends the existing private `admin_invitations` table with the recipient's
reviewed name, optional exact Auth UUID, issuing approval-key version, accepted context
and cancellation reason. Open mailbox and slot uniqueness protect reservations; SQL
stamps the exact 24-hour deadline and immutable terminal history. Slots 2–5 require the
actual verified invitation protocol before membership insertion. Acceptance, empty secret
records, notices and audit commit together, while Auth accounts/passwords are unchanged.
Issuer authority changes immediately close grants; reversal does not reopen them. Browser
roles have no invitation table/function grants and the ordinary backend does not bypass RLS.

Migration 33 adds `admin_memberships.sessions_invalidated_at`. Founder approval is
required for active/suspended transitions; SQL stamps the epoch and change time.
Founder suspension, membership reassignment, direct removal and administrator context
ownership/status/deletion bypasses are denied. The private session predicate checks
this epoch and the existing credential-recovery epoch against genuine Auth sessions.
Status changes preserve credentials/history, invalidate stale governance consent and
atomically audit and notify the exact roster plus the affected primary identity.

Migration 34 adds removal roster revision/appeal deadlines and the private RLS table
`administrator_appeals`. Four immutable votes from the other eligible administrators,
a target-only appeal and founder decision/final confirmation govern removal. Appeal
text is never added to public proposal snapshots or shared notifications. SQL stamps
deadlines and guards every transition. Roster/key changes invalidate unfinished reviews.
Removed memberships and closed admin contexts preserve foreign-key history; private
keys are deleted and only live memberships occupy unique slots. Auth and primary access
remain intact. Final notices reach the exact roster and affected primary account.

## Verified payment quotes and access periods (replacement)

`payments` records the exact verified portal, saved store/residence, server-calculated
amount, currency, provider reference and fulfillment state. Private `payment_checkouts`
keeps immutable request UUID/fingerprint, payer email, quote lines, selected plan and
receiving account. Browser roles cannot read provider evidence or checkout details,
or directly write payment/subscription records.

`store_fee_periods` represents two-month access independently from `store_subscriptions`.
Verified registration creates both initial two-month periods. Separate plan and fee
receipts renew their own periods, with immutable ownership, fulfillment time and
calendar intervals. One registration receipt per store and one residence onboarding
receipt prevent duplicate fulfillment. Genuine zero-fee policies use explicit platform
evidence; no legacy payment, test account or saved client assertion is imported.

## Selected hostel deletion and administrator announcements

During JSON migration, `adminGovernance.residenceProposals` stores immutable hostel/account
choices, affected-record previews, fingerprints, distinct keyed votes and the founder's
final execution or rejection. `adminGovernance.registrationBans` stores exact account ID,
role, registration kind and expiry separately from removable hostel/manager records.
Preserve these relationships, expiry rules and server authorization when migrating to
PostgreSQL. No existing JSON storage is removed by this feature.

Gateway announcements are persisted notifications with `category: admin_gateway`, a
batch ID, sender ID and exact `targetRole`/`targetAccountId`. Existing per-account popup
acknowledgements and notification read receipts persist independently. Hostel deletion
notifications target the saved primary owner and, for hostel-only deletion, the retained
manager. Encrypted recovery archives remain private and are never served by API routes.

## Marketplace Media During Migration

The current JSON backend persists `marketMedia` records containing `imageUrl`, `accountId`
and `createdAt`. Products store up to three `additionalImages`; service `priceCategories`
contain up to four options with optional `imageUrl`. The server validates upload ownership
before accepting these references. Preserve these relationships when moving media to
Supabase Storage/PostgreSQL, with account ownership enforced by RLS and server authorization.

The replacement now uses a private `pinevela-media` Storage bucket plus `media_assets`.
Each asset records its verified portal owner, purpose, original digest/size and upload state.
Residence, store, listing and inspection attachment triggers validate ownership. Public images
are served only while their actual catalog/plan permits them; private images require the current
account relationship. Browser object writes and media-registry mutations are denied. Incomplete
transfers are reconciled through Storage APIs, preserving ready objects. Maintenance
report media records the original allocation and residence; repair evidence records its
exact ticket. Ready evidence is private and accessible only to saved related accounts.
Owned avatar uploads and profile foreign-key references are ported by migration 35.
Operational account/object deletion and permanent byte-backup restoration remain cutover gates. PostgreSQL backups include
Storage metadata; object bytes require a separate backup once any permanent objects exist.

## Marketplace Purchase Reviews During Migration

`digitalMarketRatings` contains server-owned receipt, buyer, seller, store and item fields.
Only records marked `purchaseVerifiedVersion: 1` that match their completed order contribute
to public review lists and aggregates. There is one active verified review per order, updated
only by its exact buyer. Historical unverified ratings and `digitalMarketServiceReviews`
remain private and preserved across load/save; they are not automatically promoted.

The replacement requires an actual completed order with verified handover and its exact
primary buyer. A unique `order_id` permits one editable review per purchase; SQL preserves
receipt ownership and creation time. Review changes, audit and the exact seller's notice
commit together. Public projections and catalog aggregates exclude private receipt/account
fields and unavailable stores. Historical unpublished purchases remain reviewable by their
buyer. Unchanged retries retain the review and do not send another notice.

## Marketplace Conversations (replacement backend)

`market_messages` represents only an exact primary buyer and verified seller store.
Messages are append-only. Sender-scoped request UUIDs and fingerprints serialize retries
with the store lock; saved stores, listings and orders determine participants and titles.
Only a buyer may start a new public-store inquiry. A seller may reply to an existing inquiry
or its own order. Existing conversations remain available after subscription expiry while
the seller/store remain eligible. Neither the primary owner of a seller portal nor an
administrator can read that portal's conversations through chat APIs or RLS.

Notifications carry the actual message/review foreign key and an exact account recipient.
The inbox acknowledges incoming message notices by message ID. Purchase feedback stays
separate from activated-room staff reviews and maintenance ratings. Keyed deletion workflows
must explicitly handle append-only message history; destructive cutover remains pending.

## Marketplace Reservations During Migration

The current JSON order record carries server-owned `stockReservationVersion` and
`stockReservedUntil`; active Awaiting Seller Confirmation/Pending Meetup records reserve
their positive integer quantity until that timestamp. Physical product stock is deducted
only on completion. All checks account for other active reservations. Terminal or expired
orders release reserved capacity without deleting historical records.

PIN version, expiry, issuance time and attempts also persist on the server-private order.
Only the exact authenticated buyer may retrieve an active PIN or issue a replacement.
Unversioned historical PINs require buyer renewal; ownership is never inferred from a
matching email when an exact buyer ID is absent or conflicts.

The replacement serializes creation, renewal and handover with store → listing → order
locks. A buyer-scoped request UUID and fingerprint make retries idempotent. Purchase
price, option photo, contact and location snapshots remain immutable after catalog edits.
Twenty-four-hour reservations subtract from availability; completion deducts physical stock
once and services keep nullable stock. SQL independently enforces lifecycle, capacity and
challenge/reservation consistency. Seller decline persists `rejected`; cancellation and
expiry release capacity while preserving history. Private history and notifications commit
with the transition. This records campus payment/handover, not provider charge verification.

`private.market_order_pins` holds AES-256-GCM ciphertext, nonce, key ID, version, expiry and
bounded attempts. The exact primary buyer can recover an active PIN; seller/admin projections
exclude all delivery secrets. `MARKET_ORDER_PIN_KEY_FILE` points to a private 32-byte server key
outside PostgreSQL. Keep this key when restarting or restoring; replacing it cannot decrypt
existing challenges. Database checkpoint backups include an independently authenticated
encrypted `.pvsecrets` key sidecar and refuse backups with missing/mismatched active PIN keys.
Restoration verifies this sidecar in addition to PostgreSQL privileges and data. A final
stopped-writer recovery rehearsal and permanent Storage-byte backup remain cutover gates.

## Database

Target database:

PostgreSQL through Supabase.

During migration, JSON account records may contain a private `session` object with
`tokenHash`, numeric `issuedAt` and `expiresAt`. Raw `token`, `merchantToken` and
`sessionToken` fields are removed on load and before writes. One current session per
account is retained; a fresh login replaces the previous hash. Logout/password recovery
must remove every copy of that session. Target session handling must preserve those
revocation/expiry invariants through Supabase Auth and server-side authorization/RLS.

---

## Core Identity

```text
profiles
manager_profiles
staff_profiles
```

Supabase Auth owns authentication.

Application tables store application-specific identity and relationships.

---

## Housing Hierarchy

```text
hostels
    ↓
blocks
    ↓
floors
    ↓
rooms
    ↓
beds
```

---

## Hostel

A hostel/residence contains:

* identity
* location
* address
* public contact phone in E.164 format with its selected country
* images
* managers
* fee structures

---

## Managers

A manager-hostel relationship determines which hostels a manager can manage.

Managers must not automatically gain access to every hostel.

---

## Staff

Staff belong to the appropriate hostel/manager context.

Staff creation must be restricted to authorized managers.

---

## Allocation

Conceptually:

```text
Resident
   ↓
Allocation
   ↓
Bed
   ↓
Room
   ↓
Floor
   ↓
Block
   ↓
Hostel
```

Constraints:

* resident: maximum one active allocation
* bed: maximum one active occupant

These rules should be enforced as strongly as practical at the database/application level.

---

## Applications

Applications represent a resident's housing application.

Applications must belong to the appropriate resident and housing context.

---

## Payments

Financial records should be auditable.

Payments should not simply overwrite historical financial state.

Payment records should preserve:

* amount
* currency
* payment method
* relevant references
* timestamps
* status
* associated user/application/charge

---

## Messaging

Only buyer-seller messaging remains active.

Do not create generic messaging tables for retired chat systems.

---

## Reviews

Resident-to-staff reviews are permitted only within the appropriate activated room/housing relationship.

Public staff review systems are not part of the target schema.

---

## Migration Principle

The legacy JSON database may be used as a migration/reference source.

Do not delete the JSON data until:

1. schema is verified
2. relationships are verified
3. data migration succeeds
4. critical workflows pass
5. authorization tests pass
6. rollback is possible

---

## Important

Do not invent database relationships merely because they appear convenient.

Before changing schema:

* inspect the existing application
* identify actual data relationships
* identify business invariants
* identify authorization boundaries
* identify legacy fields that contain implicit relationships


## Retired Feature Records During Migration

The transitional JSON persistence model has no active housing booking application collection.
Legacy housing applications are retained privately under `retiredFeatureRecords.housingApplications`
when old stores load and save. This archive has no API or operational workflow and must not
be exposed as a public directory or silently discarded during the Supabase migration.


## Transitional Notification Read State

Pre-entry account submission notices persist `targetRole: user` and the primary owner's
`targetAccountId`, with registration metadata where available. Historical manager, seller and
resident lifecycle notices resolve through stored parent relationships at read time without
rewriting or deleting records. Secondary read flags do not acknowledge a rerouted primary
notice; the primary account's `readBy` and popup acknowledgements remain authoritative.
Preserve this recipient/registration relationship and ownership checks in PostgreSQL/RLS.

JSON notifications may include `readBy: string[]`, storing serialized `[role, accountId]`
acknowledgements. Reads expose only the requesting account's `read` and `isRead`, not
other reader identities. Historical global flags remain compatible. Preserve per-account
read acknowledgements when migrating to PostgreSQL; shared alerts need a recipient/read
relation with a unique `(notification_id, profile_id)` key and recipient-scoped RLS.


## Collection Round-Trip Contract

Every supported array declared in `PersistentStore` must survive load/save and server
startup. Ratings, staff bargains, onboarding payments and manager profiles are explicitly
loaded alongside legacy private service reviews. Separate historical records sharing an
email are preserved in these collections; stored empty arrays remain empty. New onboarding
payments are written once through the canonical database collection, without a parallel
seeded payment list. Tests cover the declared collection contract and repeated real server
restarts. Adding a collection requires declaring it, loading it, and preserving its defaults.


## JSON Writer and Offline Recovery (B09/B10)

The transitional JSON database permits one process per data directory. Linux `flock` is
required, and the filesystem must be a supported local Linux filesystem (ext, XFS, Btrfs,
F2FS, ZFS, overlay, tmpfs or ramfs). NFS, SMB, FUSE and other unsupported filesystems are
rejected. This is not a cluster, shared network volume or multi-worker storage backend.
Use transactional PostgreSQL before scaling to multiple workers. Memory filesystems are
volatile and are suitable for isolated tests rather than durable deployment.

The writer acquires a kernel lease before reading/initializing the database, keeps it for
its in-memory snapshot lifetime, and uses the same lease for offline credential recovery.
The OS releases it on process exit/crash; the `.lock` file remains. Never delete/rotate
that inode to bypass a running writer. Writes also reject out-of-band file changes using
an expected SHA-256 content digest. Stop all writers before editing/restoring runtime data.

Existing JSON must be readable, valid UTF-8, an object with a users/hostels array, and have
valid shapes for present supported collections/settings. Missing legacy collections may
still use defaults. Present malformed fields now fail closed instead of B01's earlier
fallback behavior. An invalid/unreadable existing file blocks startup without replacing it
or its backup. A missing primary with recovery artifacts also blocks empty initialization.

`PINEVELA_JSON_MAX_BYTES` defaults to 64 MiB and accepts 1–256 MiB. Oversized reads/writes
are rejected; they are not truncated. Whole-store serialization, hashing and fsynced disk
writes remain synchronous. The size bound is a guard, not a latency/throughput guarantee.
The backend still needs PostgreSQL for large datasets and transactional multi-worker work.

Each successful replacement preserves the prior validated snapshot as
`pinevela_store.json.bak` using a private atomic, fsynced write. There is one rotating
backup, not a history archive. File and directory fsync are used; database, backup,
quarantine and temporary write artifacts are private, Git-ignored and denied by Vite's
file-serving rules. Budget disk space for primary, backup and one temporary copy (roughly
3 times the configured limit), plus one quarantine after recovery. Maintain separate
operator backups for hardware failure, long-term retention and writes bypassing this tool.

With the application stopped, from the project folder:

```bash
node --import tsx scripts/database-recovery.ts check
node --import tsx scripts/database-recovery.ts restore
```

`check` validates the backup without changing records. `restore` validates it first,
retains the existing primary bytes in `pinevela_store.json.quarantine`, replaces the
primary, and revokes all restored sessions and pending signup challenges. It refuses
invalid/oversized backups or an existing quarantine. Archive an existing quarantine
securely before another restore; do not remove it blindly. Unreadable/oversized originals
require an operator to preserve them offline before recovery. A last-good snapshot can
predate recent operations; verify account approvals, room allocation and orders after
restore. Credential recovery also refuses a missing database or a running writer.

Residence facilities, amenities and property policies are retired from registration, editing,
verification submissions and presentation. Historical JSON values remain archived in place
during migration; the application rejects attempts to create or change them. An unchanged
archived value in a full-record save is ignored, preserving existing records. No new active
PostgreSQL columns or RLS policies should be introduced for these retired sections.


## Residence Request Workflow During Migration

The transitional JSON store persists `boardRequests` with immutable manager/residence IDs,
before/after snapshots, review receipts and final decisions; historical general requests remain
read-only. `managerOperationKeys` contains only private account-bound hashes and rate limits.
`managerKeyPetitions` records recovery requests; `hostelMedia` binds validated uploads to their
manager. Notification popup acknowledgements are keyed by role and account ID, separately
from read receipts. These fields survive load/save and are never exposed as a public catalog.

A PostgreSQL migration must implement transactional approval with a baseline/version check,
a database-enforced cooldown, private key/rate-limit storage and manager-owned requests under
RLS. Only server-authorized admin decisions may write approved residence fields. Key resets
must atomically revoke the old digest. Preserve archived JSON records until that replacement
is verified; this workflow currently runs on the transitional backend.

## Merchant storefront profiles during migration

Stores persist `deliveryMode` (with the legacy `deliveryForm` alias), normalized
`phone`/`phoneCountry`, and uploaded `profilePicture`/`logoUrl` and
`coverPicture`/`bannerUrl`. Existing delivery values and branding remain readable.
New image references must belong to the authenticated merchant in `marketMedia`.
The public storefront projects only business contact/profile fields and published
listings; ratings come from verified completed purchases. Preserve these ownership
and publication boundaries when migrating stores to PostgreSQL and private Storage.

## Reviewed residence registration in the replacement backend

Manager physical verification creates an assigned property shell. The full registration form
completes that exact property instead of creating a second residence. Current category, contacts,
address, stay cycle and owned photo references persist alongside actual floor/room/bed rows.
A separate residence-registration case and `setup_submitted_at` mark submission for review.
Public cards/photos and new room activations require approved residence setup; an approved
manager identity alone is insufficient. Administrator approval/rejection/information requests now use the saved case and accepted
physical inspection, validate actual counts/photos, and notify the primary owner. Payment
fulfillment, reviewed changes/resubmission and new-property registration after deletion
remain pending migration work.

## Supabase Maintenance Workflow

Resident reports derive room and residence from their active allocation. A partial unique
index allows one unresolved resident complaint, including unconfirmed staff completion.
Manager/admin facility reports have no invented resident and can close after staff completion.
Assignment, acceptance, decline, reschedule review, completion, resident confirmation,
follow-up and closure use explicit server actions with transactional events, audit and
recipient notifications. Closed details are immutable through the API; repeated closure
is idempotent. Repair ratings require explicit resident input and stay in `repair_reviews`.
Historical completion remains valid after staff departure; departed staff loses ticket access.
Primary portals must enter the verified resident portal to report or sign off. Administrative
resolution of unfinished reports after allocation release remains a separate lifecycle gate.


## Verified staff lifecycle (replacement backend)

Migration 19 extends existing staff assignments with job role, shift and resignation
reason; it creates no parallel staff account table or public recruitment model. Staff
reservations use private account enrollments, an initiating manager and residence,
no primary-owner adoption, and a hashed, expiring nonce. The Auth initializer validates
this saved relationship before creating a pending staff portal. Activation checks the
actual confirmed subject and live Auth session again.

Assignment identity, creating manager and residence are immutable. Ended employment
cannot be reopened or edited; ending time and status must agree. Current roster reads
exclude ended assignments, while maintenance evidence keeps its original foreign keys.
Browser roles cannot mutate assignments, enrollment secrets or lifecycle status. Profile
contact edits derive the subject from the active employment, never a body identifier.

## Staff retention and resident reviews (replacement backend)

Migration 20 extends the existing staff bargain table with original employment snapshots,
resignation reasons, actual manager notes and decision times. One unresolved proposal
per assignment is enforced in SQL. Original ownership/terms and final decisions cannot
be rewritten. Employment ending cancels unresolved proposals and retains history.

Staff reviews require the reviewer’s active allocation and current same-residence staff.
Their author, allocation and rating remain immutable. The unused maintenance issue link
is removed after checking it contains no evidence; repair ratings remain separate. Read
access uses saved housing relationships and live portal bindings, with no public reviews.

## Scoped meeting appointments (replacement backend)

Migration 21 reuses `meetings` with an exact assigned manager, optional internal
participant and the original allocation/employment foreign key. Internal contact
snapshots come from actual profiles and housing relationships. External contacts are
entered details with no account binding or email-based adoption. The unused generic
staff-context link is removed only after verifying the table is empty.

Dates and time slots are explicitly Ghana time and stored as UTC instants. Decisions
follow requested → accepted/declined/cancelled and accepted → completed/cancelled.
Approval/rescheduling requires the original active participant relationship. Ownership,
original agenda, contact snapshots and final evidence cannot be rewritten. Removing
an appointment from the manager log retains its row and cancels it if still active.
Scoped views and raw-table RLS restrict participant reads to the original current
housing relationship; the assigned manager retains history while authorized.

## Verified seller applications (replacement backend)

Migration 22 links each seller application to its saved verified enrollment. School ID,
campus, category and proposed store name are actual submitted fields. Review requires
an active administrator and preserves submission ownership/evidence. Rejection keeps
the pending seller identity available for a versioned resubmission; prior submissions
and decisions are retained in private audit history. SQL and API checks enforce
registration bans at both submission and approval.

Approval creates a pending store for the exact seller/primary relationship and permits
the separate seller login. It does not mark setup or payment complete or publish the
store. Primary users can read their saved registration through a scoped view; other
portals cannot inherit it through email equality. No application holds a login password.
## Seller store setup

Store creation requires its approved saved seller application and immutable seller,
primary-owner and school links. Seller-entered physical location, handle, contact
country and delivery method are separate from the application campus. Completed setup
requires actual profile fields and an international contact number; its original time
cannot be erased or rewritten. Activation and public visibility additionally require
saved live fulfilled activation payment and a current active subscription. Profile
setup never creates a payment or receipt.

Raw store rows are restricted to the exact seller or active administrator through RLS.
Buyers use the safe public store projection, which omits identity/ownership UUIDs.
Default branding is limited to the four bundled covers and standard logo. Custom
branding requires a current paid plan and a ready private asset owned by the exact
seller context; expired subscriptions cannot expose custom branding publicly.

## Private seller inventory

Inventory reads resolve the approved store through its saved seller context. Public
catalog queries, email parameters and primary-owner sessions cannot enumerate private
drafts. Listings retain immutable store/type/creation links. Products use real integer
stock; manual creation and stock edits require at least one unit, while order depletion
may reach zero. Services have nullable stock, actual availability, schedules, contact,
location mode and up to four named price options. Fixed/Hybrid services require an
entered location and valid pin; Flexible services publish no invented pin.

Listing writes lock the store before its listing, count all current listings including
paused drafts against the current subscription limits, and protect live reservations.
Ready owned photographs attach in order with a required cover at publication commit.
Attachment identities cannot move between listings. Removal marks a listing retired
and unpublished, preserving order references and evidence; active reservations block
removal. Audit and exact seller notifications commit with the inventory change.


## Owned personal profiles and avatars (migration 35)

`PUT`/`POST /api/auth/profile` derive the profile from the verified Auth subject. Editable
fields are display name, contact phone and one canonical avatar; unchanged credential email
is accepted for the existing resident form, but email/ownership/roles cannot be changed.
Pictures use the ten supported PineVela presets or an owned ready `avatar` media asset.
`profiles.avatar_asset_id` is a restrictive foreign key paired with its exact API path.
Inline data and external URLs cannot be stored as profile pictures.

JPEG/PNG/WebP uploads of at most 5MB are re-encoded as PNG at up to 512px through
`/api/storage/upload-profile-image`; administrators retain their existing
`/api/storage/upload-admin-profile` alias. The existing private bucket, reservations,
quota/integrity checks and interrupted-transfer cleanup apply. An active administrator's
identity requires its admin portal and current settings key even when a primary portal
shares the identity. SQL guards enforce this independently of frontend controls.

Same-email portals using one Auth identity share that identity's picture. Separate verified
work/student identities and their linked primary owners do not inherit each other's media.
Private owner RLS additionally permits only the current portrait of active staff through the
existing authorized housing directory relationship. Ending employment removes that access.
Public catalog image rules do not publish avatars. Referenced assets cannot be retired or
deleted; reset/deletion workflows must detach the profile first and delete bytes through the
Storage API. Replacement pictures do not automatically delete prior ready objects; reviewed
object cleanup and permanent object-byte backups remain cutover work.
