# Appearance, branding, Help and browser offline update

30 October 2026. Prepared locally; not deployed to pinevela.app.

## Changes

- The sliding theme switch uses a blue selected sun in Light mode and a yellow
  selected moon in Dark mode. Its animation, keyboard semantics and optional
  System default choice remain available.
- Welcome, login, dashboard headers, launch screens, public pages and policy
  headers share one wordmark stylesheet and local font. Pine stays black on
  yellow; Vela has a transparent background with black lettering in Light and
  yellow lettering in Dark. Explicit inverse badges stay legible on blue.
- Primary onboarding actions use PineVela blue/white in Light and yellow/navy
  in Dark. Scopes cover manager/residence/store setup, resident activation,
  seller registration, identity verification, invitations, staff creation,
  approval-key enrollment and welcome dialogs, including portal content.
  Secondary, destructive, Google and OTP resend controls retain their roles.
- Contact support in policy navigation and Terms review opens PineVela Help.
  Help offers a separate **Email support** link for people who prefer email.
  Help and FAQ remain reachable before accepting Terms, matching the existing
  server support exemption. Returning to product pages still requires acceptance.
- Website document navigation goes through the browser network stack, so an
  offline reload shows the browser's own offline screen. No custom offline HTML
  or cached account screen is returned. An already open form is not forcibly
  reloaded when connectivity drops. The service worker handles only the public
  install manifest and creates no response caches.

## Verification

- TypeScript, website/backend build and connected mobile build passed.
- Theme tests: 17; PWA/privacy/static delivery: 8; legal/session: 21; mobile: 30.
- Isolated Chromium: 145 scenarios at phone and desktop widths, both themes,
  public and role-based visual fixtures, onboarding actions, shared font/mascot,
  policy transparency, Help before Terms, continued product gating and recovery.
  Chromium reported no installability errors. Both worker and page network
  targets were offline: the resulting document was `chrome-error://chromewebdata/`
  with `ERR_INTERNET_DISCONNECTED`, followed by successful online recovery and
  empty Cache Storage. Role fixtures test UI, not server authorization.
- Installed development APK: six actual Pixel 4a/API 36 WebView scenarios and
  seven physical-display screenshots. Checked welcome and both account cards,
  sliding transitions, compact signup/required agreement controls, local Help
  navigation, shared wordmark font, theme icon paints and matching system bars.
  The emulator was signed out (server returned 401); no account form was submitted.
- All 169 mobile public files match the APK byte for byte. Private-data and
  whitespace checks passed. No policy article or Terms registry hash changed.

Evidence: [Android report](verification/appearance-2026-10-30/android/result.json),
[browser report](verification/appearance-2026-10-30/browser/report.json),
[offline report](verification/appearance-2026-10-30/browser/browser-offline.json).

Production Google/CAPTCHA/signup completion, physical phones and iOS builds were
not retested for this styling update. Linux cannot build the iOS package.

## Apply the update

Use `/tmp/pinevela-appearance-update-20261030.zip` for the existing hosting app.
Privately back up its `dist-supabase/` and `dist-supabase-backend/` folders, extract
the ZIP into the existing `pinevela-app` root, and restart that Node application.
The two build folders must sit directly inside `pinevela-app`, without another
enclosing directory. Keep the existing environment, dependencies, `app.cjs`,
private data and hosting settings. This cumulative build requires no new SQL,
DNS, SMTP or API-key change. Restore the previous build folders to roll back.

Reload online once so the updated service worker can activate, then reload
offline to check the browser's own screen. Contact Support should stay within
PineVela; only the explicit Email support link should open the email app.

Install `releases/android/pinevela-appearance-update-20261030.apk` from this project
over the existing development APK to test Android. APKs are saved in the project
at the owner's request, so temporary-folder cleanup will not remove them. The
previous welcome build and checksums are in the same folder. These are
debug-signed development builds, not Play releases.
The tested build is also saved at
`android/app/build/outputs/apk/debug/app-debug.apk`; packaging can be repeated with
`python3 scripts/package-appearance-update.py` after successful builds and checks.
