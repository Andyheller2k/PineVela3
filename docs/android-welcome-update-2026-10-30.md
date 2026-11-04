# Mobile welcome and account-card update

Signed-out native launches show a glass Welcome to PineVela card over the same
transparent girl artwork used on the website landing page. Sign in opens
`/#/login?mode=login`; Create an account opens `/#/login?mode=register`.
Both destinations are bundled forms. The welcome buttons do not start browser
authentication. The website and browser-installed app retain their existing
entry flow.

Both native account cards keep the two-part Login / Sign Up selector. Its
highlight slides, and the incoming form runs the existing short slide/fade.
Reduced Motion disables these transitions. The signup fields remain 44px high,
with 16px input text and 10px gaps. Terms text is 11px and privacy text is 10.5px
on phone widths; the full wording, required checkbox and server acceptance rules
remain intact. Google signup keeps its small accessible icon action.

The header logo returns from either card to Welcome. Explicit onboarding,
continuation and provider-error links still open their existing forms. A
provider-verified saved session continues to its authorized dashboard.

The welcome layout is identical in Light and Dark, with theme colours, a single
static bundled portrait and one blurred panel. Android bars follow the same
theme. There are no new background animations or remote artwork requests.

## Install

Install `/tmp/pinevela-mobile-welcome-20261030.apk` over the previous PineVela
Development APK. The persistent build is
`android/app/build/outputs/apk/debug/app-debug.apk`.

This UI update requires no website upload, SQL migration or authentication
setting change. The Step 3 server package remains a separate prerequisite for
its native authentication endpoints if it has not already been applied.

## Verification

TypeScript, the mobile build, Android debug build and all 30 existing mobile
checks passed. `scripts/verify-android-auth-entry.cjs` checks the installed APK
hash and uses real Pixel emulator taps. Five scenarios and six full-display
screenshots cover the welcome glass/artwork, both internal buttons, actual
selector/form animation events, signup density, required consent, Light/Dark
bars and Reduced Motion.

The emulator restored its existing signed-in account before the user explicitly
requested sign-out. The normal sign-out control was used; a subsequent actual
`/api/auth/me` request returned 401. The emulator was left signed out on Welcome.
No login, signup or Google forms were submitted during this UI check.

See `android-welcome-verified-2026-10-30.json` and
`verification/android-welcome-2026-10-30/result.json` for exact APK hashes and
results. This is an Android development build. Physical-phone, iOS, live Google
and production CAPTCHA completion were not retested for this presentation change.
