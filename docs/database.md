# PineVela Database Model

## Marketplace Media During Migration

The current JSON backend persists `marketMedia` records containing `imageUrl`, `accountId`
and `createdAt`. Products store up to three `additionalImages`; service `priceCategories`
contain up to four options with optional `imageUrl`. The server validates upload ownership
before accepting these references. Preserve these relationships when moving media to
Supabase Storage/PostgreSQL, with account ownership enforced by RLS and server authorization.

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


## Transitional Notification Read State

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
