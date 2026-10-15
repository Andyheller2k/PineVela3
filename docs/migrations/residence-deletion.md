# Supabase residence deletion

## Keyed execution handoff (migration 50)

The server-only `PINEVELA_RESIDENCE_EXECUTION_REQUESTS` gate defaults to `false`.
While disabled, `/execute` returns `503 residence_execution_unavailable` and the
UI shows no request button. Enabling it is a later acceptance/release step, not
part of installing this migration. The API server never runs archive restoration
or deletion subprocesses.

With the gate enabled, the genuine current founder submits their own approval
key and `DELETE APPROVED HOSTEL`. The server derives one immutable request from
their current final authorization; its deadline is the exact consent deadline.
No raw key, password, client-supplied actor, ownership or archive path is saved.
Retries reconcile the same request and do not duplicate notifications. Submission
returns `queued`; it does not claim records were deleted. Administrator status
shows request validity, actual execution time and confirmed Storage cleanup counts.

The separate trusted operator command is read-only by default:

```sh
npm run db:process-residence-execution
npm run db:process-residence-execution -- --execute
```

Execution handles at most ten saved requests. A per-request session advisory lock
serializes workers while the original encrypted database and Storage archives are
restored and verified outside any live transaction. The worker derives the exact
saved founder/session/key version, then rechecks live binding, approval and frozen
scope under exclusive housing admission. Domain execution and request completion
commit atomically; partial completion cannot commit. Provider images remain queued
for the separate Storage processor. A lost response reconciles completed receipts.

Changed or actually expired consent invalidates its request permanently. Restoring
access does not revive that consent; the founder must give fresh authorization.
Invalidation does not resume paused housing. Keyed preparation cancellation remains
available. Failed archive verification preserves pending history and cannot delete
records. Deployment must provision the private recovery files, PostgreSQL tools
and worker runner before enabling requests. Genuine provider-authenticated HTTP,
live queued-object removal and browser journeys remain release gates.

Migration 43 introduces immutable private residence payment references. Backfill
preserves genuine saved receipts; new quotes capture their original residence and
primary-owner metadata atomically. These historical identifiers provide no access
or ownership authority. Migration 46 replaces the operational payment foreign key
with the enforced retained relationship and a native deletion gate; public deletion remains disabled.

## Review, preparation and recovery evidence (migrations 40–42)

The replacement implements dependency preview, proposal, immutable own-key votes,
founder final rejection and administrator status notifications. Public execution remains
disabled in the API and UI until recovery and Storage cleanup are verified.
No existing proposal is executed by this migration. A later execution protocol must
require fresh previews and consent; current reviews advertise execution as unavailable.

Migration 41 adds `private.residence_deletion_preparations`, with immutable frozen/cancelled
history and no browser/backend table or helper grants. Starting requires a current approved
version-2 preview, two distinct keyed votes, the active founder's current own approval key
and `FREEZE APPROVED HOSTEL`. If two other administrators approved, the founder's consent
is recorded in the same transaction. Old version-1 reviews are invalidated. Pending
residence payments, in-flight photographs and manager-owned staff outside the reviewed
housing scope block preparation. At most ten pauses can exist; overlapping pauses/reviews
cannot be started.

The native guards pause modifications to saved housing records and new records linked
to their saved residence/room/context/profile UUIDs. They check both old and new links,
before cascades and after existing validation triggers, including native root DML
in READ COMMITTED transactions. Migration 42 rejects housing/preparation writes
at other isolation levels so an older snapshot cannot miss a committed pause.
Truncate cannot erase preparation history or bypass a pause. Normal authenticated
transactions take the shared freeze lock first; starting/cancelling takes it exclusively
before governance/context locks and waits for existing writers. Reads and unrelated
marketplace operations remain available. The pause persists across requests/connections;
no database transaction stays open during provider or backup I/O.

