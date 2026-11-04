# Android startup and system-bar appearance

Android uses the installed web app's one-shot PineVela startup design: mascot,
Pine/Vela wordmark and the small animated gold progress track. The mascot comes
from the existing transparent policy/app SVG, rather than the opaque PWA icon.
Reduced-motion preference stops the progress animation. Auth and initial route
readiness dismiss it once; navigation and resume do not restart it. A slow
startup exposes a reload action after 20 seconds, and a secure-bootstrap failure
reveals the actionable startup error instead of leaving the loader over it.

Before React mounts, the native entry resolves the same device appearance key as
ThemeProvider. A single attribute observer follows later theme changes; it does
not poll. The native appearance plugin accepts only Light, Dark or System and
persists only this appearance preference. Session credentials are never used by
this plugin.

Android's native window/decor/content/WebView backgrounds match white or
PineVela navy, with contrasting status and navigation icons. The window theme
attribute is updated too, because Capacitor's SystemBars re-reads it on
configuration changes. Native appearance is restored on resume and rotation.
Capacitor retains ownership of safe insets; no custom inset listener or extra
CSS padding was added. Every bundled native document uses `viewport-fit=contain`
and SystemBars' initial viewport hint matches it. This keeps the entire WebView
inside system bars and display cutouts, including on WebView 140+ where `cover`
would instead pass the insets through to individual pages. The shared viewport
helper preserves each document's fit on resize/pageshow; the website keeps its
existing cover behavior. AndroidX edge-to-edge initialization makes the native
strategy consistent on older supported Android versions too. Capacitor replaces
the bottom navigation inset with the IME inset while the keyboard is open.
Fixed navigation, top-layer dialogs and local policy pages share that contained
viewport without extra per-page offsets. The brief Android OS launch uses the same mascot
shape as a transparent vector on a theme-colored launch surface; Android's OS
splash is an icon and background rather than the later HTML progress animation.

## Verification

Run the normal TypeScript/mobile build, `cap sync android` and the Android native
build. On the API 36 emulator, inspect both the full physical screenshot and
WebView DOM in Light and Dark, then System with Android night mode changed.
Check status icons, the complete gesture/three-button navigation area, cold
launch, resume, rotation, local policy navigation and logout/login. Content must
remain below the camera cutout and above navigation controls. Capture the loader
before firing `pinevela:app-ready`; confirm it disappears after readiness and
never appears again on ordinary hash navigation. The final step-3 verification
report records which device checks were actually completed.

The installed `transportTest` APK was checked on the Pixel 4a emulator running
Android 16/API 36 and WebView 133 on 29 October. The repeatable check
`node scripts/verify-android-startup-appearance.cjs` passed six scenarios and
saved ten full-display screenshots plus
`docs/verification/android-step3-2026-10-29/startup-appearance-result.json`.
The final tested APK SHA-256 is
`952e3db0d4e3205445234e22b0ac223ddffc634e455f54629626d8c6ba6e6391`;
the report independently verifies it against the installed package.
Actual Android system night-mode changes, manual overrides of the opposite
system theme, resume, process relaunch, local Terms navigation and three-button
navigation all retained the correct physical status/navigation backgrounds.
Samples matched exactly white or navy `(0, 29, 61)`; no uncaught WebView exception
was observed. Gesture navigation and the initial system theme were restored.

The two loader screenshots deliberately hold the app-ready event after the real
app has rendered, so the transparent asset and animation can be inspected. They
do not measure natural startup duration or prove that a particular frame of the
brief OS launch surface was captured. Loader dismissal and the absence of a new
loader on hash navigation were checked separately. Landscape, a physical phone,
real Google sign-in and hosted CAPTCHA completion were not part of these
appearance checks.

The November 1 screen-fit release adds a shared inset regression and a broader
matrix covering compact/tall/landscape layouts, both themes, gesture/three-button
navigation, keyboard, policy documents and asymmetric cutout insets. See
`docs/verification/android-safe-area-2026-11-01/` and the release notes for the
exact device/browser coverage. A passing emulator matrix is not a claim that
every physical phone model has been tested.
