# Android emulator and VS Code — 29 October 2026

Installed and boot-verified on this computer. PineVela's Android project/APK is
still the next conversion step; this check verified the emulator's Android OS.

## Installed setup

| Item | Verified value |
| --- | --- |
| Emulator | Google Android Emulator 37.2.12, stable Linux x64 |
| System image | AOSP Android 15 / API 35, default x86_64, revision 2 |
| Device | `PineVela_Lite_API_35` (displayed as PineVela Lite API 35) |
| Guest RAM | 2560 MB / 2.5 GB |
| CPU | 2 cores |
| Display | 720 × 1280, density 320 |
| Acceleration | KVM and host Intel HD Graphics 620 |
| Keyboard | Physical keyboard enabled and detected by Android |
| Extras | Audio, cameras and device frame disabled |
| VS Code extension | Android iOS Emulator, `DiemasMichiels.emulate` 1.9.0 |

The initial 1536 MB request was raised automatically to 2560 MB by the official
emulator. This is its supported normal-mode minimum for API 34–36, so both the
AVD and VS Code launcher now use the actual 2560 MB value. Android also initialized
a 6 GiB sparse userdata capacity; the whole AVD allocated about 1.8 GiB after the
boot tests. Virtual capacity is not the same as allocated disk space.

The AOSP image omits Google Play services and the Play Store. Google-specific
workflows, including Play services-dependent notifications, need a suitable
physical device or Google-enabled image later. This image remains suitable for
initial native shell, UI and API testing. API 36-specific behavior also needs
separate coverage before release.

## Start from VS Code

1. Open the PineVela3 project in VS Code.
2. Press **Ctrl+Shift+P**, enter **Emulator**, and select that command.
3. Choose **View Android emulators** → **PineVela Lite API 35**.

**Ctrl+Alt+E** opens the same launcher. It opens a separate Android emulator
window. If the newly installed command is not visible, run **Developer: Reload
Window** once, then try again. Close the emulator window when finished to free
its RAM; its Quick Boot snapshot is retained for the next launch.

Workspace configuration is in `.vscode/settings.json`; the extension recommendation
is in `.vscode/extensions.json`. The existing Chromium external-browser setting
was preserved. The launcher uses:

```text
/home/wyse/Android/Sdk/emulator/emulator
-cores 2 -memory 2560 -gpu auto -no-boot-anim -no-audio -camera-front none -camera-back none
```

Path fix after the first VS Code launch: the extension displayed its default
macOS path because the project settings were absent from its effective configuration.
Both `emulator.emulatorPath` and `emulator.emulatorPathLinux` are now also saved
in Linux User settings at `~/.config/Code/User/settings.json`, together with the
same lightweight launch arguments. This covers windows outside the project and
the generic fallback. Run **Developer: Reload Window**, then open **Emulator**
again. The installed emulator's actual `-list-avds` command succeeds.

## Verification

- Both downloaded archives matched Google's repository sizes and SHA-1 checksums;
  independently computed SHA-256 values are in the verification JSON.
- Google's SDK Manager installed the packages and generated their package metadata.
- `emulator -list-avds` lists the new device; `-accel-check` confirms usable KVM.
- The first cold boot completed in 56.2 seconds; a subsequent boot completed in
  18.3 seconds on this machine. These are OS boot measurements, not app performance.
- ADB reported Android 15 / API 35, x86_64, two online CPUs and the expected display.
- The awake, unlocked launcher rendered correctly; the alphabetic keyboard was
  detected. The [home-screen screenshot](verification/android-emulator-2026-10-29/android-home.png)
  was visually inspected.
- Android's active WebView is 124.0.6367.219, above Tailwind 4's Chromium 111 floor.
- The installed extension's command, activation event and launcher implementation
  match the configured SDK path and arguments. The VS Code menu interaction itself
  was not automated; the configured emulator command was boot-tested directly.
- The test emulator exited cleanly and is stopped to free RAM. Application source,
  dependencies, hosted settings and database were not changed by emulator setup.

The initial restricted shell hid `/dev/kvm`. A host-level check and actual boot
confirmed it is available and usable; no KVM installation or permission change
was necessary. No heavy Android Studio installation was needed.

Only the temporary range fragments created for these two downloads were removed
after verification. The verified archive cache, installed SDK and AVD remain.

## References

- [Extension publisher and source](https://github.com/DiemasMichiels/emulator)
- [Android emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration)
- [Android emulator command line](https://developer.android.com/studio/run/emulator-commandline)
- [Official emulator RAM policy](https://android.googlesource.com/platform/external/qemu/+/emu-main-dev/android/android-emu/android/main-common.c)
- [Tailwind browser compatibility](https://tailwindcss.com/docs/compatibility)
