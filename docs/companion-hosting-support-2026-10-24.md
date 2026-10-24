# Companion hosting access — 24 October 2026

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

Our PineVela Node.js application at preview.pinevela.app receives HTTP 403 JSON
from https://api.groq.com/openai/v1/models. Both a request without Authorization
and a request with our valid key return “Access denied. Please check your network
settings.” The same configured key works from our development network. Please
confirm the actual outbound public IP/ASN and data-center country used for these
HTTPS requests, check any outbound filtering, and help us coordinate access
review with Groq. Please do not change hosting or DNS without confirming the
proposed change with us.

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
