# PineVela Product Rules

## Resident room activation

A verified primary user may activate a valid available room key and choose a
6–12 digit resident PIN without a student mailbox. The primary email plus room PIN
opens the isolated resident account; primary email/password keeps its primary-user
meaning, through the same login form without a method selector. Settings links
to the active room status card, where the primary owner can reset only its own
activated room PIN. The control and endpoint are unavailable before activation
or after room closure. Interrupted/unallocated setup may choose a new PIN only
with verified primary ownership and a valid available room key. Legacy
email-based resident/seller accounts retain their existing credentials. Approved
housing, one active allocation per resident and exclusive room/bed occupancy
remain mandatory. This change does not alter seller enrollment rules.

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

## Officer access and room-key delivery

Officers verify their own separate official Google/email identity and accept an
administrator-keyed private invitation; administrators do not assign passwords.
Suspension/restoration needs an administrator’s own approval key and fresh officer
sign-in. Existing administrator identities cannot become officers.

Assigned managers can send a current room key to one verified recipient’s primary
PineVela notifications using their own operation key. This does not send email/SMS
or allocate/reserve the room. Occupied keys belong only to the current resident
owner. One key and one resident per room remain enforced. Delivery history survives
reviewed residence removal; an obsolete receipt does not advertise a current key.
See [details](migrations/officer-invitations-and-room-delivery.md).

## Academic-year room access reset

An assigned manager may reset every configured room in an approved, fully reviewed
residence with the current manager key. Administrators require their own separate
approval key. An exact server preview and typed `RESET ROOM ACCESS` consent precede
the operation. Room/occupant, assignment or key-version changes invalidate that preview.
One completed reset is recorded per residence/academic year; later years must advance.
A retry returns the same receipt and never evicts residents who activated afterward.

Reset ends current allocations, closes only resident portals, revokes resident app
bindings and all previous room keys, and issues one fresh key per room in one atomic
transaction. It keeps verified Auth identities, shared seller portals/PINs, primary
accounts, allocations/history, staff, maintenance and marketplace data. Saved primary
owners receive room-loss notices; property owners, managers and administrators receive
the completion notice. Residents must confirm their retained identity and activate again
with a new key. Reset grants no registration cooldown, account wipe or residence deletion.

## Manager account closure during the Supabase migration

An assigned manager may request closure of their own portal and assigned residences
using their current manager key. Submission leaves the account and housing active.
Administrators may decline with an approval key or link the request to an exact
combined manager/residence deletion review. That independent review still requires
two distinct approvals, founder consent, verified backups and final execution gates.
The UI suggests 30 days of registration cooldown; administrators decide the final
duration. A waiver request grants no waiver. Notifications reach the manager, saved
primary owner and active administrators. Shared identities and sibling portals remain
intact. Pending requests can be withdrawn; linked reviews retain their own lifecycle.
An active manager without an assignment may submit an own-key portal-closure request.
It uses the existing five-administrator account review, including the founder’s vote
and separate final own-key confirmation. The exact pending request, current manager
key version, ownership, registration restrictions and absence of assignments/active
staff/live property registrations are checked again during review and execution.
Changed dependencies or credentials invalidate consent. Pending managers cannot use
this flow; primary users cannot close a separately verified manager portal.

Portal-only closure ends manager app bindings and retains Auth, other portals,
housing/history, keys, settings and existing restrictions. A retained residence
cooldown on a closed manager also blocks its saved primary owner from creating a
replacement manager until that same restriction expires. No new cooldown or waiver
is introduced. Primary onboarding reads only its own applicable native cooldown;
overlapping bans use the longest active expiry, and expiry keeps historical records.
A read or countdown cannot grant a waiver. A submitted request permits no closure by itself. Active unassigned
managers may issue/recover their own operation key through the existing key workflow.
Existing authorized manager room release remains. A closed manager may reuse its original verified work identity after existing cooldowns
and closure reviews permit it. The saved primary owner must confirm that work identity
using its existing email password or an explicitly requested email code/sign-in link.
Re-enrollment preserves the identity and history, retires the old manager key, and grants
pending status only. A new residence must complete physical inspection and approval;
previous approvals cannot reactivate the manager.

## Resident account closure

