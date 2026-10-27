import { ApiError } from './db.js';

/** Public disclosure only. Tokens/account identifiers never enter API state. */
export function companionProviderDisclosure(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.COMPANION_AI_PROVIDER ?? 'groq';
  return provider === 'cloudflare' ? { provider: 'cloudflare' as const, providerName: 'Cloudflare Workers AI' }
    : provider === 'groq' ? { provider: 'groq' as const, providerName: 'Groq' }
    : { provider: undefined, providerName: 'AI service' };
}

/** An acknowledgment describes the recipient; it grants no account authority.
 * Legacy Groq requests can omit it. A new recipient requires explicit consent. */
export function assertCompanionProviderConsent(value: unknown, env: NodeJS.ProcessEnv = process.env) {
  const { provider } = companionProviderDisclosure(env);
  if (!provider || value !== undefined && value !== provider || provider === 'cloudflare' && value !== provider)
    throw new ApiError(409, 'Your AI provider changed. Reopen your companion and enable replies for the current provider.', 'companion_provider_consent');
}
