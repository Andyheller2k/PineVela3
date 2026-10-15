/** Genuine saved Google manager enrollment and reload/resume acceptance.
 * Only the approved local app, real HTTP replies and existing session cookies.
 * Never signs in, submits a property or reads credentials/browser storage. */
const assert=require('node:assert/strict');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const managerEmail=(process.argv[2]||'').trim().toLowerCase(),interactive=process.argv[3]==='--interactive';
assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)&&process.argv.length<=4&&(!process.argv[3]||interactive),'Pass the actual manager email and optional --interactive');
let stage='approved local browser';

(async()=>{
 await withApprovedPineVelaBrowser(async context=>{
  let passed=false;
  const checker=()=>{const file=require.resolve('./lib/manager-created-browser-check.cjs');delete require.cache[file];return require(file);};
  const run=async()=>{const check=checker();try{await check.verify(context,managerEmail);passed=true;}catch(e){passed=false;stage=check.getStage();console.error(JSON.stringify({passed:false,stage,error:e.message,connectionRetained:interactive}));if(!interactive)throw e;}};
  await run();
  if(interactive){
   const lines=require('node:readline').createInterface({input:process.stdin,terminal:false});
   console.log(JSON.stringify({connectionRetained:true,commands:['status','verify','close']}));
   for await(const line of lines){
    if(line.trim()==='close')break;
    if(line.trim()==='verify'){await run();continue;}
    if(line.trim()==='status')console.log(JSON.stringify({status:await checker().status(context)}));
   }
   lines.close();
  }
  if(!passed)process.exitCode=1;
 },{preferPrimaryContext:true,approvalTimeoutMs:interactive?120000:45000});
})().catch(e=>{console.error(JSON.stringify({passed:false,stage,error:e.message,credentialsExtracted:false}));process.exitCode=1;});
