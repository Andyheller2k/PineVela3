# Android conversion — step 2

This step adds the Capacitor Android project and a separate bundled frontend.
It is an internal development preview of the login/signup, FAQ, help and policy
screens. Native account access is deliberately unavailable until step 3.

## Build and run

Use Node 22+, JDK 21 and the SDK prepared in step 1. `ANDROID_HOME` should point
to the SDK. Android Studio is optional for this command-line workflow.

```bash
npm run android:apk
```

This builds `dist-mobile`, syncs its files into Android, then runs
`:app:assembleDebug` through the pinned Gradle wrapper. The APK is saved at
`android/app/build/outputs/apk/debug/app-debug.apk`.

Start `PineVela_Lite_API_35` using VS Code's **Emulator** command, then use:

```bash
npm run android:run
```

The debug app appears as **PineVela Preview**, package
`app.pinevela.mobile.debug`. The base identifier is `app.pinevela.mobile`.
The debug suffix keeps preview installs separate from a future release.

Gradle uses one worker, no persistent daemon and a 1,536 MiB heap. On this 8 GB
computer, compiling before starting the emulator leaves more memory available.
The first build downloads official Google/Maven dependencies; later builds
reuse Gradle's cache. No release signing key or store upload is included.

## Implementation

- `capacitor.config.ts` points to `dist-mobile`; there is no hosted `server.url`.
- Android targets API 36, minimum API 24, with Capacitor 8.5.3, AGP 8.13.0 and
  Gradle 8.14.3. The wrapper ZIP has a pinned SHA-256 checksum.
- The native preview requires WebView 111+. An older WebView receives a local
  update screen. SystemBars applies native insets to avoid system-bar overlap.
- `mobile/index.html`, `src/native/` and `vite.mobile.config.ts` provide a
  dedicated static entry, independent of the existing website/server build.
- Only an explicit list of public files is copied. No `.env`, backend bundle,
  source maps, analytics, website service worker or installation prompt is
  packaged. Fonts and login artwork are local.
- The existing login/signup component retains its fields, transitions, password
  guidance and appearance rules. Native account buttons are disabled, and their
  handlers and transport fail closed. The preview provider stays signed out;
  it does not invent sessions or successful server responses.
- CAPTCHA is inactive in this disconnected preview. Website protection remains
  unchanged; the next authentication step must retain required checks.
- The preview CSP blocks connections and frames. External policy links display
  an explanation locally. Published policy article bytes and the registered
  Terms version/hash remain unchanged.
- Backup and cleartext traffic are disabled. No camera, location, storage,
  microphone or notification permission was added. The launcher reuses the
  existing PineVela icon without modifying the source image.
- A detached-node guard fixes an existing WindDust canvas exception when a
  theme change races route unmounting. Connected rendering is preserved.
- TypeScript excludes generated `android/` and `dist-mobile/` files while still
  checking the application, mobile entry, build config and shared guards.

The website's `npm run build`, cookie transport, backend authorization, RLS,
published legal source files and dependency lock remain intact. No hosted
deployment, database migration or real authentication request is part of this
step.

## Verification

The APK built, its debug signature verified, and it installed in
`PineVela_Lite_API_35` (API 35, WebView 124.0.6367.219). A fresh process launch
and a second cold launch both reached the bundled login screen. It is left open
in the emulator with the system appearance preference restored.

- Five installed-APK scenarios passed using real emulator touches, Android
  screen captures and WebView inspection: native bridge/login, signup controls,
  system/manual themes, local policies and offline reload.
- No API/external WebView requests, registered service workers or uncaught
  JavaScript exceptions were observed during those scenarios. The final app
  process log contained no Android fatal exception.
- All 28 mobile files match their packaged APK bytes. Seven configured private
  values were scanned against APK assets; none matched. The APK contains no
  backend bundles, source maps, environment files, website worker or analytics
  files. This targeted scan is not a complete security audit.
- The native boundary/artifact tests passed (3), browser smoke scenarios passed
  (5), and existing PWA/static-delivery checks passed (8). Signup-password,
  provider-error and installed-mode regressions passed. TypeScript and the
  normal production frontend/backend build passed.
- Existing uncommitted work was preserved, and final `git diff --check` passed.

Download copy: `/tmp/pinevela-android-step2-preview-20261029.apk` (9,431,252 bytes).
The persistent build copy remains under `android/app/build/outputs/apk/debug/`.
SHA-256:
`708a519fea14ff6b6588decce4c568676f1d9346dd292f8e49beb5294a8353a4`.

Final build, APK and emulator evidence is recorded in
`android-step2-verified-2026-10-29.json` and
`verification/android-step2-2026-10-29/`. The preview is not a store release or
proof of production login, payment, marketplace or housing workflows.

Reusable checks:

```bash
npm run lint
npm run test:mobile
npm run verify:mobile-browser
npm run test:pwa
npm run build
```

For the installed debug APK, forward its WebView's debugging socket to local
port 9228, then run `node scripts/verify-android-preview.cjs`. Only a debug build
exposes this socket; no release debugging override is configured.

## Next step and release work

Step 3 must implement the reviewed native API/session design, protected media,
revocation/logout and Google browser return. Do not assume the website's
same-origin HttpOnly cookies are shared with an Android WebView. Keep server
identity checks, CSRF protections, RLS and CAPTCHA intact. Prove authorized and
denied requests using an isolated test backend before connecting real accounts.

Later release work includes native back/lifecycle/keyboard behavior, physical
phone testing, polished adaptive icons/splash screens, signing, account deletion,
store disclosures and Google Play testing requirements.
Theme checks in this step cover the WebView content; native status/navigation
bar color synchronization with a manual theme remains part of native UX work.

Existing font licensing also needs resolution before distribution: the bundled
Childer notice says personal use only, and no commercial permission is recorded
in this repository. Obtain the applicable permission or replace it before a
store release; its existing notice is included in this internal preview. The
three newly bundled Google font families include their SIL Open Font Licenses.
Confirm the provenance of the existing Caviar Dreams files as part of that
release review.

## References

- [Capacitor configuration](https://capacitorjs.com/docs/config)
- [Capacitor System Bars](https://capacitorjs.com/docs/apis/system-bars)
- [Android Gradle Plugin 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- [Gradle wrapper verification](https://docs.gradle.org/8.14.3/userguide/gradle_wrapper.html#sec:verification)
- [Tailwind browser compatibility](https://tailwindcss.com/docs/compatibility)
