# Reviewed system wipe consent

Migration 66 implements the [private operational closure core](operational-wipe-core.md).
Migration 67 adds the [durable reviewed handoff and operator worker](../operations/system-wipe-worker.md).
The live release gate remains off pending genuine acceptance; JSON remains the default.

Migration 65 completes the dependency review and pause boundary. All meeting relationship directions,
pending seller signups without a store, and directed officer invitations are included.
Saved enrollment rows are hashed in full. Delivery receipts, notification content
and recipient identity pairs are retained separately from mutable targets; read and
popup acknowledgments do not change consent. Their writers serialize with the pause.
Existing frozen wipes must be cancelled before installing this protocol change.

The planner uses actual `proposed`/`declined` bargain states and limits resident-only
effects to the selected occupant's saved relationships. It does not propose closing
an old occupant's repair report or revoking an unclaimed room key solely from room
membership. Withdrawing maintenance access must retain repair and confirmation
evidence; a worker cannot invent those timestamps to satisfy a constraint.
Verification: 104 scope, 64 planner and 106 primary lifecycle checks passed, with
genuine Auth bytes unchanged and no live closure.

Migration 58 (`20261012235439_reviewed_system_wipe_consent.sql`) implements
scope previews and administrator consent. It does **not** implement execution.
Default startup still uses JSON until the final cutover is verified.

The user's normal-wipe decision is to **retain verified logins and account
history**. Selected operational portals are intended to close, residences to
withdraw and stores to close; historical, financial and governance records,
notifications and Storage bytes remain. Administrator portals and their keys
are protected, including when an administrator also owns a selected primary
portal. This is separate from the migration's reviewed fresh-start reset.

| Scope | Intended operational targets | Portals preserved |
| --- | --- | --- |
| Residences | Current residences and their resident/staff portals | Managers, primary users, sellers |
| Markets | Current stores and their seller portals | Residents, managers, primary users |
| Managers | Manager portals, assigned residences and their resident/staff portals | Independent primary/seller portals |
| Residents | Resident portals and live room access | Residences, managers, shared-mailbox sellers |
| Primary users | Primary portals and their owned operational portals/residences/stores | Administrator portals and verified Auth |
| All | All non-administrator operational portals, including officers | Administrator portals and verified Auth |

Selections are distinct and canonically ordered. All cannot be combined with
another selection. UUIDs come from saved relationships; email resemblance and
client-supplied ownership selectors never authorize a target.

The preview lists exact accounts, residences, stores, linked record identifiers,
counts and unresolved obligations. Full-row digests bind dependencies without
returning credential hashes, session tokens or provider checkout details. The
current keyed administrator roster and protected domain/roster revisions are
part of consent. This phase conservatively invalidates consent on **any** tracked
housing/account/market domain change; changing data and restoring it does not
restore old consent. Normal notification reads do not invalidate it.

All five active administrators must enroll separate approval keys. A proposal
records only the proposer's own approval. Four different current own-key votes,
including the founder, are required within 24 hours. Any independent rejection
closes the review. Five votes leave operational data unchanged. The founder
then supplies their own key, a reason and `APPROVE WIPE BACKUP` or
`REJECT APPROVED WIPE`; the former approves preparation only. Every transition
records an audit receipt and notifies current administrator portals atomically.
Saved scopes, votes, final decisions and history are immutable. A failed receipt
or notification write rolls the transaction back.

The review/decision routes live under `/api/admin/governance`. They verify
the native session and active administrator context, strict bodies and optional
current-context headers. Write grants recheck the key version and lockout. SQL
guards enforce quorum, founder authority, freshness and immutability independently
of Express. New helpers are private, invoker functions with no public, anon,
authenticated or scoped-backend execution grants. Existing proposal/vote RLS
and private revision protections remain. No new public RPC or SECURITY DEFINER
function is introduced.

`POST .../proposals/:id/execute` remains unavailable even with a current key.
`POST /api/admin/clear-all-registered-accounts` returns authenticated-admin 410
guidance; the former single-administrator wipe cannot reach JSON from Supabase.

## Recovery preparation (migration 59)

