# Android UI evidence — 2026-10-31

Existing Pixel 4a AVD, Android 16/API 36, 1080×2340 at 440 dpi; debug application `app.pinevela.mobile.debug`. Installation uses `adb install -r`, preserving app data. No account form, OAuth, AI prompt, or payment is submitted.

The AVD encountered Android System UI's known startup ANR before PineVela was launched. The native accessibility hierarchy identified its Wait control; one physical tap cleared it and launcher focus recovered. Preparation evidence is kept separately.

The warm installed APK launches its real signed-out welcome. `/api/auth/me` returned 401. A physical tap at the native hierarchy's Sign in bounds opens the bundled local login route. `login-light-settled.png` is the settled screenshot; `sign-in-after.png` is an earlier transient capture while the emulator was still rendering navigation.

Native Sign Up tab automation stopped after the accessibility hierarchy was unavailable twice, with one screen recapture before the retry. No Sign Up control tap was sent. Interactive signup and theme changes are not claimed as verified; the full native flow remains incomplete.

`css-probes.json` is a separate, clearly labelled test of computed styles inside the actual installed signed-out Android WebView. It temporarily loads only the APK's own lazy marketplace CSS and adds inert local DOM; it does not mount authenticated components or create a synthetic hosted session. It checks page action/filter colors, five selected navigation roles, the actual Merchant invitation classes, System default pill boundaries, horizontal alert filters, and phone card grid/thumbnail metrics in both themes. The temporary DOM and stylesheet are removed, and original theme/appearance attributes restored. `probe-cleanup.json` checks cleanup and unchanged local appearance. The initial probe file records the missing lazy CSS precondition and an unrepresentative Merchant class; final probes use the actual classes and bundled lazy stylesheet.

Authenticated seller workflows, actual purchase expansion/receipts, physical phones, and iOS are untested here. Browser fixture coverage is reported separately by the parent task.

The final desktop-navigation attribute rebuild was installed and rechecked at SHA-256 `6751232c39c071adc8b745d6e94d3748f29255ca5d4a1c2146efdf6a847515fd`. Final installed hash, bundled signed-out welcome, HTTP 401, both-theme CSS probes, zero temporary probes and original appearance restoration passed. The earlier physical Sign in interaction belongs to the pre-final build `1f15d83b68500f555cfb82626853fa11394e4bcff7a4e178d7302a04691f4a84`; its evidence is preserved, and the failed native Sign Up action was not repeated. Overall native suite status remains incomplete. Only the task-started emulator PID 9284 was shut down afterward.
