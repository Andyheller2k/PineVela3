/** Offline encrypted recovery of existing legacy persistence only. Never loads
 * the legacy runtime, edits source data, imports identities or contacts a cloud. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({quiet:true});
const workspace=fs.realpathSync(process.cwd()),recoveryRoot=path.join(workspace,'.security','migration-reset');
const envelopeMagic=Buffer.from('PVLEG1'),payloadMagic=Buffer.from('PVLAR1');
const maximumFiles=25000,maximumBytes=6*1024*1024*1024,maximumFileBytes=512*1024*1024,maximumManifestBytes=16*1024*1024;
const sha=(value:Buffer|string)=>crypto.createHash('sha256').update(value).digest('hex');
const canonical=(value:any):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']'
 :value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const inside=(root:string,candidate:string)=>candidate.startsWith(root+path.sep);
const fdPath=(fd:number,name='')=>'/proc/self/fd/'+fd+(name?'/'+name:'');
function assertDirectoryChain(directory:string,privateMode=false){
 if(directory!==workspace&&!inside(workspace,directory))throw Error('Recovery paths must stay inside the current workspace.');
 let current=workspace;
 for(const component of path.relative(workspace,directory).split(path.sep).filter(Boolean)){
  current=path.join(current,component);const stat=fs.lstatSync(current);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Real directories without symlinks are required.');
  if(privateMode&&(stat.mode&0o077)!==0)throw Error('Recovery directories must already have private permissions.');
 }
}
function privateFile(file:string,maximum:number){
 assertDirectoryChain(path.dirname(file),true);
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077)!==0||stat.size>maximum)throw Error('A bounded private regular recovery file is required.');
  return fs.readFileSync(fd);
 }finally{fs.closeSync(fd);}
}
function writePrivate(file:string,bytes:Buffer|string){
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function syncDirectory(directory:string){const fd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
type Source={label:'data'|'uploads';path:string;fd:number|null;exists:boolean};
type Entry={path:string;bytes:number;sha256:string;mode:number;mtimeMs:number;dev:number;ino:number};
type Manifest={version:1;checkpoint:string;createdAt:string;roots:{label:string;path:string;exists:boolean}[];directories:string[];files:Entry[];bytes:number};
function source(label:'data'|'uploads',configured:string|undefined):Source{
 const resolved=path.resolve(workspace,configured||label);
 if(!inside(workspace,resolved)||['.git','.security','node_modules','src','scripts','supabase'].some(name=>resolved===path.join(workspace,name)||inside(path.join(workspace,name),resolved)))
  throw Error('Configured legacy roots must be dedicated data/upload paths inside this workspace.');
 assertDirectoryChain(path.dirname(resolved));
 try{assertDirectoryChain(resolved);const fd=fs.openSync(resolved,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);return{label,path:resolved,fd,exists:true};}
 catch(error:any){if(error.code==='ENOENT')return{label,path:resolved,fd:null,exists:false};throw error;}
}
function openSourceFile(root:Source,relative:string){
 if(root.fd===null)throw Error('Source root no longer exists.');
 const parts=relative.split('/');let parent=root.fd;const descriptors:number[]=[];
 try{
  for(const component of parts.slice(0,-1)){
   const fd=fs.openSync(fdPath(parent,component),fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);descriptors.push(fd);parent=fd;
  }
  return fs.openSync(fdPath(parent,parts.at(-1)!),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 }finally{for(const fd of descriptors.reverse())fs.closeSync(fd);}
}
function readFile(fd:number,consume:(bytes:Buffer)=>void){
 const buffer=Buffer.alloc(128*1024);let position=0;
 try{for(;;){const bytes=fs.readSync(fd,buffer,0,buffer.length,position);if(!bytes)break;consume(buffer.subarray(0,bytes));position+=bytes;}}
 finally{buffer.fill(0);}
 return position;
}
function inventory(roots:Source[]){
 const files:Entry[]=[],directories:string[]=[];let bytes=0;
 function walk(root:Source,fd:number,relative:string){
  const before=fs.fstatSync(fd);
  for(const name of fs.readdirSync(fdPath(fd)).sort()){
   if(name==='.'||name==='..'||/[\u0000-\u001f\u007f\\]/.test(name))throw Error('Unsupported legacy file name.');
   const child=fs.lstatSync(fdPath(fd,name));if(child.isSymbolicLink())throw Error('Legacy symlinks cannot enter recovery archives.');
   const item=relative?relative+'/'+name:name,archivePath=root.label+'/'+item;
   if(child.isDirectory()){
    directories.push(archivePath);const directory=fs.openSync(fdPath(fd,name),fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
    try{walk(root,directory,item);}finally{fs.closeSync(directory);}
   }else{
    const file=openSourceFile(root,item);
    try{const start=fs.fstatSync(file);
     if(!start.isFile()||start.nlink!==1||start.size>maximumFileBytes||files.length>=maximumFiles||bytes+start.size>maximumBytes)
      throw Error('Legacy recovery supports only bounded standalone regular files.');
     const hash=crypto.createHash('sha256'),size=readFile(file,chunk=>hash.update(chunk)),end=fs.fstatSync(file);
     if(size!==start.size||end.size!==start.size||end.mtimeMs!==start.mtimeMs||end.ctimeMs!==start.ctimeMs)throw Error('A legacy file changed during recovery inventory.');
     files.push({path:archivePath,bytes:size,sha256:hash.digest('hex'),mode:start.mode&0o777,mtimeMs:start.mtimeMs,dev:start.dev,ino:start.ino});bytes+=size;
    }finally{fs.closeSync(file);}
   }
  }
  const after=fs.fstatSync(fd);if(before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('A legacy directory changed during inventory.');
 }
 for(const root of roots){
  if(!root.exists){if(fs.existsSync(root.path))throw Error('A previously absent source root was created.');continue;}
  const current=fs.lstatSync(root.path),opened=fs.fstatSync(root.fd!);
  if(current.isSymbolicLink()||current.dev!==opened.dev||current.ino!==opened.ino)throw Error('A legacy root was replaced during recovery preparation.');
  directories.push(root.label);walk(root,root.fd!,'');
 }
 return{files:files.sort((a,b)=>a.path.localeCompare(b.path)),directories:directories.sort(),bytes};
}
function validateManifest(value:any,checkpoint:string):asserts value is Manifest{
 if(value?.version!==1||value.checkpoint!==checkpoint||!Array.isArray(value.files)||value.files.length>maximumFiles
  ||!Array.isArray(value.directories)||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>maximumBytes)throw Error('Invalid bounded legacy recovery manifest.');
 const seen=new Set<string>();let total=0;
 const safe=(entry:string)=>typeof entry==='string'&&/^(data|uploads)(?:\/[^/]+)*$/.test(entry)&&!/[\u0000-\u001f\u007f\\]/.test(entry)
  &&entry.split('/').every(part=>part!=='.'&&part!=='..')&&path.posix.normalize(entry)===entry;
 for(const directory of value.directories)if(!safe(directory)||seen.has(directory))throw Error('Invalid recovery directory listing.');else seen.add(directory);
 for(const file of value.files){
  if(!safe(file.path)||seen.has(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>maximumFileBytes
   ||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isInteger(file.mode)||file.mode<0||file.mode>0o777)throw Error('Invalid recovery file listing.');
  seen.add(file.path);total+=file.bytes;
 }
 if(total!==value.bytes)throw Error('Recovery manifest size does not match its files.');
}
/** Parses and reconstructs every archived file hash without writing plaintext
 * records to disk or importing them into a test database. */
