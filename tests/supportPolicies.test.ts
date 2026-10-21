import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { validateLoginContinuation } from '../publicContinuation';
import { managerKeyNeeded } from '../supabase/managerKeys';
import { supportMailConfiguration } from '../supabase/supportEmail';
import { marketNoticeKind } from '../src/lib/marketNotifications';

test('private support invitations survive sign-in while redirect injection is rejected', () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const continuation = `/support-invitation?token=${token}`;
  assert.equal(validateLoginContinuation(continuation), continuation);
  for (const value of [continuation + '&token=' + token, continuation + '&redirect=https://untrusted.invalid', continuation + '#other', '//untrusted.invalid' + continuation, 'https://untrusted.invalid' + continuation, '/support-invitation?token=short']) assert.equal(validateLoginContinuation(value), undefined);
});

test('Help never asks a manager for an operational secret while business changes still do', () => {
  const id = crypto.randomUUID();
  for (const [method, path] of [['POST', '/api/support/tickets'], ['POST', `/api/support/tickets/${id}/replies`], ['PATCH', `/api/support/tickets/${id}`], ['POST', '/api/reports']]) assert.equal(managerKeyNeeded({ method, path }), false, path);
  for (const path of ['/api/hostels', '/api/staff', '/api/support/tickets/forged/ownership', '/api/customer-service/tickets', '/api/reports/forged/ownership']) assert.equal(managerKeyNeeded({ method: 'POST', path }), true, path);
});

test('local email capture is explicit, loopback only and disabled in production', () => {
  assert.equal(supportMailConfiguration({ NODE_ENV: 'production', SUPPORT_MAILPIT_URL: 'http://127.0.0.1:8025' }), null);
  assert.equal(supportMailConfiguration({ NODE_ENV: 'test', SUPPORT_MAILPIT_URL: 'http://127.0.0.1:8025' })?.type, 'mailpit');
  assert.throws(() => supportMailConfiguration({ NODE_ENV: 'test', SUPPORT_MAILPIT_URL: 'http://untrusted.invalid:8025' }));
  assert.equal(supportMailConfiguration({ RESEND_API_KEY: 'configured', RESEND_FROM_EMAIL: 'invalid' }), null);
});

test('support notifications are retained in marketplace feeds without being classified as order/chat activity', () => {
  assert.equal(marketNoticeKind({ id: crypto.randomUUID(), category: 'support', title: 'Support replied', message: 'We are reviewing your order.' }), 'support');
});
