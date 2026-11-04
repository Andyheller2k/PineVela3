# Android conversion — step 3

The [30 October account-screen update](android-welcome-update-2026-10-30.md)
restores the native welcome screen and sliding Login / Sign Up selector.
The verification and package names below describe the original 29 October build.

This development update connects the bundled app to the existing PineVela API.
Email/password login, signup, email verification and password forms stay inside
the app. Google alone opens the system browser and returns through a verified,
single-use S256 handoff. Existing server authorization, Terms, CAPTCHA and RLS
remain the security boundary. No database migration is required by this step.

## Screens

- Original PineVela login and signup cards, with native theme controls.
- Compact mobile signup arrangement: four smaller fields, password guidance,
  mandatory Terms, Create account, a white Google icon button and Log in link.
- A separate native email-code screen: six initial square cells expanding for
  the complete 6–10 digit code, paste/autofill and leading-zero support.
  Verify is PineVela blue in Light and yellow in Dark; Send again stays white.
  Its countdown describes the actual resend cooldown, not an invented expiry.
- The installed web app's loading mascot, wordmark and gold progress track,
  with transparent mascot artwork and a transparent native launch vector.
- Android status/navigation backgrounds and icons follow saved Light, Dark or
  System on launch, resume and configuration changes, preserving native insets.

The shared native frontend prepares the same UI for the later iOS conversion.
This step does not create, compile or sign an iOS application.

## Native transport

The fixed HTTPS API client keeps only allowed Secure/HttpOnly session cookies
in an Android Keystore AES-GCM store excluded from backup. Provider access/refresh tokens
and browser-handoff verifiers never enter JavaScript, Preferences, WebView
cookies or URL query strings. Native HTTP uses an independent cookie handler,
bounded bodies, cancellation, timeouts, refresh serialization and generation
checks. Protected images stream natively rather than passing base64 through JS.
Google's final return URL contains only an expiring opaque code and bound state.

Starting a new credential/signup attempt cancels older browser intents. Late
callbacks and old queued replies cannot replace the newer identity. Failed
login/logout operations preserve an existing verified jar when appropriate.
Credential operation checks cover Express case and trailing-slash aliases.

Only bundled main documents receive the exact-origin main-frame native bridge.
External documents open outside it. The old all-frame JS interface is removed;
the built-in Capacitor HTTP proxy is denied. The isolated CAPTCHA document is
the only extra hosted subframe path allowed, and has no native bridge/session
access. It is mounted only during a protected submission and sends a bounded
proof through a random, exact-source/origin message channel. Supabase validates
that proof using the existing settings.

Native fonts/assets and policy articles are bundled. Native builds omit website
analytics, service-worker installation and browser app-install prompts.
One foreground refresh replaces the website's long-lived event stream.

## Build and install

Run `npm run android:apk`. The persistent development APK is
`android/app/build/outputs/apk/debug/app-debug.apk`. The downloadable copy is
`/tmp/pinevela-android-step3-20261029.apk`. Its application ID is
`app.pinevela.mobile.debug`; it uses `https://pinevela.app` and is debug-signed.
It is a development test package, not a Play Store release.

Apply `/tmp/pinevela-android-step3-server-update-20261029.zip` in the existing
hosting `pinevela-app` root, replacing only the two build folders, then restart
the existing Node app. Keep environment, dependencies, private data and hosting
settings. No SQL, DNS, SMTP, API key or Supabase callback change is needed.
The archive contains its exact install and rollback instructions.

The isolated `transportTest` variant trusts a task-owned local test CA and uses
the emulator's loopback gateway. Neither that CA nor the local API configuration
belongs in the downloadable development or release APK. Do not install both
debug and transportTest for ordinary Google testing: both use the debug return
scheme. Final checks remove the temporary test variant.

## Verification boundaries

The final machine-readable report is `android-step3-verified-2026-10-29.json`;
screenshots and detailed scenarios are under
`verification/android-step3-2026-10-29/`. It records the exact final APK hashes,
build results, native tests, screen checks and genuine local authentication.

The final local run passed 87 Android checks across ten scenarios, 15 native
instrumentation tests, 30 mobile tests, 24 browser consent checks, and six
appearance scenarios with ten physical-display screenshots. An interrupted
local database process split the Android run after 65 completed checks; the
remaining 22 checks resumed on the same APK and preserved the interruption
record. The report identifies both runs and both APK variants explicitly.

Local tests use real isolated PostgreSQL, Supabase GoTrue and captured SMTP.
No hosted account or database was changed. Browser handoff boundary tests use
explicitly intercepted dependencies; CAPTCHA protocol tests use a synthetic SDK
and establish isolation, not a real Cloudflare solve. Real production Google,
Cloudflare and inbox delivery require a post-install check against the deployed
site. Private-photo success bytes and physical-phone performance are not
established by the local tests. Android release signing and store submission
remain a later step.

See [authentication details](android-auth-handoff.md),
[startup and system bars](android-startup-appearance.md), and
[the verified Pixel emulator](android-emulator-pixel-step3-2026-10-29.md).
