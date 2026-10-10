# Administrator approvals and wipe recovery

Default startup still uses the single-writer JSON backend. The setup and wipe sections
below describe that transitional implementation. No accounts, keys or proposals are seeded.

## Supabase replacement checkpoint

Migration 37 adds account-action reviews to the actual account directory and Shared
Approvals. Any active administrator can propose with their own approval key; all five,
including the founder, must vote independently within 24 hours. A rejection closes
the review. After five approvals, only the keyed founder can record a final rejection.
Reviewed identities, features, durations, reasons and votes are immutable. Roster/key
and account-lifecycle changes invalidate consent, even after reversal. Administrator
portal accounts remain governed by membership controls. All review transitions notify
the reviewed active administrator portals through the Approvals notification module.
Applying an account policy or deletion is still disabled; approval changes no account.

Migration 31 implements actual roster/history reads, fresh-sign-in approval-key enrollment
and independent approval/settings-key recovery. Enrollment requires an active administrator
and a genuine Google or verified-email Auth session created within five minutes, without
a local password for Google-only accounts. The salted context-bound key is shown once;
its version, failed-attempt window and lockout remain private.

Two other active administrators with enrolled approval keys must consent to recovery.
The proposer counts once; the target cannot vote. Consent is immutable, expires after
24 hours and is invalidated by roster/key changes. An independent rejection closes it.
The second approval atomically clears only the selected key, rotates its version,
invalidates older administrator app sessions and commits history, audit and exact
administrator notifications. The founder's key follows the same rule without removing
founder membership. Refresh cannot bypass recovery: a new provider sign-in is needed
before replacement enrollment. No Auth identity or session timestamp is fabricated.

Migration 32 adds founder-keyed invitations reserving slots 2–5 for exactly 24 hours.
Only a verified primary identity matching the private link and invited mailbox can
accept; an existing mailbox is also bound to its exact Auth UUID. Existing secondary
portals cannot be promoted through this flow. Acceptance creates membership and empty
key records atomically, without creating a local password or issuing keys. Tokens are
shown once, persist only as a digest and remain outside browser storage. Share links
manually through a trusted channel. Founder cancellation releases a reservation;
issuer key/status changes immediately invalidate grants, including later reversals.
Creation, cancellation, expiration and acceptance notify the exact active roster.
Migration 33 adds founder-keyed suspension and restoration. SQL protects the founder,
membership ownership and session epochs, and blocks removal through generic context
deletion/status changes. Both transitions invalidate older administrator Auth sessions;
restoration requires a new provider sign-in and preserves separate keys and history.
Pending recovery/pricing consent is invalidated. Audit, exact roster notifications and
the affected primary account's notice commit together. The UI asks for confirmation.
Migration 34 implements permanent administrator removal. Only the founder's current
approval key can propose it. All four other eligible administrators, including the
founder and excluding the target, must independently approve within 24 hours. The
fourth vote opens a fresh 24-hour private appeal window. Only the target can submit;
only the founder and target receive its text or decision reason. A submitted appeal
always requires a keyed founder decision. Acceptance revokes removal authority while
preserving immutable vote history. Rejection, or expiry without an appeal, permits
the founder's separate final key check and exact `REMOVE ADMINISTRATOR` confirmation.
Roster/key changes invalidate all unfinished reviews, including later reversals.
Removal atomically closes only the admin context, marks its membership removed,
invalidates portal access, deletes private keys and saves audit/status notifications.
Auth and primary access remain intact; the affected primary inbox receives the final
notice before entering any sub-account. Membership/context tombstones preserve foreign
keys and vote history. The former slot becomes available to a different privately
invited identity; a removed portal cannot be restored through suspension controls.
Administrator transactions take the governance lock before actor row locks to avoid
deadlocks with concurrent target requests. Browser roles cannot call the protocol or
read private appeals. No production administrator has been removed by verification.
Wipes still await their independent command port. Actual fresh enrollment and post-recovery
provider HTTP/UI journeys remain acceptance gates. See the
[current migration evidence](migrations/supabase-implementation-status.md).

