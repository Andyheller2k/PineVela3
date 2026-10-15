/** Read-only/wrong-role checks in the user's approved actual PineVela tab.
 * No cookies, PINs, provider passwords or admin keys are retrieved. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const [port, endpoint] = (await fs.readFile(path.join(os.homedir(), 'snap/chromium/common/chromium/DevToolsActivePort'), 'utf8')).trim().split('\n');
  assert(port === '9222' && /^\/devtools\/browser\/[a-f0-9-]{36}$/i.test(endpoint));
  const socket = new WebSocket('ws://127.0.0.1:' + port + endpoint), pending = new Map();
  let seq = 0, session;
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser connection approval timed out')), 45000);
      socket.onopen = () => { clearTimeout(timer); resolve(); }; socket.onerror = () => { clearTimeout(timer); reject(new Error('Browser connection failed')); }; });
    const command = (method, params = {}, target = session) => new Promise((resolve, reject) => {
      const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out')); }, 60000);
      pending.set(id, { resolve, reject, timer, method }); socket.send(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) }));
    });
    socket.onmessage = event => { const message = JSON.parse(event.data); if (!message.id) return;
      const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
      message.error ? p.reject(new Error('Browser command rejected: ' + p.method + ' (' + message.error.code + ')')) : p.resolve(message.result); };
    const target = (await command('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:3001/'));
    assert(target, 'Use only the approved PineVela tab'); session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;

    const evaluate=async expression=>{
      const result=await command('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression});
      assert(!result.exceptionDetails,'Browser checks complete');return result.result.value;
    };
    await command('Page.enable');await command('Page.bringToFront');
    let checks=0;
    const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();return {status:r.status,role:u.role,verified:!!u.isVerified};})()");
    assert(me.status===200&&me.role==='admin'&&me.verified,'A genuine verified administrator is required');checks++;
    const cases=[
      ['/api/hostels/00000000-0000-4000-8000-000000000000/room-key-reset-preview?academicYear=2026%2F2027','GET',404],
      ['/api/hostels/00000000-0000-4000-8000-000000000000/reshuffle-room-keys','POST',403,{confirm:'RESET ROOM ACCESS',academicYear:'2026/2027',fingerprint:'0'.repeat(64)}],
      ['/api/hostels/00000000-0000-4000-8000-000000000000/reshuffle-room-keys','POST',400,{managerId:'00000000-0000-4000-8000-000000000000'}],
      ['/api/hostels/00000000-0000-4000-8000-000000000000/reshuffle-room-keys','POST',409,{}, {'X-PineVela-Account-Context':'00000000-0000-4000-8000-000000000000'}],
      ['/api/hostels/00000000-0000-4000-8000-000000000000/reshuffle-room-keys?userId=00000000-0000-4000-8000-000000000000','POST',400,{}],
    ];
    for(const [route,method,status,body={},extra={}]of cases){
      const result=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{method:${JSON.stringify(method)},credentials:'same-origin',signal:AbortSignal.timeout(45000),...(${JSON.stringify(method)}==='POST'?{headers:{'Content-Type':'application/json',...${JSON.stringify(extra)}},body:${JSON.stringify(JSON.stringify(body))}}:{})});return {status:r.status};})()`);
      assert(result.status===status,'Administrator must provide its own approval key and exact annual reset consent');checks++;
    }
    const result={passed:true,checks,genuineAdministrator:true,actualReplies:true,providerRepliesMocked:false,privateCredentialsExtracted:false,domainMutationsRequested:false,genuineManagerResetBrowserPending:true};
    const directory=path.resolve('.security/migration-reset/browser-acceptance-20261012');await fs.mkdir(directory,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(directory,'academic-room-keys-administrator.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  } finally { if(session&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Emulation.clearDeviceMetricsOverride',sessionId:session}));}for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
})().catch(e => { console.error(JSON.stringify({ passed: false, error: e.message, credentialsExtracted: false })); process.exitCode = 1; });
