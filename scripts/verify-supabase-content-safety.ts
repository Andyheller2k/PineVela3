/** Actual local Auth/HTTP/RLS and real OpenAI results. Only public application
 * brand pixels and owned test-account text leave this isolated test stack. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { normalizeRasterImage } from '../imageUploadSecurity.js';
import { evaluateContentSafety } from '../supabase/contentSafety.js';
import { SAFETY_POLICY, listingSafetyText, storeSafetyText, safetyDigest } from '../supabase/contentSafetyPolicy.js';
import type { VerifiedActor } from '../supabase/db.js';
import { readLocalFixture, runLocalSupabaseVerification, saveLocalFixture, signInLocalAccount, type LocalSupabaseHarness } from './lib/local-supabase-harness.js';

if (process.argv[2] !== '--local-supabase-worker') process.env.OPENAI_API_KEY = dotenv.parse(fs.readFileSync('.env')).OPENAI_API_KEY;
let checks = 0, stage = 'startup';
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
async function verify(h: LocalSupabaseHarness) {
  await h.assertOwned();
  const service = readLocalFixture<any>(h, 'support-browser.json'), f = readLocalFixture<any>(h, 'encrypted-chat-browser.json');
  assert.ok(service?.admin && service.agent && f?.seller && f.buyer && f.other, 'Actual retained local accounts are required');
  stage = 'genuine provider decisions for public brand assets';
  const raw = fs.readFileSync('assets/PineCoverlight.png'), photos = new Map<string, { bytes: Buffer; result: any }>();
  for (const size of [512, 2048]) {
    const bytes = await normalizeRasterImage(raw, size), result = await evaluateContentSafety(bytes);
    check(result.verdict === 'approved' && !!result.requestId, 'Real OpenAI classifies actual public brand pixels');
    photos.set(safetyDigest(bytes), { bytes, result });
  }
  // Older fixture photos were uploaded from this public file by the retained
  // native workflows. Never download/export private existing photos for tests.
  const media = (await h.db.pool.query("select * from public.media_assets where purpose in('market','avatar') and state='ready'")).rows;
  async function evidence(context: string, subject: string, purpose: string, hash: string, bytes: number, text: string | null, result: any) {
    await h.db.system(async c => {
      if ((await c.query('select private.content_safety_approved($1,$2,$3)as allowed', [context, purpose, hash])).rows[0].allowed) return;
      await c.query(`insert into private.content_safety_checks(id,owner_context_id,owner_auth_user_id,purpose,input_sha256,policy,verdict,model,provider_request_id,sexual_score,categories,byte_size,text_content)
        values($1,$2,$3,$4,$5,$6,'approved',$7,$8,$9,$10,$11,$12)`, [crypto.randomUUID(), context, subject, purpose, hash, SAFETY_POLICY, result.model, result.requestId, result.sexualScore, JSON.stringify(result.categories), bytes, text]);
    });
  }
  for (const asset of media) {
    const proof = photos.get(asset.sha256); assert.ok(proof && proof.bytes.length === Number(asset.byte_size), 'An old fixture image must match the public brand bytes exactly');
    await evidence(asset.owner_context_id, asset.owner_auth_user_id, asset.purpose === 'market' ? 'market_image' : 'avatar', asset.sha256, proof.bytes.length, null, proof.result);
  }
  for (const row of (await h.db.pool.query('select s.*,x.auth_user_id from public.stores s join public.account_contexts x on x.id=s.seller_context_id where s.setup_completed_at is not null')).rows) {
    const text = storeSafetyText({ storeName: row.name, username: row.username, description: row.description, category: row.primary_category, location: row.location }), result = await evaluateContentSafety(text);
    check(result.verdict === 'approved', 'Actual isolated store text passes the real provider'); await evidence(row.seller_context_id, row.auth_user_id, 'store_text', safetyDigest(text), 0, text, result);
    check((await h.db.pool.query('select private.store_text_digest($1)as hash', [row.id])).rows[0].hash === safetyDigest(text), 'Store canonical Unicode digest matches PostgreSQL');
  }
  for (const row of (await h.db.pool.query(`select l.*,s.seller_context_id,x.auth_user_id,coalesce((select jsonb_agg(jsonb_build_object('name',o.label)order by o.sort_order)from public.listing_price_options o where o.listing_id=l.id),'[]'::jsonb)as options
    from public.listings l join public.stores s on s.id=l.store_id join public.account_contexts x on x.id=s.seller_context_id where l.retired_at is null`)).rows) {
    const text = listingSafetyText({ ...row, serviceCategory: row.service_category, location: row.meeting_location, priceCategories: row.options }), result = await evaluateContentSafety(text);
    check(result.verdict === 'approved', 'Actual isolated listing text passes the real provider'); await evidence(row.seller_context_id, row.auth_user_id, 'listing_text', safetyDigest(text), 0, text, result);
    check((await h.db.pool.query('select private.listing_text_digest($1)as hash', [row.id])).rows[0].hash === safetyDigest(text), 'Listing canonical Unicode digest matches PostgreSQL');
  }
  stage = 'real native logins and safe upload publication'; console.log(JSON.stringify({ stage }));
  const buyer = await signInLocalAccount(h, f.buyer), seller = await signInLocalAccount(h, f.seller), other = await signInLocalAccount(h, f.other);
  const admin = await signInLocalAccount(h, service.admin), agent = await signInLocalAccount(h, service.agent), guest = h.session();
  const body = { fileData: 'data:image/png;base64,' + raw.toString('base64'), fileType: 'image/png', fileName: 'pinevela-brand.png' };
  check((await guest.json('/api/storage/upload-profile-image', body)).status === 401, 'Guest cannot trigger photo moderation or upload');
  check((await buyer.session.json('/api/storage/upload-market-image', body)).status === 403, 'Primary identity cannot impersonate a seller upload');
  check((await buyer.session.request('/api/customer-service/content-checks')).status === 403, 'Ordinary user cannot inspect safety review queue');
  check((await guest.request('/api/customer-service/content-checks')).status === 401, 'Unsigned safety queue reads are denied');
  const uploaded = await buyer.session.json('/api/storage/upload-profile-image', body);
  check(uploaded.status === 201 && uploaded.data.imageUrl, 'Actual safe profile photo passes moderation and real private Storage');
  const saved = await buyer.session.json('/api/auth/profile', { avatar: uploaded.data.imageUrl }, 'PUT');
  check(saved.status === 200 && saved.data.user.avatar === uploaded.data.imageUrl, 'Owner saves the approved avatar through the real profile endpoint');
  check((await other.session.json('/api/auth/profile', { avatar: uploaded.data.imageUrl }, 'PUT')).status === 403, 'Another identity cannot attach the approved avatar');
  check((await guest.request(uploaded.data.imageUrl)).status === 404, 'Approved personal avatar remains private from guests');
  check((await buyer.session.request(uploaded.data.imageUrl)).status === 200, 'Owner can still view the approved avatar');
  const cachedCount = Number((await h.db.pool.query('select count(*) from private.content_safety_checks where owner_context_id=$1', [buyer.user.id])).rows[0].count);
  check((await buyer.session.json('/api/storage/upload-profile-image', body)).data.assetId === uploaded.data.assetId, 'Identical approved avatar upload remains idempotent');
  check(Number((await h.db.pool.query('select count(*) from private.content_safety_checks where owner_context_id=$1', [buyer.user.id])).rows[0].count) === cachedCount, 'Identical bytes reuse their real decision without repeated classification');
  const old = (await seller.session.request('/api/digital-market/inventory')).data.find((item: any) => item.id === f.listingId); assert.ok(old);
  check((await seller.session.json(`/api/digital-market/products/${old.id}`, { description: old.description }, 'PUT')).status === 200, 'Safe existing listing edits retain publication and complete business checks');
  check((await seller.session.json(`/api/digital-market/products/${old.id}`, { description: old.description, approved: true }, 'PUT')).status === 400, 'Client cannot supply an approval field');
  check((await seller.session.request(`/api/digital-market/products/${old.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-PineVela-Profile-Context': buyer.user.id }, body: JSON.stringify({ description: old.description }) })).status === 409, 'Stale active-account context is rejected before text classification');

  stage = 'real explicit-text blocking and private review'; console.log(JSON.stringify({ stage }));
  const explicit = 'Pornographic videos and explicit adult sexual services for sale.';
  const blocked = await seller.session.json(`/api/digital-market/products/${old.id}`, { description: explicit }, 'PUT');
  check(blocked.status === 422 && ['moderation_blocked','moderation_review'].includes(blocked.data.code), 'Real OpenAI classification prevents publication of explicit marketplace text');
  check((await h.db.pool.query('select description from public.listings where id=$1', [old.id])).rows[0].description === old.description, 'Blocked replacement preserves the published listing');
  const textCheck = (await h.db.pool.query("select * from private.content_safety_checks where owner_context_id=$1 and purpose='listing_text' and verdict<>'approved' order by created_at desc limit 1", [seller.user.id])).rows[0];
  check(textCheck?.model === 'omni-moderation-latest' && textCheck?.ticket_id, 'Real provider decision creates a durable linked support report');
  check((await seller.session.request(`/api/support/tickets/${textCheck.ticket_id}`)).status === 200, 'Submitting account can track the real support case');
  check((await other.session.request(`/api/support/tickets/${textCheck.ticket_id}`)).status === 404, 'Unrelated account cannot read the review case');
  const held = await other.session.json('/api/storage/upload-profile-image', { ...body, fileName: 'child sexual content.png' });
  check(held.status === 422 && held.data.code === 'moderation_blocked', 'Known child-safety filename concern is held locally without exporting the photo');
  const photoCheck = (await h.db.pool.query("select * from private.content_safety_checks where owner_context_id=$1 and purpose='avatar' and model='local-child-safety-guard' order by created_at desc limit 1", [other.user.id])).rows[0];
  check(!!photoCheck?.image_path && !photoCheck.provider_request_id, 'Held photo is quarantined privately with no provider request');
  check((await other.session.request(`/api/media/${photoCheck.id}`)).status === 404, 'Quarantine ID is not an ordinary media URL');
  const queue = await agent.session.request('/api/customer-service/content-checks');
  check(queue.status === 200 && queue.data.checks.some((item: any) => item.id === textCheck.id), 'Active invited support agent can inspect the actual queue');
  check((await buyer.session.request(`/api/customer-service/content-checks/${photoCheck.id}/image`)).status === 403, 'Ordinary account cannot fetch quarantined images');
  check((await agent.session.request(`/api/customer-service/content-checks/${photoCheck.id}/image`)).status === 200, 'Authorized agent can review actual quarantined brand pixels');
  check((await agent.session.request('/api/customer-service/content-checks?accountId=' + buyer.user.id)).status === 400, 'Queue selectors cannot impersonate another account');
  check((await agent.session.request('/api/customer-service/content-checks?page=10001')).status === 400, 'Review pagination is bounded');
  const decision = { decision: 'approved', reason: 'Owned isolated acceptance review verifies a narrowly scoped content decision.', privateKey: service.admin.approvalKey };
  check((await agent.session.json(`/api/admin/content-checks/${textCheck.id}/decision`, decision)).status === 403, 'Support role cannot approve publication');
  check((await admin.session.json(`/api/admin/content-checks/${textCheck.id}/decision`, { ...decision, privateKey: 'wrong-key' })).status === 403, 'Administrator approval key remains mandatory');
  check((await admin.session.json(`/api/admin/content-checks/${photoCheck.id}/decision`, decision)).status === 403, 'Dedicated child-safety hold cannot be approved through general moderation');
  const beforeAccount = JSON.stringify((await h.db.pool.query('select status,private.account_access(id)as access from public.account_contexts where id=$1', [seller.user.id])).rows[0]);
  check((await admin.session.json(`/api/admin/content-checks/${textCheck.id}/decision`, decision)).status === 200, 'Own keyed administrator can approve exact held text');
  check((await seller.session.json(`/api/digital-market/products/${old.id}`, { description: explicit }, 'PUT')).status === 200, 'Exact approved resubmission passes the full publication path');
  check((await seller.session.json(`/api/digital-market/products/${old.id}`, { description: explicit + ' New explicit pornographic videos.' }, 'PUT')).status === 422, 'Approval cannot be reused for altered content');
  check((await seller.session.json(`/api/digital-market/products/${old.id}`, { description: old.description }, 'PUT')).status === 200, 'Original legitimate listing is restored through its real approved digest');
  check(JSON.stringify((await h.db.pool.query('select status,private.account_access(id)as access from public.account_contexts where id=$1', [seller.user.id])).rows[0]) === beforeAccount, 'Content decisions do not ban or alter an account');

  stage = 'fail-closed provider outage, RLS and database bypass attempts'; console.log(JSON.stringify({ stage }));
  const beforeAssets = Number((await h.db.pool.query('select count(*) from public.media_assets')).rows[0].count), key = process.env.OPENAI_API_KEY;
  try { delete process.env.OPENAI_API_KEY; const failure = await buyer.session.json('/api/storage/upload-profile-image', { fileData: 'data:image/png;base64,' + (await normalizeRasterImage(fs.readFileSync('assets/PineCoverdark.png'), 512)).toString('base64'), fileType: 'image/png' }); check(failure.status === 503 && failure.data.code === 'moderation_unavailable', 'Missing provider credentials fail closed on a new public brand photo'); }
  finally { process.env.OPENAI_API_KEY = key; }
  check(Number((await h.db.pool.query('select count(*) from public.media_assets')).rows[0].count) === beforeAssets, 'Failed checking creates no ready image or dangling upload reservation');
  check((await buyer.session.request('/api/auth/me')).data.avatar === uploaded.data.imageUrl, 'Provider failure retains the current profile photo');
  async function actor(context: string): Promise<VerifiedActor> { return (await h.db.pool.query('select b.auth_user_id as "authUserId",b.session_id as "sessionId",x.id as "contextId",x.kind from private.account_sessions b join public.account_contexts x on x.id=b.active_context_id where x.id=$1 order by b.created_at desc limit 1', [context])).rows[0]; }
  const buyerActor = await actor(buyer.user.id), agentActor = await actor(agent.user.id), otherActor = await actor(other.user.id);
  check((await h.db.readActor(buyerActor, c => c.query('select id from private.content_safety_checks where id=$1', [textCheck.id]))).rowCount === 0, 'Scoped backend RLS hides another account safety evidence');
  check((await h.db.readActor(otherActor, c => c.query('select id from private.content_safety_checks where id=$1', [photoCheck.id]))).rowCount === 1, 'Scoped backend permits own safety record');
  check((await h.db.readActor(agentActor, c => c.query('select id from private.content_safety_checks where id=$1', [photoCheck.id]))).rowCount === 1, 'Scoped backend recognizes active invited operators');
  const grants = (await h.db.pool.query("select r,t,has_table_privilege(r,t,'select')as readable,has_table_privilege(r,t,'insert,update,delete')as writable from unnest(array['anon','authenticated','pinevela_catalog','pinevela_backend'])r cross join unnest(array['private.content_safety_checks','private.content_safety_decisions'])t")).rows;
  check(grants.every(row => !row.writable && (row.r === 'pinevela_backend' || !row.readable)), 'No client/catalog/scoped backend can forge or modify safety decisions');
  check((await h.db.pool.query("select count(*)::int as n from pg_class where oid in('private.content_safety_checks'::regclass,'private.content_safety_decisions'::regclass)and relrowsecurity")).rows[0].n === 2, 'Both new evidence tables enable RLS');
  async function denied(work: () => Promise<any>, label: string, sqlstate: string) { let failure: any; try { await work(); } catch (error) { failure = error; } check(failure?.code === sqlstate, label); }
  await denied(() => h.db.system(c => c.query("update private.content_safety_checks set verdict='approved' where id=$1", [photoCheck.id])), 'Privileged code cannot overwrite retained moderation evidence', '42501');
  await denied(() => h.db.system(c => c.query('delete from private.content_safety_decisions where check_id=$1', [textCheck.id])), 'Privileged code cannot delete approval history', '42501');
  await denied(() => h.db.system(c => c.query('update public.listings set description=$2 where id=$1', [old.id, explicit + ' bypass attempt'])), 'Direct SQL cannot publish unapproved replacement text', '23514');
  const sellerActor = await actor(seller.user.id), missingId = crypto.randomUUID();
  await denied(() => h.db.system(c => c.query(`insert into public.media_assets(id,owner_context_id,owner_auth_user_id,purpose,object_path,byte_size,sha256)
    values($1,$2,$3,'market',$4,10,$5)`, [missingId, seller.user.id, sellerActor.authUserId, `contexts/${seller.user.id}/${missingId}.png`, 'f'.repeat(64)])), 'Direct SQL cannot create an unapproved marketplace asset', '23514');
  check((await admin.session.json(`/api/admin/customer-service/members/${agent.user.id}`, { status: 'suspended', privateKey: service.admin.approvalKey }, 'PATCH')).status === 200, 'Actual support membership can be suspended');
  check((await agent.session.request('/api/customer-service/content-checks')).status === 403, 'Suspension immediately removes queued review access');
  check((await agent.session.request(`/api/customer-service/content-checks/${photoCheck.id}/image`)).status === 403, 'Suspension immediately removes quarantined image access');
  await admin.session.json(`/api/admin/customer-service/members/${agent.user.id}`, { status: 'active', privateKey: service.admin.approvalKey }, 'PATCH');
  saveLocalFixture(h, 'content-safety-browser.json', { admin: service.admin, agent: service.agent, owner: f.buyer, seller: f.seller, other: f.other, photoCheckId: photoCheck.id, textCheckId: textCheck.id });
  const result = { passed: true, checks, actualProvider: true, actualNativeAuth: true, actualRLS: true, publicBrandImagesOnly: true, existingHostedImagesExported: 0, productionRecordsModified: 0 };
  fs.writeFileSync(path.join(h.meta.root, 'content-safety-result.json'), JSON.stringify(result, null, 2), { mode: 0o600 }); console.log(JSON.stringify(result));
}
try { await runLocalSupabaseVerification(verify, { moderation: true }); }
catch (error) { console.error(JSON.stringify({ passed: false, checks, stage, diagnostics: 'Private isolated verification log', reason: error instanceof assert.AssertionError ? error.message.slice(0, 200) : undefined })); if (process.argv[2] === '--local-supabase-worker') throw error; process.exitCode = 1; }
