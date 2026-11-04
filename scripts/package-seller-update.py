#!/usr/bin/env python3
"""Package the seller update with explicit verification limits and no secrets."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/seller-market-2026-10-30'
ZIP_OUT = ROOT / 'releases/web/pinevela-seller-update-20261030.zip'
APK_OUT = ROOT / 'releases/android/pinevela-seller-update-20261030.apk'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    browser = json.loads((EVIDENCE / 'browser/report.json').read_text())
    android = json.loads((EVIDENCE / 'android/result.json').read_text())
    native = json.loads((EVIDENCE / 'android/native-verification-summary.json').read_text())
    scan = json.loads((EVIDENCE / 'artifact-scan.json').read_text())
    summary = json.loads((EVIDENCE / 'summary.json').read_text())
    assert browser['passed'] and browser['runtimeExceptions'] == 0
    assert sum('seller workbench' in name for name in browser['checks']) == 4
    assert sum('seller onboarding blocks' in name for name in browser['checks']) == 2
    assert browser['hostedOrAccountWrites'] == 0
    assert native['actualAndroidWebView'] and native['signedOutStatus401']
    assert native['lightWelcomeBrandingAndNativeBarsPassed']
    assert native['singleMeasuredPhysicalTapOpenedBundledLogin']
    assert not native['accountFormsSubmitted'] and not native['sessionCleared']
    assert summary['fullNativeSuitePassed'] == native['fullSixScenarioSuitePassed'] == android['passed']
    assert scan['passed'] and scan['matches'] == 0
    for name in ['typescriptPassed', 'webBuildPassed', 'mobileBuildPassed', 'androidBuildPassed', 'focusedTestsPassed', 'mobileTestsPassed', 'diffCheckPassed']:
        assert summary[name]
    for filename, expected in scan['manifests'].items():
        assert digest((ROOT / filename).read_bytes()) == expected, 'Build changed after artifact scan'
    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk.read_bytes()) == native['installedFinalApkSha256']
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
            raise ValueError('Unexpected private or linked frontend artifact')
        entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    entries['tools/pinevela-check-payment-environment.cjs'] = (ROOT / 'scripts/check-payment-environment.cjs').read_bytes()
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/seller-market-update-2026-10-30.md').read_bytes()
    for name in ['summary.json', 'artifact-scan.json', 'android/result.json', 'android/native-verification-summary.json', 'browser/report.json']:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA SELLER UPDATE - 30 OCTOBER 2026

1. Privately back up dist-supabase/ and dist-supabase-backend/ in the existing
   pinevela-app hosting application.
2. Extract this ZIP into that pinevela-app root. Replace the TWO build folders
   without adding an enclosing folder. Do not publish the ZIP under the web root.
3. In Spaceship's application environment, preserve PAYSTACK_SECRET_KEY and set
   PINEVELA_PUBLIC_ORIGIN=https://pinevela.app. Keep all secret values private.
4. Restart the existing Node app in Hosting Manager so it reads the saved key.
5. Reload the website. The updated APK also needs these backend endpoints.

Keep app.cjs, node_modules, all existing environment variables, private data and
hosting settings. No new dependency, SQL migration, DNS or SMTP change is needed.
The build includes preceding app, legal, analytics and native-auth changes.

From the existing app root, the optional read-only command
  node tools/pinevela-check-payment-environment.cjs
prints configuration booleans, never keys. Add --check-provider to check whether
Paystack accepts the configured key using a read-only integration settings GET.
No charge, checkout, transfer or provider setting is created by that command.
Production paid checkout requires an accepted LIVE secret and HTTPS public origin.
Confirm the Paystack webhook remains https://pinevela.app/api/payments/paystack/webhook.

No live checkout was submitted and this package has not been deployed remotely.
Seller workflow browser tests use synthetic local fixtures. The actual signed-out
Android WebView opened with correct light branding/bars, and a measured physical
tap opened bundled Login. The full native suite did NOT pass: automated Sign in
taps did not navigate. Failures are preserved in verification/. Authenticated
seller flows were not tested on Android. Test this development APK before wider
distribution; it is debug-signed, not a Play release. iOS was not built.

ROLLBACK: restore the previous two hosting build folders, then restart Node.
No .env, credentials, private backups, source maps or node_modules are included.
'''
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    ZIP_OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_OUT, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(ZIP_OUT) as archive:
        assert archive.testzip() is None
        assert not any(name.endswith('.map') or '/.env' in name for name in archive.namelist())
    APK_OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(apk, APK_OUT)
    (APK_OUT.parent / 'SHA256SUMS.txt').write_text(''.join(digest(file.read_bytes()) + '  ' + file.name + '\n' for file in sorted(APK_OUT.parent.glob('*.apk'))))
    (ZIP_OUT.parent / 'SHA256SUMS.txt').write_text(digest(ZIP_OUT.read_bytes()) + '  ' + ZIP_OUT.name + '\n')
    shutil.copyfile(ZIP_OUT, Path('/tmp') / ZIP_OUT.name)
    print(json.dumps({'zip': str(ZIP_OUT), 'temporaryZip': str(Path('/tmp') / ZIP_OUT.name), 'apk': str(APK_OUT), 'zipFiles': len(entries), 'zipBytes': ZIP_OUT.stat().st_size, 'apkSha256': digest(APK_OUT.read_bytes())}))


if __name__ == '__main__':
    main()
