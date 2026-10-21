/** Operator-only audit of actual existing bytes/text. No synthetic actors,
 * account creation, storage deletion or unverified "legacy safe" exemptions. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { SupabaseDatabase } from '../../supabase/db.js';
import { SupabaseStorage } from '../../supabase/storage.js';
import { evaluateContentSafety } from '../../supabase/contentSafety.js';
import { SAFETY_POLICY, listingSafetyText, storeSafetyText, safetyDigest, type SafetyPurpose } from '../../supabase/contentSafetyPolicy.js';

type Evidence = { kind: 'media' | 'listing' | 'store'; resourceId: string; contextId: string; authUserId: string; purpose: SafetyPurpose;
  sha256: string; byteSize: number; text: string | null; result: Awaited<ReturnType<typeof evaluateContentSafety>> };
export async function captureExistingSafety(db: SupabaseDatabase, evidencePath: string) {
  const directory = fs.realpathSync(evidencePath.slice(0, evidencePath.lastIndexOf('/')));
  if (!(directory.startsWith('/tmp/') || directory.includes('/.security/')) || fs.statSync(directory).mode & 0o077) throw Error('Private evidence directory required.');
  const storage = new SupabaseStorage();
  let evidence: Evidence[] = [];
  if (fs.existsSync(evidencePath)) {
    const stat = fs.lstatSync(evidencePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 16 * 1024 * 1024) throw Error('Private scan checkpoint required.');
    const previous = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    if (previous.policy !== SAFETY_POLICY || previous.version !== 1 || !Array.isArray(previous.evidence)) throw Error('Unsupported scan checkpoint.');
    evidence = previous.evidence;
  }
  const checkpoint = (complete: boolean) => {
    const temporary = evidencePath + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, policy: SAFETY_POLICY, complete, evidence }, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, evidencePath);
  };
  const reused = (kind: Evidence['kind'], id: string, context: string, subject: string, purpose: SafetyPurpose, digest: string) => {
    const old = evidence.find(item => item.kind === kind && item.resourceId === id);
    if (!old) return false;
    if (old.contextId !== context || old.authUserId !== subject || old.purpose !== purpose || old.sha256 !== digest || !old.result.requestId) throw Error('Content changed since its scan checkpoint.');
    return true;
  };
  checkpoint(false);
  const media = (await db.pool.query("select id,owner_context_id,owner_auth_user_id,purpose,object_path,byte_size,sha256 from public.media_assets where purpose in('market','avatar') and state='ready' order by id")).rows;
  for (const asset of media) {
    const purpose = asset.purpose === 'market' ? 'market_image' : 'avatar';
    if (reused('media', asset.id, asset.owner_context_id, asset.owner_auth_user_id, purpose, asset.sha256)) continue;
    const bytes = await storage.downloadForBackup(asset.object_path, { byte_size: Number(asset.byte_size), sha256: asset.sha256 }, 60000);
    try { evidence.push({ kind: 'media', resourceId: asset.id, contextId: asset.owner_context_id, authUserId: asset.owner_auth_user_id,
      purpose: asset.purpose === 'market' ? 'market_image' : 'avatar', sha256: safetyDigest(bytes), byteSize: bytes.length, text: null, result: await evaluateContentSafety(bytes) }); }
    finally { bytes.fill(0); }
    checkpoint(false);
  }
  const stores = (await db.pool.query('select s.*,c.auth_user_id from public.stores s join public.account_contexts c on c.id=s.seller_context_id where s.setup_completed_at is not null order by s.id')).rows;
  for (const store of stores) {
    const text = storeSafetyText({ storeName: store.name, username: store.username, description: store.description, category: store.primary_category, location: store.location });
    if (reused('store', store.id, store.seller_context_id, store.auth_user_id, 'store_text', safetyDigest(text))) continue;
    evidence.push({ kind: 'store', resourceId: store.id, contextId: store.seller_context_id, authUserId: store.auth_user_id, purpose: 'store_text', sha256: safetyDigest(text), byteSize: 0, text, result: await evaluateContentSafety(text) });
    checkpoint(false);
  }
  const listings = (await db.pool.query(`select l.*,s.seller_context_id,c.auth_user_id,
    coalesce((select jsonb_agg(jsonb_build_object('name',o.label)order by o.sort_order)from public.listing_price_options o where o.listing_id=l.id),'[]'::jsonb)as options
    from public.listings l join public.stores s on s.id=l.store_id join public.account_contexts c on c.id=s.seller_context_id where l.retired_at is null order by l.id`)).rows;
  for (const listing of listings) {
    const text = listingSafetyText({ ...listing, serviceCategory: listing.service_category, location: listing.meeting_location, priceCategories: listing.options });
    if (reused('listing', listing.id, listing.seller_context_id, listing.auth_user_id, 'listing_text', safetyDigest(text))) continue;
    evidence.push({ kind: 'listing', resourceId: listing.id, contextId: listing.seller_context_id, authUserId: listing.auth_user_id, purpose: 'listing_text', sha256: safetyDigest(text), byteSize: 0, text, result: await evaluateContentSafety(text) });
    checkpoint(false);
  }
  if (evidence.length !== media.length + stores.length + listings.length) throw Error('Existing content changed during the scan; review the checkpoint.');
  checkpoint(true);
  const flagged = evidence.filter(item => item.result.verdict !== 'approved').length;
  if (flagged) throw Error(`Existing-content audit contains ${flagged} flagged submissions. Keep them unpublished and review the private evidence before cutover.`);
  return { images: media.length, stores: stores.length, listings: listings.length, actualProviderChecks: evidence.length, flagged };
}
export async function applyExistingSafety(db: SupabaseDatabase, evidencePath: string) {
  const stat = fs.lstatSync(evidencePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 16 * 1024 * 1024) throw Error('Private actual-provider evidence required.');
  const capture = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  if (capture.policy !== SAFETY_POLICY || capture.version !== 1 || capture.complete !== true || !Array.isArray(capture.evidence)) throw Error('A completed actual-provider scan is required.');
  let approved = 0;
  await db.system(async c => {
    for (const item of capture.evidence as Evidence[]) {
      if (item.result.verdict !== 'approved' || !item.result.requestId || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('Unapproved or invalid evidence cannot be applied.');
      let actual: any;
      if (item.kind === 'media') actual = (await c.query("select owner_context_id as context,owner_auth_user_id as subject,sha256 as digest from public.media_assets where id=$1 and state='ready' and purpose in('market','avatar') for share", [item.resourceId])).rows[0];
      else if (item.kind === 'listing') actual = (await c.query('select s.seller_context_id as context,x.auth_user_id as subject,private.listing_text_digest(l.id)as digest from public.listings l join public.stores s on s.id=l.store_id join public.account_contexts x on x.id=s.seller_context_id where l.id=$1 and l.retired_at is null for share of l,s', [item.resourceId])).rows[0];
      else if (item.kind === 'store') actual = (await c.query('select s.seller_context_id as context,x.auth_user_id as subject,private.store_text_digest(s.id)as digest from public.stores s join public.account_contexts x on x.id=s.seller_context_id where s.id=$1 and s.setup_completed_at is not null for share of s', [item.resourceId])).rows[0];
      if (!actual || actual.context !== item.contextId || actual.subject !== item.authUserId || actual.digest !== item.sha256) throw Error('Content changed since its actual-provider audit.');
      const current = (await c.query('select private.content_safety_approved($1,$2,$3)as approved', [item.contextId, item.purpose, item.sha256])).rows[0].approved;
      if (!current) {
        await c.query(`insert into private.content_safety_checks(id,owner_context_id,owner_auth_user_id,purpose,input_sha256,policy,verdict,model,provider_request_id,sexual_score,categories,byte_size,text_content)
          values($1,$2,$3,$4,$5,$6,'approved',$7,$8,$9,$10,$11,$12)`, [crypto.randomUUID(), item.contextId, item.authUserId, item.purpose, item.sha256, SAFETY_POLICY, item.result.model,
          item.result.requestId, item.result.sexualScore, JSON.stringify(item.result.categories), item.byteSize, item.text]); approved++;
      }
    }
  });
  return { approved, scanned: capture.evidence.length, syntheticApprovals: 0 };
}
