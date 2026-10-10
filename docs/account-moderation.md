# Account moderation

## Supabase review checkpoint (migration 37)

The replacement backend now reads the actual account directory and supports proposals,
five independent votes and the founder's final rejection for timed bans, feature
restrictions and restorations. Each command requires the caller's current separate
approval key and verified active administrator portal. The proposer counts once;
administrator accounts remain protected by membership governance. Shared mailboxes
never establish account ownership or directory links.

SQL guards make review evidence and votes immutable, stamp a 24-hour lifetime and
require all five current keyed administrators, including the founder. Roster/key
revisions and a private monotonic account-lifecycle revision invalidate old consent,
including changes that are subsequently reversed. Lifecycle invalidation currently
conservatively covers any context, parent-link, staff/manager-assignment or allocation
change; it is not limited to the target's branch. Profile appearance edits do not
increment that revision. Proposal/vote/closure/final-rejection notices appear in the
administrator Approvals module, with audit writes in the same transaction.

**Final application and deletion remain disabled.** These reviews do not impose or
remove a ban/restriction, revoke Auth sessions, delete records or notify users that an
account action has taken effect. The remaining policy execution must cover Auth, API,
RLS, inherited relationships and public seller visibility before it is enabled.
Deletion additionally requires reviewed dependencies and verified database/Storage
backup and cleanup. Real provider-authenticated browser acceptance remains pending.

Verification: `npm run db:verify-account-reviews -- <latest-backup> <migration-27-backup>`
uses an isolated restored database with genuine Google identities and unchanged Auth
sessions. It tests consent, negative authority cases, SQL bypasses, atomic notices,
monotonic invalidation and reconnection persistence. No operational account is changed.

## Transitional JSON implementation

The admin account directory remains an application feature after database migration. It lists credential identities by role and account ID; shared emails do not merge accounts. Pending requests without an account are not directory identities.

In **Accounts**, select **Manage account** to propose a timed ban, feature restrictions, access restoration, or deletion. Every action needs five active founders with enrolled private approval keys, five separate approvals, and administrator 1's final application. The proposer’s approval counts as one. Administrator 1 can instead reject the final action with a recorded reason. Keys are separate from settings keys and never stored by the browser. Founders remain protected by existing membership governance.

- Ban duration accepts positive whole numbers in hours, days, weeks, months or years, up to 100 years. A month is 30 days and a year is 365 days. Time starts at final application. Bans expire automatically by server time, including after restart; revoked sessions never revive.
- Restrictions cover sub-account creation, room activation, ordering, publishing, buyer–seller messages and maintenance submissions. They remain until an approved restoration/replacement. Parent restrictions/bans follow explicit account links; staff also inherit their manager's ban. Independent accounts sharing an email are unaffected.
- Bans reject new logins after checking credentials and all authenticated API use. Existing sessions are revoked. Banned seller listings are hidden and new orders are rejected. Stored revocation hashes can return only a reason/end-time notice for the original session lifetime; they cannot authenticate. Restricted users see their reasons, and direct API calls are enforced before feature handlers.
- Proposals are immutable, expire after 24 hours, and invalidate when founder membership, relevant policy or deletion data changes. Duplicate votes and another founder's key are rejected. All admins see votes/names in **Accounts** and **Shared approvals**.
- Deletion previews cascade owned housing, staff, activated room identities, markets, orders, messages, reviews, media and related operational records. Unrelated primary accounts and founders survive. Shared media is preserved. Execution uses the existing verified encrypted recovery archive and crash marker; commit/cleanup failures block further writes. Minimal governance history and the private recovery archive remain for accountability/recovery.

This implementation enforces policy against the current single-writer JSON backend. Supabase is currently used for signup email verification; its verification-only Auth identity is not removed by the JSON deletion operation. During database/Auth migration, retain these API policies and implement transactional PostgreSQL cascades, RLS and server-only Supabase Auth deletion. Do not treat a browser request or Supabase dashboard access as approval.

Verification: `npm run test:moderation`, `npm run test:moderation:browser`, `npm run lint`, `npm run build`. All destructive tests use temporary stores and disposable identities.

Verified 2026-10-04: policy/unit tests, real API quorum and negative cases, existing governance/pricing/session/appearance regressions, restart persistence, scoped/cached-record deletion, and real desktop/mobile proposal/approval/final-apply and ban/restriction notices. TypeScript and production build passed; the existing bundle-size warning remains. Private-data checks passed. No operational account was banned or deleted for testing.
