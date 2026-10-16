/** Source-only native inventory; historical contracts never import retired code. */
import fs from 'node:fs';
import {readRoutes,canonicalEndpoint,runtimeSources,frontendApiReferences,type Endpoint} from './lib/cutover-source-audit.js';
const historical=JSON.parse(fs.readFileSync('docs/migrations/legacy-api-contracts.json','utf8'));
const runtime=runtimeSources(['supabase-server.ts','supabase-residence-worker.ts','supabase-system-wipe-worker.ts']);
const routes=runtime.flatMap(readRoutes),frontend=frontendApiReferences();
const actual=new Map<string,Endpoint[]>();
for(const route of routes){const key=canonicalEndpoint(route);actual.set(key,[...(actual.get(key)||[]),route]);}
const historicalByKey=new Map<string,any>();
for(const entry of historical.endpoints){const split=entry.endpoint.indexOf(' ');
 historicalByKey.set(canonicalEndpoint({method:entry.endpoint.slice(0,split),path:entry.endpoint.slice(split+1)}),entry);}
const references=(method:string,path:string)=>frontend.filter(ref=>(ref.method===null||ref.method===method)
 &&canonicalEndpoint({method,path:ref.path})===canonicalEndpoint({method,path}));
const endpoints=[...actual].map(([endpoint,sources])=>({endpoint,
 status:sources.every(source=>source.retired)?'retired_native_route':'active_supabase_route',
 replacementSources:sources,frontendReferences:references(sources[0].method,sources[0].path),
 historicalContract:Boolean(historicalByKey.has(endpoint))}));
const retiredHistorical=[...historicalByKey].filter(([key])=>!actual.has(key)).map(([endpoint,old])=>({endpoint,
 status:'retired_legacy_contract',historicalSources:old.sources,
 frontendReferences:references(endpoint.slice(0,endpoint.indexOf(' ')),endpoint.slice(endpoint.indexOf(' ')+1))}));
const unresolved=frontend.filter(ref=>ref.method&&!actual.has(canonicalEndpoint({method:ref.method,path:ref.path})));
const unmatchedDirectReferences=unresolved.filter(ref=>!ref.dynamic);
const dynamicReferencesRequiringWorkflowEvidence=unresolved.filter(ref=>ref.dynamic);
const result={note:'Native source inventory after JSON retirement. Source references are not proof of runtime reachability; dynamic requests and complete workflows require separate HTTP/browser evidence. Historical contracts do not reactivate obsolete routes.',
 persistence:'supabase',jsonPersistenceReachable:false,runtimeModules:runtime.length,
 endpoints:endpoints.sort((a,b)=>a.endpoint.localeCompare(b.endpoint)),retiredHistorical,unmatchedDirectReferences,dynamicReferencesRequiringWorkflowEvidence};
fs.writeFileSync('docs/migrations/api-cutover-inventory.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceOnly:true,persistence:'supabase',runtimeModules:runtime.length,
 activeRoutes:endpoints.filter(row=>row.status==='active_supabase_route').length,
 retiredNativeRoutes:endpoints.filter(row=>row.status==='retired_native_route').length,
 retiredHistoricalContracts:retiredHistorical.length,unmatchedDirectReferences:unmatchedDirectReferences.length,
 dynamicReferencesRequiringWorkflowEvidence:dynamicReferencesRequiringWorkflowEvidence.length,
 jsonPersistenceReachable:false,applicationRecordsRead:0}));
