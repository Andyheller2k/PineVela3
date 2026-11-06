# Device notifications — 5 November 2026

PineVela now has Android FCM delivery and browser Web Push delivery. The
settings card is included in every account's existing Appearance/Options area,
with a shared `/notification-settings` page linked from the website and Help.
Permission is requested only when Enable is pressed.

## Behaviour

- Existing notification-centre events enqueue delivery for their exact
  recipients: user, resident, manager, staff, seller, administrator, verification
  and customer-service/feedback accounts. Maintenance uses the same pipeline.
- Titles identify the account workspace. Private bodies use a short summary;
  passwords, room keys, approval keys, handover/payment PINs and encrypted chat
  contents remain inside the authenticated app.
- New marketplace items/services and newly approved public properties have
  separate, initially unchecked choices. Images contain only currently public
  listing/property photos. A withdrawn photo remains inaccessible even if a
  server thumbnail was cached. Android/browser presentation depends on the OS.
- Existing catalogue entries form a baseline. Enabling notifications does not
  send historical posts or old account alerts. Editing a listing/property does
  not create a second discovery campaign. Discovery is deduplicated per device;
  private alerts remain distinct for each recipient account.
- A linked portal connects only after its login and any portal PIN are verified.
  An independent login requires an explicit Enable action. **Keep my other
  accounts connected** retains its other already-verified device connections;
  leaving this unchecked replaces them. This preference never grants access to
  another account's private content. Sign out before handing a device to someone
  else; signing out disconnects every account's alerts on that installation.
- Tapping an alert opens PineVela's notification route. The server checks the
  exact recipient before returning details. Another account must sign in
  separately; notification parameters never select an authenticated identity.
- Settings show one Enable/Save action. Turn alert categories off and save to
  stop those alerts; signing out disconnects the installation. The previous
  test/disconnect buttons are removed. The authenticated diagnostic endpoint
  remains available to operators and never runs automatically.

## Delivery and security

The new private installations, verified bindings, publication ledger and jobs
have RLS enabled and no grants to `anon`, `authenticated`, `pinevela_backend` or
`pinevela_catalog`. The two new triggers retain invoker rights. Existing
notification writes already run in authorized server/system transactions;
browser roles cannot create push jobs or choose recipients.

Binding creation rechecks the authenticated session in its transaction. Delivery
rechecks session validity, account restrictions, current Terms, saved portal PIN
version, administrator membership, resident allocation, staff employment and
feedback access. Auth revocation, account bans, expired grants and logout stop
pending private delivery. A device capability permits only registration/status
operations in an authenticated account or revocation of that installation; it
cannot read another account's alert.

The server listens for PostgreSQL wakeups and processes bounded leased batches.
It also checks public catalogue eligibility at most once per 30 seconds, with a
60-second fallback. Devices have no new polling timer, foreground service or
wake lock. Three provider calls can run at once, outside database transactions;
network requests have deadlines. Jobs retry with backoff, at most six attempts.
Delivery is not exactly-once: stable OS tags suppress duplicate presentation if
a provider accepted a message before a database acknowledgement was lost.

Account jobs expire after 24 hours. Provider TTL is 24 hours for private alerts
and six hours for discovery. Job records are pruned after 30 days; installation
leases expire after 90 inactive days and are pruned after another 30 days.
Existing in-app notification history has its own retention.

Web subscriptions accept only known browser push-service HTTPS hosts with valid
encryption keys. No caller-selected redirect or arbitrary image URL reaches the
sender. FCM uses HTTP v1 with a dedicated sender identity. Android's Firebase
messaging auto-init and analytics collection start disabled; registration occurs
only after the explicit enable flow. The website service worker still does not
cache API responses, account information or offline documents.

## Installation on Spaceship

The migration `20261105110000_device_push_delivery.sql` has been applied directly
to the existing Supabase project `bivajljcdeofyxzmplxm`; no user was subscribed.
The repeatable SQL Editor copy is included for recovery. Do not rerun earlier
unrelated migrations or replace the database.