Residents may immediately end their own room access after explicit confirmation and
their current portal PIN, or a native verified sign-in within five minutes when no
PIN is configured. Managers need not approve self-release. Primary users cannot close
a separate resident portal by submitting its email/password or room key. The operation
ends the saved allocation, closes only its resident context, revokes all resident app
bindings and creates one unclaimed replacement key. The old key is revoked.

The shared verified identity, seller portal, portal PINs, maintenance/review history and
payment/order records are retained. No new registration cooldown is imposed. Primary
owners and assigned managers receive notices. Existing reactivation requires the
resident's own verified credentials/PIN; retained history grants no active room access.
Concurrent closures/sign-ins/room releases serialize through the housing lifecycle lock.

## Residence changes during the Supabase migration

Assigned managers may request changes to residence names, photographs, public
manager contacts and block names/count once every 30 days across their properties.
They must use their current manager secret key. Submission leaves live details
unchanged. An active administrator must view the diff in their own current session
and confirm with their separate approval key; a settings key cannot decide it.
Changed residence details or an ended assignment block approval. Rejection needs
a reason. Blocks with floors, rooms, beds or staff history are retained.

Public manager contact changes do not alter the manager's verified login identity.
New residence registrations explicitly collect the name that will appear on public
residence cards, separate from the login profile. Until an older approved residence
has a reviewed public contact name, its card shows the already published property
email or phone instead of disclosing the account profile. Adding a name to an
approved residence still requires the normal reviewed change request.
Managers and their primary users receive submission/decision notices. Administrator
request notices contribute to approval alerts and open the residence review section.
Manager-key recovery separately requires the administrator's own settings key,
invalidates previous operation grants and approves pending recovery petitions.
Only the manager generates and sees the replacement key; the 30-day request limit
is preserved after recovery.

## Account approvals during Supabase migration

Five distinct active administrators with enrolled approval keys must approve an
account review, including the founder. The proposer counts once. Approval expires
after 24 hours or becomes invalid after roster/key or account-lifecycle changes.
Only the founder can record final rejection after all five approvals. Shared email
addresses do not merge account contexts or establish directory relationships.

The migrated review UI supports timed-ban, feature-restriction and restoration
proposals. Migration 39 enables final policy application with five current votes,
the founder's own approval key and explicit confirmation. Approval alone changes no
access. Account deletion remains disabled pending its reviewed recovery protocol.

Residence deletion uses a separate two-administrator review, including an available
keyed founder who must make the final decision. Migration 40 enables saved-dependency
previews, keyed proposals/votes and founder rejection. Execution remains disabled
until backup/Storage recovery and cleanup are verified. Residence-only plans to retain
manager sign-in; combined removal expands to that manager's assigned properties.
Relevant dependency or roster/key changes invalidate consent, even when reversed.
Owners receive deletion notices and signup cooldowns only after actual execution.
Residence-only cooldowns target the exact retained manager portal. Combined-removal
manager-account cooldowns target its saved primary user and prevent a new manager
enrollment. A predecessor's residence cooldown must not spread to a replacement
manager with the same owner. Expired cooldowns use current database time. Recording
a deletion proposal, pause, recovery receipt or final consent starts no cooldown.

## Verified account identities

The native Supabase runtime uses separate verified child identities linked to a primary owner.
Legacy resident and seller accounts with the same student email may share one Supabase
login password, with different portal access PINs. New primary-email/room-PIN residents
use their own isolated native identity as described above. Managers use a separate verified organization
email in the production email-enrollment flow. A server-selected, direct-loopback,
non-production development flow temporarily permits a separate genuinely verified
Google identity without a work mailbox. It preserves primary ownership, separate
manager sign-in, pending status, inspection and administrator approval. It never
adopts an existing PineVela profile. Domain/Resend setup and the final work/student/
ordinary-signup email-token requirements are deferred until launch-auth setup after
development persistence cutover, before public release. Supabase email confirmation
remains enabled. See [Google development enrollment](migrations/google-manager-development-enrollment.md).
Primary ownership grants registration-status access, never child sign-in or PIN bypass.
One room key permits one active resident per room, even when the room has multiple beds.
Requested manager-application corrections belong to the primary owner and reuse the
verified manager identity, assigned inspection shell and current case. Changed property
details require a fresh physical inspection before manager approval; previous reports
and administrator feedback remain history. Final decisions cannot be reopened this way.
These rules are implemented progressively; see [migration status](migrations/supabase-implementation-status.md).

