import sharp from 'sharp';
import { WorkPool } from '../resourceSecurity.js';

export type PhotoSize = 'card' | 'thumb';
const dimensions: Record<PhotoSize, number> = { card: 640, thumb: 192 };
const workers = new WorkPool(2, 8);
const cache = new Map<string, { bytes: Buffer; expires: number }>();
const pending = new Map<string, Promise<Buffer>>();
const MAX_BYTES = 16 * 1024 * 1024, MAX_ENTRIES = 128, LIFETIME = 10 * 60_000;
let cachedBytes = 0;

/** Call only AFTER the current publication/ownership checks. No authorization,
 * session or remote URL is cached. Immutable asset digests bind derived bytes.
 * Older PNG uploads benefit without rewriting their retained original objects. */
export async function cataloguePhoto(id: string, digest: string, size: PhotoSize, download: () => Promise<Buffer>) {
  const key = `${id}:${digest}:${size}:webp-v1`, now = Date.now();
  for (const [oldKey, entry] of cache) if (entry.expires <= now) { cachedBytes -= entry.bytes.length; cache.delete(oldKey); }
  const saved = cache.get(key);
  if (saved) { cache.delete(key); cache.set(key, saved); return saved.bytes; }
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const work = workers.run(async () => {
    const original = await download();
    const bytes = await sharp(original, { limitInputPixels: 25_000_000, failOn: 'warning' }).rotate()
      .resize(dimensions[size], dimensions[size], { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).timeout({ seconds: 5 }).toBuffer();
    if (bytes.length <= MAX_BYTES) {
      while (cache.size >= MAX_ENTRIES || cachedBytes + bytes.length > MAX_BYTES) {
        const first = cache.entries().next().value;
        if (!first) break;
        cachedBytes -= first[1].bytes.length; cache.delete(first[0]);
      }
      cache.set(key, { bytes, expires: Date.now() + LIFETIME }); cachedBytes += bytes.length;
    }
    return bytes;
  });
  pending.set(key, work);
  try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
}
