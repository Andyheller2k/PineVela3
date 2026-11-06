# PineVela Database Model

## Legal evidence registry — 28 October 2026

Migration `20261028120000_versioned_terms_acceptance.sql` adds
`private.legal_documents` and `private.legal_acceptances`. Documents retain an
immutable key/version/article/hash. Receipts reference that registry and the
verified Auth subject, context and session, with a database timestamp and
server-selected source/purpose. Merchant receipts additionally identify the
application submission. The uniqueness constraint makes retries idempotent.

Both tables enable RLS without browser policies/grants; only the privileged
server path accesses them after checking the live actor. No consent backfill is
performed. Auth-subject deletion cascades receipts; context deletion preserves
the receipt with a null context. Retention beyond current account lifecycle
still needs an owner-approved schedule. The app server requires the new project
migration ledger entry before startup. Supabase MCP also records its own
deployment timestamp separately from the project's immutable migration version.

## Message encryption and reports — 17 October 2026

Migrations 71–73 add private, RLS-protected encryption identities and five report
tables, plus ciphertext fields on existing buyer–seller messages. New sends must
contain a signed participant-bound ciphertext envelope and an empty plaintext
body. Historical plaintext is retained and labeled. Private identities and
message history are immutable; browser roles receive no direct access to key
backups or report records. Selected-message evidence uses exact UTF-8 bytes so
authenticated text, including NUL, is retained without alteration.

Report recommendations and keyed administrator decisions preserve the existing
account-governance boundary. They do not apply sanctions or delete records.
Report/key/message foreign keys and retention triggers are explicit dependencies
for future reviewed deletion work. See [encryption](marketplace-encryption.md)
and [content reports](content-reports.md) for access, recovery and limitations.

## Runtime checkpoint — 16 October 2026

Supabase PostgreSQL/Storage and Supabase Auth are the sole runtime persistence and
identity services. Default `dev`, `build` and `start` use `supabase-server.ts`.
Forty legacy JSON/custom-session modules are removed. The owner classified all
legacy records as development data; 29 data/upload files and the old build were
privately archived with verified hashes. No legacy records were imported. The
hosted checkpoint retained exactly seven Auth subjects, six profiles and ten
contexts, with unchanged UUID-set fingerprints.

See [isolated workflow acceptance](migrations/isolated-workflow-acceptance.md) for
the actual HTTP/browser coverage and remaining acceptance scope. Automated checks
do not establish a physical property visit or every nested form/provider journey.
Dated migration/checkpoint descriptions below are historical evidence, not an
instruction to restore retired runtime paths.

Migration 69 updates only the existing private Auth initializer: a pending, server-
reserved Google manager subject receives no app profile/context until the owned,
provider-verified callback supplies its private nonce. Existing identity, enrollment,
context and inspection relationships are reused; no new table, browser grant or RLS
policy is added. See [Google manager enrollment](migrations/google-manager-development-enrollment.md).

Migration 68 removes the unused GhanaPost column from residences. Identity uses
the saved street address and verified map pin; inspection/setup retains its existing
ownership and approval checks. Historical dossier JSON, migrations and backups are
preserved. No grants or RLS policies change. See
[street and map registration](migrations/street-and-map-registration.md).

Migration 67 adds one private RLS handoff table for immutable wipe requests. Native
guards bind final-consent, preparation/proposal, administrator, notice and receipt
foreign keys; subject/session UUID history is revalidated against native authority
without retaining an ephemeral-session foreign key. Request and receipt finish
atomically. No product records are imported from JSON. See
[worker operation](operations/system-wipe-worker.md).

Migration 66 extends the private wipe execution ledger and adds receipt-linked
withdrawal markers. No application table or broader grant is added. Original
inspection/repair evidence and financial history remain; exact native effects
close operational access. See [operational closure](migrations/operational-wipe-core.md).

Migration 65 adds no application table. Its invoker dependency predicate and
review/pause updates use existing saved relationships. Room delivery history and
immutable notice/recipient digests remain separate from lifecycle cancellation
targets. Full private enrollment rows become SHA-256 digests, not exposed fields.
See [the wipe protocol](migrations/system-wipe.md).

## Officer invitations and room-key delivery

The officer invitation protocol extends `private.account_enrollments`, preserving
immutable verified identity receipts without adding another onboarding table.
`private.room_key_deliveries` records atomic recipient notification deliveries.
Housing UUIDs are validated historical snapshots without physical-housing foreign
keys, so reviewed teardown preserves receipts. RLS/private grants, current
manager/recipient authorization and lifecycle/queued-media guards remain intact.
See [protocol and boundaries](migrations/officer-invitations-and-room-delivery.md).

