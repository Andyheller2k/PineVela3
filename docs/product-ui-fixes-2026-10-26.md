# Product UI corrections — 26 October 2026

The paused-companion package recorded below is an earlier checkpoint. The owner
subsequently requested restoring Ask AI for Spaceship testing; use the restored
package and [current testing instructions](companion-spaceship-testing-2026-10-26.md)
for that workflow. The UI verification evidence below remains valid for its
recorded checkpoint.

The Chrome administrator bell was squeezed by its flex container, even though
the SVG itself resisted shrinking. Product icon tiles now preserve their square
dimensions, while flexible text columns and long labels wrap. Administrator
Alerts and verification/market headings also have explicit flexible text areas
and wrapping action rows. Form controls remain within their containers.

Favorite hearts retain semantic red in both themes. The resident wishlist no
longer explicitly fills its heading heart white. Avatar method buttons expose
their selected state, show a gold selected segment and an outlined secondary
segment, and retain 44px targets at desktop and mobile widths. Avatar names can
wrap. The room-key onboarding and photo-save actions use explicit primary
surfaces; the room-key supporting copy uses an existing readable color utility.

The broad dark-background adapter previously made dialog scrims opaque navy.
Product dialogs now preserve a translucent scrim with 12px blur and a separate
glass card with 18px blur. This includes the shared overlays, native maintenance
notice, price sheet and nested map picker. Fields and map/image canvases keep
their own surfaces. Secondary controls use distinct navy fills and boundaries;
deep-blue gradient actions also retain visible fills across product pages.
Public-page appearance and account/API behavior are unchanged by these UI fixes.

## Verification

- TypeScript check, production frontend build, backend/worker builds and five
  existing theme, UI-rule and viewport test files passed.
- An isolated Chromium pass completed 1,897 checks across 1,236 scenes: 102
  non-companion overlay source variants and the reported content layouts in
  light/dark mode at 320, 375, 393, 768, 1024 and 1440 CSS pixels.
- The rendering probe uses actual compiled styles and source-derived DOM. It
  verifies viewport fit, square icons, visible button surfaces/targets, red
  hearts and translucent blurred popup surfaces. It contains no fabricated
  accounts or API responses and performs no provider calls or account writes.
- The first pass identified 38px desktop avatar buttons; explicit action roles
  now retain 44px minimum height, and the complete final pass succeeded.
- A separate source review covered all 103 shared-overlay call sites plus the
  standalone maintenance dialog. The companion keeps its existing custom glass
  and remains paused pending the hosting AI test.
- `git diff --check` passed. Existing unrelated worktree changes were retained.

This does not establish signed-in end-to-end coverage for every populated
account state or physical iPhone/Safari/Chrome rendering. The prepared browser
debugger was unavailable, so no existing signed-in browser session was used.
Rendering evidence is under `.security/product-surfaces-2026-10-26/`.

Cloudflare's real local inference result and the remaining hosting test are
recorded in [the companion test](companion-test-2026-10-26.md).

## Combined preview update

`/tmp/pinevela-preview-ui-ai-20261026.tar.gz` contains the complete 171-file
public frontend, API bundle, private Cloudflare diagnostic and update instructions
(174 files, 8,147,036 bytes). Every archive member was byte-verified and scanned
against configured private credentials with zero matches. No environment files,
dependencies or source maps are included; the frontend index is last.

SHA-256: `093dee23d5d075f72c90e5597a35b09f4d0b95edf5b240fa5eff02487fa092a4`.

Follow `UPDATE-20261026.txt` in the archive: extract into
`/home/jqmgxgpuym/pinevela-app`, retain private files and existing assets, configure
Cloudflare privately, update only the hosted diagnostic script and restart Node.
Run the diagnostic once and confirm a complete visible reply from hosting before
restoring Ask AI. No remote deployment was performed.
