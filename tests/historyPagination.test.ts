import assert from 'node:assert/strict';
import {test} from 'node:test';
import {historyPage,encodeHistoryCursor} from '../supabase/historyPagination.js';
test('history cursors preserve database microseconds and stable UUID tie breaking',()=>{
  const time='2026-10-20T22:00:00.123456Z',id='00000000-0000-4000-8000-000000000001';
  const cursor=encodeHistoryCursor({cursor_time:time,id});
  assert.deepEqual(historyPage({before:cursor,limit:'100',paged:'1'}),{before:{time,id},after:undefined,limit:100,paged:true});
  assert.deepEqual(historyPage({after:cursor},true).after,{time,id});
  assert.equal(historyPage({}).limit,50);
});
test('history does not accept identity selectors, oversized pages or malformed cursors',()=>{
  for(const query of [{userId:'x'},{storeId:'x'},{limit:'101'},{limit:50},{limit:['50']},{limit:'0'},{before:[]},{before:'?'},{before:'a'.repeat(201)},{paged:true},{after:'x'},{before:'x',after:'y'}])assert.throws(()=>historyPage(query));
  for(const time of ['2026-02-30T00:00:00.000000Z','0000-01-01T00:00:00.000000Z','2026-01-01T24:00:00.000000Z']){
    const before=encodeHistoryCursor({cursor_time:time,id:'00000000-0000-4000-8000-000000000001'});
    assert.throws(()=>historyPage({before}),(error:any)=>error.status===400);
  }
});
