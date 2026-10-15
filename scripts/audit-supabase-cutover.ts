/** Inventory route replacements and guard against reintroducing JSON in the new
 * runtime. This reads source code only; it never reads application records or .env. */
import fs from 'node:fs';
import {readRoutes,canonicalEndpoint,runtimeSources,frontendApiReferences,type Endpoint} from './lib/cutover-source-audit.js';
const rootFiles = fs.readdirSync('.').filter(file => file.endsWith('.ts') && file !== 'supabase-server.ts');
const legacy = rootFiles.flatMap(readRoutes);
const runtime = runtimeSources(['supabase-server.ts','supabase-residence-worker.ts','supabase-system-wipe-worker.ts']);
const replacement = runtime.flatMap(readRoutes);
const replacementKeys = new Set(replacement.filter(r=>!r.retired).map(canonicalEndpoint));
const retiredReplacementKeys = new Set(replacement.filter(r=>r.retired).map(canonicalEndpoint));
const frontend = frontendApiReferences();
const oldKeys = new Map<string,Endpoint[]>();
for (const entry of legacy) { const key = `${entry.method} ${entry.path}`; oldKeys.set(key,[...(oldKeys.get(key)||[]),entry]); }
const inventory = [...oldKeys].map(([endpoint,sources]) => {
  const key=canonicalEndpoint(sources[0]);
  return {
    endpoint, status: replacementKeys.has(key) ? 'implemented_requires_workflow_verification'
      : sources.every(s => s.retired) || retiredReplacementKeys.has(key) ? 'retired_do_not_port' : 'pending_review_and_port', sources,
    replacementSources:replacement.filter(r=>canonicalEndpoint(r)===key),
    frontendReferences:frontend.filter(r=>(r.method===null||r.method===sources[0].method)&&canonicalEndpoint({method:sources[0].method,path:r.path})===key),
  };
}).sort((a,b) => a.endpoint.localeCompare(b.endpoint));
fs.writeFileSync('docs/migrations/api-cutover-inventory.json',JSON.stringify({
  note:'Source-only inventory of legacy root routes against replacement API/worker import graphs, finite route loops and canonical parameter names. Frontend references include inactive code and are not proof of calls. Runtime mounts, callback configuration, role/mode reachability, method/body contracts and genuine journeys still need verification. Implemented does not imply complete workflow validation.',
  endpoints:inventory,
},null,2)+'\n');
console.log(JSON.stringify({ legacyUniqueEndpoints:inventory.length, implementedEndpoints:inventory.filter(r => r.status.startsWith('implemented')).length,
  retiredEndpoints:inventory.filter(r => r.status.startsWith('retired')).length, pendingEndpoints:inventory.filter(r => r.status.startsWith('pending')).length,
  replacementModulesInspected:runtime.length, jsonPersistenceReachable:false }));
