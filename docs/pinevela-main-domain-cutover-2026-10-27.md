# PineVela main-domain cutover — 27 October 2026

**Completed:** the existing PineVela app now serves `https://pinevela.app`,
replacing the public WordPress site, as authorized by the owner after testing
the preview update. The existing application, Supabase database and account
data were retained. This was a hosting-route and public-origin change.

## Live routing and configuration

| Address | Verified behavior |
| --- | --- |
| `https://pinevela.app/` | HTTP 200, PineVela React app |
| `https://www.pinevela.app/` | HTTP 308 to the apex |
| `https://preview.pinevela.app/` | HTTP 302 to the apex |
| Preview paths, queries and login hash routes | Continue at the corresponding main-domain URL |
| `/api/health` on the apex | HTTP 200, `status: ok`, `persistence: supabase` |

Both hostnames resolve to the existing hosting server, `66.29.148.39`; DNS was
not changed. The existing CloudLinux Node application `pinevela-app` was moved
to the main domain and restarted, retaining production mode, Node 22 and
`app.cjs`. Its private environment now contains
`PINEVELA_PUBLIC_ORIGIN=https://pinevela.app`, with mode 0600. Only that origin
setting was changed; `deploy/spaceship/main-domain.env.example` is a single
setting example, not a replacement for the full environment.

The main document root uses the existing working Passenger configuration plus
the `www` redirect. WordPress rewrite/cache rules no longer handle the homepage.
The preview root redirects to the apex except for the existing signed Paystack
webhook path, `/api/payments/paystack/webhook`, which still reaches the same
backend to preserve an existing provider destination during transition.
Preview is now a redirect, not a separate test deployment.

## Authentication and provider settings

The owner saved these Supabase Authentication URL settings while the hosting
backup was prepared:

- Site URL: `https://pinevela.app`.
- Additional allowed redirect:
  `https://pinevela.app/api/auth/google/callback**`.
- Existing redirect entries retained.

Fresh anonymous provider-flow probes verified that the main application
callback is accepted and that invalid redirect targets fall back to the main
Site URL. The main application's Google-start endpoint now returns the main
callback, sets its Secure/HttpOnly/SameSite flow cookie and reaches Google's
account chooser through Supabase. A callback without the flow cookie is denied;
cancelling our own fresh flow returns to main-domain login.

The Google OAuth client's provider callback remains:
`https://bivajljcdeofyxzmplxm.supabase.co/auth/v1/callback`.
Scopes, PKCE and session checks were not changed. The owner previously confirmed
Google branding verification. Google Console branding URLs were not edited by
this cutover; their existing preview links redirect to the published main pages.
For a later branding edit, use:

- Homepage: `https://pinevela.app/`.
- Privacy: `https://pinevela.app/privacy.html`.
- Terms: `https://pinevela.app/terms.html`.

Turnstile configuration remains enabled. A live isolated-browser check loaded
the real widget on the main hostname, but the automated challenge did not
complete within the bounded check. No hostname-rejection code was observed;
this does not establish successful human verification. Genuine signed-in
Google/email sessions, signup, password recovery and physical-phone behavior
still require user interaction.

**Payment limitation:** unsigned webhook probes at both hostnames return HTTP
503 with the application's fixed “Paystack is not configured” message. Both
requests were rejected without payment writes. Signature-validation success
and checkout readiness cannot be claimed from that result. No Paystack
credentials, dashboard settings or live charges were changed or created.

## Preserved WordPress backups

Private hosting backup directory:

```text
/home/jqmgxgpuym/pinevela-cutover-backups/2026-10-27T16-35-30-129Z
```

The parent directory has mode 0700 and backup files have mode 0600. These are
outside the public document roots.

| Backup | Verified content | SHA-256 |
| --- | --- | --- |
| `wordpress-files.tar.gz` | 39,072,308 bytes; gzip/archive read check passed | `7dc2674eb61b7a94a2a75f2e8970d31e872d506c7ff3a1ff0218dc8c53c4c136` |
| `wordpress.sql` | 158,350 bytes; successful WP-CLI export; 13 CREATE TABLE statements | `7e081a0a011937fbaa9d005430f5470c06119f0d7bd401379149d7ac16cb24f6` |

`wordpress-retained/` contains the original WordPress directory moved out of
public routing. Its MySQL database was retained. `config/` preserves the original
private app environment, startup/package files, selected frontend/policy files,
CloudLinux selector metadata and both original `.htaccess` files.
`backup-manifest.json` and `state.json` record the backup and original state.
Provider code snapshots were also created before changes:

- Main: `ffde94266e89503ce69d9914a43de2c60cb64055`.
- Preview: `9974561f7f8149fd8d8f13f8c1e63076a5b6098c`.

## Verification and artifacts

The deployed index matches the tested build exactly:
`172f1a0d78edd7e196f5511191cded461545ccbdc02b8638f6801b40ef2f9d83`.
Only the updated privacy and terms files needed uploading; the app build
already matched the latest owner-tested update. The policies' home/service
links now use the apex; policy substance was not changed for this move.

Public HTTPS checks verified the homepage, exact policy contents, JavaScript,
CSS, icons, relative manifest, uncached service worker, health and redirects.
Guest account APIs returned 401. HEAD checks for `.env`, `.git/config`,
`.security/` and backend source paths returned 403/404 without fetching private
bodies. The anonymous Google handoff and negative callback checks passed.

Live Chromium checks at 390px passed for light and dark login, with no horizontal
overflow, no guest runtime exceptions, and no idle Turnstile scripts or frames.
Navigating from preview preserved the `#/login` route at the main hostname.
These were disposable-browser checks, not a physical-phone thermal measurement.

Local verification completed during preparation: production Vite build, eight
static/PWA security tests, trusted Google/payment origin checks, and
`git diff --check`. No database migrations were required.

Evidence and the optional frontend recovery package are saved under `/tmp/`:

- `pinevela-main-domain-live-report.json` (includes the two unavailable-payment checks).
- `pinevela-main-domain-browser-report.json` (includes the incomplete provider challenge).
- `pinevela-main-domain-mobile-light.png` and `pinevela-main-domain-mobile-dark.png`.
- `pinevela-main-domain-update-20261027.zip` (frontend files and this record;
  the hosting switch is already applied, so no installation is needed).

Browser cookies, local storage and installed-app identity belong to an origin.
Users should sign in at the main domain and reinstall their home-screen app
from there if it was installed from preview. Session tokens were not copied
between domains.

## Rollback reference

If a rollback becomes necessary, use the private saved state to restore the
original public origin and CloudLinux app domain to preview, restore the
original routing configuration, return `wordpress-retained/` to the main
document root, and restart the existing Node app. Verify both hosts afterwards.
Retain the backup directory and WordPress database. A domain rollback does not
require restoring or rolling back the Supabase database.

References: [Spaceship hosting MCP](https://www.spaceship.com/en-GB/knowledgebase/mcp-for-shared-hosting-what-it-is-and-how-to-use-it/),
[Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
