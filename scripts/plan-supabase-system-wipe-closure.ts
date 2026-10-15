/** Read-only operator inspection; never submits consent or changes cloud rows. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {SupabaseDatabase,ApiError,uuid} from '../supabase/db.js';
import {privateRecoveryDirectory} from '../supabase/storageBackup.js';
import {planSystemWipeClosure} from './lib/system-wipe-closure-plan.js';
dotenv.config({quiet:true});
let db:SupabaseDatabase|undefined;
try{
 const args=process.argv.slice(2);
 if(args.length<1||args.length>2)throw new ApiError(400,'Pass comma-separated wipe scopes and optionally the exact proposal UUID.');
 const scopes=args[0].split(',');const proposal=args[1]===undefined?undefined:uuid(args[1]);
 db=new SupabaseDatabase();const plan=await planSystemWipeClosure(db,scopes,proposal);
 for(const dir of['.security','.security/migration-reset'])privateRecoveryDirectory(path.resolve(dir));
 const directory=path.resolve('.security/migration-reset/system-wipe-closure');
 if(!fs.existsSync(directory))fs.mkdirSync(directory,{mode:0o700});privateRecoveryDirectory(directory);
 const filename=path.join(directory,crypto.randomUUID()+'.json');
 const fd=fs.openSync(filename,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(plan,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 console.log(JSON.stringify({planned:true,executionAvailable:false,authorizesMutation:false,cloudWrites:false,
  effects:plan.effects.reduce((n,e)=>n+e.ids.length,0),bindingContexts:plan.applicationBindingsToRevoke.length,
  blockers:plan.blockers.map(b=>b.code),planFile:path.relative(process.cwd(),filename),planDigest:plan.planDigest}));
}catch(error){console.error(JSON.stringify({planned:false,cloudWrites:false,executionAvailable:false,
 code:error instanceof ApiError?error.code||'plan_rejected':'plan_incomplete'}));process.exitCode=1;}
finally{await db?.close();}
