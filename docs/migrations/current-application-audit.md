# Current application data audit

Status: inspected on 2026-10-08 before designing the Supabase application schema.
The current project has **no `public` application tables** in PostgreSQL, five Supabase
Auth users, and no Supabase Storage buckets or objects. The live application still reads
and writes JSON through `persistentDb.ts`, `localDb.ts`, and many direct store accesses
in `server.ts`. The snapshot had 34 local user records, three residences, 480 room keys,
eight stores, 17 listings, three orders, and 23 local upload files. Counts describe the
inspection snapshot and are not seeds or data to import.

## Active data and genuinely required entities

| Product area | Active behavior and source | Relational concepts |
| --- | --- | --- |
| Identity | `server.ts` login/signup, Google callback, profile, secondary-account status; `accountSecurity.ts` | Supabase `auth.users`; profile; account roles/contexts; manager and seller applications; server-owned role grants |
| Housing | `localDb.ts` residence registration, `roomKeys` generation/claim; `server.ts` public catalog, management, activation | Residences, assigned managers, blocks, floors, rooms, beds, room activation keys, active allocations |
| Management | `server.ts` manager verification, residence requests, officer inspection, staff roster, meetings | Registration and inspection workflows; manager/staff assignments; appointments; review decisions |
| Maintenance | `server.ts` issue reports and workflow; `issueWorkflowSecurity.ts` | Maintenance issues, assignment, status history, completion and resident sign-off, repair review |
| Marketplace | `server.ts` seller application/store/listing/order; `marketMessaging.ts`, `marketOrderSecurity.ts`, `marketRatingSecurity.ts` | Seller applications, stores, products/services, price options, orders/reservations, buyer-seller messages, verified order reviews |
| Payments | `paystackPayments.ts` | Payment transactions and immutable provider references, subscription periods and entitlement state |
| Communication | `localDb.ts` notifications; `accountSubmissionNotifications.ts`; admin Message Gateway | Notifications, exact recipients, per-recipient read and popup acknowledgement |
| Governance | `adminGovernance.ts`, `residenceDeletion.ts`, `adminWipeScope.ts` | Admin membership, private keys, invitations, proposals/votes, registration bans, audit receipts |
| Media/settings | Server upload routes, profile/store/residence records; `platformSettings.ts` | Private Storage objects and typed media ownership; platform and manager settings |

These are concepts to normalize and group by lifecycle. The 35 transitional JSON arrays
are **not** a table list. For example, manager verification, hostel verification and
officer inspection are related workflow states; multiple copies of names and emails
in those records are presentation snapshots, not ownership foreign keys. Product/store
ratings and subscription card decorations are derived from verified reviews and current
plan state, not client-writable authority fields.

## Relationships and foreign keys

- `profiles.id` references `auth.users.id`. A primary user owns manager, seller
  and resident account contexts through exact saved IDs. Shared email is not an ownership
  key. Resident/seller may share their verified student-email identity with different portal
  PINs, only after proving that identity and its saved owner link. The new main administrator
  must be an explicitly granted, verified Google identity.
- A manager can be assigned to specific residences. A staff membership belongs to one
  residence and an authorized manager. Verification inspections belong to the exact
  submitted registration and assigned officer.
- Residence → block → floor → room → bed is the desired hierarchy. The present data
  stores blocks with numeric floor and beds-per-room counts and generates **one room key
  per room**; it has no explicit floor/bed rows. The user chose **one key and one active
  resident per room**. The new schema must enforce that room-level uniqueness while
  retaining bed identity/capacity without inventing multiple occupied beds.
- A room activation key belongs to a room; an allocation belongs to the authenticated
  resident and room/bed. Manager dispatch and resident claim reference that same key.
- A maintenance issue belongs to a residence and reporting account; its active staff
  assignment points to a member of that residence. Its repair review belongs to the
  exact completion and reporting resident.
- Store belongs to an approved seller context and its primary owner. A listing belongs
  to one store; a marketplace order belongs to an authenticated primary buyer, listing,
  and seller store. Messages reference the exact buyer/store conversation and optionally
  the order. A review references its completed order.
- Payments reference their payer and the residence/store/application they fulfill.
  Notifications reference exact recipient accounts, with read acknowledgements scoped
  to those recipients. Proposal votes reference distinct active administrators.

## Business invariants for database constraints and transactions

- One active allocation per resident, one active resident per room, one active occupant
  per bed; room keys are unique, expire/rotate as specified, and cannot be claimed twice.
- Managers and staff operate only within assigned residences; staff creation is manager
  controlled. Resident maintenance sign-off requires the exact reporter and current
  active room relationship. Closed issues cannot reopen through generic updates.