Migration 36 ports the message gateway independently of approval/settings changes.
An active administrator can select actual active primary, manager, resident, seller
or staff portals, review the deduplicated recipients and send a one-way announcement.
Private sender-bound previews expire after 15 minutes and cannot authorize another
selection. Delivery is atomic and retry-safe; completed content and recipients are
immutable. Each exact recipient gets a notification and independently dismissible
popup. A shared mailbox or primary-parent relationship does not merge portal inboxes.
No live announcement was sent during migration verification.

## Setup

1. Sign in as Andyheller2k and open **Shared approvals / Admin Approvals**.
2. Verify administrator #1 and enroll your private approval key using your current login
   password. Save the generated key securely; it is shown once and stored only as a hash.
3. Invite the other founders into available slots, using distinct administrator email
   addresses. Share each private invitation with its intended recipient through a trusted
   channel. After creating an invitation, its private URL appears directly below the form
   with a **Copy invitation link** button and is scrolled into view. Invitations expire in
   24 hours, reserve a slot, and are redeemed once. The URL is shown only in the creating
   browser session; if lost, cancel the reserved invitation and create a new one.
4. Each recipient chooses their own login password and receives their own private key.
   Existing administrators enroll their key while signed in. The application does not send
   invitation emails or create placeholder founder accounts.
5. Exactly five active administrators with enrolled keys are required to submit or execute
   a wipe. Suspended, vacant or unenrolled slots do not reduce this threshold.

On first initialization, Andyheller2k's existing administrator account receives slot #1.
`PINEVELA_MAIN_ADMIN_ID` may instead identify an existing administrator at initialization.
The persisted ID governs subsequent authorization; changing a profile email or environment
value does not transfer authority. A sole bootstrap administrator becomes #1 when Andy's
account does not exist. Multiple existing administrators without either selection require
offline reconciliation. More than five existing admins cause startup to fail safely.

Administrator #1 may suspend/reactivate another admin immediately; suspension revokes its
sessions. Permanent account removal requires #1 and three other active administrators' approval keys,
excluding the targeted account. Two approvals keep voting open. After all four approvals,
the target receives a 24-hour plea window. Only #1 can accept a plea (revoking all votes),
reject a plea, or explicitly confirm removal after rejection or an unanswered deadline.
Plea decisions produce private prompts for the target; plea text is visible only to #1
and the target. Membership changes invalidate outstanding removals. A key reset requires
two active admins other than the key owner, so other
founders can recover a lost #1 key without knowing it. The owner then enrolls a new key
with their login password. #1 cannot be suspended/deleted. Generic account/password APIs
cannot delete an administrator or reset another admin's login password.

## Wipes

- Checkbox scopes: hostels, markets, managers (including staff), resident accounts, primary
  user accounts; **total** is exclusive and preserves administrators and governance records.
- A server-derived preview lists affected collections, dependent records, uploaded files,
  and cascade rules. Manager deletion removes owned hostels to avoid orphaned ownership.
  Hostel deletion removes its activated room accounts and staff, preserving unrelated
  primary users. Primary account deletion cascades to its linked accounts and properties.
- A reason and private key submit an immutable proposal and count the proposer as 1/5.
  Every dashboard sees the proposer, account ID, numbered voter roster, decisions and times.
- Each other administrator independently approves with their own key. Any rejection
  cancels. Proposals expire after 24 hours. Duplicate votes and replay are rejected.
- Admin membership/key changes invalidate live proposals. Changes to selected records or
  media invalidate the deletion preview; a fresh proposal and five approvals are required.
- After 5/5, #1 must enter their key and **WIPE APPROVED DATA** to execute explicitly.
  Approving the fifth vote never automatically deletes data.
- Execution drains active requests/async handlers (including handlers whose clients have
  disconnected), rechecks authorization/quorum/preview, verifies an encrypted database/media
  backup, stages media outside public uploads, commits once, and removes staged files.
  Concurrent requests cannot execute the same proposal twice. Shared retained images remain.
- The old `/api/admin/clear-all-registered-accounts` endpoint returns 410. Old
  `ADMIN_DESTRUCTIVE_*` variables have no authorization effect.