## System wipe backup preparation

Migration 59 adds RLS-protected private `system_wipe_preparations` and
`system_wipe_recovery_evidence`, with no browser/scoped-backend grants or public
RPC. Preparation requires all five own-key votes, current final founder backup
consent and another keyed founder confirmation. Cancellation invalidates consent
and retains immutable history. Operator-only evidence binds actual restored
PostgreSQL, recovered private keys and encrypted Storage bytes to that exact
preparation. Status excludes private archive bindings. These snapshots neither
freeze writers nor authorize execution; normal wipes retain verified logins and
account history. See [system wipe protocol](migrations/system-wipe.md).

## Annual room-key cycles

Migration 57 adds only `private.residence_room_key_cycles` and a nullable `cycle_id`
reference on existing private keys. The RLS-enabled receipt table has no browser/backend
role grants or public RPC. Insert guards check native actor, current own manager/approval
key version, approved reviewed residence, exact room/occupant counts, increasing academic
year and explicit transaction consent. A deferred constraint prevents commit unless every
room has one new unclaimed cycle key and no active allocation. Receipts cannot be edited,
deleted or truncated; key-to-cycle associations are immutable and residence-scoped.

The receipt stores the historical residence UUID/name without a live residence foreign
key, so reviewed physical residence deletion can retain the receipt after removing housing.
Actor context references and key-to-receipt foreign keys remain. Existing reviewed backup
freeze guards protect new receipts. No cascade or new deletion exemption is introduced.
Annual writes use the existing exclusive housing lifecycle lock before actor/room locks;
claims, sign-ins, policies and reviewed deletion cannot cross the atomic operation. All
replacement codes are generated before occupancy writes. SQL failures roll back notices,
closures, allocations, key revocation and the receipt together. Individual release and
subsequent key generation inherit the latest cycle where applicable.

## Retained manager re-enrollment

Migration 56 adds `manager_generation` to private enrollments and verification cases,
using one open case per applicant/kind/generation. A private insert guard derives the
case generation from the original owner's verified pending enrollment; it is immutable
thereafter. Historical cases retain their original states and rows. Inspection mutations
require the current generation and a live residence.

Closed-manager revival is guarded independently of application code: it requires the
original primary actor, saved enrollment, confirmed work subject and genuine native proof
session, no live housing/staff dependencies, no competing manager enrollment, and no live
registration restriction or unfinished/frozen closure review. Revival grants pending
status only. It resolves final closure requests without altering their saved review
receipts, clears obsolete manager bindings/key hashes and writes one primary notice and
audit receipt. Exclusive existing lifecycle locks serialize confirmation/retries. Auth,
old housing, policies, cooldowns, Storage and inspection history are retained. No public
RPC, browser grant or new product table is added.

## Unassigned manager portal closure

Migration 55 extends the existing private request table and five-member account
review; it adds no product table, browser grant or Data API projection. Portal-only
review snapshots the exact own-key request, current manager-key version and retained
registration restrictions. Eligibility requires an active manager, an issued key
and no assignment, active staff or live property registration. Existing lifecycle
events, exact preview comparison, roster/key checks and five-vote quorum remain.

The founder’s final confirmation takes the existing exclusive housing/account-policy
locks before actor locks. A private execution trigger rechecks the exact linked request,
quorum, founder and dependencies, closes only the manager context, revokes its app
bindings and writes one audit receipt. Policy application is skipped for this action;
Auth, policy/cooldown/history, housing and Storage records are retained. Existing
ban/restrict/restore behavior and reviewed residence deletion remain separate.

## Resident self-release

The existing allocation/context/key tables represent immediate resident closure; no new
migration or imported records are needed. An authenticated resident's saved allocation,
claimed current key and portal-key version form the server-generated preview digest.
Within the existing exclusive housing lifecycle transaction, the backend rechecks native
identity/session, confirms the PIN or five-minute sign-in age and records owner/manager
notices and audit before ending the allocation/context. Notices appear only at commit.
Failed PIN guesses commit without changing housing records. Closure retains the identity,
history and sibling portals, deletes only resident app bindings and rotates only that room
key. It never returns the replacement key to the former resident. Existing assigned-manager
release uses the same atomic state changes. Sign-in binding creation takes shared lifecycle
locks before session/context checks, preventing re-entry during a concurrent closure.

## Private read projections

