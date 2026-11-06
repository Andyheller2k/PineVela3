#!/usr/bin/env python3
"""Package current verified UI changes without overwriting earlier releases."""
from pathlib import Path
from hashlib import sha256
import json, re, shlex, shutil, zipfile, subprocess

ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=ROOT/'docs/verification/nearby-shops-2026-11-06'
PREVIOUS=ROOT/'docs/verification/resident-pin-media-2026-11-05'
NAME='pinevela-nearby-shops-20261106'
sha=lambda value:sha256(value).hexdigest()

def main():
    ui=json.loads((EVIDENCE/'browser/report.json').read_text())
    assert ui['passed'] and ui['scenes']==32 and ui['hostedOrAccountWrites']==0
    assert len(ui['checks'])==32 and ui['runtimeExceptions']==0
    assert (EVIDENCE/'browser/report.json').stat().st_mtime >= (EVIDENCE/'browser.log').stat().st_mtime-2
    visuals=json.loads((EVIDENCE/'browser/nearby-ui.json').read_text())
    assert visuals['passed'] and visuals['productionWrites']==0
    for name,expected in visuals['sourceSha256'].items():
        assert sha((ROOT/name).read_bytes())==expected,name
    assert 'tsc --noEmit' in (EVIDENCE/'typecheck.log').read_text()
    assert not re.search(r'error TS\d+', (EVIDENCE/'typecheck.log').read_text())
    assert 'BUILD SUCCESSFUL' in (EVIDENCE/'android-build.log').read_text()
    assert 'Done in' in (EVIDENCE/'web-build.log').read_text()
    assert '✓ built in' in (EVIDENCE/'web-build.log').read_text()
    assert 'supabase-server.mjs' in (EVIDENCE/'web-build.log').read_text()
    prior=json.loads((EVIDENCE/'database-http-report.json').read_text())
    units=json.loads((EVIDENCE/'unit-tests.json').read_text())
    assert prior['checks']==17 and prior['realPostgreSQL'] and prior['cloudWrites']==0
    assert units['passed'] and units['tests']==17
    failure=EVIDENCE/'browser/failure.json'
    assert not failure.exists() or failure.stat().st_mtime < (EVIDENCE/'browser/report.json').stat().st_mtime, 'Resolve the latest browser failure first'
    assert prior['passed'] and json.loads((PREVIOUS/'live-sql-application.json').read_text())['passed']
    for name,expected in prior['sourceSha256'].items():
        assert sha((ROOT/name).read_bytes())==expected,name
    auth=json.loads((ROOT/'docs/verification/unified-room-login-2026-11-05/database-auth-http-report.json').read_text())
    assert auth['passed'] and auth['checks']==110
    for name,expected in auth['sourceSha256'].items():
        assert sha((ROOT/name).read_bytes())==expected,name
    entries={}
    for file in sorted((ROOT/'dist-supabase').rglob('*')):
        if file.is_file():
            assert not file.is_symlink() and file.suffix!='.map'
            relative='dist-supabase/'+file.relative_to(ROOT/'dist-supabase').as_posix()
            assert not any(p.startswith('.') for p in Path(relative).parts)
            entries[relative]=file.read_bytes()
    for name in ['supabase-server.mjs','residence-worker.mjs','system-wipe-worker.mjs']:
        entries['dist-supabase-backend/'+name]=re.sub(rb'\n//# sourceMappingURL=[^\r\n]+\s*$',b'\n',(ROOT/'dist-supabase-backend'/name).read_bytes())
    with zipfile.ZipFile(ROOT/'releases/web/pinevela-unified-room-login-20261105.zip') as old:
        for name in ['package.json','package-lock.json']:
            entries[name]=(ROOT/name).read_bytes();assert entries[name]==old.read(name)
    guide='docs/nearby-shops-update-2026-11-06.md';entries[guide]=(ROOT/guide).read_bytes()
    entries['verification/browser-report.json']=(EVIDENCE/'browser/report.json').read_bytes()
    entries['verification/nearby-ui.json']=(EVIDENCE/'browser/nearby-ui.json').read_bytes()
    entries['verification/database-http-report.json']=(EVIDENCE/'database-http-report.json').read_bytes()
    entries['verification/unit-tests.json']=(EVIDENCE/'unit-tests.json').read_bytes()
    entries['verification/database-already-applied.json']=(PREVIOUS/'live-sql-application.json').read_bytes()
    entries['README-INSTALL.txt']=(
      'PINEVELA - NEARBY SHOPS AND RESPONSIVE CONTROLS - 6 NOVEMBER 2026\n\n'
      'Nearby shop search, exact/approximate map pins, permanent location icon.\nManager room-key controls wrap; resident/seller selections are circular.\nAndroid foreground location declarations are included.\nCumulative build retaining unified login, notifications and media fixes.\n'
      'Back up dist-supabase and dist-supabase-backend, extract into the existing\n'
      'pinevela-app root, then restart Node. No new dependencies, SQL, sender\n'
      'files or environment changes. Preserve .env, the database CA and .security.\n'
      'The two preceding database migrations are already applied.\n'
      'The matching Android APK updates PineVela Development without clearing data.\n'
      'See docs/nearby-shops-update-2026-11-06.md and the local live\n'
      'deployment report for actual hosting installation status.\n').encode()
    patterns={}
    fcm=json.loads((ROOT/'.security/push/firebase-service-account.json').read_text())
    web=json.loads((ROOT/'.security/push/web-push-keys.json').read_text())
    for key in ['private_key','private_key_id','client_email']:patterns['Firebase '+key]=fcm[key].encode()
    patterns['Firebase private material']=fcm['private_key'].splitlines()[1].encode()
    patterns['Web Push private key']=web['privateKey'].encode()
    for line in (ROOT/'.env').read_text().splitlines():
        if '=' not in line or line.lstrip().startswith('#'):continue
        name,raw=line.split('=',1)
        if not re.search(r'SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY|ACCESS_TOKEN',name,re.I) or name.endswith('_FILE') or name.startswith('VITE_') or re.search(r'PUBLIC|PUBLISHABLE|ANON|SITE_KEY',name,re.I):continue
        try:values=shlex.split(raw)
        except ValueError:values=[]
        if values and len(values[0])>=16:patterns['Environment '+name]=values[0].encode()
    def scan(data):
        assert not any(value in data for value in patterns.values()),'Private credential found; packaging stopped'
        assert not re.search(rb'-----BEGIN PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{64}',data)
    for data in entries.values():scan(data)
    apk=ROOT/'releases/android'/(NAME+'.apk')
    assert apk.read_bytes()==(ROOT/'android/app/build/outputs/apk/debug/app-debug.apk').read_bytes()
    permissions=subprocess.check_output(['/home/wyse/Android/Sdk/build-tools/35.0.0/aapt2','dump','permissions',str(apk)],text=True)
    assert 'android.permission.ACCESS_COARSE_LOCATION' in permissions and 'android.permission.ACCESS_FINE_LOCATION' in permissions
    assert 'android.permission.ACCESS_BACKGROUND_LOCATION' not in permissions
    with zipfile.ZipFile(apk) as archive:
        assert not any(n.endswith('.map') or 'google-services.json' in n or '/.env' in n for n in archive.namelist())
        for n in archive.namelist():
            if not n.endswith('/'):scan(archive.read(n))
        for f in (ROOT/'dist-mobile').rglob('*'):
            if f.is_file():assert archive.read('assets/public/'+f.relative_to(ROOT/'dist-mobile').as_posix())==f.read_bytes()
        assert not json.loads(archive.read('assets/capacitor.config.json')).get('server',{}).get('url')
    entries['SHA256SUMS.txt']=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
    dest=ROOT/'releases/web'/(NAME+'.zip')
    if not dest.exists():
        with zipfile.ZipFile(dest,'x',zipfile.ZIP_DEFLATED) as archive:
            for name,data in sorted(entries.items()):archive.writestr(name,data)
    with zipfile.ZipFile(dest) as archive:
        assert archive.testzip() is None and set(archive.namelist())==set(entries)
        for name,data in entries.items():assert archive.read(name)==data
    for file in [dest,apk]:
        checksums=file.parent/'SHA256SUMS.txt';line=sha(file.read_bytes())+'  '+file.name+'\n'
        if not checksums.exists() or line not in checksums.read_text():
            with checksums.open('a') as out:out.write(line)
    tmp=Path('/tmp')/dest.name
    if not tmp.exists():shutil.copyfile(dest,tmp)
    assert tmp.read_bytes()==dest.read_bytes()
    result={'passed':True,'browserChecks':ui['scenes'],'newSqlRequired':False,'verifiedBackendSourceFingerprintsMatch':True,'precedingVerifiedAuthSourcesUnchanged':True,'publicCatalogueHttpChecks':prior['checks'],'unitTests':units['tests'],'androidForegroundLocationDeclared':True,'androidBackgroundLocationDeclared':False,
      'privateCredentialMatches':0,'webZip':str(dest),'webZipSha256':sha(dest.read_bytes()),'webZipBytes':dest.stat().st_size,
      'apk':str(apk),'apkSha256':sha(apk.read_bytes()),'apkBytes':apk.stat().st_size,
      'backendSha256':sha(entries['dist-supabase-backend/supabase-server.mjs']),
      'indexSha256':sha(entries['dist-supabase/index.html']),'hostingStatus':'See hosting-application.json','apkInstallStatus':'See android/debug-install.json'}
    (EVIDENCE/'summary.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))

if __name__=='__main__':main()
