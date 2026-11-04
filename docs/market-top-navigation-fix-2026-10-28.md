# Market top-navigation clearance — 28 October 2026

The compact primary-account market applied 24px of top padding even when the
desktop fixed navigation was selected. At 1024px, the navigation ended at 74px
while the Market/Residences switch started at 24px, causing the reported overlap.

A desktop-only rule now restores the existing 6rem top-navigation inset for
this market view. It matches the Residences view. Sidebar spacing, phone/tablet
spacing, catalog controls, card dimensions and navigation behaviour are retained.

## Verification

The browser check reproduced the overlap before the change. The production
frontend build and 16 isolated Chromium scenes verify both themes:

- Desktop widths 1024/1280/1440/1710px: navigation clears both directly clickable
  catalog buttons; Market and Residences align; switching views, restoring the
  sidebar and reloading the saved top-nav preference preserve the correct inset.
- Phone/tablet widths 320/390/768/1023px: a saved desktop top-nav preference does
  not change the mobile header or shift the catalog controls/product cards.

These are local presentation checks with read-only fixtures, not hosted account
verification. No backend, database, analytics or hosting setting was changed.

## Install

Package: `/tmp/pinevela-market-top-navigation-fix-20261028.zip`. It is a cumulative
install containing the latest frontend and the previously prepared unchanged
backend, so it can be applied after or instead of the earlier Terms/logo ZIP.
Extract into the existing `pinevela-app` application folder, overwrite matching
build files, restart the existing Node app and reload PineVela. Keep the existing
environment, secrets, dependencies and startup configuration. The prior Terms
migration has already been applied; there is no further SQL action.
