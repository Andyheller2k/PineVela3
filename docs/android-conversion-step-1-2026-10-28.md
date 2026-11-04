# Android conversion — step 1: preparation

Prepared: 28 October 2026. Completed: 29 October 2026 (Africa/Accra).

Scope: prepare the existing PineVela project and local Android build tools.
The owner requested one step at a time. Creating the native project and changing
application behaviour belong to later steps.

Status: step 1 complete. Capacitor dependencies, 39 community skills and the
required command-line Android SDK packages are installed and verified.
The Android application itself has not been generated or tested on a phone yet.

## Development sequence

1. Prepare and verify dependencies, skills and Android tools (this step).
2. Add the Android project and a dedicated bundled mobile build.
3. Implement and test native API/session transport and browser return links.
4. Test actual Android devices, core workflows and sustained performance.
5. Prepare the signed APK/App Bundle and Google Play submission materials.

## Project dependencies

The following exact versions were added using npm with package lifecycle scripts
disabled. The existing npm lockfile was retained and updated.

| Package | Location | Version |
| --- | --- | --- |
| `@capacitor/core` | dependencies | 8.5.3 |
| `@capacitor/android` | dependencies | 8.5.3 |
| `@capacitor/cli` | devDependencies | 8.5.3 |

Node 22.16.0 and OpenJDK 21.0.12.1 were already available and meet this
Capacitor version's requirements. Existing dependency versions and npm scripts
were preserved. The lockfile gained 88 entries, removed none and changed no
existing package entry except the root metadata for these three additions.

Capacitor 9 is a preview and was not selected. The iOS platform package has not
been added during this Android preparation step.

## Android tools

The installed SDK location is `/home/wyse/Android/Sdk`, matching the existing
`ANDROID_HOME` setting and Android Studio's saved SDK path. Neither that SDK nor
an executable Studio installation was present at the start of this check.

Verified command-line packages:

- Google SDK command-line tools 22.0, verified against Google's published SHA-256.
- `platforms;android-36`, revision 2, for compile/target API 36.
- `build-tools;35.0.0`, the default/minimum for the template's AGP 8.13.
- `platform-tools` 37.0.1, including `adb` 1.0.41 for subsequent device testing.

Google's SDK Manager recognizes all three SDK packages and generated their
package metadata. Its SDK license acceptance was recorded by the official
installer. `adb` and `sdkmanager` resolve through the existing terminal PATH.
The JDK compiler resolves to `/usr/lib/jvm/java-21-openjdk-amd64/bin/javac`.

The installer initially restarted slow downloads rather than resuming ranges.
Selected archives were fetched over verified HTTPS with bounded parallel ranges,
then checked against the official repository's byte counts and SHA-1 digests.
The complete verified archives were supplied only to temporary operations created
by Google's installer. That installer rechecked them, extracted the packages and
wrote its own metadata. No package XML or license records were fabricated.
Independently computed SHA-256 digests and tool versions are retained in the
[verification manifest](android-toolchain-verified-2026-10-29.json).

Google now deprecates `sdkmanager` in favor of `android sdk`; the installed
SDK Manager still successfully installed and listed the selected packages.

The command-line build path uses the installed JDK. Android Studio's graphical
editor remains optional and is deferred. A lightweight emulator was subsequently
installed and boot-verified; see the [VS Code emulator setup](android-emulator-vscode-2026-10-29.md).
No global Gradle installation is needed: the native project will provide its
versioned wrapper in step 2 (Capacitor 8.5.3 template: Gradle 8.14.3).

The template supports Android 7/API 24 and later. Actual compatibility and
performance still require device testing.

Google archive:

- URL: `https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip`
- SHA-256: `4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583`

## Installed skills