## Administrator announcement recipients

Managers, residents, primary users, marketers/sellers and staff are independent
recipient groups. The gateway lists registered active portals, excluding pending,
rejected, suspended and closed portals. “Marketers” selects existing seller contexts.
Group plus specific-account selections deduplicate by portal, with 1–2000 recipients.
Each recipient receives one notification and a popup dismissible once. Dismissal does
not remove or mark the notification read. Resident and seller portals sharing one
verified mailbox retain independent inboxes/dismissals. Gateway announcements do not
change submission-status rules: those still notify the primary owner before portal entry.

## Shared pricing changes in native Supabase

Registration fees, two-month fees, monthly plan prices and commission changes require
three distinct administrator settings-key approvals and administrator #1's final keyed
execution. The proposer counts as one approval. The founder may execute after three
other administrators approve without casting another vote. At least three active
administrators must have settings keys, including the founder; the roster supports
three to five administrators. Approval keys cannot authorize pricing actions.

Proposals retain the reviewed prices and roster, expire after 24 hours and allow one
immutable vote per administrator. At most ten proposals may remain open. Changes to
membership, enrolled keys or live prices invalidate old proposals; display-name and
unrelated contact/receiving-account changes preserve them. Live prices change only at
final execution. Money is stored in exact cents; existing checkout quotes keep their
saved amounts. Pricing submission, votes and status changes notify active administrators
under Admin Settings and contribute to the existing unread count.

Active administrators may update public contact channels and platform announcements
with their own settings key. Other administrators receive settings status notices;
changed nonempty announcements notify active non-admin portals. Clearing announcement
text retains delivered history. Contact changes preserve pricing approvals and payment
destinations. Only an active administrator with their separate settings key may enable or
end maintenance. Ordinary account operations pause; actual administrator recovery and
signed payment reconciliation remain available. Ending maintenance requires a message.
Existing active non-admin portals receive an account-specific dismissible popup for
24 hours after restoration. Later portals are excluded, dismissal persists across sign-in,
and a later restoration has its own notice. No client-selected recipient or timestamp is accepted.

## Store billing

Activation charges only the one-time registration fee. Verified registration grants
two calendar months of initial Pine Default access; the two-month fee becomes due
after that period. Star and Pro are separate monthly upgrades. The ongoing two-month
fee and the monthly plan have independent access periods, both required for public
listings and new orders. Existing buyer–seller conversations remain available after expiry.

Quotes use saved administrator pricing and the verified portal identity. A retry keeps
its request UUID, original amount and reference. Zero-valued fees are genuine waivers,
recorded separately from provider payments; repeated free renewals cannot accumulate
future access. Test-mode payments do not activate stores in the native database.
Legacy development billing records are privately archived; no old billing path remains active.

## Marketplace Reviews

A seller's linked primary account cannot buy or review its own store's items or services.
Existing self-purchase reviews do not contribute to public reputation. Verified review
notifications belong to the seller account and identify the buyer, purchase, score and review.

A buyer may review and edit feedback for their own completed marketplace purchase through
Purchases & Tracking. Separate purchases have separate reviews. Seller service pages display
verified purchase reviews and offer no orderless review form. Stores/items without verified
reviews appear unrated. Historical unverified reviews are preserved privately, without
influencing public reputation.

The native Supabase runtime requires verified handover before review submission. A buyer can
edit their own feedback without changing its purchase receipt or creation time; identical
retries do not send duplicate seller notifications. Reviews remain available for completed
purchases after their listing is unpublished.

Buyer–seller conversations start with a buyer inquiry or actual order, with the server
resolving the store and participants. Sellers reply through their separate portal. Existing
conversations remain available after subscription expiry while the store and seller remain
active. Administrators and the seller's linked primary account do not receive chat access.

## Marketplace Handover

A primary buyer creates an order using their authenticated identity. The order reserves
stock for 24 hours. Its seller confirms the proposed location before completing handover;
only the buyer sees the six-digit delivery PIN and shares it after inspecting the delivery.
PINs expire after 24 hours and lock after five failures. The buyer can obtain a new PIN and
renew the reservation if capacity is still available, with a one-minute renewal cooldown.
Order retries keep their original request UUID and purchase snapshot. Expiry, rejection and cancellation
release capacity; completed/rejected/cancelled orders cannot reopen. Seller PIN verification
is not a payment processor operation; it records the existing physical handover/payment flow.

