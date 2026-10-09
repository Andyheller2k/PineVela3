-- Actual seller-entered profile fields, separately from verified student identity.
alter table public.stores
  add column username text check (length(btrim(username)) between 1 and 120),
  add column location text check (length(btrim(location)) between 1 and 600),
  add column phone_country text check (phone_country ~ '^[A-Z]{2}$'),
  add column setup_completed_at timestamptz,
  add constraint store_setup_fields check (setup_completed_at is null or (
    username is not null and location is not null and phone_country is not null
    and primary_phone is not null and primary_phone ~ '^\+[1-9][0-9]{6,14}$'
    and delivery_mode is not null and delivery_mode in ('Campus Meetup','Store Pickup','Campus Delivery','Pickup or Campus Delivery','Courier Delivery','Digital Delivery','On-site Service')
    and length(btrim(name)) between 1 and 200 and length(btrim(primary_category)) between 1 and 200
    and length(description) <= 4000));
create function private.check_store_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and row(new.id,new.seller_context_id,new.primary_owner_id,new.campus,new.created_at)
    is distinct from row(old.id,old.seller_context_id,old.primary_owner_id,old.campus,old.created_at) then
    raise exception 'Store identity, primary owner and verified campus are immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.setup_completed_at is not null and new.setup_completed_at is distinct from old.setup_completed_at then
    raise exception 'Original store setup time is immutable' using errcode = '23514';
  end if;
  if new.setup_completed_at > clock_timestamp() then
    raise exception 'Store setup cannot be dated in the future' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and not exists(select 1 from public.seller_applications a join public.account_contexts c on c.id = a.seller_context_id
    where a.seller_context_id = new.seller_context_id and a.status = 'approved' and c.primary_owner_id = new.primary_owner_id
      and a.campus = new.campus and c.kind = 'seller' and c.status in ('pending','active')) then
    raise exception 'An approved saved seller application is required to create a store' using errcode = '23514';
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') and (
    new.setup_completed_at is null or new.activated_at is null
    or not exists(select 1 from public.payments p where p.store_id = new.id and p.purpose = 'store_activation' and p.status = 'fulfilled' and p.mode = 'live')
    or not exists(select 1 from public.store_subscriptions s where s.store_id = new.id and s.status = 'active' and s.starts_at <= now() and s.ends_at > now())) then
    raise exception 'Store activation requires completed setup and verified live payment/subscription' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger store_profile_relationships before insert or update on public.stores for each row execute function private.check_store_profile();
revoke all on function private.check_store_profile() from public,anon,authenticated,pinevela_backend;

create or replace function private.store_is_public(store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.stores s join public.account_contexts c on c.id = s.seller_context_id
    join public.seller_applications a on a.seller_context_id = c.id
    where s.id = store and s.status = 'active' and s.setup_completed_at is not null and s.activated_at is not null
      and c.kind = 'seller' and c.status = 'active' and a.status = 'approved'
      and exists(select 1 from public.payments p where p.store_id = s.id and p.purpose = 'store_activation' and p.status = 'fulfilled' and p.mode = 'live')
      and exists(select 1 from public.store_subscriptions sub where sub.store_id = s.id and sub.status = 'active' and sub.starts_at <= now() and sub.ends_at > now()));
$$;
drop policy stores_public_or_owner_read on public.stores;
create policy stores_owner_read on public.stores for select to authenticated using (private.can_manage_store(id));
create or replace view public.store_catalog with (security_barrier = true) as
select s.id,s.name,s.campus,s.primary_category,s.delivery_mode,s.description,s.primary_phone,
  case when plan.plan in ('pine_star','pine_pro') then coalesce(s.logo_path,'/store-covers/pinevela-logo.svg') else '/store-covers/pinevela-logo.svg' end as logo_path,
  case when plan.plan in ('pine_star','pine_pro') then coalesce(s.cover_path,'/store-covers/campus-blue.svg')
    when s.cover_path in ('/store-covers/campus-blue.svg','/store-covers/golden-pine.svg','/store-covers/forest-glass.svg','/store-covers/midnight-campus.svg') then s.cover_path
    else '/store-covers/campus-blue.svg' end as cover_path,
  s.activated_at,plan.plan,s.username,s.location,s.phone_country
from public.stores s join lateral (select sub.plan from public.store_subscriptions sub where sub.store_id = s.id
  and sub.status = 'active' and sub.starts_at <= now() and sub.ends_at > now() order by sub.starts_at desc limit 1) plan on true
where private.store_is_public(s.id);
