# Phone performance and on-demand verification — 27 October 2026

The previous CAPTCHA hook mounted on open authentication forms and allowed
provider retries and token refreshes. It now starts only on a protected
submission and awaits a fresh proof. Success, failure, timeout, backgrounding,
account change and unmount remove the widget and clear its deadline. Automatic
provider retries/refreshes are disabled. A returning app stays idle until another
submission. The configuration/SDK may load at that point, so the first submission
can take longer. Supabase validation, replay admission, rate limits, session
checks and OTP/OAuth behavior are unchanged.

Primary-dashboard snapshots now refresh every 30 seconds instead of 8; merchant
and manager status queries use 30 seconds instead of 6; public platform settings
use 30 seconds instead of 5. Visible notification polling remains at 6 seconds,
but shares registered-account reads through a 30-second query cache. Dashboard
and notification polling timers stop while hidden and refresh when visible.
Dashboard data-change events refresh after a 250ms debounce. Cancelled dashboard
reads release their pending slot, so returning to the app can start another read.
Server authorization and maintenance enforcement remain immediate at the API.
Background changes without an event may take up to the next polling interval to
appear; this is not a real-time delivery guarantee.

Light-mode atmosphere blobs retain their appearance but no longer move on
coarse-pointer devices or screens below 640px. Desktop atmosphere motion pauses
when hidden. Existing WindDust visibility/reduced-motion handling, realtime
connection lifecycle and hidden-map GPS cleanup were checked and retained.
Other portal/inbox polling remains; this change does not claim zero background
work throughout every app feature.

Verification uses TypeScript, the production frontend build, focused auth/replay,
refresh/cache, realtime, theme and PWA/static-delivery tests, plus isolated
Chromium runs with actual React components and compiled app CSS. Synthetic
transport/SDK edges test proof waiting, retry, failure, cancellation, stale
account results and late SDK loading without account writes. Responsive checks
cover 320/390/1440px, both themes, adjacent appearance controls, thumb positions,
dark merchant gold/hover/sheen, reduced motion and hidden atmosphere pause.
The separate provider suite covers keyboard use, live System changes, saved
preferences, account races and logout/login continuity.

These checks establish lifecycle and browser behavior. They do not measure a
physical phone's temperature, battery draw or every authenticated portal's CPU
usage. Reopen the installed app after applying the update and check its idle
behavior on the affected phone.

Install `/tmp/pinevela-app-update-20261027.zip` into the existing Spaceship
`pinevela-app` folder, merging matching files. The archive includes the complete
frontend, current legal pages, instructions and a file-hash manifest. Keep older
hashed assets for open tabs. No dependency install, Node restart, migration or
Supabase setting change is required. This task does not publish the update.
