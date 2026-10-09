/** Private, one-time founder grant. Public signup never calls this script. */
import dotenv from 'dotenv';
import { SupabaseDatabase, uuid } from '../supabase/db.js';
import { googleIdentity } from '../googleAuth.js';
dotenv.config({ quiet: true });
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--auth-user-id') throw new Error('Pass --auth-user-id and the new verified Google Auth UUID.');
const id = uuid(args[1]);
const url = new URL(process.env.SUPABASE_URL || '');
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!secret || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Valid server-only Supabase configuration is required.');
const response = await fetch(`${url.origin}/auth/v1/admin/users/${id}`, {
  headers: { apikey: secret, Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store',
});
if (!response.ok) throw new Error('Could not verify the selected Auth identity.');
const identity = googleIdentity(await response.json());
if (identity.id !== id || identity.email !== 'andyheller2k@gmail.com') throw new Error('Only the selected verified Google founder identity may be provisioned.');
const db = new SupabaseDatabase();
try {
  await db.system(async client => {
    await client.query("select pg_advisory_xact_lock(hashtext('pinevela-founder-provision'))");
    if ((await client.query('select context_id from public.admin_memberships')).rowCount) throw new Error('Administrator membership already exists; use administrator governance instead.');
    const person = await client.query('select id from public.profiles where id = $1 and lower(email) = $2 for update', [id,identity.email]);
    if (!person.rowCount) throw new Error('The new founder must first sign up through the new application. Legacy cloud accounts are not imported.');
    const context = await client.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values ($1,$1,'admin','active') returning id", [id]);
    await client.query('insert into public.admin_memberships(context_id,slot) values ($1,1)', [context.rows[0].id]);
    await client.query('insert into private.admin_secrets(context_id) values ($1)', [context.rows[0].id]);
    await client.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values ($1,'founder_provisioned','profile',$2)", [context.rows[0].id,id]);
  });
  console.log(JSON.stringify({ founderProvisioned: true, slot: 1, provider: 'verified_google', privateKeyEnrollmentRequired: true }));
} finally { await db.close(); }
