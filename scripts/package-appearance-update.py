#!/usr/bin/env python3
"""Package verified public builds without credentials, source maps or dependencies."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/pinevela-appearance-update-20261030.zip')
APK_OUT = ROOT / 'releases/android/pinevela-appearance-update-20261030.apk'
EVIDENCE = ROOT / 'docs/verification/appearance-2026-10-30'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    android = json.loads((EVIDENCE / 'android/result.json').read_text())
    browser = json.loads((EVIDENCE / 'browser/report.json').read_text())
    offline = json.loads((EVIDENCE / 'browser/browser-offline.json').read_text())
    summary = json.loads((EVIDENCE / 'summary.json').read_text())
    scan = json.loads((EVIDENCE / 'artifact-scan.json').read_text())
    assert android['passed'] and android['signedOutStatus401']
    assert browser['passed'] and browser['runtimeExceptions'] == 0
    assert browser['scenes'] == 145
    assert offline['browserError'] == 'ERR_INTERNET_DISCONNECTED'
    assert scan['passed'] and scan['matches'] == 0
    for name in ['typescriptPassed', 'webBuildPassed', 'mobileBuildPassed', 'androidBuildPassed', 'privateDataCheckPassed']:
        assert summary[name]
    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk.read_bytes()) == android['installedApkSha256']
    with zipfile.ZipFile(apk) as archive:
        for file in (ROOT / 'dist-mobile').rglob('*'):
            if file.is_file():
                assert archive.read('assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()) == file.read_bytes()
    entries = {}
    frontend = ROOT / 'dist-supabase'
    for file in sorted(frontend.rglob('*')):
        if file.is_dir():
            continue
        relative = file.relative_to(frontend)
        if file.is_symlink() or file.suffix == '.map' or any(part.startswith('.') for part in relative.parts):
            raise ValueError('Unexpected linked or private frontend artifact')
        entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for name in ['index.html', 'sw.js', 'brand.css', 'brand/caviar-dreams-bold.ttf', 'privacy.html', 'terms.html']:
        assert 'dist-supabase/' + name in entries
    assert entries['dist-supabase/sw.js'] == (ROOT / 'public/sw.js').read_bytes()
    assert b'You\xe2\x80\x99re offline' not in entries['dist-supabase/sw.js']
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(
            rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/appearance-consistency-update-2026-10-30.md').read_bytes()
    for name in ['summary.json', 'artifact-scan.json', 'android/result.json', 'browser/report.json', 'browser/browser-offline.json']:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA APPEARANCE UPDATE - 30 OCTOBER 2026

1. Privately back up dist-supabase/ and dist-supabase-backend/ in your existing
   pinevela-app hosting application.
2. Extract this ZIP inside that pinevela-app root. Replace the two build folders
   without adding an enclosing directory. Do not upload it as public content.
3. Restart the existing Node application in Hosting Manager. Reload online once
   so the new worker can activate; offline reloads then use the browser's screen.

Keep app.cjs, dependencies, environment, private data and hosting settings.
No new SQL migration, DNS, SMTP or API key is required by this update.
The build includes preceding local app/legal/analytics/native-auth work.
It has not been deployed to the live website by this packaging command.

The accompanying APK is a debug-signed development build. Install it over the
existing test build. The Pixel emulator is already updated and signed out.
iOS was not built. Google/CAPTCHA/signup completion was not retested here.

ROLLBACK: restore the previous two hosting build folders, then restart Node.
No .env, credentials, source maps, private backups or node_modules are included.
'''
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n'
                                      for name, data in sorted(entries.items())).encode()
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(OUT) as archive:
        assert archive.testzip() is None
        assert not any(name.endswith('.map') or '/.env' in name for name in archive.namelist())
    APK_OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(apk, APK_OUT)
    (APK_OUT.parent / 'SHA256SUMS.txt').write_text(''.join(digest(file.read_bytes()) + '  ' + file.name + '\n'
                                                      for file in sorted(APK_OUT.parent.glob('*.apk'))))
    sums = OUT.with_name('pinevela-appearance-update-20261030-SHA256SUMS.txt')
    sums.write_text(''.join(digest(file.read_bytes()) + '  ' + str(file) + '\n' for file in [OUT, APK_OUT]))
    print(json.dumps({'zip': str(OUT), 'apk': str(APK_OUT), 'zipFiles': len(entries),
                      'zipBytes': OUT.stat().st_size, 'apkSha256': digest(APK_OUT.read_bytes())}))


if __name__ == '__main__':
    main()
