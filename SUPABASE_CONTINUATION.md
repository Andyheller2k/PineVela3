# PineVela Supabase progress and continuation

Checkpoint: migration 69. Workspace: `/home/wyse/Documents/PineVela3`.

This handoff records the last verified migration round. It is not a declaration
that cutover is complete. Recheck runtime, browser and database state before work.
Updated after the 15 October owner-authorized development report and administrator approval.
No live wipe, account reset or JSON removal has occurred.

## Objective and current state

Move the current PineVela product to Supabase PostgreSQL, Auth and Storage as its
sole persistent source. Design from current requirements, rather than copying
every old JSON entity. Express remains the server-side API and authorization layer
through this cutover. The user subsequently agreed to a separate phase after JSON
removal: replace Express with Supabase Edge Functions/database functions, preserve
all authorization/business rules, then retire Express after replacement acceptance.
Do not start that second phase before the current cutover is verified.

| Area | Last verified checkpoint |
| --- | --- |
| Applied migrations | 69; latest `20261014150839_google_manager_development_enrollment.sql` |
| Replacement server | `supabase-server.ts`, local HTTP port 3001 |
| Default backend | Still legacy JSON; final switch has **not** happened |
| JSON/data removal | **Not performed**; preserve existing data and backups |
| Current source endpoint inventory | 226 total: 178 replacement route matches, 14 retired, 34 unmatched legacy contracts; scanner now expands constant prefixes and finite loops |
| Founder/admin enrollment | Genuine Google signup, founder setup, invitations and recovery verified |
| Last applied migration | 69: defer app roles until owned real Google manager verification; encrypted post-69 backup restored successfully |
| Closure planner | Advisory only; prior 64 native checks. Core and handoff now exist. Conservative planner blockers remain; no plan authorizes mutation |
| Latest caller follow-up | **69 genuine browser/API checks passed**: 22 report, eight native guards, 16 administrator and 23 manager. Exactly one truthful development report and one explicitly explained administrator approval were saved |
| Real field officer | **Oppong Manu Andrews**, `andrewsoppongmn@gmail.com`, Kumasi; the Premuim Pine assignment is `approved`; its preserved report requests `requires_reinspection`, with physical findings unconfirmed and no photographs |
| Genuine Google manager | Primary `finalform2k@gmail.com`, manager **`mindspacehqr@gmail.com`**. **Premuim Pine** remains development-only. Case/property approved, manager active; real Google sign-in, owned unpublished shell, 1440/375px setup locks, immutable email and full reload passed |
| Latest recovery checkpoint | Restored DB `338c3cef-ddb7-48f3-ac1c-bca0c31f0384` and Storage `003b60f3-4d45-4651-a28c-eadc108876a6` predate the officer. Current encrypted 120-table supplemental rows `d3a6e2e4-5f38-45f2-8856-9163d3ae40b5` are verified but have no PostgreSQL restore rehearsal; fresh full backup attempts timed out |
| Latest current-caller review | 25 source assertions passed; earlier 22 real guest HTTP checks plus the latest 13 manager-loading HTTP assertions passed; 27 unmatched legacy contracts have no current frontend reference, seven have legacy-only/unreachable references |
| Next implementation review | The user's own keyed cleanup proposal is saved, pending, with exactly one approval from administrator #1. A distinct active administrator must review it next. Retain manager sign-in; no ban. The last live execution-request capability was disabled. Existing two-key/founder/recovery gates remain. Full residence setup/publication, occupied workflows and genuine physical-site acceptance remain separate |
| Administrator reads | Explicit shared read wrappers preserve exclusive mutations; 28 native checks and a genuine 16-check desktop/mobile browser run, including a successful post-68 retry |
| Street/map registration | GhanaPost removed from active code/schema; 70 isolated setup and 47 re-enrollment checks, nine focused security tests, 110 live schema/permission checks; pre/post backups restored |
| Residence corrections | Requested corrections now reload and resubmit through the same case; 94 isolated manager/residence checks, zero native advisors, 19 actual guest HTTP checks and Supabase builds passed |
| Administrator residence review | Actual private review metadata and state filters connected; latest genuine administrator verifier passes 10 checks including role/stale-account denial and empty directory at 1440px/375px; populated review acceptance pending |
| Manager application corrections | Separate verified manager identity; owner correction/resubmission and admin Request corrections connected; fresh inspection required; 139 native / 47 re-enrollment / 67 HTTP / 23 source / 10 genuine admin browser checks; TypeScript/builds passed |
| Final acceptance/reset | Still pending; native checks do not replace genuine browser journeys |

Endpoint counts are source inventory, not counts of remaining workflows or
migrations. Review actual callers and mounted aliases before implementing any
pending entry. Do not reintroduce retired features to increase coverage.

## Latest follow-up — authorized development report and approval reason; no migration

The user explicitly authorized continuing the saved development-only application
through inspection and verification, with cleanup afterward. This permits truthful
development workflow testing; it supplies no physical visit, photographs or findings.
**22 genuine officer browser checks passed** and sent exactly one report through the
existing form for Premuim Pine. The saved report requests `requires_reinspection`,
leaves every physical checklist finding unconfirmed and contains zero photographs.
Its observations explicitly state that no physical visit, capacity, legitimacy,
safety or utilities verification is claimed. Device GPS, when available, is labelled
in those observations as testing-device location rather than property evidence.
The real registered officer/signature and server timestamp were read back. At report
submission the case became `under_review`, inspection `report_submitted`, manager
pending. A separate native read confirmed that intermediate saved state. Original
user tabs were preserved by the verifier.

**Eight native officer/browser guard checks also passed**: guest report 401,
stale-context report 409, officer approval 403, guest approval 401 and duplicate
submitted-report 409. The saved report remained byte-for-byte equal after those
negative requests. No provider replies were fabricated.

The normal server already requires a reason of at least five characters when an
administrator approves against the officer recommendation. The UI previously sent
empty notes. The Supabase approval action now opens a bounded, accessible dialog
with saved property/manager identity and the existing override-reason requirement.
It captures the administrator context, prevents duplicate submissions and asks for
saved-state refresh after uncertain replies. No backend/RLS/approval rule changed.
After the user's fresh administrator sign-in, **16 genuine administrator browser
checks passed**: actual saved report, required override reason/blank-submit block,
bounded 1440/375px dialog, exactly one approval request, saved development-only reason
and preserved officer recommendation/findings. The case/inspection/property are now
approved and the exact assigned manager is active. The property remains unpublished.

The user then completed genuine Google manager sign-in as `mindspacehqr@gmail.com`.
Native manager/profile separation, the exact saved owned property, zero rooms/beds,
required residence setup and completed operation-key issuance were verified without
reading a key. The helper selects the prepared manager context explicitly. An isolated
login window was prepared, but the user completed login in another local context;
only the actual verified manager is used. The initial full dashboard verifier passed
11 identity/ownership/privacy/role checks, then timed out after 240 seconds waiting
for the sequential dashboard read chain; maintenance returned one 503 then recovered.
This incomplete attempt is preserved in
`development-manager-before-concurrent-reads-browser.json`.

The Supabase manager query now launches its nine independent native reads concurrently
and consumes React Query cancellation. Existing owner/property mapping, error handling,
cache keys, polling and all legacy read ordering are preserved. A first concurrent
run loaded all nine native datasets and passed its overlap check, then stopped at
15 checks because its sidebar selector did not match the actual labels. That
incomplete evidence is `development-manager-first-concurrent-browser.json`. Review
also found that the pre-existing eligibility helper accepted the residence's raw
manager-approval status despite native `isApproved:false`. Its Supabase branch now
uses only the explicit native reviewed-setup flag; legacy matching is unchanged.
The selector now covers the actual sidebar/top/mobile labels. Final frontend
TypeScript/build passed. **23 genuine manager-browser checks passed** after rebuilding:
real Google manager identity/context, exact saved assignment, actual empty shell,
completed key issuance checked without reading a key, guest property **401**, three
administrator/officer-list **403** denials and unpublished public property **404**.
All nine successful dashboard reads overlapped. The saved property and actual setup
prompt fit 1440/375px; housing controls remained locked pending residence review.
The real login email was read-only and the same verified manager/property survived
a full reload. No profile, housing, staff, maintenance, room-key or key-issue mutation
was requested by this verifier. Its original user tabs were untouched. Initial
document-to-ready took **116,942 ms**: concurrency is verified, but native connection/
authentication latency remains unresolved. This is portal/setup-gate acceptance,
not occupied housing or full residence-registration acceptance.

Frontend TypeScript, Supabase frontend build, five report-security tests, 25 source
audit assertions, CJS syntax and diff checks passed. The browser helper now supports
an optional bounded 120-second evaluation wait for this acceptance run; its default
55-second wait and all product/API deadlines remain unchanged. Initial native reads
and browser retries encountered timeouts and a real administrator GET 503, while
later reads recovered. Latency is unresolved; a valid officer GET took 41,342 ms.

Two full database dumps timed out at the same metadata stage; another attempt failed
its PIN inventory. The CLI supplemental export also failed. The verified Node
PostgreSQL client then captured all **120 actual tables** across auth/public/private/
storage in a read-only snapshot, encrypted and decrypted it with matching digests.
Supplemental checkpoint **d3a6e2e4-5f38-45f2-8856-9163d3ae40b5** includes the officer,
dispatch and all 69 migration rows before report submission. It has **no PostgreSQL
restore rehearsal** and does not satisfy destructive cleanup or cutover recovery.
The previous full DB/Storage recovery artifacts remain preserved.

Private evidence under `.security/migration-reset/` is
`development-inspection-submit-browser.json`, `development-inspection-submission.json`
and `development-inspection-saved-state.json`, plus the encrypted supplemental
checkpoint. Submission journals prevent replay after an uncertain browser reply.
The earlier administrator attempt stopped before a decision in the verified officer
context; the user supplied the genuine administrator session for the successful
approval above. Guard evidence is `development-inspection-guards-browser.json`;
approval evidence is `development-approval-approve-browser.json` and its private
one-attempt journal. `development-manager-initial-read.json` records the genuine
subsequent manager session and native assignment/setup checks.

A read-only native database dependency preview inspected both property-only and
combined manager-portal closure. Property-only scope is one Premuim Pine residence,
one manager assignment, one application and one report, with zero blocks/floors/rooms/
beds/allocations/staff/payments/maintenance/property media and no registration ban.
The real Google manager sign-in is explicitly retained. Native preview blockers were
empty. This developer inventory is not administrator-browser cleanup acceptance.
Two administrator browser preview attempts encountered GET 503 before any preview or
proposal. No cleanup, proposal, keys, pause or execution was requested. Existing
two-key/founder/recovery/release gates remain intact.

A refreshed read-only native dependency inventory after approval and manager sign-in
confirmed that same four-record housing scope, zero media and no native blockers.
The exact IDs and retained-identity boundary are reviewable in
`.security/migration-reset/development-property-cleanup-plan.md`; supporting current
preview is `development-property-cleanup-candidates.json`. No Auth identity, manager
sign-in or operation key is a cleanup candidate. The user subsequently signed in as
administrator #1. Eight native browser preview checks passed, followed by genuine
founder/key-enrollment and existing-dialog scope checks. The dialog is prepared for
the user's own keyed proposal. Its live capability read confirms the execution-request
release gate is disabled. Fresh full recovery still needs successful rehearsal before
any destructive execution.

To prepare a future founder review from an idle dashboard, use:

```bash
node scripts/verify-supabase-development-cleanup-preview-browser.cjs --interactive
```

This explicit mode uses the prepared administrator tab with no open dialog or
focused field, verifies genuine founder identity/key enrollment, loads the native
property-only preview and prepares the existing deletion dialog. It never reads or
enters an approval key; network observation stops before opening the key field.
The user must review the scope and submit with their own key inside PineVela.
The retained process accepts `status`, `verify` and `close`; verification only reads
the actual saved governance state and journals a user-created proposal. The user
subsequently submitted with their own key. The live governance read confirmed exactly
one matching saved proposal, status `pending`, with one approval from administrator
#1. Evidence is `development-cleanup-proposal.json`; no preparation or deletion has
been performed. The interactive read process has been closed without closing the
founder tab. Preview/session evidence remains in `development-cleanup-preview-browser.json`
and `development-cleanup-review-session.json`. The default mode remains a new-tab
read-only preview. No public deletion gate was enabled.

