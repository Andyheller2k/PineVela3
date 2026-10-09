# Supabase implementation status

Updated 2026-10-09. The target project uses the configured, certificate-verified Session
pooler connection. No disposable account or linked JSON record has been imported.
No local or Supabase account has been deleted. The default running backend remains
`server.ts`; do not switch the start command until the workflow gates below pass.

## Previous paused checkpoint — 2026-10-09

Resumed at the user's request on 2026-10-09. The following snapshot records the prior pause. No cutover, account reset or JSON deletion was performed.
All checks started before pausing completed; no verification server or restore database
is intentionally left running. The default dev/build/start commands remain on `server.ts`.

- Supabase has 12 applied migrations, latest `20261009070000_inspection_lifecycle.sql`.
  Applied files are immutable; append a new migration for later schema changes.
- Latest completed verification: 51 boundary/housing assertions, 84 enrollment/inspection
  assertions, 49 public/denied HTTP cases, TypeScript, production build, private-file
  smoke check, private-data check and whitespace review. Test data rolled back.
- The encrypted 12-migration backup `5b56980c-378c-4143-8d55-5d8de875bfb9`
  restored successfully in an isolated local PostgreSQL instance. It contains the
  existing five Auth identities and 19 sessions, zero application profiles and zero
  Storage objects. It is a checkpoint archive, not a stopped-writer cutover backup.
- Latest replacement additions: `supabase/inspections.ts` and `supabase/housing.ts`;
  their routes are installed in `supabase/app.ts`. Resident claims now lock the
  residence before keys/rooms to match room generation and release.
- The literal API inventory is 46 implemented entries, 13 retired entries and 136
  pending entries. Implemented entries still need positive provider/UI workflow checks.
- Resume with the open cutover gates below. Complete hierarchy/room reactivation and
  remaining manager entry points, then seller/staff/payment/storage/governance ports.
  Do not reset accounts or change default persistence before replacement verification.

The worktree includes unrelated earlier authorized changes. Preserve it; do not perform
a blanket checkout, reset or cleanup. This checkpoint is saved in project documentation,
not committed and not recorded in personal memory.

## Previous continued checkpoint — 2026-10-09

- Supabase now has 16 applied migrations, latest `20261009110000_housing_dashboard_reads.sql`.
  The ledger check found no pending files or changed applied digests.
- Completed: 92 housing/dashboard/security checks, 97 enrollment/reactivation/inspection
  checks, 38 media/Storage checks and 69 public/denied HTTP cases. TypeScript, the
  frontend/backend production build, private-file smoke check and private-data check passed.
- Encrypted archive `cfdb5ce0-d50e-4b11-bed8-7ae44ca79ae3` restored successfully in an
  isolated local PostgreSQL instance: 16 migrations, 36 public tables with RLS, five
  preserved Auth users, 19 sessions, zero application profiles and zero Storage objects.
  The temporary real-image Storage test object was removed. No account reset was performed.
- New runtime modules: resident reactivation, manager operation keys, private Storage/media,
  initial residence structure and account-scoped housing dashboard reads. The inspection
  form uploads actual evidence in the migration build. Normal dev/build/start still use JSON.
- Next: integrate hierarchy into full reviewed residence registration; complete maintenance
  and staff onboarding/operations, then seller/orders/payments and keyed admin governance.
  Do not erase JSON or reset accounts before these workflows and real provider/UI tests pass.

## Previous residence-registration checkpoint — 2026-10-09

- Supabase has 17 committed migrations, latest `20261009120000_reviewed_residence_setup.sql`.
  The new migration adds active registration metadata and separates manager verification
  from approved full residence setup. Applied files remain immutable.
- Manager full registration completes its assigned, physically inspected property, saves
  owned photographs and actual blocks/floors/rooms/beds, and creates one residence review
  case, notifications and audit in the same transaction. Exact retries are idempotent.
- The migration form loads the owned property and submitted dossier from PostgreSQL. It
  uses no sample blocks, room counts, preconfirmed map location or global cached draft.
  New blocks require actual names, floor counts and starting room numbers. Unsubmitted
  edits stay in memory; closing the form does not save them. The manager dashboard offers
  registration for the inspected shell and displays setup/review state.
- Administrators can approve, reject or request information through the residence case
  routes; the existing `/api/hostels/:id/verify` UI action uses the same decision helper.
  Approval requires the saved active manager assignment, accepted physical inspection,
  matching actual room/bed counts and ready owned photos. Final decisions cannot be
  overwritten through retries. Rejecting property setup preserves the manager identity.
- The admin dashboard uses `/api/admin/hostels` in the migration build. Its private list
  includes pending submissions and actual hierarchy counts in one database query; the
  public catalog remains restricted. Submission and review notices target the primary
  owner and active administrators.
- An approved manager shell cannot publish cards/photos, issue activation keys or activate
  residents before full residence setup passes review. No payment receipt is fabricated:
  provider payment fulfillment remains a separate migration gate.
- Completed checks: 93 housing/RLS assertions, 137 enrollment/inspection/registration/review
  assertions, 39 media/Storage assertions and 77 public/denied HTTP cases. Domain test
  records rolled back, and the actual temporary Storage object was removed. No Auth
  account was created, imported or deleted. TypeScript and frontend/backend builds passed.
- Encrypted archive `8ab119f5-06f8-46ac-84a7-b7817f21c023` restored successfully in isolation:
  17 migrations, 36 public tables with RLS, five Auth users, 19 sessions, zero application
  profiles and zero Storage objects. This is a checkpoint backup, not the final
  stopped-writer cutover backup. Local JSON/upload archives remain preserved.
- Next: reviewed changes/resubmission and new-property verification after deletion,
  staff/maintenance/meeting operations, seller/order/payment ports and keyed admin
  governance. Real provider sign-in, authenticated HTTP/browser journeys and restart
  validation remain required. Default dev/build/start still use JSON; no reset or cutover.

## Current administrator settings checkpoint — 2026-10-09

- Migration 28, `20261009230000_administrator_settings_keys.sql`, is committed.
  All 28 applied digests match; there are no pending migration files. The opt-in
  backend requires migration 28 and has no JSON fallback. Default dev/build/start
  still use the preserved transitional backend.
- Active administrators have a separate settings-key status/enrollment API and
  keyed Paystack receiving-account controls. Enrollment requires an actual Auth
  session created within five minutes; Google-only administrators do not need an
  invented local password. Keys are shown once, salted with scrypt and bound to
  their administrator/purpose. SQL prevents ownership changes and unilateral key
  replacement. Lost-key recovery still needs its separate governance migration.
