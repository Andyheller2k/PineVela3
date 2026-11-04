# Android emulator persistence — 4 November 2026

The existing `PineVela_Pixel_4a_API_36` AVD had an inconsistent `default_boot`
snapshot. A normal reopen reported that the cache device lacked that snapshot.
Immediate VM-close tests also found PineVela's package registry entry retained
while its installed APK code file was unavailable after reopening. These
startup and disk-write failures can explain older or missing app state.
The generated hardware configuration uses the persistent userdata image and
QCOW2; the `<temp>` value in the base configuration was an unresolved default.

Only `fastboot.forceColdBoot` was changed from `no` to `yes` in this AVD's
`config.ini`. The emulator now skips RAM snapshot loading/saving on ordinary
launches and keeps its persistent userdata. Disk paths, partitions, QCOW2
settings, existing snapshots, and lock files were left intact.

Six original configuration/snapshot metadata files are preserved with checksums in
[the recovery backup](verification/mobile-navigation-2026-11-04/avd-recovery-backup/).
The exact change is recorded in
[the repair report](verification/mobile-navigation-2026-11-04/avd-cold-boot-repair.json).

Start it normally from a terminal:

```bash
/home/wyse/Android/Sdk/emulator/emulator -avd PineVela_Pixel_4a_API_36
```

In VS Code, use the existing emulator command and choose
`PineVela_Pixel_4a_API_36`. No VS Code path or extension setting changed. Wait for
the emulator window to finish closing before opening the same AVD again. Cold
boot takes longer than a healthy Quick Boot snapshot.

The development app is `app.pinevela.mobile.debug`. The isolated
`app.pinevela.mobile.transporttest` and
`app.pinevela.mobile.transporttest.test` packages were removed after testing to
avoid duplicate PineVela icons. The verified APK is saved in
[releases/android](../releases/android/pinevela-mobile-navigation-20261104.apk).

The installer uses `adb install -r`. No wipe, logout, or app-data-clear command
was run. The verification waits for PackageManager's delayed settings writes,
drains its pending work, and synchronizes the guest filesystem before closing
the VM. The earlier snapshot error and unavailable APK code are recorded
separately from the update installation and subsequent persistence checks.

The final update passed two ordinary close/reopen cycles after the delayed
writes were flushed. Both reopens retained APK SHA-256
`b4649a2ae5d1a520e13f3ede2ca6004788074f268078363ffd4a7a6e25d9cedd`.
The last bundled welcome screen measured 393 × 778 CSS pixels, with its header
inside the safe viewport and no horizontal overflow. The emulator remains
running. See the [two-reopen report](verification/mobile-navigation-2026-11-04/android/debug-install-quickboot.json).

Android System UI displayed an intermittent “isn't responding” dialog during
these checks. Choosing **Wait** preserved the app; no authentication form was
submitted. The first readiness attempt also selected an empty, unattached
WebView. The harness now selects the attached visible-size document, and the
interrupted check resumed without reinstalling or clearing data. These test
environment interruptions are separate from the successful APK persistence.

References: [Android snapshot settings](https://developer.android.com/studio/run/emulator-snapshots#disable-quick-boot)
and [emulator startup handling](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/android-emu/android/main-common.c).