Migration 54 moves the 14 reviewed catalog/account views from `public` to the
unexposed `private` schema. It retains their column shapes, explicit publication
and native-session/ownership filters, and security barriers. Every projection also
checks maintenance access. `anon` and `authenticated` have no grants on these views;
the browser cannot query them through the Data API. Express routes keep their
existing response contracts and read the moved views instead.

The new non-login, non-inheriting, non-BYPASSRLS `pinevela_catalog` role reads only
the six safe public catalogs and invokes four boolean publication helpers. It has
no base-table or operational-view access. Existing `pinevela_backend` reads the
account projections after binding and verifying the actual native session.
`media_asset_is_public` references the moved catalogs; its permissions stay unchanged.
Three legacy trigger functions lose direct PUBLIC execution, while their triggers
continue to run. Base-table grants, foreign keys, RLS policies and product rows do
not change. Restores recreate the catalog role and its server membership explicitly;
historical pre-54 checkpoints keep their older catalog-grant check.
## Manager closure requests

Migration 53 adds `private.manager_closure_requests`, referencing the exact manager
account context and, after review, its independent residence-deletion proposal.
Reason, waiver preference and creation identity are immutable; one pending/reviewing
request is allowed per manager. Native guards enforce own assigned-manager submission,
own withdrawal and current administrator approval-key decisions. Requests, proposals,
votes, notifications and audit commit atomically when linked. A rejected, expired or
invalidated unfrozen proposal can resolve its request while preserving the old link.
RLS and revoked browser/scoped-backend grants protect this retained history; deletion
and truncation are denied. Requests carry no raw keys and grant no deletion authority.

## Reviewed residence changes

Migration 52 adds a separate public manager contact name on the residence, without
renaming its verified login profile. Existing `residence_change_requests` store
immutable before/after snapshots and their baseline digest. Native guards require
the assigned manager's current operation-key grant, serialize submissions and
enforce one request per 30 days using database time. Terminal decisions require
the current administrator approval-key grant and preserve the recorded decision.
Browser/scoped backend roles retain read RLS and cannot write these records directly.
No accounts, legacy requests or new application tables are imported.

Review proofs expire after 30 minutes and are bound to the actual administrator,
native session, immutable diff and current approval-key version. Their signing
key is derived with a dedicated HKDF purpose from that administrator's private
random approval-key verifier. The verifier stays server-side; a proof grants no
decision authority by itself. It survives restart using existing private state,
and key rotation invalidates it without another secret or persistence table.

Approval rechecks the saved baseline, active manager assignment, owned ready
photographs and block dependencies. Only empty unreferenced blocks may be removed;
renames preserve floors, rooms, beds and staff relationships. Unrequested contact
details are preserved. State changes commit with audit records and notices to
the manager, primary owner and actual active administrators. General request
editing remains retired.

## Account appearance

Migration 51 stores account preferences in `private.account_appearance`, keyed
by the existing account context with a cascading foreign key. Portals sharing one
verified Auth identity retain independent preferences. The verified backend session
binding supplies the context; RLS restricts SELECT/INSERT/UPDATE to that context.
Browser roles have no table grants, and the backend cannot update ownership.
The System-mode migration extends only the existing CHECK to accept
`light`, `dark` and `system`, preserving rows, grants and RLS policies. Identical
saves preserve the timestamp. A new portal returns `theme: null` until
its first save; no legacy appearance data or accounts are imported.

## Reviewed deletion requests

Migration 50 adds immutable private `residence_execution_requests`, uniquely
bound to a current final authorization and its exact founder/session/key version.
PostgreSQL sets request identity and dates; the lifetime never extends consent.
Requests contain no passwords or raw keys. Only actual current own-key founder
confirmation can insert one. Invalidated requests permanently invalidate their
authorization; restoring access cannot revive them. Native execution and request
completion must commit together. RLS and revoked direct/helper grants protect
the table. Its reference guard preserves migration 49's queued-media boundary.

The API queues requests only when its server-only release gate is enabled. It
does not restore backups or run deletion subprocesses. A separate read-only-by-
default operator derives authority from the immutable request, rechecks current
session/consent, restores the saved archives outside the mutation transaction,
then executes the exact scope and completes its request atomically. Provider
image cleanup remains the separate migration-49 processor. Actual HTTP/browser
acceptance and enabling the release gate remain pending.

## Reviewed Storage cleanup protocol

Migration 49 adds private `residence_storage_cleanup_attempts`. Native claims bind
one approved immutable image task to a generated token and a five-minute lease.
Claimed, deleting, completed, failed and expired states preserve retry history;
terminal records and lease identity cannot be rewritten. The trusted operator
restore-verifies the exact original frozen archive and image bytes, then checks
current references, provider identity and digest before requesting Storage removal.
Completion requires independently observed provider absence and native catalog
absence. A completed decision delegates this cleanup beyond its review lifetime;
archived sessions and expired reviews confer no new authority.

