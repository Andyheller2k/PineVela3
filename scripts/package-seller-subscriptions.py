#!/usr/bin/env python3
"""Package the checked subscription UI without deploying or including secrets."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/seller-subscriptions-2026-10-31'
ZIP_OUT = ROOT / 'releases/web/pinevela-seller-subscriptions-20261031.zip'
APK_OUT = ROOT / 'releases/android/pinevela-seller-subscriptions-20261031.apk'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def report(name):
    return json.loads((EVIDENCE / name).read_text())


def main():
    browser, regressions = report('browser/report.json'), report('regressions/report.json')
    native, scan, summary = report('android/result.json'), report('artifact-scan.json'), report('summary.json')
    assert browser['passed'] and browser['scenes'] == 33
    assert browser['runtimeExceptions'] == browser['hostedOrAccountWrites'] == 0
    assert browser['syntheticSubscriptionCheckouts'] == 3
    assert regressions['passed'] and regressions['scenes'] == 10
    assert regressions['runtimeExceptions'] == regressions['hostedOrAccountWrites'] == 0
    assert scan['passed'] and scan['matches'] == 0
    assert report('backend-build-comparison.json')['unchangedSincePreviousMobileUiUpdate']
    for field in ['typescriptPassed', 'webBuildPassed', 'mobileBuildPassed', 'androidBuildPassed',
                  'capacitorSyncPassed', 'focusedTestsPassed', 'browserChecksPassed',
                  'regressionChecksPassed', 'diffCheckPassed']:
        assert summary[field], field
    assert summary['focusedTestCount'] == 13 and not summary['deployedRemotely']
    for field in ['passed', 'actualAndroidWebView', 'localStartupPassed', 'styleProbesPassed',
                  'normalReopenPreservedApk', 'originalAppearanceRestored', 'emulatorShutdown']:
        assert native[field], field
    for field in ['accountFormsSubmitted', 'paymentActionsSubmitted', 'authenticatedSellerFlowTested', 'appDataCleared']:
        assert not native[field], field
    for filename, expected in scan['manifests'].items():
        assert digest((ROOT / filename).read_bytes()) == expected, 'Build changed after scan: ' + filename
    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk.read_bytes()) == native['installedApkSha256'] == summary['apkSha256']
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
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/seller-subscriptions-update-2026-10-31.md').read_bytes()
    for name in ['summary.json', 'artifact-scan.json', 'backend-build-comparison.json',
                 'android/result.json', 'browser/report.json', 'browser/subscription-measurements.json', 'regressions/report.json']:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA SELLER SUBSCRIPTIONS - 31 OCTOBER 2026

1. Privately back up the two existing hosting build folders.
2. Extract this ZIP directly into your existing pinevela-app root, replacing
   dist-supabase/ and dist-supabase-backend/ without an enclosing folder.
3. Restart the existing Node app in Spaceship Hosting Manager and reload.

Keep app.cjs, node_modules, environment variables, private data and hosting
settings. Keep the ZIP outside the public web root. No new dependency, SQL
migration, DNS, SMTP or OAuth change is needed. The unchanged backend is
included so the package is complete alongside preceding local updates.

Seller plans now compare Default with Star and Star with Pro. Pro shows current
benefits and renewal. Page actions are blue Light/yellow Dark; navigation and
Become a Merchant retain gold. Prices come from current admin settings; no
preview/example rates are hardcoded into the seller UI. Existing settings
refresh and secure server-priced checkout remain. Missing rates disable the
relevant checkout. Registration/two-month fees and other plan choices remain.

Verification: 33 local subscription browser scenarios, 10 seller/public
regression scenarios, 13 unit checks, typecheck and web/mobile/Android builds
passed. Local fixture checkout requests never reach Paystack or a real account.
The real Android installed build starts locally and survives normal Quick Boot
reopening. Separate SSR markup/CSS probes check the actual bundled styles in
both themes; they are NOT an authenticated native seller/checkout test.
No real account, payment or AI operation was submitted. iOS was not built.

This package has NOT been deployed remotely. The development APK is saved
separately in PineVela3/releases/android/ and is debug-signed, not Play-ready.
Earlier APKs and ZIPs remain saved. See verification/ and UPDATE-NOTES.md.

ROLLBACK: restore the previous hosting build folders and restart Node.
No .env, credentials, source maps, private backups or node_modules are included.
'''
    for name in entries:
        assert not name.startswith('/') and '..' not in PurePosixPath(name).parts
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
    print(json.dumps({'zip': str(ZIP_OUT), 'temporaryZip': str(temporary), 'apk': str(APK_OUT),
                      'zipFiles': len(entries), 'zipBytes': ZIP_OUT.stat().st_size,
                      'apkSha256': digest(APK_OUT.read_bytes())}))


if __name__ == '__main__':
    main()
