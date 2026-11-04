import {termsAcceptance} from '../legalPolicy.js';
import {freeStoreVerification} from './lib/free-store-verification.js';
/** Real PostgreSQL/RLS checks using existing verified Auth subjects. Application
 * rows roll back. After migration is applied, real attached image bytes also
 * round-trip through Storage and the temporary object is removed through its API. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { ApiError,SupabaseDatabase,type VerifiedActor } from '../supabase/db.js';
import { reserveMedia,finishMedia,ownedMedia,mediaUrl,canUploadMedia } from '../supabase/media.js';
import { SupabaseStorage } from '../supabase/storage.js';
import { normalizeRasterImage } from '../imageUploadSecurity.js';
import {submitSellerApplication,decideSellerApplication} from '../supabase/sellerRegistration.js';
import {saveStoreProfile} from '../supabase/storeSetup.js';
dotenv.config({quiet:true});
const db = new SupabaseDatabase(),client = await db.pool.connect(),storage = new SupabaseStorage();
let checks = 0,storageRoundTrip = false,objectPath:string|undefined;
const check = (value:unknown,label:string) => {assert.ok(value,label);checks++;};
try {
  await client.query('begin');
  const baseline = (await client.query(`select (select count(*) from public.profiles) as profiles,
    (select count(*) from auth.users) as auth_users,(select count(*) from storage.objects) as objects`)).rows[0];
  const ledger = new Map((await client.query('select version,digest from private.schema_migrations')).rows.map(row => [row.version,row.digest]));
  // External Storage requests cannot see this connection's uncommitted DDL.
  const storageApplied = fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).every(f=>ledger.has(f.slice(0,14)));
  for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}.*\.sql$/.test(f)).sort()) {
    const sql = fs.readFileSync(path.join('supabase/migrations',file),'utf8');
    if (ledger.has(file.slice(0,14))) assert.equal(ledger.get(file.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));
    else await client.query(sql);
  }
  const subjects = (await client.query(`select distinct on (u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id
    from auth.users u join auth.sessions s on s.user_id = u.id where u.email_confirmed_at is not null
    and (s.not_after is null or s.not_after > now()) order by u.id,s.created_at desc limit 4`)).rows;
  if (subjects.length !== 4 || baseline.profiles !== '0') throw new Error('Run these rollback checks before operational profiles exist, with four verified Auth subjects.');
  const [root1,root2,child1,child2] = subjects;
  for (const subject of subjects) await client.query('insert into public.profiles(id,email,display_name) values ($1,$2,$3)',[subject.id,subject.email,subject.raw_user_meta_data?.full_name || subject.raw_user_meta_data?.name || '']);
  for (const [root,child] of [[root1,child1],[root2,child2]]) await client.query('update public.profiles set primary_owner_id = $1 where id = $2',[root.id,child.id]);
  async function context(subject:any,kind:string,owner?:any):Promise<VerifiedActor> {
    const id = (await client.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values ($1,$2,$3,'active') returning id",[subject.id,owner?.id || null,kind])).rows[0].id;
    return {authUserId:subject.id,sessionId:subject.session_id,contextId:id,kind};
  }
  const primary = await context(root1,'primary'),manager = await context(child1,'manager',root1),otherManager = await context(child2,'manager',root2);
  const seller = await context(child1,'seller',root1),officer = await context(root1,'officer'),otherOfficer = await context(root2,'officer');
  const residence = (await client.query('insert into public.residences(primary_owner_id,name) values ($1,$2) returning id',[root1.id,child1.raw_user_meta_data?.full_name || child1.email])).rows[0].id;
  await client.query('insert into public.manager_assignments(manager_context_id,residence_id) values ($1,$2)',[manager.contextId,residence]);
  const application = (await client.query(`insert into public.verification_cases(applicant_context_id,residence_id,kind,status)
    values ($1,$2,'manager_registration','inspection_pending') returning id`,[manager.contextId,residence])).rows[0].id;
  const inspection = (await client.query('insert into public.verification_inspections(case_id,officer_context_id) values ($1,$2) returning id',[application,officer.contextId])).rows[0].id;
  const image = await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),2048);
  async function denied(work:()=>Promise<unknown>,expected:number|string,label:string) {
    await client.query('savepoint media_negative');let failure:any;
    try {await work();} catch (error) {failure = error;}
    await client.query('rollback to savepoint media_negative');
    check(typeof expected === 'number' ? failure instanceof ApiError && failure.status === expected : failure?.code === expected,label);
  }
  async function asActor(actor:VerifiedActor,work:()=>Promise<void>) {
    await client.query(`insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)
      on conflict(session_id) do update set active_context_id = excluded.active_context_id`,[actor.sessionId,actor.authUserId,actor.contextId]);
    await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor.authUserId,session_id:actor.sessionId,role:'authenticated'})]);
    await client.query('set local role pinevela_backend');try {await work();} finally {await client.query('reset role');}
  }
  await denied(() => reserveMedia(client,primary,'hostel',image),403,'Primary user cannot upload as a manager');
  await denied(() => reserveMedia(client,seller,'market',image),403,'Unapproved seller cannot upload market media');
  await client.query("update public.account_contexts set status='pending' where id=$1",[seller.contextId]);
  const enrollment=(await client.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at,auth_user_id,linked_context_id,status,verified_at)
    values($1,$2,'seller',$3,$4,'{}',now()+interval '24 hours',$5,$6,'pending_review',now()) returning id`,[primary.contextId,root1.id,child1.email.toLowerCase(),crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),child1.id,seller.contextId])).rows[0].id;
  await asActor(primary,async()=>{});
  const merchant=await submitSellerApplication(client,primary,{enrollmentId:enrollment,university:'Kwame Nkrumah University of Science and Technology (KNUST)',categoryToSell:'General Campus Essentials',idNumber:'PV-MEDIA-CHECK',storeName:child1.raw_user_meta_data?.full_name || child1.email,certified:true,termsAcceptance:termsAcceptance(true)});
  const admin=await context(root2,'admin');await client.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[admin.contextId]);
  await asActor(admin,async()=>{});await decideSellerApplication(client,admin,{id:merchant.application.id},true);
  const store=(await client.query('select id from public.stores where seller_context_id=$1',[seller.contextId])).rows[0].id;
  await asActor(seller,async()=>{});
  await saveStoreProfile(client,seller,{storeName:child1.raw_user_meta_data?.full_name || child1.email,username:child1.email.split('@')[0],location:'Storage verification campus',category:'General Campus Essentials',deliveryMode:'Campus Meetup',phone:'+233241234567',phoneCountry:'GH',description:''},true);
  const hostelAsset = await reserveMedia(client,manager,'hostel',image);
  check(hostelAsset.owner_context_id === manager.contextId && hostelAsset.owner_auth_user_id === child1.id,'Upload derives immutable ownership from the actor');
  await asActor(manager,async () => check((await client.query('select id from public.media_assets')).rowCount === 0,'Incomplete uploads cannot be viewed'));
  await denied(() => finishMedia(client,otherManager,hostelAsset.id),409,'Another manager cannot finalize an upload');
  const ready = await finishMedia(client,manager,hostelAsset.id);
  check(ready.imageUrl === mediaUrl(hostelAsset.id),'Ready image reference is a stable application URL');
  await asActor(manager,async () => {
    check((await client.query('select id from public.media_assets')).rowCount === 1,'Manager can read own ready photograph');
    await denied(() => client.query("update public.media_assets set state = 'ready'"),'42501','Actor cannot mark arbitrary Storage objects ready');
    await denied(() => client.query('select key_hash from private.manager_operation_keys'),'42501','Actor cannot read manager secret-key hashes');
  });
  await asActor(otherManager,async () => check((await client.query('select id from public.media_assets')).rowCount === 0,'Other hostel account cannot read private media'));
  await asActor(primary,async () => check((await client.query('select id from public.media_assets')).rowCount === 0,'Primary owner cannot impersonate a linked manager for media access'));
  await denied(() => ownedMedia(client,otherManager,ready.imageUrl,'hostel'),403,'Cross-account attachment is denied');
  await denied(() => ownedMedia(client,manager,'https://untrusted.invalid/image.png','hostel'),400,'External image URL cannot establish upload ownership');
  await denied(() => ownedMedia(client,manager,ready.imageUrl,'market'),403,'Image purpose cannot be changed by a client');
  await denied(() => client.query('update public.media_assets set owner_context_id = $2 where id = $1',[hostelAsset.id,otherManager.contextId]),'23514','Database rejects media ownership reassignment');
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[hostelAsset.id])).rows[0].allowed,'Unattached media is never public');
  await client.query('update public.residences set cover_path = $2 where id = $1',[residence,ready.imageUrl]);
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[hostelAsset.id])).rows[0].allowed,'Pending residence photo remains private');
  await client.query("update public.residences set status = 'approved' where id = $1",[residence]);
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[hostelAsset.id])).rows[0].allowed,'Incomplete residence remains private after manager approval');
  await client.query('update public.residences set setup_submitted_at = now() where id = $1',[residence]);
  await client.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values ($1,$2,'residence_registration','approved')",[manager.contextId,residence]);
  check((await client.query('select private.media_asset_is_public($1) as allowed',[hostelAsset.id])).rows[0].allowed,'Approved residence can display its owned exterior photo');
  await client.query("update public.residences set status = 'suspended' where id = $1",[residence]);
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[hostelAsset.id])).rows[0].allowed,'Suspension removes public photo access');
  const foreignAsset = await reserveMedia(client,otherManager,'hostel',image);await finishMedia(client,otherManager,foreignAsset.id);
  await denied(() => client.query('update public.residences set cover_path = $2 where id = $1',[residence,mediaUrl(foreignAsset.id)]),'23514','Database rejects another manager residence cover');
  const marketAsset = await reserveMedia(client,seller,'market',image);await finishMedia(client,seller,marketAsset.id);
  await client.query('update public.stores set logo_path = $2,cover_path = $2 where id = $1',[store,mediaUrl(marketAsset.id)]);
  await denied(() => client.query('update public.stores set logo_path = $2 where id = $1',[store,ready.imageUrl]),'23514','Store cannot reuse a manager photo');
  await freeStoreVerification(client,seller);
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[marketAsset.id])).rows[0].allowed,'Default plan cannot expose custom store branding');
  await freeStoreVerification(client,seller,'star','subscription');
  check((await client.query('select private.media_asset_is_public($1) as allowed',[marketAsset.id])).rows[0].allowed,'Active paid plan displays owned custom branding');
  await client.query("update public.store_subscriptions set status='expired' where store_id = $1 and status='active'",[store]);
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[marketAsset.id])).rows[0].allowed,'Expired paid plan removes public branding access');
  await denied(() => reserveMedia(client,otherOfficer,'inspection',image,inspection),404,'Unassigned officer cannot upload evidence');
  const evidence = await reserveMedia(client,officer,'inspection',image,inspection);await finishMedia(client,officer,evidence.id);
  check((await ownedMedia(client,officer,mediaUrl(evidence.id),'inspection',inspection)).inspection_id === inspection,'Evidence is bound to its actual inspection');
  await denied(() => ownedMedia(client,officer,mediaUrl(evidence.id),'inspection',crypto.randomUUID()),403,'Evidence cannot be reused for another inspection');
  await client.query("update public.verification_inspections set status = 'rejected' where id = $1",[inspection]);
  await denied(() => canUploadMedia(client,officer,'inspection',inspection),404,'Closed inspection cannot receive more evidence');
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[evidence.id])).rows[0].allowed,'Inspection evidence is never part of the public catalog');
  await client.query('set local role anon');
  await denied(() => client.query('select id from public.media_assets'),'42501','Guest cannot read private asset metadata');
  await client.query('reset role');
  check((await client.query("select public,file_size_limit from storage.buckets where id = 'pinevela-media'")).rows[0].public === false,'Storage bucket is private');
  if (storageApplied) {
    objectPath = hostelAsset.object_path;
    console.log(JSON.stringify({phase:'storage_upload',checks}));
    await storage.upload(objectPath,image);
    console.log(JSON.stringify({phase:'storage_download',checks}));
    check((await storage.download(objectPath,hostelAsset)).equals(image),'Real image bytes round-trip through private Supabase Storage');
    await denied(() => storage.download(objectPath,{byte_size:hostelAsset.byte_size,sha256:'0'.repeat(64)}),503,'Stored photo integrity must match its reservation');
    await asActor(manager,async () => check((await client.query("select id from storage.objects where bucket_id = 'pinevela-media' and name = $1",[objectPath])).rowCount === 1,'Bound owner can read own Storage object through RLS'));
    await asActor(otherManager,async () => check((await client.query("select id from storage.objects where bucket_id = 'pinevela-media' and name = $1",[objectPath])).rowCount === 0,'Another manager cannot bypass media API through Storage RLS'));
    await client.query('set local role anon');
    check((await client.query("select id from storage.objects where bucket_id = 'pinevela-media' and name = $1",[objectPath])).rowCount === 0,'Guest cannot bypass private bucket through Storage RLS');
    await client.query('reset role');
    const configUrl = process.env.SUPABASE_URL!;
    const publicResponse = await fetch(`${configUrl}/storage/v1/object/public/pinevela-media/${objectPath}`,{signal:AbortSignal.timeout(30000)});
    check(!publicResponse.ok,'Public Storage URL cannot expose a private photograph');
    await publicResponse.body?.cancel();
    await storage.remove(objectPath);objectPath = undefined;
    storageRoundTrip = true;
  }
  await client.query('rollback');
  const after = (await client.query(`select (select count(*) from public.profiles) as profiles,
    (select count(*) from auth.users) as auth_users,(select count(*) from storage.objects) as objects`)).rows[0];
  check(JSON.stringify(after) === JSON.stringify(baseline),'All temporary application rows and real Storage objects are removed');
  console.log(JSON.stringify({checks,passed:true,rolledBack:true,storageRoundTrip,authAccountsCreated:0,legacyRecordsImported:0}));
} catch(error) {
  console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || undefined,status:error instanceof ApiError?error.status:undefined,timeout:error instanceof Error && error.message==='Query read timeout',message:error instanceof assert.AssertionError?error.message:undefined}));
  process.exitCode=1;
} finally {
  await client.query('rollback').catch(() => undefined);
  if (objectPath) await storage.remove(objectPath);
  client.release();await db.close();
}
