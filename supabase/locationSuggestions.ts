import type { Express, RequestHandler } from 'express';
import { ApiError } from './db.js';
import type { AuthRequest, SupabaseAuth } from './auth.js';
import { AttemptBudgets, ResourceLimitError, WorkPool } from '../resourceSecurity.js';

export type PlaceSuggestion = { label:string; latitude:number; longitude:number };
export function photonSuggestions(data:unknown):PlaceSuggestion[] {
  if (!data || typeof data!=='object' || !Array.isArray((data as any).features)) return [];
  const seen=new Set<string>();
  return (data as any).features.slice(0,12).flatMap((feature:any)=>{
    const [longitude,latitude]=feature?.geometry?.coordinates || [], p=feature?.properties;
    if (!p || typeof latitude!=='number' || !Number.isFinite(latitude) || Math.abs(latitude)>90 ||
      typeof longitude!=='number' || !Number.isFinite(longitude) || Math.abs(longitude)>180) return [];
    const label=[...new Set([p.name,[p.housenumber,p.street].filter(v=>typeof v==='string').join(' '),p.district,p.city||p.town||p.village,p.state,p.country]
      .filter((v):v is string=>typeof v==='string'&&Boolean(v.trim())).map(v=>v.trim()))].join(', ').slice(0,550);
    if (!label || seen.has(label)) return [];seen.add(label);return [{label,latitude,longitude}];
  }).slice(0,6);
}

/** Only address strings explicitly typed by an authenticated seller are sent.
 * Bounded short-lived public-place cache; no account data or credentials. */
export function installLocationSuggestions(app:Express,auth:SupabaseAuth) {
  const limits=new AttemptBudgets(),pool=new WorkPool(2,8);
  const cache=new Map<string,{expires:number;places:PlaceSuggestion[]}>();
  const route=(reverse:boolean):RequestHandler=>(req,res,next)=>{void(async()=>{
    const actor=(req as AuthRequest).actor;
    const q=req.query.q;
    const latitude=Number(req.query.lat),longitude=Number(req.query.lng);
    if (reverse ? typeof req.query.lat!=='string'||!req.query.lat.trim()||typeof req.query.lng!=='string'||!req.query.lng.trim()||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180
      : typeof q!=='string'||q.trim().length<3||q.length>120) throw new ApiError(400,'Choose valid map coordinates or enter 3–120 characters to search.');
    limits.reserve([{scope:'place-account',identity:actor.contextId,maximum:40,windowMs:60000},{scope:'place-global',identity:'all',maximum:120,windowMs:60000}]);
    const query=typeof q==='string'?q.trim():'',key=reverse?`pin:${latitude.toFixed(6)},${longitude.toFixed(6)}`:query.toLocaleLowerCase('en'),saved=cache.get(key);
    if (saved && saved.expires>Date.now()) return res.json({places:saved.places});
    const base=new URL(reverse?(process.env.PINEVELA_PLACE_REVERSE_URL || 'https://photon.komoot.io/reverse'):(process.env.PINEVELA_PLACE_SEARCH_URL || 'https://photon.komoot.io/api/'));
    if (base.protocol!=='https:' || base.username || base.password || base.hash) throw new ApiError(503,'Location suggestions are unavailable. Enter your location manually or choose it on the map.');
    base.search=new URLSearchParams(reverse?{lat:String(latitude),lon:String(longitude),limit:'1',lang:'en'}:{q:query,limit:'6',lang:'en',lat:'6.6745',lon:'-1.5716'}).toString();
    const places=await pool.run(async()=>{
      const response=await fetch(base,{headers:{Accept:'application/json','User-Agent':'PineVela/1.0 (+https://pinevela.app)'},signal:AbortSignal.timeout(6000),redirect:'error'});
      if (!response.ok) throw new ApiError(503,'Location suggestions are unavailable. Enter your location manually or choose it on the map.');
      const reader=response.body?.getReader();if(!reader)return [];
      const chunks:Uint8Array[]=[];let length=0;
      try { for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>256000){await reader.cancel();throw new ApiError(502,'Location suggestions could not be read.');}chunks.push(value);} }
      finally {reader.releaseLock();}
      return photonSuggestions(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    });
    for (const [k,v] of cache) if(v.expires<=Date.now())cache.delete(k);
    if(cache.size>=100)cache.delete(cache.keys().next().value!);
    cache.set(key,{expires:Date.now()+10*60000,places});return res.json({places});
  })().catch(error=>next(error instanceof ApiError||error instanceof ResourceLimitError?error:new ApiError(503,'Location suggestions are unavailable. Enter your location manually or choose it on the map.')));};
  app.get('/api/locations/suggestions',auth.require(['seller']),route(false));
  app.get('/api/locations/reverse',auth.require(['seller']),route(true));
}
