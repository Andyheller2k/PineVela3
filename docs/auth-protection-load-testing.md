# Authentication and bounded load verification

These checks distinguish application throttling, real CAPTCHA validation, and
network capacity. A passing application test does not certify volumetric DDoS
resistance. Current results belong in [the verification report](auth-protection-verification.md).

## Rerun the bounded local check

Use the isolated native Supabase stack with its applied migrations and private
metadata. It must have no Auth users, profiles, or sessions. Keep the public
preview and hosted Supabase project outside the load target. From the repository
root, while this run's local stack is still running:

```bash
node --import tsx scripts/verify-supabase-local-load.ts /tmp/pinevela-workflow-DIsECw/metadata.json
```

The metadata path for this run is recorded in
`.security/captcha-replay-2026-10-22/bounded-active-run.json`. If that stack has
been stopped or its temporary directory removed, start a new owned native
Supabase stack, save its actual CLI status JSON privately, then prepare the
empty database using `npm run db:local:prepare -- /absolute/path/to/private-status.json`.
Pass the new metadata path printed by that preparation. The preparation command
expects CLI status JSON, not an environment file, and intentionally refuses a
database that already has application tables or Auth users. Do not substitute
cloud credentials, a public hostname, or the shared preview port. The harness
checks ownership and loopback destinations and drops cloud-provider environment
credentials from its worker.

The script uses actual application routes and real empty PostgreSQL catalogs.
It runs a 20-request baseline, 10/40/80 requests per second for ten seconds each,
then 20 recovery requests after the actual one-minute rate window expires.
Every tenth ramp request is a malformed authentication request. No accounts or
fictional inventory are created. Guards cap concurrency at 16, launches at
100 per second, total requests at 2,000, and the ramp at 30 seconds plus a
two-second scheduling tolerance. Requests time out after five seconds. It stops
launching if server/network failures exceed 5% after 20 observations or RSS
increases by more than 512 MiB. Stop it manually if the machine or other work
becomes affected.

Expected checks include successful baseline/recovery reads, authentication and
shared API `429` responses with `Retry-After`, no timeout/5xx responses, and no
new account/profile/session. The final stdout gives the timestamped JSON report
under `.security/captcha-replay-2026-10-22/`; prior reports are retained. Its
measurements describe one loopback client and application process, including
empty-catalog cost, rather than distributed sources or production inventory.

## Verify the actual Turnstile token lifecycle

Use the real configured widget and the exact Supabase project serving the app.
Keep the widget secret in Supabase. Do not validate a token separately through
Siteverify before submitting it to Supabase: that would consume the proof.

1. In a normal browser, complete the real widget. Use an explicitly authorized
   test account with known valid email/password to confirm password sign-in
   succeeds and returns the expected authenticated account. Google OAuth is a
   separate flow and does not establish this result.
2. Retain that submission's CAPTCHA proof only in memory for the test. After
   signing out, repeat the same password request with the exact consumed proof.
   Supabase should reject it as a CAPTCHA failure and issue no new session.
3. Complete a fresh challenge and confirm the same correct credentials work
   again. Confirm missing and fabricated proofs are denied too.
4. For expiry, retain a newly issued, unused real proof for more than five
   minutes, then submit it with the known valid credentials. It should fail;
   another fresh challenge should permit sign-in again.
5. Record statuses, provider error classifications, and whether session cookies
   were issued. Do not record passwords, CAPTCHA strings, access/refresh tokens,
   email verification codes, or full request bodies. Keep attempts serial and
   within both providers' and PineVela's login budgets.

For an initial check without existing credentials, use one unique nonexistent
email address with a random wrong password. Compare a fresh genuine proof, its
exact replay, and a fabricated proof. Keep the genuine proof only in browser
memory. The hosted GoTrue v2.197.0
[middleware](https://github.com/supabase/auth/blob/v2.197.0/internal/api/middleware.go)
validates CAPTCHA before credentials, so an accepted proof can reach
`invalid_credentials` without creating an account or session. A replay must be
rejected at CAPTCHA. The API and native Auth may use different HTTP statuses;
record the provider error classification too.

On October 22, actual genuine-proof replay reached credential checking through
both PineVela and native Supabase Auth, while fabricated proofs failed CAPTCHA.
That is a failed replay check, not a passing sign-in or an assumption that CAPTCHA
is disabled. See the verification report for exact results and remaining work.
A widget showing success alone does not prove server enforcement. Testing keys
can exercise integration states but do not verify the production widget/secret
pairing. Cloudflare documents single-use proofs and a five-minute lifetime in its
[validation contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Public edge scope and provider restrictions

On October 22, 2026 at approximately 21:30 UTC, public DNS resolved
`pinevela.app` and `www.pinevela.app` to `66.29.148.39`, with Spaceship nameservers.
One HTTPS HEAD returned `200`, `Server: LiteSpeed`, and a WordPress REST link.
This is consistent with a Spaceship/WordPress route; the PineVela application's
public deployment was not established. No Cloudflare proxy indicators were
observed. The exact read-only observations are retained in
`.security/captcha-replay-2026-10-22/edge-scope.json`.

Turnstile can run without Cloudflare's CDN. Cloudflare's application protection
requires the corresponding traffic to use its proxy. See
[Turnstile independence](https://developers.cloudflare.com/turnstile/get-started/)
and [DNS proxy behavior](https://developers.cloudflare.com/dns/proxy-status/).

Supabase permits scoped security assessments but explicitly prohibits hosted
DoS/DDoS testing and request flooding. Do not direct this load script at hosted
Supabase, including through an application that forwards the pressure there.
See [Supabase security-testing policy](https://supabase.com/docs/guides/security/security-testing).

A later edge simulation needs a verified, owned, nonshared deployed target,
appropriate proxy protection, an isolated permitted staging origin, monitoring,
and compliance with every affected hosting provider's policy. Cloudflare's
general policy does not require advance Cloudflare permission for its permitted
owned/onboarded properties; that does not authorize testing shared hosting or
override another provider's restrictions. See
[Cloudflare simulation policy](https://developers.cloudflare.com/ddos-protection/reference/simulate-ddos-attack/).

Before such a simulation, document target paths, source IPs, start/end times,
request/concurrency/bandwidth ceilings, allowed upstream calls, and the person
able to stop it. Establish baseline and stop thresholds for latency, errors,
resource use, legitimate-user impact and cost. Stop on unexpected 5xx, unhealthy
origin, collateral impact, or a provider's instruction. Do not treat the current
WordPress domain route as PineVela's API or send unbounded Internet traffic.
