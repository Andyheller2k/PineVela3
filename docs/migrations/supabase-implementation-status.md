# Supabase implementation status

## Current: sole Supabase persistence — 16 October 2026

Default commands now use the native Supabase server/build. Forty legacy runtime
modules and frontend persistence switches are removed; unknown APIs return 404.
The owner explicitly classified the reviewed JSON records as development data:
29 files / 32,690,351 bytes and the old build are privately archived, with matching
hashes and an independently restored encrypted recovery checkpoint. Active JSON
and local-upload roots are absent. All seven hosted Auth subjects, six profiles
and ten contexts are unchanged by final read-only retention checks.

89 security/unit tests, native TypeScript/build/privacy checks and the pre-retirement
365-check eight-role browser run passed. Real local native business, RLS, recovery,
Storage, role/key and polling checks passed. Final post-retirement restart and 392-check browser
verification passed. See [current continuation](../../SUPABASE_CONTINUATION.md)
and [isolated acceptance](isolated-workflow-acceptance.md) for evidence and limits.

The sections below are historical migration checkpoints, preserved as history;
their earlier pending/default-JSON statements do not describe the current runtime.

## Project latency and approved development cleanup — 15 October 2026; no migration

- Batched ordered transaction admission and live account/session checks preserve
  existing authorization, locks and RLS. Three pure settings reads now share read
  admission. Public catalog reads retain their own maintenance lock/check without
  a duplicate preliminary transaction; unsigned session probes fail without SQL.
- Independent native UI reads are concurrent, slow inbox polls coalesce, background
  governance observers refresh every 30 seconds, and native guest SSE retries stop.
  Route/map deferral reduces common entry JavaScript from 859,463 to 507,999 bytes.
- Actual four-lock phase timings were 3,129/2,991 ms separately and 215/865 ms batched.
  65 native admission/read checks and 11 real archived-session policy checks pass;
  focused UI lifecycle tests, TypeScript and Supabase builds pass. Cloud connection
  latency remains variable; authenticated browser timing has not been repeated.
  See [latency evidence and limits](../operations/latency.md).
- The reviewed Premuim Pine development cleanup is **completed**. Two distinct
  approvals, the user's own keyed founder pause/final consent/request and fresh
  restored DB/PIN-key/Storage recovery preceded the exact native worker. Four
  housing rows were removed, with zero image tasks or registration bans. The
  temporary local request control is disabled again; persistent defaults stay off.
- **44 post-execution checks passed** against the genuine backup: completed linked
  receipts, retained active manager/Auth subject/operation key, all seven Auth users
  and provider IDs, reviewed profiles/contexts/completed enrollment, 49 original
  history rows and unchanged seven-object Storage catalog/media metadata. No manager
  session existed before or after cleanup; fresh real login remains separate.
  Provider object bytes were not downloaded again. Evidence is private
  `development-cleanup-saved-verification.json`; the first session-baseline assertion
  and read-only diagnosis are retained. No schema/default-backend changes or JSON removal.

## Authorized development inspection report — 15 October 2026; no migration

- The owner explicitly authorized development inspection/approval before reviewed
  cleanup. **22 genuine officer browser checks passed**, including the actual form
  at 1440/375px, blank native validation, registered signature and one report write.
  The saved report explicitly disclaims a physical visit and all physical findings,
  requests reinspection and contains zero photographs. **16 genuine administrator
  checks then passed**: saved-report review, required override reason, blocked blank
  approval, bounded 1440/375px dialog, one request and saved explicit development
  decision. Case/inspection/property are approved, manager active, property unpublished.
- **Eight native guard checks passed**: guest/stale report 401/409, officer/guest
  approval 403/401, duplicate-report 409 and an unchanged recorded report afterward.
  The user supplied genuine administrator sign-in for the approval and then genuine
  Google manager sign-in. The manager's exact profile/context, owned empty shell,
  residence setup gate and completed private-key issuance are verified without
  reading a key. No physical-site or occupied housing acceptance is claimed.
- The existing server requires an explanation when approving against the officer
  recommendation, while the UI previously submitted empty notes. The Supabase
  approval dialog now captures that reason and administrator context, blocks
  duplicates and requires saved-state refresh after an uncertain reply. Normal
  backend authorization, report and activation rules remain unchanged.
- The first full manager-dashboard attempt passed 11 native identity/ownership/
  privacy/role checks, then timed out after 240 seconds in its sequential read chain.
  A maintenance read returned 503 then recovered. The Supabase manager query now
  starts its nine independent reads concurrently and consumes cancellation while
  preserving legacy ordering, cache, polling, mapping and server authorization.
  A first concurrent run loaded all nine datasets, then stopped at its sidebar
  selector mismatch. Review also corrected the Supabase eligibility check to use
  the native reviewed-setup flag rather than raw manager-approval status. The
  actual-label selector was corrected before the successful rerun below.
- **23 rebuilt genuine manager-browser checks passed**: real Google identity and
  exact assignment, guest 401, three administrator/officer 403 denials, unpublished
  public detail 404, completed key issuance checked without reading a key, all nine
  successful reads overlapping, 1440/375px setup prompt and locked housing controls,
  immutable actual login email and the same verified session after full reload.
  The initial ready time was 116,942 ms; native latency remains unresolved. This
  verifies the manager portal/setup gate, not occupied or registered housing.
- Frontend TypeScript/build, five report-security tests, 25 source assertions, CJS
  syntax and diff checks passed. Native connection latency is not resolved by the
  verifier's optional longer wait; all product/API deadlines remain unchanged.