`20261013003111_reviewed_system_wipe_recovery_preparation.sql` adds private
preparation and immutable recovery-evidence tables. After current five-admin votes
and final founder backup consent, the founder enters their own approval key and
`START WIPE BACKUP`. Starting or retrying creates at most one preparation record;
it does not close portals, pause writers, delete records or extend the 24-hour
consent deadline. The founder can cancel with their own key and a reason, including
after the review becomes outdated. Cancellation invalidates old consent; its
preparation, votes and evidence remain as history.

The trusted operator runs:

```sh
npm run db:prepare-system-wipe-backup -- <proposal-uuid>
```

This creates an encrypted full database checkpoint with private recovery keys,
restores it locally, backs up actual Storage bytes, reconstructs every encrypted
object locally and records evidence only after archived and current preparation,
scope/roster revision, five-vote quorum, founder consent and Storage catalogs match.
No bytes or archive metadata supplied by the browser can establish this proof.
PostgreSQL cannot verify filesystem decryption/restoration directly: a private
operator module verifies actual archives and supplies the native checked proof.
The native guard independently verifies current consent and catalog bounds.

For interrupted operator work, preserve its private journal and completed files.
Re-verify existing files without creating new backups using:

```sh
npm run db:prepare-system-wipe-backup -- <proposal-uuid> <database-checkpoint-uuid> <storage-archive-uuid>
```

Exact retries reuse the immutable evidence and do not duplicate notices/audits.
Different archives cannot replace it. Failed transactions roll back evidence,
notifications and audit together. Archive/project mismatch, tampering, outdated
consent, unsupported isolation or changed catalog fails closed. The administrator
page exposes preparation state and recovery timestamps/counts, excluding private
archive bindings and hashes. All five active administrators receive transitions;
technical operator verification does not impersonate a founder session.

These are preparation snapshots, **not a durable writer freeze or execution
authorization**. Record/catalog changes require new consent and backups. Current
status means the reviewed data and Storage metadata still match; it does not assert
that every provider writer is paused. A later execution protocol must independently
freeze writers, re-verify bytes and obtain fresh keyed founder execution consent.
Do not use this evidence as a permission to delete live data or JSON.

Migration 60 below adds the scoped write pause and fresh execution consent.
Next work is safe operational closure and retained primary/seller re-entry. Inspect the existing
primary-context status constraint and membership/portal guards before designing
execution; closing a primary portal cannot simply bypass those invariants. Do not
invent Auth users, delete historical evidence, enable execution gates, perform a
live wipe or remove JSON to test this workflow. Genuine five-administrator browser
consent still needs five real active keyed administrators; isolated native checks
do not establish that acceptance.

## Scoped write pause and final consent (migration 60)

`20261013081232_reviewed_system_wipe_scope_pause_and_final_consent.sql` adds
private pause and final-consent records. After the five-admin review, founder
backup decision and preparation, the founder supplies their own current approval
key and `PAUSE REVIEWED WIPE`. Only one wipe scope may be paused at a time. Open
orders, unsettled payments, scoped photograph uploads/cleanup, active email verification and
overlapping residence preparations block admission. An earlier unpaused recovery
receipt requires cancellation and a fresh review before a pause can start.

Native statement locks serialize pause transitions and domain writers under READ
COMMITTED. Row guards check both old and new identifiers, including newly inserted
dependencies, portal relationships and selected Storage paths. The existing private
metadata-only trigger boundary is extended; its residence execution restrictions,
revoked grants and outer RLS checks remain. No new SECURITY DEFINER function or
public RPC is introduced. No-op updates remain harmless. Truncation cannot bypass
a pause. Verified Auth and administrator recovery access remain available.

Unrelated writes remain possible. The conservative migration-58 domain revision
still invalidates consent when those tracked records change, even after reversal.
An expired/outdated review does not silently release its pause. Keyed founder
preparation cancellation releases it atomically and preserves all review, pause,
recovery and final-consent history. No timeout or retry closes or deletes data.

The operator must create new database and actual Storage-byte recovery files after
pausing. Restored preparation and pause identity/time must match the live review;
pre-pause archives cannot attach proof to a paused preparation. Storage metadata
guards do not certify arbitrary external object-byte writes are impossible. Actual
byte verification remains mandatory, including before a future execution worker.

