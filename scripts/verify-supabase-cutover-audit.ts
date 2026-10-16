/** Source-only scanner regression checks; no application runtime imports. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalEndpoint,readRoutes,runtimeSources,frontendApiReferences} from './lib/cutover-source-audit.js';
let checks=0;const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const runtime=runtimeSources(['supabase-server.ts','supabase-residence-worker.ts','supabase-system-wipe-worker.ts']);
const routes=runtime.flatMap(readRoutes),has=(method:string,path:string)=>routes.some(route=>canonicalEndpoint(route)===canonicalEndpoint({method,path}));
for(const path of ['/api/auth/google/callback','/api/digital-market/stores/:id','/api/admin/governance'])
 check(has('GET',path),'Actual native route is identified');
for(const action of ['inspect','accept']){
 check(has('POST','/api/auth/admin-invitation/'+action),'Native administrator invitation loop is expanded');
 check(has('POST','/api/auth/officer-invitation/'+action),'Native officer invitation loop is expanded');
}
check(!has('POST','/api/auth/admin-invitation/reject'),'The scanner does not invent invitation actions');
const refs=frontendApiReferences();
check(refs.some(ref=>ref.path==='/api/users/manager-onboarding'&&ref.method==='GET'),'Consolidated owned manager read is retained');
check(!refs.some(ref=>ref.path==='/api/manager-requests'&&ref.method==='POST'),'Retired public manager creation has no frontend caller');
for(const file of ['server.ts','localDb.ts','persistentDb.ts','jsonStoreSafety.ts']){
 check(!fs.existsSync(file),'Retired JSON module is absent');
 assert.throws(()=>runtimeSources([file]),/JSON persistence layer/);checks++;
}
const baseline=JSON.parse(fs.readFileSync('docs/migrations/legacy-api-contracts.json','utf8'));
check(baseline.endpoints.length===226,'Historical contract review is preserved independently of retired code');
const current=JSON.parse(fs.readFileSync('docs/migrations/api-cutover-inventory.json','utf8'));
check(current.persistence==='supabase'&&current.jsonPersistenceReachable===false,'Native inventory is authoritative');
check(current.endpoints.every((entry:any)=>entry.replacementSources.length>0),'Every native endpoint has source evidence');
check(current.retiredHistorical.every((entry:any)=>entry.status==='retired_legacy_contract'),'Historical unported contracts stay retired');
check(current.unmatchedDirectReferences.length===0,'No unsupported complete literal API request survives');
check(current.dynamicReferencesRequiringWorkflowEvidence.every((entry:any)=>entry.dynamic),'Computed URL families retain an explicit runtime verification boundary');
const result={passed:true,checks,sourceOnly:true,applicationRuntimeImported:false,databaseConnections:0};
fs.writeFileSync('.security/migration-reset/cutover-source-audit.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(result));
