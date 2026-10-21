# Content reports and administrator review

Signed-in accounts can report a visible store or item, a buyer/seller profile
connected to a visible store or their own purchase/conversation, or a message in
their own buyer–seller conversation. Historical purchased items and stores remain
reportable after they leave the public catalogue. Private account IDs supplied by
a browser never grant access to an unrelated profile or conversation.

Reasons cover fake or broken items, false names, identity or location, scams,
harassment, unsafe content, and other concerns. The server derives reporter name,
account and registered email from the actual authenticated identity. A report
creates a normal support case, so public replies, email delivery, notifications,
assignment, priority, follow-ups and customer-service history use the existing
support workflow. Signed-out visitors can still submit general complaints in
Help; entity reports require sign-in so target visibility can be checked.

## Selected-message disclosure

Reporting a message requires explicit consent to disclose that selected message
to customer service and administrators. For encrypted messages the client shares
only that message's random AES key. The server reads the original immutable
ciphertext and participant/request binding, authenticates and decrypts it, then
retains the exact encrypted snapshot and selected text in an operator-only table.
The supplied key is never stored. Recovery phrases, private identity keys and
keys for other messages are never submitted. A client-supplied plaintext field
is rejected. Unencrypted historical messages use their actual stored text.
Migration `20261017211608_report_evidence_utf8_bytes.sql` preserves selected text
as UTF-8 bytes, including NUL characters, and converts existing evidence without
changing it. Only authorized operator responses decode those bytes for display.

Evidence can accompany a store/item/profile report only when the actual message
belongs to that same store or involves that profile, and the reporter was an
original participant. Evidence, review recommendations and administrator notes
are hidden from the reported account and other users. The reporter can see their
own report status and support replies; they cannot read private review notes.

## Review and sanctions

Active invited customer-service members review cases and submit one immutable
recommendation: no action, warning, ban, restrict, restore, account deletion, or
item removal. These are recommendations only. They notify active administrators
and never change an account, listing, store, restriction or session.

An administrator must supply their own separate approval key to dismiss a report
or escalate it into the appropriate governance workflow. An optional account
proposal link is accepted only when its stored target, action, kind and live
status match this report's recommendation. Escalation records that review is
needed; it does not represent an applied sanction. Public support replies can
explain the outcome without disclosing private review notes or other reporters.

Actual bans, restrictions and restoration continue through existing account
approvals: five independently enrolled administrators and the founder's final
decision. This feature introduces no shortcut to policy application. Deletion and
item removal remain subject to separate reviewed dependencies, recovery evidence,
quorum and final consent; no report endpoint deletes records or automatically
unpublishes an item. Unsupported direct deletion remains unavailable.

Reports, selected evidence, recommendations, administrator decisions and events
are retained and immutable. Their account/case foreign keys are deliberate
retention dependencies. A future destructive workflow must explicitly inventory
and back up these records before it can offer a reviewed cleanup; existing wipe
plans must not silently delete or omit this history.

## Storage and controls

Migration `20261017210629_reported_content_review.sql` creates five private tables,
all with RLS enabled. Browser and catalogue roles receive no table access. The
scoped backend role has SELECT only, limited to own reports or active support
operators; selected evidence and review tables are operator-only. Writes run in
server transactions that revalidate the live native session, role, profile
context and approval key where required. Request keys prevent duplicate report
creation and recommendations; changed retries and stale versions return 409.
Per-account and support rate limits protect submission/review endpoints.

The customer-service and administrator report lists paginate 25 cases at a time,
prioritizing reports awaiting review. Older cases remain retained and accessible
through report pagination and their existing support case link. There is no generic chat, staff hiring,
public staff review, or automatic sanction introduced by this feature.

## Verification — 17 October 2026

The isolated native Supabase run passed 69 reporting security/API checks,
including unauthorized accounts, forged ownership, unrelated evidence, wrong
message keys, immutable records, RLS and recommendation/approval boundaries.
Fourteen browser checks used genuine sign-ins to submit and track a report,
record a customer-service recommendation and save a keyed administrator
assessment. No sanctions or hosted customer records were changed by those tests.

Migrations 71–73 passed a transactional dry run and were applied to the configured
project. `npm run db:verify-report-encryption` then confirmed all 73 source
digests, six new private RLS tables, no browser write grants, seven immutable
guards and unauthenticated API denial. This installation check is read-only.
The local Supabase security advisor returned no findings.
