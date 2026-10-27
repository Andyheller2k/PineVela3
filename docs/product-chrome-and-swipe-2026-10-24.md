# Mobile product chrome and page gestures — 2026-10-24

The reported white iPhone status area persisted after a product-theme change.
The prior opaque color strip sat at z-index 0, behind full-screen dashboard
shells. WebKit's fixed-edge sampler hit-tests the topmost element and walks its
ancestors. Full-viewport candidates can preserve the previous edge color, and
backdrop filters prevent a single solid color from being selected. A strip
behind that shell cannot reliably supply the new tint.

On installed mobile product pages, the opaque strip now sits at z-index 80,
above page navigation and below startup loading. Its height remains
`max(12px, env(safe-area-inset-top))`, shared through
`--pv-browser-chrome-height`. Product headers reserve that height plus 8px before
their controls, so the strip cannot cover the logo, notifications or sign-out.
Its navy/white color updates with the existing theme metadata and page backing.
It has no backdrop filter or pointer handling. Ordinary browser and desktop
header spacing retain their previous behavior.

This follows [WebKit's fixed-edge sampler](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/LocalFrameView.cpp)
(`findFixedContainer`, `IgnoreCSSPointerEvents`, `preferExistingColor`). The old
`black-translucent` Apple status-bar setting remains absent: a
[WebKit engineer explains](https://www2.webkit.org/show_bug.cgi?id=317153#c2)
that it is deprecated and cannot adapt across page appearances. These source
findings explain the patch; physical iOS native status rendering still needs
device confirmation.

The application has no swipe-between-product-pages handler. The previous
viewport guard blocked pinch gestures while allowing single-finger horizontal
movement, including gestures reaching browser back/forward navigation. Product
dashboard main regions now explicitly hide x overflow and suppress x scroll
chaining. Intentional horizontal scroll areas retain local scrolling.

The mobile touch guard distinguishes vertical page scrolling from horizontal
gestures. It suppresses horizontal page movement outside scroll areas that can
consume the gesture. Maps, form editing, range controls and the photograph
gallery retain their own gestures. Blank edge gutters also suppress native
navigation starts without swallowing taps on edge controls. Public pages and
desktop gestures retain their previous behavior. No history entries are added
to trap users, and normal Back buttons remain available.

No API, authorization, account records or database schema changes are involved.
The preceding temporary Ask AI UI removal is retained.

## Verification

- `npm run lint` passed (`tsc --noEmit`). The production frontend build passed
  in 15.62 seconds; its JavaScript increased by about 2 kB before compression.
- Eleven focused gesture tests passed: both directions, vertical intent,
  nested LTR/RTL rails and boundaries, blank edge starts, edge controls,
  maps/forms/gallery, route/target changes and listener cleanup. The existing
  app-mode, app-launch and public-appearance test files also passed.
- An isolated Chromium run passed 177 checks across 21 scenes using the real
  guest FAQ in product appearance. Widths were 320/390/768px, with actual CDP
  safe-area insets of 0/44px, repeated dark/light/dark helper updates, and
  ordinary-browser/desktop comparisons. The strip was opaque, unfiltered and
  topmost; at a 44px inset, controls began at 52px and remained hit-testable.
- Four trusted CDP horizontal touch pans, from the center and both blank edges,
  were canceled, left the location unchanged and kept page x scroll at zero.
  A trusted vertical gesture remained uncanceled and scrolled the FAQ by 275px.
- No runtime exceptions, account writes or companion/provider calls occurred.
  No account or marketplace data was invented. The isolated browser closed
  after verification.
- These browser checks exercise the real guest FAQ and actual chrome helper;
  they do not establish authenticated dashboard behavior, account preference
  saving, or physical iOS native status rendering/history gesture suppression.
- `git diff --check` passed. Existing unrelated worktree changes were retained.

Evidence is under
`.security/production-readiness-2026-10-23/product-chrome-swipe-2026-10-24/`.

## Preview update

`/tmp/pinevela-preview-product-chrome-swipe-20261024.tar.gz`

127 changed/new public frontend files, 3,075,857 bytes (about 3 MB). All 171
candidate public files were scanned against configured private credential
values with zero matches. No API/private files or source maps are included;
every archive member was byte-verified and `index.html` is last.

SHA-256: `6221aea15f9173e97cb82cc1e958b408d9d2659ee11a8b66d2c14b2764ab3c0d`.

Upload and extract into `/home/jqmgxgpuym/pinevela-app`, retaining existing
assets. Refresh the browser or fully close/reopen the installed web app.
No Node restart is required. The package includes the earlier frontend fixes
and temporary AI UI removal. No remote upload was performed by the agent.
