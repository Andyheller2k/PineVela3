/** Genuine provider identities restored locally; domain fixtures never enter the
 * live project. No JWT, Auth identity, provider reply or Auth timestamp is made up. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { SupabaseDatabase, ApiError, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { messageAccounts, previewMessage, sendMessage, checkMessageContext } from '../supabase/adminMessages.js';
import { readNotifications, pendingMessages, acknowledgeMessage } from '../supabase/notifications.js';
import { SupabaseAdminGovernance } from '../supabase/adminGovernance.js';
import { hashCredentialAsync } from '../accountSecurity.js';
dotenv.config({ quiet: true });
const [backup, applicationCheckpoint] = process.argv.slice(2);
if (!backup || !applicationCheckpoint) throw new Error('Pass the latest genuine Auth backup and the immutable migration-27 checkpoint.');
let checks = 0, stage = 'fixture';
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
async function denied(work: () => Promise<unknown>, expected: number | string, label: string) {
  let error: any; try { await work(); } catch (e) { error = e; }
  check(typeof expected === 'number' ? error instanceof ApiError && error.status === expected : error?.code === expected, label);
}
const fingerprintSQL = `select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
  'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
  'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
try { await withIsolatedBackup(backup, async config => {
  let db = new SupabaseDatabase(config);
  try {
    const fixture = await db.system(async c => {
      const ledger = (await c.query('select version,digest from private.schema_migrations')).rows;
      check(ledger.length === 27, 'Local domain fixtures precede enrollment guards');
      for (const r of ledger) {
        const file = fs.readdirSync('supabase/migrations').find(f => f.startsWith(r.version));
        check(file && crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/' + file)).digest('hex') === r.digest, 'Historical migration digest unchanged');
      }
      const authDigest = (await c.query(fingerprintSQL)).rows[0].digest;
      const people = (await c.query(`select u.id,s.id as session_id from auth.users u join lateral
        (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
        where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
          and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
        order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 5`)).rows;
      check(people.length === 5, 'Five genuine verified Google subjects and existing sessions');
      const primaries: VerifiedActor[] = [];
      for (const p of people) {
        await c.query('select private.initialize_auth_profile($1,null)', [p.id]);
        const id = (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'", [p.id])).rows[0].id;
        primaries.push({ authUserId: p.id, sessionId: p.session_id, contextId: id, kind: 'primary' });
        await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)', [p.session_id, p.id, id]);
      }
      const admins: VerifiedActor[] = [], keys: string[] = [];
      for (const [i, p] of primaries.slice(0, 2).entries()) {
        const id = (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id", [p.authUserId])).rows[0].id;
        const a = { ...p, contextId: id, kind: 'admin' }; admins.push(a);
        await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)', [id, i + 1]);
        const key = crypto.randomBytes(32).toString('base64url'); keys.push(key);
        await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at) values($1,$2,clock_timestamp())', [id, await hashCredentialAsync(`approval:${id}:${key}`)]);
        await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1', [p.sessionId, id]);
      }
      const child = primaries[2];
      await c.query('update public.profiles set primary_owner_id=$1 where id=$2', [primaries[0].authUserId, child.authUserId]);
      const portals: Record<string, VerifiedActor> = {};
      for (const kind of ['manager', 'resident', 'seller']) {
        const id = (await c.query('insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,$3,\'active\') returning id', [child.authUserId, primaries[0].authUserId, kind])).rows[0].id;
        portals[kind] = { ...child, contextId: id, kind };
      }
      const residence = (await c.query('insert into public.residences(primary_owner_id,name) select $1,display_name from public.profiles where id=$1 returning id', [primaries[0].authUserId])).rows[0].id;
      await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)', [portals.manager.contextId, residence]);
      const block = (await c.query("insert into public.blocks(residence_id,name) values($1,'Gateway verification') returning id", [residence])).rows[0].id;
      const floor = (await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id', [block])).rows[0].id;
      const room = (await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id", [floor])).rows[0].id;
      const bed = (await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id', [room])).rows[0].id;
      await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3)', [portals.resident.contextId, room, bed]);
      const staffId = (await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'staff','active') returning id", [primaries[3].authUserId])).rows[0].id;
      portals.staff = { ...primaries[3], contextId: staffId, kind: 'staff' };
      await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id) values($1,$2,$3)', [staffId, residence, portals.manager.contextId]);
      await c.query('update public.profiles set primary_owner_id=$1 where id=$2', [primaries[1].authUserId, primaries[4].authUserId]);
      const pending = (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'seller','pending') returning id", [primaries[4].authUserId, primaries[1].authUserId])).rows[0].id;
      for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}.*\.sql$/.test(f) && f.slice(0, 14) > '20261009220000').sort()) {
        const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8'); await c.query(sql);
        await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', [file.slice(0, 14), crypto.createHash('sha256').update(sql).digest('hex')]);
      }
      return { primaries, admins, portals, pending, keys, authDigest };
    });
    const { primaries, admins: [founder, second], portals, pending, keys } = fixture;
    const bind = (a: VerifiedActor) => db.system(c => c.query('update private.account_sessions set active_context_id=$2 where session_id=$1', [a.sessionId, a.contextId]));
    const run = <T>(a: VerifiedActor, work: (c: import('pg').PoolClient) => Promise<T>) => db.authorizedSystem(a, ['admin'], work);
    const preview = (body: any, a = founder) => run(a, c => previewMessage(c, a, body));
    const send = (body: any, a = founder) => run(a, c => sendMessage(c, a, body));
    const inbox = async (a: VerifiedActor, market = false) => { await bind(a); return db.actor(a, c => readNotifications(c, a, market)); };
    const popups = async (a: VerifiedActor) => { await bind(a); return db.actor(a, c => pendingMessages(c, a)); };
    const ack = async (a: VerifiedActor, id: string) => { await bind(a); return db.actor(a, c => acknowledgeMessage(c, a, id)); };
    const managerChoice = { groups: ['managers'], accounts: [{ role: 'manager', id: portals.manager.contextId }] };
    stage = 'authorization and input';
    const directory = await run(founder, c => messageAccounts(c, founder));
    check(directory.length === 9, 'Directory contains five primaries and four active supported portals');
    check(!directory.some(r => r.id === pending || r.role === 'admin'), 'Pending and administrator portals are excluded');
    check(directory.every(r => Object.keys(r).sort().join() === 'email,id,name,role'), 'Directory exposes only recipient fields');
    await denied(() => run(primaries[4], c => messageAccounts(c, primaries[4])), 403, 'Primary users cannot access the recipient directory');
    for (const body of [null, [], {}, { groups: ['admin'], accounts: [] }, { groups: [], accounts: [] }, { groups: 'users', accounts: [] },
      { groups: [], accounts: [{ role: 'merchant', id: pending }] }, { groups: [], accounts: [{ role: 'manager', id: primaries[4].contextId }] },
      { groups: [], accounts: [{ role: 'manager', id: 'invalid' }] }, { ...managerChoice, senderId: second.contextId },
      { groups: [], accounts: [{ role: 'manager', id: portals.manager.contextId, userId: second.authUserId }] },
      { groups: [], accounts: Array(2001).fill({ role: 'manager', id: portals.manager.contextId }) }])
      await denied(() => preview(body), (body as any)?.accounts?.[0]?.id === pending || (body as any)?.accounts?.[0]?.id === primaries[4].contextId ? 409 : 400, 'Unsupported or stale recipient input is rejected');
    await denied(async () => checkMessageContext(founder, second.contextId), 409, 'Stale portal headers are rejected');
    checkMessageContext(founder, founder.contextId); check(true, 'Matching headers are consistency checks only');
    const reviewed = await preview(managerChoice);
    check(reviewed.count === 1 && reviewed.counts.manager === 1, 'Group and explicit account selection deduplicate');
    const body = { ...managerChoice, fingerprint: reviewed.fingerprint, title: 'Housing announcement', message: 'Reviewed manager-only announcement.', type: 'success' };
    for (const invalid of [{ ...body, senderId: second.contextId }, { ...body, title: '' }, { ...body, title: 'x'.repeat(121) },
      { ...body, message: 'x'.repeat(4001) }, { ...body, message: '\u0000' }, { ...body, type: 'danger' }, { ...body, fingerprint: 'invalid' }])
      await denied(() => send(invalid), 400, 'Invalid content and identity aliases are rejected');
    await denied(() => send({ ...body, fingerprint: crypto.randomUUID() }), 409, 'Invented preview tokens cannot send');
    await denied(() => send(body, second), 409, 'Another administrator cannot reuse a preview');
    await denied(() => send({ ...body, groups: ['users'] }), 409, 'A preview cannot authorize a different selection');
    stage = 'delivery and retry';
    const [first, repeated] = await Promise.all([send(body), send(body)]);
    check(first.batchId === repeated.batchId, 'Concurrent retries return one delivery receipt');
    const notice = (await db.pool.query('select * from private.admin_message_deliveries where id=$1', [first.batchId])).rows[0];
    const noticeId = notice.notification_id;
    check((await db.pool.query('select count(*) from public.notifications where id=$1', [noticeId])).rows[0].count === '1', 'Only one announcement is saved');
    check((await db.pool.query('select count(*) from private.audit_events where event_type=\'admin_message_sent\'', [])).rows[0].count === '1', 'Delivery audit is written once');
    await denied(() => send({ ...body, message: 'Different content' }), 409, 'A sent preview cannot send altered content');
    check((await popups(portals.manager)).some(n => n.id === noticeId && n.type === 'success'), 'Manager sees the typed popup');
    check((await inbox(portals.manager)).some(n => n.id === noticeId && n.adminMessage && n.type === 'success'), 'Manager sees the same typed inbox message');
    for (const a of [primaries[0], primaries[2], primaries[4], portals.seller, portals.resident, portals.staff])
      check(!(await popups(a)).some(n => n.id === noticeId), 'Manager message does not leak to parent, shared identity or other portals');
    await denied(() => ack(primaries[0], noticeId), 404, 'Linked primary cannot acknowledge manager popup');
    await ack(portals.manager, noticeId); await ack(portals.manager, noticeId);
    check(!(await popups(portals.manager)).some(n => n.id === noticeId), 'Popup acknowledgement is idempotent');
    check((await inbox(portals.manager)).some(n => n.id === noticeId && !n.read), 'Popup dismissal preserves unread inbox notification');
    for (const [group, a] of Object.entries({ residents: portals.resident, marketers: portals.seller, staff: portals.staff, users: primaries[4] })) {
      await bind(founder); const choice = { groups: [group], accounts: [] }, p = await preview(choice);
      const receipt = await send({ ...choice, fingerprint: p.fingerprint, title: 'Portal announcement', message: 'Reviewed account-scoped announcement.', type: 'warning' });
      const id = (await db.pool.query('select notification_id from private.admin_message_deliveries where id=$1', [receipt.batchId])).rows[0].notification_id;
      check(receipt.count === (group === 'users' ? 5 : 1), 'Each group resolves the actual account contexts');
      check((await popups(a)).some(n => n.id === id && n.type === 'warning'), 'Each supported recipient group receives a typed popup');
      check((await inbox(a, group === 'marketers')).some(n => n.id === id), 'Seller market filtering retains administrator announcements');
    }
    await bind(founder);
    const sharedChoice = { groups: ['residents', 'marketers'], accounts: [] }, sharedPreview = await preview(sharedChoice);
    const sharedReceipt = await send({ ...sharedChoice, fingerprint: sharedPreview.fingerprint, title: 'Shared identity portals', message: 'Separate portal inboxes.' });
    const sharedId = (await db.pool.query('select notification_id from private.admin_message_deliveries where id=$1', [sharedReceipt.batchId])).rows[0].notification_id;
    await ack(portals.resident, sharedId);
    check((await popups(portals.seller)).some(n => n.id === sharedId), 'Same-email seller dismissal remains independent of resident dismissal');
    stage = 'SQL boundaries';
    await bind(founder);
    await denied(() => run(founder, c => c.query("update private.admin_message_deliveries set recipient_counts='{}' where id=$1", [first.batchId])), '42501', 'Completed receipts cannot be rewritten');
    await denied(() => run(founder, c => c.query("update public.notifications set title='Altered' where id=$1", [noticeId])), '42501', 'Announcement content is immutable');
    await denied(() => run(founder, c => c.query('insert into public.notification_recipients(notification_id,context_id) values($1,$2)', [noticeId, primaries[4].contextId])), '42501', 'Late extra recipients cannot be added');
    await denied(() => db.system(c => c.query("insert into public.notifications(category,title,message,admin_message_type,sender_context_id) values('admin_message','Forged','Forged','info',$1)", [founder.contextId])), '42501', 'An unbound SQL transaction cannot forge an admin announcement');
    await bind(primaries[4]);
    check((await db.actor(primaries[4], c => c.query('select id from public.notifications where id=$1', [noticeId]))).rowCount === 0, 'Recipient RLS hides unrelated message bodies');
    check((await db.actor(primaries[4], c => c.query('update public.notification_recipients set popup_acknowledged_at=now() where notification_id=$1', [noticeId]))).rowCount === 0, 'Raw owner-scoped SQL cannot acknowledge another portal');
    for (const role of ['anon', 'authenticated', 'pinevela_backend']) {
      await denied(() => db.system(async c => { await c.query('set local role ' + role); return c.query('select * from private.admin_message_deliveries'); }), '42501', 'Preview snapshots are private to server authorization');
      await denied(() => db.system(async c => { await c.query('set local role ' + role); return c.query('insert into public.notification_recipients(notification_id,context_id) values($1,$2)', [noticeId, primaries[4].contextId]); }), '42501', 'Browser and backend role cannot add announcement recipients');
    }
    stage = 'atomic rollback, expiry and stale roster';
    await bind(founder);
    const rollbackPreview = await preview(managerChoice), rollbackBody = { ...body, fingerprint: rollbackPreview.fingerprint };
    const before = (await db.pool.query('select count(*) from public.notifications')).rows[0].count;
    await denied(() => run(founder, async c => { await sendMessage(c, founder, rollbackBody); throw new ApiError(503, 'Abort isolated transaction'); }), 503, 'Failed delivery rolls back all effects');
    check((await db.pool.query('select count(*) from public.notifications')).rows[0].count === before, 'Rollback leaves no notifications behind');
    check((await db.pool.query('select notification_id from private.admin_message_deliveries where id=$1', [rollbackPreview.fingerprint])).rows[0].notification_id === null, 'Rollback leaves preview reusable');
    await send(rollbackBody); check(true, 'Retry after rollback delivers once');
    const expires = await run(founder, async c => (await c.query(`insert into private.admin_message_deliveries(sender_context_id,selection_digest,recipient_context_ids,recipient_counts,expires_at)
      select sender_context_id,selection_digest,recipient_context_ids,recipient_counts,clock_timestamp()+interval '20 milliseconds'
      from private.admin_message_deliveries where id=$1 returning id`, [reviewed.fingerprint])).rows[0].id);
    await new Promise(resolve => setTimeout(resolve, 30));
    await denied(() => send({ ...body, fingerprint: expires }), 409, 'Expired previews cannot send');
    const stale = await preview(managerChoice);
    await db.system(c => c.query("update public.account_contexts set status='suspended' where id=$1", [portals.manager.contextId]));
    await denied(() => send({ ...body, fingerprint: stale.fingerprint }), 409, 'Changed account eligibility invalidates unsent preview');
    await db.system(c => c.query("update public.account_contexts set status='active' where id=$1", [portals.manager.contextId]));
    stage = 'revocation and restart';
    const secondPreview = await preview(managerChoice, second);
    await new SupabaseAdminGovernance(new SupabaseAuth(db)).setActive(founder, second.contextId, { active: false, privateKey: keys[0] });
    await denied(() => send({ ...body, fingerprint: secondPreview.fingerprint }, second), 401, 'Suspended administrators cannot send reviewed messages');
    await bind(primaries[0]);
    await denied(() => send(body), 401, 'Changing to primary portal invalidates former admin authority');
    await bind(founder);
    await db.close(); db = new SupabaseDatabase(config);
    check((await send(body)).batchId === first.batchId, 'Original delivery retry survives a database reconnect');
    check(!(await popups(portals.manager)).some(n => n.id === noticeId), 'Popup acknowledgement survives reconnect');
    check((await inbox(portals.manager)).some(n => n.id === noticeId), 'Persistent notification remains after reconnect');
    check((await db.pool.query(fingerprintSQL)).rows[0].digest === fixture.authDigest, 'Actual Auth identities and session timestamps are unchanged');
    console.log(JSON.stringify({ checks, passed: true, isolated: true, genuineAuthUnchanged: true, liveMessagesSent: 0 }));
  } finally { await db.close(); }
}, { applicationCheckpoint }); } catch (error) {
  fs.writeFileSync(`.security/migration-reset/${backup}.admin-messages-test-failure.log`, error instanceof Error ? error.stack || error.message : String(error), { mode: 0o600 });
  console.error(JSON.stringify({ checks, stage, failed: true, code: (error as any)?.code, status: error instanceof ApiError ? error.status : undefined,
    message: error instanceof assert.AssertionError ? error.message : undefined })); process.exitCode = 1;
}