Queued media metadata is retained. Native guards prevent new image references,
object-path replacement and unprepared catalog deletion/truncation. Unknown
dependencies or missing reference guards block cleanup. Ordinary interrupted-upload
reconciliation excludes these jobs. Public residence execution remains disabled
pending its HTTP/UI integration and genuine authenticated acceptance.

## Reviewed residence execution core

Migration 48 adds private `residence_executions` and
`residence_storage_cleanup_tasks`. Execution admission derives its exact saved
scope, native transaction/backend, genuine current founder session/key, recovery
receipt, final consent and execution-time cooldown. Admission cannot commit until
all reviewed operational housing rows are removed, affected portals closed and
bindings revoked, pending invitations cancelled and approved exclusive images queued.
Residence-only retains manager sign-in; combined removal closes that portal while
preserving shared Auth identities, other portals and financial/history references.
Creator/admin notifications, audit, proposal completion and pause release commit
together. Completed receipts and pending cleanup candidates are immutable.

Version-3 previews require fresh review; older consent is invalidated without
releasing existing pauses. RLS and revoked table/helper grants protect the worker.
It has no HTTP/RPC execution entry. Migration 49 supplies the separate trusted
Storage processor. See [residence deletion](migrations/residence-deletion.md).

## Retained residence targets

Migration 47 adds immutable private `housing_reference_targets` for actual room,
allocation, verification-case, inspection and maintenance-issue identifiers. Four
media foreign keys and two enrollment foreign keys retain enforced original targets
without cascading or nulling historical links. Nullable verification-case residence
links remain nullable. New or changed bindings still require live operational rows;
historical identifiers never authorize access. Existing ownership, credentials,
metadata and enrollment state remain unchanged. Bound-source DELETE/TRUNCATE stays
blocked outside migration 48's exact native execution. Migration installation serializes
housing writers and locks the source graph before backfill and trigger installation.

Migration 46 captures actual residence identity in immutable private
`residence_history_targets`. Payment and approval foreign keys preserve their
historical target UUIDs independently of operational housing rows. Captured metadata
provides no ownership authority; new quotes and reviews still require live saved
relationships. Residence IDs cannot change or be reused. RLS and revoked role/helper
grants protect retained metadata. DELETE requires migration 48's exact native admission;
TRUNCATE remains denied. See [residence deletion](migrations/residence-deletion.md).

## Final residence execution consent

Migration 45 adds immutable private `residence_execution_authorizations`. Each
record binds a reviewed preparation and its recovery/cleanup digests to the current
founder, genuine Auth session and approval-key version. PostgreSQL sets a lifetime
of at most five minutes, capped by review expiry. Native validity rechecks current
consent, pause, session, key, scope, cleanup references and media catalog. History
contains no credentials and does not reference `auth.sessions` through a foreign
key, so sign-out remains possible. Only dates and validity reach admin status.
This records final consent; public residence deletion remains unavailable.

## Private residence cleanup plans

Migration 44 adds immutable `private.residence_cleanup_plans`, tied to an actual
recovery receipt and its approved frozen preparation. Native classification retains
avatars, marketplace assets, unfinished reservations, foreign housing bindings and
references in retained public/private rows. A trusted operator re-verifies actual
archives before recording the exact native plan/catalog digest. Only planning time
and counts reach administrator status; raw paths/owners/digests remain private.
Recording a plan never deletes operational rows or Storage bytes. See
[residence deletion](migrations/residence-deletion.md).

## Object-byte recovery

Encrypted Storage archives bind every supported saved object, including interrupted
upload orphans, to the actual rehearsed PostgreSQL checkpoint and its catalog digest.
Missing ready bytes, changed inventory, foreign objects and tampered archives block
completion. Local reconstruction performs no cloud writes; the separate real-provider
check uses the actual cover image and one journaled temporary object. Migration 42
adds an immutable private receipt after trusted operator verification; no public
RPC or RLS bypass is introduced. These archives do not establish a project-wide freeze
or final consent needed for deletion. See [Storage recovery](migrations/storage-recovery.md).

## Residence deletion reviews (migration 40)

