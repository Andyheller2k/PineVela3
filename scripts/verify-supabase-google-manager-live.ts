/** Read-only verification of the deployed migration ledger and initializer grants.
 * Never signs in, creates accounts or changes product/authorization records. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase();let checks=0;
try{
  const client=await db.pool.connect();
  try{
    await client.query('begin read only');
    const rows=(await client.query('select version,digest from private.schema_migrations')).rows;
    const files=fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n));
    assert.equal(rows.length,69);checks++;
    assert.equal(files.length,69);checks++;
    for(const file of files){
      assert.equal(rows.find(r=>r.version===file.slice(0,14))?.digest,
        crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+file)).digest('hex'));
      checks++;
    }
    for(const role of ['anon','authenticated','pinevela_backend']){
      assert.equal((await client.query("select has_function_privilege($1,'private.initialize_auth_profile(uuid,text)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
      checks++;
    }
    const source=(await client.query("select prosrc from pg_proc where oid='private.initialize_auth_profile(uuid,text)'::regprocedure")).rows[0].prosrc;
    assert(/enrollment\.enrollment_fields\s*->>\s*'authentication'\s*=\s*'google'/.test(source));checks++;
    await client.query('commit');
    const report={passed:true,checks,appliedMigrations:69,allMigrationHashesMatch:true,
      initializerBrowserAndScopedBackendExecuteDenied:true,googleRoleDeferralPresent:true,readOnly:true};
    fs.writeFileSync('.security/migration-reset/google-manager-enrollment-live.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify(report));
  }finally{client.release();}
}catch{
  console.error(JSON.stringify({passed:false,checks,readOnly:true,credentialsPrinted:false}));process.exitCode=1;
}finally{await db.close();}
