#!/usr/bin/env python3
"""Create the matched manager dashboard label update for hosting and Android."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = 'pinevela-manager-dashboard-label-20261104'
ZIP_OUT = ROOT / 'releases/web' / f'{NAME}.zip'
APK_OUT = ROOT / 'releases/android' / f'{NAME}.apk'
APK_BUILD = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
NOTES = ROOT / 'docs/manager-dashboard-label-update-2026-11-04.md'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def add_tree(entries: dict[str, bytes], directory: Path) -> None:
    assert directory.is_dir() and not directory.is_symlink()
    for file in sorted(directory.rglob('*')):
        if not file.is_file():
            continue
        relative = file.relative_to(directory)
        assert not file.is_symlink() and file.suffix != '.map'
        assert all(not part.startswith('.') for part in relative.parts)
        entries[directory.name + '/' + relative.as_posix()] = file.read_bytes()


def main() -> None:
    assert not ZIP_OUT.exists() and not APK_OUT.exists(), 'Do not overwrite an existing release'
    assert APK_BUILD.is_file() and not APK_BUILD.is_symlink()
    assert NOTES.is_file()

    mobile_files = 0
    with zipfile.ZipFile(APK_BUILD) as installed:
        for file in sorted((ROOT / 'dist-mobile').rglob('*')):
            if not file.is_file():
                continue
            assert not file.is_symlink()
            entry = 'assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()
            assert installed.read(entry) == file.read_bytes(), 'Stale APK asset: ' + entry
            mobile_files += 1
        assert mobile_files > 100

    entries: dict[str, bytes] = {}
    add_tree(entries, ROOT / 'dist-supabase')
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(
            rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    server = entries['dist-supabase-backend/supabase-server.mjs']
    for route in (b'/api/manager/my-hostel', b'/api/hostels/register', b'authorizedRead', b'readActor'):
        assert route in server
    entries['UPDATE-NOTES.md'] = NOTES.read_bytes()
    entries['README-INSTALL.txt'] = (
        'PINEVELA MANAGER DASHBOARD LABEL UPDATE - 4 NOVEMBER 2026\n\n'
        'HOSTING\n'
        '1. Back up the existing dist-supabase and dist-supabase-backend folders in pinevela-app.\n'
        '2. Extract this ZIP directly into the pinevela-app root, replacing those folders.\n'
        '3. Restart the existing Node app and reload the website.\n\n'
        'ANDROID\n'
        'Install the matching APK from PineVela3/releases/android/ over the PineVela\n'
        'Development app. It is debug signed and is not a Play Store release.\n\n'
        'Keep app.cjs, node_modules, environment variables and private files.\n'
        'No SQL migration is required. This is a local package, not a remote deployment.\n'
        'See UPDATE-NOTES.md for behavior, verification and rollback.\n'
    ).encode()
    assert all(not name.startswith('/') and '..' not in PurePosixPath(name).parts for name in entries)
    entries['SHA256SUMS.txt'] = ''.join(
        sha(data) + '  ' + name + '\n' for name, data in sorted(entries.items())
    ).encode()

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
    with APK_OUT.open('xb') as output, APK_BUILD.open('rb') as source:
        shutil.copyfileobj(source, output)
    for directory, pattern in [(APK_OUT.parent, '*.apk'), (ZIP_OUT.parent, '*.zip')]:
        (directory / 'SHA256SUMS.txt').write_text(''.join(
            sha(file.read_bytes()) + '  ' + file.name + '\n' for file in sorted(directory.glob(pattern))
        ))
    temporary = Path('/tmp') / ZIP_OUT.name
    shutil.copyfile(ZIP_OUT, temporary)
    assert temporary.read_bytes() == ZIP_OUT.read_bytes()
    print(json.dumps({
        'zip': str(ZIP_OUT), 'temporaryZip': str(temporary), 'apk': str(APK_OUT),
        'zipFiles': len(entries), 'mobileAssetsMatched': mobile_files,
        'zipSha256': sha(ZIP_OUT.read_bytes()), 'apkSha256': sha(APK_OUT.read_bytes()),
    }))


if __name__ == '__main__':
    main()
