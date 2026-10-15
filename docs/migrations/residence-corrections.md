# Residence setup corrections

An administrator could request more information about a residence, but the manager
had no correction action and the API rejected every changed submission. The manager
dashboard now opens the saved four-step registration and displays the review notes.
The existing registration endpoint accepts corrections only for `more_info_required`.
This uses the existing case, hierarchy and private audit tables; no migration is needed.

Authority still comes from the live manager session, current assignment and the saved
applicant. The physically inspected name/map pin, active registration restrictions and
owned photographs are rechecked. Final approval/rejection cannot be reopened by this
path. Unchanged corrections are rejected; exact retries after resubmission are idempotent.

Contact/photo corrections keep the hierarchy identities. Before any operational use,
an unused layout may be replaced with fresh block/floor/room/bed identities. Existing
activation keys (including revoked keys), allocations, room enrollments, staff or
maintenance history block layout replacement. Historical reference IDs are retained.
The saved hierarchy must match the prior submission before a correction is accepted.

Resubmission atomically saves details, returns the same case to `under_review`, clears
its current review result, notifies the primary owner and administrators, and archives
the previous submission, review notes, reviewer and timestamps in private audit history.
The residence and its photographs stay unpublished until normal approval succeeds.

Verification on 14 October 2026: 94 isolated manager/residence assertions, zero native
security advisor findings, 19 real guest/cross-site HTTP assertions and the Supabase
frontend/API/both worker builds passed. The isolated flow uses unchanged genuine
archived Google subjects and the user-authorized fictional development property.
No cloud property, provider reply or mailbox is fabricated. Genuine work-email and
positive manager browser acceptance remain pending.
The genuine administrator read/UI verifier passed 16 checks after migration 68.
The initial manager-role browser denial run timed out waiting for Chromium approval;
a later run passed four genuine administrator checks. The subsequent directory UI
attempt timed out before checks. See [admin review integration](admin-residence-review.md)
for the latest 102 native/43 HTTP results and the browser evidence limits.

Commands:

```sh
node --import tsx scripts/verify-supabase-manager-residence-setup.ts a9319d64-ecdb-4369-a60d-63b7e18ba479 c0857019-ed75-49ec-8af8-259763368f4f
node --import tsx scripts/verify-supabase-residence-corrections-http.ts
node scripts/verify-supabase-residence-corrections-browser.cjs
```

Private evidence is under `.security/migration-reset/`: `manager-residence-setup-native.json`,
`manager-residence-setup-advisors.json`, `residence-corrections-http.json`, and the
dated browser acceptance directory. JSON/default backend and destructive gates remain unchanged.