## Marketplace Photographs and Alerts

An item has one cover and up to three extra photographs. Services support up to four
named price options, each with an optional photograph. Selecting a price option shows
its photograph and records the corresponding catalog price/image in the order; options
without photographs use the service cover. Inspecting a photo opens an accessible fullscreen
gallery with close, keyboard, arrow and mobile swipe controls.

Seller unread badges are red; primary buyer badges are blue. The buyer Market badge counts
unread messages, order updates and merchant platform status notices. Opening a conversation
acknowledges its incoming notices; opening tracking or merchant status acknowledges those
notices. Viewing an order from a notification does not start delivery PIN verification.

## Users

PineVela has several user categories:

* Resident/student
* Manager
* Staff
* Seller
* Administrator

Roles must be enforced server-side.

---

## Managers

Residence registration uses its street address and map location. GhanaPost digital
addresses are retired: no registration, inspection or residence setup requires or
edits them. The inspected property name and map pin must still match full residence
setup; existing geographic, assignment and physical approval rules remain enforced.
Historical dossiers and migration/backup records remain immutable.

Managers may manage only residences/hostels to which they are assigned.

Managers may:

* manage their authorized hostel
* create required staff accounts for their own hostel
* manage hostel operations within their authorization

Managers may not:

* manage another manager's hostel
* create arbitrary staff for unrelated hostels
* publicly recruit staff through the platform

---

## Staff

Staff accounts are created and managed by authorized managers.

Staff belong to a manager/hostel context.

There is no public staff hiring system.

---

## Residents

Residents may:

* receive room activation keys from their authorized housing manager
* receive housing allocations
* report maintenance issues
* review staff when the resident has an active/valid room relationship

Residents must not gain access to another resident's private data.

---

## Sellers

Sellers operate through the seller experience.

Buyer-seller messaging is supported.

Seller messages must be isolated to the relevant seller/store.

A seller's messaging inbox should belong to the seller experience rather than becoming a generic inbox on the primary account.

---

## Messaging

### Active

Buyer ↔ Seller

### Retired

* Manager ↔ Resident
* Manager ↔ Staff
* Room DMs
* Public/general chat
* Generic public chat

Retired messaging functionality must be removed from:

* UI
* API
* database
* notifications
* types
* hooks
* contexts
* tests
* seed data

---

## Staff Reviews

Supported:

Resident → Staff

Condition:

The resident must have an appropriate activated/active room relationship.

Public unrestricted staff reviews are not supported.

---

## Maintenance

Maintenance reporting remains an active product feature.

Resident repair/maintenance ratings should remain when they are part of the active workflow.

Maintenance functionality must not be confused with public staff reviews.

---

## Housing Allocation

Core rules:

* A resident may have at most one active allocation.
* A bed may have at most one active occupant.
* Allocation must respect the hostel hierarchy.
* Unauthorized users must not be able to manipulate another resident's allocation.


## Housing Booking Applications

Housing booking applications are retired. There is no accommodation application/approval
workflow. Resident access uses the supported room-key activation flow. Marketplace service
bookings and meeting appointments are separate supported features. Historical housing
applications are retained only in the private legacy recovery archive.

## Residence Configuration and Profile Controls

Room-type selection determines beds per room; registration does not expose a separate
bed-count input. Residence registration, editing, public details and admin inspection
do not set or display room prices. Legacy database monetary fields remain untouched.
Manager navigation profile controls open the existing profile editor; the placeholder
account-preferences panel is removed.

## Maintenance Workflow

Only the active staff member assigned to a maintenance issue may accept, decline, request
a reschedule or submit completion. Managers may dispatch and decide reschedules only for
their authorized residence. Staff must accept before completion. The exact reporting
resident must retain active room access to confirm a completed repair or request follow-up.
Resident reports require resident sign-off before management closure; managers cannot
manufacture that confirmation. Closed issues reject further workflow changes, and resident
sign-off may create only one repair review per completion.

## Founder administration

