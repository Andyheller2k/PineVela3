import assert from 'node:assert/strict';
import {test} from 'node:test';
import {needsApprovalKey} from '../src/lib/administratorApproval.js';
test('native approval prompts cover aliases without reviving direct residence edits',()=>{
 for(const method of ['POST','PUT','PATCH'])for(const route of ['/api/manager-requests/id/approve','/api/manager-verifications/id/approve','/API/hostel-verifications/id/approve/','/api/admin/digital-market/approve-application','/api/hostels/id/verify'])assert.equal(needsApprovalKey(method,route,{}),true);
 for(const body of [{isApproved:false},{status:'Rejected'},{approvalStatus:'Rejected'}])assert.equal(needsApprovalKey('PUT','/api/hostels/id/verify',body),false);
 for(const route of ['/api/hostels','/api/hostels/id','/api/hostels/register'])assert.equal(needsApprovalKey('PUT',route,{isApproved:true}),false);
 for(const method of ['GET','HEAD','DELETE'])assert.equal(needsApprovalKey(method,'/api/hostels/id/verify',{}),false);
});
