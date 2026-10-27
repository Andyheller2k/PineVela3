# Login rendering across browser and installed modes — 24 October 2026

The [product mobile-layout update](product-mobile-layout-2026-10-24.md) contains
the latest frontend archive, including this auth readability correction.

The two owner screenshots show one login screen rendered differently, rather
than two separately implemented authentication interfaces. `PageUnifiedLogin`
uses the same card and forms in both display modes. Installed mode changes the
Home navigation and install affordance; browser toolbars also reduce the usable
viewport height. Those differences are expected.

## Findings

The previous mobile style had only 5–9% navy pigment and relied on
`backdrop-filter: blur(1.5px) saturate(1.15) brightness(.445)` to darken the
portrait. A browser can accept that CSS while failing to composite the desired
backdrop. The syntax-only `@supports` fallback cannot detect that situation.
Turning off the filter in a verified copy of the deployed frontend reproduced
the bright portrait and poor label visibility seen in the first screenshot.
This confirms the design weakness; it does not establish the exact reason
Chrome on the owner's iPhone failed to paint the effect. Ancestor compositing,
browser state and device-specific behavior remain possible factors. The
[backdrop-root behavior documented by MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)
explains why declared filter support alone does not establish visible filtering.

The public preview served identical current HTML for representative iOS Safari,
iOS Chrome and Android Chrome request headers, all with `Cache-Control: no-cache`.
Its index SHA-256 was
`6d4dbc6c34d1a2c72f2ee4be02a8cc819a9f73cc1673c74f379899444e8760f5`.
The current worker stores no responses and fetches navigation from the network.
There is no evidence of a server-selected alternate design or a current worker
cache variant. An already-open device tab running earlier assets was not examined.

The plain “Login” title is a separate symptom. Childer uses `font-display: swap`,
which permits a fallback font while its asset is unavailable. All five public
font assets returned HTTP 200 with font MIME types. Childer's OpenType tables and
checksums validated, and Chromium actually painted the title with Childer in
the probe (`CSS.getPlatformFontsForNode`), rather than merely declaring it in CSS.
The owner's Chrome font request/decoding state remains unverified. No font or
copy redesign was made based on that hypothesis.

## Correction and verification

The card itself now has a translucent 62–68% navy background. The image remains
visible, while text contrast no longer depends on brightness filtering. Blur
remains an optional enhancement: 1.5px on phone/tablet and 6px on desktop.
Both browser and installed display modes use the same material. Stronger fields,
yellow controls, hints, fixed portrait positioning, internal card scrolling and
accessibility preferences are preserved. No browser sniffing or forced reload
was introduced; no API, authentication or database behavior changed.

The production frontend build passed. The final isolated guest Chromium audit
passed 207 checks across 16 viewport/form/mode scenes, covering login and signup
at 375×667, 390×844, 844×390 and 1440×900. Every scene was inspected with filtering
enabled and then forcibly disabled. Normal-size labels/security text exceeded
5.05:1 against the worst-case pure-white backdrop with filtering disabled; the
30px yellow heading exceeded 4.10:1. These exceed the respective
[WCAG contrast thresholds](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
Font use, muted hints, reachable bottom actions, stable card geometry and fixed
mobile imagery also passed, as did reduced-transparency fallback. Eight paired
browser/installed scenes had identical computed card and heading styles.

Only display-mode environment flags were emulated; no accounts or business API
responses were fabricated, and no hosted writes or form submissions occurred.
Screenshots were inspected. This is not a physical Safari/Chrome iPhone test;
the owner still needs to confirm the corrected preview on that device.

Private evidence:
`.security/production-readiness-2026-10-23/auth-rendering-audit-2026-10-24/`.

## Upload

Use `/tmp/pinevela-preview-auth-readability-20261024.tar.gz` (3,083,803 bytes).
This frontend overlay includes the preceding UI fixes and supersedes the prior
navigation/glass package. Extract into `/home/jqmgxgpuym/pinevela-app`, retain
existing assets, refresh the browser and close/reopen the installed app.
No Node restart is needed. The agent has not uploaded the update remotely.

127 frontend files; all 171 public build files were scanned for configured
private credentials and source maps, with zero matches. No API/private files
are included. Archive members were byte-verified and index.html is last.
SHA-256: `a818962083dd7b0a70569cee79d1c98fdc962d0b25d8556a66802be29bd73e63`.
