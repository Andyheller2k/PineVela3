import fs from 'node:fs';
import { requireManagerKeyGrant } from './managerKeys.js';
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';

export type VerifiedActor = { authUserId: string; sessionId: string; contextId: string; kind: string; managerKeyVersion?:string };
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, 'Invalid resource ID.');
  return value;
}
export function databaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.DATABASE_URL || env.SUPABASE_DB_URL;
  if (!raw || !env.SUPABASE_URL || !env.SUPABASE_DB_CA_FILE) throw new Error('Supabase PostgreSQL and CA configuration are required.');
  const database = new URL(raw), api = new URL(env.SUPABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || api.protocol !== 'https:' ||
      !database.hostname.endsWith('.pooler.supabase.com') || (database.port || '5432') !== '5432' ||
      decodeURIComponent(database.username) !== `postgres.${api.hostname.split('.')[0]}` || !database.password ||
      api.username || api.password || api.pathname !== '/' || api.search || api.hash) throw new Error('Supabase project and Session pooler configuration do not match.');
  // Separate fields prevent URI sslmode options from overriding certificate verification.
  return {
    host: database.hostname, port: 5432, database: decodeURIComponent(database.pathname.slice(1)),
    user: decodeURIComponent(database.username), password: decodeURIComponent(database.password),
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync(env.SUPABASE_DB_CA_FILE, 'utf8') },
    max: 8, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000,
    statement_timeout: 15000, query_timeout:30000, application_name: 'pinevela-supabase',
  };
}

/** No local data files, caches of account arrays, or JSON fallback. */
export class SupabaseDatabase {
  readonly pool: Pool;
  constructor(config:PoolConfig = databaseConfig()) {
    this.pool = new Pool(config);
    // Checked-out clients can emit transport errors independently of a query.
    this.pool.on('connect',client => client.on('error',() => console.error('[Database] Client connection failed.')));
    this.pool.on('error', () => console.error('[Database] Idle connection failed.'));
  }
  async system<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      discard = message === 'Query read timeout' || /^Connection (?:terminated|closed)/i.test(message)
        || /^(?:ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED)$/.test(String((error as any)?.code || ''));
      // A read timeout does not prove that COMMIT failed. Never replay writes,
      // and never return a connection with an outstanding response to the pool.
      if (!discard) await client.query('rollback').catch(() => {discard = true;});
      if (discard) throw new ApiError(503,'The database connection was interrupted. Refresh your account before retrying.','database_unavailable');
      throw error;
    } finally { client.release(discard); }
  }
  private async lockActor(client: PoolClient, actor: VerifiedActor) {
      // Check and lock the binding inside the same transaction as the operation.
      // Never let request body fields populate these four parameters.
      const binding = await client.query(`select s.session_id from private.account_sessions s
        join auth.sessions live on live.id = s.session_id and live.user_id = s.auth_user_id
        join public.account_contexts c on c.id = s.active_context_id
        where s.session_id = $1 and s.auth_user_id = $2 and s.active_context_id = $3
          and c.kind = $4 and c.status = 'active' and c.auth_user_id = s.auth_user_id
          and (live.not_after is null or live.not_after > now())
          and private.portal_session_allowed(c.id,s.portal_pin_version)
          and (c.kind <> 'admin' or exists (select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'))
          and (c.kind <> 'resident' or exists (select 1 from public.allocations a where a.resident_context_id = c.id and a.ended_at is null))
          and (c.kind <> 'staff' or exists (select 1 from public.staff_assignments a where a.staff_context_id = c.id and a.status = 'active' and a.ended_at is null))
        for share of s, c`, [actor.sessionId, actor.authUserId, actor.contextId, actor.kind]);
      if (!binding.rowCount) throw new ApiError(401, 'Your session is no longer active. Please sign in.');
      await requireManagerKeyGrant(client,actor);
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor.authUserId, session_id: actor.sessionId, role: 'authenticated' })]);
  }
  async actor<T>(actor: VerifiedActor, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.system(async client => {
      await this.lockActor(client, actor);
      await client.query('set local role pinevela_backend');
      return work(client);
    });
  }
  /** For narrowly scoped server-owned lifecycle writes that browser roles cannot
   * perform. Rechecks the live actor inside the write transaction; callers must
   * also authorize every target relationship before using this privileged client. */
  async authorizedSystem<T>(actor: VerifiedActor, kinds: string[], work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.system(async client => {
      await this.lockActor(client, actor);
      if (!kinds.includes(actor.kind)) throw new ApiError(403, 'This account cannot perform that action.');
      return work(client);
    });
  }
  async publicRows<T extends QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
    return this.system(async client => {
      await client.query('set local role anon');
      return (await client.query<T>(sql, values)).rows;
    });
  }
  async close() { await this.pool.end(); }
}
