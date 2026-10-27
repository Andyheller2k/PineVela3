/** Private CLI: one fixed, non-personal companion greeting. No database reads,
 * account writes, caller-supplied prompts, redirects or provider fallback. */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { ApiError } from '../supabase/db';
import { DEFAULT_COMPANION_PREFERENCES } from '../companionModel';
import { callCompanionModel, companionInstructions } from '../supabase/companion';
import { closeCompanionInferenceConnections, readCompanionProviderConfig } from '../supabase/companionInference';

const settingNames = ['COMPANION_AI_PROVIDER', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'] as const;
const errorCodes = new Set(['companion_configuration', 'companion_not_configured', 'companion_connection', 'companion_timeout', 'companion_response']);

function safeNumber(value: unknown, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : undefined;
}

function safeFailure(error: unknown) {
  const failure: { status?: number; code?: string; retryAfter?: number } = {};
  const candidate = error as { status?: unknown; code?: unknown; retryAfter?: unknown } | null;
  const status = candidate?.status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) failure.status = status;
  if (error instanceof ApiError && typeof error.code === 'string') {
    const providerStatus = /^companion_provider_([1-5]\d{2})$/.exec(error.code);
    if (errorCodes.has(error.code) || providerStatus) failure.code = error.code;
  }
  const retryAfter = safeNumber(candidate?.retryAfter, 86400);
  if (retryAfter !== undefined) failure.retryAfter = retryAfter;
  return failure;
}

async function main() {
  const started = Date.now();
  const report: Record<string, unknown> = {
    diagnosticVersion: 1,
    provider: 'cloudflare',
    checkedAtUtc: new Date().toISOString(),
    node: process.versions.node,
    personalDataSent: false,
    databaseOperations: 0,
    inferenceAttempts: 0,
  };
  let stage = 'options';
  try {
    if (process.argv.length !== 2) throw new Error('invalid_options');
    stage = 'configuration';
    let saved: Record<string, string> = {};
    let environmentFile = 'missing_or_unreadable';
    try { saved = dotenv.parse(fs.readFileSync('.env')); environmentFile = 'readable'; }
    catch { /* A hosting environment can supply all settings without a file. */ }
    const settings: Record<string, unknown> = {};
    for (const name of settingNames) {
      const fromEnvironment = Object.hasOwn(process.env, name);
      const fromFile = Object.hasOwn(saved, name);
      settings[name] = {
        source: fromEnvironment ? 'process_environment' : fromFile ? '.env' : 'missing',
        configured: Boolean(fromEnvironment ? process.env[name] : saved[name]),
        environmentOverridesDifferentFileValue: fromEnvironment && fromFile && process.env[name] !== saved[name],
      };
    }
    // Match the server's dotenv precedence, including explicitly empty values.
    for (const [name, value] of Object.entries(saved)) {
      if (!Object.hasOwn(process.env, name)) process.env[name] = value;
    }
    const selected = process.env.COMPANION_AI_PROVIDER;
    report.configuration = {
      environmentFile,
      settings,
      selectedProvider: selected === 'cloudflare' || selected === 'groq' ? selected : selected ? 'unsupported' : 'unset',
      accountIdValid: /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID || ''),
      applicationRootDetected: fs.existsSync('app.cjs') && fs.existsSync('dist-supabase-backend/supabase-server.mjs'),
    };
    if (selected !== 'cloudflare') {
      report.failure = 'cloudflare_not_selected';
      throw new Error('configuration_unavailable');
    }
    const config = readCompanionProviderConfig();
    if (config.provider !== 'cloudflare') throw new Error('configuration_unavailable');
    // This is public model metadata, never the configuration/token/account ID.
    report.model = config.model;
    const question = 'Hi Nova! Say hello in one short sentence.';
    stage = 'reply';
    report.inferenceAttempts = 1;
    const response = await callCompanionModel([
      { role: 'system', content: companionInstructions(DEFAULT_COMPANION_PREFERENCES, '', question) },
      { role: 'user', content: question },
    ], true);
    const choice = response?.choices?.[0];
    const characters = typeof choice?.message?.content === 'string' ? choice.message.content.trim().length : 0;
    const calls = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls.length : 0;
    const finishReason = ['stop', 'length', 'tool_calls'].includes(choice?.finish_reason) ? choice.finish_reason : 'other';
    report.visibleReplyCharacters = Math.min(characters, 65536);
    report.finishReason = finishReason;
    report.toolCallCount = Math.min(calls, 65536);
    const usage = safeNumber(response?.usage?.total_tokens, 1000000);
    if (usage !== undefined) report.usedTokens = usage;
    report.passed = characters > 0 && calls === 0 && finishReason === 'stop';
    report.conclusion = report.passed ? 'visible_reply_received' : calls ? 'unexpected_tool_request' : characters ? 'reply_incomplete' : 'empty_reply';
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    report.passed = false;
    report.failure ??= stage === 'options' ? 'invalid_options' : stage === 'configuration' ? 'configuration_unavailable' : 'reply_unavailable';
    Object.assign(report, safeFailure(error));
    if (stage === 'configuration') report.instruction = 'Run from the PineVela application directory with COMPANION_AI_PROVIDER=cloudflare and its private Workers AI token and Account ID.';
    process.exitCode = 1;
  } finally {
    closeCompanionInferenceConnections();
    report.elapsedMs = Date.now() - started;
    console.log(JSON.stringify(report));
  }
}

void main();
