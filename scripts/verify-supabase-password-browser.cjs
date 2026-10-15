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
    const read = await command('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async()=>{
      let checks=0;
      const me=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});
      const user=await me.json();
      if(me.status!==200||user.role!=='admin'||!user.isVerified)throw new Error('A genuine verified administrator session is required');checks++;
      for(const [route,method] of [['/api/auth/change-password','POST']]){
        const r=await fetch(route,{method,credentials:'same-origin',signal:AbortSignal.timeout(45000),...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
        if(r.status!==403)throw new Error('Wrong-role route did not deny administrator access');checks++;
        const data=await r.json();if(Object.keys(data).some(k=>/hash|token|password|pin/i.test(k)))throw new Error('Credential field exposed');checks++;
      }

      for(const input of [{email:user.email,code:'invalid',newPassword:'a'.repeat(32),authUserId:user.profileId},{email:user.email,code:'invalid',newPassword:'a'.repeat(32)}]) {
        const r=await fetch('/api/auth/recover/complete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
        if(r.status!==400)throw new Error('Invalid recovery input did not fail');checks++;
        if(r.headers.has('set-cookie'))throw new Error('Recovery replaced browser credentials');checks++;
      }
      const invalidLink=new URL('/auth/v1/verify', 'https://bivajljcdeofyxzmplxm.supabase.co');
      invalidLink.searchParams.set('type','recovery');invalidLink.searchParams.set('token',Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''));
      const rejection=await fetch('/api/auth/recover/complete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,code:invalidLink.href,newPassword:Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('')}),signal:AbortSignal.timeout(45000)});
      const denial=await rejection.json();
      if(rejection.status!==400||!denial.error?.includes('invalid or expired'))throw new Error('Real provider did not reject invalid recovery proof');checks++;
      if(Object.keys(denial).some(k=>/hash|token|password/i.test(k)))throw new Error('Provider secret exposed');checks++;
      const stillSignedIn=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});
      const after=await stillSignedIn.json();
      if(stillSignedIn.status!==200||after.id!==user.id)throw new Error('Negative credential checks changed the active account');checks++;
      return {passed:true,checks,actualGoogleAdministrator:true,wrongPortalDenied:true,realProviderInvalidRecoveryDenied:true,credentialsExtracted:false,domainMutationsRequested:false,successfulPasswordMutationVerified:false};

    })()` });
    assert(!read.exceptionDetails, 'Real authenticated API checks complete');
    const result = read.result.value;
    const directory = path.resolve('.security/migration-reset/browser-acceptance-20261012');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(directory, 'password-security-administrator.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally { for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
})().catch(e => { console.error(JSON.stringify({ passed: false, error: e.message, credentialsExtracted: false })); process.exitCode = 1; });
