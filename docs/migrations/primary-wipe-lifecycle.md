# Primary account closure and re-entry

Migration `20261013093354_reviewed_primary_wipe_lifecycle.sql` supplies a native
primary-only closure core. The live HTTP execution route remains disabled; no
CLI command invokes the core. It does not complete the general system-wipe worker.

A `users` or `total` review is eligible only when every selected portal is an
active primary portal, each subject has a confirmed supported email or verified Google identity, no selected
operational housing/market/history graph needs processing, and there is no pending
linked enrollment. Profile images may remain retained. Scopes with other portal
kinds, residences, stores, orders, payments or their linked history are rejected.
Previously closed residences outside the selected resource graph remain history.
Migration 63 adds verified email re-entry; see [email primary re-entry](primary-email-reentry.md).

The ordinary five-administrator review, founder backup decision, durable scope
pause, actual restored database and encrypted Storage evidence, and final keyed
founder consent are all required. The operator core checks the branded restored
proof and exact immutable receipt before native admission. It is not a public RPC.
No browser-supplied proof, ownership identifier, session or key version is trusted.

`private.primary_wipe_executions` binds the exact authorization, preparation,
proposal, founder, primary context IDs, transaction ID and backend PID. Admission
checks the current founder session/key and consent expiry. Only the admitted
transaction can change those primary statuses; other paused data and existing
residence execution guards remain protected. A deferred commit guard requires
closure, completion and pause release in the same transaction. Notification or
audit failure rolls everything back. Receipts cannot be altered, deleted or truncated.

Closure retains Auth users, Google identities, native Auth sessions, profiles,
account history and Storage bytes. Only application bindings to the selected
primary contexts are removed. Administrator portals, their bindings and keys are
independent and remain usable even when the same subject's primary portal closes.
The affected primaries and active administrators receive one retained notice.
The preparation/pause move to `completed`, and the review records `executed` only
through the native receipt. Public status exposes completion timestamps without
private execution/session/key bindings.

Ordinary sign-in does not reopen a closed primary portal. For a completed normal
wipe, it explains the **Sign Up with Google** continuation. That explicit signup
uses the existing server-side Google PKCE exchange and Supabase `/user` verification.
The retained signup helper reuses the exact Auth, profile and primary context IDs;
it never restores closed subaccounts, old stores, privileges or revoked bindings.
Concurrent attempts produce one immutable `private.primary_wipe_reentries` receipt,
one audit event and one notice. Existing active profiles retain their prior behavior.

Native re-entry independently checks the same verified Google subject and live
native session, completed closure, original ownership, platform availability,
retained bans and session invalidation epochs. The current native session must
satisfy those epochs; re-entry does not fabricate or reset provider verification
timestamps. The server's explicit PKCE signup is the fresh provider proof boundary;
SQL identity/session checks alone are not claimed to verify an OAuth exchange.
A closure without a completed normal-wipe receipt cannot use this path.

Both private tables have RLS and no grants to public, anon, authenticated or the
scoped backend role. New helpers are invoker functions; no new SECURITY DEFINER
function or public projection is introduced. The existing metadata-only pause
trigger is extended for exact native primary transitions, preserving its previous
residence checks. The primary status constraint now allows `closed`; a native
lifecycle trigger prevents arbitrary closure, reopening, identity reassignment or
history deletion rather than relying on the broader constraint alone.

Verification command:

```sh
npm run db:verify-primary-wipe -- <genuine-auth-backup-uuid> <migration-27-backup-uuid>
```

The verifier uses an isolated PostgreSQL restore with genuine archived Google
subjects and native sessions, encrypted database restores and actual read-only
Storage downloads. It never executes closure in the live project. Genuine Google
re-entry through the browser remains separate acceptance work. General operational
closure and positive provider/browser acceptance remain
unfinished; seller re-registration (62) and email primary re-entry (63) have their own
implementation and verification boundaries; do not remove JSON or enable live execution on the strength of this core.
