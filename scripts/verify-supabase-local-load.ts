/** Bounded application-pressure check, deliberately restricted to the real
 * run-owned loopback stack. This is not an Internet/volumetric DDoS test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {runLocalSupabaseVerification,type LocalSupabaseHarness} from './lib/local-supabase-harness.js';

type Observation={phase:string;route:string;status:number;ms:number;retryAfter:number|null};
const MAX_IN_FLIGHT=16,MAX_RPS=100,MAX_REQUESTS=2000,LOAD_MS=30000;
// Each run keeps its own evidence; never overwrite an earlier result.
const resultStamp=new Date().toISOString().replaceAll(':','-');
const resultPath=path.resolve('.security/captcha-replay-2026-10-22','bounded-load-result-'+resultStamp+'.json');
let checks=0,stage='isolated startup';
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
function summary(rows:Observation[]){
 const durations=rows.map(row=>row.ms).sort((a,b)=>a-b);
 const percentile=(p:number)=>durations.length?Number(durations[Math.min(durations.length-1,Math.ceil(durations.length*p)-1)].toFixed(2)):null;
 const statuses:Record<string,number>={};for(const row of rows)statuses[row.status]=(statuses[row.status]||0)+1;
 return {requests:rows.length,statuses,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:durations.at(-1)||null};
}
async function verify(h:LocalSupabaseHarness){
 await h.assertOwned();
 const origin=new URL(h.origin);
 check(origin.hostname==='127.0.0.1'&&origin.protocol==='http:'&&Boolean(origin.port),'Application pressure is restricted to literal loopback');
 check(!['3000','3001','5432','5433'].includes(origin.port),'The shared preview and ordinary databases cannot be load targets');
 const before=await h.db.pool.query(`select (select count(*) from auth.users)::int as users,
  (select count(*) from public.profiles)::int as profiles,(select count(*) from auth.sessions)::int as sessions`);
 check(before.rows[0].users===0&&before.rows[0].profiles===0&&before.rows[0].sessions===0,'This isolated load test starts with no accounts or sessions');
 const observations:Observation[]=[],launchTimes:number[]=[],active=new Set<Promise<void>>();
 const loop=monitorEventLoopDelay({resolution:10});loop.enable();
 const memoryStart=process.memoryUsage();let memoryPeak=memoryStart.rss,peakInFlight=0,stopReason:string|undefined;
 const cpuStart=process.cpuUsage(),startedAt=performance.now();
 const memoryTimer=setInterval(()=>{memoryPeak=Math.max(memoryPeak,process.memoryUsage().rss);if(memoryPeak>memoryStart.rss+512*1024*1024)stopReason='memory safety threshold';},100);memoryTimer.unref();
 const launch=async(phase:string,route:string,auth=false)=>{
  if(stopReason)throw Error('Stopped bounded load at '+stopReason);
  if(observations.length+active.size>=MAX_REQUESTS)throw Error('Total request cap reached');
  while(active.size>=MAX_IN_FLIGHT)await Promise.race(active);
  const now=performance.now();while(launchTimes.length&&launchTimes[0]<=now-1000)launchTimes.shift();
  if(launchTimes.length>=MAX_RPS)await pause(Math.ceil(1001-(now-launchTimes[0])));
  launchTimes.push(performance.now());
  const task=(async()=>{
   const started=performance.now();let status=0,retryAfter:number|null=null;
   try{
    const response=await fetch(new URL(route,origin),{method:auth?'POST':'GET',redirect:'error',
     ...(auth?{headers:{'content-type':'application/json'},body:'{}'}:{}),signal:AbortSignal.timeout(5000)});
    status=response.status;retryAfter=response.headers.has('retry-after')?Number(response.headers.get('retry-after')):null;
    const body=await response.json();
    if(status===200&&route==='/api/health')assert.equal(body.status,'ok');
    if(status===200&&['/api/hostels','/api/digital-market/products'].includes(route))assert.deepEqual(body,[]);
   }catch{status=0;}
   observations.push({phase,route,status,ms:performance.now()-started,retryAfter});
   const failures=observations.filter(row=>row.status>=500||row.status===0).length;
   if(observations.length>=20&&failures/observations.length>.05)stopReason='more than five percent server/network failures';
  })();active.add(task);peakInFlight=Math.max(peakInFlight,active.size);task.finally(()=>active.delete(task));return task;
 };
 try{
  stage='baseline';const firstRequestAt=performance.now();
  for(let i=0;i<20;i++)await launch('baseline',i%2?'/api/digital-market/products':'/api/health');
  check(observations.every(row=>row.status===200),'Baseline real health/catalog requests succeed');
  stage='bounded ramp';const loadStart=performance.now();let planned=0,previousOffset=0;
  for(const [phase,rps] of [['ramp-10rps',10],['ramp-40rps',40],['ramp-80rps',80]] as const){
   for(let i=0;i<rps*10;i++){
    const due=loadStart+previousOffset+i*1000/rps;const delay=due-performance.now();if(delay>0)await pause(delay);
    if(performance.now()-loadStart>LOAD_MS+2000){stopReason='load duration safety threshold';break;}
    const auth=planned++%10===0,route=auth?'/api/auth/login':planned%3===0?'/api/health':planned%2?'/api/digital-market/products':'/api/hostels';
    // Launch without awaiting the request, while enforcing16 in flight above.
    void launch(phase,route,auth);if(stopReason)break;
   }
   previousOffset+=10000;if(stopReason)break;
  }
  await Promise.all(active);const loadDurationMs=performance.now()-loadStart;
  check(!stopReason,'The isolated application remains within safety thresholds');
  const loadRows=observations.filter(row=>row.phase.startsWith('ramp-'));
  check(loadRows.length===1300,'The bounded ramp completes exactly1300 requests');
  check(loadDurationMs<LOAD_MS+2000,'Ramp duration remains bounded');
  check(peakInFlight<=MAX_IN_FLIGHT,'Observed concurrency stays within the16-request cap');
  check(!observations.some(row=>row.status===0||row.status>=500),'No timeout, network error, or5xx occurs');
  check(observations.filter(row=>row.route==='/api/auth/login'&&row.status===400).length===20,'Exactly20 malformed authentication requests reach validation before the auth budget rejects more');
  check(observations.some(row=>row.route==='/api/auth/login'&&row.status===429),'Repeated auth pressure receives429');
  check(observations.some(row=>row.route==='/api/digital-market/products'&&row.status===429),'The shared API/IP budget limits catalog pressure');
  check(observations.filter(row=>row.status===429).every(row=>row.retryAfter!==null&&row.retryAfter>=1&&row.retryAfter<=60),'Every429 provides a bounded Retry-After');
  stage='natural rate-window recovery';
  console.log(JSON.stringify({stage,load:summary(loadRows),boundedLocalOnly:true}));
  // Let the actual unmodified60-second limit expire. No fake clocks or reset.
  const recoveryDelay=Math.max(0,firstRequestAt+62500-performance.now());if(recoveryDelay)await pause(recoveryDelay);
  for(let i=0;i<20;i++)await launch('recovery',i%2?'/api/digital-market/products':'/api/health');
  const recovered=observations.filter(row=>row.phase==='recovery');
  check(recovered.length===20&&recovered.every(row=>row.status===200),'Health and catalog recover after the real rate window expires');
  check(observations.length<=MAX_REQUESTS,'Total request count stays below2000');
  await h.assertOwned();
  const after=await h.db.pool.query(`select (select count(*) from auth.users)::int as users,
   (select count(*) from public.profiles)::int as profiles,(select count(*) from auth.sessions)::int as sessions`);
  check(JSON.stringify(after.rows)===JSON.stringify(before.rows),'Malformed auth pressure creates no account/profile/session');
  const cpu=process.cpuUsage(cpuStart);
  const results={passed:true,checks,createdAt:new Date().toISOString(),scope:'single-process local HTTP application, real empty PostgreSQL catalog',
   actualGoTrue:true,realDatabase:true,hostedLoadRequests:0,cloudRecordsModified:0,testAccountsCreated:0,mockProviderResponses:0,
   caps:{maxInFlight:MAX_IN_FLIGHT,maxRequestsPerSecond:MAX_RPS,maxTotalRequests:MAX_REQUESTS,loadMs:LOAD_MS},
   measured:{total:summary(observations),baseline:summary(observations.filter(row=>row.phase==='baseline')),
    phases:['ramp-10rps','ramp-40rps','ramp-80rps'].map(phase=>({phase,...summary(observations.filter(row=>row.phase===phase))})),
    recovery:summary(recovered),loadDurationMs:Number(loadDurationMs.toFixed(2)),totalElapsedMs:Number((performance.now()-startedAt).toFixed(2)),
    peakInFlight,memory:{rssStartBytes:memoryStart.rss,rssPeakBytes:memoryPeak,rssEndBytes:process.memoryUsage().rss},
    combinedClientAndServerEventLoop:{p95Ms:loop.percentile(95)/1e6,p99Ms:loop.percentile(99)/1e6,maxMs:loop.max/1e6},cpu},
   limits:['No Internet traffic, botnet or volumetric DDoS was generated.','Single loopback client and one app process; distributed proxy/edge behavior is untested.',
    'Catalog is genuinely empty; no fictional inventory was seeded. Nonempty production query cost is untested.','This tests application budgets, not Cloudflare network capacity.']};
  fs.mkdirSync(path.dirname(resultPath),{recursive:true,mode:0o700});fs.writeFileSync(resultPath,JSON.stringify(results,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({passed:true,checks,resultPath,total:results.measured.total,recovery:results.measured.recovery}));
 }finally{clearInterval(memoryTimer);loop.disable();}
}
try{await runLocalSupabaseVerification(verify);}catch(error){
 console.error(JSON.stringify({passed:false,stage,checks,error:'Bounded local pressure verification failed; private worker diagnostics retained.'}));
 if(process.argv[2]==='--local-supabase-worker')throw error;process.exitCode=1;
}
