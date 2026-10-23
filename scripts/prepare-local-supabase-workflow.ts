/** Install immutable application migrations only in a newly owned local stack.
 * Never loads .env, contacts a hosted service, or seeds product accounts. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Pool} from 'pg';

const [statusFile]=process.argv.slice(2);
if(process.argv.length!==3||!path.isAbsolute(statusFile||''))throw Error('Pass the private local CLI status JSON path.');
const statusStat=fs.lstatSync(statusFile);
if(!statusStat.isFile()||statusStat.isSymbolicLink()||statusStat.mode&0o077)throw Error('Private local status file required.');
const status=JSON.parse(fs.readFileSync(statusFile,'utf8'));
function endpoint(value:unknown,protocol:string){
 const url=new URL(String(value));
 if(url.protocol!==protocol||url.hostname!=='127.0.0.1'||!url.port||url.search||url.hash)throw Error('Only explicit loopback endpoints are accepted.');
 return url;
}
const api=endpoint(status.API_URL,'http:'),database=endpoint(status.DB_URL,'postgresql:'),mail=endpoint(status.MAILPIT_URL,'http:');
if(!database.username||!database.password||!database.pathname.slice(1)||!status.ANON_KEY||!status.SERVICE_ROLE_KEY)throw Error('Complete actual local stack metadata required.');
const runId=crypto.randomUUID(),root=fs.mkdtempSync('/tmp/pinevela-workflow-');fs.chmodSync(root,0o700);
const metadata={version:1,runId,root,apiUrl:api.origin,databaseUrl:database.href,mailUrl:mail.origin,
 anonKey:status.ANON_KEY,serviceRoleKey:status.SERVICE_ROLE_KEY,databaseOwned:true};
const pool=new Pool({host:'127.0.0.1',port:Number(database.port),user:decodeURIComponent(database.username),
 password:decodeURIComponent(database.password),database:decodeURIComponent(database.pathname.slice(1)),ssl:false,
 max:1,connectionTimeoutMillis:10000,statement_timeout:30000,query_timeout:60000});
let stage='local empty database verification';
try{
 const client=await pool.connect();
 try{
  const native=(await client.query(`select host(inet_server_addr()) as host,inet_server_port() as port,
   (select count(*)::int from auth.users) as users,
   (select count(*)::int from pg_tables where schemaname='public') as public_tables,
   to_regclass('private.schema_migrations') is not null as ledger`)).rows[0];
  // The native CLI's loopback PostgreSQL gateway uses a local Unix socket
  // upstream, for which PostgreSQL reports both inet fields as null.
  const localBackend=native.host==='127.0.0.1'||native.host===null&&native.port===null;
  if(!localBackend||native.users!==0||native.public_tables!==0||native.ledger)throw Error('A fresh empty loopback Supabase project is required.');
  stage='immutable local application migrations';
  const directory=path.resolve('supabase/migrations'),files=fs.readdirSync(directory).filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort();
  if(files.length!==82||!files.at(-1)?.startsWith('20261022214514_'))throw Error('Review changed application migration inventory before preparation.');
  await client.query('begin');
  try{
   await client.query("set local lock_timeout='5s';set local statement_timeout='30s';create schema if not exists private;create table private.schema_migrations(version text primary key,digest text not null,applied_at timestamptz not null default now());alter table private.schema_migrations enable row level security;revoke all on private.schema_migrations from public,anon,authenticated;");
   for(const file of files){
    const sql=fs.readFileSync(path.join(directory,file),'utf8');
    await client.query(sql);await client.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);
   }
   await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}
  const target=path.join(root,'metadata.json');
  fs.writeFileSync(target,JSON.stringify(metadata,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.writeFileSync('.security/local-workflow/active-run.json',JSON.stringify({runId,root,metadataPath:target,migrations:files.length,createdAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({prepared:true,metadataPath:target,migrations:files.length,actualDatabasePort:native.port,connectionPort:Number(database.port),cloudWrites:0,accountsCreated:0}));
 }finally{client.release();}
}catch(error){
 fs.writeFileSync(path.join(root,'preparation-failure.log'),String((error as any)?.stack||error),{mode:0o600});
 console.error(JSON.stringify({prepared:false,stage,diagnosticsRoot:root,code:(error as any)?.code||'local_preparation_failed',cloudWrites:0}));process.exitCode=1;
}finally{await pool.end();}
