-- Maintenance is private configuration. No accounts or operational notices are seeded.
create function private.platform_available() returns boolean
language sql stable security definer set search_path='' as $$
  select not coalesce((select value->'maintenanceMode'='true'::jsonb from private.platform_settings where key='platform'),false);
$$;
-- Preserve all existing live-session, portal-PIN and role relationship checks.
create function private.bound_context_id() returns uuid
language sql stable security definer set search_path='' as $$
  select s.active_context_id from private.account_sessions s
  join public.account_contexts c on c.id=s.active_context_id
  join auth.sessions live on live.id=s.session_id and live.user_id=s.auth_user_id
  where s.auth_user_id=(select auth.uid()) and c.auth_user_id=s.auth_user_id and c.status='active'
    and (live.not_after is null or live.not_after>now())
    and private.portal_session_allowed(c.id,s.portal_pin_version)
    and (c.kind<>'admin' or exists(select 1 from public.admin_memberships m where m.context_id=c.id and m.status='active'))
    and (c.kind<>'staff' or exists(select 1 from public.staff_assignments a where a.staff_context_id=c.id and a.status='active' and a.ended_at is null))
    and (c.kind<>'resident' or exists(select 1 from public.allocations a where a.resident_context_id=c.id and a.ended_at is null))
    and s.session_id=case when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      then (select auth.jwt()->>'session_id')::uuid else null end limit 1;
$$;
create function private.platform_access_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select private.platform_available() or exists(select 1 from public.account_contexts c
    where c.id=private.bound_context_id() and c.kind='admin');
$$;
create or replace function private.current_context_id() returns uuid
language sql stable security definer set search_path='' as $$
  select private.bound_context_id() where private.platform_access_allowed();
$$;
revoke all on function private.platform_available(),private.bound_context_id(),private.platform_access_allowed() from public,anon,authenticated,pinevela_backend;
grant execute on function private.platform_access_allowed() to anon,authenticated,pinevela_backend;

-- Restrictive policies also cover older policies that check only auth.uid().
do $$ declare relation text; begin
  for relation in select tablename from pg_tables where schemaname='public' loop
    execute format('create policy platform_maintenance_boundary on public.%I as restrictive for all to anon,authenticated using (private.platform_access_allowed()) with check (private.platform_access_allowed())',relation);
  end loop;
end $$;
-- Preserve the vetted projection columns, existing filters and ACLs; pause their
-- owner-executed reads too. These views already use explicit publication/role checks.
do $$ declare relation text; definition text; begin
  foreach relation in array array['residence_catalog','store_catalog','listing_catalog','market_reviews_public',
    'listing_media_public','listing_price_options_public','housing_staff_directory','housing_issue_details',
    'housing_bargain_details','account_activity_feed','housing_staff_reviews','housing_meeting_details',
    'housing_meeting_participants','seller_application_details'] loop
    definition:=regexp_replace(pg_get_viewdef(('public.'||relation)::regclass,true),'[;[:space:]]+$','');
    execute format('create or replace view public.%I with (security_barrier=true) as select * from (%s) projection where private.platform_access_allowed()',relation,definition);
  end loop;
end $$;

