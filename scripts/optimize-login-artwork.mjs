import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=path.join(root,'assets/marketing-artwork');
const photo=path.join(root,'assets/login-market-new.png');
const logo=path.join(directory,'pinevela-logo-source.png');
async function encode(source,width){
  const transform=()=>width?sharp(source).resize({width}):sharp(source);
  const expected=await transform().ensureAlpha().raw().toBuffer();
  const encoded=await transform().webp({lossless:true,effort:6,exact:true}).toBuffer();
  const decoded=await sharp(encoded).ensureAlpha().raw().toBuffer();
  assert(expected.equals(decoded),'Lossless output must preserve every channel, including alpha.');
  return encoded;
}
const full=await encode(photo),mobile=await encode(photo,768),mark=await encode(logo);
const svgPath=path.join(root,'public/store-covers/pinevela-logo.svg');
const svg=await fs.readFile(svgPath,'utf8');
assert.equal([...svg.matchAll(/data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+/g)].length,1);
const optimizedSvg=svg.replace(/data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+/,'data:image/webp;base64,'+mark.toString('base64'));
await fs.writeFile(path.join(directory,'login-market.webp'),full);
await fs.writeFile(path.join(directory,'login-market-mobile.webp'),mobile);
await fs.writeFile(svgPath,optimizedSvg);
console.log(JSON.stringify({fullBytes:full.length,mobileBytes:mobile.length,logoSvgBytes:Buffer.byteLength(optimizedSvg),pixelAndAlphaRoundTripsMatch:true}));
