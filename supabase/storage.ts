import crypto from 'node:crypto';
import { ApiError } from './db.js';
import { WorkPool } from '../resourceSecurity.js';
export const MEDIA_BUCKET = 'pinevela-media', MAX_MEDIA_BYTES = 6 * 1024 * 1024;
function storageConfig() {
  const url = new URL(process.env.SUPABASE_URL || '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('A secure Supabase Storage origin is required.');
  if (!key.startsWith('sb_secret_')) {
    let claims:any;try {claims = JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());} catch {}
    if (claims?.role !== 'service_role') throw new Error('A server-only Supabase secret or service-role key is required.');
  }
  return {url:url.origin,key,legacy:!key.startsWith('sb_secret_')};
}
async function readBounded(response:Response,maximum:number) {
  if (!response.body || Number(response.headers.get('content-length') || 0) > maximum) throw new ApiError(503,'Storage returned an unsupported response.');
  const reader = response.body.getReader(),chunks:Buffer[] = [];let size = 0;
  try {
    for (;;) {
      const part = await reader.read();if (part.done) break;
      size += part.value.length;
      if (size > maximum) throw new ApiError(503,'Storage returned an unsupported response.');
      chunks.push(Buffer.from(part.value));
    }
    return Buffer.concat(chunks,size);
  } finally {await reader.cancel().catch(() => undefined);reader.releaseLock();}
}
/** Elevated credentials never leave this server module. Callers must authorize
 * the saved asset and its relationship before invoking any object operation. */
export class SupabaseStorage {
  private operations = new WorkPool(4,8);
  private path(value:string) {
    if (!/^contexts\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.png$/.test(value)) throw new ApiError(400,'Invalid photograph path.');
    return `${MEDIA_BUCKET}/${value}`;
  }
  private async request(route:string,options:RequestInit,maximum:number) {
    const config = storageConfig();
    return this.operations.run(async () => {
      let response:Response;
      try {
        response = await fetch(`${config.url}/storage/v1${route}`,{...options,
          headers:{apikey:config.key,...(config.legacy ? {Authorization:`Bearer ${config.key}`} : {}),...options.headers},
          signal:AbortSignal.timeout(20000),redirect:'error',cache:'no-store'});
        const bytes = await readBounded(response,maximum);
        if (!response.ok) throw new ApiError(503,'Photograph storage is temporarily unavailable.',`storage_http_${response.status}`);
        return {bytes,contentType:response.headers.get('content-type')};
      } catch (error) {if (error instanceof ApiError) throw error;throw new ApiError(503,'Photograph storage is temporarily unavailable.',error instanceof Error && error.name==='TimeoutError'?'storage_timeout':'storage_transport');}
    });
  }
  async upload(path:string,bytes:Buffer) {
    if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new ApiError(413,'The processed photograph must be at most 6MB.');
    await this.request(`/object/${this.path(path)}`,{method:'POST',headers:{'Content-Type':'image/png','x-upsert':'false'},body:new Uint8Array(bytes)},65536);
  }
  async download(path:string,expected:{byte_size:number;sha256:string}) {
    const result = await this.request(`/object/authenticated/${this.path(path)}`,{method:'GET'},MAX_MEDIA_BYTES);
    if (!result.contentType?.startsWith('image/png') || result.bytes.length !== expected.byte_size ||
      crypto.createHash('sha256').update(result.bytes).digest('hex') !== expected.sha256) throw new ApiError(503,'Photograph integrity could not be verified.');
    return result.bytes;
  }
  async remove(path:string) {
    this.path(path);
    await this.request(`/object/${MEDIA_BUCKET}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})},65536);
  }
}
