import assert from 'node:assert/strict';
import test from 'node:test';
import { hostDiagnosticIdentity, hostDiagnosticKey, hostDiagnosticPlan, hostDiagnosticPublicIPv4,
  hostDiagnosticRay, hostDiagnosticRequest, hostDiagnosticTransport } from '../scripts/companionHostDiagnostic';

const credential = 'gsk_protocol_fixture_never_transmitted';

test('default diagnostic has exactly two model GETs and identity requires the sole explicit flag', () => {
  assert.deepEqual(hostDiagnosticPlan([]), ['public_models', 'authenticated_models']);
  assert.deepEqual(hostDiagnosticPlan(['--network-identity']), ['public_models', 'authenticated_models', 'network_identity']);
  for (const args of [['https://outside.invalid'], ['--network-identity', '--network-identity'], ['--identity'], ['--network-identity', '--url=x']])
    assert.throws(() => hostDiagnosticPlan(args), /invalid_options/);
});

test('model checks use only the fixed HTTPS endpoint with bounded time/body and one authenticated request', () => {
  for (const kind of hostDiagnosticPlan([])) {
    const request = hostDiagnosticRequest(kind, credential);
    assert.equal(request.options.protocol, 'https:');
    assert.equal(request.options.hostname, 'api.groq.com');
    assert.equal(request.options.path, '/openai/v1/models');
    assert.equal(request.options.method, 'GET');
    assert.equal(request.deadlineMs, 10000);
    assert.equal(request.bodyLimit, 65536);
    assert.notEqual(request.options.rejectUnauthorized, false);
    const headers = request.options.headers as Record<string, string>;
    assert.equal(headers.Accept, 'application/json');
    assert.equal(headers['User-Agent'], 'PineVela-Companion/1.0');
    assert.equal(headers.Authorization, kind === 'authenticated_models' ? `Bearer ${credential}` : undefined);
  }
  assert.throws(() => hostDiagnosticRequest('https://outside.invalid' as any, credential), /invalid_request/);
});

test('optional identity request has no credentials, stays IPv4 HTTPS and cannot follow an arbitrary target', () => {
  const request = hostDiagnosticRequest('network_identity', credential);
  assert.equal(request.options.hostname, 'api.ipify.org');
  assert.equal(request.options.path, '/');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.protocol, 'https:');
  assert.equal(request.options.family, 4);
  assert.equal(request.options.agent, false);
  assert.equal(request.deadlineMs, 6000);
  assert.equal(request.bodyLimit, 128);
  assert.ok(!JSON.stringify(request).includes(credential));
  assert.deepEqual(Object.keys(request.options.headers!).sort(), ['Accept', 'User-Agent']);
  assert.notEqual(request.options.rejectUnauthorized, false);
});

test('key selection matches dotenv precedence and metadata contains no key or fingerprint', () => {
  const fileKey = 'gsk_other_protocol_fixture_never_transmitted';
  for (const [environment, file, expectedKey, source, mismatch] of [
    [{ GROQ_API_KEY: credential }, { GROQ_API_KEY: credential }, credential, 'process_environment', false],
    [{ GROQ_API_KEY: credential }, { GROQ_API_KEY: fileKey }, credential, 'process_environment', true],
    [{ GROQ_API_KEY: '' }, { GROQ_API_KEY: fileKey }, '', 'process_environment', false],
    [{}, { GROQ_API_KEY: fileKey }, fileKey, '.env', false],
    [{}, {}, undefined, 'missing', false],
  ] as const) {
    const result = hostDiagnosticKey(environment, file);
    assert.equal(result.key, expectedKey);
    assert.equal(result.metadata.keySource, source);
    assert.equal(result.metadata.environmentOverridesDifferentFileKey, mismatch);
    assert.equal(result.metadata.keyConfigured, Boolean(expectedKey));
    const text = JSON.stringify(result.metadata);
    assert.ok(!text.includes(credential) && !text.includes(fileKey));
    assert.deepEqual(Object.keys(result.metadata).sort(), ['environmentOverridesDifferentFileKey', 'keyConfigured', 'keySource']);
  }
  for (const key of [' ', 'x', `"${credential}"`, `${credential}\n`, 'x'.repeat(1001)])
    assert.equal(hostDiagnosticKey({ GROQ_API_KEY: key }, {}).metadata.keyConfigured, false);
});

test('Cloudflare correlation accepts only a bounded strict Ray ID and never arbitrary header content', () => {
  assert.equal(hostDiagnosticRay('0123456789abcdef-ARN'), '0123456789abcdef-ARN');
  assert.equal(hostDiagnosticRay('0123456789abcdef'), '0123456789abcdef');
  for (const value of [undefined, null, [], ['0123456789abcdef-ARN'], 123, credential, '0123456789abcdef-ARN\n',
    '0123456789abcdef-ARN private content', '0123456789abcdef-arn', '0123456789abcdef-ARN-extra', 'x'.repeat(10000)])
    assert.equal(hostDiagnosticRay(value), undefined);
});

test('transport output exposes only TLS/family and a validated Ray ID, never socket addresses', () => {
  assert.deepEqual(hostDiagnosticTransport({ authorized: true, remoteFamily: 'IPv4', localAddress: '192.168.1.5', remoteAddress: credential }, '0123456789abcdef-ARN'),
    { tlsAuthorized: true, addressFamily: 'IPv4', cfRay: '0123456789abcdef-ARN' });
  assert.deepEqual(hostDiagnosticTransport({ authorized: true, remoteFamily: 'IPv6' }, undefined), { tlsAuthorized: true, addressFamily: 'IPv6' });
  assert.deepEqual(hostDiagnosticTransport({ authorized: credential, remoteFamily: credential }, credential), { tlsAuthorized: false });
});

test('identity accepts only public IPv4 and rejects private, special, IPv6 or malformed input', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '185.199.108.153']) assert.equal(hostDiagnosticPublicIPv4(address), address);
  for (const address of [undefined, null, '0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '100.127.255.255', '169.254.1.2',
    '172.16.1.1', '172.31.255.255', '192.168.1.1', '192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.19.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::1', '2001:db8::1', '8.8.8.8 private', '8.8.8.8\n', credential])
    assert.equal(hostDiagnosticPublicIPv4(address), undefined);
});

test('identity responses never emit raw bodies and explain destination-dependent NAT without ASN/country claims', () => {
  const result = hostDiagnosticIdentity(200, Buffer.from('8.8.8.8\n'));
  assert.ok('publicIPv4' in result);
  assert.equal(result.publicIPv4, '8.8.8.8');
  assert.equal(result.httpStatus, 200);
  assert.ok(result.scope.includes('NAT may differ for Groq'));
  assert.ok(result.scope.includes('No ASN or country is inferred'));
  for (const [status, body] of [[403, '8.8.8.8'], [200, credential], [200, '127.0.0.1'], [200, 'x'.repeat(129)],
    [302, 'https://outside.invalid'], [200, '{"ip":"8.8.8.8"}']] as const) {
    const failure = hostDiagnosticIdentity(status, Buffer.from(body));
    assert.ok('failure' in failure);
    assert.equal(failure.failure, 'network_identity_unavailable');
    assert.equal('publicIPv4' in failure, false);
    assert.ok(!JSON.stringify(failure).includes(body));
  }
});

