/** Read-only security advisors; database credentials stay in the child environment,
 * never command arguments or output. TLS certificate verification remains enabled. */
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import dotenv from 'dotenv';import {databaseConfig} from '../supabase/db.js';
dotenv.config({quiet:true});const config=databaseConfig();
const url=new URL('postgresql://localhost');url.hostname=String(config.host);url.port=String(config.port);url.username=String(config.user);url.pathname='/'+String(config.database);url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert',path.resolve(process.env.SUPABASE_DB_CA_FILE!));
const cli=process.env.SUPABASE_CLI_BINARY||'/tmp/pv-supabase-cli-2.120.0/supabase';
const reportFile=process.argv[2]||'view-exposure-live-advisors.json';
if(process.argv.length>3||!/^[-a-z0-9]+\.json$/.test(reportFile))throw Error('Pass an optional report basename only.');
const result=spawnSync(cli,['db','advisors','--db-url',url.toString(),'--type','security','--output-format','json'],{env:{...process.env,PGPASSWORD:String(config.password)},timeout:60000,maxBuffer:4*1024*1024});
fs.writeFileSync(path.join('.security/migration-reset',reportFile),result.stdout.length?result.stdout:result.stderr,{mode:0o600});
if(result.status!==0){console.error(JSON.stringify({passed:false,exit:result.status,privateReportSaved:true,credentialsPrinted:false}));process.exitCode=1;}else{
 const report=JSON.parse(result.stdout.toString()),findings=report.results||report.result||report.data||report;
 if(!Array.isArray(findings))throw Error('Unexpected advisor report format.');
 console.log(JSON.stringify({passed:findings.length===0,liveSecurityAdvisors:true,findings:findings.length,types:[...new Set(findings.map((f:any)=>f.name))],readOnly:true,tlsVerified:true,credentialsPrinted:false}));if(findings.length)process.exitCode=1;
}
