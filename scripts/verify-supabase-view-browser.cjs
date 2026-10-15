/** Actual signed-in reads in an owned task tab. No credentials, fixtures,
 * provider replies or product mutations. Existing user tabs stay untouched. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
let checks=0,stage='browser setup';
const ui=process.argv[2]==='--ui';
assert(process.argv.length<=3&&(!process.argv[2]||ui),'Optional --ui only');
(async()=>{
  await withApprovedPineVelaBrowser(async({evaluate,navigate,waitFor,command})=>{
    stage='verified administrator';
    const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();return {status:r.status,role:u.role,verified:!!u.isVerified};})()");
    assert(me.status===200&&me.role==='admin'&&me.verified,'A genuine verified administrator is required');checks++;
    for(const route of ['/api/staff','/api/issue-reports','/api/staff-bargains','/api/activities','/api/meetings','/api/admin/digital-market/applications','/api/admin/manager-closure-requests','/api/hostels','/api/digital-market/products']){
      stage='projection '+route;
      const result=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const d=await r.json();return {status:r.status,array:Array.isArray(d),queue:Array.isArray(d.requests)};})()`);
      assert(result.status===200&&(result.array||result.queue),'Actual signed-in administrator receives the projection');checks++;
      console.log(JSON.stringify({stage:'verified_projection_read',checks}));
    }
    if(ui){
      stage='administrator dashboard';
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
      await navigate('/#/admin/dashboard');
      const approvals="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&b.textContent.trim().startsWith('Admin Approvals'))";
      await waitFor('!!('+approvals+')','Administrator navigation');checks++;
      const home=await evaluate("(()=>{const h=[...document.querySelectorAll('h2')].find(h=>h.textContent.startsWith('Welcome back,'));return{greeting:!!h,flat:h?getComputedStyle(h).textShadow==='none':false,bounded:document.documentElement.scrollWidth<=innerWidth+1};})()");
      assert(home.greeting&&home.flat&&home.bounded,'Actual administrator dashboard renders without horizontal overflow');checks++;
      await evaluate('('+approvals+').click()');
      await waitFor('!!document.querySelector(\'section[aria-label="System wipe reviews"]\')','Native review panel');checks++;
      stage='read-only scope preview';
      await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]');const label=[...s.querySelectorAll('label')].find(l=>l.textContent.trim().startsWith('Primary users'));const input=label.querySelector('input');if(!input.checked)input.click();})()`);
      await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]');[...s.querySelectorAll('button')].find(b=>b.textContent==='Preview selected scope').click();})()`);
      await waitFor('!!document.querySelector(\'section[aria-label="Exact system wipe scope"]\')','Read-only native scope preview');checks++;
      for(const [width,height]of[[1440,900],[375,812]]){
        stage='review controls '+width;
        await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
        const state=await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]');return{six:s.querySelectorAll('input[type="checkbox"]').length===6,bounded:s.scrollWidth<=s.clientWidth+1,gate:s.textContent.includes('Execution remains disabled'),saveDisabled:[...s.querySelectorAll('button')].find(b=>b.textContent==='Save review and my single approval')?.disabled};})()`);
        assert(state.six&&state.bounded&&state.gate&&state.saveDisabled,'Actual responsive review controls retain disabled execution/key gates: '+JSON.stringify(state));checks++;
      }
    }
    const result={passed:true,checks,genuineAdministrator:true,actualReplies:true,providerRepliesMocked:false,privateCredentialsExtracted:false,domainMutationsRequested:false,projectionReadsVerified:true,separateTaskTab:true,explicitUniqueExecutionContext:true,managerMutationBrowserPending:true};
    Object.assign(result,{administratorUiVerified:ui,responsiveWidths:ui?[1440,375]:[]});
    const directory=path.resolve('.security/migration-reset/browser-acceptance-20261014');await fs.mkdir(directory,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(directory,'view-exposure-administrator.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  });
})().catch(error=>{console.error(JSON.stringify({passed:false,stage,checks,error:error.message,credentialsExtracted:false}));process.exitCode=1;});