1. In the **private Node application folder**, create `.security/push/` with
   directory permissions `700`. Copy these local files there, with permissions
   `600`:
   - `.security/push/firebase-service-account.json`
   - `.security/push/web-push-keys.json`
   These files are excluded from the public update ZIP. Keep them outside
   `dist-supabase`, `public_html`, public downloads and source control. Preserve
   the same Web Push key file across deployments.
2. Set the existing Node app's environment variables to the actual hosting
   paths, for example (replace `/HOSTING/PATH/pinevela-app`):

   ```text
   PUSH_FCM_PROJECT_ID=pinevela
   PUSH_FCM_KEY_FILE=/HOSTING/PATH/pinevela-app/.security/push/firebase-service-account.json
   PUSH_WEB_KEY_FILE=/HOSTING/PATH/pinevela-app/.security/push/web-push-keys.json
   ```

3. Back up the existing two `dist` folders and dependency manifests. Extract
   `pinevela-device-notifications-20261105.zip` into the existing `pinevela-app`
   root. It includes `dist-supabase`, `dist-supabase-backend`, `package.json` and
   `package-lock.json`. Keep all other environment variables, database CA files,
   delivery-PIN keys and private configuration. With the existing Node 22
   runtime, run `npm ci --omit=dev`, then restart the Node app. The sender's two
   new runtime dependencies are `web-push` and `google-auth-library`.
4. Install the matching development APK over the existing PineVela Development
   app. Do not uninstall or clear data. This is not a signed Play Store release
   bundle; the release Firebase client file is ready for later release signing.
5. In each intended account, open Options → Device notifications → Enable.
   Choose whether to keep other verified logins and save the intended categories.
   Marketplace and residence discovery are optional. Receipt of a genuine account
   alert verifies delivery; there is no user-facing test button.

The Android client configurations for `app.pinevela.mobile.debug` and
`app.pinevela.mobile` are present and ignored by Git. The service-account key and
Web Push private key are server-only and never enter the web bundle or APK.

## Verification boundaries

Evidence is in `docs/verification/device-push-2026-11-05/`:

- Real restored PostgreSQL plus actual Express/Auth handlers test all role
  labels, access denials, leases, opt-ins, public thumbnail validation/cache,
  PIN rotation, allocation release, employment departure, provider bans,
  device sharing and logout. Provider identities and image bytes in that suite
  are explicit local fixtures; sends are captured without cloud messages.
- Chromium runs the built React app at 320, 390 and 1440 pixels in both themes,
  checks contrast, discovery defaults, permission timing, independent-account
  choices and tap destinations. Permissions/subscriptions and API replies in
  that suite are explicit fixtures, not a live browser push subscription.
- Firebase's validation-only endpoint accepted the actual sender credentials
  and Android payload without delivering a notification.
- The hosted database dry run rolled back before the exact SQL was committed.
  Independent readback confirmed RLS, grants, migration digest, empty device/job
  tables and the existing-catalog baseline.

The development APK was installed on the existing Pixel 4a emulator without clearing data. Three actual FCM connection checks passed: foreground receipt and a downloaded picture, background delivery and tap, and delivery after terminating the activity followed by a cold-start tap into the correct account gate. Only that emulator received the tests; its temporary Firebase registration and test notifications were removed. These tests verified native/provider delivery independently of the hosting queue.

The hosting update and private sender files are now installed on Spaceship.
The three push environment variables were checked in cPanel, their names and
paths corrected, saved, and the Node app restarted. Independent uncached requests
confirmed the expected website bundle and `/api/device-push/config` returned
`web: true` and `android: true`. After the Chromium compatibility patch, the real
Chrome account registered and one hosted test reached its notification tray with
the account label. Hosted Android queue-to-device delivery still needs its own
enabled-device check; the earlier direct FCM emulator checks remain separate.

The user's Chromium subscription exposed an omitted Google push hostname. See
[the browser compatibility fix](device-notifications-chromium-2026-11-05.md).
An iOS native project/APNs sender is outside this Android/browser update.
