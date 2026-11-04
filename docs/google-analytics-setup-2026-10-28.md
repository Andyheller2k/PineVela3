# PineVela Google Analytics — 28 October 2026

Measurement ID supplied by owner: **G-NWBP5E04F9**. The app uses the Google tag
directly. No Tag Manager container or private Analytics API secret is required.

## Collection and choice

`public/analytics.js` is the shared, deferred bootstrap for `index.html`, Privacy,
Terms and the immutable Terms copy. It loads one asynchronous Google tag only
after the browser's separate **Allow analytics** choice. Declining keeps it off;
Terms acceptance never enables it. The choice lives in
`pinevela:analytics-consent` with preference-format version 1. A malformed or
missing choice is off. Google signals and all advertising consent categories
remain disabled; browser Global Privacy Control also keeps collection off.

The small choice panel adapts to the existing light/dark palette. Visitors can
reopen it through the landing footer, Privacy Policy or app settings. Withdrawal
sets Google's `ga-disable-G-NWBP5E04F9` flag before further tag calls, stops this
integration's events and removes accessible `_ga` analytics cookies. It does not
claim to erase information Google already received.

Tracking is enabled only on HTTPS apex/www production hosts, not preview,
localhost or arbitrary ports. A blocked Google script does not block the app,
retry automatically or grow an idle event queue. The app's service worker does
not cache or intercept analytics traffic.

## Page views and privacy

The bootstrap sends manual `page_view` events with fixed page titles and
canonical page locations. `AnalyticsNavigation` observes React Router changes;
the bootstrap also handles native hash/history navigation and deduplicates the
same screen. Normalized public store views do not send store identifiers.

Only known public pages and general dashboard paths are measured. Sign-in,
invitations, enrollment/onboarding, payment returns, unknown pages and URLs with
sensitive query keys are excluded, including for a previously loaded tag.
Account IDs, emails, form values, room keys, payment references, support/message
contents, raw search queries and full referrer URLs are not included in these
events. External referrers are reduced to origin; authentication/payment
provider referrers are omitted. Generic dashboard names do not identify a user.

This initial release measures visits and page navigation. Custom signup,
merchant-application and purchase conversion events are not installed.

Analytics cookies are configured for 30 days with `cookie_update:false`.
The owner still manages GA4 property-level data retention/access separately.
The Privacy Policy now discloses this optional provider and the controls;
the published Terms article/version/hash is unchanged.

## Google property configuration

**Keep Enhanced measurement OFF** in Admin → Data streams → PineVela Website.
Google's automatic history measurement can send additional views even when
`send_page_view:false` is set. Turning it off prevents duplicate/manual views
and automatic search/form/history collection outside the app's allowlist.
The owner's change was verified in the public Google tag before the real-tag
browser checks. Do not enable it later without reviewing this integration.

No Google Analytics dashboard/report access is connected here. Code/tag tests
do not establish that a hosted visitor has appeared in the owner's reports.

## Installation and first live check

Use the cumulative update ZIP, extract into the existing `pinevela-app` folder,
overwrite the included build folders and restart the Node app. Keep environment,
dependencies, keys and startup configuration. No further SQL is needed. The
desktop top-navigation clearance fix and preceding Terms/logo update are included.

After upload, open https://pinevela.app in a fresh browser tab and choose
**Allow analytics**. Visit Market, Residences and Why Us, then check Google
Analytics → Reports → Realtime. If blocked by a browser extension or declined,
the app remains usable and that browser's visits will not be collected. Google's
automatic installation checker may not see a tag before consent is granted.

## Verification

The privacy/configuration tests cover denied/malformed consent, sensitive routes,
origin-only referrers, generic store paths, duplicate prevention, production-host
restriction, browser privacy signals, cookie cleanup and blocked scripts.
The built-browser harness uses the real downloaded Google tag and fulfills every
network request locally. It captures collection requests before network, so no
test visits reach the real property. Hosted collection still needs the owner's
post-install Realtime check.

The same ZIP also makes the mobile signup agreement more compact: 12px main
Terms text, 11px privacy helper text, tighter spacing and readable underlined
links. Desktop, merchant and signed-in agreement text retain their existing
sizes. The checkbox remains required and its full label stays clickable.

Passed: production frontend build, TypeScript, 19 focused privacy/legal/delivery
tests, 158 existing unit checks, 10 real-tag browser scenes and 47 landing,
policy, signup, agreement and market-navigation regression scenes. The real-tag
run captured 15 page views and 16 collection requests locally, with zero runtime
exceptions and zero requests sent to the live property. Eight additional signup
scenes verify 320/390/430/1440px in both themes, including readable font/link
sizes, retained desktop sizing and required unchecked acceptance.

Official references: [manual page views and history settings](https://developers.google.com/analytics/devguides/collection/ga4/views),
[SPA measurement](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications),
[consent mode](https://developers.google.com/tag-platform/security/guides/consent),
[privacy/disable flags](https://developers.google.com/tag-platform/security/guides/privacy),
[cookie configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config).
