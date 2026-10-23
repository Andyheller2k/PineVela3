import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';

test('actual install manifest launches sign-in with branded, opaque home screen icons',async()=>{
  const manifest=JSON.parse(await fs.readFile('public/manifest.webmanifest','utf8'));
  assert.equal(manifest.name,'PineVela');assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/#/login');
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
  assert.equal(manifest.background_color,'#001d3d');assert.equal(manifest.theme_color,'#001d3d');
  for(const icon of manifest.icons){
    assert.match(icon.src,/^\/icons\/pinevela-(?:192|512|maskable-512)\.png$/);
    const metadata=await sharp('public'+icon.src).metadata();
    assert.equal(icon.sizes,metadata.width+'x'+metadata.height);assert.equal(metadata.hasAlpha,false);assert.equal(metadata.format,'png');
  }
  assert(manifest.icons.some((icon:{purpose:string})=>icon.purpose==='maskable'));
  const apple=await sharp('public/icons/apple-touch-icon.png').metadata();assert.equal(apple.width,180);assert.equal(apple.height,180);
});

test('actual worker never intercepts APIs, media or subresources and never persists responses',async()=>{
  const handlers=new Map<string,(event:any)=>void>();
  let online=true,fetchCount=0,waiting:Promise<unknown>|undefined;
  const context={
    URL,Response,
    self:{location:{origin:'https://pinevela.app'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name:string,handler:(event:any)=>void)=>handlers.set(name,handler)},
    fetch:async(request:any,options:any)=>{fetchCount++;assert.equal(options.cache,'no-store');if(!online)throw new Error('offline');return new Response('PineVela application document',{headers:{'Cache-Control':'no-cache'}});},
  };
  // Deliberately provide no Cache API, IndexedDB, storage or messaging primitives.
  // Executing the actual worker exercises its privacy boundary without user data.
  vm.runInNewContext(await fs.readFile('public/sw.js','utf8'),context);
  handlers.get('install')!({});handlers.get('activate')!({waitUntil:(promise:Promise<unknown>)=>waiting=promise});await waiting;
  for(const [url,mode] of [
    ['https://pinevela.app/api/auth/session','navigate'],['https://pinevela.app/api/media/private','navigate'],
    ['https://pinevela.app/api/notifications','cors'],['https://pinevela.app/assets/app.js','cors'],
    ['https://pinevela.app/?query=public','cors'],['https://elsewhere.invalid/','navigate'],
  ]){
    let intercepted=false;handlers.get('fetch')!({request:{url,mode},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false,url);
  }
  assert.equal(fetchCount,0);
  let delivered:Promise<Response>|undefined;
  const navigation={request:{url:'https://pinevela.app/',mode:'navigate'},respondWith:(response:Promise<Response>)=>delivered=response};
  handlers.get('fetch')!(navigation);assert.equal((await delivered!).status,200);assert.equal(fetchCount,1);
  online=false;delivered=undefined;handlers.get('fetch')!(navigation);
  const offline=await delivered!;assert.equal(offline.status,503);assert.equal(offline.headers.get('Cache-Control'),'no-store');
  assert.match(offline.headers.get('Content-Security-Policy')||'',/default-src 'none'/);
  const html=await offline.text();assert.match(html,/You’re offline/);assert.doesNotMatch(html,/PineVela application document/);
  assert.equal(fetchCount,2);
});