- Five failed settings guesses persist and lock settings access for 15 minutes,
  independently of approval guesses. After a provider read, the write rechecks the
  live session, membership, key version and lockout. Only active, verified GHS
  subaccounts in the configured provider environment are selectable. The main
  Paystack account remains an explicit option. Existing quotes keep their saved
  destination; unrelated pricing/settings are preserved. Audit and exact active-admin
  notices commit atomically. Notification DTOs include the settings/governance module
  used by the existing tab unread counts.
- The settings UI uses account-scoped status queries, clears private input and
  one-time key display on account change, and rejects late responses after unmount.
  It identifies unported controls explicitly. Pricing approvals, public contacts,
  announcements, maintenance enforcement, profile changes and governance actions
  remain pending; the UI does not report empty proposal collections as migrated data.
- Isolated actual-Auth verification passed 81 assertions: correct/foreign/approval
  key handling, persistent lockout and restart, immutable metadata, stale and locked
  grants, session/membership revocation, settings preservation, notification recipients
  and direct role/RLS denials. Private test keys were generated in the prior-schema
  isolated fixture before applying the exact draft DDL; no Auth identity/session/JWT
  or provider result was fabricated. Cloud rehearsal passed 28 assertions and rolled
  back fixtures and DDL completely. Actual fresh Google key enrollment and authenticated
  settings UI/HTTP coverage remain acceptance checks.
- The real configured live Paystack account-list GET succeeded and returned zero
  subaccounts. No provider account or charge was created or modified. Selecting an
  actual verified non-default subaccount remains an acceptance check. Main-account
  selection, denied guesses and no-op updates passed the isolated service checks.
- Public/denied HTTP verification passed 176 cases. Payment regression passed 62
  isolated assertions against the migration-28 schema; no provider charge was created.
  TypeScript, independent frontend/backend builds, built-server startup/public reads,
  private-artifact denials, private-data check and diff whitespace check passed.
- Fresh pre-DDL encrypted recovery archive `c0857019-ed75-49ec-8af8-259763368f4f`
  (625609 bytes) passed an isolated restore: 27 migrations, 37 public RLS tables,
  five Auth users, 20 sessions, zero profiles/objects/PINs and the private PIN key.
  Committed recovery archive `a0eca4ff-e957-4149-a1e2-0bdd777dab8a` (629431 bytes)
  passed an encrypted round-trip and isolated restore with all 28 migrations, the same
  Auth/application/Storage inventory and the private PIN key. Guest private reads,
  browser promotion and backend BYPASSRLS remain denied. Temporary decrypted pages
  and local PostgreSQL clusters were removed. This remains a checkpoint, not the
  final stopped-writer cutover backup.
- Cloud inventory remains five Auth users, 20 sessions, zero profiles/Storage objects
  and 37 public tables, all with RLS. No accounts were imported, restored or deleted.
  Read-only retention passed 19 checks: four cloud identities/one removal candidate,
  four local accounts/30 removal candidates, with zero ambiguous bindings. Dependency
  review and destructive execution remain cutover gates.
- Literal inventory: 118 implemented, 13 retired and 64 pending route entries; 50
  replacement modules have no reachable JSON persistence. Counts exclude mounted
  routers and do not count complete workflows. Next: shared pricing approvals with
  three distinct settings keys and founder final execution, then the remaining keyed
  portal settings and governance workflows.

## Previous payment checkpoint — 2026-10-09

- Migration 27, `20261009220000_verified_payment_fulfillment.sql`, is committed after
  cloud rollback checks, a dry run and encrypted checkpoint recovery. The opt-in server
  requires this schema. Default dev/build/start still use JSON; no account import,
  production restoration, deletion, founder provisioning or cutover has occurred.
- Registration charges only the saved registration fee and grants two calendar months
  of initial Pine Default and two-month fee access. The two-month fee is due afterward.
  Star/Pro monthly upgrades and later two-month fees use separate quotes and intervals;
  there is no automatic debit. Genuine zero-fee policies use explicit platform evidence
  and cannot stack free future periods. Test payments cannot grant operational access.
- Private quotes preserve the actor-scoped request UUID, exact verified payer, target,
  prices and receiving account. Store/residence locks serialize fulfillment. Repeated
  requests, fulfillment and verification keep the original receipt and notify once.
  SQL preserves receipt ownership, quoted amount, access start and calendar duration;
  browser roles cannot read provider evidence or write payments/access periods.
- Hosted checkout and Ghana mobile money use the provider's fixed HTTPS API with bounded
  concurrency and account attempt limits. Raw-body webhooks authenticate HMAC-SHA512 and
  verify the transaction with Paystack before access changes. Status, reference, amount,
  GHS currency, live environment, payer and receiving account must match the saved quote.
  Changed eligibility retains verified evidence for review without granting access.
  Callback redirects and provider initialization never attest payment success.
- Checkout recovery retains ambiguous references instead of repeating a charge. The
  exact payer can list unfinished checkouts; the frontend scopes recovery to its account
  and ignores late responses after account, reference or page changes. Activation copy
  and totals reflect registration-only billing in the Supabase build. The legacy JSON
  branch retains its earlier pricing behavior until cutover.
- Completed pre-application verification: 59 isolated committed quote/fee-waiver and
  ownership cases, 44 cloud rollback conversation/review cases, 80 cloud rollback
  inventory cases and 33 media database cases. Updated verification fixtures use the
  real temporary zero-fee policy rather than fabricated successful provider receipts.
  Another 77 isolated conversation/review cases and 33 committed order-concurrency,
  restart and session-revocation cases passed. No provider charge or cloud fixture was
  created. Actual paid provider fulfillment and authenticated HTTP/browser remain gates.
- Production frontend/backend build, TypeScript, private-data and diff checks passed.
  The existing legacy payment unit regression passed after extracting the pure provider
  helper. Pre-application archive `6549a414-1135-4057-b348-3ffee089d935` (597617 bytes)
  passed encrypted round-trip and isolated recovery, including its encrypted PIN key,
  26 migrations, 36 RLS tables, five Auth users, 20 sessions and zero profiles/objects/PINs.
  Guest private reads and browser promotion were denied; backend BYPASSRLS remained false.
  Temporary decrypted pages and cluster were removed.
- Final committed-checkpoint verification passed 62 isolated payment/ledger/manager
  cases and 170 public/denied API cases, including valid signed non-charge events,
  tampered webhook bodies and payload limits. The administrator ledger preserves the
  client `housing` category so residence onboarding is excluded from merchant-fee totals.
  Built-server startup, public reads and private-artifact denial passed. Real private
  Storage upload/download, byte integrity and owner/foreign/guest denial passed all
  39 media checks; the temporary object was removed and application rows rolled back.
- All 27 migration digests match, with no pending migration files. Aggregate cloud
  counts remain five Auth users, 20 sessions, zero profiles/Storage objects and 37
  public tables with RLS enabled. Committed recovery archive
  `c9b2354c-9501-473b-a7e7-c2ee4151a72d` (625609 bytes) passed encrypted round-trip and
  isolated restore, including the private server PIN key and the same inventory.
  Guest private reads and browser promotion remain denied; backend BYPASSRLS is false.
  Temporary decrypted pages and cluster were removed. This remains a checkpoint,
  not the final stopped-writer cutover backup.
