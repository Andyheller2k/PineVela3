# Supabase application schema design

Read [current-application-audit.md](current-application-audit.md) first. This is a
fresh-start schema for the supported product; it does not import disposable JSON
accounts or reproduce every JSON collection. No placeholder accounts or sample rows
belong in the migrations.

## Identity and active account context

`auth.users` owns credentials, Google identities, recovery and sessions. `profiles`
stores person fields keyed by `auth.users.id`. The user confirmed on 2026-10-09 that
resident, manager and seller accounts retain **separate account logins**. Student and
work email addresses must be verified before those accounts become usable. They later
clarified that resident and seller may share the **same verified student-email identity**,
using its shared Supabase password and **different portal access PINs**. Manager work-email
identities remain separate. Supabase has one password per email identity.
Their profiles and `account_contexts` point to the exact saved primary owner through
server-controlled relationships. Primary-user Google sign-in cannot select a child
account merely because that person owns it. Student-identity sharing requires its own
verified password session and the exact saved owner relationship. Staff/officers also require verified Auth
subjects and authorized onboarding; staff creation remains manager controlled.

`private.account_enrollments` records an authorized initiator, expected email and Auth
UUID, a private challenge digest, expiry and the resulting context. The replacement API
implements initiation, confirmation/resend/cancellation and room activation; the enrollment
forms are still being ported. The server
must verify the provider subject and enrollment before linking it. It must not link
by matching email, store passwords in PostgreSQL, trust signup role metadata, or leave
the new child identity with an unintended primary-account experience. A private reservation
nonce is checked only at creation; editable metadata never grants an ongoing role. Same-email
sharing cannot adopt an unrelated existing identity. Public signup
creates only ordinary primary contexts. A parent may inspect registration status and
receive lifecycle notifications while each sub-account requires its own sign-in.

`portal_access_keys` stores salted scrypt PIN hashes, five-attempt lockout state and key
versions. Shared student portals require different PINs. Session bindings record the accepted
PIN version, which RLS also verifies; enabling or changing a PIN invalidates earlier bindings
without current proof. Browser roles cannot read the keys.

`account_sessions` binds a verified Supabase Auth `session_id` to a single active
account context. Only server code may change it after checking context membership and
status. RLS functions check both `auth.uid()` and the trusted session ID. This keeps
operational seller/manager/staff notifications within the selected account while
requiring the sub-account's own verified session. The primary context remains the
recipient of registration lifecycle notices. Sensitive routes must confirm that the
underlying `auth.sessions` row still exists to close the JWT expiry window after
deletion or logout.

The new owner uses Google sign-in with `andyheller2k@gmail.com`. A private, one-time
server operation must verify Supabase's provider identity, exact Auth UUID and email,
then grant administrator #1 in `admin_memberships`. A public signup creates only a
primary context. No email string or user metadata is a reusable admin authority.

## Housing and operations

`residences` → `blocks` → `floors` → `rooms` → `beds` encodes the hierarchy. Counts
in residence registration create actual floor, room and bed rows transactionally.
`room_activation_keys` belongs to a room, with one current key per room. The user
confirmed **one key and one active resident per room** even where the configured
room has multiple beds. `allocations` records the resident, room and selected bed;
partial unique indexes enforce one active resident allocation per primary owner, room occupant and
bed occupant. The bed belongs to the recorded room through a composite foreign key.

`manager_assignments` grants a manager context access to specific residences.
Initial structure creation accepts explicit layouts only, stores actual floor/room/bed rows
and derives capacity counts from them. Block gender/start numbers and room layout labels
preserve active form data. Full manager registration completes its physically inspected residence shell,
saves current contacts/location/category fields and owned photographs, creates the actual hierarchy,
and submits one immutable residence-review dossier in the same transaction. Submitted data can
resume from PostgreSQL. Manager-account approval alone cannot publish the shell or its photographs,
issue activation keys or activate residents; those require approved full residence setup.
Exact retries do not duplicate rooms; changes to an existing
structure require the reviewed-change workflow. Manager operation keys are private salted
hashes with persisted lockouts and versions; reset petitions require administrator review.
`staff_assignments` binds a staff context to one active residence and its creating
manager. `verification_cases` represents manager/residence registration reviews;
`verification_inspections` binds an officer to a case, preserves dispatch authorship and
submitted reports, and permits only one live dispatch per dossier. Reinspection creates a
new assignment. Approval requires a submitted physical report; server decisions activate
the exact saved manager/residence relationship and notify the primary owner transactionally. `residence_change_requests`
stores immutable reviewed before/after fields and a baseline digest. `meetings` and
`staff_bargains` remain separate workflows because their permissions and lifecycle
differ. Staff retention has one unresolved proposal per employment, immutable original
terms and actual manager decisions. A decline leaves the staff member to confirm staying
or resigning. Accepted shift/block changes use saved employment; no separate payroll or
counteroffer engine is introduced. Ending employment cancels unresolved proposals.
`staff_reviews` requires the reviewer’s active allocation and active staff in that same
residence. It is immutable private housing evidence; no maintenance cross-link or public
staff rating model remains.

`maintenance_issues` holds exact reporter, original allocation, room, residence and assigned staff;
`maintenance_events` records accepted/declined/rescheduled/completed/confirmed/closed
transitions. `repair_reviews` has one row per signed-off completion. Server methods
and RLS enforce the reporter, manager and assigned-staff transition rules from the
audit; the database does not accept arbitrary status writes from the browser. One unresolved
resident complaint is enforced by a partial unique index. Unconfirmed completion still
counts as unresolved. Repair ratings are separate from housing staff reviews and never
receive a server-invented five-star default. A resident must still hold the original
allocation to sign off; handling unfinished tickets after allocation release needs a
separate reviewed lifecycle action.

