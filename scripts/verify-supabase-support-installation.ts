/** Read-only installation check. Does not create test accounts or cases in the
 * configured project; full workflow tests use the isolated native harness. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { SupabaseDatabase } from '../supabase/db.js';

dotenv.config({ quiet: true });
const db = new SupabaseDatabase();
try {
  const version = '20261017133104';
  const expected = crypto.createHash('sha256').update(fs.readFileSync(`supabase/migrations/${version}_customer_support_tickets.sql`)).digest('hex');
  const ledger = await db.pool.query('select digest from private.schema_migrations where version=$1', [version]);
  assert.equal(ledger.rows[0]?.digest, expected, 'The installed support migration matches this source');
  const names = ['support_invitations', 'support_memberships', 'support_tickets', 'support_messages', 'support_events', 'support_email_outbox'];
  const tables = await db.pool.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind='r' and c.relname=any($1::text[])`, [names]);
  assert.equal(tables.rowCount, 6); assert(tables.rows.every(t => t.relrowsecurity));
  const grants = await db.pool.query(`select actor,relation,
    has_table_privilege(actor,'private.'||relation,'select') as read,
    has_table_privilege(actor,'private.'||relation,'insert,update,delete') as write
    from unnest(array['anon','authenticated','pinevela_catalog','pinevela_backend']) actor cross join unnest($1::text[]) relation`, [names]);
  assert(grants.rows.every(g => !g.write && (g.read === (g.actor === 'pinevela_backend' && ['support_memberships', 'support_tickets', 'support_messages'].includes(g.relation)))));
  const origin = 'http://127.0.0.1:3001';
  for (const route of ['/api/support/tickets', '/api/customer-service/tickets', '/api/admin/customer-service']) {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    assert.equal(response.status, 401, 'Live private support routes require an actual account');
  }
  assert.equal((await fetch(origin, { signal: AbortSignal.timeout(10000), redirect: 'error' })).status, 200);
  console.log(JSON.stringify({ verified: true, migrationDigestMatches: true, privateTablesWithRLS: 6, browserOrCatalogWriteGrants: 0, livePrivateRoutesRequireAuth: true, productionCasesOrAccountsCreated: 0 }));
} finally { await db.close(); }
