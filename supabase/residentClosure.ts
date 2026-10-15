import type {Express,RequestHandler} from 'express';
import {ApiError} from './db.js';
import type {AuthRequest,SupabaseAuth} from './auth.js';
import {ownResidentReleasePreview,releaseOwnResidentRoom} from './housing.js';

function checkRequest(req:AuthRequest){
  if(req.actor.kind!=='resident')throw new ApiError(403,'Use your separately verified resident portal.');
  if(Object.keys(req.query).length)throw new ApiError(400,'Account or room selectors are not accepted.');
  const captured=req.headers['x-pinevela-profile-context'];
  if(captured!==undefined&&captured!==req.actor.contextId)throw new ApiError(409,'Your active account changed. Refresh its settings.');
}
export async function completeResidentClosure(auth:SupabaseAuth,req:AuthRequest,res:any){
  checkRequest(req);
  const result=await auth.db.authorizedSystem(req.actor,['resident'],c=>releaseOwnResidentRoom(c,req.actor,req.body),false,false,true);
  if('pinDenied' in result)throw new ApiError(403,'Your resident portal PIN is invalid or temporarily locked. After five failed attempts, wait 15 minutes.','portal_pin_invalid');
  // Revoke only native resident bindings; never clear a newer browser's cookies
  // or call provider logout on an identity that may also have a seller portal.
  res.json(result);
}
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
export function installResidentClosure(app:Express,auth:SupabaseAuth){
  app.get('/api/resident/closure-preview',auth.require(['resident']),route(async(req,res)=>{
    checkRequest(req);res.json(await auth.db.authorizedSystem(req.actor,['resident'],c=>ownResidentReleasePreview(c,req.actor)));
  }));
  app.post('/api/student/delete-room',auth.require(['resident']),route((req,res)=>completeResidentClosure(auth,req,res)));
}
