# Landing glass, transparent artwork and search icon — 28 October 2026

This frontend follow-up includes the previous white/blue public-page update.

## Changes

- Removed the legacy yellow `#benefits` background and its local navy/gold color
  overrides. The existing section and three cards now use translucent white/blue
  glass in light and translucent navy glass in dark, with the same geometry.
- Only the outer section uses backdrop blur: 8px on desktop, 4px on phones.
  Increased-contrast/reduced-transparency and unsupported browsers get readable
  fallbacks. No new animation or nested card blur was introduced.
- Replaced the landing illustration's yellow backdrop with genuine alpha
  transparency. The original asset remains at `assets/landing-welcome.png`;
  the selected edited asset is `assets/landing-welcome-transparent.png`.
  Animated icon layers use this same transparent source; obsolete yellow
  background-repair layers were removed so animation cannot restore the backdrop.
- Gave the existing PineVela brand card perspective, layered rim/depth shadows
  and a lit front face. The colors follow the theme. Desktop pointer tilt uses
  its existing bounded handler; reduced motion removes the tilt.
- The homepage, privacy and terms now advertise the existing square 192px
  PineVela PNG. A real `public/favicon.ico` fallback wraps the same existing PNG,
  preserving the logo without redesigning it.

## Search-result icon finding

Public HTTPS checks found that the live homepage advertised an SVG, while Terms
advertised the PNG. Both image URLs were available, but `/favicon.ico` returned
the SPA's HTML instead of an icon. These are observed configuration differences;
Google's last crawl/selection state has not been inspected.

The update standardizes the declared icon on `/icons/pinevela-192.png` and adds
the conventional fallback. Google's official supported Search favicon formats
include PNG and ICO. After installing this ZIP, use Search Console's URL
Inspection tool to request indexing of `https://pinevela.app/`. Google says
recrawling/processing may take several days to several weeks and does not
guarantee a favicon will be shown.
[Google's favicon guidance](https://developers.google.com/search/docs/appearance/favicon-in-search).

## Verification

The production frontend build, theme checks and eight PWA/static-delivery tests
passed. Built-page Chromium checks passed 37 scenes. The landing cases inspect
the entire benefits section at 320/390/1440px in both themes, verify transparent
outer/card fills, readable text against composited surfaces, equal theme
geometry and a transparent hero-image corner. Additional cases cover the 3D
card, reduced-motion/high-contrast fallback and real ICO delivery. Existing
public-page navigation/theme/policy checks remain included. Screenshots were
reviewed for the light/dark section and hero.

The browser uses local read-only guest/catalog fixtures; no hosted records,
accounts, sign-in, payments or migrations are changed.

## Install

Package: `/tmp/pinevela-glass-landing-update-20261028.zip`.

Extract/merge its `dist-supabase/` folder into the existing Spaceship
`pinevela-app` folder, replacing matching files and keeping older hashed assets.
Upload assets first and `index.html` last when uploading individual files.
No SQL, environment change, dependency installation or Node restart is required.
The owner selected manual installation; this follow-up has not been published
to the live site by the agent.

## Artwork edit record

Built-in imagegen mode, using the original landing image as the edit target.
Output copied into the workspace at `assets/landing-welcome-transparent.png`.
It is 1448 × 1086 RGBA with real alpha; both upper corners are fully transparent.
The separate brand card remains native HTML/CSS.

Final prompt:

```text
Use case: background-extraction.
Asset type: existing PineVela landing-page hero illustration, edited for transparent website use.
Input image 1 is the EDIT TARGET, not a style reference.
Primary request: remove only the bright yellow background surrounding the woman and the floating campus-service graphics. Produce a genuine transparent alpha background, including the negative spaces between the floating objects and around the hair.
Invariants: preserve the same woman, identity, face, skin tone, curly hair, glasses, white shirt, phone, hands, pose, crop, size and placement as precisely as possible. Preserve the existing floating message cards, parcel, graph, social icons, clipboard, currency and gold coins in their existing positions and colors. Preserve all legible message-card text exactly as in the image. Keep the same landscape composition and framing, approximately 4:3.
Background: fully transparent, no opaque yellow, white, blue, gray, gradient, or checkerboard background. Remove the yellow backdrop and its yellow spill at silhouette edges. Keep natural fine hair edges. Retain gold coins as foreground objects.
Constraints: do not add a PineVela logo, brand card, border, frame, watermark, extra text or new foreground elements. The separate PineVela card is rendered by the website. This is a faithful background removal edit.
```
