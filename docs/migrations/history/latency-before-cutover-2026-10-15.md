# Historical latency checkpoint — superseded

See [current latency evidence](../../operations/latency.md). Historical links below were relative to the original document.

# Latency checkpoint — 15 October 2026

The Supabase preview runs at `http://127.0.0.1:3001`. Start it from the project root:

```bash
PINEVELA_MIGRATION_STATIC_PREVIEW=true PINEVELA_MIGRATION_PORT=3001 npm run dev:supabase
```

Build the preview assets first with `npm run build:supabase` after frontend changes.
This command selects the Supabase preview; `npm run dev` still selects the existing
JSON backend. The default backend and retained JSON data have not been changed.

## Changes

- Transaction admission takes the same ordered lifecycle/governance advisory locks
  in one parameter-free PostgreSQL call. Account policy and session permission
  functions also share one query. No identity, policy or permission result is cached.
- The pool retains one established connection after idle periods; connections above
  that minimum still expire after 30 seconds, with the existing maximum of eight.
  It does not create connections eagerly. See the [node-postgres pool contract](https://node-postgres.com/apis/pool).
- Three administrator settings reads use shared read admission. Mutations, review
  helpers with expiry writes, key checks and provider-side rechecks retain their
  existing exclusive admission and live validation.
- Four public catalog GET routes enforce maintenance in their existing locked
  `publicRows` transaction, avoiding a duplicate preliminary transaction. The lock
  and live availability check share one call; the restricted catalog role is set
  only after availability succeeds. Other routes retain the global boundary.
- A session probe without an access-cookie marker reaches the existing authentication
  denial without first opening a database transaction. Present-cookie requests keep
  the existing authentication and maintenance checks.
- Independent native administrator and residence-request reads run concurrently.
  Native manager restoration no longer awaits a redundant optional property read.
  Requests retain captured account context and cancellation.
- Buyer/seller inbox polling coalesces in-flight reads, allowing responses slower
  than the five-second poll interval to complete. Hidden pages cancel reads; sends
  retain separate cancellation and are never automatically replayed.
- Native background governance metadata refreshes every 30 seconds, while active
  review panels retain eight-second refreshes and focus refresh. Server-side action
  checks remain immediate. The hidden duplicate residence observer is disabled.
- Public/login routes and the optional Leaflet services map load on demand.
  Native guest pages no longer open a protected SSE stream. Account unmount/logout
  closes the old stream and its reconnect timer; legacy public streams remain.

## Evidence and limits

Private evidence lives under `.security/migration-reset/`; it must not be committed.

- `frontend-entry-latency-final.json`: common static JavaScript imports total
  **507,999 bytes**, down from **859,463 bytes** (41%). Consistent gzip level 9 totals
  are 161,503 versus 259,062 bytes. Dynamic route assets and images are excluded;
  this is a byte comparison, not an end-to-end speed percentage.
- `latency-baseline.json`: live four-lock admission took 3,129/2,991 ms across four
  calls versus 215/865 ms for the same ordered statements in one call. These phases
  were read-only. Cold connection took 4,105 ms and individual round trips varied
  from 195 to 1,679 ms. Do not extrapolate those samples to whole-dashboard latency.
- `latency-after.json`: the real 30-second pool setting retained the same connection
  after 31,005 ms idle, with a 0 ms checkout. The subsequent network query still
  took 893 ms. `pool-retention-native.json` adds 25 genuine PostgreSQL checks for
  lazy creation, minimum-zero eviction control, burst contraction, commit/rollback
  role isolation, private-data denial and shutdown draining.
- `administrator-read-concurrency-native.json`: 65 actual PostgreSQL checks cover
  lock order/modes, writer exclusion, overlapping pure reads, invalid actors and
  private-key denial. `account-access-latency-native.json` adds 11 checks for real
  archived sessions, foreign-session denial and immediate revocation. Tests restore
  a genuine encrypted checkpoint into disposable PostgreSQL, with matching final
  identity/session/key fingerprints and no cloud mutations.
- `public-latency-native.json`: 62 actual PostgreSQL/HTTP checks cover zero-SQL
  unsigned GET/HEAD session denials, five-call catalog transactions, the restricted
  catalog role, maintenance lock exclusion in both directions and unchanged private
  route boundaries. An ungranted maintenance transition is denied. The genuine
  archive has no enabled-maintenance state or populated published catalog, so those
  integrations remain unverified; no grants or records were invented to fill gaps.
- `latency-browser-guest.json`: 55 real guest checks at 375px and 1440px pass,
  including four lazy routes, map loading/close controls, zero guest SSE requests,
  no runtime errors/failed resources and no application mutations. The final run
  after pool retention observed login UI readiness of 718–1,194 ms and guest
  authentication denials of 44–208 ms. Residence/market reads completed in 2,097–4,190 ms;
  the first cold landing required 11,432 ms. The earlier run reached 13,878 ms and
  is preserved separately. These are observations rather than a controlled
  pre/post browser comparison.
- Focused refresh/restoration/account-policy/SSE tests, TypeScript, the default build
  and the combined Supabase frontend/API/worker build pass. Source inventory remains 226 endpoints:
  178 replacement matches, 14 retired and 34 unmatched legacy contracts. The native
  graph contains 100 modules and no reachable JSON persistence.

Actual guest browser measurements distinguish UI readiness from required data
completion. Cloud transport remains variable; no genuine authenticated browser
benchmark after these changes has been completed. The earlier 116,942 ms manager
measurement predates this checkpoint and is not an after measurement. Do not claim
all latency is resolved from builds, native tests, entry bytes or guest checks.

The separate Premuim Pine cleanup completed through the user's own two approvals,
keyed founder pause/final consent/request, fresh database restore and matched
Storage reconstruction. The exact native worker removed four reviewed housing
rows, retained the manager account/key and created zero image tasks or bans.
Forty-four post-execution comparisons with the real backup passed, including all
seven Auth users, 49 original history rows and unchanged Storage catalog metadata.
The local request gate is disabled again; persistent defaults remain off. No
manager session existed in the backup or after cleanup, so genuine retained-manager
login/browser performance still needs a separate check. Provider object bytes were
not downloaded again after deletion. No JSON data was removed.
