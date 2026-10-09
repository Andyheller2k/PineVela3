-- Active PineVela identity and housing model. No accounts or operational rows are seeded.
create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_normalized_idx on public.profiles (lower(email));

create table public.account_contexts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references public.profiles(id) on delete cascade,
  primary_owner_id uuid references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('primary','resident','manager','seller','staff','officer','admin')),
  status text not null default 'pending' check (status in ('pending','active','suspended','rejected','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id, kind),
  unique (id, auth_user_id),
  check (kind <> 'primary' or (primary_owner_id is null and status = 'active'))
);
create index account_contexts_primary_owner_idx on public.account_contexts(primary_owner_id);

-- Updated only by the server after a verified Supabase sign-in and context switch.
create table private.account_sessions (
  session_id uuid primary key,
  auth_user_id uuid not null references public.profiles(id) on delete cascade,
  active_context_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (active_context_id, auth_user_id)
    references public.account_contexts(id, auth_user_id) on delete cascade
);
alter table private.account_sessions enable row level security;
revoke all on private.account_sessions from anon, authenticated;

create function private.current_context_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.active_context_id
  from private.account_sessions s
  join public.account_contexts c on c.id = s.active_context_id
  where s.auth_user_id = (select auth.uid())
    and c.auth_user_id = s.auth_user_id and c.status = 'active'
    and s.session_id = case
      when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      then (select auth.jwt()->>'session_id')::uuid else null end
  limit 1;
$$;
create function private.current_kind() returns text
language sql stable security definer set search_path = '' as $$
  select c.kind from public.account_contexts c
  where c.id = private.current_context_id();
$$;
grant usage on schema private to authenticated;
grant execute on function private.current_context_id() to authenticated;
grant execute on function private.current_kind() to authenticated;

create function private.create_primary_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), coalesce(new.email, ''));
  insert into public.account_contexts(auth_user_id, kind, status)
  values (new.id, 'primary', 'active');
  return new;
end;
$$;
create trigger pinevela_auth_user_created after insert on auth.users
for each row execute function private.create_primary_profile();

alter table public.profiles enable row level security;
create policy profiles_owner_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
alter table public.account_contexts enable row level security;
create policy contexts_subject_read on public.account_contexts for select to authenticated
  using (auth_user_id = (select auth.uid()));

