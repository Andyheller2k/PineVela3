# PineVela Database Model

## Marketplace Purchase Reviews During Migration

`digitalMarketRatings` contains server-owned receipt, buyer, seller, store and item fields.
Only records marked `purchaseVerifiedVersion: 1` that match their completed order contribute
to public review lists and aggregates. There is one active verified review per order, updated
only by its exact buyer. Historical unverified ratings and `digitalMarketServiceReviews`
remain private and preserved across load/save; they are not automatically promoted.

PostgreSQL migration must preserve completed-order eligibility and exact buyer ownership,
use a unique `order_id` constraint with transactional review/aggregate updates, and enforce
the same policy through server authorization and RLS. Keep private receipt/account fields
out of the public review projection.

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

PostgreSQL migration must serialize reservation creation/renewal and stock consumption
in a transaction that locks the product and relevant orders (or uses an equivalent atomic
inventory predicate). Expiry/release must preserve the same capacity rules. Keep actor
authorization and RLS in the boundary; a JSON process lock cannot replace database locking.

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
* facilities
* policies
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
