# Manager dashboard and residence contact update — 3 November 2026

## Behavior

The manager dashboard takes its property only from the authenticated
`/api/manager/my-hostel` response. Maintenance, staff, invitations, board,
activity and room-key reads can fail independently; the portal still opens and
identifies unavailable sections with a retry control. Authentication or property
authorization failures remain fatal. The later manager-query timeout fix changes
the refresh interval to 60 seconds; see [manager dashboard database timeout](manager-dashboard-db-timeout-2026-11-04.md).

Residence registration now requires an explicit **public manager contact name**.
The server saves this on the residence before administrator review, distinct
from the manager's login profile. For already approved residences with no public
manager name, public cards and details show the published property email or phone.
Adding a manager name to one of those residences still uses the existing keyed
manager change request and administrator approval flow. The change editor leaves
an unset public name empty so a manager can submit their chosen name for review,
even when it matches their private profile display name.

## Diagnosis and verification

- The live public catalog returned the approved Pine Vela Premium residence with
  an empty manager contact name and an available property contact.
- A read-only database check confirmed its assigned manager and approved review.
  The SQL behind the manager property, structure and seven secondary datasets
  completed. No live app session was available to reproduce an authenticated
  browser request, so the exact failing HTTP endpoint remains unconfirmed.
- Focused tests cover property loading when a secondary read fails, fail-closed
  authentication, filtering foreign issue reports, public contact fallback, and
  the required registration name.
- Type check, focused tests, web build, mobile build, debug APK build, and all
  33 mobile tests passed. Packaging checks match every mobile asset to the APK.

## Install and rollback

Back up `pinevela-app/dist-supabase` and `pinevela-app/dist-supabase-backend`.
Extract the web ZIP into `pinevela-app`, replacing those two folders, then
restart the existing Node app and reload the site. No SQL migration is needed.
Install the matching debug APK over the PineVela Development app for Android
testing. To roll back, restore the two backed-up hosting folders and restart;
reinstall the prior APK if needed. This package does not change the existing
approved residence's contact-name field in the database.
