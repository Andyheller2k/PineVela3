/** Real browser encrypted chat workflow on the owned native Supabase stack. No HTTP,
 * identity, session, or provider stubs; no sanctions are applied by this test. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function privateJson(file) { assert(path.isAbsolute(file)); const stat = await fs.lstat(file); assert(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077)); return JSON.parse(await fs.readFile(file, 'utf8')); }
(async () => {
  assert(process.argv.length === 4, 'Supply real runtime and encrypted chat fixture paths');
  const runtime = await privateJson(process.argv[2]), fixture = await privateJson(process.argv[3]), meta = await privateJson(runtime.metadataPath);
  assert(runtime.runId === meta.runId && meta.databaseOwned && meta.root.startsWith('/tmp/'));
  assert(process.argv[2].startsWith(meta.root + '/') && process.argv[3].startsWith(meta.root + '/'));
  const base = new URL(runtime.origin); assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && !['3000', '3001'].includes(base.port));
  const actors = { reporter: fixture.buyer, other: fixture.other, seller: fixture.seller, storeId: fixture.storeId, listingId: fixture.listingId };
  assert(actors.reporter?.contextId && actors.storeId && actors.listingId);
  const artifacts = path.join(meta.root, 'encrypted-chat-browser-artifacts'); await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const profile = await fs.mkdtemp('/tmp/pinevela-report-chrome-');
  const chrome = spawn('/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let ws, sequence = 0, command, evaluate, stage = 'browser startup', checks = 0;
  const waiting = new Map(), errors = [], sent = [], check = (value, label) => { assert(value, label); checks++; };
  try {
    let target; for (let attempt = 0; attempt < 150; attempt++) { try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())).find(item => item.type === 'page'); } catch {} if (target || chrome.exitCode !== null) break; await pause(200); }
    check(target, 'Isolated browser starts'); ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { waiting.delete(id); reject(Error('Browser command timeout')); }, 40000); waiting.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = event => { const response = JSON.parse(event.data); if (response.id) { const pending = waiting.get(response.id); if (!pending) return; waiting.delete(response.id); clearTimeout(pending.timer); response.error ? pending.reject(Error('Browser command failed')) : pending.resolve(response.result); } else if (response.method === 'Runtime.exceptionThrown') errors.push(response.params.exceptionDetails.text); else if(response.method==='Network.requestWillBeSent'){const r=response.params.request;if(r.method==='POST'&&/\/api\/(?:digital-market\/messages|reports)$/.test(new URL(r.url).pathname))sent.push({path:new URL(r.url).pathname,body:r.postData||''});} };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    evaluate = async expression => { const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (value.exceptionDetails) throw Error('Browser evaluation failed at ' + stage); return value.result.value; };
    async function until(expression, label, timeout = 45000) { const expires = Date.now() + timeout; while (Date.now() < expires) { try { if (await evaluate(expression)) return; } catch {} await pause(150); } throw Error(label + ' at ' + stage); }
    async function go(route) { const url = new URL(route, base.origin); assert(url.origin === base.origin); await command('Page.navigate', { url: url.href }); await until('document.readyState==="complete"', 'Document loads'); }
    async function size(width, height) { await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
    async function click(text, scope = 'document') { await evaluate(`(()=>{const b=[...${scope}.querySelectorAll('button,a,summary')].find(b=>b.getClientRects().length&&b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing control');b.click()})()`); }
    async function fillLabel(label, value) { await evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.getClientRects().length&&l.textContent.trim().startsWith(${JSON.stringify(label)}));const e=l?.querySelector('input,textarea,select');if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); }
    async function screenshot(name) { const result = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'), { mode: 0o600 }); }
    async function dismissWelcome() { await evaluate(`(()=>{for(const d of document.querySelectorAll('dialog[open]'))if(/Welcome/.test(d.getAttribute('aria-label')||''))d.querySelector('button[aria-label="Close dialog"]')?.click()})()`); }
    async function signIn(kind) {
      stage = 'real native login ' + kind; await size(1440, 1000); await go('/#/login'); await until('!!document.querySelector(\'input[aria-label="Email address"]\')', 'Login form');
      await evaluate(`(()=>{for(const [label,value] of ${JSON.stringify([['Email address', actors[kind].email], ['Password', actors[kind].password]])}){const e=document.querySelector('input[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      await evaluate('document.querySelector(\'input[aria-label="Password"]\').closest("form").requestSubmit()');
      const destination = kind === 'agent' ? '#/customer-service' : kind === 'admin' ? '#/admin/dashboard' : '#/user/dashboard';
      await until(`location.hash.split('?')[0]===${JSON.stringify(destination)}&&!!document.querySelector('[data-portal-navigation]')`, 'Genuine account destination'); await dismissWelcome();
      check(await evaluate(`(async()=>{const r=await fetch('/api/auth/me');return r.ok&&(await r.json()).id===${JSON.stringify(actors[kind].contextId)}})()`), 'Native session belongs to selected account');
    }
    async function signOut(kind) {
      if (kind !== 'agent') { await go('/#/' + (kind === 'admin' ? 'admin/dashboard' : 'user/dashboard')); await until('!!document.querySelector("[data-portal-navigation]")', 'Dashboard'); await dismissWelcome(); }
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&(/^(?:sign|log) out$/i.test(b.textContent.trim())||/(?:sign|log) out/i.test(b.title)));if(!b)throw Error('Missing sign out');b.click()})()`);
      if (kind !== 'agent') { await until(`!!document.querySelector('dialog[aria-label="Sign Out Confirmation"][open]')`, 'Logout confirmation'); await evaluate(`(()=>{const d=[...document.querySelectorAll('dialog[open]')].find(d=>/Sign Out Confirmation/i.test(d.getAttribute('aria-label')||''));const b=[...d.querySelectorAll('button')].find(b=>/Sign Out|Sign out|Confirm|Yes,/.test(b.textContent));if(!b)throw Error('Missing logout confirmation');b.click()})()`); }
      await until('location.hash.startsWith("#/login")', 'Logout completes');
    }

    await signIn('reporter'); stage='encrypted chat recovery and confidentiality';
    await evaluate('location.hash="/user/dashboard?tab=digital-market&mode=chats"');
    await until('!!document.querySelector(\'[aria-label="Encrypted messaging setup"]\')','Encrypted inbox opens');
    await until('!!document.querySelector("#chat-recovery-phrase")','Saved encryption identity requires phrase');
    await evaluate(`(()=>{const e=document.querySelector('#chat-recovery-phrase');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'pv1 '+Array(16).fill('0000').join(' '));e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await click('Unlock messages');
    await until('!!document.querySelector(\'[aria-label="Encrypted messaging setup"] [role="alert"]\')','Wrong actual phrase produces a recovery error');
    await evaluate('window.dispatchEvent(new Event("pinevela-chat-locked"))');
    await until('!document.querySelector(\'[aria-label="Encrypted messaging setup"] [role="alert"]\')&&document.querySelector("#chat-recovery-phrase")?.value===""','Lock clears visible recovery error and phrase');
    check(await evaluate('!document.querySelector(\'[aria-label="Encrypted messaging setup"]\').innerText.includes("Unlocking")'),'Lock also clears a failed-recovery busy state');
    await evaluate(`(()=>{const e=document.querySelector('#chat-recovery-phrase');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(fixture.buyerPhrase)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    // Hold a real successful Web Crypto result until after Lock. No cryptographic
    // value is invented; this deterministically exercises stale async completion.
    await evaluate(`(()=>{const subtle=crypto.subtle,original=subtle.decrypt.bind(subtle);window.__originalChatDecrypt=original;subtle.decrypt=async(...args)=>{const result=await original(...args);subtle.decrypt=original;return new Promise(resolve=>{window.__releaseChatRecovery=()=>resolve(result);window.__chatRecoveryHeld=true;});};})()`);
    await click('Unlock messages');await until('window.__chatRecoveryHeld===true','Real backup recovery reaches controlled completion');
    await evaluate('window.dispatchEvent(new Event("pinevela-chat-locked"))');
    await until('document.querySelector("#chat-recovery-phrase")?.value===""&&!document.querySelector(\'[aria-label="Encrypted messaging setup"]\').innerText.includes("Unlocking")','Lock clears phrase and busy state while component stays mounted');
    check(await evaluate('!document.querySelector(\'button[aria-label="Lock encrypted messages"]\')&&!document.querySelector(\'[aria-label="Encrypted messaging setup"] [role="alert"]\')'),'Lock leaves no unlocked state or stale error');
    await evaluate('window.__releaseChatRecovery();delete window.__releaseChatRecovery;delete window.__chatRecoveryHeld;');await pause(400);
    check(await evaluate('document.querySelector("#chat-recovery-phrase")?.value===""&&!document.querySelector(\'button[aria-label="Lock encrypted messages"]\')'),'Late genuine recovery cannot repopulate locked UI or identity');
    await evaluate(`(()=>{const e=document.querySelector('#chat-recovery-phrase');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(fixture.buyerPhrase)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click('Unlock messages');
    await until('!!document.querySelector(\'button[aria-label="Lock encrypted messages"]\')','Actual phrase decrypts and unlocks');
    await until('document.querySelectorAll(\'[aria-label="Conversations"] button\').length>0','Actual ciphertext history produces a thread');
    await evaluate('document.querySelector(\'[aria-label="Conversations"] button\').click()');
    await until('document.querySelector(\'[aria-label="Conversation messages"]\')?.innerText.includes("Please inspect the book")','Actual historical ciphertext decrypts in browser');
    check(await evaluate('!document.querySelector("#chat-recovery-phrase")'),'Phrase field removed after unlock');
    check(await evaluate(`![...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes(${JSON.stringify(fixture.buyerPhrase)})||v.includes('Please inspect the book'))`),'Phrase and plaintext are never persisted in browser storage');
    await click('Encryption fingerprints');
    await until(`document.body.textContent.includes(${JSON.stringify(fixture.buyerFingerprint.match(/.{1,4}/g).join(' '))})&&document.body.textContent.includes(${JSON.stringify(fixture.sellerFingerprint.match(/.{1,4}/g).join(' '))})`,'Actual peer fingerprint lookup completes');
    check(await evaluate(`document.body.textContent.includes(${JSON.stringify(fixture.buyerFingerprint.match(/.{1,4}/g).join(' '))})&&document.body.textContent.includes(${JSON.stringify(fixture.sellerFingerprint.match(/.{1,4}/g).join(' '))})`),'Both real public fingerprints are visible for trusted comparison');
    await evaluate(`(()=>{const subtle=crypto.subtle,original=subtle.decrypt.bind(subtle),originalFetch=window.fetch.bind(window);window.__chatDecryptCalls=0;window.__chatReadComplete=0;subtle.decrypt=(...args)=>{window.__chatDecryptCalls++;return original(...args);};window.fetch=async(...args)=>{const response=await originalFetch(...args);if(new URL(typeof args[0]==='string'?args[0]:args[0].url,location.origin).pathname==='/api/digital-market/messages'&&(!args[1]?.method||args[1].method==='GET')){await response.clone().arrayBuffer();window.__chatReadComplete++;}return response;};})()`);
    await evaluate('document.querySelector(\'button[aria-label="Refresh messages"]\').click()');await until('window.__chatReadComplete>0','Actual unchanged ciphertext refresh finishes');await pause(150);
    check(await evaluate('window.__chatDecryptCalls===0'),'Unchanged encrypted history reuses identity-bound cache without repeating Web Crypto');
    await screenshot('encrypted-chat-desktop');
    const text='Private browser message '+Date.now();
    await evaluate(`(()=>{const e=document.querySelector('#market-message');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await evaluate('document.querySelector("#market-message").closest("form").requestSubmit()');
    await until(`document.querySelector('[aria-label="Conversation messages"]')?.innerText.includes(${JSON.stringify(text)})`,'New actual encrypted send decrypts in thread');
    check(sent.some(r=>r.path==='/api/digital-market/messages')&&sent.filter(r=>r.path==='/api/digital-market/messages').every(r=>!r.body.includes(text)&&JSON.parse(r.body).encrypted&&!('content' in JSON.parse(r.body))),'Browser sends only ciphertext, never message plaintext');
    await size(375,812);check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Encrypted chat fits mobile viewport');await screenshot('encrypted-chat-mobile');
    stage='selected message report explicit consent';await click('Report message');
    await until('!!document.querySelector(\'dialog[aria-label="Report message"] textarea\')','Selected message report opens');
    await fillLabel('What happened?','Review only this selected message from the encrypted conversation. '+Date.now());
    const before=sent.filter(r=>r.path==='/api/reports').length;
    check(await evaluate('[...document.querySelectorAll(\'dialog[aria-label="Report message"] button\')].find(b=>b.textContent.trim()==="Submit report").disabled'),'Submitting encrypted evidence requires explicit consent');
    check(sent.filter(r=>r.path==='/api/reports').length===before,'Opening report does not disclose a key');
    await evaluate('document.querySelector(\'dialog[aria-label="Report message"] input[type="checkbox"]\').click()');await click('Submit report');
    await until('document.body.innerText.includes("Report received")','Explicit selected-message disclosure is verified and saved');
    const reports=sent.filter(r=>r.path==='/api/reports');const evidence=JSON.parse(reports.at(-1).body).evidence;
    check(evidence.messageId===fixture.messageId&&evidence.consent===true&&/^[A-Za-z0-9_-]{43}$/.test(evidence.key)&&!reports.at(-1).body.includes(fixture.buyerPhrase)&&!reports.at(-1).body.includes('Please inspect the book'),'Report shares only selected message key after consent');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await until('!document.querySelector(\'dialog[aria-label="Report message"]\')','Report closes');
    await size(1440,1000);await evaluate('document.querySelector(\'button[aria-label="Lock encrypted messages"]\').click()');
    await until('!!document.querySelector("#chat-recovery-phrase")','Lock requires original recovery phrase again');
    check(!await evaluate('document.body.innerText.includes("Please inspect the book")'),'Lock immediately removes decrypted message content');
    await signOut('reporter');await signIn('other');stage='account isolation after actual logout';
    await evaluate('location.hash="/user/dashboard?tab=digital-market&mode=chats"');await until('!!document.querySelector(\'[aria-label="Encrypted messaging setup"]\')','Other account inbox opens');
    await until('document.body.innerText.includes("Create my private recovery phrase")','Independent account has independent encryption identity');
    check(!await evaluate('document.body.innerText.includes("Please inspect the book")||document.querySelector(\'[aria-label="Conversations"]\')?.innerText.includes("Local Encryption Store")'),'Next genuine account never inherits plaintext or conversation history');
    await click('Create my private recovery phrase');await until('!!document.querySelector("#new-chat-recovery-phrase")','New phrase appears for an independent account');
    await evaluate('document.querySelector(\'[aria-label="Encrypted messaging setup"] input[type="checkbox"]\').click()');
    check(await evaluate('document.querySelector(\'[aria-label="Encrypted messaging setup"] input[type="checkbox"]\').checked'),'User can acknowledge saving generated phrase');
    await evaluate('window.dispatchEvent(new Event("pinevela-chat-locked"))');
    await until('!document.querySelector("#new-chat-recovery-phrase")&&!document.querySelector(\'[aria-label="Encrypted messaging setup"] input[type="checkbox"]\')','Lock clears generated phrase and confirmation');
    await click('Create my private recovery phrase');
    check(await evaluate('!document.querySelector(\'[aria-label="Encrypted messaging setup"] input[type="checkbox"]\').checked'),'A new generated phrase requires a new explicit confirmation after Lock');
    await evaluate('window.dispatchEvent(new Event("pinevela-chat-locked"))');
    check(errors.length===0,'No uncaught browser exceptions');
    const result={passed:true,checks,actualNativeLogins:2,actualEncryptedSend:true,actualSelectedMessageReport:true,privatePhraseRecovery:true,logoutIsolation:true,productionRecordsModified:0,artifacts};
    await fs.writeFile(path.join(artifacts,'result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
  } catch(failure) {
    if(command){try{const result=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(artifacts,'failure.png'),Buffer.from(result.data,'base64'),{mode:0o600});}catch{}}
    await fs.writeFile(path.join(artifacts,'failure.json'),JSON.stringify({stage,checks,error:failure.message,errors}),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,artifacts}));process.exitCode=1;
  } finally{if(command&&ws?.readyState===WebSocket.OPEN){try{await command('Browser.close');}catch{}}ws?.close();for(const pending of waiting.values())clearTimeout(pending.timer);}
})().catch(()=>{console.error('Owned encrypted chat browser verification could not start.');process.exitCode=1;});
