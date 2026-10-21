/** Actual isolated GoTrue identities and saved native ciphertext, no fake JWTs,
 * provider responses or hosted product data. Run encryption + support checks first. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readLocalFixture, runLocalSupabaseVerification, saveLocalFixture, signInLocalAccount, type LocalAccountCredentials, type LocalSupabaseHarness } from './lib/local-supabase-harness.js';
import type { VerifiedActor } from '../supabase/db.js';
let checks = 0, stage = 'startup';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function verify(h: LocalSupabaseHarness) {
  stage = 'actual native identities and ciphertext fixture';
  const fixture = readLocalFixture<{ buyer: LocalAccountCredentials; seller: LocalAccountCredentials; other: LocalAccountCredentials; storeId: string; listingId: string; messageId: string; disclosureKey: string; plaintext: string }>(h, 'encrypted-chat-report-fixture.json');
  const service = readLocalFixture<{ admin: LocalAccountCredentials; agent: LocalAccountCredentials }>(h, 'support-browser.json');
  check(!!fixture && !!service, 'Use actual encryption and support integration results from this owned local run');
  const f = fixture!, s = service!;
  check(f.plaintext.includes('\u0000') && f.plaintext.includes('café'), 'Actual ciphertext fixture exercises UTF-8 Unicode and NUL disclosure');
  const buyer = await signInLocalAccount(h, f.buyer), seller = await signInLocalAccount(h, f.seller), other = await signInLocalAccount(h, f.other), admin = await signInLocalAccount(h, s.admin), agent = await signInLocalAccount(h, s.agent);
  const guest = h.session(), base = { targetType: 'store', targetId: f.storeId, reason: 'false_location', details: 'Please review the location saved on this actual store.', requestKey: crypto.randomUUID() };
  check((await guest.json('/api/reports', base)).status === 401, 'Guest cannot spoof a signed-in entity reporter');
  check((await buyer.session.request('/api/customer-service/reports')).status === 403, 'Ordinary account cannot inspect operator report queue');
  check((await buyer.session.request('/api/admin/reports')).status === 403, 'Ordinary account cannot inspect administrator review queue');
  check((await buyer.session.json('/api/reports', { ...base, reporterId: other.user.id })).status === 400, 'Reporter identity is not accepted from clients');
  check((await buyer.session.json('/api/reports', { ...base, targetType: 'profile', targetId: other.user.id })).status === 404, 'Arbitrary private profile ID cannot be reported or enumerated');
  check((await buyer.session.json('/api/reports', { ...base, targetId: crypto.randomUUID() })).status === 404, 'Missing or private store cannot be claimed as a public target');
  check((await seller.session.json('/api/reports', base)).status === 400, 'Seller cannot report their own public store');
  check((await buyer.session.request('/api/reports', { headers: { 'X-PineVela-Profile-Context': other.user.id } })).status === 409, 'Stale profile context is rejected');

  stage = 'idempotent linked support reports and account isolation';
  const submitted = await buyer.session.json('/api/reports', base);
  check(submitted.status === 201 && submitted.data.report.targetContextId === seller.user.id && submitted.data.requesterId === buyer.user.id, 'Server derives target seller and actual requester');
  const id = submitted.data.id, report = submitted.data.report;
  check((await buyer.session.json('/api/reports', base)).data?.id === id, 'Exact retry reuses one actual support ticket');
  check((await buyer.session.json('/api/reports', { ...base, details: 'Changed content cannot replace the saved report.' })).status === 409, 'Changed report retry cannot overwrite original evidence');
  const own = await buyer.session.request('/api/reports'), foreign = await other.session.request('/api/reports'), targetList = await seller.session.request('/api/reports');
  check(own.data.reports.some((r: any) => r.ticketId === id) && !foreign.data.reports.some((r: any) => r.ticketId === id) && !targetList.data.reports.some((r: any) => r.ticketId === id), 'Reporter list stays private from unrelated and reported identities');
  check((await seller.session.request(`/api/support/tickets/${id}`)).status === 404, 'Reported account cannot inspect reporter name, email or case');
  check((await other.session.request(`/api/support/tickets/${id}`)).status === 404, 'Unrelated account cannot inspect actual linked support case');
  check((await buyer.session.request(`/api/support/tickets/${id}`)).status === 200, 'Reporter tracks report using existing support case');
  check((await agent.session.request(`/api/customer-service/reports/${id}`)).data?.report?.ticketId === id, 'Active invited customer service can inspect report');
  check((await agent.session.request('/api/customer-service/reports')).data?.reports?.some((r: any) => r.ticketId === id), 'Dedicated operator report list includes actual report');
  check((await admin.session.request('/api/admin/reports')).data?.reports?.some((r: any) => r.ticketId === id), 'Administrator review list includes actual report');
  const filtered = await agent.session.request('/api/customer-service/reports?page=0&status=submitted');
  check(filtered.status === 200 && filtered.data.reports.every((r: any) => r.status === 'submitted') && filtered.data.reports.length <= 25 && typeof filtered.data.hasMore === 'boolean', 'Operator filters run on the server with bounded pages');
  const olderPage = await admin.session.request('/api/admin/reports?page=10000&status=recommended');
  check(olderPage.status === 200 && olderPage.data.reports.length === 0 && olderPage.data.hasMore === false, 'Valid later administrator page safely reports no more records');
  check((await agent.session.request('/api/customer-service/reports?page=-1')).status === 400, 'Negative report pagination cannot bypass bounds');
  check((await agent.session.request('/api/customer-service/reports?page=0&page=1')).status === 400, 'Duplicate page query selectors are rejected');
  check((await admin.session.request('/api/admin/reports?status=unknown')).status === 400, 'Unsupported administrator report status is rejected');
  check((await admin.session.request(`/api/admin/reports?reporterId=${other.user.id}`)).status === 400, 'Queue filters cannot impersonate another reporter');
  check((await buyer.session.request('/api/reports?page=0')).status === 400, 'Own report endpoint cannot be widened into queue filters');
  check((await buyer.session.json('/api/reports', { ...base, targetType: 'listing', targetId: f.listingId, reason: 'broken_item', requestKey: crypto.randomUUID() })).status === 201, 'Actual visible item can be reported for damage');
  check((await buyer.session.json('/api/reports', { ...base, targetType: 'profile', targetId: seller.user.id, reason: 'false_identity', requestKey: crypto.randomUUID() })).status === 201, 'Actual visible seller identity can be reported');

  stage = 'authenticated single-message evidence and no arbitrary plaintext';
  const messageReport = { targetType: 'message', targetId: f.messageId, reason: 'harassment', details: 'Please review this selected message from my own conversation.', requestKey: crypto.randomUUID(), evidence: { messageId: f.messageId, key: f.disclosureKey, consent: true } };
  check((await buyer.session.json('/api/reports', { ...messageReport, evidence: { ...messageReport.evidence, consent: false } })).status === 400, 'Explicit selected-message disclosure consent is mandatory');
  check((await buyer.session.json('/api/reports', { ...messageReport, evidence: { ...messageReport.evidence, plaintext: 'An invented accusation.' } })).status === 400, 'Server rejects arbitrary plaintext offered as verified evidence');
  check((await buyer.session.json('/api/reports', { ...messageReport, evidence: { ...messageReport.evidence, key: crypto.randomBytes(32).toString('base64url') } })).status === 400, 'Wrong AES key cannot authenticate stored ciphertext');
  check((await other.session.json('/api/reports', messageReport)).status === 404, 'A disclosure key cannot authorize a nonparticipant to report private messages');
  const evidence = await buyer.session.json('/api/reports', messageReport);
  check(evidence.status === 201 && !evidence.data.report.evidence, 'Message report is stored without leaking evidence into requester projection');
  const proofId = evidence.data.id;
  const proof = await agent.session.request(`/api/customer-service/reports/${proofId}`);
  check(proof.data.report.evidence.text === f.plaintext && proof.data.report.evidence.encrypted === true, 'Operator sees only exact authenticated selected-message text');
  const stored = (await h.db.pool.query('select * from private.content_report_evidence where ticket_id=$1', [proofId])).rows[0];
  check(stored.message_snapshot.encryptedPayload?.ciphertext && !JSON.stringify(stored).includes(f.disclosureKey), 'Database retains exact ciphertext snapshot and never the disclosure key');
  check(Buffer.isBuffer(stored.plaintext) && stored.plaintext.equals(Buffer.from(f.plaintext, 'utf8')), 'UTF-8 bytea migration preserves exact Unicode and NUL evidence bytes');
  check((await h.db.pool.query('select count(*)::int as n from private.content_report_evidence where ticket_id=$1', [proofId])).rows[0].n === 1, 'Only the selected message is disclosed');

  stage = 'operator recommendations do not apply sanctions';
  const before = JSON.stringify((await h.db.pool.query(`select x.status,private.account_access(x.id) as access,s.status as store_status from public.account_contexts x join public.stores s on s.seller_context_id=x.id where x.id=$1`, [seller.user.id])).rows[0]);
  const recommendation = { action: 'ban', reason: 'The reported location should receive a separate administrator policy review.', version: report.version, requestKey: crypto.randomUUID() };
  check((await buyer.session.json(`/api/customer-service/reports/${id}/recommend`, recommendation)).status === 403, 'Reporter cannot recommend administrator sanctions as an operator');
  const recommended = await agent.session.json(`/api/customer-service/reports/${id}/recommend`, recommendation);
  check(recommended.status === 200 && recommended.data.report.status === 'recommended', 'Customer service submits immutable recommendation');
  check((await agent.session.json(`/api/customer-service/reports/${id}/recommend`, recommendation)).status === 200, 'Exact recommendation retry is idempotent');
  check((await agent.session.json(`/api/customer-service/reports/${id}/recommend`, { ...recommendation, action: 'delete' })).status === 409, 'Changed retry cannot replace reviewed recommendation');
  check(JSON.stringify((await h.db.pool.query(`select x.status,private.account_access(x.id) as access,s.status as store_status from public.account_contexts x join public.stores s on s.seller_context_id=x.id where x.id=$1`, [seller.user.id])).rows[0]) === before, 'Recommendation does not ban, delete, restrict or unpublish target');
  const decision = { decision: 'escalate', reason: 'Further review is needed through the existing account approvals.', version: recommended.data.report.version, privateKey: s.admin.approvalKey };
  check((await agent.session.json(`/api/admin/reports/${id}/decision`, decision)).status === 403, 'Customer-service role cannot decide administrator review');
  check((await admin.session.json(`/api/admin/reports/${id}/decision`, { ...decision, privateKey: 'wrong-key' })).status === 403, 'Administrator role alone cannot authorize a review decision');
  check((await admin.session.json(`/api/admin/reports/${id}/decision`, { ...decision, version: report.version })).status === 409, 'Stale administrator decision cannot overwrite current review');
  check((await admin.session.json(`/api/admin/reports/${id}/decision`, { ...decision, proposalId: crypto.randomUUID() })).status === 400, 'Random or mismatched proposal ID cannot be linked');
  const decided = await admin.session.json(`/api/admin/reports/${id}/decision`, decision);
  check(decided.status === 200 && decided.data.report.status === 'escalated', 'Own keyed administrator records escalation without applying sanctions');
  check((await admin.session.json(`/api/admin/reports/${id}/decision`, decision)).status === 200, 'Exact administrator decision retry is idempotent');
  check((await admin.session.json(`/api/admin/reports/${id}/decision`, { ...decision, decision: 'dismiss' })).status === 409, 'Recorded administrator review cannot be silently changed');
  check(JSON.stringify((await h.db.pool.query(`select x.status,private.account_access(x.id) as access,s.status as store_status from public.account_contexts x join public.stores s on s.seller_context_id=x.id where x.id=$1`, [seller.user.id])).rows[0]) === before, 'Escalation leaves existing governed account policy unchanged');
  check((await admin.session.json(`/api/admin/reports/${id}/apply`, { privateKey: s.admin.approvalKey, action: 'delete' })).status === 404, 'No report endpoint offers direct sanction or deletion');
  check((await buyer.session.request('/api/reports')).data.reports.find((r: any) => r.ticketId === id)?.recommendation === undefined, 'Requester projection excludes internal recommendation and administrator reasons');
  check(!(await seller.session.request('/api/notifications')).data.some((n: any) => n.link === `/help?ticket=${id}` || n.link === `/customer-service?ticket=${id}`), 'Reported user receives no reporter identity or confidential review notification');
  check((await buyer.session.request('/api/notifications')).data.some((n: any) => n.link === `/help?ticket=${id}`), 'Reporter receives their own outcome notice');

  stage = 'migration RLS, privileges and immutable retained history';
  async function actor(contextId: string): Promise<VerifiedActor> { return (await h.db.pool.query(`select b.auth_user_id as "authUserId",b.session_id as "sessionId",x.id as "contextId",x.kind from private.account_sessions b join auth.sessions s on s.id=b.session_id join public.account_contexts x on x.id=b.active_context_id where x.id=$1 order by s.created_at desc limit 1`, [contextId])).rows[0]; }
  const buyerActor = await actor(buyer.user.id), otherActor = await actor(other.user.id), agentActor = await actor(agent.user.id);
  check((await h.db.readActor(buyerActor, c => c.query('select ticket_id from private.content_reports where ticket_id=$1', [id]))).rowCount === 1, 'Scoped backend RLS admits own report');
  check((await h.db.readActor(otherActor, c => c.query('select ticket_id from private.content_reports where ticket_id=$1', [id]))).rowCount === 0, 'Scoped backend RLS hides unrelated reports');
  check((await h.db.readActor(buyerActor, c => c.query('select ticket_id from private.content_report_evidence where ticket_id=$1', [proofId]))).rowCount === 0, 'Requester cannot use scoped role to access operator evidence');
  check((await h.db.readActor(agentActor, c => c.query('select ticket_id from private.content_report_evidence where ticket_id=$1', [proofId]))).rowCount === 1, 'Active support membership admits selected evidence under RLS');
  const tables = ['content_reports', 'content_report_evidence', 'content_report_recommendations', 'content_report_decisions', 'content_report_events'];
  const privileges = (await h.db.pool.query(`select role,table_name,has_table_privilege(role,'private.'||table_name,'select') as readable,has_table_privilege(role,'private.'||table_name,'insert,update,delete') as writable from unnest(array['anon','authenticated','pinevela_catalog','pinevela_backend'])role cross join unnest($1::text[])table_name`, [tables])).rows;
  check(privileges.every(r => !r.writable && (r.role === 'pinevela_backend' || !r.readable)), 'All report tables deny browser/catalog access and every scoped backend write');
  check((await h.db.pool.query(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname=any($1::text[]) and c.relrowsecurity`, [tables])).rows[0].n === 5, 'Every migration table has RLS enabled');
  async function immutable(sql: string, values: unknown[]) { let denied = false; try { await h.db.system(c => c.query(sql, values)); } catch (e) { denied = (e as any).code === '42501'; } check(denied, 'History trigger rejects mutation even from privileged application connection'); }
  await immutable('update private.content_reports set target_id=$2 where ticket_id=$1', [id, other.user.id]);
  await immutable("update private.content_report_evidence set plaintext='forged evidence' where ticket_id=$1", [proofId]);
  await immutable("update private.content_report_recommendations set action='delete' where ticket_id=$1", [id]);
  await immutable('delete from private.content_report_decisions where ticket_id=$1', [id]);
  await immutable('delete from private.content_report_events where ticket_id=$1', [id]);
  check((await admin.session.json(`/api/admin/customer-service/members/${agent.user.id}`, { status: 'suspended', privateKey: s.admin.approvalKey }, 'PATCH')).status === 200, 'Administrator suspends actual support membership');
  check((await agent.session.request(`/api/customer-service/reports/${proofId}`)).status === 403, 'Existing native cookie immediately loses moderation access on suspension');
  check((await h.db.readActor(agentActor, c => c.query('select ticket_id from private.content_report_evidence where ticket_id=$1', [proofId]))).rowCount === 0, 'RLS immediately removes suspended evidence access');
  await admin.session.json(`/api/admin/customer-service/members/${agent.user.id}`, { status: 'active', privateKey: s.admin.approvalKey }, 'PATCH');
  await h.assertOwned();
  const result = { passed: true, checks, actualNativeAuth: true, actualRLS: true, actualStoredCiphertext: true, noSanctionsBypass: true, productionRecordsModified: 0 };
  fs.writeFileSync(path.join(h.meta.root, 'pinevela-harness', 'moderation-result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  saveLocalFixture(h, 'report-browser.json', { runId: h.meta.runId, metadataPath: process.argv[3], ...s, reporter: f.buyer, buyer: f.buyer, seller: f.seller, other: f.other, storeId: f.storeId, listingId: f.listingId, sellerContextId: seller.user.id, reportId: id, ticketId: id, messageTicketId: proofId });
  console.log(JSON.stringify(result));
}
try { await runLocalSupabaseVerification(verify); }
catch (e) { console.error(JSON.stringify({ passed: false, stage, checks, diagnostics: 'Inspect the private isolated run log.' })); if (process.argv[2] === '--local-supabase-worker') throw e; process.exitCode = 1; }
