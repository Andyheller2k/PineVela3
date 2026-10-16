/** Actual HTTP through native cookie/CSRF middleware. No Auth token or identity is created. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {readCookie,csrfBoundary} from '../supabase/auth.js';
test('native transport rejects ambiguous cookies and foreign browser writes',async t=>{
 const app=express();app.use(csrfBoundary);
 app.all('/transport',(req,res)=>res.json({value:readCookie(req,'pv_sb_access')}));
 app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({denied:true}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const get=async(headers:Record<string,string>)=>fetch(origin+'/transport',{headers});
 assert.equal((await (await get({cookie:'pv_sb_access=transport-marker'})).json()).value,'transport-marker');
 const emptyCases:Record<string,string>[]=[{},{authorization:'Bearer transport-marker'},{cookie:'pv_sb_access=a; pv_sb_access=b'},{cookie:'pv_sb_access=%ZZ'}];
 for(const headers of emptyCases)assert.equal((await (await get(headers)).json()).value,'');
 assert.equal((await get({origin:'https://foreign.example.test'})).status,200);
 const post=(headers:Record<string,string>)=>fetch(origin+'/transport',{method:'POST',headers});
 const deniedCases:Record<string,string>[]=[{origin:'https://foreign.example.test'},{origin:'invalid origin'},{'sec-fetch-site':'cross-site'}];
 for(const headers of deniedCases)assert.equal((await post(headers)).status,403);
 assert.equal((await post({origin})).status,200);
});
