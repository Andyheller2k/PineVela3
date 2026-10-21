/** Real built UI and native test identities. Only the moderation key is passed
 * to this isolated child; hosted DB, payment and mail credentials stay absent. */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { readLocalFixture, runLocalSupabaseVerification, saveLocalFixture } from './lib/local-supabase-harness.js';
if(process.argv[2]!=='--local-supabase-worker')process.env.OPENAI_API_KEY=dotenv.parse(fs.readFileSync('.env')).OPENAI_API_KEY;
await runLocalSupabaseVerification(async h=>{
 await h.assertOwned();const actors=readLocalFixture(h,'content-safety-browser.json');if(!actors)throw Error('Complete actual safety API verification first.');
 saveLocalFixture(h,'content-safety-runtime.json',{version:1,runId:h.meta.runId,root:h.meta.root,origin:h.origin,metadataPath:process.argv[3],actors});
 console.log(JSON.stringify({ready:true,origin:h.origin}));
 await new Promise<void>(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
},{staticFrontend:true,moderation:true,frontendDirectory:'/tmp/pinevela-content-safety-build'});
