# Android safe-area verification — 1 November 2026

This directory records checks of the installed PineVela Android application and
Capacitor's production SystemBars inset listener. No real account, payment,
Google chooser, or private dashboard record is submitted or inspected.

The existing Pixel 4a Android 16 AVD uses Google WebView 133.0.6943.137. No
third-party WebView APK, device wipe, new AVD, or provider override is used.
The explicit `viewport-fit=contain` invariant makes the plugin use native
containment independently of the WebView version. Modern browser checks are
recorded separately by the parent verification. This does not claim physical
Samsung-device or native WebView 140+ testing.

`NativeSafeAreaTest.java` belongs to the isolated Android test APK. It reads the
real native WebView/system bounds and dispatches test-only asymmetric cutout,
gesture/three-button, and IME insets through the unchanged production listener.
It asserts the WebView consumes each inset exactly once. No synthetic listener,
version override, or CSS inset shim is shipped.

`scripts/verify-android-safe-area.cjs` checks the actual installed debug APK in
compact/tall phone, landscape and tablet-size windows, both themes, gesture and
three-button navigation, local Welcome/login/signup/help/FAQ/policy screens,
fixed-position viewport coordinates, legal-footer reachability and an actual
Android keyboard open/dismiss. Display/navigation/keyboard/appearance changes
are restored. Short screens may scroll naturally; footer reachability and
header containment are checked independently.

The initial intermediate APK confirmed the physical clipping bounds and the
first 18 UI scenarios. Its generated standalone policies lacked the explicit
contain token because their build adaptation was added after the first sync;
that intermediate run stopped and required the final cumulative rebuild.
Earlier smoke attempts also exposed harness issues: the root intentionally
redirects to `#/login`, and UIAutomator's nested virtual document rounds by two
pixels beyond the physical outer WebView. The final harness accounts for both.

Use the final JSON reports and final APK SHA for release status, not an
intermediate smoke result. Normal Quick Boot persistence, package cleanup and
final installed hash are recorded after the cumulative build checks complete.

Final verification passed: 32 native tests, 65 Android UI scenarios and the exact
APK hash retained after a normal emulator reopen without reinstalling. Original
settings are restored, isolated fixture packages removed, app data preserved,
and normal snapshot shutdown completed. See `result.json` and
`completion-reopen-verification.json`. The reopen screenshot shows startup; use
`ui/` for the settled layout matrix. A duplicate launch was rejected harmlessly.
