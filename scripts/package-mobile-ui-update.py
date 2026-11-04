#!/usr/bin/env python3
"""Package the verified mobile UI update; never deploy or include credentials."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/mobile-ui-2026-10-31'
ZIP_OUT = ROOT / 'releases/web/pinevela-mobile-ui-update-20261031.zip'
APK_OUT = ROOT / 'releases/android/pinevela-mobile-ui-update-20261031.apk'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_report(name):
    return json.loads((EVIDENCE / name).read_text())


def main():
    browser = read_report('browser/report.json')
    regressions = read_report('regressions/report.json')
    android = read_report('android/result.json')
    scan = read_report('artifact-scan.json')
    summary = read_report('summary.json')
    assert browser['passed'] and browser['scenes'] == 110
    assert browser['runtimeExceptions'] == browser['hostedOrAccountWrites'] == 0
    assert sum('mobile UI' in name for name in browser['checks']) == 70
    assert sum('product fixture' in name for name in browser['checks']) == 40
    assert regressions['passed'] and regressions['scenes'] == 10
    assert regressions['runtimeExceptions'] == regressions['hostedOrAccountWrites'] == 0
    assert scan['passed'] and scan['matches'] == 0
    assert read_report('navigation-audit.json')['passed']
    assert read_report('backend-build-comparison.json')['unchangedSincePreviousSellerUpdate']
    for field in ['typescriptPassed', 'webBuildPassed', 'mobileBuildPassed',
                  'androidBuildPassed', 'capacitorSyncPassed', 'focusedTestsPassed',
                  'browserChecksPassed', 'regressionChecksPassed', 'diffCheckPassed']:
        assert summary[field], field
    assert summary['focusedTestCount'] == 9 and not summary['deployedRemotely']
    # Native flow completeness is reported separately from successful CSS probes.
    assert android['actualAndroidWebView'] and android['scopedStyleProbesPassed']
    assert android['finalBuildReinstalledAndChecksPassed']
    assert not android['accountFormsSubmitted'] and not android['sessionsCleared']
    assert not android['authenticatedSellerFlowsTested']
    assert not android['authenticatedPurchaseFlowsTested']
    assert not android['livePaymentsAttempted']
    assert summary['fullNativeInteractionSuitePassed'] == android['passed']
    for filename, expected in scan['manifests'].items():
        assert digest((ROOT / filename).read_bytes()) == expected, 'Build changed after scan: ' + filename
    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk.read_bytes()) == android['installedApkSha256'] == summary['apkSha256']
    with zipfile.ZipFile(apk) as archive:
        for file in (ROOT / 'dist-mobile').rglob('*'):
            if file.is_file():
                assert not file.is_symlink()
                assert archive.read('assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()) == file.read_bytes()
    entries = {}
    frontend = ROOT / 'dist-supabase'
    for file in sorted(frontend.rglob('*')):
        if file.is_dir():
            continue
        relative = file.relative_to(frontend)
        assert not file.is_symlink() and file.suffix != '.map'
        assert not any(part.startswith('.') for part in relative.parts)
        entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    entries['tools/pinevela-check-payment-environment.cjs'] = (ROOT / 'scripts/check-payment-environment.cjs').read_bytes()
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/mobile-ui-update-2026-10-31.md').read_bytes()
    for name in ['summary.json', 'artifact-scan.json', 'navigation-audit.json',
                 'backend-build-comparison.json', 'android/result.json',
                 'android/css-probes.json', 'browser/report.json',
                 'browser/mobile-ui-geometry.json', 'regressions/report.json']:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA MOBILE UI UPDATE - 31 OCTOBER 2026

1. Privately back up dist-supabase/ and dist-supabase-backend/ in your existing
   pinevela-app hosting application.
2. Extract this ZIP into that application root. Replace the TWO build folders
   directly, without an enclosing folder. Keep the ZIP outside the public root.
3. Restart the existing Node app in Spaceship Hosting Manager and reload the site.

Keep app.cjs, node_modules, environment variables, private data and hosting
settings. No new dependency, SQL migration, DNS, SMTP or OAuth change is needed.
The unchanged backend is included to keep this package self-contained alongside
the preceding local updates. Preserve the saved PAYSTACK_SECRET_KEY; never copy
it into public files. The optional read-only payment configuration checker is
in tools/. No live payment was submitted during verification.

Become a Merchant stays gold/yellow in BOTH themes, as do app navigation
selections. Page actions and filters use blue Light/yellow Dark. Mobile cards
and purchases are compact; purchase PIN, map and actions open on expansion.

Verification: 110 local browser fixture scenarios, 10 regression scenarios,
9 focused unit checks, typecheck and web/mobile/Android builds passed. No real
account, order, payment or AI operation was submitted by the browser checks.
Actual Android signed-out startup/local login and separate installed-WebView
CSS probes were checked. The full native interaction suite remains incomplete:
the accessibility hierarchy for the Sign Up tab was unavailable after one
retry. Authenticated seller and purchase flows were not tested on Android.
See verification/ for the exact results and limits. iOS was not built.

This package has NOT been deployed remotely. Install and test the separately
saved development APK before distribution; it is debug-signed, not Play-ready.
The APK is in releases/android/ in the local PineVela3 project, not in this ZIP.

ROLLBACK: restore the previous two hosting build folders and restart Node.
No .env, credentials, private backups, source maps or node_modules are included.
'''
    for name in entries:
        parts = PurePosixPath(name).parts
        assert not name.startswith('/') and '..' not in parts
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    ZIP_OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_OUT, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(ZIP_OUT) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(set(archive.namelist()))
        for line in archive.read('SHA256SUMS.txt').decode().splitlines():
            expected, name = line.split('  ', 1)
            assert digest(archive.read(name)) == expected
        assert not any(name.endswith('.map') or '/.env' in name for name in archive.namelist())
    APK_OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(apk, APK_OUT)
    for directory, pattern in [(APK_OUT.parent, '*.apk'), (ZIP_OUT.parent, '*.zip')]:
        (directory / 'SHA256SUMS.txt').write_text(''.join(digest(file.read_bytes()) + '  ' + file.name + '\n' for file in sorted(directory.glob(pattern))))
    temporary = Path('/tmp') / ZIP_OUT.name
    shutil.copyfile(ZIP_OUT, temporary)
    assert temporary.read_bytes() == ZIP_OUT.read_bytes()
    print(json.dumps({'zip': str(ZIP_OUT), 'temporaryZip': str(temporary),
                      'apk': str(APK_OUT), 'zipFiles': len(entries),
                      'zipBytes': ZIP_OUT.stat().st_size,
                      'apkSha256': digest(APK_OUT.read_bytes())}))


if __name__ == '__main__':
    main()
