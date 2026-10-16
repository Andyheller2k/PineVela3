# Isolated Supabase workflow acceptance

15–16 October 2026. The owner authorized dummy accounts in an isolated local stack
to avoid repeated manual sign-ins and external email quota. These tests use the
actual Supabase Auth, PostgreSQL, PostgREST, Storage and captured SMTP services,
the original application migrations and the native Express API. No test identity
or business record is inserted into the configured hosted project.

The CLI native runtime is experimental. Its local PostgreSQL gateway connects
upstream over a Unix socket. Only the test harness accepts the resulting NULL
server-address fields; the product's hosted TLS/pooler checks remain unchanged.
Private run metadata must point to literal loopback endpoints and an initially
empty database with an exact run-ownership nonce. Provider and application replies
are real. No JWT is invented and no public role or ownership is granted by fixtures.
The first local founder is the sole guarded bootstrap exception; subsequent roles
follow actual native signup, invitation, inspection and review workflows.

## Verified checkpoints

| Verifier | Actual evidence |
| --- | --- |
| `verify-supabase-local-auth.ts` | 27 checks: signup, captured confirmation, unconfirmed denial, actual cookies, role/ownership admission and immediate logout revocation |
| `serve-supabase-local-workflow.ts` | 30 checks: five independently confirmed administrators, native invitations, separately issued approval/settings keys, and a verified officer invitation/login |
| `verify-supabase-local-rls.ts` | 32 checks: two actual application-issued identities/tokens; direct own reads, foreign reads/writes and role escalation, private schema/RPC boundary, denied raw Storage upload and immediate RLS revocation |
| `verify-supabase-local-account-security.ts` | 105 checks: captured recovery proof, wrong identity/replay/old credential rejection; private avatars, profile ownership, administrator messages, notification isolation, retired feature and staff restrictions |
| `verify-supabase-local-schema-security.ts` | 125 checks: 69 immutable migration hashes; all 37 public tables have RLS; 14 private projection views, role/grant restrictions and no exposed privileged functions |
| `lib/local-supabase-pricing.ts` | 26 checks: real three-administrator pricing quorum and founder application. Only this owned test run uses zero activation/plan fees, without payment-provider calls |
| `verify-supabase-local-auth-concurrency.ts` | 14 checks: nine simultaneous API reads use one actual pending GoTrue verification; separate tokens remain separate, settled/failed results are not cached, logout still revokes access |
| `verify-supabase-local-workflows.ts` | 128 completed assertions: two housing/market journeys, native approval keys, allocations, staff, reviews, repairs, messages, order handover, stock, RLS and independent-connection persistence; plus 16 maintenance/recovery checks |
| `verify-supabase-local-browser.cjs` | 365 actual pre-retirement browser assertions across eight roles; native login/logout/reload, role/API denial, 375/1440px light/dark, read failure/retry, held-response coalescing and staff account switching |
| Native stack restart | 88 durable table fingerprints / 1,053 rows and seven actual Storage objects / 10,484 bytes unchanged across a real stop/start of the owned local stack |
| Default checks | 89 security/unit checks, native TypeScript/build, built-server public/privacy checks, 23 final hosted read-only retention checks |

The first authentication concurrency measurement used nine provider requests for
nine simultaneous API reads. The fix shares only a pending `/user` GET for the
same access token. A later request contacts GoTrue again; each API transaction
still checks the current native session, account policy and role in PostgreSQL.
The regression test holds delivery of actual provider replies for 200 ms to
exercise overlap. It does not fabricate their contents.

The completed local business and browser runs established the cutover gate. The
owner then explicitly classified the older JSON records as development data and
authorized archival, retaining the current Supabase accounts. Default commands
now select Supabase; 40 legacy runtime modules and persistence switches are
removed. Unknown API operations return 404. The rebuilt post-retirement browser
rerun passed a separate 392 assertions, with 14 actual UI logins, 504 API requests
and zero exceptions. Credential-free summaries are saved privately.

## Administrator directory timeout follow-up

The production bulk directory read now authenticates once for eight existing
projections, with separate privileged administrator and scoped RLS transactions.
The 30-second deadline remains, readable retry feedback covers both headers and
body parsing, and bulk polling uses a 30-second interval.

The genuine restored-checkpoint verifier passed 39 projection/authorization/lock
checks with unchanged Auth, public and private table fingerprints. The local
GoTrue/HTTP verifier passed another 45 checks, including exact individual endpoint
parity, guest and wrong-role denial, stale contexts, identity selectors and logout.
Seven real loopback transport/cancellation regressions are included in the full
96-test suite, which passes with no skipped tests. TypeScript and the native
frontend/server/worker production build pass. Hosted SQL timings and their limits
are documented in [latency evidence](../operations/latency.md).

The new rebuilt browser run passed 404 assertions with 15 actual UI logins,
513 API requests and zero runtime exceptions. It verifies one bulk request,
network error/retry, an actual successful response delayed past the unchanged
30-second deadline, readable timeout feedback, no false empty directory and a
fresh successful Retry. No cloud mutations or email/payment requests occurred.

## Approval-key defect found by actual workflows

Actual manager and residence approvals returned 200 without `privateKey`. Their
Supabase routes checked the administrator role but omitted the prior independent
approval-key boundary. Seller approval also rejected the UI's key as an unsupported
business field. `administratorApproval.ts` now commits key-attempt checks before
denial and rechecks the exact actor/key version inside the mutation transaction.
Manager and residence direct forms use the existing transient key prompt. Seller
approval keeps that prompt and separates its credential from business fields.

The actual workflow rerun rejects missing, incorrect, settings and another
administrator's keys, then accepts the owner's current approval key. Rejection
and request-for-information retain their existing policy.

## Recovery and limits

Encrypted legacy checkpoint `9879d6a8-2d6a-4351-9eaa-3108d6bc5035` contains
29 files / 32,690,351 bytes. An independent offline restore verified every hash,
without replacing active files. At cutover, all 29 unchanged originals and the old
build were moved into private recovery storage; active data/upload roots are absent.
Previous hosted database and matched Storage recovery archives remain.

These local checks do not establish Google OAuth, real SMTP delivery or physical
property inspection. Earlier genuine Google acceptance remains separate evidence.
The owner reports Paystack already tested and explicitly requests leaving it
unchanged. No live charge or external payment-provider test is performed here.

Run scripts with the absolute private local-stack metadata path. Credentials,
captured mail, keys and detailed receipts stay in the private run directory. Never
pass the configured hosted environment to the local harness or publish its fixtures.
