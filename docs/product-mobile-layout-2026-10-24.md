# Product content width and proportions — 24 October 2026

The later [chrome and gesture update](product-chrome-and-swipe-2026-10-24.md)
supersedes this checkpoint's status-strip layering: it raises the strip while
reserving its height above header controls to avoid overlap.

The reported narrow appearance came from nested spacing and flex shrinking,
rather than a page-wide scale transform. The primary user's Options screen had
16px main gutters, 24px panel padding and another 24px avatar-selector padding
before the identity row. The photo's flex parent could shrink; its image then
followed the parent's maximum width while retaining an 80px height.

The shared avatar renderer and selector now preserve square dimensions, including
an 80px non-shrinking current-photo frame. Name/badge text wraps in the remaining
space. Method-tab icons retain their declared dimensions, and their buttons keep
44px minimum touch targets. Phone selector padding is 16px; photo saving,
moderation, account identity and persistence logic are unchanged.

Product dashboard main regions use 12px mobile side gutters, respecting safe-area
insets. Staff's additional horizontal card margins are reduced to 8px. Seller,
officer and product-support content receive the same smaller gutters. Product
Lucide icons cannot flex-shrink, while charts, maps, evidence images and unrelated
SVGs keep their own geometry. Existing vertical/bottom-navigation reservations,
table scrolling and desktop content widths are preserved.

The primary marketplace actions now occupy two equal columns on phones and
tablets: Services near you alongside the existing merchant-status action. Labels
can wrap inside the buttons, and icons retain their intended dimensions. Merchant
status, loading/error behavior, registration handlers and the yellow join glow
are retained. The Home section gap is 16px and marketplace panel gaps are 12px,
bringing search/categories/items upward. The Market/Residences switcher uses
44px buttons with 2px surrounding padding, without reducing touch targets.

The installed-app status-color strip previously had z-index 55, above the
header's 40, and could cover the first few pixels of buttons. Its z-index is now
0, behind the app. The 12px opaque edge, theme-color metadata, navy/white theme
colors and matching page backing are retained; no header controls are moved.

## Verification and upload

TypeScript, the final production frontend build, existing app-mode/launch test
files and final diff checks passed. A genuine primary-user browser session
provided 97 passing layout checks across 12 Home/Options scenes: 320px and 390px
in light/dark mode, plus 768px and 1440px in light mode. There was no document or
content sideways overflow. Current avatar frames and image elements stayed
80px square, preset circles 56px, and both market actions remained on one row.
Search moved upward 94.78px at 390px. Catalog switching and desktop geometry
remained functional. The real catalog was empty; listing-card sizing was not
changed or established using invented listings.

A focused corrected icon probe added 14 passing checks across four 320/390px
Home/Options scenes, measuring 58 actual Lucide elements at their declared square
dimensions. The original raw 109-check report remains partial: twelve icon-count
assertions accidentally excluded decorative aria-hidden SVGs. The separate probe
corrects that test selector; the assessed summary explicitly retains this history.
Profile-photo requests had not decoded during inspection (natural dimensions 0),
so photo delivery was not established. Frame geometry and preset artwork were.

The final installed-header probe passed 17 checks in two actual-user 390px scenes,
with installed mode emulated. At notification button position (215,10), the old
temporary z-index 55 painted white over the gold button. With z-index 0, that pixel
was gold in both light and dark mode, and the full rounded top edge was visible.
The strip retained its white/navy color, 12px height and no pointer handling;
the button remained 44×44px. The final build differs from the tested layout build
only in index.html; all 170 other public files are byte-identical.

All nine non-GET requests across these browser checks were blocked, including
notification read marking and appearance sync. No account form, avatar change,
upload or registration was submitted; original light/top preferences were
restored and only task tabs closed. No browser exceptions occurred. Other
authenticated role journeys, hardware touch and physical iPhone status-bar
rendering remain outside these checks. Shared role gutters were source reviewed.

Private evidence:
`.security/production-readiness-2026-10-23/product-mobile-audit-2026-10-24/`.
No API, database migration or authentication behavior changed.

Use `/tmp/pinevela-preview-product-mobile-20261024.tar.gz` (3,084,006 bytes),
superseding the previous auth-readability package and including its fixes.
Extract into `/home/jqmgxgpuym/pinevela-app`, retain existing assets, refresh the
browser and close/reopen the installed app. No Node restart is required.
The agent has not uploaded it remotely.

127 frontend files; all 171 public build files were scanned for configured private
credentials and source maps, with zero matches. No API/private files are included.
Archive members were byte-verified, with index.html last. SHA-256:
`6aca575406585e5085b41e3920c4ca998c3809e0f4df18513c4a4e14a09649ff`.

## Room key icon follow-up — 24 October 2026

The Resident Room Management header's 48px icon frame could flex-shrink beside
its title and description while retaining its height, producing a narrow oval.
It now uses `shrink-0 aspect-square rounded-full`; the adjacent text has
`min-w-0 flex-1` so it can wrap within the remaining space. The existing key SVG,
colors, room count and onboarding behavior are unchanged. The separate lower
empty-room illustration retains its existing shape.

TypeScript and the production frontend build passed. An isolated production-CSS
probe passed 49 geometry checks across 320/390/768/1440px in light/dark mode:
the frame stayed 48×48px with a circular radius, the actual Lucide key stayed
24×24px, and text wrapped without horizontal overflow. No account data or API
responses were fabricated. This verifies the header's styling and geometry,
not a signed-in account journey or physical iPhone rendering.

Use `/tmp/pinevela-preview-room-key-circle-20261024.tar.gz` (3,075,762 bytes).
It includes the previous frontend fixes. Extract into
`/home/jqmgxgpuym/pinevela-app`, keep existing assets and reopen the web app.
The archive contains 127 changed/new frontend files; all 171 candidate public
files were scanned for configured private credentials with zero matches.
No API/private files or source maps are included, and archive bytes were
verified. No remote upload was performed.

SHA-256: `fe683c3becc49bdc74ff7de0a86189984d04770b21d2275516c47ed7334733ab`.
Evidence: `.security/production-readiness-2026-10-23/room-key-circle-2026-10-24/`.
