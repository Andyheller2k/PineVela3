#!/usr/bin/env python3
"""Save the verified mobile navigation frontend and matching development APK."""
from hashlib import sha256
from pathlib import Path, PurePosixPath
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/mobile-navigation-2026-11-04'
ZIP_OUT = ROOT / 'releases/web/pinevela-mobile-navigation-20261104.zip'
APK_OUT = ROOT / 'releases/android/pinevela-mobile-navigation-20261104.apk'


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def report(name: str):
    return json.loads((EVIDENCE / name).read_text())


def main() -> None:
    summary = report('summary.json')
    for field in ['passed', 'typescriptPassed', 'webBuildPassed', 'mobileSyncPassed',
                  'focusedTestsPassed', 'browserChecksPassed', 'regressionChecksPassed',
                  'androidBuildPassed', 'androidInstrumentationPassed',
                  'androidWebViewChecksPassed', 'artifactScanPassed', 'diffCheckPassed']:
        assert summary[field], field
    assert not summary['deployedRemotely']
    browser = report('browser-report.json')
    assert browser['passed'] and browser['runtimeExceptions'] == browser['hostedOrAccountWrites'] == 0
    for name, expected in browser['sourceAndBuildSha256'].items():
        assert digest((ROOT / name).read_bytes()) == expected, 'Changed after browser verification: ' + name
    for name in summary['verificationReports']:
        checked = report(name)
        assert checked['passed'], name
    scan = report('artifact-scan.json')
    assert scan['passed'] and scan['matches'] == 0
    for name, expected in scan['manifests'].items():
        assert digest((ROOT / name).read_bytes()) == expected, 'Changed after scan: ' + name

    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk.read_bytes()) == summary['apkSha256']
    with zipfile.ZipFile(apk) as archive:
        for file in (ROOT / 'dist-mobile').rglob('*'):
            if file.is_file():
                assert not file.is_symlink()
                assert archive.read('assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()) == file.read_bytes()
        config = json.loads(archive.read('assets/capacitor.config.json'))
        assert config['plugins']['SystemBars'] == {'insetsHandling': 'native', 'initialViewportFitValueHint': 'contain'}
        assert 'server' not in config or not config['server'].get('url'), 'APK must launch its bundled application'
        assert not any('pinevela_test_network_security' in name for name in archive.namelist())
        dex = b''.join(archive.read(name) for name in archive.namelist() if re.fullmatch(r'classes\d*\.dex', name))
        for excluded in [b'NativeSafeAreaTest', b'PublicMediaCacheTest', b'public-media-loopback-fixture', b'https://10.0.2.2:9443']:
            assert excluded not in dex, 'Test-only content in development APK'
    APK_OUT.parent.mkdir(parents=True, exist_ok=True)
    if APK_OUT.exists():
        assert APK_OUT.read_bytes() == apk.read_bytes(), 'Keep existing releases immutable'
    else:
        shutil.copyfile(apk, APK_OUT)

    entries: dict[str, bytes] = {}
    frontend = ROOT / 'dist-supabase'
    assert frontend.is_dir() and not frontend.is_symlink()
    for file in sorted(frontend.rglob('*')):
        if file.is_file():
            relative = file.relative_to(frontend)
            assert not file.is_symlink() and file.suffix != '.map'
            assert all(not part.startswith('.') for part in relative.parts)
            entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for required in ['index.html', 'sw.js', 'privacy.html', 'terms.html']:
        assert 'dist-supabase/' + required in entries
    assert any(b'data-curved-navigation' in data for name, data in entries.items() if name.endswith('.js'))
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/mobile-navigation-update-2026-11-04.md').read_bytes()
    entries['android-emulator-persistence-2026-11-04.md'] = (ROOT / 'docs/android-emulator-persistence-2026-11-04.md').read_bytes()
    for name in ['summary.json', 'browser-report.json', 'artifact-scan.json', *summary['verificationReports']]:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA MOBILE NAVIGATION - 4 NOVEMBER 2026

WEBSITE
1. Back up dist-supabase/ in the existing pinevela-app hosting root.
2. Extract this ZIP inside that root, replacing the frontend folder.
3. Restart the existing Node app and reload pinevela.app.

Only dist-supabase/ is deployed. Keep the existing backend, app.cjs, environment
variables, node_modules and hosting settings. No SQL or dependency change is
needed. Keep the ZIP and verification notes outside the public web root.
ROLLBACK: restore the previous dist-supabase/ folder and restart Node.

ANDROID
Install the companion pinevela-mobile-navigation-20261104.apk over your existing
development app. Both files are saved permanently in PineVela3/releases/.
Do not uninstall first if you want to preserve local app data. The APK uses the
existing debug package and signing key; it is not a Google Play release.

The shared mobile UI includes the smooth sliding circle/cutout, theme colors,
and fixed center plus for resident/seller quick actions. Desktop navigation
keeps its layout and colors. See UPDATE-NOTES.md and verification/ for checks.

This update has not been deployed remotely. iOS has not been built or tested
on this Ubuntu machine. No credentials or source maps are included.
'''
    assert all(not name.startswith('/') and '..' not in PurePosixPath(name).parts for name in entries)
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    assert not ZIP_OUT.exists(), 'Keep existing release archives immutable'
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
        assert not any(name.endswith('.map') or '/.env' in name or 'node_modules' in name for name in archive.namelist())
    temporary = Path('/tmp') / ZIP_OUT.name
    assert not temporary.exists(), 'Keep existing temporary archives immutable'
    shutil.copyfile(ZIP_OUT, temporary)
    assert temporary.read_bytes() == ZIP_OUT.read_bytes()
    for directory, pattern in [(APK_OUT.parent, '*.apk'), (ZIP_OUT.parent, '*.zip')]:
        (directory / 'SHA256SUMS.txt').write_text(''.join(digest(file.read_bytes()) + '  ' + file.name + '\n' for file in sorted(directory.glob(pattern))))
    result = {'zip': str(ZIP_OUT), 'temporaryZip': str(temporary), 'apk': str(APK_OUT),
              'zipFiles': len(entries), 'zipBytes': ZIP_OUT.stat().st_size,
              'apkSha256': digest(APK_OUT.read_bytes()), 'zipSha256': digest(ZIP_OUT.read_bytes()),
              'passed': True, 'deployedRemotely': False}
    (EVIDENCE / 'package-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
