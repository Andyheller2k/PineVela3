# Pixel emulator replacement — 29 October 2026

The verified replacement is **PineVela_Pixel_4a_API_36**, running Android 16
(API 36) with Google's official Pixel 4a bezel and camera-cutout skin.

In VS Code, run **Emulator** from the Command Palette and select
**PineVela_Pixel_4a_API_36**. Existing emulator path and boot arguments already
work; no shared or user VS Code setting was changed for this replacement.

## Configuration

- Android Emulator 37.2.12 with official Google APIs x86_64 API 36 image, revision 7.
- Full 1080×2340 phone display at 440dpi (about 393 CSS pixels wide), preserving
  real phone proportions. The desktop window fits the monitor; the app's
  viewport was not reduced to a generic 720×1280 screen.
- Two cores and 2,560 MiB guest RAM, confirmed in generated hardware settings and
  the running guest. Host GPU acceleration is active. Camera and audio are off.
- The official skin is pinned to Android source commit
  `1973633cdd28b2d607aadcf769f578743dc1f6f4`; each source blob/hash was verified.
- The official image ZIP passed Google's published SHA-1 and a recorded SHA-256:
  `b1bb0769d0bed7698e61f203d7dc9bf6e7c37cd01a39d0d8788a11186bc78160`.
  Google's SDK installer registered the package; no package or license metadata
  was fabricated. Completed download fragments were removed, keeping the
  verified ZIP.

## Verification

The device completed its fresh first boot in 96.6 seconds. Its bundled WebView
is 133.0.6943.137, newer than the old AOSP device's 124 and above the app's 111
minimum. The existing Step 2 preview APK installed and cold-launched twice.

All five installed-APK smoke scenarios passed using real Android touches and
WebView inspection: login/native bridge, signup transition and disabled protected
account actions, theme changes, local policy links, and offline reload. These
scenarios observed no API/external WebView requests, service workers or uncaught
JavaScript exceptions. The final app process had no Android fatal exception.

The physical phone frame and camera cutout were inspected in the actual
emulator window, captured directly without other desktop windows. See
[the phone-frame screenshot](verification/android-pixel-2026-10-29/pixel-phone-frame.png)
and [verification JSON](verification/android-pixel-2026-10-29/replacement-verified.json).

This acceptance check used the Step 2 development APK; Step 3 authentication is
tested separately by the root task. It is not a physical-phone performance
benchmark. Local cold activity timings were 7.625 s and 13.760 s under development
load. About 1.7 GB host RAM and 1.3 GB swap remained available after testing; compile
before starting the emulator when possible.

## Why Android 16 was selected

Android 17/API 37 was installed and tested first. It booted with WebView 145, but
its emulator forcibly increased the requested 2.5 GB RAM to 4 GB. The host's swap
filled completely and APK installation became slow. That trial was rejected
for daily use on this 8 GB computer. Android 16 retains the supported 2.5 GB minimum
and matches the app's compile/target API 36.

The failed API 37 trial AVD and its unreferenced system image were removed with
official tools, along with only that trial's own cached ZIP. See
[rejection evidence](verification/android-pixel-2026-10-29/api37-candidate-rejected.json).

## Old-device boundary

The old **PineVela_Lite_API_35** process was stopped before testing the new device.
After review of the replacement screenshots and passing results, the root task
removed only that old AVD with the official `avdmanager delete avd` command.
The shared API 35 system image was retained.
The existing user **Pixel_4a.ini** was byte-preserved. It points to an already
missing API 30 AVD directory and was not overwritten or deleted.

The replacement was stopped after the baseline checks and restarted for Step 3.
The temporary WebView debug forward used for the baseline tests was removed.

References: [Android AVDs and skins](https://developer.android.com/studio/run/managing-avds),
[Android 16 setup](https://developer.android.com/about/versions/16/get),
[official Google system-image metadata](https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-5.xml),
[official Pixel 4a skin source](https://android.googlesource.com/platform/tools/adt/idea/+/1973633cdd28b2d607aadcf769f578743dc1f6f4/artwork/resources/device-art-resources/pixel_4a/).