A founder own-key cancellation with a reason releases the pause and invalidates open
consent. Cancellation remains available when consent has expired, changed or been
rejected; none of these states silently resumes housing writes. Starting/cancelling,
actual status notifications and audit evidence commit atomically. Notices reach current
admins, saved primary owners and affected housing portals and never claim deletion.
The API reports blocked domain writes as `409 residence_preparation_paused`.

This is an application housing pause, not proof that project-wide writers or direct
Storage API activity have stopped. Backup creation, verified archive attachment, deletion,
cooldowns and recoverable Storage cleanup are not enabled by migration 41. An operator
must not treat a frozen preparation as an executed deletion or a final-reset backup.

Migration 42 adds private immutable `residence_recovery_evidence` for an existing
approved founder pause. The trusted operator command restore-tests the actual encrypted
PostgreSQL archive, verifies/reconstructs the paired Storage bytes, and checks the
archived pause against current native consent and the live complete media catalog.
It records a receipt, administrator status notice and operator audit atomically.
The operator audit has no fabricated founder/session actor; founder consent belongs
to the original authenticated preparation. Browser status exposes verification time
only. The table/helpers have RLS and no browser/backend grants or recovery HTTP/RPC.
See [Storage recovery](storage-recovery.md) for commands and interrupted-run recovery.

A receipt records historical verification, not permanent permission to delete.
Cancelled/changed preparation, changed catalog, older/cross-project archives and
different evidence for an already recorded pause are rejected. Exact retries recheck
the actual files and reconcile without duplicate notices. PostgreSQL independently
checks pause/consent/catalog, but filesystem restoration remains trusted operator work.
Operational execution must freshly reverify archives, consent and founder own-key
confirmation; it remains disabled. No cooldown, portal revocation or Storage deletion
is performed by recording evidence.

The authenticated active administrator may inspect a preview. Submission requires
their separate approval key and the exact server fingerprint. At least two active
administrators must have enrolled approval keys, including slot 1. The proposer counts
once; two distinct consents approve the review. The founder may be one of those voters,
or must provide additional own-key final consent after two other voters approve.
An independent rejection closes a pending or approved review. Only the founder can
record a final rejection with a server-stamped actor, reason and time.

The database stamps a 24-hour lifetime. Roster/key revisions, dependency snapshots
and append-only relevant lifecycle events invalidate stale consent, including changes
subsequently reversed. Unrelated residence changes and no-op writes preserve reviews.
Overlapping reviews are blocked; at most ten may remain open. Browser/backend roles
cannot mutate review evidence or call private dependency helpers. Status notices go
to active administrator portals under Admin Approvals, contributing to its unread count.
Owners receive no claim that deletion occurred while the action is only under review.

## Reviewed scope

Residence-only includes the selected property and its housing relationships, while
planning to retain manager sign-in. Combined removal expands to the selected manager's
other current assignments and property verification cases. Combined removal or a
registration cooldown requires exactly one saved current manager. Shared/inconsistent
ownership and a missing saved primary owner block submission; mailbox matching is absent.

The snapshot includes residences, manager assignments, blocks, floors, rooms, beds,
allocations, staff assignments, verification cases/inspections, change requests,
maintenance issues/events, repair/staff reviews, appointments, staff bargains,
residence payments, affected portal profiles, activation keys, scoped enrollments,
registration bans, applied policies and media metadata. The browser receives counts,
record IDs, affected account effects, primary recipients and media byte totals.
Raw dossiers, room-key codes, enrollment challenges and policy contents remain internal
to the fingerprint computation. Storage metadata alone does not prove object-byte recovery.

Deleting a residence cannot use an unchecked cascade: allocations, staff reviews,
media and financial evidence have foreign keys that require explicit ordering or
retained references. Unrelated marketplace accounts, orders, payments, administrators,
shared verified Auth identities and governance/audit history must remain protected.

## Verified cleanup planning (migration 44)

The private operator command re-verifies the actual database/Storage archives and
current frozen consent before recording an immutable cleanup plan:

```sh
npm run db:prepare-residence-cleanup -- PROPOSAL_UUID CHECKPOINT_UUID STORAGE_ARCHIVE_UUID
```

