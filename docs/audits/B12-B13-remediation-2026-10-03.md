# B12/B13 remediation — 2026-10-03

Scope: user dashboard dialog accessibility and initial JavaScript loading. Operational
accounts/data were not changed. CompanyStory keeps its separate native-dialog lifecycle.

## B12 — shared modal behavior

- DashboardOverlay now uses a named native modal dialog (`showModal`) in the browser's
  top layer. Dashboard controls/navigation and lower dialogs are inert while it is open.
- Shared behavior contains Tab/Shift+Tab, focuses the dialog on entry, invokes each popup's
  existing cancellation action on Escape, and restores the opener's focus on dismissal.
  Closing a nested viewer restores its thumbnail and leaves the inspection dialog active.
- All 25 user-dashboard overlay call sites have explicit names and dismissal policies.
  Icon-only close controls now have accessible names. Photo viewers share the dialog
  behavior and retain arrow keys, swipe, close and image selection.
- Background scrolling stays locked until the last shared dialog closes, then its previous
  setting is restored. Required store onboarding explicitly has no Escape-dismiss action;
  its existing required completion flow is preserved. Popup submission actions are unchanged.

## B13 — route and library splitting

- Landing stays eager; login, onboarding and every dashboard route use React.lazy with an
  accessible loading status. Route loading failures offer a working Reload page action.
  Existing role gates, route aliases and account redirects are retained.
- Vite separates React core and optional chart libraries without pulling their other
  dependencies into unrelated entry chunks. No warning threshold was raised.
- Current initial landing bundled JavaScript is **530,862 bytes** across entry/React/helper chunks,
  versus **2,393,411 bytes** before: **77.8% less uncompressed JavaScript**. Summed build
  gzip estimates are approximately **164 KB**, versus **602 KB** before.
- The duplicate parser-blocking CDN Leaflet script/styles are removed from `index.html`.
  Map components and the existing login map use the installed Leaflet module and bundled
  styles; login marker assets are local. Map initialization was checked in the real mobile
  order form.
- Largest emitted JavaScript chunk is about **307 KB**; the production build no longer
  emits the 500 KB chunk warning. Dashboard, chart and map JavaScript is absent from
  landing-page network requests.

## Controlled mobile measurement

Chromium headless; 375×900 viewport; 4× CPU slowdown; 1.6 Mbps download; 150 ms latency;
three cold-cache loads per build. External Google fonts were blocked consistently to
exclude uncontrolled third-party availability. Application assets/APIs were served from
an isolated local production server. JavaScript byte counts cover built application
assets and exclude the former external CDN script; encoded sizes exclude HTTP overhead.
The original page also depended on the external Leaflet script before rendering.

| Measurement | Before | After |
| --- | ---: | ---: |
| Initial bundled JS decoded bytes | 2,393,411 | 530,862 |
| Initial bundled JS encoded bytes received | 587,057 | 166,194 |
| First contentful paint, run 1 | 5.596 s | 2.240 s |
| First contentful paint, run 2 | 8.192 s | 1.600 s |
| First contentful paint, run 3 | 8.192 s | 1.700 s |
| Median first contentful paint | 8.192 s | 1.700 s |

This is a repeatable lab comparison, not field performance or a physical-device benchmark.
Large existing photographs/CSS remain separate performance opportunities outside this fix.

## Verification

- Production Chromium checks at 1440 px (sidebar and top navigation), 768 px and 375 px:
  named accessibility-tree dialogs, initial focus, Tab/Shift+Tab wrapping, background focus
  rejection, lower-dialog inertness, nested Escape, focus restoration, scroll restoration
  and no horizontal overflow.
- Mobile meetup map initializes with the local Leaflet CSS; Escape returns to the order
  form and restores the map button focus.
- Sign-out cancellation does not log out; order-form cancellation creates no order.
- Buyer/market, manager and seller lazy routes render; a primary user is still denied the
  admin dashboard. An intentionally unavailable login chunk displays its recovery action
  and reload subsequently succeeds.
- Existing production marketplace browser regression: manager hydration/retry, buyer/seller
  counts, review alerts, order inspection, full-screen image arrows/swipe, item publication
  with three extra photos and service-option image uploading/limits.
- `npm run lint`, `npm run build`, `npm run check:private-data`, and `git diff --check` pass.
  Successful browser flows have no unexpected console/runtime/API errors. Deliberate retry
  and unavailable-chunk responses are tested separately from successful flows.

Manual screen-reader sessions and physical mobile devices were not tested. Native dialog
semantics and inertness were verified through Chromium's accessibility tree and keyboard.

Reproduce after `npm run build` (Chromium defaults to `/snap/bin/chromium`, configurable
with `CHROMIUM_PATH`):

```sh
node tests/dashboardAccessibility.browser.cjs
node tests/dashboardAccessibility.browser.cjs --map
node tests/dashboardAccessibility.browser.cjs --measure --measurement=/tmp/pinevela-mobile-load.json
node tests/marketDashboardMedia.browser.cjs --production
```
