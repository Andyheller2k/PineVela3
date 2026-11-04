#!/usr/bin/env python3
"""Package the reviewed signup fix without credentials, dependencies or source maps."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

BASE = Path(__file__).resolve().parents[1]
OUTPUT = Path('/tmp/pinevela-signup-password-fix-20261029.zip')


def main():
    entries = {}
    frontend = BASE / 'dist-supabase'
    for file in sorted(frontend.rglob('*')):
        if file.is_dir():
            continue
        if file.is_symlink() or file.suffix == '.map' or any(part.startswith('.') for part in file.relative_to(frontend).parts):
            raise ValueError('Unexpected private or linked build artifact')
        entries['dist-supabase/' + file.relative_to(frontend).as_posix()] = file.read_bytes()
    assert 'dist-supabase/index.html' in entries
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = BASE / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(
            rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    server = entries['dist-supabase-backend/supabase-server.mjs']
    assert b'Use at least 8 characters, including uppercase and lowercase letters, a number and a symbol.' in server
    assert b'[Auth provider] Request rejected.' in server
    assert b'terms_acceptance_required' in server
    entries['SIGNUP-FIX-NOTES.md'] = (BASE / 'docs/signup-password-fix-2026-10-29.md').read_bytes()
    entries['README-INSTALL.txt'] = b'''PINEVELA SIGNUP PASSWORD FIX - 29 OCTOBER 2026

CONFIRMED CAUSE
Supabase rejected POST /signup with weak_password (HTTP 422). The old app hid
the password requirements behind a generic authentication error. This rejection
happened before email delivery; it does not establish a Resend outage.

The signup form and server now require 8-256 characters, including uppercase and
lowercase letters, a number and a supported symbol. The form shows the requirements
and checks them before CAPTCHA. Both password gauges respect the signup rules.
Provider errors receive fixed safe explanations and bounded private diagnostics.
Existing sign-in, CAPTCHA, Terms and email confirmation protections remain.

INSTALL IN YOUR EXISTING pinevela-app APPLICATION ROOT
1. Back up dist-supabase/ and dist-supabase-backend/ privately.
2. Upload and extract this ZIP inside the existing pinevela-app folder. Replace
   its dist-supabase/ and dist-supabase-backend/ folders, without extra nesting.
3. Restart the existing Node app in Hosting Manager, then reload the browser.
   Keep app.cjs, existing dependencies, environment, private files and settings.

This is a cumulative app build containing the preceding local UI/legal/analytics
work. No dependency installation, SQL, DNS, SMTP or API-key change is required
by this fix. Do not replace the application environment or disable CAPTCHA.

VERIFY AFTER INSTALL
An incomplete password should be rejected before CAPTCHA or a signup API call.
Retry once with your own mailbox and a unique password meeting all requirements.
Check delivery and complete email verification. Do not share passwords or codes.
If that attempt fails, inspect the new [Auth provider] Request rejected. server
log category and matching Supabase Auth event. Check Resend delivery logs only
if the request reaches email delivery. Avoid repeated signup requests.

LIMITS
Local checks are recorded in VERIFICATION.json. No real signup email was sent
or user account created by these tests. Hosted installation, inbox delivery and
completed signup still require the post-install retry. No hosted configuration
or database migration was changed in this session.

ROLLBACK
Restore the previous two build folders and restart the Node application.
This archive contains no environment files, secrets, node_modules, private
backups, user data or source maps. Keep the ZIP outside the public web root.
'''
    verification = json.loads(Path('/tmp/pinevela-signup-verification-20261029.json').read_text())
    assert verification['buildPassed'] and verification['typescriptPassed']
    assert verification['providerAndValidationTestsFailed'] == 0
    assert verification['browserChecksPassed'] >= 18
    assert not verification['hostedInstalled'] and not verification['realEmailSent']
    entries['VERIFICATION.json'] = (json.dumps(verification, indent=2) + '\n').encode()
    entries['SHA256SUMS.txt'] = ''.join(
        hashlib.sha256(data).hexdigest() + '  ' + name + '\n'
        for name, data in sorted(entries.items())
    ).encode()
    with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    print(json.dumps({'zip': str(OUTPUT), 'files': len(entries), 'bytes': OUTPUT.stat().st_size,
                      'sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