It derives candidates from the saved review, retains profile and marketplace images,
unfinished reservations, foreign housing bindings and references outside removable
housing rows. Reference checks include retained public/private data and unknown future
tables; matching text conservatively retains an image. Orphan objects outside the
review are never swept. Native guards independently recompute the exact plan and
catalog, require the verified receipt/current founder quorum, and reject edits,
deletes and truncation. Paths, owners and digests remain private with RLS and no
browser/backend grants. Admin status exposes only planning time and aggregate counts;
planning notices reach active admins under Admin Approvals. The operator audit does
not fabricate a founder session. Exact retries reverify files and reconcile once.

Plans are historical evidence, never deletion authority. The future worker must
freshly recheck archives, native references, consent and the founder's key before
operational removal or Storage API calls. Cancellation, changed catalogs/scopes or
changed reference decisions block reuse. No cleanup HTTP/RPC, Storage removal,
portal revocation or registration cooldown is enabled by recording a plan.

## Retained financial and governance targets (migration 46)

`private.residence_history_targets` captures only actual saved residences, including
their first captured owner/name and saved registration time. Backfill reflects actual
migration-time metadata; existing reviews retain their own exact snapshots. New
residence creation captures the reference atomically; native guards reject invented metadata, edits, erasure,
ID changes and reuse of a historical ID. These references are private, immutable,
protected by RLS and never used to authorize access or new onboarding.

Payments retain their original UUID through migration 43's financial reference;
approval targets now reference the immutable residence identity without `SET NULL`.
Existing proposal snapshots/votes, payment ownership, provider evidence and amounts
are unchanged. New proposals and quotes still require actual live relationships.
Deleting a residence cannot silently null its approval history or erase a receipt.

Replacing these two operational foreign keys does not enable deletion. Migration 48
permits residence DELETE only in its exact reviewed native transaction; TRUNCATE,
unpaused root DML and client-set configuration alone remain denied.
Existing preparation freezes, immutable review guards,
financial validation and access policies remain enforced. No live records, access
bindings or Storage bytes are removed by this migration.

## Retained housing media and enrollment targets (migration 47)

`private.housing_reference_targets` retains actual room, allocation, verification-case,
inspection and maintenance-issue identities with their original saved home/parent.
Parent types and actual live sources are checked natively; nullable case residences
stay nullable. Four media and two enrollment foreign keys reference retained targets
without `CASCADE` or `SET NULL`. Ownership/Auth links, source metadata and enrollment
state are unchanged. The private table has RLS and no browser/backend grants or RPC.
New bindings still require live operational rows; retained IDs confer no authority.

Source capture is atomic with creation and rollback. Native source IDs cannot change
or be reused, and retained identities cannot be edited, deleted or truncated. Ordinary
unbound source cleanup remains possible. Removing sources bound to media/enrollments
requires migration 48's exact reviewed transaction admission for DELETE. TRUNCATE
remains denied. Existing freezes
and the residence deletion gate remain enforced. Housing writers serialize before
native table locks during migration so backfill/trigger installation cannot race.

## Native execution core (migration 48)

The private worker admits only the saved current founder authorization in its own
native READ COMMITTED transaction/backend, after fresh trusted archive restoration
and exact receipt/catalog checks. It locks the known operational graph and refuses
unknown referencing relations rather than cascading through unreviewed data. An
admission cannot commit unfinished. Existing freeze guards grant only exact saved
row/operation effects; unrelated profiles, portals and financial/history rows remain
protected. No client or backend role receives table/helper grants or an RPC entry.

The worker cancels pending scoped invitations, closes and unbinds affected housing
portals, removes operational housing rows in dependency order and records the exact
cooldown at native execution time. Residence-only keeps manager login; combined
removal closes the manager portal while preserving its shared Auth identity and
other account portals. Zero creates no ban; months are 30 days and years 365 days.
Creator primary-account and administrator notices, audit, executed proposal/receipt
and pause release commit together. Lost responses reconcile the immutable completed
receipt with a current founder key; removal is never replayed.

