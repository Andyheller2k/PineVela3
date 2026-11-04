import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { ApiError, type VerifiedActor } from '../supabase/db';
import { acknowledgeManagerWelcome, ensureManagerWelcome } from '../supabase/managerWelcome';

function noticeClient() {
  const notices: { id: string; category: string; title: string; recipients: string[]; acknowledged: Set<string> }[] = [];
  let inserted: (typeof notices)[number] | null = null;
  const client = { query: async (sql: string, params: unknown[] = []) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.includes('select n.id,r.popup_acknowledged_at')) {
      const match = notices.find(n => n.recipients.includes(String(params[0])) && n.category === params[1] && n.title === params[2]);
      return { rows: match ? [{ id: match.id, popup_acknowledged_at: match.acknowledged.has(String(params[0])) ? new Date() : null }] : [], rowCount: match ? 1 : 0 };
    }
    if (sql.includes('insert into public.notifications')) {
      inserted = { id: `notice-${notices.length + 1}`, category: String(params[1]), title: String(params[2]), recipients: [], acknowledged: new Set() };
      notices.push(inserted);
      return { rows: [{ id: inserted.id }], rowCount: 1 };
    }
    if (sql.includes('insert into public.notification_recipients')) {
      assert(inserted);
      inserted.recipients = params[1] as string[];
      return { rows: [], rowCount: inserted.recipients.length };
    }
    if (sql.includes('pg_notify')) return { rows: [], rowCount: 1 };
    if (sql.includes('update public.notification_recipients')) {
      assert.match(sql, /r\.context_id=\$1/);
      const match = notices.find(n => n.recipients.includes(String(params[0])) && n.category === params[1] && n.title === params[2]);
      if (match) match.acknowledged.add(String(params[0]));
      return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
    }
    throw new Error(`Unexpected query in welcome boundary: ${sql}`);
  } } as unknown as PoolClient;
  return { client, notices };
}

const actor = (contextId: string, kind = 'manager'): VerifiedActor => ({
  authUserId: `user-${contextId}`, sessionId: `session-${contextId}`, contextId, kind,
});

test('manager welcome is saved once and acknowledged only for its recipient', async () => {
  const { client, notices } = noticeClient();
  const first = actor('manager-one'), second = actor('manager-two');
  assert.deepEqual(await ensureManagerWelcome(client, first), { show: true, notificationId: 'notice-1', created: true });
  assert.deepEqual(await ensureManagerWelcome(client, first), { show: true, notificationId: 'notice-1', created: false });
  assert.deepEqual(notices[0].recipients, [first.contextId]);
  await assert.rejects(acknowledgeManagerWelcome(client, second), (error: unknown) => error instanceof ApiError && error.status === 404);
  assert.equal((await ensureManagerWelcome(client, first)).show, true);
  assert.deepEqual(await acknowledgeManagerWelcome(client, first), { success: true });
  assert.equal((await ensureManagerWelcome(client, first)).show, false);
  assert.deepEqual(await ensureManagerWelcome(client, second), { show: true, notificationId: 'notice-2', created: true });
  assert.equal(notices.length, 2);
});

test('primary account cannot create or acknowledge a manager welcome', async () => {
  const { client, notices } = noticeClient();
  const primary = actor('primary-one', 'primary');
  await assert.rejects(ensureManagerWelcome(client, primary), (error: unknown) => error instanceof ApiError && error.status === 403);
  await assert.rejects(acknowledgeManagerWelcome(client, primary), (error: unknown) => error instanceof ApiError && error.status === 403);
  assert.equal(notices.length, 0);
});
