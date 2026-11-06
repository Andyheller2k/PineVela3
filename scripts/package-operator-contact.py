#!/usr/bin/env python3
"""Package the verified operator/contact revision without overwriting releases."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

BASE = Path(__file__).resolve().parents[1]
EVIDENCE = BASE / 'docs/verification/operator-contact-2026-11-05'
NAME = 'pinevela-operator-contact-20261105'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    summary = json.loads((EVIDENCE / 'summary.json').read_text())
    assert summary['passed'] and not summary['deployedRemotely']
    for relative, digest in summary['sourceAndBuildSha256'].items():
        file = BASE / relative
        assert file.is_file() and not file.is_symlink()
        assert sha(file.read_bytes()) == digest, 'Verified file changed: ' + relative
    browser = json.loads((EVIDENCE / 'browser/report.json').read_text())
    assert browser['passed']
    scan = json.loads((EVIDENCE / 'artifact-scan.json').read_text())
    assert scan['passed'] and scan['matches'] == 0
    assert json.loads((EVIDENCE / 'content-and-apk-check.json').read_text())['passed']

    entries = {}
    frontend = BASE / 'dist-supabase'
    for file in sorted(frontend.rglob('*')):
        if not file.is_file():
            continue
        assert not file.is_symlink() and file.suffix != '.map'
        relative = file.relative_to(frontend)
        assert not any(part.startswith('.') for part in relative.parts)
        entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = BASE / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(
            rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    sql_file = BASE / 'releases/database/pinevela-apply-operator-contact-20261105.sql'
    sql = sql_file.read_bytes()
    assert sha(sql) == summary['sqlEditorFileSha256']
    entries['database/APPLY-operator-contact.sql'] = sql
    entries['docs/operator-contact-update-2026-11-05.md'] = (
        BASE / 'docs/operator-contact-update-2026-11-05.md').read_bytes()
    for name in ['summary.json', 'content-and-apk-check.json', 'focused-tests.json']:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['verification/browser-report.json'] = (EVIDENCE / 'browser/report.json').read_bytes()
    entries['README-INSTALL.txt'] = (
        'PINEVELA OPERATOR / CONTACT UPDATE - 5 NOVEMBER 2026\n\n'
        'Public operator: PineVela Ghana\nContact: pinevela@pinevela.app\n\n'
        '1. FIRST run database/APPLY-operator-contact.sql in SQL Editor for your\n'
        '   existing Supabase project bivajljcdeofyxzmplxm. It is repeatable and\n'
        '   preserves old Terms and receipts. No account is marked accepted.\n'
        '2. Back up the existing dist-supabase and dist-supabase-backend folders.\n'
        '   Extract this ZIP into the existing pinevela-app root, overwrite those\n'
        '   two folders and restart the Node app. Keep configuration, environment,\n'
        '   dependencies and private keys. No dependency installation is needed.\n'
        '3. Install the matching development APK over the existing Android debug\n'
        '   app. Do not uninstall or clear data. Older APKs contain older Terms.\n'
        '4. Reload; returning accounts explicitly accept Terms version 2026-11-05.\n'
        '   Check the policies and Help email. The old accepted article remains\n'
        '   unchanged for evidence. No account login email is changed.\n\n'
        'This is a cumulative build including the preceding navigation fixes.\n'
        'The documentation drafting pack is separate; keep it out of the website.\n'
        'Local checks passed. Hosting/database deployment and an iOS build were\n'
        'not performed. See docs/operator-contact-update-2026-11-05.md.\n'
    ).encode()
    entries['SHA256SUMS.txt'] = ''.join(
        sha(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()

    web = BASE / 'releases/web' / (NAME + '.zip')
    apk = BASE / 'releases/android' / (NAME + '.apk')
    temporary = Path('/tmp') / web.name
    for target in [web, apk, temporary]:
        assert not target.exists(), 'Preserve existing release: ' + str(target)
        target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(web, 'x', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(web) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(entries)
        for name, data in entries.items():
            assert archive.read(name) == data
        assert not any(name.endswith('.map') or '/.env' in name for name in archive.namelist())
    source_apk = BASE / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert sha(source_apk.read_bytes()) == summary['apkSourceSha256']
    shutil.copyfile(source_apk, apk)
    shutil.copyfile(web, temporary)
    assert sha(web.read_bytes()) == sha(temporary.read_bytes())
    drafts = BASE / 'releases/documentation/pinevela-documentation-drafts-20261105.zip'
    temporary_drafts = Path('/tmp') / drafts.name
    assert not temporary_drafts.exists()
    shutil.copyfile(drafts, temporary_drafts)
    for target in [apk, web]:
        with (target.parent / 'SHA256SUMS.txt').open('a') as checksums:
            checksums.write(sha(target.read_bytes()) + '  ' + target.name + '\n')
    report = {'passed': True, 'archiveEntries': len(entries), 'zip': str(web),
              'zipBytes': web.stat().st_size, 'zipSha256': sha(web.read_bytes()),
              'apk': str(apk), 'apkBytes': apk.stat().st_size,
              'apkSha256': sha(apk.read_bytes()), 'tmpZip': str(temporary),
              'sql': str(sql_file), 'draftsZip': str(drafts),
              'deployedRemotely': False, 'emulatorAppChanged': False}
    (EVIDENCE / 'package-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