Installed 39 Capacitor-related documentation skills into
`/home/wyse/.codex/skills` using the existing Codex skill installer. Source:
[Cap-go/capgo-skills](https://github.com/Cap-go/capgo-skills), MIT licensed,
pinned to commit `e90bb5639130e34387f00bf0a95c6d47e4a2ebb8`.

This is a community/vendor-maintained skill suite rather than Ionic's official
Capacitor runtime. All 32 `capacitor-*` skills were installed, together with
`debugging-capacitor`, `framework-to-capacitor`, `ios-android-logs`,
`safe-area-handling`, `tailwind-capacitor`, `webapp-to-capacitor` and
`cocoapods-to-spm`. Each installed entrypoint was checked to exist, be nonempty
and not be a symlink. They are now available in this session's skill catalog.

Vendor account/cloud skills and unrelated UI/framework migrations were excluded.
No bundled skill script was executed, no cloud/live-update service was enabled
and no external account was created. Skill suggestions about local SQLite,
cloud uploads or preview versions do not override PineVela's privacy,
authorization or current task scope.

## Existing application constraints for later steps

These are reviewed integration requirements, not implemented native features:

- Relative `/api/` requests and host-only HttpOnly/SameSite cookies assume the
  website origin. A bundled Android origin needs an explicit transport/session
  design; changing one fetch helper alone will miss existing direct fetches.
- Preserve Express authorization, server-derived identity, current CSRF
  protection, PostgreSQL relationships and RLS. A mobile header is not proof of
  identity. No blanket CORS or security-policy relaxation is approved.
- Google sign-in needs an approved browser/native flow and a verified one-time
  return to the app. Browser and WebView cookies cannot be assumed shared.
- Public and private image elements, file uploads and authenticated EventSource
  streams need separate verification; a fetch adapter does not cover them all.
- Verify actual CAPTCHA hostname/origin support while preserving submission-only
  checks and idle/background cleanup.
- Handle payment, password-recovery and invitation returns. Review digital
  merchant plan/boost billing separately from physical goods and services.
- Add native launch/lifecycle handling and exclude website service-worker and
  browser installation prompts where appropriate.

The first later authentication proof should use an isolated test backend:
email login, an authorized session/private read, logout and rejection of private
access afterwards. Include another account's denied read, expiry/revocation and
a protected image. It does not require creating a real hosted merchant.

## Verification and boundaries

Preparation checks on 28 October:

- TypeScript passed before and after dependency installation.
- The complete production frontend/backend build passed before and after it.
- All eight existing PWA/static-delivery checks passed. The HTTP cases were run
  outside the sandbox that denies loopback listeners.
- The compiled application entry was `/assets/index-CvUSBgrX.js`.
- Comparing 940 tracked-file hashes against the preparation baseline identified
  only `package.json` and `package-lock.json` as changed by installation.
- `git diff --check` passed. Existing uncommitted work was preserved.

Completion checks on 29 October:

- The current production frontend/backend build and TypeScript passed again.
- The current application entry is `/assets/index-B7N_kwPF.js`, including the
  separately completed signup-password fix. The earlier entry above records the
  original dependency-only preparation checkpoint.
- SDK Manager's installed inventory lists API 36 revision 2, Build Tools 35.0.0
  and Platform Tools 37.0.1. `adb version`, `aapt2 version` and `apksigner version`
  execute successfully.
- A disposable Java 21 class compiled with `javac --release 21`; the installed
  D8 compiler converted it into DEX for minimum API 24 using API 36's `android.jar`.
  This tests the tools, not the PineVela Android application or Gradle build.
- Installed `aapt2`, `android.jar` and `adb` match the verified official archives;
  their generated package XML identifies the expected package paths.
- Before report changes, all 987 tracked and untracked project files in the
  resume baseline retained their hashes. SDK completion changed no application
  source or dependency files. Earlier uncommitted UI, auth and legal work remains.
- All 39 skill entrypoints remain installed, nonempty and not symlinks.

There is no generated `android/` directory, Capacitor config, Android APK or
App Bundle yet. No app signing key, hosted setting, account, payment, database
migration or deployment was created or changed. PineVela's Android runtime behaviour,
physical-phone performance and store acceptance have not been verified.

Current completion logs and snapshots are under `/tmp/pinevela-android-step1/`;
installed tools, verified archive cache and skills use persistent user directories.
This report and the verification manifest are saved in the project `docs/` folder.

Next step: add the Android project and dedicated bundled mobile build, then
implement the reviewed native API/session and OAuth-return design. Do not treat
the installed SDK as proof that the website's cookie-based sessions work inside
an Android WebView.

## Primary references

- [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor 8.5.3 release](https://github.com/ionic-team/capacitor/releases/tag/8.5.3)
- [Tagged Android template](https://github.com/ionic-team/capacitor/blob/8.5.3/android-template/variables.gradle)
- [Google Android tools downloads](https://developer.android.com/studio#command-tools)
- [Android Gradle Plugin 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- [Google OAuth secure browser requirement](https://developers.google.com/identity/protocols/oauth2/policies#use-secure-browsers)
