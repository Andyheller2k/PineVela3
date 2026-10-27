import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';

export type AppearanceTheme='light'|'dark'|'system';
export function parseAppearanceTheme(body:unknown):AppearanceTheme {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||Object.keys(body)[0]!=='theme'
    || !['light','dark','system'].includes((body as any).theme))throw new ApiError(400,'Supply only theme: light, dark or system.');
  return (body as {theme:AppearanceTheme}).theme;
}
export function checkAppearanceContext(actor:VerifiedActor,expected:unknown) {
  // A stale-request guard, never authorization supplied by the browser.
  if(expected!==undefined&&expected!==actor.contextId)
    throw new ApiError(409,'Your active account changed. Retry the theme change in your current account.','appearance_context_changed');
}
export async function readAppearance(client:PoolClient,actor:VerifiedActor) {
  const row=(await client.query('select theme from private.account_appearance where context_id=$1',[actor.contextId])).rows[0];
  return {theme:row?.theme??null};
}
export async function saveAppearance(client:PoolClient,actor:VerifiedActor,body:unknown) {
  const theme=parseAppearanceTheme(body);
  await client.query(`insert into private.account_appearance as a(context_id,theme) values($1,$2)
    on conflict(context_id) do update set theme=excluded.theme,updated_at=clock_timestamp()
    where a.theme is distinct from excluded.theme`,[actor.contextId,theme]);
  return {theme};
}
export function installAppearance(app:Express,auth:SupabaseAuth) {
  const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
  app.get('/api/auth/appearance',auth.require(),route(async(req,res)=>{
    checkAppearanceContext(req.actor,req.headers['x-pinevela-profile-context']);
    res.json(await auth.db.readActor(req.actor,c=>readAppearance(c,req.actor)));
  }));
  app.put('/api/auth/appearance',auth.require(),route(async(req,res)=>{
    checkAppearanceContext(req.actor,req.headers['x-pinevela-profile-context']);
    res.json(await auth.db.actor(req.actor,c=>saveAppearance(c,req.actor,req.body)));
  }));
}
