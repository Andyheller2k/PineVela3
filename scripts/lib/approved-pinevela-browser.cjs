/** One task tab in the user-approved local browser. Existing-dashboard modes are
 * explicitly selected for the user's prepared primary/admin page; they never close it.
 * Never read cookies, storage values, keys or unrelated tabs, or replay an evaluation. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const BASE='http://127.0.0.1:3001',pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function withApprovedPineVelaBrowser(work,{existingPrimary=false,existingAdmin=false,preferPrimaryContext=false,preferOfficerContext=false,preferManagerContext=false,preparedContextId,approvalTimeoutMs=45000,evaluationTimeoutMs=55000}={}){
  assert(Number.isInteger(approvalTimeoutMs)&&approvalTimeoutMs>=1000&&approvalTimeoutMs<=180000,'Bounded browser approval wait');
  assert(Number.isInteger(evaluationTimeoutMs)&&evaluationTimeoutMs>=1000&&evaluationTimeoutMs<=180000,'Bounded browser evaluation wait');
  assert(Number(existingPrimary||preferPrimaryContext)+Number(existingAdmin)+Number(preferOfficerContext)+Number(preferManagerContext)<=1,'Select one prepared account context.');
  assert(preparedContextId===undefined||typeof preparedContextId==='string'&&preparedContextId.length>0&&preparedContextId.length<=256,'Use one saved local browser context.');
  const [port,endpoint]=(await fs.readFile(path.join(os.homedir(),'snap/chromium/common/chromium/DevToolsActivePort'),'utf8')).trim().split('\n');
  assert(port==='9222'&&/^\/devtools\/browser\/[a-f0-9-]{36}$/i.test(endpoint),'Use the approved local browser endpoint');
  const socket=new WebSocket('ws://127.0.0.1:'+port+endpoint),pending=new Map(),contexts=new Map(),listeners=new Set();
  let seq=0,session,createdTarget,mainFrame;
  function rejectPending(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Browser connection ended'));}pending.clear();}
  socket.addEventListener('close',rejectPending);
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
      if(m.error){const e=new Error('Browser command rejected: '+p.method+' ('+m.error.code+')');e.contextLost=p.method==='Runtime.evaluate'&&[-32000,-32602].includes(m.error.code)&&/context|navigat|destroy/i.test(m.error.message||'');p.reject(e);}else p.resolve(m.result);return;}
    if(m.sessionId!==session)return;
    for(const listener of listeners)listener(m);
    if(m.method==='Runtime.executionContextCreated')contexts.set(m.params.context.id,m.params.context);
    if(m.method==='Runtime.executionContextDestroyed')contexts.delete(m.params.executionContextId);
    if(m.method==='Runtime.executionContextsCleared')contexts.clear();
    if(m.method==='Page.frameNavigated'&&!m.params.frame.parentId)mainFrame=m.params.frame.id;
  });
  const command=(method,params={},target=session,timeout=55000)=>new Promise((resolve,reject)=>{
    if(socket.readyState!==WebSocket.OPEN)return reject(new Error('Browser connection unavailable'));
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Browser command timed out: '+method));},timeout);
    pending.set(id,{resolve,reject,timer,method});socket.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));
  });
  async function context(){const until=Date.now()+45000;while(Date.now()<until){
    const c=[...contexts.values()].find(c=>c.origin===BASE&&c.auxData?.isDefault&&c.auxData.frameId===mainFrame);
    if(c?.uniqueId)return c.uniqueId;await pause(100);
  }throw new Error('The local PineVela execution context did not become ready');}
  async function evaluate(expression){
    const result=await command('Runtime.evaluate',{expression,uniqueContextId:await context(),returnByValue:true,awaitPromise:true},session,evaluationTimeoutMs);
    if(result.exceptionDetails){const e=new Error('Browser evaluation did not complete');e.contextLost=/context|navigat|destroy/i.test(result.exceptionDetails.text||'');throw e;}
    return result.result.value;
  }
  // Only this explicitly read-only readiness predicate retries across navigation.
  // A lost reply to arbitrary evaluation may follow a committed operation.
  async function waitFor(readOnlyExpression,label,timeout=60000){const until=Date.now()+timeout;while(Date.now()<until){
    try{if(await evaluate(readOnlyExpression))return;}catch(e){if(!e.contextLost)throw e;}await pause(200);
  }throw new Error(label+' did not become ready');}
  async function navigate(localPath){
    const url=new URL(localPath,BASE);assert(url.origin===BASE&&!url.username&&!url.password,'Navigate only within the approved origin');
    contexts.clear();const result=await command('Page.navigate',{url:url.href});assert(!result.errorText,'Local navigation must succeed');mainFrame=result.frameId;
    await waitFor("location.origin==='"+BASE+"'&&document.readyState==='complete'",'Local PineVela document');
  }
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Browser connection approval timed out')),approvalTimeoutMs);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Browser connection failed'));},{once:true});});
    const targets=(await command('Target.getTargets',{},null)).targetInfos.filter(t=>t.type==='page'&&t.url.startsWith(BASE+'/')&&
      (preparedContextId===undefined||(t.browserContextId||'default')===preparedContextId));
    assert(preparedContextId===undefined||targets.length,'Leave the saved local browser context open.');
    const preparedRoutes=['#/user/dashboard','#/register-manager'];
    const primaryTargets=targets.filter(t=>preparedRoutes.includes(new URL(t.url).hash.split('?')[0]));
    const managerTargets=primaryTargets.filter(t=>new URL(t.url).hash.split('?')[0]==='#/register-manager');
    // Opening the provided registration link may leave the dashboard tab open.
    // Prefer the single requested manager page without touching the dashboard.
    const prepared=managerTargets.length===1?managerTargets:primaryTargets;
    let existing;
    if(existingAdmin){
      const admins=targets.filter(t=>new URL(t.url).hash.split('?')[0]==='#/admin/dashboard');
      assert(admins.length===1,'Leave one prepared administrator dashboard open in the requested context.');existing=admins[0];
    }else if(preferOfficerContext||preferManagerContext){
      const portals=targets.filter(t=>new URL(t.url).hash.split('?')[0]===(preferManagerContext?'#/manager/dashboard':'#/field-officer'));
      assert(portals.length,preferManagerContext?'Sign in as the real manager and leave the local manager dashboard open.':'Sign in as the real officer and leave the local field-officer portal open.');
      assert(new Set(portals.map(t=>t.browserContextId||'default')).size===1,'Leave the requested portal open in only one browser context.');
      existing=portals[0];
    }else existing=existingPrimary||preferPrimaryContext
      ? (assert(prepared.length===1,'Leave one prepared primary tab open (found '+primaryTargets.length+' primary tabs, '+managerTargets.length+' manager pages)'),prepared[0])
      : targets.find(t=>new URL(t.url).hash.split('?')[0]==='#/admin/dashboard')||targets[0];
    // The approved browser can retain its sign-in without an open app tab.
    // With no PineVela target, create our tab in its default browser context;
    // the caller must still check the actual /api/auth/me response.
    if(!existingPrimary&&!existingAdmin)createdTarget=(await command('Target.createTarget',{url:'about:blank',background:false,...(existing?.browserContextId?{browserContextId:existing.browserContextId}:{})},null)).targetId;
    session=(await command('Target.attachToTarget',{targetId:existingPrimary||existingAdmin?existing.targetId:createdTarget,flatten:true},null)).sessionId;
    await command('Page.enable');await command('Runtime.enable');await command('Page.bringToFront');mainFrame=(await command('Page.getFrameTree')).frameTree.frame.id;
    if(existingPrimary||existingAdmin){
      const routes=existingAdmin?['#/admin/dashboard']:['#/user/dashboard','#/register-manager'];
      assert(await evaluate("location.origin==='"+BASE+"'&&"+JSON.stringify(routes)+".includes(location.hash.split('?')[0])&&!document.querySelector('[role=dialog],dialog[open]')&&!document.activeElement?.matches('input,textarea,[contenteditable=true]')"),'Prepared dashboard must have no open dialog or focused field before testing');
    }else await navigate('/api/health');
    return await work({base:BASE,evaluate,waitFor,navigate,command,onEvent:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}});
  }finally{
    if(createdTarget&&socket.readyState===WebSocket.OPEN)try{await command('Target.closeTarget',{targetId:createdTarget},null,10000);}catch{}
    listeners.clear();rejectPending();socket.close();
  }
}
module.exports={withApprovedPineVelaBrowser};
