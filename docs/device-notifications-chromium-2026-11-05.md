# Chrome/Chromium notification compatibility — 5 November 2026

The live Chrome/Chromium tab had notification permission and a valid browser
subscription, but PineVela rejected it with "This browser push service is not
supported." Read-only inspection confirmed Google host `jmt17.google.com`, an
HTTPS `/fcm/send/` endpoint, no query, fragment, credentials or nonstandard port,
and the expected 65-byte public and 16-byte authentication keys. The private
subscription token and encryption keys were not exported or recorded.

Chromium's [endpoint constants](https://chromium.googlesource.com/chromium/src/+/main/components/push_messaging/push_messaging_constants.cc)
and [channel selection](https://chromium.googlesource.com/chromium/src/+/main/components/push_messaging/push_messaging_utils.cc)
document this separate Google service. Registrations cannot be moved between
Google hosts. The server now accepts this exact host and nonempty `/fcm/send/`
path, while retaining the existing transport, key and unknown-host checks.

## Apply the patch

1. Back up `dist-supabase-backend/supabase-server.mjs` in the existing private
   `pinevela-app` directory.
2. Extract `pinevela-browser-push-fix-20261105.zip` into `pinevela-app`, replacing
   the included server bundle.
3. Restart the existing Node app, refresh PineVela, and try **Enable** again in
   **Options → Device notifications**. The earlier test/disconnect buttons have
   since been removed; use Save notification preferences to choose alert categories.

The notification update and its runtime dependencies must already be installed.
This patch needs no SQL, environment changes, additional npm installation, new
Android APK or replacement sender keys.

## Verification

- The new regression failed before the fix with the reported error; all nine
  focused tests pass after the change.
- The actual Express/Auth handlers and a disposable restored PostgreSQL database
  passed 113 checks, including Chromium registration, unchanged endpoint
  persistence, its authenticated status, rejection of anonymous and wrong-account
  requests, and rejection of lookalike/private-network push hosts. Provider
  identities are explicit local fixtures. No cloud messages or database writes
  occur in this suite.
- The production bundle differs from the previous hosting release in one
  validation block. Source maps and private credentials stay out of the patch.
- Applied through the user's signed-in cPanel session. The deployed bundle and
  its rollback copy were checked against the new/previous release SHA-256 values
  using File Manager's read API with HTML transcoding disabled, then Node was
  restarted. The real Chrome account registered successfully and one hosted test
  reached its service-worker notification tray with the account label. Existing
  account alerts stayed enabled; optional discovery choices stayed unchanged.

Evidence: `docs/verification/device-push-chromium-2026-11-05/`.