At most five administrators hold stable numbered slots. Andyheller2k is administrator #1.
Each has a separate private approval key. System-wipe/account-deletion proposals use
checkbox scopes, show all dependent deletions, and require all five independent approvals.
Residence deletion uses its separate two-voter rule above. Any rejection cancels;
membership/data changes invalidate approval. Administrator #1 explicitly confirms execution.
Total wipe preserves administrators, governance and protected recovery/audit artifacts.
In native Supabase, key recovery requires two other active administrators with
enrolled approval keys. The proposer counts once and the target cannot consent to their
own recovery. Reviews expire after 24 hours and roster/key changes invalidate them.
A second approval clears only the chosen approval or settings key, preserving the other
credential and administrator membership. The target needs a new verified sign-in before
replacement enrollment. The founder's key follows this recovery rule too.
The founder may reserve slots 2–5 through a private, approval-key-authorized invitation.
The invited verified primary identity accepts once within 24 hours, then enrolls its own
keys. Existing secondary portals cannot be promoted. Cancellation or issuer authority
changes close the grant permanently. Links are manually shared, not emailed automatically.
Permanent administrator removal requires all four other eligible administrators'
separate approval keys, including the founder. The fourth vote opens a fresh 24-hour
target-only private appeal window. Submitted appeals always require a founder decision;
acceptance revokes consent and preserves immutable voting history. Rejection or expiry
without appeal still requires founder-keyed final confirmation. Removal closes only the
administrator portal, preserves Auth/primary identity and history, deletes private keys,
notifies the target's primary inbox and releases the stable slot for a different invitee.
Roster/key changes invalidate unfinished reviews. Wipe command ports remain pending.
The founder may suspend or restore another administrator with their separate approval
key. The founder cannot be suspended or removed. Both transitions preserve credentials
and history and invalidate old administrator sessions; restoration needs a new sign-in.
The affected primary inbox and administrator roster receive status notifications.
See [administrator governance](admin-governance.md) for onboarding and recovery.


Onboarding uses a shared icon stepper and blue filling progress bar across account,
room, manager, residence, staff, officer, marketplace and administrator flows. Progress
reflects the active phase and does not bypass existing validation or approval rules.
Administrator manual resident enrollment is retired; resident accounts activate through
the authenticated room-key flow. The removed wizard only wrote browser-local records and
used the shared activity endpoint; it had no dedicated backend creation endpoint. Actual
resident directories and room activation APIs remain supported.

## Seller subscription listing benefits

An active Pine Star plan adds a small glowing PineVela star badge to item and service cards.
Pine Pro includes that badge, gold card frames and priority among matching listings in
Featured marketplace results. Explicit price/newest sorting keeps the buyer's chosen order.
Benefits are derived from the listing's stored store ID and its current effective subscription,
not from seller-supplied listing flags. Expired or inactive paid plans lose these benefits on
catalog refresh, including listings published before upgrading. The same decoration appears
in seller inventory/services and buyer catalog/wishlist cards. Preserve these server-derived
entitlements and store ownership boundaries during PostgreSQL/RLS migration.

## Public PineMarket

The landing page previews the first five available Featured listings. Explore Market
opens `/pinemarket`, a public catalog separate from account dashboards, with the same
cards and search/category/price/sort controls as the buyer home marketplace. Catalog
visibility and subscription benefits come from the existing public products endpoint.
Visitors may inspect items, photographs and service pricing options without signing in.
Ordering, booking and saving favourites require an account; guests receive Login and
Sign Up actions. Signed-in primary buyers continue through the existing authenticated
purchase workflow. Direct order APIs still require an authenticated primary buyer.

## Primary account registration access

Manager submission, inspection dispatch and approval/rejection notices, seller application
submission and decisions, and resident activation confirmations belong to the linked primary
user's Notifications inbox before entry into a secondary account. Account-removal and
manager re-registration restriction decisions also target the saved primary owner. Delivery uses stored owner
IDs regardless of Google or password sign-in. Historical notices resolve through the saved
registration relationship; ambiguous or orphaned records do not gain email-based access.
Operational manager, staff, officer and seller notices retain their own account recipients.
Live server events refresh the inbox, with polling and focus refresh as fallbacks.

Profile pictures come from the authenticated account's saved profile. Shared browser avatar
keys and email-only caches are not used for restoration. A picture save is acknowledged only
after the authenticated profile endpoint succeeds.

