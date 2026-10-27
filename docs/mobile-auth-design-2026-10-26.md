# Mobile login/signup design — 26 October 2026

**Historical layout experiment:** the owner requested returning login/signup to
its prior geometry on 26 October 2026. The curved hero, separate lower form and
signup-grid redesign below are reverted. Phone OS selection is retained only to
switch the original rounded photograph/form-card layout between a white/yellow
light page with charcoal text and the retained navy/yellow dark theme. The light
page includes white photograph surroundings, header and footer; no blue UI paint
is introduced, while the photograph and brand art retain their original colors.
The concepts, earlier verification and old archive
remain a record of that experiment. The restored Ask AI tab, other product UI
fixes and compact **Verify Room Key** action remain current. Use the later
login-restored deployment package rather than the mobile-auth archive below.

Phone `/login` uses the selected concept for the OS appearance: design 1 for
dark mode and design 2 for light mode. The existing PineVela/Help navy header
and navy artwork hero are shared; a gold curve separates the hero from the
lower form. Login, signup and email verification retain their existing fields,
actions and authentication behavior. The page scrolls normally rather than
confining the form inside a scrolling panel.

The phone layout applies at widths up to 639 CSS pixels, plus coarse-pointer
landscape layouts up to 1023px wide and 500px tall. Desktop and tablet login
retain their existing design. The same phone query drives prepaint and React
appearance so initial paint, OS changes and viewport/orientation changes agree.
The public navy browser/status edge remains aligned with the header and hero.

OS selection changes only the effective auth appearance. Saved product/account
themes, other public pages and server authentication/session behavior are
preserved. There is no new theme control on login/signup.

The room-key action also becomes a content-sized rounded capsule on phones,
with the visible label **Verify Room Key** and a full accessible onboarding
label. Its existing click workflow is retained. Tablet/desktop keep the full
original label and button layout.

## Verification scope

The appearance and app-mode tests passed for phone light/dark prepaint, signup
query navigation, blocked storage, excluded public/product routes, live OS and
viewport changes, and modern/legacy listener cleanup. The TypeScript check also
passed after the complete implementation. The production frontend build and
existing UI-rule, palette and marketplace-branding tests passed.

Chrome debugging of the real compiled React app passed **1,763 checks across
80 scenes**. Static files were locally overridden at the actual preview origin;
9 API GET requests went to the real host without response replacement. No API
mutations, account writes, provider requests or runtime exceptions occurred.

- Portrait widths 320, 360, 375, 393 and 430px at heights 568, 667 and 844px;
  coarse-pointer landscape 844×390 and 768×500; tablet 768×1024; desktop
  1024×768 and 1440×900. Login/signup were checked in both OS appearances.
- The real girl artwork stays above the form; there was no horizontal overflow
  or nested form scrolling. Fields, submit and footer remain reachable with
  ordinary page scrolling, including a reduced keyboard-height viewport.
- Live OS changes preserve typed values and the saved product preference.
  Branding, Help, password visibility controls and recovery/Escape remain usable.
- Text, placeholders, actions and recovery titles passed contrast checks. All
  four strength-meter fills exceed 3:1 against their track in both modes
  (light minimum 4.07:1, dark minimum 3.58:1). Keyboard focus, forced colors,
  reduced motion and installed-mode 44px/34px safe areas were checked.
- A separate source-derived room-button browser check passed **147 checks
  across 14 scenes**. The phone capsule measures about 169×44px; tablet and
  desktop retain their original full-label sizing. Both themes preserve icon
  proportions, gold/navy paint and viewport fit.

Evidence and screenshots are under `.security/mobile-auth-2026-10-26/`.
The source-derived error-panel checks did not simulate server responses.
Server-triggered portal-PIN/email-verification journeys were reviewed in source
without submitting credentials or creating accounts. Browser checks do not
establish real sign-in/signup success, a physical keyboard or physical iPhone
rendering. No hosted deployment was performed during these checks.

## Cumulative Spaceship update

`/tmp/pinevela-spaceship-mobile-auth-20261026.tar.gz` contains the tested phone
designs, preceding product UI fixes, restored Ask AI frontend, current API bundle,
`app.cjs`, Cloudflare diagnostic and safe deployment/testing instructions.

- Size: 8,165,588 bytes; 177 files, including 171 public frontend files.
- SHA-256: `d4b203cc4969467ca61f5828cba43cfc8db03b265828a3f88e252fb96cd087b9`.
- Every archived file was byte-verified, with zero configured private credential
  matches. No private configuration, dependencies or source maps are included;
  the frontend index is last.

Follow `SPACESHIP-UPDATE.md` in the archive. Extract into the existing application
root, preserve private files/assets and restart Node. Keep existing Cloudflare
settings if already configured; otherwise merge the separate private companion
settings into the existing hosted `.env` as the instructions describe. The
archive was prepared locally and has not been uploaded or deployed. Its copy of
this design document contains the final QA above; this package metadata was
added afterward without changing the verified archive.
