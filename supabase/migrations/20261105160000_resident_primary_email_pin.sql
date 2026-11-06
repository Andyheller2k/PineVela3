-- Resident PIN login uses a separate, server-provisioned native Auth identity.
-- Existing residents/sellers keep their native identities and credentials.
create table private.resident_pin_credentials (
  enrollment_id uuid primary key references private.account_enrollments(id) on delete cascade,
  primary_owner_id uuid not null references public.profiles(id),
  pin_hash text not null check (pin_hash ~ '^scrypt-sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$'),
  wrapped_password jsonb not null check (jsonb_typeof(wrapped_password)='object' and octet_length(wrapped_password::text)<=2000),
  recovery_password jsonb not null check(jsonb_typeof(recovery_password)='object' and octet_length(recovery_password::text)<=2000),
  failed_attempts smallint not null default 0 check(failed_attempts between 0 and 5),
  locked_until timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index resident_pin_credentials_owner_idx on private.resident_pin_credentials(primary_owner_id,enrollment_id);
alter table private.resident_pin_credentials enable row level security;
revoke all on private.resident_pin_credentials from public,anon,authenticated,pinevela_backend,pinevela_catalog;
create function private.guard_resident_pin_credentials() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.enrollment_id,new.primary_owner_id,new.created_at)
    is distinct from (old.enrollment_id,old.primary_owner_id,old.created_at) then
    raise exception using errcode='23514',message='Resident credential ownership is immutable';
  end if;
  if not exists(select 1 from private.account_enrollments e
    where e.id=new.enrollment_id and e.primary_owner_id=new.primary_owner_id and e.kind='resident'
      and e.enrollment_fields->>'authentication'='resident_pin'
      and e.invited_email ~ '^resident-[a-f0-9]{32}@accounts\.pinevela\.app$') then
    raise exception using errcode='23514',message='Resident credentials require an owned resident reservation';
  end if;
  return new;
end $$;
revoke all on function private.guard_resident_pin_credentials() from public,anon,authenticated,pinevela_backend,pinevela_catalog;
create trigger guard_resident_pin_credentials before insert or update on private.resident_pin_credentials
  for each row execute function private.guard_resident_pin_credentials();