Approval-key failures are limited to five per account per 15 minutes, persisted across
restarts. Existing IP/request/body/credential limits also apply. Approval hashes and
invitation hashes never appear in API responses. Keys are never put in browser storage.

## Backup and offline recovery

`PINEVELA_WIPE_RECOVERY_DIR` defaults to `.security/wipe-recovery`, outside public uploads.
The directory requires mode 700; its generated `backup.key`, authenticated AES-256-GCM
archives and minimal `audit.jsonl` require mode 600. Development static serving denies these
paths. Keep a separate secure copy of **both the key and archives outside this host**;
encryption does not protect them from an attacker who controls the same host and key.
Never commit the recovery directory. Custom recovery directories must also remain untracked.

Online recovery is bounded: 64 MiB selected media, 32 MiB individual files, 128 MiB archive.
Larger operations require an offline archival/migration plan. Symlinks and unsafe paths are
rejected. Partial/crashed execution leaves a durable `execution-blocked` marker, which
blocks writes even after restart; inspect it offline rather than deleting it blindly.

Stop the application, retain recovery files, and restore a verified archive with:

```sh
npm run admin:restore-wipe -- <proposal-id> --confirm-restore
```

The tool takes the same kernel writer lease, verifies/decrypts the archive, restores media,
quarantines the current database, and atomically restores the snapshot. It refuses to
overwrite changed media or an existing quarantine. It revokes all restored sessions,
invalidates pending approvals, drops invitations, and appends a recovery audit. Login
passwords/private approval keys remain valid, but everyone must sign in again.
After an interrupted recovery, inspect the archive, staging directory, database and
quarantine before retrying. Do not serve the staging directory or recovery directory.

Governance records and private recovery artifacts intentionally survive total wipes.
The JSON writer also retains its protected local `.bak`; recovery copies are not active
operational collections. No Supabase database is wiped by this implementation. Port these
invariants to PostgreSQL transactions, server-side Auth identities and private RLS policies
before migrating this flow or enabling multiple workers.

## Verification

- `tests/adminGovernance.test.ts`: keys, quorum, state transitions, cascades, encrypted media
  backup, expiry, invalidation, rate limits, independent replacement/reset, failure markers.
- `tests/adminGovernance.integration.test.ts`: direct Express role/session checks, retired
  bypass, suspension/login, five votes, concurrent execution, real persistence/restarts,
  encrypted offline restore, revoked old sessions and successful fresh admin login.
- `node tests/adminGovernance.browser.cjs`: production browser at 375/768/1440px, sidebar/top
  navigation, number tags, shared proposals, checkboxes, preview, private-key clearing and
  independent mobile approval; checks console/API errors and horizontal overflow.

All tests use disposable databases. Never run a real wipe as a verification shortcut.


## Platform settings and administrator photographs

Marketplace registration, commission, the two-month semester fee and all three monthly
subscription prices use shared pricing proposals in **Admin Settings**. Any active admin
may propose an immutable set of prices with a reason and their own settings key. Submission
counts as one approval. At least three distinct administrators must approve; fourth and
fifth votes remain possible before application. There is no automatic application at quorum.
Only administrator #1 may make the **Final push**, using their settings key, after quorum.
That final action cannot change the reviewed prices or replay an applied proposal.

At least three active admins must have settings keys enrolled, including #1. Fewer founders
do not reduce the approval threshold. Each admin gets one approve/reject vote; a rejection
closes the proposal only when three approvals become impossible. Cards show before/after
values, proposer, numbered roster, named votes, expiry and final applier/time. Proposals
expire after 24 hours. Membership/key changes or stale live prices invalidate proposals;
applying one invalidates competing live proposals. All votes and application survive restart.
The legacy direct settings endpoint rejects pricing changes even from #1. Announcements,
maintenance and personal profile controls retain their own settings-key authorization.
Receiving-account controls retain the separately documented Paystack behavior.

New checkouts/orders use the applied prices and commission; existing immutable payment
quotes, paid periods and stored order accounting retain their original values. Private
receiving configuration remains unchanged. An application-save failure rolls back in-memory
prices and blocks further governance writes for recovery. Offline wipe recovery invalidates
restored live pricing proposals as well as wipe approvals.

