# Catalogue photo caching update

31 October 2026. This is a local update package; hosting deployment is separate.

Market and Residences now retain their visited Home panels when the user switches
catalogues or leaves Home for another dashboard tab. Returning uses the same image
elements instead of recreating them and restarting the panel entrance animation.
Unvisited residences are not mounted or prefetched. Existing catalogue filtering,
pagination, account boundaries, data refresh and scroll restoration remain active.
Hidden panels do not display or receive keyboard focus; their filter popup closes
when navigation leaves the market. A refreshed catalogue can still replace a cover
URL or remove a withdrawn listing. Residence covers now load lazily and can recover
when a previously failed photograph is replaced by a different cover.

Published marketplace and residence photos use the existing asset/digest ETag and
`private, no-cache, max-age=0, must-revalidate`. Conditional requests still check
publication and maintenance before returning 304. Unchanged image bodies can be
reused after a page reload without another Storage download. Private photographs
remain `private, no-store`; the route does not generate private ETags or automatic
private 304 responses. No Storage bucket, RLS rule or SQL migration changes.

Android adds a separate 20MB disk cache for verified public catalogue PNG photos.
Only the fixed media route, a valid asset/digest ETag and the server's explicit
public-photo marker can qualify. Responses carrying cookies or varying by credentials
are excluded. Removed, private, malformed and failed responses cannot reuse stale
photo bodies; a new retrieval requires server validation, including after restart.
API/session data and the WebView proxy remain uncached. Session cookies are taken
only from actual network responses, never replayed from cached response metadata.
The cache lives in Android's application cache directory and may be reclaimed by
the OS. No service-worker, localStorage, Preferences or offline-data cache was added.

## Verification and limits

The final checks cover 14 catalogue browser scenarios, 14 related layout/theme
scenarios, 27 focused Node checks and 26 Android instrumentation cases. In the
four phone/desktop theme cases, the old frontend replaced all 12 observed photo
nodes on navigation; the updated frontend preserves all 12, with no additional
photo HTTP requests. Browser reloads validate via 304 without downloading photo
bodies. On Android, two retrievals of the same 68-byte TLS fixture changed from
two full bodies to one body and one 304. This is a controlled cache test, not a
production bandwidth benchmark or physical-phone performance measurement.

Evidence is in `docs/verification/catalog-image-cache-2026-10-31/`:

- `baseline/` records the previous built frontend replacing photo nodes on each
  catalogue/Home round trip. Its browser was already reusing same-document bytes;
  this baseline does not claim full image-body downloads on every browser switch.
- `browser/` checks the final built UI at phone/desktop widths in both themes,
  exact image-node preservation and zero navigation photo requests, live cover
  replacements/removals, failure recovery, filter portals and browser reloads.
- `regressions/` checks existing compact catalogues, purchases and appearance.
- `android/` records real OkHttp TLS/cache instrumentation, denied/private/cookie
  cases and the measured uncached/cached body counts, plus installation and normal
  emulator reopening with the same final APK hash.
- `summary.json` records final checks and builds; `artifact-scan.json` binds the
  checked delivery files to their hashes without including credential values.

Browser/account data is synthetic and local. API publication/ownership tests use
intercepted database and Storage dependencies. Android cache instrumentation uses
an isolated test app and local TLS fixture. These checks do not prove a hosted
authenticated catalogue session or an iOS build. No real account, payment or email
operation is submitted by these checks.

## Apply and rollback

The web ZIP is saved permanently under `releases/web/`, with a matching `/tmp/`
copy. Back up the two existing hosting build folders, extract the ZIP into the
existing `pinevela-app` root and restart the Node app. Replace `dist-supabase/`
and `dist-supabase-backend/` together. Keep environment variables, `app.cjs`,
dependencies and private data. No dependency, SQL, DNS, SMTP or OAuth change is
needed. The cumulative package includes the preceding local subscription update.

The development APK is saved under `releases/android/`; install it over the prior
development build. The hosting update enables the new public-photo classification
used by Android caching. Older hosting safely leaves that cache disabled. The APK
is debug-signed and is not a Google Play release. Earlier ZIPs/APKs remain saved.

Rollback by restoring the previous hosting build folders and restarting Node.
The public-photo cache never changes stored account or listing data.
