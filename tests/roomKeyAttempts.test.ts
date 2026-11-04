import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { installEnrollment } from '../supabase/enrollment.js';

test('room verification and claim aliases share a verified identity budget regardless of client IDs or sessions',async t=>{
  // Authentication itself is covered by the native database suite; this fixture
  // isolates HTTP admission and never trusts an identity in the request body.
  const auth:any={db:{authorizedSystem:async(_actor:any,_roles:any,work:any)=>work({})},require:()=> (req:any,res:any,next:any)=>{
    if(req.get('X-Fixture-Role')!=='primary')return res.sendStatus(403);
    req.actor={kind:'primary',authUserId:req.get('X-Fixture-Account')==='b'?'verified-b':'verified-a',contextId:req.get('X-Fixture-Context')||'context-a'};
    next();
  }};
  const app=express();app.use(express.json());installEnrollment(app,auth);
  app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.status||500).json({error:err.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const request=(path='/api/room-keys/verify',headers:any={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-Role':'primary',...headers},body:JSON.stringify({roomKey:'',enrollmentId:'invalid',userId:crypto.randomUUID()})});
  for(let i=0;i<10;i++)assert.equal((await request(['/api/room-keys/verify','/api/room-keys/claim','/api/residents/onboard'][i%3])).status,400);
  for(const path of ['/api/room-keys/verify','/api/room-keys/claim','/api/residents/onboard'])
    assert.equal((await request(path,{'X-Fixture-Context':'another-session'})).status,429);
  assert.equal((await request(undefined,{'X-Fixture-Account':'b'})).status,400,'Unrelated identity keeps its own allowance');
  assert.equal((await request(undefined,{'X-Fixture-Role':'seller'})).status,403,'Other roles do not enter the activation route');
});
