import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import type { SupabaseAuth, AuthRequest } from './auth.js';
import { WorkPool, AttemptBudgets } from '../resourceSecurity.js';
import { SupabaseStorage } from './storage.js';
import { createSupportTicket, supportOperator } from './support.js';
import { bodyFields, requireAdministrator } from './adminSettings.js';
import { checkApprovalKey, deniedApprovalKey, requireApprovalGrant } from './adminGovernance.js';
import { checkProfileContext } from './profiles.js';
import { notify } from './notifications.js';
import { SAFETY_MODEL, SAFETY_POLICY, childSafetyConcern, safetyDigest, safetyVerdict, type SafetyPurpose } from './contentSafetyPolicy.js';

const jobs = new WorkPool(2, 4), budgets = new AttemptBudgets();
const inFlight = new Map<string, Promise<void>>();
const unavailable = () => new ApiError(503, 'Content checking is temporarily unavailable. Your current content has been kept. Please retry shortly.', 'moderation_unavailable');
const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
async function provider(input: string | Buffer) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) throw unavailable();
  return jobs.run(async () => {
    try {
      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: SAFETY_MODEL, input: typeof input === 'string' ? input : [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + input.toString('base64') } }] }),
      });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw unavailable(); }
      const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 131072) throw unavailable(); parts.push(part.value); } }
      finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      const data = JSON.parse(Buffer.concat(parts).toString());
      if (!Array.isArray(data.results) || data.results.length !== 1 || typeof data.model !== 'string' || typeof data.id !== 'string') throw unavailable();
      return { ...safetyVerdict(data.results[0]), model: data.model.slice(0, 120), requestId: data.id.slice(0, 160), categories: data.results[0].categories };
    } catch { throw unavailable(); } // Never return/log provider bodies, headers or credentials.
  });
}
export async function evaluateContentSafety(input: string | Buffer, filename = '') {
  if (childSafetyConcern(typeof input === 'string' ? input : filename))
    return { verdict: 'blocked' as const, sexualScore: 1, model: 'local-child-safety-guard', requestId: '', categories: { child_safety_concern: true } };
  const result = await provider(input);
  // Marketplace policy also holds explicit sales language for human review.
  // A classifier's clean result alone cannot approve an advertised porn sale.
  if (typeof input === 'string' && result.verdict === 'approved' && /\b(?:porn(?:ography|ographic)?|sexual\s+services|nudes?\s+for\s+sale)\b/i.test(input))
    return { ...result, verdict: 'review' as const, categories: { ...result.categories, marketplace_policy_terms: true } };
  return result;
}
async function cached(c: PoolClient, actor: VerifiedActor, purpose: SafetyPurpose, hash: string) {
  return (await c.query(`select m.*,coalesce(d.decision,m.verdict) as effective from private.content_safety_checks m
    left join private.content_safety_decisions d on d.check_id=m.id
    where m.owner_context_id=$1 and m.purpose=$2 and m.input_sha256=$3 and m.policy=$4 order by m.created_at desc,m.id limit 1`,
  [actor.contextId, purpose, hash, SAFETY_POLICY])).rows[0];
}
function enforce(row: any) {
  if (row?.effective === 'approved') return;
  throw new ApiError(422, row?.effective === 'review'
    ? 'This content needs a safety review before it can be published. Open Help to follow your review case; your existing content has been kept.'
    : 'This content was blocked by the explicit-content policy. Choose different content, or open Help to request a review. Your existing content has been kept.',
  row?.effective === 'review' ? 'moderation_review' : 'moderation_blocked');
}
export async function requireContentApproval(c: PoolClient, actor: VerifiedActor, purpose: SafetyPurpose, input: string | Buffer) {
  if (!(await c.query('select private.content_safety_approved($1,$2,$3) as allowed', [actor.contextId, purpose, safetyDigest(input)])).rows[0].allowed)
    throw new ApiError(422, 'This content must pass its safety check before it can be published.', 'moderation_required');
}
/** Real provider I/O runs outside transactions/row locks. Final writes recheck
 * native sessions, ownership and the exact digest; browsers supply no verdict. */
