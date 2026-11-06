#!/usr/bin/env python3
"""Package the verified Chromium provider fix without sender credentials."""
from pathlib import Path
from hashlib import sha256
import difflib
import json
import re
import shlex
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/device-push-chromium-2026-11-05'
NAME = 'pinevela-browser-push-fix-20261105.zip'


def digest(data):
    return sha256(data).hexdigest()


def main():
    report = json.loads((EVIDENCE / 'database-http-report.json').read_text())
    baseline = json.loads((ROOT / 'docs/verification/device-push-2026-11-05/database-http-report.json').read_text())
    assert report['passed'] and report['checks'] == 113
    assert report['cloudMessagesSent'] == report['cloudDatabaseWrites'] == 0
    for name, expected in report['sourceSha256'].items():
        assert digest((ROOT / name).read_bytes()) == expected, name
        if name != 'supabase/devicePushProvider.ts':
            assert expected == baseline['sourceSha256'][name], name
    tests = (EVIDENCE / 'unit-tests.log').read_text()
    assert re.search(r'^# pass 9$', tests, re.M) and re.search(r'^# fail 0$', tests, re.M)
    assert (EVIDENCE / 'typecheck.log').read_text().strip() == 'tsc --noEmit'
    assert 'Done in' in (EVIDENCE / 'backend-build.log').read_text()

    with zipfile.ZipFile(ROOT / 'releases/web/pinevela-device-notifications-20261105.zip') as previous:
        old_bundle = previous.read('dist-supabase-backend/supabase-server.mjs')
    bundle = re.sub(rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n',
                    (ROOT / 'dist-supabase-backend/supabase-server.mjs').read_bytes())
    changes = list(difflib.unified_diff(old_bundle.decode().splitlines(True), bundle.decode().splitlines(True),
                                      fromfile='previous/supabase-server.mjs', tofile='updated/supabase-server.mjs', n=4))
    assert sum(line.startswith('@@') for line in changes) == 1
    assert 'jmt17.google.com' in ''.join(changes)
    (EVIDENCE / 'backend.patch').write_text(''.join(changes))
    with tempfile.NamedTemporaryFile(suffix='.mjs', prefix='pinevela-browser-push-', delete=False) as file:
        file.write(bundle)
        check_file = Path(file.name)
    try:
        subprocess.run(['node', '--check', str(check_file)], check=True, capture_output=True)
    finally:
        check_file.unlink()

    entries = {'dist-supabase-backend/supabase-server.mjs': bundle,
               'docs/device-notifications-chromium-2026-11-05.md': (ROOT / 'docs/device-notifications-chromium-2026-11-05.md').read_bytes(),
               'verification/database-http-report.json': (EVIDENCE / 'database-http-report.json').read_bytes(),
               'verification/backend.patch': (EVIDENCE / 'backend.patch').read_bytes()}
    entries['README-INSTALL.txt'] = (
        'PINEVELA CHROME/CHROMIUM PUSH FIX - 5 NOVEMBER 2026\n\n'
        'Requires the existing device-notification update and its dependencies.\n'
        '1. Back up dist-supabase-backend/supabase-server.mjs.\n'
        '2. Extract this ZIP into the existing pinevela-app folder and replace\n'
        '   the included server bundle. Preserve all other files and settings.\n'
        '3. Restart the existing Node application.\n'
        '4. Refresh PineVela, open Options -> Device notifications, and Enable.\n'
        '   Then use Send a test on the same account/device.\n\n'
        'No SQL, environment changes, npm installation or Android APK update.\n'
        'Do not replace sender keys or clear browser data.\n'
        'Verified: 9 focused tests, 113 isolated PostgreSQL/API checks,\n'
        'TypeScript, module syntax, and one changed production validation block.\n'
        'Live browser delivery must be checked after deployment.\n'
    ).encode()
    patterns = []
    fcm = json.loads((ROOT / '.security/push/firebase-service-account.json').read_text())
    web = json.loads((ROOT / '.security/push/web-push-keys.json').read_text())
    patterns += [fcm['private_key'].encode(), fcm['private_key'].splitlines()[1].encode(),
                 fcm['private_key_id'].encode(), fcm['client_email'].encode(), web['privateKey'].encode()]
    for line in (ROOT / '.env').read_text().splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        name, raw = line.split('=', 1)
        public = name.startswith('VITE_') or re.search(r'PUBLIC|PUBLISHABLE|ANON|SITE_KEY', name, re.I)
        if not public and not name.endswith('_FILE') and re.search(r'SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY|ACCESS_TOKEN', name, re.I):
            try:
                values = shlex.split(raw)
            except ValueError:
                values = []
            if values and len(values[0]) >= 16:
                patterns.append(values[0].encode())
    for name, data in entries.items():
        assert not any(value in data for value in patterns), 'Private credential in ' + name
        assert '.security' not in Path(name).parts and not name.endswith('.map')
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    destination = ROOT / 'releases/web' / NAME
    assert not destination.exists(), 'Keep existing release artifacts immutable.'
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
        assert archive.read('dist-supabase-backend/supabase-server.mjs') == bundle
    tmp = Path('/tmp') / NAME
    assert not tmp.exists(), 'Keep existing temporary release artifacts immutable.'
    shutil.copyfile(destination, tmp)
    assert digest(tmp.read_bytes()) == digest(destination.read_bytes())
    with (destination.parent / 'SHA256SUMS.txt').open('a') as sums:
        sums.write(digest(destination.read_bytes()) + '  ' + NAME + '\n')
    result = {'passed': True, 'unitTests': 9, 'databaseHttpChecks': report['checks'],
              'backendDiffHunks': 1, 'privateCredentialMatches': 0,
              'zip': str(destination), 'zipSha256': digest(destination.read_bytes()),
              'tmpZip': str(tmp), 'backendSha256': digest(bundle),
              'previousBackendSha256': digest(old_bundle),
              'hostedPatchApplied': False, 'hostedQueueDeliveryVerified': False}
    (EVIDENCE / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
