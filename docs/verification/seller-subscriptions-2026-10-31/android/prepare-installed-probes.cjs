const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const project='/home/wyse/Documents/PineVela3';const output=path.join(project,'docs/verification/seller-subscriptions-2026-10-31/android');
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(output,'ssr-probe-manifest.json'),'utf8'));
 const bundledCss=[];
 for(const file of await fs.readdir(path.join(project,'dist-mobile/assets'))){
  if(!file.endsWith('.css'))continue;const text=await fs.readFile(path.join(project,'dist-mobile/assets',file),'utf8');
  if(text.includes('.seller-plan-upgrade')&&text.includes('.seller-plan-comparison'))bundledCss.push({href:'/assets/'+file,sha256:crypto.createHash('sha256').update(text).digest('hex')});
 }
 if(!bundledCss.length)throw Error('Final mobile CSS does not contain the subscription component yet');
 const plans=[];for(const plan of manifest.plans)plans.push({...plan,markup:(await fs.readFile(path.join(output,plan.file),'utf8')).trim()});
 const fixture={...manifest,plans,bundledCss};
 const template=await fs.readFile(path.join(output,'probe-template.js'),'utf8');
 await fs.writeFile(path.join(output,'installed-webview-probes.js'),template.replace('__NATIVE_SUBSCRIPTION_FIXTURE__',JSON.stringify(fixture)));
 await fs.writeFile(path.join(output,'probe-bundle-manifest.json'),JSON.stringify({bundledCss,sourceHashes:manifest.sourceHashes,isolatedSsrOnly:true},null,2)+'\n');
 console.log(JSON.stringify({prepared:true,bundledCss,plans:plans.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