- Read-only Google retention passed 19 checks: four qualifying cloud identities/one
  removal candidate and four qualifying local accounts/30 removal candidates, with no
  ambiguous UUID/mailbox bindings. No account was restored or deleted; dependency
  review and destructive execution remain separate cutover gates.
- Literal inventory: 116 implemented, 13 retired and 66 pending route entries; 49
  replacement modules have no reachable JSON persistence. These are route entries,
  not a count of remaining migrations or fully verified product workflows.
- Public payment origin is still unset because the deployment address is not chosen.
  A custom domain is optional; a trusted public HTTPS hosting address can be configured
  as `PINEVELA_PUBLIC_ORIGIN`. Actual paid checkout/webhook delivery, keyed receiving
  account changes, reviewed paid-access resolution and refunds remain release gates.
  No real charge was initialized during verification.

## Previous messaging and purchase-review checkpoint — 2026-10-09

- Migration 26, `20261009210000_purchase_messages_reviews.sql`, is committed after
  rollback verification, dry run, encrypted backup and isolated restore. The opt-in server
  requires this schema. Default dev/build/start still use JSON; no reset, account import,
  production restoration, founder provisioning or cutover has occurred.
- Buyer–seller chat resolves participants and item/order titles from actual saved records.
  Only a primary buyer may initiate a new public-store inquiry; sellers reply to an existing
  inquiry or their own order. Seller parent accounts and administrators have no chat API/RLS
  access. Message history is append-only, with sender-scoped request UUIDs, store locking
  and exact recipient notices committed atomically. Existing conversations remain usable
  after plan expiry while the seller/store remain active and approved.
- Purchase and service reviews require the exact buyer's completed, handover-verified
  receipt. One editable review belongs to each order; receipt identity and initial creation
  time remain immutable. Identical retries do not repeat notices. Actual completed reviews
  drive item/service/store reputation, with public projections excluding private account,
  email and order IDs. Completed unpublished purchases remain reviewable by their buyer.
- Message notices carry actual message IDs so inbox read receipts and account badges
  target incoming messages. Inquiry/inbox retries preserve request UUIDs; late responses
  cannot repopulate a different account. Review views clear on account/service changes.
  Supabase requests reject client-supplied participant email/name/title assertions.
- Completed verification: 44 real cloud rollback ownership/RLS cases and 77 committed
  isolated-restore cases covering concurrent retries, private participant/notification
  access, read receipts, actual product/service handovers and reviews, review edits,
  backend pool restart and live-session revocation. No Auth user was created or modified,
  and no fixture was committed to Supabase. Relational payment fixtures are isolated test
  evidence; positive provider-authenticated HTTP/browser and actual payments remain gates.
- Production frontend/backend build, TypeScript, private-data checks, residual-reference
  review and diff checks passed. Pre-application archive
  `f9a1c01e-407e-4acb-ac97-6f7219bfdd5e` (589879 bytes) passed encryption round-trip and
  isolated restore, including its encrypted server PIN key. It preserves 25 migrations,
  36 RLS tables, five Auth users, 20 sessions and zero profiles/objects/PINs. Guest private
  reads and browser promotion are denied; backend BYPASSRLS remains false. Temporary
  decrypted pages and cluster were removed.
- The committed server passed 154 public/denied HTTP checks and built-server public
  reads/private-artifact denial. Positive provider-authenticated HTTP/browser coverage
  remains required. Final ledger inspection confirms all 26 digests match and no pending
  migration files. Read-only cloud counts remain five Auth users, 20 sessions, zero
  profiles/Storage objects and 36 application tables with RLS enabled.
- Committed recovery archive `39bf66e5-e9e0-4727-b5af-037b0e402863` (597617 bytes)
  passed encryption round-trip and isolated restore, including the server PIN key,
  all 26 migrations and the same account/session/RLS inventory. Private reads and
  browser promotion remain denied; backend BYPASSRLS is false. Temporary decrypted
  pages and cluster were removed. This is a checkpoint archive, not the final
  stopped-writer cutover backup. Existing Storage verification is recorded in the
  preceding order checkpoint; this migration does not change Storage behavior.
- Read-only Google retention was refreshed: 19 checks passed, four qualifying cloud
  identities/one cloud removal candidate and four qualifying local accounts/30 local
  removal candidates, with no ambiguous UUID/mailbox bindings. No account was restored
  or deleted; linked-record/media dependency review and destructive execution remain gates.
- Literal API inventory: 109 implemented, 13 retired and 73 pending entries; 47
  replacement modules have no reachable JSON persistence. These are route entries,
  not a count of remaining migrations or fully verified workflows. Next: provider payments
  and subscriptions, keyed governance, remaining housing/identity lifecycle, avatars and
  actual provider/API/browser/cutover verification. Preserve original accounts, JSON and
  uploads until replacement and reviewed Google-only retention/dependency gates pass.

## Previous order checkpoint — 2026-10-09

- Migration 25, `20261009200000_market_order_handover.sql`, is committed after successful
  rollback verification, dry run, encrypted backup and isolated restore. All 25 applied
  digests match. The opt-in server requires this schema and the private server PIN key.
  Default dev/build/start still use JSON; no reset,
  account import, production restoration or cutover has occurred.
- The replacement implements actual buyer orders, seller agreement/decline, buyer
  cancellation, private PIN renewal and verified handover. Identity, prices, actual
  option photos and commission come from saved records. Buyer-scoped request UUIDs
  preserve retries and purchase snapshots. Store/listing/order locks serialize stock
  reservations and completion; terminal history cannot reopen or deduct stock twice.
- Active challenges use AES-256-GCM with a private server key outside PostgreSQL.
  Only the exact buyer receives an active PIN. Five failures persist before denial;
  renewal rotates the PIN/version after a one-minute cooldown and rechecks capacity.
  Sellers/admins receive no delivery secrets. Checkpoint backups include the encrypted
  key sidecar, and startup/backup reject missing or mismatched keys.
- Completed verification: 103 rollback order/security checks, 33 committed concurrency,
  backend pool restart, revocation and quantity-boundary checks in an isolated encrypted
  restore,
  80 inventory regressions and 93 housing/RLS boundaries. No Auth identity was created
  or modified. Domain/payment fixtures are test-only relational evidence; actual provider
  payment and positive authenticated HTTP/browser journeys remain unverified gates.
