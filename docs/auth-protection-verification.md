# Authentication protection verification — 22 October 2026

Implemented and published to the local preview with the supplied Turnstile site
key. Supabase CAPTCHA was enabled by the project owner. Migration
`20261022205045` was rehearsed with rollback, applied, and checked live.

## Behavior

- Signup starts a five-minute resend wait. Subsequent successful requests wait
  10, 20, 60, then 120 minutes; later requests stay at 120 minutes. The sequence
  resets after 24 hours without a request. Early requests do not extend it.
- Five incorrect passwords per email/IP pause that pair for 15 minutes. Thirty
  failures across emails pause the source IP for 15 minutes. A different IP can
  still authenticate the target account. Successful credentials clear only the
  matching pair. Native CAPTCHA failures and provider outages do not count.
- Private hashed counters persist across app instances. RLS and restricted grants
  prevent direct browser access. No passwords, OTPs or CAPTCHA tokens are stored.
- The existing Supabase Auth service validates CAPTCHA once. The frontend resets
  each proof after an attempt. Missing/invalid proofs are rejected without a
  session. No custom second Siteverify call consumes the same token.

## Verification evidence

- 44 real local GoTrue/captured-mail/HTTP-cookie checks passed, including
  verification, login/logout, password re-entry, and revoked-cookie rejection.
- 43 bounded local injection/abuse checks passed. SQL-looking identifiers were
  rejected; SQL punctuation remained literal in an authorized profile update.
  Cross-role access and private-table reads failed. Oversized/compressed bodies
  were rejected. Bursts used at most four concurrent requests: 36 auth requests
  produced 24 quota rejections, and 16 room-key requests produced six. Eight
  post-burst health reads and the authorized session remained usable.
- 90 functional protection checks passed with actual provider exchanges and
  captured emails: every escalation, concurrent single delivery, shared aliases,
  recreated-app persistence, source-local lockout and cross-email spray limits.
  The final global fixture-count assertion included another concurrent test's
  identity. The verifier was corrected to scope that assertion; a separate
  read-only reconciliation confirmed one owned registration and no registrations
  from sprayed login attempts. The original failed process log is retained.
- Long waits were exercised by explicitly aging only the generated local test
  subject's delivery timestamps and its private budget. Provider responses and
  tokens were never substituted. No hosted flood/injection test was performed.
- 92 local migration/hash/RLS/grant checks passed. Eleven live read/configuration
  and missing/invalid CAPTCHA checks passed without accounts, mail or customer
  credentials. All 31 final focused regressions, TypeScript and both builds passed.

## Initial real CAPTCHA finding — native replay check failed

Cloudflare's real script and widget load in an isolated browser, and mobile,
tablet and desktop forms retain their layout in 24 assertions of the observed
background-check state. Ten additional browser checks verified the 45-second
timeout, manual retry, disabled submission while unverified, and absence of app
runtime exceptions. Earlier headless attempts did not receive a proof. A later
isolated **visible Chromium** run received genuine production-widget proofs
without a checkbox or testing keys. No existing account credentials were used.

The first real-token test failed its replay assertion. A second run repeated the
test with another genuine proof, identical request bodies, and a five-second gap:

| Check | Observed result |
| --- | --- |
| PineVela request without a proof | `400 captcha_required` |
| PineVela request with a fabricated proof | `422 captcha_failed` |
| First genuine proof, random nonexistent email/password | `401 invalid_credentials` |
| Exact same genuine proof/body after five seconds | `401 invalid_credentials` again |
| Same consumed proof directly to native Supabase Auth | `400 invalid_credentials` |
| Fabricated proof directly to native Supabase Auth | `400 captcha_failed` |

The connected project was checked, its Auth public key has role `anon`, and
native Auth reports `v2.197.0`. Its matching upstream middleware validates CAPTCHA
before password credentials. Thus malformed-proof rejection and genuine-proof
acceptance work, but **single-use replay rejection failed in the actual hosted
provider path**. The native comparison rules out PineVela being the only layer
involved. This does not establish the provider's underlying cause. Do not label
CAPTCHA disabled or report replay protection as passed.

The wrong credentials prevented all sessions: no accounts, email deliveries,
password changes, or authenticated access were created. Tokens/passwords were
held in memory and omitted from receipts. Real correct-password sign-in with
CAPTCHA, expiry rejection, and subsequent fresh-proof recovery were not tested.
The owner's Google sign-in confirmation concerns a separate OAuth flow.

The initial verification introduced no replay guard. The subsequent fix below
closes reuse at PineVela's API; direct native Auth enforcement remains separate.