- Product stock is a positive integer for stock-tracked items. Active orders reserve
  capacity for 24 hours; completion deducts stock once. Terminal/expired orders release
  capacity. Order creation/renewal/completion need row locking or equivalent atomic
  predicates. PIN attempts and expiry remain private to the exact order and buyer.
- Only the exact buyer of a completed purchase can review it. One review per order;
  self-purchases do not improve public reputation. A buyer cannot read another buyer's
  messages/orders or act as a store owner.
- Payment references and fulfillment are idempotent. Active store subscription and
  listing benefits are server-derived from paid, unexpired plans.
- Admin proposals use immutable targets and baseline checks, distinct keyed votes,
  quorum and the founder's final action. A standard total wipe preserves active admins;
  the requested **one-time fresh start** is a separate reviewed operator procedure.
- Registration lifecycle notices go to the primary owner's account before entry into
  a secondary account. Operational notices remain scoped to manager/staff/seller/officer.

## RLS and server authorization boundaries

Public access gets only approved residence cards/details and published, eligible store
and listing fields. Private profile, allocation, room key, order, payment, issue, message,
notification, governance and upload records require an authenticated identity. Own-profile
access follows `auth.uid()`. Manager and staff queries join current assignment records;
buyer queries join exact buyer IDs; seller queries join exact store ownership. Staff and
officer views include only assigned work. Notification reads join the recipient relation.
Admin privileges come from server-maintained membership and current status, never signup
metadata, email strings, browser role fields or a bare client-supplied ID. Service-role
operations remain server-only and must perform the same relationship checks. Public API
projections redact internal keys, PINs, private contacts and approval digests. Private
Storage policies follow the same owner and role boundaries.

## API dependence on JSON to replace

`server.ts` has hundreds of references to `getStoreInstance`, `MOCK_USERS` (a misleading
name for the operational user array), `persistStore`, and the `db*` wrappers in
`localDb.ts`. The route groups below need query and transaction replacements rather
than a single storage switch:

| Route group | Current JSON access to replace |
| --- | --- |
| `/api/auth/*`, `/api/users/*` | local credential/session records, signup guard, profile and linked account arrays |
| `/api/hostels/*`, `/api/manager*`, `/api/room-keys/*`, `/api/student/*` | residence/verification arrays, manager assignments, generated room keys and claims |
| `/api/issue-reports/*`, `/api/staff*`, `/api/meetings/*` | issues, staff roster/reviews/bargains, meeting lifecycle |
| `/api/digital-market/*`, marketplace messaging/rating routes | seller applications, stores, listings, reservations, orders, messages, reviews |
| payment/checkout/webhook routes | transaction references, fees, subscriptions and settlement settings |
| `/api/notifications/*`, `/api/admin/*` | recipient/read state, governance, proposals, settings and audits |

`localDb.ts` wrappers also return whole arrays and sometimes merge fallback arrays into
live storage. Replacing only those wrappers would leave direct JSON writes in `server.ts`
and services active. Routes must be switched by product workflow, then the old persistence
writer disabled. Verification needs an authorized and cross-account API matrix plus
restart persistence, RLS and rollback checks.

## Retired features excluded from active schema

- General/public chat, room DMs, manager-resident chat and manager-staff chat. Only
  buyer-seller conversations are supported.
- Public staff hiring/recruitment, arbitrary public staff creation and unrestricted
  public staff reviews. Resident-to-staff reviews within an active housing relationship
  and maintenance repair ratings remain supported.
- Housing booking applications and administrator manual resident enrollment. Activation
  uses room keys. Historical booking records, if retained, belong only in the encrypted
  old archive.
- Residence facilities/amenities/rules/policies and residence prices from legacy JSON.
  They are retired from registration, editing and public display. No new active columns
  or RLS rules should bring them back.
- Direct manager/hostel edits and single-admin destructive actions already retired by
  the API. The reviewed request and governance workflows are the supported paths.

## Migration consequence

Disposable local accounts and their linked operational records will not be imported.
The latest retention instruction (2026-10-09) preserves only identities with saved,
verified Google Auth evidence and exact local UUID/mailbox bindings. The private
preview distinguishes those accounts from removal candidates; linked-record and media
dependencies still require review. A full backup is recovery evidence, not permission
to restore test accounts into production. Earlier all-account reset previews are stale.
The local JSON and all uploads have a verified encrypted snapshot. At the initial audit,
Supabase had five existing Auth identities and no application tables or Storage objects.
The active schema has since been created without importing accounts or linked records.
An encrypted PostgreSQL archive including private tables and access controls passed an
isolated local restore rehearsal. Fresh stopped-writer backups are required at cutover. The
app remains on JSON until the relational schema, Auth integration, RLS and affected API
workflows pass positive and negative tests.
