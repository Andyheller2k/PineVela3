# Verified officer invitations and room-key delivery

Officer onboarding uses the existing private account-enrollment model. An active
administrator supplies their own approval key and the intended officer's separate
official email, name, contact number and inspection zone. The private invitation
expires after 24 hours. Acceptance requires the exact confirmed Supabase identity
and its live primary-account session. Existing administrator and other portal
identities cannot be converted into officers, including suspended/closed portals.
Administrators never assign the officer's authentication password.

Ordinary signup during an invitation creates only a primary account. Acceptance
creates a separate officer context and retains its immutable invitation receipt,
audit and notifications. Key recovery or issuer suspension cancels outstanding
invitations. Status changes require an administrator's own approval key. A consumed
link cannot restore suspended or closed access. The officer must sign out and use a
genuine fresh Google/email sign-in before entering `/field-officer`; no session
timestamps are fabricated. Roster, dispatch, reports and profile use the completed
invitation metadata without exposing private enrollment tables to browser roles.

Room-key delivery accepts `keyId`, `recipientEmail`, optional `customNote` and an
idempotent `requestId`. A current manager session, own operation-key version, rooms
permission, approved/reviewed residence and current assignment are required. The
server derives the current room key and housing labels. Client-supplied raw keys,
ownership fields and labels are rejected. Occupied keys can only be resent to the
current resident's primary owner.

Delivery resolves one active primary account through its confirmed mailbox or a
saved, verified resident enrollment and creates a protected recipient notification,
private immutable receipt and audit atomically. It sends no email or SMS and does
not allocate or reserve a room. Concurrent nonce retries return the same receipt;
a reused nonce cannot target different content. Rotation makes the earlier receipt
historical and the UI directs the manager to refresh the current key.

`private.room_key_deliveries` has RLS and no browser/scoped-backend grants. Its
manager/recipient contexts and notification are relational references. Key, room
and residence UUIDs are validated snapshot identifiers without physical-housing
foreign keys, so reviewed teardown retains the original history. Native guards
enforce the live graph on insertion, lifecycle pauses, immutable history and queued
Storage-reference admission. Staff key reads do not gain recipient-email metadata.

Read-only admin store and registration-restriction endpoints use actual approved
store generations, payments/access periods and reviewed cooldowns. They cannot
waive cooldowns or reuse historical approvals. No retired workflow is recreated.

Native verification runs in isolated PostgreSQL restores with genuine archived
Auth identities and sessions. On 15 October the user completed fresh sign-in as
the real officer. **24 genuine browser checks passed** for exact officer identity,
empty owned queue, guest/stale-context/admin-role denials, 1440/375px portal controls,
refresh, administrator-page denial, return and full reload. A dedicated task tab
uses the prepared officer context and preserves the original tabs/sign-in. No
inspection records or provider replies were invented. Session reads remain slow.

The user subsequently manually dispatched Premuim Pine to that officer. Another
**23 read-only browser checks passed** for the actual saved pending assignment,
medium priority and absent report, guest/stale-context denials, exact populated
card/action at 1440/375px and unchanged saved state/session. The populated report is
kept separately from the earlier empty-queue evidence. No inspection form was opened
and no report or physical evidence was submitted by verification.

Manager-to-recipient delivery, populated cross-officer browser isolation, physical
inspection/report and operational manager acceptance remain pending. The saved
Premuim Pine application is development-only. Final cutover/reset and JSON removal
remain separate gates. See the [continuation checkpoint](../../SUPABASE_CONTINUATION.md).
