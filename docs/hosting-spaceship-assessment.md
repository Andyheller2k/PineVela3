# Spaceship Essential hosting assessment

Checked October 23, 2026. The owner confirmed Web Hosting Essential for
`pinevela.app`, an existing WordPress website, and an empty **Setup Node.js App**
screen. Offered runtimes include Node 22.23.4 and 24.22.1. The owner chose to assess
this subscription before another hosting provider.

Owner-reported progress later on October 23: `preview.pinevela.app` is connected
to Essential hosting and FreeSSL; its production Node 22.23.4 application was
created, stopped, and the prepared package extracted. The owner reported
**NPM Install completed successfully**, followed by completion of the private-file
uploads and permissions. Remote filesystem contents, permissions and dependency
loading have not been independently inspected. Public startup/health checks now
pass, as recorded below; remaining hosting acceptance checks are still open.
The initial public check resolved the preview hostname
to `66.29.148.39`; HTTPS returned `200` for `/` and `404` for `/api/health`, which
does not establish that the Node application is running.

After the owner started the app, they reported HTTP `503`. Their `stderr.log`
contains the original wrapper's generic startup-failure line, confirming that
the CommonJS entrypoint runs and the ESM import/startup rejects. It does not yet
identify a dependency, configuration, TLS, database or private-file cause.

**Preliminary result: Node hosting is available; production suitability is still
unverified.** There is no need to purchase another plan to perform the assessment.

## Application form

| Field | Planned value |
| --- | --- |
| Node.js version | `22.23.4`, matching the tested local Node 22 major |
| Application mode | `Production` |
| Application root | `pinevela-app`, a dedicated directory under the hosting home and outside website document roots |
| Application URL | `preview.pinevela.app` for the assessment, once that subdomain is added to hosting and its HTTPS/private access is ready |
| Application startup file | `app.cjs` from the prepared upload package |

The provider's Node 14 recommendation does not match this application's runtime
requirements. Selecting a runtime in the form does not prove the application is
installed or operational. Keep the existing main-domain website until the staged
application and cutover are reviewed.

`deploy/spaceship/app.cjs` is copied to the upload package root. It lets
CloudLinux/Passenger's CommonJS loader import the existing ESM server, sets the
correct working directory, requires production mode and suppresses unsafe raw
startup exception logging. It does not change authentication, persistence,
ownership, RLS or trusted-proxy behavior. The wrapper/package has local syntax
and integrity checks; public Passenger startup/health is now confirmed, with
process lifetime and remaining hosting acceptance checks still open.

The local wrapper now emits version 2 diagnostics: an allowlisted failure/code,
Node version, required-setting names and file-readiness states. Raw errors,
stacks, nested causes, credential values and configured paths are never printed.
Its file checks do not generate keys, change permissions or write to the database.
Fifteen isolated startup/security tests pass, including CommonJS-to-ESM loading,
secret redaction, environment precedence and invalid PIN-file permissions/size/
symlinks. The sandbox initially blocked child-process execution; the tests passed
when rerun with permitted process access. The uploaded archive retains the original
wrapper; the owner replaced hosted `app.cjs` and supplied its version 2 diagnostic.
The 503 investigation and subsequent successful startup are recorded below.

The owner subsequently supplied version 2 diagnostics from Node 22.23.4:
`network_connection` / `ETIMEDOUT`, with no missing setting names, readable
environment/CA/PIN files and the backend bundle present. Startup first awaits
the schema query through the Session pooler, so database reachability is the
leading cause; credential correctness, TLS and schema access on the host are
not yet verified. The prepared configuration targets
`aws-0-eu-west-1.pooler.supabase.com:5432`. The owner located Spaceship's
**Hosting Manager → Manage → Advanced → Outgoing port management** rule form.
The next requested step was an outgoing TCP `5432` rule, then one Node restart
and a fresh health/log check. No host firewall rule has been independently inspected or
changed by the agent, and network filtering remains a hypothesis until retested.

After the outgoing-port step, independent HTTPS checks returned `200` for the
homepage and `/api/health` (`status: ok`, Supabase persistence). The owner
confirmed `stderr.log` no longer grows when reloading. Its old timeout entries
are retained history, rather than evidence of a current startup failure.

