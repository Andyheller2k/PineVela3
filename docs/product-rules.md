# PineVela Product Rules

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

* apply for housing
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
