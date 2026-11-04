const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const project='/home/wyse/Documents/PineVela3';
const projectRequire=createRequire(path.join(project,'package.json'));
const esbuild=projectRequire('esbuild');
const React=projectRequire('react');
const {renderToStaticMarkup}=projectRequire('react-dom/server');
(async()=>{
 const output=path.join(project,'docs/verification/seller-subscriptions-2026-10-31/android');
 await fs.mkdir(output,{recursive:true});
 const bundle=path.join(output,'subscription-probe-component.cjs');
 await esbuild.build({entryPoints:[path.join(project,'src/components/SellerSubscriptionPlans.tsx')],bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'},outfile:bundle,logLevel:'silent'});
 delete require.cache[bundle];
 const Component=require(bundle).default;
 const prices={default:7.25,star:127.35,pro:211.50};
 const plans=[];
 for(const currentPlan of ['default','star','pro']){
  const markup=renderToStaticMarkup(React.createElement(Component,{currentPlan,prices,busy:false,onChoose:()=>{},onKeep:()=>{}}));
  const file='plan-'+currentPlan+'.html';await fs.writeFile(path.join(output,file),markup+'\n');
  plans.push({currentPlan,file,markupSha256:crypto.createHash('sha256').update(markup).digest('hex')});
 }
 const sources=[];
 for(const file of ['src/components/SellerSubscriptionPlans.tsx','src/sellerSubscriptions.css','src/lib/sellerPlanComparison.ts','marketPlans.ts'])sources.push({file,sha256:crypto.createHash('sha256').update(await fs.readFile(path.join(project,file))).digest('hex')});
 const manifest={isolatedServerRenderedComponentMarkup:true,actualComponent:'src/components/SellerSubscriptionPlans.tsx',syntheticPrices:prices,authenticatedStateFabricated:false,accountActionsSubmitted:false,renderingOnlyNoReactHydration:true,sourceHashes:sources,plans};
 await fs.writeFile(path.join(output,'ssr-probe-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({prepared:true,plans:plans.length,syntheticPrices:prices,sourceHashes:sources}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
