# Android screen fit, Google launch and profile confirmation

The Android window now keeps the entire app below status/camera areas and above
navigation controls. The same rule covers Welcome, login/signup, dashboards,
catalogue/product views, onboarding, dialogs and bundled legal pages. Compact
screens can scroll to their footer; short screens do not force content underneath
Android's controls. Landscape uses the available space beside cutouts/navigation.

Every native document and the initial SystemBars hint use `viewport-fit=contain`.
Capacitor remains the single owner of system-bar, cutout and keyboard insets.
The viewport helper preserves that choice through pageshow and screen resizing.
This removes the WebView-version-dependent behavior of `cover`, without adding
per-page padding or a second inset listener. Website viewport behavior is retained.
The field officer's full-width Light header also avoids scrollbar-width clipping.

Google login/signup previously opened the website's login/signup card before
starting the provider. New Android attempts go through a short browser-owned
launcher directly to Google's account chooser. Signup carries only the explicit
current Terms acceptance from the app, validated again by the server. The secure
browser return, fresh provider proof, one-use native code, S256 verifier, active
account checks and HttpOnly native session storage remain enforced. Older APK
signup without consent metadata retains its required browser Terms step.
The launcher preserves the existing boolean tab marker so the verified Google
callback displays the explicit return-to-app prompt after signing in.

The profile-save confirmation was shifted half its width off the mobile screen:
the mobile style reset `transform` but retained Tailwind's separate `translate`.
Both are now reset for mobile gutters. The primary dashboard emits one floating
confirmation, removing the duplicate global popup for the same action. Desktop
centering and the inline saved-avatar acknowledgement remain available.

## Install

- Android: install `releases/android/pinevela-android-screen-fit-20261101.apk`
  over the existing development build. The data/package/signature are preserved.
- Hosting: back up the existing build folders, then extract
  `releases/web/pinevela-android-screen-fit-20261101.zip` into the existing
  `pinevela-app` root and restart the existing Node app in Spaceship. The ZIP has
  the two build directories directly inside it. A duplicate ZIP is in `/tmp/`.

Apply the hosting ZIP as well as the APK for the direct Google launch and web
profile confirmation. Preserve `app.cjs`, environment variables, `node_modules`,
private files and hosting configuration. No dependency, SQL migration, OAuth
console, DNS or SMTP change is required. The ZIP is cumulative, retaining prior
seller subscriptions, live admin prices, UI/theme changes and photo caching.
Neither package has been deployed remotely. Keep ZIPs outside the public web root.
Restore the previous build folders and restart Node to roll back the hosting.

## Verification

- TypeScript, web build, native web build, Capacitor sync and Android build pass.
- 51 Node checks cover document/policy integrity, viewport lifecycle, direct
  Google launch/retry, consent validation, expiry, replay/account substitution,
  native transport, legal acceptance, destination and worker privacy behavior.
  The live provider check only reads public configuration/authorization redirects.
- 82 modern Chromium scenarios render the actual connected Android bundle with
  a synthetic native bridge and local read-only account fixtures. They cover
  320×560, 390×780 and 812×360, both themes, all ten role/onboarding routes,
  product-filter dialogs, support/catalogue/legal pages and native Google dispatch.
- Eight actual local profile-save scenarios check mobile/desktop and both themes
  for primary/resident accounts: one centered floating confirmation, visible
  within the viewport and clear of mobile navigation. No hosted profile is changed.
- Three browser-return scenarios check an ordinary web visit, a fresh provider
  session and an older session, without submitting a real identity or transferring
  an account. Only fresh sessions offer the existing Continue in the app action.
- 32 native instrumentation tests include four safe-area tests, nine document
  lifecycle checks and six exact physical inset measurements. Asymmetric left/
  right cutouts, navigation and keyboard insets use Capacitor's production listener.
  Existing cookie, session-store, bridge and public-photo-cache regressions pass.
- 65 actual API36 emulator UI scenarios check compact/tall/landscape windows,
  Light/Dark, gesture/three-button navigation, real keyboard, support and policies.
  The final installed APK is hash-checked, then checked again after a normal
  emulator shutdown/reopen. Original display/navigation/keyboard/theme settings
  are restored; existing app data is preserved.
- The delivery scan finds no configured server secrets in the built artifacts.
  APK assets match `dist-mobile`; test-only CA/classes/loopback endpoints and
  source maps are excluded from delivery. Worker backend bundles remain unchanged.

The emulator uses WebView133. No newer engine was installed; the modern Chromium
checks and production-listener inset tests supplement that device coverage. A
physical Samsung or every phone model has not been tested. No real Google account,
email signup, payment, hosted profile edit or iOS build was performed in this task.
Reports and screenshots: `docs/verification/android-safe-area-2026-11-01/`.
These are debug-signed development APKs, not Google Play release packages.
