/** Real PostgreSQL query-timeout/recovery check; no domain or Auth mutations. */
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import type {PoolClient} from 'pg';
import {ApiError,SupabaseDatabase} from '../supabase/db.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase();
try {
  let failure:unknown,interruptedClient:PoolClient|undefined;
  try {await db.system(c=>{interruptedClient=c;return c.query(Object.assign({text:'select pg_sleep(2)'},{query_timeout:100}));});} catch(error) {failure=error;}
  assert.ok(failure instanceof ApiError && failure.status===503 && failure.code==='database_unavailable');
  const result=await db.system(async c=>{assert.notEqual(c,interruptedClient,'Interrupted client must be discarded rather than reused');return (await c.query('select 1 as ready')).rows[0];});
  assert.equal(result.ready,1);
  console.log(JSON.stringify({readTimeoutHandled:true,discardedConnectionRecovered:true,queriesReplayed:false,cloudRecordsModified:0}));
} finally {await db.close();}