- A read-only native dependency inventory prepares property-only cleanup: one
  Premuim Pine residence, assignment, application and report; no rooms, occupants,
  staff, payments, maintenance or property media. Retain genuine manager sign-in.
  Earlier administrator browser preview retries encountered GET 503. After genuine
  founder sign-in, eight native browser preview checks passed and two further checks
  verified the founder and prepared native deletion dialog. The user submitted with
  their own key inside PineVela; an actual governance read confirms the saved
  proposal is pending, with exactly one approval from administrator #1. A distinct
  genuine administrator's own keyed approval is needed next.
  A refreshed current native inventory confirms the exact four active housing rows
  in the private cleanup plan, retained manager sign-in and no registration ban.
  The last live execution-request capability was disabled; no pause, consent, deletion or
  Storage cleanup was requested by the verifier.
  A separate browser connection timed out before the follow-up scope read/window
  creation, and four guest HTTP probes timed out. These are incomplete checks;
  subsequent local health returned Supabase HTTP 200. After closing the completed
  interactive reader, 11 saved-review checks passed, including exact dependencies,
  genuine founder identity/vote and the eligible second-administrator roster. A
  separate login window was opened. The user then signed in as Jennie Violet (#2)
  in a different actual context; the founder context remained open. Eleven native
  independent-review checks passed with HTTP 200 identity/governance reads and the
  exact saved scope. UI preparation remains incomplete: More-menu support is
  syntax-checked, but the next browser connection timed out. The pending user step
  is Jennie's own keyed vote through Admin Approvals → Hostel deletion approvals.
  No second vote, preparation pause or deletion is yet verified. The read-only
  verifier retains incomplete evidence and never reads keys or submits votes.
- Current encrypted supplemental checkpoint `d3a6e2e4-5f38-45f2-8856-9163d3ae40b5`
  preserves 120 actual tables, including the officer/dispatch and 69 migrations.
  Full dump attempts timed out. This row export has no PostgreSQL restore rehearsal
  and does not meet the destructive cleanup/cutover gate. Previous restored DB and
  matched Storage archives are preserved. No schema, default-runtime or JSON removal.
  The round index records **69 passed genuine browser/API checks** and zero deletions.
  See the [continuation checkpoint](../../SUPABASE_CONTINUATION.md).

## User-created dispatch and populated officer queue — 15 October 2026; no migration

- The user manually dispatched Premuim Pine. **23 genuine read-only browser checks
  passed** for the actual saved assignment to Oppong Manu Andrews: status `dispatched`,
  medium priority, one owned queue item and no submitted report.
- Exact property/manager card, Pending Field Visit and inspection action passed at
  1440/375px, including card/control bounds. Actual guest 401 and stale-context 409
  denials, unchanged saved assignment and preserved officer identity also passed.
- The verifier's optional manager-email mode keeps separate populated evidence in
  `officer-dispatch-browser.json`; previous 24-check session evidence is retained.
  CJS syntax/diff checks passed. Only verification tools and documentation changed.
- Premuim Pine remains development-only. Dispatch delivery is verified; physical
  inspection/report, approval, operational acceptance and cutover remain pending.
  No report, GPS, photograph or additional dispatch was submitted by verification.
  No auth/RLS/schema or default-runtime changes. Refresh recovery evidence before
  cutover/destructive work. See the [continuation checkpoint](../../SUPABASE_CONTINUATION.md).

## Genuine field-officer session acceptance — 15 October 2026; no migration

- Restored the stopped local Supabase preview on port 3001. The user freshly signed
  in as the real officer in a private window; the verifier selects that context
  explicitly and never falls back to an administrator context.
- **24 genuine browser checks passed**: exact saved officer identity/zone and empty
  owned queue, guest 401, stale-profile 409, three administrator-list 403 denials,
  bounded 1440/375px portal controls, real refresh, administrator-page denial,
  return to the officer portal and preserved verified identity after full reload.
  A separate 14-check layout run passed. All checks used native replies; original
  tabs and sign-in were preserved.
- Initial read and mixed-case/uppercase selector attempts are retained as incomplete
  evidence. The selector was fixed in the verifier. Successful initial session reads
  took 18.9–40.0 seconds; the final run measured 30.4 seconds. Latency is not resolved.
- CJS syntax and diff checks passed. Only verification tools/documentation changed;
  no product/auth/RLS/schema changes, dispatch, report, approval or evidence upload.
  Populated cross-officer/physical and manager operational acceptance remain pending.
  Premuim Pine is development-only; cutover and JSON removal are still pending.
  See the [continuation checkpoint](../../SUPABASE_CONTINUATION.md).

## Inspection evidence and development-only application — 15 October 2026; no migration

- The user confirmed saved **Premuim Pine** is development-only. Seven genuine
  administrator read checks show its case remains `inspection_pending`, one active
  real officer and zero live inspections; no dispatch, report or decision was sent.
  Genuine physical and operational acceptance requires a real inspectable property.
- Removed invented GPS fallback coordinates/accuracy/address, positive missing
  checklist values, observations, signatures and automatic certification claims.
  Native location errors are visible, captures are scoped to the selected case and
  mounted account, and absent GPS remains `null`. New reports require an explicit
  recommendation; saved recommendations are distinct from administrator decisions.
- 11 location checks passed, including real Chromium permission denial in an isolated
  context with unchanged user settings, plus five existing report-security tests.
  Frontend TypeScript/build, 25 source assertions and diff checks passed. Successful
  physical capture and populated real-report browser acceptance remain pending.
- Authorization/RLS/schema are unchanged: 69 migrations, source inventory
  226/178/14/34, 99 replacement modules and no reachable JSON. Default switch and
  JSON removal remain pending. Recovery evidence predates officer registration.
  The earlier five-check dispatch preview is incomplete, not an acceptance pass.
  See the [current continuation](../../SUPABASE_CONTINUATION.md).

## Populated administrator review and independent retries — 15 October 2026; no migration

- Manager applications and inspection reports now load concurrently, independently
  of the remaining dashboard datasets. The officer roster has its own loading/retry
  state. Supabase skips the duplicate manager-list alias; legacy reads are preserved.
- Both queries capture the administrator context, consume cancellation and use a
  30-second API deadline. Failed reads stop interval polling and show explicit retry;
  unavailable data cannot be shown as an empty list. Existing query invalidations,
  native authorization and physical inspection/approval gates remain intact.
- **38 genuine browser checks passed**: exact saved ownership/application/notice,
  guest 401 and stale-profile 409 denials, populated 1440/375px cards/navigation,
  delayed real requests, independent application and actual officer-roster recovery,
  and preserved administrator sign-in. The user's real officer is now active.
- Full TypeScript/Supabase builds and final frontend TypeScript/rebuild, CJS syntax,
  25 source assertions and diff checks passed. Source inventory remains 226/178/14/34;
  99 replacement modules inspected, no reachable JSON. Final document-to-card load
  was 32,654 ms; cold authentication/provider/browser latency is not eliminated.
- No schema, scripted account creation, dispatch, decision, physical inspection,
  default switch, reset or JSON removal. The earlier encrypted recovery checkpoint
  predates officer registration; refresh it before cutover/destructive operations.
  See [administrator reads](administrator-read-concurrency.md) and the
  [continuation checkpoint](../../SUPABASE_CONTINUATION.md).

## Genuine Google manager and recovery checkpoint — 15 October 2026; no migration

- The user completed Google manager signup and property submission as
  `mindspacehqr@gmail.com`, linked to primary `finalform2k@gmail.com`. This replaces
  the earlier intended manager email. The saved application is `inspection_pending`;
  the manager remains pending without an operational session.
- 23 genuine primary-browser checks passed: saved Google verification/ownership,
  native role/stale-scope denials, real reload into submitted status and preserved
  primary sign-in. 50 unchanged-checkpoint native checks passed, including the real
  callback audit, primary-only lifecycle notice, all-three-administrator submission
  notices and foreign-primary isolation. All 120 archived tables remain unchanged.
- Encrypted DB checkpoint `338c3cef-ddb7-48f3-ac1c-bca0c31f0384` fully restored with
  its private server key, 69 migrations, 37 RLS tables and 14 private projections.
  Matched Storage archive `003b60f3-4d45-4651-a28c-eadc108876a6` reconstructed all
  seven objects / 3,194,064 bytes locally. Neither backup involved cloud writes or
  account restoration. These are continuation backups, not writer-frozen cutover.
- Focused TypeScript and verification-script syntax checks passed. No application
  code/schema change, approval, dispatch, physical inspection, reset, default switch
  or JSON removal occurred. Administrator review and operational manager/residence
  acceptance remain pending. See [current continuation](../../SUPABASE_CONTINUATION.md).

## Local Google manager enrollment — migration 69, 14 October 2026

- The user deferred domain/Resend and final work/student/signup token delivery to
  later launch-auth setup. A server-selected local-only flow verifies a separate
  real Google manager identity while preserving the primary session, separate
  identity, pending manager status, inspection and administrator approval.
- Initial reserved OAuth signup grants no app profile/role; only the owned callback
  with private nonce, PKCE/state/cookie, exact native Google identity/live session
  and revalidated primary ownership completes enrollment. Existing PineVela profiles
  cannot be adopted. No new table, public grant or RLS policy; normal email rules stay.
- 32 Google-enrollment and 139 manager/residence native checks passed through all 69
  migrations, with zero native advisors; 82 actual HTTP and 12 genuine administrator
  browser checks passed. Focused TypeScript, Supabase frontend/API/both worker builds
  and 23 source assertions passed. Inventory 226/178/14/34, 98 replacement modules,
  no reachable JSON. Positive new Google signup/saved progress was subsequently
  verified on 15 October as recorded above.
- Both pre/post encrypted DB backups restored; post-69 backup is
  `a9af3c54-c91d-4f9e-ab65-81855e572386`. Separate Storage-byte evidence remains.
  After transient timeouts, 75 read-only live checks confirmed all 69 hashes and
  private initializer grants. Final built-server startup/public reads/private-file
  denials also passed. Default JSON backend and wipe gates unchanged.
  See [implementation and evidence](google-manager-development-enrollment.md) and
  [the continuation checkpoint](../../SUPABASE_CONTINUATION.md).

## Manager application corrections — 14 October 2026; no new migration

- This historical round used organization-email-only enrollment; the later local
  Google development exception is described above. No mailbox was invented. Primary owners can correct requested property details through
  the same verified enrollment/case/inspection shell. Administrators can request
  corrections with feedback; pending counts and current report selection use saved
  state, rather than stale closed inspection history.
- Fresh inspection is mandatory after corrections. Prior property/report/review
  evidence remains private history, including dispatches created before snapshots.
  Ownership, restrictions, generation, active-dispatch and final-decision guards,
  idempotent retries, captured-account checks and primary/admin notifications pass.
- 139 isolated native setup/correction checks, zero native advisor findings, 47
  manager re-enrollment checks, 67 real HTTP checks and 23 source checks passed.
  Focused TypeScript and Supabase frontend/API/both worker builds passed. Genuine
  administrator browser passed 10 empty-directory/role/stale-account checks; positive work-email
  manager and populated correction/review acceptance remain pending.
- Still 68 migrations; source inventory 226/178/14/34, 97 replacement modules, no
  reachable JSON. Default backend/JSON and destructive gates unchanged. See
  [implementation and evidence](manager-application-corrections.md).

## Administrator residence review — 14 October 2026; no new migration

- Connected the existing correction-request API to the admin directory/pending alerts
  through a dedicated review dialog. Saved case, photos, contacts, map, capacity and
  feedback are loaded before an explicit decision; final/physical/media/assignment
  checks remain server-side. Timeouts use reload, not automatic mutation replay.
- Private roster includes actual review metadata. Pending/rejected/category/verified
  labels follow saved state, independently of publication. Pure roster reads use the
  existing shared authorized-read wrapper; no RLS, grant or schema change.
- 102 native checks, zero native advisors, 43 real HTTP checks, full/final focused
  TypeScript, frontend/API/workers and final frontend rebuild, and 23 source checks
  passed. The later genuine administrator retry passed eight checks, including the
  empty directory at 1440px/375px. Populated review UI and
  genuine manager email/browser acceptance remain pending.
- Still 68 migrations; source inventory 226/178/14/34 and 97 replacement modules,
  no reachable JSON persistence. Default/JSON and destructive gates unchanged. See
  [admin review evidence](admin-residence-review.md) and the current continuation.

## Residence correction follow-up — 14 October 2026; no new migration

- Fixed the current `more_info_required` dead end. The manager can open the saved
  setup/feedback and resubmit corrections through the same case. Live assignment,
  applicant, physical identity, restrictions, owned media and publication guards
  remain; prior submission/review evidence is retained in private audit history.
- Contact/photo changes keep room identities. Layout replacement requires unused
  pending setup without keys, allocations, enrollments, staff or maintenance history.
  Old room reference IDs remain retained; reviewed corrections require fresh approval.
- 94 isolated manager/residence checks, zero native advisors, 19 real guest/cross-site
  HTTP checks, TypeScript and Supabase frontend/API/worker builds passed. Genuine
  administrator reads/UI passed 16 checks after migration 68. A separate new
  manager-role denial browser check stopped at approval timeout with zero checks.
- No fictional cloud data, mailbox, provider reply, live reset or schema change.
  Genuine work-email/positive manager browser acceptance remains pending. Migration
  count is 68, JSON/default backend and destructive gates are unchanged. See
  [residence corrections](residence-corrections.md) and the current continuation.

## Street/map registration — migration 68, 14 October 2026

- Applied `20261014131638_remove_ghanapost_address.sql`. GhanaPost is retired across
  active frontend, types, validators, legacy/Supabase adapters, inspections and
  residence setup. Dropped its unused column with RESTRICT; history/backups remain.
- 70 isolated native manager/residence checks passed using the explicitly authorized
  fictional residence and genuine unchanged archived Google identities/sessions.
  Nine focused security tests passed. No fictional live account/property or provider
  reply was created; genuine work-email/browser acceptance is still pending.
- TypeScript, Supabase frontend/API/workers, built-server privacy/public reads,
  22 guest HTTP and 23 source checks passed. All 68 hashes and 110 live permission/
  schema checks passed; native/live advisors reported zero findings. Pre-change
  and post-change encrypted archives restored with actual grants/RLS and PIN
  recovery. The existing manager re-enrollment regression passed 47 native checks.
- Administrator pure reads use explicit shared locks while writes/expiry remain
  exclusive. 28 native concurrency checks and 237 focused historical projection
  checks passed. A genuine 16-check browser run passed before migration 68; its
  first post-restart retry timed out, and the subsequent approved retry passed all
  16 checks. No proposal/consent/wipe was submitted.
- JSON/default backend and release gates remain unchanged. See
  [street/map workflow](street-and-map-registration.md),
  [read boundary](administrator-read-concurrency.md), and
  [current continuation](../../SUPABASE_CONTINUATION.md).

## Current caller review — 14 October 2026; no new migration

- Corrected source inventory: 226 old endpoints, 178 replacement route matches,
  14 explicitly retired and 34 unmatched legacy contracts. The scanner now handles
  constant prefixes, finite route loops, parameter-name aliases and imported shared
  route helpers. Frontend references preserve known HTTP methods and source locations.
- Reviewed all 34 unmatched contracts: 27 have no current frontend reference; seven
  are legacy-only or unreachable controls. This is not proof of arbitrary dynamic
  requests or external consumer compatibility. No new active product workflow was
  established from this set; do not automatically port it.
- 23 source checks and 22 actual guest HTTP checks passed; TypeScript passed.
  No runtime/schema/RLS, live account, release gate, default backend or JSON change.
  An authenticated browser evaluation did not complete; positive genuine acceptance
  remains pending. See [caller review](active-caller-review.md) for exact contracts,
  evidence, limits and the remaining cutover sequence.

## Reviewed system-wipe handoff — migration 67

- Applied `20261014084050_reviewed_system_wipe_execution_handoff.sql`. A new private
  RLS table ties immutable queued requests to exact founder consent and native
  closure receipts. Notifications/audit and completion commit atomically.
- Founder-only, own-key, typed-confirmation API handoff; sanitized governance/UI
  status. Separate built worker restores saved recovery files, rechecks live
  authority, locks duplicate deliveries and reconciles completed receipts. Invalid
  consent cannot revive or silently release a scope pause. No Auth/Storage deletion.
- **280 native assertions passed:** 81 handoff, 93 operational, 106 primary lifecycle.
  Actual encrypted restores/Storage bytes and genuine archived Auth; no cloud test
  data, fabricated provider reply or changed Auth timestamp.
- TypeScript, frontend/API/both worker builds, all 67 hashes and 109 live checks
  passed; native/live advisors zero. Fresh pre/post-67 encrypted backups both restored
  with private PIN recovery and RLS/grants. Built API/private artifact checks, 34
  actual guest HTTP and 11 built-worker lifecycle assertions passed. Source audit: 195 endpoints (146/14/35),
  97 reachable modules; replacement API/workers reach no JSON persistence.
- `PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS` remains off; preview is default. Genuine
  operational/provider acceptance, reviewed reset/final backups and default cutover
  remain. See [worker operation](../operations/system-wipe-worker.md).

## Operational wipe core — migration 66

- Applied `20261014002629_reviewed_operational_wipe_core.sql`. Exact transaction-bound
  effects reuse the retained execution ledger; native founder/five-key consent and
  restored post-pause recovery remain mandatory. Public execution is disabled.
- Operational portals/properties/stores close without deleting Auth, profiles,
  finance/review history, administrator access or Storage bytes. Unfinished repairs,
  inspections and seller applications retain receipt-linked withdrawal evidence;
  manager requests resolve through the same receipt. API/projection/UI readers and
  action/upload denials distinguish withdrawal from a completed repair or approval.
- **391 native assertions passed:** 93 operational, 24 invited-officer/pending-seller,
  104 scope/concurrency, 64 planner, 106 primary lifecycle. No Auth timestamps,
  provider responses or cloud product fixtures were fabricated.
- TypeScript, frontend/API/worker builds, 92 live checks/all 66 hashes and native/live
  security advisors passed (zero findings). Pre/post-66 encrypted backups both restored
  with private PIN recovery and RLS/grants. Built-server checks, nine read-only
  worker checks and 34 actual guest governance/recovery HTTP assertions passed.
- JSON remains intact/default. Finish live execution handoff and genuine acceptance
  before the reviewed reset, final backups and default switch. See
  [operational protocol](operational-wipe-core.md).

## Complete system-wipe review dependencies — migration 65

- Applied `20261013233045_complete_system_wipe_scope_dependencies.sql`. Reviews
  cover all meeting context/allocation/employment directions, pending seller signups
  without stores, directed officer invitations and exact saved image references.
  Full enrollment hashes and retained delivery/notice/recipient digests disclose no
  credentials. Read/popup state is excluded from those immutable dependencies.
- Native statement locks and before/after guards protect frozen dependencies,
  including a notification writer waiting behind pause creation. The planner limits
  resident-only effects to their saved relationships, includes unresolved declined
  bargains, and preserves repair/confirmation evidence. Existing primary closure
  still commits atomically under the added metadata hooks.
- **274 isolated assertions passed:** 104 scope/history/concurrency, 64 planner and
  106 primary lifecycle. Genuine archived Auth bytes remained unchanged; no cloud
  product fixture, provider response or operational wipe was fabricated.
- TypeScript, frontend/API/worker builds, built-server checks, actual guest HTTP
  denials, 74 live schema/permission checks and all 65 immutable hashes passed.
  Native/live advisors zero. Pre-65 encrypted archive `37c9a926-e631-459e-8c56-0c09028fcbe0`
  and post-65 archive `2da96c8b-4d41-4e4d-9899-6072b89dc07b` both restored with private
  recovery keys and grants/RLS. General operational closure and genuine positive
  acceptance remain pending; live execution is disabled and JSON is intact/default.

## Manager registration cooldown caller — 2026-10-13

- Mounted the missing owner-derived `GET /api/users/manager-restriction` using
  existing native bans and registration invariants. One database timestamp selects
  the longest active own primary/closed-manager cooldown; expired history is retained.
  Primary-only native binding, selector/body/context denials and unchanged RLS/grants
  keep this scoped read separate from privileged administrator inventory.
- Onboarding checks access, shows retryable errors, cancels stale account requests,
  counts down from database time and rechecks at expiry. Other portals skip this read.
- **101 isolated native and six actual guest HTTP assertions passed**, along with
  TypeScript and frontend/API/worker builds. Genuine archived identities/sessions
  remained byte-equivalent; no cloud test data/provider responses were fabricated.
  No approved PineVela browser tab was available; genuine primary UI acceptance remains
  pending. No migration, Storage mutation or final cutover was performed.
- Source inventory is now 195 literal endpoints: 146 implemented, 14 retired,
  35 pending; these are not remaining workflow/migration counts.

## Verified officer invitations and recipient room-key delivery — 2026-10-13

- Applied migration 64, `20261013122231_verified_officer_invitations_and_room_delivery.sql`.
  Officer onboarding extends existing private enrollments. Active administrators use
  their own approval key; the exact separate verified identity accepts from its primary
  portal. Existing administrator/other portal identities cannot be converted. Pending
  invitations are cancelled on issuer key/status changes, history is immutable, and
  consumed links cannot restore access. Fresh provider sessions are required after
  officer grant/restoration. Native context locks serialize binding with suspension;
  the actual first-INSERT wait/denial was verified. Main Google login routes officers
  to `/field-officer`; unkeyed status control/password credential cards are absent
  from the replacement flow. Roster/profile/report names use completed metadata.
- Room delivery derives the assigned manager, current key and native residence labels.
  It requires own manager-key version/rooms permission/reviewed setup, canonical retry
  nonce, one eligible confirmed non-deleted/non-banned recipient, and occupied-room
  owner matching. Recipient primary notification, immutable receipt and audit commit
  together. It does not send email/SMS or allocate a room. Historical key/room/residence
  UUID snapshots have no physical-housing FKs; retained identity/notice FKs, RLS/private
  grants, freeze/scope/queued-media guards remain. Actual reviewed teardown preserves
  identical delivery/notice history. Staff do not gain recipient-email metadata.
- Admin store and manager-restriction reads are mounted, use actual current/historical
  registration/payment/access data, reject identity selectors/stale context headers,
  and show retryable errors. No legacy single-admin cooldown waiver is exposed.
- **334 native assertions passed:** 85 officer, 71 delivery, 26 admin reads and 152
  reviewed worker/recovery checks. Native tests use actual archived identities/session
  times and isolated domain records. No Auth subjects/provider replies/times were
  fabricated. Recipient eligibility and final officer locking fixes received focused
  reruns; unchanged admin reads/worker history mechanics were not broadly repeated.
  Six actual mailbox checks resolved four eligible primary owners. Native advisors zero.
- **20 actual HTTP, 14 genuine administrator browser and 22 guest browser checks passed.**
  Guest page covers 1440/768/390px/light/dark, strict continuation, readable contrast,
  reachable actions, malformed links and no overflow/runtime exception. Authenticated
  checks cover real DTOs, selector/context denials, wrong-role endpoints, invitation
  controls without an officer password and the identity-boundary explanation. Retries
  fixed test loading/navigation timing, fixed viewport, restored genuine sign-in and
  used the exact signed-in browser context. No credentials were extracted or cloud
  officer/delivery fixtures created. Positive fresh officer/recipient browser journeys
  and verified email-only provider acceptance remain required.
- TypeScript, unit checks, final frontend/API/worker builds, built-server startup/public
  reads/private artifact checks, diff and source inventory passed. Inventory now reports
  195 legacy literal endpoints: 145 implemented, 14 retired, 36 pending across 91 native
  modules; JSON is unreachable from the replacement. Counts include alias/dormant false
  gaps and do not measure remaining migrations/workflows.
- Dry run/application succeeded; 64 immutable source hashes match, live RLS/private
  recipient/admission privileges passed, live security advisors zero. Pre-64 encrypted
  backup `8843dc86-6e14-4e2d-8ec4-3043c4ac6e67` (1414509 bytes) and post-64
  `06d4d770-0e63-44b4-9bbc-535d053a900b` (1451291 bytes) both passed isolated full
  restore/private PIN-key recovery. Snapshot: 6 Auth users, 4 profiles, 36 sessions,
  3 keyed admins, 7 objects, 37 public RLS tables, 14 private projections and no public
  views. Later genuine sign-ins changed live session counts. Storage bytes unchanged;
  last verified full archive `ff6a02ce-a67c-45be-b81e-450b0c260e2a` remains applicable.
  An interruption stopped local processes and initial post-backup/browser checks;
  restart/retry completed them without another schema application or data reset.
- Replacement preview runs at port 3001; JSON remains intact/default and destructive
  gates disabled. Next inspect the actual manager owner cooldown read and semantic
  inventory, then general operational closure and genuine operational/five-admin/provider
  acceptance. Current manager onboarding explicitly avoids intrusive documents; dormant
  document/card/additional-room code must not define new schemas. Details:
  [officer/delivery protocol](officer-invitations-and-room-delivery.md).

## Verified email primary re-entry — 2026-10-13

- Applied migration 63, `20261013112009_verified_primary_email_reentry.sql`.
  An explicitly requested Supabase email code/unopened sign-in link can reopen its
  original primary portal after a completed normal-wipe closure. Delivery uses
  existing identities only (`create_user:false`); no disposable account lacking a
  saved primary portal is initialized. Ordinary login/password recovery cannot reopen it.
- Supabase verification and `/user` supply the subject/session. Client identity/role
  selectors, foreign/duplicate links and recovery/signup/invitation proofs are
  rejected. Native receipt admission checks original ownership, supported confirmed
  Auth identity, same-subject live session, platform availability, bans and epochs.
  The immutable proof method must match the server flow. Concurrent Google/email
  attempts reopen once; notice failure rolls back the receipt, status and binding.
  Historical IDs, Auth, administrator access/keys and independent portals remain.
- The email re-entry API remains available; its button and modal have been removed
  from the login/signup cards. General operational wipe execution remains disabled.
- **172 native checks passed:** 106 primary closure/recovery and both re-entry
  methods, 41 closure-planner regressions and 25 retained Google signup checks.
  Tests use genuine archived Google identities/confirmed mailboxes/native sessions
  in isolated restores, plus actual encrypted database/Storage recovery. No Auth
  users, email identities, provider replies or verification timestamps are fabricated.
  Native security advisors reported zero findings.
- **13 actual HTTP checks**, **three genuine signed-in administrator browser checks**
  and **22 isolated guest browser checks** passed. Guest controls were tested at
  1440/768/390px in light/dark mode, including field contrast, reachable actions,
  close controls and no horizontal overflow. No mail, successful cloud account change,
  credentials or cookies were requested/extracted. The first browser attempt could
  not create a guest context in the approved profile; a separate temporary Chromium
  profile supplied guest coverage. Its tablet retry selected the visible theme switch.
- TypeScript, final frontend/API/worker builds, built-server startup/public reads/
  private-artifact checks, residual inventory and diff checks passed. Source inventory
  remains 195 legacy literal endpoints: 141 implemented, 14 retired and 40 pending,
  across 88 replacement modules; these numbers are not remaining workflow counts.
  The replacement backend cannot reach JSON persistence.
- Live dry run passed. First application hit SQLSTATE 55P03; ledger inspection
  confirmed only 62 versions and no relevant retained locks. The unchanged retry
  committed. All 63 source hashes match; live security advisors reported zero findings.
- Pre-63 backup `b47618aa-e632-4755-9db8-6143d5120020` and post-63 backup
  `037070bb-ffc0-486d-94aa-df85246e6fe4` both passed encrypted recovery and isolated
  restore, including PIN-key recovery, grants and RLS. Post-63 retains six Auth
  users, four profiles, 36 native sessions, three keyed administrators, seven Storage
  objects, 37 public RLS tables, 14 private projections and no public views.
  Live aggregate checks show zero primary executions/re-entries, receipt RLS enabled
  and eligibility lookup inaccessible to browser/scoped-backend roles.
- Replacement server restarted at port 3001. General operational closure and genuine
  provider/five-admin/operational browser acceptance remain. Actual email-only identity
  delivery/OTP and positive closed-account browser re-entry are not proved by the
  native post-provider checks. No live wipe/reset, account closure, JSON removal,
  default backend switch or Express replacement occurred.
- Details: [verified email primary re-entry](primary-email-reentry.md). Evidence:
  `primary-wipe-native.json`, `primary-email-reentry-http.json`,
  `primary-email-reentry-browser.json`, `primary-email-reentry-guest-browser.json`,
  `primary-email-reentry-live.json`, `primary-email-reentry-live-advisors.json`.

## Retained seller registration cycles — 2026-10-13

- Applied migration 62, `20261013104625_verified_seller_registration_cycles.sql`.
  Existing records receive generation zero. Each new registration has a separate
  application and store linked by an immutable application foreign key. One
  non-closed store per seller remains enforced; historical stores stay closed.
- The original primary owner can restart a closed seller using the actual separate
  verified student identity, email code/link or password, and current seller PIN
  where configured. Native guards independently enforce ownership, verification,
  session invalidation epochs, PIN version/lockout, bans and closed dependencies.
  Re-entry increments once, clears old seller app bindings, returns to review and
  preserves Auth, profile, history and the independent shared resident portal/PIN.
- Current-cycle selection now covers submission/status/admin review, Auth/store
  projection, setup, uploads, payment eligibility, public stores and order/message
  mutations. The primary form offers re-registration instead of showing a closed
  store as approved. Cancelling an unsubmitted new cycle is not blocked merely by
  its historical applications. Historical payment callbacks retain the paid record
  but report no access to the new store; old checkout retry keys are rejected.
- **206 native checks passed:** 54 seller cycles, 47 manager re-enrollment, 64 primary
  closure/recovery and 41 closure planning. Two cycles use a genuine local zero-fee
  policy and real payment fulfillment, not Paystack response mocks. Tests cover
  concurrent retries, wrong owner/session/PIN, PIN lockout/version, bans, unclosed
  stores, notification-failure rollback, distinct approvals/payments/access periods,
  retained history, shared resident isolation and scoped reads. Actual archived
  Google users/sessions remain unchanged; no cloud product fixtures were created.
  Native security advisors reported zero findings.
- **Nine live HTTP denial/origin checks and four actual signed-in administrator
  browser checks passed** on the shared enrollment/reactivation endpoints. No
  credentials were extracted, verification emails sent or successful account changes
  requested. Genuine seller institutional-email/PIN browser acceptance remains
  pending; these administrator denials are not a positive seller journey.
- TypeScript, frontend/API/worker builds, updated built-server startup/public reads/
  private-artifact checks, residual audit and diff checks passed. Inventory remains
  195 literal endpoints: 141 implemented, 14 retired, 40 pending across 87 replacement
  modules; no JSON persistence is reachable from the replacement backend.
- The first live dry run hit SQLSTATE 55P03 while backup/server activity overlapped.
  Ledger inspection confirmed 61. After the backup completed and only the workspace
  replacement server stopped, the rolled-back rehearsal passed and migration 62
  committed. All 62 source hashes match; live security advisors returned zero findings.
- Pre-62 encrypted backup `c943e63a-83df-438e-89bf-cb0f4511fb79` and post-62 backup
  `a75e63fd-8c2e-42f3-adfb-9572a259a836` both restored successfully, including PIN-key
  recovery/grants/RLS. Post-62 has six Auth users, four profiles, 36 native sessions,
  three keyed administrators, seven Storage objects, 37 public RLS tables, 14 private
  projections and no public views. No live seller/application/store was created or
  reopened. The last complete Storage archive remains unchanged.
- Replacement server restarted on port 3001. General operational wipe closure and
  email-only primary re-entry remain unfinished; the planner recognizes seller
  re-entry but explicitly retains the seller-scope closure blocker. No wipe/reset,
  default backend switch, JSON removal or Express replacement occurred.
- Details: [seller re-registration](seller-reenrollment.md). Private evidence includes
  `seller-reenrollment-native.json`, `seller-reenrollment-live.json`,
  `seller-reenrollment-live-advisors.json`, `seller-reenrollment-browser.json` and
  the shared-route `manager-reenrollment-http.json`.

## Primary-only reviewed closure and Google re-entry — 2026-10-13

- Applied migration 61, `20261013093354_reviewed_primary_wipe_lifecycle.sql`.
  It adds a guarded native closure core for `users`/`total` reviews containing only
  active primary portals with verified Google identities and no operational graph
  or unfinished linked enrollment. Mixed housing/market scopes and email-only
  identities fail closed. No HTTP or CLI execution entry is enabled.
- Current five-admin review, founder backup decision, durable pause, actual database
  restore/Storage evidence and fresh own-key founder consent are rechecked. Native
  receipts bind the exact transaction; deferred completion and failure rollback
  protect closure, app-binding revocation, notices, history and pause release.
  Auth identities/profiles/Storage and administrator access/keys remain retained.
- Explicit server-verified Google PKCE signup can reopen an eligible retained
  primary context once, using the same IDs. Ordinary login does not reopen it.
  SQL also checks the genuine subject/session and retained policies; the server's
  fresh PKCE exchange is the provider-proof boundary. No subaccounts, stores,
  privileges or old bindings are restored. Admin status now describes completed
  reviews accurately. See [primary lifecycle](primary-wipe-lifecycle.md).
- **414 native checks passed:** 64 primary lifecycle, 136 scope pause/recovery,
  148 residence execution, 41 closure planning and 25 existing Google signup.
  Tests used isolated PostgreSQL restores with actual archived Google identities/
  sessions and actual encrypted database/Storage recovery, without provider mocks
  or live product writes. Native security advisors returned zero findings.
- TypeScript, frontend/API/worker builds, built-server startup/public reads/private
  artifact denial, residual inventory and diff checks passed. **21 actual HTTP
  denial checks passed.** Inventory remains 195 literal endpoints: 141 implemented,
  14 retired, 40 pending; these are not migration counts.
- Live dry run passed. The first apply hit SQLSTATE 55P03; ledger inspection showed
  only 60 committed migrations. After stopping the workspace's replacement server,
  the unchanged migration committed. All 61 source hashes match; live security
  advisors report zero findings. The replacement server restarted on port 3001.
- Live aggregate inspection confirms six Auth users, four profiles, seven Storage
  objects and zero primary executions/re-entries. Both new private tables have RLS.
  No live wipe, reset, account closure, Storage deletion or JSON removal occurred.
- Pre-61 backup `cd4f889c-d801-4102-a6f2-94f8080cab5e` and post-61 backup
  `fcd52afc-8c72-4e5e-9f83-74d54b726cf1` passed encrypted recovery and isolated
  restore. Post-61 retains 36 native sessions, three keyed administrators, 37 public
  RLS tables, 14 private projections and no public views. Last complete Storage-byte
  archive remains `ff6a02ce-a67c-45be-b81e-450b0c260e2a`; no new live upload occurred.
- **29 distinct genuine administrator browser checks passed** across the completed
  23-check API/session/preview run and the focused seven-check UI run (session check
  repeated). Approval navigation, flat greeting, actual native preview and bounded
  desktop/mobile controls passed; saving without a key stays disabled. The previous
  45-second dashboard readiness failure did not recur; no app change was needed and
  no cause is claimed. The verifier supports `--ui-only` continuation and safe
  readiness diagnostics. Evidence: `primary-wipe-browser-followup.json` and
  `browser-acceptance-20261013/system-wipe-pause-administrator-ui.json`.
  No provider replies were mocked, credentials extracted or successful consent
  writes requested. Genuine primary Google re-entry and full five-admin consent
  acceptance remain pending. Never execute a live wipe merely to test re-entry.
- Next: retained seller registration generations/current-store selection, email-only
  primary re-entry, and safe general operational closure. Continue genuine portal
  acceptance before the reviewed reset/default switch/JSON removal. Express remains
  the API/authorization layer through that cutover; its replacement is a later phase.

## Closure dependency planning — 2026-10-13 (no new migration)

- Added operator-only `db:plan-system-wipe-closure` and isolated
  `db:verify-system-wipe-closure-plan`. The planner derives exact effects and
  retained history from current saved relationships in a native read-only,
  repeatable-read transaction. Optional saved proposals must match their current
  scope/fingerprint. It never grants consent or authorizes execution.
- **41 isolated native checks passed**, including all scopes, shared resident/seller
  identity isolation, protected admin portals/bindings, stable snapshot digests,
  stale/wrong review rejection and database-enforced read-only operation. All
  public/private/Auth/Storage table digests were unchanged by planning and denials.
  Real archived Google identities/native sessions were retained; no provider mocks
  or cloud product fixtures. Evidence: `system-wipe-closure-plan-native.json`.
- Actual live `total` planning completed read-only. The private candidate artifact is
  `system-wipe-closure/417817ce-0cdd-45c2-ae42-9a6225790bb5.json` under
  `.security/migration-reset/`. It contains four primary portal effects and one
  affected application-binding context. Administrator portals/keys, Auth, history
  and Storage remain protected. These are inspection candidates, not deletion approval.
- Source/native constraints confirm primary closure requires a guarded status/re-entry
  lifecycle. Sellers require explicit registration generations and fresh store/payment
  identity, plus current-generation query selection. Administrator membership guards
  referring to active primary contexts also need review. Detailed affected layers and
  implementation order are in `docs/migrations/system-wipe.md`.
- Full TypeScript check and `git diff --check` passed. No product runtime code changed,
  so the earlier production-build/browser results remain historical and were not rerun.
- A stale meeting column in the new planner was corrected before its successful native
  run. The current shared participant model is used. No schema, product UI, server
  authorization or runtime gate was changed. Applied migration count remains 60;
  JSON remains the default, and operational wipe execution remains disabled.

## Scoped system wipe pause and final consent — 2026-10-13

- Applied `20261013081232_reviewed_system_wipe_scope_pause_and_final_consent.sql`.
  Two private RLS tables retain durable scope pauses and short-lived final founder
  consent. Current five-admin review, separate founder backup decision, active
  preparation, own key and `PAUSE REVIEWED WIPE` are required. Earlier snapshot
  evidence requires cancellation and fresh consent. One pause at a time; open
  orders/payments, scoped reserved/removing images, active email verification and
  overlapping residence reviews block admission. Cancellation releases a pause
  even after consent expires/becomes stale, preserving all history.
- Native READ COMMITTED statement locks and old/new-row guards protect reviewed
  data, future linked records and selected Storage metadata paths. The existing
  revoked private metadata-only SECURITY DEFINER guard is extended while preserving
  all old residence execution checks. No new definer, public RPC or projection grant.
  Unrelated writes remain possible, but conservative domain revisions invalidate
  consent; reverting them cannot revive it. No-op writes remain harmless. Storage
  metadata guards do not certify arbitrary external bytes cannot change; actual
  byte verification remains required before future execution.
- Operator verification now compares actual restored pause identity/time with live
  preparation and rejects pre-pause recovery files. After genuine post-pause database
  restore and Storage-byte verification, `AUTHORIZE REVIEWED WIPE` records final
  founder consent for at most five minutes. It binds native founder session/Auth,
  key version, exact scope/catalog and pause timestamp. Another sign-in cannot reuse
  it. Retries do not extend expiry; changed keys/session/roster/data/catalog,
  maintenance, cancellation or expiry make it unusable. Receipt/notice failures roll
  back. Admin status exposes states/times without private session/key/archive bindings.
- **136 pause/recovery/consent native checks + 88 five-admin review regressions +
  148 residence execution regressions + 42 residence recovery regressions passed
  (414 total).** Actual encrypted dumps/restores and seven real Storage objects
  (3,194,064 bytes) are verified. No fabricated Auth subjects/provider replies or
  cloud product fixtures. Native advisors report zero findings. Verifier SQL parameter,
  exact timestamp precision and original-name restoration issues were corrected;
  the historical pre-48 fixture now uses its real native protocol rather than current
  manager-closure notification code requiring later tables. Production behavior was
  not weakened to pass those fixture checks.
- TypeScript, frontend/API/worker production builds, actual production startup and
  private-file denial pass. Pre-60 encrypted backup `e6a94cf0-6e4a-4d3a-9edb-dcf169c96bd3`
  passed archive/private-secret round trips and isolated restore. Rollback-only live
  validation and commit passed. Post-60 `ec8b04ea-6456-4059-885e-5d109ee7d3fe`
  passes the same recovery checks: six Auth users, four profiles, 36 native sessions,
  three keyed admins, seven Storage entries, 60 versions, 37 public RLS tables,
  14 private views and zero public views. Catalog/runtime roles retain their boundaries.
- All 60 live hashes match with zero pending/mismatched; live advisors report zero
  findings. Live wipe review/preparation/recovery/pause/final-consent counts remain
  zero. No cloud pause, consent, operational closure, Auth deletion, Storage write,
  final reset or JSON deletion was performed. Replacement server runs on port 3001
  (tool session 1393); recheck runtime before restarting.
- **21 real guest/cross-site HTTP checks, 29 genuine administrator browser checks
  and nine production-worker checks passed.** The browser exercised actual replies,
  native preview/capabilities, key/ownership denials, the greeting and desktop/mobile
  review layout. The first migration-60 UI preview attempt timed out; a diagnostic
  retry completed successfully without an application change. Its cause remains
  unproven; a passing retry does not establish that intermittent latency is fixed.
  No provider replies were mocked, private credentials extracted or successful
  consent writes requested. Evidence: `system-wipe-recovery-http.json` and
  `browser-acceptance-20261013/system-wipe-pause-administrator.json` under
  `.security/migration-reset/`. Genuine five-admin browser consent remains pending.
- Inventory remains 195 literal endpoints: 141 implemented, 14 retired, 40 pending,
  86 modules and JSON unreachable from replacement imports. Default startup is still
  JSON. Both API/native wipe execution remain disabled. Only three live admins have
  keys; genuine five-admin consent and broader operational acceptance remain pending.


## System wipe recovery preparation — 2026-10-13

- Applied migration 59, `20261013003111_reviewed_system_wipe_recovery_preparation.sql`.
  Two private RLS tables hold preparation and immutable evidence. Current five-vote
  consent and final founder backup consent are required before another own-key
  founder confirmation (`START WIPE BACKUP`). Exact retries reuse preparation;
  keyed cancellation invalidates consent and preserves all history. This phase
  neither freezes writers nor closes/deletes any operational record or Auth identity.
- The operator-only `db:prepare-system-wipe-backup` command creates encrypted
  PostgreSQL/private-key recovery files, restores the database locally, backs up
  actual Storage bytes and reconstructs each authenticated object. It checks archived
  and live preparation, consent, scope/project and catalogs before inserting native
  checked proof. Browser archive assertions cannot establish verification. Exact
  concurrent retries commit one receipt, five-admin notice and non-impersonating
  operator audit. Immutable file bindings cannot be replaced; failure rolls back all
  database writes. Admin projections show state/timestamps/counts without private
  archive identifiers or hashes. Changed consent/catalog makes evidence unusable.
- **64 new native recovery checks + 88 wipe-review regressions + 42 residence-
  recovery regressions passed (194 total).** Real encrypted native dumps/restores
  and seven actual objects (3,194,064 bytes) are verified with read-only cloud downloads.
  Tests cover own-key/founder/five-vote proof, pre-preparation/tampered/swapped files,
  unverified or foreign-project assertions, unsupported isolation, native rollback,
  concurrent retry, private grants, immutable evidence/history, accurate notices/status,
  changed data/Storage, cancellation, restart and retained operational/Auth records.
  No Auth subjects/provider replies or cloud product fixtures are fabricated. Native
  advisors report zero findings. The residence verifier's outdated empty-Storage
  assumption was corrected to validate complete actual catalog coverage.
- Pre-59 encrypted backup `c31ddd88-d388-4ceb-add9-d42a3f42ccc5` passed archive/key
  and PIN-secret round trips. Rollback-only validation and commit passed. Post-59
  backup `d93c8dfb-0d7a-4326-bb88-9b7e441fa1ae` passed those checks and isolated
  restore: six Auth subjects, four profiles, 35 native sessions, three keyed admins,
  seven Storage entries, 59 versions, 37 public RLS tables, 14 private projections,
  zero public views and private PIN/catalog/runtime role recovery boundaries.
- **17 guest/cross-site real HTTP checks passed.** TypeScript, production frontend/
  API/worker builds, production startup/privacy and live security advisors pass with
  zero findings. All 59 hashes match; zero migrations are pending. Both new tables
  have RLS/no browser or scoped-backend grants; no new public view/RPC/SECURITY DEFINER
  function. Live review/preparation/evidence counts remain zero; identities/images
  remain six/seven. No live consent, preparation, closure, wipe or Storage write.
- The migration-59 signed-in browser round subsequently **passed 23 checks** on
  2026-10-13, including actual native preview/capabilities, denial paths and responsive
  review layout. Earlier preview/dashboard timeouts were not conclusively diagnosed.
  Avoid workspace edits/builds during attached browser checks. Evidence:
  `browser-acceptance-20261013/system-wipe-recovery-administrator.json` under
  `.security/migration-reset/`. Migration-60 acceptance is recorded above.
- The requested large, flat black admin greeting is implemented and **verified in
  the existing signed-in browser tab**: light-mode black, 36px, no text shadow/stroke
  or 3D class. Its single heading changed; existing dark-mode contrast remains.
  TypeScript/builds pass. The read-only browser inspection navigated nowhere and
  retrieved no credentials. Evidence: `browser-acceptance-20261013/admin-greeting-style.json`.
  Dark-mode/mobile greeting styles were not rechecked this round.
- Inventory remains 195 literal endpoints: 141 implemented, 14 retired, 40 pending
  across 86 replacement modules, with JSON unreachable from replacement imports.
  Default startup remains JSON. Next implement durable writer freezes and fresh
  founder execution consent before operational closure and verified retained primary/
  seller re-entry. Current recovery snapshots are not execution authority. Genuine
  broader acceptance, reviewed migration reset/backups and JSON removal remain.

## Reviewed system wipe scope and consent — 2026-10-13

- Applied migration 58, `20261012235439_reviewed_system_wipe_consent.sql`.
  Normal wipes retain verified logins and account history, as explicitly chosen by
  the user. Exact six-scope previews follow saved portal, owner, residence, room,
  staff and market relationships. They protect administrator portals and shared
  identities and list dependency identifiers, counts and unresolved obligations.
  Full-row digests bind records without returning private keys, session identifiers
  or provider checkout data. See [system wipe rules](system-wipe.md).
- All five active administrators must enroll and independently use their own
  approval keys, including the founder. The proposer counts once; an independent
  rejection closes review. Five approvals require a further founder own-key reason
  and typed `APPROVE WIPE BACKUP` or `REJECT APPROVED WIPE`. Backup consent only
  authorizes future preparation. Saved scopes, votes, final decisions and execution
  fields are immutable; current native domain/roster revision evidence rejects
  stale consent even after a change is reversed. Domain changes conservatively
  invalidate all open wipe reviews. Native SQL guards independently enforce these
  rules; every transition atomically records audits and administrator notifications.
- Admin Approvals now shows real previews, proposals, votes and founder controls.
  Private invoker review helpers/guards use existing proposal/vote tables
  and RLS without exposing public RPCs or introducing SECURITY DEFINER functions.
  Scope limits, strict bodies, live session/context verification, current key-version
  grants and write budgets protect the API. Single-administrator clear calls return
  authenticated-admin 410 guidance. Recovery preparation and wipe execution remain
  unavailable; no Auth, financial/history, Storage or operational deletion is added.
- **88 native review checks + 72 annual-reset + 374 account/residence regressions
  passed (534 total).** Genuine archived Google subjects and sessions are unchanged.
  Tests cover exact scope cascades, shared resident/seller identity preservation,
  wrong role/identity/session/key/SQL denial, one vote per administrator, four-vote
  refusal, fifth founder vote, founder-only final review, immutable history, actual
  receipt-failure rollback, deadline rejection, domain/roster/ABA invalidation,
  notifications and reconnect persistence. Disposable local domain scenarios are
  separate from the live product; no provider replies or Auth users are fabricated.
  Native security advisors report zero findings. Draft SQL alias and fixture ownership/
  seller-enrollment issues were corrected before the final successful suite.
- Pre-58 backup `1ffe91f3-4eb5-44c1-8d53-4b783eab2fa9` passed encrypted archive/key
  and PIN-key round trips. Rollback-only validation then commit passed. Post-58
  backup `5fc1fbaa-298c-4d3c-83a1-3eab91dd204e` passed those checks and isolated
  restore: six Auth subjects, four profiles, 35 native sessions, three keyed admins,
  seven Storage entries, 58 versions, 37 public RLS tables, 14 private projections
  and zero public views. PIN recovery and catalog/runtime role boundaries pass.
- **13 real guest/cross-site HTTP and 15 genuine administrator browser checks
  passed.** The actual signed-in app displayed a real read-only scope preview and
  its controls at 1440/375 widths. Missing keys, selectors and stale contexts were
  denied, and protected/retired execution paths stayed inaccessible. No private
  credentials were extracted and no live proposal, vote or founder consent was
  saved. Actual five-admin browser consent remains pending; only three current
  live administrators have keys. No cloud fixtures were created to satisfy quorum.
- TypeScript, frontend/API/worker production builds, built-server startup/privacy
  checks and live security advisors pass with zero findings. All 58 hashes match,
  zero migrations are pending and the live system-wipe proposal count is zero.
  The replacement server was safely restarted on port 3001. Storage bytes remain
  unchanged; their latest encrypted backup is `ff6a02ce-a67c-45be-b81e-450b0c260e2a`.
  Inventory remains 195 literal endpoints: 141 implemented, 14 retired, 40 pending,
  with 86 replacement modules inspected and no reachable JSON imports. Counts do
  not measure unfinished workflows. Default startup remains JSON; cutover has not
  happened. Next implement verified wipe recovery preparation and safe operational
  closure/re-entry, preserving the normal-wipe retention decision. Genuine broader
  operational acceptance, reviewed fresh-start reset/backups and JSON removal remain.

## Reviewed academic-year room access reset — 2026-10-12

- Applied migration 57, `20261012232559_reviewed_academic_year_room_keys.sql`.
  The active manager caller for residence-wide room-key reshuffle now uses Supabase.
  It requires an assigned native manager with its current operation-key grant;
  administrators require their own separate approval-key grant. The exact preview
  derives room/occupant/key state and assignment/key version from saved relationships.
  Typed `RESET ROOM ACCESS` consent and a matching preview are required; ownership
  selectors, stale contexts, unreviewed/frozen residences and other portals are denied.
- One immutable private receipt is recorded per residence/academic year. Later years
  must advance; a retry of a completed year returns its receipt without revoking any
  newer occupancy or keys. Manager and administrator key versions use their existing
  bigint and UUID types separately. New receipts have RLS, no browser/backend-role
  grants, no public RPC and no new SECURITY DEFINER function. Existing freeze guards
  protect them; a deferred constraint prevents incomplete room resets from committing.
- Existing exclusive housing locks serialize reset against claims/sign-ins/policies
  and reviewed deletion. All replacement codes are generated before writes. The
  transaction retains Auth, sibling seller portals/PINs, primary accounts, maintenance,
  staff, marketplace and allocation history; it ends resident allocations/contexts,
  deletes resident app bindings and revokes/replaces all selected room keys. Primary
  owners receive batched room-loss notices and managers/admins receive completion
  notices. Individual release and subsequent generation retain academic-year links.
  No account wipe, registration cooldown, residence closure or Storage change occurs.
- **72 isolated native checks, 43 resident/manager-release regressions and 374
  account/residence-review regressions passed (489 total).** Genuine archived Google
  identities/native sessions are unchanged; no cloud product records, Auth subjects or
  provider replies are fabricated. Checks cover cross-residence/portal/identity denial,
  stale previews, locked keys, real SQL rollback, concurrent retry, immutable receipts,
  commit refusal without complete replacement, shared seller preservation, retired-key
  denial, identity reuse/new claim, completed-year retry after reactivation, later-year
  advancement and separate administrator approval proof. Native advisors report zero
  findings. Initial draft trigger alias/key-version types and verifier session selection
  were corrected before the successful final suite. TypeScript/builds passed.
- Pre-57 encrypted backup `e88923b1-9bcb-42fb-a687-d5539427aef1` passed archive/key
  and decrypted round-trip verification. Rollback-only migration validation passed,
  followed by commit. Post-57 encrypted backup
  `d0cb8495-1dad-4d21-a588-08363032a89a` passed archive/key and isolated restore:
  six Auth subjects, four profiles, 35 native sessions, three keyed administrators,
  seven Storage entries, 57 versions, 37 public RLS tables, 14 private projections
  and zero public views. PIN-key recovery and catalog role boundaries passed.
- **Six live guest/cross-site HTTP checks and six genuine administrator browser
  checks passed.** Admin approval proof, selector rejection, stale contexts and
  missing target scope are enforced. No private credentials or actual room resets
  were requested. Live advisors report zero findings; all 57 hashes match and no
  migration is pending. The live cycle table is empty, RLS-protected and unreadable
  by browser roles; the scoped backend role cannot insert directly. No live residence
  FK prevents retained cycle history during later reviewed deletion.
- Inventory: 195 literal endpoints, 141 implemented, 14 retired, 40 pending across
  85 inspected replacement modules. JSON is unreachable from the replacement and
  remains preserved; the default backend has not switched. Genuine operational
  manager reset/browser acceptance remains pending. No live room reset was submitted.


## Retained manager work-identity re-enrollment — 2026-10-12

- Applied migration 56, `20261012225934_verified_manager_reenrollment.sql`.
  A closed manager reuses its original verified work Auth identity, manager context
  and enrollment. Only its saved primary creator can initiate this workflow. Email
  confirmation explicitly requests Supabase OTP with `create_user:false`, or uses
  the existing work-account email password. Genuine provider `/user` and native
  session proof are required; temporary tokens are never returned/bound to the
  primary account and are locally signed out. No Google password is changed.
- Re-enrollment leaves the manager pending, retires its old operation key and app
  bindings, preserves restrictions/cooldowns/closure receipts and requires a fresh
  property inspection. A private generation guard derives the new case generation
  from the owned verified enrollment. Old cases remain readable history but cannot
  dispatch or approve a new property. Live assignments/staff/property registrations,
  competing manager registrations and unfinished/frozen closure reviews block reuse.
  No new product table, browser grant, public RPC or relaxed RLS was introduced.
- **47 isolated native re-enrollment checks, 56 extended unassigned-closure checks,
  56 assigned-closure regressions and 374 account/residence regressions passed**
  (**533 total**). Tests use genuine archived Google subjects and native sessions;
  they cover foreign subjects/owners/roles, SQL bypass, real founder-reviewed closure
  followed by reuse, inherited cooldowns, exact concurrent retry, pending-only access,
  retired keys/bindings, notices, immutable inspection generations, retained history,
  owner-only generation-aware status and property continuation after reload.
  Isolated security advisors report zero findings. TypeScript and frontend/backend
  builds passed. Initial verifier type annotations and React ref initialization were
  corrected before the successful TypeScript check. No Auth/provider replies or
  cloud account/product mutations were fabricated.
- Pre-56 encrypted backup `b051588c-5236-438d-b80c-8d0394a3537d` passed archive/key
  and decrypted round-trip verification. Rollback-only validation passed, then the
  reviewed migration committed. Post-56 encrypted backup
  `b3fcd7f7-4e32-4ed2-ae72-caa4e724b12c` passed archive/key round-trip and isolated
  restore: six Auth subjects, four profiles, 35 native sessions, three keyed admins,
  seven Storage catalog entries, 56 versions, 37 public tables with RLS, 14 private
  projections and zero public views. Server PIN recovery and catalog role boundaries
  passed. All applied migration hashes match; zero migrations are pending.
- **Nine live guest/cross-site HTTP checks and seven genuine administrator browser
  checks passed.** The admin cannot impersonate a primary owner or dispatch work-email
  proof. Chromium initially required renewed connection approval; the user allowed it
  and the check passed. Live security advisors report zero findings. No real work-email
  proof was dispatched, account re-enrolled or private credentials extracted.
- A final caller review found that an old inspection could still supply the primary
  dashboard status, and a reload after identity confirmation could hide unfinished
  property registration. Status now selects only the current generation and exposes
  owner-scoped continuation when no property has been submitted. The primary dashboard
  and onboarding resume it, retain the saved work email and omit new-password fields
  during reuse. Account changes clear previous form/proof state and ignore delayed
  replies. The three new native status/ownership checks passed.
- Inventory: 195 literal endpoints, 140 implemented, 14 retired, 41 pending across
  84 inspected replacement modules; JSON persistence is unreachable in the replacement.
  This is not a count of remaining product workflows. The default backend remains
  JSON. Genuine work-email OTP/password and successful manager browser acceptance
  remain pending; no live manager was re-enrolled or email dispatched by verification.


## Reviewed unassigned manager portal closure — 2026-10-12

- The user chose administrator review and the founder’s final approval for an
  active manager without an assigned residence. Applied migration 55,
  `20261012222431_reviewed_unassigned_manager_closure.sql`, reusing the private
  own-manager request table and existing five-administrator account review.
  Assigned managers retain the independent two-administrator residence protocol.
  No product table, browser grant or public RPC was added.
- Active unassigned managers may issue/petition/recover their own operation key.
  Request insertion verifies the native manager and current own-key version;
  manager/primary ownership selectors remain rejected. Pending registrations
  cannot use an active manager binding to close an identity. Request submission
  changes no account or housing record.
- Admin Approvals now opens the exact unassigned request for keyed account review.
  Five independent current approval keys, including the founder, are required.
  The founder must separately confirm final execution or final rejection. Saved
  request fields, current manager-key version, registration restrictions and
  account dependencies are included in the review. New assignments, active staff,
  live property registration, key/roster or relevant lifecycle changes invalidate
  consent. Existing bans/restrictions/restoration remain unchanged.
- Final closure takes existing exclusive housing/account-policy locks before
  actor locks. A private trigger rechecks the exact linked request, quorum,
  founder and current eligibility. It closes only the manager context, revokes
  manager app bindings and writes one audit receipt. Auth users/native sessions,
  sibling portals, housing/history, keys/settings, policies and Storage remain.
  Primary owners receive an atomic notice before their manager portal closes.
  Existing residence registration cooldowns on a closed manager still restrict
  the saved primary’s replacement-manager registration; no waiver/new cooldown
  is invented. Retained-work-identity re-enrollment remains a separate workflow.
- **51 isolated native checks**, **56 assigned-manager regression checks** and
  **374 account/residence-review regression checks** passed using genuine archived
  Google subjects/sessions. Native security advisors report **zero findings**.
  Tests include own-key recovery, spoofing, pending-manager denial, missing quorum,
  assignment/key invalidation, final non-founder denial, founder rejection and
  closure, exact retry denial, retained restrictions/history/notices and reconnect.
  No Auth/provider replies/cloud product records were fabricated.
- Pre-55 encrypted backup `07f54620-fe5b-4e54-95b2-7bdb4643c11f` passed archive/key
  verification. An initial dry-run lock timeout occurred while that snapshot was
  active; rollback-only retry passed after its locks were released. Migration 55
  then committed. Post-55 encrypted backup `c2e4a944-9e0f-41f7-a417-83a5b83ac51c`
  passed archive/key verification and isolated restore. It retained six Auth subjects,
  four profiles, 35 native sessions, three keyed administrators, seven Storage catalog
  entries, all 55 versions, 37 public tables with RLS, 14 private views and zero public
  views. Server PIN recovery and catalog/non-BYPASSRLS boundaries passed.
- **13 live guest/cross-site HTTP checks and seven genuine administrator browser
  checks passed.** The actual admin reads the queue, cannot act as a manager, cannot
  skip its own approval key, submit ownership selectors, replay a stale context or
  invoke unreviewed physical deletion. No private keys/cookies were extracted or
  genuine closure requested. TypeScript and frontend/backend builds passed; an
  initially missing verifier fixture type annotation was corrected. Live security
  advisors report zero findings; all 55 applied hashes match and no migration is
  pending. Genuine operational manager submission/final closure remains pending;
  the current live roster has three keyed administrators, and five are required.
  Added eligibility-status refresh after first key issuance. Unassigned managers
  can open profile/account controls from the welcome popup; settings/account
  controls suppress its polling-driven reopening in Supabase mode. Final component and
  backend builds passed. No live account/residence/Storage closure, reset or JSON
  removal occurred.
- Inventory is unchanged: 195 literal endpoints, 140 implemented, 14 retired,
  41 pending, 83 replacement modules; JSON is unreachable from the replacement.
  Literal coverage does not count newly mounted routes or prove full acceptance.
  Evidence: `unassigned-manager-closure-native.json`,
  `unassigned-manager-closure-http.json`, `unassigned-manager-native-advisors.json`,
  `unassigned-manager-live-advisors.json` and
  `browser-acceptance-20261012/unassigned-manager-closure-administrator.json` under
  `.security/migration-reset/`.

## Immediate verified resident room release — 2026-10-12

- User confirmed that residents should keep immediate release after PIN or fresh
  verified sign-in, without manager approval. Implemented resident-only preview
  and `POST /api/student/delete-room`; the resident branch of registered-account
  deletion uses the same operation. Primary callers cannot supply child credentials
  or room/account IDs to close a separately verified portal. Body/query selectors,
  stale captured contexts, changed previews and wrong-role sessions are rejected.
- The native session's exact active allocation/current claimed key and portal-key
  version form its preview fingerprint. A configured portal PIN must be confirmed;
  failures commit guesses/lockout state without closing anything. Without a PIN,
  the actual verified native session must have been created in the last five minutes.
  Token refresh or context switching does not reset this age. No Auth timestamp or
  provider response is fabricated to satisfy proof.
- Reused the existing exclusive housing lifecycle transaction, acquired before actor
  row locks. Notices and audit are recorded atomically before ending the allocation,
  closing only the resident context, revoking its app bindings and generating one
  unclaimed replacement key. The former resident never receives that key. Native
  Auth identities/sessions, seller bindings/PINs and maintenance/history are retained;
  no registration cooldown is invented. Existing manager release uses the same writes.
- Added shared housing/account-policy locks to native sign-in binding creation so
  a concurrent sign-in cannot recreate a binding during closure. The response never
  clears provider cookies or calls provider logout on a shared identity. UI ignores
  completion after unmount/account change, clears only its current portal state after
  confirmation and shows the retained-identity message on the login page.
- Resident Settings now includes the closure form with PIN/fresh-sign-in guidance,
  typed confirmation, progress/errors and status refresh. The primary dashboard
  directs users to the separate resident portal; its legacy child-email/password
  deletion dialog is unreachable in Supabase mode. JSON behavior is retained.
- **43 isolated native checks passed**, covering ownership/role/session denial,
  selectors, preview mismatch, stale sign-in, committed bad-PIN guesses, concurrent
  confirmations, exact key rotation, shared-seller access, history/notices/audit,
  unchanged manager release and reconnect persistence. Genuine Auth records stayed
  unchanged; no cloud product rows or provider replies were fabricated. TypeScript,
  frontend/backend builds and source inventory passed. **Nine live guest/cross-site
  HTTP checks and five genuine administrator browser checks passed.** The actual
  administrator cannot preview/release a resident room or use the shared closure
  endpoint; the manager-request queue still works. Chromium initially required a
  new connection approval; checks passed after the user allowed it. No private
  credentials were extracted or live closure submitted. Successful genuine resident
  browser mutation and no-PIN fresh
  sign-in acceptance remain pending; native checks do not replace those journeys.
- No new schema migration or live closure/reset was performed. All 54 applied
  migration hashes are preserved. Last complete database/Storage checkpoints remain
  `83796b15-3ac6-4a2d-959b-cb335737c913` and
  `ff6a02ce-a67c-45be-b81e-450b0c260e2a`. Default JSON persistence is unchanged.
- Inventory: 195 literal endpoints, 140 implemented, 14 retired, 41 pending,
  83 replacement modules and no JSON reachability from the Supabase backend.
  Unassigned-manager closure and other active workflows remain unfinished.
  Sanitized evidence: `.security/migration-reset/resident-closure-native.json`,
  `resident-closure-http.json` and
  `browser-acceptance-20261012/resident-closure-administrator.json`.

## Private read projections and view-security correction — 2026-10-12

- Applied migration 54, `20261012212513_private_read_projections.sql`. All 54
  local/native hashes match, with no pending migrations. The replacement server
  requires this version and uses the moved projections in eight affected modules.
- Reviewed all 14 flagged owner-executed views, their live grants/definitions,
  referencing functions and actual callers. Their filtered joins intentionally
  avoid exposing private base-table identity and operational fields. Converting
  them to invoker views would require broader underlying grants or break reads.
  Instead, moved the views to the already-unexposed `private` schema, preserving
  columns, security barriers and saved session/ownership/publication filters.
- Revoked all projection privileges from `PUBLIC`, `anon` and `authenticated`.
  Account views are SELECT-only for the existing bound backend role. Public HTTP
  catalog transactions use the new non-login, non-inheriting, non-BYPASSRLS
  `pinevela_catalog` role, with six catalog reads and four boolean publication
  helpers only. Browser/Data API roles are not members. No base-table grant, RLS
  policy, foreign key, product row or Auth record was broadened or changed.
- Updated the media-publication helper and all current query callers. Added a
  maintenance predicate to every projection, including the residence view whose
  migration-52 replacement had dropped its previous outer maintenance predicate.
  Three legacy trigger functions lose default PUBLIC execution; their triggers
  continue to enforce relationships. No private-schema usage was granted to `anon`.
- **Verified:** 258 isolated native checks, including before/after rows for every
  view across genuine archived portal identities, positive housing/market reads,
  foreign-house/account denial, unchanged base ACLs/RLS, native free activation,
  item/service/media/price-option discovery, PIN-confirmed purchase reputation and
  own-key maintenance transitions. No provider replies/payments were fabricated.
  Live security advisors report **zero findings**, with verified TLS and the
  password supplied only through the child environment, never command arguments.
- **31 live HTTP/Data API/metadata checks passed:** all former public view endpoints
  return 404; private-schema requests return 406/PGRST106; guest catalog routes work;
  private API reads without a genuine session are denied. TypeScript and the updated
  backend build passed. **10 genuine signed-in administrator browser API checks
  passed**, covering staff, maintenance, employment, activity, meetings, seller
  applications, closure queue and both public catalogs. The first evaluation was
  interrupted by a Vite full-page reload; the retry passed with workspace edits
  paused. No credentials were extracted or domain mutations made. These checks
  are not full browser acceptance of manager/resident/seller workflows.
- Pre-54 encrypted backup `cf8989e7-192c-4c52-9ce5-54aebc55901d` and post-54 backup
  `83796b15-3ac6-4a2d-959b-cb335737c913` passed full isolated restoration. The post
  restore retained six Auth subjects, four profiles, 35 native sessions, three keyed
  administrators, seven Storage catalog entries, 37 public tables with RLS, all 54
  versions and the 14 private views. It verified the catalog role and its server
  membership. Historical pre-54 restores retain their older catalog-grant check.
- Storage bytes are unchanged; the last complete byte checkpoint remains
  `ff6a02ce-a67c-45be-b81e-450b0c260e2a`. No final stopped-writer/off-host backup,
  account/residence reset, execution-gate enablement or JSON removal occurred.
  Next implement remaining resident/unassigned-manager lifecycle and complete
  genuine manager/email-password acceptance, then review other active workflows.

## Manager closure requests and linked residence review — 2026-10-12

- Applied migration 53, `20261012204936_manager_closure_requests.sql`. All 53
  immutable migration hashes match the configured project's ledger; no migration
  is pending. The replacement server requires this version before serving requests.
- Replaced the active manager registered-account deletion caller with an own-portal
  closure request. The server derives its manager and assigned residences from the
  authenticated session, requires the current manager operation key, rejects
  target selectors/stale contexts and verifies the saved preview fingerprint.
  Serial/concurrent exact retries reconcile the same request. Submission and
  withdrawal never delete records or start cooldowns.
- Immutable private request history has RLS, no browser/scoped-backend grants,
  native state-transition guards and one open request per manager. Administrators
  can decline with their own approval key or link a request atomically to an exact
  combined residence/manager deletion proposal. A residence-only or foreign-manager
  proposal cannot satisfy the request. Existing independent votes, founder consent,
  recovery evidence and execution release gates remain mandatory and disabled.
- Added manager request/status/withdrawal controls and an administrator Approvals
  queue. Submission and decisions notify active administrators, the manager and
  its saved primary owner. Linked residence review updates also reach both owner
  portals. Shared Auth identities, sibling portals and retained history are preserved.
  A terminated, unfrozen proposal allows a fresh request without erasing its history.
- **Verified:** 56 isolated native checks using genuine archived Google subjects
  and sessions, 12 actual guest/cross-site HTTP/RLS checks, and 11 checks in the
  genuine signed-in administrator browser. The queue opened through real navigation
  at 375/1440 widths in light/dark modes; wrong-role endpoints were denied. No
  provider replies were mocked, private browser credentials extracted or live
  manager requests submitted. TypeScript, replacement frontend/backend builds,
  source inventory and whitespace checks passed. Browser retries initially lacked
  rendered navigation; reloading after the final server restart produced the passing
  run. Genuine manager submission/withdrawal/key-protected review is still pending.
- Pre/post-53 encrypted database backups `d95defeb-2a1d-48a8-8e84-e7a9d12ea551`
  and `a68a080d-e0aa-437d-9ac4-a670dcf4245d` passed archive/key verification.
  The post-53 isolated restore passed with six Auth subjects, four profiles,
  35 native sessions, three keyed administrators, seven Storage catalog entries,
  37 public tables with RLS and all 53 versions. Storage bytes were unchanged;
  the last separate byte checkpoint remains `ff6a02ce-a67c-45be-b81e-450b0c260e2a`.
- CLI 2.120.0 security advisors completed on the isolated restored schema, reporting
  **14 existing public owner-executed view findings**. These require separate
  authorization/grant review before cutover; this is not a clean advisor report.
  The new private request table did not introduce an advisor finding. Full report:
  `.security/migration-reset/manager-closure-native-advisors.json`.
- **Scope still unfinished:** unassigned-manager closure, resident self-service
  closure (returns 503; existing authorized manager room release remains available),
  successful genuine email-password provider acceptance and other active workflows.
  Primary callers receive 410 directing them to the separately verified portal.
  No live account/residence/Storage deletion, final reset or JSON removal occurred.
- Inventory: 195 literal endpoints, 139 implemented, 14 retired, 42 pending;
  82 replacement modules, with JSON unreachable from the replacement backend.
  Route counts do not measure remaining migrations or full workflow completion.

## Email-password change and recovery implementation — 2026-10-12

- Replaced the manager's missing `POST /api/auth/change-password` endpoint with
  session-derived own identity handling. Existing manager-key authorization stays
  required. Body/query target selectors and stale captured-context headers are
  rejected; current password is verified through a genuine temporary Supabase
  password sign-in, with the provider subject checked against the original actor.
  This avoids relying on optional project current-password enforcement. Google-only
  identities use email recovery; Google credentials are never modified.
- Added strict, non-enumerating successful recovery requests and
  `POST /api/auth/recover/complete`. Supabase verifies a recovery OTP or unopened
  configured-project recovery link; wrong flow/provider/ambiguous links are rejected.
  The verified mailbox must match an enrolled identity and a live native session.
  Recovery never binds a portal, creates roles/profiles, grants room access or
  substitutes for portal PIN proof. An expired recovery proof returns 400, preserving
  unrelated application-session state. No provider sessions/tokens enter the client.
- Provider-authenticated password updates preserve strength, reauthentication and
  MFA requirements. Fresh proof sessions are locally logged out in `finally`; no
  direct SQL Auth password/session writes, admin credential overrides or weakened
  grants were introduced. Database locks are released before provider mutations,
  which revoke other native sessions. After provider confirmation, an atomic native
  transaction ends all app bindings for that identity and records a secret-free
  audit and notices to its own portals, including the seller inbox. Separate
  identities, policies, allocations, ownership and portal PINs remain intact.
- Added the recovery dialog to the replacement login and manager security controls.
  Inputs stay masked, in-flight submissions are guarded, success requires sign-in,
  and current/new passwords use the 8–256 character boundary. A manager request
  captures its account context and ignores completion after unmount/account change.
  Recovery doesn't replace browser cookies; delayed password responses don't clear
  newer login cookies. Provider/commit interruption is explicitly indeterminate;
  writes aren't replayed and the user is instructed to sign in or request new proof.
- **Verified:** 57 isolated native checks with genuine archived subjects/sessions;
  12 actual guest/cross-site HTTP checks including real provider rejection of invalid
  recovery proof; 10 checks in the genuine signed-in administrator browser;
  27 guest mobile/desktop light/dark recovery-dialog checks; TypeScript and frontend/
  backend builds. No provider replies, JWTs, identities or native sessions were
  mocked. The native post-provider lifecycle tests do **not** change a provider
  password and are reported separately from provider acceptance.
- Final post-restart HTTP checks passed (12) and server health confirmed port 3001.
  An additional authenticated browser recheck timed out at a browser command; the
  earlier genuine administrator run passed 10 checks. Do not describe that final
  retry as passed or infer that credentials changed from a browser-control timeout.
- **Pending:** real email delivery and successful current-password/recovery updates,
  followed by genuine password/PIN sign-in. No real credentials were changed, no
  emails were sent for testing, and no disposable accounts were created. Reviewed
  registered-account deletion remains unfinished; final reset and JSON removal
  remain gated. Existing immutable backups are continuation checkpoints, not final
  cutover backups. No new migration was required; 52 remain applied.
- Inventory refreshed: 195 literal legacy endpoints, 138 implemented, 14 retired,
  43 pending; 81 replacement modules inspected, JSON persistence unreachable from
  the replacement runtime. Implementation counts don't imply browser acceptance.
- Follow [auth.md](../auth.md) and the new verifier scripts:
  `verify-supabase-password-security.ts`, `verify-supabase-password-browser.cjs`,
  `verify-supabase-password-guest.cjs`, `verify-supabase-password-http.ts`. The final
  backend source was restarted on port 3001;
  editing Vite files alone does not reload a non-watch Node server.

## Own portal PIN security — 2026-10-12

- Added session-bound resident/seller `GET /api/auth/portal-security` and
  `POST /api/auth/portal-pin`. Targets derive only from the verified native actor;
  body selectors on rotation, query selectors on status reads and stale captured
  context headers are rejected. Rotation never uses query fields as a target.
  Own status exposes booleans and the portal kind, never hashes or credentials.
- Rotation requires the correct current PIN. Failed guesses commit independently
  of the HTTP denial and five attempts enforce the existing 15-minute lockout.
  The key row is serialized and its version is rechecked against the native binding
  after acquiring its lock, so a concurrent obsolete request cannot rotate again.
- The existing private-table trigger increments the PIN version. Older bindings
  for that portal are denied; the shared email password, native Auth rows, companion
  portal key/session and room allocation remain intact. A still-valid companion
  session may perform the existing authorized switch using the new PIN. Audit and
  notices to the own portal/saved primary owner commit with the change; seller
  notices use a market category so the seller inbox includes them.
- No migration, new table or wider RLS/grants was necessary. The backend uses the
  existing narrowly scoped authorized private-write transaction. Auth-role and
  scoped backend direct key reads/writes remain denied. PIN changes share the
  existing authentication IP attempt budget.
- Resident Settings and seller Store Profile now offer masked own-PIN fields,
  confirmation, saving state and fresh-login continuation. Standalone identities
  without a portal PIN show their actual status instead of an invented credential.
  The primary resident-security dialog directs sign-in with the separate verified
  resident identity and no longer calls the old mailbox-based reset in Supabase.
- The replacement old parent-reset endpoint returns authenticated-primary 410;
  other portals are denied. Its legacy JSON handler remains transitional. This
  round does not implement manager/identity password change or account deletion,
  and no release gate or account-wipe execution was enabled.
- `db:verify-portal-security 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69
  c0857019-ed75-49ec-8af8-259763368f4f` passed 50 isolated native checks using genuine
  archived Google identities and actual sessions. Own rotation, selectors/owner
  spoofing, wrong/current/new PIN behavior, committed lockout, concurrent rotation,
  version invalidation, companion isolation, authorized switching, notifications,
  audit privacy and reconnect persistence passed. No Auth identity, password,
  native-session row or provider reply was fabricated/changed. Domain relationships
  and private verification PINs stayed in disposable local restores.
- Seven actual unauthenticated/cross-site HTTP checks passed. Seven actual Google
  administrator browser checks passed: the new APIs/retired alias denied the wrong
  portal and returned no credential fields. Private keys/cookies/PINs were not
  extracted and no live domain mutation was requested. Sanitized administrator
  evidence is `portal-security-administrator.json` in the existing private browser
  acceptance directory. A genuine resident/seller successful PIN-change browser
  journey remains pending; the available signed-in browser is an administrator.
- TypeScript, Supabase frontend/backend builds, script syntax, residual searches
  and diff checks passed. Inventory: 195 literal endpoints, 137 implemented,
  14 retired, 44 pending; 80 replacement modules inspected and JSON persistence
  unreachable from the replacement runtime. These are source counts, not remaining
  migrations or accepted product journeys.
- The identified development server was gracefully restarted to load final routes;
  the user's browser remains open. Schema checkpoint remains migration 52; prior
  encrypted database and Storage backups remain intact. Default backend/JSON data
  have not been switched or removed. Next: provider-backed own email-password
  change/recovery and reviewed registered-account deletion, preserving separate
  identities and shared-email portal PIN boundaries.

## Initial session restoration and connection recovery — 2026-10-12

- Fixed the preceding checkpoint's reproduced temporary-auth failure: startup
  no longer treats network/server failure as proof that a session is signed out.
  StrictMode subscribers share one check; temporary failures receive three bounded
  attempts. Exhaustion or a check exceeding 45 seconds offers a connection retry
  while preserving the requested route and withholding protected content.
- A still-pending cookie check is reused instead of aborted. Login/logout wait
  for it to drain; explicit account changes, sign-out and expiry invalidate old
  results. Old transport generations cannot emit expiry/access/maintenance notices
  against the newly selected account. Server session verification, role guards,
  manager/admin key grants, schema and RLS were not changed.
- `test:session-restoration` passed nine native async checks without fabricated
  accounts/tokens/API responses; the five account-refresh regressions passed.
  TypeScript, the Supabase frontend production build, browser-script syntax,
  residual searches and diff checks passed.
- `scripts/verify-supabase-session-browser.cjs --authenticated` passed 24 checks
  in the user's actual Google-signed-in administrator Chromium tab. Delayed
  startup, two native connection interruptions before a real successful request,
  bounded exhaustion, manual recovery and retry coalescing after a 45-second delay
  all preserved/restored the actual administrator route. No cookies/private keys
  were extracted, no API replies fulfilled and no account or domain mutations
  were requested. One rerun timed out waiting for the slow-check notice; the final
  timed acceptance was repeated with the PineVela tab brought to the foreground
  and passed. Background-tab timing is not asserted. The user's browser and server
  remain running.
- The isolated guest variant passed 29 checks. Real absent-session 401 replies
  still navigate to login. The retry surface fits 375/1440px with a 44px minimum
  action target. A held actual denied response from an old client generation did
  not announce expiry; a current real 401 still did. Public landing browsing
  remains available during Auth unavailability; private invitations offer retry
  without flashing sign-in choices. No identity was fabricated.
- Sanitized artifacts are `session-restoration-authenticated.json` and
  `session-restoration-guest.json` under the existing private
  `.security/migration-reset/browser-acceptance-20261012/` evidence directory.
  Auth-provider and database performance are not claimed fixed by this client
  change, and the genuine occupied manager/resident/seller journeys remain pending.
- Inventory remains 195 literal endpoints: 137 implemented, 13 retired, 45 pending,
  79 replacement modules inspected; JSON persistence remains unreachable from the
  replacement runtime. There is no new migration: the schema checkpoint is still
  migration 52 and the previous encrypted database/Storage artifacts remain intact.
  The default backend and JSON data have not been switched or removed.
- Next active account-security work: inspect the current manager password-change
  and primary registered-account reset/deletion callers against Supabase identity,
  portal PIN, step-up and reviewed deletion protocols. Do not reproduce legacy
  mailbox-based child password changes or delete linked housing records directly.

## Reviewed residence changes and manager-key recovery — 2026-10-12

- Migration 52, `20261012145716_reviewed_residence_changes.sql`, is applied.
  The replacement backend now supports manager residence/request reads, keyed
  submission, administrator diff review and approval/rejection. Native guards
  serialize requests, enforce the 30-day manager limit using database time and
  protect immutable identity/before/after snapshots. Current key grants and native
  session bindings remain mandatory. General request editing stays retired (410).
- Approval checks the unchanged live baseline, current assigned manager, owned
  ready photos and block dependencies. Existing floor/room/bed/staff IDs are
  preserved; empty unreferenced blocks can be removed. A public manager contact
  name is separate from the verified profile. Name-only updates preserve existing
  contact fields. Canonical residence, catalog and resident-room projections show
  approved contacts without changing login identities or profile photographs.
- Diff proofs are administrator/session/request/key-version bound, expire in
  30 minutes and use a purpose-derived signer from existing private approval state.
  They cannot replace the actual current approval key. Independent real sessions
  cannot share a proof. No new secret, application table, Auth subject, legacy
  request or retired product feature was imported.
- Submission and decisions notify the manager, its primary owner and current
  administrators. Administrator request/recovery alerts count under approvals and
  target the actual residence review section. The list preserves existing UI status,
  subject and diff fields. Photo replacement now sends the manager key and reports
  a missing key before upload; phone drafts retain the saved country selection.
- The administrator manager-key reset endpoint now requires its separate settings
  key, invalidates old key grants and approves pending recovery petitions. Only the
  manager generates the replacement. Approval keys cannot authorize recovery;
  recovery preserves the request cooldown. Audit and notification writes are atomic.
- `db:verify-residence-changes 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69
  c0857019-ed75-49ec-8af8-259763368f4f` passed 61 isolated native checks with six
  genuine Google subjects and actual archived sessions. Successful submissions,
  concurrent cooldown enforcement, manager/cross-property/media/role denials,
  immutable snapshots, approval-key versus settings-key separation, real-session
  proof isolation, tampering/replay, stale details, ended assignments, rejection,
  block/staff history, contact separation, reconnect persistence and key recovery
  passed. Genuine Auth rows/identities/timestamps stayed unchanged; all domain
  fixtures and private verification keys were confined to disposable local restores.
- The previously completed resident-profile suite passed all 64 checks against
  the new contact projection. Actual public/denied HTTP verification passed 260
  checks with no account creation or imports. TypeScript, frontend/backend builds,
  residual searches and diff checks passed. The corrected literal inventory keeps
  410 replacements retired: 137 implemented, 13 retired and 45 pending endpoints
  among 195. These are source counts, not remaining migrations or accepted journeys.
- Encrypted pre-change checkpoint `65acc9be-ffd0-42dc-be14-f6c0bc1ab46f` and
  post-change checkpoint `61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69` both passed complete
  local restoration including private server PIN recovery, grants and RLS. They
  retain six Auth subjects, four profiles, 34 native sessions, three keyed active
  administrators and seven Storage catalog entries, with 51/52 migrations respectively.
  These PostgreSQL restores do not claim a new provider Storage-byte restore.
- Restart verification exposed an old development lifecycle bug: Vite/HMR and
  keep-alive requests survived after the pool closed, causing browser 500 replies.
  Shutdown now stops admission, closes SSE/Vite, drains accepted HTTP work and only
  then ends the pool. A real database-backed settings read completed with 200 during
  shutdown; both listeners released and the process exited normally. The initial
  harness's 15-second exit wait was too short for other accepted slow requests; the
  actual server drain has a 45-second bound. The new server starts without the old
  HMR collision, and the genuine founder session returned admin/200 afterward.
- Genuine founder browser reads returned 200 with an actual empty request list;
  manager-only reads/submission were denied with 403. No real approval/settings
  key was copied or submitted, and no live operational fixture was created.
  A reload produced two initial Auth reads: an early transient 503 routed the
  client to login, followed by a successful 200 for the still-valid session.
  Initial session restoration must handle transient failures before final cutover;
  this is distinct from the closed-pool/HMR restart issue fixed above.
  Real manager/residence onboarding and its occupied approval browser journey
  remain pending. The default backend and JSON persistence remain unchanged.

## Owned user/resident room profiles — 2026-10-12

- The active user-dashboard GET `/api/student/my-profile` now uses the Supabase
  backend. GET `/api/student/my-rooms` shares the same owned allocation projection;
  its former resident-only handler was removed from maintenance. Primary status
  access requires matching saved allocation/context/profile ownership. Resident
  access requires the exact authenticated resident context and active allocation.
  Manager/admin/other portals cannot use these endpoints. Client selectors return
  400; a stale captured context header returns 409. No schema, grants or RLS changed.
- The `user` response remains the authenticated identity's canonical profile.
  Linked resident name/email/contact information appears only in its room-status
  record, with no child portrait or credentials. Only the allocation's claimed,
  unrevoked activation key is returned; unclaimed replacements remain private.
  Ended allocations and inactive resident portals disappear from active status.
- Supabase user room cards no longer synthesize occupied rooms from pending
  registration records. They use the authorized profile endpoint. The affected
  cards no longer invent a manager phone/name or room number, substitute the
  primary user's contact details for the resident's, or copy a record UUID as a
  missing activation key. Actual assigned manager details come from PostgreSQL.
- `db:verify-resident-profiles cd37046c-336d-41be-b0de-6bc35708b665
  c0857019-ed75-49ec-8af8-259763368f4f` passed 64 isolated native checks using five
  genuine verified Google subjects and their archived native sessions. Separate
  owner/resident rooms, empty states, canonical photograph isolation, role and
  ownership denials, direct allocation RLS, revoked/replaced keys, inactive and
  ended allocations, session revocation and reconnect persistence passed. Only
  disposable local domain relationships were created; genuine Auth rows/provider
  identities/timestamps remained unchanged. There were no cloud fixture writes.
- The existing genuine founder browser session verified administrator denial
  (403), own primary profile/room reads (200), own saved photograph and matching
  canonical aliases, empty-room metadata, selector rejection (400) and stale
  context rejection (409). The actual user dashboard rendered and its photograph
  loaded. Automation returned the account to its administrator portal and removed
  temporary context IDs from browser session storage. Guest HTTP requests returned
  401. Requests on this connection remained slow; profile reads observed in the
  rendered page took approximately 32–37 seconds. Performance is not claimed fixed.
- TypeScript, the Supabase frontend/backend builds, residual-route search and diff
  checks passed. Literal inventory now reports 132 implemented, 13 retired and 50
  pending endpoints among 195; these are source counts, not remaining migrations
  or fully accepted workflows. This round added no migration and deleted no JSON,
  account or Storage data. Genuine occupied-resident onboarding/browser journeys,
  remaining active workflows and final reviewed backups/cutover still remain.

## Genuine founder browser checks and slow-refresh fix — 2026-10-12

- The user enabled Chromium's own remote-debugging consent and signed in through
  Google. Automation attached only to their PineVela tab. Actual `/api/auth/me`
  returned the verified designated founder's administrator portal. Governance and
  pricing/settings reads returned HTTP 200 with slot 1 and both enrolled-key flags;
  their projections exposed no private credentials. The initial harness expected
  `approvalKeyEnrolled`; inspection confirmed the API's existing `keyEnrolled`
  field. The harness was corrected without changing API permissions or key state.
- Actual account-context/access reads returned HTTP 200. The founder's canonical
  portrait aliases agree, and their owned saved image rendered in the administrator
  header. No photograph was uploaded and no approval/settings action was submitted.
- The real theme switch saved dark mode. Automation cleared only this portal's
  appearance cache and set the device fallback to light, then performed a real reload.
  The signed-in administrator header returned and dark mode was restored from the
  saved server preference. The real switch then restored the original light mode;
  a final actual API read confirmed light mode with no pending sync.
- Slow browser requests revealed an active notification bug: the six-second polling
  interval could supersede every still-pending refresh, discarding successful responses.
  A native founder/RLS read returned 15 notices in 8344ms while browser requests also
  showed queue/response delays and some timed out. Temporary errors additionally
  became an empty successful list. The browser now coalesces refreshes per account
  generation, aborts on account change/unmount, retains its inbox after failed reads,
  and fetches primary-account registrations independently of notifications. Other
  roles do not call the primary-only registered-account endpoint. First-load popup
  suppression ends only after a successful notification list.
- The actual administrator navigation displayed 12 approval and 3 settings alerts,
  matching the 15-notice native inbox. Five native promise/AbortSignal tests passed
  (`test:account-refresh`), including overlapping poll/focus/events, old-generation
  cancellation, cancellation before request start and failure/retry. TypeScript,
  the Supabase frontend build and diff checks passed. No Auth identity, provider
  reply or production fixture was fabricated; no RLS or database grants changed.
- The approved browser connection is preserved for subsequent checks. Remaining
  portal/payment/browser journeys, reviewed reset/final backups, the default backend
  switch and JSON removal still require completion. Occasional observed end-to-end
  latency is not claimed resolved by this polling fix. No new migration was added.

## Browser automation and slow-connection checks — 2026-10-12

- `db:verify-browser` runs against the real running Supabase app and an isolated
  Chromium guest profile. It passed 58 checks at 375/768/1440px in light/dark modes:
  login layout, device-theme reload persistence, password visibility controls,
  empty-credential validation, guest appearance denials and administrator-invitation
  session restoration. Delayed outgoing `/api/auth/me` requests are sent unchanged
  and produce actual server replies; no response, Auth identity or record is mocked.
- Browser waits now observe actual page load and rendered controls. An earlier
  harness read the outgoing page immediately after `Page.reload` and checked a
  control before React had committed it. Waiting for `Page.loadEventFired` and
  control readiness resolved those harness failures; no product styling was changed.
- The migration server was stopped when this round resumed and was restarted on
  port 3001. Guest automation creates no account and performs no cloud writes.
  These guest checks do not represent authenticated browser acceptance. The separate
  genuine founder checks above followed the user's ordinary Chromium sign-in and
  remote-debugging opt-in. Private Google credentials and approval/settings keys
  remain in the app/browser, outside test output and chat.

## Account appearance persistence — 2026-10-12

- Migration 51, `20261012111921_scoped_account_appearance.sql`, is applied to the
  configured Supabase project. Its private table stores one light/dark preference
  per existing portal context. Verified session binding and RLS enforce ownership;
  anonymous/authenticated browser roles have no table grants, and the scoped backend
  cannot update ownership. No accounts, legacy preferences or retired features were imported.
- The replacement backend now implements GET/PUT `/api/auth/appearance`. Exact input
  validation rejects ownership fields; identical saves do not churn timestamps.
  The browser captures its portal context on reads and queued writes, so stale
  account-switch requests cannot change another portal's preference. Guest mode and
  offline account caches remain available.
- `db:verify-appearance 0e3b2f3d-ac6d-46e2-af00-c5dba44bb840` passed 46 isolated native
  checks using three actual Google identities and existing portals. Own saves/reads,
  independent cross-identity/shared-identity portal modes, reconnect persistence,
  invalid input, cross-account SQL/RLS, ownership updates, direct browser access,
  stale bindings and revoked-session denials passed. Auth subjects/provider responses
  were not fabricated, and no verification writes reached the cloud.
- The pre-change encrypted checkpoint above passed full local restoration with all
  50 previous migrations, six retained Auth subjects, four profiles, 31 native sessions,
  three administrators with both keys and the original grants/RLS/server PIN key.
  Live rollback validation passed before migration application. Ten read-only live
  schema/session/HTTP checks then passed, including a real native Google administrator
  preference read and anonymous/cross-site denials. Six Auth subjects, four profiles
  and seven Storage entries remain present.
- Fresh post-change encrypted checkpoint `cd37046c-336d-41be-b0de-6bc35708b665`
  (1192095 bytes) passed full isolated restoration with all 51 migrations, the same
  six Auth subjects/four profiles/31 native sessions/three keyed administrators,
  original grants/RLS and the matching encrypted server PIN key. No Storage bytes,
  stopped-writer freeze, independent off-host copy or live restoration are claimed
  for this database-only checkpoint; the earlier separately verified object archive
  remains recorded in the photograph/recovery section below.
- TypeScript, the Supabase frontend/backend builds, source import audit and diff check
  passed. Literal-route inventory now records 131 implemented, 13 retired and 51
  pending-review endpoints of 195; mounted routers still need separate review, so
  these counts do not represent remaining migrations or workflows.
- The user reports both genuine administrator accounts retain their own mode across
  reloads and account switching. A separate read-only native inspection confirms
  distinct persisted preferences for the actual verified Google administrator portals
  (#1 dark, #3 light at inspection). The reported browser check is accepted; that
  report and the server snapshot are recorded separately from automated browser evidence.
  Other portal workflows, reviewed reset/final backups and default backend cutover
  remain pending. JSON persistence is intact and public residence execution stays disabled.

## Genuine administrator photograph and nonempty Storage recovery — 2026-10-12

- Administrator #1 saved their chosen real photograph through the settings-key-protected
  browser flow. A fresh same-picture retry reported success with the photograph count
  unchanged at six. The editor previews the selection, locks repeat submissions while
  uploading/saving, shows local feedback and retains completed uploads for save retries.
  Server reuse checks identical processed bytes, exact Auth owner/portal, actual Storage
  integrity and the current native session/settings grant. Matching unfinished uploads
  return a conflict rather than another reservation.
- `db:verify-administrator-photograph` passed 16 checks using two actual Google administrator
  sessions and the real saved picture. Persistence, canonical aliases, image integrity,
  same-picture reuse, cross-account/key-bypass/forged-context denials and private HTTP
  visibility passed with no verification writes. The keyed browser retry was performed
  by the user, separately from this read-only command.
- The user then signed out and signed in with Google as administrator #3. The browser
  showed only #3's own photograph or initials, with no inherited founder portrait.
  The genuine cross-Google-account avatar-switch check is accepted.
- The owner confirmed deleting earlier copies directly in Storage. Exactly three missing,
  unreferenced ready-upload records were reviewed against both native catalog and provider
  absence. A 27-check isolated rehearsal and the same guarded live transaction marked
  them failed with audit evidence. All ten upload records, all profiles/account contexts,
  key versions and surviving objects were retained; no record or file was deleted.
  The pre-correction archive `104fadf8-6780-42dc-8b64-e572a16e5194` was fully restored locally.
- Recovery now explicitly preserves actual Studio zero-byte folder markers inside the
  UUID context directory. Ordinary photograph methods reject their paths. The new
  `db:verify-storage-folder-markers` passed 11 actual-checkpoint/provider checks, including
  linked-portrait retention, browser-role write denial and adversarial MIME/size/path input.
  TypeScript, the backend bundle and final diff checks passed.
- Post-correction PostgreSQL checkpoint `09f551d7-c8b9-46fe-a475-2773f6b6aab1`
  (1188018 bytes) passed full isolated restoration: six retained Auth subjects, four
  profiles, 32 native sessions, three active administrators with both enrolled keys,
  all 50 migrations, original privileges/RLS and the matching encrypted server PIN key.
- Paired encrypted Storage archive `ff6a02ce-a67c-45be-b81e-450b0c260e2a` includes all
  seven catalog entries: six genuine PNG photographs and one actual empty folder marker,
  totaling 3194064 bytes. Every provider download, sealed-file round trip and full local
  byte reconstruction passed against the exact database checkpoint and inventory digest.
  No provider re-upload, writer freeze, off-host copy or live restore/reset is claimed.
- Other portal/browser workflows and remaining API ports still precede final cutover.
  JSON persistence remains intact, the public residence-execution gate remains disabled,
  and no migration was added during this photograph/recovery round.


## Genuine approval-key recovery accepted — 2026-10-12

- The user completed administrator #3's recovery in the actual browser: #1
  proposed, #2 independently approved, and #3 signed in again with Google and
  privately saved a replacement approval key.
- `db:verify-admin-recovery-acceptance` passed 22 checks comparing live records
  with the restore-verified pre-recovery checkpoint. The executed receipt has
  exactly two distinct eligible approvals excluding the target. The target's
  approval-key version changed; their exact settings-key version and the other
  administrators' identities/key versions stayed unchanged. The actual archived
  old administrator session and its stale approval grant are denied. The new
  genuine Google session enrolled within five minutes and has guarded access.
- One execution audit event and one execution notice were committed, with the
  notice saved in all three actual administrator inboxes. The six original Auth
  subjects remain intact. Verification retrieved no private keys or hashes,
  fabricated no Auth/session/provider records and performed no cloud writes.
  It tests the archived stale grant, not the old plaintext key, which remains
  private to its owner. TypeScript passed.
- Fresh encrypted post-recovery checkpoint
  `c64e356c-6f6e-4c5a-b7e3-283a6af4d718` (1184864 bytes) passed full isolated
  restoration: six Auth users, four profiles, 31 native sessions, three active
  administrators and both keys for each, all 50 migrations, original privileges/
  RLS and the matching encrypted server PIN key. No live restore/reset occurred.
- Next is genuine owned profile-photo/private Storage acceptance, cross-Google
  account isolation and a nonempty object-byte backup. The user has been asked to
  upload their chosen real picture through #1's own settings-key-protected form.
  No migration or JSON removal occurred; the public deletion gate remains off.

## Three genuine administrators ready — 2026-10-12

- Native verification confirms active slots 1–3, each with an independently
  enrolled approval key and settings key. Both saved pricing and recovery rosters
  contain three eligible administrators. No operational proposal existed at the
  start of verification.
- The read-only `db:verify-admin-readiness` command passed 18 checks using two
  currently live genuine Google administrator bindings: guarded status projection,
  exact native ownership, cross-administrator impersonation denial, no private
  credential projection, denied direct database key/final-apply grants and
  unchanged platform settings/proposal counts. It matches the actual server
  status route's authorized transaction; it does not claim completed browser voting.
  Initial probes used the restricted browser database role for a server-only read
  and assumed a persisted platform settings row. Both assumptions were corrected
  after inspecting the real status route and its legitimate fresh-project defaults;
  no permission or RLS policy was relaxed.
- Encrypted continuation checkpoint `18f2ef08-cda0-4e36-a75f-fe67322d58e5`
  (1183723 bytes) passed actual full isolated restoration: six genuine Auth users,
  four application profiles, 30 native sessions, three active administrators,
  three approval keys, three settings keys, all 50 migrations and the original
  grants/RLS/server PIN key. Storage is empty. No live restore/reset occurred.
- Next genuine browser gate is approval-key recovery for administrator #3:
  administrator #1 proposes, #2 independently approves, and #3 performs a new
  Google sign-in and enrolls their replacement approval key. The old key and
  administrator sessions must remain unusable; the settings key is preserved.
  No live recovery, vote or price change was performed by the verification script.
  TypeScript, private-data and final diff checks passed. Protected readiness
  evidence is saved under
  `.security/migration-reset/three-admin-readiness-checkpoint-20261012/`.
  Default JSON persistence remains intact.

## Invitation session-loading transition — 2026-10-12

- The user confirmed acceptance of the replacement private invitation. Read-only
  native checks confirm one accepted invitation, two active administrators,
  six unchanged Auth identities and three clean application profiles.
- The invitation page rendered its signed-out choices while `AuthContext.loading`
  was still true. It now shows an accessible sign-in checking state, defers the
  invitation inspection request until authentication resolves, and only then
  presents the appropriate invitation or signed-out controls. No authorization,
  token or enrollment rule changed.
- Actual Chromium checks passed at 375/768/1440px (19 assertions), delaying only
  the outgoing `/api/auth/me` request and continuing it unchanged to the real
  backend. Sign-in/signup choices stayed hidden while pending, then appeared
  after the actual guest 401; loading resolved and no runtime exception occurred.
  No provider response, Auth identity or invitation record was mocked. This
  verifies the real loading/guest transition; authenticated reload after this
  UI fix remains a separate check. TypeScript, the full production build and diff
  review passed.
- No migration, reset, cloud restore or JSON removal occurred. Further genuine
  administrator sign-in, independent key enrollment and quorum journeys remain
  before cutover; accepted invitations must never be replayed.

## Invitation Google login diagnosis — 2026-10-12

- Read-only inspection found a valid, unexpired founder-issued invitation bound
  to an existing verified Google Auth subject, but that subject had no PineVela
  profile or portal. Its previous legacy-user login did not initialize a profile
  in the new database. The same invited Google account can use explicit Sign Up
  from the invitation page; no fresh account or invitation replacement is needed.
- A provider-verified login without a profile now receives the safe existing
  `google_error=missing` category and same-account Google signup instructions,
  preserving the private invitation continuation. Existing inactive profiles
  retain their denial; login does not create profiles or grant membership.
  The original JSON-mode message is preserved.
- All 25 isolated native checks passed against the latest real-account/founder
  checkpoint, with no fabricated Auth identities, tokens, provider replies or
  verification dates. The first rerun assumed there were zero administrator
  memberships; that older-checkpoint assumption failed after genuine founder
  setup. The corrected check asserts that the saved membership/property/store
  counts remain unchanged by signup; no authorization check was relaxed.
  TypeScript, the final production build, built-server public/private-artifact
  checks, private-data checks and final diff review passed. The user subsequently
  initialized that same invited subject's profile; native checks confirm its
  verified primary identity is now eligible. The invitation was explicitly
  cancelled (`cancelled`, with valid issuer and unexpired deadline), so acceptance
  requires a new founder-issued invitation for that same email. No cancelled
  token was revived. Positive invitation acceptance remains pending that retry.
  No schema migration, cloud reset or JSON removal was performed.

## Retained Google signup — 2026-10-12

- Read-only resume checks confirmed the configured project is reachable with all
  50 migrations, six Auth users, 27 native sessions, one profile, zero Storage
  objects and no public tables missing RLS. The selected founder had no PineVela
  profile and there were no administrator memberships, so genuine signup was
  blocked despite retaining the verified Google Auth identity.
- Explicit Google Sign Up now initializes only that provider-verified subject's
  ordinary primary profile after `/user` verification and an in-transaction check
  of the exact saved Google identity and live native session. Subject locks make
  concurrent signup idempotent. Existing profiles remain intact, normal login
  does not initialize accounts, and enrollment token rules remain enforced.
  No legacy records, credentials, portraits or elevated roles are imported.
  Administrator membership still requires the separate private founder setup.
- All 22 isolated native checks passed using the restore-verified full migration
  50 checkpoint: exact identity retention, wrong/missing/revoked session denial,
  missing Google identity denial, concurrency, repeat signup, no role/data import,
  revoked direct initializer grants and unchanged genuine Auth records. No Auth
  users, tokens, provider replies or verification timestamps were fabricated.
  TypeScript and the full production build passed. Actual Google authorization
  start produced a PKCE redirect to Google and an HttpOnly callback cookie without
  creating an account. The user then completed actual Google signup and confirmed
  the user dashboard loaded; read-only native checks confirmed their saved exact
  profile and live primary-session binding. The separate private founder script
  verified the selected Google identity with the provider and created slot 1.
  A wrapper pool-close error happened after commit; read-only reconciliation
  confirmed exactly one designated active founder, with both own keys unenrolled.
  The provisioning operation was not replayed. The user subsequently confirmed
  actual administrator Google sign-in and saved both private keys. Native checks
  independently observed the genuine administrator binding and both persisted
  enrollment records, including the settings-enrollment audit event. Neither key
  nor its hash was retrieved. A later check had no live administrator binding;
  this does not undo the observed sign-in or saved enrollments, and no claim is
  made that the user remains signed in.
- Actual rebuilt-server public/private-artifact checks and the source audit passed:
  76 reachable replacement modules, no reachable JSON persistence, unchanged
  endpoint counts (129 implemented, 13 retired, 53 pending). These route counts do
  not measure remaining migrations or complete workflows.
- Encrypted continuation checkpoint `cd3edab7-c140-4c6d-aee7-7993e6f663b5`
  passed full isolated restoration. After both keys were enrolled, refreshed
  checkpoint `e6c0ffc6-7209-459d-b134-115e5800f2b0` (1179654 bytes) also passed
  actual full isolated restoration: six Auth users, two profiles, 27 native
  sessions, one active administrator, one approval key and one settings key,
  all 50 migrations, original grants/RLS and the matching encrypted server PIN key.
  The restored Storage catalog is empty. These are continuation backups, not a
  stopped-writer final reset/cutover checkpoint. No live restore or reset occurred.
- Next interactive gate: the founder creates a private invitation using their
  own approval key and a trusted second verified Google identity accepts it.
  Continue genuine independent administrator enrollment/quorum checks after
  that; do not fabricate identities or restore legacy roles to fill the roster.
- The replacement app is available separately on loopback port 3001 for genuine
  signup acceptance. The six original verified Google Auth identities are retained;
  only the designated user's clean primary profile and explicit founder membership
  were added by their signup and private setup. No new migration was needed, no reset occurred, and the
  default JSON backend and public deletion gate remain unchanged.

## Production worker checkpoint — 2026-10-12

- The compiled standalone Node worker is ready. It previews saved work by
  default; execution requires `--execute`. `--watch` polls every 15 seconds,
  processes request batches of 10 and Storage batches of 20, and skips active
  Storage leases. SIGTERM/SIGINT stop new work and drain the current job before
  closing the database. Restart resumes durable requests without replaying
  completed receipts. Production execution does not require `tsx`.
- Verification passed: 148 native execution checks with genuine saved Google
  identities and an actual encrypted restore, nine compiled worker lifecycle
  checks with real signals/restarts, and 14 actual responsive guest-browser
  checks at 375/768/1440px in both themes. TypeScript, the full production build,
  actual built-server public/private-artifact checks, private-data checks and
  final diff review passed. The official isolated security-advisor comparison
  remains 14 before/14 after, with zero new findings.
- The source audit now follows both server and worker entrypoints: 75 reachable
  modules, no reachable JSON persistence, and unchanged endpoint counts of 129
  implemented, 13 retired and 53 pending. Endpoint counts do not measure remaining
  migrations. No new migration was needed; all 50 remain applied.
- The concrete preview systemd service was validated on this host, but has not
  been installed or enabled. Operating instructions are in
  `docs/operations/residence-worker.md`. Protected verification evidence and
  source hashes are saved in
  `.security/migration-reset/production-worker-checkpoint-20261012/`.
- No live jobs executed and no cloud records, objects or Auth identities changed
  in this round. The six verified Google identities, disabled public request gate
  and default JSON backend remain intact. The restore-verified database checkpoint
  `46ba06a3-894e-4af8-aa22-ae5ff3589425` and paired Storage archive
  `1f54ae46-ef20-4314-a66f-76fcf6339e02` remain the latest data checkpoint.
- Genuine provider-authenticated positive browser/HTTP acceptance, live queued
  object removal and worker deployment remain pending. Guest denial and worker
  lifecycle checks do not establish those interactive acceptance gates. Resume
  there before enabling deletion or performing the reviewed reset/final cutover;
  do not remove JSON yet.

## Reviewed execution handoff — 2026-10-12

- Official CLI-generated migration 50,
  `20261012014440_reviewed_residence_execution_requests.sql`, committed atomically
  after native/security rehearsal, fresh backup restoration and the target
  rollback-only dry-run. SHA-256:
  `4d271d73efd19a494cff1e1efd208557c2258c259d88825e82ec747bf2b923cc`.
  All 50 native/local hashes match; none are pending. Applied migrations 1–49
  are unchanged. The replacement runtime now requires migration 50.
  It adds one durable request per final authorization, native
  deadlines and immutable identity/history, with RLS and no direct role/helper
  grants. Request completion and exact native execution must commit together.
  Invalidated requests cannot revive when access returns.
- The gated API validates the founder's current own key and explicit confirmation,
  derives authority from saved native consent and returns `queued`, not deleted.
  A separate operator restore-verifies actual archives outside the web process
  and live mutation transaction, rechecks authorization and runs the existing
  reviewed core. Restart/lost-response reconciliation does not replay deletion.
  Admin status/UI now distinguish requested, invalidated, executed and confirmed
  Storage cleanup counts without exposing private bindings, keys or archive paths.
- The public server-only request gate remains `false`; no live job or domain
  deletion has been submitted. All 145 final native execution/service/worker checks
  passed: own-key founder confirmation, strict input, atomic handoff, concurrent
  execution and invalidation, one committed notice, real five-minute expiry,
  revoked binding, no consent revival, safe status projections, restart/response
  reconciliation and actual encrypted full restoration. The 374 account/residence, 90 housing
  and 60 cooldown regressions passed. All 75 actual-provider Storage checks passed
  with the new schema in isolated domain restores; both temporary images were
  removed and the original cloud catalog restored. Security advisors remain
  14 before/14 after with zero new findings. TypeScript and the full build passed.
  These are 754 native/provider checks in total; repeated rehearsals are not
  counted again. Native domain fixtures used genuine saved Google identities
  and sessions; no Auth user, provider reply or verification date was fabricated.
- Fresh pre-DDL encrypted checkpoint `98650e6f-cdb9-4008-8fff-34448b1178b7`
  (1163743 bytes) passed actual full isolated restoration of 49 migrations,
  original ACLs, RLS and the private PIN key before target DDL.
- Read-only live verification confirms six verified Google subjects, 27 native
  sessions, one profile, no residences/payments/media/provider objects, unchanged
  Auth bytes and no execution/request/cleanup history. All 37 public tables and
  four private worker tables have RLS; direct browser/backend worker and helper
  grants are absent. Migration 50 adds no security definers; the three private
  deny-only trigger definers from migration 49 remain. The actual built server
  started against migration 50, served public reads and denied private artifacts.
- Post-DDL encrypted checkpoint `46ba06a3-894e-4af8-aa22-ae5ff3589425`
  (1178242 bytes) passed actual full isolated restoration of 50 migrations,
  original ACLs, RLS and the private PIN key. Initial post-DDL backup/server checks
  failed during intermittent PostgreSQL connection startup; read-only probes
  found working Auth HTTPS and verified PostgreSQL queries at all three current
  pooler addresses. Normal-hostname connectivity recovered without changing
  application configuration, credentials or TLS verification. Failed checks were
  not counted as passes. All 254 final public/denied HTTP checks passed without
  account creation or imports. Both read-only worker previews confirm zero jobs.
  Paired encrypted Storage archive `1f54ae46-ef20-4314-a66f-76fcf6339e02`
  captures the actual empty catalog (zero objects/bytes) and passed encrypted
  verification/local reconstruction. These continuation backups do not prove
  stopped project writers, final reset consent or live queued-object removal.
  The private-data check and final diff check passed. Source audit: 129 implemented,
  13 retired and 53 pending legacy endpoints across 65 reachable replacement
  modules, with no reachable JSON persistence. These counts do not measure
  migrations remaining or complete product workflows.
- JSON, live verified identities and the default backend remain intact.
  Genuine provider-authenticated positive
  HTTP/browser acceptance, live queued-image removal and worker deployment remain
  required before enabling the public request gate or final cutover.

## Reviewed residence Storage processor — 2026-10-12

- Migration 49, `20261012002204_reviewed_residence_storage_worker.sql`,
  committed atomically after official CLI creation, isolated native/security
  rehearsal, fresh backup restoration and the rollback-only target dry-run.
  SHA-256: `d41bf1a9c47b96277cba187f120a4383cc5763bbf7afc7b6c8643b28867eea39`.
  All 49 native/local hashes match; none are pending. Applied migrations 1–48
  are unchanged. The replacement runtime now requires migration 49.
- The private operator processor restore-verifies the original frozen database
  and Storage archives before checking current references, actual provider
  identity and full image hash. Native five-minute leases serialize claims and
  retain failure/expiry history. Completion requires actual provider and catalog
  absence; recovery after removal does not replay deletion. Completed decisions
  delegate this narrow cleanup beyond review expiry without reviving archived
  login authority. Ordinary interrupted-upload reconciliation excludes these jobs.
- Queued media metadata remains immutable. Native guards deny new references,
  path replacement, unprepared catalog deletion and queued-history truncation.
  The three private deny-only trigger definers have fixed empty search paths and
  revoked EXECUTE grants; they add no table/RLS permission or RPC entry. Unknown
  dependencies or missing guards block cleanup. Public residence `/execute` and
  UI execution remain disabled; the operator command is read-only by default.
- 75 final checks passed using actual private provider uploads, metadata, hashes,
  Storage API removal and independently observed absence. Native domain records
  and genuine backed-up Google identities stayed in disposable restores; actual
  provider catalog changes were replicated with `pg_dump`/`pg_restore`, never
  fabricated with SQL. Checks include shared-image retention, concurrent claims,
  forged/expired token denial, actual timer expiry, no-replay recovery and encrypted
  post-cleanup restoration. Two temporary private copies of the supplied cover
  were removed and the original empty cloud catalog restored. This verifies real
  provider I/O with isolated queued domain records; it does not establish a live
  authenticated residence-deletion/browser journey or a live queued-object
  deletion through the newly installed cloud trigger.
- Regressions passed: 100 execution, 374 account/residence, 90 housing-reference
  and 60 cooldown assertions (624; 699 including Storage checks). No Auth users,
  provider replies or verification timestamps were fabricated. Official security
  advisors found 14 before and 14 after, with zero new findings; existing view
  findings remain. TypeScript and the full Supabase frontend/backend build passed.
- Fresh pre-DDL encrypted checkpoint `221eddba-16f3-4b1d-9c59-83dbd1850b7e`
  (1109839 bytes) passed full isolated restoration of 48 migrations, original
  ACLs, RLS and the encrypted server PIN key. The first dump timed out and was not
  counted as a backup; its retry succeeded before any target DDL ran.
- Read-only live checks confirm six verified Google subjects, 27 native Auth
  sessions, one profile, zero residences/payments/media/provider objects and
  unchanged Auth bytes. All 37 public tables and three private worker tables have
  RLS. Browser/backend direct worker/helper grants are absent; no live executions,
  cleanup tasks or attempts exist. Read-only worker preview confirms zero pending
  jobs. The actual built server started against migration 49, served public reads
  and denied private artifacts. All 254 public/denied HTTP checks passed without
  imports or account creation. The private-data check and source audit passed:
  129 implemented, 13 retired and 53 pending legacy endpoints across 64 reachable
  replacement modules, with no reachable JSON persistence. Endpoint counts do
  not measure migrations or complete product workflows.
- Post-DDL encrypted checkpoint `7e347d48-e692-4e85-b422-16bb1f08f235`
  (1163743 bytes) passed actual full isolated restoration of all 49 migrations,
  original ACLs, RLS and the private PIN key. Paired encrypted Storage archive
  `73dc30d4-1686-43e4-bc84-fe79759a2548` captures the actual empty catalog
  (zero objects/bytes) and passed encrypted verification/local reconstruction.
  These continuation backups do not establish stopped project writers, final
  reset consent, authenticated browser acceptance or live queued-object removal.
- Remaining residence work: public execution/worker integration, genuine
  authenticated provider/HTTP/browser acceptance and the retained manager's
  new-residence journey after cooldown expiry. Project-wide stopped-writer
  backups, exact reviewed reset, default-backend switch and JSON removal remain
  pending. Default dev/build/start still use JSON; Express remains the API server.
  No live account or application record was deleted by migration 49.

## Reviewed residence execution core — 2026-10-11

- Migration 48, `20261011214244_reviewed_residence_execution_core.sql`,
  committed atomically after official CLI creation, native rehearsal, security
  advisors and the target dry-run. SHA-256:
  `9d04c0df2e27e1c35ed1b01533599c37ab037229f70c14a63e6c66583f964555`.
  All 48 native/local hashes match, none are pending and migrations 1–47 are
  unchanged. The runtime refuses schemas lacking migration 48.
  The documented native-ledger/Docker-shadow fallback remains in use.
- Private native admission binds the current own-key founder, genuine Auth
  session/key version, unexpired final consent, exact frozen scope/catalog,
  restore-verified recovery receipt and originating transaction/backend. Source
  locks and an unknown-child-FK guard reject unchecked cascades. A running
  admission cannot commit unfinished. Exact operational removal, portal closure,
  scoped binding revocation, pending invitation cancellation, execution-time
  cooldowns, creator/admin notices, audit and executed receipt/pause/proposal
  commit together. Shared Auth, unrelated portals and historical relationships
  remain intact. Residence-only retains manager login; combined removal closes
  its portal. Zero cooldown creates no ban. Version-3 reviews require fresh consent;
  older reviews are invalidated without silently releasing their housing pauses.
- Approved exclusive images receive immutable pending cleanup tasks and media
  state `removing`. Worker tasks do not yet delete provider objects; no SQL
  `storage.objects` mutation is performed. Worker helpers/tables have RLS and no browser/backend grants or
  public execution entry. `/execute` and UI execution remain disabled. Admin status
  distinguishes executed preparation from cancelled preparation.
- 100 final native execution checks passed on the generated migration using the
  fresh pre-DDL checkpoint: both deletion modes, unassigned/zero-cooldown scope,
  old-review invalidation/pause/cancellation, revoked founder binding, unexpected
  dependency denial, incomplete admission, full transaction rollback, scoped
  cooldowns/access/notices, shared seller identity, historical UUID reuse denial,
  no-replay reconciliation and actual encrypted full restoration. Regressions:
  374 account/residence, 90 housing-reference and 60 scoped-cooldown assertions
  passed (624 native assertions in total). All domain
  fixtures stayed in disposable restores of genuine saved Google identities;
  no Auth users, provider replies or verification timestamps were fabricated.
- Official security advisors: 14 before, 14 after, zero new findings; existing
  projection-view findings remain. Pre-DDL encrypted checkpoint
  `40c305fc-4196-46ff-ab05-5dbced4c9317` (1068139 bytes) passed actual full
  isolated restoration of migration 47, original ACLs and the private PIN key.
  No target DDL ran during the dump. TypeScript and the full Supabase frontend/
  backend build passed. The actual built server started against migration 48,
  served public reads and denied private artifacts. The private-data check and
  source audit passed: 129 implemented, 13 retired and 53 pending legacy endpoints
  across 64 reachable replacement modules, with no reachable JSON persistence.
  These endpoint counts are not migrations remaining.
- Read-only live checks confirm six verified Google subjects, 27 Auth sessions,
  one profile, zero residences/payments/media/provider objects, unchanged Auth
  bytes, all 37 public tables with RLS and two private worker tables with RLS.
  No direct browser/backend worker grants, exposed helper grants, new helper
  security definers, live execution receipts or cleanup tasks exist. All 254
  public/denied HTTP assertions passed without imports or account creation;
  genuine authenticated workflow HTTP/browser acceptance remains separate.
- Post-DDL encrypted checkpoint `1638c140-663e-470c-8c52-f0481a350a34`
  (1109839 bytes) passed actual full isolated restoration of all 48 migrations,
  original ACLs, RLS and the private PIN key. Paired encrypted Storage archive
  `ed75a6f6-077d-4d0e-bc08-82ace227445c` captures the actual empty catalog
  (zero objects/bytes) and passed encrypted verification/local reconstruction.
  The final 100 execution checks also passed using this post-DDL checkpoint,
  with unchanged genuine Auth bytes and no cloud mutations. These continuation backups do not establish stopped
  project writers, final reset consent or nonempty provider acceptance.
- Remaining residence work: verified Storage task claim/retry/provider processing,
  genuine nonempty provider/browser acceptance, public worker integration and the
  retained manager's new-residence journey after cooldown expiry. The reviewed
  reset, project-wide stopped-writer backups, default-backend switch and JSON
  removal also remain pending. Default dev/build/start still use JSON. No live
  account, operational record or provider object was removed by this migration.

## Retained housing media and enrollment targets — 2026-10-11

- Migration 47, `20261011210451_retained_housing_media_enrollment_targets.sql`,
  committed atomically after native rehearsal, official CLI security advisors,
  CLI migration creation and the target dry-run. SHA-256:
  `b7c3db28b3ba98639db3615861afd864f748075c696d0ec8bb6a39b489f262ed`.
  All 47 native/local hashes match, none are pending and applied migrations 1–46
  are unchanged. The documented native-ledger/Docker-shadow fallback remains in use.
- One private immutable reference table captures only actual room, allocation,
  verification-case, inspection and maintenance-issue identities and saved parents.
  Four media and two enrollment foreign keys retain enforced historical targets.
  Existing rows, ownership/Auth links and state remain unchanged; nullable case
  residences stay nullable. New bindings require live operational sources. Retained
  references provide no access authority. Bound-source DELETE/TRUNCATE, residence
  execution and caller-set bypasses remain denied. Ordinary unbound cleanup remains
  possible, without permitting UUID reuse. Housing admission/table locks protect
  backfill and trigger/FK installation from concurrent native writers.
- 90 new native checks passed on the final generated migration, including all five
  creation paths, actual-image reservations, DDL/creation rollback, concurrent writers,
  private grants/RLS, forged metadata, frozen/unpaused deletion denial and actual
  encrypted full restoration. Regressions passed: 374 account/residence, 60 scoped
  cooldown, 68 financial/governance history and 46 payment assertions. The earlier
  history verifier now rehearses migrations in dependency order before checking the
  current schema. Genuine backed-up Auth users/identities/sessions are unchanged;
  domain fixtures remain local and no provider responses or Auth users were fabricated.
- Official security advisors: 14 before, 14 after, zero new findings; existing
  projection-view findings remain. TypeScript, backend bundling and actual built-server
  startup/public/private-artifact checks passed. Latest source audit: 129 implemented,
  13 retired and 53 pending legacy endpoints across 64 reachable replacement modules;
  no JSON persistence is reachable from the replacement. Counts are not migrations left.
- Pre-DDL encrypted checkpoint `e0aaa130-b8db-43d6-87f6-8b548b09997a`
  (1045555 bytes) passed actual full isolated restoration of migration 46, original
  ACLs and the private PIN key. No target DDL ran during the dump. Read-only post-DDL
  checks confirm six genuinely verified Google subjects, 27 sessions, one profile,
  zero residences/payments/media/provider objects/retained housing references,
  all 37 public tables with RLS, six enforced retained FKs, no new helper security
  definers and no direct role grants. Auth bytes match the pre-DDL fingerprint.
- All 254 live public/denied HTTP assertions passed without imports or new accounts.
  Post-DDL encrypted checkpoint `12a74095-de16-47a1-89e2-5d61f3a90154`
  (1068139 bytes) passed actual full isolated restoration with all 47 migrations,
  original ACLs, RLS and the private PIN key. The final 90 housing assertions also
  passed on this fresh checkpoint with unchanged genuine Auth bytes. Paired encrypted
  Storage archive `7c9689d3-96df-4f84-8177-9fca80d78f99` captures the actual empty
  catalog (zero objects/bytes) and passed encrypted verification/local reconstruction;
  no cloud data or provider objects changed.
  Continuation backups do not establish final reset consent, a project-wide stopped
  writer freeze, genuine browser acceptance or nonempty provider reupload recovery.
- This resolves the media/enrollment reference dependencies; it does not implement
  execution. Native worker admission, ordered operational removal, scoped portal
  revocation/cooldowns, creator notices and durable Storage API cleanup remain pending.
  Genuine authenticated browser/nonempty provider acceptance, reviewed reset,
  project-wide stopped-writer backups and final cutover also remain pending.
  Default dev/build/start still use JSON. No account, operational record or object
  was removed or restored into the live app by this migration.

## Scoped registration cooldown readers — 2026-10-11

- Enrollment now checks the saved primary portal's `manager_account` cooldown.
  Manager/residence submission, inspection/registration approval and housing-media
  reservation use the saved manager context: `residence` targets only that manager;
  `manager_account` targets its actual primary owner. A predecessor's residence
  cooldown no longer spreads to a replacement manager sharing that owner. Native
  database time determines expiry. Seller/resident registration rules are unchanged.
- 60 native assertions passed on an isolated full checkpoint using five genuine
  verified Google identities and unchanged Auth users/identities/sessions. Coverage
  includes exact/foreign/predecessor targets, expired bans, owner enrollment denial,
  real active/closed session boundaries, housing-media eligibility and denied direct
  browser/backend-role ban writes. The 374 account/residence regressions passed.
  These tests do not replace genuine provider-authenticated browser acceptance.
- TypeScript, final backend bundling and actual built-server startup/public/private
  artifact checks passed. All 254 public/denied HTTP assertions passed during the
  completed migration-46 recovery checks below. Latest source audit: 129 implemented,
  13 retired, 53 pending legacy endpoints, 64 reachable replacement modules and no
  reachable JSON persistence. Counts do not represent remaining migrations.
- This is a backend reader correction; it adds no migration or live cooldown. Fresh
  read-only verification confirms all 46 native/local hashes match, zero pending
  migrations, unchanged live counts and disabled execution. The post-migration
  database/Storage recovery checkpoint below is fully rehearsed. Native worker
  admission, ordered operational removal, scoped portal revocation, execution-time
  cooldown writing, creator notifications and durable Storage cleanup remain pending.
  Default dev/build/start remain on JSON; no accounts or objects were removed.

## Retained residence financial and governance targets — 2026-10-11

- Migration 46, `20261011192711_retained_residence_history_targets.sql`, committed
  atomically after native rehearsal, official CLI advisor comparison, CLI migration
  creation and target dry-run. SHA-256:
  `ca3a6cb24a32acfe38486994d7091807fe002a7acc626b1d281bf6f08f962912`.
  All 46 local hashes match the native ledger; the 45 previously applied migration
  hashes are unchanged and none of the generated migrations are pending. The
  documented native-ledger/Docker-shadow fallback remains in use.
- Immutable private residence identities capture actual saved metadata. New creation
  captures history atomically; false metadata, updates, erasure, ID changes and ID
  reuse are denied. Payment targets retain their enforced financial reference;
  governance targets retain their UUID without the former operational `SET NULL`.
  Existing proposals, votes, native scope/freeze validity, payment ownership, amounts
  and provider evidence are unchanged. These references provide no access authority.
- Native DELETE/TRUNCATE remains blocked, including unpaused root DML and caller-set
  configuration. Preparation cancellation does not enable deletion. New reviews and
  quotes still require actual live relationships. RLS and revoked browser/backend
  table/helper grants protect retained metadata; no new security definers were added.
- 68 new native history checks, 46 payment checks, 374 account/residence regressions
  and 118 consent/recovery checks passed (606 total). Genuine backed-up Google Auth
  users, identities and sessions are unchanged; no test Auth users or provider
  responses were fabricated. Tests cover native DDL rollback, creation races, immediate
  constraints, forged metadata, portal separation, immutable history, frozen/unpaused
  deletion denial, real five-minute expiry, reconnect and actual encrypted full restore.
  Prior fixture assertions were corrected to distinguish administrator-wide payment
  access from a primary portal and to test the deletion gate after a keyed pause cancellation.
- Official security advisors: 14 before, 14 after, zero new findings; existing
  projection-view findings remain. TypeScript, backend bundling and actual built-server
  startup/public/private-file checks passed. The frontend was unchanged. Source audit
  remains 129 implemented, 13 retired and 53 pending legacy endpoints across 63 reachable
  modules, with no JSON persistence reachable from the replacement; these counts are
  not remaining migrations.
- Pre-DDL encrypted checkpoint `3631f3e5-f906-4c94-ba0b-a6347505878a` (1036280 bytes)
  passed actual full isolated restoration with 45 versions, original ACLs and private
  PIN key. No target DDL ran during the dump.
- A connection interruption delayed the first post-DDL HTTP run and backup. The
  committed migration and matching ledger hashes were already verified; no writes
  were replayed. After connectivity recovered, all 254 public/denied HTTP assertions
  passed. Genuine authenticated workflow acceptance remains separate.
- Post-DDL encrypted checkpoint `46e55cef-d7d2-49ab-93dd-3194b723a4a7`
  (1045555 bytes) passed actual full isolated restoration with all 46 versions,
  original ACLs and the private PIN key: six Auth users, 27 sessions, one profile,
  zero Storage objects, all 37 public application tables with RLS, no guest profile
  read/context promotion/backend RLS bypass. The failed earlier dump is not a
  recovery checkpoint. Paired Storage archive `67bf2fa7-99ed-4498-a1b6-497f08b01262`
  passed encrypted verification and local reconstruction of the actual empty catalog;
  no cloud records or provider objects changed. The first sandboxed rehearsal failed;
  the permitted isolated rehearsal passed.
  These continuation backups do not establish final reset consent, a project-wide
  stopped-writer freeze or nonempty provider reupload acceptance.
- Read-only target checks verify six genuinely verified Google subjects, 27 sessions,
  one profile, zero objects/residences/payments/retained targets/residence reviews/
  authorizations, enforced retained foreign keys, private permissions and unchanged
  public RLS. No operational record, access binding, Auth record or provider object
  was removed. Default dev/build/start remain on JSON.
- The next worker work is ordered operational removal, scoped access revocation and
  cooldowns, creator notifications and durable Storage API cleanup. Media/enrollment
  guards and retained context relationships remain dependencies. Source inspection
  also identified primary-owner-wide cooldown lookups; the readers are corrected
  above, while native execution-time scope enforcement is still required. Genuine
  authenticated browser/nonempty provider acceptance,
  reviewed reset, project-wide stopped-writer backups and final cutover remain pending.

## Final keyed residence execution consent — 2026-10-11

- Migration 45, `20261011161535_keyed_residence_execution_consent.sql`, adds
  immutable private final-consent records with SHA-256
  `c801fe1189745b7396a3675d770eb6aa4468bda3910397c25e6b09357ba45c6e`.
  Native SQL rehearsal and official CLI advisors passed before CLI migration
  creation, using the documented native-ledger/Docker-shadow fallback. Target
  dry-run passed and application committed atomically. All 45 local hashes match
  the target ledger; none are pending.
- The founder supplies their current separately verified approval key and exact
  `AUTHORIZE APPROVED HOSTEL` confirmation through the authenticated API. Native
  guards derive/recheck the genuine session, reviewed quorum, frozen scope, receipt,
  cleanup/catalog digests and current key version. No client identity/proof/deadline
  is accepted. Native expiry is at most five minutes, capped by review expiry.
  Current validity rejects changed scope/catalog, cancelled preparation, revoked
  session/binding or changed/locked credentials. History remains immutable/private.
- Authorization, admin-only notification and genuine founder audit commit together.
  Exact concurrent retries reconcile once; expiry requires another keyed decision.
  Admin status/UI expose only dates/current validity. `/execute` remains disabled;
  this prerequisite cannot delete operational rows, revoke portal access, start
  cooldowns or remove Storage bytes. The future worker must freshly reverify actual
  recovery files and native final consent inside the execution transaction.
- 118 native consent/recovery/cleanup checks and 374 account/residence regressions
  passed (492 total), using isolated genuine Google identities and unchanged native
  Auth rows. Expiry used 301 seconds of actual native time, followed by a new keyed
  consent; no Auth timestamps or provider responses were fabricated. Actual encrypted
  native recovery preserves consent history. Earlier fixture verification failures
  were corrected without weakening guards: isolation must change before actor
  queries, and the dedicated expiry connection needs a matching query timeout.
  As in migration 44, classification metadata without real object bytes is rejected;
  verified archive acceptance uses the actual empty catalog. Nonempty live/operator,
  authenticated browser and genuine provider acceptance remain pending.
- Security advisors: 14 before, 14 after, zero new findings; existing projection-view
  findings remain. TypeScript and production build passed, including the final
  migration-45 backend bundle. All 254 public/denied HTTP assertions passed. The
  first HTTP attempt received 503 for a public catalog read; after a read-only
  inventory/wait check showed no waits, the single full retry passed. No writes were
  replayed. Source audit: 129 implemented, 13 retired, 53 pending legacy endpoints
  across 63 reachable modules, with no JSON persistence reachable from the replacement.
  These counts are not remaining migrations.
- Fresh pre-DDL encrypted checkpoint `fc0520b2-c9d4-4685-8b5e-ab3b24e9190d`
  (1025791 bytes) passed full isolated restore with all 44 versions, original ACLs
  and the private PIN key: six Auth users, 27 sessions, one profile, zero objects,
  37 public tables with RLS, no guest profile access/context promotion or backend
  RLS bypass. No DDL ran during the dump.
- Post-DDL read-only checks verify the same live inventory, six genuine verified
  Google accounts and zero operational residences, payments, preparations, receipts,
  cleanup plans, authorizations or registration bans. New authorization RLS, invoker
  functions and denied direct browser/backend grants are verified. Original payment,
  recovery, cleanup and isolation boundaries remain intact. The migration-45 built
  server starts and denies private artifacts. Default dev/build/start remain on JSON.
- Post-DDL encrypted checkpoint `ea7f5eec-8f28-4bb9-b338-26389c740010`
  (1036280 bytes) passed full isolated recovery with all 45 versions, original ACLs
  and the matching private PIN key; restored counts match live verification. Paired
  Storage archive `3440e88a-6a86-43d7-920d-16583fc300c5` preserves the actual empty
  catalog and passed encrypted verification/local reconstruction with zero cloud
  writes. These continuation checkpoints do not
  establish a project-wide stopped-writer freeze, final reset consent or genuine
  provider reupload acceptance.
- Read-only native inspection identifies 82 foreign keys into housing/account-context
  tables for the next worker. Retained payment/media/enrollment relationships and the
  immutable proposal target's SET NULL action need explicit handling. No FK or freeze
  guard was relaxed, and no operational record/image was deleted.
- Next: the ordered execution worker, portal revocation, cooldowns and durable
  Storage removal/recovery; remaining account deletion/wipes, genuine acceptance
  and reviewed final reset/default switch precede JSON removal. JSON remains intact.

## Verified residence cleanup plans — 2026-10-11

- Migration 44, `20261011154424_verified_residence_cleanup_plans.sql`, adds immutable
  private cleanup plans with SHA-256
  `4ac8b48fcf0e1b54bd23609909ff59fcb424e52bbaeff4c779c3b655d26ddae2`.
  Applied after native rehearsal, security advisors, a fresh full restore and target
  dry-run. All 44 local hashes match the native target ledger; none are pending.
  The built opt-in server starts against migration 44 and denies private artifacts.
- The trusted operator command `db:prepare-residence-cleanup` freshly restore-tests
  the actual PostgreSQL/Storage evidence and reconciles the original recovery receipt
  before recording the exact native plan. No HTTP/RPC or client-supplied proof is added.
  Plans retain avatar/market assets, unfinished or foreign-bound assets and references
  in retained public/private rows, including unknown future tables. Unreviewed orphans
  are never swept. Native guards recheck consent, founder quorum, scope and catalog.
- Plans, admin-only status notices and operator audit commit or roll back together;
  exact concurrent retries reconcile once. Admin status/UI expose only planning time
  and counts, never private object paths/owners or backup bindings. Planning grants
  no execution authority and deletes no operational rows or Storage bytes. Future
  execution must freshly reverify consent, archives, reference decisions and founder key.
- Isolated fixtures use six genuine restored Google identities and actual native
  sessions. Photo-classification fixtures use the actual normalized cover file;
  deliberately unbacked ready metadata is rejected as missing real provider bytes and
  removed before verified archives are recorded. The accepted recovery/plan test uses
  the actual empty native catalog. No Auth freshness/provider responses are fabricated.
  Nonempty live plan/operator acceptance and authenticated browser journeys remain pending.
- Official CLI security advisors: 14 before, 14 after, zero new findings; existing
  projection-view findings remain. Native rehearsal precedes CLI migration creation
  using the documented Docker-shadow/native-ledger fallback. Supabase production
  build and TypeScript passed. Native verification passed 76 cleanup-plan checks,
  374 combined account/residence checks and 42 recovery regressions (492 total).
  Native recovery truncation checks now include CASCADE so newly referencing plan
  tables do not substitute FK failure for the original immutability guard.
  All 252 public/denied HTTP assertions passed; authenticated workflow/browser
  acceptance remains pending. Source audit: 129 implemented, 13 retired and 53
  pending legacy endpoints across 62 reachable modules; no JSON persistence is
  reachable from the replacement. These counts are not remaining migrations.
- Fresh pre-DDL encrypted checkpoint `c448a2ad-0171-4908-979e-44cdd14236be`
  (1015527 bytes) passed full isolated restore with 43 versions, original ACLs, the
  matching private PIN key, six Auth users, 27 sessions, one profile, zero Storage
  objects and 37 public tables with RLS. No DDL ran while this dump was running.
  Post-DDL read-only verification confirms the same inventory, six genuine verified
  Google accounts and zero operational residences, payments, preparations, recovery
  receipts, cleanup plans or registration bans. Cleanup RLS, invoker functions,
  denied direct browser/backend grants and both payment target FKs are verified.
- Post-DDL encrypted checkpoint `6302877a-dfc4-4aa6-9cce-818b28e4dfc8`
  (1025791 bytes) passed full isolated recovery with all 44 versions, original ACLs
  and the matching private PIN key. Its restored counts match live verification.
  Paired encrypted Storage archive `09ee896d-a85c-422f-be42-595c55b63c45`
  preserves the actual empty catalog and passed encrypted verification/local
  reconstruction with zero provider writes.
  These continuation checkpoints establish neither a project-wide stopped-writer
  freeze nor final reset consent or genuine provider reupload acceptance.
- Next: actual ordered residence execution, portal access revocation, registration
  cooldowns and durable Storage cleanup/recovery. Remaining account deletion/wipe
  routes, genuine provider/browser acceptance and reviewed final reset/default
  switch precede JSON removal. Default JSON persistence is intact.


## Residence payment retention — 2026-10-11

- Migration 43, `20261011151137_retained_residence_payment_references.sql`, preserves
  actual residence payment references privately, with SHA-256
  `aa830d282a96827b5dca413c103ef3f4f8c2e78d346fcadee7c601b77251ec2d`.
  Applied atomically after native rehearsal, a fresh full restore and target dry-run.
  All 43 local hashes match the native target ledger; none are pending. The opt-in
  server now requires migration 43. Default dev/build/start remain on JSON.
- Backfill copies only genuine saved residence/payment relationships and never
  rewrites receipts. New quotes capture the reference in the same transaction;
  exact retries, competing quotes and rollback preserve immutable target metadata.
  Historical owner/name fields cannot authorize access. The original operational
  residence foreign key remains, and deletion/cooldowns/portal revocation remain disabled.
- 46 native retention checks and actual encrypted full recovery passed using restored
  genuine Google identities and unchanged native Auth sessions. The immediate retention
  constraint works for first quotes; existing checkout constraints remain deferred.
  Existing payment regression checks passed (62), as did combined account/residence
  reviews and housing preparation (374). The actual residence recovery suite passed
  all 42 checks against the new schema (524 native checks total). No provider evidence
  or fresh sign-in was fabricated; actual provider-paid fulfillment and authenticated browser acceptance
  remain pending. Tests committed no cloud fixtures or charges.
- Official CLI security advisors: 14 before, 14 after, zero new findings; existing
  projection-view findings remain. Native SQL was rehearsed before CLI-generated
  migration creation using the documented Docker-shadow/native-ledger fallback.
  TypeScript, the Supabase production build and 252 public/denied HTTP assertions
  passed. The built migration-43 server starts and denies private artifacts. The route
  audit remains 129 implemented, 13 retired and 53 pending legacy endpoints across
  62 reachable modules, with no JSON persistence reachable from the replacement.
  These counts are not remaining migrations. Default JSON persistence is
  unchanged; this is a retention prerequisite, not the final cutover.
- Fresh pre-DDL checkpoint `051478bd-4bf8-49dd-8c67-789bbc56bbf1` (1008268 bytes)
  passed full isolated restore with 42 migrations, original ACLs and the private PIN
  key. The first backup attempt timed out without creating a checkpoint; after
  read-only connectivity/inventory checks, the single retry completed successfully.
  No DDL ran during either backup attempt. Live read-only verification after migration
  43: six genuine Auth users, 27 actual sessions, one profile, zero Storage objects,
  37 public tables with RLS; zero residences, payments, preparations, recovery receipts,
  retention references or registration bans. Invoker guards, both target FKs and no
  direct browser/backend reference grants are verified.
- Post-DDL checkpoint `57b4602c-71fc-4001-af37-467ecf7e73ce` (1015527 bytes)
  passed encryption/listing and full isolated recovery with all 43 versions, original
  ACLs and the private PIN key. Restored counts match live verification. Paired Storage
  archive `67c9789c-78a2-4dbf-9c5e-20fe98675f8f` preserves the actual empty catalog
  and passed encrypted verification/local reconstruction with zero provider writes.
  These continuation checkpoints do not establish a project-wide stopped-writer
  freeze, final reset consent or real-provider reupload acceptance.
- Next: ordered residence execution with freshly verified consent/backups, portal
  revocation, cooldowns, durable Storage cleanup and recovery. Remaining account
  deletion/wipe routes, provider/browser acceptance and the reviewed reset/default
  switch must complete before JSON removal.

## Verified residence recovery evidence — 2026-10-11

- Migration 42, `20261011144214_verified_residence_recovery_evidence.sql`, is applied
  atomically with SHA-256 `c5180871fe9e49991a245d497b02144726ac1f7d3051af6e8613831b9dbe9a9a`.
  All 42 immutable files match the native target ledger; none are pending. The opt-in
  server now requires migration 42. Default dev/build/start and JSON data are unchanged.
- A trusted private operator workflow creates/rehearses encrypted PostgreSQL and
  Storage backups, verifies the actual archived founder pause, and records immutable
  recovery evidence only while consent, scope and complete live media catalog match.
  PostgreSQL independently checks native consent/pause/catalog; filesystem recovery
  remains trusted operator responsibility. Evidence, admin-only status notice and
  operator audit commit together. The audit does not impersonate a founder session.
  An exact retry reconciles once; different evidence cannot replace a recorded receipt.
  No HTTP/RPC accepts client recovery claims and no browser/backend role can access
  private proof or helpers. Admin status displays only verification time.
- Housing/preparation writes now reject isolation above READ COMMITTED, closing the
  older-snapshot gap. Server transactions set supported isolation explicitly. A receipt
  is historical evidence, not permanent execution authority. Cancelled/new/changed
  pauses, older/cross-project archives, changed catalogs and tampered manifests fail.
  Deletion, portal revocation, registration cooldowns and Storage cleanup remain disabled.
- Forty-two native recovery checks passed with actual encrypted local pg_dumps/full
  restores, real restored Google identities/sessions and paired Storage archives.
  They cover rollback, concurrent/idempotent attachment, catalog changes, unverified
  proof rejection, wrong archive binding, private role denial, immutable history,
  reconnect persistence and cancellation. Combined account/residence checks passed
  374 assertions; administrator removal passed 104 and housing RLS/constraints 98
  (618 native checks total). No Auth subject/session/provider response was fabricated
  and no cloud operational data was changed by these tests. The positive CLI flow
  against a live founder-prepared proposal and genuine browser acceptance are pending;
  no live proposal/pause was manufactured for this verification.
- Official CLI 2.120.0 security advisors: 14 findings before, 14 after, zero new
  findings. Existing projection-view findings remain. SQL was rehearsed on a full
  native restore before the CLI generated the migration filename; the reviewed
  Docker-shadow limitation and immutable-ledger native fallback remain unchanged.
  TypeScript, both production builds, 252 public/denied API assertions and 20 Storage
  integrity tests passed. The source route audit remains 129 implemented, 13 retired and 53
  pending legacy endpoints across 62 reachable modules, with no JSON persistence
  reachable from the replacement entry point. These are not migration counts.
  Refactored reconstruction restored both the existing empty archive and the earlier real
  1,585,515-byte photograph archive locally, with zero provider writes.
- Fresh pre-DDL checkpoint `85376f5e-e3b1-4560-b26e-688d03f0132f` (998548 bytes)
  passed full isolated recovery with original privileges and the private PIN key before
  successful target dry-run/application. Live read-only verification: six Auth users,
  27 actual sessions, one profile, zero Storage objects, 37 public tables with RLS;
  zero residences, preparations, receipts or registration bans. New receipt RLS,
  no direct role grants, invoker guards and enforced isolation are verified. The
  built server starts against migration 42 and denies private artifacts. An absent
  proposal fails the real operator command with `residence_preparation_missing`
  before creating a journal/archive or modifying data.
- Post-DDL checkpoint `b67e0d6c-e582-497c-b214-b8671d40819d` (1008268 bytes)
  passed archive encryption/listing and full isolated restore with all 42 versions,
  original ACLs and the private PIN key. Its restored counts match live verification.
  Paired Storage archive `421e2b16-b3a1-4e50-b8d0-e86036e3b59c` preserves the actual
  empty catalog and passed encrypted verification/local reconstruction with zero
  cloud writes. These continuation backups do not claim a project-wide stopped-writer
  freeze and are not final-reset authorization.
- Next: freshly reverify archives/consent and implement ordered operational residence
  removal, retained financial references, portal revocation, cooldowns and recoverable
  Storage cleanup. Account deletion/wipes and remaining route work precede genuine
  authenticated browser/provider acceptance, reviewed reset/final backups, default
  backend switch and JSON removal. This migration performs none of those deletions.

## Durable residence preparation checkpoint — 2026-10-11

- Migration 41, `20261011135519_reviewed_residence_backup_preparation.sql`, is applied
  atomically with SHA-256 `a66e65414143a101b3da298a5c85b3dc4952c41e64c93d4720179822ed2cd3df`.
  All 41 immutable files match the native ledger; none are pending. The opt-in server
  requires migration 41. The default JSON backend and existing JSON data remain intact.
- The current founder's own approval key and explicit `FREEZE APPROVED HOSTEL`
  confirmation can start a durable reviewed housing pause after two distinct current
  consents. Two other voters require an additional founder vote in the same transaction;
  founder plus one independent voter still suffices. Old version-1 reviews are invalidated.
  Cancellation with the founder's own key and reason releases the pause even after
  consent closes and invalidates any still-open review. Active pauses stay first in
  the status list so cancellation does not disappear behind newer history.
- Native before/after guards cover 26 domain tables, old/new relationships, new linked
  records and deletion before foreign-key cascades. Truncate cannot bypass a pause or
  erase preparation history. Shared writer locks precede governance/context locks;
  preparation/cancellation takes the exclusive lock first. The supported domain writer
  transaction isolation is READ COMMITTED. Pauses survive reconnects, while unrelated
  marketplace activity remains writable. Pending residence payments, in-flight media,
  inconsistent staff ownership and overlapping/excess pauses fail closed.
- Same-transaction notices reach admins under Admin Approvals, saved primary owners
  and affected housing portals. They report actual pause/resume status, never deletion.
  The primary owner need not enter a sub-account to receive the notice. Native metadata
  helpers use a fixed empty search path, no callable browser/backend grants and no
  domain-authorization bypass. Paused writes return `409 residence_preparation_paused`.
- The final isolated native suite passed 374 combined checks (137 residence checks,
  including 63 preparation checks), using genuine restored Google subjects/sessions
  and no provider mocks or Auth fabrication. It verifies independent/founder quorum,
  own-key failures, request spoofing, rollback, competing prepares, an actual in-flight
  writer barrier, guard/cascade/truncate denial, cancellation after rejection, preserved
  unrelated activity, targeted notices and reconnect persistence. Administrator removal
  passed 104 checks; housing RLS/constraints passed 98. All tests used disposable native
  restores without importing JSON or changing cloud operational records. Genuine fresh
  provider sign-in and authenticated browser acceptance remain pending.
- Official CLI security advisors reported 14 findings before and 14 after, with zero
  new findings. Existing projection-view findings are unchanged; this is not a claim
  that the entire project is free of advisor findings. TypeScript, both production builds,
  252 public/denied HTTP assertions and built-server startup/public reads/private-artifact
  denial passed. The route audit still reports 129 implemented, 13 retired and 53 pending
  legacy endpoints across 62 reachable modules, with no reachable JSON persistence in
  the replacement entry point; these are route counts, not remaining migration counts.
- Fresh pre-DDL checkpoint `e7ce70d9-c03c-4657-b0c3-05a19d2f5739` (933764 bytes)
  passed full isolated recovery before the successful target dry run/application.
  Post-DDL checkpoint `08cfffdb-39ba-4d90-a5b9-0f225a8df00f` (998548 bytes) passed
  encryption/listing checks and a full local restore with all 41 versions, original ACLs
  and the private PIN key. Read-only target and restore agree: six Auth users, 27 sessions,
  one profile, zero Storage objects, 37 public tables with RLS. Native target inspection
  verifies 104 restrictive domain triggers, preparation RLS and zero direct role grants;
  no live preparation, residence review, residence or registration ban was created.
  Paired encrypted Storage archive `9623abe1-08ec-4823-b35c-9006a6326744` contains
  the actual empty catalog and passed checkpoint-bound verification and local
  reconstruction. Both recovery commands continue to report `writerFreezeVerified:false`;
  this continuation checkpoint is not a stopped-writer final-reset authorization.
- Next: connect verified database/Storage archives to the paused scope; recheck final
  consent; implement ordered operational removal, portal revocation, retained financial
  evidence, cooldowns and recoverable Storage cleanup. Account deletion/wipes and the
  remaining route audit also need completion before genuine browser/provider acceptance,
  the reviewed reset and final backup, default-backend switch and JSON removal.
  Migration 41 does not attach a backup or execute any deletion automatically.

## Encrypted Storage recovery checkpoint — 2026-10-11

- Added checkpoint-bound AES-256-GCM archives for actual uploaded bytes and the
  private complete catalog, including supported orphan objects from interrupted
  uploads. Commands restore the actual PostgreSQL checkpoint before comparing its
  catalog to the live project. Missing ready bytes, changed snapshots, foreign objects,
  unsafe paths, incomplete multipart uploads and corrupted archives block completion.
  No new schema, RLS grant, public RPC or default-backend change was required.
- Twenty filesystem/integrity tests passed using the actual PineVela cover image,
  including failed-transfer cleanup, cross-checkpoint/project/file swaps, missing files,
  symlinks, digest/size failures and bounded-catalog truncation. Ordinary image reads
  still require their saved digest. TypeScript and both production builds passed.
- Actual provider acceptance passed nine checks: upload/download of 1,585,515 bytes,
  full encrypted PostgreSQL backup/isolated restore with ACLs and the private PIN key,
  encrypted Storage backup, temporary local reconstruction, deletion of the test object,
  re-upload from the archive and verified real download. The test object's final
  Storage-API removal restored the baseline; verified Google identities, actual Auth
  users/sessions, profiles and contexts were unchanged. No provider response was mocked.
  Provider checkpoint `01b9917e-adc9-48ed-941c-89f0cc26712a` (934072 bytes) and
  Storage archive `2b4c7973-6c08-440e-b29b-924edada7908` preserve this evidence.
  That checkpoint contains the now-removed temporary object and is not a reset backup.
- Clean post-test database checkpoint `8a881ec2-254c-4224-b5c9-2d57ec310787`
  (933764 bytes) passed archive/decryption checks and full isolated restore, including
  the private delivery-PIN key and ACL boundaries. Read-only cloud verification and
  restore both show six Auth users, 27 actual sessions, one profile, zero Storage
  objects, 37 public tables with RLS and 40 unchanged immutable migrations; none are
  pending. The built Supabase server started, served public reads and denied private
  artifacts. The literal route audit remains 129 implemented, 13 retired and 53 pending
  endpoints across 62 reachable modules, with no JSON persistence reachable from the
  replacement entry point. The default entry point still uses JSON.
  Paired encrypted Storage archive `42c9f62d-ca6f-4c80-bf4a-6efd5495ca3f` contains
  the actual empty post-test catalog and passed round-trip and local reconstruction
  verification. It preserves
  the zero-object baseline without conflating it with the separate real-image proof.
- These commands report `writerFreezeVerified:false`; matching catalogs alone do not
  establish a stopped-writer checkpoint. Residence/account deletion and wipes remain
  disabled. Next is the reviewed scope freeze/execution/retry protocol, followed by
  genuine authenticated browser/provider journeys, the final reviewed reset and
  stopped-writer backups, default-backend switch and JSON removal.
  See [Storage recovery](storage-recovery.md) and [residence deletion](residence-deletion.md).

## Residence deletion review checkpoint — 2026-10-11

- Migration 40, `20261011102521_reviewed_residence_deletion_consent.sql`, adds saved
  dependency previews, keyed proposals, immutable votes, founder final rejection
  and administrator status notices. The opt-in backend requires migration 40.
  Default dev/build/start still use JSON; this is not the final cutover.
  All 40 immutable digests match, with no pending migration. Cloud inventory remains
  six Auth users, 27 sessions, one profile, zero Storage objects and 37 public tables,
  all with RLS; no observed lock waits. No live residence review was submitted or executed.
- At least two administrators with approval keys, including an available keyed
  founder, must be in the reviewed roster. The proposer counts once. Two independent
  votes approve a review; the founder must provide their own keyed final decision,
  even after two other administrators consent. Reviews expire after 24 hours.
  Roster/key revisions and relevant dependency changes invalidate consent, including
  reversed changes. Unrelated residence and no-op writes preserve it.
- Previews distinguish residence-only manager sign-in retention from combined portal
  removal/other assigned properties. Ambiguous/shared manager ownership or missing
  saved primary recipients blocks submission. Dependencies include housing history,
  staff/reviews, verification, maintenance, appointments, financial references, scoped
  enrollments and media metadata. Raw activation keys, enrollment challenges and
  private snapshot rows never reach the browser. New private lifecycle tables use RLS
  and no browser/backend grants. The internal metadata trigger has a fixed empty search
  path and no exposed execution grant; outer writes retain their authorization.
- All native residence checks passed: 74 new assertions within 311 combined account/
  residence assertions, plus 104 administrator-removal and 98 housing/RLS regressions.
  Restored genuine verified Google subjects and unchanged actual Auth sessions were
  used, with no fabricated provider responses, JWTs, sign-in timestamps or Auth users.
  Review actions change no live residences, portals, cooldowns or Storage objects.
- Official CLI 2.120.0 security advisors: 14 baseline findings, 14 after, zero new
  findings. Existing projection-view findings remain; hosted Auth-config advisors and
  genuine browser/provider acceptance are outside this isolated SQL check.
  CLI `migration new` created the file; the existing Docker-shadow limitation uses
  the verified native restore/rehearsal plus immutable target ledger fallback.
- Pre-DDL checkpoint `450ef8d0-a9eb-456e-9f90-61c7d540c8c0` (888266 bytes) includes
  full ACLs and the encrypted private delivery-PIN key. Listing, decrypt round-trip and
  full isolated restore passed: six Auth users, 27 sessions, one profile, zero Storage
  objects, 37 public tables with RLS, 39 immutable versions, protected guest/profile
  and browser/context boundaries, no backend BYPASSRLS and no PIN-key mismatch.
  The target DDL rehearsal rolled back successfully before the schema-only commit.
  TypeScript and both production builds passed. The final built Supabase server
  started, served public reads and denied private artifacts. All 248 public/denied
  HTTP assertions passed, including missing-session and cross-origin denials for
  the five new residence-review routes. Genuine authenticated
  browser journeys remain unverified; native service/RLS assertions do not prove them.
  Live read-only verification found zero residence reviews, residences, registration
  cooldowns, applied account policies and residence lifecycle events; both new private
  tables have RLS, browser preview-helper execution and backend lifecycle UPDATE are denied.
  Post-DDL encrypted checkpoint `840ef395-3eda-4f1f-b1f4-f13e2045730d` (933764 bytes)
  passed listing, decrypt round-trip and full isolated restore, including all 40 versions,
  ACLs and the private delivery-PIN key. It is a continuation checkpoint, not the final
  stopped-writer cutover backup; Storage-byte recovery remains a separate gate.
- **Residence execution, account deletion and wipes remain disabled.** Approval does
  not delete records or impose cooldowns. The execution protocol requires fresh previews/
  consent, exact scope freeze, backup/Storage-byte recovery, reference retention,
  portal revocation, registration-reader scope checks, actual owner notices and
  recoverable Storage-API cleanup. See [residence deletion](residence-deletion.md).
  Then finish genuine authenticated browser/provider acceptance, reviewed final reset,
  stopped-writer backups, default backend switch and JSON removal.

Updated 2026-10-11. The target project uses the configured, certificate-verified Session
pooler connection. No disposable account or linked JSON record has been imported.
No local or Supabase account has been deleted. The default running backend remains
`server.ts`; do not switch the start command until the workflow gates below pass.

## Account policy enforcement checkpoint — 2026-10-11

- Migration 39, `20261011094816_approved_account_access_policies.sql`, is applied.
  All 39 immutable digests match; none are pending. The opt-in backend requires
  migration 39. Default dev/build/start still use JSON. No operational account was
  banned, restricted, restored, deleted or imported: live policy/epoch/execution
  counts remain zero, with six Auth users, 27 sessions, one primary profile,
  zero Storage objects and 37 public tables, all with RLS.
- Five distinct current own-key approvals and the founder's explicitly confirmed
  final decision can apply timed bans, the six supported feature restrictions,
  or restoration. SQL stamps execution time/identity and derives exact saved policy
  values. Execution, scoped consent invalidation, affected-portal/primary-owner
  notices and audit are atomic; failed or concurrent replay does not partly apply.
- Auth binding, account switching, API transactions and native RLS enforce actual
  provider-session epochs and saved inheritance. Root policies follow linked portals
  and manager/staff assignments, excluding administrators. Shared-email sibling
  portals retain independent own policies. Expiry/restoration cannot revive an old
  session or override an inherited policy; no native Auth record/timestamp was changed.
  Banned sellers disappear from eligible catalog views and cannot receive new orders.
- Native write guards cover enrollment, allocations, staff creation, new orders,
  publishing/media, buyer-seller messages and maintenance creation. Existing order
  fulfillment remains possible under feature restrictions; only the existing verified
  completion trigger can perform its exact stock decrement under a publishing limit.
  Direct stock editing gains no bypass. Sign-in projection and the authenticated
  account-access endpoint supply the existing live restriction notice. The founder
  panel provides final confirmation and displays actual execution time.
- Isolated genuine-Auth checks passed 236 policy/review assertions, 98 housing/RLS
  assertions and 104 administrator-removal regressions, plus five request-feature
  contract tests. These use actual restored Google subjects/native sessions, isolated
  domain/evidence fixtures and actual zero-fee receipts; provider success, Auth users,
  Auth timestamps and fresh sign-in were never fabricated. The actual post-policy
  provider/browser sign-in and elapsed expiry journeys remain acceptance gates.
- Official CLI 2.120.0 security advisors found no new findings against the isolated
  migration-38 baseline; its 14 existing projection-view findings remain. Hosted Auth
  configuration advisors are outside this local comparison. CLI `migration new`
  generated the file. Docker shadow access remains unavailable; the native restored
  schema rehearsal and immutable ledger provide the documented fallback. The first
  target rehearsal hit a lock timeout while pg_dump ran and rolled back; after backup
  completion the target rehearsal passed before committed application.
- Fresh encrypted pre-DDL checkpoint `b3c86508-967d-4faa-8117-e39623c88d0e`
  (838583 bytes) passed a full migration-38 restore. Post-DDL checkpoint
  `628e281d-d31a-4aa2-8151-1e22559d0cc7` (888266 bytes) passed a full migration-39
  restore, including ACLs and the unchanged private delivery PIN key. Guest profiles
  and browser context promotion stayed denied; guest catalog remained readable and
  backend BYPASSRLS stayed false. These are checkpoints, not stopped-writer cutover backups.
- TypeScript, both production builds, final built-server privacy checks, 238 public/denied
  HTTP checks and whitespace checks passed. Literal inventory is 129 implemented, 13 retired and 53 pending
  endpoints across 61 reachable replacement modules, with no JSON persistence reachable
  from the opt-in backend. Endpoint totals are not a remaining-migration count.
- **Account/residence deletion and wipes remain disabled.** Next: review dependencies,
  consent, registration cooldowns and backup/Storage cleanup for those workflows.
  Genuine signed-in browser/provider acceptance, the reviewed final reset, stopped-writer
  backups, default-backend switch and JSON removal remain cutover gates.

## Scoped account review checkpoint — 2026-10-11

- Migration 38, `20261011090324_scoped_account_review_lifecycle.sql`, is applied.
  All 38 immutable digests match and nothing is pending. The opt-in server requires
  migration 38. Default dev/build/start still use JSON. No operational account was
  imported, banned, restricted, deleted or restored; no live message/payment was sent.
- Reviews now snapshot saved descendants and ancestors, excluding administrator
  contexts. An append-only private lifecycle log records actual changed context and
  parent-branch UUIDs. Unrelated signup/portal changes no longer invalidate consent.
  Shared-identity resident/seller portals remain independent. Relevant relationship,
  manager/staff, roster/key and allocation changes invalidate prior consent, including
  changes subsequently reversed. Pre-38 reviews require fresh consent; the existing
  transactional status handler closes them with administrator notices.
- Only the internal supported-domain lifecycle trigger uses definer privileges to
  resolve saved cross-context links. It has a fixed empty search path and no public,
  browser or backend EXECUTE grant. Outer writes retain their original authorization.
  Review helpers remain invoker functions; arbitrary revision/event mutation is denied.
  The backend's former revision UPDATE grant is revoked. The administrator context
  guard now returns OLD for non-admin deletion instead of silently skipping it;
  protected administrator removal retains its separate protocol and consent checks.
- Final isolated checks passed 141 account-review assertions, 98 relationship/RLS
  assertions and 104 administrator-removal regressions. Genuine restored Google subjects
  and actual unchanged Auth sessions were used. No Auth subject, JWT, provider reply
  or Auth-session freshness was fabricated. No cloud operational records changed.
- Official CLI 2.120.0 security advisors ran on the isolated restored schema, with
  zero new security findings against its pre-DDL baseline. Existing projection-view
  findings and private no-policy INFO remain; hosted Auth-configuration advisors are
  outside this local run. The CLI archive checksum was verified. CLI `migration new`
  created the file; schema pull could not provision its Docker shadow because daemon
  access was denied. The project's native PostgreSQL rehearsal and immutable ledger
  were used, with a successful rolled-back target rehearsal before application.
- Committed inventory: 38 migrations, six Auth users, 27 sessions, one primary profile,
  zero Storage objects and 37 public tables, all with RLS; no observed lock waits.
  Pre-DDL encrypted checkpoint `b1d2121c-d717-4460-98ac-204ae5bba1df` (831456 bytes)
  passed full isolated restore at migration 37. Post-DDL encrypted checkpoint
  `38faea17-b0b7-405d-8b9f-cba96f996dd2` (838583 bytes) passed full isolated restore
  at migration 38, preserving original ACLs and the private delivery PIN key. Guest
  profiles and browser context promotion stayed denied; guest catalog remained readable
  and backend BYPASSRLS remained false. Temporary decrypted clusters were removed.
  These are checkpoints, not final stopped-writer cutover backups.
- The built replacement starts against migration 38 and passes public reads and
  private-artifact denials. Public/denied HTTP checks passed 235; TypeScript, build,
  private-data and whitespace checks passed. These do not replace genuine signed-in
  provider/browser acceptance. The three requested UI/security fixes are also verified:
  subscription testing copy removed; Manager Profile Settings is a dashboard page
  reachable from mobile and both desktop navigation modes; officer aliases use the
  main login, reject admin portals and return there on logout. Focused browser checks,
  full theme/browser checks, credential/session API regressions and production builds
  passed. Existing large frontend chunk warnings remain.
- Literal inventory remains 128 implemented, 13 retired and 54 pending endpoints
  across 60 reachable replacement modules; JSON persistence is not reachable from
  the opt-in backend. These counts do not count remaining migrations or prove complete
  workflows. **Account policy application and deletion remain disabled.** Next: enforce
  approved timed bans/restrictions/restoration across Auth, API, RLS, saved inheritance
  and market visibility; then complete reviewed account/residence deletion and wipe
  workflows. Genuine signed-in browser acceptance, reviewed final reset, stopped-writer
  backup, default-backend switch and JSON removal remain cutover gates.

## Account approval review checkpoint — 2026-10-10

- Migration 37, `20261010221033_account_action_reviews.sql`, is applied. All 37
  immutable digests match; none are pending. The opt-in server requires migration 37.
  Default dev/build/start still use JSON. No operational account was imported,
  banned, restricted, deleted or restored; no live message or payment was sent.
- The actual account directory and governance status now expose saved primary/portal
  relationships and account review history. Email does not establish links. Timed
  ban, feature-restriction and restoration proposals require the caller's own current
  separate approval key; administrator targets use their membership protocol.
- All five active keyed administrators, including the founder, must approve. The
  proposer counts once, duplicate/concurrent votes count once and an independent
  rejection closes the review. Only the keyed founder can record final rejection
  after five approvals. SQL protects immutable evidence/votes and stamps the 24-hour
  lifetime and final identity/time. A changed roster/key or monotonic lifecycle
  revision invalidates consent, including changes subsequently reversed.
- Lifecycle invalidation is currently conservative: any context, parent-link,
  staff/manager-assignment or allocation change closes old consent, even in another
  branch. Profile appearance edits do not advance it. Refining this to relevant
  target/lineage changes belongs with the remaining policy execution work.
- Proposal, vote, closure and founder final-rejection notices belong to the reviewed
  active admin portals and the Approvals notification module. Audit/notice/vote
  changes are atomic. The Supabase UI remounts per account/target, ignores late
  responses, disables duplicate submissions and clears approval keys after requests.
  **Application and deletion remain disabled**, including SQL execution transitions;
  reviews impose no access policy or Auth revocation and send no action-applied notice
  to users. Auth/API/RLS/inheritance/catalog enforcement and destructive recovery
  lifecycle remain required before those capabilities are enabled.
- Isolated checks passed 121 account-review assertions, 98 relationship/RLS checks
  and 104 administrator-removal regressions. Five genuine restored Google subjects
  and actual unchanged sessions were used; no Auth subject/JWT/provider reply or
  Auth-session freshness was fabricated. Tests changed no cloud account records.
  Real signed-in HTTP/browser acceptance and elapsed 24-hour expiry remain gates.
- Public/denied HTTP checks passed 235, including the directory and all three
  account-review commands with unauthorized/cross-site denial. These do not replace
  actual provider-authenticated HTTP/browser acceptance. TypeScript and frontend/backend
  production builds passed. Built-server public reads and private-file denials passed.
  Private-data and whitespace checks passed. The existing large frontend chunk warning
  remains. Security advisors retain the same five categories: private no-policy
  INFO, existing projection-view ERROR, anon/authenticated auto-RLS helper WARNs and
  disabled leaked-password protection WARN. New review helpers are invoker functions,
  with public/browser/backend execution revoked. The revision's guarded backend
  column grant exists for lifecycle triggers; direct revision writes are denied.
  Existing remediation links are in the migration-36 checkpoint below; this is not
  a clean-advisor or full security audit claim.
- Committed aggregate inventory: 37 migrations, six Auth users, 25 sessions, one
  primary profile, zero Storage objects and 37 public tables, all with RLS; no waits.
  Fresh encrypted pre-DDL checkpoint `9458aa13-f93e-410d-805f-26031f0dbad7`
  (805343 bytes) passed a full isolated restore with 36 migrations and the same counts,
  original ACLs/private delivery PIN key. Guest profiles/browser promotion remained
  denied, guest catalog remained readable and backend BYPASSRLS remained false.
  Committed encrypted checkpoint `56d279ae-9d7f-471e-8673-31d4ea6f1fbc`
  (831239 bytes) passed full isolated restore with 37 migrations and the same counts,
  original ACLs/private delivery PIN key and the same guest/promotion/BYPASSRLS
  boundaries. Temporary decrypted clusters were removed. These are checkpoints,
  not the final stopped-writer cutover backup. Permanent Storage-byte backup remains
  required once permanent objects exist.
- Literal inventory records 128 implemented, 13 retired and 54 pending endpoints
  across 60 reachable replacement modules, with no JSON persistence reachable from
  the opt-in backend. Mounted/templated aliases are excluded; these counts are not
  remaining migrations or fully verified workflows. Next: complete account policy
  execution, reviewed residence/account deletion and wipe workflows. Preserve JSON
  until all implementation, acceptance and reviewed reset/cutover gates pass.

## Administrator message gateway checkpoint — 2026-10-10

- Migration 36, `20261010214210_administrator_message_gateway.sql`, is applied.
  All 36 immutable digests match and nothing is pending. The opt-in server requires
  migration 36. Default dev/build/start still use JSON. No live announcement, account
  import, reset, deletion, administrator membership or credential change occurred.
- Directory, preview and send now use verified active administrator sessions and
  current membership. Recipient groups are primary users, managers, residents,
  marketers/sellers and staff, with 1–2000 actual active contexts. Pending/rejected/
  suspended/closed portals and unsupported roles are excluded. Parent/shared-identity
  relationships do not merge portal recipients. Client sender/owner aliases are rejected.
- Private sender-bound previews expire after 15 minutes and store the normalized
  selection plus immutable actual recipient snapshot/counts. Send re-resolves and locks
  current recipients. A changed selection needs fresh review; the same completed token
  returns its original receipt only for identical content, including concurrent retries.
  Notification, recipients, completion and private audit commit atomically. Invoker SQL
  guards protect the sender, snapshots, message bodies and exact completed fanout.
- Gateway message severity persists. Selected recipients receive one popup and inbox
  notice; seller market filtering includes received admin announcements. Dismissal is
  idempotent and leaves the notification/read state intact. Stale context headers fail;
  frontend account changes remount state and ignore late responses. Supabase uncertain
  send failures retain their retry token; legacy failure handling remains unchanged.
- Final isolated checks passed 110 gateway assertions, 98 relationship/RLS assertions
  and 104 reviewed administrator-removal regressions. They used five genuine Google
  identities and their actual sessions restored locally, with domain-only fixtures.
  No provider reply, JWT, Auth identity or Auth-session timestamp was fabricated.
  The gateway suite fingerprint-checked genuine Auth records unchanged. Actual provider
  HTTP/browser gateway acceptance remains a gate; tests sent no live announcements.
- Committed inventory is 36 migrations, six Auth users, 25 sessions, one primary
  profile, zero Storage objects and 37 public tables, all with RLS. The fresh encrypted
  pre-DDL checkpoint `b2188a2c-d7e6-4549-8386-c3eb164c6560` (793052 bytes) passed
  full isolated restore with 35 migrations and these same account counts, original ACLs
  and the private delivery PIN key. Guest profile access/browser promotion remained
  denied, guest catalog remained available and the backend had no BYPASSRLS.
  Committed encrypted checkpoint `c5d828b8-f3c3-4c90-b697-73b2bcc11e16`
  (805343 bytes) passed full isolated restore with 36 migrations, these same counts,
  original ACLs/private PIN key and the same guest/promotion/BYPASSRLS denials.
  Temporary decrypted pages and clusters were removed. These are checkpoints, not
  the final stopped-writer cutover backup; permanent object-byte backup remains a gate
  when Storage objects exist.
- Public/denied HTTP checks passed 228, including all three gateway routes and popup
  acknowledgement authentication/cross-site denial. Final frontend/backend production
  builds, TypeScript, built-server public/private-file checks, private-data and whitespace
  checks passed. The existing large frontend chunk warning remains.
- Security advisors retain the same five reported categories. The new private delivery
  table intentionally has no browser policy or grants; its trigger helpers are invoker
  functions with no browser execution. Existing filtered projection-view/auto-RLS-helper
  findings and disabled leaked-password protection remain documented remediation work,
  not a clean-advisor/full-audit claim. See [view guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
  [anon helper guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [authenticated helper guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
  and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Literal source inventory records 127 implemented, 13 retired and 55 pending
  endpoints across 58 reachable replacement modules with no JSON persistence. Mounted
  routers/templated aliases are excluded. These counts are not remaining migrations
  or fully verified workflows. Six broad cutover gate areas remain; next implementation
  is account moderation and reviewed residence deletion, followed by wipe workflows.
  Preserve JSON until the remaining implementation and acceptance gates pass.

## Previous owned profile/avatar checkpoint — 2026-10-10

- Migration 35, `20261010211348_owned_profile_avatars.sql`, is applied. All 35
  digests match and nothing is pending. The opt-in backend requires migration 35;
  default dev/build/start still use JSON. No actual profile, account, membership or
  credential was imported, reset or changed during verification.
- Owned profile POST/PUT now save display name, contact phone and supported PineVela
  presets or ready identity-owned avatar references. Credential email changes,
  client ownership/role fields, conflicting aliases, inline pixels, external URLs
  and cross-identity/purpose references are rejected. A restrictive asset FK and
  exact path pairing independently enforce the saved image relationship.
- Profile uploads use the existing private Storage bucket, reservations, quotas,
  bounded JPEG/PNG/WebP decoder and integrity checks. Avatar input is limited to
  5MB and re-encoded as PNG up to 512px. Administrator upload/profile writes require
  the current settings-key grant; shared primary access cannot bypass it. Stale
  account-context headers fail, and editors ignore late account-change responses.
- Same-email portals using one verified Auth identity share that identity's picture.
  Separately verified linked identities do not inherit their parent's picture or
  private media. Personal avatars never become public catalog images. Only a current
  active staff portrait is available through the existing authorized housing directory
  relationship; ending employment removes this related access. General administrator
  media access does not expose unrelated personal portraits.
- Referenced avatars cannot be retired/deleted before profile detachment. Operational
  deletion/reset must detach references and delete bytes through Storage APIs; replacing
  a picture does not automatically delete old ready objects. Reviewed cleanup and a
  permanent object-byte backup/restore remain cutover work when permanent objects exist.
- Final isolated tests passed 107 profile/avatar assertions, including a real image
  upload/download/integrity/public-denial/delete round trip against private Supabase
  Storage, identity sharing/isolation, admin-key/primary-bypass denial, raw SQL/RLS,
  active staff portrait removal and restart persistence. No Auth subject, provider
  response, JWT or session timestamp was fabricated. Genuine Auth records were
  fingerprint-checked unchanged; every temporary Storage object was removed.
- Relationship/RLS checks passed 98 and reviewed administrator-removal regression
  checks passed 104 in isolated restores with migration 35. Public/denied HTTP checks
  passed 221; actual provider-authenticated profile HTTP/browser acceptance remains
  a gate. TypeScript, frontend/backend production builds, private-data, whitespace
  and built-server public/private-file checks passed. The existing frontend chunk
  warning remains.
- Committed inventory is 35 migrations, six Auth users, 25 existing Auth sessions, one
  primary profile, zero Storage objects and 37 public tables, all with RLS. An actual
  provider login added a session since migration 34; migration tests did not create it.
- Fresh pre-DDL encrypted checkpoint `107bd536-9c93-4ddb-b453-94d590ff64b0`
  (781222 bytes) passed full isolated restore with 34 migrations and these same account
  counts, original ACLs and private delivery PIN key. Committed checkpoint
  `98f23a8d-f370-4a35-b2f4-329684ec6593` (793052 bytes) is encrypted with ACLs and
  the private delivery PIN key included. Full isolated restore passed with 35 migrations,
  six Auth users, 25 sessions, one profile, zero Storage objects/PINs and 37 public
  RLS tables. Original ACLs and private PIN key passed; guest profile access and browser
  promotion stayed denied, and the backend had no BYPASSRLS. Temporary decrypted
  pages/cluster were removed.
  These are checkpoints, not the final stopped-writer cutover backup.
- Security advisors retain the same five reported categories: intentionally policy-free
  private tables, filtered owner projection views, project-managed auto-RLS helper
  execution for anon/authenticated, and disabled Auth leaked-password protection.
  New private avatar helpers return narrow owner/context authorization booleans and
  do not add public function execution. This is not a clean-advisor/full-audit claim;
  the earlier remediation links still apply.
- Source inventory now records 124 implemented, 13 retired and 58 pending literal
  endpoints across 57 reachable replacement modules with no JSON persistence.
  Mounted routers/templated aliases are excluded. These counts measure neither
  remaining migrations nor complete verified product workflows.
- Six cutover gate areas remain: account access/recovery, housing lifecycle, actual
  payments/refund resolution, remaining admin/profile tools, provider/browser/backup
  acceptance, and the final reviewed reset/founder setup/runtime switch. The exact
  remaining migration count is not fixed. Next implementation: the administrator
  message gateway, followed by moderation/deletion/wipe workflows. Preserve JSON
  until the replacement passes all gates.

## Previous reviewed administrator removal checkpoint — 2026-10-10

- Migration 34, `20261010205649_reviewed_administrator_removal.sql`, is applied.
  All 34 migration digests match; nothing is pending. The opt-in backend requires
  migration 34. Default dev/build/start still use JSON. No live account, administrator
  membership or credential was imported, provisioned or removed during verification.
- Only the active founder's current approval key can propose removal. Exactly four
  distinct other eligible administrators, including the founder and excluding the
  target, must approve within 24 hours. Rejection closes the review. The fourth approval
  opens a fresh 24-hour private appeal window. Only the target can submit an appeal;
  its text and decision reason are projected only to that target and the founder.
- Submitted appeals always require a keyed founder decision. Acceptance revokes removal
  authority while preserving immutable votes. Rejection, or expiry without an appeal,
  still needs a separate founder key check and exact `REMOVE ADMINISTRATOR` confirmation.
  Roster/key changes invalidate unfinished reviews, including later reversals. SQL
  independently guards snapshots, votes, appeals, timestamps, quorum and execution.
- Final execution atomically closes the admin context, marks its membership removed,
  deletes private credentials and saves audit/status notices. Auth and primary access
  remain intact. The affected primary inbox receives the identified final notice before
  sub-account entry. Tombstones preserve foreign-key history and release only the live
  numbered slot; a different invited identity can use it. Removed portals cannot be
  restored through suspension controls. Administrator transactions take the settings
  lock before actor row locks to avoid a concurrent-target context-closure deadlock.
- The UI provides a reviewed removal proposal, four-vote progress, private appeal/decision
  controls and exact final confirmation. Account changes reset removal popup state.
  Revoked approvals are displayed as history. Actual provider-authenticated removal
  HTTP/UI and the elapsed 24-hour no-appeal path remain acceptance gates.
- Final isolated genuine-Google tests passed 104 removal assertions, 77 suspension,
  117 key recovery, 89 invitations, 101 pricing and 193 settings/contact/maintenance.
  Coverage includes role/key/purpose/owner denial, immutable history, appeal privacy,
  exact recipients, concurrency, rollback, slot reuse, old-session denial, primary access
  and restart persistence. No Auth identity, provider response, JWT or session timestamp
  was fabricated. Genuine Auth rows are fingerprint-checked unchanged in removal tests.
- The fresh-start relationship/RLS suite passed 98 checks in an isolated restore.
  The live project now has a genuine primary profile, so that suite's empty-database
  cloud guard deliberately rejects it. The new optional checkpoint arguments restore
  latest real Auth data with the immutable migration-27 application schema locally,
  preserving archived schema ACLs and the owned-object Storage policy before applying
  all migrations. No cloud profile was removed to make the tests pass.
- Public and denied HTTP checks passed 213 cases, including authentication and cross-site
  rejection for all four new appeal/final-confirmation routes. TypeScript, production
  frontend/backend builds, private-data and whitespace checks passed. Built-server public
  reads and private-artifact denial passed. These checks do not replace authenticated
  provider/browser acceptance. The existing large frontend chunk warning remains.
- Committed inventory is 34 migrations, six Auth users, 24 genuine sessions, one primary
  profile, zero Storage objects and 37 public tables, all with RLS. A real provider login
  added a session since the earlier 23-session backup; migration tests did not create it.
- Committed encrypted checkpoint `4e536bcf-941c-4955-87bf-1e69ed88318a` (781067 bytes)
  passed full isolated restore: 34 migrations, six Auth users, 24 sessions, one genuine
  primary profile, zero Storage objects/PINs and 37 public RLS tables. Original ACLs and
  the private delivery PIN key passed. Guest profile access and browser promotion stayed
  denied; the backend had no BYPASSRLS. Temporary decrypted pages/cluster were removed.
  The earlier pre-DDL signup checkpoint `13060815-87f7-42d0-80d6-191c7902d441` remains
  intact. These are checkpoints, not the final stopped-writer cutover backup.
- Security advisors show 17 intentionally policy-free private tables (including private
  appeals), the same 14 filtered owner projection views, project-managed auto-RLS helper
  browser execution and disabled Auth leaked-password protection. No browser/backend
  appeal grant was added. This is not a clean-advisor/full security-audit claim; earlier
  remediation links still apply.
- Source inventory remains 122 implemented, 13 retired and 60 pending literal endpoints,
  now across 56 reachable replacement modules with no JSON persistence. Templated
  governance paths and mounted routers are excluded; these counts do not measure
  remaining migrations or complete product workflows.
- Next: owned profile/avatar changes, admin message gateway, moderation, residence
  deletion/wipe ports; real provider/browser/Storage acceptance; final verified-Google
  retention/dependency review, stopped-writer backups, founder setup and cutover.
  Preserve JSON until the replacement passes those gates.

## Previous verified Google signup and backup checkpoint — 2026-10-10

- The user added a genuine Google signup. Read-only eligibility checks now find five
  non-anonymous, email-confirmed Auth identities with matching Google identity emails,
  provider `email_verified=true` and non-expired sessions. Six Auth users exist in total;
  the remaining identity does not qualify. These are identity prerequisites, not five
  enrolled administrator memberships. Public signup grants no administrator access.
- Current inventory is 33 migrations, six Auth users, 23 sessions, one primary profile,
  zero Storage objects and 37 public tables, all with RLS. The new profile was created
  by the actual signup, not imported or seeded by migration verification.
- Fresh encrypted checkpoint `13060815-87f7-42d0-80d6-191c7902d441` (753162 bytes)
  passed full isolated local restore with those counts, original ACLs and the private
  delivery PIN key. Guest profile access and browser context promotion remained denied;
  the backend did not bypass RLS. Temporary decrypted pages/cluster were removed.
  This remains a checkpoint, not the final stopped-writer cutover backup.
- Existing suspension regression checks passed 77 assertions using the immutable
  migration-27 checkpoint. That older archive has four qualifying Google subjects;
  it does not prove a five-person removal flow. The fresh checkpoint supplies the fifth
  genuine subject for the forthcoming removal rehearsal. No Auth identity/session time,
  provider response or JWT was fabricated. No production membership or key was created.
- Permanent removal still needs its four-vote/private-appeal/founder-confirmation port
  and verification. Preserve JSON and default persistence until all cutover gates pass.

## Previous verified administrator suspension checkpoint — 2026-10-10

- Migration 33, `20261010104743_administrator_membership_status.sql`, is applied.
  All 33 migration digests match and nothing is pending. The opt-in backend requires
  migration 33; default dev/build/start still use JSON. No production identity,
  profile, membership or credential was imported, suspended, restored or deleted.
- Only the active founder's current separate approval key authorizes suspension or
  restoration. The server repeats session/role/key checks after the shared settings
  lock. SQL independently guards membership status, immutable ownership/slots and
  server-stamped lifecycle metadata. The founder cannot be suspended or removed.
  Generic administrator context status, ownership and deletion bypasses are denied;
  permanent removal remains unavailable pending its four-vote/appeal command port.
- Each transition advances a membership session epoch. Server binding, direct RLS,
  refresh and account switching deny older administrator sessions after restoration.
  A new provider sign-in is required. Separate keys, Auth identities and governance
  history are preserved. Existing roster-revision triggers invalidate stale recovery
  and pricing consent, including status reversals.
- Audit and one identified-target status notice commit with each transition. Recipients
  are the active roster, affected admin and its active primary account. The primary
  inbox receives its own suspension/restoration notices without inheriting pricing
  or other administrators' private reviews. The founder UI provides explicit confirm
  and cancel controls; approval input clears after success.
- Isolated genuine-Google-subject checks passed 77 suspension assertions, 117 key
  recovery regressions, 89 invitations, 193 settings/contact/maintenance and 101 pricing.
  Coverage includes wrong role/key/purpose, owner spoofing, SQL/ACL denial, immutable
  founder identity, rollback, concurrent suspension, stale consent, direct RLS,
  restored-session denial, account switching and restart persistence. All Auth session
  timestamps are unchanged. Actual fresh restored Google/email sign-in and authenticated
  UI acceptance remain gates; these tests did not fabricate sessions/provider responses.
- Rollback-only cloud rehearsal and committed-schema checks each passed 98
  relationship/RLS assertions. Public/denied HTTP passed 205 including authentication
  and cross-site rejection for the suspension endpoint. Seller review
  regressions passed 55 using real Auth-session revocation instead of illegal founder
  removal, and rolled back every record. TypeScript, frontend/backend builds, private
  data and whitespace checks passed; built-server public/private-file smoke passed.
- Committed inventory is 33 migrations, five Auth identities, 21 sessions, zero
  profiles/Storage objects and 37 public tables, all with RLS. No fixture committed.
- The encrypted pre-change checkpoint `53ed4333-03f1-4ec7-ad74-1949e0cdb0b1`
  (744409 bytes) was fully restored locally: 32 migrations, five Auth users, 21 sessions,
  zero profiles/Storage objects/order PINs and 37 public tables with RLS. Original ACLs,
  the private PIN key, denied guest/private access and non-bypassing backend were verified.
  Temporary decrypted pages/cluster were removed. This is not a stopped-writer cutover backup.
- The committed encrypted checkpoint `5fc0901d-989e-4279-bf97-0ffbb6bf99f5`
  (752096 bytes) passed full isolated restore of all 33 migrations with the same
  five Auth identities, 21 sessions, zero profiles/Storage/PINs and 37 RLS tables.
  Original ACLs and private PIN key passed; guest private access and browser promotion
  remained denied and the backend did not bypass RLS. Decrypted pages/cluster were
  removed. Both archives are checkpoints, not the final stopped-writer cutover backup.
- Security advisor counts remain unchanged: 16 intentionally policy-free private tables,
  14 filtered owner projection views, project-managed auto-RLS helper browser execution
  and Auth leaked-password protection disabled. Prior remediation links below still apply;
  this is not a clean-advisor/full security-audit claim.
- Source inventory remains 122 implemented, 13 retired and 60 pending literal endpoints
  across 55 reachable replacement modules, with no JSON persistence in that graph.
  Templated legacy governance paths and mounted routers are excluded; these numbers
  do not count remaining migrations or complete product workflows.
- Next: permanent administrator removal with four independent approvals, private appeal
  and founder final confirmation; remaining profile/avatar, message gateway, moderation,
  residence deletion/wipe ports; real provider/browser/Storage acceptance and final
  retention/dependency review, stopped-writer backup, cutover and JSON removal.

## Previous administrator invitations checkpoint — 2026-10-10

- Migration 32, `20261010101652_verified_administrator_invitations.sql`, is committed.
  All 32 digests match; no migration is pending. The opt-in backend requires migration
  32. Default dev/build/start still use JSON. No account, invitation or membership has
  been provisioned/imported/reset/deleted in production during this phase.
- Only active administrator #1 with their current separate approval key can create or
  cancel an invitation. A private token is shown once and stored only as a SHA-256 digest.
  SQL stamps exactly 24 hours and protects immutable mailbox, reviewed name, reserved
  slot, issuer credential version, existing Auth UUID binding and terminal history.
  Slots 2–5 plus existing memberships cannot exceed five. Ambiguous Auth mailboxes and
  identities with an existing non-primary portal are rejected.
- Acceptance requires the actual Google/email-verified primary session, matching mailbox,
  token, saved UUID when known, live issuer key/version and still-reserved slot. It is
  authenticated, never a public account/password creator. SQL independently guards the
  membership grant. Acceptance, empty private credential records, history, audit and exact
  active-administrator notifications commit together. Separate keys require fresh enrollment.
- Cancellation releases a slot. Issuer key/status changes immediately close outstanding
  grants; later reversals cannot revive them. Expired reservations are closed when status
  or creation runs. Concurrent acceptance creates one member; late failures roll back
  membership, credential rows, consumed state, notices and audit. Browser/backend roles
  cannot read invitation grants or invoke private protocol functions.
- The founder UI shows active reservations before recent history and offers a private
  copyable link shown once. Recipient screens use actual verified login/signup; the
  invitation continues through Google PKCE or verified-email login in URL/server state,
  never browser storage. Foreign origins, added parameters and malformed tokens are
  rejected. The token is removed from the route after acceptance. Account changes reset
  component state and late old-account responses are ignored. Links are manually shared;
  no automatic invitation email was sent. Real authenticated invitation UI remains a gate.
- The Supabase Google callback now derives the administrator dashboard destination from
  its verified bound role, while preserving an explicit valid invitation/catalog return
  path. The legacy completion continues returning its usual string token. This is a
  navigation correction, not a client-supplied role grant. Actual provider callback and
  fresh administrator key-enrollment journeys still need acceptance coverage.
- Isolated verified-Google-subject tests passed 88 invitation assertions and 117 key
  recovery regressions. Pricing passed 101. Tests cover wrong key/purpose/role/mailbox,
  cancellation, exact UUID/digest/deadline, immutable history, reserved limits, revoked
  issuer/reversal, rollback, concurrent redemption, direct SQL/RLS/ACL denial and restart.
  Actual Auth users/sessions were restored locally with unchanged timestamps; no Auth
  account, JWT, provider response or charge was fabricated or committed to cloud.
- Committed-cloud relationship/RLS checks passed 93 assertions and rolled back every
  fixture. Public/denied HTTP passed 203 checks, including invitation authentication
  and CSRF denial. Final TypeScript, independent frontend/backend builds, built-server
  public/private-file smoke, private-data and whitespace checks passed. Actual provider
  callback and authenticated invitation HTTP/UI are still required; these checks do
  not replace those journeys. Live inventory remains five Auth users, 21 sessions,
  zero profiles/Storage objects and 37 public tables, all with RLS.
- Source inventory remains 122 implemented, 13 retired and 60 pending literal entries;
  55 reachable replacement modules have no JSON persistence. Templated legacy governance
  routes and mounted-router product journeys require separate review. These numbers do
  not count remaining migrations or production-ready workflows.
- Fresh pre-DDL encrypted archive `c3b816b6-b7ab-4de0-931a-5d9499608e6b` (727705 bytes)
  fully restored 31 migrations, five Auth users, 21 sessions, zero profiles/objects/PINs,
  37 public RLS tables, original ACLs and the private PIN key. Guest private reads and
  browser promotion were denied; backend BYPASSRLS was false. Decrypted temporary pages
  and the cluster were removed. This is a checkpoint, not a stopped-writer cutover backup.
- Committed encrypted archive `6c5435af-c1e1-49e9-b24c-1b45180e2a06` (744409 bytes)
  fully restored all 32 migrations, five Auth users, 21 sessions, zero profiles/objects/PINs,
  37 public RLS tables, original ACLs and the private delivery PIN key. Guest private reads
  and browser promotion were denied; backend BYPASSRLS was false. Temporary decrypted
  pages and the restore cluster were removed. Both archives are checkpoints, not the
  stopped-writer cutover backup. Storage object bytes still need backup when objects exist.
- Before/after security advisors retain 16 intentionally policy-free private tables,
  14 explicit owner-executed projections, the project-generated auto-RLS helper's browser
  execution grants and disabled Auth leaked-password protection. No browser/backend
  invitation grant was added. Review the
  [views](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
  [helper grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  before release; no clean security audit claim is made.
- Next: membership suspension/removal, profile/owned-avatar changes, admin message
  gateway, deletion/ban proposals and audit views. Verified-Google retention/reset,
  genuine founder setup, real provider/UI verification and Storage-byte backups remain
  cutover gates. Preserve JSON and default persistence until replacement verification.

## Previous administrator key recovery checkpoint — 2026-10-10

- Migration 31, `20261010093754_administrator_key_recovery.sql`, is committed.
  All 31 digests match; no migration file is pending. The opt-in backend requires
  migration 31. Default dev/build/start still use JSON. No account has been imported,
  restored into production, reset, deleted or provisioned during this phase.
- Approval-key enrollment requires an actual active administrator and provider Auth
  session created within five minutes. The context-bound salted scrypt key is shown
  once. Approval/settings credentials have independent persisted lockouts and versions.
  Browser/backend roles cannot read hashes or invoke privileged recovery functions.
- Recovery needs two other active administrators with enrolled approval keys. The
  proposer counts once; the target cannot vote. An independent rejection closes the
  proposal. SQL checks the exact eligible roster, monotonic revision, immutable consent
  and 24-hour deadline. Key/membership changes invalidate reviews even if later reversed.
- The second approval atomically clears only the selected approval or settings key,
  rotates its version, resets its lockout, invalidates the target's older administrator
  app sessions and records execution, audit and exact active-administrator notices.
  The other credential and membership remain. The founder's key follows this recovery
  rule without removing founder membership. Old sessions fail server binding/context
  switching and browser RLS; refresh cannot bypass the invalidation timestamp. The
  target must create a new genuine provider session and freshly enroll a replacement.
- Admin Approvals reads the actual roster and recovery history. One-time keys stay
  in component memory, clear on dismissal/account changes, and are never placed in
  browser storage. Recovery status notices use the existing Approvals unread count.
  Invitations, membership changes/removal, moderation, residence deletion and wipes are
  explicitly marked as awaiting migration in the opt-in interface.
- Isolated tests passed 117 governance assertions, including wrong key/purpose/actor,
  persisted lockout, expired/reversed-roster reviews, direct SQL/RLS/ACL denial, atomic
  rollback, concurrent independent votes, stale grants, founder recovery and restart
  persistence. Actual restored Google subjects and unchanged Auth sessions were used.
  No Auth account, JWT, provider response or charge was fabricated. Fresh enrollment
  and post-recovery provider login remain real authenticated HTTP/UI acceptance gates.
- Settings/contact/maintenance regression passed 193 assertions and pricing passed 101.
  Committed-cloud relationship/RLS verification passed 93 rollback-only assertions;
  public/denied API passed 195 checks. Literal route inventory remains 122 implemented,
  13 retired and 60 pending; 54 reachable replacement modules have no JSON persistence.
  The inventory excludes templated legacy governance paths and mounted-router journeys;
  these counts do not measure complete product workflows.
- Pre-DDL archive `dded67bd-ef49-4244-b172-00bf12dfacc2` (703793 bytes) fully restored
  30 migrations, five Auth users, 21 sessions, zero profiles/Storage objects/PINs and
  37 public RLS tables with the original ACLs and private PIN key. Guest private reads
  and browser promotion were denied; backend BYPASSRLS was false.
- Committed archive `8833ae07-4fb5-4c86-ae5c-6ba353bdbff8` (727705 bytes) fully
  restored 31 migrations, five Auth users, 21 sessions, zero profiles/objects/PINs,
  37 public RLS tables, original ACLs and the private PIN key. Temporary decrypted
  pages and the restore cluster were removed. Both archives are checkpoints, not a
  stopped-writer cutover backup; object bytes require backup when Storage objects exist.
- TypeScript, independent frontend/backend builds, final built-server/public/private-file
  smoke, private-data and whitespace checks passed. Current live aggregate inventory is
  five Auth users, 21 sessions, zero profiles/objects and 37 public tables with RLS.
- Supabase security advisors retain the same findings: 16 intentionally policy-free
  private tables, 14 explicit owner-executed projections, the project-generated auto-RLS
  helper's browser execution grants and disabled Auth leaked-password protection.
  No new public recovery function grant was added. Review the
  [view findings](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
  [helper grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  before release; this is not a clean security audit claim.
- Next: trusted administrator invitations, remaining membership/removal governance,
  profile/owned-avatar changes, message gateway, deletion/ban proposals and audit views.
  Verified-Google retention/reset, genuine founder setup, real provider/UI coverage and
  full Storage backup remain cutover gates. Preserve JSON and default persistence.

## Previous platform maintenance checkpoint — 2026-10-10

- Migration 30, `20261010085040_platform_maintenance_recovery.sql`, is committed.
  All 30 digests match; no migration file is pending. The opt-in server requires
  migration 30. Default dev/build/start remain on JSON. No account has been imported,
  restored into production, deleted or provisioned during this phase.
- Active administrators use their separate settings key to change maintenance state.
  Public/ordinary operations return 503 with retry guidance before body/upload parsing.
  Actor lifecycle/RLS transactions and public invitation/catalog transactions recheck
  maintenance under a shared advisory lock; activation holds the exclusive lock first
  and waits for in-flight database operations. All 37 public tables have restrictive
  maintenance policies. Existing filtered views also check maintenance access.
- Health, public settings, logout and administrator sign-in remain reachable. Actual
  selected portal/membership and provider session checks still determine access; an
  administrator cannot switch into a paused ordinary portal. Rejected sign-ins revoke
  the provider session. Signed payment webhooks retain reconciliation access with their
  original authentication and verification. External transfers already started and
  narrow cleanup/provider-result writes cannot be rolled back with a database toggle.
- Restoration requires explicit nonblank text and atomically creates one private notice
  plus its exact active non-admin recipient snapshot, administrator settings notices
  and audit. Visibility lasts exactly 24 hours from server-recorded restoration.
  Browser roles have no private table grants. Backend RLS permits only the latest own
  eligible notice and dismissal column; SQL stamps dismissal, prevents reset/spoofing
  and rejects expired/old notices. Later portals are excluded. A later restoration has
  a separate notice. The popup resets on account changes and deducts cached-response age
  from its expiration timer. Real provider-authenticated UI coverage remains required.
- Isolated settings/contact/maintenance tests passed 193 assertions using actual restored
  Google subjects and their unchanged live sessions. Checks cover wrong keys/roles,
  transaction serialization, direct RLS, HTTP maintenance/CSRF/upload denial, an authentic
  non-charge webhook, account-specific dismissal, later-account exclusion, expiry and
  restart persistence. No Auth account, JWT, provider response or charge was fabricated.
  Pricing regression passed 101 assertions and payment regression passed 62.
- Committed-cloud relational/RLS checks passed 93 assertions and rolled back every
  fixture. Public/denied HTTP passed 188 checks. Positive fresh Google key enrollment,
  administrator recovery sign-in and authenticated workflow HTTP/UI remain acceptance
  gates; database/service checks do not substitute for these journeys.
- Literal route inventory: 122 implemented, 13 retired, 60 pending; 53 replacement
  modules have no reachable JSON persistence. Mounted routers and product journeys
  still require their own review. TypeScript, independent frontend/backend builds,
  built-server/public/private-artifact smoke, private-data and whitespace checks passed.
- Fresh pre-DDL encrypted archive `11d73389-c01d-4121-9d7c-5af0c4f9df13` (660533 bytes)
  restored 29 migrations, 37 public RLS tables, five Auth users, 21 sessions and zero
  profiles/Storage objects/PINs. Guest private reads and browser promotion were denied;
  backend BYPASSRLS was false and the private delivery PIN key was verified.
- Committed archive `453e3506-e2dd-4325-b6b2-fb65d730c9ea` (703793 bytes) includes all
  30 migrations and the private PIN key. Full isolated restore passed with five Auth users,
  21 sessions, zero profiles/objects/PINs, 37 public RLS tables and the original ACLs.
  The backend does not bypass RLS; decrypted temporary pages and the cluster were removed.
  Both archives are checkpoints, not stopped-writer cutover backups. Storage bytes need
  their own backup when objects exist. Current live inventory remains five Auth users,
  21 sessions, zero application profiles/objects and 37 public tables with RLS.
- Before/after Supabase security advisors show the same findings: 16 intentionally
  policy-free private tables, 14 explicit owner-executed projection views, the project's
  auto-RLS helper execution grants and disabled Auth leaked-password protection.
  No clean-advisor/full-audit claim is made. Review the
  [view findings](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
  [helper grants](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  before release.
- Next: remaining keyed governance, approval-key enrollment/recovery, invitations,
  profile/owned-avatar changes, message gateway, deletion/ban proposals and audit views.
  Reviewed identity retention/reset, genuine founder setup and full provider/UI verification
  remain cutover gates. Do not switch default persistence or delete JSON yet.

## Previous pricing and public settings checkpoint — 2026-10-10

- Migration 29, `20261010000000_shared_pricing_governance.sql`, is committed. All 29
  applied digests match and no migration files are pending. The opt-in backend requires
  migration 29. Default dev/build/start still use JSON; no production account has been
  imported, restored, deleted or provisioned during this phase.
- Three distinct active administrator settings-key approvals are required. The proposer
  counts once; administrator #1 performs the final keyed execution, even when three
  other administrators approved. Votes, reviewed prices, roster identities and the
  24-hour deadline are immutable. At most ten proposals remain open. Monotonic key,
  membership and price revisions invalidate stale approvals, including changes reversed
  later. Display-name, contact and receiving-account changes preserve the baseline.
- Keyed `/api/settings` now saves public contacts and announcements in the existing
  private configuration row; no additional schema migration or sample configuration is
  needed. Contact links use validated HTTPS social domains and international WhatsApp
  numbers. Only the reviewed fields are merged. A changed nonempty announcement targets
  exact active non-admin portals. Identical/concurrent retries send one notice; clearing
  stops the public text without deleting existing recipient history. Active administrators
  receive settings updates, with audit and delivery in the same transaction.
- Final execution serializes pricing updates, preserves unrelated platform fields and
  existing checkout quotes, and commits execution, audit and exact active-admin notices
  atomically. Submission, votes and status changes use Admin Settings notification counts.
  Client ownership assertions, foreign keys, duplicate votes and raw browser writes are
  denied. PostgreSQL-owner configuration writes remain trusted operator operations and
  invalidate outstanding reviews; they are not available through client APIs.
- Isolated real-Google-subject checks passed 101 pricing assertions and 81 settings-key
  regressions, including parallel final pushes, restart persistence, stale grants and
  wrong-account/RLS denial. Payment regression passed 62 assertions. Cloud rehearsal
  passed 29 rollback checks with no fixture committed. No Auth session/JWT, provider
  response or payment was fabricated. Positive fresh Google key enrollment and
  authenticated pricing/settings HTTP/UI journeys remain acceptance gates.
- The extended settings suite passed 118 assertions, including contact validation,
  direct pricing/maintenance/identity-field rejection, recipient RLS, concurrent retries,
  transaction rollback, pool restart and preservation of live pricing approvals. No
  additional cloud operational record was created. Real authenticated UI/API remains
  required for the newly enabled contact and announcement controls.
- Public/denied HTTP passed 185 checks. TypeScript, independent frontend/backend builds,
  built-server startup/public reads/private-artifact denials and private-data checks passed.
  Source inventory is 119 implemented, 13 retired and 63 pending literal route
  entries; 52 replacement modules have no reachable JSON persistence. Mounted routers
  and complete product workflows require their own review.
- Pre-DDL archive `d6a64859-9192-4923-9b80-865030510d9e` (629431 bytes) recovered all
  28 migrations. Committed encrypted archive `3c13b3ba-7a40-456e-9001-bec8afbe2f27`
  (660381 bytes) recovered all 29 migrations, 37 public RLS tables, five Auth users,
  20 sessions, zero application profiles/Storage objects/PINs and the private PIN key.
  Guest private reads and browser promotion remain denied; backend BYPASSRLS is false.
  Temporary decrypted pages and the restore cluster were removed. This is a checkpoint,
  not the final stopped-writer cutover backup.
- Read-only retention passed 19 checks: four cloud keep identities/one removal candidate,
  four local keep accounts/30 removal candidates and zero ambiguous bindings. Dependency
  review and destructive execution remain separate cutover gates. Next: maintenance
  enforcement and recovery notices, then remaining keyed governance and profile workflows.
- The latest resumed live inventory has five Auth users, 21 sessions, zero profiles/objects
  and 37 public RLS tables. The recovered archive above records its earlier 20-session
  snapshot; real Auth activity may continue while this is a checkpoint rather than cutover.
- Supabase security advisors were read on 2026-10-10. Private RLS tables intentionally
  have no browser policies. Existing explicit, filtered public projection views are
  owner-executed with security barriers and show [view advisories](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view);
  review their projections and the project-generated auto-RLS event helper before release.
  This checkpoint is not a clean-advisor or full security-audit claim. Auth leaked-password
  protection remains a separate [provider configuration check](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

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

## Previous administrator settings checkpoint — 2026-10-09

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
  configuration, shared pricing approvals with founder execution and settings notifications.
  Public contacts, announcements and maintenance transitions also use keyed writes.
  Recovery notices have account-specific expiry and dismissal. Other governance remains pending.
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
The earlier public/denied HTTP suite passed 188 cases, including
upload authentication before parsing and unsupported encoding/charset rejection.
Database test records rolled back or stayed within deleted isolated restores; no Auth
accounts were created or imported. TypeScript, the independent Vite/backend build, its
public/private-file smoke check and private-data check passed. Earlier Google identity-contract
checks are recorded in the previous checkpoint. These checks do not prove actual email delivery, positive provider login,
authenticated HTTP workflows or responsive enrollment/PIN UI behavior. The literal inventory
now marks 127 existing endpoints implemented, 13 retired and 55 pending review/port; these counts
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
4. Verify real authenticated shared pricing, approval-key enrollment and post-recovery
   sign-in and administrator invitation journeys; port remaining admin governance and verify actual
   gateway delivery/dismissal in independent portals. Verify actual
   administrator maintenance recovery/login and returning-account popup journeys. Port
   reviewed account deletion and wipes, audit views and unfinished maintenance resolution after allocation release. Residence execution has a gated native request/worker handoff; verify positive provider-authenticated HTTP/browser journeys, live queued-image removal and worker deployment before enabling it. Bans/restrictions/restoration are ported in migration 39; verify their genuine provider/browser journeys. Preserve quorum/founder
   decisions and lifecycle notifications. Owned profile/avatar Storage is ported; verify its authenticated provider/browser journey,
   deletion lifecycle and an actual object-byte backup when permanent objects exist.
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
