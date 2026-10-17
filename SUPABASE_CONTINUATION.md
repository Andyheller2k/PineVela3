r# PineVela Supabase progress and continuation

Checkpoint: 2026-10-12. Workspace: `/home/wyse/Documents/PineVela3`.

This handoff records the last verified migration round. It is not a declaration
that cutover is complete. Recheck runtime, browser and database state before work.
No runtime implementation or data was changed while creating this document.

## Objective and current state

Move the current PineVela product to Supabase PostgreSQL, Auth and Storage as its
sole persistent source. Design from current requirements, rather than copying
every old JSON entity. Express remains the server-side API and authorization layer.

| Area | Last verified checkpoint |
| --- | --- |
| Applied migrations | 52; latest `20261012145716_reviewed_residence_changes.sql` |
| Replacement server | `supabase-server.ts`, local HTTP port 3001 |
| Default backend | Still legacy JSON; final switch has **not** happened |
| JSON/data removal | **Not performed**; preserve existing data and backups |
| Literal endpoint inventory | 195 total: 137 implemented, 13 retired, 45 pending |
| Founder/admin enrollment | Genuine Google signup, founder setup, invitations and recovery verified |
| Next reproduced issue | Temporary initial Auth failure sends a valid session to login |
| Final acceptance/reset | Still pending; native checks do not replace genuine browser journeys |

Endpoint counts are source inventory, not counts of remaining workflows or
migrations. Review actual callers and mounted aliases before implementing any
pending entry. Do not reintroduce retired features to increase coverage.

## Read first

- [Agent rules](AGENTS.md), [architecture](ARCHITECTURE.md),
  [product rules](docs/product-rules.md), [auth](docs/auth.md),
  [database](docs/database.md), [security](docs/security.md).
- [Implementation status](docs/migrations/supabase-implementation-status.md):
  authoritative chronological evidence; newest checkpoint is at the top.
- [Current application audit](docs/migrations/current-application-audit.md),
  [schema design](docs/migrations/schema-design.md),
  [API inventory](docs/migrations/api-cutover-inventory.json).
- [Fresh-start procedure](docs/migrations/supabase-fresh-start.md),
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

## Next task: fix temporary failure during initial Auth restoration

This is **reproduced and unfinished**, distinct from the fixed server shutdown bug.
A real reload produced two initial `/api/auth/me` requests: an early 503 after
about 11 seconds, then 200 after about 24 seconds for the still-valid founder.
The failed result ended loading while `user` was null, so the protected route
navigated to login. The later successful restoration did not return to the portal.

Inspect together:

- [AuthContext.tsx](src/context/AuthContext.tsx): startup `initAuth` effect near
  line 79 has no cleanup/generation coordination, retry or restoration-error state.
  Non-success is treated as invalid/expired; completion unconditionally ends loading.
- [ProtectedRoute.tsx](src/components/ProtectedRoute.tsx): loading skeleton versus
  null-user redirect.
- [session.ts](src/lib/session.ts): actual transport and unauthorized broadcasts.
- [PageUnifiedLogin.tsx](src/components/PageUnifiedLogin.tsx): route continuation.
- [accountRefresh.ts](src/lib/accountRefresh.ts): existing coalescing mechanism;
  inspect before reuse. React StrictMode duplication is a possibility, not a proven
  complete diagnosis.

Required behavior: temporary network/503 failures must not silently classify a
valid session as signed out. Coordinate startup requests, use bounded retry and
an honest retry/error state, and prevent old responses overwriting a newly chosen
identity after login/logout/portal changes. Only server-validated identity grants
access; cached users must never bypass authorization.

Be careful aborting Auth refreshes: a lost Set-Cookie response can matter when
tokens rotate. Verify the actual cookie/session protocol. Test genuine restored
sessions with delayed actual requests, plus invalid-session and identity-change
cases. Do not replace provider/API replies with mocked successful authentication.

## Remaining sequence before final cutover

1. Fix and verify the startup Auth issue above.
2. Regenerate/review the inventory against current frontend callers. Port active
   unfinished workflows only. Known review candidates include manager password
   change, registered-account reset/deletion, academic-year room/key changes and
   remaining administrator/account-wipe operations. Recheck each before coding.
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
| Pre-enrollment application | `c0857019-ed75-49ec-8af8-259763368f4f` | 27 migrations, zero app profiles; isolated verifier application checkpoint |
| Last complete Storage bytes | `ff6a02ce-a67c-45be-b81e-450b0c260e2a` | Six PNGs plus zero-byte folder marker; encryption/local reconstruction checked |

The pre/post-52 database restores retained six Auth subjects, four profiles,
34 native sessions, three keyed active administrators and seven Storage catalog
entries, plus private PIN recovery/grants/RLS. These are continuation backups;
no writer-frozen final cutover, off-host copy or new provider Storage restore is
claimed. Refresh the evidence before a destructive operation.

Sanitized acceptance artifacts: `.security/migration-reset/browser-acceptance-20261012/`
contains `residence-change-checks.json`, `resident-profile-checks.json`,
`authenticated-read-checks.json` and `guest-checks.json`.

## Runtime and browser handoff

Last known server: `node --import tsx supabase-server.ts` at
`http://127.0.0.1:3001`, Vite HMR port 24678. Recheck listeners/process ownership;
do not start a duplicate or kill unrelated Node/browser processes.

The user explicitly enabled Chromium remote debugging at `127.0.0.1:9222` and
signed in with Google. A private driver was attached only to the PineVela tab;
last view was administrator Alerts with the owned photo, empty request list and
manager-key recovery controls. Preserve that real session where available.

Previous tool sessions: server `20699`, browser driver `68899`. These may not
transfer to another agent/thread and are not proof that either process is alive.
Driver source is saved at
`.security/migration-reset/browser-acceptance-20261012/authenticated-browser-driver.cjs`;
the running copy was `/tmp/pv-authenticated-browser-driver.cjs`.
Its JSON-line interface supports `evaluate`, `reload` and DevTools `command`.
Output only sanitized statuses/counts; never cookies or key values. The old running
`suite` function used the wrong `approvalKeyEnrolled` field; actual field is
`keyEnrolled`. Inspect/reload the saved driver rather than trusting that old suite.

Chromium's protected remote debugging may reject HTTP `/json/version`. The local
`/home/wyse/snap/chromium/common/chromium/DevToolsActivePort` contains its browser
WebSocket path. Do not print it or extract unrelated browser data. A new attach
may require the user's browser connection consent. Keep the PC/browser running;
the earlier shutdown request is not a current instruction.

## Useful verification commands

Run from this repository. Review each script before execution; older scripts may
assume a pre-enrollment live database. Never blindly replay them against live data.
Use `node --import tsx` where the tsx CLI's IPC socket is sandbox-blocke

```bash
node --import tsx scripts/audit-supabase-cutover.ts
npx tsc --noEmit
npm run test:account-refresh
node --import tsx scripts/verify-supabase-residence-changes.ts 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69 c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-resident-profiles.ts 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69 c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-http.ts
node --import tsx scripts/rehearse-supabase-backup.ts 61ac6050-fa8b-46b9-a0bf-d42e1a7b0c69
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
> First fix the reproduced temporary initial Auth restoration failure, inspecting
> transport, route guards and identity-change races; verify with genuine sessions.
> Then continue the active pending Supabase workflows from current callers and the
> inventory. Keep Express authorization/RLS, avoid retired features and fake Auth
> data, and report native/API/browser evidence separately. Do not perform final
> reset, enable destructive gates or delete JSON before the reviewed backup and
> acceptance prerequisites are satisfied.
