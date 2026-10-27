import { isIP } from 'node:net';
import type { RequestOptions } from 'node:https';
import { COMPANION_PROVIDER_HEADERS } from '../supabase/companionProvider';

export type HostDiagnosticRequest = 'public_models' | 'authenticated_models' | 'network_identity';

/** No caller-supplied hosts, URLs or repeated requests. Identity is opt-in. */
export function hostDiagnosticPlan(args: string[]): HostDiagnosticRequest[] {
  if (args.length === 0) return ['public_models', 'authenticated_models'];
  if (args.length === 1 && args[0] === '--network-identity')
    return ['public_models', 'authenticated_models', 'network_identity'];
  throw new Error('invalid_options');
}

export function hostDiagnosticRequest(kind: HostDiagnosticRequest, key: string) {
  if (!['public_models', 'authenticated_models', 'network_identity'].includes(kind)) throw new Error('invalid_request');
  const identity = kind === 'network_identity';
  const options: RequestOptions = {
    protocol: 'https:',
    hostname: identity ? 'api.ipify.org' : 'api.groq.com',
    path: identity ? '/' : '/openai/v1/models',
    method: 'GET',
    headers: {
      ...COMPANION_PROVIDER_HEADERS,
      Accept: identity ? 'text/plain' : 'application/json',
      ...(kind === 'authenticated_models' ? { Authorization: `Bearer ${key}` } : {}),
    },
    ...(identity ? { agent: false, family: 4 } : {}),
  };
  return { options, deadlineMs: identity ? 6000 : 10000, bodyLimit: identity ? 128 : 65536 };
}

/** Match dotenv's non-override behavior even for an explicitly empty value. */
export function hostDiagnosticKey(environment: Record<string, string | undefined>, file: Record<string, string>) {
  const hasEnvironmentKey = Object.hasOwn(environment, 'GROQ_API_KEY');
  const hasFileKey = Object.hasOwn(file, 'GROQ_API_KEY');
  const key = hasEnvironmentKey ? environment.GROQ_API_KEY : file.GROQ_API_KEY;
  return {
    key,
    metadata: {
      keySource: hasEnvironmentKey ? 'process_environment' : hasFileKey ? '.env' : 'missing',
      keyConfigured: typeof key === 'string' && /^[A-Za-z0-9_-]{16,1000}$/.test(key),
      environmentOverridesDifferentFileKey: Boolean(environment.GROQ_API_KEY && file.GROQ_API_KEY
        && environment.GROQ_API_KEY !== file.GROQ_API_KEY),
    },
  };
}

/** Private CLI correlation ID only; never log arbitrary headers or bodies. */
export function hostDiagnosticRay(value: unknown) {
  return typeof value === 'string' && /^[a-f0-9]{16}(?:-[A-Z]{3})?$/.test(value) ? value : undefined;
}

export function hostDiagnosticTransport(socket: unknown, ray: unknown) {
  const connection = socket as { authorized?: unknown; remoteFamily?: unknown } | undefined;
  const family = connection?.remoteFamily;
  const cfRay = hostDiagnosticRay(ray);
  return {
    tlsAuthorized: connection?.authorized === true,
    ...(family === 'IPv4' || family === 'IPv6' ? { addressFamily: family } : {}),
    ...(cfRay ? { cfRay } : {}),
  };
}

/** Reject special/private addresses rather than labelling them public egress. */
export function hostDiagnosticPublicIPv4(value: unknown) {
  if (typeof value !== 'string' || isIP(value) !== 4) return undefined;
  const [a, b, c] = value.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224
    || a === 100 && b >= 64 && b <= 127
    || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31
    || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)
    || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
    || a === 203 && b === 0 && c === 113) return undefined;
  return value;
}

export function hostDiagnosticIdentity(status: number | undefined, body: Buffer) {
  const httpStatus = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
  const publicIPv4 = httpStatus === 200 && body.length <= 128
    ? hostDiagnosticPublicIPv4(body.toString('utf8').trim()) : undefined;
  return {
    httpStatus,
    ...(publicIPv4 ? { publicIPv4 } : { failure: 'network_identity_unavailable' }),
    scope: 'Observed by api.ipify.org; destination-dependent NAT may differ for Groq. No ASN or country is inferred.',
  };
}