One fresh Google-start request returned the correct preview callback, PKCE
challenge, `select_account` prompt and Secure flow cookie. The owner then updated
Supabase's Site URL/redirect allowlist and confirmed actual Google sign-in works
on the preview. The required preview callback entry is
`https://preview.pinevela.app/api/auth/google/callback**` (including its state
query), with Site URL `https://preview.pinevela.app`. Used OAuth URLs must not be
replayed. No Auth implementation or state/replay protection was weakened.

The initial private transfer omitted `SUPABASE_SECRET_KEY`, which is needed by
the server-only Storage adapter. This omission was reproduced against the actual
reported avatar. The corrected private `.env` retains all previous settings and
mode `600`; a real private download matched the stored image digest and size,
while an anonymous direct Storage request remained denied. No database writes,
new keys or public-bucket change occurred. The owner uploaded the corrected
environment, restarted and confirmed the profile picture now displays.
An independent post-restart check confirmed `/api/health` returns `200`, while
`/.env`, `/.git/config` and `/.security/` return `403`; the backend bundle URL
returns `404`. No private response body was printed or saved.

A separate frontend update addresses image delivery and the primary-user welcome
dialog. Measured original login-photo transfer was 1,939,320 bytes and roughly
8.2 seconds of body download from the checker's connection; the original SVG
logo was 918,770 bytes. These are single-connection observations, not user-wide
latency guarantees. Lossless full/mobile WebP derivatives retain alpha and the
decoded source channels; the logo keeps the same SVG framing with lossless
embedded pixels. The login hides incomplete image scans until decoding and
shares the chosen responsive source with its animated layers. The welcome dialog
now contains its missing logo and has a scoped translucent/blurred scrim in
both themes. Twenty-three isolated Chromium checks passed at 375px (2x density)
and 1440px: form usability while real image responses wait, complete-image
reveal, one responsive portrait source shared with the layers, fixed mobile
position, signup switch, actual logo rasterization, translucent scrims in both
themes, Escape dismissal and scroll restoration. The real welcome component
was exercised over the genuine guest page; this is not a new authenticated
first-login walkthrough. No accounts/API responses were fabricated or production
writes made. TypeScript, production frontend build and a 170-file configured-
secret scan passed.

The frontend-only patch is `/tmp/pinevela-preview-loading-20261023.tar.gz`:
3,071,610 bytes, 124 changed/new frontend files, SHA-256
`804a3412a31108fbef714d692a684704eb1887ce0e28efef912743d6ecf694c9`.
Archive round-trip verification passed. Extract into the application root so its
members merge into `dist-supabase`; keep existing hashed assets for open clients.
The patch includes no backend/configuration/secret files and installs the new
index document last. This frontend update remains local until owner upload;
authenticated welcome behavior and delivered asset hashes still need the remote
check after installation.

The prepared upload is `/tmp/pinevela-spaceship-20261023.tar.gz` (8,248,115 bytes,
175 files). Its production build hashes and archive contents were checked. It
includes the frontend, API bundle, startup wrapper and locked package manifests;
credentials, private records, copied dependencies and privileged worker
executables are excluded. Nine focused runtime/privacy regressions passed.
`config/spaceship-upload.json` under the private readiness evidence records the
archive digest. Upload was performed by the owner; public startup/health checks
now pass, with the remaining remote acceptance checks listed below.

## Login/signup switching and cancelled Google handoffs

The owner reported severe frame drops while switching forms on mobile and a
Google connecting spinner that remains disabled after cancellation. The frontend
now switches the one live form directly, removing the 3D flip hook, animated
height measurements and interaction lock. Mobile/tablet cards also omit their
moving reflection, entrance animation and sliding toggle transition; their
glass styling, colors, responsive layout and fixed portrait remain.

Google starts reset on restoration from browser back/forward cache or return
from an external handoff. Pending starts have a 15-second deadline, synchronous
duplicate guard and cancellation on mode change/unmount. State/PKCE, callback
cookie checks and server authentication are unchanged; no migration is needed.

