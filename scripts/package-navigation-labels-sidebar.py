#!/usr/bin/env python3
"""Package verified navigation UI with the unchanged cumulative backend and matching development APK."""
from hashlib import sha256
from pathlib import Path, PurePosixPath
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/navigation-labels-sidebar-2026-11-04'
NAME = 'pinevela-navigation-labels-sidebar-20261104'
ZIP_OUT = ROOT / 'releases/web' / (NAME + '.zip')
APK_OUT = ROOT / 'releases/android' / (NAME + '.apk')

def digest(data):
    return sha256(data).hexdigest()

def report(name):
    return json.loads((EVIDENCE / name).read_text())

def main():
    summary = report('summary.json')
    for field in ['passed', 'typescriptPassed', 'webBuildPassed', 'mobileSyncPassed',
                  'browserChecksPassed',
                  'androidBuildPassed', 'androidWebViewChecksPassed',
                  'debugInstallPassed', 'artifactScanPassed', 'diffCheckPassed']:
        assert summary[field], field
    assert not summary['deployedRemotely']
    for name, expected in summary['sourceAndBuildSha256'].items():
        assert digest((ROOT / name).read_bytes()) == expected, name
    for name in summary['verificationReports']:
        assert report(name)['passed'], name
    browser = report('browser/report.json')
    assert browser['runtimeExceptions'] == browser['hostedOrAccountWrites'] == 0
    native = report('android/verified.json')
    assert native['productionWrites'] == 0 and native['actualInstalledAndroidWebView']
    transport_apk = ROOT / 'android/app/build/outputs/apk/transportTest/app-transportTest.apk'
    assert digest(transport_apk.read_bytes()) == native['installedApkSha256']
    baseline = json.loads((ROOT / 'docs/verification/navigation-keys-2026-11-04/summary.json').read_text())
    assert baseline['passed'] and baseline['keySecurityPassed']
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        relative = 'dist-supabase-backend/' + name
        assert digest((ROOT / relative).read_bytes()) == baseline['sourceAndBuildSha256'][relative], 'Cumulative backend must be unchanged'
    scan = report('artifact-scan.json')
    assert scan['matches'] == 0
    for name, expected in scan['manifests'].items():
        assert digest((ROOT / name).read_bytes()) == expected, 'Changed after scan: ' + name

    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk.read_bytes()) == summary['apkSha256']
    debug_install = report('android/debug-install.json')
    assert debug_install['installedDebugSha256'] == summary['apkSha256']
    assert debug_install['noDataClearing'] and debug_install['packageWritesFlushed']
    with zipfile.ZipFile(apk) as installed, zipfile.ZipFile(transport_apk) as tested:
        for file in (ROOT / 'dist-mobile').rglob('*'):
            if file.is_file():
                assert not file.is_symlink()
                assert installed.read('assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()) == file.read_bytes()
                assert tested.read('assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()) == file.read_bytes()
        config = json.loads(installed.read('assets/capacitor.config.json'))
        assert config['plugins']['SystemBars'] == {'insetsHandling': 'native', 'initialViewportFitValueHint': 'contain'}
        assert not config.get('server', {}).get('url')
        assert not any('pinevela_test_network_security' in name for name in installed.namelist())
        dex = b''.join(installed.read(name) for name in installed.namelist() if re.fullmatch(r'classes\d*\.dex', name))
        for excluded in [b'NativeSafeAreaTest', b'PublicMediaCacheTest', b'public-media-loopback-fixture', b'https://10.0.2.2:9443']:
            assert excluded not in dex
    APK_OUT.parent.mkdir(parents=True, exist_ok=True)
    if APK_OUT.exists():
        assert APK_OUT.read_bytes() == apk.read_bytes(), 'Do not replace earlier releases'
    else:
        shutil.copyfile(apk, APK_OUT)
    entries = {}
    frontend = ROOT / 'dist-supabase'
    assert frontend.is_dir() and not frontend.is_symlink()
    for file in sorted(frontend.rglob('*')):
        if file.is_file():
            relative = file.relative_to(frontend)
            assert not file.is_symlink() and file.suffix != '.map'
            assert all(not part.startswith('.') for part in relative.parts)
            entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/navigation-labels-and-sidebar-2026-11-04.md').read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA NAVIGATION LABELS AND COMPACT SIDEBAR - 4 NOVEMBER 2026

1. Back up dist-supabase/ and dist-supabase-backend/ in your pinevela-app hosting root.
2. Extract this ZIP into that root, replacing both build folders.
3. Restart the existing Node app, then reload PineVela.

Preserve app.cjs, environment variables, dependencies and hosting configuration.
No SQL migration or dependency installation is needed. Keep verification notes
outside the public web root. The website has not been deployed by this package.

ANDROID: install the companion APK over the existing development app without
uninstalling or clearing data. Both artifacts are saved in PineVela3/releases/.
The backend is unchanged from the previous navigation/short-key update and is
included to make this package cumulative.
This is a debug-signed development APK, not a Google Play release. iOS is unbuilt.

Mobile captions have a stationary foreground row below the icons. Desktop
Minimize sidebar uses a compact side rail, with no top navigation bar. Existing
account restrictions, navigation destinations and stored preferences are retained.
See UPDATE-NOTES.md and the verification summary for device results and limits.
'''
    for name in ['summary.json', *summary['verificationReports']]:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    assert all(not name.startswith('/') and '..' not in PurePosixPath(name).parts for name in entries)
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    assert not ZIP_OUT.exists(), 'Do not overwrite earlier archives'
    ZIP_OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_OUT, 'x', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(ZIP_OUT) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(set(archive.namelist()))
        assert not any(name.endswith('.map') or '/.env' in name or 'node_modules' in name for name in archive.namelist())
        for line in archive.read('SHA256SUMS.txt').decode().splitlines():
            expected, name = line.split('  ', 1)
            assert digest(archive.read(name)) == expected
    temporary = Path('/tmp') / ZIP_OUT.name
    assert not temporary.exists(), 'Do not overwrite earlier temporary archives'
    shutil.copyfile(ZIP_OUT, temporary)
    assert temporary.read_bytes() == ZIP_OUT.read_bytes()
    for directory, pattern in [(APK_OUT.parent, '*.apk'), (ZIP_OUT.parent, '*.zip')]:
        (directory / 'SHA256SUMS.txt').write_text(''.join(digest(file.read_bytes()) + '  ' + file.name + '\n' for file in sorted(directory.glob(pattern))))
    result = {'passed': True, 'zip': str(ZIP_OUT), 'temporaryZip': str(temporary), 'apk': str(APK_OUT),
              'zipFiles': len(entries), 'zipBytes': ZIP_OUT.stat().st_size,
              'zipSha256': digest(ZIP_OUT.read_bytes()), 'apkSha256': digest(APK_OUT.read_bytes()), 'deployedRemotely': False}
    (EVIDENCE / 'package-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))

if __name__ == '__main__':
    main()
