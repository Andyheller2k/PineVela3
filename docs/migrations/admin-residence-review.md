# Administrator residence setup review

The native API supported requesting more information, but the admin screen offered
only direct approval/rejection. Supabase review actions now open one dedicated
dialog from the residence directory or its pending alerts. It reloads the actual
private roster and shows street/map details, contacts, uploaded photographs,
configured capacity and saved review feedback. No sample residence or contact is
substituted when information is absent.

The administrator explicitly chooses Approve, Reject or Request corrections. The
existing case-specific routes save the decision; corrections/rejection require
feedback. Missing/expired authentication cannot produce an optimistic success.
Saving blocks duplicate submissions and closing; a timed-out request requires
reloading its saved state rather than automatically replaying a mutation. The
existing manager correction/resubmission path remains the next step after feedback.

Status filters use the saved residence-registration case, separately from manager
approval and catalog visibility. Unsubmitted shells, final rejections, closed and
withdrawn reviews do not count as pending. Approved properties can be unpublished
without appearing live or awaiting a new review. The directory exposes actual
Hostel/Inn/Hotel/Estate categories, a rejected filter and the server-derived manager
status; missing photos/contacts are not replaced with invented product data.

The private roster adds existing case identifiers, feedback and actual property
fields. Its explicit authorized-read wrapper retains subject/session/context,
administrator, platform and policy checks while using the shared settings read lock.
No table, policy, grant, release gate or migration was changed. Final decision,
physical inspection, media ownership, restriction and publication checks stay in
the existing server workflow.

Verification on 14 October 2026:

- 102 isolated manager/residence assertions and zero native security advisor findings.
  Cases include actual saved review metadata and state transitions through correction,
  rejection, approval and suspended-manager publication.
- 43 real guest/cross-site HTTP checks, including all three review routes and private
  roster denial; no live product fixtures or mutations.
- The later genuine signed-in administrator retry passed 10 checks, including
  manager-only route and captured-account denials, plus the actual empty directory
  at 1440px and 375px. No populated-review browser acceptance is claimed.
- Full project TypeScript, a final focused check with the normal Vite declarations,
  Supabase frontend/API/both worker builds, final frontend rebuild and 23 source-audit
  checks passed. Inventory remains 226 total / 178 replacement matches / 14 retired /
  34 unmatched legacy contracts; 97 replacement modules reach no JSON persistence.

The isolated fixture uses unchanged genuine archived Google identities and the
user-authorized fictional property, never fake provider replies or cloud accounts.
Genuine manager work-email, positive manager browser and populated admin-review
acceptance remain pending. JSON/default backend remains unchanged; migration count
is 68. See [the continuation checkpoint](../../SUPABASE_CONTINUATION.md).
