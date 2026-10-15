/** Actual production binary against the real database; no queued work is executed. */
import assert from 'node:assert/strict';import fs from 'node:fs';
import {spawn,type ChildProcess} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase(),children=new Set<ChildProcess>();
let checks=0;
const check=(condition:unknown,message:string)=>{assert.ok(condition,message);checks++;};
const fingerprint=async()=>(await db.pool.query(`select md5(jsonb_build_object(
 'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
 'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
 'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t),
 'requests',(select jsonb_agg(to_jsonb(t) order by id) from private.system_wipe_execution_requests t),
 'executions',(select jsonb_agg(to_jsonb(t) order by id) from private.primary_wipe_executions t),
 'media',(select jsonb_agg(to_jsonb(t) order by id) from public.media_assets t),
 'objects',(select jsonb_agg(to_jsonb(t) order by id) from storage.objects t))::text) as value`)).rows[0].value;
function launch(args:string[],releaseGate?:string){
 const child=spawn(process.execPath,['dist-supabase-backend/system-wipe-worker.mjs',...args],{stdio:['ignore','pipe','pipe'],env:{...process.env,...(releaseGate===undefined?{}:{PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS:releaseGate})}});
 children.add(child);let output='',errors='',status:number|null|undefined;
 child.stdout!.on('data',chunk=>{output+=chunk;if(output.length>65536)child.kill('SIGTERM');});
 child.stderr!.on('data',chunk=>{errors+=chunk;if(errors.length>65536)child.kill('SIGTERM');});
 child.once('exit',code=>{status=code;children.delete(child);});
 const events=()=>output.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 const failures=()=>errors.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 return {child,events,failures,status:()=>status};
}
async function waitFor(condition:()=>boolean,label:string){
 const end=Date.now()+60000;
 while(!condition()&&Date.now()<end)await pause(100);
 assert.ok(condition(),label);
}
try{
 const before=await fingerprint();
 const once=launch([]);await waitFor(()=>once.status()!==undefined,'One-shot preview exits');
 check(once.status()===0,'Built preview succeeds');
 check(once.events().some(e=>e.event==='cycle'&&e.readOnly&&e.execution.completed===0&&e.storageObjectsModified===0),'Default binary previews actual work without execution');
 check(once.events().at(-1)?.event==='stopped','One-shot closes its database');
 const watched=launch(['--watch']);await waitFor(()=>watched.events().some(e=>e.event==='cycle')||watched.status()!==undefined,'Continuous preview starts');
 check(watched.events().some(e=>e.event==='cycle'&&e.readOnly),'Continuous default remains read-only');
 watched.child.kill('SIGTERM');await waitFor(()=>watched.status()!==undefined,'SIGTERM drains and exits');
 check(watched.status()===0&&watched.events().some(e=>e.event==='stopping')&&watched.events().at(-1)?.event==='stopped','Real SIGTERM stops polling and drains');
 const restarted=launch(['--watch']);await waitFor(()=>restarted.events().some(e=>e.event==='cycle')||restarted.status()!==undefined,'Restarted worker starts');
 check(restarted.events().some(e=>e.event==='cycle'&&e.readOnly),'Production worker restarts using durable database state');
 restarted.child.kill('SIGINT');await waitFor(()=>restarted.status()!==undefined,'SIGINT drains and exits');
 check(restarted.status()===0&&restarted.events().at(-1)?.event==='stopped','Real SIGINT drains the restarted worker');
 const invalid=launch(['--execute','--execute']);await waitFor(()=>invalid.status()!==undefined,'Invalid command exits');
 check(invalid.status()===2&&!invalid.events().some(e=>e.event==='started'),'Duplicate execution flags cannot start work');
 const disabled=launch(['--execute'],'false');await waitFor(()=>disabled.status()!==undefined,'Disabled execution exits');
 check(disabled.status()===1&&!disabled.events().some(e=>e.event==='started'||e.event==='cycle'),'Disabled release gate prevents worker execution');
 check(disabled.failures().some(e=>e.event==='startup_failed')&&disabled.events().at(-1)?.event==='stopped','Disabled worker closes without beginning work');
 check(await fingerprint()===before,'Genuine Auth, queued state and provider catalog remain unchanged');
 const report={passed:true,checks,builtProductionWorker:true,realSignals:true,realRestart:true,defaultReadOnly:true,disabledExecutionRejected:true,cloudRecordsModified:0,cloudObjectsModified:0,positiveAuthenticatedBrowserTested:false};
 fs.writeFileSync('.security/migration-reset/system-wipe-worker-build.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}finally{
 for(const child of children)child.kill('SIGTERM');
 if(children.size)await pause(1000);
 for(const child of children)child.kill('SIGKILL');
 await db.close();
}
