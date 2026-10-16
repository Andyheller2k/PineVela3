/** Real local transport failure; no account, token, database or provider mock. */
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {test} from 'node:test';
import {ApiError,SupabaseDatabase} from '../supabase/db.js';

test('connection acquisition failure returns a retryable service error without running work',async()=>{
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const address=listener.address();assert(address&&typeof address==='object');
  await new Promise<void>(resolve=>listener.close(()=>resolve()));
  const db=new SupabaseDatabase({host:'127.0.0.1',port:address.port,connectionTimeoutMillis:1000});
  let calls=0;
  try{
    await assert.rejects(()=>db.system(async()=>{calls++;}),error=>{
      assert(error instanceof ApiError);assert.equal(error.status,503);
      assert.equal(error.code,'database_unavailable');
      assert(!/password|postgresql:|127\.0\.0\.1/.test(error.message));return true;
    });
    assert.equal(calls,0,'Unavailable connections cannot run or replay work');
    await assert.rejects(()=>db.statement('select 1'),error=>{
      assert(error instanceof ApiError);assert.equal(error.status,503);
      assert.equal(error.code,'database_unavailable');return true;
    });
  }finally{await db.close();}
});
