/** Current CLI advisor, keeping the database password out of argv and output. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import dotenv from 'dotenv';
dotenv.config({quiet:true});
const directory=path.resolve('.security/remediation-2026-10-20'),cli=process.env.PINEVELA_SUPABASE_CLI;
assert(cli,'Pass the installed Supabase CLI executable.');
const database=new URL(process.env.DATABASE_URL||process.env.SUPABASE_DB_URL||'');
const password=decodeURIComponent(database.password);database.password='';
database.searchParams.set('sslmode','verify-full');database.searchParams.set('sslrootcert',path.resolve(process.env.SUPABASE_DB_CA_FILE||''));
try{
 const result=await promisify(execFile)(cli,['db','advisors','--db-url',database.href,'--type','security','--output','json'],{
  env:{...process.env,PGPASSWORD:password,SUPABASE_DB_PASSWORD:password,SUPABASE_HOME:'/tmp/pinevela-remediation-cli',SUPABASE_TELEMETRY_DISABLED:'true'},timeout:60000,maxBuffer:4*1024*1024});
 const output=result.stdout+'\n'+result.stderr;
 assert(!output.includes(password),'Advisor output must never contain the credential.');
 fs.writeFileSync(path.join(directory,'hosted-security-advisors.log'),output,{mode:0o600});
 console.log(JSON.stringify({completed:true,readOnly:true,noIssuesReported:/No issues found/i.test(output)}));
}catch(error:any){console.error(JSON.stringify({completed:false,code:typeof error.code==='string'?error.code:'advisor_failed'}));process.exitCode=1;}
