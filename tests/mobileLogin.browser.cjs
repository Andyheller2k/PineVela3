// Real Chromium, existing photographs and actual API routes with empty disposable storage.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const project = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const s = net.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise(resolve => s.close(resolve)); return p; }
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-mobile-login-'));
  const data = path.join(temp, 'data'); await fs.mkdir(data);
  await fs.writeFile(path.join(data, 'pinevela_store.json'), JSON.stringify({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [], hostels: [], platformSettings: { maintenanceMode: false } }));
  const appPort = await port(), debugPort = await port(), base = `http://127.0.0.1:${appPort}`;
  let server, chrome, socket, logs = '', seq = 0; const pending = new Map(), errors = [];
  try {
    server = spawn(process.execPath, ['dist/server.cjs'], { cwd: project, env: { ...process.env, NODE_ENV: 'production', PORT: String(appPort), PINEVELA_DATA_DIR: data, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD_HASH: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', PINEVELA_PUBLIC_ORIGIN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', d => logs += d); server.stderr.on('data', d => logs += d);
    for(let i=0;i<300;i++) { try { if((await fetch(base+'/api/health')).ok) break; } catch {} if(server.exitCode!==null) throw new Error(logs); await pause(100); }
    chrome = spawn('/snap/bin/chromium', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'], {stdio:'ignore'});
    let target; for(let i=0;i<300;i++) { try { target=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page'); if(target) break; } catch {} await pause(100); } assert(target,'Chromium starts');
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const command = (method,params={}) => new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(new Error(method+' timeout')),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    socket.onmessage = event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);};
    await command('Page.enable'); await command('Page.bringToFront'); await command('Runtime.enable');
    const evaluate = async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const until = async(expression,label)=>{for(let i=0;i<250;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error(label+': '+await evaluate('document.body.innerText'));};
    const open = async(width,height=900,mode='login')=>{await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});await command('Page.navigate',{url:'about:blank'});await command('Page.navigate',{url:base+'/#/login'+(mode==='register'?'?mode=register':'')});await until("document.querySelector('.login-auth-card input')",'Login loads');await pause(700);};
    const screenshot = async(name)=>{const r=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(`/tmp/pinevela-login-${name}.png`,Buffer.from(r.data,'base64'));};
    const visible = selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&e.getClientRects().length>0})()`);
    const fill = (selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    for(const width of [320,375,430,768,1440]) {
      await open(width);
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No horizontal overflow at '+width);
      assert.equal(await visible('.mobile-login-photo'),width<1024);
      assert(await evaluate("document.querySelector('.login-brand-line')===null"),'Blue strip removed from login and signup');
      assert(await evaluate("(()=>{const style=getComputedStyle(document.querySelector('.login-feature-card'));return style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.boxShadow==='none'&&parseFloat(style.borderWidth)===0})()"),'Photo card has no background, border or shadow');
      assert(await evaluate("document.querySelector('[aria-label=\"Show next feature\"] img').src.includes('login-manager-')"),'Transparent manager photograph loads');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[aria-label=\"Show next feature\"] img')).objectFit"),'contain','Desktop card preserves the full photograph');
      if(width<1024) {
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.mobile-login-photo img')).objectFit"),'contain','New photograph remains fully framed over the full-screen backdrop');
        const bounds=await evaluate("(()=>{const p=document.querySelector('.mobile-login-photo').getBoundingClientRect(),c=document.querySelector('.login-auth-card').getBoundingClientRect(),t=document.querySelector('.login-mode-toggle').getBoundingClientRect(),h=document.querySelector('.login-card-heading').getBoundingClientRect();return {photo:p.top===0&&p.left===0&&Math.abs(p.width-innerWidth)<=1&&Math.abs(p.height-innerHeight)<=1&&c.top<p.bottom&&c.bottom>p.top,rounded:parseFloat(getComputedStyle(document.querySelector('.login-auth-card')).borderRadius)>=30,tabs:t.top<h.top,glass:getComputedStyle(document.querySelector('.login-auth-card')).backdropFilter}})()");
        assert(bounds.photo&&bounds.rounded&&bounds.tabs&&bounds.glass.includes('blur'),'Full-screen photograph behind curved frosted card and top tabs');
        assert(await evaluate("(()=>{const card=document.querySelector('.login-auth-card').getBoundingClientRect();return Math.abs(innerHeight-card.bottom-32)<2})()"),'Login card sits at the bottom at '+width);
        assert(await evaluate("document.querySelector('.mobile-login-photo img').getBoundingClientRect().height<innerHeight*.75"),'Photograph has a wider, less zoomed framing');
        assert(await visible('.mobile-login-backdrop'),'Matching photograph fills the entire background');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.login-logo-link')).backgroundColor"),'rgba(0, 0, 0, 0)','Logo blends into the photograph');
        assert(!await visible('.login-home-link'));
        assert.equal(await evaluate("[...document.querySelectorAll('.login-header button')].filter(b=>b.getClientRects().length && b.textContent.includes('Login')).length"),0);
        assert(!await visible('.login-brand-line'));
      }
      await screenshot('light-'+width);
      const switchPoint = await evaluate("(()=>{const b=[...document.querySelectorAll('[role=switch][aria-label=\"Dark mode\"]')].find(b=>b.getClientRects().length),r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,reachable:b.contains(document.elementFromPoint(x,y))}})()");
      assert(switchPoint.reachable,'A real tap reaches the theme switch at '+width);
      await command('Input.dispatchMouseEvent',{type:'mousePressed',x:switchPoint.x,y:switchPoint.y,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:switchPoint.x,y:switchPoint.y,button:'left',clickCount:1});
      await pause(150); assert(await evaluate("document.documentElement.dataset.theme==='dark'"));
      if(width<1024) assert(await evaluate("getComputedStyle(document.querySelector('.mobile-login-photo img')).filter.includes('brightness(0.68)')"));
      await screenshot('dark-'+width);
      await evaluate("[...document.querySelectorAll('[role=switch][aria-label=\"Dark mode\"]')].find(b=>b.getClientRects().length).click()");
      await evaluate("[...document.querySelectorAll('.login-mode-toggle button')].find(b=>b.textContent.includes('Sign Up')).click()");
      assert.equal(await evaluate("document.querySelector('.login-auth-card form').querySelectorAll('input').length"),4,'Original signup fields');
      assert(await evaluate("document.querySelector('.login-google-button').textContent.includes('Sign up with Google')"));
      assert(await evaluate("document.querySelector('.login-google-section').getBoundingClientRect().top>=document.querySelector('.login-auth-card form').getBoundingClientRect().bottom"),'Google signup below original form');
      await evaluate("document.querySelector('.login-google-button').scrollIntoView({block:'center'})");
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      console.log('Passed mobile/desktop light, dark and signup:',width);
    }
    await open(375,667);
    await until("document.querySelectorAll('.mobile-login-photo img').length===1", 'Initial photo transition settles');
    const first=await evaluate("document.querySelector('.mobile-login-photo img').src");
    const photoPoint=await evaluate("(()=>{const card=document.querySelector('.login-auth-card').getBoundingClientRect(),x=innerWidth/2,y=Math.max(90,Math.min(160,card.top-16)),photo=document.querySelector('.mobile-login-photo');return {x,y,reachable:photo.contains(document.elementFromPoint(x,y))}})()");
    assert(photoPoint.reachable,'A real tap reaches the photograph above the card');
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:photoPoint.x,y:photoPoint.y,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:photoPoint.x,y:photoPoint.y,button:'left',clickCount:1});
    await until(`document.querySelectorAll('.mobile-login-photo img').length===1 && document.querySelector('.mobile-login-photo img').src!==${JSON.stringify(first)}`, 'First photo shuffle settles');
    const second=await evaluate("document.querySelector('.mobile-login-photo img').src");assert.notEqual(first,second);
    await evaluate("document.querySelector('.mobile-login-photo').click()");
    await until(`document.querySelectorAll('.mobile-login-photo img').length===1 && document.querySelector('.mobile-login-photo img').src!==${JSON.stringify(second)}`, 'Second photo shuffle settles');
    const third=await evaluate("document.querySelector('.mobile-login-photo img').src");assert.equal(new Set([first,second,third]).size,3);
    for (const name of ['login-manager-', 'login-resident-', 'login-market-']) assert([first,second,third].some(src=>src.includes(name)&&new URL(src).pathname.endsWith('.png')), 'Transparent carousel photograph: '+name);
    await pause(16000);assert.notEqual(await evaluate("document.querySelector('.mobile-login-photo img').src"),third,'Automatic shuffle continues');
    await command('Emulation.setDeviceMetricsOverride',{width:375,height:400,deviceScaleFactor:1,mobile:true});
    await evaluate("document.querySelector('.login-google-button').scrollIntoView({block:'center'})");
    assert(await evaluate("(()=>{const r=document.querySelector('.login-google-button').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"),'Actions reachable with small/keyboard-height viewport');
    await fill('.login-auth-card input[type=text]','unregistered@example.test');await fill('.login-auth-card input[type=password]','Incorrect-private-password!');
    await evaluate("document.querySelector('.login-auth-card form').requestSubmit()");await until("document.querySelector('.login-auth-card [role=alert]')?.textContent.includes('Invalid username/email or password')",'Invalid login shows inline error');
    await evaluate("document.querySelector('.login-google-button').click()");await until("document.querySelector('.login-auth-card [role=alert]')?.textContent.includes('Google sign-in is not available')",'Unconfigured Google gives honest inline feedback');
    await open(375,900,'register');await screenshot('signup-375');
    const post = (body,origin)=>fetch(base+'/api/auth/google/start',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
    assert.equal((await post({mode:'admin',role:'admin'})).status,400);
    const unavailable=await post({mode:'signup',userId:'unauthorized',role:'admin'});assert.equal(unavailable.status,503);assert(!unavailable.headers.get('set-cookie'));
    assert.equal((await post({mode:'login'},'https://external.example.test')).status,403);
    const forged=await fetch(base+'/api/auth/google/callback?code=forged&state=forged',{redirect:'manual'});assert.equal(forged.status,303);assert(forged.headers.get('location').includes('google_error=expired'));assert(!forged.headers.get('set-cookie'));
    assert.equal((await fetch(base+'/api/auth/me')).status,401);
    assert.equal(JSON.parse(await fs.readFile(path.join(data,'pinevela_store.json'),'utf8')).users.length,0,'Failed OAuth cannot create/link identities');
    assert.deepEqual(errors,[],'No browser runtime errors');
    console.log('Passed shuffle, small-height scrolling, inline errors and Google failure/CSRF checks.');
  } catch (error) { console.error('Browser check failed:', error); throw error; } finally {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({id: ++seq, method: 'Browser.close'}));
      await pause(500);
    }
    socket?.close();
    for(const child of [chrome,server]) if(child&&child.exitCode===null){const done=once(child,'exit').catch(error=>{if(error.code!=='EACCES') throw error;});try { child.kill('SIGTERM'); } catch(error) { if(error.code!=='EACCES') throw error; } await Promise.race([done,pause(5000)]);}
    await fs.rm(temp,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