create table public.residences (
  id uuid primary key default gen_random_uuid(),
  primary_owner_id uuid not null references public.profiles(id),
  name text not null check (length(trim(name)) between 1 and 200),
  location text not null default '',
  description text not null default '',
  contact_phone text,
  contact_country text,
  contact_email text,
  cover_path text,
  gallery_paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','inspection','approved','rejected','suspended','closed')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index residences_owner_idx on public.residences(primary_owner_id);

create table public.manager_assignments (
  id uuid primary key default gen_random_uuid(),
  manager_context_id uuid not null references public.account_contexts(id) on delete cascade,
  residence_id uuid not null references public.residences(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  unique(manager_context_id, residence_id, assigned_at)
);
create unique index manager_assignments_active_idx on public.manager_assignments(manager_context_id, residence_id)
  where ended_at is null;

create function private.can_manage_residence(residence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_kind() = 'admin' or exists (
    select 1 from public.manager_assignments a
    where a.residence_id = residence and a.manager_context_id = private.current_context_id()
      and a.ended_at is null and private.current_kind() = 'manager'
  );
$$;
create function private.can_view_residence(residence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.residences r where r.id = residence and r.status = 'approved')
    or private.can_manage_residence(residence)
    or exists (select 1 from public.residences r where r.id = residence and r.primary_owner_id = (select auth.uid()));
$$;
grant execute on function private.can_manage_residence(uuid) to authenticated;
grant execute on function private.can_view_residence(uuid) to authenticated, anon;

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  residence_id uuid not null references public.residences(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  room_prefix text not null default '',
  beds_per_room integer not null default 1 check (beds_per_room > 0),
  created_at timestamptz not null default now()
);
create unique index blocks_residence_name_idx on public.blocks(residence_id, lower(name));
create table public.floors (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete cascade,
  floor_number integer not null check (floor_number >= 0),
  unique(block_id, floor_number)
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors(id) on delete cascade,
  room_number text not null check (length(trim(room_number)) between 1 and 40),
  unique(floor_id, room_number)
);
create table public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  bed_number integer not null check (bed_number > 0),
  unique(room_id, bed_number),
  unique(id, room_id)
);
create table private.room_activation_keys (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references public.account_contexts(id)
);
alter table private.room_activation_keys enable row level security;
create unique index room_activation_keys_current_idx on private.room_activation_keys(room_id)
  where revoked_at is null;
revoke all on private.room_activation_keys from anon, authenticated;

create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  resident_context_id uuid not null references public.account_contexts(id) on delete cascade,
  room_id uuid not null references public.rooms(id),
  bed_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (bed_id, room_id) references public.beds(id, room_id),
  check (ended_at is null or ended_at >= started_at)
);
create unique index allocations_current_resident_idx on public.allocations(resident_context_id) where ended_at is null;
create unique index allocations_current_room_idx on public.allocations(room_id) where ended_at is null;
create unique index allocations_current_bed_idx on public.allocations(bed_id) where ended_at is null;

create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_context_id uuid not null references public.account_contexts(id) on delete cascade,
  residence_id uuid not null references public.residences(id) on delete cascade,
  created_by_manager_id uuid not null references public.account_contexts(id),
  assigned_block_id uuid references public.blocks(id),
  status text not null default 'active' check (status in ('active','suspended','resigned','removed')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index staff_assignments_current_idx on public.staff_assignments(staff_context_id) where ended_at is null;

create function private.has_residence_access(residence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_residence(residence) or exists (
    select 1 from public.staff_assignments a
    where a.residence_id = residence and a.staff_context_id = private.current_context_id()
      and a.status = 'active' and a.ended_at is null and private.current_kind() = 'staff'
  ) or exists (
    select 1 from public.allocations a
    join public.rooms r on r.id = a.room_id
    join public.floors f on f.id = r.floor_id
    join public.blocks b on b.id = f.block_id
    where b.residence_id = residence and a.resident_context_id = private.current_context_id()
      and a.ended_at is null and private.current_kind() = 'resident'
  );
$$;
grant execute on function private.has_residence_access(uuid) to authenticated;

alter table public.residences enable row level security;
create policy residences_visible on public.residences for select to anon, authenticated
  using (status = 'approved' or private.can_view_residence(id));
alter table public.manager_assignments enable row level security;
create policy manager_assignments_member_read on public.manager_assignments for select to authenticated
  using (manager_context_id = private.current_context_id() or private.current_kind() = 'admin');
alter table public.blocks enable row level security;
create policy blocks_visible on public.blocks for select to anon, authenticated
  using (private.can_view_residence(residence_id));
alter table public.floors enable row level security;
create policy floors_visible on public.floors for select to anon, authenticated
  using (exists (select 1 from public.blocks b where b.id = block_id and private.can_view_residence(b.residence_id)));
alter table public.rooms enable row level security;
create policy rooms_visible on public.rooms for select to anon, authenticated
  using (exists (select 1 from public.floors f join public.blocks b on b.id = f.block_id where f.id = floor_id and private.can_view_residence(b.residence_id)));
alter table public.beds enable row level security;
create policy beds_member_read on public.beds for select to authenticated
  using (exists (select 1 from public.rooms r join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id where r.id = room_id and private.has_residence_access(b.residence_id)));
alter table public.allocations enable row level security;
create policy allocations_related_read on public.allocations for select to authenticated
  using (resident_context_id = private.current_context_id() or exists (
    select 1 from public.rooms r join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
    where r.id = room_id and private.can_manage_residence(b.residence_id)));
alter table public.staff_assignments enable row level security;
create policy staff_assignments_related_read on public.staff_assignments for select to authenticated
  using (staff_context_id = private.current_context_id() or private.can_manage_residence(residence_id));

-- No direct client writes to roles, residences, rooms, keys, allocations or assignments.
-- The Express backend performs authorized mutations in PostgreSQL transactions.
