import {checkAccountAccess} from './accountAccess.js';
import type {AccountFeature} from '../accountFeatures.js';
import fs from 'node:fs';
import { requireManagerKeyGrant } from './managerKeys.js';
import { Pool, escapeLiteral, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { MAINTENANCE_MESSAGE } from '../platformSettings.js';
import {takeTransactionAdmission,transactionAdmissionSql,type AdmissionOptions} from './transactionAdmission.js';

export type VerifiedActor = { authUserId: string; sessionId: string; contextId: string; kind: string; termsAccepted?:boolean; managerKeyVersion?:string; requiredFeatures?:AccountFeature[] };
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
/** Only rejection of the current application session may clear browser identity. */
export class SessionExpiredError extends ApiError {
  readonly sessionExpired = true;
  constructor(message: string, code?: string) { super(401, message, code); }
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
    // Keep one established connection across quiet periods; extra burst
    // connections still expire after 30 seconds. The pool remains lazy.
    min: 1, max: 8, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000,
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
  /** One atomic server-owned statement. No transaction-local roles or claims
   * may escape into this path; multi-statement operations use system/actor. */
  async statement<T extends QueryResultRow=any>(sql:string,values:unknown[]=[]):Promise<QueryResult<T>> {
    let client:PoolClient;
    try{client=await this.pool.connect();}
    catch{throw new ApiError(503,'The database connection is temporarily unavailable. Please retry.','database_unavailable');}
    let discard=false;
    try{return await client.query<T>(sql,values);}
    catch(error){
      discard=true;
      if((error as any)?.message==='Query read timeout'||/^Connection (?:terminated|closed)/i.test((error as any)?.message||'')
        ||/^(?:ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED)$/.test(String((error as any)?.code||'')))
        throw new ApiError(503,'The database connection was interrupted. Refresh your account before retrying.','database_unavailable');
      throw error;
    }finally{client.release(discard);}
  }
  async system<T>(work: (client: PoolClient) => Promise<T>,admission?:AdmissionOptions): Promise<T> {
    let client:PoolClient;
    try{client=await this.pool.connect();}
    catch{throw new ApiError(503,'The database connection is temporarily unavailable. Please retry.','database_unavailable');}
    let discard = false;
    try {
      await client.query('begin isolation level read committed'+(admission?';'+transactionAdmissionSql(admission):''));
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
      if ((error as any)?.code==='55000'&&message==='Reviewed housing records are paused for backup preparation')
        throw new ApiError(409,'These housing records are paused while reviewed backups are prepared. Try again after the administrator resumes them.','residence_preparation_paused');
      if ((error as any)?.code==='55000'&&message==='Reviewed wipe records are paused for recovery verification')
        throw new ApiError(409,'These reviewed records are paused for recovery verification. Try again after the founder cancels preparation.','system_wipe_scope_paused');
      throw error;
    } finally { client.release(discard); }
  }
  private async lockActor(client: PoolClient, actor: VerifiedActor) {
      // Check and lock the binding inside the same transaction as the operation.
      // Never let request body fields populate these four parameters.
      const binding = await client.query(`select s.session_id,
        private.account_access(c.id) as access,private.account_session_allowed(c.id,s.session_id) as allowed
        from private.account_sessions s
        join auth.sessions live on live.id = s.session_id and live.user_id = s.auth_user_id
        join public.account_contexts c on c.id = s.active_context_id
        where s.session_id = $1 and s.auth_user_id = $2 and s.active_context_id = $3
          and c.kind = $4 and c.status = 'active' and c.auth_user_id = s.auth_user_id
          and (live.not_after is null or live.not_after > now())
          and private.portal_session_allowed(c.id,s.portal_pin_version)
          and (c.kind <> 'admin' or private.administrator_session_allowed(c.id,s.session_id) and exists (select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'))
          and (c.kind <> 'resident' or exists (select 1 from public.allocations a where a.resident_context_id = c.id and a.ended_at is null))
          and (c.kind <> 'staff' or exists (select 1 from public.staff_assignments a where a.staff_context_id = c.id and a.status = 'active' and a.ended_at is null))
        for share of s, c`, [actor.sessionId, actor.authUserId, actor.contextId, actor.kind]);
      if (!binding.rowCount) throw new SessionExpiredError('Your session is no longer active. Please sign in.');
      checkAccountAccess(binding.rows[0].access,actor.requiredFeatures,binding.rows[0].allowed);
      await requireManagerKeyGrant(client,actor);
  }
  async actor<T>(actor: VerifiedActor, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.actorTransaction(actor,work,false);
  }
  /** Explicit pure reads only. Shares administrator governance exclusion with
   * other readers; every mutation keeps actor()/authorizedSystem() exclusive. */
  async readActor<T>(actor: VerifiedActor, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.actorTransaction(actor,work,true);
  }
  private async actorTransaction<T>(actor:VerifiedActor,work:(client:PoolClient)=>Promise<T>,read:boolean):Promise<T> {
    return this.system(async client => {
      // Removal closes another administrator context. Take the governance
      // lock before actor/context row locks so a concurrent target request cannot
      // hold its context while waiting for the founder's governance transaction.
      await this.lockActor(client, actor);
      await this.prepareActor(client,actor,true);
      return work(client);
    },{administrator:actor.kind==='admin'?(read?'read':'write'):undefined});
  }
  /** For narrowly scoped server-owned lifecycle writes that browser roles cannot
   * perform. Rechecks the live actor inside the write transaction; callers must
   * also authorize every target relationship before using this privileged client. */
  async authorizedSystem<T>(actor: VerifiedActor, kinds: string[], work: (client: PoolClient) => Promise<T>, maintenanceChange = false, accountPolicyChange = false,residenceFreezeChange=false): Promise<T> {
    return this.authorizedTransaction(actor,kinds,work,maintenanceChange,accountPolicyChange,residenceFreezeChange,false);
  }
  /** Server-selected pure read, never selected by a browser flag or HTTP method.
   * Status helpers which expire reviews/write receipts must stay exclusive. */
  async authorizedRead<T>(actor:VerifiedActor,kinds:string[],work:(client:PoolClient)=>Promise<T>):Promise<T> {
    return this.authorizedTransaction(actor,kinds,work,false,false,false,true);
  }
  private async authorizedTransaction<T>(actor:VerifiedActor,kinds:string[],work:(client:PoolClient)=>Promise<T>,maintenanceChange:boolean,accountPolicyChange:boolean,residenceFreezeChange:boolean,read:boolean):Promise<T> {
    return this.system(async client => {
      // Lock before account/governance/context rows. Upgrading after taking the
      // settings lock could deadlock with another administrator waiting on it.
      await this.lockActor(client, actor);
      if (!kinds.includes(actor.kind)) throw new ApiError(403, 'This account cannot perform that action.');
      await this.prepareActor(client,actor,false);
      return work(client);
    },{residenceFreezeChange,accountPolicyChange,maintenanceChange,
      administrator:actor.kind==='admin'?(read?'read':'write'):undefined});
  }
  private async prepareActor(client:PoolClient,actor:VerifiedActor,scoped:boolean) {
    // Separate statements retain strict execution order in a single round trip.
    // pg's literal encoder protects the verified claims; SQL/role selection is
    // server-owned. Work starts only after the maintenance result is checked.
    const claims=escapeLiteral(JSON.stringify({sub:actor.authUserId,session_id:actor.sessionId,role:'authenticated'}));
    const results=await client.query(`select set_config('request.jwt.claims', ${claims}, true);select private.platform_access_allowed() as allowed`
      +(scoped?';set local role pinevela_backend':'')) as unknown as QueryResult<{allowed:boolean}>[];
    if (!results[1]?.rows[0]?.allowed)
      throw new ApiError(503,MAINTENANCE_MESSAGE,'platform_maintenance');
  }
  /** Public invitation lifecycle operations use private tables without a bound
   * portal, but still serialize with maintenance transitions. */
  async availableSystem<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
    return this.system(async client=>{
      await takeTransactionAdmission(client);
      if (!(await client.query('select private.platform_available() as available')).rows[0].available)
        throw new ApiError(503,MAINTENANCE_MESSAGE,'platform_maintenance');
      return work(client);
    });
  }
  async publicRows<T extends QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
    return this.system(async client => {
      // Ordered statements retain the transaction lock before checking current
      // availability, while avoiding an extra network round trip. node-postgres
      // returns one result per statement for this parameter-free simple query.
      const admission = await client.query("select pg_advisory_xact_lock_shared(hashtextextended('platform-maintenance',0));select private.platform_available() as available") as unknown as QueryResult<{available:boolean}>[];
      if (!admission[1]?.rows[0]?.available)
        throw new ApiError(503,MAINTENANCE_MESSAGE,'platform_maintenance');
      await client.query('set local role pinevela_catalog');
      return (await client.query<T>(sql, values)).rows;
    });
  }
  async close() { await this.pool.end(); }
}