The next read-only verifier is
`node scripts/verify-supabase-development-cleanup-review-browser.cjs`.
Its optional `--open-independent-login` mode verifies the saved scope and actual
eligible roster before opening a separate login window. A first separate browser
connection timed out before any scope read or window creation; its incomplete
evidence is retained. Four guest HTTP guard probes also timed out and are not
acceptance passes. The local preview health subsequently returned HTTP 200 with
Supabase persistence. After closing the completed interactive reader, **11 actual
review checks passed**: genuine founder identity, exact saved dependency IDs/counts,
manager retention, zero ban/uploads, the sole founder vote, no executed deletion,
and a different eligible enrolled administrator. The separate independent login
window is now open; metadata is `development-cleanup-second-admin-browser-context.json`.
The live eligible administrators are **Jennie Violet (#2)** and **Andy (#3)**.
The user signed in as **Jennie Violet (#2)**. Discovery found two genuine local
administrator dashboard targets, including the original founder context. The
original newly opened context had disappeared; the unique other actual dashboard
context was selected and then independently authenticated, rather than asking for
another sign-in. Both identity/governance reads returned HTTP 200 with the same
administrator and original founder. **11 native review checks passed**, including
current active membership, own-key enrollment, unchanged exact dependencies and
the pending proposal with the sole founder approval.
Current successful scope evidence is `development-cleanup-proposal-scope-browser.json`.
No private key was read, entered or transferred through tooling. No vote or deletion
was submitted by the verifier. Run the default read-only mode after a user-confirmed
vote; do not reopen a duplicate independent login window.

Once the user confirms that separate administrator dashboard is ready, use
`node scripts/verify-supabase-development-cleanup-review-browser.cjs --prepare-independent`.
This mode verifies the actual distinct administrator, active membership, enrolled
own key, saved pending proposal and unchanged dependencies. It then opens the
existing Approvals panel and expands the exact proposal's review details. It leaves
the masked key field for the user and never clicks approval or inspects field values.
The connection closes after preparation while the original user tab stays open.
The native read evidence is `development-cleanup-independent-review-browser.json`;
it explicitly has `preparedIndependentReview: false`. The UI preparation was stopped
after preserving the successful reads to add support for More navigation on small
windows. The updated mode passed syntax/diff checks, but its next connection timed
out before any browser reads. No second vote was submitted by tooling, and no native
vote UI preparation pass is claimed. Incomplete context/read/connection attempts are
retained separately. All verifier processes have ended; the preview remains running.

The pending user question now asks Jennie to open **Admin Approvals** (or **More →
Approvals**) herself, find **Hostel deletion approvals**, review **Premuim Pine**,
enter her own key in that section and click **Approve hostel deletion**. Await the
user's confirmation, then verify actual persisted distinct votes before any founder
preparation pause. Keep keys inside PineVela. Do not launch a new proposal or replay
the founder submission. Do not ask
for the key in chat. If the user signed in elsewhere, identify the genuine separate
approved local context before proceeding; do not substitute the founder session.

Final private round index is `development-inspection-round.json`, covering **69**
passed real browser/API checks and zero deletions. Final focused TypeScript/Supabase
frontend build, all six CJS syntax checks, five report-security tests, 25 source-only
audit assertions and whitespace/diff review passed. There is no new migration,
backend/RLS change, default switch, JSON removal or full cutover claim.

## Earlier follow-up — user-created dispatch and populated officer queue; no migration

The user manually dispatched the officer and reported that the assignment appeared
in the officer portal. **23 genuine read-only browser checks passed** against this
actual saved dispatch: **Premuim Pine**, manager `mindspacehqr@gmail.com`, assigned
to **Oppong Manu Andrews**, `andrewsoppongmn@gmail.com`, Kumasi. The saved status is
`dispatched`, priority `medium`, and there is **no submitted report**. The owned
officer queue now has one assignment; the earlier empty-queue checkpoint below is
historical.

The checks confirm actual officer identity and assignment ownership, one matching
live manager case, saved dispatch time, private no-store queue reads, guest **401**
and stale-context **409** denials. At 1440px and 375px the exact saved case card
shows its property/manager, **Pending Field Visit** and enabled existing inspection
action; the card and queue controls fit the viewport. A second native queue read
confirmed the same unchanged pending assignment, and the officer session remained
verified. The form was not opened and no location, photograph, report, decision or
additional dispatch was submitted by the verifier.

The verifier now accepts an optional actual manager email in its layout-only mode
and preserves this separate evidence in `officer-dispatch-browser.json`. Existing
24-check session and 14-check empty-layout evidence remains intact. CJS syntax and
diff checks passed; only verification code and documentation changed. No product,
authorization, RLS or schema changes. The initial identity read measured 10,046 ms;
this single observation does not resolve the earlier variable session latency.

**The property remains development-only**, as previously confirmed by the user.
This verifies dispatch persistence and populated portal delivery; it does not
establish a physical visit, genuine report, administrator approval or operational
manager acceptance. Populated cross-officer browser isolation, cutover, default
runtime switch and JSON removal remain pending. Recovery evidence still predates
officer registration and this dispatch; refresh it before cutover/destructive work.

Reproduce with the actual officer portal open:
`node scripts/verify-supabase-officer-session-browser.cjs andrewsoppongmn@gmail.com --layout-only mindspacehqr@gmail.com`.

## Earlier follow-up — real officer session and access acceptance; no migration

The preview was stopped when work resumed. The existing Supabase static preview was
restarted on loopback port 3001 and health returned `persistence: supabase`. The user
then freshly signed in as the real officer **Oppong Manu Andrews**
(`andrewsoppongmn@gmail.com`, Kumasi) in a private window.

**24 genuine browser assertions passed** using actual API replies:

- Verified exact officer identity, separate saved officer context, registered name
  and assigned zone. The owned queue returned HTTP 200, a real empty array and
  private `no-store` caching. No assignment or report was invented.
- Actual guest **401**, stale-profile **409** and officer **403** denials on all
  three administrator-only application/inspection/officer lists.
- Actual portal identity and empty queue at 1440px and 375px, bounded queue controls,
  visible refresh and no report form. A separate 14-check layout-only run also passed.
- Explicit refresh received a real successful queue reply. The administrator page
  denied access without manager controls, its return link reopened the officer
  portal, and a full reload retained the same verified officer and real queue.

The shared approved-browser helper now has an explicit officer-context mode. It
requires a prepared local officer tab in one browser context and creates/closes
only its own test tab. The verifier checks the actual `/api/auth/me` identity
before reading assignments. Existing administrator and primary selection behavior
is preserved. No cookies, browser storage values,
passwords or approval keys are extracted; the original tabs and officer sign-in
remain available. No dispatch, report, approval or evidence upload was requested.

An initial session-read attempt did not complete (zero assertions). A later partial
run passed ten API assertions but used mixed-case `innerText` against uppercase
rendered portal text; this verifier selector was corrected to `textContent`.
Both incomplete reports are preserved separately. Observed successful initial
identity reads took 18,873–40,032 ms; the final complete run measured 30,402 ms.
This round establishes the officer journey, not resolution of session-read latency.

CJS syntax and final diff checks passed. Changes are limited to verification tools
and documentation; product code, authorization, RLS and schema were not changed.
No frontend/API rebuild was needed for this round. Genuine populated inspections,
cross-officer populated browser isolation, physical reports and operational manager
acceptance remain pending. **Premuim Pine remains development-only**. The default
JSON runtime, migration count and recovery checkpoint are unchanged; refresh DB and
Storage recovery evidence before cutover/destructive work.

Private evidence under `.security/migration-reset/` is `officer-session-browser.json`,
`officer-session-layout-browser.json`, `officer-session-initial-read-incomplete.json`
and `officer-session-portal-selector-incomplete.json`. Reproduce the complete check
with the real officer portal open:
`node scripts/verify-supabase-officer-session-browser.cjs andrewsoppongmn@gmail.com`.

## Earlier follow-up — development application and honest inspection evidence; no migration

The user explicitly confirmed **Premuim Pine**, saved at Ring Road, Kotei, is a
**development application only**. Do not treat its address as an inspected property
or use a synthetic visit, photographs, GPS, report or approval to complete genuine
acceptance. No dispatch or report was submitted. Seven genuine administrator
read-only checks confirmed the saved `inspection_pending` case, the active real
officer **Oppong Manu Andrews** (`andrewsoppongmn@gmail.com`, Kumasi), zero live
inspections, unchanged saved inspection state and preserved administrator sign-in.

The officer form previously supplied fixed Accra coordinates when location access
failed, and invented coordinates again on submission. The viewer supplied positive
checklist defaults, observations, a signature, accuracy and automatic certification
when those values were missing. The administrator viewer also supplied audit text,
signature and certification claims. Those fallbacks are removed. Only an actual
successful device capture can set new coordinates, using the API's `accuracyMeters`
field. Denied, unsupported, unavailable and timeout states expose errors. Capture
results are scoped to the selected inspection and current mounted account. Submission
waits for capture/uploads, preserves absent GPS as `null`, and requires the officer
to choose a recommendation. Missing recorded evidence is explicit; recommendations
are separate from administrator decisions. The static claimed manager qualifications
were replaced with review guidance. Authorization, RLS and schema are unchanged.

**11 location checks passed**, including native Chromium permission denial in a new
isolated browser context, disposal of that context, no generated coordinates, and
the actual Node unsupported-device path. User browser permission settings were not
changed. The five existing report-security tests passed, covering current officer,
assignment, foreign cases and server-derived authorship/time. These checks do not
establish successful physical GPS capture or populated real-report UI acceptance.
Frontend TypeScript/build and 25 cutover source assertions pass; inventory remains
226/178/14/34, with 99 replacement modules and no reachable JSON persistence.

Private evidence is `inspection-location-browser.json` and
`inspection-readiness-browser.json` under `.security/migration-reset/`. Reproduce:

```sh
node --import tsx scripts/verify-inspection-location-browser.cjs
node scripts/verify-supabase-inspection-readiness-browser.cjs mindspacehqr@gmail.com --development-only
node --import tsx tests/inspectionReportSecurity.test.ts
```

An earlier unsubmitted dispatch-preview attempt stopped when its officer selector
did not become ready after five checks; it is **incomplete**, retained separately as
`inspection-dispatch-preview-incomplete.json`. The readiness script now performs
reads only. Genuine inspection, report review, operational acceptance and cutover
remain pending. Recovery checkpoints still predate the officer registration.

## Earlier follow-up — populated administrator review and independent retries; no migration

The user prepared a genuine administrator session and registered a real field officer.
The actual roster now has **one active officer**. The existing manager remains pending,
with the same `inspection_pending` application owned by `finalform2k@gmail.com` for
`mindspacehqr@gmail.com`. No scripted dispatch, decision, account creation or physical
inspection occurred.

The administrator dashboard previously waited for twelve sequential dataset reads
before displaying any manager application. A genuine run reached 148 seconds without
the saved card, despite successful application GETs. `PageAdminDashboard` now loads
the actual application and inspection lists concurrently in an account-scoped query.
The officer roster has its own query and retry, so its failure cannot hide a loaded
application. The duplicate Supabase manager-list alias is skipped. Existing
`adminData` invalidations still refresh both queries. Each captures the administrator
context, consumes cancellation, has a 30-second API deadline and stops interval retries
after an error. Empty-list copy requires a successful owned read. Legacy reads and
all native authorization/inspection/approval rules remain unchanged.

**38 genuine browser assertions passed** on the final build:

- Exact manager/primary ownership, saved application, pending portal and actual
  administrator submission notice; the user-created officer is active.
- Concurrent application/report reads, no duplicate manager-list request, and actual
  guest **401** / stale-profile **409** denials on all three review/roster endpoints.
- Populated identity/property/status, selected navigation and pending badge, available
  dispatch/correction controls, hidden premature approval and bounded cards at 1440/375px.
- One real application request and one real roster request were held, without fabricated
  replies. Both reached explicit errors without false empty lists or interval retry loops.
  The application recovered while the roster still showed its own error; its separate
  retry restored the actual officer names. The administrator session remained verified.

The final document-to-card measurement was **32,654 ms**. This establishes the new
dependency and recovery behavior; cold authentication/provider/browser delays remain.
Earlier partial navigation, session-ended and roster-coupling runs are retained as
incomplete evidence rather than acceptance passes.

Full TypeScript and Supabase frontend/API/worker builds passed earlier in this round;
final frontend TypeScript, final frontend rebuild, CJS syntax, whitespace and **25 source
assertions** pass on the final change. Source inventory remains 226/178/14/34, with
99 replacement modules inspected and no reachable JSON persistence. No schema or
migration changed. Private evidence is `manager-review-browser.json` and the earlier
named incomplete reports under `.security/migration-reset/`. Reproduce with:
`node scripts/verify-supabase-manager-review-browser.cjs mindspacehqr@gmail.com --recovery`.

That checkpoint planned actual officer dispatch, fresh officer sign-in/report and
administrator decision. The later development-only clarification above supersedes
that next step for this application. Physical evidence requires a real property. The existing
encrypted recovery checkpoint predates this officer registration; refresh recovery
evidence before cutover or any destructive operation. Default JSON runtime, final
acceptance/reset and JSON removal remain pending. Only task browser tabs were closed;
the user's administrator tabs and local preview remain available.

## Earlier follow-up — actual manager signup and recoverable continuation; no migration

The user completed Google manager signup and submitted the property application, then
clarified that the manager email is **mindspacehqr@gmail.com**, superseding the earlier
intended jamesgunnhunter address. Primary ownership remains finalform2k@gmail.com.
Do not retry signup using the obsolete address or recreate either identity. One earlier
Google reservation is cancelled and unverified; it was preserved rather than deleted.

Actual saved state is verified: manager enrollment is `completed` through Google,
manager portal is `pending`, the one manager application is `inspection_pending`, and
its saved residence assignment is linked to that exact manager/primary. The user
submitted this property themselves. Automation did not create a property, fake an
inspection, approve it, change any Auth/product records, reset accounts or remove JSON.
The earlier fictional-property limit still applies to automated testing: do not invent
physical visit evidence or bypass the pending manager/inspection gates to advance it.

Verification:

- **23 genuine primary-browser assertions pass** for the actual manager email: saved
  verification/ownership, exact primary sign-in retained, real 400/409/403 boundaries,
  submitted status page, real document reload and saved progress. The API responds with
  `inspection_pending`; the page correctly shows the submitted review state instead of
  repeating signup. No credentials or browser storage were extracted.
- **50 assertions pass against the unchanged fresh checkpoint**, with no application
  fixture rebase. Both actual Google identities and their ownership links, exact saved
  callback audit, case/assignment, native owner snapshot, foreign-primary isolation,
  stale scopes and wrong roles pass. The pending manager has no operational binding.
  The registration notice reaches the primary, not the pending manager, and all three
  administrators receive the submitted-registration notice. Counts and aggregate row
  digests across **all 120 Auth/public/private/Storage tables** remain unchanged.
- Fresh encrypted PostgreSQL checkpoint **338c3cef-ddb7-48f3-ac1c-bca0c31f0384** restored
  successfully, including its private delivery-PIN server key and access controls:
  69 migrations, 37 application tables with RLS, 14 private projections, seven Auth
  subjects, six profiles, 38 native sessions and three active administrators with their
  three approval and three settings keys. No archived accounts were restored to cloud.
- Matched encrypted Storage archive **003b60f3-4d45-4651-a28c-eadc108876a6** backs up and
  locally reconstructs all **seven objects / 3,194,064 bytes**, including one orphan and
  one zero-byte folder marker. No provider upload or removal occurred. This is a
  continuation checkpoint; final writer-frozen/off-host recovery is still a later gate.
- Focused TypeScript for the new native verifier and CJS syntax/whitespace checks pass.
  Application/frontend/schema code is unchanged by this verification round.

New verifiers:

```sh
node --import tsx scripts/verify-supabase-created-manager-checkpoint.ts 338c3cef-ddb7-48f3-ac1c-bca0c31f0384 finalform2k@gmail.com mindspacehqr@gmail.com
node scripts/verify-supabase-manager-created-browser.cjs mindspacehqr@gmail.com --interactive
```

The browser helper's explicit `preferPrimaryContext` mode creates a test tab in the
prepared primary context instead of accidentally selecting an administrator context.
It leaves the user's tabs untouched. The interactive checker reloads its fixed module
for each `verify`/`status` command, preserving one approved connection while fixing
readiness assertions. Submitted status text uses `textContent`, since CSS uppercase
changes `innerText`; read-only predicates handle document-context replacement without
ever replaying an arbitrary evaluation/request. Earlier wrong-email/context/predicate
failures are not app acceptance passes. Final actual browser report is a pass.

Private evidence: `google-manager-created-browser.json`,
`created-manager-checkpoint.json`, database UUID `.json`/`.restore.json` and its encrypted
archives/key, plus the matched Storage archive under `storage/`. Two direct live SQL
probe attempts were rejected because automatic permission review timed out, before
execution. The allowed app checks and encrypted backup/local restore completed the
verification through a safer route; do not label this as a database/network failure.

The local preview was stopped on resume and is now running as tool session **90921**
at `http://127.0.0.1:3001`, using the prior verified built frontend. Default JSON backend,
destructive release gates and public email-domain policy remain unchanged. Next genuine
workflow is administrator review/inspection. Actual physical inspection and operational
manager/residence/staff/resident acceptance are not established by these checks.

This run is complete. Browser session 30728 passed all 23 primary checks and closed
normally, leaving the user's tabs untouched. The next administrator-only verifier was
prepared and attempted once; `/api/auth/me` returned 200, verified **user**, so it stopped
before administrator reads/navigation (zero assertions passed; no dispatch or decision).
That is a missing administrator session, not a failed manager signup. Do not ask the
user to repeat manager registration. Next run requires an actual administrator sign-in
in its own browser context before running:
`node scripts/verify-supabase-manager-review-browser.cjs mindspacehqr@gmail.com`.
Private report `manager-review-browser.json` preserves that incomplete attempt;
`created-manager-round.json` summarizes the completed run. All debugging connections
from this run are closed. Do not shut down the PC.

## Earlier follow-up — consolidate manager registration reads; no migration

The user reached the bounded “Manager registration could not load” screen. The page
still issued four authenticated reads; its verification child then repeated enrollment
and policy reads. Pure enrollment reads also took an exclusive owner-profile lock.
A read-only remote probe measured roughly 0.6–1.2 seconds per database round trip,
making these repeated provider/transaction/ownership checks material.

`supabase/managerOnboarding.ts` now installs one primary-only
`GET /api/users/manager-onboarding` endpoint. Its `authorizedRead` transaction derives
registration status, owned enrollments, server-selected Google policy and current
cooldown from the live actor. Selector/body and stale profile/account headers are
denied. The endpoint is after CSRF protection and before global maintenance middleware;
maintenance is enforced inside the native actor transaction, avoiding a redundant
pre-authentication database transaction. No policy, grant, table or migration changed.
`readOwnedEnrollments` shares the owner-profile lock for reads; enrollment writes retain
their exclusive lock. The page uses one 30-second request and passes its owned snapshot
into `VerifiedAccountEnrollment`, so the actual form issues no duplicate initial reads.
Retry reloads the complete snapshot. Existing captured-owner/unmount guards remain.

Latest evidence:

- **155 isolated native assertions**, genuine archived Google subjects/sessions unchanged;
  full manager/residence flow, owned snapshot, spoofed/stale actor denials and maintenance
  503 enforcement pass. Zero native security-advisor findings. The maintenance test uses
  an isolated pre-protocol credential fixture and the actual settings-key service; it
  never disables triggers or changes cloud settings. The absent initial platform row is
  restored to absence afterward.
- **13 real guest HTTP assertions** pass. Health returned 200; the new endpoint and its
  selector/stale-header variants returned 401 without private rows, in 16–104 ms.
- **14 genuine signed-in browser assertions** pass in two complete runs, requiring the actual Google
  verification button rather than only its parent heading. One snapshot loads both
  page and form; no duplicate legacy enrollment/policy/cooldown requests. Actual selector
  and stale-context requests returned 400/409/409. Holding the real request reached the
  bounded failure screen; one retry restored the complete form with one native 200.
- Focused TypeScript, frontend/API/both worker builds, 25 source assertions and diff/syntax
  checks passed. The verified CLI is `/tmp/pv-supabase-cli-2.120.0/supabase` (SHA-256 checked
  against official release checksums); native verifier supports `SUPABASE_CLI_BINARY`.

Preserve the performance limit: the first cold browser attempt still timed out without
snapshot response headers. The next complete browser run measured 16,546 ms for the
normal snapshot, including 11,146 ms before Chromium send and 5,410 ms awaiting headers;
retry measured 7,914 ms. A second complete run passed the same 14 assertions: normal
19,961 ms (13,142 ms before send, 6,729 ms awaiting headers), retry 6,795 ms.
This proves the complete form and recovery, not elimination of
all cold-browser scheduling delays. No Google-manager verification or property submission
occurred. The next genuine product step remains separate Google manager enrollment.

Evidence is private under `.security/migration-reset/`: `manager-loading-browser.json`,
`manager-loading-browser-first-pass.json`,
`manager-loading-guest-http.json`, `manager-residence-setup-native.json`,
`manager-residence-setup-advisors.json`, `cutover-source-audit.json` and
`manager-loading-round.json`. Verifier:
`node scripts/verify-supabase-manager-loading-browser.cjs --interactive`. It prefers a
single prepared manager tab if the dashboard is also open and keeps the approved
connection open for `status`, `verify`, `close`. Never read cookies, keys or storage.
Browser session 22199 passed twice and closed normally; the user's ready manager form
stays open. A later automation connection may require Chromium's approval again.
Stable built preview is tool session **35666**, `http://127.0.0.1:3001`;
sessions 39010 and 33083 were gracefully drained. Restart with
`PINEVELA_MIGRATION_STATIC_PREVIEW=true node --import tsx supabase-server.ts`.
JSON remains the default; no cloud product writes, reset, cutover or JSON deletion.

## Earlier follow-up — primary dashboard and manager loading recovery; no migration

The user reported endless skeletons on the primary dashboard and manager registration,
then noted that YouTube works. Actual source had unbounded sequential page reads and
dashboard refreshes every eight seconds without single-flight protection. The genuine
existing primary tab rendered its verified profile plus the new read/retry banner;
the existing manager tab had an empty React root and slow local Vite module requests.
Do not attribute these symptoms solely to the user's internet connection.

Primary Supabase dashboard reads now run independently with a 30-second deadline.
Only the profile gates the initial shell; catalog/orders cannot hold the whole page.
Refreshes cannot overlap. Captured-account, generation and unmount guards reject stale
replies; failures show retry feedback. Manager status/policy/enrollment reads run in
parallel with the same deadline; the access/cooldown read is bounded and failed checks
keep registration closed. Only these two routes receive a 30-second shared skeleton
recovery screen before their page module runs. Native database connection-acquisition
failure returns a sanitized 503 before work executes, without retrying mutations.
The Supabase manager route now uses the existing `ProtectedRoute` so its form and
reads mount only after authentication restores; native guest denial goes to sign-in.
Legacy manager routing and shared authentication refresh/restoration coordination
remain unchanged. An isolated browser failure on the previously public manager route
exposed this missing restoration boundary; the route was corrected and rebuilt.

The real closed-socket test, session-restoration regression suite, focused TypeScript,
Supabase frontend/API/both worker builds, 23 source assertions, syntax/diff checks and
built-server public/private-file checks pass. Genuine delayed authenticated browser
acceptance is **not** a pass: normal cold navigation did not reach the dashboard.
Shared-browser recovery attempts displayed both recovery screens but did not drain an
actual auth response; that is partial UI evidence only. Recovery scripts now require
one genuinely held request and force a new document (a hash-only navigation reuses the
existing session). Do not call those earlier partial attempts successful acceptance.

Further read-only diagnostics found three JavaScript asset requests pending in the
signed-in Chromium profile before React or `/api/auth/me` starts. CSS and Google font
CSS returned 200. Per-test-tab cache/service-worker bypass and normal network settings
did not clear that pre-React block. Direct server reads delivered all four built assets
in about 57–120 ms; Supabase health returned 200 in about 1 second and a real read-only
database probe succeeded in about 5 seconds. An isolated fresh Chromium profile loads
the actual app and resolves genuine guest denial to sign-in. Its final **seven actual browser checks pass**: normal guest startup, one genuinely
held session request per route, the 30-second recovery controls without private page
exposure, and actual 401 resolution to sign-in on both routes. Final TypeScript and
frontend/API/both worker builds pass after adding the manager restoration boundary.
Verifier: `scripts/verify-supabase-primary-loading-guest-browser.cjs`.
The signed-in browser initially remained slow; do not invent its cause, claim
full authenticated acceptance, extract cookies or restart the user's browser without
approval. No provider replies or identities were fabricated. The user **approved restarting Chromium**. Its debugging close connection failed;
a verified main-process SIGTERM was denied by operating-system confinement, and
Chromium's own `chrome://quit` launcher did not close main process 31065. A manual
normal close of all Chromium windows was requested and the user confirmed **Closed**.
The existing profile was reopened at the user dashboard on 15 October (launcher
session **86146**); remote debugging is listening on port 9222. The local server
health returned 200 in 58 ms. The first post-restart acceptance attempt exceeded its
65-second dashboard wait. A subsequent diagnostic observed genuine `/api/auth/me`
200 with a verified primary user and the actual dashboard at 70 seconds. Assets now
complete; this is not full manager/delayed-read acceptance. One measured asset spent
10.24 seconds before send and about 4 ms awaiting headers afterward. Only two PineVela
tabs were open. Do not call this proof of a database outage or a specific browser bug.
No new restart permission is needed. Do not force-kill or delete profiles.

That trace also showed repeated pending administrator-message and account-access
reads. Their polls now share the existing `AccountRefreshGate`, use 30-second abort
deadlines, cancel on hide/unmount/account change and resume on visibility. Notification
and dashboard periodic refreshes pause in hidden tabs; platform settings and return-
notice queries consume cancellation plus the deadline. Server authorization and
message acknowledgement writes are unchanged. All **15** existing refresh-gate,
session-restoration and real closed-socket tests pass. Focused TypeScript and the
frontend/API/workers build passed for these changes. The authenticated
verifier now records actual startup duration (90-second observation budget, page
deadline still 30 seconds) and checks that each notice endpoint has at most one
pending request under genuine 35-second browser latency.

Latest 15 October acceptance after the user prepared one signed-in tab: the helper's
explicit `existingPrimary` mode selects the single primary dashboard/manager-registration
tab, checks for an open dialog or focused field, and leaves that tab open. The genuine
run passed **eight page assertions**: actual verified primary restoration, dashboard,
manager route, both 30-second recovery/retry states under real 35-second latency, and
successful manager retry after normal networking returned. Retry now refreshes both
registration status and the separately failed access check. Final TypeScript and the
frontend rebuild passed after that correction; backend/workers were unchanged and their
build passed. Seven real guest browser checks and all 15 focused native tests also pass.

The original broad network counter observed a peak of two notice requests and failed
after those eight page checks. Preserve that observation; its exact lifecycle cause
was not captured. It counts across document replacement/cancellation and does not
establish two active operations in one mounted poller. A separate **seven-check genuine
browser experiment passed** in a stable document: hold the actual notice requests,
trigger repeated production refresh events, observe exactly one pending request each,
then release both and require actual native HTTP 200 responses. No provider replies,
identities or application data were fabricated; no account/property/acknowledgement
was submitted. See private `primary-loading-workflow-browser.json` and
`primary-notice-polling-browser.json`. Evidence is from these separate actual checks;
the revised combined verifier has not been rerun end to end.

The combined verifier now stores its page workflow evidence and delegates notice
checks to that stable-document experiment. Use
`node scripts/verify-supabase-primary-loading-browser.cjs --existing-primary` only
with the user's prepared primary tab. The focused notice verifier also supports
`--interactive`: it keeps the approved connection open after success/failure, with
only `status`, `retry` and `close` commands. Diagnostic session **2376** returned the
app to a visible dashboard without a recovery screen, then closed its debugging
connection normally; the user's tab remains open. A new browser connection may need
another Chromium approval. Never reuse the earlier temporary inline WebSocket probe
whose failed-close handler recursed. Do not repeat blind cold navigation.

Cold startup still took **55,411 ms** in the prepared Chromium profile. The functional
loading/retry checks above pass; overall cold-start performance is unresolved.
Genuine separate Google-manager enrollment remains the next product acceptance step;
no manager Google verification or property submission was performed by this round.

Stable loopback preview: tool session **39010**, `http://127.0.0.1:3001`; previous
Vite session 93176 drained. Health returns 200 and the root serves built `/assets/`
files without a Vite client. After `npm run build:supabase`, start it using:
`PINEVELA_MIGRATION_STATIC_PREVIEW=true node --import tsx supabase-server.ts`.
This asset-only flag preserves development mode and the guarded local Google manager
signup; production mode, Auth/RLS/cookie rules and destructive gates stay unchanged.
No account/property submissions, Storage mutations, schema changes, reset, default
backend switch or JSON removal occurred. See private `primary-loading-round.json`
and the actual browser reports for final evidence; preserve this distinction on resume.

## Earlier follow-up — local Google manager enrollment; migration 69

The user's latest instruction defers work/student/ordinary signup domain and real
email-token delivery setup until domain + Resend configuration after development
persistence cutover, before public release. This supersedes the earlier organization-
mailbox blocker for development. Keep ordinary email confirmation/domain checks;
use the explicit local Google enrollment flow rather than inventing a work mailbox.

The user selected primary **finalform2k@gmail.com** and separate manager Google
identity **jamesgunnhunter@gmail.com**. A read-only availability check found no
existing Auth subject, PineVela profile/context or enrollment for James. Actual Google
signup remains a user step; never mint a fake Auth identity or impersonate either user.

The local-only server flag `PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT=true` is enabled
in the private local .env; its example defaults false. Direct loopback host and peer,
non-production and no public origin are mandatory. `/#/register-manager` offers
identity verification before property details. Real OAuth uses private PKCE/state/
cookie/nonce and exact native Google identity/session checks. Original primary
session/ownership are revalidated; no primary auth cookie is replaced and no child
app login is bound. Existing PineVela profiles/admins cannot be adopted. Verification
creates only a pending manager; inspection and administrator approval still apply.
The UI checks saved state after the popup and exposes retry/cancel recovery controls.

Migration 69 only changes the existing private initializer: raw reserved Google
signup defers all app roles until the verified owned callback supplies its private
nonce. No new table, public grant or RLS policy. Applied SHA-256:
`9966ba676d9ad019b44c36e77a18beeedd802c54cf3b39b4404ca70bab716fa5`.
See [implementation and evidence](docs/migrations/google-manager-development-enrollment.md).

Completed evidence: **32** isolated native Google-manager assertions; **139** manager/
residence assertions through all 69 migrations; zero native security-advisor findings;
**82** actual HTTP denials/guards, **23** source checks and **12** genuine administrator
browser checks at 1440/375px. Focused TypeScript and final Supabase frontend/API/both
worker builds passed. The browser directory is empty; no populated review or positive
new manager popup acceptance is claimed. Source inventory: 226 legacy /178 matched /
14 retired /34 unmatched; 98 reachable replacement modules, no reachable JSON.
Native tests preserve genuine archived Auth and use fictional property data only in
disposable restores. Historical `realWorkEmailDeliveryPending` evidence remains true;
that delivery check is now deferred launch-auth work, not a development mailbox blocker.

Pre-69 encrypted DB backup `8619969a-3a92-456b-aab4-9293681c0d35` and post-69
`a9af3c54-c91d-4f9e-ab65-81855e572386` both restored successfully. Post restore:
6 Auth /4 profiles /37 native sessions /7 Storage metadata /3 keyed admins /
37 application tables, all with RLS /69 versions /14 private projections; catalog
and backend privileges remain restricted and the matching server PIN key restores.
Separate actual Storage bytes backup remains `ff6a02ce-a67c-45be-b81e-450b0c260e2a`.
No Storage uploads/copies or cloud fictional product records were created.

On continuation the prior preview/check processes were no longer running. Preview
restarted at `http://127.0.0.1:3001`, current tool session **64819**; health responds
200. Initial fresh connections timed out; a bounded independent psql/Node check
recovered. The final read-only verifier passed **75 live checks**: all 69 hashes
match and anon/authenticated/scoped-backend roles cannot execute the initializer.
The final built server also passed startup, public reads and private-file denials
with zero cloud record changes. The verifier
is `scripts/verify-supabase-google-manager-live.ts`; never reapply migration 69.

A private user step has been requested: sign in as the selected primary, open manager
registration and verify the selected separate Google account. Stop before submitting
property details, then check the saved pending relationship and primary session from
the approved browser. No fictional Pine Premium Hills record belongs in the cloud.
The only new genuine account/enrollment records should follow that real user action.

Still pending: genuine manager popup/provider/operational acceptance, remaining
reviewed launch/cutover prerequisites and the exact final reset/backup/candidate
approval. JSON/default backend and destructive execution gates remain unchanged.
Express replacement is the later separately agreed phase. Preserve all existing
work and do not repeat completed native cores or implement unused legacy contracts.

The earlier sections below are historical checkpoints; this latest policy supersedes
their organization-mailbox requirement for local development only.

## Earlier follow-up — manager application corrections; no new migration

This earlier round used organization-email-only registration. The later local Google
development flow above supersedes its mailbox blocker. Production email validation
remains; do not invent a mailbox or create the fictional property in the cloud.

The primary owner can now open saved `more_info_required` application details and
feedback from their status card, edit property street/map details and resubmit the
same verified enrollment/case/assigned inspection shell. The verified organization
identity and owner cannot change here. Restrictions, current generation, assignment,
pending state, final/withdrawn cases, active dispatches and residence setup are checked
server-side. Unchanged corrections fail; exact successful retries are idempotent.
Captured account headers prevent silently applying a request under another account.

Corrections archive previous submission/review metadata and require a fresh physical
inspection before approval. New dispatches snapshot their property in private audit
history; older dispatches without snapshots receive a preservation event before
correction, without rewriting history. Current reports take precedence over closed
history in the admin screen. Request corrections now exists with required feedback;
pending counts include inspection/review/correction states. Primary/admin notices
commit with the change. The owner form reloads saved state after uncertain replies;
native admin decisions require confirmed results and do not replay alias mutations.
See [implementation and evidence](docs/migrations/manager-application-corrections.md).

Final verification: **139 isolated native manager/residence assertions**, zero native
security advisors; **47 manager re-enrollment assertions**, **67 actual HTTP checks**,
**23 source assertions**, focused TypeScript, final Supabase frontend/API/both worker
builds and built-server public/private-artifact checks passed. All native Auth rows
remain genuine and unchanged; fictional application fixtures stay in disposable
restores. Inventory remains 226 legacy / 178 matches / 14 retired / 34 unmatched,
97 replacement modules, no reachable JSON persistence in the replacement runtime.

The genuine signed-in administrator browser retry passed **10 checks**: manager-only
route denials (including primary application submission), captured-account decision
denial and the actual empty residence directory at 1440px/375px. Zero real residence
rows, no product mutation or credential extraction. **No populated manager correction,
positive manager signup, or populated residence-review browser acceptance is claimed.**

Private evidence under `.security/migration-reset/`: `manager-residence-setup-native.json`,
`manager-reenrollment-native.json`, `residence-corrections-http.json`,
`cutover-source-audit.json`, `manager-application-corrections-round.json`, and
`browser-acceptance-20261014/residence-corrections-administrator-denials.json`.

No DDL/new migration or live product change; count remains **68**. Latest restored
DB archive stays `a9319d64-ecdb-4369-a60d-63b7e18ba479`. Separate Storage backup/restore
still applies. Default backend remains JSON; reset/execution gates stay disabled.
Preview is running with the final API at `http://127.0.0.1:3001`, tool session
**38662**. Previous sessions 17560 and 62669 drained and exited normally. Leave this
preview running; verify its current listener before any later restart.

Next finish genuine operational/provider acceptance and reviewed final reset/backup
prerequisites before default switch/JSON removal. The later Google development flow
above now permits the manager identity journey without an organization mailbox.
Do not repeat completed native core/handoff work or port unused legacy contracts.

## Earlier follow-up — administrator residence review; no new migration

The admin UI had no Request corrections action despite the existing native API.
Directory and pending-alert actions now open `AdminResidenceRegistrationReview`.
It reloads actual private data, shows photos/contacts/map/capacity/feedback, and
requires an explicit decision plus feedback for corrections/rejection. It uses the
existing saved case routes, strict response checks, a duplicate-submit guard and
saved-state reload after uncertain replies. No sample residence or contact is added.

The private roster now exposes existing case ID/review notes/timestamps and actual
property fields; its pure read uses the explicit shared authorized-read wrapper.
Pending counts/filters distinguish setup review from physical manager approval and
current publication. Final/closed/withdrawn/unsubmitted rows are not pending.
Approved but unpublished rows have a distinct label. Categories use actual saved
Hostel/Inn/Hotel/Estate values; rejected filtering and manager verification labels
use server state. Legacy JSON paths and backend selection remain unchanged.
See [implementation/evidence](docs/migrations/admin-residence-review.md).

102 isolated native manager/residence assertions passed with genuine unchanged
archived Auth rows and the user-authorized fictional residence; zero native advisors.
43 actual HTTP denials/cross-site checks, full TypeScript, final focused TypeScript
with the normal Vite declarations, Supabase frontend/API/both worker builds, final
frontend rebuild, 23 source checks and diff checks passed. The first focused harness
omitted `src/vite-env.d.ts`; adding the normal project declaration fixed that harness,
not app code. Current source counts remain 226/178/14/34, 97 modules, no reachable JSON.

The latest genuine administrator retry passed ten checks, including manager-role
and captured-account denials and the empty directory at 1440px/375px. No credential
extraction or product changes occurred. Populated review acceptance remains pending.
Positive manager work-email/browser and populated review acceptance remain pending.
Private evidence: `manager-residence-setup-native.json`, `residence-corrections-http.json`,
`cutover-source-audit.json`, the dated browser directory, and
`administrator-residence-review-round.json` under `.security/migration-reset/`.

No schema change/new backup was needed; count remains 68. Archive
`a9319d64-ecdb-4369-a60d-63b7e18ba479` is still the latest restored DB checkpoint.
No cloud product fixtures, live decision/reset, release-gate change or JSON removal.
Historical preview session `17560` replaced `14097`; both exited normally. The
latest preview and tool session are recorded in the manager-correction follow-up above.

Next finish genuine operational/provider acceptance and the reviewed final
reset/backup prerequisites before switching default backend and removing JSON.
Do not add migrations solely to increase coverage counts or restore retired features.

## Earlier follow-up — residence corrections; no new migration

The current manager/residence caller review found a real dead end: administrator
`more_info_required` decisions could not be corrected. The dashboard now offers
Review & Correct Registration, loads saved details and feedback, and resubmits
through the existing endpoint/case. The live assigned applicant, physical identity,
restrictions and owned photographs are revalidated. Final approvals/rejections
cannot be reopened by a changed body. Prior submission/review evidence is archived
in private audit history; owner/admin notices and status change commit atomically.

Contact/photo changes preserve hierarchy identities. Unused layouts can be replaced
before activation keys (even revoked), allocations, room enrollments, staff or
maintenance history exist. New hierarchy identities are generated, and old reference
IDs remain retained. Existing room configuration must match the saved submission.
The publication gate remains closed until normal approval succeeds. See
[correction scope and verification](docs/migrations/residence-corrections.md).

94 isolated native manager/residence checks passed with unchanged genuine archived
Auth subjects/sessions and the user-authorized fictional residence; zero native
advisor findings. 19 real guest/cross-site HTTP checks, TypeScript and Supabase
frontend/API/both worker builds passed. No cloud property, email, key, proposal or
operational mutation was used as a test. The genuine administrator read/UI retry
also passed all 16 checks after migration 68. The initial manager-role browser
denial verifier timed out on Chromium approval; the later follow-up above passed
four genuine checks. Positive manager browser acceptance is separate. The verifier is
`scripts/verify-supabase-residence-corrections-browser.cjs` for a later approved connection.

No schema change or new database backup was needed for this follow-up. Migration
count remains 68; post-68 archive `a9319d64-ecdb-4369-a60d-63b7e18ba479` remains
the latest restored database checkpoint. Genuine work-email verification and the
positive manager browser journey remain pending; no invented mailbox or provider
reply is permitted. JSON/default backend and all destructive gates remain unchanged.

Historical preview session `14097` was replaced by the latest follow-up above.
Recheck its listener before use. Next finish genuine operational/provider acceptance
and reviewed final reset/backup prerequisites before default switch/JSON removal.

## Checkpoint — 68: street/map registration and administrator reads

The latest user instruction retires GhanaPost altogether, superseding their earlier
request to restore it. Applied `20261014131638_remove_ghanapost_address.sql`, SHA-256
`7310f7e173bc3d114027e37c8c03832c522757b86fc36f892b3fc1a68e7a03c2`.
Removed active fields, validators, projections and column; retained immutable
historical migrations/dossiers/backups and JSON. Saved name/map-pin matching,
geographic checks, physical inspection, assignments and RLS remain enforced.
See [the workflow and evidence](docs/migrations/street-and-map-registration.md).

The user chose manager/residence setup. Primary owner: `finalform2k@gmail.com`.
They explicitly confirmed Pine Premium Hills / KNUST Main Library is fictional and
authorized development testing. Test property/report/layout records stayed in an
isolated Unix-socket PostgreSQL restore. Genuine archived Google subjects/sessions
were reused without Auth changes; the requested primary identity was present.
70 assertions passed through all 68 migrations, including ownership denials,
inspection/approval gates, primary notifications, full setup and catalog/media gates.
No mailbox or provider reply was invented. A genuine organization mailbox and
positive manager email/browser acceptance remain pending; public Gmail manager
enrollment is still denied. Do not seed fictional product records into live Supabase.

The administrator slowdown was traced to exclusive settings locks on pure reads.
Explicit server-selected read wrappers now share that lock; mutations and status
helpers that expire reviews remain exclusive. 28 native concurrency/security checks
passed. The focused migration-54 projection regression passed 237 checks with zero
advisors; the old full verifier mixes its historical fixture with current store
columns and is not current full-market acceptance. Do not weaken schema/queries to
make that mismatched test pass. See [read boundary](docs/migrations/administrator-read-concurrency.md).

Actual authenticated administrator browser acceptance passed 16 checks (ten API
reads, dashboard, read-only scope preview, desktop/mobile review controls) before
the address removal. It used an owned task tab and explicit main-frame context.
The first post-68 restart retry timed out waiting for Chromium connection approval;
a subsequent approved retry passed all 16 checks on 14 October. No proposal/consent/deletion was
submitted. Private evidence is under `.security/migration-reset/`.

TypeScript, frontend/API/both worker builds, nine focused security tests, 23 source
checks, 22 actual guest HTTP checks, built-server public/privacy checks, all 68
hashes/110 live schema-permission checks and zero native/live advisors passed.
The final server-only readiness/watcher edit was re-bundled after the full build.
Generated build/test/doc files no longer force development page reloads.

Pre-change backup `e216fb51-25e4-410c-be6b-e459b7a91ef0` (1525326 bytes) passed
actual isolated restore with private PIN recovery and RLS/grants. The first dry run
rolled back on a lock timeout; after the preview drained, dry run and application
passed. Post-68 encrypted backup `a9319d64-ecdb-4369-a60d-63b7e18ba479`
(1525193 bytes) passed an actual isolated restore with all 68 migrations, private
PIN recovery, RLS and grants. The existing manager re-enrollment regression also
passed 47 native checks after the shared parser change, without Auth changes,
cloud writes or mocked provider replies. Genuine email/password proof remains
pending. Current live snapshot: six Auth users,
four profiles, 37 native sessions, three keyed administrators, seven Storage objects,
zero residences, wipe pauses, requests or executions. Source counts remain
226/178/14/34 with 97 modules and no reachable JSON persistence.

Preview was restarted in the follow-up above; historical tool session `3403` is stopped. Recheck the
listener before use. JSON remains intact/default, and destructive release gates
remain off. Finish genuine provider and operational acceptance, reviewed final
reset/backup prerequisites, then default switch and JSON removal. Express removal
is the separate later phase already agreed with the user.

## Earlier current-caller review — no new migration

See [the reviewed legacy contracts](docs/migrations/active-caller-review.md). The
source scanner previously missed 31 legacy routes declared with constant prefixes
or finite loops, and falsely left three existing replacements pending: the shared
Google callback, storefront parameter alias and administrator invitation acceptance.
Current counts are 226/178/14/34, with 97 replacement modules and no JSON imports.
These count changes represent corrected source coverage, not additional implemented workflows.

All 34 unmatched legacy contracts were reviewed against current frontend references.
Twenty-seven have none; seven are in legacy-only or unreachable controls. This does
not certify arbitrary dynamic requests or external consumers. Do not create a
document-status schema, synthetic identity engine, multi-room flow or one-admin ban
waiver because the old endpoint appears in the inventory. Current native product
flows remain authoritative. Defaults, JSON and all release gates are unchanged.

23 source assertions and 22 actual guest HTTP assertions passed; TypeScript passed.
No app runtime/schema/RLS change or product mutation was made. An existing signed-in
browser verifier attached but its evaluation did not complete; a separate-task-tab
retry returned `Runtime.evaluate` protocol error `-32000`. Only the task tab was
closed. This round adds no authenticated browser acceptance; recheck execution-context
readiness before diagnosing sign-in from this failure. Evidence: `.security/migration-reset/cutover-source-audit.json`
and `cutover-route-http.json`. Next complete genuine product journeys and the final
reviewed reset/cutover prerequisites; use this review rather than the old raw count
as the implementation queue.

## Earlier checkpoint: 67 — reviewed execution handoff

Applied `20261014084050_reviewed_system_wipe_execution_handoff.sql`, SHA-256
`5f9fa0a0610d6823cd3dc0b9ec11d924fdfe4ee5c2059f90a539b391c5f758f7`.
One new private RLS table, `system_wipe_execution_requests`, is genuinely needed for
an immutable durable handoff; it does not restore a retired product entity or copy
JSON data. It references exact final consent, preparation, proposal, administrator,
notifications and operational receipt. Auth subject/session UUID history is native-
validated without binding retained history to ephemeral Auth-session deletion.

The existing `/execute` endpoint can queue only with the founder's own current
key, exact typed confirmation and fresh session-bound five-admin consent. It never
runs recovery subprocesses. Queuing, administrator notifications and audit commit
together. Duplicate requests preserve one request and its original deadline.
Governance returns sanitized queued/completed/invalidated state; UI refreshes it
and shows the explicit closure form only when the server release gate permits it.

A separate built `system-wipe-worker.mjs` derives identity/version and archive IDs
from immutable native records, restores/verifies actual saved recovery, rechecks
live authority inside the closure transaction, and commits request plus receipt
atomically. Concurrent delivery, damaged files, rollback, restart/reconciliation
and stale consent were tested. Stale work invalidates terminally with notice/audit;
it never resumes housing writes silently. Default and `--watch` are read-only.
Both request and worker execution require exact server-only
`PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS=true`; actual gate remains **off**.
Do not enable it or execute live requests from native fixture results.

**280 native assertions passed:** 81 handoff/worker, 93 operational closure and
106 primary closure/re-entry (including native security advisors). Genuine archived
Google users/identities/provider sessions remained exact; actual encrypted local
restores/Storage bytes were used. No live product fixtures, provider replies or
Auth timestamps were fabricated. TypeScript and all three backend/worker bundles
plus frontend build passed. All 67 hashes and 109 live schema/permission checks
passed; live advisors reported zero findings. Built-server public/private artifact
checks, 34 guest HTTP assertions and 11 actual worker process checks also passed,
including SIGTERM/SIGINT, restart and disabled-execution rejection.

Pre-67 encrypted backup `a946a0e3-116b-4347-b929-c73663b113fa` (1503433 bytes)
restored with private PIN recovery, grants/RLS and 14 private projections. Post-67
archive `2752adea-fd4c-46ec-ae5a-6c2be57752ea` (1525252 bytes) also passed its
isolated restore with all 67 migrations, private recovery keys and grants/RLS. Live snapshot:
six Auth subjects, four profiles, 37 native sessions, three keyed administrators,
seven Storage objects, zero wipe requests, pauses or executions. These counts are
not a reset preview or five-admin real acceptance.

Preview requires migration 67 and runs at `http://127.0.0.1:3001` (tool session
`64195`; recheck listeners). Source audit: 195 literal endpoints, 146 implemented,
14 retired, 35 pending; 97 reachable replacement modules, with no JSON persistence
reachable from API or either worker. Counts do not prove semantic workflow completion.

Next review pending active caller journeys and finish genuine provider/operational
acceptance, then the exact reviewed reset, fresh final database/Storage backups,
default switch and JSON removal. The execution handoff is implemented at its stated
native/runtime evidence level; do not redo it. Express replacement is the separate
later phase already agreed with the user. See [worker operation](docs/operations/system-wipe-worker.md).

## Earlier checkpoint: 66 — operational closure core

Applied `20261014002629_reviewed_operational_wipe_core.sql`, SHA-256
`76a7cd38a2159bdbdc31bc23cd75b0eeeefdd13c62395b4c98528cf1c9229a36`.
See [the native protocol](docs/migrations/operational-wipe-core.md).
The existing private execution ledger now supports an exact operational effect
plan and retained withdrawal markers. No public execution route/CLI was enabled.
Only selected application bindings are deleted; Auth/provider sessions, profiles,
Storage bytes, administrator portals/keys and financial/review history are retained.
Primary re-entry uses the same receipts and never reopens old property/store access.

Unfinished maintenance, inspections and seller applications are marked withdrawn
without inventing reports, approvals, repair completion or resident confirmation.
Own-manager closure requests resolve against the wipe receipt. API/private
projections expose withdrawal; archived actions/uploads are rejected. Manager/staff
maintenance counts and details no longer treat withdrawal as active or successful
work. Existing private views/RLS and grants remain intact.

**391 native assertions passed:** 93 operational (resident, market, manager/staff,
total), 24 invited-officer/pending-seller, 104 scope/concurrency, 64 planner and
106 primary closure/re-entry. Tests used actual encrypted local restores, genuine
archived Google subjects/provider sessions, native keys/votes/invitations/dispatch,
actual zero-fee registration, activated-room staff reviews and real Storage bytes.
No cloud product fixtures or Auth/session timestamps were fabricated. In particular,
pre-invitation sessions remain unable to bind a newly accepted officer.
TypeScript and frontend/API/worker builds passed. All 66 applied hashes and 92
live schema/permission checks passed; native/live security advisors found zero issues.
Built-server public/private checks, nine built read-only worker checks and 34 real
guest governance/recovery HTTP assertions passed.
No genuine fresh-provider or operational browser acceptance is claimed.

Pre-66 archive `3b726487-4cf4-4c66-aeaf-368a7b128b05` (1461245 bytes) restored
locally with private PIN recovery, grants/RLS and 14 private projections. Post-66
archive `d3b4e2b5-88b5-4405-9030-a0f71532543f` (1503433 bytes) also passed its
isolated restore, including all 66 versions, private PIN recovery and grants/RLS. Live snapshot remains six Auth subjects,
four profiles, 37 native sessions, three keyed administrators, seven Storage objects,
zero active wipe pauses and zero executions. Snapshot counts are not reset candidates.

Preview requires migration 66 and runs at `http://127.0.0.1:3001` (tool session
`38750`; recheck listeners rather than trusting old session IDs). Default backend
and JSON remain unchanged. Next finish the reviewed live execution request/operator
handoff, genuine provider/operational acceptance and final reviewed reset/cutover.
Do not repeat completed native checks without a relevant change. Do not wipe live
data for testing or enable destructive gates from these fixture results.

## Earlier checkpoint: 65 — complete wipe review dependencies

Reviews now seal all meeting relationship directions, unresolved staff bargains,
pending seller signups without a store, and officer invitations directed to a
selected primary even when their administrator issuer survives. Enrollment digests
cover the full saved row without exporting private fields. Related room deliveries,
notice content and recipient identity pairs are retained dependencies, separate
from lifecycle targets. Read/popup timestamps do not stale approval. A real native
notification writer waiting behind pause creation was denied after its commit.

The planner narrows allocation, room-key and maintenance effects to selected
relationships. A room's old occupant or unclaimed key is not a mutation target
merely because the room is reviewed. Repair completion/confirmation evidence must
not be invented to archive operational access. Exact image references are covered
even when a retained administrator uploaded the image. No tables, public RPC,
new authorization SECURITY DEFINER function or broader RLS/grants were added.

274 isolated native assertions passed: 104 scope/history/concurrency, 64 planner
and 106 primary closure/re-entry regressions. Genuine archived Auth bytes remained
unchanged; real local key/vote/pause/delivery services were exercised. TypeScript,
frontend/API/worker builds, built-server public/privacy checks, guest HTTP denials,
all 65 immutable live hashes and 74 live schema/permission checks passed. Native
and live security advisors reported zero findings. No new browser acceptance is
claimed from these native/API checks.

The live read-only total plan completed; its current graph is primary-only and does
not prove a mixed operational worker exists. Snapshot: 6 Auth users, 4 profiles,
37 provider sessions, 3 keyed administrators, 7 Storage objects, no active wipe
pause or primary execution. These are snapshots, not reset candidates.

Pre-65 encrypted archive `37c9a926-e631-459e-8c56-0c09028fcbe0` (1451610 bytes)
and post-65 archive `2da96c8b-4d41-4e4d-9899-6072b89dc07b` (1461206 bytes)
both restored locally with private PIN recovery keys, grants/RLS and all 14 private
projections. Storage bytes are unchanged; the separately restored byte archive is
intact. Private evidence begins `system-wipe-scope-`; related results are
`system-wipe-closure-plan-native.json` and `primary-wipe-native.json`.
The preview requires migration 65 and runs on port 3001.

Next implement general operational closure admission/receipts and the worker against
these exact dependencies. Preserve completed approvals, inspections, repairs,
payment/order/message/review/delivery history and independent administrator access.
Unfinished inspection/maintenance work needs an honest retained closure outcome;
do not manufacture rejection, repair completion or resident confirmation. Keep
live execution disabled until genuine acceptance and final reviewed reset/cutover
prerequisites pass. Do not repeat this round without a relevant change.

## Latest caller follow-up: manager registration cooldown

`GET /api/users/manager-restriction` now reads the authenticated primary owner's
actual native cooldown. It matches the registration write gate: primary manager-account
bans and residence bans on that owner's closed manager portal. The longest active
expiry wins, with one database timestamp; expired history remains. It rejects identity
selectors, stale context headers and other portal roles. The narrow authorized read
does not widen browser RLS/grants or expose other identities/credentials.

Manager onboarding checks access before showing registration, gives a retryable
failure, discards cancelled/other-account replies and uses database time with a
monotonic countdown. Expiry triggers another native check. Other portals skip this
primary-only read. No fixed 30-day promise or presumed deletion history is displayed.

101 isolated native assertions and six actual guest HTTP denials passed. Native
fixtures use genuine archived Google subjects/sessions; Auth bytes remain unchanged.
TypeScript, frontend/API/worker builds, source inventory and diff checks passed. A
browser attachment found no approved PineVela tab, so genuine primary UI acceptance
is still pending; no credential extraction or cloud fixture was attempted. No new
migration, database mutation or Storage change was required. The preview runs on
port 3001. Private evidence: `registration-restrictions-native.json` and
`manager-cooldown-round.json` in `.security/migration-reset/`.

## Earlier applied migration: 64

[Officer invitations and room-key delivery](docs/migrations/officer-invitations-and-room-delivery.md)
is implemented. Officer invitations require the issuer's own approval key, exact
verified separate official identity and primary acceptance. Existing administrator
or other portal identities cannot become officers. Invitations/history are immutable;
key/status changes cancel pending grants. Fresh officer sign-in follows acceptance
or restoration. Binding holds the officer context lock, serializing with suspension.
The main Google login directs actual officers to `/field-officer`. No password/card
is assigned by the administrator in the Supabase UI.

Room delivery derives the current key and residence from an assigned manager with
an own operation-key grant. A verified, active, non-deleted/non-banned recipient's
primary notifications receive the key atomically with a receipt and audit. It sends
no email/SMS and does not allocate/reserve a room. Retry nonces are canonical and
immutable. Occupied keys belong only to their current resident owner. Historical
housing UUID snapshots survive physical teardown; retained identity/notification
foreign keys and queued-media guards remain. Staff do not gain recipient metadata.
Admin store/cooldown lists now read actual current/historical native rows and show
load errors instead of silently substituting empty lists or legacy waiver controls.

**334 native checks passed:** 85 officer invitation/binding/status, 71 delivery,
26 admin reads and 152 reviewed worker/recovery regressions, including exact receipt
and notification survival after physical key/room/residence removal. Focused final
runs covered the recipient eligibility and officer row-lock corrections; unchanged
admin read/teardown paths were not repeatedly rerun. Actual archived Auth bytes and
provider-session times were preserved. Native/live advisors reported zero findings.
Twenty actual HTTP denials and 14 genuine administrator browser checks passed,
plus 22 guest UI checks at 1440/768/390px in light/dark. Browser retries corrected
loading/navigation waits and creation of the task tab in the actual signed-in
browser context. No passwords, keys, cookies or private invitation links were
extracted. Real positive fresh officer/provider and manager-to-recipient operational
browser acceptance remain pending; no cloud officer/delivery fixtures were created.

TypeScript, frontend/API/worker builds, built-server public/privacy checks, source
inventory, immutable live hashes and diff checks passed. Migration 64 dry run and
application succeeded. Pre-64 `8843dc86-6e14-4e2d-8ec4-3043c4ac6e67` and post-64
`06d4d770-0e63-44b4-9bbc-535d053a900b` both restored in isolated PostgreSQL with the
private PIN key/grants/RLS. Post snapshot: 6 Auth users, 4 profiles, 36 native
sessions, 3 keyed administrators, 7 Storage objects, 37 public RLS tables, 14 private
projections, no public views. Later real sign-in activity increased live sessions;
those counts are snapshots, not deletion candidates. Storage bytes are unchanged;
use the separately restored archive `ff6a02ce-a67c-45be-b81e-450b0c260e2a`.

Review inventory aliases/dormant code before adding schemas: Google callback, admin
invitation acceptance and store-detail aliases already exist. Manager document
verification scaffolding is unreachable; current onboarding uses physical inspection
and avoids intrusive document storage. Seller evidence is institutional verification,
actual ID number and declaration. Do not restore synthetic NIA/Ghana-card endpoints
or dormant additional-room enrollment. General operational wipe closure remains;
retain these new officer/delivery histories when designing it. JSON is intact/default,
all destructive gates remain disabled, and Express replacement is a later phase.

## Earlier checkpoint: migration 63

[Verified email primary re-entry](docs/migrations/primary-email-reentry.md) is implemented
at its stated verification level. Explicit email code/link proof reopens the original
primary after a completed normal-wipe receipt, selects only that primary portal and
preserves history and independent administrator/other portals. It cannot initialize
an unregistered disposable Auth identity. Google/email attempts serialize to one
immutable method-bound receipt, notice and audit. Native bans/epochs still apply.

172 native checks, 13 actual HTTP denials, three genuine authenticated browser checks
and 22 guest UI checks passed. Guest coverage includes 1440/768/390px, light/dark,
field contrast, reachable controls and no horizontal overflow. No verification email,
cloud product fixture or successful closure/re-entry was requested. Actual email-only
provider delivery/OTP and positive closed-account browser acceptance remain pending.
TypeScript/builds, built-server checks, hashes/advisors and pre/post-63 restores passed.

Next: implement general operational closure from the current planner and existing
consent/recovery boundaries. Do not redo the completed email/seller schemas or browser
checks without relevant changes. Keep all destructive execution gates disabled until
their real acceptance and final reviewed reset/cutover prerequisites pass. JSON remains
intact and default; replacing Express is still a separate later phase.

## Earlier checkpoint: migration 62

[Seller re-registration](docs/migrations/seller-reenrollment.md) is implemented at
its stated evidence level. Original primary ownership and verified student identity
remain; each cycle gets a new approval/store/payment identity. Re-entry requires
provider-verified student proof and current seller PIN where configured. Shared
resident access/PIN and historical payments are preserved. Old receipt callbacks
cannot grant or advertise new-store access.

206 native checks, nine actual HTTP denials and four actual signed-in administrator
role checks passed. Full TypeScript/builds, built-server checks, live migration hashes,
security advisors and the post-62 encrypted restore passed. No cloud sellers or
stores were created. Genuine positive seller email/PIN browser acceptance remains
pending; no real account was closed for testing. Both existing and new destructive
execution gates remain disabled, and the default backend is still JSON.

At the migration-62 checkpoint, general closure and email re-entry remained. Email
re-entry is now implemented by migration 63; general operational closure remains.
Use the closure planner's current `seller_scope_closure_required` blocker; do not
reimplement seller generations or repeat the completed administrator checks without
relevant changes. Preserve the user-approved normal-wipe history/Auth boundaries.

## Earlier checkpoint: migration 61

Read the newest implementation-status section and
[primary lifecycle](docs/migrations/primary-wipe-lifecycle.md). The primary-only
native core requires all existing review/recovery/founder-consent gates; no mounted
execution entry exists. Explicit verified Google signup can reopen eligible retained
primary contexts; email-only and mixed operational scopes remain blocked. The same
Auth/profile IDs and independent administrator access survive. No live closure ran.

Live hashes and security advisors passed, and the post-61 encrypted archive restored
successfully. The first apply rolled back on a lock timeout; ledger inspection and a
retry after stopping the replacement development server confirmed the final commit.
The server is running again at port 3001. **29 distinct signed-in administrator
checks passed** across the 23-check API/preview run and focused seven-check UI run
(one repeated session check). Approval navigation, flat greeting, real native
preview and desktop/mobile controls passed. The earlier readiness failure did not
recur without an app change; do not infer a diagnosed cause. No keys or cookies
were extracted and no successful consent writes were requested. Evidence:
`primary-wipe-browser-followup.json` and
`browser-acceptance-20261013/system-wipe-pause-administrator-ui.json`.
Do not repeat these completed checks without relevant changes. Genuine primary
re-entry and full five-admin consent remain pending; do not perform a live wipe
for testing. The next seller implementation map is in `docs/migrations/system-wipe.md`.


Native evidence: `primary-wipe-native.json` (64), `system-wipe-pause-native.json`
(136), residence execution (148), closure planning (41), Google signup (25).
HTTP denial checks (21), built server, TypeScript/builds, static audit and diff checks
passed. Private live evidence: `primary-wipe-live.json` and
`primary-wipe-live-advisors.json`. The inventory remains 195/141/14/40.

## Read first

- [Agent rules](AGENTS.md), [architecture](ARCHITECTURE.md),
  [product rules](docs/product-rules.md), [auth](docs/auth.md),
  [database](docs/database.md), [security](docs/security.md).
- [Implementation status](docs/migrations/supabase-implementation-status.md):
  authoritative chronological evidence; newest checkpoint is at the top.
- [Current application audit](docs/migrations/current-application-audit.md),
  [schema design](docs/migrations/schema-design.md),
  [API inventory](docs/migrations/api-cutover-inventory.json).
- [System wipe consent](docs/migrations/system-wipe.md),
  [fresh-start procedure](docs/migrations/supabase-fresh-start.md),
  [residence deletion](docs/migrations/residence-deletion.md),
  [Storage recovery](docs/migrations/storage-recovery.md).
- Supabase skill: `/home/wyse/.agents/skills/supabase/SKILL.md`.

## User decisions and boundaries to preserve

- Use the already-configured Supabase project, reference `bivajljcdeofyxzmplxm`.
  Trusted founder: `andyheller2k@gmail.com`. Public signup must never grant admin.
- Keep genuine verified Google identities; do not restore disposable test accounts
  or recreate their linked records in the live app. Final deletion candidates and
  dependencies still need a current, reviewable plan and backups before execution.
- Separate verified resident/manager/seller email identities where appropriate.
  When resident and seller use the same student mailbox, share one Supabase email
  identity/password and use separate portal access PINs. Supabase cannot assign
  two passwords to the same email identity.
- Normal five-admin system wipes retain verified logins and account history.
  Selected operational portals/housing/stores close; administrator portals and
  financial, governance, notification and Storage evidence remain. This is separate
  from the migration fresh-start reset. No normal wipe execution is enabled yet.
- One activation key and one active resident per room. Preserve the housing
  hierarchy and allocation/occupancy invariants; do not invent multi-resident rooms.
- Store activation charges only the registration fee. Initial access lasts two
  calendar months; the two-month fee becomes due afterward. Pro/Star subscriptions
  are separate monthly upgrades. No public HTTPS deployment URL has been supplied.
- No mockup or placeholder product data. Existing verifier domain scenarios are
  confined to disposable local database restores with genuine archived identities.
- Derive ownership from authenticated sessions and server relationships; retain
  RLS and non-BYPASSRLS runtime grants. Never trust client IDs as authorization.
- Only buyer ↔ seller messaging is supported. Do not restore manager/resident,
  manager/staff, room or generic chat, public staff hiring or public staff reviews.
- Keep private keys, cookies, passwords, environment values and archives private.
  Approval/settings keys and Google sign-in stay inside the user's app/browser.
- Preserve the existing dirty worktree. Do not clean, reset or overwrite unrelated
  work. No commit or deployment is implied by this continuation.

## What has been completed

The status document contains detailed coverage for Auth/PKCE/cookie sessions,
scoped portal enrollment and access PINs, housing/room claims, staff operations,
maintenance, meetings, seller/store/inventory, orders, buyer/seller messages,
pricing/payments and administrator governance. These implementations have
different levels of native, HTTP and genuine browser verification; do not treat
this list as full end-to-end acceptance.

Recent completed rounds include:

- Administrator photo preview/progress and repeated-upload reuse; actual account
  photograph isolation confirmed. Reviewed reconciliation handled missing,
  unreferenced upload records. Do not delete additional live files to tidy up.
- Migration 51, scoped account appearance, plus 46 isolated checks. Genuine browser
  theme save/reload passed; user confirmed independent light/dark settings across
  two administrators.
- Notification refresh coalescing and account-generation isolation, with five
  Promise/AbortSignal checks. Actual founder inbox/badges were inspected.
- Guest browser coverage: 58 checks across 375/768/1440 widths, light/dark modes
  and delayed actual outgoing requests.
- Owned primary/resident profiles and allocation projections: 64 isolated checks.
  Canonical profile/photo remains separate from linked room details; stale context,
  ownership spoofing and wrong-portal access are denied. Supabase does not use the
  legacy fake occupied-room fallback.

### Latest round: residence changes and manager-key recovery

Migration 52 and [residenceChanges.ts](supabase/residenceChanges.ts) provide manager
request reads/submission and administrator diff review/approval/rejection. Existing
request tables are reused; no new Auth identities or old requests were imported.

- Manager requests require the current assigned manager and operation-key grant.
  Database guards serialize submissions, enforce one request per 30 days and
  protect immutable ownership/before/after snapshots.
- Administrator approval requires its own current approval-key grant. Diff proofs
  bind the actual administrator, native session, request digest and key version,
  expire after 30 minutes and cannot authorize a decision by themselves.
- Approval rechecks the baseline, manager assignment, photo ownership and block
  dependencies. Existing floor/room/bed/staff IDs and history are preserved.
- Public manager contact fields are separate from login identity/profile. Catalog,
  resident projections and notifications reflect approved changes.
- Request/recovery alerts reach manager, primary owner and actual administrators,
  with administrator counts/navigation targeting the review section.
- Administrator manager-key reset requires a separate settings-key grant. It
  invalidates old grants; only the manager creates the replacement. Cooldown stays.
- General request editing remains retired with HTTP 410.
- Server shutdown now closes admission/SSE/Vite, drains accepted requests, then
  closes the pool. A genuine settings read finished with 200 during shutdown;
  listeners released and the process exited normally. The 15-second test harness
  wait was too short; the server's actual drain deadline is 45 seconds.

Verified after the final edits: 61 isolated residence-change checks; 64 resident
profile regressions; 260 public/denied HTTP checks; TypeScript; frontend/backend
builds; residual searches and diff checks. Native scenarios used genuine archived
Google subjects/sessions in disposable local restores, not fabricated Auth rows.

Actual founder browser checks returned admin Auth 200, request list 200/empty,
and manager-only reads/submission 403. No real approval/settings key was copied
or submitted. Genuine occupied manager/residence approval remains untested because
there is no real operational manager/residence available for that journey.

## Latest completed task: initial Auth restoration

The earlier issue is now fixed and verified. A temporary startup failure no longer
classifies a valid session as signed out. See the latest implementation-status
section for the exact evidence and boundaries.

- [AuthContext.tsx](src/context/AuthContext.tsx) uses
  [sessionRestoration.ts](src/lib/sessionRestoration.ts) to coalesce startup checks,
  retry temporary failures at most three times and keep protected content blocked.
- [ProtectedRoute.tsx](src/components/ProtectedRoute.tsx) and private invitations
  render [SessionRestorationNotice.tsx](src/components/SessionRestorationNotice.tsx).
  Public landing browsing remains available during Auth unavailability.
- Exhaustion or a pending check over 45 seconds shows an accessible retry screen
  without changing the requested route. Retry reuses an in-flight check; it does
  not abort a response that may deliver rotated HttpOnly cookies.
- Login/logout wait for the old check to drain. Account replacement and expiry
  invalidate old results. [session.ts](src/lib/session.ts) suppresses expiry/access
  notices from old client generations. A current genuine 401 still announces expiry.
- Nine native async checks and five refresh regressions passed; TypeScript and the
  Supabase frontend build passed. Actual Google administrator browser checks: 24
  passed. Isolated guest browser checks: 29 passed, including stale/current real 401s.
- Network interruptions/delays affected actual requests. No API replies, Google
  identities or credentials were fabricated; no real keys were copied/submitted.
- The schema remains at migration 52. This client change does not claim to fix
  provider/database latency or complete the other genuine operational journeys.

## Latest completed task: own portal PIN security

- [portalSecurity.ts](supabase/portalSecurity.ts) adds own status and PIN rotation
  using the exact verified native resident/seller actor. Selectors, stale headers,
  wrong portals and ownership spoofing are denied. No new migration/table/grant.
- Correct current PIN is mandatory. Failed guesses persist and five attempts lock
  changes for 15 minutes. Key-row serialization and a binding/version recheck make
  concurrent rotation produce one success and one obsolete-session denial.
- The existing trigger advances the version; old bindings cannot refresh back into
  the portal. Auth identity/password, room allocation and companion portal survive.
  A still-valid companion can use the new PIN in the existing authorized switch.
- Audit and own/primary-owner notices are atomic and contain no credential values.
- [PortalPinSettings.tsx](src/components/PortalPinSettings.tsx) is available in
  resident Settings and seller Store Profile; fields are masked and have numeric
  validation, confirmation, saving state and sign-in continuation.
- The primary resident-security dialog directs the person to the separately
  verified resident login. The old parent-password setter returns 410 in the
  replacement backend; it is not a child-password write by mailbox.
- Fifty isolated native checks passed with genuine archived Google identities and
  sessions; no Auth rows/provider replies were fabricated. Seven real HTTP denials
  and seven real Google administrator browser checks passed. TypeScript and both
  builds passed. Genuine resident/seller successful browser mutation is pending;
  the available actual signed-in browser is an administrator.
- No live PIN/account/domain mutation, reset, new migration or JSON removal was
  requested. Existing backups remain continuation checkpoints, not final backups.

## Previous implementation round: email-password security

- `supabase/passwordSecurity.ts` replaces the active manager password caller and
  adds email recovery completion. Only native manager sessions with their existing
  operation-key grant may invoke change-password; target selectors are rejected.
  The verified subject's current password is checked through a genuine temporary
  provider sign-in, independently of optional current-password enforcement. That
  subject is rechecked against the original native actor before provider update.
- Recovery accepts a Supabase recovery OTP or an unopened configured-project
  recovery link, verifies its mailbox/session and requires an already-enrolled
  eligible identity. It never creates a profile or portal binding, grants roles,
  bypasses portal PINs or changes Google credentials. Recovery proof expiry returns
  400 so it cannot end another application identity's browser session.
- Provider mutations use authenticated `PUT /auth/v1/user`, never SQL password
  writes or admin overrides. Native provider revocation and the identity-wide app
  binding cleanup force sign-in. Audit/own-portal notices contain no proof/password;
  seller notices reach its actual inbox. Temporary proof sessions are locally
  logged out in `finally`; no proof cookies/tokens are returned. Portal PINs,
  separate identities, allocations, ownership, policies and keys are preserved.
- New `EmailPasswordRecovery.tsx` is available through the replacement login and
  manager security controls. Masked inputs, guarded submission, stale-account
  completion protection and 8–256 password limits are implemented. No delayed
  credential response clears a newer identity's browser cookies. Interrupted writes
  are indeterminate and never replayed automatically.
- Evidence: **57 isolated native**, **12 real guest/cross-site HTTP**, **10 genuine
  administrator browser**, **27 guest responsive/theme** checks; TypeScript and
  frontend/backend builds. No live credentials changed, test emails sent, Auth
  subjects/sessions/JWTs forged or provider replies mocked. The native lifecycle
  tests are only post-provider boundary evidence. **Successful real email delivery,
  current-password/recovery replacement and subsequent password/PIN sign-in remain
  pending.** Do not mark provider acceptance complete from these negative checks.
- Test: `node --import tsx scripts/verify-supabase-password-security.ts
  61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69 c0857019-ed75-49ec-8af8-259763368f4f`.
  HTTP: `node --import tsx scripts/verify-supabase-password-http.ts`.
  Browser scripts are `verify-supabase-password-browser.cjs` (only approved signed-in
  PineVela tab) and `verify-supabase-password-guest.cjs` (isolated headless guest).
  No new migration or final backup was required for this implementation round.
  Final post-restart HTTP verification and port-3001 health passed. A subsequent
  authenticated browser recheck timed out at a browser command; the earlier
  10-check genuine administrator run passed. Reattach before claiming a new
  authenticated acceptance result; do not treat this timeout as credential change.

## Latest round: reviewed unassigned manager portal closure

- User chose administrator review and founder final approval. Migration 55 reuses
  the private own-manager request and five-administrator account review. Assigned
  residences keep the two-administrator residence-deletion/backup protocol.
- Only an active verified manager may submit its own request with its current
  manager key. Active unassigned managers can issue/petition/recover that key.
  Pending manager registrations do not gain an active portal from this workflow.
- The exact request, key version, ownership and retained restrictions are reviewed.
  Missing quorum, changed assignment/key/roster/dependencies and a non-founder final
  action are denied. The founder must separately confirm execution or rejection.
- Unassigned managers can reach profile/account controls from the welcome popup.
  Settings/account controls suppress its reopening during Supabase polling; the
  closure form can refresh eligibility after first key issuance.
- A guarded private trigger closes only the exact unassigned manager context and
  its app bindings under the existing exclusive lifecycle locks. Auth, other
  portals, housing/history, settings/keys, restrictions and Storage are retained.
  Primary owners receive notices; existing cooldowns survive replacement-manager
  registration. No new cooldown or waiver is invented.
- **51 isolated native**, **56 assigned-manager** and **374 account/residence-review
  regression checks** passed with actual archived Google subjects/sessions. Native
  security advisors report zero findings. Genuine manager browser submission and
  final closure remain pending. **13 live guest/cross-site HTTP and seven genuine
  administrator browser checks passed**, plus TypeScript/frontend/backend builds.
  The current live roster has three keyed administrators; five are required for
  this review, so do not bypass quorum for acceptance.
- Pre-55 encrypted archive/key backup: `07f54620-fe5b-4e54-95b2-7bdb4643c11f`.
  Post-55 encrypted backup: `c2e4a944-9e0f-41f7-a417-83a5b83ac51c`; local restore
  passed. Live security advisors report zero findings; all 55 hashes match.
  Migration dry-run initially met its snapshot lock, then passed after backup ended;
  migration 55 committed. No live closure/reset or JSON removal occurred.

## Previous round: immediate resident room release

- The user chose **immediate verified release**, preserving the old self-release
  behavior without manager approval. Resident Settings has a preview/confirmation
  form. Closure requires the current portal PIN if configured, otherwise the actual
  native sign-in must be less than five minutes old. Token refresh/context switching
  is not fresh sign-in. Body/query ownership IDs and legacy email/password fields
  are rejected. Primary accounts must use the separate verified resident portal.
- `/api/resident/closure-preview`, `/api/student/delete-room` and the resident
  registered-account deletion branch use the exact owned allocation/key and its
  fingerprint. Bad PIN guesses commit counters only. The existing exclusive housing
  lifecycle lock serializes closure with account switching/manager room release.
  Native login binding creation now shares that lock and the account-policy lock.
- The transaction retains allocation/history, ends only resident access, revokes
  its app bindings and creates one unclaimed replacement room key. Auth subjects,
  native sessions, seller bindings/PINs and other portals remain. The response does
  not clear provider cookies; stale UI completions cannot clear a newer account.
  Saved primary owners and assigned managers receive notices. Existing manager
  room release uses the same atomic writes. No new resident cooldown is created.
- **43 isolated native checks**, TypeScript and frontend/backend builds passed.
  Tests used actual archived Google subjects/sessions and included concurrency,
  spoofed ownership, bad PIN persistence, shared seller access, key/history/notices,
  unchanged manager release and restart persistence. **Nine live guest/cross-site
  HTTP checks and five genuine administrator browser checks passed.** The actual
  admin cannot preview/release a resident room; its manager-request queue works.
  Chromium's new connection approval initially timed out; the approved retry passed.
  Genuine resident browser completion and no-PIN fresh-sign-in success
  remain acceptance checks; do not forge Auth sessions/timestamps to mark them done.
- No migration or live closure/reset occurred; ledger remains at 54. Existing
  post-54 database/Storage checkpoints are current for this unchanged data/schema.

## Previous round: private read projections and view security

- Migration 54 moves all 14 owner-executed projections from exposed `public` to
  unexposed `private`, preserving reviewed row/column filters and barriers. Browser
  roles have no grants. Account reads use the bound backend role; public HTTP reads
  use the new non-login, non-inheriting, non-BYPASSRLS `pinevela_catalog` role with
  only six catalog SELECTs and four boolean publication helpers. It has no base-table
  permissions. No private-schema usage was granted to `anon`.
- Updated eight query modules and the media-publication helper; maintenance checks
  also protect the residence projection replaced in migration 52. Base-table ACLs,
  RLS policies, foreign keys and actual account/product rows are unchanged. Existing
  REST/HTTP response shapes remain intact; direct Data API view access is removed.
- **258 isolated native checks and 31 live HTTP/Data API/metadata checks passed.**
  Genuine archived subjects/sessions were unchanged. Native checks covered all 14
  views across real portals, foreign-house/account denial, free native activation,
  product/service/media/price discovery, completed purchase ratings and maintenance.
  Live Data API confirms public endpoints removed and private schema unexposed.
- **Live and isolated security advisors both report zero findings.** The old
  14-findings report below is historical. Live advisor uses verified TLS and a
  password only in its child environment; never place credentials in CLI arguments.
  TypeScript/backend build and **10 genuine administrator browser API checks passed**.
  Staff, maintenance, employment, activity, meetings, seller applications, closure
  queue and public catalogs returned actual authorized replies. The first evaluation
  was interrupted by a Vite page reload; the retry passed with edits paused. Do not
  edit workspace files while attached browser evaluations run.
- Pre/post-54 encrypted backups passed full isolated restores, including RLS,
  catalog role attributes/membership and all 14 private views. Restore helpers
  explicitly create the new role and support historical pre-54 grant checks.
  Evidence: `view-exposure-native.json`, `view-exposure-http.json`,
  `view-exposure-native-advisors.json`, `view-exposure-live-advisors.json` under
  `.security/migration-reset/`. No product records were reset/deleted.

## Previous round: manager closure requests

- Migration 53 stores immutable own-manager request history in a private RLS table.
  The active registered-account deletion route now submits a request from the
  session's exact assigned manager, current operation key and fresh preview digest.
  Serial and concurrent exact retries reconcile; conflicting requests are denied. Submission/withdrawal
  never closes portals, deletes housing or starts registration cooldowns.
- `ManagerClosureRequest.tsx` replaces the Supabase manager deletion dialogs. The
  administrator Approvals queue supports own-key rejection or atomic linkage to
  the existing exact combined residence/manager deletion review. Requests cannot
  replace its independent votes, founder consent, recovery evidence or final gates.
  Suggested cooldown is 30 days; administrators choose it, and a requested waiver
  is not approval. Both saved owner portals receive request and linked-review notices.
- Verification: **56 isolated native, 12 actual HTTP/RLS and 11 genuine signed-in
  administrator browser checks**, TypeScript, frontend/backend builds and inventory.
  Browser queue/navigation/layout checks passed at 375/1440 widths in light/dark
  modes after reloading the final server. Genuine manager submission/withdrawal and
  key-protected administrator decisions remain browser acceptance work. No live
  requests, fake provider responses or account/housing/Storage deletions were made.
- CLI security advisors completed on the isolated restore, reporting **14 existing
  public owner-executed views**. Investigate their grants, predicates and cross-account
  behavior separately before cutover; do not blindly change them to invoker views
  or claim a clean advisor report. Private report:
  `.security/migration-reset/manager-closure-native-advisors.json`.

## Retained manager re-enrollment checkpoint (migration 56)

- Reuses the saved verified work Auth identity/context/enrollment from its original
  primary creator. Uses real existing work-email password or explicitly requested
  OTP/unopened provider sign-in link (`create_user:false`). No duplicate identity,
  Google password change, primary cookie switch or exposed proof tokens.
- Requires expired/absent registration restrictions and no active housing/staff,
  competing manager or unfinished/frozen closure review. Retains final closure
  receipts/history, retires previous key/bindings and grants pending status only.
- Fresh property/inspection cases use an immutable server-derived generation. Old
  closed-property inspections and prior-generation approvals cannot reactivate it.
- Verified: 47 re-enrollment + 56 extended unassigned closure + 56 assigned closure
  + 374 account/residence native checks; genuine archived identities/native sessions,
  no cloud Auth/product mutations or provider mocks. TypeScript/builds and native
  advisors passed. Genuine OTP delivery/password/manager browser acceptance remains.
- Private native verifier property reference contains an existing saved digital
  address in `.security/migration-reset/manager-reenrollment-property-reference.json`.
  It is used only in an isolated restore; never restore old product/test data to cloud.
  Regenerate from an actual supplied residence address if that private artifact is absent.
- Pre-56 verified encrypted backup: `b051588c-5236-438d-b80c-8d0394a3537d`.
  Post-56 encrypted backup `b3fcd7f7-4e32-4ed2-ae72-caa4e724b12c` passed isolated
  restore: six Auth subjects, four profiles, 35 native sessions, three keyed admins,
  seven Storage entries, 56 versions, 37 public tables with RLS, 14 private views
  and zero public views. PIN-key recovery and catalog-role boundaries passed.
- Nine real guest/cross-site HTTP and seven genuine administrator browser checks
  passed after renewed user approval for Chromium. Live advisors report zero findings;
  all 56 applied hashes match with zero pending. No email or re-enrollment was submitted
  to cloud by verification. Genuine work-email proof/browser acceptance remains.
- Primary dashboard status reads only the current inspection generation and offers
  unfinished property continuation after reload. Onboarding retains the owned work
  email, avoids new-password fields during reuse and clears account-dependent state.
  Native status/foreign-owner checks passed. Final replacement server port remains 3001.
- Private artifacts: `manager-reenrollment-native.json`, `manager-reenrollment-http.json`,
  `manager-reenrollment-native-advisors.json`, `manager-reenrollment-live-advisors.json`,
  and `browser-acceptance-20261012/manager-reenrollment-administrator.json`.
  The replacement is launched with plain Node/tsx; backend source changes require
  restarting only the confirmed server process (Vite handles frontend HMR).

## Academic-year room reset checkpoint (migration 57)

- Assigned manager own-key operation or administrator separate approval-key grant.
  Canonical preview GET `/api/hostels/:id/room-key-reset-preview?academicYear=...`;
  POST `/api/hostels/:id/reshuffle-room-keys` accepts only year, exact fingerprint,
  typed `RESET ROOM ACCESS` confirmation and admin-only approvalKey. Captured context,
  native subject/session, saved assignment, review and policy checks are mandatory.
- A private immutable receipt records each academic year. Deferred native validation
  forbids commit without one fresh unclaimed cycle key per room and ended allocations.
  Existing exclusive housing locks prevent claims/sign-ins from crossing the reset.
  One completed reset per year; strictly later years may advance. Retries cannot end
  newly reactivated occupancy. Keep genuine Auth and shared seller PINs/bindings,
  history, primary owners, staff, maintenance, marketplace, cooldowns and Storage.
- Saved primary owners receive batched room-loss notices, and managers/admins receive
  completion notices. Private receipt residence UUIDs deliberately have no live-residence
  FK, so later reviewed physical deletion retains them. Key cycle associations are
  immutable; individual release/generation inherit the latest cycle.
- Verification: 72 native + 43 individual-release + 374 account/residence checks (489).
  Genuine archived Google subjects/native sessions, no cloud product/Auth writes or
  provider mocks. TypeScript/builds/native advisors passed. Draft SQL alias and manager
  bigint/admin UUID version mismatch were corrected before the final passing suite.
- Pre-57 encrypted backup: `e88923b1-9bcb-42fb-a687-d5539427aef1`, archive/key and
  decrypted round-trip checks passed. Post-57 encrypted backup
  `d0cb8495-1dad-4d21-a588-08363032a89a` passed isolated restore: six Auth subjects,
  four profiles, 35 native sessions, three keyed admins, seven Storage entries,
  57 versions, 37 public RLS tables, 14 private views and zero public views.
  Server PIN recovery and catalog non-login/non-BYPASSRLS boundaries passed.
- Six actual HTTP and six genuine signed-in administrator browser checks passed.
  Live advisors report zero findings; all 57 hashes match, zero migrations pending.
  Live cycle receipts remain empty/RLS-protected, browser roles cannot read and
  the scoped backend cannot insert. No live resets, account changes or image removal.
- Private artifacts: `academic-room-keys-native.json`, `academic-room-keys-http.json`,
  `academic-room-keys-native-advisors.json`, `academic-room-keys-live-advisors.json`,
  `academic-room-keys-live-schema.json`, and
  `browser-acceptance-20261012/academic-room-keys-administrator.json`.
- Manager confirmation UI shows exact room/occupant counts, typed consent and safe
  completed-year retry guidance. Account/property changes discard delayed replies;
  a 45-second timeout asks for a new preview to check the committed receipt. Genuine
  operational manager reset/browser acceptance remains pending; no live reset submitted.

## System wipe review checkpoint (migration 58)

- Applied `20261012235439_reviewed_system_wipe_consent.sql`. The replacement's
  Admin Approvals page now offers six scope choices, exact account/residence/store
  and dependency previews, immutable proposal/vote history, five separate own-key
  votes including the founder and a separate keyed founder final backup consent or
  rejection. All transitions notify the current active administrator portals.
- Normal wipes **retain verified logins and account history**. Shared-mailbox
  resident/seller portals remain independent. Residence-only scope preserves
  managers; market-only scope preserves residents. Administrator portals are never
  targets, including when the same person owns a selected primary portal. Financial,
  governance, notification and Storage evidence remains. No Auth deletion is ported.
- Canonical selections and saved domain/roster revisions bind each preview. Changes
  invalidate consent even after reversal. Proposer approval counts once, a rejection
  closes review, five approvals remove nothing and founder `APPROVE WIPE BACKUP`
  only consents to future preparation. Execution stays disabled. The former single-
  administrator clear endpoint now returns authenticated-admin 410 guidance.
- New helpers are private INVOKER functions without browser/scoped-backend execution
  grants. Existing RLS remains; no new public view/RPC or SECURITY DEFINER function.
  Existing protected revision evidence is extended to market dependencies. Native
  guards independently protect scope, deadlines, quorum, founder identity and history.
- **88 new native checks + 72 annual-reset regressions + 374 account/residence
  regressions = 534 checks passed.** Real archived Google identities/native sessions
  stay unchanged; only disposable local domain fixtures are used. Native rollback,
  scope matrices, wrong-role/identity/key/SQL denial, shared-mailbox isolation,
  immutable five-vote receipts, expired/stale/ABA/roster rejection, founder review,
  notices, retained history and reconnect persistence pass. Native advisors: zero.
- **13 real guest/cross-site HTTP and 15 genuine admin browser checks passed.** The
  actual signed-in browser inspected a real read-only preview and its desktop/mobile
  controls; missing own keys, selectors and stale contexts are denied. No credentials
  were extracted, no live proposal/vote/consent was saved and no wipe was requested.
  Genuine five-administrator browser consent remains pending: only three live keyed
  administrators currently qualify. Do not create cloud fixtures to satisfy it.
- Pre-58 encrypted backup: `1ffe91f3-4eb5-44c1-8d53-4b783eab2fa9`. Post-58:
  `5fc1fbaa-298c-4d3c-83a1-3eab91dd204e`. Archive/key and PIN-key round trips passed;
  the post-58 isolated restore passed: six Auth subjects, four profiles, 35 native
  sessions, three keyed administrators, seven Storage entries, 58 versions,
  37 public RLS tables, 14 private projections and zero public views. Catalog
  NOLOGIN/NOINHERIT/no-BYPASSRLS boundaries and private PIN recovery passed.
- TypeScript, production frontend/API/worker builds, built-server startup/privacy
  checks, live security advisors (zero findings) and all 58 migration hashes pass.
  Live wipe-review count remains zero; Storage bytes are unchanged. Latest byte backup
  remains `ff6a02ce-a67c-45be-b81e-450b0c260e2a`. The replacement was restarted safely
  on port 3001 (tool session 40884); recheck its process before a later restart.
- Inventory: 195 literal endpoints, 141 implemented, 14 retired, 40 pending,
  86 inspected modules; replacement JSON imports remain unreachable. These counts
  are source routes, not remaining workflow/migration counts. Default startup remains
  JSON and final cutover/reset has not happened.

## System wipe recovery preparation checkpoint (migration 59)

- Applied `20261013003111_reviewed_system_wipe_recovery_preparation.sql`.
  Two new private RLS tables record preparations and immutable recovery evidence.
  Founder start requires current five-vote/final backup consent, own key and typed
  `START WIPE BACKUP`. Exact retries reuse the same record. Keyed cancellation
  invalidates consent and preserves preparation/evidence/history. Records remain
  available; this phase does not freeze writers or authorize execution.
- Operator-only `npm run db:prepare-system-wipe-backup -- <proposal-uuid>` creates
  an encrypted checkpoint, restores it locally, backs up actual Storage bytes,
  reconstructs every object and attaches proof only when archived/current consent,
  preparation, project and catalogs match. Interrupted work can re-verify existing
  files using proposal/checkpoint/Storage UUIDs. Private journals and completed
  backups remain. No HTTP/browser archive assertions are accepted; technical
  operator receipt has no impersonated founder actor. Exact concurrent retries
  commit one evidence record, administrator notice and audit; failed writes roll back.
- **64 new native recovery checks, 88 wipe-review regressions and 42 residence-
  recovery regressions passed (194 total).** Real native dumps/restores and all
  seven actual Storage objects (3,194,064 bytes) were checked. Cloud downloads were
  read-only; no provider replies, Auth subjects or live product records were created.
  Tests cover own-key/founder/five-vote denial, pre-preparation archives, tampering,
  swapped project/database/archive bindings, checked-proof denial, unsupported
  isolation, rollback, concurrent retry, immutable history, private grants, accurate
  admin-only projections/notices, changed Storage/data/roster freshness, cancellation,
  reconnect and retained operational/Auth data. Native advisors report zero findings.
  The older residence verifier's obsolete empty-Storage assertion was corrected to
  check complete actual catalog coverage; no product behavior was changed for it.
- **17 guest/cross-site live HTTP checks passed.** TypeScript, production frontend/
  API/worker builds, built-server startup/private-file protection and live security
  advisors (zero findings) pass. All 59 hashes match; zero migrations are pending.
  Live review/preparation/evidence counts remain zero. Six Auth identities, four
  profiles and seven Storage entries remain; both new tables have RLS/no browser
  or scoped-backend grants. No new public view/RPC or SECURITY DEFINER function.
- Migration-59 signed-in browser round subsequently **passed 23 checks** on
  2026-10-13 after restarting the stopped server and reconnecting to the genuine
  signed-in tab. A first denial retry produced an unexpected response; route/status
  diagnostics were added and the next complete run captured the expected statuses,
  actual preview/capabilities and responsive controls. This establishes that run,
  not a diagnosis that every earlier timeout was resolved. No credentials or live
  consent were extracted/submitted. Evidence: `browser-acceptance-20261013/system-wipe-recovery-administrator.json`.
- User's concurrent UI request is implemented: the admin greeting in
  `PageAdminDashboard.tsx` uses larger plain black text and no text shadow/stroke.
  Existing dark-mode text contrast remains. TypeScript and production builds pass.
  A read-only inspection of the user's already-rendered signed-in tab **passed**:
  light-mode black `rgb(0, 0, 0)`, 36px, text shadow `none`, stroke `0px`, no 3D class.
  No navigation, clicks or credentials were needed for that inspection. Evidence:
  `browser-acceptance-20261013/admin-greeting-style.json`. Dark-mode/browser mobile
  greeting styles were not rechecked in this round.
- Pre-59 encrypted backup: `c31ddd88-d388-4ceb-add9-d42a3f42ccc5`. Post-59:
  `d93c8dfb-0d7a-4326-bb88-9b7e441fa1ae`. Archive/key/PIN-secret round trips pass.
  Post-59 isolated restore passes: six Auth subjects, four profiles, 35 native sessions,
  three keyed admins, seven Storage entries, 59 versions, 37 public RLS tables,
  14 private views, zero public views and catalog/runtime role boundaries. The
  replacement server is on port 3001 (tool session 24661); recheck before restarting.
- Inventory remains 195 literal endpoints, 141 implemented, 14 retired, 40 pending,
  86 inspected runtime modules and no reachable JSON imports. Latest immutable
  Storage-byte backup remains `ff6a02ce-a67c-45be-b81e-450b0c260e2a`; byte downloads
  in these verifiers change no cloud objects. Default backend remains JSON. No wipe,
  final migration reset, operational closure, writer-freeze gate or JSON deletion.

## Scoped system wipe pause and final consent checkpoint (migration 60)

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

## Remaining lifecycle task: safe operational wipe closure and retained re-entry

- Migration-60 administrator browser verification is complete at the stated evidence
  level. Do not repeat it without a relevant change or unresolved regression. For
  later checks, the verifier creates a separate task tab and closes only that tab;
  never retrieve private keys or create live wipe proposals as automated tests.
- Read `docs/migrations/system-wipe.md` and inspect closure, payment, enrollment,
  policy and immutable-history guards. Migrations 66–67 implement the native core and durable handoff. Verify
  genuine operational acceptance under the exact paused scope and current founder consent. Re-verify real recovery files,
  bytes, history, native session/key and scope at execution time. Do not enable a
  release gate or use the new consent as authority to wipe live data for testing.
- Preserve normal-wipe verified logins and account history. Inspect the primary
  context lifecycle implemented in migration 61; email re-entry is implemented at migration 63; finish its positive provider/browser acceptance; seller cycles/re-entry are implemented at migration 62.
  Do not use Auth deletion or bypass native constraints to avoid lifecycle work.
  Keep the separately reviewed migration fresh-start reset distinct from normal wipes.
- Keep private projections unexposed, RLS/ownership/session filters intact and applied
  migrations immutable. Do not enable destructive gates or wipe live data to test.
  Do not restore retired chat/recruitment/public staff-review features.
- Complete genuine provider password/email-proof, resident release, manager request/
  final-decision, annual reset and five-admin consent acceptance using private proof.
  Only three genuine live administrators currently have keys; native fixture roles
  do not satisfy real browser quorum. No fake cloud test accounts or key extraction.

## Remaining sequence before final cutover

1. Inspect current active callers and aliases. Manager cooldown reads, native operational wipe core and reviewed request/worker handoff are implemented. Finish genuine acceptance; keep public destructive gates disabled.
2. Regenerate/review the inventory against current frontend callers. Port active
   unfinished workflows only. Known unfinished work includes genuine provider/browser acceptance and pending active callers. Native closure and execution handoff are implemented at migrations 66–67. Email primary re-entry is implemented at migration 63. Seller cycles/re-entry are implemented at migration 62. Primary-only Google closure/re-entry is implemented at migration 61. Scope pauses/final consent are implemented at the stated evidence level.
   Academic-year reset is implemented at its stated native evidence level. Recheck each before coding.
3. Complete genuine verified-email/Google enrollment and manager/resident/staff,
   maintenance, seller/store/buyer/order/payment journeys, including desktop/mobile,
   light/dark and continuation/recovery behavior. Local/native checks are supporting
   evidence, not a substitute. Live payment callbacks need a real HTTPS origin.
4. Prepare the reviewed reset: exact candidates/dependencies, fresh immutable
   database **and Storage-byte** backups, restore checks, private-secret recovery,
   session controls and explicitly authorized execution. Do not casually enable
   residence deletion/account-wipe release gates.
5. After required workflows and acceptance pass, switch default dev/build/start
   to Supabase. Then remove JSON persistence/routes/imports only after verified
   cutover and preserved backups. Search the entire repo for residual references.

There is no verified number of migrations left. Plan by product workflows and
add migrations only when a required schema/guard change needs one.

## Backups and private evidence

Artifacts live under `.security/migration-reset/`. Do not commit or share private
archives, session data, keys or environment files. IDs below identify checkpoints,
not credentials. Database dumps contain Storage metadata, **not image bytes**.

| Checkpoint | Backup identifier | Evidence |
| --- | --- | --- |
| Pre-migration 52 | `65acc9be-ffd0-42dc-be14-f6c0bc1ab46f` | Full encrypted PostgreSQL backup; local restore passed |
| Post-migration 52 | `61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69` | Full encrypted PostgreSQL backup; local restore passed |
| Pre-migration 53 | `d95defeb-2a1d-48a8-8e84-e7a9d12ea551` | Full encrypted PostgreSQL backup; archive/key verification passed |
| Post-migration 53 | `a68a080d-e0aa-437d-9ac4-a670dcf4245d` | Full encrypted PostgreSQL backup; isolated restore passed |
| Pre-migration 54 | `cf8989e7-192c-4c52-9ce5-54aebc55901d` | Full encrypted PostgreSQL backup; isolated restore passed |
| Post-migration 54 | `83796b15-3ac6-4a2d-959b-cb335737c913` | Full encrypted PostgreSQL backup; isolated restore and private-view/catalog-role checks passed |
| Pre-migration 55 | `07f54620-fe5b-4e54-95b2-7bdb4643c11f` | Encrypted PostgreSQL archive/key verification passed |
| Post-migration 55 | `c2e4a944-9e0f-41f7-a417-83a5b83ac51c` | Full encrypted PostgreSQL backup; isolated restore, RLS and native PIN-key recovery passed |
| Pre-migration 56 | `b051588c-5236-438d-b80c-8d0394a3537d` | Encrypted PostgreSQL archive/key and decrypted round-trip verification passed |
| Post-migration 56 | `b3fcd7f7-4e32-4ed2-ae72-caa4e724b12c` | Full encrypted PostgreSQL backup; isolated restore, RLS, private projections and PIN recovery passed |
| Pre-migration 57 | `e88923b1-9bcb-42fb-a687-d5539427aef1` | Encrypted PostgreSQL archive/key round-trip verification passed |
| Post-migration 57 | `d0cb8495-1dad-4d21-a588-08363032a89a` | Full encrypted PostgreSQL backup; isolated restore, RLS, private projections and PIN recovery passed |
| Pre-migration 58 | `1ffe91f3-4eb5-44c1-8d53-4b783eab2fa9` | Encrypted PostgreSQL archive/key and PIN-secret round trips passed |
| Post-migration 58 | `5fc1fbaa-298c-4d3c-83a1-3eab91dd204e` | Full encrypted PostgreSQL backup; isolated restore, RLS, projections and PIN recovery passed |
| Pre-migration 60 | `e6a94cf0-6e4a-4d3a-9edb-dcf169c96bd3` | Encrypted archive/key/private-PIN recovery and isolated restore passed |
| Post-migration 60 | `ec8b04ea-6456-4059-885e-5d109ee7d3fe` | Encrypted recovery and isolated restore passed; 60 versions, 36 native sessions |
| Pre-migration 61 | `cd4f889c-d801-4102-a6f2-94f8080cab5e` | Encrypted recovery and isolated restore passed |
| Post-migration 61 | `fcd52afc-8c72-4e5e-9f83-74d54b726cf1` | Encrypted recovery and isolated restore passed; 61 versions, 36 native sessions |
| Pre-migration 63 | `b47618aa-e632-4755-9db8-6143d5120020` | Encrypted recovery and isolated restore passed |
| Post-migration 63 | `037070bb-ffc0-486d-94aa-df85246e6fe4` | Encrypted recovery and isolated restore passed; 63 versions, 36 native sessions |
| Pre-migration 62 | `c943e63a-83df-438e-89bf-cb0f4511fb79` | Encrypted recovery and isolated restore passed |
| Post-migration 62 | `a75e63fd-8c2e-42f3-adfb-9572a259a836` | Encrypted recovery and isolated restore passed; 62 versions, 36 native sessions |
| Pre-migration 59 | `c31ddd88-d388-4ceb-add9-d42a3f42ccc5` | Encrypted PostgreSQL archive/key and PIN-secret round trips passed |
| Post-migration 59 | `d93c8dfb-0d7a-4326-bb88-9b7e441fa1ae` | Full encrypted PostgreSQL backup; isolated restore, RLS/projections and PIN recovery passed |
| Pre-migration 64 | `8843dc86-6e14-4e2d-8ec4-3043c4ac6e67` | Encrypted recovery and isolated restore passed; 63 versions |
| Post-migration 64 | `06d4d770-0e63-44b4-9bbc-535d053a900b` | Encrypted recovery and isolated restore passed; 64 versions, snapshot 36 native sessions |
| Pre-migration 66 | `3b726487-4cf4-4c66-aeaf-368a7b128b05` | 1461245-byte encrypted PostgreSQL backup; private PIN recovery, RLS/grants and isolated restore passed |
| Post-migration 66 | `d3b4e2b5-88b5-4405-9030-a0f71532543f` | 1503433-byte encrypted PostgreSQL backup; 66 versions, 14 private views and isolated restore passed |
| Pre-migration 67 | `a946a0e3-116b-4347-b929-c73663b113fa` | 1503433-byte encrypted PostgreSQL backup; native restore, private PIN recovery and grants/RLS passed |
| Post-migration 67 | `2752adea-fd4c-46ec-ae5a-6c2be57752ea` | 1525252-byte encrypted PostgreSQL backup; 67 versions, 14 private views and restore passed |
| Pre-migration 68 | `e216fb51-25e4-410c-be6b-e459b7a91ef0` | 1525326-byte encrypted PostgreSQL backup; isolated restore, private PIN recovery and RLS/grants passed |
| Post-migration 68 | `a9319d64-ecdb-4369-a60d-63b7e18ba479` | 1525193-byte encrypted PostgreSQL backup; 68 versions, isolated restore, PIN recovery and RLS/grants passed |
| Post-genuine manager signup/application | `338c3cef-ddb7-48f3-ac1c-bca0c31f0384` | 1529226-byte encrypted DB backup; 69 versions, private server key/access controls/full restore passed; exact created-manager state verified without changing 120 tables |
| Matching post-signup Storage bytes | `003b60f3-4d45-4651-a28c-eadc108876a6` | Seven objects / 3194064 bytes; encrypted and all reconstructed locally, including one orphan and one folder marker; writer freeze not asserted |
| Pre-enrollment application | `c0857019-ed75-49ec-8af8-259763368f4f` | 27 migrations, zero app profiles; isolated verifier application checkpoint |
| Earlier complete Storage bytes | `ff6a02ce-a67c-45be-b81e-450b0c260e2a` | Six PNGs plus zero-byte folder marker; encryption/local reconstruction checked |

The pre/post-52 database restores retained six Auth subjects, four profiles,
34 native sessions, three keyed active administrators and seven Storage catalog
entries, plus private PIN recovery/grants/RLS. These are continuation backups;
no writer-frozen final cutover, off-host copy or new provider Storage restore is
claimed. Refresh the evidence before a destructive operation.

The post-53 restore retained six Auth subjects, four profiles, 35 native sessions,
three keyed active administrators, seven Storage catalog entries and all 53 versions.
Its 37 public tables have RLS; guest profile access and backend BYPASSRLS remain absent.

The post-54 restore preserved those same account/session/catalog counts plus all
54 versions, zero public views, 14 private views and the catalog role's no-login,
no-inheritance and no-BYPASSRLS properties. Storage image bytes were unchanged.

The post-55 restore retained the same six Auth subjects, four profiles, 35 native
sessions, three keyed administrators and seven Storage catalog entries, plus all
55 versions and the same RLS/private-view/catalog-role boundaries. No live product
closure or Storage byte change was performed in this round.

Sanitized acceptance artifacts: `.security/migration-reset/browser-acceptance-20261012/`
contains `residence-change-checks.json`, `resident-profile-checks.json`,
`authenticated-read-checks.json`, `guest-checks.json`,
`session-restoration-authenticated.json`, `session-restoration-guest.json` and
`portal-security-administrator.json`, `password-security-http.json`,
`password-security-administrator.json`, `password-recovery-guest.json`,
`manager-closure-http.json`, `manager-closure-administrator.json` and
`view-exposure-administrator.json`, `resident-closure-administrator.json` and
`unassigned-manager-closure-administrator.json`.
The view HTTP/native/advisor reports and `resident-closure-native.json`,
`resident-closure-http.json`, `unassigned-manager-closure-native.json`,
`unassigned-manager-closure-http.json`, `unassigned-manager-native-advisors.json`
and `unassigned-manager-live-advisors.json` are directly under `.security/migration-reset/`.

## Runtime and browser handoff

Server restarted for this round: `node --import tsx supabase-server.ts` at
`http://127.0.0.1:3001`, Vite HMR port 24678. Recheck listeners/process ownership;
do not start a duplicate or kill unrelated Node/browser processes.

The user explicitly enabled Chromium remote debugging at `127.0.0.1:9222` and
signed in with Google. A browser verifier attached only to the PineVela tab;
the latest round verified administrator own-approval-key, stale-context, missing
residence and ownership-selector denial for the annual room reset. Preserve that real session where available.

Current server tool session: `64195` (migration 67); session IDs may not transfer to another
agent/thread. Previous servers `4543`, `70133`, `2115`, `65465`, `91153`, `90076`, `20699`, `87305`, `53045`, `16942`, `75424` and browser driver `68899` are historical,
not current live handles. The temporary read-only bridge used this round was closed
without closing Chromium. The browser acceptance script attaches directly to the
approved PineVela tab and disconnects afterward, leaving the browser signed in.

Use [verify-supabase-session-browser.cjs](scripts/verify-supabase-session-browser.cjs)
for focused checks: default mode uses an isolated guest profile; `--authenticated`
uses the existing signed-in administrator tab and brings it to the foreground
for timed checks. Keep workspace files unchanged while timing checks run: Vite
full reloads from documentation/script edits can restart the watchdog. Background
timing is not asserted. Chromium may request approval for
each new connection. No keys/cookies need to be shared. Older private driver source
remains in the evidence directory for reference; its old `suite` has the field-name
caveat recorded in earlier status, and should not be blindly rerun.

Chromium's protected remote debugging may reject HTTP `/json/version`. The local
`/home/wyse/snap/chromium/common/chromium/DevToolsActivePort` contains its browser
WebSocket path. Do not print it or extract unrelated browser data. A new attach
may require the user's browser connection consent. Keep the PC/browser running;
the earlier shutdown request is not a current instruction.

## Useful verification commands

Run from this repository. Review each script before execution; older scripts may
assume a pre-enrollment live database. Never blindly replay them against live data.
Use `node --import tsx` where the tsx CLI's IPC socket is sandbox-blocked.

```bash
node --import tsx scripts/audit-supabase-cutover.ts
npx tsc --noEmit
npm run test:account-refresh
npm run test:session-restoration
node --import tsx scripts/verify-supabase-portal-security.ts 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69 c0857019-ed75-49ec-8af8-259763368f4f
node scripts/verify-supabase-portal-browser.cjs
node scripts/verify-supabase-session-browser.cjs
node scripts/verify-supabase-session-browser.cjs --authenticated
node --import tsx scripts/verify-supabase-manager-closure.ts 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69 c0857019-ed75-49ec-8af8-259763368f4f
node scripts/verify-supabase-manager-closure-browser.cjs
node --import tsx scripts/verify-supabase-view-exposure.ts a68a080d-e0aa-437d-9ac4-a670dcf4245d c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-view-http.ts
node --import tsx scripts/verify-supabase-live-advisors.ts
node scripts/verify-supabase-view-browser.cjs
node --import tsx scripts/verify-supabase-unassigned-manager-closure.ts c2e4a944-9e0f-41f7-a417-83a5b83ac51c c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-unassigned-manager-closure-http.ts
node scripts/verify-supabase-unassigned-manager-closure-browser.cjs
node --import tsx scripts/verify-supabase-resident-closure.ts 83796b15-3ac6-4a2d-959b-cb335737c913 c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-resident-closure-http.ts
node scripts/verify-supabase-resident-closure-browser.cjs
node --import tsx scripts/verify-supabase-residence-changes.ts 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69 c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-resident-profiles.ts 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69 c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-http.ts
node --import tsx scripts/verify-supabase-system-wipe-reviews.ts 5fc1fbaa-298c-4d3c-83a1-3eab91dd204e c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-system-wipe-reviews-http.ts
node scripts/verify-supabase-system-wipe-reviews-browser.cjs
node --import tsx scripts/verify-supabase-system-wipe-recovery.ts d93c8dfb-0d7a-4326-bb88-9b7e441fa1ae c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-system-wipe-recovery-http.ts
node scripts/verify-supabase-system-wipe-recovery-browser.cjs
node --import tsx scripts/rehearse-supabase-backup.ts d93c8dfb-0d7a-4326-bb88-9b7e441fa1ae
```

For startup only if no existing server is listening:
`node --import tsx supabase-server.ts`. Dedicated scripts include
`npm run dev:supabase`, `npm run build:supabase` and `npm run start:supabase`.
Database/browser network access may require sandbox escalation; do not weaken TLS
or RLS to make a check pass. Applied migrations and their ledger hashes are immutable.

Already-configured private environment variable names include `DATABASE_URL` or
`SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_CA_FILE` and `MARKET_ORDER_PIN_KEY_FILE`. Verify presence without
printing values. Server secrets must never become `VITE_` variables or client code.

## Ready-to-copy continuation instruction

> Read SUPABASE_CONTINUATION.md, AGENTS.md and the latest implementation-status
> section. Preserve the dirty worktree, real identities, private artifacts and JSON.
> Initial Auth recovery and own portal PIN security are complete at their stated
> evidence levels. Email-password change/recovery is implemented with successful
> provider acceptance pending. Assigned-manager closure requests are implemented
> at migration 53, with genuine manager browser acceptance pending. Migration 54
> resolves the 14 view findings; live advisors report zero findings. Immediate resident
> release is implemented with current PIN or a verified sign-in less than five minutes
> old. Genuine resident browser/fresh-sign-in acceptance is pending. Migration 55
> implements reviewed unassigned-manager portal closure. Migration 56 implements retained-manager
> re-enrollment at its stated native evidence level. Migration 57 implements academic-year room reset.
> Migration 58 implements system wipe previews, five separate own-key approvals
> including the founder and a separate founder backup-preparation decision. Normal
> wipes retain verified logins and account history. Migration 59 adds founder
> preparation/cancellation and operator-only evidence from actual restored
> PostgreSQL and encrypted Storage bytes. Migration 60 adds scope pauses/final consent;
> migration 61 adds a narrow primary-only closure core and verified Google re-entry.
> Live execution remains disabled. Migration 63 implements verified email primary re-entry with 172 native checks,
> 13 HTTP, three authenticated and 22 guest browser checks. Migration 64 implements
> keyed verified officer invitations, native room-key delivery and admin store/cooldown
> reads, with 334 native, 20 HTTP and 36 browser checks. The manager cooldown caller is
> implemented at its stated native/API evidence level. Migration 65 seals exact wipe
> review/pause dependencies, with 274 native assertions, live hashes/grants, restored
> backups and zero advisor findings. Migration 66 implements the operational closure core,
> with 391 native assertions and preserved withdrawal evidence. Migration 67 completes the
> durable own-key request/worker handoff with 280 native assertions. Finish genuine
> acceptance and remaining active callers; keep destructive gates disabled.
> Inspect semantic inventory before adding schema; do not restore
> dormant documents, synthetic card checks or additional-room enrollment. Continue general
> operational closure and genuine provider/operational acceptance,
> preserving shared identities, portal PINs and reviewed deletion/backup gates.
> Continue the active pending Supabase workflows from current callers and the
> inventory. Keep Express authorization/RLS, avoid retired features and fake Auth
> data, and report native/API/browser evidence separately. Do not perform final
> reset, enable destructive gates or delete JSON before the reviewed backup and
> acceptance prerequisites are satisfied.
