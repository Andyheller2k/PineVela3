# App-wide theme follow-up — 28 October 2026

The cumulative frontend package is
`/tmp/pinevela-app-wide-theme-update-20261028.zip`. The owner selected manual
installation; this package has not been uploaded to pinevela.app.

## Changes

- Explore Market, Explore Residence, storefronts and Why Us now share the saved
  Light/Dark/System preference. Their former forced-dark rules were removed
  from both prepaint and the React provider. Public headers keep the sliding
  Light/Dark control without a System default button.
- Why Us comparison panels, catalog filters and selected controls use the shared
  color roles. The existing responsive layouts stay the same in both themes.
- About Us and Partner with Us retain their blue panels in light mode; their
  numbered labels and headings are white, with readable supporting copy.
  Company sections no longer inherit the obsolete yellow-section text roles.
- The landing hero's “Your campus, connected” label was removed.
- Tailwind `dark:` utilities now follow the app's `data-theme` attribute. An
  explicit app choice therefore controls these utilities even when the browser
  prefers the opposite theme. System continues to resolve through ThemeProvider.
- Install instructions, shared dialog scrims and photograph-viewer controls now
  inherit theme roles. Product glass popups and companion styling retain their
  existing specialized surfaces.

The package also includes the earlier glass benefits section, transparent hero
artwork, 3D PineVela card, favicon, public/legal-page light palette, auth glass
and blue diagonal, theme slider, gold merchant action and idle-CAPTCHA fixes.
No backend, migration, authentication or authorization changes are required.

## Local verification

- Source review covered 145 component TSX files and 24 stylesheets. The surface
  inventory identified 62 class nodes using `dark:` and 84 large inverse
  surfaces. Modal scrims, photo chrome, intentional navy feature/navigation
  panels, semantic status colors and artwork were reviewed separately.
- The actual router supplies the route inventory for prepaint tests. Every
  registered route resolves saved/manual/System choices consistently, including
  blocked browser storage. Theme, static-policy and eight PWA/security tests pass.
- Production frontend build, TypeScript and `git diff --check` pass.
- Built-app Chromium checks pass **113 scenes**: public routes at 320/390/1440px
  in both themes; company/benefit/comparison contrast; filter states; product,
  residence, gallery, guest sign-in and install dialogs; navigation, reload and
  live System changes; and ten dashboard/onboarding screens at 390/1440px.
- A second real-component browser harness passes **44 scenes** covering all
  **25 phases** of nine shared onboarding progress sets, resident/seller/manager
  credential forms, read/unread order notifications, welcome/logout/admin/
  maintenance/restriction popups and session-restoration feedback. It checks
  text contrast and equal settled geometry in both themes while the OS prefers
  the opposite mode. CSS color-mix values are normalized by the browser before
  contrast measurement.
- The real theme-provider harness passes 13 scenario groups, including account
  hydration races, serialized preference saves, failed-save retry, logout,
  storage events and all public routes. The auth/CAPTCHA/merchant regression
  harness passes 17 checks.

These are local presentation checks with read-only sample API responses or
synthetic context inputs. No hosted account, real authentication journey,
protected submission, payment or database record was changed. Dashboard fixtures
exercise initial views, not every possible business-data state. Physical-phone
thermal behavior and exhaustive accessibility conformance are not claimed.

Evidence is saved under `/tmp/pinevela-public-appearance-20261028/`,
`/tmp/pinevela-theme-surfaces-20261028/`, `/tmp/pinevela-mobile-theme-qa/` and
`/tmp/pinevela-all-pages-*.log`. Browser reports are included in the ZIP.

## Installation

1. Extract the ZIP locally. In the existing Spaceship `pinevela-app` folder,
   merge its `dist-supabase/` into the existing `dist-supabase/`, replacing
   matching files. Keep older hashed assets so already-open sessions still work.
2. If uploading individually, upload assets first and replace `index.html` last.
   Include the icons, favicon, legal CSS/JavaScript and policy HTML from this
   same build. Keep private environment files and backend files in place.
3. Reload the browser/app, then check the landing sections, Explore pages and
   Why Us in both modes. A fresh browser follows System; public sliders select
   explicit Light/Dark, and app settings retain System default.

This is a frontend-only replacement: no SQL, environment edit, dependency
installation or Node restart is needed. Installation in the live site remains
the owner's next step.
