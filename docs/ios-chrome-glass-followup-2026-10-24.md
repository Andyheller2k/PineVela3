# iOS chrome, companion closing and clearer glass — 24 October 2026

The later [chrome and gesture update](product-chrome-and-swipe-2026-10-24.md)
supersedes the strip layering described here and reserves its height above
header controls. The physical iPhone result remains a device check.

The [merchant, navigation and glass update](merchant-navigation-ui-2026-10-24.md)
contains the latest upload package and slightly clearer auth-card styling.
The evidence and archive below describe the preceding checkpoint.

The owner's iPhone 11 Pro running iOS 26 retained a white native status area after
switching the product appearance from light to dark. The live preview already
served the preceding 8px fixed-edge implementation with no-cache HTML.

The installed-app edge now has a 12px minimum and a solid background-color.
WebKit's fixed-container sampler excludes direct backgrounds on boxes with width
or height at most 10px. Its subsequent sampling path can reuse the previous
color when the selected element is unchanged. The larger edge uses the live
opaque-color path instead. Pointer events remain disabled and no space is added
to the document flow. Theme metadata and body/HTML colors still update together.
This follows [WebKit's actual sampler implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/LocalFrameView.cpp)
(`primaryBackgroundColorForRenderer`, `thinBorderWidth`, `lastFixedContainer`).
Native rendering on the owner's phone remains to be confirmed; Chrome emulation
cannot establish a physical iOS result. No reload, storage reset, reinstall or
user-agent workaround was added.

Companion closing no longer waits for an AnimatePresence exit. Close button,
Escape and backdrop clicks immediately unmount its native dialog; opening
animation and static glass while open remain unchanged. Shared dialog focus,
scroll locking and top-layer cleanup are retained.

Auth cards use less tint and less frosting: phone/tablet 8–12% navy with 2px blur;
desktop 40–46% navy with 8px blur. Backdrop-only dimming preserves bright-image
text contrast while reducing frosting exposes portrait details. Text and controls
are not faded. Stronger field surfaces, muted hints, independent portrait/card
scrolling and reduced-transparency/unsupported-browser fallbacks remain. The
accessibility preference fallback now also covers desktop.

## Verification

- TypeScript, production frontend build, existing app-mode/launch/appearance and
  companion test files, install-worker privacy, static response security and
  final diff checks passed. No migration, provider or authorization change.
- Final guest browser audit: 257 checks in 55 scenes, with both forms at seven
  viewport sizes, actual fonts settled before measuring scroll geometry, bright-
  image contrast, muted hints, independent portrait and both phone/desktop
  reduced-transparency fallback. Genuine guest API reads; no hosted writes.
- Actual signed-in administrator: 94 checks in eight light/dark mobile safe-area
  and desktop navigation scenes. The opaque edge exceeded WebKit's thin-border
  threshold, matched the actual theme and left Sign Out visible/hit-testable.
  Account writes were blocked and original task-tab preferences restored.
- Actual signed-in primary user: six companion close/reopen cases at 1440px and
  375px, using close button, Escape and backdrop. Removal took 20–24ms; focus,
  body overflow, native modal state and launcher state restored. Static blur
  stayed while open. Zero runtime exceptions, all non-GET requests blocked,
  no messages or settings submitted. This presentation test did not test AI
  provider replies or physical iOS compositing.

Evidence: `.security/production-readiness-2026-10-23/clear-glass-audit-2026-10-24/`.

## Upload

Use `/tmp/pinevela-preview-clear-glass-20261024.tar.gz`, superseding the preceding
liquid-UI archive. Extract into `/home/jqmgxgpuym/pinevela-app`, retain existing
assets, refresh the preview and close/reopen the installed app. It includes the
preceding frontend fixes; no Node restart is required.

127 public frontend files, 3,081,862 bytes. All 171 build files were scanned for
configured private credentials and source maps: zero matches. No API/private
files are included. Archive members were byte-verified and index.html is last.
SHA-256: `40993f790606cc66671242469c02be0326bd6d364d86c0e8e88be01e9b83d68a`.
Remote upload has not been performed by the agent.
