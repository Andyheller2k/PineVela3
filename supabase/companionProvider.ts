/** Identify the application honestly; never impersonate a browser or rotate identities. */
export const COMPANION_PROVIDER_HEADERS = Object.freeze({
  Accept: 'application/json',
  'User-Agent': 'PineVela-Companion/1.0',
});

const providerCodes = new Set([
  'invalid_api_key', 'model_not_found', 'model_decommissioned', 'permission_denied',
  'model_permission_blocked_org', 'model_permission_blocked_project',
  'unsupported_country_region_territory', 'tool_use_failed',
]);
const edgeCodes = new Set([1005, 1006, 1007, 1008, 1009, 1010, 1013, 1020]);
const providerTypes = new Set(['invalid_request_error', 'permissions_error', 'permission_error', 'authentication_error']);
const rejectionReasons = new Map([
  ['forbidden', 'forbidden'],
  ['access denied. please check your network settings.', 'network_access_denied'],
]);

/** Return only bounded, allowlisted metadata, never raw provider text or headers. */
export function companionProviderDiagnostic(status: number | undefined, contentType: unknown, body: Buffer) {
  const httpStatus = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
  const format = typeof contentType === 'string' && /^application\/json(?:;|$)/i.test(contentType) ? 'json'
    : typeof contentType === 'string' && /^text\/html(?:;|$)/i.test(contentType) ? 'html' : 'other';
  let providerCode: string | undefined, providerType: string | undefined, reason: string | undefined, edgeCode: number | undefined;
  if (body.length <= 65536) {
    const text = body.toString('utf8');
    if (format === 'json') {
      try {
        const error = JSON.parse(text)?.error;
        const code = error?.code;
        if (typeof code === 'string' && providerCodes.has(code)) providerCode = code;
        if (typeof error?.type === 'string' && providerTypes.has(error.type)) providerType = error.type;
        // Exact matches produce fixed categories, never excerpts of a provider
        // message which might contain a key, user content or identifying data.
        if (httpStatus === 403 && typeof error?.message === 'string' && error.message.length <= 100)
          reason = rejectionReasons.get(error.message.trim().toLowerCase());
      } catch { /* Malformed provider errors must not expose the body. */ }
    } else if (httpStatus === 403) {
      const code = Number(text.match(/\berror(?:\s+code)?\s*:\s*(\d{4})\b/i)?.[1]);
      if (edgeCodes.has(code)) edgeCode = code;
    }
  }
  return { httpStatus, format, ...(providerCode ? { providerCode } : {}), ...(providerType ? { providerType } : {}),
    ...(reason ? { reason } : {}), ...(edgeCode ? { edgeCode } : {}) };
}
