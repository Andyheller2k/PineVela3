/** A real encrypted checkpoint restored locally. No TCP listener or cloud writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import type {PoolConfig} from 'pg';

function privateBytes(file:string){const stat=fs.lstatSync(file);if(!stat.isFile() || stat.mode&0o077)throw new Error('Private regular backup file required.');const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{return fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
function decryptedCheckpoint(id:string) {
  if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('Pass a backup UUID.');
  const directory=path.resolve('.security/migration-reset'),metadata=JSON.parse(privateBytes(path.join(directory,id+'.json')).toString());
  if(!metadata.accessControlIncluded || !metadata.sourceSchemas?.includes('private'))throw new Error('Full privilege-aware checkpoint required.');
  const saved=privateBytes(path.join(directory,id+'.pvpg')),key=privateBytes(path.join(directory,id+'.key'));
  if(key.length!==32 || !saved.subarray(0,5).equals(Buffer.from('PVPG1')))throw new Error('Invalid encrypted archive.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,saved.subarray(5,17));decipher.setAuthTag(saved.subarray(-16));
  const decrypted=Buffer.concat([decipher.update(saved.subarray(17,-16)),decipher.final()]);key.fill(0);
  if(crypto.createHash('sha256').update(decrypted).digest('hex')!==metadata.dumpSha256)throw new Error('Archive integrity failed.');
  return decrypted;
}
export async function withIsolatedBackup<T>(id:string,work:(config:PoolConfig)=>Promise<T>,options:{applicationCheckpoint?:string}={}):Promise<T>{
  const decrypted=decryptedCheckpoint(id),directory=path.resolve('.security/migration-reset');
  const root=path.join('/tmp','pv-orders-'+crypto.randomUUID()),cluster=path.join(root,'postgres');fs.mkdirSync(root,{mode:0o700});
  const env={...process.env,PGHOST:root,PGPORT:'6543',PGDATABASE:'postgres',PGUSER:'pv_restore',PGPASSWORD:'',PGSSLMODE:'disable'};
  function command(name:string,args:string[],input?:Buffer|string){const result=spawnSync(path.join('/usr/lib/postgresql/18/bin',name),args,{input,env,timeout:60000,maxBuffer:64*1024*1024});
    if(result.status!==0){fs.writeFileSync(path.join(directory,id+'.order-test-failure.log'),result.stderr || Buffer.from('Local PostgreSQL command failed.'),{mode:0o600});throw new Error('Isolated PostgreSQL '+name+' failed; diagnostics saved privately.');}return result.stdout;}
  let started=false;
  try{
    command('initdb',['-D',cluster,'--username=pv_restore','--auth-local=trust','--auth-host=reject','--no-instructions']);
    fs.appendFileSync(path.join(cluster,'postgresql.conf'),"\nlisten_addresses = ''\nunix_socket_directories = '"+root+"'\nport = 6543\n",{mode:0o600});
    command('pg_ctl',['-D',cluster,'-l',path.join(root,'postgres.log'),'-w','start']);started=true;
    command('psql',['-X','-v','ON_ERROR_STOP=1'],`create schema extensions;
      create extension if not exists "uuid-ossp" with schema extensions;
      create extension if not exists pgcrypto with schema extensions;
      create extension if not exists pg_trgm with schema extensions;
      do $$ declare name text; begin foreach name in array array['anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin','postgres','supabase_admin','pinevela_backend','dashboard_user'] loop
        if not exists(select 1 from pg_roles where rolname=name) then execute format('create role %I nologin',name); end if;
      end loop; end $$; grant authenticated to pinevela_backend; grant pinevela_backend to postgres;`);
    command('pg_restore',['--dbname=postgres','--clean','--if-exists','--no-owner','--single-transaction'],decrypted);decrypted.fill(0);
    if(options.applicationCheckpoint) {
      // Only the disposable Unix-socket cluster is rebased. Keep the newest real
      // provider identities and sessions; use the immutable pre-enrollment app
      // schema to seed private domain credentials before its protocol guards.
      const application=decryptedCheckpoint(options.applicationCheckpoint);
      const authFingerprint=()=>command('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],`select md5(jsonb_build_object(
        'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
        'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
        'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text);`).toString().trim();
      const before=authFingerprint();
      try {
        command('psql',['-X','-v','ON_ERROR_STOP=1'],'drop schema private cascade; drop schema public cascade; create schema public; create schema private; revoke all on schema private from public;');
        command('pg_restore',['--dbname=postgres','--no-owner','--single-transaction','--schema=public','--schema=private'],application);
        // Schema-filtered pg_restore omits schema-level ACL entries. Restore
        // those exact archived grants as well, rather than inventing privileges.
        const schemaAcl=command('pg_restore',['--list'],application).toString().split('\n')
          .filter(line=>/\bACL - SCHEMA (public|private)\b/.test(line)).join('\n')+'\n';
        if(!schemaAcl.trim())throw new Error('Archived application schema privileges required.');
        const aclFile=path.join(root,'schema-acl.list');fs.writeFileSync(aclFile,schemaAcl,{mode:0o600});
        command('pg_restore',['--dbname=postgres','--no-owner','--single-transaction','--use-list='+aclFile],application);
        const storagePolicies=command('pg_restore',['--list'],application).toString().split('\n')
          .filter(line=>/\bPOLICY storage objects pinevela_owned_object_read\b/.test(line)).join('\n')+'\n';
        if(!storagePolicies.trim())throw new Error('Archived owned-object policy required.');
        const policyFile=path.join(root,'storage-policy.list');fs.writeFileSync(policyFile,storagePolicies,{mode:0o600});
        command('pg_restore',['--dbname=postgres','--no-owner','--single-transaction','--use-list='+policyFile],application);
        command('psql',['-X','-v','ON_ERROR_STOP=1'],`create trigger pinevela_auth_user_created after insert on auth.users
          for each row execute function private.create_primary_profile();`);
        if(before!==authFingerprint())throw new Error('Rebased fixture changed genuine Auth records.');
      }finally{application.fill(0);}
    }
    return await work({host:root,port:6543,database:'postgres',user:'pv_restore',password:'',ssl:false,max:8,connectionTimeoutMillis:10000,statement_timeout:15000,query_timeout:30000});
  }finally{
    try{if(started)command('pg_ctl',['-D',cluster,'-m','immediate','-w','stop']);}finally{decrypted.fill(0);fs.rmSync(root,{recursive:true,force:true});}
  }
}
