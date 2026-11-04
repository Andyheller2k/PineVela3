#!/usr/bin/env python3
"""Package the reviewed 28 October app build without secrets or source maps."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import zipfile

BASE = Path(__file__).resolve().parents[1]
NAME = 'pinevela-terms-and-transparent-logos-update-20261028'


def main(output, market_navigation=False, analytics=False):
    if analytics:
        market_navigation = True
    package_name = 'pinevela-google-analytics-update-20261028' if analytics else 'pinevela-market-top-navigation-fix-20261028' if market_navigation else NAME
    frontend = BASE / 'dist-supabase'
    backend = BASE / 'dist-supabase-backend'
    assert (frontend / 'index.html').is_file(), 'Build the application first.'
    entries = {}
    for file in sorted(frontend.rglob('*')):
        if file.is_dir():
            continue
        assert not file.is_symlink(), 'Unexpected build symlink.'
        assert file.suffix != '.map' and not file.name.startswith('.'), 'Unexpected private/build artifact.'
        entries['dist-supabase/' + file.relative_to(frontend).as_posix()] = file.read_bytes()
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = backend / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    assert b'/store-covers/pinevela-logo.svg' in entries['dist-supabase/privacy.html']
    assert b'/store-covers/pinevela-logo.svg' in entries['dist-supabase/terms.html']
    assert 'dist-supabase/legal/terms-2026-10-27.html' in entries
    assert b'terms_acceptance_required' in entries['dist-supabase-backend/supabase-server.mjs']

    migration = BASE / 'supabase/migrations/20261028120000_versioned_terms_acceptance.sql'
    sql = migration.read_bytes()
    digest = hashlib.sha256(sql).hexdigest()
    assert digest == '79c1a618a5523bdbc54d348850fd1a1add93ddee15a0ea03f07d34f12b70b418'
    entries['database/REFERENCE-ONLY-terms-migration.sql'] = (
        '-- ALREADY APPLIED to bivajljcdeofyxzmplxm on 28 October 2026.\n'
        '-- Reference for a reviewed restore only. Do not rerun on the current project.\n'
        'BEGIN;\n' + sql.decode() +
        "\nINSERT INTO private.schema_migrations(version,digest) VALUES ('20261028120000','" + digest + "');\nCOMMIT;\n"
    ).encode()
    readme = '''PINEVELA APP UPDATE — 28 OCTOBER 2026

Includes explicit current-Terms acceptance for email/Google signup, returning
accounts without a receipt, and verified merchant applications. Privacy/Terms
headers use the app's transparent mascot. Includes the current full frontend.

INSTALL INTO THE EXISTING pinevela-app APPLICATION FOLDER
1. Keep a private backup of the current dist-supabase and dist-supabase-backend
   folders outside the public web root before overwriting them.
2. In Spaceship File Manager, upload and extract this ZIP inside your existing
   pinevela-app application root. Confirm it overwrites the existing folders:
     pinevela-app/dist-supabase/
     pinevela-app/dist-supabase-backend/
   Avoid an extra nested pinevela-app/pinevela-... directory.
3. Restart the existing PineVela Node.js app in Hosting Manager. Keep its existing
   app.cjs startup, environment, database/CA/PIN files and dependencies.
   No dependency installation, DNS or Google-branding change is required.
4. Reload the browser/installed app. An account without an acceptance receipt
   should see the agreement screen; unchecked signup and merchant forms must
   not submit. Policy links must open and their logos should be transparent.

SUPABASE: the additive migration was already applied to project
bivajljcdeofyxzmplxm. Project ledger version: 20261028120000. There is no SQL
action for you on that project. database/ contains a REFERENCE ONLY copy.
The new server checks this migration at startup. No existing account was
automatically marked accepted. The migration alone does not install this app.

AGREEMENT: current published Platform Terms, version 2026-10-27. Future draft
merchant/platform/privacy documents are not published or silently accepted by
this release. Complete and review those separately in the documentation ZIP.
Do not extract the documentation drafting ZIP into this application folder.

VERIFICATION: local build and TypeScript passed; 61 actual HTTP/native database
checks against a disposable restore; 21 focused regressions; 158 existing unit
checks; 25 phone/desktop/light/dark browser scenes. Provider replies in the
isolated consent suite are test fixtures. Fresh hosted Google/email sign-in and
real merchant submission still require verification after your manual install.

ROLLBACK: restore the previous two build folders and restart the Node app.
Keep the new private consent tables and receipts; do not delete evidence to
roll back a UI. This ZIP contains no environment files, secrets, node_modules,
private backups, user data or source maps.
'''
    if market_navigation:
        readme = '''PINEVELA MARKET TOP NAVIGATION FIX — 28 OCTOBER 2026

The desktop Market/Residences controls now sit below the fixed top navigation,
matching the Residences view. Sidebar and mobile/tablet spacing stay the same.
Verified the overlap before the fix, the production frontend build and 16 new
browser scenes in both themes. The previous cumulative release's checks are
listed below as background; no backend or database logic changed for this fix.

This ZIP is cumulative: use it after OR instead of the earlier Terms/logo ZIP.
Follow the installation steps below, then restart the existing Node app.
No additional SQL, dependencies, environment or DNS changes are required.

''' + readme
        entries['MARKET-TOP-NAVIGATION-NOTES.md'] = (BASE / 'docs/market-top-navigation-fix-2026-10-28.md').read_bytes()
    if analytics:
        assert entries['dist-supabase/analytics.js'] == (BASE / 'public/analytics.js').read_bytes()
        assert entries['dist-supabase/analytics.css'] == (BASE / 'public/analytics.css').read_bytes()
        readme = '''PINEVELA GOOGLE ANALYTICS UPDATE — 28 OCTOBER 2026

Measurement ID: G-NWBP5E04F9. This is the cumulative app install: analytics,
desktop market/top-navigation clearance and preceding Terms/transparent logos.
It also makes the mobile signup Terms/Privacy copy smaller and more compact,
with readable links and the same required checkbox. Desktop text is unchanged.

Extract into the existing pinevela-app folder, overwrite the two build folders,
restart the Node app, and reload. The backend is unchanged from the previously
verified update. Keep existing environment, secrets, dependencies and app.cjs.
No new SQL, DNS, private Analytics API key or Tag Manager container is needed.

FIRST LIVE CHECK
1. Keep Enhanced measurement OFF in Google Analytics -> Admin -> Data streams
   -> PineVela Website. The saved change was verified in the public Google tag.
2. After installing this ZIP, open https://pinevela.app in a fresh tab and choose
   Allow analytics. Without permission, the tag does not load.
3. Visit Market, Residences and Why Us, then check Google Analytics -> Reports
   -> Realtime. Collection is only active on the HTTPS apex/www production site.
4. Visitors can change their choice through the landing footer, Privacy Policy
   or app settings. Declining keeps the app usable without optional analytics.

One shared tag sends sanitized, manual app-page views. Login, invitations,
onboarding, payment-return and sensitive-query URLs are excluded. Advertising
and Google signals stay off. The Privacy Policy includes the new disclosure.

CURRENT CHECKS: frontend build, TypeScript, 19 focused privacy/legal/delivery
tests, 158 existing unit checks, 10 real-Google-tag browser scenes, 47 app
regression scenes and 8 signup typography scenes passed. Every real-tag test request was answered locally;
no test visits were sent to your property. First hosted collection still needs
the post-install Realtime check above.

See ANALYTICS-SETUP.md for details. The prior cumulative release's notes and
install/rollback instructions follow for reference.

''' + readme
        entries['ANALYTICS-SETUP.md'] = (BASE / 'docs/google-analytics-setup-2026-10-28.md').read_bytes()
    entries['README-INSTALL.txt'] = readme.encode()
    entries['RELEASE-NOTES.md'] = (BASE / 'docs/terms-and-transparent-logos-update-2026-10-28.md').read_bytes()
    info = {'prepared': '2026-10-28', 'hostedAppInstalled': False, 'supabaseMigrationApplied': True,
            'projectMigration': '20261028120000', 'mcpMigration': '20261028113608',
            'currentTermsVersion': '2026-10-27', 'httpDatabaseChecks': 61, 'focusedRegressions': 21,
            'existingUnitChecks': 158, 'browserScenes': 25,
            'frontendEntry': re.findall(r'src="([^"]+\.js)"', entries['dist-supabase/index.html'].decode()),
            'files': len(entries) + 2}
    if market_navigation:
        info['marketTopNavigationFix'] = True
        info['priorConsentBrowserScenes'] = info['browserScenes']
        info['browserScenes'] = 16
    if analytics:
        info['googleAnalyticsMeasurementId'] = 'G-NWBP5E04F9'
        info['basicConsentMode'] = True
        info['enhancedMeasurementVerifiedOff'] = True
        info['priorNavigationBrowserScenes'] = info['browserScenes']
        info['browserScenes'] = 10
        info['appRegressionScenes'] = 47
        info['mobileSignupCompactCopy'] = True
        info['signupTypographyScenes'] = 8
        info['focusedRegressions'] = 19
        info['liveAnalyticsCollectionTested'] = False
    entries['BUILD-INFO.json'] = (json.dumps(info, indent=2) + '\n').encode()

    private_values = {}
    if (BASE / '.env').exists():
        parsed = subprocess.run(['node', '-e', "process.stdout.write(JSON.stringify(require('dotenv').parse(require('fs').readFileSync('.env'))))"],
                                cwd=BASE, check=True, capture_output=True, text=True)
        for key, value in json.loads(parsed.stdout).items():
            if re.search(r'SECRET|PASSWORD|SERVICE_ROLE|DATABASE_URL|DB_URL|RESEND_API_KEY|OPENAI_API_KEY|GROQ_API_KEY', key) and len(value) >= 12:
                private_values[key] = value.encode()
    for name, content in entries.items():
        for key, value in private_values.items():
            assert value not in content, 'Private setting found in archive input: ' + name + ' / ' + key

    manifest = '\n'.join(hashlib.sha256(content).hexdigest() + '  ' + name for name, content in sorted(entries.items())) + '\n'
    entries['MANIFEST.sha256'] = manifest.encode()
    output.mkdir(parents=True, exist_ok=True)
    archive_path = output / (package_name + '.zip')
    with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(entries.items()):
            archive.writestr(name, content)
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(entries)
        for name, content in entries.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == hashlib.sha256(content).hexdigest()
    sha256 = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    (output / (package_name + '.sha256')).write_text(sha256 + '  ' + archive_path.name + '\n')
    print(json.dumps({'zip': str(archive_path), 'files': len(entries), 'bytes': archive_path.stat().st_size,
                      'sha256': sha256, 'configuredPrivateValuesScanned': len(private_values), 'entry': info['frontendEntry']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path('/tmp'))
    parser.add_argument('--market-top-navigation', action='store_true')
    parser.add_argument('--google-analytics', action='store_true')
    args = parser.parse_args()
    main(args.output.resolve(), args.market_top_navigation, args.google_analytics)
