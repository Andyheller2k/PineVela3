# Verified email primary re-entry

Migration `20261013112009_verified_primary_email_reentry.sql` extends the retained
primary lifecycle from migration 61. A confirmed email identity or verified Google
mailbox can use an explicitly requested Supabase email OTP/unopened sign-in link to
reopen its own primary portal after a completed normal-wipe closure. It does not
create a replacement Auth identity or import a disposable account without a saved
primary portal. Ordinary login and password recovery still cannot reopen it.

The public request takes only an email delivery selector and returns a generic
acknowledgement. Mail is requested only for an eligible closed primary, using
`create_user:false`. IP, mailbox and global request budgets bound the flow. The
verification endpoint accepts only the code/link and email; foreign URLs, duplicate
proof parameters, recovery/signup/invitation links and client identity/role selectors
are rejected. It never navigates to a submitted URL.

Supabase `/verify` and `/user` supply the authenticated subject and native session;
no body-supplied subject, context or token is trusted. The binding transaction
reopens only that subject's original primary portal and selects `primary` explicitly,
then issues the normal HttpOnly cookies. Failure ends only the new proof session and
does not overwrite the browser's current cookies. Closed subaccounts, residences,
stores, historical privilege and revoked bindings are not restored.

Native admission requires a completed exact closure, original primary/profile
ownership, a confirmed native Auth mailbox/provider identity, a live same-subject
session, platform availability, retained account bans and session invalidation
epochs. The immutable receipt records its Google or email proof method and must
match the server's verified-flow marker. Both methods serialize by Auth subject;
concurrent attempts create one receipt, notice and audit event. Notification failure
rolls back re-entry and any application binding in the same transaction.

The private eligibility helper is an invoker function with no browser/backend
execute grants. Existing private receipt RLS and grants remain. No new public view,
table grant or SECURITY DEFINER function is introduced. The guarded primary-only
closure core can recognize supported confirmed email identities; general operational
wipe execution remains disabled and has no newly mounted execution entry.

The login/signup page exposes **Reopen primary account with email**. Its modal has
an explicit send step, verified mailbox, private code/link field, progress/disable
state and retry controls. Successful re-entry resumes the existing public
continuation or opens the primary dashboard. It does not change the identity's
password or any independent portal PIN.

Verification:

```sh
npm run db:verify-primary-email-reentry -- <genuine-auth-backup> <migration-27-backup>
node --import tsx scripts/verify-supabase-primary-email-reentry-http.ts
node scripts/verify-supabase-primary-email-reentry-browser.cjs
node scripts/verify-supabase-primary-email-reentry-guest-browser.cjs
```

Native verification uses real archived Google subjects with confirmed mailboxes and
native sessions, an isolated PostgreSQL restore and actual encrypted database/
Storage recovery. It exercises the post-provider lifecycle and does not fabricate
Auth users, email identities, provider replies or verification timestamps. Actual
email-only identity delivery/OTP and positive closed-account browser acceptance
remain separate cutover checks. Do not close a real account just for testing.
