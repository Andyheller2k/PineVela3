import sharp from 'sharp';
import { WorkPool } from './resourceSecurity.js';

export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_IMAGE_DIMENSION = 16_384;
const MIME_FORMATS: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const imageWorkers = new WorkPool(2, 4);

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
export async function normalizeRasterImage(bytes: Buffer, maxDimension?: number): Promise<Buffer> {
  return imageWorkers.run(() => decodeRasterPixels(bytes, maxDimension));
}
async function decodeRasterPixels(bytes: Buffer, maxDimension?: number): Promise<Buffer> {
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
    // Sharp strips original metadata. Only callers requesting a size cap resize the decoded pixels.
    const pipeline = image.rotate();
    if (maxDimension) pipeline.resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true });
    const output = await pipeline.png().timeout({ seconds: 5 }).toBuffer();
    if (output.length > MAX_IMAGE_OUTPUT_BYTES) throw new ImageUploadError(413, 'Decoded image exceeds the supported size.');
    return output;
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError(400, 'Image could not be fully decoded. Use a valid JPEG, PNG or WebP photograph.');
  }
}

export async function decodeImageUpload(body: any, maxDimension?: number): Promise<Buffer> {
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
  return normalizeRasterImage(bytes, maxDimension);
}
