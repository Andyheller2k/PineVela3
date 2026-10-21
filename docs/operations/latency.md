# PineVela latency evidence

## 17 October 2026: asset delivery and background work

Production frontend delivery now negotiates Brotli/gzip and gives generated
assets an immutable one-year cache lifetime. HTML revalidates for current release
hashes. API authentication, no-store responses, event streams and private-path
denials stay outside this static delivery middleware. Actual HTTP checks compare
decoded responses byte-for-byte with the build and cover validators, HEAD,
ranges and forbidden encodings.

Maps in the primary/seller dashboards load on demand with a readable, closable
loading state. Seller inventory and orders run concurrently after verified store
status. Seller polling pauses in hidden tabs and refreshes on visibility return.
Notification read-ID persistence batches new IDs and skips unchanged IDs rather
than rewriting storage for every read notice on every refresh.

| Measured path | Before | After |
| --- | --- | --- |
| Entry JS transfer with accepted compression | 301,638 bytes, identity | 98,020 bytes, Brotli (about 68% smaller) |
| Current stylesheet delivery | 259,834 raw bytes | 33,214 Brotli bytes (87% smaller, identical decoded bytes) |
| Three unchanged real inbox refreshes | 42 storage writes | 0 storage writes |
| Optional map JS requested during primary startup | 179,238 bytes across two chunks | 0 bytes until requested |
| Seller API cycle with controlled 300ms delivery delay per genuine response | 1,561ms, sequential inventory/orders | 1,003ms, concurrent inventory/orders |
| Hidden seller API reads during 11.5 seconds | 3 | 0 |

These are local before/after observations, with actual native Auth, database and
API replies; the seller timing includes an explicit controlled delivery delay,
not a hosted latency claim. No fabricated account sessions, replies or catalog
records are used. Public API responses and recipient/account isolation remain
server-authorized; this adds no private-data cache or database migration.

Verification passed the production build, TypeScript, 30 focused regression
tests and 107 real native-browser checks covering dashboard returns, themes,
notification acknowledgements, account isolation and deferred-map controls.
The 37 HTTP delivery/security checks passed on both the isolated preview and
the restarted main app at `http://127.0.0.1:3001`.

`scripts/measure-supabase-performance-browser.cjs <private-runtime.json> baseline|after`
captures the browser comparison on an owned support preview.
`scripts/verify-static-delivery.cjs <loopback-origin> after-preview|after-main`
checks actual built asset bytes and delivery/security headers. Raw evidence stays
in private artifacts. Existing latency evidence follows below.

16 October 2026. Supabase is now the sole runtime persistence; archived development
JSON is not read by the application. Figures below distinguish local workflow
measurements from earlier hosted transport observations.

## Verified changes

- Ordered transaction admission locks use one query instead of separate remote
  round trips, preserving lock order/modes, actor/session policy and RLS.
- One existing pool connection survives quiet periods; additional connections
  still expire. TLS, pool limits and statement/query deadlines remain unchanged.
- Simultaneous requests using the same access token share only a pending actual
  GoTrue `/user` GET. Nine actual concurrent API reads used nine provider calls
  before and one after. Settled/failed results are not cached, different tokens
  do not mix and native session revocation is checked for every API transaction.
- Native dashboard reads run concurrently. Staff, seller, officer and message
  refreshes coalesce; old-account reads are cancelled or ignored. Primary
  notifications and dashboard share one account-scoped registration query.
- Failed administrator, officer and seller reads expose retry, rather than false
  empty data/onboarding. Background governance polls use a slower cadence.
- Public/login routes and maps load separately; guest pages open no native SSE.
  Obsolete JSON onboarding and synthetic identity-card tooling are removed.

## Measurements and limits

| Observation | Verified result |
| --- | --- |
| Common entry JavaScript | 859,463 → 284,896 bytes, 67% smaller; gzip level 9 now 91,762 bytes |
| Login chunk after obsolete wizard removal | 75.01 → 34.80 kB raw; 21.94 → 9.25 kB gzip |
| Actual same-token authentication requests | Nine simultaneous API reads: 9 → 1 actual provider request |
| Local native non-auth business HTTP | p50 143 ms; p95 319 ms; maximum 388 ms |
| Local final portal login → visible | Eight roles: 2,045–6,476 ms; required API completion tracked separately |
| Earlier hosted four-lock phase | Separate 3,129/2,991 ms; batched 215/865 ms |

The final browser run passed 392 assertions after source retirement and a real
local database/Auth/Storage restart. It includes exact identities, API responses,
responsive themes, failed reads/retry, delayed genuine response delivery and
logout/account switching. No runtime exceptions or guest event-stream retries.
These are local observations, not a hosted latency guarantee. Earlier genuine
hosted guest reads still showed variable network delay; no fresh authenticated
hosted performance benchmark is claimed.

A final dependency audit found one high-severity indexed-source-map denial of
service. Only the locked transitive `source-map-js` changed, 1.2.1 → 1.2.2;
install scripts were disabled. The [maintainer release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)
identifies the fix. The rebuilt entry retains the same hash; dependency audit
reports zero known vulnerabilities. A bounded-worker regression checks a hostile
trillion-line section offset without exposing the application event loop.

Detailed completed checks and coverage limits are in
[isolated acceptance](../migrations/isolated-workflow-acceptance.md) and
[frontend coverage](../migrations/frontend-workflow-coverage.md). Raw test fixtures,
credentials and recovery artifacts remain private; no cloud dummy records or
real email deliveries were used. Paystack is unchanged as requested.