Migration 41 adds private durable preparation history. A current keyed founder can
pause a version-2 review after two distinct approvals, or cancel the pause with a
reason even after the review closes. Native guards block changes to the saved housing
scope, both sides of relationship edits, new linked records and truncation. Shared
writer locks precede governance/context locks; preparation takes the exclusive lock.
The pause preserves reads and unrelated marketplace activity and survives reconnects.
Cancellation invalidates consent. Pending residence payments and in-flight media block
preparation. No recovery archive is attached automatically, no operational records are
deleted and no registration cooldown starts. Private history/helpers have no callable
browser/backend grants; narrow metadata-only guards retain outer RLS authorization.
Migration 42 enforces READ COMMITTED for housing/preparation writers and binds an
existing pause to its actual restored database/Storage evidence through a private
operator command. Receipt, admin-only status notice and audit commit together;
cancelled/changed scope and mismatched catalogs/archives cannot attach. Exact retries
are idempotent. Receipts expose only verification time in admin status and are
historical evidence, not execution authority. Deletion remains disabled.

`admin_proposals`/`admin_votes` hold immutable residence previews and two-admin
consent, with a keyed founder final decision and 24-hour expiry. Private
`residence_review_state` and append-only `residence_review_events` record actual
dependency UUID changes. Reversed relevant changes invalidate consent; unrelated
properties and no-op writes preserve it. Private snapshots resolve saved manager,
primary-owner and housing links, including financial/media foreign-key dependencies,
without exposing raw activation keys or enrollment challenges. Review helpers use
invoker privileges; the private metadata trigger has a fixed empty search path,
no callable role grants and preserves outer-write authorization. Execution is
disabled in SQL/API/UI; previews and approval do not delete data or impose cooldowns.
See [residence deletion](migrations/residence-deletion.md) for the remaining protocol.

## Account approval reviews and policies (migrations 37–39)

Account review evidence/votes reuse `admin_proposals` and `admin_votes`, with five-admin
quorum, 24-hour server-stamped lifetime and immutable founder final-rejection metadata.
The target is a saved non-administrator context. Directory relationships use saved
primary ownership and current staff-manager assignments; email never supplies a link.

`private.account_review_state` holds a monotonic lifecycle revision. Migration 38 adds
append-only `private.account_review_events` with changed context and parent-branch UUIDs.
Review snapshots include saved descendants and ancestors, excluding protected
administrator contexts. Only relevant changes invalidate consent; unrelated signups
and sibling portals, including resident/seller portals sharing an Auth identity, leave
a leaf review valid. Relevant changes followed by reversal still invalidate it.

The internal lifecycle trigger records saved links across RLS boundaries with a fixed
empty search path and no callable public/browser/backend grant. Its supported sources
are context, profile parent, staff/manager assignment and allocation writes. Those writes
retain their original authorization. SQL guards deny arbitrary revision changes and
event inserts/updates/deletes; the backend's former revision UPDATE grant is revoked.
Other review helpers remain invoker functions with no public execution. Roster/key
revision and exact snapshots are independently checked. Pre-38 reviews need fresh consent.
The administrator context guard returns OLD for non-admin deletion, allowing actual
deletion to reach lifecycle checks, while retaining protected administrator removal.
Approval alone changes no account. Migration 39 permits the current keyed founder
to apply a still-current five-admin review with explicit final confirmation.
`private.account_policies` records exact approved features, execution-based ban
expiry, reason, author and revision; `private.account_access_epochs` permanently
rejects pre-ban/pre-restoration sessions against actual `auth.sessions.created_at`.
Direct policy/epoch mutation is denied. Execution, inherited-policy lifecycle
invalidation, targeted notices and audit are atomic; no existing review is executed
by the migration. Deletion and wipes remain separate unfinished workflows.

Policies follow saved primary/portal and manager/staff links, excluding administrators.
Sharing an email does not merge portal policies. Restriction preserves an existing
ban, ban preserves existing features, and restoration clears only the selected
account's own policy; inherited policies still apply. An expired ban still requires
a fresh actual provider session. Auth identities and shared-mailbox sibling sessions
are preserved. Auth/API/native RLS, media reservations, feature writes and public
seller eligibility enforce access. Private tables have RLS with no browser/backend
table grants; only authenticated own-context status wrappers are callable.

The existing order-completion trigger can decrement stock under a publishing
restriction only for its exact completed order and unchanged listing metadata.
Direct stock edits remain restricted; existing handovers are not publication actions.

## Supabase runtime status

The normalized schema, native Auth integration and RLS are active by default.
Verified resident/manager/seller identities remain distinct from their primary owner;
resident and seller may share a verified student identity with separate portal PINs.
Saved foreign keys and private enrollment challenges establish relationships. The
primary owner, room and bed each permit only one active allocation. The completed
legacy development archive does not import or grant any native identity or role.
See [implementation history](migrations/supabase-implementation-status.md),
[schema design](migrations/schema-design.md) and the acceptance report above.