Primary navigation exposes Purchases & Tracking for buyer orders. Merchant registration
and status cards open from the Home marketplace button; manager registration and status
cards open from the Home residences button. Existing onboarding, approval and dedicated
account login flows remain in place. Submitted registrations open their current status
card rather than a duplicate application. Cards and button icons follow authenticated
server status, including restrictions, rejection, approval, activation and deletion.
Buyer-seller messages remain available through seller contact actions; their component
is retained independently of the purchases tab. Manager password and self-deletion
controls are available only inside that manager account, with server-side enforcement.

Services near you displays live Fixed and Hybrid listings with validated seller pins.
Location permission is requested on opening the map; the default radius is 10 km, adjustable
to 5 or 25 km. Searching by service or store name includes listings outside that radius.
The same service inspection and booking flows remain available. A waypoint is a navigation
destination with a real walking or driving trail, distance, estimated time and directions.
Selecting a mapped service sets its destination; its details and booking remain available
through View service details. Device location or a manually selected starting point can
preview the route. Start following explicitly enables live GPS, camera recentering,
progress and throttled rerouting; manual points do not imitate live GPS. Closing the map
or stopping following clears the watch, and background tabs pause it. Google Maps remains
an external directions option. Flexible services remain buyer-selected and are not
assigned invented seller pins. Primary mobile login uses the rotating photographs as a
full-screen background beneath a rounded frosted card; desktop keeps its separate layout.

Verification for service discovery and administrator removal uses disposable databases:
`node --import tsx --test tests/serviceLocation.test.ts tests/serviceLocation.integration.test.ts tests/adminGovernance.test.ts tests/adminGovernance.integration.test.ts`.
Browser checks: `node tests/nearbyServices.browser.cjs`,
`node tests/adminGovernance.browser.cjs`, and `node tests/mobileLogin.browser.cjs`
after `npm run build`. No test data is inserted into the operational database.

Residence registration has four phases: basic information, map pin, property photographs,
and capacity. Its required primary contact uses a searchable country selector ordered by
country name, accepts numeric phone input, and validates the complete number against the
selected country using full numbering metadata. Mobile, fixed-line, toll-free and other
valid national number types are accepted; the server stores canonical E.164 plus country.
Number validity does not verify ownership or whether a line is currently reachable.
Facilities/amenities and residence rules/policies are retired across registration, editing,
public property details and manager views. Existing archived data is preserved.

When an administrator requests more residence information, the assigned applicant can
reopen the saved setup, read the feedback and resubmit corrections. The inspected name
and map pin stay fixed. Layout changes require no existing activation keys or operational
history; contact/photo corrections preserve room identities. Corrections return to review,
retain earlier evidence and notify the primary owner and administrators.

Residence contact and registration checks: `node --import tsx --test tests/internationalPhone.test.ts
tests/hostelSecurity.test.ts tests/hostelSecurity.integration.test.ts`. After building,
`node tests/hostelOnboarding.browser.cjs` verifies the complete four-step submission,
country search, number validation, restored drafts and responsive layouts against an
isolated database and the actual APIs.


Residence changes use the manager’s Direct Line to Admin. Only name, cover/interior
photographs, manager name/contact and block names/count are editable through requests.
Submission requires the manager secret key and is limited to one every 30 days per manager,
including rejected submissions. Administrators must open the before/after review and supply
their private approval key to approve or reject. Rejection requires a reason. Approval applies
only if the current property still matches the reviewed baseline and manager assignment.
Public/user property cards omit internal IDs and bed counts. Public API payloads also redact
capacity fields; stable opaque IDs remain for routing. Managers retain their own residence
capacity, and administrators retain all residence capacity.
New blocks have zero configured rooms; blocks containing floors, rooms, beds or assigned
staff cannot be removed. Existing allocation, capacity and ownership are preserved.

Every authenticated manager data-changing operation requires the saved secret key. The
first residence’s onboarding/upload and credential bootstrap/recovery are necessary lifecycle
exceptions; popup delivery acknowledgement is also exempt. Read-only requests need no key.
The secret is shown once after the first residence exists, including for existing managers.
Lost keys require a petition; an admin may reset a manager’s key with their separate settings
key. Reset immediately invalidates the previous key and prompts issuance in that manager
account. No key is saved in browser storage. Administrator messages remain in Notifications
and have a server-acknowledged first-time popup for their exact recipient account.

