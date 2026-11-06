import assert from 'node:assert/strict';
import {test} from 'node:test';
import {savedStorePoint,storeMapLocation,type PublicMapStore} from '../nearbyStores.js';
import {nearbyPlaces,storeLocationKey} from '../src/lib/nearbyPlaces.js';
import {PublicStoreLocator,publicStoreArea,publicMapStores} from '../supabase/nearbyStores.js';
const shop:PublicMapStore={id:'shop',storeName:'Campus print shop',location:'Bomso',category:'Printing',campus:'KNUST',logoUrl:'',mapLocation:storeMapLocation('Bomso')};
test('Saved shop pins preserve zero coordinates and reject malformed/untrusted locations',()=>{
  assert.deepEqual(savedStorePoint('Campus (0.000000, 0.000000)'),{lat:0,lng:0});
  assert.deepEqual(savedStorePoint('Bomso (6.674500, -1.571600)'),{lat:6.6745,lng:-1.5716});
  for(const value of ['Bomso','Bomso (91,0)','Bomso (0,181)','Bomso (NaN,0)','https://attacker.invalid',null,{},'Campus (0,0) trailing'])assert.equal(savedStorePoint(value),undefined);
});
test('Goods shops, flexible-service shops and empty public shops remain discoverable without fabricated service pins',()=>{
  const products:any[]=[{id:'flex',storeId:'shop',storeName:shop.storeName,title:'Graphic design',isService:true,isAvailable:true,stockQuantity:null,serviceLocationMode:'flexible'}];
  const result=nearbyPlaces(products,[shop],{});assert.equal(result.length,1);assert.equal(result[0].kind,'store');assert.equal(result[0].point,undefined);assert(result[0].searchText.includes('graphic design'));
  assert.equal(nearbyPlaces([],[shop],{}).length,1);
  const located=nearbyPlaces(products,[shop],{[storeLocationKey(shop)]:{point:{lat:6.67,lng:-1.57},precision:'approximate',label:'Bomso'}})[0];
  assert.equal(located.precision,'approximate');assert.equal(located.product,undefined);
  const moved={...shop,location:'Kotei'};assert.equal(nearbyPlaces([],[moved],{[storeLocationKey(shop)]:{point:{lat:6.67,lng:-1.57},precision:'approximate',label:'Bomso'}})[0].point,undefined);
});
test('Fixed service destinations retain their exact saved pin and existing listing action',()=>{
  const product:any={id:'repair',storeId:'shop',storeName:shop.storeName,title:'Repair',isService:true,isAvailable:true,stockQuantity:null,serviceLocationMode:'fixed',lat:6.67,lng:-1.57};
  const result=nearbyPlaces([product],[],{});assert.equal(result.length,1);assert.equal(result[0].product,product);assert.equal(result[0].precision,'exact');
  assert.equal(nearbyPlaces([{...product,isAvailable:false}],[],{}).length,0);
});
test('Area caching deduplicates lookups and rechecks public visibility before every cache hit',async()=>{
  let published=true,calls=0,reads=0;
  const db:any={publicRows:async()=>{reads++;return published?[{id:'shop',location:'Bomso'}]:[];}};
  const locator=new PublicStoreLocator(async address=>{calls++;assert.equal(address,'Bomso');await new Promise(r=>setTimeout(r,10));return{point:{lat:6.67,lng:-1.57},precision:'approximate',label:'Bomso'};});
  const values=await Promise.all([locator.locate(db,'shop','test-ip'),locator.locate(db,'shop','test-ip')]);assert.equal(calls,1);assert.equal(values[0].precision,'approximate');
  await locator.locate(db,'shop','test-ip');assert.equal(calls,1);assert.equal(reads,3);
  published=false;await assert.rejects(locator.locate(db,'shop','test-ip'),(e:any)=>e.status===404);assert.equal(calls,1);
});
test('Exact owner pins do not geocode; public catalogue queries stay bounded and parameterized',async()=>{
  const db:any={publicRows:async(sql:string,args:any[])=>{assert(sql.includes('private.store_catalog'));assert(!sql.includes('drop table'));if(sql.includes('limit 201')){assert.deepEqual(args,["'; drop table stores; --"]);return [];}return[{location:'Shop (0.000000, 0.000000)'}];}};
  const locator=new PublicStoreLocator(async()=>{throw Error('Should not geocode an exact owner pin');});assert.equal((await locator.locate(db,'shop','test')).precision,'exact');
  assert.deepEqual(await publicMapStores(db,"'; DROP TABLE stores; --"),{stores:[],hasMore:false});
});
test('Public area requests contain only an address and validate provider coordinates',async()=>{
  const original=globalThis.fetch,old=process.env.PINEVELA_PLACE_SEARCH_URL;delete process.env.PINEVELA_PLACE_SEARCH_URL;
  try{
    globalThis.fetch=(async(input:any,options:any)=>{const url=new URL(String(input));assert.equal(url.origin,'https://photon.komoot.io');assert.equal(url.searchParams.get('q'),'Bomso');assert(!options.headers.Authorization);return new Response(JSON.stringify({features:[{geometry:{type:'Point',coordinates:[-1.57,6.67]},properties:{name:'Bomso',country:'Ghana'}}]}),{status:200});}) as typeof fetch;
    const result=await publicStoreArea('Bomso');assert.equal(result.precision,'approximate');assert.deepEqual(result.point,{lat:6.67,lng:-1.57});
    globalThis.fetch=(async()=>new Response(JSON.stringify({features:[{geometry:{coordinates:[-1.57,95]},properties:{name:'Invalid'}}]}))) as typeof fetch;
    assert.equal((await publicStoreArea('Bomso')).point,null);
    globalThis.fetch=(async()=>new Response('Too many requests',{status:429})) as typeof fetch;
    await assert.rejects(publicStoreArea('Bomso'),(e:any)=>e.status===503);
  }finally{globalThis.fetch=original;if(old===undefined)delete process.env.PINEVELA_PLACE_SEARCH_URL;else process.env.PINEVELA_PLACE_SEARCH_URL=old;}
});