The following numbered migrations describe how the current schema was introduced.

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

## Verified payment quotes and access periods (native)

`payments` records the exact verified portal, saved store/residence, server-calculated
amount, currency, provider reference and fulfillment state. Private `payment_checkouts`
keeps immutable request UUID/fingerprint, payer email, quote lines, selected plan and
receiving account. Browser roles cannot read provider evidence or checkout details,
or directly write payment/subscription records.

Migration 43 adds private immutable `residence_payment_references` containing the
original residence UUID, name, primary-owner UUID and a genuine source-payment UUID.
Existing payments are backfilled without modification; new quotes capture the
reference in their transaction. Historical ownership is evidence, never authorization.
The original operational foreign key remains enforced until a verified deletion
workflow can replace it. This prerequisite neither deletes residences nor grants
access from unpaid quotes. Browser/backend roles cannot read or edit the references.

`store_fee_periods` represents two-month access independently from `store_subscriptions`.
Verified registration creates both initial two-month periods. Separate plan and fee
receipts renew their own periods, with immutable ownership, fulfillment time and
calendar intervals. One registration receipt per store and one residence onboarding
receipt prevent duplicate fulfillment. Genuine zero-fee policies use explicit platform
evidence; no legacy payment, test account or saved client assertion is imported.

## Selected hostel deletion and administrator announcements

Native reviewed proposals retain exact residence/account targets, current dependency
fingerprints, independent keyed votes and final founder consent. Private preparation,
backup, execution and Storage-cleanup receipts enforce the reviewed protocol. Registration
bans retain their exact context/kind/expiry. The former JSON governance arrays are archived.

Announcements use native notifications and exact recipient rows with independent read
and popup acknowledgements. Residence lifecycle notices reach the saved primary owner
and retained operational manager as applicable. Recovery archives are never served by API
routes. See [residence deletion](migrations/residence-deletion.md).

## Native marketplace media and messages

`public.media_assets` records the verified owner context/Auth subject, purpose,
Storage path, digest, size and readiness. Listing media/options reference authorized
market assets. Private Storage and scoped `/api/media/:id` reads enforce current
publication or account access; archived local upload paths are not served.

Buyer–seller messages, orders, purchase reviews and notifications use native foreign
keys and exact account relationships. Conversations remain append-only; a linked
primary or administrator does not gain a seller's private inbox. Receipt-linked
reviews require the completed native handover. No legacy conversation/review record
was imported. See [security boundaries](security.md).

## Marketplace reservations

Orders reserve positive integer quantities for 24 hours. Completion deducts stock
once; terminal or expired orders release capacity while preserving history. Only the
exact authenticated buyer can retrieve or renew its active private delivery challenge.

The native implementation serializes creation, renewal and handover with store → listing → order
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
Restoration verifies this sidecar in addition to PostgreSQL privileges and data. Database
and Storage-byte recovery remain separate verified operator procedures.

## Database

PostgreSQL through Supabase is the active datastore. Supabase Auth owns provider
sessions; `private.account_sessions` binds their exact Auth session and selected
native context. No JSON credential/session record participates in login, refresh,
logout or authorization. Private keys and challenges remain server-only.

---

## Core identity and housing rules

Supabase `auth.users`, `public.profiles` and `public.account_contexts` establish
identity and portal ownership. Manager/staff assignments determine operational scope.
The housing hierarchy is residence → block → floor → room → bed. Properties retain
identity, verified location/address, E.164 contact details, owned images, assigned
managers and supported stay-cycle/configuration fields.

Managers may manage only assigned residences. Only an authorized assigned manager
may invite staff into an approved, reviewed residence. Staff remain within their
saved employment/residence scope.

An active allocation connects the resident to a configured bed/room. The resident,
primary owner, room and bed permit at most one active allocation under the current
product rules. Database constraints and authorized transactions enforce uniqueness;
client-selected IDs never prove access.

Manager/residence verification cases and seller applications are native review
workflows. Housing booking applications remain retired; room access uses activation
keys. No generic application table or retired public recruitment flow is recreated.

Financial records retain amount, currency, method/provider references, timestamps,
status and exact account/charge relationships. Historical financial state remains
auditable. Only buyer–seller messaging is active. Resident-to-staff reviews require
the activated housing relationship; unrestricted public staff reviews remain retired.

## Archive and recovery principle