Sources: [Cloudflare single-use contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[GoTrue v2.197.0 CAPTCHA middleware](https://github.com/supabase/auth/blob/v2.197.0/internal/api/middleware.go),
[matching verifier](https://github.com/supabase/auth/blob/v2.197.0/internal/security/captcha.go).

## PineVela replay fix — applied and verified

Migration `20261022214514` adds the private, RLS-protected
`auth_captcha_proofs` table. Admission atomically commits a global SHA-256 proof
fingerprint before workflow transactions or native Auth calls. Reuse across
portal aliases and app instances fails. Failed or ambiguous attempts keep their
claim. A request-local flag additionally permits only one protected exchange.
Claims retain only the hash and server timestamps for ten minutes. Cleanup is
bounded to 100 expired rows, capacity is 50,000, and database lock waits expire
after two seconds. All first proofs still undergo native Supabase verification.
No secret was moved into the app and no second Siteverify call was added.

- **139 real local database/native workflow checks passed**, including eight
  concurrent identical claims with exactly one admission; replay across recreated
  apps/portal aliases; all 82 immutable migration digests; actual anonymous,
  authenticated and restricted-role read denial; expiry cleanup in batches of
  100 then five; and no raw proof persistence. Eight concurrent resend workflows
  completed in 497 ms without nested pool starvation. A held database lock
  produced `503 captcha_unavailable` after 2,017 ms, then recovered. Unrelated API
  requests could not insert proof metadata. These tests used random technical
  admission strings with native local CAPTCHA disabled, not purported Cloudflare
  solutions. No accounts, sessions, messages or hosted requests were created.
- The live rollback rehearsal passed, then the migration committed. Its exact
  digest, RLS, absence of PUBLIC grants, and actual read denial for four
  restricted roles were verified against the hosted database. Supabase's
  read-only security advisors reported zero findings.
- The tested backend was activated with the existing frontend unchanged.
  The prior process exceeded graceful shutdown, so only that verified owned
  process was terminated after its drain deadline. Replacement readiness passed;
  rollback artifacts and existing account data were retained.
- **15 browser assertions passed with genuine production Turnstile proofs**:
  the first proof reached native credential validation; exact reuse and reuse
  through marketplace login returned `422 captcha_failed`; a newly issued proof
  reached native validation again; fabricated proof rejection remained active.
  All tests used nonexistent credentials and created no account/session/mail.
- A separate **unused genuine proof held for 310 seconds** returned native
  `400 captcha_failed`, confirming native expiry. This supports the guard's
  ten-minute retention exceeding the observed proof validity.
- Focused Auth/runtime tests, TypeScript and the backend build passed. Default
  TypeScript heap was insufficient; the complete check passed with a 4 GiB heap.
  The final changed modules and regression script also passed a focused check.

**Remaining provider boundary:** a consumed proof still reached credential
checking when sent directly to native Supabase Auth. PineVela's ledger is not
executed on that endpoint. Keep native CAPTCHA enabled and investigate using
Cloudflare validation analytics and Supabase Auth request identifiers. Correct
password sign-in with the configured cloud CAPTCHA was not exercised using an
existing account. The 50,000-entry capacity threshold was reviewed but not filled
at runtime. This does not establish volumetric DDoS resistance.

Receipts, including the initial 132-check run and subsequent 139-check run, live
schema/advisor verification, genuine-token results and expiry result, are kept
under `.security/captcha-replay-fix-2026-10-22/`. The isolated local services and
owned test browsers were stopped; the preview remains running.

## Bounded local load follow-up — passed

A separate run-owned PostgreSQL/GoTrue/Mailpit stack with all 81 immutable
migrations passed 16 checks. The actual application handled a 20-request baseline,
a 30-second ramp at 10, 40 and 80 requests/second, then natural cooldown recovery:

- 1,340 total requests: 900 successful reads, 20 malformed-authentication
  rejections, and 420 expected `429` responses, all with `Retry-After`.
- Zero 5xx responses, timeouts, or network errors. Observed peak concurrency was
  13, below the 16-request guard. Overall p95 was 31.76 ms and p99 132.87 ms.
- After the real one-minute rate window expired, all 20 recovery reads succeeded.
- No users/profiles/sessions or fictional catalog data were created. No hosted
  load traffic was sent. Only the owned test services were stopped afterward.

Latency and resource measurements combine one local client and application
process against genuinely empty catalogs. They do not measure production data,
distributed clients, the 3,000-request global budget, or network capacity.

## Deployment boundaries

These bounded checks establish application behavior, not resistance to a
distributed volumetric DDoS attack. Read-only DNS and one HTTPS HEAD on October 22
found the public domain pointing to Spaceship/LiteSpeed with a WordPress REST
link. PineVela's deployment behind a Cloudflare proxy was not established.
Hosting/CDN/WAF controls remain a separate deployment requirement. Supabase's
[security-testing policy](https://supabase.com/docs/guides/security/security-testing)
prohibits hosted DoS/DDoS testing and request flooding. Dynamic resend escalation protects PineVela's API; direct
Supabase Auth requests require Supabase CAPTCHA and native rate limits. See
[CAPTCHA setup](captcha.md) and [the test runbook](auth-protection-load-testing.md).

Detailed private receipts and preserved failure diagnostics are in
`.security/auth-protection-2026-10-22/`,
`.security/captcha-replay-2026-10-22/`, and their run-owned temporary directories.
