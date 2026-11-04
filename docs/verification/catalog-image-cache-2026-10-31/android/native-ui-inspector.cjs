const fs=require('node:fs/promises');
const {execFileSync}=require('node:child_process');
const {once}=require('node:events');
const adbPath='/home/wyse/Android/Sdk/platform-tools/adb';
const app='app.pinevela.mobile.debug';
const adb=(args)=>execFileSync(adbPath,['-s','emulator-5554',...args],{timeout:30000,maxBuffer:16*1024*1024});
(async()=>{
  const pid=adb(['shell','pidof',app]).toString().trim().split(/\s+/)[0];
  if(!/^\d+$/.test(pid)) throw Error('Installed PineVela process is unavailable');
  adb(['forward','tcp:9236','localabstract:webview_devtools_remote_'+pid]);
  let ws;
  try {
    const targets=await fetch('http://127.0.0.1:9236/json/list').then(r=>r.json());
    const target=targets.find(t=>t.type==='page'&&t.url.startsWith('https://localhost'));
    if(!target) throw Error('Actual bundled WebView not available');
    ws=new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/,'127.0.0.1'));
    await once(ws,'open'); let seq=0;const pending=new Map();
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);const w=pending.get(m.id);if(!w)return;pending.delete(m.id);clearTimeout(w.timer);m.error?w.reject(Error('CDP request rejected')):w.resolve(m.result);});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP request timed out'));},25000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
    await send('Runtime.enable');
    const expression=await fs.readFile(process.argv[2],'utf8');
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails) throw Error('Inspection expression failed');
    console.log(JSON.stringify(result.result.value,null,2));
  } finally {ws?.close();try{adb(['forward','--remove','tcp:9236']);}catch{}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
