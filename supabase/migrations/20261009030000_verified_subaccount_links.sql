-- User decision: primary, resident, manager and seller accounts have separate
-- verified Supabase identities. Email equality never establishes their relationship.
alter table public.profiles add column primary_owner_id uuid references public.profiles(id);
alter table public.profiles add constraint profile_owner_distinct check (primary_owner_id is null or primary_owner_id <> id);
create index profiles_primary_owner_idx on public.profiles(primary_owner_id);

create function private.check_primary_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.primary_owner_id is not null and new.primary_owner_id is distinct from old.primary_owner_id then
    raise exception 'A verified owner relationship is immutable' using errcode = '23514';
  end if;
  if new.primary_owner_id is not null and not exists (
    select 1 from public.profiles p where p.id = new.primary_owner_id and p.primary_owner_id is null
  ) then raise exception 'A linked identity requires a canonical primary owner' using errcode = '23514'; end if;
  if new.primary_owner_id is not null and exists (select 1 from public.profiles child where child.primary_owner_id = new.id) then
    raise exception 'A primary owner cannot become a nested sub-account' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger pinevela_profile_primary_owner before insert or update of primary_owner_id on public.profiles
for each row execute function private.check_primary_owner();

alter table public.account_contexts add constraint secondary_identity_distinct check (
  kind not in ('resident','manager','seller') or (primary_owner_id is not null and primary_owner_id <> auth_user_id)
);
create unique index contexts_owner_kind_idx on public.account_contexts(primary_owner_id, kind)
  where primary_owner_id is not null and kind in ('resident','manager','seller') and status <> 'closed';
create function private.check_context_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('resident','manager','seller') and not exists (
    select 1 from public.profiles p where p.id = new.auth_user_id and p.primary_owner_id = new.primary_owner_id
  ) then raise exception 'Sub-account must match its saved primary owner' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger pinevela_context_owner before insert or update of auth_user_id, primary_owner_id, kind on public.account_contexts
for each row execute function private.check_context_owner();