Open **Admin Settings** and enroll your own settings key with your current login password.
The cryptographic settings key is displayed once and stored only as a purpose-bound hash.
It is independent of the wipe approval key. Every settings update, administrator password change and
profile change requires the authenticated owner's settings key. Five incorrect attempts
lock the key for 15 minutes; password enrollment is also limited. A lost settings key
requires two other administrators to approve its reset under **Admin Approvals**. The
owner then signs in and enrolls again; resetting this key preserves the wipe key.

- Settings are server-validated, persisted and synchronized to open portals. Announcements
  render as plain text across non-admin portals; clear the text to remove them.
- Maintenance blocks existing non-admin sessions, non-admin logins, signup and other
  account operations before body parsing. Administrators remain able to log in and disable
  it with their own settings keys and a required return message (1–2,000 characters).
  Public maintenance copy reveals neither database work nor administrator access.
  The latest return message is available only via authenticated
  `GET /api/auth/maintenance-notice`. For 24 hours after restoration, only non-admin
  credential accounts present at restoration can see the modal. The server snapshots
  their account identities, including dedicated seller/officer accounts, so accounts
  created afterward are excluded even if they share an existing account's email.
  Open popups close at expiry; expired notices and legacy notices without a reliable
  restoration time and audience are not delivered.
  `POST /api/auth/maintenance-notice/dismiss` accepts only the notice ID and derives
  the dismissal owner from the session. Messages and per-account dismissals persist
  in private platform settings, survive restarts without extending expiry, and reset for the next lockdown.
  During PostgreSQL migration, preserve these notices and owner-only acknowledgements
  with RLS. Public settings, health, invalidation streams, logout
  and secret administrator-invitation acceptance remain available. These public streams
  contain no account records and retain their connection/resource limits.
- New marketplace applications snapshot the configured registration fee. Existing quoted
  fees remain unchanged. Onboarding displays that stored amount. New orders snapshot the
  configured commission for accounting without changing trusted product prices. These
  settings do not implement payment collection or transfer; existing payment verification
  limitations remain separate. Housing room prices are not reintroduced.
- Choose a real JPEG, PNG or WebP profile photograph up to 5 MB and enter your settings
  key. Existing secure upload machinery decodes/re-encodes it to PNG (800 pixel maximum),
  validates content, applies quotas and uses generated filenames. Each administrator may
  attach only their own uploaded image. Profile photographs persist across logout/restart.


Settings verification commands:

```sh
node --import tsx tests/adminPricing.test.ts
node --import tsx tests/adminSettings.test.ts
node --import tsx tests/adminSettings.integration.test.ts
npm run build
node --import tsx tests/adminSettings.browser.cjs
```

These checks use disposable databases and photographs. They verify settings-key
separation/ownership/attempt limits/recovery, strict input validation, every non-admin
role during maintenance, continued admin access, restart persistence, real image content
checks, responsive forms and live announcement/maintenance updates. Pricing checks cover
three through five distinct approvals, unchanged live prices before the main final push,
direct-update denial, replay protection, expiry, roster changes and persistence failure.
No operational
maintenance setting or administrator credentials are changed by the tests.

System announcements are delivered as private, unread notifications to existing non-admin accounts when an administrator publishes new text. They also appear once in a dismissible account popup, with acknowledgement saved on the server. They do not create floating banners or toasts. Unchanged saves do not duplicate announcements; clearing the setting preserves notification history.

Registration approval requires the authenticated administrator’s private approval key. This is enforced before manager approval aliases, marketplace application approval, hostel verification approvals and reviewed manager residence-change decisions. Direct property editing and the legacy administrator creation/upsert route are retired. Settings keys and another administrator’s keys cannot authorize approval; keys are stripped before domain records are updated and share the existing attempt limit. The UI asks for the key in a modal and keeps failed approval reasons on that card.

The Accounts directory lists primary user identities only. Its account tree derives registered room, manager, seller and staff relationships from stored parent/manager IDs. Each node opens the existing governed account actions; moderation quorum and primary-account inheritance remain enforced. Unlinked legacy accounts are not assigned to users by guessing from email addresses. Settings and governance failures appear under the initiating change with a dismissible top-screen notification.