Every approved exclusive image receives an immutable durable cleanup candidate and
its media state becomes `removing`. Migration 49 processes these tasks separately
through the Storage API. No SQL deletion of `storage.objects` simulates byte cleanup. The core is exercised only
in isolated restores; public `/execute` and preview/UI `executionAvailable` stay
disabled. Version-3 previews require new consent; older pending/approved reviews are
invalidated without silently releasing their housing pauses. Founder cancellation
remains available for those pauses.

Run the native verification against genuine saved Auth and the immutable application
checkpoint, without changing cloud records or objects:

```sh
npm run db:verify-residence-execution -- AUTH_CHECKPOINT_UUID MIGRATION_27_CHECKPOINT_UUID
```

## Storage processing (migration 49)

The operator command claims only completed reviewed tasks with native five-minute
leases and generated tokens. Concurrent claims serialize; failed and genuinely
expired attempts remain in history. Each attempt freshly verifies the original
encrypted database and Storage archives, exact saved scope, actual object identity
and full SHA-256 before removal. Current references and provider absence are checked
again before completion. Interrupted removal can be reconciled by a fresh worker
without replaying deletion. Completed approval, not an archived session or the
original review's remaining lifetime, delegates this narrow operation.

Queued media remains immutable retained metadata. New references and path rewrites
are denied. Native catalog deletion requires a prepared current lease; truncation
is blocked for queued history. The ordinary upload reconciler excludes these
assets. No provider paths, owners, proof, keys or outcomes are accepted from HTTP.
The processor is read-only by default; execution handles at most 20 jobs:

```sh
npm run db:process-residence-storage
npm run db:process-residence-storage -- --execute
```

Native/provider verification uses real private copies of the supplied cover,
genuine backed-up identities and isolated domain data. The actual Storage catalog
is replicated with `pg_dump`/`pg_restore`; disappearance is never fabricated with
SQL. Large timeout-ambiguous verification uploads require journal reconciliation,
not a claim that an immediate missing response proves the upload cannot finish.
Production writes and real authenticated HTTP/browser journeys remain separate
acceptance gates.

## Execution work remaining

The founder can record final keyed consent with `AUTHORIZE APPROVED HOSTEL` after
a verified cleanup plan is attached. Migration 45 stores immutable private consent
for at most five minutes, capped by review expiry. `/authorize-execution` accepts
only the founder key and explicit confirmation. It derives the review, scope,
session, current key version and cleanup/catalog digests on the server. Admin status
shows dates and current validity without session IDs or private proof. Concurrent
retries reconcile once; expired consent requires another keyed founder decision.
Cancellation, changed consent/plan/catalog, revoked binding or key/session changes
prevent use while invalid. Native expiry uses actual time, never a client deadline.

`/execute` still refuses operational deletion. The trusted core freshly restore-tests
exact archives and validates still-current authorization inside the execution
transaction; historical consent is insufficient.

Native dependency inspection after migration 45 found 82 foreign keys into housing
and account-context tables. Migrations 46–47 resolve retained payment, review-history,
media housing and enrollment target dependencies. Migration 48 implements native
worker admission and ordered operational removal. Retained marketplace, audit and notification rows also
reference account contexts; combined manager removal must revoke/close its portal
while preserving shared identities and historical relationships. These are schema
findings, not deletion candidates or authorization to remove live records.

1. Complete genuine authenticated provider/browser acceptance with controlled
   production writers, including retained bytes and interrupted-response retries.
2. Connect the verified worker to the keyed founder HTTP/UI action with fresh
   filesystem verification and native transaction rechecks. Account for independent
   project/Storage writers; saved receipt dates alone cannot authorize execution.
3. Complete positive/negative API, RLS and genuine browser journeys, including
   replacement residence registration after cooldown expiry, receipt retention and
   access recovery. Retaining manager login does not yet provide that new-residence
   registration journey.

The default JSON backend remains available until the complete Supabase cutover gates pass.