- Account changes discard late order responses; request UUIDs survive unchanged retry
  attempts. Actual zero coordinates are preserved in order forms and map views. The
  production frontend/backend build and TypeScript passed. All 33 pre-commit media
  database cases passed. The committed server passed 141 public/denied HTTP cases and
  built-server/private-file smoke checks. All 39 committed media checks passed,
  including actual Storage image upload, download/digest verification, scoped access
  denial and deletion of the temporary object. Domain fixtures rolled back.
- Committed archive `4d6a65dd-baa9-4e5a-b6aa-3becb298cd37` (589879 bytes) passed
  archive/encryption round-trip and isolated local restore with its encrypted server key.
  It preserves 25 migrations, 36 RLS tables, five Auth users, 20 sessions and zero
  profiles/Storage objects/PINs. Guest private reads and role promotion are denied;
  backend BYPASSRLS remains false. Temporary decrypted pages and cluster were removed.
  This is a checkpoint archive, not the final stopped-writer cutover backup. Final
  read-only inventory confirms 25 applied migrations, no pending files or changed
  digests, five preserved Auth users/20 sessions, zero profiles/objects and 36 RLS tables.
- Retention was refreshed read-only: 19 checks passed, four qualifying Google cloud
  identities/one cloud removal candidate, four qualifying local accounts/30 local
  removal candidates and no ambiguous UUID/mailbox bindings. No production account
  was restored or deleted. Dependency review and destructive execution remain blocked.
- Pre-application archive `e0e2a33e-9e9e-4521-aa07-21a2304dd2a7` passed encryption
  round-trip and isolated restore, including its encrypted server PIN key. It preserves
  24 migrations, 36 RLS tables, five Auth users, 20 sessions and zero profiles/objects.
  An initial read-only dump timed out; the verified retry allows longer catalog reads
  while bounding table-lock waits. No database accounts or sessions were reset.
- Literal API inventory: 103 implemented, 13 retired and 79 pending entries; 46
  replacement modules have no reachable JSON persistence. These are route entries,
  not a count of remaining migrations or verified complete workflows. Next: buyer-seller
  messaging and verified purchase reviews, payments/subscriptions, keyed governance,
  remaining housing/identity lifecycle, avatars, actual provider/API/browser and
  cutover verification. Preserve original accounts, JSON and uploads until reviewed
  replacement and cleanup gates pass.

## Previous inventory checkpoint — 2026-10-09

- Migration 24, `20261009190000_owned_market_inventory.sql`, is committed. All 24
  applied digests match and no migrations are pending. The opt-in backend requires
  this schema; default dev/build/start still use JSON. No reset, import or cutover.
- Private inventory resolves the exact approved seller store from the verified portal,
  replacing the public catalog/email filter in the migration build. Client ownership,
  plan and reputation assertions are rejected. An active paid foreign seller cannot
  edit another store or reuse its photographs. Browser roles cannot write raw listings.
- Store locks serialize actual plan quotas, including paused/unpublished listings.
  Products use real stock; manual creation/stock edits require a positive whole number.
  Services have nullable stock, actual schedules/contact/rates and location modes.
  Flexible services publish no invented map pin; Fixed/Hybrid require a valid actual pin.
- Publication requires ready owned cover/gallery/option media and verified active paid
  store eligibility. SQL independently protects immutable listing/attachment links,
  published cover presence, live reservations and retired evidence. Removal retires
  and unpublishes while retaining purchase references; live reservations block removal.
  Audit and exact seller notifications commit with the change.
- Seller reads/mutations, draft state and FileReader/crop uploads discard late account
  results. Cropped covers upload to private Storage before submission. Public cards,
  details and map discovery recognize services without a fabricated stock quantity.
- Final pending-schema checks passed: 80 inventory workflow/RLS cases, 93 housing
  boundaries and 33 media database cases, followed by successful dry run/application.
  The committed server passed 134 public/denied HTTP cases and built-server/private-file
  smoke checks. TypeScript, final frontend/backend build, service-location regression,
  private-data and whitespace checks passed. The existing large-chunk warning remains.
  Domain/payment/enrollment fixtures rolled back; no Auth identity was created or
  modified. These checks do not prove live payments or authenticated provider/browser
  journeys. All 39 committed-schema media checks passed with actual Storage upload,
  download/integrity verification, owner/foreign/guest denial and object cleanup.
- Encrypted checkpoint `ca99bf15-f6ea-4fdd-9cbf-7da747213c98` (571599 bytes) passed
  archive/encryption checks and isolated local restore: 24 migrations, 36 RLS tables,
  five Auth identities, 20 sessions, zero profiles and Storage objects. Guest private
  reads and role promotion are denied; backend BYPASSRLS is false. Temporary decrypted
  pages/cluster were removed. No cloud/production accounts were restored. This is a
  checkpoint archive, not the final stopped-writer backup.
- Retention remains verified-Google-only with exact saved UUID/mailbox bindings. The
  refreshed 19-case read-only check qualifies four local accounts and excludes 30 others from
  production restoration; cloud Auth has four qualifying identities and one removal
  candidate. Linked-record/media dependency review and destructive execution remain
  blocked; identities do not automatically inherit old administrative roles/keys/sessions.
- Literal inventory: 99 implemented, 13 retired and 83 pending entries; 44 replacement
  modules have no reachable JSON persistence. Counts exclude mounted-router/alias
  review and do not prove complete workflows. Next: orders/PINs/reservations,
  buyer-seller messages/reviews, payments/subscriptions, keyed governance, remaining
  housing/identity lifecycle, avatars, actual provider/API/browser and cutover checks.

## Previous store-setup and Google-retention checkpoint — 2026-10-09

- Migration 23, `20261009180000_private_store_setup.sql`, is committed. Store setup
  saves actual handle, physical location, international contact and chosen delivery
  method separately from the verified application campus. Original setup time and
  seller/primary ownership cannot be rewritten. Setup never creates a payment receipt;
  activation/publication require actual saved fulfilled live payment and a current plan.
- Setup and profile edits derive the approved store from the authenticated seller,
  reject client identity/payment/plan assertions, verify owned ready media and commit
  audit plus seller notifications atomically. Exact retries do not duplicate events.
  Default uses the standard logo/four bundled covers; actual active Star/Pro plans
  unlock owned custom branding. Buyer-safe views expose entered profile fields while
  raw store RLS excludes buyers and primary owners from private ownership records.
- The migration onboarding UI resumes actual saved fields without invented campus,
  handle or description, omits student-email ownership selectors, and discards stale
  account responses. Media uploads also discard late results after account changes or
  unmount. Login distinguishes completed profile setup from verified activation payment.
- Final checks passed: 59 store workflow/RLS cases across two approved sellers, 93
  housing/account boundaries, 33 pre-commit media database checks, 129 public/denied
  HTTP cases and the final 39 media checks with real Storage byte round trip/deletion.
  Earlier external Storage stages timed out; final committed-schema checks passed.
  Storage errors now expose only safe status/transport codes, never credentials or
  provider response text. Real provider-authenticated browser/API and payment flows
  remain open gates; relational payment fixtures are not evidence of a provider charge.