After verified post-pause recovery, the founder supplies their own key again and
`AUTHORIZE REVIEWED WIPE`. Final consent binds the exact scope, native catalog,
pause time, genuine Auth identity/session and approval-key version. It expires
within five minutes and never beyond the review deadline. Exact retries preserve
the original deadline. Consent from another founder sign-in cannot be reused by
the new sign-in. Changed keys, sessions, roster, data/catalog, maintenance state,
cancellation or expiry make it unusable. Failed receipts roll back the entire
transition. Status exposes state and times, excluding private session/key/archive
bindings. Every transition reaches current administrators through notifications.

`POST .../proposals/:id/pause` and `.../authorize-execution` use the same strict
body, selector, session/context, own-key and write-budget boundaries. **Execution
remains disabled**, even after final consent; there is no operational closure,
Auth deletion, Storage deletion or JSON removal in this migration. Safe closure
and verified retained primary/seller re-entry are the next implementation work.

Additional verifier: `npm run db:verify-system-wipe-pause --
<genuine-auth-backup-uuid> <migration-27-application-backup-uuid>`.

## Read-only closure plan (2026-10-13; no new migration)

`npm run db:plan-system-wipe-closure -- total` derives a candidate plan from the
current native preview. Other scopes use the same names as the review protocol:
`hostels,markets,managers,residents,users`; `total` must stand alone. An optional
second argument is a saved proposal UUID. Its scope, fingerprint and currentness
must match; a pending proposal is explicitly not treated as approved consent.

The command runs one PostgreSQL **read-only, repeatable-read** transaction. It
exports exact affected IDs, proposed status transitions, application-binding
counts, retained history, schema constraints and unresolved requirements to a
private, exclusively created file under `.security/migration-reset/system-wipe-closure/`.
It exports no session UUIDs, keys, credential hashes or provider responses. Its
digest identifies the advisory snapshot; it is **not** recovery evidence or an
execution grant. No HTTP route, schema object, cloud record or release gate is added.

Effects cover portal/store/residence closure, ended selected allocations and employment,
revoked room keys and manager grants, unpublished listings, cancelled subscriptions,
withdrawn maintenance access with evidence retained, unfinished meetings/bargains,
invalidated pending residence changes,
cancelled unfinished enrollment and affected application-session revocation.
Completed financial, inspection, order, review, notification and governance history
and actual Storage bytes remain. Native Auth sessions remain; closed portal checks
and application binding removal must deny old portal access. A shared verified
mailbox never expands the selected portal into its sibling portal.

The planner detects open orders/payments, overlapping residence pauses, unfinished
uploads and active email verification. It separately queries all current meeting
relationship directions and reports any dependency missing from the saved preview.
It lists pending inspection cases whose closure protocol still needs implementation.
The proposed effects are a dependency audit, **not executable instructions**; the
native execution protocol must independently authorize and validate every transition.

### Required lifecycle changes identified in current source

| Current invariant | Required implementation before execution |
| --- | --- |
| Primary context check requires `status = 'active'` | Allow reviewed closure only through native execution admission. Retain the same Auth/profile/context IDs, ownership and history. Re-entry needs a completed normal-wipe receipt and fresh verified identity; it must not reopen suspended/rejected accounts or bypass retained access policies. |
| One seller application and store per seller context | Preserve old store, payments and approval history. Add an explicit registration generation with a fresh store ID; new approval/setup/registration payment must bind that generation. Do not revive an old store or reuse its paid access. |
| `sellerStatus`, Auth projection and setup/payment joins assume one store/application | Make current-generation selection explicit across these queries and public catalog/ordering checks before permitting more than one historical generation. A uniqueness change alone is unsafe. |
| Administrator membership/removal guards refer to an active primary context | Review those checks for a retained, closed primary context without closing the independent administrator portal or losing founder recovery access. |
| Saved seller approvals and inspection evidence have immutable transition guards | Retain the original decisions. New registration requires new evidence; unfinished work must receive a separate closure outcome rather than rewriting an old approval as a rejection. |

Implement the native closure transaction after resolving these invariants. Admission
must bind the current paused scope, fresh restored recovery/Storage proof and
unexpired founder session/key consent. Use one transaction-bound execution receipt;
permit only its exact status/key/binding effects through the pause guards, emit
affected-account notices, validate completion, then release the pause atomically.
Roll back all effects if consent, history protection, notices or completion checks
fail. Do not enable the live execution gate as part of local verification.

