-- Device capabilities and delivery state are private server-owned records.
-- No user is subscribed or opted into discovery by this migration.
create table private.device_push_installations (
  id uuid primary key,
  owner_auth_user_id uuid not null references public.profiles(id) on delete cascade,
  secret_sha256 text not null check(secret_sha256 ~ '^[0-9a-f]{64}$'),
  platform text not null check(platform in ('web','android')),
  endpoint jsonb not null,
  endpoint_sha256 text not null unique check(endpoint_sha256 ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '90 days'
);
create table private.device_push_bindings (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references private.device_push_installations(id) on delete cascade,
  context_id uuid not null references public.account_contexts(id) on delete cascade,
  auth_user_id uuid not null,
  session_id uuid not null references private.account_sessions(session_id) on delete cascade,
  portal_pin_version bigint,
  account_alerts boolean not null default true,
  marketplace boolean not null default false,
  residences boolean not null default false,
  enabled boolean not null default true,
  enabled_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(context_id,auth_user_id) references public.account_contexts(id,auth_user_id) on delete cascade,
  unique(installation_id,context_id)
);
create index device_push_bindings_context_idx on private.device_push_bindings(context_id) where enabled;
create table private.device_push_publications (
  kind text not null check(kind in ('listing','residence')),
  subject_id uuid not null,
  notification_id uuid unique references public.notifications(id) on delete set null,
  announced_at timestamptz not null default clock_timestamp(),
  primary key(kind,subject_id)
);
-- Existing catalog entries are a baseline, not a campaign to existing users.
insert into private.device_push_publications(kind,subject_id)
 select 'listing',id from private.listing_catalog
 union all select 'residence',id from private.residence_catalog;
create table private.device_push_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null,
  context_id uuid not null,
  installation_id uuid not null references private.device_push_installations(id) on delete cascade,
  binding_id uuid not null references private.device_push_bindings(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','processing','sent','cancelled','failed')),
  attempts integer not null default 0 check(attempts between 0 and 6),
  available_at timestamptz not null default clock_timestamp(),
  lease_id uuid,
  lease_until timestamptz,
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
  delivered_at timestamptz,
  failure_code text,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(notification_id,context_id) references public.notification_recipients(notification_id,context_id) on delete cascade,
  unique(notification_id,context_id,installation_id)
);
create index device_push_jobs_pending_idx on private.device_push_jobs(available_at,created_at)
 where state in ('pending','processing');

alter table private.device_push_installations enable row level security;
alter table private.device_push_bindings enable row level security;
alter table private.device_push_publications enable row level security;
alter table private.device_push_jobs enable row level security;
revoke all on private.device_push_installations,private.device_push_bindings,
 private.device_push_publications,private.device_push_jobs from public,anon,authenticated,pinevela_backend,pinevela_catalog;

-- Invoker rights deliberately remain in place. Notification creation already
-- runs in authorized server/system transactions; browser roles cannot enqueue.
create function private.queue_device_push() returns trigger
language plpgsql set search_path='' as $$
begin
  insert into private.device_push_jobs(notification_id,context_id,installation_id,binding_id)
  select new.notification_id,new.context_id,i.id,b.id
  from private.device_push_bindings b join private.device_push_installations i on i.id=b.installation_id
  join public.notifications n on n.id=new.notification_id
  where b.context_id=new.context_id and b.enabled and i.enabled and i.expires_at>clock_timestamp()
    and n.created_at>=b.enabled_at
    and case n.category when 'discover_market' then b.marketplace
      when 'discover_residence' then b.residences else b.account_alerts end
  on conflict(notification_id,context_id,installation_id) do nothing;
  perform pg_notify('pinevela_device_push','queued');
  return new;
end;
$$;
revoke all on function private.queue_device_push() from public,anon,authenticated,pinevela_backend,pinevela_catalog;
create trigger pinevela_queue_device_push after insert on public.notification_recipients
 for each row execute function private.queue_device_push();

create function private.wake_device_push_catalog() returns trigger
language plpgsql set search_path='' as $$
begin
  perform pg_notify('pinevela_device_push','catalog');
  return new;
end;
$$;
revoke all on function private.wake_device_push_catalog() from public,anon,authenticated,pinevela_backend,pinevela_catalog;
create trigger pinevela_push_listing_catalog after insert or update of is_published on public.listings
 for each statement execute function private.wake_device_push_catalog();
create trigger pinevela_push_residence_catalog after insert or update of status on public.residences
 for each statement execute function private.wake_device_push_catalog();