- Encrypted checkpoint `79a08139-a734-46f7-9c7e-2bb9fe1e4ce9` (564729 bytes) passed
  archive/encryption checks and isolated local PostgreSQL restoration: 23 migrations,
  36 RLS tables, five Auth identities, 19 sessions, zero profiles and Storage objects.
  Guest/private access and role-promotion denial passed; backend BYPASSRLS is false.
  Cloud accounts were never restored, imported or reset. Temporary restore data and
  the actual test object were removed; this is not the final stopped-writer backup.
- Latest user instruction supersedes all-account removal: retain only verified Google
  identities with exact saved UUID/mailbox bindings. Read-only classification passed
  19 checks: four qualifying cloud identities and one cloud removal candidate; four
  qualifying local accounts and 30 local removal candidates, no ambiguous bindings.
  Private preview/local encrypted backup `171ac3a5-632c-4385-9ee1-3b770d7941bd` verified
  the entire JSON database and all 23 uploads. Linked-record/media dependency review
  remains incomplete and execution is blocked. Older all-account previews are stale;
  retained identities do not inherit historical administrator keys, roles or sessions.
- Literal inventory: 96 implemented, 13 retired and 86 pending entries; 41 replacement
  modules have no reachable JSON persistence. Mounted routers/aliases and whole
  authenticated workflows still need review. Next: private inventory, orders,
  buyer-seller messaging/reviews, payment fulfillment, keyed governance and remaining
  housing/identity journeys. Default dev/build/start remain on JSON; no cutover.

## Previous seller-registration checkpoint — 2026-10-09

- Migration 22, `20261009170000_verified_seller_applications.sql`, is committed.
  Five Auth identities and 19 sessions remain preserved; application profiles and
  Storage objects are zero after cleanup. All 36 public base tables have RLS.
  No accounts were imported/reset, no founder was provisioned and no cutover occurred.
- Seller submissions use the exact primary-owned verified enrollment. Student identity
  comes from the saved confirmed subject; application bodies reject passwords,
  identity aliases and ownership IDs. Actual school ID, campus, category, proposed
  store name and declaration are required. Pending status and private details reach
  only the saved primary/seller or active administrators through scoped projections.
- Only active administrators can review. Rejection requires real feedback and keeps
  the verified pending identity for a versioned resubmission. The previous complete
  submission/decision is preserved in private audit. Final decisions cannot be rewritten;
  exact retries do not duplicate stores, audit or notifications. Submission/review
  locks follow owner → enrollment → child → application order.
- Registration bans are enforced in SQL and API at submission and approval, including
  bans imposed during review. Revoked-admin SQL decisions fail even if an old context
  binding exists. Housing managers cannot approve sellers. Approval activates the saved
  seller portal and creates its actual unpaid, unpublished pending store, without
  claiming setup/payment fulfillment. Primary users receive lifecycle notices before
  entering the seller portal; administrators receive submission and decision notices.
- The migration dashboard now uses verified enrollment and actual registration fields,
  resumes rejected applications with saved feedback/details, and supports resubmission.
  Admin rejection has a feedback/confirmation form. No default campus/store name or
  submitted password is fabricated in the new registration form. Real institutional
  email delivery and positive authenticated/provider/browser journeys remain gates.
- All 55 transactional seller workflow/RLS checks passed on the final pending migration,
  followed by successful dry run/application. All 123 public/denied HTTP cases passed.
  The updated media suite uses the registration/review helpers and passed 39 checks,
  including a real supplied-image Storage round trip and removal. Domain fixtures and
  temporary session bindings rolled back; no Auth user was created or modified.
  TypeScript, frontend/backend production build, built-server/private-file, private-data
  and whitespace checks passed. The existing large-chunk warning remains.
- Encrypted checkpoint `ede8e373-f7b9-416d-953d-7db3e1031821` passed archive listing,
  encryption round-trip and isolated local PostgreSQL restoration: 22 migrations,
  36 RLS tables, five Auth identities, 19 sessions, zero profiles/Storage objects.
  Guest profile reads and role promotion remain denied; backend BYPASSRLS is false.
  Temporary decrypted pages and cluster were removed. This is a checkpoint backup,
  not the final stopped-writer reset backup; existing local JSON/upload archives remain.
- Literal inventory: 95 implemented, 13 retired and 87 pending entries; 39 replacement
  modules have no reachable JSON persistence. Counts do not prove complete workflows.
  Next: complete private seller store setup/inventory and payment fulfillment, orders,
  buyer-seller messaging/reviews, keyed governance, remaining housing lifecycle and
  avatar/recovery/rehire/provider journeys. Default dev/build/start still use JSON.

## Previous appointment checkpoint — 2026-10-09

- Migration 21, `20261009160000_scoped_meeting_appointments.sql`, is committed.
  All applied digests match and no files are pending. Aggregate cleanup inventory:
  36 public tables with RLS, five preserved Auth users, 19 sessions, zero application
  profiles and Storage objects. No account reset, founder provisioning or cutover.
- Appointments use actual saved internal contacts and their original allocation or
  employment. External contacts have no account binding. Managers need the saved
  assignment and current operation key; participants may request for themselves or
  cancel their own appointment. Raw RLS and scoped views deny other portals,
  foreign residences and uninvited same-residence staff. Released residents and
  suspended staff lose access and cannot receive a new approval or reschedule.
- Ghana date/time slots map explicitly to UTC instants, including noon/midnight.
  Decisions follow the supported lifecycle; final decisions, original contact/agenda
  evidence and decision times cannot be rewritten. Removing a meeting cancels an
  active appointment and hides it from the log while retaining history. Notifications
  and audit commit atomically for saved manager and internal participant recipients.
- The manager form selects actual active participants, accepts actual external details,
  and invents no email, phone, manager/residence ID or video link. Reads and mutation
  responses from an earlier account/residence cannot populate the current screen.
- All 86 transactional appointment/RLS checks passed against the final migration,
  followed by a successful dry run and application. Fixtures and temporary bindings
  rolled back without Auth account changes. All 117 public/denied HTTP cases passed.
  TypeScript, final frontend/backend production build and built-server/private-file
  checks passed; the existing large-chunk warning remains. Private-data and whitespace
  checks passed. These checks do not prove positive provider/authenticated UI journeys.
- Encrypted checkpoint `01d3ff70-441c-4d22-8b43-c28bc1e745d0` passed archive listing,
  encryption round-trip and isolated local PostgreSQL restore: 21 migrations, 36 RLS
  tables, five Auth identities, 19 sessions, zero profiles/Storage objects. Guest profile
  reads and role promotion remain denied; the backend has no BYPASSRLS. Temporary
  decrypted pages/cluster were removed. This is not the stopped-writer reset backup.
