# PineVela Product Rules

## Marketplace Reviews

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

## Maintenance Workflow

Only the active staff member assigned to a maintenance issue may accept, decline, request
a reschedule or submit completion. Managers may dispatch and decide reschedules only for
their authorized residence. Staff must accept before completion. The exact reporting
resident must retain active room access to confirm a completed repair or request follow-up.
Resident reports require resident sign-off before management closure; managers cannot
manufacture that confirmation. Closed issues reject further workflow changes, and resident
sign-off may create only one repair review per completion.
