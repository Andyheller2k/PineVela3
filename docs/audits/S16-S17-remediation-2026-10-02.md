# S16 and S17 remediation — 2026-10-02

## Delivery PINs and identity

All creation, list, renewal and update responses use an order-field allowlist. Only the exact
authenticated primary buyer receives an active PIN. Sellers and administrators receive no
PIN value, verification metadata, attempt counters or reservation internals. Historical PIN
notes are redacted from timeline responses; completion uses server-written notes without
the submitted PIN. Responses are private and non-cacheable.

PINs contain six cryptographically generated digits, expire after 24 hours and lock after
five failures. Malformed guesses count as failures; a missing value cannot verify anything.
Failed-attempt increments persist before responding, so concurrency and restart do not reset
the limit. Buyer-only renewal issues a different PIN, resets attempts, checks available stock
and renews the reservation. Renewal has a one-minute issuance cooldown.

Securing creation responses necessarily also addresses S13: creation now requires a primary
buyer session and binds buyer ID/name/email to it, ignoring supplied identity fields. Matching
emails do not grant another primary/subaccount access. Seller authority uses the exact current
store relationship, and administrators cannot confirm, reject, complete or renew as participants.

## State and stock policy

| Current state | Actor/action | Next state |
| --- | --- | --- |
| Awaiting Seller Confirmation | Assigned seller confirms | Pending Meetup |
| Awaiting Seller Confirmation | Assigned seller rejects | Location Rejected |
| Awaiting Seller Confirmation or Pending Meetup | Exact buyer or assigned seller cancels | Cancelled |
| Pending Meetup | Assigned seller submits valid buyer PIN with confirmed location | Completed & Paid |

Unsupported transitions, conflicting action/status aliases and protected body fields fail
before mutation. Completed, cancelled and rejected states cannot reopen. Expired or missing
reservations cannot confirm/complete until the buyer renews and capacity is available.

Creation reserves quantity for 24 hours without deducting physical stock. Every availability
check accounts for other active reservations. Rejection, cancellation, completion or expiry
releases the reservation. Expired entries stop consuming capacity on the next calculation;
records remain intact. Completion deducts physical stock once. Reservation checks/insertion
and completion check/deduction/state/save each run synchronously without an intervening await.

## Verification

All API/browser fixtures used disposable databases and accounts; operational accounts,
orders and inventory were not used or deleted.

- **51 existing security regressions passed**, plus **three new S16/S17 unit/API tests** (54 distinct tests). The new files are registered in `npm run test:security`. Existing suite execution and the final new-file execution were separate runs.
- S14/S15 regression tests still pass with reservations: catalog prices and strict quantities remain enforced, reservation overcommit is blocked, stock deducts once and category snapshots survive restart.
- Buyer creation requires a valid primary session; supplied buyer identity is overwritten. A second primary user sharing the buyer email, the seller's parent account, an unrelated seller and an administrator cannot impersonate the buyer/seller.
- Seller/admin list, agreement, rejection and completion responses recursively contain no PIN/challenge/reservation fields. Owners receive active PINs; expired, locked, legacy and completed challenges are hidden. Completion notes do not contain the submitted PIN.
- Premature completion, arbitrary/empty/malformed/conflicting statuses, spoofed ownership fields, duplicate confirmations, rejection after confirmation and every terminal-state reopening are blocked. Failed transition requests leave orders unchanged.
- Wrong and malformed PINs exhaust exactly five attempts. Counters survive restart; a correct PIN remains blocked after lockout. Five simultaneous wrong guesses produce four HTTP 400s and one HTTP 429, with a persisted counter of five. Expired confirmed orders cannot complete. Only the buyer can renew; protected renewal fields, foreign actors, immediate reissue and terminal orders are rejected.
- Competing creation requests for the last two units produce one HTTP 201 and one HTTP 409. Cancellation, seller rejection and expiry release capacity. Two reserved quantity-one orders complete concurrently without overselling; repeated completions fail. Reservations, completion and stock survive restart.
- **Production Chromium browser check passed at 375, 768 and 1440 pixels:** actual buyer renewal/PIN display, seller location confirmation, six-digit modal entry and completion. No horizontal overflow, console/runtime errors or failed API requests.
- TypeScript, final production build, private-data and whitespace checks passed. The build retains its existing bundle-size advisory.

## Limits and compatibility

This remains the single-process JSON implementation. Multiple writers sharing the JSON file
are unsupported. Supabase migration must put reservation/stock predicates and order transitions
inside PostgreSQL transactions/row locking with the existing authorization and RLS boundaries.
No Supabase policy was changed.

Existing exposed four-digit PINs cannot complete orders; owners use **Get a new PIN** to renew.
Unsupported historical states and orders without the exact buyer ID fail closed rather than
guessing ownership from email. Existing records are preserved. Historical arbitrary positive
prices are not retroactively repriced. PIN values remain server-private operational JSON data
so the buyer can retrieve their active code; they are not encrypted at rest by this patch.

Other audit findings remain outside this change. Implementation spans `marketOrderWorkflow.ts`,
`marketOrderSecurity.ts`, order endpoints in `server.ts`, buyer/seller PIN UI and order types,
focused API/unit/browser tests and the security test script.
