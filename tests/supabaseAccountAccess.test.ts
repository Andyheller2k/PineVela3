import assert from 'node:assert/strict';
import test from 'node:test';
import {accountFeaturesForRequest} from '../supabase/accountAccess.js';

test('Express case and trailing-slash variants keep feature authorization',()=>{
  for(const path of ['/api/digital-market/products/item','/API/DIGITAL-MARKET/PRODUCTS/item/'])
    assert.deepEqual(accountFeaturesForRequest('PUT',path),['publishing']);
});
test('a new order is restricted while existing handover and cancellation stay available',()=>{
  assert.deepEqual(accountFeaturesForRequest('POST','/api/digital-market/orders'),['orders']);
  assert.deepEqual(accountFeaturesForRequest('PUT','/api/digital-market/orders/order'),[]);
  assert.deepEqual(accountFeaturesForRequest('GET','/api/digital-market/orders'),[]);
});
test('both conversation reads and sends require messaging access',()=>{
  for(const method of ['GET','POST'])assert.deepEqual(accountFeaturesForRequest(method,'/api/digital-market/messages'),['messaging']);
});
test('activation aliases require both room and sub-account access',()=>{
  for(const path of ['/api/room-keys/claim','/api/residents/onboard','/api/room-keys/verify'])
    assert.deepEqual(accountFeaturesForRequest('POST',path),['subaccounts','rooms']);
});
test('officer acceptance requires sub-account access while invitation inspection stays available',()=>{
  for(const path of ['/api/auth/officer-invitation/accept','/API/AUTH/OFFICER-INVITATION/ACCEPT/'])
    assert.deepEqual(accountFeaturesForRequest('POST',path),['subaccounts']);
  assert.deepEqual(accountFeaturesForRequest('POST','/api/auth/officer-invitation/inspect'),[]);
});
test('room-key delivery variants enforce the rooms permission',()=>{
  for(const path of ['/api/room-keys/send-digital','/API/ROOM-KEYS/SEND-DIGITAL/'])
    assert.deepEqual(accountFeaturesForRequest('POST',path),['rooms']);
});
test('creation and evidence are restricted while maintenance recovery stays available',()=>{
  assert.deepEqual(accountFeaturesForRequest('POST','/api/issue-reports'),['maintenance']);
  assert.deepEqual(accountFeaturesForRequest('POST','/api/storage/upload-maintenance-image'),['maintenance']);
  assert.deepEqual(accountFeaturesForRequest('PUT','/api/issue-reports/issue'),[]);
  assert.deepEqual(accountFeaturesForRequest('POST','/api/auth/enrollments/enrollment/verify'),['subaccounts']);
  assert.deepEqual(accountFeaturesForRequest('POST','/api/staff'),['subaccounts']);
});