- Literal inventory: 90 implemented, 13 retired, 92 pending entries; 38 replacement
  modules were inspected with no reachable JSON persistence. Route counts are not
  complete workflows. Seller registration/setup/orders/payments, keyed governance,
  reviewed residence changes, rehire/avatar/recovery and real provider journeys remain.
  Default dev/build/start and all JSON/upload backups remain preserved.

## Previous staff retention and review checkpoint — 2026-10-09

- Migration 20, `20261009150000_staff_retention_reviews.sql`, is committed. The
  migration ledger preserves immutable digests. There are still 36 public base
  tables with RLS; five Auth users and 19 sessions remain preserved, with zero
  application profiles and Storage objects after test cleanup. No reset or cutover.
- Active staff submit actual retention terms to the saved creating manager with a
  current residence grant. One unresolved proposal per employment is enforced in
  SQL. Original reason, terms, ownership and employment snapshots are immutable.
  The actual recipient manager decides with their current operation key. Accepted
  shift/block changes commit with the response, audit and saved-recipient notices.
  No unused salary field or counteroffer engine is recreated.
- A rejection requires an explanation and remains unresolved until the exact staff
  member confirms staying or resigning. Staying retains current terms. Resigning
  saves the original reason, closes employment and revokes staff portal bindings,
  preserving history. Employment ending cancels unresolved proposals. Exact manager
  decision and stay retries are idempotent; resigned portals cannot replay actions.
- Resident staff reviews derive their author and allocation from the verified current
  room. Staff must be active in that same residence. Reviews are immutable private
  housing evidence. Raw-table RLS and scoped views deny foreign residences, primary
  portals and departed staff/residents; assigned managers retain historical evidence.
  The unused maintenance issue cross-link was removed after checking for existing
  evidence. Repair ratings remain separate and never generate staff reviews.
- The staff Notifications & Decisions tab now shows actual proposals and responses,
  polls for changes, and provides confirmed stay/resign actions after rejection.
  Resignation signs out. Manager rejection no longer submits hidden acceptance-only
  changes. Repair-feedback text no longer promises a public staff profile.
- Verification: 95 actual transactional staff workflow/RLS checks passed against the
  final migration before application, followed by 93 housing/RLS regression checks.
  The first housing run timed out during a session-context read; its rollback cleanup
  was verified and the unchanged suite passed on retry. No production write was replayed.
  On the committed schema, 64 staff lifecycle and 62 maintenance checks passed,
  including a real private-image Storage transfer and deletion. All domain fixtures
  and temporary bindings rolled back; no Auth account was created, modified or imported.
- All 111 public/denied HTTP cases passed. TypeScript, final frontend/backend production
  build, built-server startup/private-file checks, private-data and whitespace checks
  passed. The existing large-chunk warning remains. Positive authenticated HTTP and
  responsive stay/resign/review browser journeys, Google and real email delivery remain
  cutover gates; no provider responses or authenticated screens were mocked.
- Encrypted checkpoint `e61a4a4e-254c-49a1-b843-3a8c8a6fc35d` passed archive listing,
  authenticated encryption round-trip and isolated local PostgreSQL restoration:
  20 migrations, 36 RLS tables, five Auth identities, 19 sessions, zero profiles and
  Storage objects. Guest profile reads and role promotion remain denied; the backend
  has no BYPASSRLS. The temporary cluster and decrypted pages were removed, with no
  cloud record modifications. This is a checkpoint, not the stopped-writer reset backup.
- Literal route inventory: 86 implemented, 13 retired and 96 pending entries; mounted
  routers are excluded and these counts do not prove complete workflows. Meetings,
  staff rehire/email/avatar flows, reviewed residence changes, marketplace/payments,
  keyed governance and real provider journeys remain open. Default dev/build/start
  still use JSON. All existing JSON/upload backups remain preserved; founder
  provisioning, account reset and JSON removal have not occurred.

## Previous staff checkpoint — 2026-10-09

- Migration 19, `20261009140000_verified_staff_lifecycle.sql`, is committed; all
  migration digests match and none remain pending. There are still 36 public base
  tables, all with RLS. Five existing Auth identities and 19 sessions remain preserved;
  application profiles and Storage objects are zero after all test cleanup.
- The opt-in backend now supports manager-issued staff invitations, renewal/cancellation,
  staff-owned password signup and email confirmation, contact profile edits, employment
  updates/suspension/restoration, removal and self-resignation. Manager operations require
  the current operation key and saved residence assignment. Invitation creation and staff
  activation additionally require approved residence setup. No public staff hiring exists.
- Invitations store only a nonce digest, expire after 24 hours and remain renewable by
  the initiating assigned manager. Old links stop working after renewal. A cancelled
  started signup closes its pending portal. Existing Auth mailboxes cannot be adopted
  through email equality; rehiring closed staff identities remains a separate gate.
- The Auth trigger creates a pending staff portal only for the exact authorized invitation.
  Activation requires the invited confirmed subject and live provider session. Staff
  choose their own password and sign in separately; the manager cookie is not switched.
  Contact edits permit only display name and phone, preserving verified login identity.
- Ending employment retains immutable assignment identity, maintenance foreign keys and
  evidence; ended status/time must agree. Suspension, removal and resignation revoke
  saved staff portal bindings. Restoration requires a new verified sign-in. Resignation
  cannot modify other employment fields. Audit and saved-recipient notices commit with
  lifecycle actions; ended personnel are excluded from current roster reads.
- Manager forms show actual pending invitations and offer renewal/cancellation. The new
  invitation screen offers password choice, email-code/link confirmation and resend.
  Migration-mode staff contact forms protect login email and username and do not offer
  unported photo edits. Direct resignation now uses its dedicated endpoint and signs out.
- Verification: migration dry run, 64 committed-schema staff/identity/RLS checks,
  137 enrollment/inspection/registration and 93 housing/RLS regression checks, and
  62 committed-schema maintenance checks with actual private-image transfer and cleanup.
  All application fixtures rolled back. No Auth account was created, modified or imported.
- All 105 public/denied HTTP checks passed. Chromium passed 14 guest invitation rejection
  assertions at 375/768/1440 pixels in light/dark themes; screenshots were inspected.
  TypeScript, production frontend/backend build, built-server private-file checks,
  private-data and whitespace checks passed. The existing large-chunk warning remains.
- These tests do not prove new-mailbox reservation/signup, email delivery, positive
  authenticated HTTP, valid invitation forms, Google or staff provider/browser journeys.
  No provider responses were mocked. Those end-to-end journeys remain cutover gates.
