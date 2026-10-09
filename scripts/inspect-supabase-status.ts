/** Read-only migration inventory; never prints identities, sessions or secrets. */
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
dotenv.config({quiet:true});
const db = new SupabaseDatabase();
try {
  const inventory = (await db.pool.query(`select
    (select max(version) from private.schema_migrations) as latest_migration,
    (select count(*)::integer from private.schema_migrations) as migrations,
    (select count(*)::integer from auth.users) as auth_users,
    (select count(*)::integer from auth.sessions) as auth_sessions,
    (select count(*)::integer from public.profiles) as profiles,
    (select count(*)::integer from storage.objects) as storage_objects,
    (select count(*)::integer from pg_tables where schemaname = 'public') as public_tables,
    (select count(*)::integer from pg_tables where schemaname = 'public' and not rowsecurity) as tables_without_rls`)).rows[0];
  const waits = (await db.pool.query(`select application_name,state,wait_event_type,wait_event,count(*)::integer as connections
    from pg_stat_activity where datname = current_database() and application_name in ('psql','pinevela-supabase','pg_dump')
    group by application_name,state,wait_event_type,wait_event`)).rows;
  console.log(JSON.stringify({inventory,waits,readOnly:true}));
} finally {await db.close();}
