# S09 remediation — 2026-10-02

S09 is fixed and verified in the local checkout. Changes have not been pushed or deployed. No operational room keys or occupant records were rotated or deleted.

## Changes

- `GET /api/room-keys` derives accessible hostels from the authenticated actor and stored relationships. Administrators can access all existing residences, approved managers can access their managed residences, and active staff can read existing keys only for their manager-created roster residence.
- A manager with no property receives `[]`. Filtering uses hostel IDs, never residence-name matches, and explicit ownership IDs take precedence over shared email. Ambiguous legacy email-only ownership does not grant access.
- A `hostelId` query can narrow authorized access but cannot grant access. Unauthorized managers/staff receive HTTP 403 before generation; malformed/empty query IDs are rejected.
- Only management/admin requests generate keys, and only after residence authorization. Staff do not generate keys. Database read and lookup helpers no longer generate keys across every hostel as a side effect.
- `/api/room-keys/verify` requires the primary user account already required for room activation. Its preview includes the submitted room key and actual room/residence details needed by onboarding; it excludes manager contacts, occupant information, record IDs and credentials. Unknown, occupied and unavailable keys have the same failure response.
- Verification and both activation aliases share persistent attempt limits: 20 requests per account and 60 per IP address per 15 minutes. HTTP 429 includes `Retry-After`. Limits survive application restart, bound stored buckets, remove expired entries on use and store only hashed scope identifiers rather than raw IP addresses or activation keys.
- Successful key-list and activation-preview responses are private and not cached. The onboarding fetches send the existing session token. The user-dashboard activation cache obtains manager contacts from the successful activation response instead of the preview.

Existing release/reshuffle operations and resident activation remain available under their existing authorization rules. Already distributed activation codes have not been invalidated by this endpoint repair; existing key rotation remains a separate explicit manager operation because it can revoke occupied-room access.

## Verification

All tests used disposable databases, not real occupants or operational data.

- S09 HTTP integration passed: unauthenticated/invalid-role access denied, no-property manager returns an empty list, cross-hostel queries denied, shared manager email and identical hostel names do not bypass ID ownership, staff see only their roster residence, inactive staff are denied, administrators retain access, and unauthorized/read-only requests do not generate foreign keys.
- Activation verification requires a primary session, returns a minimal preview, rejects malformed/used/unknown keys, and does not generate keys during lookups. Exhausted budgets block verification, claim and onboarding aliases and remain enforced after restart.
- Attempt-guard unit test passed: account/IP budgets, expiry, bounded storage, hashed identities and reconstructed-guard enforcement.
- Existing account-isolation integration passed: room activation, distinct credentials, release, reshuffle, restart persistence and concurrent single-occupant activation.
- Existing S08 integration passed: private inspection and resident-directory boundaries remain enforced.
- TypeScript, production build, private-data check and whitespace check passed. The build retains its bundle-size advisory.

Files: `roomKeySecurity.ts`, `server.ts`, `localDb.ts`, `persistentDb.ts`, the two onboarding components, security-test command and S09 tests. Other audit findings and the future database migration are outside this change.
