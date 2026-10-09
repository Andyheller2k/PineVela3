-- Express uses this non-login role only after verifying Supabase Auth. It has no
-- BYPASSRLS and cannot create identities, contexts, memberships, or session bindings.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pinevela_backend') then
    create role pinevela_backend nologin inherit nobypassrls;
  end if;
end $$;
grant authenticated to pinevela_backend;
grant pinevela_backend to postgres;
grant usage on schema public, private to pinevela_backend;
grant select on all tables in schema public to pinevela_backend;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;

-- A revoked Auth session must stop database access even before JWT expiry.
create or replace function private.current_context_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.active_context_id
  from private.account_sessions s
  join public.account_contexts c on c.id = s.active_context_id
  join auth.sessions live on live.id = s.session_id and live.user_id = s.auth_user_id
  where s.auth_user_id = (select auth.uid())
    and c.auth_user_id = s.auth_user_id and c.status = 'active'
    and (live.not_after is null or live.not_after > now())
    and s.session_id = case
      when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      then (select auth.jwt()->>'session_id')::uuid else null end
  limit 1;
$$;

-- Approved public cards come from the six safe views, not base operational rows.
drop policy residences_visible on public.residences;
create policy residences_member_read on public.residences for select to authenticated
  using (private.current_context_id() is not null and (private.has_residence_access(id) or primary_owner_id = (select auth.uid()) or private.current_kind() = 'admin'));
create or replace function private.can_view_residence(residence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_context_id() is not null and (
    private.has_residence_access(residence)
    or exists (select 1 from public.residences r where r.id = residence and r.primary_owner_id = (select auth.uid()))
  );
$$;
drop policy contexts_subject_read on public.account_contexts;
create policy contexts_subject_read on public.account_contexts for select to authenticated
  using (private.current_context_id() is not null and (auth_user_id = (select auth.uid()) or private.current_kind() = 'admin'));
drop policy profiles_owner_read on public.profiles;
create policy profiles_owner_read on public.profiles for select to authenticated
  using (private.current_context_id() is not null and id = (select auth.uid()));
drop policy verification_cases_related_read on public.verification_cases;
create policy verification_cases_related_read on public.verification_cases for select to authenticated
  using (exists (select 1 from public.account_contexts c where c.id = applicant_context_id and c.auth_user_id = (select auth.uid())) or private.current_kind() = 'admin');
drop policy seller_applications_related_read on public.seller_applications;
create policy seller_applications_related_read on public.seller_applications for select to authenticated
  using (exists (select 1 from public.account_contexts c where c.id = seller_context_id and c.auth_user_id = (select auth.uid())) or private.current_kind() = 'admin');

-- The API can update only approved person fields; email stays controlled by Auth.
grant update(display_name, phone, avatar_path, updated_at) on public.profiles to pinevela_backend;
create policy profiles_backend_update on public.profiles for update to pinevela_backend
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update(read_at, popup_acknowledged_at) on public.notification_recipients to pinevela_backend;
create policy recipient_backend_update on public.notification_recipients for update to pinevela_backend
  using (context_id = private.current_context_id()) with check (context_id = private.current_context_id());

-- Prevent malformed cross-role relationships even in trusted server transactions.
create function private.require_context_kind(context uuid, expected text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_contexts c where c.id = context and c.kind = expected);
$$;
create function private.check_workflow_relationships() returns trigger
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
    select c.auth_user_id into owner_user from public.account_contexts c where c.id = new.seller_context_id and c.kind = 'seller';
    if owner_user is distinct from new.primary_owner_id then raise exception 'Store owner must match seller identity' using errcode = '23514'; end if;
  elsif tg_table_name = 'market_orders' then
    select c.auth_user_id into owner_user from public.account_contexts c where c.id = new.buyer_context_id and c.kind = 'primary';
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
do $$ declare relation text; begin
  foreach relation in array array['manager_assignments','allocations','staff_assignments','maintenance_issues','stores','market_orders','market_messages','admin_memberships'] loop
    execute format('create trigger pinevela_relationships before insert or update on public.%I for each row execute function private.check_workflow_relationships()', relation);
  end loop;
end $$;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Private helpers must be explicit.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_context_id(), private.current_kind(),
  private.can_manage_residence(uuid), private.can_view_residence(uuid),
  private.has_residence_access(uuid), private.can_manage_store(uuid) to authenticated, pinevela_backend;
grant execute on function private.store_is_public(uuid) to anon, authenticated, pinevela_backend;
alter default privileges in schema private revoke execute on functions from public;