export async function moderateContent(auth: SupabaseAuth, actor: VerifiedActor, purpose: SafetyPurpose, input: string | Buffer, filename = ''): Promise<void> {
  const concern = childSafetyConcern(typeof input === 'string' ? input : filename);
  const hash = safetyDigest(input), identity = JSON.stringify([actor.contextId, purpose, hash, SAFETY_POLICY, concern]);
  const existing = await auth.db.authorizedSystem(actor, [actor.kind], c => cached(c, actor, purpose, hash));
  if (existing && (!concern || existing.model === 'local-child-safety-guard')) { enforce(existing); return; }
  const running = inFlight.get(identity); if (running) return running;
  budgets.reserve([{ scope: 'content-safety', identity: actor.contextId, maximum: 100, windowMs: 86400000 }]);
  const work = (async () => {
    const result = await evaluateContentSafety(input, filename);
    const id = crypto.randomUUID(), image = Buffer.isBuffer(input), storage = new SupabaseStorage();
    // Quarantine objects have no public media row or client Storage grant.
    const imagePath = image && result.verdict !== 'approved' ? `contexts/${actor.contextId}/${id}.png` : null;
    if (imagePath) await storage.upload(imagePath, input as Buffer);
    let saved: any;
    try {
      saved = await auth.db.authorizedSystem(actor, [actor.kind], async c => {
        await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", ['content-safety:' + identity]);
        const previous = await cached(c, actor, purpose, hash); if (previous && (!concern || previous.model === 'local-child-safety-guard')) return previous;
        const usage = (await c.query(`select count(*)::int as count,coalesce(sum(byte_size),0)::bigint as bytes from private.content_safety_checks
          where owner_context_id=$1 and created_at>clock_timestamp()-interval '24 hours'`, [actor.contextId])).rows[0];
        if (usage.count >= 100 || Number(usage.bytes) + (image ? input.length : 0) > 250 * 1024 * 1024) throw new ApiError(429, 'Your daily content-check allowance is used. Please try again later.');
        let ticketId: string | null = null;
        if (result.verdict !== 'approved') {
          const ticket = await createSupportTicket(c, actor, { subject: `Automatic content safety review · ${purpose.replaceAll('_', ' ')}`,
            body: `An automatic explicit-content check ${result.verdict === 'review' ? 'held this submission for review' : 'blocked this submission'}. The submission was not published. Open this case to ask for a review. Check reference: ${id}.`,
            category: purpose === 'avatar' ? 'account' : 'marketplace', type: 'report', source: '/help', requestKey: id });
          ticketId = ticket.id;
          const name = (await c.query('select display_name from public.profiles where id=$1', [actor.authUserId])).rows[0]?.display_name || 'Account';
          const details = `Automatic explicit-content screening ${result.verdict === 'review' ? 'requested review' : 'blocked publication'} of ${purpose.replaceAll('_', ' ')}. Review check ${id} before recommending any account sanction.`;
          await c.query(`insert into private.content_reports(ticket_id,reporter_context_id,target_type,target_id,target_context_id,target_kind,target_name,reason,details,request_fingerprint)
            values($1,$2,'profile',$2,$2,$3,$4,'unsafe',$5,$6)`, [ticketId, actor.contextId, actor.kind, name.slice(0, 300), details, hash]);
        }
        return (await c.query(`insert into private.content_safety_checks(id,owner_context_id,owner_auth_user_id,purpose,input_sha256,policy,verdict,model,provider_request_id,sexual_score,categories,image_path,byte_size,text_content,ticket_id)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *,verdict as effective`,
        [id, actor.contextId, actor.authUserId, purpose, hash, SAFETY_POLICY, result.verdict, result.model, result.requestId, result.sexualScore, JSON.stringify(result.categories), imagePath,
          image ? input.length : 0, image ? null : input, ticketId])).rows[0];
      });
    } catch (error) {
      // A lost COMMIT is ambiguous. Remove only when absence can be verified.
      if (imagePath) {
        const absent = await auth.db.statement('select not exists(select 1 from private.content_safety_checks where id=$1) as absent', [id]).then(r => r.rows[0].absent).catch(() => false);
        if (absent) await storage.remove(imagePath).catch(() => undefined);
      }
      throw error;
    }
    if (imagePath && saved.id !== id) await storage.remove(imagePath).catch(() => undefined);
    enforce(saved);
  })();
  inFlight.set(identity, work);
  try { await work; } finally { if (inFlight.get(identity) === work) inFlight.delete(identity); }
}

