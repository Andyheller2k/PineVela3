/** Exercise the inventory against current source, without runtime imports,
 * credentials, synthetic application records or database connections. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readRoutes,canonicalEndpoint,runtimeSources,frontendApiReferences} from './lib/cutover-source-audit.js';
let checks=0;
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const runtime=runtimeSources(['supabase-server.ts','supabase-residence-worker.ts','supabase-system-wipe-worker.ts']);
const replacements=runtime.flatMap(readRoutes);
const has=(method:string,path:string)=>replacements.some(r=>canonicalEndpoint(r)===canonicalEndpoint({method,path}));
check(runtime.includes('googleAuth.ts'),'The installed Google callback helper is inspected');
check(has('GET','/api/auth/google/callback'),'The real shared callback is recognized');
check(has('GET','/api/users/manager-onboarding'),'Consolidated manager onboarding is installed in the native backend');
check(has('GET','/api/digital-market/stores/:storeId'),'Storefront parameter renaming does not hide coverage');
check(!has('POST','/api/digital-market/stores/:storeId'),'A read is not coverage for an unauthorized write');
for(const action of ['inspect','accept']) {
  check(has('POST',`/api/auth/admin-invitation/${action}`),'Administrator invitation finite route loop is expanded');
  check(has('POST',`/api/auth/officer-invitation/${action}`),'Officer invitation finite route loop is expanded');
}
check(!has('POST','/api/auth/admin-invitation/reject'),'A finite loop does not invent other endpoints');
check(!has('GET','/api/auth/admin-invitation/accept'),'Invitation authentication method remains distinct');
const legacyGovernance=readRoutes('adminGovernanceRoutes.ts');
check(legacyGovernance.some(r=>r.path==='/api/admin/governance/proposals/:id/vote'),'Constant-prefix legacy governance routes are inspected');
check(legacyGovernance.some(r=>r.path==='/api/admin/governance/changes/:id/confirm-removal'),'Constant-prefix removal routes are inspected');
const legacyPayments=readRoutes('paystackPayments.ts');
for(const action of ['store-setup','create-store'])check(legacyPayments.some(r=>r.path===`/api/digital-market/${action}`),'Legacy finite payment aliases are inspected');
const references=frontendApiReferences();
check(references.some(r=>r.path==='/api/users/manager-onboarding'&&r.method==='GET'),'Manager onboarding calls its consolidated native read');
check(references.some(r=>r.path==='/api/manager-requests'&&r.method==='GET'),'Frontend manager request read is identified as GET');
check(!references.some(r=>r.path==='/api/manager-requests'&&r.method==='POST'),'Frontend GET does not invent a legacy manager-creation caller');
for(const file of ['server.ts','persistentDb.ts','localDb.ts']) {
  assert.throws(()=>runtimeSources([file]),/JSON persistence layer/);checks++;
}
const generated=JSON.parse(fs.readFileSync('docs/migrations/api-cutover-inventory.json','utf8'));
for(const endpoint of ['GET /api/auth/google/callback','GET /api/digital-market/stores/:storeId','POST /api/auth/admin-invitation/accept']) {
  const entry=generated.endpoints.find((r:any)=>r.endpoint===endpoint);
  check(entry?.status==='implemented_requires_workflow_verification'&&entry.replacementSources.length>0,'Generated inventory carries actual replacement evidence');
}
check(generated.endpoints.find((r:any)=>r.endpoint==='POST /api/manager-requests').frontendReferences.length===0,'Generated obsolete-create entry does not use a GET as caller evidence');
const report={passed:true,checks,sourceOnly:true,applicationRuntimeImported:false,databaseConnections:0,
  endpointCounts:{total:generated.endpoints.length,implemented:generated.endpoints.filter((r:any)=>r.status.startsWith('implemented')).length,
    retired:generated.endpoints.filter((r:any)=>r.status.startsWith('retired')).length,pending:generated.endpoints.filter((r:any)=>r.status.startsWith('pending')).length}};
fs.writeFileSync('.security/migration-reset/cutover-source-audit.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));