The owner classified every legacy JSON record as development data and authorized
private archiving after native verification. Original files and the old build are
outside the runtime tree; verified encrypted recovery remains available. Do not
restore legacy identities, sessions or operational records into the native database.
Current Supabase identities and relationships are retained. Native database and
Storage backups remain separate recovery artifacts and require their documented
verification/rehearsal procedures.

---

## Important

Do not invent database relationships merely because they appear convenient.

Before changing schema:

* inspect the existing application
* identify actual data relationships
* identify business invariants
* identify authorization boundaries
* identify legacy fields that contain implicit relationships


## Retired feature records and notification state

Retired housing/chat/recruitment records exist only in the private legacy recovery
archive. They have no active route or new database/RLS workflow.

Native lifecycle submissions route to the saved primary owner. Notifications use
exact `notification_recipients` context relationships and independent read/dismissal
state; acknowledging one account never acknowledges another. Portal access does not
follow from shared email or a client-supplied recipient.

## Historical JSON writer and offline recovery

The single-writer JSON implementation and its restore/credential commands are
removed. Earlier writer leases, local `.bak` rotation, `request-limits.json` and
JSON size settings are historical implementation details, not deployment controls.
The retained `scripts/backup-legacy-persistence.ts` can verify/list the protected
encrypted legacy checkpoint or reconstruct it into a new private offline recovery
directory. It is not an application datastore and must never merge records into
native accounts. See [native retention](migrations/native-account-retention.md).

Residence facilities, amenities and property policies remain retired from current
registration, editing and presentation. Archived values do not justify new active
columns, routes or RLS grants.

## Native residence requests

Reviewed residence changes use manager-assignment authority, an operation-key grant,
an immutable baseline and administrator approval. Key resets invalidate older grants.
Native transactions, private receipts, cooldowns and RLS preserve these relationships;
the retired `boardRequests`/`managerOperationKeys` JSON arrays are not queried.

## Native storefront profiles

Store contact, handover method and branding fields persist in `public.stores`.
Uploaded image references must belong to the verified seller's native media registry.
Public storefront projections expose only eligible business fields and published
listings; ratings require completed, verified purchases. Plan and publication checks
remain server enforced.

## Reviewed native residence registration

Before physical approval, requested manager-application corrections reuse the owned
case, verified manager identity and assigned inspection shell. Previous property,
review metadata and inspection targets are retained in private audit events; fresh
inspection is required after resubmission. Active dispatches and residence setup block
correction. See [manager application corrections](migrations/manager-application-corrections.md).

Manager physical verification creates an assigned property shell. The full registration form
completes that exact property instead of creating a second residence. Current category, contacts,
address, stay cycle and owned photo references persist alongside actual floor/room/bed rows.
A separate residence-registration case and `setup_submitted_at` mark submission for review.
Public cards/photos and new room activations require approved residence setup; an approved
manager identity alone is insufficient. Administrator approval/rejection/information requests now use the saved case and accepted
physical inspection, validate actual counts/photos, and notify the primary owner.
Requested setup corrections reuse the same case and archive the prior submission/review
in private audit events. Unused room layouts may be replaced before operational history
exists; unchanged layouts retain their identities. No new table or migration is required.
See [residence corrections](migrations/residence-corrections.md) for authority and evidence;
the isolated acceptance report distinguishes completed local checks from remaining human/provider acceptance.

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


## Verified staff lifecycle (native backend)

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

## Staff retention and resident reviews (native backend)

Migration 20 extends the existing staff bargain table with original employment snapshots,
resignation reasons, actual manager notes and decision times. One unresolved proposal
per assignment is enforced in SQL. Original ownership/terms and final decisions cannot
be rewritten. Employment ending cancels unresolved proposals and retains history.

Staff reviews require the reviewer’s active allocation and current same-residence staff.
Their author, allocation and rating remain immutable. The unused maintenance issue link
is removed after checking it contains no evidence; repair ratings remain separate. Read
access uses saved housing relationships and live portal bindings, with no public reviews.

## Scoped meeting appointments (native backend)

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

## Verified seller applications (native backend)

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

Retrying an avatar upload reuses a ready object only when its processed image hash, byte
size, verified Auth owner and active portal all match. The route verifies stored bytes and
rechecks the live identity/settings grant before returning the existing reference. A matching
upload still in progress returns a conflict rather than another reservation. Missing Storage
objects are excluded from reuse. Profile editors retain a completed upload across a failed
profile-save retry and prevent concurrent submissions.