## Administrator directory timeout follow-up

The production dashboard reported the browser's raw `signal timed out` message.
Its eight bulk directory GETs shared a 30-second deadline, and each repeated
maintenance, provider/session discovery and database authorization. A failure in
one request discarded the entire group. Independent review and roster reads
also competed for the same bounded connection pool.

`GET /api/admin/dashboard-directories` now authenticates once and reuses the
eight existing projections through two concurrent transactions. Privileged
administrator projections use `authorizedRead`; housing and seller views use
`readActor` with the actual `pinevela_backend` RLS role. Each transaction retains
the live binding, policy, maintenance and governance checks. Captured context
headers and identity query selectors cannot choose another account. Existing
individual endpoints and Paystack implementation remain unchanged.

Bulk polling is 30 seconds, with polling stopped after an error. The request
deadline remains 30 seconds and includes reading the response body. Account/query
cancellation remains cancellation; timeouts display actionable retry feedback.
Successful cached data remains visible during a failed refresh.

Verification: 39 genuine restored-database checks prove exact projection parity,
the two transactions, RLS roles, identity denials, governance exclusion and
unchanged table fingerprints. Another 45 actual local GoTrue/HTTP checks cover
all eight existing endpoint replies, unsigned/wrong-role/context/selector denial
and immediate logout revocation. The local aggregate HTTP read took 965 ms.
Seven real loopback transport tests exercise stalled headers/body, cancellation,
HTTP errors, malformed JSON and refused connections; the full 96-test suite and
production build pass.

The rebuilt actual browser run passed 404 checks with zero runtime exceptions.
It confirms one bulk directory request without the old eight-request fan-out,
holds a genuine HTTP 200 reply beyond the unchanged deadline, verifies readable
timeout feedback without false empty data, and recovers with a fresh successful
Retry request. Native role, responsive/theme, logout and account-isolation checks
also pass. The rebuilt production server was restarted on the existing loopback
address; public health, unsigned administrator denial and private-path checks pass.

A read-only hosted probe measured five simple SQL round trips of 171–230 ms
and no blocked connections in its samples. The consolidated hosted SQL operation
took 11,813 ms and 22 projection/authorization queries; it excludes HTTP, provider
authentication and browser rendering. The separate eight-transaction diagnostic
could not complete because a database connection was unavailable, so these
samples do not establish a before/after page-speed ratio or a hosted latency SLA.
Raw timings and credential-free receipts remain in private migration evidence.

## Logout and shared authenticated-request follow-up

Logout previously rediscovered the full portal and policy, deleted the binding
in another transaction, then waited for provider cleanup. It now verifies the
provider identity, commits one exact binding DELETE, clears cookies and replies.
Local-scope provider cleanup remains bounded and runs afterward. Failure to
verify identity or commit revocation cannot produce a success reply. The browser
shows pending feedback immediately, coalesces duplicate clicks and clears private
query caches without refetching the dashboard on exit.

Shared session/policy discovery now uses one atomic statement. Protected business
transactions retain the same ordered advisory locks, live binding/context row
locks, account restrictions, manager grants, maintenance checks and RLS role.
BEGIN/admission and claims/maintenance/role setup each use one ordered SQL batch.
The preliminary maintenance SELECT uses one atomic statement instead of an
otherwise empty explicit transaction. No session or policy cache was introduced.

On retained real local accounts, with 150 ms delivery delay per actual SQL call
and a 4-second hold before dispatching the actual provider cleanup:

| Request | Before | After | SQL calls before → after |
| --- | --- | --- | --- |
| Logout | 5,334 ms | 252 ms | 7 → 1 |
| Session/profile | 2,555 ms | 1,196 ms | 16 → 7 |
| Notifications | 3,067 ms | 1,605 ms | 16 → 7 |
| Administrator directories | 3,567 ms | 2,294 ms | 33 → 21 |

The before run used preserved pre-change source against the same isolated stack.
Replies and identities were genuine; only transport timing was controlled. These
figures are a controlled comparison, not a hosted response-time guarantee.
The complete browser run passed 416 checks with zero runtime exceptions; its 15
real logouts took 83–1,685 ms. Delayed genuine logout responses verify immediate
pending feedback, duplicate prevention and confirmed exit. A fresh hosted SQL-only
directory probe completed in 3,990 ms, excluding provider, HTTP and browser time.

Verification also passed 96 regression tests, 43 restored-database checks,
45 actual role/directory HTTP checks, 11 policy/session checks and 28 logout
security checks. The latter prove copied-cookie and direct Data API denial while
the provider JWT is still valid, preservation of unrelated sessions, failure
recovery, concurrent binding locks, genuine keyed maintenance transitions and
logout during maintenance. Production build and TypeScript checks passed.
All test mutations stayed in the existing isolated stack; no cloud accounts,
business records, outgoing email or Paystack calls were created by these tests.

Marketplace order history defaults to 50 orders (maximum 100), with a stable `(created_at,id)` cursor and an explicit older-history control. Timeline, review and buyer-only PIN reads are batched for the authorized page. Each timeline initially includes at most 20 recent events; a participant-scoped cursor endpoint keeps earlier events accessible. Idle chat polls do not decrypt, sort or rebuild unchanged saved history. Seller counts, revenue and five recent customer aggregates are calculated across the authorized store, independently of page size. Chat polls use a newer-than cursor rather than downloading historical ciphertext every five seconds. No account selectors or unbounded caller-defined page sizes are accepted.
