import type {Express,RequestHandler} from 'express';
import {ApiError,type SupabaseDatabase,uuid} from './db.js';
import {MARKET_DEFAULT_LOGO} from '../marketBranding.js';
import {storeMapLocation,type StoreMapLocation,type PublicMapStore} from '../nearbyStores.js';
import {photonSuggestions} from './locationSuggestions.js';
import {AttemptBudgets,WorkPool} from '../resourceSecurity.js';

export async function publicMapStores(db:SupabaseDatabase,search:string){
  const rows=await db.publicRows(`select s.id,s.name,s.location,s.primary_category,s.campus,s.logo_path
    from private.store_catalog s where $1='' or position($1 in lower(concat_ws(' ',s.name,s.username,s.location,s.primary_category,s.campus)))>0
      or exists(select 1 from private.listing_catalog l where l.store_id=s.id and position($1 in lower(concat_ws(' ',l.title,l.description,l.service_category)))>0)
    order by lower(s.name),s.id limit 201`,[search.toLocaleLowerCase('en')]);
  const stores:PublicMapStore[]=rows.slice(0,200).map(s=>({id:s.id,storeName:s.name,location:s.location||'',category:s.primary_category||'',campus:s.campus||'',logoUrl:s.logo_path||MARKET_DEFAULT_LOGO,mapLocation:storeMapLocation(s.location||'')}));
  return{stores,hasMore:rows.length>200};
}

/** Public address only; no shop name, visitor GPS, account ID or credentials. */
export async function publicStoreArea(address:string):Promise<StoreMapLocation>{
  const url=new URL(process.env.PINEVELA_PLACE_SEARCH_URL||'https://photon.komoot.io/api/');
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new ApiError(503,'Shop location lookup is unavailable.');
  url.search=new URLSearchParams({q:address.slice(0,120),limit:'3',lang:'en',lat:'6.6745',lon:'-1.5716'}).toString();
  const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'PineVela/1.0 (+https://pinevela.app)'},redirect:'error',signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new ApiError(503,'Shop location lookup is unavailable.');
  const reader=response.body?.getReader();if(!reader)throw new ApiError(503,'Shop location lookup is unavailable.');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256000){await reader.cancel();throw new ApiError(502,'Shop location lookup could not be read.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const place=photonSuggestions(JSON.parse(Buffer.concat(chunks).toString('utf8')))[0];
  return place?{point:{lat:place.latitude,lng:place.longitude},precision:'approximate',label:place.label}:{point:null,precision:'unavailable',label:address};
}

export class PublicStoreLocator{
  private cache=new Map<string,{expires:number;location:StoreMapLocation}>();
  private inflight=new Map<string,Promise<StoreMapLocation>>();
  private pool=new WorkPool(1,6);
  private limits=new AttemptBudgets();
  private lastLookup=0;
  constructor(private lookup=publicStoreArea,private now=Date.now){}
  async locate(db:SupabaseDatabase,id:string,ip:string):Promise<StoreMapLocation>{
    // Recheck publication on cache hits, too. A removed/private shop stays private.
    const row=(await db.publicRows('select id,location from private.store_catalog where id=$1',[id]))[0];
    if(!row)throw new ApiError(404,'Shop not found.');
    const address=String(row.location||'').trim(),exact=storeMapLocation(address);
    if(exact.point||address.length<3)return exact;
    const key=address.toLocaleLowerCase('en'),cached=this.cache.get(key);
    if(cached&&cached.expires>this.now())return cached.location;
    const pending=this.inflight.get(key);if(pending)return pending;
    this.limits.reserve([{scope:'public-store-area-ip',identity:ip,maximum:20,windowMs:60000},{scope:'public-store-area-global',identity:'all',maximum:30,windowMs:60000}]);
    const request=this.pool.run(async()=>{
      const pause=1000-(this.now()-this.lastLookup);if(pause>0)await new Promise(resolve=>setTimeout(resolve,pause));
      this.lastLookup=this.now();const location=await this.lookup(address);
      for(const[k,v]of this.cache)if(v.expires<=this.now())this.cache.delete(k);
      if(this.cache.size>=200)this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key,{expires:this.now()+(location.point?24*60:10)*60000,location});return location;
    });
    this.inflight.set(key,request);
    try{return await request;}finally{this.inflight.delete(key);}
  }
}

export function installNearbyStores(app:Express,db:SupabaseDatabase,locator=new PublicStoreLocator()){
  const route=(work:(req:any,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req,res).catch(next);};
  app.get('/api/digital-market/stores',route(async(req,res)=>{
    const q=req.query.q??'';
    if(typeof q!=='string'||q.length>120||Object.keys(req.query).some(k=>k!=='q'))throw new ApiError(400,'Enter a shop or service name of up to 120 characters.');
    res.set('Cache-Control','no-store').json(await publicMapStores(db,q.trim()));
  }));
  app.get('/api/digital-market/stores/:id/map-location',route(async(req,res)=>{
    if(Object.keys(req.query).length)throw new ApiError(400,'Choose a public shop to locate.');
    try{res.set('Cache-Control','no-store').json(await locator.locate(db,uuid(req.params.id),req.ip||''));}
    catch(error){if(error instanceof ApiError||(error as any)?.status===429||(error as any)?.status===503)throw error;throw new ApiError(503,'Shop location lookup is unavailable. Try again shortly.');}
  }));
}
