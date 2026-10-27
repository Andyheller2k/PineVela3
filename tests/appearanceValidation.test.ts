import assert from 'node:assert/strict';
import test from 'node:test';
import {ApiError} from '../supabase/db';
import {parseAppearanceTheme} from '../supabase/appearance';

test('appearance accepts exactly light, dark and system choices',()=>{
  for(const theme of ['light','dark','system'] as const)assert.equal(parseAppearanceTheme({theme}),theme);
});

test('appearance rejects malformed choices and client-supplied ownership',()=>{
  for(const body of [undefined,null,[],{},'system',true,1,{theme:null},{theme:0},{theme:false},
    {theme:'auto'},{theme:'SYSTEM'},{theme:'light '},{theme:{}},{theme:['system']},
    ...['userId','profileId','contextId','managerId','sellerId','staffId','hostelId','role']
      .map(field=>({theme:'system',[field]:'untrusted'})),
    Object.create({theme:'system'}),{theme:'system',unexpected:true}]) {
    assert.throws(()=>parseAppearanceTheme(body),error=>error instanceof ApiError&&error.status===400);
  }
});
