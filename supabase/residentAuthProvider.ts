import { ApiError } from './db.js';
import { WorkPool } from '../resourceSecurity.js';
const requests = new WorkPool(2, 4);
export const residentAlias = (email: unknown): email is string => typeof email === 'string' && /^resident-[a-f0-9]{32}@accounts\.pinevela\.app$/.test(email);

/** Server-only provisioning of an isolated room identity. Never accepts a role,
 * owner, email or native user ID from the client. The existing private enrollment
 * nonce trigger, not user metadata, authorizes the pending resident context. */
async function adminRequest(route:string,body:Record<string,unknown>) {
  const url = new URL(process.env.SUPABASE_URL || '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const legacy = !key.startsWith('sb_secret_');
  let claims: any; if (legacy) try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch {}
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || legacy && claims?.role !== 'service_role')
    throw new ApiError(503, 'Resident activation is temporarily unavailable.');
  return requests.run(async () => {
    try {
      const response = await fetch(`${url.origin}/auth/v1${route}`, { method: route==='/admin/users'?'POST':'PUT', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { apikey: key, ...(legacy ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body) });
      // No tokens or provider bodies are needed here. The final database query
      // verifies the exact reservation binding, even after an ambiguous reply.
      await response.body?.cancel();
      if (!response.ok) throw new Error('Resident provisioning failed.');
    } catch { throw new ApiError(503, 'Resident activation could not finish. Your room key is still checked before activation; retry with the same PIN.', 'resident_setup_retry'); }
  });
}
export async function createResidentAuthIdentity(email: string, password: string, nonce: string) {
  if (!residentAlias(email) || !/^[a-f0-9]{64}$/.test(nonce)) throw new ApiError(400, 'Invalid resident reservation.');
  return adminRequest('/admin/users',{email,password,email_confirm:true,user_metadata:{pinevela_enrollment_token:nonce}});
}
