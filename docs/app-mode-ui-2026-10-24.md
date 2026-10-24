# Installed-app layout and launch — 24 October 2026

Latest consolidated package: [merchant, navigation and glass update](merchant-navigation-ui-2026-10-24.md).
It includes the preceding iOS status-area, companion closing and app-mode fixes
and supersedes the packages described below.

Product headers stay outside the scrolling main content in the user, admin,
manager, resident and staff dashboards. Their shells fill the dynamic viewport;
only the main region scrolls. Desktop sidebar and top navigation modes remain
available. Product FAQ/Help and officer headers use document-sticky positioning,
with `overflow: clip` on their ancestors to avoid trapping the sticky header.
Public-page canvas behavior is unchanged.

The shared floating bottom bar keeps the home-indicator inset below its card,
with 4px of inner bottom padding. Content and floating actions reserve the bar's
measured height plus its distance from the viewport bottom. Landscape insets are
respected. Page transitions fade without translating fixed-navigation ancestors.

Theme metadata, HTML/body backing colors and a small opaque fixed viewport edge
follow product appearance: white in light mode, navy in dark mode. Public/login
chrome remains navy. The legacy Apple status-bar-style declaration was removed;
modern WebKit uses painted page edges for installed-app chrome. See the
[WebKit guidance](https://www2.webkit.org/show_bug.cgi?id=317153#c2).
Physical iOS rendering still needs confirmation on the owner's phone.

Only initial installed-app document startup shows the PineVela logo (60px) and
label (18px). The static HTML splash stays until the initial route and session
resolution commit. Later FAQ/Help, settings operations, session refresh and app
resume cannot recreate it. Necessary route/auth loading uses a 20px unbranded
spinner. Recoverable errors reveal their notices; a stalled initial startup
shows Reload after 20 seconds. No artificial startup delay, persistent launch
flag or stored account data was added. Normal website loading remains unchanged.

## Verification

- TypeScript, the production frontend build, ten app-launch/app-mode/public-
  appearance unit cases and the final diff check passed. No migration, API or
  authorization change was made.
- Guest browser regression: 252 checks across 55 scenes, including login/signup
  at seven screen sizes, muted hints, card scrolling, fixed portrait, bright-
  backdrop text contrast and reduced-transparency fallback. Zero hosted writes.
- Genuine administrator and user sessions: 94 checks and eight scenes per role,
  with light/dark iPhone portrait/landscape safe-area emulation and desktop
  sidebar/top layouts. Long real Settings content scrolled while Sign Out stayed
  visible and hit-testable. Chrome metadata, body/HTML colors, painted edge,
  compact bars and safe-area clearance passed. Account writes were blocked and
  each task tab's original theme/layout was restored.
- Compiled CSS geometry: 1,687 checks across 240 source-derived role-shell scenes
  plus two actual guest product FAQ scenes; another 12 checks covered officer
  document headers. These probes used actual source classes without business
  fixtures. They do not establish authenticated manager/staff/resident/officer
  workflow coverage.
- Startup: 20 browser assertions across five scenes. Delayed main JavaScript,
  initial route and genuine guest auth were tested independently; the ready event
  fired once. Later delayed FAQ showed only a 20px spinner, and actual FAQ/Help
  plus resume did not restart the splash. Zero hosted writes.
- Physical iPhone native status-bar rendering, OS launch screens and gestures
  remain device checks; desktop emulation does not prove them.

Private evidence is under
`.security/production-readiness-2026-10-23/liquid-audit-2026-10-24/`.

## Upload

`/tmp/pinevela-preview-liquid-ui-20261024.tar.gz` supersedes the previous app-UI
archive. Upload and extract it into `/home/jqmgxgpuym/pinevela-app`, retaining
existing assets. It includes the preceding frontend fixes plus the updated
phone glass and placeholder styles. Refresh the preview and close/reopen the
installed app. No Node restart is required for this frontend update.

The archive contains 127 public frontend files (3,082,382 bytes), entry document
last. All 171 build files were scanned for configured private credentials and
source maps; neither was present. No API bundle or private file is included.
Archive bytes were round-trip verified. SHA-256:
`02acc5cbc92d23ce7344e4a7bfce6fc3650edfc2969e4c358898557dbdda01f7`.
Remote upload has not been performed by the agent.
