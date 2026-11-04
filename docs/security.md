# PineVela Security

## Optional visitor analytics — 28 October 2026

The GA4 bootstrap loads its one external tag only after a separate browser-level
analytics choice. Terms acceptance does not grant it. Tracking uses known general
page names and normalized locations, with sensitive auth/invitation/onboarding/
payment-return paths and query keys excluded. Account identifiers, field values,
private messages and complete referrer URLs are not supplied to the tag.
Advertising/Google signals stay off. Withdrawal disables the tag before further
calls and clears accessible analytics cookies. See
[analytics setup](google-analytics-setup-2026-10-28.md) for consent, production-host
restriction, Google stream settings and the local-versus-hosted test boundary.

## Agreement evidence — 28 October 2026

Saving the live account's own current Terms at `POST /api/legal/accept` is exempt
from the manager operation key. Session authentication, exact consent/version
validation, authorized transaction checks and the immutable receipt still apply.
Manager business writes retain their key requirement. The agreement gate mounts
before the key prompt, so it cannot depend on that prompt to save acceptance.

Terms acceptance is an additional product-access prerequisite, never proof of
role, ownership or housing authority. The server validates the exact current
document version and records the authenticated subject/session/context. It does
not accept identity selectors, hashes or timestamps from a consent request.
Merchant submission rechecks verified enrollment/ownership and the separate
student declaration before committing an application and versioned receipt in
one transaction. Private legal tables retain RLS and have no browser grants.

The authenticated agreement screen mounts before private page/notification
providers and does not poll or initialize CAPTCHA. Every protected API request
uses the indexed receipt check in the existing session-query round trip.
Support, supported self-closure, account status/appearance and logout remain
available without agreement. Optional AI sharing and marketing are not bundled
into Terms acceptance. See `docs/auth.md` for the endpoint/versioning contract.

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

Migration 69 supports the temporary local Google manager enrollment policy. The
server requires the explicit development flag, direct loopback host and peer,
non-production mode and no public origin. It verifies a real provider code with
server-held PKCE/state/cookie/nonce, the exact Google email and native live session,
then revalidates the original primary actor and owned enrollment. Existing PineVela
profiles/contexts cannot be adopted. Initial OAuth account creation grants no app
role; the private initializer remains inaccessible to browser/scoped backend roles.
No primary auth cookie is replaced; provider proof tokens never reach the client.
No RLS policy, public grant, inspection or approval boundary is relaxed. Later
production email-delivery acceptance remains required. See
[Google enrollment boundaries](migrations/google-manager-development-enrollment.md).

Manager-application corrections require the original primary session and owned verified
manager-identity enrollment, current generation and pending assigned inspection shell.
Body IDs cannot replace those relationships. Restrictions, active inspections, final or
withdrawn cases prevent edits. Captured account guards reject stale sessions. Old reports
cannot approve changed property details; original targets and review evidence stay in
private audit history. No RLS/grant changes support this path. See
[correction boundaries and verification](migrations/manager-application-corrections.md).

Reviewed pure administrator reads may share the settings advisory lock through
explicit server-selected read wrappers. Mutations and status helpers that expire
reviews or write receipts retain exclusive locking. Both paths revalidate the same
live subject/session/context/role, access policies and RLS scope. Request methods
or client flags cannot choose the weaker lock. See
[concurrency evidence](migrations/administrator-read-concurrency.md).

Migration 67 adds only private invoker queue guards; no public grants or broader
RLS. Founder/session/key/version/scope deadlines are immutable. A worker derives
authority and recovery identifiers from native receipts, re-verifies actual files
and commits exact closure plus request outcome together. Request/worker release
requires one exact server-only flag, which remains disabled. Preview never writes.
See [operator boundary](operations/system-wipe-worker.md).

Migration 66 adds a private invoker operational core, inaccessible to browser and
scoped-backend roles. Native founder/key/session, five-vote scope, restored proof,
transaction-bound exact changes and atomic outcome/audit checks remain mandatory.
Withdrawal markers and dependent evidence cannot be rewritten or extended. The
public execution gate remains disabled. See [protocol](migrations/operational-wipe-core.md).

Migration 65 extends the existing metadata-only pause trigger to retained delivery
notices. Statement locks precede row reads; old/new relationship checks see a
committed pause after waiting. Own read/popup timestamps remain mutable and do not
invalidate consent. The new enrollment predicate is private, invoker-only and
unavailable to browser/scoped-backend roles. RLS/base grants remain unchanged;
the metadata trigger grants no ownership or account access. Execution stays disabled.


## Scoped wipe pauses and final consent (migration 60)

Current five-admin/founder consent and the founder's own key authorize a scoped
write pause only after unsettled work is resolved. Native READ COMMITTED statement
locks and old/new-row guards prevent target changes and new dependencies, including
selected Storage paths. Existing metadata trigger privileges remain revoked and
outer RLS/ownership checks still apply. No new SECURITY DEFINER function is added.
Unrelated tracked changes invalidate consent without releasing the durable pause.
Founder preparation cancellation releases it and preserves immutable history.

Final consent requires actual restored post-pause database/Storage recovery. It
binds the founder Auth session, key version, exact scope/catalog and pause time
for at most five minutes. Another sign-in cannot reuse it. Expiry, cancellation,
maintenance or changes to keys/session/roster/data/catalog make it unusable. API
bodies cannot supply verification proof; state projections exclude private bindings.
Native scope pauses protect metadata rather than certify arbitrary external byte
writes are impossible; real bytes must be reverified before any future execution.
Execution remains disabled; this protocol closes/deletes no live data or identities.

## Private projection boundary (migration 54)

Owner-executed read projections are isolated in the unexposed `private` schema,
with no SELECT/write grants for browser roles. Supabase's Data API must keep that
schema excluded. Catalog APIs use `pinevela_catalog`, a non-login role with no
inherited roles or BYPASSRLS, six filtered catalog reads and four boolean publication
checks. Account APIs use the existing bound backend role and saved ownership filters.
No base-table permission or RLS policy is broadened to support projection joins.

Private projections deliberately retain owner execution for vetted joins to private
profiles and relationships. They are not a substitute for RLS or proof of a fully
completed cutover. Test both the actual projection filters and the HTTP/Data API
boundary. New projections require explicit column/row/grant review; never expose
the private schema or restore direct browser grants to fix a failing query.

## Reviewed execution request boundary (migration 50)

The public API accepts only the proposal identifier, the caller's private key
and explicit confirmation. Authenticated sessions and native relationships
derive the founder, authority, scope and archive identifiers. A server-only
release gate defaults off. No request body or frontend flag can enable it.
Native request insertion independently verifies current founder/session/key
and exact short-lived authorization; direct role/helper grants are revoked.
No raw credential, client ownership assertion or external-I/O proof is saved.

The separate trusted worker holds a per-request session lock while restoring
real encrypted archives, with no database transaction open during restoration.
It rechecks current authority under exclusive housing admission before applying
the existing exact execution protocol. Request completion and domain execution
are atomic; deferred native guards reject partial completion. Lost responses
reconcile immutable receipts. Changed or genuinely expired consent invalidates
the request without resuming paused housing or reviving archived authority.
Fresh founder consent or keyed preparation cancellation remains necessary.
Positive provider-authenticated HTTP/browser acceptance remains pending.

## Reviewed Storage cleanup boundary (migration 49)

Only an immutable task from an actually completed reviewed execution can be
claimed. Invoker-only lease helpers have no browser/backend table or EXECUTE
grants. Native five-minute leases serialize workers and preserve failed/expired
attempts; tokens, dates and terminal history cannot be forged or extended. The
operator freshly restore-verifies the actual original database/Storage archives
without reactivating archived approval or login authority. It verifies provider
identity and full image hash before deletion, then rechecks actual absence before
recording completion. Missing objects require explicit `NoSuchKey`; permission,
bucket, route and transport failures cannot be treated as successful removal.

