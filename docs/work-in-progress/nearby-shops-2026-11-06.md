# Continuation — 6 November 2026

The current cumulative release is `pinevela-nearby-shops-20261106`. It is
deployed to pinevela.app. A new host rollback archive was created before
extraction at `/home/jqmgxgpuym/pinevela-before-nearby-shops-20261106.zip`
(48,917,920 bytes). Seven hosted file hashes, public index/main-script hashes,
the native Node restart response and health all passed. No SQL, dependencies,
environment changes or sender-file replacement was needed.

Nearby now searches the guarded public shop projection, including goods-only,
empty and flexible-service shops. Exact saved pins retain directions. Address-only
shops receive explicitly approximate areas from a bounded, rate-limited Photon
lookup. No visitor GPS goes to this lookup. The live PineVela Store at Bomso
returned its approximate area successfully. Chrome's actual map showed the shop
marker and 24 loaded map tiles. The user continued navigating that Chrome tab;
their subsequent route changes were left alone. Manager/resident appearance was
verified with local role fixtures, not by logging into their live accounts.

The location-pin shortcut is always visible in desktop/mobile marketplace
categories. The manager room-key header wraps its buttons and real count. The
resident/seller selected side-tab highlight is a centered circle; the raised
central plus remains intact. All 32 browser scenarios, 17 unit checks and 17
real isolated PostgreSQL/HTTP checks passed. Prior verified Auth source hashes
are unchanged. TypeScript, web/backend build, mobile sync and debug APK build
passed. The package scan found no private credentials.

Artifacts are stored permanently under `releases/web/` and `releases/android/`,
with a copy of the ZIP under `/tmp/`. Evidence is under
`docs/verification/nearby-shops-2026-11-06/`; installation and native smoke checks
are recorded separately. The APK was installed with `adb install -r`, with
data/auth retained. Android declares foreground coarse/fine location only.

The first emulator run used software graphics and encountered Android launcher,
System UI and permission-controller stalls. The first map DOM check passed but
its screenshot was obscured; it is explicitly retained as a preliminary result.
The emulator was then closed cleanly and reopened with its normal saved graphics
configuration. Do not clear app/AVD data or remove the older releases. The PC
must remain awake, and the emulator should remain running for the returned user.

Final native result: normal hardware-graphics reopen retained the exact current
APK. The actual bundled Android WebView searched the live PineVela Store, loaded
six map tiles and showed its approximate Bomso area, with no overflow, runtime
exception or covering system dialog. The map worked before a device location fix
was available. Its previous screen was restored; no account form was submitted.
Foreground location permission was observed granted afterward; the verifier did
not issue a grant command. Temporary denial flags were cleared so future device
permission choices remain usable. Moving-device GPS remains unverified.

Physical moving-device navigation, genuine cloud room activation/PIN reset,
iOS builds and store publication were not performed. The preceding SQL updates
remain applied. Use the current verification reports for the final native result.
