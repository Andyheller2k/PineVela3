import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import crypto from 'node:crypto';
import { validateStoreStep } from '../storeSetupValidation';
import { installMedia } from '../supabase/media';
import { installLocationSuggestions } from '../supabase/locationSuggestions';
import { ApiError } from '../supabase/db';
import { paystackConfig } from '../paystackProvider';

const clientFetch=globalThis.fetch;
async function serve(app:express.Express,work:(origin:string)=>Promise<void>) {
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).set('Cache-Control','no-store').json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try {await work(`http://127.0.0.1:${(server.address() as any).port}`);}
  finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

test('store contact/location step rejects a country mismatch before checkout; matching country succeeds',()=>{
  const draft={storeName:'Campus Store',username:'campus-store',description:'Student essentials',location:'Ayeduase, Kumasi',phone:'0241234567',phoneCountry:'GH' as const,deliveryMode:'Campus Meetup'};
  assert.deepEqual(validateStoreStep(draft,1),{});assert.deepEqual(validateStoreStep(draft,2),{});
  for(const phone of ['', '123', '+442079460018'])assert.ok(validateStoreStep({...draft,phone},2).phone);
  assert.deepEqual(validateStoreStep({...draft,phoneCountry:'GB',phone:'02079460018'},2),{});
  assert.ok(validateStoreStep({...draft,location:' '},2).location);
  assert.ok(validateStoreStep({...draft,storeName:' '},1).storeName);
});