async function verifyArchive(directory:string,checkpoint:string,key:Buffer,expected?:Manifest,restoreDirectory?:string){
 assertDirectoryChain(directory,true);
 const archive=path.join(directory,'archive.pvlegacy'),fd=fs.openSync(archive,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let restoreFd:number|undefined;
 try{
  const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077)!==0||stat.size<34||stat.size>maximumBytes+maximumManifestBytes+1024)throw Error('Invalid private encrypted archive.');
  const header=Buffer.alloc(18),tag=Buffer.alloc(16);fs.readSync(fd,header,0,18,0);fs.readSync(fd,tag,0,16,stat.size-16);
  if(!header.subarray(0,6).equals(envelopeMagic))throw Error('Invalid legacy archive envelope.');
  const cipherHash=crypto.createHash('sha256');readFile(fd,chunk=>cipherHash.update(chunk));
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(6));decipher.setAAD(Buffer.from('pinevela:legacy:persistence-backup:v1:'+checkpoint));decipher.setAuthTag(tag);
  const stream=fs.createReadStream(archive,{fd,autoClose:false,start:18,end:stat.size-17}).pipe(decipher);
  let pending=Buffer.alloc(0),manifest:Manifest|undefined,index=0,remaining=0,fileHash=crypto.createHash('sha256');
  const plainHash=crypto.createHash('sha256');let plaintextBytes=0;
  for await(const value of stream){const chunk=Buffer.from(value);plainHash.update(chunk);plaintextBytes+=chunk.length;
   pending=Buffer.concat([pending,chunk]);
   if(!manifest){
    if(pending.length<10)continue;
    if(!pending.subarray(0,6).equals(payloadMagic))throw Error('Invalid legacy archive payload.');
    const length=pending.readUInt32BE(6);if(length<2||length>maximumManifestBytes)throw Error('Invalid recovery manifest size.');
    if(pending.length<10+length)continue;
    const candidate=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pending.subarray(10,10+length)));validateManifest(candidate,checkpoint);manifest=candidate;
    if(expected&&canonical(manifest)!==canonical(expected))throw Error('Decrypted manifest does not match the prepared original listing.');
    if(restoreDirectory)for(const relative of manifest.directories)fs.mkdirSync(path.join(restoreDirectory,relative),{recursive:true,mode:0o700});
    pending=pending.subarray(10+length);remaining=manifest.files[0]?.bytes??0;
   }
   while(index<manifest.files.length&&(pending.length>0||remaining===0)){
    if(restoreDirectory&&restoreFd===undefined){
     const destination=path.join(restoreDirectory,manifest.files[index].path);if(!inside(restoreDirectory,destination))throw Error('Recovery file escaped its private target.');
     assertDirectoryChain(path.dirname(destination),true);
     restoreFd=fs.openSync(destination,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
    }
    const take=Math.min(remaining,pending.length),bytes=pending.subarray(0,take);fileHash.update(bytes);
    if(restoreFd!==undefined)fs.writeFileSync(restoreFd,bytes);
    pending=pending.subarray(take);remaining-=take;
    if(remaining===0){if(fileHash.digest('hex')!==manifest.files[index].sha256)throw Error('Recovered legacy file digest does not match the original.');
     if(restoreFd!==undefined){fs.fsyncSync(restoreFd);fs.closeSync(restoreFd);restoreFd=undefined;}
     index++;fileHash=crypto.createHash('sha256');remaining=manifest.files[index]?.bytes??0;
    }
   }
  }
  if(!manifest||index!==manifest.files.length||pending.length!==0||remaining!==0)throw Error('Legacy archive is truncated or contains unlisted bytes.');
  return{manifest,archiveSha256:cipherHash.digest('hex'),plaintextSha256:plainHash.digest('hex'),plaintextBytes,encryptedBytes:stat.size};
 }finally{if(restoreFd!==undefined)fs.closeSync(restoreFd);fs.closeSync(fd);}
}
let stage='arguments',partial:string|undefined,reconstructed:string|undefined;
try{
 const [command='backup',checkpointArgument]=process.argv.slice(2);
 if(!['backup','verify','list','restore'].includes(command)||command==='backup'&&process.argv.length>3||command!=='backup'&&(process.argv.length!==4||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(checkpointArgument||'')))
  throw Error('Use backup, verify <checkpoint UUID>, list <checkpoint UUID>, or restore <checkpoint UUID>.');
 assertDirectoryChain(recoveryRoot,true);
 if(command!=='backup'){
  const directory=path.join(recoveryRoot,'legacy-persistence-'+checkpointArgument),key=privateFile(path.join(directory,'key'),32);
  try{if(key.length!==32)throw Error('Invalid legacy backup key.');const verified=await verifyArchive(directory,checkpointArgument!,key);
   const metadata=JSON.parse(privateFile(path.join(directory,'metadata.json'),1024*1024).toString());
   if(metadata.archiveSha256!==verified.archiveSha256||metadata.plaintextSha256!==verified.plaintextSha256||metadata.manifestSha256!==sha(canonical(verified.manifest)))throw Error('Recovery metadata does not match the verified archive.');
   let restoredDirectory:string|undefined;
   if(command==='restore'){
    // A verified archive may only reconstruct into a newly created private
    // recovery directory. Active data/uploads and test fixtures are never targets.
    reconstructed=path.join(recoveryRoot,'restored-legacy-'+checkpointArgument+'-'+crypto.randomUUID());fs.mkdirSync(reconstructed,{mode:0o700});
    await verifyArchive(directory,checkpointArgument!,key,verified.manifest,reconstructed);syncDirectory(reconstructed);
    restoredDirectory=path.relative(workspace,reconstructed);reconstructed=undefined;
   }
   console.log(JSON.stringify({passed:true,command,checkpoint:checkpointArgument,files:verified.manifest.files.length,bytes:verified.manifest.bytes,
    authenticatedDecryptionVerified:true,allFileDigestsVerified:true,...(restoredDirectory?{restoredDirectory,sourceFilesModified:0}:{}),
    ...(command==='list'?{paths:verified.manifest.files.map(file=>({path:file.path,bytes:file.bytes,sha256:file.sha256}))}:{})}));
  }finally{key.fill(0);}
 }else{
  stage='validated legacy source roots';const roots=[source('data',process.env.PINEVELA_DATA_DIR),source('uploads',process.env.PINEVELA_UPLOADS_DIR)];
  try{
   if(roots.some((a,index)=>roots.some((b,other)=>index!==other&&(a.path===b.path||inside(a.path,b.path)))))throw Error('Legacy source roots cannot overlap.');
   stage='stable source inventory';const initial=inventory(roots);
   if(!initial.files.some(file=>file.path==='data/pinevela_store.json'))throw Error('The actual legacy store is required; no empty or invented checkpoint is created.');
   const checkpoint=crypto.randomUUID(),createdAt=new Date().toISOString(),manifest:Manifest={version:1,checkpoint,createdAt,
    roots:roots.map(root=>({label:root.label,path:path.relative(workspace,root.path).split(path.sep).join('/'),exists:root.exists})),...initial};
   validateManifest(manifest,checkpoint);const manifestBytes=Buffer.from(canonical(manifest));if(manifestBytes.length>maximumManifestBytes)throw Error('Legacy recovery listing is too large.');
   const key=crypto.randomBytes(32),nonce=crypto.randomBytes(12),final=path.join(recoveryRoot,'legacy-persistence-'+checkpoint);
   partial=path.join(recoveryRoot,'.partial-legacy-'+checkpoint);fs.mkdirSync(partial,{mode:0o700});
   try{
    writePrivate(path.join(partial,'key'),key);
    const output=fs.openSync(path.join(partial,'archive.pvlegacy'),fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('pinevela:legacy:persistence-backup:v1:'+checkpoint));
    const plainHash=crypto.createHash('sha256');let plaintextBytes=0;
    const append=(bytes:Buffer)=>{plainHash.update(bytes);plaintextBytes+=bytes.length;fs.writeFileSync(output,cipher.update(bytes));};
    try{
     stage='encrypt original files';fs.writeFileSync(output,Buffer.concat([envelopeMagic,nonce]));
     const payloadHeader=Buffer.alloc(10);payloadMagic.copy(payloadHeader);payloadHeader.writeUInt32BE(manifestBytes.length,6);append(payloadHeader);append(manifestBytes);
     for(const entry of manifest.files){const [label,...parts]=entry.path.split('/'),root=roots.find(root=>root.label===label)!;
      const input=openSourceFile(root,parts.join('/'));try{
       const before=fs.fstatSync(input);if(before.dev!==entry.dev||before.ino!==entry.ino||before.size!==entry.bytes||before.mtimeMs!==entry.mtimeMs)throw Error('Legacy source changed before encryption.');
       const hash=crypto.createHash('sha256'),size=readFile(input,chunk=>{hash.update(chunk);append(chunk);}),after=fs.fstatSync(input);
       if(size!==entry.bytes||hash.digest('hex')!==entry.sha256||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('Legacy source changed during encryption.');
      }finally{fs.closeSync(input);}
     }
     fs.writeFileSync(output,cipher.final());fs.writeFileSync(output,cipher.getAuthTag());fs.fsyncSync(output);
    }finally{fs.closeSync(output);}
    stage='authenticated decryption and all-file reconstruction';const verified=await verifyArchive(partial,checkpoint,key,manifest);
    if(verified.plaintextSha256!==plainHash.digest('hex')||verified.plaintextBytes!==plaintextBytes)throw Error('Decrypted archive does not match original byte stream.');
    stage='unchanged original inventory';if(canonical(inventory(roots))!==canonical(initial))throw Error('Legacy files changed while preparing recovery; fresh backup required.');
    const metadata={version:1,checkpoint,createdAt,verifiedAt:new Date().toISOString(),format:'PVLEG1/AES-256-GCM/PVLAR1',
     roots:manifest.roots,files:manifest.files.length,bytes:manifest.bytes,encryptedBytes:verified.encryptedBytes,
     archiveSha256:verified.archiveSha256,plaintextSha256:verified.plaintextSha256,manifestSha256:sha(canonical(manifest)),
     authenticatedDecryptionVerified:true,allFileDigestsVerified:true,originalInventoryUnchanged:true,symlinksFollowed:false,
     sourceFilesModified:0,plaintextRecoveryFilesWritten:0,cloudConnectionsOpened:0,writerLeaseHeld:false,
     limits:['Existing files were stable throughout capture and verification; no running writer lease was acquired.',
      'A later source modification requires a fresh checkpoint before removing legacy files.',
      'An archived lock file contains bytes only; no process lock or live session authority is restored.'],
     recoveryInstructions:['Keep archive.pvlegacy and the separate private key together in this protected recovery directory.',
      'Verify with node --import tsx scripts/backup-legacy-persistence.ts verify '+checkpoint,
      'List validated relative paths with node --import tsx scripts/backup-legacy-persistence.ts list '+checkpoint,
      'Reconstruct into a new private recovery directory with node --import tsx scripts/backup-legacy-persistence.ts restore '+checkpoint,
      'Restore only offline into a new private recovery directory; never merge over an active store or import these identities as test fixtures.']};
    writePrivate(path.join(partial,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
    writePrivate(path.join(partial,'listing.json'),JSON.stringify({version:1,checkpoint,roots:manifest.roots,directories:manifest.directories,
     files:manifest.files.map(({path,bytes,sha256,mode,mtimeMs})=>({path,bytes,sha256,mode,mtimeMs}))},null,2)+'\n');
    syncDirectory(partial);fs.renameSync(partial,final);partial=undefined;syncDirectory(recoveryRoot);
    console.log(JSON.stringify({passed:true,checkpoint,directory:path.relative(workspace,final),files:metadata.files,bytes:metadata.bytes,
     dataFiles:manifest.files.filter(file=>file.path.startsWith('data/')).length,uploadFiles:manifest.files.filter(file=>file.path.startsWith('uploads/')).length,
     archiveSha256:metadata.archiveSha256,authenticatedDecryptionVerified:true,allFileDigestsVerified:true,originalInventoryUnchanged:true,
     sourceFilesModified:0,plaintextRecoveryFilesWritten:0,cloudConnectionsOpened:0,writerLeaseHeld:false}));
   }finally{key.fill(0);manifestBytes.fill(0);}
  }finally{for(const root of roots)if(root.fd!==null)fs.closeSync(root.fd);}
 }
}catch(error:any){
 if(partial)fs.rmSync(partial,{recursive:true,force:true});
 if(reconstructed)fs.rmSync(reconstructed,{recursive:true,force:true});
 try{assertDirectoryChain(recoveryRoot,true);writePrivate(path.join(recoveryRoot,'legacy-persistence-backup-failure-'+crypto.randomUUID()+'.log'),String(error.stack||error));}catch{}
 console.error(JSON.stringify({passed:false,stage,error:'Legacy recovery preparation failed; original files were preserved and private diagnostics saved.'}));process.exitCode=1;
}
