# Flow and security verification — 2026-10-03

Both requested journeys completed through the real local HTTP API using disposable data.
All 72 existing security tests passed. The additional journey/probe run passed 69 of 76
checks; its seven failures represent three new findings below. No application fixes were
made during this review. Operational accounts, uploads and database were not modified.

| Journey | Result |
| --- | --- |
| Primary signup with local six-digit code | Passed for three separate accounts |
| Seller request → administrator inbox → approval → seller login/setup → publish | Passed |
| Buyer order → seller acceptance → buyer PIN → completion → purchase review | Passed; catalog price used and stock consumed once |
| Manager request → administrator inbox/approval → manager login | Passed; login blocked while pending |
| Residence registration/approval → manager creates staff → staff login | Passed; explicit staff password required |
| Room activation → report → assignment → staff acceptance/completion → resident confirmation → manager closure | Passed; all sign-offs persisted |

## New findings

1. **High — Maintenance creation accepts another resident's identity and housing.**
   A primary account without an activated room posted to `POST /api/issue-reports` with
   another resident's `studentId`, `studentEmail` and hostel. HTTP 201 persisted the supplied
   resident identity. Later workflow authorization does not protect report creation.
   Relevant source: `server.ts:8853`, `server.ts:8915`, `server.ts:8942`.
   This is a distinct creation gap from the repaired S02 update and S12 action endpoints.

2. **Medium — Product publication accepts invalid prices and inventory.**
   A legitimate seller submitted `price: "not-a-number", stockQuantity: "many"` to
   `POST /api/digital-market/products`. HTTP 201 stored price 0 and stock 1; a subsequent
   buyer order also returned 201 with total 0. A separate `price: -5, stockQuantity: -2`
   submission persisted both negatives. S14/S15 order validation passed, but cannot
   recover the intended price after the publishing endpoint silently changes bad input.
   Relevant source: `server.ts:5595`, `server.ts:5616`, `server.ts:5619`.

3. **Low — Malformed seller email produces a server error.**
   An authenticated primary user submitted `studentEmail: {}` to
   `POST /api/digital-market/register`. HTTP 500 returned “Failed to submit Digital Market
   application” instead of a 400 validation response. The source calls `.toLowerCase()`
   before checking the type (`server.ts:4867`). The server remained available.

Previously unresolved audit findings are excluded from this new-findings list.

## Security checks and limits of this result

The full regression suite covered credential containment/account separation; protected
issue/property updates; officer assignment; signup challenges; manager approval; staff and
residence boundaries; private records/room keys; retired features; maintenance actor/state
policies; trusted order identity/price/quantity/stock; delivery PINs; purchase ratings;
image uploads; session expiry/logout; and request/resource limits, including restart cases.

Additional probes rejected text/string/object/null/negative/fractional/excessive order
quantities, forged order identity/price, wrong PINs, terminal-order reopening, foreign
purchase reviews, unauthorized publishing/staff creation, duplicate room claims, early
repair confirmation, wrong-role repair actions, text resolution flags and nonnumeric repair
ratings. Signup/login object identifiers correctly returned 400.

This was bounded API testing on the development source server with generated local signup
codes and an isolated administrator fixture. It does not establish browser rendering,
real inbox delivery, real payment settlement, hosted Supabase/RLS behavior or production
proxy configuration. Passing tests is evidence for the cases exercised, not a guarantee
that every possible input is safe.

Reproduce: `npm run test:security` and
`node --import tsx scripts/verify-user-journeys.ts`.
The journey runner creates and removes its own temporary database and writes only
sanitized check results to `/tmp/pinevela-journey-results-20261003.json`.
