-- Manager business changes retain the existing separate secret-key boundary.
alter table private.manager_operation_keys
  add column version bigint not null default 1 check (version > 0),
  add constraint manager_key_hash_format check (key_hash is null or key_hash ~ '^scrypt-sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$'),
  add constraint manager_key_attempt_limit check (failed_attempts <= 5);
create function private.check_manager_operation_key() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.require_context_kind(new.manager_context_id,'manager') then
    raise exception 'Manager context required' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.manager_context_id is distinct from old.manager_context_id then
    raise exception 'Manager key ownership is immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.key_hash is distinct from old.key_hash then
    new.version := old.version + 1;
    new.failed_attempts := 0;
    new.locked_until := null;
  end if;
  return new;
end;
$$;
revoke all on function private.check_manager_operation_key() from public,anon,authenticated,pinevela_backend;
create trigger manager_operation_key_check before insert or update on private.manager_operation_keys
  for each row execute function private.check_manager_operation_key();

-- A lost manager key follows an administrator-reviewed recovery petition.
create table private.manager_key_petitions (
  id uuid primary key default gen_random_uuid(),
  manager_context_id uuid not null references public.account_contexts(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_context_id uuid references public.admin_memberships(context_id),
  check ((status = 'pending' and decided_at is null and decided_by_context_id is null) or
    (status <> 'pending' and decided_at is not null and decided_by_context_id is not null))
);
create unique index manager_key_petitions_pending_idx on private.manager_key_petitions(manager_context_id) where status = 'pending';
alter table private.manager_key_petitions enable row level security;
revoke all on private.manager_key_petitions from public,anon,authenticated,pinevela_backend;
