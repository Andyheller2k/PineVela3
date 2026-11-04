# Manager agreement, password eye and Android Google sign-in

The manager password eye remains transparent when a password is revealed. It
has a centered 44-pixel-wide target within the field and preserves the visible/
hidden state and accessible label in both themes. Page selectors keep their
existing Light/Dark colors.

The first manager agreement previously required an operation key before its key
prompt could mount. `POST /api/legal/accept` now saves the live account's own
current agreement without that key. Session/actor validation, strict consent
version, receipt identity and RLS are unchanged. Other manager writes still
require the operation key. An unavailable key prompt returns its original denial
instead of leaving a promise unresolved. Agreement reads/saves have a 20-second
deadline, readable errors and explicit retry; a timeout never consents locally or
automatically repeats a write.

Android's Google button uses Credential Manager's Google account chooser.
Google's token stays in native memory and travels directly to PineVela's server.
The server exchanges and validates it through Supabase, binds the live account,
and issues the existing private HttpOnly session cookies. The app verifies its
account before opening the portal. New signups preserve explicit current Terms
acceptance. Login does not grant consent automatically. The native flow uses a
short-lived, one-use nonce and S256 proof; no password, Google token or Supabase
credential enters JavaScript, a URL, analytics, or browser storage. There is no
automatic website fallback for native Google. Website Google login and older
APK browser handoffs remain supported.

## Apply

Install the companion development APK over the existing PineVela debug app.
Extract the hosting ZIP into the existing `pinevela-app` root, replacing only
`dist-supabase/` and `dist-supabase-backend/`, then restart the Node app in
Spaceship. Keep `app.cjs`, environment variables, `node_modules`, private files
and hosting settings. Apply both APK and hosting update for native Google.
No database migration is required. Keep a private copy of the previous build
folders for rollback; restore those folders and restart Node if needed.

The user configured the development Android OAuth client in the existing Google
Cloud project: package `app.pinevela.mobile.debug`, SHA-1
`18:3A:1A:1D:BF:F7:EA:22:D4:A2:A6:10:3C:1F:31:D7:38:E1:AD:73`.
The server uses the existing public Web OAuth client ID; an optional
`GOOGLE_WEB_CLIENT_ID` override must refer to the same project's Web client.
No Google client secret belongs in the APK. A later Play release requires its
own `app.pinevela.mobile` OAuth registration and actual Play signing SHA-1.

## Verification boundary

Manager checks use actual Express handlers and isolated restored PostgreSQL/RLS,
plus local browser fixtures on both web and connected mobile builds. Native
Google provider fixtures exercise proof binding and denial cases without signing
into a real account. Final reports, build status and device coverage are saved
under `docs/verification/manager-terms-2026-11-02/` and
`docs/verification/native-google-2026-11-03/`.

Neither saved package deploys remotely. A complete real Google account login on
the hosted server remains an acceptance check after applying both updates.
