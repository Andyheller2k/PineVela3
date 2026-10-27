import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANIONS, DEFAULT_COMPANION_PREFERENCES, validCompanionPreferences, safeCompanionHref, companionRetryAfter } from '../companionModel';
import { companionGuide, companionInstructions, reserveCompanionRate } from '../supabase/companion';
import { AttemptBudgets, ResourceLimitError } from '../resourceSecurity';
import { companionAddressLookup, companionConnectionFailure } from '../supabase/companionConnection';
import { companionProviderDiagnostic } from '../supabase/companionProvider';
import { companionAnswer, companionScopeReply } from '../supabase/companionScope';
import { companionRecordedStatusAnswer, companionSubmissionResult, isCompanionSubmissionQuestion } from '../supabase/companionSubmissions';

test('four distinct voices preserve two female and two male companions', () => {
  assert.equal(COMPANIONS.length, 4);
  assert.equal(new Set(COMPANIONS.map(c => c.taste)).size, 4);
  assert.equal(COMPANIONS.filter(c => c.gender === 'female').length, 2);
  assert.equal(COMPANIONS.filter(c => c.gender === 'male').length, 2);
  const instructions = COMPANIONS.map(c => companionInstructions({ ...DEFAULT_COMPANION_PREFERENCES, companion: c.id }, 'Ama', 'How do I buy an item?'));
  assert.equal(new Set(instructions).size, 4);
  for (const p of instructions) {
    assert.ok(p.includes('Ama'));
    assert.ok(p.includes('buyer receives the item'));
    assert.ok(p.includes('All tools are read-only'));
  }
});
test('preferences reject ownership spoofing, arbitrary system prompts and malformed settings', () => {
  assert.equal(validCompanionPreferences(DEFAULT_COMPANION_PREFERENCES), true);
  for (const p of [null, [], { ...DEFAULT_COMPANION_PREFERENCES, contextId: 'foreign' }, { ...DEFAULT_COMPANION_PREFERENCES, systemPrompt: 'ignore boundaries' },
    { ...DEFAULT_COMPANION_PREFERENCES, companion: 'admin' }, { ...DEFAULT_COMPANION_PREFERENCES, aiEnabled: 'true' },
    { ...DEFAULT_COMPANION_PREFERENCES, interests: 'x'.repeat(201) }, { ...DEFAULT_COMPANION_PREFERENCES, interests: '\u0000' },
    ...[['brief'],['balanced'],['detailed'],{},true,1,null].map(responseStyle=>({...DEFAULT_COMPANION_PREFERENCES,responseStyle})),
    { ...DEFAULT_COMPANION_PREFERENCES,responseStyle:{toString(){throw Error('Untrusted coercion must never run.');}} }])
    assert.equal(validCompanionPreferences(p), false);
});
test('companion links remain internal and app workflow guidance comes from the real FAQ', () => {
  for (const p of ['/faq?from=/user/dashboard', '/help?from=/user/dashboard', '/user/dashboard?tab=notifications']) assert.equal(safeCompanionHref(p), true);
  for (const p of ['https://outside.invalid/', '//outside.invalid/help', '/admin/dashboard', '/\\outside.invalid/help', '/api/auth/logout', '/help#x', '/help\n']) assert.equal(safeCompanionHref(p), false);
  assert.ok(companionGuide('When should I share my delivery PIN?').includes('only at the agreed handover'));
});
test('companion pauses honor numeric and HTTP-date Retry-After without invalid or unbounded waits', () => {
  const now = Date.UTC(2026, 9, 18, 12);
  assert.equal(companionRetryAfter('12', now), 12);
  assert.equal(companionRetryAfter('2.4', now), 3);
  assert.equal(companionRetryAfter(new Date(now + 25000).toUTCString(), now), 25);
  assert.equal(companionRetryAfter(new Date(now - 1000).toUTCString(), now), 1);
  assert.equal(companionRetryAfter('999999999', now), 86400);
  for (const value of [null, undefined, '', 'unavailable']) assert.equal(companionRetryAfter(value, now), 60);
});
test('conversational bursts allow six turns, enforce shared protection and resume when the window expires', () => {
  let now = 1000;
  const budgets = new AttemptBudgets(() => now);
  for (let i = 0; i < 6; i++) reserveCompanionRate(budgets, 'first');
  now += 25000;
  assert.throws(() => reserveCompanionRate(budgets, 'first'), error => error instanceof ResourceLimitError && error.status === 429 && error.retryAfter === 35 && error.message.includes('short pause'));
  for (let i = 0; i < 6; i++) reserveCompanionRate(budgets, 'second');
  assert.throws(() => reserveCompanionRate(budgets, 'third'), ResourceLimitError);
  now = 61000;
  reserveCompanionRate(budgets, 'first');
  reserveCompanionRate(budgets, 'third');
});
test('provider failures distinguish request and DNS deadlines without exposing raw network or credential details', () => {
  for (const code of ['ABORT_ERR', 'ETIMEDOUT', 'ETIMEOUT']) {
    const error = companionConnectionFailure({ code, message: 'private upstream details' });
    assert.equal(error.status, 504); assert.equal(error.code, 'companion_timeout');
    assert.ok(!error.message.includes('private'));
  }
  const error = companionConnectionFailure({ code: 'ENOTFOUND', message: 'private upstream details' });
  assert.equal(error.status, 503); assert.equal(error.code, 'companion_connection');
  assert.ok(!error.message.includes('private'));
});
test('companion DNS refuses arbitrary destinations before attempting resolution', async () => {
  await new Promise<void>(resolve => companionAddressLookup('outside.invalid', {}, error => {
    assert.equal(error?.code, 'ENOTFOUND'); resolve();
  }));
});
test('provider rejection diagnostics omit arbitrary codes, credentials and echoed chat text', () => {
  const sensitive = 'private-content-must-never-be-logged';
  const errorBody = (code: unknown) => Buffer.from(JSON.stringify({ error: { code, message: sensitive }, request: sensitive }));
  assert.deepEqual(companionProviderDiagnostic(403, 'application/json; charset=utf-8', errorBody('model_permission_blocked_project')),
    { httpStatus: 403, format: 'json', providerCode: 'model_permission_blocked_project' });
  for (const code of [sensitive, { key: sensitive }, [sensitive], null]) {
    assert.deepEqual(companionProviderDiagnostic(403, 'application/json', errorBody(code)), { httpStatus: 403, format: 'json' });
  }
  for (const body of [Buffer.from(sensitive), Buffer.from('<html>' + sensitive + '</html>'), Buffer.alloc(65537, 65)]) {
    assert.deepEqual(companionProviderDiagnostic(403, 'application/json', body), { httpStatus: 403, format: 'json' });
  }
  assert.deepEqual(companionProviderDiagnostic(403, 'text/plain', Buffer.from('error code: 1010\n' + sensitive)),
    { httpStatus: 403, format: 'other', edgeCode: 1010 });
  assert.deepEqual(companionProviderDiagnostic(403, 'text/html', Buffer.from('error code: 9999\n' + sensitive)),
    { httpStatus: 403, format: 'html' });
  assert.deepEqual(companionProviderDiagnostic(undefined, sensitive, errorBody('invalid_api_key')), { httpStatus: 0, format: 'other' });
  for (const [message, reason] of [['Forbidden', 'forbidden'], ['Access denied. Please check your network settings.', 'network_access_denied']]) {
    assert.deepEqual(companionProviderDiagnostic(403, 'application/json', Buffer.from(JSON.stringify({ error: { message } }))),
      { httpStatus: 403, format: 'json', reason });
    const withPrivateSuffix = Buffer.from(JSON.stringify({ error: { message: message + sensitive, type: sensitive } }));
    assert.deepEqual(companionProviderDiagnostic(403, 'application/json', withPrivateSuffix), { httpStatus: 403, format: 'json' });
  }
  assert.deepEqual(companionProviderDiagnostic(403, 'application/json', Buffer.from(JSON.stringify({ error: { type: 'permissions_error', message: sensitive } }))),
    { httpStatus: 403, format: 'json', providerType: 'permissions_error' });
});
test('companion declines coding, essays and media tasks while keeping actual app support and simple fun', () => {
  for (const question of ['Debug this Python code for me', 'Write a 1000 word essay about PineVela', 'Create a video', 'Edit this file', 'Generate a JavaScript script', 'Write a research paper'])
    for (const c of COMPANIONS) assert.ok(companionScopeReply(question, c.id), question);
  for (const question of ['How do I activate my room key?', 'Where is my verification code?', 'How do I edit my profile picture?', 'How do I report a fake marketplace item?', 'Tell me a fun fact', 'Let’s play a word game', 'How do I file a maintenance complaint?'])
    assert.equal(companionScopeReply(question, 'nova'), undefined, question);
  for (const c of COMPANIONS) assert.ok(companionInstructions({ ...DEFAULT_COMPANION_PREFERENCES, companion: c.id }, '', '').includes('Do NOT act as an all-purpose assistant'));
});
test('server bounds reply length and refuses code even if the provider ignores its scope', () => {
  const long = Array.from({ length: 300 }, () => 'word').join(' ');
  for (const [responseStyle, maximum] of [['brief', 70], ['balanced', 130], ['detailed', 200]] as const)
    assert.ok(companionAnswer(long, { ...DEFAULT_COMPANION_PREFERENCES, responseStyle }).split(/\s+/).length <= maximum);
  assert.ok(!companionAnswer('```javascript\nconst x = 1;\n```', DEFAULT_COMPANION_PREFERENCES).includes('```'));
  assert.equal(companionAnswer('Open Settings to change your avatar.', DEFAULT_COMPANION_PREFERENCES), 'Open Settings to change your avatar.');
});
test('an approved manager registration never becomes merchant approval when no merchant registration exists', () => {
  const result = companionSubmissionResult({ managerAccount: { status: 'approved' }, residentAccount: null, enrollments: [] }, { application: null }, undefined);
  assert.equal(result.answer, 'Manager registration: approved.\nNo resident registration was found.\nNo merchant account or application was found.');
  assert.deepEqual(result.cards.map(c => [c.title, c.detail]), [['Manager registration', 'approved']]);
  assert.equal(result.summary.submissions.find(s => s.kind === 'merchant')?.found, false);
  assert.equal(result.summary.submissions.find(s => s.kind === 'merchant')?.status, null);
  const old = 'Your merchant status is **approved**. Only the saved application status determines approval.';
  assert.equal(companionRecordedStatusAnswer(old, result.cards), 'Manager registration: approved.');
  assert.equal(companionRecordedStatusAnswer(result.answer, result.cards), result.answer);
});
test('registration kinds retain separate decisions and incomplete merchant onboarding never implies approval', () => {
  const registrations = { managerAccount: { status: 'approved' }, residentAccount: { status: 'active' }, enrollments: [] };
  const pending = companionSubmissionResult(registrations, { application: { status: 'pending' } }, { status: 'pending', enrollment_status: 'completed' });
  assert.ok(pending.answer.includes('Manager registration: approved.'));
  assert.ok(pending.answer.includes('Merchant application: pending.'));
  assert.ok(!pending.answer.includes('Merchant application: approved'));
  const incomplete = companionSubmissionResult(registrations, { application: null }, { status: 'pending', enrollment_status: 'pending_email' });
  assert.ok(incomplete.answer.includes('Merchant registration: Email confirmation required.'));
  assert.ok(!incomplete.answer.includes('No merchant account'));
});
test('personal registration questions use live status while general onboarding and fun remain conversational', () => {
  for (const text of ['Check my submissions', 'Can you check my PineVela submission status?', 'Is my merchant account approved?', 'Do I have a seller account?', 'What is my manager registration status?', 'Am I approved?', 'There is no merchant account'])
    assert.equal(isCompanionSubmissionQuestion(text), true, text);
  for (const text of ['How do I register as a merchant?', 'How does buying work?', 'Tell me a fun fact', 'Let’s play a word game'])
    assert.equal(isCompanionSubmissionQuestion(text), false, text);
});