Three private deny-only trigger guards use a fixed empty search path and revoked
EXECUTE grants to inspect private queue state for ordinary table/Storage callers.
They grant no new table/RLS permission or RPC access. Queued metadata cannot be
mutated by ordinary reconciliation; queued paths cannot be replaced or acquire
new references. Storage catalog deletion requires a current prepared lease,
unchanged object identity and unshared scope. Truncation cannot erase queued
history. SQL cannot prove external I/O: provider observations and real file
verification remain trusted server responsibilities. Unknown or unguarded
relations block cleanup. Independent privileged writers must still be controlled
for production acceptance and final reset. Public execution remains disabled.

## Reviewed residence execution core (migration 48)

The private invoker-only worker has no browser/backend table or helper grants.
Admission requires READ COMMITTED, the originating native transaction/backend,
actual current founder Auth session/binding and own approval-key version, unexpired
final consent, exact saved scope/catalog and the trusted archive-verification receipt.
The trusted wrapper restore-tests the actual encrypted database/Storage archives
outside the mutation transaction; SQL cannot verify filesystem bytes. It rechecks
native consent and references after acquiring exclusive housing admission.

Native guards permit only exact reviewed DELETEs and narrowly defined portal,
enrollment, media and cooldown effects. Source-graph locks and an unknown-child-FK
check prevent unchecked cascades. An unfinished admission cannot commit; failures
roll back housing, access, cooldowns, receipts and notices together. Shared Auth,
profiles, financial/governance history and unrelated portals receive no exemption.
Completed receipts and cleanup candidates cannot be edited or reused as authority.
Caller-set confirmation alone grants no removal access. Public `/execute` and UI
execution remain disabled pending public integration and authenticated acceptance.

## Retained media and enrollment targets (migration 47)

Six operational foreign keys now reference private retained housing identities.
Native capture derives only actual saved kind, residence and parent relationships;
forged metadata, source UUID changes/reuse and retained-history mutation are denied.
New housing-media/enrollment bindings still require live source rows. The private
table has RLS, revoked browser/backend grants and invoker-only helpers with no RPC
access. Bound-source DELETE requires migration 48's exact native worker admission;
TRUNCATE and the public execution gate remain closed;
caller-set configuration cannot authorize removal. Existing media ownership,
immutable origins, enrollment lifecycle and frozen-scope guards remain enforced.
Installation takes the housing advisory lock before source-graph table locks so
concurrent native writes cannot escape atomic backfill/capture installation.

## Retained residence history (migration 46)

Financial and governance references retain actual saved residence identities rather
than cascading or nulling their original targets. Native capture verifies the exact
live source and immutable original metadata. History cannot be fabricated, altered,
erased or used to recycle a residence UUID. It has RLS, no direct browser/backend
grants and invoker-only helpers without RPC access. New reviews and quotes still
require live native authorization. Replacing operational foreign keys does not
weaken frozen-scope guards: residence DELETE is blocked outside migration 48's exact
native admission, and TRUNCATE remains blocked. An unpaused root transaction or
caller-set execution configuration alone cannot authorize removal.

## Final residence execution consent (migration 45)

Only the authenticated founder with their separately checked current approval key
can record final consent after explicit confirmation. Server sessions and native
relationships determine every identity and digest; request-supplied ownership or
proof fields are rejected. Immutable private consent expires within five minutes
and cannot outlive its review. Native checks require current founder/quorum consent,
the original frozen preparation, matching receipt/cleanup plan, live session/binding,
current key version and catalog. Dates are native; no caller can extend consent.
Invoker helpers have no direct browser/backend grants or RPC exposure. Consent,
admin-only notification and genuine founder audit commit together; concurrent
retries reconcile without duplicate history. No freeze/RLS/history guard is bypassed.
The future worker must independently reverify real recovery files and native validity
before deletion; recording consent alone never enables operational or Storage removal.

## Residence cleanup planning (migration 44)

Cleanup plans require current frozen founder/quorum consent, an immutable recovery
receipt and freshly reverified real archives. Invoker-only native helpers and guards
recompute saved housing membership, every retained public/private reference and the
exact catalog. No browser/backend table or RPC grants are added. Plans reject updates,
deletion and truncation; plan, admin-only notice and operator audit commit together.
Retries reconcile exact proof without duplicate notices. Historical plans grant no
execution or deletion authority. The original freeze/payment/history guards remain
active; no Storage API removal or orphan sweep is performed.

## Residence payment retention (migration 43)

Private reference rows require an actual payment and the exact saved residence
relationship. Native guards reject edits, deletion and truncation; capture functions
use invoker privileges, an empty search path and no callable browser/backend grants.
New references and quotes commit or roll back together. Historical owner/name fields
provide no authorization, payment proof or portal access. Existing payment RLS,
immutability, checkout evidence and operational residence foreign keys remain intact.

## Residence review boundary (migration 40)

Migration 41 permits only the active keyed founder to start a durable housing pause
after current two-admin consent and an explicit freeze confirmation. Native before/after
guards check saved IDs and old/new foreign keys and prevent cascade/truncate bypasses;
there is no browser-callable privileged helper. Ordinary transactions take the shared
freeze lock before account-policy, maintenance, governance and actor/context locks;
start/cancel takes it exclusively first. Preparation history is immutable except for
keyed founder cancellation with a native actor/time/reason. Cancellation works after
consent closes and invalidates still-open consent. No stale consent silently releases
the pause. Failure rolls back the pause, founder vote, targeted notices and audit together.
Old previews are invalidated; overlapping pauses and unsettled residence payments/media
fail closed. This pause does not establish a project-wide freeze, revoke Supabase Auth,
delete housing/Storage data or attach recovery evidence. Those execution gates remain
unavailable. Primary owners receive actual pause/resume notices before entering a portal.

Migration 42 rejects housing/preparation writes outside READ COMMITTED and explicitly
sets that isolation in server transactions. A private operator worker restore-tests
actual encrypted archives and attaches immutable historical evidence only to a
still-current approved founder pause with a matching complete Storage/media catalog.
No request-supplied proof, browser RPC, backend table grant or fabricated founder
session is used. Receipt, admin-only notice and operator audit roll back together;
exact retries create no duplicates. Native guards independently check consent/scope/
catalog; external file restoration is trusted operator responsibility. Cancellation
invalidates further attachment. Final deletion must freshly verify actual archives,
provider state, consent and founder key; evidence attachment does not enable it.

Dependency previews require a verified active administrator portal. Proposal/vote
and founder final rejection require that actor's own approval key, never a settings
key, another administrator's key or body-supplied ownership. Native SQL enforces
two distinct votes, exact reviewed options/dependencies, enrolled founder availability,
roster/key revisions and 24-hour expiry. Immutable lifecycle evidence invalidates
relevant changes even when reversed. Invalid/overlapping reviews fail closed;
notifications, votes and audits commit together. Raw private snapshots stay internal.
Lifecycle tables have RLS and no public/browser/backend grants; metadata triggers
use a fixed empty search path and no exposed execution grant. The HTTP execution
endpoint remains disabled pending verified Storage cleanup and acceptance. The
native transition requires migration 48's exact worker admission. No operational deletion or signup cooldown is
applied by migration 40. Later local browser coverage and remaining acceptance scope
are recorded in the isolated acceptance report.

## Account approval review boundary (native Supabase)

The verified active administrator portal and its own current approval-key version
authorize account proposals, votes and founder final rejection. Settings/other-admin
keys, client ownership fields and stale expected-context headers confer no authority.
Private-key failure counters commit before denial. SQL requires five current keyed
administrators, immutable votes/evidence and current roster/lifecycle revisions.
Reversing lifecycle or roster changes does not revive prior consent. Administrator
targets require their separate membership protocol. Browser/backend roles cannot
write reviews or call private review helpers. Migration 38 snapshots saved target
descendants/ancestors and records append-only lifecycle events. Unrelated signups
and sibling portals do not invalidate a leaf review; shared Auth identities do not
merge their consent. The internal trigger resolves saved UUID links with a fixed
empty search path, restricted source tables and no callable role grants. Outer domain
writes retain their session/ownership authorization. SQL guards prevent forged/reversed
revision values or arbitrary event insertion, alteration and deletion. The backend's
former revision UPDATE grant is revoked. Pre-38 reviews require new consent.

