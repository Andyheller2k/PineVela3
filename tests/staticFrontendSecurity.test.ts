import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {once} from 'node:events';
import path from 'node:path';
import fs from 'node:fs/promises';
import {installStaticFrontend} from '../supabase/staticFrontend.js';
test('actual static documents and SPA fallback deliver enforced framing protection',async()=>{
  const directory=await fs.mkdtemp('/tmp/pinevela-static-security-');
  // Use the project's actual document, without serving the repository itself
  // or requiring private audit artifacts in a clean checkout.
  await fs.copyFile(path.resolve('index.html'),path.join(directory,'index.html'));
  const app=express();installStaticFrontend(app,directory);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try{for(const route of ['/','/index.html','/login','/user/dashboard','/faq','/help']){
    const response=await fetch('http://127.0.0.1:'+(server.address() as any).port+route);
    assert.equal(response.status,200);assert.equal(response.headers.get('Content-Security-Policy'),"frame-ancestors 'none'");assert.equal(response.headers.get('X-Frame-Options'),'DENY');
    assert.equal(response.headers.get('Cache-Control'),'no-cache');assert.match(await response.text(),/id="root"/);
  }}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(directory,{recursive:true,force:true});}
});

test('install resources deliver exact public files with correct types and uncached worker updates',async()=>{
  const directory=await fs.mkdtemp('/tmp/pinevela-install-security-');
  await fs.copyFile(path.resolve('index.html'),path.join(directory,'index.html'));
  await fs.mkdir(path.join(directory,'icons'));
  const resources=[
    ['manifest.webmanifest','application/manifest+json'],['sw.js','application/javascript'],
    ['icons/pinevela-192.png','image/png'],['icons/pinevela-512.png','image/png'],
    ['icons/pinevela-maskable-512.png','image/png'],['icons/apple-touch-icon.png','image/png'],
  ];
  for(const [file] of resources) await fs.copyFile(path.resolve('public',file),path.join(directory,file));
  const app=express();installStaticFrontend(app,directory);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const origin='http://127.0.0.1:'+(server.address() as any).port;
    for(const [file,type] of resources){
      const response=await fetch(origin+'/'+file);
      assert.equal(response.status,200);assert.match(response.headers.get('Content-Type')||'',new RegExp('^'+type.replace('+','\\+')));
      assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
      assert.equal(response.headers.get('X-Frame-Options'),'DENY');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),await fs.readFile(path.resolve('public',file)));
      if(file==='sw.js')assert.equal(response.headers.get('Service-Worker-Allowed'),'/');
    }
    await fs.unlink(path.join(directory,'sw.js'));
    const missing=await fetch(origin+'/sw.js');assert.equal(missing.status,404);assert.doesNotMatch(await missing.text(),/id="root"/);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(directory,{recursive:true,force:true});}
});