Verification: `npm run db:verify-system-wipe-closure-plan --
<genuine-auth-backup-uuid> <migration-27-application-backup-uuid>` passed 41 isolated
native checks. All public/private/Auth/Storage table digests remain unchanged by
planning and rejected inputs. Tests include scope combinations, shared-mailbox
isolation, protected admins, saved/stale/mismatched reviews, private output and
PostgreSQL's rejection of writes inside the planning transaction. The live `total`
inspection also completed read-only; it does not authorize its listed candidates.

Verifiers: `npm run db:verify-system-wipe-reviews -- <genuine-auth-backup-uuid>
<migration-27-application-backup-uuid>` and `npm run db:verify-system-wipe-recovery --
<genuine-auth-backup-uuid> <migration-27-application-backup-uuid>`. All positive destructive-scope scenarios
use a disposable Unix-socket restore with genuine archived Google subjects and
native sessions; no cloud proposal, vote, operational wipe or provider response
is created as test data. Live checks use read-only previews and denied requests.

## Primary-only lifecycle implementation

The native primary-only closure and Google re-entry core is documented in
[primary-wipe-lifecycle.md](primary-wipe-lifecycle.md). It resolves the primary
status/receipt boundary for eligible scopes, while rejecting mixed operational
scopes. Migration 63 adds supported verified email re-entry. Live execution remains disabled. The read-only
planner now distinguishes that native capability from the unfinished operational
closure work; seller generations (62) and email re-entry (63) are implemented at their
stated verification levels. Its output still grants no mutation authority.


### Seller re-registration implementation map (source audit, 2026-10-13)

This source audit guided migration 62; seller generations/re-entry are now
implemented as described in [seller re-registration](seller-reenrollment.md). General
market closure remains unfinished and disabled. Preserve the same verified student identity, original primary
owner and seller portal, including the independent resident portal/PIN when shared.
Each new registration needs its own approved application and fresh store ID. Old
orders, payments, reviews, messages, branding and access periods retain their saved
store foreign keys; old approval/payment must not activate the new registration.

| Layer | Current assumption to change together |
| --- | --- |
| `enrollment.ts`, `ownedEnrollment`, portal PINs | New-account reservation rejects an existing Auth email. A dedicated retained-seller path must verify the exact owned student identity and PIN/policy state, preserve the sibling portal, and serialize concurrent retries. Use a server-verified provider proof; never adopt an identity by email equality. |
| `sellerRegistration.ts`, `private.seller_application_details` | Submission looks up the sole application by seller context; status rejects more than one result. Add immutable registration generation and select the current one explicitly. Retain previous approvals; don't overwrite them to manufacture a fresh submission. |
| `check_seller_application`, store relationship guard | Enrollment/application/store generation links must agree natively. Approval must create exactly one new store for that application; stale decisions cannot reopen old stores. Preserve existing uniqueness until all current-generation readers are ready. |
| `auth.ts`, `storeSetup.ts`, `payments.ts` | Auth selects the first context store; setup and payment authorization join any approved context application. Bind the current store to its exact current approval before supporting historical stores. Fresh registration fee starts its own two-month access period. |
| Native `store_eligible`, public catalog, inventory/order/message callers | Current eligibility joins an approved application by context. Eligibility must match the exact store registration. Existing order/payment/message foreign keys continue to identify historical records; distinguish history reads from new mutation eligibility. |
| UI registration and account status | Present verified re-registration separately from new identity creation; preserve notification routing to the original primary owner and require a new administrator decision before setup/payment. |

Before implementation, trace `orders.ts`, `marketConversation.ts`, `media.ts` and
callers of `sellerStore`/`store_eligible`, including delayed payment fulfillment and
public projections. Copy no old provider credentials and reopen no old paid store.
Native acceptance must cover two registration cycles, fresh store/payment identity,
old callbacks/approvals, wrong owner/proof, bans, closed/paused states, concurrent
retries, retained history and shared resident isolation. Use isolated genuine-auth
restores; do not create cloud test identities or weaken closure gates for fixtures.
