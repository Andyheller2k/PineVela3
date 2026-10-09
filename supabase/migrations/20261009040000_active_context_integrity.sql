-- CHECK treats NULL as satisfied, so service location mode must be explicit.
alter table public.listings drop constraint service_location_consistent;
alter table public.listings add constraint service_location_consistent check (
  (kind = 'product' and service_location_mode is null) or
  (kind = 'service' and service_location_mode is not null and service_location_mode in ('flexible','fixed','hybrid') and
    ((service_location_mode = 'flexible' and latitude is null and longitude is null) or
      (service_location_mode in ('fixed','hybrid') and latitude is not null and longitude is not null)))
);

create or replace function private.current_context_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.active_context_id from private.account_sessions s
  join public.account_contexts c on c.id = s.active_context_id
  join auth.sessions live on live.id = s.session_id and live.user_id = s.auth_user_id
  where s.auth_user_id = (select auth.uid()) and c.auth_user_id = s.auth_user_id and c.status = 'active'
    and (live.not_after is null or live.not_after > now())
    and (c.kind <> 'admin' or exists (select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'))
    and (c.kind <> 'staff' or exists (select 1 from public.staff_assignments a where a.staff_context_id = c.id and a.status = 'active' and a.ended_at is null))
    and (c.kind <> 'resident' or exists (select 1 from public.allocations a where a.resident_context_id = c.id and a.ended_at is null))
    and s.session_id = case when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      then (select auth.jwt()->>'session_id')::uuid else null end
  limit 1;
$$;