Approval, rejection and closure notifications belong to the exact reviewed active
admin portals and the Approvals module. Mutations, notices and audits are atomic.
Migration 39 enables policy application only after five current distinct approvals,
the founder's current own approval key and exact final confirmation. Native triggers
derive policy/epoch values from immutable executed review evidence and stamp the
actual actor/time. Direct policy mutation, epoch erasure and execution replay are denied.
Saved primary/portal and manager/staff links carry policies; administrator portals and
same-mailbox sibling portals retain their separate boundaries. Restoration cannot
override an inherited policy or revive an older actual Auth session. Provider identities
and shared Auth session records are preserved; server and RLS check saved per-portal
epochs against actual session creation times, including after timed ban expiry.

API transactions serialize policy application before actor checks. Restrictive RLS
denies banned/old-session private data, alongside original ownership policies; public
seller projections hide banned stores. Native guards independently restrict enrollment,
room claims, new orders, publishing/evidence, buyer-seller messages and new maintenance.
Publishing restrictions preserve the existing verified order-stock trigger, with exact
nested order/listing evidence; direct stock edits gain no exemption. The own-context
status endpoint and sign-in projection supply live restriction notices without exposing
internal policy lookup RPCs. Applied notices reach saved affected portals and their
primary owner. Review/apply/status SQL checks used isolated genuine Google identities
and unchanged actual sessions; no fresh provider session was fabricated.

Deletion/wipes still need reviewed dependencies and database plus Storage-byte
backup/cleanup. Real signed-in browser acceptance, genuine post-policy provider
sign-in and elapsed expiry journeys remain verification gates.

## Administrator announcement gateway (native Supabase)

Directory, preview and send require a live account-bound administrator session and
active membership, rechecked inside the transaction. Client sender/owner aliases and
unsupported fields are rejected. A private, sender-bound 15-minute preview stores the
normalized group/explicit-account selection and actual active recipient portals.
Sending re-resolves current eligibility and locks recipients; changed selections need
a new preview. A completed token accepts only identical content and returns the saved
receipt, including after concurrent requests or reconnects. Notification, recipients,
completion and private audit commit together. SQL guards defend immutable delivery
snapshots, sender identity, message bodies and final fanout. These are one-way notices,
not general chat. Sending preserves the existing admin authority rule; it does not
change settings or destructive approval-key requirements.

Recipient RLS binds each inbox/popup acknowledgement to its exact current context.
Parent ownership and a shared Auth identity do not expose another portal's notification
or dismissal. The seller market filter includes received admin announcements. Popup
dismissal leaves the notification and its read state intact. Context headers check stale
requests only; the session remains the source of authority. Frontend account changes
remount gateway/popup state and ignore late responses. Provider-authenticated HTTP and
browser journeys remain acceptance checks; isolated tests send no live announcements.

## Administrator settings credentials (native Supabase)

Active administrator membership and a live account-bound Auth session are required.
Settings keys use salted scrypt with the administrator context and `settings` purpose;
approval keys cannot authorize settings. Enrollment is one-time and requires an actual
Auth session created within five minutes. Session refresh does not extend that window.
SQL independently enforces ownership, fresh enrollment and immutable key metadata.
Reviewed recovery now uses two other active administrators' separate approval keys.
The proposer counts once, the target cannot vote, and either key can be recovered.
Immutable consent expires after 24 hours; monotonic roster/key revisions invalidate
outstanding reviews. The second approval atomically clears only the selected key,
rotates its version, invalidates older administrator sessions, and commits audit and
exact active-administrator notices. Refresh does not produce a new Auth session.
The target must sign in again with the actual provider and enroll a replacement key.
The founder's key can be recovered without removing founder membership. Wipe workflows still await migration.

Suspension/restoration require the active founder's current approval-key grant, with
server-derived session/role checks repeated after the shared settings lock. SQL guards
protect the founder, immutable membership ownership and timestamps, and reject generic
administrator context deletion or status changes. Each transition advances a membership
session epoch; old sessions remain denied after restoration, including direct RLS and
account switching. Keys, identities and governance history are preserved. Notifications
include only active administrators, the affected admin and its primary account.

Permanent administrator removal requires founder-keyed proposal, exactly four distinct
eligible approvals excluding the target, a fresh 24-hour appeal window and a separate
founder-keyed final confirmation. Appeal text/decision reasons are in a private RLS table
with no browser/backend grants and are projected only to the founder and target.
Submitted appeals cannot expire into execution: the founder must accept or reject them.
Accepted appeals revoke authority without deleting historic votes. Roster/key revisions
invalidate unfinished reviews. SQL separately enforces proposal/vote/appeal transitions,
immutable snapshots, server deadlines, quorum and exact confirmation. Removed contexts
and memberships remain as immutable history; keys are deleted and portal access is
revoked. Auth/primary identities are preserved. Slot reuse excludes removed memberships.
All authenticated administrator transactions take the settings lock before actor row
locks to prevent a target request deadlock during context closure. Failed execution rolls
back keys, context, membership, audit and notifications together. Actual authenticated
provider HTTP/UI journeys and the elapsed 24-hour no-appeal path remain acceptance gates.

Five failed settings-key attempts lock that administrator's settings access for 15 minutes.
Denials commit before the HTTP error, so counters survive restart. Approval attempts
remain separate and have their own five-attempt, 15-minute persisted lockout. Receiving-account changes recheck the session, active membership,
key version and lockout after the real Paystack read. Browser/backend roles cannot read
key hashes or write private configuration. Destination changes retain other settings
and preserve existing immutable payment quotes; audit and administrator notifications
commit together. Paystack accounts must be active, verified, GHS and in the configured
environment. Only the last four bank-account digits are returned.

