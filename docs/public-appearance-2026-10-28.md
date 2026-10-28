# Public white/blue appearance — 28 October 2026

The latest [glass/artwork/favicon follow-up](glass-landing-followup-2026-10-28.md)
replaces the benefits section's remaining legacy yellow background, removes the
hero image's yellow backdrop, adds brand-card depth and standardizes favicons.
Its combined ZIP includes this public-page update.

The landing page, public FAQ and Help now follow the existing device/account
appearance. A fresh visit follows the browser's color scheme, with light as the
fallback. A manual slide selects Light or Dark and persists across navigation
and reload. The landing/support headers show the existing sliding switch only;
they do not add a System default button. App settings retain all three choices.

The [app-wide theme follow-up](app-wide-theme-audit-2026-10-28.md) also removes
the old fixed appearance from catalogs, storefronts and Why Us. Public layout
classification no longer forces a color. The prepaint bootstrap and React
provider agree on theme resolution and browser chrome. Auth layouts, account
persistence, authorization and backend configuration were not changed.

Light mode uses the login palette: white, soft blue, navy/blue text and blue
primary actions with white labels. Dark mode uses the same structure with
navy/gold roles. The landing refresh establishes a clear primary action,
measured navigation, readable typography, a single main landmark, a skip link,
outlined benefit cards and quieter company/footer sections. Existing brand
artwork and public catalog actions are retained. No new motion or dependency
was added.

Help retains its forms and guest/account access boundaries. FAQ retains native
keyboard-operable disclosures and search; its topic links now match filtered
sections and move keyboard focus to the destination heading. Both pages expose
policy links. No support request was submitted during verification.

The standalone policies use the same colors. `public/legal-appearance.js` reads
the existing `pinevela:appearance` preference before the stylesheet paints,
listens for browser/storage changes and restored pages, and makes no account or
API requests. CSS provides a system-color fallback with JavaScript disabled,
plus print and forced-color styles. Policy substance, operator, age and revision
date were retained.

## Local verification

- Production frontend build and TypeScript check passed.
- Theme, appearance prepaint/static-policy and PWA delivery checks passed.
- Built-page Chromium verification passed 34 scenes, covering 320/390/1440px in
  both themes, first-visit System behavior, manual persistence, cross-page
  consistency, keyboard switching/FAQ operation, policy anchors and no-JS policy
  readability. Sampled headings, copy and primary actions meet 4.5:1 contrast;
  pages have one main/primary heading and no horizontal overflow in the matrix.
- Account persistence/logout passed 13 browser scenarios. Existing
  auth/merchant/CAPTCHA behavior passed 17 additional component/browser checks
  with synthetic frontend inputs. These do not
  establish a live signed-in session or physical-phone thermal behavior.

The browser fixtures are local read-only catalog/settings data and a guest 401;
no hosted account, payment, migration or database record is changed. This is not
an exhaustive WCAG conformance audit. Relevant references:
[contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html),
and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Evidence: `/tmp/pinevela-public-appearance-20261028/` and
`/tmp/pinevela-public-theme-*.log`.

## Apply to the existing main-domain app

The latest cumulative frontend-only package is
`/tmp/pinevela-market-and-login-update-20261028.zip`. Merge its `dist-supabase/`
folder into the existing Spaceship `pinevela-app` folder. Keep older hashed
assets, upload new assets first and replace `index.html` last. Include
`legal.css`, `legal-appearance.js`, `privacy.html` and `terms.html` from the same
package. No SQL, environment edit, Node restart or dependency install is needed.
Do not replace the application's private files, backend or domain routing.

The owner selected manual ZIP installation. This update has been verified
locally and packaged; it has not been uploaded to the live main-domain site.
After installation, open the landing, FAQ, Help, privacy and terms pages, check
the sliding switch, and reload once to confirm the saved appearance.
