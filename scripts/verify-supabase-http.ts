/** Calls the replacement API and real Supabase database without fake accounts,
 * fake repositories, provider mocks, or any persistent mutations. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {paystackConfig} from '../paystackProvider.js';
import dotenv from 'dotenv';
import { SupabaseDatabase } from '../supabase/db.js';
import { createSupabaseApp } from '../supabase/app.js';
dotenv.config({ quiet: true });
const db = new SupabaseDatabase(), { app } = createSupabaseApp(db);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Test server failed.');
const base = `http://127.0.0.1:${address.port}`;
let checks = 0;
try {
  const baseline = (await db.pool.query('select (select count(*) from auth.users) as auth_users, (select count(*) from public.profiles) as profiles')).rows[0];
  const request = async (route: string, status: number, options: RequestInit = {}) => {
    const response = await fetch(`${base}${route}`, options);
    assert.equal(response.status, status, route); checks++;
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    return response.json();
  };
  for(const endpoint of ['/api/payments/paystack/pending','/api/admin/payments','/api/admin/settings/status','/api/admin/payments/receiving-account','/api/admin/settings/pricing','/api/auth/maintenance-notice','/api/admin/governance','/api/admin/messages/accounts','/api/admin/all-users'])await request(endpoint,401);
  for(const endpoint of ['/api/admin/messages/preview','/api/admin/messages','/api/admin-messages/00000000-0000-4000-8000-000000000001/ack',
    '/api/admin/governance/accounts','/api/admin/governance/accounts/00000000-0000-4000-8000-000000000001/vote',
    '/api/admin/governance/accounts/00000000-0000-4000-8000-000000000001/apply',
    '/api/admin/governance/accounts/00000000-0000-4000-8000-000000000001/final-reject',
    '/api/admin/governance/residences/preview','/api/admin/governance/residences',
    '/api/admin/governance/residences/00000000-0000-4000-8000-000000000001/vote',
    '/api/admin/governance/residences/00000000-0000-4000-8000-000000000001/final-reject',
    '/api/admin/governance/residences/00000000-0000-4000-8000-000000000001/execute',
    '/api/admin/governance/residences/00000000-0000-4000-8000-000000000001/authorize-execution',
    '/api/admin/governance/residences/00000000-0000-4000-8000-000000000001/prepare',
    '/api/admin/governance/residences/00000000-0000-4000-8000-000000000001/cancel-preparation']) {
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    await request(endpoint,403,{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-site.invalid'},body:'{}'});
  }
  for(const endpoint of ['/api/settings','/api/payments/paystack/initialize','/api/payments/paystack/verify','/api/digital-market/subscription','/api/hostel-verifications/pay-onboarding-fee','/api/admin/governance/keys/settings/enroll','/api/admin/payments/receiving-account','/api/admin/governance/pricing','/api/admin/governance/pricing/00000000-0000-4000-8000-000000000001/vote','/api/admin/governance/pricing/00000000-0000-4000-8000-000000000001/apply','/api/auth/maintenance-notice/dismiss']){
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    await request(endpoint,403,{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-site.invalid'},body:'{}'});
  }
  await request('/api/payments/paystack/webhook',401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  for(const endpoint of ['/api/admin/governance/keys/enroll','/api/admin/governance/members/00000000-0000-4000-8000-000000000001/changes','/api/admin/governance/changes/00000000-0000-4000-8000-000000000001/vote',
    '/api/admin/governance/invitations','/api/admin/governance/invitations/00000000-0000-4000-8000-000000000001/cancel','/api/auth/admin-invitation/inspect','/api/auth/admin-invitation/accept',
    '/api/admin/governance/members/00000000-0000-4000-8000-000000000001/active',
    '/api/admin/governance/changes/00000000-0000-4000-8000-000000000001/plea',
    '/api/admin/governance/changes/00000000-0000-4000-8000-000000000001/plea/decision',
    '/api/admin/governance/changes/00000000-0000-4000-8000-000000000001/plea/acknowledge',
    '/api/admin/governance/changes/00000000-0000-4000-8000-000000000001/confirm-removal']) {
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    await request(endpoint,403,{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-site.invalid'},body:'{}'});
  }
  await request('/api/payments/paystack/webhook',401,{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-site.invalid'},body:'{}'});
  // Authenticate a non-charge event using the configured key; no successful
  // transaction, provider response or payment evidence is simulated.
  const body=JSON.stringify({event:'verification.protocol-check'});
  const signature=crypto.createHmac('sha512',paystackConfig().key).update(body).digest('hex');
  await request('/api/payments/paystack/webhook',200,{method:'POST',headers:{'content-type':'application/json','x-paystack-signature':signature,origin:'https://cross-site.invalid'},body});
  await request('/api/payments/paystack/webhook',401,{method:'POST',headers:{'content-type':'application/json','x-paystack-signature':signature},body:body+' '});
  await request('/api/payments/paystack/webhook',413,{method:'POST',headers:{'content-type':'application/json'},body:' '.repeat(129*1024)});
  await request('/api/payments/paystack/callback?reference=invalid',400);
  assert.equal((await request('/api/health', 200)).persistence, 'supabase');
  for (const endpoint of ['/api/hostels', '/api/digital-market/products', '/api/digital-market/products?includeAll=true']) assert.ok(Array.isArray(await request(endpoint,200)));
  await request('/api/settings', 200);
  for (const endpoint of ['/api/auth/me','/api/auth/account-access','/api/auth/contexts','/api/auth/enrollments','/api/users/my-registered-accounts?userId=another-user','/api/user/registered-accounts','/api/notifications','/api/admin-messages/pending','/api/database/status','/api/sync/events']) await request(endpoint, 401);
  const enrollmentId = '00000000-0000-0000-0000-000000000000';
  for (const endpoint of ['/api/auth/enrollments',`/api/auth/enrollments/${enrollmentId}/verify`,`/api/auth/enrollments/${enrollmentId}/resend`,`/api/auth/enrollments/${enrollmentId}/reactivate`,'/api/room-keys/claim','/api/room-keys/verify','/api/residents/onboard']) await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/auth/enrollments/${enrollmentId}`,401,{method:'DELETE'});
  for (const endpoint of ['/api/storage/upload-hostel-image','/api/storage/upload-market-image','/api/storage/upload-inspection-image','/api/storage/upload-maintenance-image','/api/storage/upload-repair-image','/api/storage/upload-profile-image','/api/storage/upload-admin-profile'])
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{'});
  for(const method of ['PUT','POST']){
    await request('/api/auth/profile',401,{method,headers:{'content-type':'application/json'},body:'{}'});
    await request('/api/auth/profile',403,{method,headers:{'content-type':'application/json',origin:'https://cross-site.invalid'},body:'{}'});
  }
  for(const endpoint of ['/api/storage/upload-profile-image','/api/storage/upload-admin-profile'])
    await request(endpoint,403,{method:'POST',headers:{'content-type':'application/json',origin:'https://cross-site.invalid'},body:'{}'});
  await request(`/api/media/${enrollmentId}`,404);
  await request('/api/media/invalid',400);
  await request(`/api/hostels/${enrollmentId}/structure`,401);
  await request(`/api/hostels/${enrollmentId}/structure`,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/student/my-rooms',401);
  await request('/api/student/my-profile',401);
  await request('/api/manager/residence-requests',401);
  await request('/api/board-requests',401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/board-requests/${enrollmentId}/review`,401);
  await request(`/api/board-requests/${enrollmentId}/decision`,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/admin/managers/${enrollmentId}/reset-request-key`,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/issue-reports/${enrollmentId}`,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/issue-reports',401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  for (const action of ['assign','accept-assignment','staff-decline','staff-reschedule','approve-reschedule','decline-reschedule','staff-complete','student-confirm','manager-close']) await request(`/api/issue-reports/${enrollmentId}/${action}`,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/staff/invitations',401);
  await request('/api/staff/profile',401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  for (const endpoint of ['/api/staff',`/api/staff/invitations/${enrollmentId}/rotate`,'/api/staff/resign','/api/staff/quit']) await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  for (const endpoint of [`/api/staff/${enrollmentId}`,`/api/staff/invitations/${enrollmentId}`]) await request(endpoint,401,{method:'DELETE'});
  await request(`/api/staff/${enrollmentId}`,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/staff-reviews',401);
  for (const endpoint of ['/api/staff-reviews','/api/staff-bargains',`/api/staff-bargains/${enrollmentId}/manager-response`,`/api/staff-bargains/${enrollmentId}/staff-decision`])
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/staff-bargains/${enrollmentId}/manager-response`,403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  for (const endpoint of ['/api/meetings','/api/meetings/participants?hostelId='+enrollmentId]) await request(endpoint,401);
  await request('/api/meetings',401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/meetings/${enrollmentId}`,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/meetings/${enrollmentId}`,401,{method:'DELETE'});
  await request('/api/meetings',403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  for (const endpoint of ['/api/digital-market/status','/api/admin/digital-market/applications']) await request(endpoint,401);
  for (const endpoint of ['/api/digital-market/register','/api/admin/digital-market/approve-application','/api/admin/digital-market/reject-application'])
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/digital-market/register',403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  for(const endpoint of ['/api/digital-market/store-setup','/api/digital-market/create-store']) {
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    await request(endpoint,403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  }
  await request('/api/digital-market/store',401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/digital-market/store',403,{method:'PUT',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  await request('/api/digital-market/inventory',401);
  await request('/api/digital-market/messages',401);
  await request('/api/digital-market/messages?email=another-user',401);
  await request('/api/digital-market/ratings',200);
  await request(`/api/digital-market/ratings?storeId=${enrollmentId}`,200);
  await request(`/api/digital-market/services/${enrollmentId}/reviews`,200);
  await request('/api/digital-market/ratings?sellerEmail=another-user',400);
  await request('/api/digital-market/ratings?productId=invalid',400);
  for(const endpoint of ['/api/digital-market/messages','/api/digital-market/ratings',`/api/digital-market/services/${enrollmentId}/reviews`]){
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    await request(endpoint,403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  }
  await request('/api/digital-market/my-orders?buyerEmail=another-user&storeId='+enrollmentId,401);
  for(const endpoint of ['/api/digital-market/orders',`/api/digital-market/orders/${enrollmentId}/renew-pin`,`/api/digital-market/orders/${enrollmentId}/update-status`]){
    await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    await request(endpoint,403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  }
  await request('/api/digital-market/products',401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/digital-market/products/${enrollmentId}`,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/digital-market/products/${enrollmentId}`,401,{method:'DELETE'});
  await request('/api/digital-market/products',403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  for (const action of ['inspect','signup','resend','verify']) await request(`/api/auth/staff-invitations/${action}`,404,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/auth/staff-invitations/signup',403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  for (const endpoint of ['/api/staff','/api/issue-reports','/api/staff-bargains','/api/board-requests','/api/activities']) await request(endpoint,401);
  for (const endpoint of ['/api/hostels/register','/api/manager/secret-key/issue','/api/manager/secret-key/petition','/api/auth/register-manager','/api/auth/register-manager-account','/api/manager-verifications/submit']) await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  for (const endpoint of ['/api/admin/verification-inspections','/api/verification-inspections','/api/verification-team/my-inspections','/api/verification-teams','/api/verification-team/me','/api/manager-verifications','/api/manager-requests','/api/admin/hostels','/api/manager/residence-registration','/api/hostel-verifications','/api/manager/my-hostel','/api/room-keys','/api/manager/secret-key','/api/admin/manager-key-petitions','/api/admin/manager-request-keys']) await request(endpoint,401);
  for (const endpoint of ['/api/admin/dispatch-verification-team',`/api/verification-team/inspections/${enrollmentId}/submit-report`]) await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  for (const endpoint of [`/api/hostels/${enrollmentId}/generate-room-keys`,`/api/room-keys/${enrollmentId}/release`]) await request(endpoint,401,{method:'POST',headers:{'content-type':'application/json'},body:'{"confirm":true}'});
  await request(`/api/hostels/${enrollmentId}/verify`,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  await request(`/api/verification-teams/${enrollmentId}/status`,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{"status":"active"}'});
  for (const type of ['manager-verifications','hostel-verifications']) for (const action of ['approve','reject','request-info']) await request(`/api/${type}/${enrollmentId}/${action}`,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/auth/me',401,{headers:{cookie:'pv_sb_access=invalid'}});
  await request('/api/auth/me',401,{headers:{authorization:'Bearer invalid'}});
  await request('/api/auth/context',401,{method:'POST',headers:{'content-type':'application/json'},body:'{"contextId":"00000000-0000-0000-0000-000000000000","role":"admin"}'});
  await request('/api/auth/login',403,{method:'POST',headers:{origin:'https://cross-site.invalid','content-type':'application/json'},body:'{}'});
  await request('/api/auth/login',403,{method:'POST',headers:{'sec-fetch-site':'cross-site','content-type':'application/json'},body:'{}'});
  await request('/api/auth/login',400,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request('/api/auth/login',400,{method:'POST',headers:{'content-type':'application/json'},body:'{'});
  await request('/api/auth/login',415,{method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip'},body:'{}'});
  await request('/api/auth/login',415,{method:'POST',headers:{'content-type':'application/json; charset=iso-8859-1'},body:'{}'});
  await request('/api/auth/logout',200,{method:'POST'});
  const after = (await db.pool.query('select (select count(*) from auth.users) as auth_users, (select count(*) from public.profiles) as profiles')).rows[0];
  assert.deepEqual(after,baseline);
  console.log(JSON.stringify({ checks, passed: true, accountsCreated: 0, recordsImported: 0, note: 'Public and denied API cases; authenticated workflow API coverage is still required.' }));
} finally {
  await app.locals.closeRealtime(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.close();
}
