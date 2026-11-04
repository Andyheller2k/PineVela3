# Mobile layout and theme update

31 October 2026. Prepared locally; deployment to pinevela.app is separate.

## Behaviour

- Page actions and selected catalogue/filter controls use PineVela blue/white in
  Light mode and yellow/navy in Dark mode. This includes the Market/Residences
  switch, onboarding, dialogs, Nearby Services and Ask AI controls.
- App navigation keeps yellow selections with navy labels in both themes:
  mobile bars, More menus, desktop sidebars and top navigation. **Become a
  Merchant keeps its gold/yellow fill and glow in both themes.** Status colours,
  destructive actions and image previews preserve their meaning.
- Seller notification filters scroll horizontally with full, non-shrinking
  labels. The focused rail also supports horizontal keyboard scrolling.
- System default retains its pill shape when selected. The day/night slider,
  device preference persistence and automatic system-theme following remain.
- The shared welcome popup omits the unnecessary staff-account sentence.
- Phone marketplace and seller inventory/service cards use two compact columns,
  bounded image previews and content-driven heights. Titles, prices, availability,
  essential actions and useful service locations remain visible. Secondary
  seller service information and reviews expand through More detail. Desktop
  catalogue geometry retains its previous sizing.
- Purchases show a compact merchant/item/quantity/total/status/date summary.
  The reference is shortened to one line; the full ID remains in the tooltip and
  in API requests. Tapping or pressing Enter on the summary mounts the existing
  PIN, map, timeline, cancellation and review controls. Collapsing unmounts them.
  Order ownership, PIN verification, cancellation and payment rules are unchanged.

## Verification

Results and screenshots are in `docs/verification/mobile-ui-2026-10-31/`.
Browser role/account/order/payment responses are local synthetic fixtures, with
outgoing HTTPS blocked. Browser checks do not prove hosted authentication, RLS,
real payments or a real seller session. The Android report records actual-device
checks separately from any labelled DOM/CSS probes. No account forms, payment
operations or AI messages are submitted during verification. iOS is not built.

Final checks passed: TypeScript, web/mobile builds, Capacitor sync, Android build,
9 focused unit checks, 110 browser scenarios and 10 seller/public regression
scenarios, with zero browser runtime exceptions. The artifact scan found no
configured server secrets in the delivery builds. All three backend bundles are
unchanged from the preceding seller update; no auth or database source changed
for this UI task.

The final APK was reinstalled on the Pixel 4a Android 16 emulator and its installed
checksum matched the saved APK. Seven final scoped checks passed, including real
signed-out startup and 11 separate CSS probes per theme. The earlier native
Sign in tap opened bundled Login. The full native interaction suite remains
incomplete: the Sign Up accessibility hierarchy was unavailable after one retry.
Authenticated seller/purchase flows and a physical phone were not tested. The
emulator started for verification was shut down; its app data was preserved.

## Apply

The website package is `releases/web/pinevela-mobile-ui-update-20261031.zip`,
also copied to `/tmp/pinevela-mobile-ui-update-20261031.zip`. Privately back up
the existing hosting build folders, extract both `dist-supabase/` and
`dist-supabase-backend/` directly into the existing `pinevela-app` application,
then restart its Node process. Keep `app.cjs`, dependencies, environment settings
and private data. This package includes preceding local updates. No new SQL
migration, dependency, DNS or OAuth configuration is needed for this UI update.

The development APK is saved permanently in the project at
`releases/android/pinevela-mobile-ui-update-20261031.apk`. Install over the
previous development APK; it uses the same debug package/signature. It is not a
Google Play release. Earlier saved APKs are preserved.

Rollback: restore the previous two hosting build folders and restart Node. Keep
the previous development APK if you need to reinstall the older Android build.
