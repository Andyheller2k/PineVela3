import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import test from 'node:test';
import { callCompanionInference, closeCompanionInferenceConnections, companionProviderReady,
  readCompanionProviderConfig } from '../supabase/companionInference';
import { ApiError } from '../supabase/db';
import { ResourceLimitError } from '../resourceSecurity';

// Protocol-only credential markers and response text; no account, profile,
// catalog, housing or saved-chat fixtures and no real provider connections.
const token = 'protocol-test-credential-never-a-real-key';
const account = 'a'.repeat(32);
const cloudflare = { COMPANION_AI_PROVIDER: 'cloudflare', CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account };
const environmentKeys = ['COMPANION_AI_PROVIDER', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'GROQ_API_KEY'] as const;
const reply = (message: any = { role: 'assistant', content: 'Protocol reply.' }, extra: any = {}) => ({
  choices: [{ index: 0, finish_reason: 'stop', message }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 }, ...extra,
});

async function protocol<T>(environment: NodeJS.ProcessEnv, options: {
  status?: number; chunks?: Buffer[]; body?: unknown; headers?: Record<string, string>;
  requestError?: string; hold?: boolean; interrupt?: boolean;
}, work: (capture: { requests: any[]; logs: unknown[][] }) => Promise<T>) {
  const savedEnvironment = environmentKeys.map(key => [key, process.env[key]] as const);
  for (const key of environmentKeys) delete process.env[key];
  Object.assign(process.env, environment);
  const savedRequest = https.request, savedWarn = console.warn;
  const capture = { requests: [] as any[], logs: [] as unknown[][] };
  console.warn = (...args: unknown[]) => { capture.logs.push(args); };
  https.request = ((requestOptions: any, receive: (response: any) => void) => {
    const request = new EventEmitter() as any;
    const record = { options: requestOptions, body: '' };
    capture.requests.push(record);
    const onAbort = () => queueMicrotask(() => request.emit('error', Object.assign(new Error('Private transport details'), { code: 'ABORT_ERR' })));
    requestOptions.signal.addEventListener('abort', onAbort, { once: true });
    request.end = (body: string) => {
      record.body = body;
      queueMicrotask(() => {
        if (requestOptions.signal.aborted) { onAbort(); return; }
        if (options.requestError) {
          request.emit('error', Object.assign(new Error('Private transport details'), { code: options.requestError }));
          return;
        }
        if (options.hold) return;
        const response = new EventEmitter() as any;
        response.statusCode = options.status ?? 200;
        response.headers = { 'content-type': 'application/json', ...options.headers };
        let destroyed = false;
        response.destroy = () => { destroyed = true; response.emit('aborted'); };
        receive(response);
        if (options.interrupt) { response.emit('aborted'); return; }
        const chunks = options.chunks ?? [Buffer.from(JSON.stringify(options.body ?? reply()))];
        for (const chunk of chunks) { response.emit('data', chunk); if (destroyed) return; }
        response.emit('end');
      });
    };
    return request;
  }) as typeof https.request;
  try { return await work(capture); }
  finally {
    https.request = savedRequest;
    console.warn = savedWarn;
    closeCompanionInferenceConnections();
    for (const [key, value] of savedEnvironment) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('provider selection is explicit, validates fixed destinations and cannot silently reuse another credential', () => {
  const selected = readCompanionProviderConfig(cloudflare);
  assert.equal(selected.provider, 'cloudflare');
  assert.equal(selected.displayName, 'Cloudflare Workers AI');
  assert.equal(selected.hostname, 'api.cloudflare.com');
  assert.equal(selected.path, `/client/v4/accounts/${account}/ai/v1/chat/completions`);
  assert.equal(selected.model, '@cf/openai/gpt-oss-20b');
  assert.equal(selected.token, token);
  assert.ok(Object.isFrozen(selected));
  assert.equal(companionProviderReady(cloudflare), true);
  const legacy = readCompanionProviderConfig({ GROQ_API_KEY: token });
  assert.equal(legacy.provider, 'groq');
  assert.equal(legacy.hostname, 'api.groq.com');
  assert.equal(legacy.path, '/openai/v1/chat/completions');
  for (const invalid of [
    {}, { ...cloudflare, CLOUDFLARE_API_TOKEN: '' }, { ...cloudflare, CLOUDFLARE_API_TOKEN: token + '\r\nInjected: value' },
    { ...cloudflare, CLOUDFLARE_ACCOUNT_ID: 'https://outside.invalid' },
    { ...cloudflare, CLOUDFLARE_ACCOUNT_ID: account + '/../../outside' },
    { ...cloudflare, COMPANION_AI_PROVIDER: 'openrouter' },
    { ...cloudflare, COMPANION_AI_PROVIDER: 'https://outside.invalid' },
    { COMPANION_AI_PROVIDER: 'cloudflare', GROQ_API_KEY: token },
    { COMPANION_AI_PROVIDER: 'groq', CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account },
  ]) {
    assert.equal(companionProviderReady(invalid), false);
    assert.throws(() => readCompanionProviderConfig(invalid), error => error instanceof ApiError
      && error.status === 503 && error.code === 'companion_configuration' && !error.message.includes(token));
  }
});

test('Cloudflare requests use the fixed model, account path, verified TLS, bounded output and standard tools', async () => {
  await protocol(cloudflare, {}, async capture => {
    const messages = [{ role: 'user', content: 'Protocol question.' }];
    const tools = [{ type: 'function', function: { name: 'protocol_tool', parameters: { type: 'object', properties: {} } } }];
    const response = await callCompanionInference(messages, tools);
    assert.equal(response.choices[0].message.content, 'Protocol reply.');
    assert.equal(response.usage.total_tokens, 13);
    assert.equal(capture.requests.length, 1);
    const { options, body } = capture.requests[0];
    assert.equal(options.hostname, 'api.cloudflare.com');
    assert.equal(options.servername, options.hostname);
    assert.equal(options.path, `/client/v4/accounts/${account}/ai/v1/chat/completions`);
    assert.equal(options.method, 'POST');
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.headers['Content-Length'], Buffer.byteLength(body));
    assert.equal(options.agent.maxSockets, 2);
    assert.equal(options.agent.maxFreeSockets, 2);
    assert.equal(options.autoSelectFamily, true);
    assert.ok(options.signal instanceof AbortSignal);
    const sent = JSON.parse(body);
    assert.equal(sent.model, '@cf/openai/gpt-oss-20b');
    assert.equal(sent.max_tokens, 900);
    assert.equal(sent.reasoning_effort, 'low');
    assert.equal(sent.max_completion_tokens, undefined);
    assert.equal(sent.temperature, .4);
    assert.equal(sent.tool_choice, 'auto');
    assert.equal(sent.parallel_tool_calls, false);
    assert.deepEqual(sent.messages, messages);
    assert.deepEqual(sent.tools, tools);
    assert.equal(capture.logs.length, 0);
  });
});

test('legacy Groq requests preserve model/output parameters without leaking Cloudflare credentials', async () => {
  await protocol({ GROQ_API_KEY: token, CLOUDFLARE_API_TOKEN: 'different-protocol-credential', CLOUDFLARE_ACCOUNT_ID: account }, {}, async capture => {
    await callCompanionInference([{ role: 'user', content: 'Protocol question.' }]);
    const { options, body } = capture.requests[0];
    const sent = JSON.parse(body);
    assert.equal(options.hostname, 'api.groq.com');
    assert.equal(sent.model, 'openai/gpt-oss-20b');
    assert.equal(sent.max_completion_tokens, 900);
    assert.equal(sent.max_tokens, undefined);
    assert.equal(sent.reasoning_effort, undefined);
    assert.equal(sent.tools, undefined);
    assert.equal(sent.parallel_tool_calls, undefined);
    assert.ok(!body.includes('different-protocol-credential'));
  });
});

test('Cloudflare continuation retains definitions with calls disabled while Groq retains its old omission', async () => {
  const tools = [{ type: 'function', function: { name: 'protocol_tool', parameters: { type: 'object', properties: {} } } }];
  const messages = [
    { role: 'user', content: 'Protocol question.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'protocol-call', type: 'function', function: { name: 'protocol_tool', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'protocol-call', content: '{}' },
  ];
  await protocol(cloudflare, {}, async capture => {
    await callCompanionInference(messages, tools, undefined, false);
    const sent = JSON.parse(capture.requests[0].body);
    assert.deepEqual(sent.tools, tools);
    assert.deepEqual(sent.messages, messages);
    assert.equal(sent.tool_choice, 'none');
    assert.equal(sent.parallel_tool_calls, false);
  });
  await protocol({ GROQ_API_KEY: token }, {}, async capture => {
    await callCompanionInference(messages, tools, undefined, false);
    const sent = JSON.parse(capture.requests[0].body);
    assert.deepEqual(sent.messages, messages);
    assert.equal(sent.tools, undefined);
    assert.equal(sent.tool_choice, undefined);
    assert.equal(sent.parallel_tool_calls, undefined);
  });
});

test('only visible assistant fields, standard tool arguments and bounded numeric usage leave transport', async () => {
  const body = reply({ role: 'assistant', content: '<think>Private reasoning.</think>\nVisible reply.',
    reasoning: token, reasoning_content: 'Hidden chain', internal: 'Private field',
    tool_calls: [{ id: 'protocol-call', type: 'function', internal: token,
      function: { name: 'protocol_tool', arguments: '{}', internal: token } }] },
  { internal: token, usage: { total_tokens: 13, private: token, completion_tokens_details: { reasoning_tokens: 2, private: token } } });
  body.choices[0].finish_reason = { private: token };
  await protocol(cloudflare, { body }, async () => {
    const result = await callCompanionInference([]);
    assert.equal(result.choices[0].message.content, 'Visible reply.');
    assert.deepEqual(result.choices[0].message.tool_calls, [{ id: 'protocol-call', type: 'function', function: { name: 'protocol_tool', arguments: '{}' } }]);
    assert.equal(result.usage.total_tokens, 13);
    assert.equal(result.choices[0].finish_reason, 'other');
    assert.equal(result.usage.completion_tokens_details.reasoning_tokens, 2);
    assert.ok(!JSON.stringify(result).includes(token));
    assert.ok(!JSON.stringify(result).includes('Private reasoning'));
    assert.ok(!JSON.stringify(result).includes('Hidden chain'));
  });
});

test('oversized requests fail before any provider request and oversized responses stay bounded', async () => {
  await protocol(cloudflare, {}, async capture => {
    await assert.rejects(callCompanionInference([{ role: 'user', content: 'x'.repeat(48000) }]),
      error => error instanceof ApiError && error.status === 400);
    assert.equal(capture.requests.length, 0);
  });
  await protocol(cloudflare, { chunks: [Buffer.alloc(65537, 65)] }, async capture => {
    await assert.rejects(callCompanionInference([]), error => error instanceof ApiError && error.status === 502);
    assert.equal(capture.requests.length, 1);
  });
});

test('429 honors provider pause and refusals/redirects never retry or disclose provider text', async () => {
  await protocol(cloudflare, { status: 429, body: { error: { message: token } }, headers: { 'retry-after': '17' } }, async capture => {
    await assert.rejects(callCompanionInference([]), error => error instanceof ResourceLimitError && error.status === 429 && error.retryAfter === 17);
    assert.equal(capture.requests.length, 1);
  });
  for (const status of [301, 302, 401, 403, 500]) {
    await protocol(cloudflare, { status, body: { errors: [{ code: 999, message: token, secret: account }] },
      headers: { location: 'https://outside.invalid/' } }, async capture => {
      await assert.rejects(callCompanionInference([]), error => error instanceof ApiError
        && error.status === 503 && error.code === `companion_provider_${status}` && !error.message.includes(token));
      assert.equal(capture.requests.length, 1);
      assert.ok(!JSON.stringify(capture.logs).includes(token));
      assert.ok(!JSON.stringify(capture.logs).includes(account));
      assert.ok(!JSON.stringify(capture.logs).includes('outside.invalid'));
    });
  }
});

test('invalid JSON, malformed completion shapes and unclosed reasoning never become saved reply candidates', async () => {
  for (const body of [{}, { choices: { 0: { message: { content: 'Invalid choices' } } } },
    reply({ content: {} }), reply({ content: 'Visible', tool_calls: {} }),
    reply({ content: 'Visible', tool_calls: [{ id: {}, type: 'function', function: { name: 'protocol_tool', arguments: '{}' } }] }),
    reply({ content: '<think>Unclosed hidden reasoning' })]) {
    await protocol(cloudflare, { body }, async () => {
      await assert.rejects(callCompanionInference([]), error => error instanceof ApiError && error.status === 502);
    });
  }
  await protocol(cloudflare, { chunks: [Buffer.from('not-json')] }, async () => {
    await assert.rejects(callCompanionInference([]), error => error instanceof ApiError && error.status === 502);
  });
});

test('external cancellation and classified network failures reject safely without retries', async () => {
  await protocol(cloudflare, { hold: true }, async capture => {
    const controller = new AbortController();
    const task = callCompanionInference([], undefined, controller.signal);
    controller.abort(new Error(token));
    await assert.rejects(task, error => error instanceof ApiError && error.status === 504 && error.code === 'companion_timeout');
    assert.equal(capture.requests.length, 1);
    assert.ok(!JSON.stringify(capture.logs).includes(token));
  });
  for (const [code, status] of [['ETIMEOUT', 504], ['ETIMEDOUT', 504], ['ENOTFOUND', 503], ['ECONNRESET', 503]] as const) {
    await protocol(cloudflare, { requestError: code }, async capture => {
      await assert.rejects(callCompanionInference([]), error => error instanceof ApiError && error.status === status && !error.message.includes('Private transport'));
      assert.equal(capture.requests.length, 1);
    });
  }
  await protocol(cloudflare, { interrupt: true }, async () => {
    await assert.rejects(callCompanionInference([]), error => error instanceof ApiError && error.code === 'companion_connection');
  });
});
