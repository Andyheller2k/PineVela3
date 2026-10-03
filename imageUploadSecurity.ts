import crypto from 'node:crypto';
import fs, { constants } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import sharp from 'sharp';
import { ResourceLimitError, resourceFailure, WorkPool } from './resourceSecurity.js';

export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_IMAGE_DIMENSION = 16_384;
const MIME_FORMATS: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const imageWorkers = new WorkPool(2, 4);
const imageReads = new WorkPool(2, 8);

export class ImageUploadError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function rasterFormat(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

/** Decode pixels and construct new PNG bytes; never publish submitted bytes or metadata. */
export async function normalizeRasterImage(bytes: Buffer): Promise<Buffer> {
  return imageWorkers.run(() => decodeRasterPixels(bytes));
}
async function decodeRasterPixels(bytes: Buffer): Promise<Buffer> {
  const expectedFormat = rasterFormat(bytes);
  if (!expectedFormat) throw new ImageUploadError(415, 'Only decoded JPEG, PNG and WebP photographs are supported.');
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format !== expectedFormat || (metadata.pages || 1) !== 1) {
      throw new ImageUploadError(415, 'Use a single, non-animated JPEG, PNG or WebP photograph.');
    }
    if (!metadata.width || !metadata.height || metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new ImageUploadError(413, 'Image dimensions exceed the supported limit.');
    }
    // Sharp strips EXIF, XMP and other original metadata by default. Preserve pixel resolution.
    const output = await image.rotate().png().timeout({ seconds: 5 }).toBuffer();
    if (output.length > MAX_IMAGE_OUTPUT_BYTES) throw new ImageUploadError(413, 'Decoded image exceeds the supported size.');
    return output;
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError(400, 'Image could not be fully decoded. Use a valid JPEG, PNG or WebP photograph.');
  }
}

export async function decodeImageUpload(body: any): Promise<Buffer> {
  const format = typeof body?.fileType === 'string' ? MIME_FORMATS[body.fileType.toLowerCase()] : undefined;
  if (!format) throw new ImageUploadError(415, 'Specify JPEG, PNG or WebP as the image type.');
  if (typeof body?.fileData !== 'string' || !body.fileData) throw new ImageUploadError(400, 'Image file data is required.');
  let encoded = body.fileData;
  if (encoded.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(encoded);
    if (!match || MIME_FORMATS[match[1].toLowerCase()] !== format) throw new ImageUploadError(400, 'Image data URL and image type must match.');
    encoded = match[2];
  }
  if (encoded.length > Math.ceil(MAX_IMAGE_INPUT_BYTES / 3) * 4) throw new ImageUploadError(413, 'Image exceeds the 20MB limit.');
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new ImageUploadError(400, 'Invalid base64 image data.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new ImageUploadError(400, 'Invalid base64 image data.');
  if (bytes.length > MAX_IMAGE_INPUT_BYTES) throw new ImageUploadError(413, 'Image exceeds the 20MB limit.');
  if (rasterFormat(bytes) !== format) throw new ImageUploadError(415, 'Image content does not match its declared type.');
  return normalizeRasterImage(bytes);
}

function mediaOrigin(value: string, publicOrigin: string): string {
  if (!value) return '';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new Error('PINEVELA_MEDIA_ORIGIN must be a plain HTTPS origin in production.');
  }
  if (!publicOrigin || new URL(publicOrigin).origin === url.origin) throw new Error('Set PINEVELA_PUBLIC_ORIGIN and a distinct PINEVELA_MEDIA_ORIGIN.');
  return url.origin;
}

export function createImageStorage(options: { root?: string; mediaOrigin?: string; publicOrigin?: string; capacityBytes?: number; capacityFiles?: number } = {}) {
  const root = path.resolve(options.root || process.env.PINEVELA_UPLOADS_DIR || path.join(process.cwd(), 'uploads'));
  const origin = mediaOrigin(options.mediaOrigin ?? process.env.PINEVELA_MEDIA_ORIGIN ?? '', options.publicOrigin ?? process.env.PINEVELA_PUBLIC_ORIGIN ?? '');
  const capacityBytes = options.capacityBytes ?? 5 * 1024 * 1024 * 1024, capacityFiles = options.capacityFiles ?? 20000;
  // Existing uploads are preserved. A bounded initial scan accounts for legacy/unsafe files too.
  let usage: Promise<{ bytes: number; files: number }> | undefined;
  const storageUsage = () => usage ||= (async () => {
    let bytes = 0, files = 0;
    try {
      const entries = await fs.opendir(path.join(root, 'hostels'));
      for await (const entry of entries) {
        if (++files > capacityFiles) throw new ResourceLimitError(507, 3600, 'Photograph storage is full. Contact an administrator.');
        const stat = await fs.lstat(path.join(root, 'hostels', entry.name)); bytes += stat.size;
      }
    } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    return { bytes, files };
  })();
  const router = Router();
  router.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cache-Control': 'no-store'
    });
    next();
  });
  router.get('/hostels/:fileName', async (req, res) => {
    const name = req.params.fileName;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(png|jpg|jpeg|webp)$/i.test(name)) { res.sendStatus(404); return; }
    if (origin && req.get('host')?.toLowerCase() !== new URL(origin).host.toLowerCase()) {
      res.redirect(307, `${origin}/uploads/hostels/${encodeURIComponent(name)}`); return;
    }
    let handle;
    try {
      const output = await imageReads.run(async () => {
        const base = await fs.realpath(root);
        const file = await fs.realpath(path.join(base, 'hostels', name));
        if (!file.startsWith(base + path.sep)) throw new Error('Image is outside storage.');
        handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAX_IMAGE_OUTPUT_BYTES) throw new Error('Unsupported image size.');
        return normalizeRasterImage(await handle.readFile());
      });
      // Legacy paths keep working, but arbitrary original bytes are never served.
      res.set({ 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="photograph.png"' }).send(output);
    } catch (error) {
      if (error instanceof ResourceLimitError) { resourceFailure(res, error); return; }
      res.sendStatus(404);
    } finally {
      await handle?.close();
    }
  });
  // Do not fall through to static files or the application shell for other upload paths.
  router.use((_req, res) => { res.sendStatus(404); });

  return {
    mediaBoundary(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
      if (origin && req.get('host')?.toLowerCase() === new URL(origin).host.toLowerCase() && !req.path.startsWith('/uploads/')) {
        res.sendStatus(404); return;
      }
      next();
    },
    router,
    async save(body: any, reserveQuota?: (bytes: number) => Promise<void>) {
      const output = await decodeImageUpload(body);
      const used = await storageUsage();
      if (used.bytes + output.length > capacityBytes || used.files >= capacityFiles) throw new ResourceLimitError(507, 3600, 'Photograph storage is full. Contact an administrator.');
      // Reserve synchronously before yielding, preventing concurrent writes from overspending.
      used.bytes += output.length; used.files++;
      try {
        await reserveQuota?.(output.length);
        await fs.mkdir(path.join(root, 'hostels'), { recursive: true, mode: 0o700 });
        const base = await fs.realpath(root);
        const directory = await fs.realpath(path.join(root, 'hostels'));
        if (!directory.startsWith(base + path.sep)) throw new Error('Image storage directory is outside its configured root.');
        const name = `${crypto.randomUUID()}.png`;
        await fs.writeFile(path.join(directory, name), output, { flag: 'wx', mode: 0o600 });
        return { success: true, imageUrl: `${origin}/uploads/hostels/${name}`, imagePath: `uploads/hostels/${name}`, storageType: 'local-persistent' };
      } catch (error) { used.bytes -= output.length; used.files--; throw error; }
    }
  };
}
