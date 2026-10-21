import assert from 'node:assert/strict';
import {test} from 'node:test';
import {paymentReversalPolicy} from '../paymentReversalPolicy.js';

test('confirmed full reversals stop paid access even after a retain decision',()=>{
 for(const decision of ['default','retain','revoke']){
  assert.deepEqual(paymentReversalPolicy(5000,5000,'success',decision),{reversed:true,accessGranted:false,netMinor:0});
  assert.deepEqual(paymentReversalPolicy(5000,0,'reversed',decision),{reversed:true,accessGranted:false,netMinor:0});
 }
});
test('partial refunds reconcile exact minor units and permit separate reviewed access decisions',()=>{
 assert.deepEqual(paymentReversalPolicy(5000,1200,'success'),{reversed:false,accessGranted:true,netMinor:3800});
 assert.deepEqual(paymentReversalPolicy(5000,1200,'success','revoke'),{reversed:false,accessGranted:false,netMinor:3800});
 assert.deepEqual(paymentReversalPolicy(5000,1200,'reversed','retain'),{reversed:false,accessGranted:true,netMinor:3800});
 assert.deepEqual(paymentReversalPolicy(5000,0,'success'),{reversed:false,accessGranted:true,netMinor:5000});
});
test('invalid money, free quotes and unknown provider/manual states are rejected',()=>{
 for(const args of [[0,0,'success'],[5000,-1,'success'],[5000,5001,'success'],[5000,.5,'success'],[5000,0,'pending'],[5000,0,'success','approve'],[NaN,0,'success']] as const)
  assert.throws(()=>paymentReversalPolicy(args[0],args[1],args[2],args[3]));
});