for(const purpose of ['market','hostel'])test(`public ${purpose} images revalidate; private/revoked/maintenance media never replays a public-cache 304`,async()=>{
  const app=express(),id=crypto.randomUUID(),bytes=Buffer.from('owned-public-catalogue-photo');
  const asset={id,purpose,object_path:`contexts/${crypto.randomUUID()}/${id}.png`,state:'ready',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  let visible=true,available=true,privateOwner=false,downloads=0,publicationChecks=0;
  const auth:any={require:()=> (_req:any,_res:any,next:any)=>next(),
    db:{system:async(work:any)=>work({query:async(sql:string)=>{
      if(sql.includes('platform_available'))return {rows:[{available}]};
      if(sql.includes('media_asset_is_public')){publicationChecks++;return {rows:visible?[asset]:[]};}
      return {rows:[]};
    }}),actor:async(_actor:any,work:any)=>work({query:async()=>({rows:privateOwner?[asset]:[]})})},
    authenticate:async()=>{if(!privateOwner)throw new ApiError(401,'Sign in required');return {actor:{termsAccepted:true}};}};
  installMedia(app,auth,{download:async()=>{downloads++;return bytes;}} as any);
  await serve(app,async origin=>{
    let response=await clientFetch(`${origin}/api/media/${id}`);assert.equal(response.status,200);
    assert.match(response.headers.get('Cache-Control')!,/private, no-cache/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    assert.equal(response.headers.get('X-PineVela-Public-Photo'),'1');
    const etag=response.headers.get('ETag')!;assert.ok(etag);
    response=await clientFetch(`${origin}/api/media/${id}`,{cache:'force-cache',headers:{'If-None-Match':etag}});
    assert.equal(response.status,304);assert.equal(downloads,1);assert.equal(publicationChecks,2,'Publication is checked before returning 304');
    assert.equal(response.headers.get('X-PineVela-Public-Photo'),'1');
    available=false;
    response=await clientFetch(`${origin}/api/media/${id}`,{cache:'force-cache',headers:{'If-None-Match':etag}});
    assert.equal(response.status,404,'Maintenance cannot return a cached photo');assert.equal(downloads,1);assert.equal(publicationChecks,2);
    assert.equal(response.headers.get('X-PineVela-Public-Photo'),null);available=true;
    visible=false;
    response=await clientFetch(`${origin}/api/media/${id}`,{cache:'force-cache',headers:{'If-None-Match':etag}});
    assert.equal(response.status,404,'A revoked public URL cannot replay cached media');assert.equal(downloads,1);
    privateOwner=true;response=await clientFetch(`${origin}/api/media/${id}`,{headers:{'If-None-Match':etag}});
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(downloads,2);
    assert.equal(response.headers.get('X-PineVela-Public-Photo'),null);assert.equal(response.headers.get('ETag'),null);
    privateOwner=false;response=await clientFetch(`${origin}/api/media/${id}`);assert.equal(response.status,404);
  });
});

test('seller place routes require role middleware, validate input and cache bounded public results',async()=>{
  const app=express();let providerCalls=0;
  const requireRoles:string[][]=[];
  const auth:any={require:(roles:string[])=>{requireRoles.push(roles);return(req:any,_res:any,next:any)=>{
    if(!req.get('X-Test-Role'))return next(new ApiError(401,'Sign in required'));
    if(req.get('X-Test-Role')!=='seller')return next(new ApiError(403,'Seller required'));
    req.actor={contextId:'verified-test-seller'};next();
  };}};
  globalThis.fetch=(async(url:any)=>{
    const u=new URL(String(url));assert.equal(u.hostname,'photon.komoot.io');providerCalls++;
    if(u.searchParams.get('q')==='Oversized')return new Response(' '.repeat(256001));
    return new Response(JSON.stringify({features:[
      {geometry:{coordinates:[-1.5643,6.6702]},properties:{name:'Ayeduase Gate',city:'Kumasi',country:'Ghana'}},
      {geometry:{coordinates:[-1.5643,6.6702]},properties:{name:'Ayeduase Gate',city:'Kumasi',country:'Ghana'}},
      {geometry:{coordinates:[900,900]},properties:{name:'Invalid point'}}]}),{headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try {
    installLocationSuggestions(app,auth);assert.deepEqual(requireRoles,[['seller'],['seller']]);
    await serve(app,async origin=>{
      const endpoint=origin+'/api/locations/suggestions?q=Ayeduase';
      assert.equal((await clientFetch(endpoint)).status,401);
      assert.equal((await clientFetch(endpoint,{headers:{'X-Test-Role':'primary'}})).status,403);assert.equal(providerCalls,0);
      const headers={'X-Test-Role':'seller'};
      assert.equal((await clientFetch(origin+'/api/locations/suggestions?q=x',{headers})).status,400);
      assert.equal((await clientFetch(origin+'/api/locations/reverse?lat=91&lng=0',{headers})).status,400);
      assert.equal((await clientFetch(origin+'/api/locations/reverse?lat=&lng=',{headers})).status,400);
      let response=await clientFetch(endpoint,{headers});assert.equal(response.status,200);
      assert.deepEqual((await response.json()).places,[{label:'Ayeduase Gate, Kumasi, Ghana',latitude:6.6702,longitude:-1.5643}]);
      response=await clientFetch(endpoint,{headers});assert.equal(response.status,200);assert.equal(providerCalls,1,'Repeated query uses the bounded place cache');
      response=await clientFetch(origin+'/api/locations/reverse?lat=6.6702&lng=-1.5643',{headers});assert.equal(response.status,200);assert.equal(providerCalls,2);
      assert.equal((await clientFetch(origin+'/api/locations/suggestions?q=Oversized',{headers})).status,502,'Oversized provider bodies are rejected within the read budget');
      for(let i=0;i<36;i++)assert.equal((await clientFetch(endpoint,{headers})).status,200);
      assert.equal((await clientFetch(endpoint,{headers})).status,429,'Cached queries still obey the seller rate limit');
      assert.equal(providerCalls,3,'Rate-limited and cached requests do not keep calling the provider');
    });
  } finally {globalThis.fetch=clientFetch;}
});

test('Paystack missing/live/test configuration remains server controlled and grants no fake access',()=>{
  const key=process.env.PAYSTACK_SECRET_KEY,mode=process.env.NODE_ENV;
  try{
    delete process.env.PAYSTACK_SECRET_KEY;
    assert.throws(()=>paystackConfig(),/Paystack is not configured/);
    process.env.PAYSTACK_SECRET_KEY='sk_test_fixtureonly';process.env.NODE_ENV='production';
    assert.throws(()=>paystackConfig(),/cannot activate production/);
    process.env.PAYSTACK_SECRET_KEY='sk_live_fixtureonly';assert.equal(paystackConfig().mode,'live');
  }finally{if(key===undefined)delete process.env.PAYSTACK_SECRET_KEY;else process.env.PAYSTACK_SECRET_KEY=key;if(mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=mode;}
});
