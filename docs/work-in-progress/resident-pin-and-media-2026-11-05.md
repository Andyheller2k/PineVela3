# Continuation — 5 November 2026

Superseded by [the 6 November Nearby/UI continuation](nearby-shops-2026-11-06.md)
and `releases/README-LATEST.md`. The checkpoint below is retained as history.

The latest cumulative update is **unified room login**. It is deployed to
pinevela.app and installed over the emulator app without clearing data. The
shared field is labelled Password, with no resident-method selector. Active
room cards show primary email → room PIN in Password → Login, and Reset room PIN.
Settings links to that card through Manage active room. Recovery requires an
active allocation; interrupted/unallocated setup can choose a new PIN only with
verified primary ownership and a valid available room key.

Current artifacts and verification are linked in `releases/README-LATEST.md` and
`docs/unified-room-login-2026-11-05.md`. 110 isolated real GoTrue/PostgreSQL/HTTP
checks, 36 browser scenarios, 42 unit checks, builds, seven host file hashes,
Node restart/health, live login DOM and native bundled login readback passed.
No new SQL/dependencies/environment/private files were required. No real room
was claimed or PIN reset by tests. The emulator is running; the returned user's
PC remains awake. The emulator System UI stalled on boot; selecting Wait restored
it, and the installed app's login then passed without a method selector or overflow.

Earlier checkpoint:

The cumulative resident PIN/media/navigation build and notification settings
cleanup are deployed to pinevela.app. The shared panel now has only Enable/Save
and category choices. A host rollback ZIP was created before extraction; seven
file hashes, the public index/main script and signed-in settings were verified.
The native Node restart request returned HTTP 200 and health passed afterward.
The two Supabase migrations remain applied; this UI cleanup required no new SQL.

The updated development APK is installed over the emulator's existing app with
its data preserved. The emulator is left running for the returned user. No new
PC sleep was scheduled. Earlier ZIP/APK releases remain unchanged.

Use [the current guide](../notification-settings-cleanup-2026-11-05.md),
`../verification/notification-settings-cleanup-2026-11-05/summary.json`, and
`../verification/notification-settings-cleanup-2026-11-05/hosting-application.json`.
The previous Chrome approval blocker is resolved. No further hosting extraction
is needed for this release. No alert preferences were clicked or test messages
sent during the live readback.

The preceding 88 isolated GoTrue/PostgreSQL/HTTP checks established resident PIN
authorization and compatibility; current browser checks passed 51 scenarios.
A genuine new resident's full cloud activation still requires the owner's normal
use of an available room key. Tests did not claim a real room or create a cloud
account. No iOS build or Play Store release was made.
