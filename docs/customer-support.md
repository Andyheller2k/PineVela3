# FAQ and customer support

`/faq` contains searchable answers based on the marketplace and housing flows.
Public entries use the fixed navy/yellow appearance; product entries preserve
the user's theme across FAQ and Help navigation. `/help` accepts questions,
complaints and reports; public entry points keep that appearance, while product
entry points preserve the product theme. `Help` is available in portal headers,
desktop navigation and settings, and on the public landing and login pages.

Signed-in requests use the current server-verified context, display name and
verified Auth email. The request API rejects identity/ownership fields. Each
account sees its own requests, including after signing out and back in. Public
requests are explicitly unverified contacts. A guest must save the case UUID and
32-byte private access code; neither a name nor an email unlocks a conversation.
The server stores only the code's SHA-256 digest. Guest codes never go in URLs,
browser storage, notifications, logs or emails. Losing both tracking details
requires a new request and separate ownership checks by customer service.

Support cases are separate from buyer/seller messaging and residence maintenance
work orders. They do not create chat channels, staff recruitment, account access,
room allocations, payments, or maintenance dispatches. In particular, room repair
reports should still be submitted in the activated resident maintenance page.

## Customer-service invitations

An administrator opens **Settings → Customer-service team**, enrolls their
existing separate approval key if necessary, and supplies the recipient's name
and separate email. The current approval key authorizes issuing or cancelling an
invitation and suspending/restoring a team member. The complete invitation link
is shown once for the administrator to share. It expires after 24 hours.

The recipient follows `/support-invitation?token=…`, uses the existing verified
email/password or Google signup/sign-in, and accepts with the exact invited
email's primary account. Existing unrelated operational identities are rejected.
The invitation is tied to its issuing administrator's active membership and key
version; cancelling it or rotating that key invalidates unaccepted links.
Acceptance is atomic, single use and creates a revocable private support
membership. It grants no administrator/manager role. Replaying an accepted link
cannot restore suspended access. Password and Google sign-in subsequently open
`/customer-service` for that primary identity.

## Case handling

The workspace includes search by reference, subject, name, email and account ID;
topic/status filters; pagination; assignment to active team members; normal/high
priority; requester replies; internal notes; and open, in-progress,
awaiting-requester, resolved and closed states. Requesters can reopen their own
resolved/closed requests. Version checks reject conflicting changes. Submission
and reply keys prevent duplicate writes when the exact operation is retried.

Only active invited customer-service members and active administrators can read
the queue or manage other people's cases. Every operation rechecks the genuine
native Auth session, current context and current membership. Requester responses
never include internal notes or email-outbox details. Direct browser table writes
are revoked; private tables have RLS and account-scoped read policies as a second
boundary. Support membership creation has a database trigger that checks the
live, verified invitation, current subject and email. Lifecycle entries are
recorded in the private case event history; privileged invitation/access changes
are recorded in the existing private audit history.

## Reply notifications and email

Public replies atomically save the message, enqueue its email and create an
in-app notification for the case's exact requester context. Internal notes do
neither. Notifications link back to the conversation and appear in seller feeds
as well as other portal feeds. Guests receive no account notifications.

Configure these **server-only** variables to enable live delivery:

```
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Use a Resend sending key and a plain sender address at a verified sending domain.
Supabase Auth's verification/password-recovery SMTP is configured separately;
this feature does not replace it. Neither credential belongs in Vite variables.
See [Resend's sending API](https://resend.com/docs/api-reference/emails/send-email)
and [domain verification](https://resend.com/docs/dashboard/domains/introduction).

The server leases queued rows without holding a transaction during the provider
call. Resend requests carry a stable message idempotency key. Failed delivery is
retried with backoff, at most eight attempts, and the customer-service UI offers a
manual retry after exhaustion. `sent` means the provider accepted the email,
not that the recipient read it. Unconfigured delivery leaves mail queued and
shows an explicit status in the workspace. Restarting the server retains queued
work. Provider callbacks/bounce tracking and email-to-case replies are not
implemented; follow-ups are submitted through Help.

For isolated real-mail tests only, non-production servers accept
`SUPPORT_MAILPIT_URL=http://127.0.0.1:<actual-mailpit-port>` and use Mailpit's actual
sending API. Production never enables this local provider.

## Migration and verification

Returning from FAQ/Help to a primary or seller dashboard reuses its last complete,
successful server snapshot and immediately refreshes in the background. Snapshots
live only in the existing memory query cache for up to ten minutes, scoped by
portal, account context and login generation. Logout clears the cache; a new
login or late response from an older session cannot reuse it. Initial visits
and expired snapshots retain their loading state and server authorization.

After building, run `node scripts/verify-supabase-support-return-browser.cjs
<private-runtime.json>` against an owned support preview for real account,
theme, navigation and session-isolation checks. API reads are delayed rather
than replaced during the warm-return verification.

Verified on 2026-10-17: the support-return browser check passed 70 assertions
with four real native logins, primary/seller returns, light/dark themes and
375/1440-pixel widths. Logout, a different account and a new login of the same
account required fresh server data. Snapshot isolation/expiry tests, focused
theme/refresh/session tests, TypeScript and the production build also passed.

Migration `20261017133104_customer_support_tickets.sql` adds private invitations,
memberships, tickets, messages, case events and the durable email outbox. Apply
all migrations with the existing migration runner before starting the new
server. It refuses an older schema; no JSON persistence is introduced.

Use `npm run db:local:prepare` with private metadata from an empty, owned local
Supabase stack, then `npm run db:local:support -- <private-metadata.json>` for real
native Auth/API/RLS/email checks. This uses an isolated database and actual email
confirmation, not invented provider responses or sessions. Product accounts and
support cases are never seeded with demonstration content.

`npm run test:support` runs the focused policy, continuation and public-theme
checks. After building, `scripts/serve-supabase-support-preview.ts` can serve that
owned local run; pass its private runtime fixture to
`scripts/verify-supabase-support-browser.cjs` for browser verification.
`npm run db:verify-support` checks the configured project's migration digest,
RLS, table grants and live private routes without creating accounts or cases.

Verified on 2026-10-17: all 70 migrations applied to a fresh native Supabase stack;
69 real Auth/API/RLS/email checks, 24 browser checks at 375/768/1440 pixels, eight
focused unit checks, TypeScript and the production build passed. The configured
project also has migration 70 applied, no pending migrations, and passed the
read-only installation check. No test accounts or cases were added there.
Live Resend delivery still requires the server variables described above; actual
support email sending was verified through the isolated Mailpit service.

Opening Purchases does not mark all order alerts read. New order alerts carry a validated `market_order_id`, appear with their actual title/message on the linked order card and use the shared viewport tracker (including hidden-tab and modal coverage checks). Historical alerts without an exact relationship remain in Notifications, where their own visible notice or the explicit read action acknowledges them.
