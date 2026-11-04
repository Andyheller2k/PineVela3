# Manager dashboard database timeout — 4 November 2026

## Diagnosis

In the live Brave manager session, login returned HTTP 200. The protected
`/api/manager/my-hostel` read returned HTTP 503 after about 30–105 seconds,
while other account reads succeeded. PostgreSQL activity showed concurrent
room-structure queries running for over a minute. The registered residence has
3 blocks, 25 floors, 200 rooms and 220 beds. Nested room/bed RLS checks make
that summary read too slow in the manager's scoped database role. Client-side
automatic retries started more copies while earlier queries were still active.

## Change

The endpoint first fetches the assigned residence through the manager's live
session and RLS role. It then reads the detailed structure using the existing
server-authorized read path, which rechecks the live session, manager role and
active assignment for that exact residence. RLS policies and direct client
access are unchanged. The dashboard stops automatically retrying this critical
request and refreshes once per minute while visible; its Retry button remains.

## Verification

The two-stage read completed with the current live manager session in about
3 seconds, returning the correct 3 blocks, 200 rooms and 220 beds. Local route
tests cover the positive read, no RLS-visible residence, and assignment loss
before the structure read. After the hosting ZIP was installed, the live route
returned HTTP 200 in about 3.3 seconds on first load and 3.4 seconds on its
next scheduled refresh. The manager dashboard rendered without a retry screen
or loading skeleton.

## Install and rollback

Back up `pinevela-app/dist-supabase` and `dist-supabase-backend`. Extract the
web ZIP into `pinevela-app` and restart the existing Node app. No SQL migration
is needed. Install the matching debug APK over PineVela Development for Android
testing. To roll back, restore the two hosting folders and restart, then
reinstall the previous APK if needed.
