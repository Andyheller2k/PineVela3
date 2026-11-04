#!/usr/bin/env python3
"""Save the tested cumulative Android/hosting update without deploying it."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/android-safe-area-2026-11-01'
ZIP_OUT = ROOT / 'releases/web/pinevela-android-screen-fit-20261101.zip'
APK_OUT = ROOT / 'releases/android/pinevela-android-screen-fit-20261101.apk'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def report(name):
    return json.loads((EVIDENCE / name).read_text())


def main():
    summary = report('summary.json')
    for field in ['typescriptPassed', 'webBuildPassed', 'mobileBuildPassed',
                  'androidBuildPassed', 'capacitorSyncPassed', 'focusedTestsPassed',
                  'browserChecksPassed', 'regressionChecksPassed', 'diffCheckPassed']:
        assert summary[field], field
    assert summary['nodeTestCount'] == 51 and not summary['deployedRemotely']
    for directory, count in [('browser', 82), ('profile-browser', 8)]:
        checks = report(directory + '/report.json')
        assert checks['passed'] and checks['scenes'] == count
        assert checks['runtimeExceptions'] == checks['hostedOrAccountWrites'] == 0
    returned = report('google-return-browser/report.json')
    assert returned['passed'] and returned['scenes'] == 3
    assert returned['runtimeExceptions'] == returned['hostedOrAccountWrites'] == 0
    profile = report('profile-browser/profile-toast-measurements.json')
    assert len(profile['measurements']) == 8 and profile['localProfileFixturesOnly']
    assert all(value['x'] >= 8 and value['right'] <= value['viewport'] - 8 for value in profile['measurements'])
    instrumented = report('android/instrumentation-summary.json')
    assert instrumented['passed'] and instrumented['total'] == 32
    assert instrumented['classes']['NativeSafeAreaTest'] == 4
    assert instrumented['localDocumentCount'] == 9
    native, ui = report('android/result.json'), report('android/ui/ui-result.json')
    for field in ['passed', 'normalReopenPreservedApk', 'emulatorShutdown']:
        assert native[field], field
    assert ui['passed'] and ui['actualAndroidWebView'] and ui['sceneCount'] == 65
    assert not ui['accountFormsSubmitted'] and not ui['paymentActionsSubmitted']
    assert not ui['accountDataCleared'] and not ui['privateAccountFieldsInspected']
    scan = report('artifact-scan.json')
    assert scan['passed'] and scan['matches'] == 0
    for filename, expected in scan['manifests'].items():
        assert digest((ROOT / filename).read_bytes()) == expected, 'Changed after scan: ' + filename
    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk.read_bytes()) == native['installedApkSha256'] == ui['installedApkSha256'] == summary['apkSha256']
    with zipfile.ZipFile(apk) as archive:
        for file in (ROOT / 'dist-mobile').rglob('*'):
            if file.is_file():
                assert not file.is_symlink()
                assert archive.read('assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()) == file.read_bytes()
        assert not any('pinevela_test_network_security' in name for name in archive.namelist())
        config = json.loads(archive.read('assets/capacitor.config.json'))
        assert config['plugins']['SystemBars'] == {'insetsHandling': 'native', 'initialViewportFitValueHint': 'contain'}
        dex = b''.join(archive.read(name) for name in archive.namelist() if re.fullmatch(r'classes\d*\.dex', name))
        for excluded in [b'NativeSafeAreaTest', b'PublicMediaCacheTest', b'public-media-loopback-fixture', b'https://10.0.2.2:9443']:
            assert excluded not in dex, 'Test-only content in development APK'
    entries = {}
    for file in sorted((ROOT / 'dist-supabase').rglob('*')):
        if file.is_file():
            relative = file.relative_to(ROOT / 'dist-supabase')
            assert not file.is_symlink() and file.suffix != '.map'
            assert not any(part.startswith('.') for part in relative.parts)
            entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/android-screen-fit-google-update-2026-11-01.md').read_bytes()
    for name in ['summary.json', 'artifact-scan.json', 'node-tests.json', 'backend-build-comparison.json',
                 'frontend-rebuild-comparison.json', 'google-return-browser/report.json',
                 'google-return-browser/google-return-measurements.json',
                 'browser/report.json', 'browser/android-layout-measurements.json',
                 'profile-browser/report.json', 'profile-browser/profile-toast-measurements.json',
                 'android/result.json', 'android/instrumentation-summary.json', 'android/ui/ui-result.json']:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA ANDROID SCREEN FIT / GOOGLE SIGN-IN UPDATE - 1 NOVEMBER 2026

ANDROID
Install the companion pinevela-android-screen-fit-20261101.apk over the previous
development APK. It is saved under PineVela3/releases/android/. It preserves app
data and the existing debug package/signature. This is not a Google Play release.

WEBSITE / GOOGLE HANDOFF
1. Privately back up the existing two hosting build folders.
2. Extract this ZIP directly into the existing pinevela-app root, replacing
   dist-supabase/ and dist-supabase-backend/ without an enclosing folder.
3. Restart the existing Node app in Spaceship Hosting Manager and reload.

Apply this hosting update as well as the APK for the direct Google launch.
Google opens its account chooser in the secure system browser and then uses
the existing verified Continue in PineVela Android return. New Android signup
preserves the current Terms checkbox. No Google Console/Supabase URL change is
required. Older APK signup still uses the browser Terms form when necessary.

Keep app.cjs, node_modules, environment variables, private data and hosting
settings. Keep this ZIP outside the public web root. No new dependency, SQL
migration, DNS or SMTP change is required. This cumulative build retains all
previous subscription, appearance, marketplace and public-photo cache updates.

Verification includes 51 Node checks, 82 Android-bundle browser scenarios,
8 actual local profile-save and 3 Google-return browser scenarios, 32 native instrumentation tests
and 65 real emulator layout scenarios with normal Quick Boot reopen.
See verification/ for scope and limitations. UI/provider fixtures do not prove
a real Google account completed login; no hosted account or payment was changed.

This package has NOT been deployed remotely. Earlier APKs and ZIPs remain saved.
ROLLBACK: restore the previous hosting folders and restart Node.
No .env, credentials, source maps, private backups or node_modules are included.
'''
    for name in entries:
        assert not name.startswith('/') and '..' not in PurePosixPath(name).parts
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    assert not ZIP_OUT.exists() and not APK_OUT.exists(), 'Do not overwrite saved releases'
    ZIP_OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_OUT, 'x', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(ZIP_OUT) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(set(archive.namelist()))
        for line in archive.read('SHA256SUMS.txt').decode().splitlines():
            expected, name = line.split('  ', 1)
            assert digest(archive.read(name)) == expected
        assert not any(name.endswith('.map') or '/.env' in name for name in archive.namelist())
    APK_OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(apk, APK_OUT)
    for directory, pattern in [(APK_OUT.parent, '*.apk'), (ZIP_OUT.parent, '*.zip')]:
        (directory / 'SHA256SUMS.txt').write_text(''.join(digest(file.read_bytes()) + '  ' + file.name + '\n' for file in sorted(directory.glob(pattern))))
    temporary = Path('/tmp') / ZIP_OUT.name
    shutil.copyfile(ZIP_OUT, temporary)
    assert temporary.read_bytes() == ZIP_OUT.read_bytes()
    print(json.dumps({'zip': str(ZIP_OUT), 'temporaryZip': str(temporary), 'apk': str(APK_OUT),
                      'zipFiles': len(entries), 'zipBytes': ZIP_OUT.stat().st_size,
                      'apkSha256': digest(APK_OUT.read_bytes()), 'zipSha256': digest(ZIP_OUT.read_bytes())}))


if __name__ == '__main__':
    main()
