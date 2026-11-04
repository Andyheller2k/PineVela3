#!/usr/bin/env python3
"""Make a reviewable cumulative PineVela Android and hosting update."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/native-google-2026-11-03'
MANAGER = ROOT / 'docs/verification/manager-terms-2026-11-02'
NAME = 'pinevela-native-google-manager-fix-20261103'
ZIP_OUT = ROOT / 'releases/web' / (NAME + '.zip')
APK_OUT = ROOT / 'releases/android' / (NAME + '.apk')
APK_BUILD = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def add_tree(entries, directory):
    for file in sorted(directory.rglob('*')):
        if not file.is_file():
            continue
        relative = file.relative_to(directory)
        assert not file.is_symlink() and file.suffix != '.map'
        assert all(not part.startswith('.') for part in relative.parts)
        entries[directory.name + '/' + relative.as_posix()] = file.read_bytes()


def main():
    result = read_json(EVIDENCE / 'result.json')
    manager = read_json(MANAGER / 'backend-result.json')
    scan = read_json(EVIDENCE / 'artifact-scan.json')
    assert result['passed'] and result['focusedNodeTests'] == 66
    assert result['focusedAndroidInstrumentation'] == 11
    assert result['debugPackage'] == 'app.pinevela.mobile.debug'
    assert not result['realGoogleAccountLogin'] and not result['hostedServerUpdated']
    assert result['hostedAccountWrites'] == 0
    assert manager['passed'] and manager['checks'] == 69 and manager['cloudWrites'] == 0
    for name in ['browser-after', 'mobile-browser-after']:
        browser = read_json(MANAGER / name / 'report.json')
        assert browser['passed'] and browser['scenes'] == 11
        assert browser['hostedOrAccountWrites'] == browser['runtimeExceptions'] == 0
    assert scan['passed'] and scan['matches'] == 0
    for filename, expected in scan['manifests'].items():
        assert sha((ROOT / filename).read_bytes()) == expected, 'Build changed after scan: ' + filename
    assert not ZIP_OUT.exists() and not APK_OUT.exists(), 'Do not overwrite an existing release'
    assert APK_BUILD.is_file() and not APK_BUILD.is_symlink()

    # The tested Android code must contain exactly the connected mobile build.
    with zipfile.ZipFile(APK_BUILD) as installed:
        for file in (ROOT / 'dist-mobile').rglob('*'):
            if file.is_file():
                assert not file.is_symlink()
                entry = 'assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()
                assert installed.read(entry) == file.read_bytes(), 'Stale APK asset: ' + entry
        assert not any('pinevela_test_network_security' in name for name in installed.namelist())

    entries = {}
    add_tree(entries, ROOT / 'dist-supabase')
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(
            rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes()
        )
    assert b'/api/auth/mobile/google/native/start' in entries['dist-supabase-backend/supabase-server.mjs']
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/manager-terms-and-native-google-update-2026-11-03.md').read_bytes()
    for relative in ['result.json', 'artifact-scan.json']:
        entries['verification/native-google/' + relative] = (EVIDENCE / relative).read_bytes()
    for relative in ['backend-result.json', 'browser-after/report.json', 'mobile-browser-after/report.json']:
        entries['verification/manager-terms/' + relative] = (MANAGER / relative).read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA MANAGER AGREEMENT AND NATIVE ANDROID GOOGLE UPDATE - 3 NOVEMBER 2026

ANDROID
Install the companion development APK from PineVela3/releases/android/ over the
existing PineVela Development app. The package is app.pinevela.mobile.debug and
its signing SHA-1 matches the registered Android development OAuth client.
Installing over it preserves app data. This APK is not a Play Store release.

HOSTING
1. Keep a private backup of the existing dist-supabase and
   dist-supabase-backend folders in pinevela-app.
2. Extract this ZIP directly into the existing pinevela-app root, replacing
   those two build folders. There is no enclosing folder in the archive.
3. Restart the existing Node app in Spaceship Hosting Manager, then reload.

Apply both the hosting ZIP and APK for native Google account selection. The new
Android button requests the Google account chooser inside Android and returns
to the app after server verification. It no longer opens PineVela's website.
The manager Terms save and password-eye fixes are included. The old browser
handoff remains for earlier APKs. No database migration is required.

Keep app.cjs, node_modules, environment variables, private files and hosting
settings. Keep this ZIP outside the public web root. The existing Google Web
OAuth client and Supabase Google provider stay configured. A future Play release
needs its own app.pinevela.mobile OAuth client for the Play signing SHA-1.

Verification uses local provider fixtures, actual manager PostgreSQL/RLS
checks, Android instrumentation and a Pixel 4a emulator. Real Google account
completion needs a check after this hosting update is applied. This archive
contains no .env, source maps, credentials, private backups or node_modules.
Nothing in this package has been deployed remotely. Restore the prior two
hosting folders and restart Node to roll back the web/server part.
'''
    assert all(not name.startswith('/') and '..' not in PurePosixPath(name).parts for name in entries)
    entries['SHA256SUMS.txt'] = ''.join(sha(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    ZIP_OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_OUT, 'x', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(ZIP_OUT) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(set(archive.namelist()))
        for line in archive.read('SHA256SUMS.txt').decode().splitlines():
            expected, name = line.split('  ', 1)
            assert sha(archive.read(name)) == expected
        assert not any(name.endswith('.map') or '/.env' in name or 'node_modules' in name for name in archive.namelist())
    APK_OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(APK_BUILD, APK_OUT)
    for directory, pattern in [(APK_OUT.parent, '*.apk'), (ZIP_OUT.parent, '*.zip')]:
        (directory / 'SHA256SUMS.txt').write_text(''.join(
            sha(file.read_bytes()) + '  ' + file.name + '\n' for file in sorted(directory.glob(pattern))
        ))
    temporary = Path('/tmp') / ZIP_OUT.name
    shutil.copyfile(ZIP_OUT, temporary)
    assert temporary.read_bytes() == ZIP_OUT.read_bytes()
    print(json.dumps({'zip': str(ZIP_OUT), 'temporaryZip': str(temporary),
                      'apk': str(APK_OUT), 'zipFiles': len(entries),
                      'zipSha256': sha(ZIP_OUT.read_bytes()), 'apkSha256': sha(APK_OUT.read_bytes())}))


if __name__ == '__main__':
    main()
