# Manager dashboard and marketplace verification — 2026-10-03

## Changes

- Manager query results now populate properties, maintenance, staff, bargains, activities,
  board requests and room keys. Loading follows query state; failed requests show an error
  and Retry instead of silently returning empty data.
- Seller message badges are red; buyer message, tracking and Market badges are blue.
  Sidebar, compact top navigation and mobile variants are covered. Counts represent unread
  notices. Conversation/tracking/platform views acknowledge their relevant notices.
- Seller review notifications show the authenticated buyer's name, purchased item/service,
  score and optional review. An unchanged resubmission does not create another notification
  or increase the rating count.
- View Order selects the exact order and does not open delivery PIN entry.
  Completion/cancellation and store disable/restore now generate scoped notices.
- Item publishing supports three extra photos. Services support four named price options,
  each with an optional photo. Inspection offers thumbnails and a fullscreen viewer with X,
  arrows, keyboard and mobile swipe controls. Price-only options remain supported; order
  price/image snapshots come from the selected catalog option.
- Linked primary owners cannot buy or review their own store's items/services. Existing
  self-purchase reviews are excluded from public totals. Enforcement uses persisted
  store/application/merchant relationships, including different primary and seller emails.

## Upload protections

An active seller store is required before parsing a large upload body. Marketplace photos
use the existing JPEG/PNG/WebP signature checks, full raster decoding, PNG re-encoding,
metadata removal, safe filenames, quotas, worker bounds and protected serving policy.
Photos are resized to at most 1600 pixels per side. Gallery and price-option URLs must
belong to the publishing account's saved uploads; ownership metadata survives restart.
Legacy hosted covers remain compatible; raw uploaded HTML/SVG is not served.

## Verification

- Complete security suite: **78 passed, 0 failed**. After the final upload admission change,
  marketplace media/ownership, image security and request-limit integration tests also passed.
- Chromium against the production build at **375, 768 and 1440 pixels** verified manager
  hydration and recovery from an intentional HTTP 503; sidebar/top/mobile buyer counts;
  responsive seller counts; read clearing; detailed rating notices; View Order without PIN;
  thumbnails/fullscreen/keyboard/swipe; service price/photo pairing; actual item publication
  with three secured uploads; and the service four-option limit and photo upload.
- No unexpected browser console/API errors or page-width overflow in those checks.
- TypeScript, production build, private-data and final whitespace checks passed.
  Vite retains its existing large-bundle advisory.

Security probes rejected anonymous/wrong-role/inactive-store uploads, active content,
foreign seller images, excess photos/options, invalid category prices, self-purchases and
self-reviews. They verified independent purchases, trusted price/image selection, private
notifications, read persistence and image ownership after restart.

All mutation tests used disposable accounts, data directories and uploads. Operational data
was not changed. This verifies the listed local flows; it is not a new whole-project audit
or a guarantee against ratings abuse using unrelated accounts.