create table private.maintenance_recovery_notices (
  id uuid primary key default gen_random_uuid(),
  created_by_context_id uuid not null references public.admin_memberships(context_id),
  message text not null check(length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null,
  expires_at timestamptz not null check(expires_at-created_at=interval '24 hours')
);
create table private.maintenance_recovery_recipients (
  notice_id uuid not null references private.maintenance_recovery_notices(id) on delete cascade,
  context_id uuid not null references public.account_contexts(id) on delete cascade,
  dismissed_at timestamptz,
  primary key(notice_id,context_id)
);
create index maintenance_recovery_latest on private.maintenance_recovery_notices(created_at desc,id desc);
create index maintenance_recovery_author on private.maintenance_recovery_notices(created_by_context_id);
create index maintenance_recovery_context on private.maintenance_recovery_recipients(context_id);
alter table private.maintenance_recovery_notices enable row level security;
alter table private.maintenance_recovery_recipients enable row level security;
revoke all on private.maintenance_recovery_notices,private.maintenance_recovery_recipients from public,anon,authenticated,pinevela_backend;
grant select on private.maintenance_recovery_notices,private.maintenance_recovery_recipients to pinevela_backend;
grant update(dismissed_at) on private.maintenance_recovery_recipients to pinevela_backend;
create function private.latest_maintenance_notice() returns uuid
language sql stable security definer set search_path='' as $$
  select id from private.maintenance_recovery_notices order by created_at desc,id desc limit 1;
$$;
revoke all on function private.latest_maintenance_notice() from public,anon,authenticated,pinevela_backend;
grant execute on function private.latest_maintenance_notice() to pinevela_backend;
create policy maintenance_return_recipient_read on private.maintenance_recovery_recipients for select to pinevela_backend
  using(context_id=private.current_context_id() and private.current_kind()<>'admin');
create policy maintenance_return_recipient_dismiss on private.maintenance_recovery_recipients for update to pinevela_backend
  using(context_id=private.current_context_id() and private.current_kind()<>'admin')
  with check(context_id=private.current_context_id() and private.current_kind()<>'admin');
create policy maintenance_return_notice_read on private.maintenance_recovery_notices for select to pinevela_backend
  using(id=private.latest_maintenance_notice() and expires_at>clock_timestamp()
    and exists(select 1 from private.maintenance_recovery_recipients r where r.notice_id=id and r.context_id=private.current_context_id()));

create function private.maintenance_dismiss_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.notice_id is distinct from old.notice_id or new.context_id is distinct from old.context_id
    or new.context_id is distinct from private.current_context_id() or private.current_kind()='admin'
    or not private.platform_available() or new.notice_id is distinct from private.latest_maintenance_notice()
    or not exists(select 1 from private.maintenance_recovery_notices n where n.id=new.notice_id and n.created_at<=clock_timestamp() and n.expires_at>clock_timestamp()) then
    raise exception using errcode='42501',message='Current eligible notice recipient required';
  end if;
  new.dismissed_at:=coalesce(old.dismissed_at,clock_timestamp());return new;
end;
$$;
revoke all on function private.maintenance_dismiss_guard() from public,anon,authenticated,pinevela_backend;
create trigger maintenance_dismiss_guard before update on private.maintenance_recovery_recipients
  for each row execute function private.maintenance_dismiss_guard();

alter table private.platform_settings add constraint platform_maintenance_boolean check
  (key<>'platform' or not(value?'maintenanceMode') or jsonb_typeof(value->'maintenanceMode')='boolean');
create function private.maintenance_transition_guard() returns trigger
language plpgsql set search_path='' as $$
declare before boolean; after boolean; message text;
begin
  if tg_op='DELETE' then
    if old.key='platform' and old.value->'maintenanceMode'='true'::jsonb then
      raise exception using errcode='42501',message='End maintenance with an authorized recovery message';
    end if;return old;
  end if;
  if new.key<>'platform' then return new;end if;
  before:=case when tg_op='INSERT' then false else coalesce(old.value->'maintenanceMode'='true'::jsonb,false) end;
  after:=coalesce(new.value->'maintenanceMode'='true'::jsonb,false);
  if before is distinct from after then
    perform pg_advisory_xact_lock(hashtextextended('platform-maintenance',0));
    if private.settings_authorized_context() is null then
      raise exception using errcode='42501',message='An active administrator settings-key grant is required';
    end if;
    message:=btrim(coalesce(current_setting('pinevela.maintenance_return_message',true),''));
    if before and not after and length(message) not between 1 and 2000 then
      raise exception using errcode='23514',message='A recovery message is required before restoring service';
    end if;
  end if;return new;
end;
$$;
create function private.maintenance_transition_recorded() returns trigger
language plpgsql set search_path='' as $$
declare before boolean; after boolean; notice uuid; admin_notice uuid; restored_at timestamptz; recipient uuid;
begin
  if new.key<>'platform' then return null;end if;
  before:=case when tg_op='INSERT' then false else coalesce(old.value->'maintenanceMode'='true'::jsonb,false) end;
  after:=coalesce(new.value->'maintenanceMode'='true'::jsonb,false);
  if before is not distinct from after then return null;end if;
  if before and not after then
    restored_at:=clock_timestamp();
    insert into private.maintenance_recovery_notices(created_by_context_id,message,created_at,expires_at)
      values(private.current_context_id(),btrim(current_setting('pinevela.maintenance_return_message',true)),restored_at,restored_at+interval '24 hours') returning id into notice;
    insert into private.maintenance_recovery_recipients(notice_id,context_id)
      select notice,id from public.account_contexts where kind<>'admin' and status='active';
  end if;
  insert into private.audit_events(actor_context_id,event_type,resource_type)
    values(private.current_context_id(),case when after then 'platform_maintenance_enabled' else 'platform_restored' end,'platform_settings');
  insert into public.notifications(sender_context_id,category,title,message,link)
    values(private.current_context_id(),'admin_settings',case when after then 'Maintenance mode enabled' else 'PineVela service restored' end,
      case when after then 'An administrator enabled maintenance. Non-admin account operations are paused.' else 'An administrator restored service and saved a recovery notice for existing accounts.' end,'admin-settings') returning id into admin_notice;
  insert into public.notification_recipients(notification_id,context_id)
    select admin_notice,m.context_id from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    where m.status='active' and c.status='active' and c.kind='admin';
  for recipient in select context_id from public.notification_recipients where notification_id=admin_notice loop
    perform pg_notify('pinevela_notifications',recipient::text);
  end loop;
  return null;
end;
$$;
revoke all on function private.maintenance_transition_guard(),private.maintenance_transition_recorded() from public,anon,authenticated,pinevela_backend;
create trigger maintenance_transition_guard before insert or update or delete on private.platform_settings
  for each row execute function private.maintenance_transition_guard();
create trigger maintenance_transition_recorded after insert or update on private.platform_settings
  for each row execute function private.maintenance_transition_recorded();
