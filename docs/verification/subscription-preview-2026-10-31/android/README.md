# Standalone emulator build identity — 2026-10-31

The existing Pixel 4a/API 36 AVD was inspected without clearing app data, uninstalling packages, deleting snapshots/AVDs, rebuilding, or changing app source or global emulator/VS Code settings. No account forms or payments were submitted and no private account fields were inspected.

## Confirmed findings

Before replacement, the correct AVD contained only `app.pinevela.mobile.debug`. Its installed APK hash was `c5d3203cd3539d442392a48d582e6d4aaf4483cbca48b29cb1855b352efc2d31`, matching the archived October 29 step-3 build in `docs/android-step3-verified-2026-10-29.json`. Package metadata also reported October 29 as its last update. The older `Pixel_4a` AVD registry entry points to a missing config; it was left untouched.

The already-built final APK was installed with `adb install -r`, preserving app data. Its installed hash matched `6751232c39c071adc8b745d6e94d3748f29255ca5d4a1c2146efdf6a847515fd`. After normal emulator shutdown saved `default_boot`, the AVD was reopened with exactly `/home/wyse/Android/Sdk/emulator/emulator -avd PineVela_Pixel_4a_API_36`. Quick Boot loaded successfully in 14.6 seconds. Before any further reinstall, the installed APK still matched the latest hash. See `plain-reopen-installed-check.json`, `plain-reopen-boot.json`, and `plain-reopen-ui-identity.json`.

## Cause remains an inference

The previous verification run explicitly disabled snapshot loading and saving. An outdated/inconsistent normal Quick Boot state is a plausible explanation for the standalone opening showing the older APK. The installed old APK is confirmed; the exact mechanism that restored it is not proven. The first snapshot inspection reported a missing cache-device snapshot and fell back to booting, which supports snapshot inconsistency but does not establish a complete causal chain.

Installed emulator help claims `-snapshot-list` lists snapshots and exits. In this version it unexpectedly also booted the AVD, so that initial task-owned process was inspected and closed normally; its exact arguments and behavior are recorded in `snapshot-inspection-behavior.json`. The subsequent verification used the user's plain startup command without that flag.

Only task-started emulator processes were stopped normally. App source and the separate subscription design preview were not changed by this diagnostic.
