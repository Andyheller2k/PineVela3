/** Actual pg_dump of a disposable local restored database, encrypted in the
 * existing recovery format. No provider, Auth or database responses are mocked. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import type {PoolConfig} from 'pg';
import {readPrivateRecoveryFile,privateRecoveryDirectory} from '../../supabase/storageBackup.js';
export function nativeRecoveryCheckpoint(config:PoolConfig,projectRef:string) {
  if(!String(config.host).startsWith('/tmp/pv-orders-')||config.user!=='pv_restore'||config.ssl!==false)throw new Error('Disposable native PostgreSQL required.');
  const root=path.resolve('.security/migration-reset');privateRecoveryDirectory(root);
  const env={...process.env,PGHOST:String(config.host),PGPORT:String(config.port),PGDATABASE:String(config.database),PGUSER:String(config.user),PGPASSWORD:'',PGSSLMODE:'disable'};
  const dump=spawnSync('/usr/lib/postgresql/18/bin/pg_dump',['--format=custom','--no-owner','--schema=auth','--schema=public','--schema=private','--schema=storage'],{env,timeout:60000,maxBuffer:64*1024*1024});
  if(dump.status!==0||!dump.stdout.subarray(0,5).equals(Buffer.from('PGDMP')))throw new Error('Native checkpoint dump failed.');
  const listing=spawnSync('/usr/lib/postgresql/18/bin/pg_restore',['--list'],{input:dump.stdout,timeout:30000,maxBuffer:8*1024*1024});
  if(listing.status!==0||!listing.stdout.includes('TABLE DATA'))throw new Error('Native checkpoint listing failed.');
  const id=crypto.randomUUID(),key=crypto.randomBytes(32),nonce=crypto.randomBytes(12),sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
  const files:string[]=[];
  const save=(suffix:string,b:Buffer)=>{const file=path.join(root,id+suffix),fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);files.push(file);
    try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return file;};
  try{
    const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
    const encrypted=Buffer.concat([Buffer.from('PVPG1'),nonce,cipher.update(dump.stdout),cipher.final(),cipher.getAuthTag()]);
    const archive=save('.pvpg',encrypted),keyFile=save('.key',key);
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,nonce);decipher.setAuthTag(encrypted.subarray(-16));
    const roundtrip=Buffer.concat([decipher.update(encrypted.subarray(17,-16)),decipher.final()]);
    try{if(!roundtrip.equals(dump.stdout))throw new Error('Native checkpoint round-trip failed.');}finally{roundtrip.fill(0);}
    const pin=readPrivateRecoveryFile(process.env.MARKET_ORDER_PIN_KEY_FILE!,32);
    if(pin.length!==32)throw new Error('Actual private PIN key is required.');
    let serverSecrets;
    try{const secretNonce=crypto.randomBytes(12),seal=crypto.createCipheriv('aes-256-gcm',key,secretNonce);seal.setAAD(Buffer.from(`pinevela:market_order_pin:${id}`));
      const encryptedSecret=Buffer.concat([Buffer.from('PVSK1'),secretNonce,seal.update(pin),seal.final(),seal.getAuthTag()]);
      const file=save('.pvsecrets',encryptedSecret),open=crypto.createDecipheriv('aes-256-gcm',key,secretNonce);
      open.setAAD(Buffer.from(`pinevela:market_order_pin:${id}`));open.setAuthTag(encryptedSecret.subarray(-16));
      const recovered=Buffer.concat([open.update(encryptedSecret.subarray(17,-16)),open.final()]);
      try{if(!recovered.equals(pin))throw new Error('Actual private PIN archive round-trip failed.');}finally{recovered.fill(0);}
      serverSecrets={file,sha256:sha(pin),encrypted:true,roundTripVerified:true,purpose:'market_order_pin'};
    }finally{pin.fill(0);}
    save('.json',Buffer.from(JSON.stringify({createdAt:new Date().toISOString(),projectRef,archive,keyFile,sourceSchemas:['auth','public','private','storage'],
      encrypted:true,dumpSha256:sha(dump.stdout),bytes:dump.stdout.length,accessControlIncluded:true,serverSecrets,archiveListingVerified:true,decryptedRoundTripVerified:true,
      note:'Isolated native domain verification checkpoint only. Never use for a production reset.'})));
    const rehearsal=spawnSync(process.execPath,['--import','tsx','scripts/rehearse-supabase-backup.ts',id],{env:process.env,timeout:60000,maxBuffer:4*1024*1024});
    if(rehearsal.status!==0)throw new Error('Actual native checkpoint restore rehearsal failed.');
    files.push(path.join(root,id+'.restore.json'));return {id,files};
  }catch(error){for(const file of files)fs.rmSync(file,{force:true});throw error;}
  finally{key.fill(0);dump.stdout.fill(0);}
}
