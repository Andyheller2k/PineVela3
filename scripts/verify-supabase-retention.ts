/** Real read-only account retention check. No identity, session or local data writes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {googleIdentity} from '../googleAuth.js';
import {accountData,accountId} from '../accountSecurity.js';
import {validateDatabase} from '../jsonStoreSafety.js';
import {googleRetentionInventory,classifyLocalAccounts} from './lib/google-retention.js';
dotenv.config({quiet:true});const db=new SupabaseDatabase();let checks=0;
try {
  const result=await db.system(async client=>{
    await client.query('set transaction read only');
    const inventory=await googleRetentionInventory(client);
    const actual=(await client.query(`select u.id,u.email,u.is_anonymous,u.email_confirmed_at,
      coalesce(jsonb_agg(jsonb_build_object('provider',i.provider,'identity_data',i.identity_data)) filter(where i.id is not null),'[]'::jsonb) as identities
      from auth.users u left join auth.identities i on i.user_id=u.id group by u.id`)).rows;
    const retained=new Set(inventory.retained.map(r=>r.id));
    for(const subject of actual){let verified=false;try{googleIdentity(subject);verified=true;}catch{}assert.equal(retained.has(subject.id),verified);checks++;}
    assert.equal(inventory.retained.length+inventory.removalCandidates.length,actual.length);checks++;
    const local=validateDatabase(fs.readFileSync(path.resolve(process.env.PINEVELA_DATA_DIR || 'data','pinevela_store.json')));
    const accounts=local.users.map((entry:any)=>{const a=accountData(entry);return {id:accountId(entry),email:String(a?.email || entry?.email || ''),supabaseUserId:String(a?.supabaseUserId || entry?.supabaseUserId || '')};});
    const classified=classifyLocalAccounts(accounts,inventory.retained);
    assert.equal(classified.retained.length+classified.removalCandidates.length,accounts.length);checks++;
    for(const a of classified.retained){assert.ok(inventory.retained.some(r=>r.id===a.supabaseUserId && r.email===a.email.trim().toLowerCase()));checks++;
      assert.equal(classifyLocalAccounts([{...a,supabaseUserId:''}],inventory.retained).retained.length,0);checks++;
      assert.equal(classifyLocalAccounts([{...a,email:''}],inventory.retained).retained.length,0);checks++;
    }
    return {retainedCloud:inventory.retained.length,removalCandidatesCloud:inventory.removalCandidates.length,retainedLocal:classified.retained.length,removalCandidatesLocal:classified.removalCandidates.length,ambiguousBindings:classified.ambiguousBindings.length};
  });
  console.log(JSON.stringify({checks,passed:true,readOnly:true,noDeletionPerformed:true,accountsRestored:0,...result}));
}catch(error){console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || undefined,message:error instanceof assert.AssertionError?'Retention assertion failed':undefined}));process.exitCode=1;}
finally{await db.close();}
