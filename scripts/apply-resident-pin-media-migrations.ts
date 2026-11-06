/** Owner-authorized additive deployment using the existing verified-TLS connection. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
dotenv.config({quiet:true});
const output='docs/verification/resident-pin-media-2026-11-05';
const sha=(value:crypto.BinaryLike)=>crypto.createHash('sha256').update(value).digest('hex');
const versions=['20261105150000','20261105160000'];
const report:any={passed:false,databaseOnly:true,hostedAppDeployed:false,authAccountsCreated:0,existingPasswordsChanged:0,imageBytesRewritten:0};
let stage='verification and encrypted backup gates',db:SupabaseDatabase|undefined;
try{
  assert.equal(new URL(process.env.SUPABASE_URL||'').hostname,'bivajljcdeofyxzmplxm.supabase.co');
  const verification=JSON.parse(fs.readFileSync(output+'/database-auth-http-report.json','utf8'));
  assert(verification.passed&&verification.checks===88&&verification.realGoTrue&&verification.nativeTokensIssuedByGoTrue);
  for(const [file,expected] of Object.entries(verification.sourceSha256))assert.equal(sha(fs.readFileSync(file)),expected,file);
  const backupId='effdcea9-ce67-4f75-bf10-0904fcbd2c71';
  const backup=JSON.parse(fs.readFileSync('.security/migration-reset/'+backupId+'.json','utf8'));
  assert(backup.encrypted&&backup.archiveListingVerified&&backup.decryptedRoundTripVerified&&backup.projectRef==='bivajljcdeofyxzmplxm');
  for(const suffix of ['.pvpg','.key','.pvsecrets'])assert(fs.statSync('.security/migration-reset/'+backupId+suffix).size>0);
  const sql=fs.readFileSync('releases/database/pinevela-apply-resident-pin-media-20261105.sql','utf8');
  assert.equal(sha(sql),verification.sqlEditorSha256);assert(/\ncommit;\s*$/.test(sql));
  const digests=versions.map(version=>{
    const file=fs.readdirSync('supabase/migrations').find(name=>name.startsWith(version+'_'));assert(file);
    const digest=sha(fs.readFileSync('supabase/migrations/'+file));assert(sql.includes(digest));return{version,digest};
  });
  db=new SupabaseDatabase();
  const previous=(await db.pool.query('select version,digest from private.schema_migrations where version=any($1::text[])',[versions])).rows;
  for(const row of previous)assert.equal(row.digest,digests.find(m=>m.version===row.version)?.digest);
  stage='rolled-back hosted dry run';
  await db.pool.query(sql.replace(/\ncommit;\s*$/,'\nrollback;\n'));
  assert.equal((await db.pool.query('select count(*)::int as n from private.schema_migrations where version=any($1::text[])',[versions])).rows[0].n,previous.length);
  if(!previous.some(m=>m.version===versions[1]))assert.equal((await db.pool.query("select to_regclass('private.resident_pin_credentials') as relation")).rows[0].relation,null);
  stage='atomic additive application';await db.pool.query(sql);
  stage='independent committed readback';
  const applied=(await db.pool.query('select version,digest from private.schema_migrations where version=any($1::text[]) order by version',[versions])).rows;
  assert.deepEqual(applied,digests);
  const rls=(await db.pool.query("select relrowsecurity from pg_class where oid='private.resident_pin_credentials'::regclass")).rows[0].relrowsecurity;assert(rls);
  const grants=(await db.pool.query(`select name,has_table_privilege(name,'private.resident_pin_credentials','select,insert,update,delete') as granted
    from(values('anon'),('authenticated'),('pinevela_backend'),('pinevela_catalog'))r(name)`)).rows;assert(grants.every(r=>!r.granted));
  assert((await db.pool.query("select not prosecdef as invoker from pg_proc where oid='private.guard_resident_pin_credentials()'::regprocedure")).rows[0].invoker);
  assert((await db.pool.query("select indisvalid from pg_index where indexrelid='private.resident_pin_credentials_owner_idx'::regclass")).rows[0].indisvalid);
  const bucket=(await db.pool.query("select public,allowed_mime_types from storage.buckets where id='pinevela-media'")).rows[0];
  assert.equal(bucket.public,false);assert.deepEqual([...bucket.allowed_mime_types].sort(),['image/png','image/webp']);
  for(const [relation,name] of [['public.media_assets','media_owned_raster_path'],['private.content_safety_checks','content_safety_quarantine_path']]){
    const c=(await db.pool.query('select convalidated from pg_constraint where conrelid=$1::regclass and conname=$2',[relation,name])).rows[0];assert(c?.convalidated);
  }
  const credentials=(await db.pool.query('select count(*)::int as n from private.resident_pin_credentials')).rows[0].n;
  if(!previous.some(m=>m.version===versions[1]))assert.equal(credentials,0);
  Object.assign(report,{passed:true,project:'bivajljcdeofyxzmplxm',migrations:digests,sqlEditorSha256:sha(sql),backupCheckpoint:backupId,
    rolledBackDryRunPassed:true,alreadyApplied:previous.length===2,credentialRls:true,deniedRoleGrantChecks:grants.length,
    ownerIndexValid:true,storageBucketPrivate:true,allowedPhotoTypes:bucket.allowed_mime_types,credentialRecords:credentials});
}catch(error:any){report.stage=stage;report.failureCode=String(error?.code||'VERIFICATION_FAILED').slice(0,60);process.exitCode=1;}
finally{await db?.close();}
fs.writeFileSync(output+'/live-sql-application.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
