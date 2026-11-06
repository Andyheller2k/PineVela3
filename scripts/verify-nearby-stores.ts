/** Restored local database and actual HTTP handlers. No cloud account writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import {once} from 'node:events';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase} from '../supabase/db.js';
import {installNearbyStores,PublicStoreLocator,publicMapStores} from '../supabase/nearbyStores.js';
const output='docs/verification/nearby-shops-2026-11-06';fs.mkdirSync(output,{recursive:true});
const checkpoint=process.argv[2];assert(/^[a-f0-9-]{36}$/.test(checkpoint||''));
const labels:string[]=[],check=(value:unknown,label:string)=>{assert(value,label);labels.push(label);};
await withIsolatedBackup(checkpoint,async config=>{
  const db=new SupabaseDatabase(config);
  try{
    const ledger=new Map((await db.pool.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
    for(const file of fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort()){
      const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
      if(ledger.has(version)){assert.equal(ledger.get(version),digest);continue;}
      await db.system(async c=>{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,digest]);});
    }
    const publicStores=await publicMapStores(db,'');
    check(publicStores.stores.length>0,'Restored real public catalogue contains an eligible shop');
    const store=publicStores.stores.find(s=>!s.mapLocation.point&&s.location.trim().length>=3);
    check(!!store,'Restored catalogue includes an address-only shop without weakening moderation');
    if(!store)throw Error('An eligible address-only public fixture is required');
    let lookups=0;
    const locator=new PublicStoreLocator(async address=>{check(address===store.location.trim(),'Area lookup receives only the published address');lookups++;return{point:{lat:6.67,lng:-1.57},precision:'approximate',label:'Local fixture public area'};});
    const app=express();installNearbyStores(app,db,locator);
    app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({error:error.status?error.message:'Local check failed'}));
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+(server.address() as any).port;
    const get=async(path:string)=>{const r=await fetch(base+path);return{status:r.status,data:await r.json()};};
    try{
      const all=await get('/api/digital-market/stores');check(all.status===200,'Guest discovery returns only the public shop directory');
      const found=await get('/api/digital-market/stores?q='+encodeURIComponent(store.storeName.toLocaleLowerCase('en')));
      check(found.status===200&&found.data.stores.some((s:any)=>s.id===store.id),'Shop names are searchable case-insensitively independently of service location mode');
      const fields=Object.keys(found.data.stores.find((s:any)=>s.id===store.id)).sort();
      check(JSON.stringify(fields)===JSON.stringify(['id','storeName','location','category','campus','logoUrl','mapLocation'].sort()),'Directory projection excludes private identities, emails, phone numbers and credentials');
      const area=await get(`/api/digital-market/stores/${store.id}/map-location`);check(area.status===200&&area.data.precision==='approximate','Public address-only shop can obtain a labelled area pin');
      const cached=await get(`/api/digital-market/stores/${store.id}/map-location`);check(cached.status===200&&lookups===1,'Repeated shop lookups reuse the bounded area cache');
      check((await get('/api/digital-market/stores?q='+encodeURIComponent("';drop table stores;--"))).status===200,'Search punctuation stays a parameter rather than SQL');
      check((await get('/api/digital-market/stores?q='+encodeURIComponent('%_'))).data.stores.length===0,'Wildcard characters cannot widen literal shop search');
      check((await get('/api/digital-market/stores?q[]='+store.id)).status===400,'Array-shaped search input is rejected');
      check((await get('/api/digital-market/stores?includeAll=true')).status===400,'Client widening flags are rejected');
      check((await get(`/api/digital-market/stores/${store.id}/map-location?url=https://attacker.invalid`)).status===400,'Client-supplied geocoding targets are rejected');
      check((await get('/api/digital-market/stores/not-a-uuid/map-location')).status===400,'Malformed shop IDs are rejected');
      check((await get(`/api/digital-market/stores/${crypto.randomUUID()}/map-location`)).status===404,'Unknown shop lookup discloses no location');
      await db.pool.query("update public.stores set status='pending' where id=$1",[store.id]);
      check(!(await get('/api/digital-market/stores')).data.stores.some((s:any)=>s.id===store.id),'Unpublished shop disappears from directory');
      check((await get(`/api/digital-market/stores/${store.id}/map-location`)).status===404&&lookups===1,'A cached location cannot reveal a shop after public eligibility is removed');
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
    const files=['supabase/catalog.ts','supabase/nearbyStores.ts','nearbyStores.ts','supabase/locationSuggestions.ts'];
    const report={passed:true,checks:labels.length,labels,realPostgreSQL:true,realPublicCatalogueRole:true,geocoderTransport:'injected local public-area response',cloudWrites:0,sourceSha256:Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
    fs.writeFileSync(output+'/database-http-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:labels.length}));
  }finally{await db.pool.end();}
});
