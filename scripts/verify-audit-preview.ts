/** Actual loopback preview: public reads, document policy, guarded APIs and
 * built-byte/secret checks. No login, mutation, fake account or provider call. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
const origin=new URL(process.argv[2]||'http://127.0.0.1:3001');
assert(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'&&!origin.username&&!origin.password&&origin.pathname==='/');
const checks:string[]=[];
const get=(route:string)=>fetch(new URL(route,origin),{signal:AbortSignal.timeout(20000)});
const check=(value:unknown,name:string)=>{assert(value,name);checks.push(name);};
try{
 const health=await get('/api/health');check(health.ok&&(await health.json()).persistence==='supabase','Actual preview uses the native Supabase backend');
 for(const route of ['/api/hostels','/api/digital-market/products']){const response=await get(route);check(response.ok&&Array.isArray(await response.json()),'Actual public catalog read remains available');}
 const html=fs.readFileSync('dist-supabase/index.html','utf8');
 for(const route of ['/','/index.html','/login','/user/dashboard','/faq','/help']){
  const response=await get(route);check(response.status===200&&(await response.text())===html,'Preview serves the current built frontend document');
  check(response.headers.get('Content-Security-Policy')==="frame-ancestors 'none'"&&response.headers.get('X-Frame-Options')==='DENY','Preview enforces document framing protection');
 }
 for(const route of ['/api/auth/me','/api/digital-market/my-orders?paged=1','/api/digital-market/messages?paged=1','/api/admin/payments/reversals','/api/companion']){
  const response=await get(route),body=await response.json();check(response.status===401&&body.sessionExpired===true,'Anonymous sensitive API reads reject with the explicit session-expiry marker');
 }
 for(const route of ['/.security/backup.key','/%2esecurity/backup.key','/.security%2fbackup.key','/.env','/%2eenv','/data/pinevela_store.json','/dist-supabase-backend/supabase-server.mjs','/supabase-server.mjs','/supabase-server.mjs.map','/residence-worker.mjs','/system-wipe-worker.mjs']){
  const response=await get(route);check(response.status===404,'Private runtime and data artifacts remain inaccessible');await response.body?.cancel();
 }
 const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match=>match[1]);check(assets.length>=2,'Built frontend names actual hashed assets');
 for(const asset of assets){const response=await get(asset),bytes=Buffer.from(await response.arrayBuffer());check(response.ok&&bytes.equals(fs.readFileSync(path.join('dist-supabase',asset))),'Served asset bytes match the production build');}
 const env=dotenv.parse(fs.readFileSync('.env')),privateValues=Object.entries(env).filter(([name,value])=>!name.startsWith('VITE_')&&/(?:SECRET|PASSWORD|API_KEY|SERVICE_ROLE|DATABASE_URL|TOKEN)/.test(name)&&value.length>=16);
 let files=0;
 const walk=(directory:string)=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else if(/\.(?:js|css|html|json|svg)$/.test(entry.name)){files++;const text=fs.readFileSync(file,'utf8');for(const [name,value] of privateValues)assert(!text.includes(value),'Configured server value leaked into frontend: '+name);}}};
 walk('dist-supabase');check(true,'Public build contains no exact configured server-secret values');
 fs.writeFileSync('.security/remediation-2026-10-20/preview-verification.json',JSON.stringify({passed:true,checks:checks.length,results:checks,publicTextAssetsChecked:files,hostedTestWrites:0,financialActions:0},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({passed:true,checks:checks.length,publicTextAssetsChecked:files,hostedTestWrites:0,financialActions:0}));
}catch(error:any){console.error(JSON.stringify({passed:false,code:error.code||'verification_failed',check:error.message}));process.exitCode=1;}