Same-email portals using one Auth identity share that identity's picture. Separate verified
work/student identities and their linked primary owners do not inherit each other's media.
Private owner RLS additionally permits only the current portrait of active staff through the
existing authorized housing directory relationship. Ending employment removes that access.
Public catalog image rules do not publish avatars. Referenced assets cannot be retired or
deleted; reset/deletion workflows must detach the profile first and delete bytes through the
Storage API. Replacement pictures do not automatically delete prior ready objects; reviewed
object cleanup and permanent object-byte backups remain cutover work.


## Reviewed system wipe scope pause and final consent (migration 60)

Two private RLS tables retain scope pauses and short-lived founder authorizations.
Pause transitions serialize with existing residence/domain locks. Native guards
block scoped old/new rows and selected Storage metadata paths, including future
dependencies; existing outer RLS and residence execution rules remain. No new
SECURITY DEFINER function or public RPC is added. Founder cancellation preserves
history and releases the pause, even after the review becomes outdated.

Final consent requires actual restored post-pause recovery and binds the exact
scope/catalog, pause time, founder session and approval-key version for at most
five minutes. Browser responses expose state/times only. Execution remains disabled;
verified identities, operational records and Storage bytes are retained. See
[system wipe rules](migrations/system-wipe.md) for admission, freshness and recovery.

Migration 61 adds private, RLS-protected primary wipe execution/re-entry receipts.
The primary context check allows active or closed status; a native lifecycle guard
limits transitions to the exact reviewed execution or verified retained re-entry.
Preparation/pause completion and execution notices commit atomically. No Auth or
Storage data is deleted and no new public RPC is exposed. See
[primary wipe lifecycle](migrations/primary-wipe-lifecycle.md) for its intentionally
restricted eligibility and the still-disabled live execution route.

Migration 62 adds retained seller registration generations and an immutable store
application foreign key. Current-cycle readers no longer infer approval from any
historical application for the same seller. Prior store/payment IDs remain history;
new registration requires a fresh store and receipt. The re-entry trigger preserves
RLS and the existing independent resident identity/PIN relationship. See
[seller re-registration](migrations/seller-reenrollment.md).

## Primary re-entry proof methods

Migration 63 records the verified Google/email proof method on the immutable private
primary re-entry receipt. Native eligibility uses confirmed Auth identities and live
sessions; no editable profile metadata grants access. Primary IDs and history stay
retained. See [verified email re-entry](migrations/primary-email-reentry.md).

## Customer support

Migration 70 adds private support invitations, memberships, cases, messages,
case events and the email outbox. All six tables have RLS. Server-derived account
contexts own signed-in cases; guest cases require a private access-code digest.
Only administrators and active invited customer-service members can operate the
queue. Browser table writes and support self-enrollment are not granted. See
[customer support](customer-support.md) for the invitation and reply workflow.

## Automatic content safety

Migration 74 adds private RLS-protected `content_safety_checks` and
`content_safety_decisions`, with immutable ownership/evidence and retained
support-case references. Exact digest approvals gate new market/profile media
and marketplace text; existing native identity and ownership policies remain.
See [automatic moderation](content-moderation.md) for deployment status.
## Personal AI companion

Migration 75 adds private, RLS-protected companion preferences, recent AI turns
and server-only usage reservations. State belongs to the active primary context;
browser/catalog roles have no grants. It introduces no public RPC, peer chat or
approval authority. See [companion behavior and verification](companion.md).

## Device push delivery

Migration `20261105110000` adds private installations, verified per-account bindings, a public-catalog announcement ledger and leased delivery jobs. All four tables have RLS and revoked browser/scoped-backend grants. Existing recipient inserts enqueue jobs atomically through an invoker trigger; no historical notifications or users are auto-subscribed. See [device notifications](device-notifications-2026-11-05.md) for delivery, retention and installation.

## Resident PIN and catalogue photo formats

Migration `20261105150000` permits owned WebP objects for marketplace/residence
photographs and matching marketplace moderation quarantine. Existing PNG paths,
private Storage, attachment ownership and content-digest checks remain intact;
no saved photograph bytes are rewritten.

Migration `20261105160000` adds `private.resident_pin_credentials`, linked to an
owned resident enrollment and primary profile. RLS is enabled, browser and scoped
runtime-role grants are revoked, and an invoker trigger enforces immutable
ownership and the managed enrollment type. PIN hashes, encrypted provider
credentials and persistent setup lockouts remain private. Provider accounts are
created through Supabase Auth Admin after verified owner/key checks, never through
SQL password writes. The additive wrapper verifies all 86 prerequisite migration
digests and can be repeated safely. See [deployment evidence](resident-pin-media-update-2026-11-05.md).
