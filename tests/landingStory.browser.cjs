// Actual Chromium against disposable operational storage; never touches real accounts/payments.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const project = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const result = server.address().port; await new Promise(resolve => server.close(resolve)); return result; }
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-about-scroll-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), JSON.stringify({users:[], hostels:[], digitalMarketProducts:[], digitalMarketStores:[]}));
  const appPort = await port(), debugPort = await port(), base = `http://127.0.0.1:${appPort}`;
  let server, chrome, socket; let logs = ''; const errors = []; let sequence = 0; const pending = new Map(); let heldRequests = [];
  try {
    server = spawn(process.execPath, [path.join(project, 'dist/server.cjs')], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(appPort), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'recovery'), PAYSTACK_SECRET_KEY: '', PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_TRUST_PROXY: '', PINEVELA_MAIN_ADMIN_ID: '' }, stdio: ['ignore','pipe','pipe'] });
    server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
    for (let i=0;i<600;i++) { try { if ((await fetch(base+'/api/health')).ok) break; } catch {} assert(server.exitCode === null, logs); await pause(100); }
    chrome = spawn(process.env.CHROMIUM_PATH || '/snap/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-features=BackForwardCache','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'], {stdio:'ignore'});
    let target; for(let i=0;i<600;i++) { try {target=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page'); if(target)break;}catch{} await pause(100); } assert(target,'Chromium did not start');
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const command = (method,params={})=>new Promise((resolve,reject)=>{const id=++sequence; const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    socket.onmessage = event=>{const message=JSON.parse(event.data);
      if(message.method==='Fetch.requestPaused'){
        heldRequests.push(message.params.requestId);
      } else if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);else if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params.args.map(a=>a.value||a.description).join(' '));};
    await command('Page.enable');await command('Page.bringToFront');await command('Runtime.enable');await command('Network.enable');
    const evaluate = async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const until = async (expression,label)=>{for(let i=0;i<300;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error(label+': '+await evaluate('location.hash+" "+document.body.innerText.slice(-1200)')+' '+JSON.stringify(errors));};
    const viewport = width=>command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    const authTransition = async (signup, reduced = false) => {
      await evaluate("document.querySelector('#story-about-us').scrollIntoView({block:'center',behavior:'instant'})");await pause(800);
      const samples = await evaluate(`new Promise(resolve=>{
        const outgoing=document.querySelector('.landing-peak-page'), initialScroll=scrollY, started=performance.now(), frames=[];
        const sample=()=>{
          const incoming=document.querySelector('.unified-login');
          if(outgoing.isConnected) {const s=getComputedStyle(outgoing.parentElement);frames.push({page:'landing',opacity:Number(s.opacity),scroll:scrollY,transform:s.transform});}
          if(incoming) {const s=getComputedStyle(incoming.parentElement);frames.push({page:'login',opacity:Number(s.opacity),scroll:scrollY,transform:s.transform,signup:document.querySelector('.login-mode-toggle button:last-child')?.getAttribute('aria-pressed')==='true'});}
          if((incoming&&Number(getComputedStyle(incoming.parentElement).opacity)>.999&&performance.now()-started>50)||performance.now()-started>4000) resolve({initialScroll,frames});
          else requestAnimationFrame(sample);
        };
        [...document.querySelectorAll('#public-header button')].find(b=>b.textContent.trim()===${JSON.stringify(signup?'Sign Up':'Login')}).click();
        requestAnimationFrame(sample);
      })`);
      const outgoing=samples.frames.filter(f=>f.page==='landing'),incoming=samples.frames.filter(f=>f.page==='login');
      assert(samples.initialScroll>100,'Transition begins on a scrolled landing page');
      assert(incoming.length,'Login actually mounts');
      assert(outgoing.filter(f=>f.opacity>.1).every(f=>Math.abs(f.scroll-samples.initialScroll)<2),'No scroll jump during outgoing fade');
      assert(samples.frames.every(f=>f.transform==='none'),'Fixed header stays in place during transition');
      assert(incoming.every(f=>f.scroll===0),'Incoming auth page starts at the top');
      assert(incoming.every(f=>f.signup===signup),'Correct form from the first visible frame');
      if(reduced)assert(incoming.every(f=>f.opacity===1),'Reduced motion has no fade');
      else {assert(outgoing.some(f=>f.opacity>0&&f.opacity<1),'Outgoing page fades');assert(incoming.some(f=>f.opacity>0&&f.opacity<1),'Incoming page fades');}
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Auth page does not overflow');
      await evaluate("document.querySelector('[aria-label=\"PineVela home\"]').click()");
      await until("document.querySelector('.landing-peak-page')",'Return to landing');await pause(450);
    };
    for(const width of [1440,768,375,320]) {
      await viewport(width); await command('Page.navigate',{url:base+'/#/'});
      await until("document.querySelectorAll('.landing-company-story .company-chapter').length===4",'Inline company chapters');
      await pause(900);
      for(const theme of ['light','dark']) {
        if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate("document.querySelector('#public-header .theme-toggle').click()");
        await evaluate("[...document.querySelectorAll('#public-header button')].find(b=>b.textContent.trim()==='About Us').click()");
        await pause(1400);
        assert(!await evaluate("document.querySelector('.landing-peak-curve')"),'No curved hero surface');
        assert(await evaluate("getComputedStyle(document.querySelector('.landing-peak-hero')).backgroundImage.includes('linear-gradient')"),'Natural hero gradient');
        assert(await evaluate("document.activeElement.id==='title-about-us' && scrollY>0 && !document.querySelector('dialog.company-story') && document.body.style.overflow!=='hidden'"),'About is inline and focusable');
        assert(await evaluate("document.querySelector('#story-about-us').getBoundingClientRect().top>=document.querySelector('#public-header').getBoundingClientRect().bottom-1"),'Section clears header');
        assert(await evaluate("[...document.querySelectorAll('.company-copy')].every(e=>{const s=getComputedStyle(e);return s.backgroundColor==='rgba(0, 0, 0, 0)' && s.boxShadow==='none' && s.borderTopWidth==='0px'})"),'Unboxed company details in '+theme);
        assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No horizontal overflow');
        for(const section of ['about-us','our-vision','partner-with-us','contact-us']) {
          await evaluate(`document.querySelector('#story-${section}').scrollIntoView({block:'start',behavior:'instant'})`); await pause(800);
          await evaluate(`document.querySelector('#title-${section}').scrollIntoView({block:'center',behavior:'instant'})`);
          await until(`Number(getComputedStyle(document.querySelector('#title-${section}')).opacity)>.999`,'Heading revealed '+width+' '+section);
        }
        await evaluate("window.scrollTo({top:0,behavior:'instant'})"); await pause(200);
        assert(await evaluate("Number(getComputedStyle(document.querySelector('#title-about-us')).opacity)>.999"),'Reveals persist after scrolling back');
        console.log('Passed: inline chapters, header clearance, themes, native scrolling '+width+' '+theme);
      }
    }
    await viewport(1440);await command('Page.navigate',{url:'about:blank'});await pause(100);await command('Page.navigate',{url:base+'/#/'});await until("document.querySelector('.company-paragraphs p.landing-reveal')",'Reveals registered');
    await until("!document.documentElement.classList.contains('theme-changing')",'Theme settles before testing animation');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.company-paragraphs p')).opacity"),'0','Offscreen content starts hidden');
    await command('Animation.enable'); await command('Animation.setPlaybackRate',{playbackRate:.25});
    await evaluate("document.querySelector('.company-paragraphs p').scrollIntoView({behavior:'instant',block:'center'})");
    await until("(()=>{const fade=Number(getComputedStyle(document.querySelector('.company-paragraphs p')).opacity);return fade>0 && fade<1})()",'Soft intermediate fade');
    await command('Animation.setPlaybackRate',{playbackRate:1});
    await until("Number(getComputedStyle(document.querySelector('.company-paragraphs p')).opacity)>.999",'Fade completes');
    await command('Page.navigate',{url:base+'/#/pinemarket'});await until("document.querySelector('[data-public-market=catalog]')",'Market');
    await evaluate("[...document.querySelectorAll('#public-header button')].find(b=>b.textContent.trim()==='About Us').click()");
    await until("location.hash==='#/?section=about-us' && document.activeElement.id==='title-about-us'",'Public links return to landing');await pause(1400);
    assert(await evaluate("document.querySelector('#story-about-us').getBoundingClientRect().top>=document.querySelector('#public-header').getBoundingClientRect().bottom-1"),'Cross-page target clears header');
    for(const width of [1440,375]) {
      await viewport(width);
      for(const theme of ['light','dark']) {
        if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate("document.querySelector('#public-header .theme-toggle').click()");
        await authTransition(false);await authTransition(true);
        console.log('Passed: smooth landing to login/signup '+width+' '+theme);
      }
    }
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await command('Page.navigate',{url:base+'/#/'});await until("document.querySelector('.company-paragraphs p.landing-reveal')",'Reduced motion loaded');
    assert(await evaluate("[...document.querySelectorAll('.landing-reveal')].every(e=>getComputedStyle(e).opacity==='1' && getComputedStyle(e).transitionDuration==='0s')"),'Reduced motion all content visible without animation');
    await evaluate("[...document.querySelectorAll('#footer-section button')].find(b=>b.textContent.trim()==='Our Vision').click()");await pause(50);
    assert(await evaluate("document.activeElement.id==='title-our-vision' && document.querySelector('#story-our-vision').getBoundingClientRect().top>=document.querySelector('#public-header').getBoundingClientRect().bottom-1"),'Reduced motion anchor immediate');
    await authTransition(true,true);
    assert.deepEqual(errors,[],'No browser errors');console.log('Passed: reveal interpolation, public deep links, reduced motion');
  } finally {
    for(const item of pending.values())clearTimeout(item.timer);
    if(socket?.readyState===WebSocket.OPEN){ socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await pause(150); }
    socket?.close();try { chrome?.kill('SIGTERM'); } catch {} chrome?.unref();
    if(server?.exitCode===null){try{process.kill(-server.pid,'SIGTERM');}catch{} await pause(300);}
    server?.stdout?.destroy(); server?.stderr?.destroy(); server?.unref();
    await fs.rm(temp,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
