# S22 / S26 remediation — 2026-10-03

## S22: account status and session revocation

Every authenticated officer request now checks the current, uniquely identified officer
record, active status and matching live session. Both login paths check the same current
record, so a stale user copy cannot override a disabled officer. Status updates accept
only `active`, `suspended` or `inactive` and require an administrator.

Suspension/inactivation clears officer sessions from the officer registry and associated
user records by account ID. Reactivation cannot restore a previous token. Session metadata
is excluded from officer status/profile responses.

Staff authorization requires an explicitly active manager-created roster entry for its
account ID and residence. Manager suspension/inactivation clears associated sessions;
deletion and all existing resignation paths also revoke them. Reactivation requires a fresh login.
The existing manager-only staff ownership policy remains enforced.

## S26: authenticated onboarding ownership

`POST /api/manager-requests` already required authentication. It now explicitly requires
a manager identity, binds author fields to the session and uses manager IDs when finding
existing requests, preventing another manager with the same email from supplying the result.
Supplied approval/status fields do not determine the new request's pending status.

`POST /api/hostel-verifications/submit` now requires an approved manager and an existing,
owned residence. Register the residence through the existing registration flow first.
Foreign/nonexistent residences, already approved residences, and duplicate outstanding
submissions are rejected. The endpoint cannot demote or overwrite property approval.

Manager identity and property details come from current server records. Identity validation
comes from the manager's approved document-review record; absence of that evidence is false.
The server computes validation results and creates pending review status and audit authorship.
Client approval flags are ignored. A submitted payment reference remains review evidence;
it does not mark this submission paid. This does not implement a real payment provider.
Retired staff application endpoints remain absent.

## Verification

Dedicated isolated HTTP tests exercise active accounts, stale officer copies, invalid
status values, unauthorized status changes, bearer/cookie revocation, reactivation without
token revival, staff suspension/deletion/resignation, unrelated-account isolation and restart
persistence. Onboarding checks cover anonymous/primary/admin/pending-manager denial,
foreign residence denial, identity/approval spoofing, malformed values, duplicates, valid
owned submissions, authoritative document flags and same-email manager isolation.

Existing staff and inspection tests now expect HTTP 401 for revoked tokens and require
fresh login after reactivation. Previously they expected an issued token to remain present.

The full security suite passed **73 tests with zero failures**. The final focused HTTP
test also passed after the last staff-status validation change. TypeScript checking,
production frontend/server build and private-data tracking checks passed. The build retains
the existing large-chunk advisory. Operational accounts and data were not modified;
fixtures lived in temporary directories. Historical audit evidence
is preserved. The separate flow review's three newly found bugs were reported, not fixed
as part of S22/S26: [flow review](flow-verification-2026-10-03.md).
