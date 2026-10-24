import fs from 'node:fs';
import https from 'node:https';
import dotenv from 'dotenv';
import { COMPANION_PROVIDER_HEADERS, companionProviderDiagnostic } from '../supabase/companionProvider';
import { companionAgent } from '../supabase/companionConnection';

/** Private hosting CLI only. Two fixed-destination GETs, no chat, database,
 * redirects, credential output, arbitrary URLs or automatic retries. */
async function check(authenticated: boolean, key: string) {
  return new Promise<Record<string, unknown>>(resolve => {
    const started = Date.now();
    const request = https.get({ hostname: 'api.groq.com', path: '/openai/v1/models', agent: companionAgent,
      headers: { ...COMPANION_PROVIDER_HEADERS, ...(authenticated ? { Authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(10000) }, response => {
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 65536) response.destroy();
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        const result: Record<string, unknown> = { ...companionProviderDiagnostic(response.statusCode, response.headers['content-type'], body), elapsedMs: Date.now() - started };
        if (response.statusCode === 200) {
          try { result.modelAvailable = JSON.parse(body.toString('utf8'))?.data?.some((model: any) => model?.id === 'openai/gpt-oss-20b') === true; }
          catch { result.modelAvailable = false; }
        }
        resolve(result);
      });
      response.on('error', () => resolve({ failure: 'response_interrupted' }));
      response.on('aborted', () => resolve({ failure: bytes > 65536 ? 'response_too_large' : 'response_interrupted' }));
    });
    request.on('error', error => {
      const code = (error as NodeJS.ErrnoException).code || '';
      const allowed = ['EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ABORT_ERR'];
      resolve({ failure: allowed.includes(code) ? code : 'connection_failed', elapsedMs: Date.now() - started });
    });
  });
}

async function main() {
try {
  // Match the server's dotenv precedence; never output these values.
  let saved: Record<string, string> = {};
  try { saved = dotenv.parse(fs.readFileSync('.env')); } catch { /* An environment variable can also supply the configured key. */ }
  const key = process.env.GROQ_API_KEY || saved.GROQ_API_KEY;
  if (!key || !/^[A-Za-z0-9_-]{16,1000}$/.test(key)) throw new Error('configuration_unavailable');
  const unauthenticated = await check(false, key);
  const authenticated = await check(true, key);
  const conclusion = unauthenticated.httpStatus === 403 && authenticated.httpStatus === 403 ? 'both_requests_forbidden'
    : authenticated.httpStatus === 200 ? 'model_catalog_accessible'
    : authenticated.httpStatus === 401 ? 'configured_key_rejected'
    : authenticated.httpStatus === 403 ? 'authenticated_request_forbidden' : 'connection_not_established';
  console.log(JSON.stringify({ diagnosticVersion: 3, unauthenticated, authenticated, conclusion }));
} catch {
  console.log(JSON.stringify({ diagnosticVersion: 3, failure: 'configuration_unavailable', instruction: 'Run from the PineVela application directory with its existing private environment.' }));
  process.exitCode = 1;
} finally {
  companionAgent.destroy();
}
}
void main();
