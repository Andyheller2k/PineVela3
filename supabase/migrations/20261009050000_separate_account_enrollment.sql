-- A server-authorized enrollment reserves a distinct email identity. Public
-- metadata cannot choose a role or parent: its one-time nonce must match the
-- private reservation. No existing Auth users are adopted or updated here.
create unique index enrollments_pending_email_idx on private.account_enrollments(lower(invited_email))
  where status = 'pending_email';
create unique index enrollments_pending_owner_kind_idx on private.account_enrollments(primary_owner_id,kind)
  where status in ('pending_email','pending_review');
create unique index enrollments_auth_subject_kind_idx on private.account_enrollments(auth_user_id,kind)
  where auth_user_id is not null;
create unique index enrollments_linked_context_idx on private.account_enrollments(linked_context_id)
  where linked_context_id is not null;
alter table private.account_enrollments add constraint enrollment_email_canonical check (
  invited_email = lower(trim(invited_email)) and length(invited_email) between 3 and 254
);
alter table private.account_enrollments add constraint enrollment_challenge_sha256 check (token_digest ~ '^[0-9a-f]{64}$');

create function private.initialize_auth_profile(subject uuid, signup_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare person auth.users%rowtype; enrollment private.account_enrollments%rowtype; context_id uuid;
begin
  select * into strict person from auth.users where id = subject;
  if person.email is null or trim(person.email) = '' or person.is_anonymous then
    raise exception 'A permanent email identity is required' using errcode = '23514';
  end if;
  select * into enrollment from private.account_enrollments
    where invited_email = lower(trim(person.email)) and status = 'pending_email'
      and expires_at > clock_timestamp() for update;
  if found then
    if enrollment.auth_user_id is not null or enrollment.kind not in ('resident','manager','seller')
      or signup_token is null or length(signup_token) <> 64
      or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(signup_token,'UTF8')),'hex') <> enrollment.token_digest
      or not exists (
        select 1 from public.account_contexts c join public.profiles p on p.id = c.auth_user_id
        join auth.users u on u.id = p.id
        where c.id = enrollment.initiator_context_id and c.auth_user_id = enrollment.primary_owner_id
          and c.kind = 'primary' and c.status = 'active' and p.primary_owner_id is null
          and u.email_confirmed_at is not null
      ) then raise exception 'Signup does not match the authorized enrollment' using errcode = '23514'; end if;
    insert into public.profiles(id,display_name,email,phone,primary_owner_id)
      values(subject,enrollment.enrollment_fields->>'displayName',lower(trim(person.email)),
        nullif(enrollment.enrollment_fields->>'phone',''),enrollment.primary_owner_id);
    insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)
      values(subject,enrollment.primary_owner_id,enrollment.kind,'pending') returning id into context_id;
    update private.account_enrollments set auth_user_id = subject, linked_context_id = context_id where id = enrollment.id;
  else
    -- A stale enrollment nonce must never fall back to an ordinary primary signup.
    if signup_token is not null then raise exception 'Enrollment expired or cancelled' using errcode = '23514'; end if;
    insert into public.profiles(id,display_name,email)
      values(subject,coalesce(person.raw_user_meta_data->>'name',person.raw_user_meta_data->>'full_name',''),lower(trim(person.email)));
    insert into public.account_contexts(auth_user_id,kind,status) values(subject,'primary','active');
  end if;
end;
$$;
revoke all on function private.initialize_auth_profile(uuid,text) from public,anon,authenticated,pinevela_backend;

create or replace function private.create_primary_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.initialize_auth_profile(new.id,new.raw_user_meta_data->>'pinevela_enrollment_token');
  return new;
end;
$$;

-- Account selection is always subject-bound. A primary profile must not be left
-- behind when a separate child identity is enrolled.
create function private.check_primary_context_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'primary' and exists (select 1 from public.profiles p where p.id = new.auth_user_id and p.primary_owner_id is not null) then
    raise exception 'A sub-account identity cannot own a primary context' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_primary_context_identity() from public,anon,authenticated,pinevela_backend;
create trigger pinevela_primary_context_identity before insert or update of kind,auth_user_id on public.account_contexts
  for each row execute function private.check_primary_context_identity();

-- Same-email resident/seller portals share Supabase credentials, with distinct
-- server-verified access PINs. Only salted scrypt hashes are saved, never Auth
-- passwords. A PIN version invalidates earlier context bindings when enabled.
create table private.portal_access_keys (
  context_id uuid primary key references public.account_contexts(id) on delete cascade,
  pin_hash text not null check (pin_hash ~ '^scrypt-sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$'),
  version bigint not null default 1 check (version > 0),
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table private.portal_access_keys enable row level security;
revoke all on private.portal_access_keys from public,anon,authenticated,pinevela_backend;
create function private.check_portal_access_key() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.account_contexts c where c.id = new.context_id and c.kind in ('resident','seller')) then
    raise exception 'Portal PINs belong only to student account portals' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.pin_hash is distinct from old.pin_hash then
    new.version := old.version + 1;
    new.failed_attempts := 0;
    new.locked_until := null;
  end if;
  return new;
end;
$$;
revoke all on function private.check_portal_access_key() from public,anon,authenticated,pinevela_backend;
create trigger pinevela_portal_access_key before insert or update on private.portal_access_keys
  for each row execute function private.check_portal_access_key();
alter table private.account_sessions add column portal_pin_version bigint;
create function private.portal_session_allowed(context uuid, pin_version bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from private.portal_access_keys k where k.context_id = context)
    or exists(select 1 from private.portal_access_keys k where k.context_id = context and k.version = pin_version);
$$;
revoke all on function private.portal_session_allowed(uuid,bigint) from public,anon,authenticated,pinevela_backend;

create or replace function private.current_context_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.active_context_id from private.account_sessions s
  join public.account_contexts c on c.id = s.active_context_id
  join auth.sessions live on live.id = s.session_id and live.user_id = s.auth_user_id
  where s.auth_user_id = (select auth.uid()) and c.auth_user_id = s.auth_user_id and c.status = 'active'
    and (live.not_after is null or live.not_after > now())
    and private.portal_session_allowed(c.id,s.portal_pin_version)
    and (c.kind <> 'admin' or exists (select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'))
    and (c.kind <> 'staff' or exists (select 1 from public.staff_assignments a where a.staff_context_id = c.id and a.status = 'active' and a.ended_at is null))
    and (c.kind <> 'resident' or exists (select 1 from public.allocations a where a.resident_context_id = c.id and a.ended_at is null))
    and s.session_id = case when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      then (select auth.jwt()->>'session_id')::uuid else null end
  limit 1;
$$;
