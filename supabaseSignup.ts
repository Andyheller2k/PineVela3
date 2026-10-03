import { normalizeEmail } from './accountSecurity.js';

export class SignupError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Server-only public project credentials. SMTP delivery stays in Supabase settings.
export function signupProviderConfig() {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!rawUrl || !key) throw new SignupError(503, 'Email verification is not configured. Please try again later.');
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new SignupError(503, 'Email verification configuration is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new SignupError(503, 'Email verification requires a secure Supabase project URL.');
  }
  if (!key.startsWith('sb_publishable_')) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (claims.role !== 'anon') throw new Error('Not a public key');
    } catch { throw new SignupError(503, 'Use a Supabase public publishable or anon key for email verification.'); }
  }
  return { url: url.origin, key };
}

type ProviderConfig = ReturnType<typeof signupProviderConfig>;
async function authRequest(config: ProviderConfig, route: string, body?: unknown, accessToken?: string) {
  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: config.key, 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store'
    });
  } catch { throw new SignupError(503, 'Email verification is temporarily unavailable. Please try again later.'); }
  let data: any;
  try { data = await response.json(); } catch { throw new SignupError(503, 'Email verification returned an invalid response.'); }
  if (!response.ok) {
    if (response.status === 429) throw new SignupError(429, 'Too many email verification requests. Please wait before trying again.');
    if (data?.error_code === 'email_address_not_authorized') throw new SignupError(503, 'The development email service can only send to Supabase team members.');
    if (route === '/verify' && response.status >= 400 && response.status < 500) throw new SignupError(400, 'Invalid or expired verification code. Please request a new one.');
    if (['weak_password', 'validation_failed', 'email_address_invalid'].includes(data?.error_code)) throw new SignupError(400, 'Check your email address and password requirements.');
    throw new SignupError(503, 'Email verification could not complete. Please try again later.');
  }
  return data;
}

export function requireConfirmationSettings(settings: any) {
  if (settings?.mailer_autoconfirm !== false || settings?.external?.email !== true || settings?.disable_signup !== false) {
    throw new SignupError(503, 'Supabase must have email signup and email confirmation enabled.');
  }
}
async function requireConfirmation(config: ProviderConfig) {
  requireConfirmationSettings(await authRequest(config, '/settings'));
}

export async function sendSignupVerification(config: ProviderConfig, name: string, email: string, password: string) {
  await requireConfirmation(config);
  const data = await authRequest(config, '/signup', { email, password, data: { name } });
  const user = data?.user || data;
  if (data?.access_token || data?.session || user?.email_confirmed_at || !user?.id || normalizeEmail(user.email) !== email) {
    throw new SignupError(503, 'Email confirmation is required before this account can be activated.');
  }
  return String(user.id);
}

export function confirmedSignupIdentity(user: any, expected: { email: string; supabaseUserId: string }) {
  if (!user || user.is_anonymous || user.id !== expected.supabaseUserId || normalizeEmail(user.email) !== expected.email ||
      typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at))) {
    throw new SignupError(400, 'Email confirmation does not match this registration.');
  }
  return { id: String(user.id), email: normalizeEmail(user.email), verifiedAt: user.email_confirmed_at as string };
}

export function signupChallenge(value: unknown, providerUrl: string): { token_hash: string; type: 'email' } | { token: string; type: 'email' } {
  if (typeof value !== 'string' || value.length > 4096) throw new SignupError(400, 'Enter the code or confirmation link from your email.');
  const challenge = value.trim();
  if (/^\d{6}$/.test(challenge)) return { token: challenge, type: 'email' };
  let link: URL;
  try { link = new URL(challenge); } catch { throw new SignupError(400, 'Enter a valid email confirmation code or link.'); }
  const tokenHash = link.searchParams.get('token') || link.searchParams.get('token_hash');
  if (link.origin !== providerUrl || link.pathname !== '/auth/v1/verify' || link.username || link.password ||
      !['email', 'signup'].includes(link.searchParams.get('type') || '') || !/^[a-f0-9]{56,64}$/.test(tokenHash || '')) {
    throw new SignupError(400, 'This confirmation link does not belong to the configured Supabase signup flow.');
  }
  // Never open or follow a submitted URL. Only send the extracted secret to the configured provider.
  return { token_hash: tokenHash!, type: 'email' };
}

export async function confirmSignupVerification(config: ProviderConfig, pending: { email: string; supabaseUserId: string; providerUrl: string }, challenge: string) {
  if (config.url !== pending.providerUrl) throw new SignupError(400, 'The verification provider changed. Please start signup again.');
  const proof = signupChallenge(challenge, config.url);
  await requireConfirmation(config);
  const data = await authRequest(config, '/verify', 'token' in proof ? { email: pending.email, ...proof } : proof);
  if (!data?.access_token || typeof data.access_token !== 'string') throw new SignupError(400, 'Email verification did not return an authenticated confirmation.');
  const user = await authRequest(config, '/user', undefined, data.access_token);
  return confirmedSignupIdentity(user, pending);
}