TypeScript, the production frontend build and 86 isolated Chromium checks
passed. Thirty-two form switches across 375, 390, 768 and 1440px viewports with
fourfold CPU throttling stayed interactive with no card transform/height
animation; the mobile portrait remained fixed. Genuine Google starts, Back
restoration from the browser cache and fresh retries passed in both modes.
Bounded request withholding verified timeout recovery, duplicate suppression
and rejection of stale mode-change work. Three identity/origin/error unit checks
and the real-provider cancellation, missing-cookie and callback-replay checks
also passed. No accounts or sessions were created and no provider/API responses
were fabricated. Physical touch synthesis emitted pointer events without a
compatibility click in this headless harness, so hardware touch performance is
not claimed; a phone check after installation remains necessary.

The frontend-only update is `/tmp/pinevela-preview-auth-instant-20261023.tar.gz`
(3,070,354 bytes, 124 changed/new frontend files; SHA-256
`69d983708ee0909adf6b6e153ac9b2259a93a58297e81d7fcba4d8bc5dbe3f7b`).
It includes the earlier responsive-artwork and welcome fixes. The 170-file
configured-secret/source-map scan and archive round-trip checks passed. Extract
into `/home/jqmgxgpuym/pinevela-app`, retaining existing hashed assets, and reload
the preview. The new index document is installed last. The update contains no
backend or environment files and requires no dependency installation; owner
upload and hosted acceptance remain pending.

## Preview companion rejection

The owner reported `companion_provider_403` from the authenticated preview's
turn request. This identifies an upstream HTTP refusal, distinct from a missing
key, network timeout or allowance pause. A bounded check using the prepared
hosting key returned HTTP 200 for Groq model access and a real greeting through
the existing companion transport; the same checks passed after adding explicit
JSON acceptance and the honest `PineVela-Companion/1.0` User-Agent. Neither check
used private profile/chat data, touched hosted database records or proves the
hosting server is allowed to connect.

The request previously omitted a User-Agent. The backend update adds that header
and safe HTTP-rejection diagnostics: status, response-format category and
allowlisted provider/edge codes only. A missing application identifier is a
possible cause, not a confirmed explanation for the hosted 403. No TLS checks,
destination constraints, session authorization, scope limits, allowance controls
or automatic-retry behavior were changed. No IP/region bypass or provider
fallback was added. Hosted verification remains pending owner installation and
a fresh preview reply; if refused again, inspect only the new
`[Companion] Provider rejected request.` entry in `stderr.log`.

On October 24 the owner confirmed installing that update and restarting the
Node app. One real signed-in browser test still returned HTTP 503 with
`companion_provider_403`; the thinking indicator cleared and the draft was
preserved. Model access and a real reply using the prepared key and current
transport succeeded locally again. Hosted replies remain unresolved: the new
safe server diagnostic is needed to distinguish provider permissions from an
upstream network/edge restriction. No automatic retries or provider bypass
were added. The frontend readability update cannot resolve this HTTP refusal.

The owner subsequently ran the private hosting probe: both unauthenticated and
authenticated catalog requests returned 403 with `network_access_denied`.
The exact blocked egress address and upstream rule remain unconfirmed. See
`companion-hosting-support-2026-10-24.md` for the results, safe probe instructions
and support drafts. Hosted chat remains blocked pending access review.

The backend-only patch is `/tmp/pinevela-preview-companion-20261023.tar.gz`
(206,550 bytes; SHA-256
`5592b3af00a9bddc56400263b59166394ae5bd6faf197d610249ab0d6d3b3b4e`).
It contains only the API bundle, instructions and a file manifest. Preserve a
copy of the previous bundle inside the non-public backend directory, extract
into the application root and restart the Node app. No dependency installation,
environment changes or migration is needed. TypeScript, 13 companion checks,
bundle syntax, configured-secret scanning and archive round-trip checks passed.

## Required remote checks

