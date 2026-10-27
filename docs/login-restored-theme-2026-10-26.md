# Restored login/signup with phone themes — 26 October 2026

The latest release is described in [Light, Dark and System preferences](appearance-preferences-2026-10-27.md).
Use `/tmp/pinevela-light-dark-system-update-20261027.tar.gz`, which supersedes
the historical packages below. The latest update requires its SQL migration
before installation and a Node restart afterward.

The local phone-light theme now uses a translucent glass card with blue
labels/buttons and a blue lower diagonal backdrop. The archive and verification
below describe the earlier yellow variant; current styling is in `docs/theme.md`.

The earlier corrected-diagonal update is
`/tmp/pinevela-login-diagonal-update-20261026.tar.gz` (7,959,805 bytes; 174 frontend
files plus instructions and a file manifest). SHA-256:
`e8d3c349d9a5a0480fa16bc98135b098751a700ebd39ab13685995e9a98438fc`.
It restores the original diagonal geometry in both phone themes: 155 degrees,
with 40%/76% boundaries and blue replacing yellow in the light-mode lower band.
Browser checks confirmed identical light/dark component geometry for portrait
and landscape Login/Signup. Glass cards and blue light-mode controls remain.
Archive member bytes and private-value exclusions were verified. Merge into
`pinevela-app` and reload; no Node restart or NPM install is needed.

The previous glass-card frontend update was
`pinevela-blue-glass-login-update-20261026.tar.gz` in the project root
(7,959,920 bytes; 174 frontend files plus instructions and a file manifest).
SHA-256: `2e5bf4cfafbbe790b4aa316f981a0466dd69177b19bb21f66440549ed71fdd0f`.
All archive members were byte-verified, the new index is last, and the configured
private-value scan found zero matches. Merge it into the existing `pinevela-app`
root and reload; no Node restart, NPM install or database migration is needed.
This application update is separate from the Google branding draft ZIP.

The previous opaque-card frontend-only update was
`/tmp/pinevela-spaceship-blue-login-20261026.tar.gz` (7,960,099 bytes, 174 frontend
files plus instructions and a file manifest). SHA-256:
`0c3e77426baa68f88d38af7366e37b15a99f280f3c1a3574d114dd288318bf26`.
Every archive member was byte-verified; the new frontend index is last. The
configured-private-value scan found zero matches. Extract into the existing
`pinevela-app` root, merging files and retaining older hashed assets, then reload.
No backend files, credentials, dependencies or source maps are included; no Node
restart or NPM install is needed. This archive has not been uploaded or deployed.

The original layout is restored: the fixed girl photograph remains behind the
rounded glass form, with the original header, tabs and single-column signup
fields. The separate hero, curved divider and rearranged form are removed.

On phones, the OS appearance selects the theme without changing saved product
or account preferences. Light mode uses a predominantly white page, white
header and browser/status chrome, warm white glass, yellow accents and dark
neutral text. Blue UI surfaces and decorative blue background paint are replaced
by white/yellow. The girl photograph, PineVela icon and Google artwork retain
their original colors. Dark mode retains the existing navy/yellow treatment.
Tablet and desktop keep their previous design.

The compact room-key button, restored Ask AI and earlier product UI fixes remain
in place. No authentication, authorization or database behavior changes are part
of this restoration.

## Verification

The TypeScript check, production frontend build and existing appearance,
app-mode, UI-rule, palette and marketplace-branding tests passed. Runtime source
and the build no longer contain the experimental hero/curve layout markers.

Chrome checks of the real compiled React app passed **240 checks across 16
scenes**: login/signup at 320, 393, 768 and 1440px, under both OS appearances.
Local static files were overridden at the actual preview origin; three API GET
requests went unchanged to the real host. No API mutation or provider inference
was attempted, and there were no runtime exceptions.

The checks confirmed the original fixed portrait/glass-card geometry, no new
hero or curved section, single-column forms, native tabs/password toggles,
reachable Google controls and no horizontal overflow. Phone light mode has a
white header, page backing and browser/status metadata, with a white-dominant
page gradient and yellow accents. Light Help text contrasts 17.58:1; minimum
field, placeholder and label contrast is 17.58:1, 7.41:1 and 13.05:1. The actual
keyboard focus ring is warm neutral, 2px solid, with 9.15:1 contrast on white.
Dark, tablet and desktop retain their previous appearance.

Evidence and screenshots are under `.security/login-restored-glass-2026-10-26/`.
Physical iPhone rendering and genuine sign-in/signup provider journeys require
separate device/session testing. No remote deployment was performed.

## Cumulative Spaceship update

`/tmp/pinevela-spaceship-login-restored-20261026.tar.gz` contains this restored
layout and phone theme, the preceding product UI fixes, compact room-key action,
restored Ask AI frontend, current API bundle, `app.cjs`, Cloudflare diagnostic
and safe deployment/testing instructions.

- Size: 8,166,241 bytes; 177 files, including 171 public frontend files.
- SHA-256: `c03ac040b2639b28d2e8ea5fc2ebe808f7326701e91a037b015ee20ca3fb5a8b`.
- Every archived file was byte-verified, with zero configured private credential
  matches. No private configuration, source maps or dependencies are included;
  the frontend index is the final archive member.
- Build assertions confirmed the original photograph/card markup and phone OS
  theme support, absence of the curved-hero redesign, and retained room-key/AI
  controls and Cloudflare recipient consent.

Follow `SPACESHIP-UPDATE.md` in the archive. Extract into the existing application
root, retain private files/assets and restart Node. Keep existing Cloudflare
settings if already configured; otherwise merge the separate private companion
settings into the existing hosted `.env`. This archive has not been uploaded or
deployed. Its `LOGIN-THEME-RESTORATION.md` contains the final QA above; this package
metadata was appended afterward without altering the verified archive.