- Encrypted checkpoint `b9cb8269-1a32-4046-834e-bdf64a5fa29d` passed archive
  listing/integrity checks and restored in isolated local PostgreSQL: 19 migrations,
  36 RLS tables, five Auth identities, 19 sessions, zero profiles and zero Storage objects.
  Guest profile access and role promotion remain denied; the backend has no BYPASSRLS.
  The first restore attempt hit the sandbox's Unix-socket restriction; the permitted
  local rerun passed, shut down the temporary database and removed decrypted pages.
  No cloud records were modified. This remains a checkpoint, not the final stopped-writer backup.
- The literal route inventory is 81 implemented, 13 retired and 101 pending entries;
  mounted routers are excluded and these counts do not imply complete product workflows.
  Staff bargains/reviews/meetings, rehire/email/avatar flows, reviewed property changes,
  marketplace/payments, keyed governance and real provider journeys remain pending.
  Default dev/build/start still use JSON. No account reset, founder provisioning or
  JSON removal has occurred.

## Previous maintenance checkpoint — 2026-10-09

- Migration 18, `20261009130000_maintenance_workflow.sql`, is committed. It adds the
  original allocation, timing, assignment and repair evidence fields to existing tables.
  No old JSON records or accounts were imported, reset or deleted.
- The opt-in backend now supports report creation/details editing, exact-residence staff
  assignment, acceptance/decline, requested schedule changes with manager review, owned
  completion evidence, reporting-resident confirmation/follow-up and manager closure.
  Events, audit and saved-recipient notifications commit with each action. Repeated
  closure is idempotent. Repair ratings stay separate from staff reviews.
- One unresolved resident report is enforced through a partial unique index, including
  repairs still awaiting resident confirmation. Parent portals cannot impersonate the
  resident. `/api/student/my-rooms` returns only the resident's actual active allocation.
- Maintenance and repair photos use private Storage references bound to the original
  housing relationship or exact ticket. Only the reporter, assigned managers and exact
  active assigned staff can read attached evidence. Historical evidence remains after
  reassignment. Browser registry/object writes remain denied.
- Migration-mode resident desktop/mobile forms and staff completion upload their actual
  photographs before attachment; retries retain saved references. The manager maintenance
  chart now uses actual report dates/closure records, with no generated percentages. Staff
  receives the server-scoped ticket list, and manager requests no longer supply workflow/identity aliases.
- The pending schema passed a dry run and 57 transactional workflow/RLS checks before
  application. Committed-schema suites passed 62 maintenance checks, 93 housing/RLS
  checks, 137 enrollment/inspection/registration checks and 39 media checks. All 91
  public/denied HTTP cases passed after rerunning a transient statement-timeout attempt.
  An extra rerun exposed a TLS read timeout. The backend now caps client reads at
  30 seconds, handles checked-out client errors and discards interrupted connections
  without replaying writes. The actual PostgreSQL timeout/recovery check passed and
  verified that the next request uses a different client. The final 62-check maintenance
  rerun passed with real Storage cleanup and all temporary rows rolled back.
- TypeScript, the production frontend/backend build, private-artifact smoke test,
  private-data check and whitespace review passed. Authenticated provider/browser
  journeys remain unverified; no test creates or imports an Auth account.
- Encrypted archive `b76c0235-3f07-482c-b85f-a18df2aaa4a3` restored in isolated local
  PostgreSQL: 18 migrations, 36 public RLS tables, five preserved Auth identities,
  19 sessions, zero application profiles and zero Storage objects. A first dump attempt
  timed out; the successful retry passed archive listing, encrypted round-trip and
  restore/privilege checks. This is a checkpoint, not the final stopped-writer backup.
- The literal route inventory is 75 implemented, 13 retired and 107 pending entries;
  it excludes mounted routers and does not imply complete product workflows.
- Remaining: staff onboarding/operations and housing meetings/reviews, reviewed property
  changes, admin resolution after resident release, seller/orders/payments, avatar media,
  keyed governance and real provider/authenticated HTTP/browser journeys. Default
  dev/build/start still use JSON; do not reset accounts or remove it before full verification.

## Implemented foundation

- Product audit, 28 applied migrations, normalized schema, foreign keys, RLS, safe public catalog views and
  migration ledger with digest checks. Migrations run atomically; dry runs roll back.
- A PostgreSQL pool and transaction layer. Verified requests assume a non-login,
  non-BYPASSRLS backend role and carry trusted Auth subject/session identifiers.
  Revoked sessions lose their database context immediately, including before JWT expiry.
- An independent Supabase backend with confirmed signup, password and PKCE Google
  login, HttpOnly access/refresh cookies, refresh, logout and session validation.
  Existing cloud test accounts without new profiles are deliberately not backfilled.
- Verified sub-account enrollment, email confirmation/resend/cancellation, primary
  registration-status reads and atomic room-key claims. Immutable owner links and unique
  allocations protect each primary owner/room/bed. Parent sessions cannot impersonate children.
- Same-email resident/seller identities share one Supabase password with different portal
  PINs. PINs are salted scrypt hashes with five-attempt, 15-minute lockouts and RLS-checked
  versions. A child's own verified credentials are required to establish sharing.
  Separate work-email manager identities remain supported.
- The migration build has a verified resident enrollment form at both room-activation
  entry points and PIN prompts on the unified and seller login forms. Pending enrollment
  resumes from PostgreSQL; local cached manager records are not used in this build.
- Verified work-email manager enrollment and physical-property submission create an
  inspection dossier and pending manager assignment. The migration onboarding form uses
  verified enrollment IDs rather than client ownership fields.
- Manager review reads, saved officer dispatches, immutable authored reports, reinspection,
  approval/rejection/follow-up and officer suspension are implemented in the replacement
  backend. Approval requires a submitted physical report; lifecycle notices reach the
  primary user and active administrators. Evidence uploads use private owned Storage assets;
  reports accept only the assigned officer's ready photographs for that exact inspection.
  Officer onboarding and the real provider/UI journey remain pending.
- Scoped manager property and private room-key reads, explicit batch key generation
  for configured rooms and atomic occupant release/key rotation. Release closes only
  resident access and preserves a shared seller identity. Reactivation requires the resident's
  own verified login and current PIN, reuses the saved enrollment/context and preserves history.
  Initial hierarchy configuration creates actual blocks, floors, rooms and beds from explicit
  layouts; it rejects invented defaults, conflicting totals and silent replacement. An exact retry
  is idempotent. Full registration now creates this hierarchy and its review dossier atomically.
- Manager secret keys use salted scrypt hashes, persisted five-attempt lockouts and versions
  rechecked in the write transaction. First issuance shows the key once. Recovery petitions
  notify administrators; the reset decision still requires its pending administrator approval workflow.
- A private `pinevela-media` bucket and owned `media_assets` registry. Raster files are decoded,
  metadata stripped and bounded before upload. Attachment triggers prevent cross-account/purpose
  reuse. The API checks current public eligibility or account access and verifies downloaded bytes.
  Interrupted transfers retain reconciliation state; ready objects are preserved if a commit response
  was lost. The cleanup command handles only stale incomplete uploads through Storage APIs.
