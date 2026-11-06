import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {test} from 'node:test';
import sharp from 'sharp';
import {decodeImageUpload} from '../imageUploadSecurity.js';
import {cataloguePhoto} from '../supabase/cataloguePhotos.js';
import {optimizeImageDisplayUrl} from '../src/lib/imageOptimizer.js';

test('catalogue uploads preserve useful detail, remove metadata and greatly reduce photo storage',async()=>{
  const source=fs.readFileSync('src/assets/images/girls_1789053323516.jpg');
  const input=await sharp(source).resize(2400,1800,{fit:'cover'}).withMetadata({exif:{IFD0:{ImageDescription:'Private camera metadata'}}}).jpeg({quality:95}).toBuffer();
  const body={fileType:'image/jpeg',fileData:input.toString('base64')};
  const previous=await decodeImageUpload(body,2048),compressed=await decodeImageUpload(body,1600,'webp');
  const meta=await sharp(compressed).metadata();
  assert.equal(meta.format,'webp');assert.equal(meta.width,1600);assert.equal(meta.height,1200);
  assert(!meta.exif&&!meta.xmp&&!meta.icc);assert(compressed.length<previous.length*.3,'WebP uses less than 30% of the old PNG bytes');
  assert(compressed.length<800*1024);
  const reference=await sharp(input).resize(1600,1200).removeAlpha().raw().toBuffer();
  const decoded=await sharp(compressed).removeAlpha().raw().toBuffer();
  let squared=0;for(let i=0;i<reference.length;i++)squared+=(reference[i]-decoded[i])**2;
  const psnr=10*Math.log10(255**2/(squared/reference.length));
  assert(psnr>32,'The detail-size photo keeps a measured PSNR above 32 dB');
  console.log(JSON.stringify({fixture:'repository photograph',oldPngBytes:previous.length,newWebpBytes:compressed.length,savedPercent:Math.round((1-compressed.length/previous.length)*100),width:meta.width,height:meta.height,psnrDb:Math.round(psnr*10)/10}));
});

test('derived photos coalesce requests, cache immutable bytes and isolate sizes/digests',async()=>{
  const input=await sharp({create:{width:1600,height:1200,channels:3,background:'#1266aa'}}).png().toBuffer(),id=crypto.randomUUID();
  let downloads=0;const download=async()=>{downloads++;return input;};
  const [a,b]=await Promise.all([cataloguePhoto(id,'a'.repeat(64),'card',download),cataloguePhoto(id,'a'.repeat(64),'card',download)]);
  assert(a.equals(b));assert.equal(downloads,1);assert.equal((await sharp(a).metadata()).width,640);
  await cataloguePhoto(id,'a'.repeat(64),'card',download);assert.equal(downloads,1);
  const thumb=await cataloguePhoto(id,'a'.repeat(64),'thumb',download);assert.equal((await sharp(thumb).metadata()).width,192);assert.equal(downloads,2);
  await cataloguePhoto(id,'b'.repeat(64),'card',download);assert.equal(downloads,3);
  const other=crypto.randomUUID();await assert.rejects(cataloguePhoto(other,'c'.repeat(64),'card',async()=>{throw Error('Unavailable');}));
  await cataloguePhoto(other,'c'.repeat(64),'card',download);assert.equal(downloads,4,'A failed download is not retained as a cache hit');
});

test('display variants never alter saved image ownership references or unrelated URLs',()=>{
  const original='/api/media/'+crypto.randomUUID();
  assert.equal(optimizeImageDisplayUrl(original),original+'?size=card');
  assert.equal(optimizeImageDisplayUrl(original,192),original+'?size=thumb');
  assert.equal(optimizeImageDisplayUrl('/icons/pinevela-192.png'),'/icons/pinevela-192.png');
  assert.equal(optimizeImageDisplayUrl('https://not-images.unsplash.com/secret'),'https://not-images.unsplash.com/secret');
});
