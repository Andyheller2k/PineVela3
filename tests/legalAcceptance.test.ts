import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { PLATFORM_TERMS, termsAcceptance } from '../legalPolicy.js';
import { validateTermsAcceptance, termsAccessExempt } from '../supabase/legal.js';

test('agreement proof requires an explicit current version, not a truthy value or extra selectors', () => {
  validateTermsAcceptance(termsAcceptance(true));
  for(const value of [undefined,null,[],true,'yes',{},termsAcceptance(false),{accepted:1,version:PLATFORM_TERMS.version},
    {accepted:'true',version:PLATFORM_TERMS.version},{...termsAcceptance(true),userId:crypto.randomUUID()},
    {...termsAcceptance(true),acceptedAt:'2026-01-01'},{...termsAcceptance(true),sha256:PLATFORM_TERMS.sha256}])
    assert.throws(()=>validateTermsAcceptance(value),(e:any)=>e.status===400);
  for(const version of [undefined,'','old','2026-10-28',null])
    assert.throws(()=>validateTermsAcceptance({accepted:true,version}),(e:any)=>e.status===409);
});

test('immutable accessible Terms and the registry hash match the actual published contractual article', () => {
  const article=(file:string)=>{const html=fs.readFileSync(file,'utf8');return html.slice(html.indexOf('<article '),html.indexOf('</article>')+10);};
  const original=article('public/terms.html'),saved=article('public'+PLATFORM_TERMS.href);
  assert.equal(saved,original);
  assert.equal(crypto.createHash('sha256').update(saved).digest('hex'),PLATFORM_TERMS.sha256);
  const migration=fs.readFileSync('supabase/migrations/20261028120000_versioned_terms_acceptance.sql','utf8');
  assert.ok(migration.includes(PLATFORM_TERMS.sha256));
  assert.ok(migration.includes(saved.replaceAll("'","''")));
});

test('public agreement/help, account preferences and supported closure do not grant product access', () => {
  for(const path of ['/api/legal/status','/api/legal/accept','/api/auth/me','/api/auth/account-access','/api/auth/appearance','/api/support/tickets'])
    assert.equal(termsAccessExempt('GET',path),true);
  assert.equal(termsAccessExempt('POST','/api/users/delete-registered-account'),true);
  for(const path of ['/api/digital-market/register','/api/auth/enrollments','/api/digital-market/orders',
    '/api/customer-service/tickets','/api/support-spoof/tickets','/api/legal/accept/extra','/api/auth/context'])
    assert.equal(termsAccessExempt('POST',path),false);
});
