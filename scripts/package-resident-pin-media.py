#!/usr/bin/env python3
"""Package the verified cumulative app while retaining earlier releases and secrets."""
from pathlib import Path
from hashlib import sha256
import json
import re
import shlex
import shutil
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/resident-pin-media-2026-11-05'
NAME = 'pinevela-resident-pin-media-20261105'


def digest(value):
    return sha256(value).hexdigest()


def report(name):
    data = json.loads((EVIDENCE / name).read_text())
    assert data['passed'], name
    return data


def main():
    database = report('database-auth-http-report.json')
    live = report('live-sql-application.json')
    units = report('unit-tests.json')
    cache = report('browser-cache/report.json')
    touch = report('browser-touch/report.json')
    pin_ui = report('browser-resident-pin/report.json')
    android = report('android/verified.json')
    installed = report('android/debug-install.json')
    assert database['checks'] == 88 and database['realGoTrue'] and database['nativeTokensIssuedByGoTrue']
    assert live['databaseOnly'] and live['rolledBackDryRunPassed'] and live['credentialRls']
    assert units['tests'] == 54 and cache['scenes'] == 18 and touch['scenes'] == 16 and pin_ui['scenes'] == 12
    assert len(android['touchPresses']) == 16 and all(t['actualAndroidTouch'] for t in android['touchPresses'])
    assert installed['noDataClearing'] and installed['packageWritesFlushed'] and not installed['logoutPerformed']
    assert 'OK (29 tests)' in (EVIDENCE / 'android-instrumentation.log').read_text()
    assert 'BUILD SUCCESSFUL' in (EVIDENCE / 'android-build.log').read_text()
    assert 'tsc --noEmit' in (EVIDENCE / 'typecheck.log').read_text()
    assert not re.search(r'error TS\d+', (EVIDENCE / 'typecheck.log').read_text())
    assert 'Done in' in (EVIDENCE / 'web-backend-build.log').read_text()
    jvm = [ET.parse(p).getroot() for p in (ROOT / 'android/app/build/test-results/testDebugUnitTest').glob('TEST-*.xml')]
    assert jvm and all(int(t.attrib['failures']) == int(t.attrib['errors']) == 0 for t in jvm)
    jvm_count = sum(int(t.attrib['tests']) for t in jvm)
    assert jvm_count == 10
    for file, expected in database['sourceSha256'].items():
        assert digest((ROOT / file).read_bytes()) == expected, file
    sql = (ROOT / 'releases/database/pinevela-apply-resident-pin-media-20261105.sql').read_bytes()
    assert digest(sql) == database['sqlEditorSha256'] == live['sqlEditorSha256']

    apk = ROOT / 'releases/android' / (NAME + '.apk')
    assert digest(apk.read_bytes()) == installed['installedDebugSha256']
    assert apk.read_bytes() == (ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk').read_bytes()
    entries = {}
    for file in sorted((ROOT / 'dist-supabase').rglob('*')):
        if file.is_file():
            assert not file.is_symlink() and file.suffix != '.map'
            name = 'dist-supabase/' + file.relative_to(ROOT / 'dist-supabase').as_posix()
            assert not any(part.startswith('.') for part in Path(name).parts)
            entries[name] = file.read_bytes()
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        entries['dist-supabase-backend/' + name] = re.sub(
            rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', (ROOT / 'dist-supabase-backend' / name).read_bytes())
    with zipfile.ZipFile(ROOT / 'releases/web/pinevela-device-notifications-20261105.zip') as previous:
        for name in ['package.json', 'package-lock.json']:
            entries[name] = (ROOT / name).read_bytes()
            assert entries[name] == previous.read(name), 'Dependency changes require a separate install review'
    entries['database/APPLY-resident-pin-media.sql'] = sql
    entries['docs/resident-pin-media-update-2026-11-05.md'] = (ROOT / 'docs/resident-pin-media-update-2026-11-05.md').read_bytes()
    for name in ['database-auth-http-report.json', 'live-sql-application.json', 'unit-tests.json',
                 'browser-cache/report.json', 'browser-cache/measurements.json',
                 'browser-touch/report.json', 'browser-resident-pin/report.json',
                 'browser-resident-pin/resident-pin-ui.json', 'android/debug-install.json']:
        file = EVIDENCE / name
        if file.exists():
            entries['verification/' + name] = file.read_bytes()
    native = {'passed': True, 'actualAndroidWebView': True, 'scenes': len(android['scenes']),
              'heldTouchChecks': len(android['touchPresses']), 'instrumentationTests': 29,
              'jvmTests': jvm_count, 'syntheticFixturesOnly': True, 'debugAppDataPreserved': True}
    entries['verification/android-summary.json'] = json.dumps(native, indent=2).encode()
    entries['README-INSTALL.txt'] = (
        'PINEVELA RESIDENT PIN / PHOTOS / ANDROID NAVIGATION - 5 NOVEMBER 2026\n\n'
        'DATABASE: both migrations are already applied to the existing project.\n'
        'HOSTING: this newer cumulative ZIP has NOT been deployed.\n'
        'ANDROID: the matching development APK is installed on the emulator.\n\n'
        'Back up dist-supabase and dist-supabase-backend in your existing\n'
        '/home/jqmgxgpuym/pinevela-app folder. Extract this ZIP into that root,\n'
        'then restart Node in cPanel. No new dependencies or sender files are\n'
        'needed for this update; dependency manifests match the push release.\n'
        'Preserve all environment variables, .env, database CA and .security\n'
        'files, including the private delivery-PIN master and push keys.\n'
        'No private file is included here. SQL need not be run again.\n\n'
        'Resident PIN login/activation requires this backend update. Existing\n'
        'primary passwords and legacy resident/seller credentials are retained.\n'
        'Verify a genuine owner activation/login and image upload after restart.\n'
        'Read docs/resident-pin-media-update-2026-11-05.md for details.\n'
    ).encode()

    patterns = {}
    fcm = json.loads((ROOT / '.security/push/firebase-service-account.json').read_text())
    web = json.loads((ROOT / '.security/push/web-push-keys.json').read_text())
    for name in ['private_key', 'private_key_id', 'client_email']:
        patterns['Firebase ' + name] = fcm[name].encode()
    patterns['Firebase private key material'] = fcm['private_key'].splitlines()[1].encode()
    patterns['Web Push private key'] = web['privateKey'].encode()
    for line in (ROOT / '.env').read_text().splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        name, raw = line.split('=', 1)
        public_name = name.startswith('VITE_') or re.search(r'PUBLIC|PUBLISHABLE|ANON|SITE_KEY', name, re.I)
        if re.search(r'SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY|ACCESS_TOKEN', name, re.I) and not name.endswith('_FILE') and not public_name:
            try:
                values = shlex.split(raw)
            except ValueError:
                values = []
            if values and len(values[0]) >= 16:
                patterns['Environment ' + name] = values[0].encode()
    matches = []

    def scan(name, data):
        for label, value in patterns.items():
            if value in data:
                matches.append({'file': name, 'credential': label})
        if re.search(rb'-----BEGIN PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{64}', data):
            matches.append({'file': name, 'credential': 'PEM private key'})

    for name, data in entries.items():
        scan(name, data)
    with zipfile.ZipFile(apk) as archive:
        assert not any(name.endswith('.map') or 'google-services.json' in name or '/.env' in name for name in archive.namelist())
        for info in archive.infolist():
            if not info.is_dir():
                scan('APK/' + info.filename, archive.read(info))
        for file in (ROOT / 'dist-mobile').rglob('*'):
            if file.is_file():
                assert archive.read('assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()) == file.read_bytes()
        config = json.loads(archive.read('assets/capacitor.config.json'))
        assert not config.get('server', {}).get('url')
    scan_report = {'passed': not matches, 'privateCredentialMatches': len(matches), 'patternsChecked': len(patterns), 'zipAndApk': True}
    (EVIDENCE / 'artifact-scan.json').write_text(json.dumps(scan_report, indent=2) + '\n')
    assert not matches, 'Credential match stopped packaging; no secret is printed.'
    entries['verification/artifact-scan.json'] = json.dumps(scan_report, indent=2).encode()
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    destination = ROOT / 'releases/web' / (NAME + '.zip')
    if not destination.exists():
        with zipfile.ZipFile(destination, 'x', zipfile.ZIP_DEFLATED) as archive:
            for name, data in sorted(entries.items()):
                info = zipfile.ZipInfo(name, date_time=(2026, 11, 5, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None and set(archive.namelist()) == set(entries)
        for name, data in entries.items():
            assert archive.read(name) == data
    tmp = Path('/tmp') / destination.name
    if not tmp.exists():
        shutil.copyfile(destination, tmp)
    assert tmp.read_bytes() == destination.read_bytes()
    for file in [destination, apk]:
        checksums = file.parent / 'SHA256SUMS.txt'
        line = digest(file.read_bytes()) + '  ' + file.name + '\n'
        if not checksums.exists() or line not in checksums.read_text():
            with checksums.open('a') as out:
                out.write(line)
    summary = {'passed': True, 'unitTests': units['tests'], 'databaseHttpChecks': database['checks'],
               'browserScenes': cache['scenes'] + touch['scenes'] + pin_ui['scenes'], 'android': native,
               'databaseApplied': True, 'androidAppUpdatedInPlace': True, 'hostedAppDeployed': False,
               'hostedNewResidentFlowVerified': False, 'previousBrowserPushFixAlreadyLive': True,
               'zip': str(destination), 'zipSha256': digest(destination.read_bytes()), 'zipBytes': destination.stat().st_size,
               'apk': str(apk), 'apkSha256': digest(apk.read_bytes()), 'apkBytes': apk.stat().st_size,
               'sqlEditorSha256': digest(sql), 'entries': len(entries), 'privateCredentialMatches': 0}
    (EVIDENCE / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
