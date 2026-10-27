export type CompanionProvider = 'groq' | 'cloudflare';

/** Only an absent field is a legacy Groq server; unknown recipients fail closed. */
export function companionProvider(value: unknown): CompanionProvider | undefined {
  return value === undefined ? 'groq' : value === 'groq' || value === 'cloudflare' ? value : undefined;
}

export function companionProviderAccepted(provider: CompanionProvider | undefined, acknowledged: CompanionProvider | null) {
  return provider !== undefined && (provider === 'groq' || acknowledged === provider);
}

/** Call only for a mutation: a click confirming the displayed recipient can
 * authorize this request before React commits its local acknowledgment state. */
export function companionConsentHeaders(provider: CompanionProvider | undefined, acknowledged: CompanionProvider | null, explicit = false): Record<string, string> {
  return provider && (explicit || companionProviderAccepted(provider, acknowledged))
    ? { 'X-PineVela-AI-Provider': provider } : {};
}
