import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createImageStorage, decodeImageUpload, ImageUploadError, MAX_IMAGE_INPUT_BYTES } from '../imageUploadSecurity.js';

const pixels = () => sharp({ create: { width: 9, height: 7, channels: 4, background: '#1266aacc' } });

test('S19: raster pixels are re-encoded at full resolution, with metadata and appended content removed', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const input = await pixels().withMetadata({ exif: { IFD0: { ImageDescription: 'Original upload metadata' } } }).toFormat(format).toBuffer();
    const marker = Buffer.from('<html>benign appended document marker</html>');
    const output = await decodeImageUpload({ fileName: '../../document.html', fileType: `image/${format}`, fileData: `data:image/${format};base64,${Buffer.concat([input, marker]).toString('base64')}` });
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 9); assert.equal(metadata.height, 7);
    assert(!metadata.exif && !metadata.xmp && !metadata.icc);
    assert(!output.includes(marker)); assert(!output.equals(input));
  }
});

test('S19: MIME claims, SVG/HTML, malformed base64, corrupt rasters, animation and excessive sizes cannot bypass decoding', async () => {
  const png = await pixels().png().toBuffer();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>benign</text></svg>').toString('base64');
  const invalid = [
    {}, { fileData: png.toString('base64') },
    { fileType: 'image/svg+xml', fileData: svg },
    { fileType: 'image/png', fileData: svg },
    { fileType: 'image/png', fileData: Buffer.from('<html>benign</html>').toString('base64') },
    { fileType: 'image/png', fileData: png.subarray(0, 8).toString('base64') },
    { fileType: 'image/jpeg', fileData: png.toString('base64') },
    { fileType: 'image/jpeg', fileData: `data:image/png;base64,${png.toString('base64')}` },
    { fileType: 'image/png', fileData: 'AAAA!!!!!' },
    { fileType: 'image/png', fileData: { value: png.toString('base64') } },
    { fileType: 'image/png', fileData: Buffer.alloc(MAX_IMAGE_INPUT_BYTES + 1).toString('base64') }
  ];
  for (const body of invalid) await assert.rejects(decodeImageUpload(body), ImageUploadError);
  const large = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: 'white' } }).png().toBuffer();
  await assert.rejects(decodeImageUpload({ fileType: 'image/png', fileData: large.toString('base64') }), ImageUploadError);
  const animation = await sharp(Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]), { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0 }).toBuffer();
  assert.equal((await sharp(animation, { animated: true }).metadata()).pages, 2);
  await assert.rejects(decodeImageUpload({ fileType: 'image/webp', fileData: animation.toString('base64') }), ImageUploadError);
});

test('S19: media configuration must use a distinct plain origin', () => {
  assert.throws(() => createImageStorage({ mediaOrigin: 'https://app.example.test', publicOrigin: 'https://app.example.test' }));
  for (const origin of ['file:///tmp', 'https://media.example.test/path', 'https://user:password@media.example.test', 'https://media.example.test?x=1']) {
    assert.throws(() => createImageStorage({ mediaOrigin: origin, publicOrigin: 'https://app.example.test' }));
  }
});
