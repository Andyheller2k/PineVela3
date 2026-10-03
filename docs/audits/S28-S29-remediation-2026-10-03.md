# S28/S29 remediation — 2026-10-03

Scope: meeting ownership and notification recipient/read-state isolation in the transitional
Express/JSON backend. Existing unrelated changes and operational data were preserved.

## Changes

- `recordAccessSecurity.ts` centralizes meeting access and notification recipient policy.
- Meeting GET, PUT and DELETE use the same record policy. Current residence assignment
  takes precedence over historical manager IDs, emails and residence names. Direct meetings
  require an exact manager ID or an unambiguous legacy manager email. Managers do not receive
  unrelated/unassigned meetings. Staff must be active in the manager-created residence roster;
  requester visibility and existing route role restrictions remain enforced.
- Notification GET, single-read and bulk-read use one recipient policy. Exact account/role
  and seller-store recipients cannot be overridden by shared email aliases. Administrators
  cannot acknowledge other users' private notices. Legacy email recipients resolve only when
  unambiguous; merchant sessions stored on a store/application remain supported. Staff alerts
  addressed to roster IDs resolve through the active manager-created roster, not email.
- Individual notification reads return 404 for missing/retired notices and 403 for a foreign
  recipient, before mutation. They consult the canonical store rather than a stale array.
- `localDb.ts` persists account-specific `readBy` acknowledgements. Shared notices remain unread
  for other eligible accounts. Responses omit reader identities and retain the existing
  `read`/`isRead` interface. Bulk read does not write a stale notification array back to disk.
- Browser read/toast caches use role/account keys. Server state is authoritative; the client
  marks read only after the server accepts the request.

## Verification

- Full `npm run test:security`: **82 passed, 0 failed**.
- After the final staff-roster compatibility adjustment: **6 focused tests passed**, including
  S28/S29, maintenance workflow and retired-feature/account isolation integration tests.
- `npm run lint`, `npm run build`, `npm run check:private-data`, and `git diff --check`: passed.
- Build retains the existing Vite bundle-size warning; compilation and bundling completed.


Direct HTTP tests use temporary stores and disposable accounts, with no live account mutation.
The S28/S29 tests cover:

- authorized manager list/update/delete; administrator cleanup; staff residence update;
- anonymous rejection and primary/staff delete-role rejection;
- foreign residence, same-email manager, name collision, spoofed manager ID and orphan denial;
- foreign notification rejection, including administrator and linked primary/seller attempts;
- no mutation after denied requests; nonexistent/retired notification 404;
- allowed individual/bulk reads; seller chat/rating reads without primary-account suppression;
- legacy staff-roster-addressed alerts remain readable only by that active staff account;
- shared administrator reads remain independent;
- ownership enforcement, successful deletions and per-account read state survive restart.

Additional unit cases cover ambiguous email records, legacy store-backed seller sessions,
identity/role precedence and response omission of reader identities.

## Compatibility and limits

Historical global read flags remain intact; past acknowledgements cannot be attributed to
individual readers retroactively. Ambiguous legacy recipients fail closed rather than guessing
from contact/name aliases. No JSON records were deleted or migrated. Supabase migration must
preserve per-recipient read state and enforce equivalent authorization/RLS. This verification
covers the local backend, not production infrastructure or a new browser walkthrough.