## Market, payments and communication

`seller_applications` → `stores` → `listings` → `listing_media` and
`listing_price_options` represents the current storefront and products/services.
`store_subscriptions` and verified fulfilled `payments` determine server-derived listing
benefits; separate `store_fee_periods` require current two-month access. Private
`payment_checkouts` preserves actor-scoped UUIDs, immutable quotes and provider matching
details. Registration alone starts two months of Pine Default access; paid upgrades
and subsequent two-month fees have separate quotes and periods. A store is controlled
by its seller context and linked primary owner.

Private inventory resolves that saved approved seller relationship, with no email-based
ownership selection. Listing mutations serialize store quota checks before listing
locks; physical stock and services with nullable stock remain distinct. Paused drafts
count against actual current plan limits. Publication requires a ready owned cover,
and gallery/price-option identities cannot be reassigned. Retiring hides the listing
while preserving order references; live reservations block stock reduction/removal.

`market_orders` joins exact buyer, listing and store IDs, carries an immutable price
snapshot, reservation expiry and private PIN digest/attempts. Its lifecycle runs in
transactions that lock the listing and relevant active reservations. One seller
store and one buyer conversation is represented by `market_messages`; an optional
order link must belong to the same buyer and store. `market_reviews` is unique by
completed order; public reputation reads only verified completed purchases and
excludes self-purchases.

`media_assets` joins its portal and Auth owner through a composite foreign key. Only ready,
owned assets may attach to listings, stores, residences or their exact officer inspection.
The private Storage bucket grants no browser writes. Public publication/plan eligibility
or a live authorized account relationship is checked when serving image bytes. A durable
upload reservation and stale-transfer reconciliation cover the separate database/object commits;
cleanup never deletes ready assets. Maintenance report media is bound to its original
allocation/residence, and repair media to its exact accepted assignment/ticket. Evidence
remains private under ticket RLS, including immutable history. Avatar media remains to be ported.

`notifications` plus `notification_recipients` stores exact account-context targets,
per-recipient read state and popup acknowledgement. Marketplace messages do not
become a generic chat system. `payments` stores unique provider references and
fulfillment events; pricing settings and settlement configuration are private and
updated through the existing admin governance rules.

`admin_memberships`, `admin_invitations`, `admin_proposals`, `admin_votes`,
`registration_bans` and `audit_events` carry keyed governance, founder decisions,
expiry, immutable previews and private audit history. Approval keys and other
secrets are never exposed through public views or browser queries. Settings credentials
have independent persisted attempt windows and versions, with SQL-guarded one-time
fresh-Auth enrollment. Receiving-account writes recheck active membership and the
current key grant after the real provider read; they preserve existing payment quotes.
Shared pricing decisions now use immutable previews, three distinct keyed approvals
and founder final execution. Private monotonic roster/key and pricing revisions invalidate
stale reviews; changing a value back cannot revive votes. Final prices, audit and exact
administrator notices commit together, while existing checkout quotes remain unchanged.
Lost-key recovery and the remaining destructive governance workflows still require ports.

## Authorization and migration order

1. Create the identity/context and housing tables with foreign keys, unique partial
   indexes and RLS enabled. Migrations contain no seeded accounts.
2. Add operational and market tables, their RLS policies, private Storage policies,
   and server transaction functions for reservations, allocations and approvals.
3. Switch authentication and each API workflow to Supabase Auth/PostgreSQL. Every
   route derives actor and context from the verified session and joins actual
   assignments. Shared email is never used as an ownership fallback.
4. Verify positive and negative direct API/RLS cases, restart persistence, Google and
   email signup/login, staff onboarding, manager approvals, payments and rollback.
5. Stop writers, refresh a restorable database/Storage backup, review the final
   candidate set, then remove old local/cloud identities and their linked records.
   Only after the new backend works does the JSON writer leave the runtime.

The local encrypted backup and cloud PostgreSQL archive preserve reviewable snapshots.
An isolated local restore of the cloud archive passed, including access-control checks;
it is still necessary to refresh the snapshot with writers stopped at final cutover.
The old `retiredFeatureRecords` archive stays only in private recovery
material; no active tables, routes or policies resurrect retired features.


Staff invitation and employment lifecycle uses the existing private enrollment and
public staff-assignment entities (migration 19). A verified assigned manager invites an
unregistered work mailbox for an approved residence. Staff choose the password and prove
mailbox ownership; manager-set credentials and email-based account adoption are excluded.
Role/shift are employment fields, not portal privileges. Ended employment is immutable,
keeps repair references and cannot revive staff sessions. Current roster reads omit ended
assignments. Rehiring closed identities and avatar media remain gates. Migration 20 adds
private retention proposals and resident staff reviews to the existing entities; repair
ratings remain separate.

Meeting appointments reuse `meetings` (migration 21), with immutable participant/contact
snapshots and original allocation or employment foreign keys. Saved managers decide;
only exact current participants read or cancel their own appointments. External contacts
are actual entered details and never account identities. Final decisions and soft removal
retain evidence. This is an appointment workflow, without housing chat or retired bookings.

Seller applications reference their verified enrollment (migration 22). Primary users
submit actual school/campus/category/store details without passwords or ownership fields.
Active administrators review; rejection allows a new submission version with prior
evidence retained in private audit. Approval creates an unpaid pending store for the
saved seller identity and permits that portal login, without payment/setup fabrication.
Raw writes remain private and scoped status views prevent email-based account adoption.