Resident mobile navigation has a camera shortcut on every dashboard tab. After capture,
the compact complaint form shows the photograph, a required title and optional details.
It submits through the regular maintenance workflow, including the one-active-complaint
limit. Desktop reporting retains its full form. Report ownership and residence are derived
from the authenticated active room; manager reports require an authorized residence.

Deleting a selected hostel requires a reviewed proposal and private-key consent from at
least two distinct active administrators. Administrator #1 (Andyheller2k) must then make
the final keyed decision; they cannot execute with a single approval. Choosing hostel-only
retains the manager account for sign-in. Choosing the manager account too includes its
other owned residences and dependent operational accounts, shown in the preview. The
primary owner receives a notification and a dismissible popup. An optional timed ban
blocks either hostel registration by the retained manager or manager-account registration
by the primary owner. Ban ownership comes from saved relationships, including Google
accounts. An encrypted recovery archive precedes execution; stale or rejected proposals
cannot execute. The old single-admin DELETE endpoint returns 410.

The admin Message Gateway sends announcements to actual selected accounts or role
groups: managers, residents, primary users, marketers/sellers and staff. Overlapping
selections are deduplicated. Delivery requires a current recipient preview and creates
an exact role-and-account notification plus a once-dismissible popup per recipient.
Announcements never become buyer/seller conversations or cross into a primary inbox
just because their title resembles a registration message.

Verification: `npm run test:admin-account-actions` and, after building,
`npm run test:admin-account-actions:browser`, using disposable persistence and actual APIs.

Verification: `npm run test:residence-requests` and, after building,
`node tests/residenceRequests.browser.cjs`. Tests use isolated databases and actual APIs.

Merchant storefronts show published items and services, business contact details,
branding and verified store ratings. Buyers can inspect, order and contact the seller
but cannot edit the store. Store inquiries use the existing buyer-seller inbox and
server-owned participant identities. Only the authenticated merchant can save their
store profile, delivery method, contact number and owned uploaded branding.

Default stores use the standard PineVela logo and can choose from four PineVela covers.
Only active Star and Pro subscriptions may attach owned custom logo/cover uploads;
the server derives eligibility from saved subscription status and expiry. Expiry or
downgrade hides custom branding in public and merchant projections while preserving
the original photos for a later upgrade. Listing photo uploads remain available.

Admin Approvals and Admin Settings mutations deliver independent, account-scoped
notifications to all active administrators, including proposals, votes, execution,
roster/key enrollment, expiration and public fee/control changes. Tab counts reflect
unread notifications. Reading one administrator's notification never reads another's.
Admin activity history is retained during operational wipes, preventing the approval
notifications themselves from changing the reviewed wipe fingerprint. Private keys,
invitation tokens and private pleas are excluded from notification payloads.

Manual physical-item stock entries and adjustments must be positive whole
numbers. Completing a purchase may reduce stock to zero and mark it sold out.
Seller meetup declines require confirmation and retain a Declined state on the
related order notice. Public social contacts are edited in Admin Settings with
the acting administrator's own settings key.


Personal profile pictures belong to the verified Auth identity. Portals sharing the same
identity share that picture; linked but separately verified identities remain independent.
Active administrator identities must use the administrator portal and settings key for
profile changes. Personal avatars are private; only active staff directory portraits are
shared through an authorized housing relationship. Login email, ownership and account roles
cannot be edited through profile forms. Store branding remains a separate subscription rule.

Notification badges count unread notices. An inbox card becomes read after it is
visible and uncovered in the active browser tab; off-screen cards, hidden tabs,
toasts and modal-covered cards do not acknowledge it. Read state persists per
recipient in Supabase. Pending operational work remains pending after its notice
is read, with its own workflow status/count rather than the inbox unread badge.

Marketplace reservations last 24 hours. Buyers and sellers may cancel their own active requests before completion. A server worker records overdue requests as expired without attributing the transition to either participant, deletes the obsolete PIN, retains history and notifies both parties. An expired request is terminal; a new request must re-check the current catalog, price and stock. PIN replacement is available only within an active reservation. Goods are paid directly at handover; request cancellation or expiry does not issue a platform refund.
