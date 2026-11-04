# Terms acceptance: implementation and remaining decisions

Status: INTERNAL. The associated app update enforces current published Platform Terms version **2026-10-27**. This pack's new agreements remain drafts.

## Required user experience

Use an unchecked, explicit control immediately before signup/application submission. Link to a readable, version-specific Terms page and the Privacy Policy; keep them usable without signing in. Disable submission until checked and validate again on the server. Keyboard operation, visible focus, readable light/dark contrast and screen-reader labels are required.

Current copy: “I am at least 16 and I have read and accept the Terms of service (version 2026-10-27).” The merchant copy adds “for my merchant application and use of PineVela.” Privacy is a notice link, not blanket permission for every use. Marketing and optional AI sharing remain separate and optional. Keep the student-identity declaration separate from agreement acceptance.

## Implemented agreement boundary

- Email signup and verification require explicit acceptance of the current version; a receipt is written only after verified identity/session binding.
- Google signup requires the same choice before redirect. The server holds the chosen version with its one-time OAuth state; the callback records it only for the verified bound account. A cancelled or replayed flow does not record acceptance.
- Signed-in accounts without a current receipt encounter an acceptance screen before private page/notification providers mount. Existing users are not auto-consented. Each authenticated product API checks the server-derived acceptance state; direct HTTP does not bypass the UI.
- Auth identity/status, appearance preferences, support and supported self-closure requests remain available; sign-out does not require agreement.
- A merchant application requires fresh explicit acceptance and records a receipt against the server-selected application ID and submission version, within the same transaction as submission. Ownership and verified student enrollment checks remain mandatory.

## Evidence model

Private registry: `private.legal_documents`; receipts: `private.legal_acceptances`. Records contain verified Auth subject, current account context and session, server-selected purpose/source, document key/version/SHA-256, database timestamp and (for merchants) the application submission reference. They do not accept client-supplied identity, ownership, date, hash, URL or application receipt selectors. Duplicate submission preserves the original receipt timestamp.

The immutable public copy is `/legal/terms-2026-10-27.html`; the registry retains the actual contractual article HTML and its SHA-256. Header/logo changes do not change the contract hash. Browser roles cannot read/write these private tables. No user is backfilled as having agreed. IP addresses and user agents are not added to the consent ledger by default.

## Approval needed before new legal text ships

Approve merchant and other role agreements, decide which are contractual, publish immutable accessible versions, add them to the versioned registry and extend the server/UI gate to the correct purpose. Do not add unpublished drafts or imply that current Platform Terms acceptance also accepts a future merchant contract. Publish a change summary and fair notice; obtain renewed agreement where required.

## Acceptance test requirements

Test missing/false/malformed/stale acceptance; unchecked client control; Google signup and login; old and new email accounts; unverified accounts; unauthorized role/foreign enrollment; spoofed identity/time/hash; repeat submission; rejected merchant resubmission; failure rollback; session change during submission; both themes; phone/desktop; keyboard; policy access without JS; sign-out and support without consent. Verify private-table grants/RLS and exact served article hashes.

Deployment: apply the reviewed non-destructive migration before starting the new backend, then install backend and frontend together. A frontend-only ZIP cannot provide server enforcement. Record actual tests and live deployment separately in the release notes.
