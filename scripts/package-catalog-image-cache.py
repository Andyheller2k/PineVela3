#!/usr/bin/env python3
"""Package verified catalogue/photo changes; never deploy or copy private state."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/verification/catalog-image-cache-2026-10-31'
ZIP_OUT = ROOT / 'releases/web/pinevela-catalog-image-cache-20261031.zip'
APK_OUT = ROOT / 'releases/android/pinevela-catalog-image-cache-20261031.apk'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def report(name):
    return json.loads((EVIDENCE / name).read_text())


def main():
    summary, scan, native = report('summary.json'), report('artifact-scan.json'), report('android/result.json')
    for field in ['typescriptPassed', 'webBuildPassed', 'mobileBuildPassed', 'androidBuildPassed',
                  'capacitorSyncPassed', 'focusedTestsPassed', 'browserChecksPassed',
                  'regressionChecksPassed', 'diffCheckPassed']:
        assert summary[field], field
    assert summary['focusedTestCount'] == 27 and not summary['deployedRemotely']
    for directory in ['browser', 'regressions']:
        checks = report(directory + '/report.json')
        assert checks['passed'] and checks['scenes'] == 14
        assert checks['runtimeExceptions'] == checks['hostedOrAccountWrites'] == 0
    measured = [entry for entry in report('browser/cache-measurements.json')['measurements'] if 'marketSame' in entry]
    assert len(measured) == 4
    assert all(entry['marketSame'] and entry['residenceSame'] and entry['homeSame']
               and not entry['navigationRequests'] for entry in measured)
    instrumented = report('android/instrumentation-summary.json')
    assert instrumented['passed'] and instrumented['cacheTestsPassed'] and instrumented['regressionTestsPassed']
    assert instrumented['cacheTestCount'] == 13 and instrumented['totalTestCount'] == 26
    baseline = report('android/native-body-baseline.json')
    assert baseline['cachedRequests'] == baseline['uncachedRequests'] == 2
    assert baseline['cachedBodies'] == 1 and baseline['uncachedBodies'] == 2
    for field in ['passed', 'actualAndroidWebView', 'localStartupPassed',
                  'normalReopenPreservedApk', 'originalAppearanceRestored', 'emulatorShutdown']:
        assert native[field], field
    for field in ['accountFormsSubmitted', 'paymentActionsSubmitted', 'authenticatedCatalogueFlowTested', 'appDataCleared']:
        assert not native[field], field
    assert scan['passed'] and scan['matches'] == 0
    for filename, expected in scan['manifests'].items():
        assert digest((ROOT / filename).read_bytes()) == expected, 'Changed after scan: ' + filename
    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk.read_bytes()) == native['installedApkSha256'] == summary['apkSha256']
    with zipfile.ZipFile(apk) as archive:
        for file in (ROOT / 'dist-mobile').rglob('*'):
            if file.is_file():
                assert not file.is_symlink()
                assert archive.read('assets/public/' + file.relative_to(ROOT / 'dist-mobile').as_posix()) == file.read_bytes()
        assert not any('pinevela_test_network_security' in name for name in archive.namelist())
        dex = b''.join(archive.read(name) for name in archive.namelist() if re.fullmatch(r'classes\d*\.dex', name))
        assert b'PublicMediaCacheInterceptor' in dex
        for excluded in [b'PublicMediaCacheTest', b'public-media-loopback-fixture', b'https://10.0.2.2:9443']:
            assert excluded not in dex, 'Test-only content in development APK'
    entries = {}
    for file in sorted((ROOT / 'dist-supabase').rglob('*')):
        if file.is_file():
            relative = file.relative_to(ROOT / 'dist-supabase')
            assert not file.is_symlink() and file.suffix != '.map'
            assert not any(part.startswith('.') for part in relative.parts)
            entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    entries['UPDATE-NOTES.md'] = (ROOT / 'docs/catalog-image-cache-update-2026-10-31.md').read_bytes()
    entries['tools/pinevela-check-payment-environment.cjs'] = (ROOT / 'scripts/check-payment-environment.cjs').read_bytes()
    for name in ['summary.json', 'artifact-scan.json', 'backend-build-comparison.json',
                 'android/result.json', 'android/instrumentation-summary.json', 'android/native-body-baseline.json',
                 'baseline/cache-measurements.json', 'browser/report.json',
                 'browser/cache-measurements.json', 'regressions/report.json']:
        entries['verification/' + name] = (EVIDENCE / name).read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA CATALOGUE PHOTO UPDATE - 31 OCTOBER 2026

1. Privately back up the two existing hosting build folders.
2. Extract this ZIP directly into the existing pinevela-app root, replacing
   dist-supabase/ and dist-supabase-backend/ without an enclosing folder.
3. Restart the existing Node app in Spaceship Hosting Manager and reload.

Keep app.cjs, node_modules, environment variables, private data and hosting
settings. Keep this ZIP outside the public web root. No new dependency, SQL
migration, DNS, SMTP or OAuth change is required. This cumulative build includes
the preceding seller subscription update and live admin plan prices.

Market and Residences keep their visited Home panels and loaded image elements.
Published catalogue photos use validated HTTP caching; unchanged bodies are
reused after reload. Private photos remain no-store. Android has a separate
20MB public-photo cache which revalidates access and rejects cookie/private/error
responses. Deploy this backend update for its explicit public-photo marker.

Verification: typecheck, web/mobile/Android builds, 27 focused Node checks,
14 cache-browser scenarios and 14 related layout/theme scenarios. Android TLS
cache instrumentation, cookie/transport regressions and normal emulator reopen
are recorded in verification/android/result.json. UI/account fixtures are local;
no real account, payment or email action was submitted. iOS was not built.

This package has NOT been deployed remotely. The development APK is saved in
PineVela3/releases/android/ and is debug-signed, not a Google Play release.
Earlier APKs and ZIPs remain saved. See UPDATE-NOTES.md and verification/.

ROLLBACK: restore the previous hosting build folders and restart Node.
No .env, credentials, source maps, private backups or node_modules are included.
'''
    for name in entries:
        assert not name.startswith('/') and '..' not in PurePosixPath(name).parts
    entries['SHA256SUMS.txt'] = ''.join(digest(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    assert not ZIP_OUT.exists() and not APK_OUT.exists(), 'Do not overwrite a saved release'
    ZIP_OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_OUT, 'x', zipfile.ZIP_DEFLATED) as archive:
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
                      'apkSha256': digest(APK_OUT.read_bytes()), 'zipSha256': digest(ZIP_OUT.read_bytes())}))


if __name__ == '__main__':
    main()
