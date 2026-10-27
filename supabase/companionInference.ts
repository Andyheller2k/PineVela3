import https from 'node:https';
import type { TcpNetConnectOpts } from 'node:net';
import { ApiError } from './db.js';
import { ResourceLimitError } from '../resourceSecurity.js';
import { companionRetryAfter } from '../companionModel.js';
import { companionAgent, companionConnectionFailure } from './companionConnection.js';
import { COMPANION_PROVIDER_HEADERS, companionProviderDiagnostic } from './companionProvider.js';

export type CompanionProviderConfig = Readonly<{
  provider: 'groq' | 'cloudflare';
  displayName: string;
  model: string;
  hostname: 'api.groq.com' | 'api.cloudflare.com';
  path: string;
  /** Server-only credential. Never serialize the configuration into logs or responses. */
  token: string;
}>;

const configurationError = () => new ApiError(503,
  'Your companion is not connected yet. Please try again later.', 'companion_configuration');
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._~-]{16,2048}$/.test(value);

/** Only server configuration selects a provider. No caller URL, model override,
 * paid-model fallback or cross-provider credential reuse is accepted. */
export function readCompanionProviderConfig(env: NodeJS.ProcessEnv = process.env): CompanionProviderConfig {
  const provider = env.COMPANION_AI_PROVIDER ?? 'groq';
  if (provider === 'groq') {
    if (!validToken(env.GROQ_API_KEY)) throw configurationError();
    return Object.freeze({ provider, displayName: 'Groq', model: 'openai/gpt-oss-20b',
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', token: env.GROQ_API_KEY });
  }
  if (provider === 'cloudflare') {
    const account = env.CLOUDFLARE_ACCOUNT_ID;
    if (!validToken(env.CLOUDFLARE_API_TOKEN) || typeof account !== 'string' || !/^[a-f0-9]{32}$/i.test(account))
      throw configurationError();
    return Object.freeze({ provider, displayName: 'Cloudflare Workers AI', model: '@cf/openai/gpt-oss-20b',
      hostname: 'api.cloudflare.com', path: `/client/v4/accounts/${account}/ai/v1/chat/completions`,
      token: env.CLOUDFLARE_API_TOKEN });
  }
  throw configurationError();
}

export function companionProviderReady(env: NodeJS.ProcessEnv = process.env) {
  try { readCompanionProviderConfig(env); return true; } catch { return false; }
}

// Cloudflare uses its own fixed-host transport rather than Groq's fixed DNS
// resolver. Both agents keep bounded sockets and use normal certificate checks.
const cloudflareAgent = new https.Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2 });

function normalizedCompletion(data: any) {
  const choice = data?.choices?.[0], message = choice?.message;
  if (!Array.isArray(data?.choices) || !message || typeof message !== 'object' || Array.isArray(message)
    || message.content !== undefined && message.content !== null && typeof message.content !== 'string'
    || message.tool_calls !== undefined && !Array.isArray(message.tool_calls))
    throw new ApiError(502, 'Your companion could not finish that reply. Please try again.');
  // Only assistant-visible content and standard tool arguments leave the
  // transport. Hidden reasoning and arbitrary upstream fields are discarded.
  let content = typeof message.content === 'string' ? message.content : null;
  if (content) {
    content = content.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '');
    if (/<\/?(?:think|analysis)>/i.test(content))
      throw new ApiError(502, 'Your companion could not finish that reply. Please try again.');
  }
  const toolCalls = message.tool_calls?.map((call: any) => {
    if (typeof call?.id !== 'string' || call.id.length > 160 || call?.type !== 'function'
      || typeof call?.function?.name !== 'string' || call.function.name.length > 100
      || typeof call?.function?.arguments !== 'string' || call.function.arguments.length > 1000)
      throw new ApiError(502, 'Your companion could not complete that lookup.');
    return { id: call.id, type: 'function', function: { name: call.function.name, arguments: call.function.arguments } };
  });
  const usage: Record<string, unknown> = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    const value = data?.usage?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) usage[key] = Math.floor(value);
  }
  const reasoningTokens = data?.usage?.completion_tokens_details?.reasoning_tokens;
  if (typeof reasoningTokens === 'number' && Number.isFinite(reasoningTokens) && reasoningTokens >= 0)
    usage.completion_tokens_details = { reasoning_tokens: Math.floor(reasoningTokens) };
  const finishReason = ['stop', 'length', 'tool_calls', 'content_filter', 'function_call'].includes(choice.finish_reason)
    ? choice.finish_reason : 'other';
  return { choices: [{ index: 0, finish_reason: finishReason,
    message: { role: 'assistant', content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } }], usage };
}

