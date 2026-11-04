# Saved PineVela Android builds

These APKs are intentionally stored inside the project so `/tmp/` cleanup does
not erase them. APK binaries are ignored by Git; keep this directory when
copying or backing up the project.

- **Latest:** `pinevela-android-screen-fit-20261101.apk` — shared status/cutout/
  navigation containment, direct Google account chooser and centered profile
  confirmation. Apply the companion hosting ZIP for the Google handoff update.
- **Previous:** `pinevela-catalog-image-cache-20261031.apk` — retained Market/Residences
  photos, a bounded public-photo disk cache and unchanged private-photo protection.
- **Previous:** `pinevela-seller-subscriptions-20261031.apk` — the approved seller
  plan comparison, live admin prices, Light/Dark actions and Pro renewal state.
- **Previous:** `pinevela-mobile-ui-update-20261031.apk` — compact market/seller
  cards, collapsible purchases, scrolling notification filters and consistent
  page/navigation colours. Become a Merchant stays gold in both themes.
- **Previous:** `pinevela-seller-update-20261030.apk` — seller themes, publishing
  draft preservation, photo loading, store location/phone validation and an
  explicit unfinished-signup notice with inline OTP errors.
- **Previous:** `pinevela-appearance-update-20261030.apk` — theme icon colours,
  consistent logo/wordmark, onboarding colours and in-app Contact Support.
- **Previous:** `pinevela-mobile-welcome-20261030.apk` — restored native Welcome,
  glass card/artwork, sliding login/signup switch and compact signup controls.

Latest device verification is in `docs/verification/android-safe-area-2026-11-01/`.
Install the latest APK over the previous development build to test. All use the
same development package and debug signature; these are development builds.

Run `sha256sum -c SHA256SUMS.txt` in this folder to verify the saved files.
Details: [screen fit and Google update](../../docs/android-screen-fit-google-update-2026-11-01.md),
[photo caching update](../../docs/catalog-image-cache-update-2026-10-31.md),
[subscription update](../../docs/seller-subscriptions-update-2026-10-31.md),
[mobile UI update](../../docs/mobile-ui-update-2026-10-31.md),
[seller update](../../docs/seller-market-update-2026-10-30.md) and
[appearance update](../../docs/appearance-consistency-update-2026-10-30.md).
