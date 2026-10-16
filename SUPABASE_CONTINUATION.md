# PineVela Supabase continuation

Cutover checkpoint: 16 October 2026. Workspace: `/home/wyse/Documents/PineVela3`.

Latest follow-up: logout and shared authenticated-request latency. Native logout
now commits one exact binding revocation before replying; bounded provider cleanup
follows. Session/policy discovery and ordered transaction setup use fewer SQL
round trips. Immediate pending feedback and cache clearing prevent silent waits
and logout refetches. The controlled logout comparison was 5,334 → 252 ms;
15 real local browser logouts took 83–1,685 ms. Verification passed 96 regressions,
416 browser assertions, 43 native transaction checks, 45 directory HTTP checks,
11 session-policy checks and 28 logout/maintenance security checks. See
`docs/operations/latency.md` for exact conditions and hosted timing limits.

## Current runtime

Supabase PostgreSQL, Auth and private Storage are now the sole application
persistence. Default `npm run dev`, `npm run build` and `npm run start` select
`supabase-server.ts` and the native build. The `:supabase` names are aliases.
Express remains the API and server-side authorization layer. The two separate
native workers and their disabled execution gates are preserved.

Forty JSON/custom-session runtime modules are removed, including `server.ts`,
`localDb.ts`, `persistentDb.ts`, `jsonStoreSafety.ts` and `sessionSecurity.ts`.
Shared helpers retain only native credential, queue, validation and provider logic.
Persistence flags and JSON fallback branches are removed from the frontend.
Unknown API operations return 404. Retired chat, public staff recruitment and
unrestricted reviews remain absent; buyer–seller messaging remains supported.

The owner classified all reviewed legacy records as development data and explicitly
authorized archival while retaining the current Supabase accounts. Exactly 29
legacy data/upload files, 32,690,351 bytes, and the old compiled build are moved
out of active paths into private recovery storage. Every original digest matches
the independently restored encrypted checkpoint
`9879d6a8-2d6a-4351-9eaa-3108d6bc5035`. `data/`, `uploads/` and the old
`dist/server.cjs` are absent. No business record was imported from that archive.

Final hosted READ ONLY retention passed 23 checks: all seven Auth subjects, six
profiles and ten contexts retain the exact pre-cutover UUID sets. Provider labels
do not decide retention. No hosted account, business or Storage mutation was made
by the isolated tests or archival. Paystack is unchanged; the owner reports it
already tested and explicitly requested leaving it alone.

## Verification and fixes

The production administrator-directory timeout follow-up replaces eight parallel
HTTP reads with one protected aggregate and two existing authorization scopes.
Its 39 genuine SQL parity/security checks, 45 actual local HTTP checks and full
96-test regression suite pass. The 30-second deadline remains; timeout feedback
is readable and bulk polling is slower. Paystack remains unchanged. See
[latency evidence](docs/operations/latency.md).

The rebuilt browser follow-up passed 404 checks, including a genuine successful
reply held past the deadline and subsequent Retry recovery, with zero runtime
exceptions. Production is restarted on the existing loopback address.

Separate completed suites, not a cumulative unique-check count:

- 27 actual local signup/confirmation/session checks and 30 native
  administrator/officer invitation/key checks.
- 32 real-token PostgREST/Storage/RLS checks; 105 account/profile/recovery/inbox
  checks; 125 immutable migration, RLS, role/grant and function exposure checks.
- 128 native housing/market workflow assertions, plus 26 pricing-quorum and
  16 maintenance/recovery assertions. Two full housing journeys cover allocation,
  staff, reviews and repairs; two stores cover activation, listings, messages,
  orders, handover PINs, stock and purchase reviews.
- 14 authentication concurrency checks: nine simultaneous native API reads now
  share one pending actual GoTrue `/user` request. Later requests verify again,
  tokens never mix, failures are not cached and logout still revokes access.
- 89 retained security/unit checks passed, including real Google redirect and
  cancelled-callback checks with zero created accounts. Frontend/backend
  TypeScript, native build and built-server public/privacy verification passed.
- 365 actual browser assertions passed before final source retirement; a separate
  final run passed 392 after retirement and the real stack restart: eight
  role contexts, native login/logout/reload, cross-role route/API denial,
  375/1440px light/dark, actual storefront messages, failed reads/retry, slow-read
  coalescing and staff account switching. No browser exception or cloud write.

Actual workflows exposed approvals accepted without the independent own key.
Manager, residence and seller approvals now commit the failed-guess check and
revalidate actor/key version inside the mutation transaction. Missing, incorrect,
settings and other-administrator keys are rejected; the owner's key succeeds.
Direct manager/residence UI actions use the existing transient approval prompt.

Further verified fixes coalesce staff/seller polling, share the primary registration
query, preserve explicit administrator/seller/officer read errors and retry, and
prevent an old account's response from populating a new portal. Native manager GPS
and administrator account totals use actual saved values; obsolete synthetic
identity-card and unreachable JSON onboarding UI are removed.

Common entry JavaScript is now 284,896 bytes versus the measured 859,463-byte
baseline (67% smaller); gzip at level 9 is 91,762 bytes. Local native non-auth
business HTTP p50/p95/max was 143/319/388 ms. Browser readiness and hosted database
latency are distinct; these local measurements are not hosted latency guarantees.
See [latency](docs/operations/latency.md) and
[isolated acceptance](docs/migrations/isolated-workflow-acceptance.md).

## Final runtime verification

The post-retirement native build and configured-project default server restart
passed. The server runs at http://127.0.0.1:3001; 22 current public/private/runtime
checks passed. The final rebuilt browser run passed 392 assertions, 14 native UI
logins and 504 API requests, with zero exceptions. All 88 durable table fingerprints
(1,053 rows) and seven Storage objects / 10,484 bytes match across a real local
stack restart. Temporary test services are stopped; their data/metadata remain.

A final npm audit found and prompted the compatible `source-map-js` 1.2.2 patch.
Only that transitive lockfile entry changed; audit now reports zero vulnerabilities.
The rebuild preserves the verified frontend hash. All 89 final unit/security checks pass, including
three bounded source-map regression cases. See the latency report for its source.

Tests use real local Supabase services and captured SMTP, without external email
quota or provider/JWT fabrication. The sole local founder fixture is guarded by an
initially empty, run-owned database; subsequent roles use native invitations and
onboarding. Local confirmation capacity is raised only in the private test stack.
Product rate limits, hosted TLS checks, RLS and private-key policies remain intact.

The source-only native contract inventory is regenerated from the actual import
graph. Historical route evidence is preserved in `legacy-api-contracts.json`;
computed URL families still require workflow evidence. The pre-cutover progress
record is [archived](docs/migrations/history/supabase-pre-cutover-2026-10-15.md).

## Recovery and next work

Private retirement receipt: `.security/migration-reset/legacy-development-retirement.json`.
The old development records remain recoverable; the product cannot read them.
Hosted DB checkpoint `ebd5a53c-e4d5-4be2-8b0d-fd31bbf3c017`, matched Storage
`c4a45734-f72e-4773-abff-fd98df7d085d` and matching private delivery-PIN key
remain preserved. The earlier approved Premuim Pine cleanup removed exactly four
housing rows and retained the real manager/identity/key/history; its 44-check
post-verification remains separate evidence.

Real-user testing is the next product step. These checks do not establish a
physical property inspection, live SMTP delivery, every nested UI form or a new
payment-provider acceptance. Preserve genuine Google evidence and current accounts;
never use dummy accounts in the configured hosted project. Replacing Express is a
separate future phase requiring its own acceptance, not part of this cutover.
