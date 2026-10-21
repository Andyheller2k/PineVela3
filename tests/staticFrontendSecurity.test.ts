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
