# Production-readiness checkpoint — October 23, 2026

Local baseline and recovery verification is complete. **Public launch is not yet
approved:** native Auth CAPTCHA replay rejection, deployment configuration,
independent backup retention and populated business acceptance remain open.
Express remains the API with Supabase persistence and Auth.

Follow-up on the same date: support Resend credentials are now configured locally,
the sender was corrected to `noreply@auth.pinevela.app`, and the official Resend
test-recipient request returned HTTP 200 with an email ID. The local production
preview was gracefully restarted to load those settings; all 19 guest/privacy
checks passed again. The sending key cannot read email status (HTTP 401), so
provider acceptance is verified, not recipient-inbox delivery. Auth SMTP was not
changed. Both frontend builds were scanned again after the key was saved: 1,671
files, zero configured private-key matches.

A 6,327,841-byte transfer package now contains the 17 verified encrypted recovery
artifacts plus its manifest/instructions; archive bytes were checked after
packing. Both decryption keys are excluded. It is ready under private
`recovery/offhost-ready/`, but upload, independent key retention and retrieval
are still pending. This package alone does not close off-host recovery.

The owner confirmed an existing Spaceship Web Hosting Essential subscription and
its Node.js application setup screen. No Node applications currently exist there.
The owner chose to assess that plan before another host. See the
[Spaceship assessment](hosting-spaceship-assessment.md); no remote app or website
change has been made.

## Verified

| Area | Evidence and result |
| --- | --- |
| Database recovery | Fresh AES-GCM checkpoint `7f71e411-fa88-4c73-aa87-dc5ae45a5cba`, with its matching encrypted delivery-PIN key sidecar. Actual isolated PostgreSQL restore recovered 82 migrations, 37 public tables with RLS and 14 private views. Browser-role and restricted-role denials were retained. |
| Storage recovery | All 11 actual objects, 4,615,608 bytes: ten private media objects and the public branding logo. Authenticated download, encrypted archival and local reconstruction passed; the catalog matched the fresh database checkpoint before and after download. Independent offline reconstruction passed, as did ciphertext tamper and wrong-checkpoint rejection. |
| Native workflows | 309 checks using isolated PostgreSQL, GoTrue and captured mail: recovery/session isolation 36, support lifecycle 69, schema/grants/migration hashes 138, identity/API/RLS/encryption-key/session boundaries 66. Six actual locally registered identities and two locally submitted support cases; no fabricated properties, stores, orders or payments. |
| Security regressions | `npm run test:security`: 142 passed. After the Vite patch, 13 focused static-frontend, source-map, runtime-retirement and PWA tests passed. These are regression tests, not proof of successful live business transactions. |
| Builds | Full TypeScript check and production frontend/API/both worker builds passed. Fresh candidate artifacts are in `/tmp/pinevela-readiness-build-20261023/`; they were not published or substituted for the running preview. All three canonical backend bundles passed `node --check`. |
| Local transport/privacy | Existing production-mode preview passed 19 bounded guest checks: authenticated reads denied, private/encoded paths denied, cross-site mutation denied, install resources and framing/cache policies present. Read-only PostgreSQL timeout testing discarded the interrupted connection and recovered without replaying a query. |
| Secrets/configuration | Local environment and the existing 32-byte PIN key have mode `600`; environment files are ignored and untracked. Database project/session-pooler/TLS-CA validation passed. No configured private credential was found in the inspected frontend bundles. Destructive residence/wipe execution gates are off. |
| Dependency review | Vite patched from 6.4.3 to 6.4.4; both manifest ranges and the lockfile agree. One installed package changed. Full and production-only npm audits report zero known vulnerabilities at this checkpoint. This does not establish application security by itself. |
| Type-check hygiene | Excluded generated/private output directories. All 593 real source/test/script files remain checked; 1,511 generated JavaScript files are omitted. Independent review found no tracked source omissions. |

