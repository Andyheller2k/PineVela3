# PineVela Product Rules

## Marketplace Reviews

A seller's linked primary account cannot buy or review its own store's items or services.
Existing self-purchase reviews do not contribute to public reputation. Verified review
notifications belong to the seller account and identify the buyer, purchase, score and review.

A buyer may review and edit feedback for their own completed marketplace purchase through
Purchases & Tracking. Separate purchases have separate reviews. Seller service pages display
verified purchase reviews and offer no orderless review form. Stores/items without verified
reviews appear unrated. Historical unverified reviews are preserved privately, without
influencing public reputation.

## Marketplace Handover

A primary buyer creates an order using their authenticated identity. The order reserves
stock for 24 hours. Its seller confirms the proposed location before completing handover;
only the buyer sees the six-digit delivery PIN and shares it after inspecting the delivery.
PINs expire after 24 hours and lock after five failures. The buyer can obtain a new PIN and
renew the reservation if capacity is still available. Expiry, rejection and cancellation
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
applications are retained only in a private inactive archive during migration.

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
Each has a separate private approval key. Destructive proposals use checkbox scopes, show
all dependent deletions, and require all five independent approvals. Any rejection cancels;
membership/data changes invalidate approval. Administrator #1 explicitly confirms execution.
Total wipe preserves administrators, governance and protected recovery/audit artifacts.
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
The same service inspection and booking flows remain available. Google Maps directions
can include a selected waypoint. Flexible services remain buyer-selected and are not
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

Verification: `npm run test:residence-requests` and, after building,
`node tests/residenceRequests.browser.cjs`. Tests use isolated databases and actual APIs.