- Authenticated housing dashboard projections for staff, maintenance, staff bargains, change
  requests and the actor's activity feed. Guests cannot access these views. Reads join actual
  relationships and verified profiles; operational writes are still being ported.
- Public residence and marketplace reads; paid-plan branding and reservation-aware
  availability; exact-recipient notification reads, read/popup acknowledgements and
  notification invalidations through PostgreSQL LISTEN/NOTIFY.
- A private founder provisioning command that verifies the exact new Google identity
  for `andyheller2k@gmail.com`. It has not been executed. It refuses old identities without
  a new application profile and refuses to overwrite existing administrator membership.
- Separate administrator settings keys, persisted lockouts, keyed receiving-account
  configuration and settings notifications. Pricing and other governance remain pending.
- Encrypted local JSON/upload backup and an encrypted PostgreSQL archive including
  private tables and ACLs. Current recovery evidence appears in the checkpoint above. Isolated local restore passed for the seventeen-migration snapshot
  `8ab119f5-06f8-46ac-84a7-b7817f21c023`:
  5 Auth users, 19 Auth sessions, 36 public application tables, zero application profiles
  and zero Storage objects. RLS and guest/write restrictions survived restoration.

## Verification so far

`npm run db:verify-boundaries` checks real existing Auth subjects inside one rolled-back
transaction. It creates no Auth identities and leaves no domain records. Checks cover
separate identity/owner links, context impersonation, allocation uniqueness, cross-hostel
relationships, profile isolation, notification isolation, privilege escalation and revoked
sessions. `npm run db:verify-http` exercises public and denied requests against the real
database without mocked accounts/provider responses. These checks do not replace positive
Google/email and authenticated workflow API tests after onboarding is complete.

Earlier completed database checks: 93 boundary/housing/dashboard assertions and 137
enrollment/claim/PIN/status/inspection/registration/review assertions. Media verification passed 39 checks,
including a real supplied-image Storage upload/download/integrity/delete round trip and
direct owner/other-account/guest RLS reads. The temporary object was deleted and application
rows rolled back. Maintenance verification passed 62 committed-schema checks including
private report/repair evidence, UI-compatible follow-up/decline/sign-off fields and an actual
Storage round trip. A real PostgreSQL read-timeout check verified safe client discard and
recovery without replaying queries. Appointment verification passed 86 transactional checks.
Seller registration/review verification passed 55 transactional checks on the final migration.
Store setup/profile verification passed 59 transactional checks; private inventory passed 80.
Verified Google retention classification passed 19 read-only checks.
The current public/denied HTTP suite passed 176 cases, including
upload authentication before parsing and unsupported encoding/charset rejection.
Database test records rolled back or stayed within deleted isolated restores; no Auth
accounts were created or imported. TypeScript, the independent Vite/backend build, its
public/private-file smoke check and private-data check passed. Earlier Google identity-contract
checks are recorded in the previous checkpoint. These checks do not prove actual email delivery, positive provider login,
authenticated HTTP workflows or responsive enrollment/PIN UI behavior. The literal inventory
marks 118 existing endpoints implemented, 13 retired and 64 pending review/port; these counts
exclude mounted routers and do not represent complete product workflows.

## Cutover gates still open

Latest account-retention instruction (2026-10-09): keep only accounts with a verified
Google identity, retaining exact Auth UUID/mailbox links. Other accounts are removal
candidates; full backups must not restore disposable accounts into production.
The reset preparation script reads trusted Auth identity/verification records and
marks linked-record/media dependency review incomplete. No reset or account import
has occurred. Earlier all-account reset previews are superseded.

1. Verify seller enrollment/application forms and complete remaining manager entry points/account activation, password/PIN recovery,
   private account projections and registration-status UI. Verify real email and portal logins.
2. Complete reviewed residence changes/resubmission, new-property verification after deletion and the inspection UI/provider journey; port academic-year key rotation/delivery,
   staff rehire; verify real invitation signup and email delivery. Meetings, staff retention
   and private staff reviews have transactional APIs but need real authenticated browser/API coverage. Maintenance has transactional APIs but
   still needs provider-authenticated HTTP/browser coverage and release resolution. Room claims exist; their
   real authenticated journey still needs verification with the hierarchy workflow.
3. Verify actual live subscriptions, checkout and Paystack webhook delivery; port
   reviewed paid-access/refund resolution; receiving-account configuration is ported
   but still needs real authenticated UI/HTTP and non-default provider selection checks. Orders, handover PINs,
   buyer-seller messaging and purchase reviews have transactional APIs. Store setup,
   inventory and media also have transactional APIs; verify their real authenticated
   provider/API/browser journeys.
4. Port admin governance, approval-key enrollment and key recovery, invitations, shared
   pricing approvals, remaining portal settings and messages,
   deletion/ban proposals, audit views and unfinished maintenance resolution after allocation release. Preserve quorum/founder
   decisions and lifecycle notifications. Extend owned Storage to avatars,
   including deletion lifecycle and an actual object-byte backup when objects exist.
5. Verify allowed/denied APIs, actual Google/email verification, restart persistence,
   responsive authenticated flows, payment idempotency and current backup restoration.
6. Stop writers, refresh backups and the exact reset preview, execute the reviewed
   account/domain reset, establish the new verified founder, then cut over and remove the
   JSON runtime only after the replacement passes verification.

`api-cutover-inventory.json` is generated from literal Express routes by
`npm run db:audit-cutover`. Mounted routers, aliases, duplicate routes and frontend
endpoint use still require review. A route marked implemented is not a claim that its
entire product workflow is production-ready. Unknown operations fail in the migration
backend and never fall back to JSON. Its build uses `dist-supabase` so the current
backend's `dist` build is preserved. Server artifacts are built into
`dist-supabase-backend`, outside the frontend static directory. Private source files,
server bundles and source maps are blocked, including normalized encoded request paths.
Only this build opts into `VITE_PERSISTENCE=supabase`; the default build retains the
current runtime until cutover. This flag changes presentation, never server authorization.

Commands: `npm run dev:supabase` (loopback port 3001), `npm run build:supabase`,
`npm run db:migrate -- --dry-run`, `npm run db:verify-boundaries`,
`npm run db:verify-http`, `npm run db:verify-enrollment`, `npm run db:verify-build`,
`npm run db:verify-staff-workflows`, `npm run db:verify-conversation-boundaries`,
`npm run db:verify-conversations -- BACKUP_UUID`, `npm run db:verify-payments -- BACKUP_UUID`,
`npm run db:verify-media`, `npm run db:reconcile-media` (read-only by default),
`npm run db:audit-cutover`, `npm run db:backup`,
`npm run db:rehearse-backup -- BACKUP_UUID`.
