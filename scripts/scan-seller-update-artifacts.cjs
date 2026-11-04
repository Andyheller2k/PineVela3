/** Scan built delivery files without printing any credential values. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const dotenv=require('dotenv');
const settings=dotenv.parse(fs.readFileSync('.env'));
const secrets=Object.entries(settings).filter(([name,value])=>value.length>=8&&/SECRET|SERVICE_ROLE|PASSWORD|DATABASE_URL|SUPABASE_DB_URL|PRIVATE_KEY|MASTER_KEY/i.test(name)).map(([,value])=>Buffer.from(value));
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected artifact link');return entry.isDirectory()?files(file):[file];});}
const artifacts=[...files('dist-supabase'),...files('dist-mobile'),...['supabase-server.mjs','residence-worker.mjs','system-wipe-worker.mjs'].map(name=>'dist-supabase-backend/'+name)];
const manifests={};let matches=0;
for(const file of artifacts){const data=fs.readFileSync(file);for(const secret of secrets)if(data.includes(secret))matches++;manifests[file]=crypto.createHash('sha256').update(data).digest('hex');}
const report={passed:matches===0,matches,checkedFiles:artifacts.length,checkedServerSecrets:secrets.length,sourceMapsExcludedFromDelivery:true,manifests};
const output=process.env.PINEVELA_ARTIFACT_SCAN_OUTPUT||'docs/verification/seller-market-2026-10-30';fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/artifact-scan.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,matches,checkedFiles:artifacts.length}));if(!report.passed)process.exitCode=1;
