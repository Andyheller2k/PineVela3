#!/usr/bin/env python3
"""Package the existing hosting app's Android-auth update, excluding private data."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/pinevela-android-step3-server-update-20261029.zip')


def main():
    entries = {}
    frontend = ROOT / 'dist-supabase'
    for file in sorted(frontend.rglob('*')):
        if file.is_dir():
            continue
        relative = file.relative_to(frontend)
        if file.is_symlink() or file.suffix == '.map' or any(part.startswith('.') for part in relative.parts):
            raise ValueError('Unexpected linked or private frontend artifact')
        entries['dist-supabase/' + relative.as_posix()] = file.read_bytes()
    assert 'dist-supabase/index.html' in entries
    for name in ['supabase-server.mjs', 'residence-worker.mjs', 'system-wipe-worker.mjs']:
        file = ROOT / 'dist-supabase-backend' / name
        assert file.is_file() and not file.is_symlink()
        entries['dist-supabase-backend/' + name] = re.sub(
            rb'\n//# sourceMappingURL=[^\r\n]+\s*$', b'\n', file.read_bytes())
    server = entries['dist-supabase-backend/supabase-server.mjs']
    for required in [b'/api/auth/mobile/start', b'/api/auth/mobile/exchange', b'/api/auth/mobile/captcha']:
        assert required in server
    for name in ['android-auth-handoff.md', 'android-conversion-step-3-2026-10-29.md']:
        entries['notes/' + name] = (ROOT / 'docs' / name).read_bytes()
    verification = json.loads((ROOT / 'docs/android-step3-verified-2026-10-29.json').read_text())
    assert verification['buildPassed'] and verification['typescriptPassed']
    assert verification['nativeInstrumentationPassed'] and verification['connectedNativePassed']
    assert not verification['hostedInstalled']
    entries['VERIFICATION.json'] = (json.dumps(verification, indent=2) + '\n').encode()
    entries['README-INSTALL.txt'] = b'''PINEVELA ANDROID AUTH SERVER UPDATE - 29 OCTOBER 2026

This updates the existing website/backend so the Android APK can use in-app
email login/signup/OTP and return from secure Google sign-in. It also serves
the exact unprivileged CAPTCHA widget document used during protected submissions.

INSTALL INTO THE EXISTING pinevela-app APPLICATION ROOT
1. Privately back up the existing dist-supabase/ and dist-supabase-backend/ folders.
2. Extract this archive inside pinevela-app, replacing those two build folders.
   Do not add another enclosing application directory.
3. Restart the existing Node application in Hosting Manager.
4. Install the accompanying development APK on your test Android phone/emulator.

Keep app.cjs, dependencies, environment variables, private data and hosting
settings. No SQL migration, DNS change, SMTP change or new API key is needed.
Existing Google callback, Terms acceptance, CAPTCHA and authorization remain.
Do not upload the ZIP into a public document directory.

POST-INSTALL CHECK
Use your own test account to sign in inside the APK, then restart and sign out.
For signup, use a unique strong password and mailbox; enter the actual email
code in the app. Check the protected submission challenge once. Google uses
the browser and explicitly returns to Android; Google signup may ask you to
confirm the Terms in that browser. Do not share passwords or verification codes.

LOCAL VS LIVE
Local tests use actual isolated Supabase Auth, SMTP capture and Android Keystore.
No hosted account/database was changed. Production Cloudflare and Google
completion still require a post-install test. This APK is a development build;
it is not a signed Play Store release or an iOS package.

ROLLBACK
Restore the previous two build folders and restart the existing Node app.
Uninstalling a development APK removes its private local session and appearance.
No .env, credentials, source maps, private backups or node_modules are included.
'''
    entries['SHA256SUMS.txt'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n'
                                      for name, data in sorted(entries.items())).encode()
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(OUT) as archive:
        assert archive.testzip() is None
        assert not any(name.endswith('.map') or '/.env' in name for name in archive.namelist())
    print(json.dumps({'zip': str(OUT), 'files': len(entries), 'bytes': OUT.stat().st_size,
                      'sha256': hashlib.sha256(OUT.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
