# Companion full debug — 24 October 2026

Hosted AI replies remain unavailable. The owner reran the existing private v3
probe during this debug pass: Spaceship returned HTTP 403 JSON with the fixed
reason `network_access_denied` both without credentials (436ms) and with the
configured credentials (123ms). The process exited successfully, so this is an
HTTP rejection rather than a failed TCP connection or a hanging Node process.
The exact IP, geography, reputation or upstream policy responsible is still
unknown. It must be reviewed by the hosting/provider teams; no proxy, identity
rotation or TLS bypass was added.

## New project key recheck

At the owner's request, a newly created Groq project key was tested separately
at 15:31:20 UTC. Its authenticated catalog check returned 200 with the configured
model present. A single full-instruction production-transport greeting returned
63 visible characters, `stop`, no tool calls and 1,201 total tokens; inference
took 367ms. No personal data or hosted account writes were involved. The key was
written only to private development/prepared-hosting environments, with private
rollback copies; it was never embedded in a build or printed in results.

The owner then reported completing the hosted private-key/environment update
and restart and reran the v3 probe. The unauthenticated request still returned
403 / `network_access_denied` (281ms), and the authenticated request returned the
same rejection (65ms), with return code 0. Creating another project did not
restore hosted access. The agent did not inspect remote secret values, and the
returned diagnostic is still v3, so the prepared v4 CLI is not established as
installed remotely. A successful laptop test does not establish a successful
hosting test. Because this new credential was shared in chat, it should now be
revoked and replaced privately after testing.

## Current evidence

- At 15:10:51 UTC, the actual production transport, full app instructions and
  configured tools returned a real visible greeting from development in 890ms.
  It used 1,204 total tokens, including 26 reasoning tokens, and ended with
  `stop`. There was exactly one inference call, no tool calls and no personal
  data sent. The root environment key matches the prepared private hosting
  copy. This does not read or verify the current remote environment.
- Development model-catalog requests returned 401 without credentials and 200
  with credentials, with the configured `openai/gpt-oss-20b` model present.
  The updated diagnostic also verified TLS authorization on both requests.
- At 15:16 UTC, read-only checks against the configured Supabase project found
  all four private companion tables, RLS enabled, browser/catalog table grants
  denied and both companion migrations present. Preview health returned 200;
  unauthenticated `/api/companion` returned 401. No hosted records changed.
- Source tracing shows the reply endpoint enforces native authentication,
  primary context, matching profile header, consent and allowance before the
  provider request. Its actual 403 maps to `503 / companion_provider_403`.
  Groq documents [403 as a permission rejection and 429 as a rate limit](https://console.groq.com/docs/errors).
  The host result therefore does not establish a free-plan quota or single-use
  restriction.
- The full-prompt greeting produced visible output within the existing token
  budget. The speculative reasoning-budget concern was not reproduced; model
  and inference parameters remain unchanged.
- Groq's [official status page](https://groqstatus.com/) reported normal operation
  when checked during this pass. That does not rule out an access restriction
  affecting a particular hosting connection.

## Recovery fixes

1. Initial client reads now stop the opening spinner on failure and offer Retry.
2. Superseded reads are aborted and invalidated before a newer read, save, send,
   clear or unmount, preventing stale history/preferences from winning.
3. The DNS deadline's actual `ETIMEOUT` code now maps to the timeout response.
4. Failed-turn cleanup requires the captured conversation generation as well as
   request ID. A late old request cannot clear a new lease after history resets.
5. Exact first-call provider 403 failures with zero preceding usage release the
   unused token reservation atomically and once. Request counts remain bounded;
   unknown failures keep their holds. Past hosted usage is not rewritten.

The temporary UI pause remains in place. The client recovery code is retained
for restoration after hosted replies are confirmed. No migration, provider
replacement, account credential change or hosted deployment was performed.

## Private hosting diagnostic v4

The fresh `deploy/spaceship/diagnose-companion-host.cjs` still defaults to exactly
two fixed model-catalog GETs. It adds UTC time, Node version, safe environment
source/override flags, backend-current markers, TLS/family and strictly validated
Cloudflare Ray IDs. Arbitrary headers, raw bodies, keys and chat are omitted.
[Cloudflare documents Ray IDs](https://developers.cloudflare.com/fundamentals/reference/cloudflare-ray-id/)
as request correlation information useful for access investigation.

The optional `--network-identity` flag adds one credential-free IPv4 GET to the
fixed [ipify endpoint](https://www.ipify.org/), with a six-second/128-byte bound.
Only a validated public IPv4 is emitted. It is the address observed by ipify;
destination-dependent NAT can differ for Groq. No ASN or country is inferred.
The flag was protocol/privacy-tested without querying the operator's public IP
from development. Default v4 requests were validated against the real provider.

This diagnostic is a private CLI, not a new public HTTP endpoint. Run from the
application root with its existing environment. The existing cPanel
`diagnose:companion` script continues to work when its CJS file is replaced.

## Verification

Seven asynchronous load/race tests, six request-journal tests, thirteen existing
companion tests and eight private-diagnostic behavior/privacy tests passed.
The failed-turn verifier passed 33 checks against an isolated encrypted restore
of genuine native identities/sessions, including positive settlement, unknown
failure holds, concurrent/replayed cleanup, generation reuse, foreign identity
denial, original-window settlement and forced rollback. No fabricated accounts,
sessions or chat records were used. No provider calls or hosted writes occurred
in that database verifier, and its temporary cluster was removed afterward.

Private evidence is under
`.security/production-readiness-2026-10-23/companion-full-debug-2026-10-24/`
and `.security/companion-failure-cleanup/`.

TypeScript, production frontend/backend builds, compiled-script syntax checks
and the final diff check passed. The client remains unmounted, and no genuine
signed-in browser journey or hosted inference success has been established.

## Prepared update and access review

`/tmp/pinevela-preview-companion-debug-20261024.tar.gz` (211,495 bytes) contains
the freshly built backend, private v4 CLI and upload instructions. It includes
no frontend, environment files, credentials or source maps. Members were
byte-verified after packaging and scanned against configured private values.
SHA-256: `6f646ee5628679f3709b7d2a2957e4fa208d9e79fa65f6c72e701971d7560e32`.

Before replacing the API bundle, copy the existing
`dist-supabase-backend/supabase-server.mjs` to a dated private backup. Extract
the update into `/home/jqmgxgpuym/pinevela-app` and restart Node. No dependency
installation or migration is needed. This improves recovery/diagnostics; it
does not authorize a connection refused by the provider. No remote upload was
performed. Client load fixes remain in source for a later restored frontend.

A credential-free access-review draft, updated with both project comparisons,
is prepared at `/tmp/pinevela-groq-access-review-20261024.txt`. It has not been
sent. The new project key also received the on-host network denial; submit the
draft through Groq's support channel. The private v4 CLI can supply timestamp
and correlation metadata if requested. Repeating the same key/catalog tests
without a hosting/provider change would add no new diagnosis.