The existing preview artifacts and matching pre-patch dependency manifests were
archived and byte-verified as `config/pre-check-preview-build.tar.gz`. This is a
local rollback reference, not an approved public release: its dependency lock
predates the Vite security patch. Keep the patched dependency in any deployment.
No rollback, database rollback, cloud restore or deployment was performed. The
original baseline did not restart the preview; the later email configuration
reload is recorded above. Database compatibility must be reviewed before a future
code rollback.

## Remaining requirements

1. **Resolve direct-native CAPTCHA reuse.** Missing and invented proofs fail at
   Supabase. A genuine proof reused after five seconds with different nonexistent
   credentials still reaches credential validation. PineVela's persistent API
   guard correctly rejects exact and cross-portal reuse. Root cause is not yet
   established; do not disable CAPTCHA or add a privileged bypass. Dashboard
   configuration/validation analytics and matching provider logs require owner
   access. The private `captcha/provider-follow-up.md` contains sanitized request
   IDs, timestamps and the exact closure test; no provider message was sent.
2. **Retain an independently retrievable protected backup.** These verified
   archives and recovery keys remain on this computer. Off-host retrieval,
   automated cadence/retention/alerts, acceptable data-loss/recovery targets and
   the hosted backup/PITR plan have not been verified. No writers were frozen;
   take a fresh release checkpoint or use an appropriate writer freeze before
   cutover. Provider re-upload and disaster cutover were not exercised. This
   readiness Storage archive is separate from privileged destructive-workflow
   evidence; its stricter existing backup guards were preserved.
3. **Configure the real deployed origin.** No public HTTPS origin or trusted
   proxy list is configured locally. Choose hosting, then configure exact origin,
   proxy addresses, secure-cookie behavior, OAuth redirects, Turnstile hosts,
   payment callbacks, health checks and monitoring. Re-test through that origin
   before changing website DNS. Local HTTP tests do not establish deployed HTTPS
   behavior or volumetric DDoS resistance.
4. **Carry the verified support configuration into deployment.** Local support
   Resend configuration and provider acceptance are now verified as described
   above. Configure the same server-only credentials on the eventual host, then
   check an authorized real support reply. Supabase's Auth SMTP is separate; its
   private settings were not accessible for this audit. Student/work inbox
   delivery remains untested.
5. **Complete genuine operational acceptance.** The restored real dataset has
   no housing, stores, listings, orders, saved buyer–seller messages or payment
   transactions. Successful manager/staff/resident allocation, seller setup,
   checkout/fulfillment, buyer–seller chat and sanction/governance journeys still
   need an appropriate owned staging workflow. Paystack is configured in live
   mode locally; no payment request or charge was made. Local support and crypto
   checks do not close these gaps. Real Google OAuth, authenticated responsive
   browser flows and physical-device PWA installation remain separate checks.
6. **Review deployment process ownership and scaling.** Keep privileged deletion
   operators isolated and disabled unless separately approved. Establish job
   ownership/restart monitoring; process-local API/AI budgets and OAuth flow state
   require a deliberate shared/sticky strategy before multiple API instances.

## Evidence and provenance

Sanitized receipts, private test adapters and recovery instructions are under
`.security/production-readiness-2026-10-23/` (`recovery/`, `workflows/`, `captcha/`,
`config/`). Recovery keys and plaintext contents are intentionally absent from
this document. Keep that directory private and outside public hosting/Git.

Baseline source HEAD: `1a636ac25440213e00a21f60a171b0c8371d78c0`, with existing
uncommitted roadmap and login-spinner edits preserved. `config/release-manifest.json`
records the reviewed working-tree and artifact hashes. A reviewed release commit
is still required before deployment. No new hosted migration was applied. No
hosted business records, accounts or Storage objects were changed; bounded real
CAPTCHA tests did create normal security logging/attempt/fingerprint accounting.
Owned test services and temporary browser profiles were closed.

References: [launch roadmap](backend-roadmap.md), [CAPTCHA details](captcha.md),
[Vite patch advisory](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22),
[Supabase production guidance](https://supabase.com/docs/guides/deployment/going-into-prod),
[database and Storage backup distinction](https://supabase.com/docs/guides/platform/backups).
