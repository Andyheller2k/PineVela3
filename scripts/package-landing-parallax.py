#!/usr/bin/env python3
"""Save the verified landing-page frontend build for manual hosting install."""
from hashlib import sha256
from pathlib import Path, PurePosixPath
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = 'pinevela-landing-parallax-20261104.zip'
OUTPUT = ROOT / 'releases/web' / NAME
TEMPORARY = Path('/tmp') / NAME
REPORT = ROOT / 'docs/verification/landing-parallax-2026-11-04/browser-report.json'


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def main() -> None:
    assert not OUTPUT.exists() and not TEMPORARY.exists(), 'Keep existing release archives immutable'
    report = json.loads(REPORT.read_text())
    assert report['passed'] and report['runtimeExceptions'] == 0 and report['scenes'] == 8
    assert report['hostedOrAccountWrites'] == 0
    assert all(f'{width}px {theme} landing' in report['checks']
               for width in (320, 390, 1440) for theme in ('light', 'dark'))
    assert all(f'3D PineVela card and glass accessibility fallback: {theme}' in report['checks']
               for theme in ('light', 'dark'))

    frontend = ROOT / 'dist-supabase'
    assert frontend.is_dir() and not frontend.is_symlink()
    scripts = list((frontend / 'assets').glob('Page1Public-*.js'))
    styles = list((frontend / 'assets').glob('Page1Public-*.css'))
    assert len(scripts) == len(styles) == 1
    assert b'landing-scene-rotate-y' in scripts[0].read_bytes()
    assert b'landing-peak-scene' in styles[0].read_bytes()

    entries: dict[str, bytes] = {}
    for file in sorted(frontend.rglob('*')):
        if not file.is_file():
            continue
        relative = file.relative_to(frontend)
        assert not file.is_symlink() and file.suffix != '.map'
        assert all(not part.startswith('.') for part in relative.parts)
        entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for required in ['index.html', 'sw.js', 'privacy.html', 'terms.html']:
        assert 'dist-supabase/' + required in entries
    entries['README-INSTALL.txt'] = (
        'PINEVELA LANDING HERO PARALLAX - 4 NOVEMBER 2026\n\n'
        '1. Back up the existing dist-supabase folder in your pinevela-app hosting root.\n'
        '2. Extract this ZIP inside that root, replacing dist-supabase.\n'
        '3. Restart the existing Node app and reload pinevela.app.\n\n'
        'The landing-page girl now has subtle silhouette depth and pointer parallax\n'
        'on desktop; touch screens and reduced-motion settings keep it still.\n'
        'No backend files, SQL migration or credentials are included or required.\n'
        'This is a local package; it has not been deployed to pinevela.app.\n\n'
        'ROLLBACK: restore your previous dist-supabase folder and restart Node.\n'
    ).encode()
    entries['verification/browser-report.json'] = REPORT.read_bytes()
    assert all(not name.startswith('/') and '..' not in PurePosixPath(name).parts for name in entries)
    entries['SHA256SUMS.txt'] = ''.join(
        digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())
    ).encode()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, 'x', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(set(archive.namelist()))
        for line in archive.read('SHA256SUMS.txt').decode().splitlines():
            expected, name = line.split('  ', 1)
            assert digest(archive.read(name)) == expected
        assert not any(name.endswith('.map') or '/.env' in name or 'node_modules' in name for name in archive.namelist())
    shutil.copyfile(OUTPUT, TEMPORARY)
    assert digest(OUTPUT.read_bytes()) == digest(TEMPORARY.read_bytes())
    (OUTPUT.parent / 'SHA256SUMS.txt').write_text(''.join(
        digest(file.read_bytes()) + '  ' + file.name + '\n'
        for file in sorted(OUTPUT.parent.glob('*.zip'))
    ))
    print(json.dumps({'projectZip': str(OUTPUT), 'temporaryZip': str(TEMPORARY),
                      'files': len(entries), 'bytes': OUTPUT.stat().st_size,
                      'sha256': digest(OUTPUT.read_bytes()), 'browserScenes': report['scenes']}))


if __name__ == '__main__':
    main()
