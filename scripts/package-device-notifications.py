#!/usr/bin/env python3
"""Package verified public builds; keep every private sender file outside ZIP/APK."""
from pathlib import Path
from hashlib import sha256
import json
import re
import shlex
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/device-push-2026-11-05'
NAME = 'pinevela-device-notifications-20261105'


def digest(value):
    return sha256(value).hexdigest()


def report(name):
    data = json.loads((EVIDENCE / name).read_text())
    assert data['passed'], name
    return data


def main():
    database = report('database-http-report.json')
    browser = report('browser/report.json')
    live = report('live-sql-application.json')
    provider = report('provider-validation.json')
    android_report = report('android/report.json')
    assert database['checks'] >= 100 and browser['checks'] >= 49
    assert provider['validationOnly'] and provider['notificationsSent'] == 0
    assert live['databaseOnly'] and live['counts']['installations'] == live['counts']['jobs'] == 0
    assert android_report['actualFcmDelivery'] and android_report['temporaryRegistrationRemoved']
    tests = (EVIDENCE / 'unit-tests.log').read_text()
    assert re.search(r'^# fail 0$', tests, re.M)
    assert 'tsc --noEmit' in (EVIDENCE / 'typecheck.log').read_text()
    assert not re.search(r'error TS\d+', (EVIDENCE / 'typecheck.log').read_text())
    assert 'BUILD SUCCESSFUL' in (EVIDENCE / 'android-build.log').read_text()
    assert 'Done in' in (EVIDENCE / 'web-build.log').read_text()
    for name, expected in database['sourceSha256'].items():
        assert digest((ROOT / name).read_bytes()) == expected, name
    sql = (ROOT / 'releases/database/pinevela-apply-device-push-20261105.sql').read_bytes()
    assert digest(sql) == database['sqlEditorSha256'] == live['sqlEditorSha256']

    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    apk_digest = digest(apk.read_bytes())
    assert apk_digest == android_report['apkSha256']
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
    for name in ['package.json', 'package-lock.json']:
        entries[name] = (ROOT / name).read_bytes()
    entries['database/APPLY-device-notifications.sql'] = sql
    entries['docs/device-notifications-2026-11-05.md'] = (ROOT / 'docs/device-notifications-2026-11-05.md').read_bytes()
    for name in ['database-http-report.json', 'browser/report.json', 'android/report.json', 'provider-validation.json', 'live-sql-application.json']:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['README-INSTALL.txt'] = (
        'PINEVELA DEVICE NOTIFICATIONS - 5 NOVEMBER 2026\n\n'
        'The database migration is already applied to your existing Supabase project.\n'
        'No user has been subscribed automatically.\n\n'
        '1. Back up both existing dist folders and dependency manifests. Extract\n'
        '   this archive into the existing pinevela-app root. Preserve .env,\n'
        '   private configuration, database CA and delivery-PIN keys.\n'
        '2. Copy the two local .security/push sender JSON files into the PRIVATE\n'
        '   Node application folder, outside public website folders. Files: 600;\n'
        '   directory: 700. They are intentionally absent from this public ZIP.\n'
        '3. Set PUSH_FCM_PROJECT_ID=pinevela and the hosting file paths for\n'
        '   PUSH_FCM_KEY_FILE and PUSH_WEB_KEY_FILE. Preserve Web Push keys.\n'
        '4. With the existing Node 22 runtime, run npm ci --omit=dev, then restart\n'
        '   the Node application. The new sender dependencies must be installed.\n'
        '5. Install the matching development APK over PineVela Development.\n'
        '   Do not uninstall or clear data. This is not a Play Store release AAB.\n'
        '6. Options -> Device notifications -> Enable -> Send a test. Connect\n'
        '   other verified accounts explicitly. Discovery choices are optional.\n\n'
        'Read docs/device-notifications-2026-11-05.md for exact paths and checks.\n'
        'The database is deployed. This ZIP is not yet installed on Spaceship;\n'
        'hosted queue-to-device delivery still needs its live enable/test step.\n'
    ).encode()

    patterns = {}
    fcm = json.loads((ROOT / '.security/push/firebase-service-account.json').read_text())
    web = json.loads((ROOT / '.security/push/web-push-keys.json').read_text())
    patterns['Firebase private key'] = fcm['private_key'].encode()
    patterns['Firebase private key material'] = fcm['private_key'].splitlines()[1].encode()
    patterns['Firebase key identifier'] = fcm['private_key_id'].encode()
    patterns['Firebase sender identity'] = fcm['client_email'].encode()
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
        assert config['plugins']['PushNotifications']['presentationOptions'] == ['badge', 'sound', 'banner', 'list']
        assert not config.get('server', {}).get('url')
        plugins = json.loads(archive.read('assets/capacitor.plugins.json'))
        assert any(p['pkg'] == '@capacitor/push-notifications' for p in plugins)
    scan_report = {'passed': not matches, 'matches': len(matches), 'patternsChecked': len(patterns), 'zipAndApk': True}
    (EVIDENCE / 'artifact-scan.json').write_text(json.dumps(scan_report, indent=2) + '\n')
    assert not matches, 'Private credential found in an artifact; packaging stopped.'
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
    apk_destination = ROOT / 'releases/android' / (NAME + '.apk')
    if not apk_destination.exists():
        shutil.copyfile(apk, apk_destination)
    assert digest(apk_destination.read_bytes()) == apk_digest
    tmp = Path('/tmp') / destination.name
    if not tmp.exists():
        shutil.copyfile(destination, tmp)
    assert digest(tmp.read_bytes()) == digest(destination.read_bytes())
    for file in [destination, apk_destination]:
        checksums = file.parent / 'SHA256SUMS.txt'
        line = digest(file.read_bytes()) + '  ' + file.name + '\n'
        if not checksums.exists() or line not in checksums.read_text():
            with checksums.open('a') as out:
                out.write(line)
    summary = {'passed': True, 'unitTests': int(re.search(r'^# pass (\d+)$', tests, re.M)[1]),
               'databaseHttpChecks': database['checks'], 'browserChecks': browser['checks'],
               'androidChecks': android_report['checks'], 'actualFcmEmulatorDelivery': True,
               'databaseApplied': True, 'hostedAppDeployed': False, 'hostedQueueDeliveryVerified': False,
               'zip': str(destination), 'zipSha256': digest(destination.read_bytes()),
               'apk': str(apk_destination), 'apkSha256': apk_digest, 'tmpZip': str(tmp),
               'entries': len(entries), 'privateCredentialMatches': 0}
    (EVIDENCE / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
