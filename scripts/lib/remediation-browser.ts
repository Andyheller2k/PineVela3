/** Real Chromium + the real app/static-delivery and viewport component.
 * Existing private checkpoint notices only; no fabricated accounts/API replies. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import express from 'express';
import {build} from 'esbuild';
import type {SupabaseDatabase} from '../../supabase/db.js';
import {createSupabaseApp} from '../../supabase/app.js';
import {installStaticFrontend} from '../../supabase/staticFrontend.js';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export async function verifyRemediationBrowser(db:SupabaseDatabase){
 const directory=path.resolve('.security/remediation-2026-10-20'),framing:string[]=[],visibility:string[]=[];
 const notices=JSON.parse(await fs.readFile(path.join(directory,'pv07-browser-notices.json'),'utf8'));
 assert(notices.length,'An actual unread checkpoint notice is required for visibility verification.');
 const created=createSupabaseApp(db);installStaticFrontend(created.app,path.join(directory,'frontend'));
 const server=created.app.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+(server.address() as any).port;
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Tracker from './src/components/NotificationViewportTracker';
 const notice=${JSON.stringify(notices[0])};let root;window.calls=[];window.mountNotice=(offscreen,scope='archived-owner')=>{
  root?.unmount();document.querySelector('#root').replaceChildren();root=createRoot(document.querySelector('#root'));
  root.render(React.createElement(React.Fragment,null,React.createElement(Tracker,{scopeKey:scope,notifications:[notice],onViewed:async id=>{window.calls.push(id);}}),
   React.createElement('article',{'data-notification-id':notice.id,style:{marginTop:offscreen?'3000px':'20px',padding:'24px',background:'#ffd60a',color:'#001d3d'}},React.createElement('h2',null,notice.title),React.createElement('p',null,notice.message))));
 };window.unmountNotice=()=>root?.unmount();window.harnessReady=true;`,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const parent=express();
 parent.get('/components.js',(_req,res)=>res.type('application/javascript').send(Buffer.from(bundle.outputFiles[0].contents)));
 parent.get('/visibility',(_req,res)=>res.type('html').send('<!doctype html><html><body style="margin:0"><div id="root"></div><dialog id="cover">An open dialog covers the page.</dialog><script src="/components.js"></script></body></html>'));
 parent.get('/frame',(_req,res)=>res.type('html').send(`<!doctype html><html><body><iframe title="Framing attempt" src="${origin}/#/login" width="1000" height="700"></iframe></body></html>`));
 const parentServer=parent.listen(0,'127.0.0.1');await once(parentServer,'listening');
 const parentOrigin='http://127.0.0.1:'+(parentServer.address() as any).port;
 const profile=await fs.mkdtemp('/tmp/pinevela-remediation-browser-');
 const probe=net.createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as any).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const chrome=spawn('/snap/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let ws:WebSocket|undefined,sequence=0;const waiting=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>(),logs:string[]=[];
 let command:(method:string,params?:any)=>Promise<any>;
 try{
  let target:any;
  for(let attempt=0;attempt<100;attempt++){try{target=(await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json())).find((item:any)=>item.type==='page');}catch{}if(target||chrome.exitCode!==null)break;await pause(200);}
  assert(target,'Isolated Chromium must start.');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise<void>((resolve,reject)=>{ws!.onopen=()=>resolve();ws!.onerror=()=>reject(Error('Browser connection failed.'));});
  command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{waiting.delete(id);reject(Error('Browser command timeout: '+method));},30000);waiting.set(id,{resolve,reject,timer});ws!.send(JSON.stringify({id,method,params}));});
  ws.onmessage=event=>{const message=JSON.parse(String(event.data));if(message.id){const item=waiting.get(message.id);if(item){clearTimeout(item.timer);waiting.delete(message.id);message.error?item.reject(Error('Browser command rejected: '+message.error.message)):item.resolve(message.result);}}
   else if(message.method==='Log.entryAdded')logs.push(message.params.entry.text);
   else if(message.method==='Fetch.requestPaused'){
    const url=new URL(message.params.request.url);void command(url.hostname==='127.0.0.1'?'Fetch.continueRequest':'Fetch.failRequest',url.hostname==='127.0.0.1'?{requestId:message.params.requestId}:{requestId:message.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
   }};
  await command('Page.enable');await command('Runtime.enable');await command('Log.enable');await command('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  const evaluate=async(expression:string)=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('Browser evaluation failed.');return result.result.value;};
  const until=async(expression:string)=>{const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await pause(100);}throw Error('Browser condition timed out.');};
  for(const route of ['/','/index.html','/login','/user/dashboard','/faq','/help']){
   const response=await fetch(origin+route);assert.equal(response.headers.get('Content-Security-Policy'),"frame-ancestors 'none'");assert.equal(response.headers.get('X-Frame-Options'),'DENY');await response.body?.cancel();framing.push('Actual app document/fallback sends both framing policies');
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:origin+'/#/login'});
  await until('!!document.querySelector(\'input[aria-label="Username or Email Address"]\')');
  framing.push('The actual built login remains usable through direct navigation');
  await command('Page.navigate',{url:parentOrigin+'/frame'});await pause(1000);
  const tree=await command('Page.getFrameTree');
  assert(logs.some(text=>/frame-ancestors|X-Frame-Options|refused to (?:frame|display)/i.test(text)),'Chromium reports the enforced framing rejection.');
  assert(tree.frameTree.childFrames?.some((child:any)=>child.frame.unreachableUrl?.startsWith(origin)||child.frame.url.startsWith('chrome-error:')),'The framed application fails to load.');
  framing.push('Chromium blocks an actual cross-origin embedding attempt');
  for(const width of [390,1440]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width<600});
   await command('Page.navigate',{url:parentOrigin+'/visibility'});await until('window.harnessReady===true');
   await evaluate('window.mountNotice(true)');await pause(600);assert.equal(await evaluate('window.calls.length'),0);visibility.push('An actual offscreen notice is not acknowledged at '+width+'px');
   await evaluate('document.querySelector("#cover").showModal();window.mountNotice(false)');await pause(600);assert.equal(await evaluate('window.calls.length'),0);visibility.push('An open modal prevents notice acknowledgement at '+width+'px');
   await evaluate('document.querySelector("#cover").close()');await until('window.calls.length===1');visibility.push('The uncovered visible notice is acknowledged after dwell at '+width+'px');
   await pause(500);assert.equal(await evaluate('window.calls.length'),1);visibility.push('An unchanged visible notice is not repeatedly acknowledged at '+width+'px');
   await evaluate('window.calls=[];window.mountNotice(false,"departing-native-scope")');await pause(70);await evaluate('window.unmountNotice()');await pause(500);assert.equal(await evaluate('window.calls.length'),0);visibility.push('Unmounting the scope cancels pending acknowledgement at '+width+'px');
  }
  await fs.writeFile(path.join(directory,'pv07-pv08-browser.json'),JSON.stringify({passed:true,framing,visibility,actualCheckpointNotices:true,externalRequestsBlocked:true},null,2)+'\n',{mode:0o600});
  return {framing,visibility};
 }finally{
  if(ws?.readyState===WebSocket.OPEN){try{await command!('Browser.close');}catch{}ws.close();}
  for(const item of waiting.values()){clearTimeout(item.timer);item.reject(Error('Browser closed.'));}waiting.clear();
  if(chrome.exitCode===null)await Promise.race([once(chrome,'exit'),pause(5000)]);
  // The own headless process is asked to close through DevTools first.
  if(chrome.exitCode===null)chrome.kill('SIGTERM');
  await created.app.locals.closeSupport?.();await created.app.locals.closeRealtime();server.closeAllConnections();parentServer.closeAllConnections();
  await Promise.all([new Promise<void>(resolve=>server.close(()=>resolve())),new Promise<void>(resolve=>parentServer.close(()=>resolve()))]);
  if(chrome.exitCode!==null)await fs.rm(profile,{recursive:true,force:true});
 }
}
