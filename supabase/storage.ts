import crypto from 'node:crypto';
import { ApiError } from './db.js';
import { WorkPool } from '../resourceSecurity.js';
import { rasterContentType } from '../imageUploadSecurity.js';
export const MEDIA_BUCKET = 'pinevela-media', MAX_MEDIA_BYTES = 6 * 1024 * 1024;
// A real zero-byte folder marker created by Supabase Studio. Only recovery
// downloads accept it; application photograph paths remain UUID-owned PNGs.
export const isStorageFolderMarker = (value:string) => /^contexts\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/\.emptyFolderPlaceholder$/.test(value);
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
  private path(value:string,folderMarker=false) {
    if (!/^contexts\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(?:png|webp)$/.test(value)
      && !(folderMarker&&isStorageFolderMarker(value))) throw new ApiError(400,'Invalid photograph path.');
    return `${MEDIA_BUCKET}/${value}`;
  }
  private async request(route:string,options:RequestInit,maximum:number,allowMissingObject=false,timeoutMs=20000) {
    if (!Number.isInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>60000) throw new ApiError(503,'Invalid Storage operation deadline.');
    const config = storageConfig();
    return this.operations.run(async () => {
      let response:Response;
      try {
        response = await fetch(`${config.url}/storage/v1${route}`,{...options,
          headers:{apikey:config.key,...(config.legacy ? {Authorization:`Bearer ${config.key}`} : {}),...options.headers},
          signal:AbortSignal.timeout(timeoutMs),redirect:'error',cache:'no-store'});
        const bytes = await readBounded(response,maximum);
        if (!response.ok && allowMissingObject && [400,404].includes(response.status)) {
          let detail:any;try {detail=JSON.parse(bytes.toString());} catch {}
          if (Number(detail?.statusCode)===404 && (detail?.code==='NoSuchKey' ||
              detail?.error==='not_found' && detail?.message==='Object not found'))
            return {bytes,contentType:response.headers.get('content-type'),missing:true};
        }
        if (!response.ok) throw new ApiError(503,'Photograph storage is temporarily unavailable.',`storage_http_${response.status}`);
        return {bytes,contentType:response.headers.get('content-type')};
      } catch (error) {if (error instanceof ApiError) throw error;throw new ApiError(503,'Photograph storage is temporarily unavailable.',error instanceof Error && error.name==='TimeoutError'?'storage_timeout':'storage_transport');}
    });
  }
  async upload(path:string,bytes:Buffer) {
    if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new ApiError(413,'The processed photograph must be at most 6MB.');
    const contentType = rasterContentType(bytes);
    if (!path.endsWith(contentType === 'image/webp' ? '.webp' : '.png')) throw new ApiError(400,'Photograph format does not match its path.');
    await this.request(`/object/${this.path(path)}`,{method:'POST',headers:{'Content-Type':contentType,'x-upsert':'false'},body:new Uint8Array(bytes)},65536);
  }
  async download(path:string,expected:{byte_size:number;sha256:string}) {
    if(typeof expected.sha256!=='string'||!/^[a-f0-9]{64}$/.test(expected.sha256))throw new ApiError(503,'Photograph integrity metadata is required.');
    this.path(path);
    return this.downloadForBackup(path,expected);
  }
  /** Recovery also includes orphan objects left by interrupted uploads. Their
   * size comes from the saved Storage catalog; the archive records their digest.
   * This is server-only and does not authorize a browser download. */
  async downloadForBackup(path:string,expected:{byte_size:number;sha256?:string},timeoutMs=20000) {
    if (isStorageFolderMarker(path) && expected.byte_size===0) {
      const emptyDigest=crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
      if (expected.sha256!==undefined&&expected.sha256!==emptyDigest) throw new ApiError(503,'Invalid folder marker recovery metadata.');
      const result=await this.request(`/object/authenticated/${this.path(path,true)}`,{method:'GET'},1,false,timeoutMs);
      if (result.bytes.length!==0 || result.contentType?.split(';')[0]!=='application/octet-stream') throw new ApiError(503,'Folder marker integrity could not be verified.');
      return result.bytes;
    }
    if(!Number.isSafeInteger(expected.byte_size)||expected.byte_size<1||expected.byte_size>MAX_MEDIA_BYTES ||
      (expected.sha256!==undefined&&!/^[a-f0-9]{64}$/.test(expected.sha256)))throw new ApiError(503,'Invalid photograph recovery metadata.');
    const result = await this.request(`/object/authenticated/${this.path(path)}`,{method:'GET'},MAX_MEDIA_BYTES,false,timeoutMs);
    const contentType=path.endsWith('.webp')?'image/webp':'image/png';
    if (result.contentType?.split(';')[0] !== contentType || result.bytes.length !== expected.byte_size || rasterContentType(result.bytes)!==contentType ||
      (expected.sha256!==undefined&&crypto.createHash('sha256').update(result.bytes).digest('hex') !== expected.sha256)) throw new ApiError(503,'Photograph integrity could not be verified.');
    return result.bytes;
  }
  async remove(path:string) {
    this.path(path);
    await this.request(`/object/${MEDIA_BUCKET}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})},65536);
  }
  /** Only an explicit provider NoSuchKey is absence. Auth, route, bucket and
   * transport failures remain failures, including other 404 responses. */
  async objectInfo(path:string) {
    const result=await this.request(`/object/info/${this.path(path)}`,{method:'GET'},65536,true);
    if ('missing' in result && result.missing) return null;
    let value:any;try {value=JSON.parse(result.bytes.toString());} catch {}
    if (!value || typeof value!=='object' || Array.isArray(value) || typeof value.id!=='string')
      throw new ApiError(503,'Photograph metadata could not be verified.');
    return value as Record<string,unknown>;
  }
}
