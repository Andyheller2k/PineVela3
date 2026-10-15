# Manager application corrections

This round originally kept organization-email-only enrollment. The user's later
14 October instruction defers mailbox/domain setup and permits the separate local
Google manager development flow in migration 69. Ordinary production/email enrollment
still rejects personal providers. See [the latest policy and evidence](google-manager-development-enrollment.md).
No fictional live property or invented mailbox/provider response is used.

Previously, an administrator could set `more_info_required`, but the primary owner
had no correction form and changed submissions returned a conflict. The owner now
opens the saved application and feedback from registration status, edits its
street/map/property details and resubmits the same case. The verified manager
email, manager identity, primary owner, registration generation and residence
assignment cannot be changed through this form.

The server derives authority from the live primary session and owned verified
enrollment. It rechecks restrictions, current generation, pending manager, exact
inspection shell and active assignment. Final/withdrawn cases, active dispatches,
residence setup and changed retries cannot be overwritten. Unchanged corrections
are rejected; exact successful retries do not duplicate notifications. Captured
account headers prevent silently applying a request under another active account.
Correction and inspection decisions serialize on the saved manager relationship.

Resubmission requires a fresh physical dispatch and submitted report before
approval. Earlier reports remain rejected and retain their contents and property
target. New dispatches snapshot their property in private audit events; older
dispatches without snapshots receive a preservation event before correction,
without rewriting old audit entries. The previous submission and administrator
feedback are retained. Status, audit and primary/admin notices commit together.
Manager login remains locked until approval.

Administrators now have Request corrections with required feedback. Pending counts
include inspection/review/correction states. Saved case state and the actual active
dispatch take precedence over closed inspection history. Native decisions require
a confirmed successful response; no alias retry or optimistic approval follows an
authentication failure. The primary form supports saved-state reload after an
uncertain response and blocks duplicate submission and edits while saving.

The Supabase administrator approval dialog identifies the saved property and manager.
It accepts decision notes and requires at least five trimmed characters when the
officer did not recommend approval, matching the existing native server rule. The
request captures the administrator context and prevents concurrent decisions. A
timeout, interrupted reply or server error requires a saved-state refresh; the UI
does not automatically replay the decision. Account changes discard the dialog.

Verification:

- 139 isolated native manager/residence checks, including ownership, restrictions,
  stale account context, dispatch ordering, idempotency, historical snapshots,
  fresh inspection, current-report selection and primary notifications; zero native
  security-advisor findings. Genuine archived Auth rows remain unchanged.
- Existing manager re-enrollment regression: 47 native checks passed.
- 67 actual guest/invalid-token/cross-site HTTP checks passed with no live product
  changes. Current source audit: 23 checks, no reachable JSON persistence in the
  replacement API/workers; inventory remains 226/178/14/34, 97 replacement modules.
- Focused TypeScript and Supabase frontend/API/both worker builds passed. The real
  administrator browser passed 10 checks: manager role/captured-account denials and
  the empty directory at 1440px and 375px. Built-server startup/public reads/private
  artifact denials passed. No populated manager correction/review browser journey
  is claimed.

The fictional residence exists only inside disposable native restores authorized
for development testing. Positive manager browser acceptance and populated review
remain pending; organization-email delivery is deferred to launch-auth setup. This
correction round needed no migration; its historical count was 68. Default backend selection, JSON data and destructive gates remain
unchanged. See [the continuation checkpoint](../../SUPABASE_CONTINUATION.md).
