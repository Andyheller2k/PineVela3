# S23 remediation — 2026-10-03

Application attempt/resource guards now run before expensive work. Earlier signup,
room-key and delivery-PIN challenge limits remain intact. This task did not migrate
authentication/database providers or change account ownership policies.

## Policy

| Resource | Enforced limit |
| --- | --- |
| API/upload requests | 900/IP/minute; 3,000 globally/minute; in-flight: 32 globally, 12/IP, 16/authenticated actor |
| Mutations | 120/IP/minute; 60/authenticated actor/minute; 180 globally/minute |
| Login attempts, shared across aliases | 20/normalized account identity and 30/IP per 15 minutes; success also consumes budget |
| Other credential operations | 40/IP and 30/authenticated actor per 15 minutes; credential work globally capped at 120 requests/minute; in-flight credential requests: four globally, two/IP |
| Password derivations | Two asynchronous scrypt jobs, eight waiting; 16 distinct derivations/request; duplicate checks cached within that request only |
| Bodies | Login/password/simple-signup JSON: 256KB; other JSON: 4MB; authenticated photo JSON: 28MB; URL-encoded: 256KB/100 parameters |
| Body shape/encoding | At most 10,000 visited values and 12 levels; compressed request bodies rejected |
| Photo processing | Two pixel-decoding jobs/four waiting; two legacy-image read jobs/eight waiting; two in-flight upload requests; S19 byte/pixel/time limits preserved |
| Daily photo quotas | 100 files/actor, 200/IP; 250MiB encoded output/actor and 2GiB globally |
| Photo directory capacity | 5GiB / 20,000 directory entries, counting historical files too; no automatic deletion |
| Daily mutation quotas | 1,000/actor, 2,500/IP, 10,000 globally; non-photo body bytes: 25MiB/actor, 50MiB/IP, 500MiB globally |
| Live invalidation streams | 128 globally, 20/IP, three/authenticated actor; ten-minute lifetime; disconnect/expiry/slow-consumer cleanup |
| Room-key listing/generation | Listing: 60/IP, 30/actor, 120 globally/minute; generation: at most 2,000 rooms/100 blocks per residence operation; bounded names/prefixes/start numbers; generation/rotation stops after 32 colliding candidates |
| HTTP transport | 256 accepted sockets; ten-second header timeout, 30-second body timeout, five-second keepalive, 100 requests/socket; application deadlines of 20 seconds (45 for uploads) |

Limits return explicit 429/503 responses with `Retry-After` and no-store where applicable.
Oversized/unsupported requests return 413/415; full photo storage returns 507.
Photo authorization happens before parsing bytes, including when MIME/content-length
claims are malicious. Early rejections close the connection. Malformed-body errors do not
log the submitted body. SSE GETs reject submitted bodies; other methods on that URL retain
ordinary request slots/body limits instead of bypassing admission checks.

Login and daily quota counters persist atomically in private `request-limits.json` next
to the operational database. Stored keys are SHA-256 digests, without raw identifiers,
IP addresses, passwords or tokens. Expired entries are pruned; the table is capped at
4,000 entries and its file at 1MiB. Invalid state fails startup rather than resetting limits.
Request-rate and concurrency counters are bounded in memory. All login variants share the
same durable identity/IP budgets, including username/email and officer aliases.
Nested account identifiers and normalized student IDs/usernames map to that identity;
all supplied login fields are charged together so conflicting fields cannot hide a target.

Request-time password verification, reuse checks, signup hashing, manager/staff/officer
creation and password changes now use asynchronous scrypt with bounded scheduling.
Synchronous credential migration/offline utilities remain supported; request-context
derivation budgets also cover legacy synchronous fallback. Express 4 forwards async errors
to the existing error handler. Checks after hashing preserve staff uniqueness/assignment
and single-occupant room activation. Room generation uses indexed membership checks,
buffers the batch until all candidates succeed, and does not rewrite the application
database when no keys were added. Random-candidate collision loops are also bounded.

## Deployment scope

Direct localhost operation still uses `npm run dev`; internet is not required by these guards.
Behind a production reverse proxy, configure `PINEVELA_TRUST_PROXY` with its actual IPs/CIDRs.
The default trusts no forwarded IP headers; blanket trust and `/0` networks are rejected.
Use edge body/connection/rate controls as well: application checks do not stop traffic before
it reaches the Node process. This implementation supports the current single-process JSON
backend. Multiple workers need a shared limiter/connection budget and transactional
PostgreSQL persistence. Supabase RLS/authorization must remain enforced during migration.

The application database still saves synchronously to preserve existing order/stock
atomicity. Request sizes, write frequency/byte budgets and room generation are bounded;
this is not a replacement for the planned database migration, capacity monitoring and
storage management. Archived/deleted photos should be managed explicitly; restart rescans
directory usage without altering historical files. No proxy configuration or destructive
flood/load test was performed.

Technical references: [Node asynchronous scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback),
[Express proxy trust configuration](https://expressjs.com/en/guide/behind-proxies.html).

## Verification

Seven focused unit cases passed: atomic budgets and restart/expiry/corruption handling;
bounded queues and work deduplication; in-flight IP/actor/global admission and recovery;
compatible asynchronous hashes with event-loop
progress; SSE caps/cleanup/backpressure/expiry; photo quotas including historical files
and concurrent reservations; and proxy-address validation.

The isolated HTTP test passed early rejection of declared/actual large bodies, invalid
compression and nested bodies, private parser errors, admin/approved-manager photo uploads,
quota refusal without file creation, unchanged authorized session access during login
lockout, alias/forwarded-header bypass denial (including officer email prefixes, officer IDs
and conflicting login fields), durable lockouts/quotas across restart and
automatic-expiry recovery. Public and authenticated SSE streams remain usable; excess
actor connections are refused and released slots can reconnect. Excessive key generation
is rejected, repeat generation does not rewrite the database, and concurrent room claims
produce one occupant and one 409 rejection. All records/files were disposable fixtures.
Operational accounts, credentials, uploads and database records were not modified.

The full security suite passed: 72 tests, zero failures. Subsequent focused checks passed
all ten account-isolation, room-key and resource cases after bounding key collision retries;
the final eight S23 cases also passed after forcing slow/expired stream sockets closed
and covering officer aliases/conflicting login fields.
These were bounded behavioral checks, not a destructive resource-exhaustion load test.
TypeScript, production frontend/server build and private-data tracking checks passed;
the build retains its existing large-chunk advisory.
