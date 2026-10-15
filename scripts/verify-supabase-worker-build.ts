/** Actual production binary against the real database; no queued work is executed. */
import assert from 'node:assert/strict';
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
 'requests',(select jsonb_agg(to_jsonb(t) order by id) from private.residence_execution_requests t),
 'executions',(select jsonb_agg(to_jsonb(t) order by id) from private.residence_executions t),
 'tasks',(select jsonb_agg(to_jsonb(t) order by asset_id) from private.residence_storage_cleanup_tasks t),
 'attempts',(select jsonb_agg(to_jsonb(t) order by id) from private.residence_storage_cleanup_attempts t),
 'media',(select jsonb_agg(to_jsonb(t) order by id) from public.media_assets t),
 'objects',(select jsonb_agg(to_jsonb(t) order by id) from storage.objects t))::text) as value`)).rows[0].value;
function launch(args:string[]){
 const child=spawn(process.execPath,['dist-supabase-backend/residence-worker.mjs',...args],{stdio:['ignore','pipe','pipe'],env:process.env});
 children.add(child);let output='',errors='',status:number|null|undefined;
 child.stdout!.on('data',chunk=>{output+=chunk;if(output.length>65536)child.kill('SIGTERM');});
 child.stderr!.on('data',chunk=>{errors+=chunk;if(errors.length>65536)child.kill('SIGTERM');});
 child.once('exit',code=>{status=code;children.delete(child);});
 const events=()=>output.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 return {child,events,status:()=>status};
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
 check(once.events().some(e=>e.event==='cycle'&&e.readOnly&&e.execution.completed===0&&e.storage.completed===0),'Default binary previews actual work without execution');
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
 check(await fingerprint()===before,'Genuine Auth, queued state and provider catalog remain unchanged');
 console.log(JSON.stringify({passed:true,checks,builtProductionWorker:true,realSignals:true,realRestart:true,defaultReadOnly:true,cloudRecordsModified:0,cloudObjectsModified:0,positiveAuthenticatedBrowserTested:false}));
}finally{
 for(const child of children)child.kill('SIGTERM');
 if(children.size)await pause(1000);
 for(const child of children)child.kill('SIGKILL');
 await db.close();
}
