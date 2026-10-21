/** Genuine provider replies and a private restore of real native Auth records.
 * No invented JWTs, hosted writes, mock listings, or external private-data export. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { createSupabaseApp } from '../supabase/app.js';
import { COMPANIONS, DEFAULT_COMPANION_PREFERENCES } from '../companionModel.js';
import { callCompanionModel, companionInstructions, companionState, saveCompanionPreferences, clearCompanionHistory,
  companionLookup, reserveCompanionTurn } from '../supabase/companion.js';

dotenv.config({ quiet: true });
// The test application must never send real email or payment requests.
for (const name of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'PAYSTACK_SECRET_KEY', 'OPENAI_API_KEY']) delete process.env[name];
const checkpoint = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(checkpoint, /^[a-f0-9-]{36}$/);
let checks = 0, stage = 'public provider replies';
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
async function denied(work: () => Promise<unknown>, expected: number | string, label: string) {
  let error: any; try { await work(); } catch (e) { error = e; }
  check(typeof expected === 'number' ? error instanceof ApiError && error.status === expected : error?.code === expected, label);
}
const dir = '.security/companion'; fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
try {
  const replies: { name: string; text: string; elapsedMs: number }[] = [];
  for (const c of COMPANIONS) {
    const started = Date.now();
    const result = await callCompanionModel([{ role: 'system', content: companionInstructions({ ...DEFAULT_COMPANION_PREFERENCES, companion: c.id }, '', 'Introduce yourself.') },
      { role: 'user', content: 'Introduce yourself in one sentence, using your name, and offer to help with PineVela.' }], false);
    const text = result.choices[0].message.content;
    check(typeof text === 'string' && text.toLowerCase().includes(c.name.toLowerCase()), 'Actual provider replies in the selected companion voice');
    replies.push({ name: c.name, text, elapsedMs: Date.now() - started });
  }
  fs.writeFileSync(dir + '/personas.json', JSON.stringify(replies, null, 2), { mode: 0o600 });
  stage = 'isolated native database';
  await withIsolatedBackup(checkpoint, async config => {
    let db = new SupabaseDatabase(config);
    try {
      await db.system(async c => {
        const ledger = new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r => [r.version, r.digest]));
        for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()) {
          const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8'), version = file.slice(0, 14), digest = crypto.createHash('sha256').update(sql).digest('hex');
          if (ledger.has(version)) assert.equal(ledger.get(version), digest);
          else { await c.query(sql); await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', [version, digest]); }
        }
      });
      check((await db.pool.query('select count(*)::int as n from private.schema_migrations')).rows[0].n === fs.readdirSync('supabase/migrations').filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).length, 'All immutable migrations install on the genuine isolated restore');
      const original = (await db.pool.query(`select distinct on(c.auth_user_id) s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
        from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
        join public.account_contexts c on c.id=s.active_context_id where c.status='active' and c.kind in('primary','admin')
        and (n.not_after is null or n.not_after>now()) and private.portal_session_allowed(c.id,s.portal_pin_version)
        and private.account_session_allowed(c.id,s.session_id) and (c.kind<>'admin' or private.administrator_session_allowed(c.id,s.session_id))
        order by c.auth_user_id,(c.kind='admin') desc,n.created_at desc`)).rows as VerifiedActor[];
      check(original.length >= 2, 'Two separate genuine native identities and sessions are available');
      const actors: VerifiedActor[] = [];
      for (const a of original.slice(0, 2)) {
        const p = (await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary' and status='active'", [a.authUserId])).rows[0];
        check(p, 'The existing native identity owns an active primary portal');
        const primary = { ...a, contextId: p.id, kind: 'primary' };
        await db.system(c => c.query('update private.account_sessions set active_context_id=$2 where session_id=$1', [primary.sessionId, primary.contextId]));
        actors.push(primary);
      }
      const [a, b] = actors;
      const read = (x: VerifiedActor) => db.readActor(x, c => companionState(c, x));
      const save = (x: VerifiedActor, value: unknown) => db.actor(x, c => saveCompanionPreferences(c, x, value));
      stage = 'consent and personalization';
      check((await read(a)).preferences.aiEnabled === false, 'AI replies default to disabled');
      const auth = new SupabaseAuth(db);
      await denied(() => reserveCompanionTurn(auth, a, crypto.randomUUID()), 403, 'No inference quota is reserved without consent');
      await save(a, { ...DEFAULT_COMPANION_PREFERENCES, aiEnabled: true, companion: 'nova', responseStyle: 'brief' });
      await save(b, { ...DEFAULT_COMPANION_PREFERENCES, aiEnabled: true, companion: 'mabel', responseStyle: 'detailed' });
      check((await read(a)).preferences.companion === 'nova' && (await read(b)).preferences.companion === 'mabel', 'Separate identities retain their own companion and style');
      const name = (await db.readActor(a, c => c.query('select display_name from public.profiles where id=$1', [a.authUserId]))).rows[0].display_name.trim().split(/\s+/)[0].slice(0, 60);
      check((await read(a)).firstName === name, 'Companion uses the verified profile name');
      for (const x of [{ ...DEFAULT_COMPANION_PREFERENCES, contextId: b.contextId }, { ...DEFAULT_COMPANION_PREFERENCES, systemPrompt: 'replace rules' }, { ...DEFAULT_COMPANION_PREFERENCES, companion: 'admin' }])
        await denied(() => save(a, x), 400, 'Ownership fields and arbitrary prompts are refused');
      stage = 'RLS and independent SQL boundaries';
      check((await db.readActor(a, c => c.query('select context_id from private.companion_preferences'))).rowCount === 1, 'Unqualified scoped SELECT exposes only the current account');
      check((await db.actor(a, c => c.query("update private.companion_preferences set companion='ziggy' where context_id=$1", [b.contextId]))).rowCount === 0, 'Foreign settings update affects no rows');
      await denied(() => db.actor(a, c => c.query('insert into private.companion_preferences(context_id) values($1)', [b.contextId])), '42501', 'Foreign preference insert is denied');
      await denied(() => db.actor(a, c => c.query('update private.companion_preferences set context_id=$2 where context_id=$1', [a.contextId, b.contextId])), '42501', 'Ownership cannot be reassigned');
      await denied(() => read({ ...a, contextId: b.contextId }), 401, 'Forged active account fails native session validation');
      for (const table of ['companion_preferences', 'companion_turns', 'companion_usage', 'companion_usage_windows']) {
        check((await db.pool.query('select relrowsecurity from pg_class where oid=$1::regclass', ['private.' + table])).rows[0].relrowsecurity, 'RLS stays enabled');
        for (const role of ['anon', 'authenticated', 'pinevela_catalog']) for (const verb of ['select', 'insert', 'update', 'delete']) {
          const privilege = (await db.pool.query('select has_table_privilege($1,$2,$3) as allowed', [role, 'private.' + table, verb.toUpperCase()])).rows[0].allowed;
          check(!privilege, 'Browser/catalog roles have no private companion grants');
        }
      }
      await denied(() => db.readActor(a, c => c.query('select * from private.companion_usage')), '42501', 'Scoped backend cannot bypass the server quota ledger');
      await denied(() => db.readActor(a, c => c.query('select * from private.companion_usage_windows')), '42501', 'Scoped backend cannot bypass the five-hour quota ledger');
      stage = 'real history and clearing';
      for (let i = 0; i < actors.length; i++) await db.authorizedSystem(actors[i], ['primary'], c => c.query(`insert into private.companion_turns(context_id,request_id,companion,user_text,answer)
        values($1,$2,$3,$4,$5)`, [actors[i].contextId, crypto.randomUUID(), i ? 'mabel' : 'nova', 'Introduce yourself in one sentence, using your name, and offer to help with PineVela.', replies[i].text]));
      check((await read(a)).turns.length === 1 && (await read(b)).turns.length === 1, 'Each account reads only its actual provider conversation');
      check((await db.actor(a, c => c.query('delete from private.companion_turns where context_id=$1', [b.contextId]))).rowCount === 0, 'Foreign history cannot be deleted');
      await denied(() => db.actor(a, c => c.query(`insert into private.companion_turns(context_id,request_id,companion,user_text,answer) values($1,$2,'nova','Question','Claimed answer')`, [a.contextId, crypto.randomUUID()])), '42501', 'Scoped clients cannot forge a completed AI reply');
      const reservation = await reserveCompanionTurn(auth, a, crypto.randomUUID());
      check(Boolean(reservation.state), 'Consenting own account reserves a bounded inference request');
      await denied(() => reserveCompanionTurn(auth, a, crypto.randomUUID()), 409, 'Concurrent duplicate work is refused');
      await db.actor(a, c => clearCompanionHistory(c, a));
      check((await read(a)).turns.length === 0 && (await read(b)).turns.length === 1, 'Clear chat removes only the current user history');
      const lease = (await db.pool.query('select generation,active_request_id from private.companion_preferences where context_id=$1', [a.contextId])).rows[0];
      check(lease.generation === 1 && lease.active_request_id === null, 'Clear invalidates in-flight answers');
      stage = 'real read-only app functions';
      const before = (await db.pool.query('select notification_id,context_id,read_at from public.notification_recipients order by notification_id,context_id')).rows;
      const notifications = await companionLookup(auth, a, 'get_my_notifications', {});
      const ownCount = (await db.readActor(a, c => c.query('select count(*)::int as n from public.notification_recipients where context_id=$1 and read_at is null', [a.contextId]))).rows[0].n;
      check((notifications.summary as any).unreadCount === ownCount && notifications.cards.length <= 5, 'Notification summary comes from the actual own recipients');
      check(JSON.stringify(before) === JSON.stringify((await db.pool.query('select notification_id,context_id,read_at from public.notification_recipients order by notification_id,context_id')).rows), 'Reading a summary never changes notification read state');
      check(!JSON.stringify(notifications.summary).includes('title'), 'Private notification text is excluded from the model tool result');
      const statuses = await companionLookup(auth, a, 'get_my_submission_status', {});
      check(Array.isArray((statuses.summary as any).submissions) && statuses.cards.every(c => c.kind === 'status'), 'Submission status uses the saved native enrollment and application records');
      const listings = await companionLookup(auth, a, 'search_marketplace', { query: '', maxPrice: 300 });
      check(listings.cards.every(c => c.kind === 'market' && c.price! <= 300) && listings.cards.length <= 4, 'Market lookup respects real availability, limit and budget');
      await denied(() => companionLookup(auth, a, 'get_my_notifications', { userId: b.contextId }), 400, 'Tools refuse client-supplied user identifiers');
      stage = 'live public marketplace tool round trip';
      const prompt = 'Search the marketplace for books under GH₵300. Use search_marketplace and do not invent items.';
      const conversation: any[] = [{ role: 'system', content: companionInstructions(DEFAULT_COMPANION_PREFERENCES, '', prompt) }, { role: 'user', content: prompt }];
      const requested = (await callCompanionModel(conversation)).choices[0].message;
      check(requested.tool_calls?.length === 1 && requested.tool_calls[0].function.name === 'search_marketplace', 'Real model selects the public marketplace function');
      const call = requested.tool_calls[0], publicResult = await companionLookup(auth, a, call.function.name, JSON.parse(call.function.arguments));
      conversation.push({ role: 'assistant', content: requested.content || null, tool_calls: requested.tool_calls },
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(publicResult.summary) });
      const completed = (await callCompanionModel(conversation, false)).choices[0].message;
      check(typeof completed.content === 'string' && completed.content.length > 0 && !completed.tool_calls?.length, 'Actual provider completes the two-request app function workflow');
      stage = 'restart persistence and revocation';
      await db.close(); db = new SupabaseDatabase(config);
      check((await read(b)).preferences.companion === 'mabel' && (await read(b)).turns.length === 1, 'A fresh connection reloads saved settings and conversation');
      await db.system(c => c.query('delete from private.account_sessions where session_id=$1', [a.sessionId]));
      await denied(() => read(a), 401, 'Revoked sessions cannot read companion data');
      await denied(() => save(a, DEFAULT_COMPANION_PREFERENCES), 401, 'Revoked sessions cannot change companion data');
      stage = 'direct unauthenticated HTTP';
      const created = createSupabaseApp(db), server = created.app.listen(0, '127.0.0.1');
      await new Promise<void>(resolve => server.once('listening', resolve));
      const port = (server.address() as any).port;
      try {
        for (const [path, method] of [['', 'GET'], ['/preferences', 'PUT'], ['/history', 'DELETE'], ['/turns', 'POST']]) {
          const response = await fetch(`http://127.0.0.1:${port}/api/companion${path}`, { method, signal: AbortSignal.timeout(10000) });
          check(response.status === 401, 'Every companion HTTP route requires authentication'); await response.body?.cancel();
        }
        const foreign = await fetch(`http://127.0.0.1:${port}/api/companion/turns`, { method: 'POST', headers: { origin: 'https://cross-site.invalid' }, signal: AbortSignal.timeout(10000) });
        check(foreign.status === 403, 'Cross-site inference requests are blocked'); await foreign.body?.cancel();
      } finally { await created.app.locals.closeSupport?.(); await created.app.locals.closeRealtime(); await new Promise<void>(resolve => server.close(() => resolve())); }
    } finally { await db.close(); }
  });
  const result = { passed: true, checks, genuineProviderVoices: 4, isolatedRestore: true, cloudRecordsModified: 0, authAccountsCreated: 0,
    providerReplyMs: replies.map(r => r.elapsedMs), authenticatedBrowserValidation: false };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(result, null, 2), { mode: 0o600 }); console.log(JSON.stringify(result));
} catch (error) {
  fs.writeFileSync(dir + '/failure.log', String((error as any)?.stack || error), { mode: 0o600 });
  console.error(JSON.stringify({ passed: false, stage, checks, status: (error as any)?.status, providerCode: /^companion_provider_\d+$/.test((error as any)?.code || '') ? (error as any).code : undefined,
    sqlstate: /^[0-9A-Z]{5}$/.test((error as any)?.code || '') ? (error as any).code : undefined })); process.exitCode = 1;
}