-- Only the backend creates an enrollment after authorizing its initiator. The
-- verified provider subject must match the enrollment before it can be linked.
create table private.account_enrollments (
  id uuid primary key default gen_random_uuid(),
  initiator_context_id uuid not null references public.account_contexts(id),
  primary_owner_id uuid references public.profiles(id),
  kind text not null check (kind in ('resident','manager','seller','staff','officer')),
  invited_email text not null,
  token_digest text not null unique,
  auth_user_id uuid references auth.users(id),
  linked_context_id uuid references public.account_contexts(id),
  room_id uuid references public.rooms(id),
  residence_id uuid references public.residences(id),
  enrollment_fields jsonb not null default '{}'::jsonb,
  status text not null default 'pending_email' check (status in ('pending_email','pending_review','completed','expired','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  check (expires_at > created_at),
  check (kind not in ('resident','manager','seller') or primary_owner_id is not null)
);
create index account_enrollments_owner_idx on private.account_enrollments(primary_owner_id, created_at desc);
alter table private.account_enrollments enable row level security;
revoke all on private.account_enrollments from public, anon, authenticated, pinevela_backend;

-- One allocation per primary person remains true across their separate identities.
alter table public.allocations add column primary_owner_id uuid references public.profiles(id);
create function private.set_allocation_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(c.primary_owner_id,c.auth_user_id) into new.primary_owner_id from public.account_contexts c
    where c.id = new.resident_context_id and c.kind = 'resident';
  if new.primary_owner_id is null then raise exception 'Resident owner required' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger pinevela_allocation_owner before insert or update of resident_context_id, primary_owner_id on public.allocations
for each row execute function private.set_allocation_owner();
update public.allocations a set primary_owner_id = coalesce(c.primary_owner_id,c.auth_user_id)
from public.account_contexts c where c.id = a.resident_context_id;
alter table public.allocations alter column primary_owner_id set not null;
create unique index allocations_current_primary_owner_idx on public.allocations(primary_owner_id) where ended_at is null;

-- Seller ownership is the saved primary relationship, not the work-email subject.
create or replace function private.check_workflow_relationships() returns trigger
language plpgsql security definer set search_path = '' as $$
declare related_residence uuid; owner_user uuid;
begin
  if tg_table_name = 'manager_assignments' then
    if not private.require_context_kind(new.manager_context_id, 'manager') then raise exception 'Manager context required' using errcode = '23514'; end if;
  elsif tg_table_name = 'allocations' then
    if not private.require_context_kind(new.resident_context_id, 'resident') then raise exception 'Resident context required' using errcode = '23514'; end if;
  elsif tg_table_name = 'staff_assignments' then
    if not private.require_context_kind(new.staff_context_id, 'staff') or not exists (
      select 1 from public.manager_assignments m join public.account_contexts c on c.id = m.manager_context_id
      where m.manager_context_id = new.created_by_manager_id and m.residence_id = new.residence_id
        and m.ended_at is null and c.kind = 'manager'
    ) then raise exception 'Authorized staff and manager relationship required' using errcode = '23514'; end if;
    if new.assigned_block_id is not null and not exists (select 1 from public.blocks b where b.id = new.assigned_block_id and b.residence_id = new.residence_id) then raise exception 'Staff block belongs to another residence' using errcode = '23514'; end if;
  elsif tg_table_name = 'maintenance_issues' then
    if new.room_id is not null then
      select b.residence_id into related_residence from public.rooms r join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id where r.id = new.room_id;
      if related_residence is distinct from new.residence_id then raise exception 'Issue room belongs to another residence' using errcode = '23514'; end if;
    end if;
    if new.assigned_staff_id is not null and not exists (select 1 from public.staff_assignments s where s.id = new.assigned_staff_id and s.residence_id = new.residence_id and s.status = 'active' and s.ended_at is null) then raise exception 'Issue requires active staff of the same residence' using errcode = '23514'; end if;
  elsif tg_table_name = 'stores' then
    select c.primary_owner_id into owner_user from public.account_contexts c where c.id = new.seller_context_id and c.kind = 'seller';
    if owner_user is distinct from new.primary_owner_id then raise exception 'Store owner must match seller primary owner' using errcode = '23514'; end if;
  elsif tg_table_name = 'market_orders' then
    select coalesce(p.primary_owner_id,p.id) into owner_user from public.account_contexts c
      join public.profiles p on p.id = c.auth_user_id where c.id = new.buyer_context_id and c.kind = 'primary';
    if owner_user is null or exists (select 1 from public.stores s where s.id = new.store_id and s.primary_owner_id = owner_user) then raise exception 'Eligible primary buyer required' using errcode = '23514'; end if;
    if new.total_amount <> new.unit_price * new.quantity then raise exception 'Order total mismatch' using errcode = '23514'; end if;
  elsif tg_table_name = 'market_messages' then
    if not private.require_context_kind(new.buyer_context_id, 'primary') or not (
      new.sender_context_id = new.buyer_context_id or exists (select 1 from public.stores s where s.id = new.store_id and s.seller_context_id = new.sender_context_id)
    ) then raise exception 'Buyer-seller participants required' using errcode = '23514'; end if;
  elsif tg_table_name = 'admin_memberships' then
    if not private.require_context_kind(new.context_id, 'admin') then raise exception 'Admin context required' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

create or replace view public.market_reviews_public with (security_barrier = true) as
select r.id, r.store_id, o.listing_id, r.rating, r.review, r.created_at
from public.market_reviews r join public.market_orders o on o.id = r.order_id
join public.account_contexts buyer on buyer.id = o.buyer_context_id
join public.profiles p on p.id = buyer.auth_user_id
join public.stores s on s.id = r.store_id
where o.status = 'completed' and coalesce(p.primary_owner_id,p.id) <> s.primary_owner_id
  and private.store_is_public(s.id);

create or replace function private.verify_market_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare buyer_user uuid; owner_user uuid; order_status text;
begin
  select coalesce(p.primary_owner_id,p.id), s.primary_owner_id, o.status into buyer_user, owner_user, order_status
  from public.market_orders o join public.account_contexts b on b.id = o.buyer_context_id
  join public.profiles p on p.id = b.auth_user_id join public.stores s on s.id = o.store_id
  where o.id = new.order_id and o.buyer_context_id = new.buyer_context_id and o.store_id = new.store_id;
  if buyer_user is null or order_status <> 'completed' or buyer_user = owner_user then raise exception 'Review requires an eligible completed purchase'; end if;
  return new;
end;
$$;
