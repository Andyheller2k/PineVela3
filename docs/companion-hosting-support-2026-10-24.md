# Companion hosting access — 24 October 2026

## Full debug follow-up

The later [full debug report](companion-full-debug-2026-10-24.md) records a fresh
on-host denial, a successful full-prompt development reply, read-only live
database/API checks, tested recovery fixes and the new private v4 diagnostic.
The AI remains hidden from the product UI. Earlier checkpoints below are
retained as evidence; their client-only packages do not resolve hosting access.

## Current recheck

At 13:02 UTC on 24 October, one authorized greeting from the actual signed-in
preview UI returned HTTP 503 / `companion_provider_403` after 4.53 seconds.
Existing AI consent was enabled. The UI stopped thinking, retained the draft
and re-enabled Send. No preference or history deletion was performed; original
dark/top appearance was preserved. The private check records no chat history,
profile details or request ID. Provider-internal call count was not observable.

Using the existing prepared hosting key from development, the production
transport returned a genuine visible greeting (180 tokens, about 0.8 seconds).
The catalog probe returned 401 without credentials and 200 with that key, with
the configured model present. This confirms the prepared key/model work from
development; it does not read the current hosted environment or establish that
Spaceship's network restriction has been lifted. The owner reports no support
or hosting-access changes since the earlier network-denial probe.

A separate client fix releases the matching pending request only after a valid
server `503 / companion_provider_403` rejection. Users can then change their
question while retaining the draft/error. Unknown errors, malformed responses,
timeouts, cancellation, 409 and 429 retain their original retry identity.
Account/session scope, journal identity and request ID/text must all match.
Six request-journal cases, thirteen existing companion cases, TypeScript and
the production frontend build pass. This new client behavior has not been
browser-tested against another provider turn. No provider, backend, quota or
database behavior changed. **Hosted AI replies remain unavailable.**

The client recovery update is
`/tmp/pinevela-preview-companion-recovery-20261024.tar.gz` (3,083,604 bytes).
It includes preceding frontend fixes. Extract into
`/home/jqmgxgpuym/pinevela-app`, retaining existing assets; refresh/reopen the app.
No Node restart is required. This archive does not remove the provider denial
and has not been uploaded remotely. All 171 public files were credential/source-
map scanned, with zero matches; 127 archive members were byte-verified, index
last, and no backend/private files included. SHA-256:
`284da73e3d434b98d91a24ca4386d56334f0bd2b724f66b77d96c1223722e3be`.

Evidence: `.security/production-readiness-2026-10-23/companion-repair-2026-10-24/`.
The next availability step is a hosting/provider access review. Send the draft
below through [Spaceship support](https://www.spaceship.com/about/contact-us/),
then provide their confirmed egress details to Groq. No messages were sent by
the agent.

## Earlier hosting probe

The real signed-in preview request returned HTTP 503 with
`companion_provider_403`. A local test using the prepared hosting key returned
200 for the model catalog and a real reply through the current transport.

The owner then ran the bounded probe on Spaceship. Both the unauthenticated and
authenticated model-catalog GET returned HTTP 403 with the fixed diagnostic
reason `network_access_denied`. This matches only the provider message
“Access denied. Please check your network settings.” The probe completed with
exit code 0 and no stderr output. These results point to an upstream restriction
on the hosting network before credential-specific processing. They do not
identify the exact blocked address, geography, reputation rule or policy.

Chat replies on the hosted preview are still unresolved. Provider/hosting
support must review this access restriction. No key rotation, paid upgrade,
alternate IP, proxy, TLS bypass or provider fallback was performed.

## Private hosting probe

`deploy/spaceship/diagnose-companion-host.cjs` is the compiled version of
`scripts/diagnose-companion-host.ts`. Place it in the hosting application root.
It reads the existing environment, makes exactly two bounded GETs to the fixed
Groq model-catalog endpoint (without and with the configured key), and emits
allowlisted diagnostic categories. It sends no chat, touches no database,
follows no redirects and prints no credential, raw body or response header.

The cPanel Run JS script dropdown reads package.json scripts. Add this entry
inside the hosted file's existing `scripts` object:

```json
"diagnose:companion": "node diagnose-companion-host.cjs"
```

Keep the surrounding JSON commas valid, refresh the Node.js page, select
`diagnose:companion` and run it. No dependency installation or app restart is
required for this probe. Locally it returned 401 without credentials and 200
with the configured key, with the requested model present. Syntax and
configured-secret scanning passed. Rejection-classification tests verify that
unknown messages, arbitrary codes and echoed private content never enter logs.

## Draft for Spaceship support

Our PineVela Node.js application at preview.pinevela.app is unable to use Groq.
A fresh test on 24 October 2026 at 13:02 UTC still returned provider HTTP 403.
An earlier on-server probe of https://api.groq.com/openai/v1/models returned
“Access denied. Please check your network settings.” both without Authorization
and with the configured key. The prepared key/model produce a real reply from
our development network today. Please confirm the actual outbound public IP,
ASN and data-center country for this Node application's HTTPS requests, check
outbound filtering to api.groq.com, and help coordinate an access review with
Groq. Please do not change hosting or DNS without our approval. No API key or
private chat history is needed for this review.

## Draft for Groq support

Please investigate network access for our legitimate PineVela application hosted
on Spaceship. From the hosting server, both authenticated and unauthenticated
GET https://api.groq.com/openai/v1/models return HTTP 403 JSON with “Access denied.
Please check your network settings.” From development, the configured key returns
HTTP 200 and openai/gpt-oss-20b produces a real reply. Please identify the access
restriction and advise the supported resolution. We can provide the hosting
egress IP and test time after Spaceship confirms them.

These are unsent drafts. Use the existing hosting support channel and
[Groq contact](https://groq.com/contact); do not send API keys or chat histories.
