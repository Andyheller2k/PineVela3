/** Read-only native inventory. All current Auth accounts remain retained. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {googleIdentity} from '../googleAuth.js';
dotenv.config({quiet:true});const db=new SupabaseDatabase();let checks=0;
const fingerprint=(ids:string[])=>crypto.createHash('sha256').update(JSON.stringify([...ids].sort())).digest('hex');
try{
 const result=await db.system(async client=>{
  await client.query('set transaction isolation level repeatable read, read only');
  assert.equal((await client.query('show transaction_read_only')).rows[0].transaction_read_only,'on');checks++;
  const actual=(await client.query(`select u.id,u.email,u.is_anonymous,u.email_confirmed_at,
   coalesce(jsonb_agg(jsonb_build_object('provider',i.provider,'identity_data',i.identity_data)) filter(where i.id is not null),'[]'::jsonb) as identities
   from auth.users u left join auth.identities i on i.user_id=u.id group by u.id order by u.id`)).rows;
  const retained=new Set(actual.map(subject=>subject.id));assert.equal(retained.size,actual.length);checks++;
  let verifiedGoogle=0;
  for(const subject of actual){try{googleIdentity(subject);verifiedGoogle++;}catch{/* Other provider accounts remain retained. */}}
  const profileIds=(await client.query('select id from public.profiles order by id')).rows.map(row=>row.id);
  for(const id of profileIds){assert.ok(retained.has(id),'Every native profile retains its Auth subject');checks++;}
  const contexts=(await client.query('select id,auth_user_id,primary_owner_id from public.account_contexts order by id')).rows;
  const profiles=new Set(profileIds);
  for(const context of contexts){
   assert.ok(profiles.has(context.auth_user_id),'Every context retains its native profile');checks++;
   if(context.primary_owner_id){assert.ok(profiles.has(context.primary_owner_id),'Context owner remains a retained profile');checks++;}
  }
  const after=(await client.query('select id from auth.users order by id')).rows.map(row=>row.id);
  assert.deepEqual(after,actual.map(subject=>subject.id),'This inventory changes no Auth subject');checks++;
  return{policy:'retain_all_current_supabase_accounts',retainedAuthAccounts:actual.length,verifiedGoogleSubset:verifiedGoogle,
   otherRetainedAuthAccounts:actual.length-verifiedGoogle,retainedProfiles:profileIds.length,retainedContexts:contexts.length,
   removalCandidates:0,authSubjectsSha256:fingerprint(after),profilesSha256:fingerprint(profileIds),contextsSha256:fingerprint(contexts.map(row=>row.id)),
   limits:['Fingerprints describe this read-only snapshot; compare saved before/after reports to establish cutover retention.']};
 });
 console.log(JSON.stringify({checks,passed:true,readOnly:true,noDeletionPerformed:true,accountsImported:0,...result}));
}catch(error){console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code||undefined,message:error instanceof assert.AssertionError?'Native retention assertion failed':undefined}));process.exitCode=1;}
finally{await db.close();}
