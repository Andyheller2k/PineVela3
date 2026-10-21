/** Existing real native accounts only. No seeded notifications, sessions or provider stubs. */
import assert from 'node:assert/strict';
import { readLocalFixture, runLocalSupabaseVerification, signInLocalAccount, type LocalAccountCredentials } from './lib/local-supabase-harness.js';

await runLocalSupabaseVerification(async h => {
  await h.assertOwned();
  const fixtures = readLocalFixture<{ owner: LocalAccountCredentials; agent: LocalAccountCredentials }>(h, 'support-browser.json');
  const encrypted = readLocalFixture<{ other: LocalAccountCredentials }>(h, 'encrypted-chat-browser.json');
  assert(fixtures && encrypted);
  const owner = await signInLocalAccount(h, fixtures.owner), other = await signInLocalAccount(h, encrypted.other);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert(value, label); checks++; };
  const notices = await owner.session.request('/api/notifications');
  check(notices.status === 200 && Array.isArray(notices.data) && notices.data.length > 0, 'Real own inbox is available');
  const notice = notices.data.find((n: any) => n.read) || notices.data[0];
  const stamp = async () => (await h.db.pool.query('select read_at from public.notification_recipients where notification_id=$1 and context_id=$2', [notice.id, owner.user.id])).rows[0]?.read_at?.toISOString() || null;
  const before = await stamp();
  check((await h.session().request(`/api/notifications/${notice.id}/read`, { method: 'PUT' })).status === 401, 'Anonymous read acknowledgement is denied');
  check((await other.session.json(`/api/notifications/${notice.id}/read`, { userId: owner.user.id, contextId: owner.user.id }, 'PUT')).status === 404, 'A different real account cannot spoof recipient ownership');
  check(await stamp() === before, 'Denied request cannot alter the recipient timestamp');
  const mismatch = { 'X-PineVela-Profile-Context': other.user.id };
  check((await owner.session.request('/api/notifications', { headers: mismatch })).status === 409, 'Stale inbox reads are rejected');
  check((await owner.session.request(`/api/notifications/${notice.id}/read`, { method: 'PUT', headers: mismatch })).status === 409, 'Stale single acknowledgements are rejected');
  check((await owner.session.request('/api/notifications/read-all', { method: 'PUT', headers: mismatch })).status === 409, 'Stale bulk acknowledgements are rejected');
  check(await stamp() === before, 'Stale-context requests cannot alter state');
  const headers = { 'X-PineVela-Profile-Context': owner.user.id };
  check((await owner.session.request(`/api/notifications/${notice.id}/read`, { method: 'PUT', headers })).status === 200, 'Authorized recipient can mark their notification read');
  const first = await stamp();
  check(first !== null, 'Read acknowledgement persists in the actual database');
  check((await owner.session.request(`/api/notifications/${notice.id}/read`, { method: 'PUT', headers })).status === 200 && await stamp() === first, 'Repeated reads preserve the original timestamp');
  check((await owner.session.request('/api/notifications')).data.find((n: any) => n.id === notice.id)?.read === true, 'Subsequent inbox reads retain the persisted flag');
  check((await other.session.request('/api/notifications')).data.every((n: any) => n.id !== notice.id), 'Another account cannot fetch this notice');
  const actorRow = (await h.db.pool.query(`select c.auth_user_id,c.kind,s.session_id from public.account_contexts c
    join private.account_sessions s on s.active_context_id=c.id join auth.sessions live on live.id=s.session_id
    where c.id=$1 and (live.not_after is null or live.not_after>now()) order by live.created_at desc limit 1`, [other.user.id])).rows[0];
  assert(actorRow);
  const actor = { authUserId: actorRow.auth_user_id, contextId: other.user.id, kind: actorRow.kind, sessionId: actorRow.session_id };
  check((await h.db.readActor(actor, client => client.query('select notification_id from public.notification_recipients where notification_id=$1 and context_id=$2', [notice.id, owner.user.id]))).rowCount === 0, 'Recipient RLS hides the other account row');
  check((await h.db.actor(actor, client => client.query('update public.notification_recipients set read_at=now() where notification_id=$1 and context_id=$2', [notice.id, owner.user.id]))).rowCount === 0, 'Recipient RLS prevents a direct cross-account update');
  console.log(JSON.stringify({ passed: true, checks, actualNativeAccounts: 2, mockedNotifications: 0, schemaChanges: 0, productionRecordsModified: 0 }));
});