/** Fixed HTTPS endpoints, bounded buffers/deadline, no redirects or automatic
 * retries. Account/session authorization remains with the companion routes. */
export async function callCompanionInference(messages: any[], tools?: readonly any[], signal?: AbortSignal,
  allowToolCalls = true): Promise<any> {
  const configuration = readCompanionProviderConfig();
  // Cloudflare's continuation template still needs the original definitions
  // when history includes tool calls/results. Disable new calls explicitly.
  // Groq retains its existing final-request behavior without tool definitions.
  const includeTools = !!tools?.length && (allowToolCalls || configuration.provider === 'cloudflare');
  const body = JSON.stringify({ model: configuration.model, messages, temperature: 0.4,
    ...(configuration.provider === 'cloudflare' ? { max_tokens: 900, reasoning_effort: 'low' } : { max_completion_tokens: 900 }),
    ...(includeTools ? { tools, tool_choice: allowToolCalls ? 'auto' : 'none', parallel_tool_calls: false } : {}) });
  if (Buffer.byteLength(body) > 48000) throw new ApiError(400, 'This conversation is too long. Start a fresh conversation.');
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
    const started = Date.now();
    const connection: Pick<TcpNetConnectOpts, 'autoSelectFamily' | 'autoSelectFamilyAttemptTimeout'> = {
      autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 300,
    };
    const request = https.request({ hostname: configuration.hostname, servername: configuration.hostname,
      path: configuration.path, method: 'POST', rejectUnauthorized: true,
      agent: configuration.provider === 'groq' ? companionAgent : cloudflareAgent, ...connection,
      headers: { ...COMPANION_PROVIDER_HEADERS, Authorization: `Bearer ${configuration.token}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]),
    }, response => {
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 65536) {
          fail(new ApiError(502, 'Your companion returned too much text. Please try a shorter question.'));
          response.destroy();
        } else chunks.push(chunk);
      });
      const interrupted = () => fail(new ApiError(503,
        'The AI connection was interrupted. Your message is kept. Please try again.', 'companion_connection'));
      response.on('error', interrupted);
      response.on('aborted', interrupted);
      response.on('end', () => {
        if (settled) return;
        if (response.statusCode === 429) return fail(new ResourceLimitError(429,
          companionRetryAfter(String(response.headers['retry-after'] || '')),
          'The free AI service needs a pause. Your message is kept.'));
        const buffer = Buffer.concat(chunks);
        if (response.statusCode !== 200) {
          const status = typeof response.statusCode === 'number' && Number.isInteger(response.statusCode)
            && response.statusCode >= 100 && response.statusCode <= 599 ? response.statusCode : 0;
          console.warn('[Companion] Provider rejected request.', { provider: configuration.provider,
            ...companionProviderDiagnostic(response.statusCode, response.headers['content-type'], buffer),
            elapsedMs: Date.now() - started });
          return fail(new ApiError(503, 'Your companion is temporarily unavailable. Please try again later.',
            `companion_provider_${status}`));
        }
        try {
          const result = normalizedCompletion(JSON.parse(buffer.toString('utf8')));
          settled = true;
          resolve(result);
        } catch {
          fail(new ApiError(502, 'Your companion could not finish that reply. Please try again.'));
        }
      });
    });
    request.on('error', error => {
      const failure = companionConnectionFailure(error);
      const reasons = ['EAI_AGAIN', 'ENOTFOUND', 'ETIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED',
        'ENETUNREACH', 'EHOSTUNREACH', 'ABORT_ERR', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'];
      const code = (error as NodeJS.ErrnoException).code || '';
      console.warn('[Companion] Provider connection failed.', { provider: configuration.provider,
        code: failure.code, reason: reasons.includes(code) ? code : 'OTHER', elapsedMs: Date.now() - started });
      fail(failure);
    });
    request.end(body);
  });
}

export function closeCompanionInferenceConnections() {
  companionAgent.destroy();
  cloudflareAgent.destroy();
}