Private configuration is prepared locally under the ignored
`.security/spaceship-private-20261023/` directory: a hosting-specific `.env`, the
unchanged database CA certificate and an exact copy of the original 32-byte PIN
key. The directory is mode `700`, each file `600`. Configuration round-trip,
original-file equivalence, encrypted/authorized client-to-pooler TLS, current
schema and stored PIN-key compatibility passed a read-only local verification.
The initial verification incorrectly used database-hop SSL metadata behind the
pooler; it was corrected to check the actual client TLS socket and passed. No
existing key, local runtime environment or hosted record was changed.

The owner reports uploading the private files to the documented application/private
directories and completing their permissions. These remote paths and permissions
remain independently unverified. The prepared `.env` supplies
application settings without manual copying of secret values into the panel.
Production mode continues to supply `NODE_ENV`. Existing support/AI and the
corrected server-only Storage configuration are included; the live payment key and destructive execution remain disabled for
the initial hosting assessment. Exact proxy configuration remains pending.

- **SSH/Terminal access:** obtain a secure operator connection or use the hosting
  Terminal. Spaceship exposes this through cPanel's Manage Shell, or Hosting
  Manager → Manage → Advanced → Other tools → Manage SSH. The Node environment
  chosen for the application must be active when installing dependencies.
- **Native dependencies and memory:** install the locked runtime dependencies on
  the host and verify Sharp loads. Essential advertises one CPU core and 1 GB
  RAM. Build the frontend locally and upload the verified build to avoid imposing
  its build-time memory load on the shared server.
- **PostgreSQL egress:** test the actual project's Session pooler on port 5432
  with certificate verification, plus required HTTPS provider endpoints. The
  presence of PHP/MySQL or a working WordPress site does not establish that
  PostgreSQL egress is available. Spaceship's Outgoing port management is under
  Manage → Advanced; its current account rules have not been inspected.
- **Secrets:** configure the real Supabase URL/anon key, database connection,
  verified CA file and existing 32-byte delivery-PIN key outside public document
  roots. The PIN key must retain its identity and mode `600`. Add the existing
  Resend, moderation, companion and payment settings privately. Deployment
  packages must exclude `.env`, private keys, backup archives, `.git` and
  `node_modules` copied from this computer.
- **HTTPS, proxy and cookies:** determine actual proxy addresses from the host,
  configure only those trusted addresses and set the exact HTTPS public origin.
  Retest client-IP accounting, cross-site rejection and Secure/HttpOnly cookies.
  Do not enable blanket proxy trust to make login work.
- **Process lifetime and jobs:** Spaceship uses Passenger, which can stop idle
  processes and scale process counts. PineVela currently polls support delivery
  every 30 seconds, payment reconciliation every 15 seconds and order expiry
  every minute. Verify a supported single-process/always-running configuration
  or provide independently scheduled execution for these existing jobs. A page
  returning 200 alone does not establish reliable job processing. Keep shared
  database leases and the disabled destructive-execution gates.
- **Realtime and OAuth:** test streams/proxy buffering and Google account choice,
  callback state and reload/logout isolation. Google flow state and some request
  limits are process-local; multiple Passenger instances require deliberate
  routing/shared state before enabling that configuration.
- **Independent backups:** the encrypted 6,327,841-byte transfer package is ready
  privately under `.security/production-readiness-2026-10-23/recovery/offhost-ready/`.
  Copy it only to a protected location outside all website roots, then retrieve
  it independently and verify its digest. Keep its two decryption keys in a
  separately protected recovery system. Supabase database/Storage content is
  not automatically covered merely by backing up a WordPress website.

No remote changes were made directly by the agent; the owner's reported changes
are recorded above. Private credentials were not printed or shared in chat.
Native CAPTCHA replay and genuine operational acceptance remain the separate
requirements in the [readiness report](production-readiness-2026-10-23.md).

References checked:

- [Spaceship Node.js application setup](https://www.spaceship.com/en-GB/knowledgebase/setup-nodejs-application-spaceship-hosting/)
- [Spaceship Essential specifications](https://www.spaceship.com/en-GB/web-hosting/)
- [Spaceship SSH/Terminal access](https://www.spaceship.com/knowledgebase/enable-ssh-access-hosting/)
- [Passenger process lifecycle](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/dynamic_scaling_of_app_processes/standalone/)
- [CloudLinux CommonJS/ESM loader](https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/)
