# Navigation labels and compact desktop sidebar — 4 November 2026

Standard mobile navigation now gives captions a stationary foreground row, below
both raised and resting icons. The animated surface, selection circle and
controls have explicit stacking layers. The circle and icons keep their 250 ms
motion. Seller and resident center-plus layouts keep their existing geometry.
Obsolete user-only navigation span positioning was removed.

The desktop sidebar toggle now minimizes to a 104 px side rail instead of
creating a top navigation bar. This applies to user, manager, administrator,
staff and resident dashboards, which already offered the layout toggle. The rail
uses round selection with blue on white in light mode and yellow on blue in dark
mode. Each icon retains a visible caption, accessible name and tooltip.
Long destination lists scroll above the help and sign-out controls. Keyboard
focus follows the layout toggle when minimizing and expanding.

Existing destinations, unread badges and property-approval locks remain owned by
their dashboard. Manager Settings stays available before property approval. The
device preference persists; a previously saved `top` preference becomes `compact`.
Mobile pages keep their mobile navigation regardless of this desktop preference.

## Verification

Evidence is in `docs/verification/navigation-labels-sidebar-2026-11-04/`.
The final run passed TypeScript, web/mobile builds, Android builds, 139 browser
scenes, 26 installed-Android scenes with 116 caption checks, two compositor
checks, one actual Android Purchases tap and four action sheets. No uncaught
exceptions or hosted writes occurred in the isolated role fixtures. The normal
debug app was updated in place, package writes flushed, and the task's isolated
test package removed. Its welcome screen fits 393 × 778 CSS pixels.

Browser checks use the actual built application with local role/API fixtures.
They cover icon/caption separation, text bounds, foreground hit testing, themes,
actual destination selection, More, desktop toggle/reload, keyboard focus,
restricted manager destinations and short-screen scrolling.

Android checks use the existing Pixel 4a AVD and a separate transport test package
with local read-only account fixtures. They preserve the normal debug app's
account data. Device findings, including any Android ANR during verification,
are recorded separately from successful UI checks. The final verification summary
and package manifest record which checks actually completed. iOS is unbuilt on
this Ubuntu machine; the shared mobile UI is included in its web source.

The original hiding was not reproduced on the baseline's default Home screen.
Baseline tab-change checks were interrupted by emulator startup ANRs, so they
do not establish whether the original intermittent case occurs. The update
explicitly separates the moving decoration from the stationary captions, and
checks those captions before, during and after navigation.

## Install

Artifacts stay in the project so `/tmp/` cleanup cannot remove the originals:

- `releases/web/pinevela-navigation-labels-sidebar-20261104.zip`
- `releases/android/pinevela-navigation-labels-sidebar-20261104.apk`

Back up the hosting `dist-supabase/` and `dist-supabase-backend/` folders. Extract
the ZIP into the existing `pinevela-app` root and restart the Node app. Preserve
environment variables, dependencies and hosting configuration. The backend is
unchanged from the previous verified navigation/short-key package and is included
to keep this update cumulative. No SQL migration or dependency change is needed.

Install the debug-signed APK over the existing development app without
uninstalling or clearing data. This is a development build, not a Play release.
The archive also has a `/tmp/` copy. The update has not been deployed remotely.

To roll back hosting, restore the backed-up build folders and restart Node.
Earlier release artifacts remain in `releases/`.
