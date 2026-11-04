/** Read-only aggregate diagnosis. Never returns identities, passwords or tokens. */
import dotenv from 'dotenv';
import { SupabaseDatabase } from '../supabase/db.js';

dotenv.config({quiet:true});
let db:SupabaseDatabase|undefined;
try {
  db=new SupabaseDatabase();
  const client=await db.pool.connect();
  try {
    await client.query("begin read only; set local statement_timeout='8s'");
    const integrity=(await client.query(`with sellers as (
      select c.*,u.email_confirmed_at,p.primary_owner_id as profile_owner
      from public.account_contexts c join auth.users u on u.id=c.auth_user_id
      join public.profiles p on p.id=c.auth_user_id where c.kind='seller' and c.status<>'closed'
    ) select count(*)::int as current_seller_contexts,
      count(*) filter(where auth_user_id=primary_owner_id)::int as seller_using_owner_identity,
      count(*) filter(where primary_owner_id is distinct from profile_owner)::int as mismatched_owner_relationships,
      count(*) filter(where not exists(select 1 from public.account_contexts owner
        where owner.auth_user_id=sellers.primary_owner_id and owner.kind='primary' and owner.status='active'))::int as sellers_without_active_primary,
      count(*) filter(where status='active' and email_confirmed_at is null)::int as unverified_active_sellers
      from sellers`)).rows[0];
    const emailIntegrity=(await client.query(`select count(*)::int as profile_email_mismatches
      from public.profiles p join auth.users u on u.id=p.id where lower(p.email) is distinct from lower(u.email)`)).rows[0];
    const contexts=(await client.query(`select c.kind,c.status,count(*)::int as count from public.account_contexts c
      where c.kind in ('primary','seller') group by c.kind,c.status order by c.kind,c.status`)).rows;
    const linkedPrimaryReadiness=(await client.query(`with owners as (
      select distinct owner.id,owner.auth_user_id from public.account_contexts seller
      join public.account_contexts owner on owner.auth_user_id=seller.primary_owner_id and owner.kind='primary'
      where seller.kind='seller' and seller.status<>'closed'
    ) select count(*)::int as linked_primary_accounts,
      count(*) filter(where u.email_confirmed_at is not null)::int as confirmed,
      count(*) filter(where coalesce(u.encrypted_password,'')<>'')::int as password_enabled,
      count(*) filter(where exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'))::int as google_enabled,
      count(*) filter(where u.deleted_at is not null or u.banned_until>now() or
        coalesce((private.account_access(owners.id)->>'banned')::boolean,false))::int as sign_in_blocked
      from owners join auth.users u on u.id=owners.auth_user_id`)).rows[0];
    await client.query('rollback');
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,identitiesIncluded:false,integrity,emailIntegrity,linkedPrimaryReadiness,contexts},null,2));
  }finally{client.release();}
}catch(error){
  const code=String((error as any)?.code||'database_unavailable');
  console.log(JSON.stringify({readOnly:true,completed:false,code:/^[A-Za-z0-9_]{1,60}$/.test(code)?code:'database_unavailable'}));process.exitCode=1;
}finally{await db?.pool.end();}