See [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) and
[Paystack subaccounts](https://paystack.com/docs/api/subaccount/). An actual fresh Google
administrator enrollment and selecting a verified non-default provider subaccount
remain acceptance checks; no Auth sessions or provider accounts are fabricated.

## Verified administrator invitations (native Supabase)

Only active administrator #1 with their current approval key may reserve or cancel an
invitation. The private token is shown once and stored as SHA-256, with an exact 24-hour
deadline and immutable mailbox, slot, issuer key version and existing Auth UUID binding.
An actual Google/email-verified primary session, mailbox ownership and token are all
required. Existing non-primary portals are excluded. Membership insertion independently
requires the same grant in SQL; token possession or client identity fields alone cannot
promote an account. Issuer key/status changes immediately close invitations, including
later reversals. Acceptance creates empty private credentials and commits audit/notices
atomically. It does not generate a password, Auth user or administrator key.

Private invitation redirects allow only their exact route and a valid token, rejecting
foreign origins, fragments and added parameters. Tokens remain in URL/OAuth state rather
than browser storage, are removed from the route after acceptance, and are excluded from
roster/history responses. Browser/backend roles cannot read the table or invoke its
privileged functions. Real provider sign-in and authenticated invitation UI remain gates.

## Shared pricing approvals (native Supabase)

Pricing proposals require three distinct active administrators' settings-key approvals.
The proposer contributes one approval; administrator #1 must make the final keyed push,
even if other administrators supplied all three votes. The server derives every actor
from the live account binding and rechecks the credential version and lockout inside
the write transaction. Failed guesses commit separately before returning a denial.

Immutable proposals expire after 24 hours. Membership, key and price revisions invalidate
outstanding proposals, including changes subsequently reversed. Final execution serializes
with other pricing/settings writes and locks the actual memberships and keys. Competing
final pushes cannot both apply the same baseline. Audit, exact active-administrator notices
and the saved execution commit with the prices; a vote alone never updates live pricing.

Browser and ordinary backend roles cannot write private settings or invoke the privileged
pricing function. The application pricing writer requires the approved-proposal protocol.
Trusted PostgreSQL-owner configuration changes remain possible and invalidate outstanding
reviews; those operator privileges are not granted to client requests. Settings-key enrollment
and receiving-account writes acquire the same settings advisory lock before credential locks.
Future key and membership lifecycle ports must preserve compatible transaction lock ordering.
See PostgreSQL [transaction locks](https://www.postgresql.org/docs/18/explicit-locking.html).
Positive provider-authenticated pricing HTTP/UI journeys remain an acceptance gate.

Keyed public-setting requests accept contact details, announcement text, boolean maintenance
state and restoration message text. They reject pricing, actor/ownership assertions and unknown fields. Social links
must use HTTPS on supported social domains without credentials or custom ports; WhatsApp
uses normalized country-code digits. Live membership, session and key version are
rechecked inside the same locked write transaction. Identical retries create no repeated
notices; changed announcements target active non-admin portals rather than administrator
accounts. The private configuration ACLs and notification recipient RLS remain unchanged.

## Platform maintenance (native Supabase)

Only an active administrator with their separate settings key may change maintenance state.
Ordinary actor transactions and public invitation/catalog reads hold a shared maintenance
advisory lock before session/record locks; transitions take the exclusive lock first.
Activation waits for those in-flight database transactions. Both privileged actor lifecycle
writes and backend RLS transactions then reject non-admin operations with HTTP 503.
Restrictive policies cover every current public table; existing explicit projection views
also check maintenance access. New public tables and projections must preserve this boundary.
Direct Storage reads continue to require the current bound context, which maintenance hides.

The request guard runs before upload and JSON parsing. Health/public settings, logout and
administrator authentication remain available. Password/Google binding verifies the actual
selected context before saving a session; rejected provider sessions are signed out. An
administrator cannot switch to a paused ordinary portal. Signed payment webhooks remain
available to reconcile financial evidence; they still authenticate and reverify payments.
Provider authentication callbacks already underway may confirm an Auth identity; application
portal binding still refuses non-admin access. Provider signup/delivery acceptance needs real testing.
External transfers already started cannot be rolled back with PostgreSQL. Upload failure
cleanup and provider-result recording retain their narrowly scoped system writes.

Restoration requires nonblank message text and atomically records a 24-hour notice, its
exact existing active non-admin recipient contexts, audit and active-admin notifications.
Private notice tables have RLS and no browser grants. The backend reads only the latest
eligible notice and updates only its own recipient's dismissal column. SQL stamps dismissal
and prevents resetting it, changing recipients or acknowledging expired/old notices.
No client identity or timestamp establishes eligibility. Later contexts are excluded from
the saved audience. Positive fresh provider login and authenticated UI remain acceptance gates.

## Verified payment boundary (native Supabase)

Checkout prices, payer email and ownership come from the verified session and saved
relationships. Actor-scoped request UUIDs preserve immutable quotes; store/residence
locks serialize fulfillment. Raw-body webhooks authenticate with Paystack HMAC-SHA512
before parsing and reverify the transaction server-side. Redirects and initialization
responses never grant access. Verified status, reference, amount, GHS currency, live
environment, payer and configured receiving account must match the saved quote.

Access, payment audit and exact account notifications commit together. If eligibility
changes after a genuine payment, retain its evidence for review without granting access.
Browser roles cannot read private provider evidence or mutate payments/access intervals.
Payment requests and provider concurrency are bounded; ambiguous checkout initialization
retains its reference for verification rather than submitting another charge.

Public callback origins must be explicitly configured HTTPS URLs; local loopback is
allowed for local checks. No wallet PIN, card authorization or server key is exposed.
Actual paid checkout/webhook delivery, refunds and reviewed payment resolution remain
release gates. See [Paystack verification](https://paystack.com/docs/payments/verify-payments/)
and [webhook authentication](https://paystack.com/docs/payments/webhooks/).

## Supabase runtime boundary

The default native backend verifies tokens with Supabase Auth, checks the live
Auth session and trusted account binding, and assumes a non-BYPASSRLS database role for
request transactions. Client ownership/role fields never populate this binding. Revoked
sessions fail RLS before JWT expiry. Primary-owner links do not permit signing into a
sub-account: its student/work identity must be verified and authenticated. Shared student
identities also require the selected portal's access PIN; RLS checks the accepted key
version and changing a PIN invalidates earlier proof. Failed PIN attempts are serialized
and persist before returning a denial; five failures lock that portal for 15 minutes.
Private enrollment, keys and founder provisioning remain server controlled. The legacy
JSON/custom-session backend is removed; see the isolated acceptance report above.

The manager operation guard preserves separate secret-key authorization.
Only salted scrypt hashes are stored; five wrong attempts lock the key for 15 minutes.
Accepted key versions are checked again inside the mutation transaction, so reset invalidates
earlier proof. First issuance is shown once; recovery requires an administrator-reviewed
petition and native settings-key decision. Narrow first-property bootstrap paths
remain exempt only when the manager has no active residence assignment.

Photos use private Supabase Storage and an immutable portal/Auth-owned registry.
Uploads authenticate before the 28MB parser, decode actual raster pixels, strip metadata,
resize to 2048px and cap output at 6MB. Daily account/global quotas serialize in PostgreSQL;
IP admission and worker limits are bounded per process. Browser writes are denied. Attachment
triggers enforce account, purpose and inspection relationships. Image responses check current
publication/plan or private account access and verify digest/size, with a sandbox
CSP. Private photographs remain `private, no-store`, without generated ETags. Published marketplace and residence photographs
use `private, no-cache, max-age=0, must-revalidate` and an immutable asset/digest ETag.
Every conditional read rechecks publication and maintenance before 304; hidden, removed
or unauthorized media cannot use that response. No image gets an unchecked cache lifetime.
Verified public catalogue replies also carry `X-PineVela-Public-Photo: 1`. Android's
dedicated 20MB photo cache accepts only these PNG replies with valid asset/digest ETags
and no `Set-Cookie`; every new retrieval still validates with the server. Private,
withdrawn, malformed and cookie-bearing replies cannot populate that cache. Generic
API/session replies and the WebView media proxy remain `no-store`. Native session
cookies are merged only from actual network headers, never cached response metadata.
The app does not persist catalogue photos in a service worker, localStorage or Preferences.
Failed transfers are reconciled through Storage APIs; ready assets are never removed by
the stale-upload cleanup command. Ordinary API JSON bodies are 1MB. IP admission remains bounded per process;
multi-instance deployments need shared ingress limits. Encrypted byte backups now bind
the private object/catalog manifest to a fully rehearsed PostgreSQL checkpoint, including
interrupted-upload orphans; corruption, changed catalogs and missing ready bytes block
completion. Normal image reads still require the original reservation digest. The operator
orphan-backup method grants no browser access, and no new RLS/RPC grant is introduced.
Native database and Storage recovery remain separately verified operator procedures. See [Storage recovery](migrations/storage-recovery.md). Owned avatar media
was introduced in migration 35; later local Auth/Storage/browser coverage is recorded in
the isolated acceptance report. Maintenance
report photographs use the original resident allocation or reporting manager residence;
repair photographs use the exact accepted staff assignment and ticket. Related readers
are the reporter, assigned managers and exact active assigned staff. Parent portals and
unassigned staff receive no access. All transitions recheck saved relationships under
transaction locks; completion needs acceptance, and resident reports need original active
allocation sign-off before closure. Generic edits cannot change ownership or workflow.

Native order writes derive the primary buyer or exact seller from the live verified
session and saved store relationship. Client prices, emails, owner IDs, PINs and commissions
cannot assert order ownership or terms. Stock and request UUID checks serialize in PostgreSQL;
browser roles cannot write raw orders, access private history or read PIN ciphertext. Only
the exact buyer receives an active decrypted challenge. Five failed handover attempts commit
before returning denial and lock the challenge; buyer renewal has a one-minute cooldown,
rechecks current stock/plan eligibility, rotates the challenge and invalidates the previous PIN.
Wrong/missing encryption keys fail closed. Completion history never stores the submitted PIN.
The private server key is encrypted in checkpoint backups and is never a browser environment
variable. Revocation and duplicate/completion races have been tested with committed transactions
in isolated real restores. The isolated acceptance report records subsequent actual local
provider/API/browser checks and their limits.

Native buyer–seller message reads and writes require the exact primary buyer or approved seller portal.
Client-supplied emails, names, sender identity and listing titles are rejected; store/buyer/item
selectors are checked against saved relationships. A seller cannot initiate unsolicited chat,
and admins and linked parent accounts have no private conversation access. Messages are
append-only in PostgreSQL, with sender-scoped idempotency and transactional recipient notices.
Reviews require the exact buyer's completed, handover-verified receipt. SQL rejects receipt
reassignment; raw browser writes are denied. Public review projections expose purchase display
names and feedback without private email, account or order IDs. Late inbox/review responses
are discarded after account changes; unchanged message retries retain their request UUID.

## Officer and Staff Lifecycle

Officer authorization requires the current active registry entry and its matching session,
including when a cached user copy contains an older token. Disabling an officer or suspending,
removing or resigning staff revokes associated sessions. Reactivation requires a new login.
Staff access additionally requires explicitly active employment in the manager's residence.

## Onboarding submissions and approval keys

The primary owner submits manager registration through its exact verified enrollment.
An assigned officer submits the native inspection report; physical approval activates
only the saved pending manager/property. Full residence setup is a separate registration
and review. Manager, seller and residence approvals require the current administrator's
own separate approval key. Wrong guesses commit before denial; the mutation rechecks
live membership and key version. Role labels, body ownership fields or UI prompts alone
cannot authorize approval. Report authorship and review/audit attribution are server derived.

## Attempt and resource budgets

Native API/auth/room-key admission and live stream limits are bounded per process;
PostgreSQL persists portal/key failed-attempt state and serialized media quotas. Native
IP admission is in memory and is not a durable global limiter across replicas.
General API bodies are 1MB, authenticated photograph bodies 28MB and avatar bodies 7MB.
Image and credential work use bounded asynchronous queues. Forwarded addresses are
trusted only with explicit `PINEVELA_TRUST_PROXY` IPs/CIDRs and ingress controls.
The retired JSON writer and `request-limits.json` are not deployment dependencies.

## Photograph uploads

Housing/market/inspection/maintenance/repair/avatar uploads authenticate the exact
eligible portal and saved purpose relationship before processing. JPEG, PNG and WebP
inputs require matching signatures, strict base64 and actual pixel decoding; metadata
and appended content are stripped. Processed owned assets are reserved transactionally,
uploaded to private Supabase Storage and marked ready only after the provider operation.
Daily account/global media quotas serialize in PostgreSQL. Image reads verify current
scope, stored digest and size; private attachments are not public catalog assets.

No raw `/uploads` directory or alternate legacy media host is served. Archived originals
remain private recovery material; the local image writer, disk quotas and
`PINEVELA_MEDIA_ORIGIN`/`PINEVELA_UPLOADS_DIR` serving instructions are retired.

## Marketplace Purchase Reviews

Both review submission endpoints require the primary buyer's authenticated session and
an exact buyer-ID relationship to a stored `Completed & Paid` order. Bodies accept only
`orderId`, integer `rating` (1–5) and optional `review` (at most 4,000 characters).
Buyer attribution comes from the session; seller, store and item come from the order.
The service URL must match that order's item. One review belongs to one purchase; only
its buyer can edit it, without changing its identity or original creation time.

Public listings, catalog scores, seller status and order review attachments use only
purchase-verified records with consistent receipt ownership. Legacy unverified reviews
remain privately stored and do not count toward reputation. Public review responses omit
buyer email/account IDs and order IDs. Sellers can read reviews, but cannot submit or edit
on a buyer's behalf. Native unique receipt relationships, transactional review upserts
and RLS enforce completed-purchase ownership.

## Marketplace Order Prices and Quantities

Own-store purchase/review rejection uses persisted store, application and linked merchant
relationships. Client-supplied identity is never proof of ownership. Notification recipients
for new marketplace messages, reviews and status changes are exact accounts or seller stores.

Order prices, totals and category snapshots come from the stored product, never a browser
price. Optional category selectors must identify exactly one stored category; an ID/name
pair must agree. Prices use integer pesewas for total calculations. Quantities must be
JSON numbers that are positive safe integers. Invalid catalog prices, inventory and totals
fail closed, including corrupt historical orders at completion.

Orders reserve quantity for 24 hours at creation. Active reservations reduce available
capacity; rejection, cancellation, completion and expiry release the reservation. Completion
rechecks stock against other reservations, deducts physical stock and marks the order
complete in one PostgreSQL transaction with store/listing/order locks. Request UUIDs make
retries idempotent. Terminal orders cannot be reopened. Authorization and RLS remain
independent constraints on these transactional changes.

Marketplace orders require the primary buyer's session. Buyer ID, email and name come
from that session. Seller authority uses the current seller account's exact store, not a
matching buyer or parent email. Only the assigned seller can confirm, reject or complete;
the buyer may cancel their own active order. Administrators cannot impersonate either actor.

Allowed transitions: Awaiting Seller Confirmation → Pending Meetup, Location Rejected or
Cancelled; Pending Meetup → Completed & Paid or Cancelled. Completion requires both seller
agreement and the buyer's valid PIN. Unsupported/conflicting actions and protected request
fields fail before mutation.

Delivery PINs use six cryptographic digits, expire after 24 hours and lock after five failed
attempts. Attempt counters persist synchronously, including concurrent requests and restart.
All order responses use a field allowlist; PINs appear only for the exact authenticated buyer
while active. Seller/admin responses exclude PIN material, counters and reservation internals.
Completion notes never record a submitted PIN, and private order responses cannot be cached.
Only the buyer can renew a PIN and reservation, with a one-minute renewal cooldown and a
fresh stock check. Previously exposed/unversioned PINs cannot complete orders; buyers must
renew them. Orders without a trustworthy buyer ID cannot obtain a PIN through an email alias.

## Security Boundary

The browser is untrusted.

Supabase verifies the Auth identity; PostgreSQL rechecks its live session and exact
active portal binding on each authorized transaction. Revocation, account closure,
assignment loss and key/PIN version changes invalidate access independently of JWT
expiry. The old local token-hash session store and raw-token login responses are
removed. No profile/session endpoint exposes provider tokens or private key hashes.

Browser cookies are HttpOnly, SameSite=Strict and Secure in production. Native CSRF
checks deny foreign-origin/cross-site writes. Browser restoration, logout and account
switches clear or ignore stale identity/query state; successful logout confirms server
revocation before navigation. A client role, email or ownership field never replaces
these server-derived relationships.

Never assume that:

* a hidden button prevents access
* a disabled form prevents access
* a client-provided role is correct
* a client-provided user ID is correct
* a client-provided hostel ID is authorized

All sensitive operations require server-side authorization.

---

## Authentication

Authentication establishes identity.

Authentication does not automatically establish authorization.

After authentication, the server must determine what the authenticated user is permitted to access.

---

## Authorization

Authorization should use server-side relationships.

Example:

```text
session user
    ↓
profile
    ↓
manager assignment
    ↓
hostel
```

Do not trust:

```text
request.body.managerId
request.body.hostelId
request.body.userId
```

as authorization evidence.

---

## IDOR / BOLA

Every endpoint accepting an object identifier must verify that the authenticated user is authorized to access that specific object.

Example:

```text
GET /api/hostels/:hostelId
```

must not simply check:

```text
user is authenticated
```

It must determine whether that user is authorized to access the specified hostel.

---

## Privilege Escalation

Prevent users from changing their own:

* role
* ownership
* manager assignment
* hostel assignment
* staff assignment
* payment ownership
* allocation ownership

through client-controlled fields.

---

## Cross-Hostel Isolation

A manager assigned to Hostel A must not be able to:

* read Hostel B's private management data
* create staff for Hostel B
* modify Hostel B's rooms
* modify Hostel B's allocations
* access Hostel B's private records

---

## Database Security

Supabase Row Level Security should enforce appropriate data boundaries.

Do not disable RLS simply because an application query is inconvenient.

If privileged server-side access is necessary, document why and ensure the server performs the required authorization checks first.

---

## Sensitive Credentials

Never commit:

* service-role keys
* API keys
* SMTP credentials
* payment secrets
* private signing keys
* production passwords

Use environment variables or the appropriate secret-management mechanism.

---

## Security Testing

Security-sensitive endpoints should test:

1. Unauthenticated access
2. Authenticated unauthorized user
3. Authorized user
4. Cross-user access
5. Cross-hostel access
6. Identifier spoofing
7. Role manipulation
8. Ownership manipulation

Passing the UI flow is not sufficient evidence of authorization correctness.


## Private Verification and Resident Records

Administrator directories require an active administrator. A manager may read only its
own allowed verification/registration records; an active verification officer may read
only explicitly assigned inspections through its current native officer context/session. Query IDs, matching email addresses and
report authorship do not grant access.

Inspection GPS is a reported device measurement, not proof of a physical visit.
Location failures must remain missing data with an actionable error; never substitute
coordinates, accuracy or a property address. Capture results belong to the selected
inspection and must be ignored after switching cases or accounts. Report viewers
must distinguish missing checklist entries, observations, signatures and submission
times from recorded evidence. An officer recommendation is separate from the final
administrator decision; a new report requires an explicit recommendation choice.
The server continues to derive the assigned officer, report author and submission
time from the current authorized session. Development applications cannot establish
genuine physical-inspection acceptance.

When approving against an officer recommendation, the administrator must supply an
explanation under the existing native decision rule. The approval dialog captures
the current administrator context, blocks duplicate submission, and requires a
saved-state refresh after an uncertain reply. It cannot replace the submitted
report, current manager assignment or server-side activation checks.

In the Supabase manager dashboard, housing-control eligibility follows the native
`isApproved` reviewed-setup flag. The manager-approval residence status alone cannot
unlock those controls. Native publication, staff invitation and room-key issuance
continue to enforce their separate saved residence-review requirements.

The manager's `my-hostel` read first resolves its property under the manager's
live-session RLS role. Its room/bed summary then uses a server-authorized read
that rechecks the same live session and exact active manager assignment before
returning any hierarchy rows. This avoids repeatedly evaluating nested room
and bed RLS policies for a large residence; direct table access remains under
the existing RLS policies.

Resident directories are private. Administrators may view assigned residents; approved
managers may view assigned residents only within their authorized residences. Primary
accounts and unallocated records are excluded, and directory responses must not include
contact emails, room activation keys or credentials. The legacy `/api/public/registered-residents`
URL is a protected alias, not a public directory. Private list responses must not be cached.


## Room Activation Keys

Room keys are activation secrets. Administrators may access residence keys; approved
managers may access keys only for their authorized residences, and active manager-created
staff may read existing keys only for their roster residence. An empty authorized result
must remain empty. Explicit ownership IDs take precedence over email and residence names.
Authorize the residence before generating keys; database reads must not generate keys.

Verification and activation require a primary-account session. Verification exposes only
the minimal room preview needed for onboarding, excluding occupant and manager contact
records. Verification and activation aliases share an account budget of ten requests
per fifteen minutes per verified Auth identity, plus the API's ten-per-minute IP
budget. These bounded budgets live in each backend process; a process restart
clears them. They return HTTP 429 with `Retry-After` when exhausted. Private key
responses must not be cached.

New room keys use the server-saved block prefix (or block-name initials when no
prefix exists), followed by four cryptographically random uppercase letters/digits.
Ambiguous I/O/0/1 characters are excluded. The global unique-code index prevents
reuse, including revoked codes; bounded `ON CONFLICT` retries retain transaction
atomicity. Generation, individual release and annual reset use the same allocator.
Existing keys retain their validity until an authorized lifecycle action replaces them.

New manager authorization codes contain six cryptographically random digits,
stored only as salted scrypt hashes. They remain separate from session login and
expire on replacement rather than on a timer. The persisted five-failure,
fifteen-minute lockout and live key-version checks still apply. An authenticated
manager may replace their own long key only with proof of that current key;
rotation invalidates stale proofs, reveals the new code once, and records a
secret-free audit event/notice. Previously issued long keys remain accepted until
replaced; administrator recovery retains its independent settings-key requirement.


## Maintenance Actions

New report creation resolves the resident's active room and property on the server.
Form-supplied resident identity cannot impersonate another account; a supplied hostel ID
must match that relationship. Managers may report only within their assigned residences.

Every maintenance workflow endpoint must authorize the actor against the current issue
and enforce its state transition before mutation, audit updates or notifications. Property
ownership, active staff assignment and the exact reporting resident's active room relationship
are server-side authority. Supplied staff contacts/names and shared emails cannot grant access.
Generic detail updates cannot write workflow fields. Resident sign-off requires staff completion;
manager closure of resident reports requires that sign-off. Concurrent confirmation must not
create duplicate repair reviews. Administrator management access does not permit staff or
resident impersonation.


## Meeting and notification record access

Meeting access uses native manager assignment, residence and exact participant/context
relationships. Requesters read their own permitted appointments; route and RLS boundaries
remain separate from display labels. Legacy name/email aliases do not grant access.

Notifications have exact native recipient contexts with independent read and popup
acknowledgement rows. A linked account or an administrator does not inherit another
portal's private inbox. API projections expose the requesting account's state, not other
recipients. Browser read/toast caches are account scoped and update only after successful
server acknowledgement. The retired JSON `readBy` representation is not consulted.

## Historical JSON storage and current recovery

The JSON writer, custom token store and offline credential/restore commands are removed.
Their writer leases, local TTLs and `.bak` policy are historical details. All legacy records
were explicitly classified as development data and privately archived with hash verification.
Native Auth/profile/context UUID sets were retained unchanged. Current database and Storage
recovery use their separate authenticated encrypted archives; private recovery paths must
remain inaccessible to HTTP/static/Vite serving. No legacy session or identity is reactivated
by restoring an archive to a separate offline directory.

## Administrator destructive operations

System wipes require exactly five active, independently enrolled administrator approvals
bound to an immutable, expiring proposal and server-derived deletion preview. Administrator
#1 explicitly executes after quorum; single-password wipe routes are retired. Membership
changes invalidate proposals. Administrator removal needs four approvals excluding the target, followed by a 24-hour
plea window and main-administrator confirmation. Key recovery needs independent approval. Active admin
status is checked on every request, and generic resets cannot take over another admin.
Encrypted verified recovery and an external audit precede deletion; partial execution fails
closed across restart. See [setup, boundaries and recovery](admin-governance.md).


Administrator platform settings and profile changes additionally require a separate,
owner-bound settings key. Pricing changes require three to five distinct administrator
approvals and a final application by administrator #1; direct settings writes cannot bypass
this, and no vote alone changes prices. Immutable pricing proposals expire after 24 hours
and invalidate on roster/key or live-price changes. Announcement and maintenance changes
retain their single-actor settings-key policy. Every pricing vote/final push uses the
settings key rather than the wipe approval key.

Wipe keys cannot authorize settings/profile changes. Key/password attempts are
limited and lost-key resets require two other administrators. Maintenance authorization
is server-enforced for all non-admin roles and existing sessions, with administrators
retaining access to restore service. See [administrator setup](admin-governance.md).

Service discovery uses the existing public live catalogue. Seller coordinates must be finite
latitude/longitude pairs in geographic bounds; Fixed and Hybrid publication requires an
explicit seller pin. Listing updates keep authenticated ownership checks, and bookings at
the seller location derive coordinates from the stored listing, ignoring buyer overrides.
Device location is a discovery hint, not proof of identity, proximity, ownership or authority.
PineVela neither stores it nor accepts it as an authorization boundary. Browser location
can be spoofed; authenticated seller coordinates do not attest physical presence.
OpenStreetMap receives map tile requests. Drawing a waypoint trail shares only the selected
start, destination and travel mode with the configured Valhalla routing provider, without
account cookies or referrers. Explicit GPS following can reroute from the current location;
it stops on close/stop and pauses in background tabs. No device location or route is saved
to PineVela storage. Requests have cancellation, timeout, size/geometry validation and rate
limits; failures never become invented direct-line routes. Selected points are also shared
with Google when opening its external directions link. See [navigation](map-navigation.md).
Profile pin labels
use DOM text and profile images use permitted local/public-storage URLs.


## Reviewed Residence Changes and Manager Operation Keys

Direct hostel PUT/upsert and the legacy manager-assignment editing route cannot modify
properties. Structured requests derive manager identity from the session and validate current
residence assignment; allowed fields are enforced before storing a request. New image
references must belong to that manager’s validated hostel uploads. Review receipts are
bound to the administrator, request fingerprint and a 30-minute expiry. Approval/rejection
requires the approval key; manager-key resets require the independent settings key.

Manager operation keys contain 256 bits of random entropy and are stored only as a
purpose/account-bound SHA-256 digest. Constant-time comparison and persistent five-attempt,
15-minute limits protect verification. The authenticated middleware checks manager
business mutations, including residence uploads, staff and room operations. Initial residence onboarding,
key issue/recovery and server popup delivery receipts are explicit lifecycle exceptions.
An avatar upload and the manager-only picture endpoint are also exempt: both are bound
to the active verified Auth identity, and the latter accepts only a picture field.
Display-name and contact edits continue through the protected general profile route.
Keys cannot be retrieved after issuance. Reset removes the old digest; only that manager
receives the replacement. Business changes, notices and cooldown timestamps persist across
restart. Popup acknowledgement does not delete a notice or mark it read.

Approved merchants may upload account-owned branding while their store is in
`pending_setup`. Pending applicants and other roles cannot use this exception.
Public storefront visibility, listing publication and order acceptance continue
to require active paid market access; draft photos never grant those capabilities.

Residence setup in the native backend resolves ownership from the live manager
assignment and previously approved physical dossier. Property identity/map changes,
unowned media, active registration bans and conflicting retries are rejected. Full
submission writes hierarchy, case, notices and audit atomically. Public shell/photo
visibility and room activation cannot be enabled merely by manager-account approval.

Residence review approval rechecks the saved active manager assignment, accepted physical
report, actual room/bed layout and ready photo ownership. Case decisions are idempotent
and immutable after final approval/rejection; property rejection does not revoke its manager
identity. The private administrator residence roster is unavailable to other portal roles.

Residence corrections require the current assigned applicant and an existing request
for more information. The same physical identity, restrictions and owned-media checks
apply. The prior submission and review remain in private audit history. Contact/photo
corrections preserve room identities; layout replacement is limited to unused pending
setup with no keys, allocations, enrollments, staff or maintenance history. Publication
still requires a new normal approval. See [correction evidence](migrations/residence-corrections.md).
The administrator review dialog reloads private saved case details before enabling
an explicit decision; expired authentication cannot appear as a successful save.
Private review metadata remains restricted to administrators. Setup-review state
and current publication are separate; closed/withdrawn/final cases are not actionable.
See [administrator review evidence](migrations/admin-residence-review.md).

## Supabase Transport Failures

The native backend caps server SQL statements at 15 seconds and client reads at 30
seconds. Client transport errors have a sanitized listener, including while checked out.
Interrupted or timed-out transactions discard their connection and return a temporary
error. They never automatically replay writes; a lost commit response can be ambiguous,
so callers must refresh saved state before retrying. Certificate verification stays enabled.


## Supabase staff invitations

Staff invitation creation, renewal, cancellation and roster edits require the verified
manager portal, current operation key and a live assignment to the target residence.
Creation and activation also require approved residence setup. The staff signup trigger
rejects wrong/expired nonces, revoked managers and mismatched mailboxes. Public staff
invitation endpoints require the private invitation token in the request body, obey
origin checks and the authentication IP budget, and grant no access before confirmed
provider identity proof. Raw tokens appear only when issued to the authorized manager;
passwords and token secrets are never saved in enrollment fields or notifications.

Ending or suspending employment removes its saved portal bindings. Retained Auth
identities, maintenance tickets and evidence do not grant departed staff access. Contact
updates cannot change login email, ownership, role, residence or arbitrary avatar paths.
Mailbox signup/delivery and positive authenticated provider/browser journeys still need
end-to-end verification before cutover; transactional SQL checks do not prove them.

## Staff retention and private review boundary

Only the exact active staff employment may submit retention proposals or choose whether
to stay/resign after rejection. The recipient is the saved creating manager with an
active residence grant. Decisions require that manager’s verified portal and operation
key; administrators cannot substitute for the employment manager. Original proposal
terms, relationship IDs and completed decisions are immutable. Ending employment revokes
portal bindings, cancels unresolved proposals and preserves review/repair evidence.

Resident staff review authors and allocation IDs come from their verified activated portal.
Staff must be active in that same residence. Body ownership fields, foreign assignments
and non-integer/out-of-range ratings are rejected. Private views and raw-table RLS deny
other portals/residences and departed staff or residents; assigned managers retain history.
No public staff reviews or automatic maintenance-generated staff reviews are supported.

## Meeting appointment boundary

The server derives creators and recipients from verified portal relationships. Internal
contacts come from the actual active allocation/employment in the manager's residence;
body name/email/phone aliases cannot override them. External contacts have no account
access. Participant views do not expose a same-residence contact directory to staff.
Raw appointment RLS denies uninvited staff, other portals and foreign residences.

Only the saved manager with an active grant and current operation key may decide or
remove appointments. Participants can only cancel their own appointment. Approval and
rescheduling recheck the original active allocation/employment. Final decisions,
original identity/contact snapshots and history survive removal and cannot be reopened.
SQL triggers protect relationships and lifecycle independently of request validation.

## Seller registration review

Only the primary owner of the exact verified seller enrollment may submit or resubmit
its application. The saved enrollment and subject must still be eligible; profile,
owner and context relationships are rechecked under locks. Application bodies cannot
provide login credentials or override identity/ownership. Raw application writes remain
unavailable to browser roles. A scoped status view exposes only the saved owner/seller
or active administrator, and revoked administrators lose review access.

Housing managers cannot approve sellers. An active administrator decides a pending
application; rejection needs actual feedback. Rejection can be revised through a new
submission version with the earlier full record retained in private audit. Final review
cannot be silently rewritten. Registration bans are checked at submission and approval
in both SQL and the API. Approval creates an unpaid, unpublished pending store.
## Store profile authorization

The Supabase setup/edit APIs resolve the saved approved store from the authenticated
seller context and recheck the live session. Submitted store/owner IDs, student email,
payment status and plan assertions are rejected. Metadata, owned-media checks, private
audit and seller-only lifecycle notifications commit together. Browser database roles
cannot directly modify store profiles or payment/subscription records.

## Inventory authorization

The private inventory endpoint and listing mutations require the live approved seller
context and saved store relationship. Store/user/email/plan/rating assertions from a
request never establish ownership or benefits. Public catalog reads cannot become
private reads through query parameters. Listing IDs select a resource only after
the store is resolved; another active paid seller still cannot edit it.

Manual stock and gallery/price-option limits are checked server-side. SQL independently
protects immutable store/type/attachment links, required owned cover photographs,
paid publication, reserved stock and retired evidence. Retiring preserves purchase
history rather than cascading through orders. Browser roles cannot perform raw writes.
Seller reads, form drafts and upload results discard responses after account changes;
cropped covers upload through private Storage before becoming listing references.


## Personal avatar boundary (migration 35)

Profile saves reject client identity/ownership/role fields, changed credential email,
conflicting picture aliases, external URLs, inline pixels and other identities' media.
Custom pictures require an owned ready `avatar` asset and exact restrictive FK/path pairing.
The server rechecks the live portal at reservation, finalization and profile commit. An
optional expected-context header only rejects stale requests; it never supplies identity.
Administrator profile/upload writes require the current settings-key version; primary
access to the same identity cannot bypass it. Browser roles retain no direct profile/media
write grants, and the backend role retains owner RLS without BYPASSRLS.

Avatar read access is separate from catalog media and generic administrator media access.
Private helpers return only authorization booleans, verify the actual Auth subject/current
portal, use an empty search path and revoke public execution. Only the current portrait of
active staff is visible through existing authorized housing directory relationships. Owner
sharing uses exact Auth UUID equality; primary-owner links confer no personal media access.
SQL prevents removal/state retirement while a profile references the asset. Operational
account deletion must detach references and use Storage deletion, with separate encrypted
byte backups once permanent objects exist. No Storage metadata is deleted directly in SQL.

Primary-only wipe closure (migration 61) uses native transaction/PID-bound admission,
current founder key/session consent, checked recovery evidence and deferred atomic
completion. Guards preserve unrelated data and administrator access; a failed notice
rolls back closure. Re-entry requires an explicit server-verified Google signup,
the same live subject/session, completed closure receipt and retained policy checks.
No browser IDs or GUCs provide public authority: lifecycle helpers/tables have no
anon, authenticated or scoped-backend grants. Live wipe execution remains disabled.
## Customer support

Migration 70 adds private, RLS-protected support cases and administrator-invited
customer-service memberships. Requester identity comes from the current verified
native session, while guest conversations require a private hashed access code.
All queue actions recheck active membership; requesters never receive internal
notes. Public replies commit their email outbox and account-scoped notification
in the same transaction. See [customer-support.md](customer-support.md) for access,
invitations, email configuration and verification.

## Buyer–seller encryption and content reports

New buyer–seller message content is encrypted in the browser. The server verifies
the signed envelope against immutable saved participant keys and derives the
conversation identities from the actual session and store. Plaintext sends and
client identity overrides are rejected. Recovery uses a generated private phrase;
private keys and decrypted history stay in memory and clear on lock or account
change. Earlier plaintext and support conversations remain readable. This Web
Crypto application protocol has no independent cryptographic audit or forward
secrecy; see [the protocol and trust boundaries](marketplace-encryption.md).

Reports recheck actual public visibility or saved order/conversation relationships.
Only an original participant can consent to share a selected message. The API
decrypts the original ciphertext with that message's disclosed key, stores exact
verified evidence for operators and discards the supplied key. It never accepts
supplied plaintext as message evidence. Other messages and the recovery phrase
remain private. Reporters cannot read private recommendations or administrator
notes; the reported account receives no reporter identity or report access.

Customer service can recommend an action. A current administrator must use their
own approval key to dismiss or escalate it, with matching proposal validation
where linked. No report route bans, deletes, unpublishes or bypasses the existing
five-member/founder governance or reviewed backup/dependency process. All six new
private tables retain RLS, no browser writes and immutable history guards. See
[report controls](content-reports.md).

Notification acknowledgements derive the recipient from the native session and
retain recipient RLS. Optional profile-context headers reject stale reads/writes
with 409; they never grant ownership. Confirmed reads are monotonic within the
current browser session, so a delayed old inbox response cannot restore an unread
badge. In-flight acknowledgements are deduplicated and isolated across accounts
and login generations. No notification schema or RLS changes are required.

On an owned native support stack, run
`node --import tsx scripts/verify-supabase-notification-reads.ts <private-metadata.json>`
for actual Auth/API/RLS positive and negative checks. After building and starting
the owned support preview, run
`node scripts/verify-supabase-notification-browser.cjs <private-runtime.json>`
for visible/off-screen/modal checks, a delayed genuine response, actual new
support replies, reload persistence and account isolation. This uses local
captured mail; production cases and recipients are unchanged.

## Automatic public-content checks

New marketplace/profile photographs and marketplace text require exact
server-owned moderation decisions before publication. SQL triggers, catalog
filters and restrictive media/Storage policies enforce the same boundary.
Review evidence stays private; administrator-key decisions and account-sanction
approvals remain separate. See [automatic moderation](content-moderation.md)
for failure handling, child-safety limits and hosted activation verification.

## Duplicate primary signup

Public primary registration intentionally reveals that a confirmed email is
already registered, as required by the signup experience. Only a fixed 409 code
and message are returned; no account IDs, roles, names or access restrictions are
exposed. Existing authentication IP/global request limits and CSRF checks remain.
The email lookup is an availability check, never authorization or account linking.
Native Auth still verifies every successful signup. No public lookup endpoint,
credential replacement, automatic session or database permission grant is added.

## Personal AI companion boundary

The primary-only companion uses session-derived ownership, private RLS tables,
server-defined personalities and bounded Groq inference. Its tools are read-only;
they accept no identity fields and expose no encrypted chat, PIN or approval
operation. Completed answers require a freshly validated native session and an
unchanged conversation generation. AI output renders as plain text, with only
server-generated internal result cards. See [companion details](companion.md).

Frontend documents and SPA fallbacks enforce `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` in static and development delivery. These are HTTP response policies, not meta tags; deployment proxies must preserve them. The CSP framing directive follows the [W3C CSP specification](https://www.w3.org/TR/CSP3/#directive-frame-ancestors).
# Authentication abuse protection

Migration `20261022205045` adds private delivery/failure budgets with RLS enabled,
no client policies or RPCs, and no grants to browser/backend actor roles. Only
server-owned system transactions write them. Raw emails, IPs, passwords, CAPTCHA
tokens and OTPs are not stored in these tables. Bounded cleanup removes stale
state. Password failures commit before a rejection is returned; try-locks stop
parallel guesses bypassing admission. IPs come from Express's explicit proxy
allowlist, never caller-supplied forwarding headers.

CAPTCHA uses the public Supabase Auth key, so administrative CAPTCHA bypass is
not available. Each protected exchange forwards the single-use proof to native
Auth. Missing proof fails closed when a site key is configured. The actual secret
and CAPTCHA toggle must be configured in Supabase; the app configuration endpoint
does not attest to dashboard activation. See [setup](captcha.md).

Migration `20261022214514` adds a separate private replay fingerprint registry.
RLS and explicit revokes deny every browser/restricted backend role. An atomic
server-owned transaction commits each SHA-256 proof fingerprint before any
workflow/provider transaction. Failed authentication, outages and ambiguous
responses never release the claim. Reuse across accounts, portal aliases,
processes and simultaneous requests is rejected. Request-local state also
prevents forwarding a proof twice within the same HTTP request. Raw proofs are
not stored. Ten-minute retention, cleanup batches of 100, a 50,000-row capacity
and a two-second admission lock deadline bound the state/work. Direct native
Auth remains outside this application boundary; see the recorded provider
replay finding in [the verification report](auth-protection-verification.md).

Local bounded burst/SQL-injection tests validate application defenses only.
Distributed volumetric protection requires a hosting/CDN/WAF boundary; per-process
budgets and CAPTCHA do not establish a DDoS availability guarantee.
