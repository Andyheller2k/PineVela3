import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import dotenv from 'dotenv';
import { companionProviderDiagnostic } from '../supabase/companionProvider';
import { companionAgent } from '../supabase/companionConnection';
import { hostDiagnosticIdentity, hostDiagnosticKey, hostDiagnosticPlan, hostDiagnosticRequest,
  hostDiagnosticTransport, type HostDiagnosticRequest } from './companionHostDiagnostic';

/** Private hosting CLI only. Default: two fixed GETs. --network-identity adds
 * one credential-free IPv4 lookup. No chat, database, redirects or retries. */
async function check(kind: HostDiagnosticRequest, key: string) {
  return new Promise<Record<string, unknown>>(resolve => {
    const started = Date.now();
    const { options, deadlineMs, bodyLimit } = hostDiagnosticRequest(kind, key);
    const request = https.get({ ...options, ...(kind !== 'network_identity' ? { agent: companionAgent } : {}),
      signal: AbortSignal.timeout(deadlineMs) }, response => {
      let bytes = 0;
      const chunks: Buffer[] = [];
      const transport = hostDiagnosticTransport(response.socket, response.headers['cf-ray']);
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > bodyLimit) response.destroy();
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        const result: Record<string, unknown> = {
          ...(kind === 'network_identity' ? hostDiagnosticIdentity(response.statusCode, body)
            : companionProviderDiagnostic(response.statusCode, response.headers['content-type'], body)),
          ...transport, elapsedMs: Date.now() - started,
        };
        if (kind !== 'network_identity' && response.statusCode === 200) {
          try { result.modelAvailable = JSON.parse(body.toString('utf8'))?.data?.some((model: any) => model?.id === 'openai/gpt-oss-20b') === true; }
          catch { result.modelAvailable = false; }
        }
        resolve(result);
      });
      const interrupted = () => resolve({ ...transport,
        failure: bytes > bodyLimit ? 'response_too_large' : 'response_interrupted', elapsedMs: Date.now() - started });
      response.on('error', interrupted);
      response.on('aborted', interrupted);
    });
    request.on('error', error => {
      const code = (error as NodeJS.ErrnoException).code || '';
      const allowed = ['EAI_AGAIN', 'ENOTFOUND', 'ETIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ABORT_ERR',
        'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'];
      resolve({ failure: allowed.includes(code) ? code : 'connection_failed', elapsedMs: Date.now() - started });
    });
  });
}

function backendDiagnostic() {
  const bundle = path.resolve('dist-supabase-backend/supabase-server.mjs');
  let fd: number | undefined;
  try {
    fd = fs.openSync(bundle, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) return { bundlePresent: true, inspected: false };
    const text = fs.readFileSync(fd, 'utf8');
    return { bundlePresent: true, inspected: true, applicationHeadersCurrent: text.includes('PineVela-Companion/1.0'),
      rejectionReasonsCurrent: text.includes('network_access_denied') };
  } catch { return { bundlePresent: fs.existsSync(bundle), inspected: false }; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

async function main() {
const base = { diagnosticVersion: 4, checkedAtUtc: new Date().toISOString(), node: process.versions.node };
let configuration: Record<string, unknown> | undefined;
let stage = 'options';
try {
  const plan = hostDiagnosticPlan(process.argv.slice(2));
  stage = 'configuration';
  // Match the server's dotenv precedence; never output these values.
  let saved: Record<string, string> = {};
  let environmentFile = 'missing_or_unreadable';
  try { saved = dotenv.parse(fs.readFileSync('.env')); environmentFile = 'readable'; }
  catch { /* An environment variable can also supply the configured key. */ }
  const configured = hostDiagnosticKey(process.env, saved);
  configuration = { ...configured.metadata, environmentFile,
    applicationRootDetected: fs.existsSync('app.cjs') && fs.existsSync('dist-supabase-backend/supabase-server.mjs') };
  if (!configured.metadata.keyConfigured || !configured.key) throw new Error('configuration_unavailable');
  const backend = backendDiagnostic();
  stage = 'requests';
  const unauthenticated = await check(plan[0], configured.key);
  const authenticated = await check(plan[1], configured.key);
  const networkIdentity = plan.includes('network_identity') ? await check('network_identity', configured.key) : undefined;
  const conclusion = unauthenticated.httpStatus === 403 && authenticated.httpStatus === 403 ? 'both_requests_forbidden'
    : authenticated.httpStatus === 200 ? 'model_catalog_accessible'
    : authenticated.httpStatus === 401 ? 'configured_key_rejected'
    : authenticated.httpStatus === 403 ? 'authenticated_request_forbidden' : 'connection_not_established';
  console.log(JSON.stringify({ ...base, configuration, backend, unauthenticated, authenticated,
    ...(networkIdentity ? { networkIdentity } : {}), conclusion }));
} catch {
  console.log(JSON.stringify({ ...base, ...(configuration ? { configuration } : {}),
    failure: stage === 'options' ? 'invalid_options' : stage === 'configuration' ? 'configuration_unavailable' : 'diagnostic_unavailable',
    instruction: 'Run from the PineVela application directory with its existing private environment. Optional flag: --network-identity.' }));
  process.exitCode = 1;
} finally {
  companionAgent.destroy();
}
}
void main();