export function installContentSafety(app: Express, auth: SupabaseAuth) {
  const checked: RequestHandler = (req, _res, next) => { try { checkProfileContext((req as AuthRequest).actor, req.headers['x-pinevela-profile-context']); next(); } catch (e) { next(e); } };
  app.get('/api/customer-service/content-checks', auth.require(['primary', 'admin']), checked, route(async (req, res) => {
    if (Object.keys(req.query).some(key => key !== 'page') || req.query.page !== undefined && (typeof req.query.page !== 'string' || !/^(0|[1-9][0-9]{0,4})$/.test(req.query.page))) throw new ApiError(400, 'Choose a valid review page.');
    const page = Number(req.query.page || 0); if (page > 10000) throw new ApiError(400, 'Choose a valid review page.');
    res.json(await auth.db.authorizedRead(req.actor, ['primary', 'admin'], async c => {
      await supportOperator(c);
      const rows = (await c.query(`select m.id,m.purpose,m.verdict,m.sexual_score as "sexualScore",m.owner_context_id as "accountId",p.display_name as name,
        m.ticket_id as "ticketId",m.text_content as text,m.image_path is not null as "hasImage",d.decision,d.reason,m.created_at as "createdAt"
        from private.content_safety_checks m join public.profiles p on p.id=m.owner_auth_user_id left join private.content_safety_decisions d on d.check_id=m.id
        where m.verdict<>'approved' order by (d.check_id is null) desc,m.created_at desc,m.id limit 26 offset $1`, [page * 25])).rows;
      return { checks: rows.slice(0, 25), hasMore: rows.length > 25 };
    }));
  }));
  app.get('/api/customer-service/content-checks/:id/image', auth.require(['primary', 'admin']), checked, route(async (req, res) => {
    if (Object.keys(req.query).length) throw new ApiError(400, 'Unexpected image selector.');
    const id = uuid(req.params.id);
    const read = (c: PoolClient) => (async () => { await supportOperator(c); const row = (await c.query('select image_path,byte_size,input_sha256 as sha256 from private.content_safety_checks where id=$1', [id])).rows[0]; if (!row?.image_path) throw new ApiError(404, 'Review photograph not found.'); return row; })();
    const row = await auth.db.authorizedRead(req.actor, ['primary', 'admin'], read);
    const bytes = await new SupabaseStorage().download(row.image_path, row);
    await auth.db.authorizedRead(req.actor, ['primary', 'admin'], c => supportOperator(c));
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'" }).send(bytes);
  }));
  app.post('/api/admin/content-checks/:id/decision', auth.require(['admin']), checked, route(async (req, res) => {
    bodyFields(req.body, ['decision', 'reason', 'privateKey']);
    if (!['approved', 'blocked'].includes(req.body.decision) || typeof req.body.reason !== 'string' || req.body.reason.trim().length < 10 || req.body.reason.length > 2000 || /[\u0000-\u001f\u007f]/.test(req.body.reason)) throw new ApiError(400, 'Choose a decision and explain it in 10–2,000 characters.');
    budgets.reserve([{ scope: 'content-review-key', identity: req.actor.contextId, maximum: 20, windowMs: 600000 }]);
    const grant = await auth.db.authorizedSystem(req.actor, ['admin'], c => checkApprovalKey(c, req.actor, req.body.privateKey)); deniedApprovalKey(grant);
    res.json(await auth.db.authorizedSystem(req.actor, ['admin'], async c => {
      await requireAdministrator(c, req.actor); await requireApprovalGrant(c, req.actor, grant);
      const item = (await c.query('select * from private.content_safety_checks where id=$1 for update', [uuid(req.params.id)])).rows[0];
      if (!item || item.verdict === 'approved') throw new ApiError(404, 'Flagged content check not found.');
      if (item.model === 'local-child-safety-guard' && req.body.decision === 'approved') throw new ApiError(403, 'This child-safety concern requires the dedicated safety process and cannot be approved here.');
      const old = (await c.query('select * from private.content_safety_decisions where check_id=$1', [item.id])).rows[0];
      if (old) { if (old.administrator_context_id !== req.actor.contextId || old.decision !== req.body.decision || old.reason !== req.body.reason.trim()) throw new ApiError(409, 'This content check already has a recorded decision.'); return { success: true }; }
      await c.query('insert into private.content_safety_decisions(check_id,administrator_context_id,decision,reason)values($1,$2,$3,$4)', [item.id, req.actor.contextId, req.body.decision, req.body.reason.trim()]);
      await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)values($1,'content_safety_review','content_safety_check',$2)", [req.actor.contextId, item.id]);
      await notify(c, [item.owner_context_id], { category: 'support', title: 'Your content safety review was updated', message: req.body.decision === 'approved' ? 'Your submission was approved. You can retry saving the same photo or listing text. Customer service can explain the review in Help.' : 'Your submission remains blocked. You can choose different content or contact customer service through Help.', link: `/help?ticket=${item.ticket_id}` });
      return { success: true };
    }));
  }));
}
