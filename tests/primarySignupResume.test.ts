/** Isolated delivery boundary: no provider requests or real account changes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { requestPrimarySignup } from '../supabase/primarySignup.js';

function fixture(options:{pending?:boolean;confirmed?:boolean;primary?:boolean;locked?:boolean;wait?:boolean}={}){
  const id=crypto.randomUUID(),email='pending@example.test',calls:{route:string;body:any}[]=[];
  let writes=0;
  const auth:any={db:{system:(work:any)=>work({query:async(sql:string)=>{
    if(sql.includes('pg_try_advisory_xact_lock'))return{rows:[{acquired:!options.locked}]};
    if(sql.includes('max(confirmation_sent_at)'))return{rows:[{registered:!!options.confirmed,sent_at:null,server_now:new Date()}]};
    if(sql.includes('as primary_signup'))return{rows:options.pending?[{id,primary_signup:options.primary!==false}]:[]};
    if(sql.includes('select send_count'))return{rows:options.wait?[{send_count:1,next_allowed_at:new Date(Date.now()+60000),last_requested_at:new Date()}]:[]};
    if(sql.includes('count(*)::int as total'))return{rows:[{total:0}]};
    if(sql.includes('insert into private.auth_email_delivery_limits'))writes++;
    assert(!/update\s+(auth\.users|public\.profiles|public\.account_contexts)/i.test(sql),'Signup delivery cannot replace identity or credentials');
    return{rows:[]};
  }})},provider:async(route:string,body:any)=>{
    calls.push({route,body});
    if(route==='/settings')return{mailer_autoconfirm:false,external:{email:true},disable_signup:false};
    if(route==='/resend')return{};
    if(route==='/signup')return{id,email,identities:[{provider:'email',user_id:id}],email_confirmed_at:null};
    assert.fail('Unexpected provider operation');
  }};
  return{auth,id,email,calls,writes:()=>writes};
}

test('an unfinished primary signup explicitly resumes and never sends replacement name/password',async()=>{
  const f=fixture({pending:true});
  const result=await requestPrimarySignup(f.auth,'Replacement name',f.email,'DifferentPassword1!');
  assert.equal(result.signupId,f.id);assert.equal(result.resumed,true);assert.equal(result.verificationRequired,true);
  assert.deepEqual(f.calls,[{route:'/settings',body:undefined},{route:'/resend',body:{type:'signup',email:f.email}}]);
  assert.equal(f.writes(),1);assert(result.retryAfter>=300);
});

test('a fresh signup sends its requested name/password through the normal provider flow',async()=>{
  const f=fixture();const result=await requestPrimarySignup(f.auth,'New person',f.email,'ChosenPassword1!');
  assert.equal(result.resumed,false);assert.equal(result.signupId,f.id);
  assert.deepEqual(f.calls[1],{route:'/signup',body:{email:f.email,password:'ChosenPassword1!',data:{name:'New person'}}});
});

test('confirmed and pending child identities cannot be adopted or overwritten as primary signups',async()=>{
  for(const options of [{confirmed:true},{pending:true,primary:false}]){
    const f=fixture(options);
    await assert.rejects(requestPrimarySignup(f.auth,'Untrusted replacement',f.email,'DifferentPassword1!'),(e:any)=>e.status===409&&e.code==='email_already_registered');
    assert.deepEqual(f.calls,[]);assert.equal(f.writes(),0);
  }
});

test('pending signup resumes retain cooldown and concurrency guards before email work',async()=>{
  for(const options of [{pending:true,wait:true},{pending:true,locked:true}]){
    const f=fixture(options);
    await assert.rejects(requestPrimarySignup(f.auth,'Replacement',f.email,'DifferentPassword1!'),(e:any)=>e.status===429);
    assert.deepEqual(f.calls,[]);assert.equal(f.writes(),0);
  }
});
