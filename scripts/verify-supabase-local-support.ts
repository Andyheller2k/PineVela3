/** Genuine isolated GoTrue identities, real HTTP/RLS and real captured mail.
 * Does not load the hosted .env or fabricate tokens/provider responses. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createLocalPrimary, readLocalFixture, runLocalSupabaseVerification, saveLocalFixture, signInLocalAccount, type LocalSupabaseHarness } from './lib/local-supabase-harness.js';
import { deliverSupportEmail } from '../supabase/supportEmail.js';
import type { VerifiedActor } from '../supabase/db.js';

let checks = 0, stage = 'startup';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function verify(h: LocalSupabaseHarness) {
  process.env.SUPPORT_MAILPIT_URL = h.meta.mailUrl;
  stage = 'native verified identities';
  const founder = await createLocalPrimary(h, 'support-founder');
  let founderId = readLocalFixture<{ id: string }>(h, 'support-founder-context.json')?.id;
  if (!founderId) { founderId = await h.bootstrapFounder(founder.session); saveLocalFixture(h, 'support-founder-context.json', { id: founderId }); }
  const admin = await signInLocalAccount(h, { ...founder.credentials, contextId: founderId, accountKind: 'admin' });
  let approval = readLocalFixture<{ key: string }>(h, 'support-approval.json')?.key;
  if (!approval) { const result = await admin.session.json('/api/admin/governance/keys/enroll', {}); check(result.status === 200, 'Actual founder enrolls approval key'); approval = result.data.privateKey; saveLocalFixture(h, 'support-approval.json', { key: approval }); }
  const nonce = crypto.randomBytes(3).toString('hex');
  const agent = await createLocalPrimary(h, `support-agent-${nonce}`), owner = await createLocalPrimary(h, `support-requester-${nonce}`), other = await createLocalPrimary(h, `support-other-${nonce}`);
  const guest = h.session();
  check((await guest.request('/api/support/tickets')).status === 401, 'Guest cannot list account requests');
  check((await owner.session.request('/api/customer-service/tickets')).status === 403, 'Ordinary account cannot view support queue');
  check((await owner.session.json('/api/admin/customer-service/invitations', { email: agent.credentials.email, fullName: 'Invited support operator', privateKey: approval })).status === 403, 'Primary cannot issue support invitation');
  check((await admin.session.json('/api/admin/customer-service/invitations', { email: agent.credentials.email, fullName: 'Invited support operator', privateKey: 'wrong-key' })).status === 403, 'Administrator role alone cannot issue invitation');

  stage = 'verified invitation enrollment';
  const invitation = await admin.session.json('/api/admin/customer-service/invitations', { email: agent.credentials.email, fullName: 'Invited support operator', privateKey: approval });
  check(invitation.status === 201 && /^[A-Za-z0-9_-]{43}$/.test(invitation.data?.invitationToken), 'Actual keyed admin issues private invitation');
  const token = invitation.data.invitationToken;
  check((await other.session.json('/api/auth/support-invitation/inspect', { invitationToken: token })).status === 403, 'Wrong verified email cannot inspect invitation');
  check((await other.session.json('/api/auth/support-invitation/accept', { invitationToken: token })).status === 403, 'Wrong verified email cannot accept invitation');
  const inspected = await agent.session.json('/api/auth/support-invitation/inspect', { invitationToken: token });
  check(inspected.status === 200 && inspected.data.email === agent.credentials.email, 'Invited verified email can inspect invitation');
  const accepted = await agent.session.json('/api/auth/support-invitation/accept', { invitationToken: token });
  check(accepted.status === 200 && accepted.data.accessAvailable === true, 'Acceptance creates active support membership');
  check((await agent.session.request('/api/auth/me')).data?.customerService === true, 'Auth projection derives support flag from actual membership');
  check((await agent.session.request('/api/customer-service/tickets')).status === 200, 'Invited support account can open queue');
  const agentId = agent.user.id;

  stage = 'account ownership and durable idempotent requests';
  const create = { subject: 'Question about my marketplace subscription', body: 'Please clarify where the saved subscription expiry is shown.', category: 'marketplace', type: 'question', source: '/user/dashboard', requestKey: crypto.randomUUID() };
  const badIdentity = await owner.session.json('/api/support/tickets', { ...create, userId: other.user.id });
  check(badIdentity.status === 400, 'Client-supplied account ownership is rejected');
  const created = await owner.session.json('/api/support/tickets', create);
  check(created.status === 201 && created.data.requesterId === owner.user.id && created.data.requesterEmail === owner.credentials.email, 'Identity and registered email are derived from genuine session');
  const id = created.data.id;
  const duplicate = await owner.session.json('/api/support/tickets', create);
  check(duplicate.status === 201 && duplicate.data.id === id, 'Exact creation retry creates one case');
  check((await owner.session.json('/api/support/tickets', { ...create, body: 'A different report cannot reuse the same operation key.' })).status === 409, 'Changed submission cannot silently reuse an earlier operation key');
  check((await other.session.request(`/api/support/tickets/${id}`)).status === 404, 'Other account cannot read case');
  check((await other.session.json(`/api/support/tickets/${id}/replies`, { body: 'Cross-account follow-up attempt', requestKey: crypto.randomUUID(), version: 1 })).status === 404, 'Other account cannot write case');
  check((await other.session.json(`/api/support/tickets/${id}`, { status: 'open', version: 1 }, 'PATCH')).status === 404, 'Other account cannot reopen case');
  check((await owner.session.request('/api/support/tickets', { headers: { 'X-PineVela-Profile-Context': other.user.id } })).status === 409, 'Stale or spoofed active-account header is rejected');
  const ownerList = await owner.session.request('/api/support/tickets'), otherList = await other.session.request('/api/support/tickets');
  check(ownerList.data.some((t: any) => t.id === id) && !otherList.data.some((t: any) => t.id === id), 'API lists remain account isolated');

  stage = 'scoped SQL reads and no browser table authority';
  async function actor(contextId: string): Promise<VerifiedActor> {
    const row = (await h.db.pool.query(`select b.auth_user_id as "authUserId",b.session_id as "sessionId",x.id as "contextId",x.kind
      from private.account_sessions b join auth.sessions s on s.id=b.session_id join public.account_contexts x on x.id=b.active_context_id
      where b.active_context_id=$1 order by s.created_at desc limit 1`, [contextId])).rows[0];
    check(!!row, 'Actor derives from actual live native binding'); return row;
  }
  const ownerActor = await actor(owner.user.id), otherActor = await actor(other.user.id), agentActor = await actor(agentId);
  check((await h.db.readActor(ownerActor, c => c.query('select id from private.support_tickets where id=$1', [id]))).rowCount === 1, 'RLS admits own case');
  check((await h.db.readActor(otherActor, c => c.query('select id from private.support_tickets where id=$1', [id]))).rowCount === 0, 'RLS hides other account case');
  check((await h.db.readActor(agentActor, c => c.query('select id from private.support_tickets where id=$1', [id]))).rowCount === 1, 'RLS admits live invited support reader');
  const grants = await h.db.pool.query(`select role,has_table_privilege(role,'private.support_tickets','select') as read,
    has_table_privilege(role,'private.support_tickets','insert') as write,
    has_table_privilege(role,'private.support_memberships','insert') as enroll from unnest(array['anon','authenticated','pinevela_catalog','pinevela_backend'])role`);
  check(grants.rows.every(r => !r.write && !r.enroll && (r.role === 'pinevela_backend' || !r.read)), 'Browser/catalog roles have no case access or support enrollment grants');
  check((await h.db.pool.query(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'support_%' and c.relkind='r' and c.relrowsecurity`)).rows[0].n === 6, 'All six support tables have RLS enabled');

  stage = 'private notes and public response notification';
  const note = await agent.session.json(`/api/customer-service/tickets/${id}/replies`, { body: 'Internal review: checking the subscription record.', internal: true, requestKey: crypto.randomUUID(), version: created.data.version });
  check(note.status === 200 && note.data.messages.some((m: any) => m.internal), 'Support can save internal case note');
  check(!(await owner.session.request(`/api/support/tickets/${id}`)).data.messages.some((m: any) => m.internal), 'Requester API does not expose internal notes');
  check((await h.db.readActor(ownerActor, c => c.query('select id from private.support_messages where ticket_id=$1 and internal', [id]))).rowCount === 0, 'RLS also hides internal notes from requester');
  const beforeMail = (await h.db.pool.query('select count(*)::int as n from private.support_email_outbox where ticket_id=$1', [id])).rows[0].n;
  check(beforeMail === 0, 'Internal notes do not enqueue email');
  const replyBody = { body: 'Open the seller dashboard and choose Subscription to view the saved plan and expiry.', internal: false, requestKey: crypto.randomUUID(), version: note.data.version };
  const reply = await agent.session.json(`/api/customer-service/tickets/${id}/replies`, replyBody);
  check(reply.status === 200 && reply.data.status === 'awaiting_user', 'Public agent reply updates case state');
  const repeated = await agent.session.json(`/api/customer-service/tickets/${id}/replies`, replyBody);
  check(repeated.status === 200 && repeated.data.messages.length === reply.data.messages.length, 'Reply retry does not duplicate message');
  const outbox = (await h.db.pool.query('select * from private.support_email_outbox where ticket_id=$1', [id])).rows;
  check(outbox.length === 1 && outbox[0].recipient_email === owner.credentials.email, 'One reply email targets the exact registered requester');
  const notices = await owner.session.request('/api/notifications');
  check(notices.data.some((n: any) => n.category === 'support' && n.link === `/help?ticket=${id}` && n.message === replyBody.body), 'Actual notification API exposes reply to the requester');
  check(!(await other.session.request('/api/notifications')).data.some((n: any) => n.link === `/help?ticket=${id}`), 'Unrelated account receives no case notification');
  await deliverSupportEmail(h.db);
  let sent = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    sent = (await h.db.pool.query('select status from private.support_email_outbox where ticket_id=$1', [id])).rows[0]?.status === 'sent';
    if (sent) break; await new Promise(r => setTimeout(r, 200));
  }
  check(sent, 'Real local email provider confirms acceptance');
  const mail = await fetch(h.meta.mailUrl + '/api/v1/messages').then(r => r.json());
  const received = mail.messages.find((m: any) => m.Subject.includes(reply.data.reference) && m.To.some((to: any) => to.Address === owner.credentials.email));
  check(!!received, 'Actual Mailpit mailbox contains the addressed support email');
  const fullMail = await fetch(`${h.meta.mailUrl}/api/v1/message/${received.ID}`).then(r => r.json());
  check(fullMail.Text.includes(replyBody.body) && !fullMail.Text.includes('Internal review'), 'Delivered text includes public response without private note');
  await h.db.pool.query(`update private.support_email_outbox set status='sending',attempts=8,
    lease_until=clock_timestamp()-interval'1 second' where id=$1`, [outbox[0].id]);
  await deliverSupportEmail(h.db);
  check((await h.db.pool.query('select status from private.support_email_outbox where id=$1', [outbox[0].id])).rows[0].status === 'failed', 'An expired final-attempt lease becomes an actionable failure');
  check((await agent.session.json(`/api/customer-service/tickets/${id}/retry-email`, {})).status === 200, 'Authorized customer service can retry a failed delivery');
  for (let attempt = 0; attempt < 25; attempt++) {
    sent = (await h.db.pool.query('select status from private.support_email_outbox where id=$1', [outbox[0].id])).rows[0]?.status === 'sent';
    if (sent) break; await new Promise(r => setTimeout(r, 200));
  }
  check(sent, 'A manual retry reaches the real local mail provider');

  stage = 'assignment, version conflicts, close and reopen';
  const assigned = await agent.session.json(`/api/customer-service/tickets/${id}`, { assignedTo: agentId, priority: 'high', status: 'in_progress', version: reply.data.version }, 'PATCH');
  check(assigned.status === 200 && assigned.data.assignedTo === agentId && assigned.data.priority === 'high', 'Agent assigns case to active member and changes priority');
  check((await agent.session.json(`/api/customer-service/tickets/${id}`, { status: 'resolved', version: reply.data.version }, 'PATCH')).status === 409, 'Stale case version cannot overwrite current state');
  const resolved = await agent.session.json(`/api/customer-service/tickets/${id}`, { status: 'resolved', version: assigned.data.version }, 'PATCH');
  check(resolved.status === 200, 'Agent resolves case');
  const reopened = await owner.session.json(`/api/support/tickets/${id}`, { status: 'open', version: resolved.data.version }, 'PATCH');
  check(reopened.status === 200 && reopened.data.status === 'open', 'Only requester can reopen owned resolved case');
  const concurrentVersion = reopened.data.version;
  const raced = await Promise.all(['Follow-up one from requester.', 'Follow-up two from requester.'].map(body => owner.session.json(`/api/support/tickets/${id}/replies`, { body, requestKey: crypto.randomUUID(), version: concurrentVersion })));
  check(raced.filter(r => r.status === 200).length === 1 && raced.filter(r => r.status === 409).length === 1, 'Concurrent replies serialize and reject conflicting stale write');

  stage = 'guest reporting and private capability boundaries';
  const guestCode = crypto.randomBytes(32).toString('base64url');
  const guestTicket = await guest.json('/api/public/support/tickets', { subject: 'Cannot find the account recovery action', body: 'Where should I start password recovery from the login page?', category: 'account', type: 'question', source: '/login', name: 'Guest support requester', email: other.credentials.email, accessToken: guestCode, requestKey: crypto.randomUUID() });
  check(guestTicket.status === 201 && guestTicket.data.requesterId === null, 'Visitor can submit a guest report without impersonating registered email');
  const guestId = guestTicket.data.id;
  check((await guest.json(`/api/public/support/tickets/${guestId}/read`, { accessToken: crypto.randomBytes(32).toString('base64url') })).status === 404, 'Wrong private guest code cannot read case');
  check((await guest.json(`/api/public/support/tickets/${guestId}/read`, { accessToken: guestCode })).status === 200, 'Saved private code opens guest case');
  check((await other.session.request(`/api/support/tickets/${guestId}`)).status === 404, 'Matching account email alone cannot claim guest case');
  const guestHash = (await h.db.pool.query('select guest_token_digest from private.support_tickets where id=$1', [guestId])).rows[0].guest_token_digest;
  check(guestHash !== guestCode && guestHash === crypto.createHash('sha256').update(guestCode).digest('hex'), 'Database retains digest, never the guest access secret');
  check((await owner.session.request(`/api/public/support/tickets/${id}/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: guestCode }) })).status === 404, 'Public route cannot unlock an authenticated case');

  stage = 'immediate support suspension and invitation replay';
  const suspend = await admin.session.json(`/api/admin/customer-service/members/${agentId}`, { status: 'suspended', privateKey: approval }, 'PATCH');
  check(suspend.status === 200, 'Administrator can suspend support membership');
  check((await agent.session.request('/api/customer-service/tickets')).status === 403, 'Existing native cookie loses queue access immediately');
  check((await agent.session.request(`/api/customer-service/tickets/${id}`)).status === 403, 'Suspended support cookie cannot read case detail');
  check((await agent.session.json(`/api/customer-service/tickets/${id}/replies`, { body: 'Attempt after suspension', requestKey: crypto.randomUUID(), version: concurrentVersion })).status === 403, 'Suspended support cookie cannot reply');
  check((await h.db.readActor(agentActor, c => c.query('select id from private.support_tickets where id=$1', [id]))).rowCount === 0, 'RLS also removes suspended support access');
  const replay = await agent.session.json('/api/auth/support-invitation/accept', { invitationToken: token });
  check(replay.status === 200 && replay.data.accessAvailable === false, 'Spent invitation cannot undo suspension');
  check((await agent.session.request('/api/auth/me')).data?.customerService === false, 'Suspended projection no longer advertises support access');
  check((await owner.session.request(`/api/support/tickets/${id}`)).status === 200, 'Membership suspension does not affect requester case access');
  await admin.session.json(`/api/admin/customer-service/members/${agentId}`, { status: 'active', privateKey: approval }, 'PATCH');
  check((await agent.session.request('/api/customer-service/tickets')).status === 200, 'Authorized administrator restoration reopens support workspace');

  stage = 'cancelled invitation cannot enroll';
  const cancelled = await admin.session.json('/api/admin/customer-service/invitations', { email: other.credentials.email, fullName: 'Cancelled support invitation', privateKey: approval });
  check(cancelled.status === 201, 'Second private invitation can be issued');
  check((await admin.session.json(`/api/admin/customer-service/invitations/${cancelled.data.id}/cancel`, { privateKey: approval })).status === 200, 'Administrator cancels pending invitation');
  check((await other.session.json('/api/auth/support-invitation/accept', { invitationToken: cancelled.data.invitationToken })).status === 403, 'Cancelled link cannot create support membership');
  check((await h.db.pool.query('select count(*)::int as n from private.support_events where ticket_id=$1', [id])).rows[0].n >= 7, 'Lifecycle events persist with case');
  const signedBackIn = await signInLocalAccount(h, owner.credentials);
  check((await signedBackIn.session.request(`/api/support/tickets/${id}`)).status === 200, 'Case persists across genuine native re-login');
  await h.assertOwned();
  const result = { passed: true, checks, actualNativeAuth: true, actualCapturedEmail: true, actualRLS: true, productionRecordsModified: 0, fabricatedProviderReplies: 0, inventedTokens: 0 };
  fs.writeFileSync(path.join(h.meta.root, 'pinevela-harness', 'support-result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  saveLocalFixture(h, 'support-browser.json', { admin: { ...founder.credentials, contextId: founderId, accountKind: 'admin', approvalKey: approval }, agent: agent.credentials, owner: owner.credentials, ticketId: id, guestId, guestCode });
  console.log(JSON.stringify(result));
}
try { await runLocalSupabaseVerification(verify); }
catch (e) { console.error(JSON.stringify({ passed: false, stage, checks, diagnostics: 'Inspect the private isolated run log.' })); if (process.argv[2] === '--local-supabase-worker') throw e; process.exitCode = 1; }
