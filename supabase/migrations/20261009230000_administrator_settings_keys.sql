-- Separate administrator settings credentials. No accounts or keys are seeded.
alter table private.admin_secrets
  add column settings_key_version uuid not null default gen_random_uuid(),
  add column settings_failed_attempts smallint not null default 0 check (settings_failed_attempts between 0 and 5),
  add column settings_attempt_window timestamptz,
  add column settings_locked_until timestamptz,
  add constraint settings_key_format check (settings_key_hash is null or
    settings_key_hash ~ '^scrypt-sha256\$[a-f0-9]{32}\$[a-f0-9]{64}$'),
  add constraint settings_key_enrollment_pair check ((settings_key_hash is null) = (settings_enrolled_at is null));

create function private.guard_administrator_settings_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.context_id is distinct from old.context_id then
    raise exception using errcode = '42501', message = 'Administrator key ownership is immutable';
  end if;
  if not exists (select 1 from public.admin_memberships m join public.account_contexts c on c.id = m.context_id
    where m.context_id = new.context_id and m.status = 'active' and c.kind = 'admin' and c.status = 'active') then
    raise exception using errcode = '42501', message = 'Active administrator required';
  end if;
  if (tg_op = 'INSERT' and new.settings_key_hash is not null) or
    (tg_op = 'UPDATE' and new.settings_key_hash is distinct from old.settings_key_hash) then
    if tg_op = 'UPDATE' and old.settings_key_hash is not null then
      raise exception using errcode = '42501', message = 'Key recovery requires approved governance';
    end if;
    if new.settings_key_hash is null or private.current_kind() is distinct from 'admin'
      or private.current_context_id() is distinct from new.context_id or not exists (
        select 1 from auth.sessions s where s.id = (auth.jwt()->>'session_id')::uuid
          and s.user_id = auth.uid() and s.created_at between clock_timestamp() - interval '5 minutes' and clock_timestamp()
          and (s.not_after is null or s.not_after > clock_timestamp())
      ) then
      raise exception using errcode = '42501', message = 'Fresh verified administrator sign-in required';
    end if;
    new.settings_key_version := gen_random_uuid();
    new.settings_enrolled_at := clock_timestamp();
    new.settings_failed_attempts := 0;
    new.settings_attempt_window := null;
    new.settings_locked_until := null;
  elsif tg_op = 'UPDATE' then
    if new.settings_key_version is distinct from old.settings_key_version
      or new.settings_enrolled_at is distinct from old.settings_enrolled_at then
      raise exception using errcode = '42501', message = 'Key enrollment metadata is immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_administrator_settings_key() from public, anon, authenticated, pinevela_backend;
create trigger guard_administrator_settings_key before insert or update on private.admin_secrets
  for each row execute function private.guard_administrator_settings_key();
revoke all on private.admin_secrets, private.platform_settings from public, anon, authenticated, pinevela_backend;
